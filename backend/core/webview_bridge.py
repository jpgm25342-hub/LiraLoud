# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

"""
Puente Nativo de Comunicación Bidireccional con pywebview (Reemplazo de Eel).
Permite registrar todas las funciones de Python con `@eel.expose` (o `@puente_webview.expose`),
las agrupa automáticamente en el objeto `js_api` de pywebview, y permite invocar funciones
de JavaScript desde Python (`eel.nombre_funcion_js(arg1, arg2)`).
"""

import json
import logging
import socketserver
import wsgiref.simple_server

# Aumentar la cola TCP (backlog) del servidor HTTP interno de pywebview/Bottle (por defecto es 5 en Windows).
# Con 50+ scripts/CSS y XHR síncronos de componentes al inicio, un backlog de 5 provoca net::ERR_CONNECTION_REFUSED.
socketserver.TCPServer.request_queue_size = 256
wsgiref.simple_server.WSGIServer.request_queue_size = 256

logger = logging.getLogger("LiraLoud")

class _ContenedorApiJS:
    """Objeto dinámico que se inyecta como `js_api` en `webview.create_window`."""
    pass


class PuenteWebview:
    def __init__(self):
        self._funciones_expuestas = {}
        self.api_container = _ContenedorApiJS()
        self.ventana = None
        self.carpeta_web = "web"

    def init(self, carpeta_web="web"):
        """Mantiene compatibilidad con eel.init('web')."""
        self.carpeta_web = carpeta_web

    def expose(self, func_or_name=None):
        """
        Registra una función de Python para ser invocada desde JavaScript via window.pywebview.api.
        Soporta tanto @eel.expose como eel.expose(funcion).
        """
        def _decorador(fn):
            nombre = fn.__name__
            self._funciones_expuestas[nombre] = fn
            setattr(self.api_container, nombre, fn)
            return fn

        if callable(func_or_name):
            return _decorador(func_or_name)
        return _decorador

    def vincular_ventana(self, ventana):
        """Asocia la instancia activa de la ventana de pywebview y protege evaluate_js contra callbacks obsoletos."""
        if ventana is not None and hasattr(ventana, "evaluate_js") and not getattr(ventana, "_lira_eval_protegido", False):
            eval_original = ventana.evaluate_js

            def _evaluate_js_seguro(script, *args, **kwargs):
                try:
                    return eval_original(script, *args, **kwargs)
                except Exception as exc:
                    msg = str(exc)
                    if "_returnValuesCallbacks" in msg and (
                        "is not a function" in msg
                        or "Cannot read properties" in msg
                        or "undefined" in msg
                    ):
                        logger.debug(f"[PuenteWebview] Callback obsoleto descartado tras recarga: {msg}")
                        return None
                    raise

            ventana.evaluate_js = _evaluate_js_seguro
            try:
                ventana._lira_eval_protegido = True
            except Exception:
                pass
        self.ventana = ventana

    def evaluar_js_seguro(self, nombre_fn: str, *args):
        """
        Ejecuta una función global en JavaScript de forma asíncrona/segura desde Python.
        Equivalente a cuando Python llamaba `eel.mi_funcion_js(arg1, arg2)()`.
        """
        if not self.ventana:
            return None
        try:
            args_json = ", ".join(json.dumps(a, ensure_ascii=False) for a in args)
            nombre_json = json.dumps(nombre_fn, ensure_ascii=False)
            codigo_js = (
                f"(function() {{ "
                f"var fn = (typeof window[{nombre_json}] === 'function') ? window[{nombre_json}] : "
                f"((window.eel && window.eel._exposed_functions && typeof window.eel._exposed_functions[{nombre_json}] === 'function') "
                f"? window.eel._exposed_functions[{nombre_json}] : null); "
                f"if (fn) {{ fn({args_json}); return true; }} "
                f"return false; "
                f"}})();"
            )
            self.ventana.evaluate_js(codigo_js)
        except Exception as e:
            logger.debug(f"[PuenteWebview] No se pudo evaluar JS '{nombre_fn}': {e}")
        return None

    def __getattr__(self, nombre: str):
        """
        Cuando Python invoca `eel.actualizar_log_carga("...")` o `eel.notificar_inicio_ocr_pagina(num)()`,
        devuelve un invocador compatible con o sin doble paréntesis `()()`.
        """
        if nombre.startswith("_"):
            raise AttributeError(nombre)

        def _invocador(*args, **kwargs):
            self.evaluar_js_seguro(nombre, *args)
            # Retornamos una función dummy por si el código hace doble llamada `eel.fn(x)()`
            return lambda *a, **kw: None

        return _invocador


# Instancia global única compartida por app_principal.pyw y todos los módulos de backend/
eel = PuenteWebview()
puente_webview = eel

