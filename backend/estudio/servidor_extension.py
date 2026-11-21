# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

"""
Servidor local concurrente para comunicar LiraLoud con la extensión de navegador (Chrome / Edge).
Permite recibir URLs de PDFs y páginas web directamente desde el navegador,
descargarlas y cargarlas automáticamente en LiraLoud en pantalla sin bloquear.
"""

import os
import sys
import json
import time
import re
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import threading
import requests
from backend.core.webview_bridge import eel
from backend.core.logger_config import logger

if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

TEMP_DIR = os.path.join(BASE_DIR, "temp_converted")
os.makedirs(TEMP_DIR, exist_ok=True)

PUERTO_EXTENSION = 54321
_servidor_http = None

def enfocar_ventana_liraloud():
    """Trae la ventana de LiraLoud al primer plano si está minimizada o detrás de otras ventanas."""
    try:
        import ctypes
        try:
            ctypes.windll.user32.AllowSetForegroundWindow(-1)
        except Exception:
            pass

        import win32gui
        import win32con

        def enum_handler(hwnd, extra):
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                if "lira loud" in title.lower() or "liraloud" in title.lower():
                    try:
                        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                        win32gui.SetForegroundWindow(hwnd)
                    except Exception:
                        pass
        win32gui.EnumWindows(enum_handler, None)
    except Exception as e:
        logger.debug(f"[EXTENSIÓN] No se pudo enfocar ventana: {e}")

def procesar_url_extension(url, titulo_sugerido=""):
    """
    Descarga o procesa la URL recibida desde la extensión del navegador.
    Retorna un diccionario con {"ok": True, "ruta": ...} o {"ok": False, "error": ...}.
    """
    url = url.strip()
    parsed = urllib.parse.urlparse(url)

    # 1. Caso archivo local abierto en el navegador (file:///)
    if parsed.scheme == "file":
        local_path = urllib.request.url2pathname(parsed.path)
        if re.match(r"^/[a-zA-Z]:", local_path):
            local_path = local_path[1:]
        if os.path.exists(local_path):
            logger.info(f"📂 [EXTENSIÓN] Archivo local detectado: {local_path}")
            return {"ok": True, "ruta": os.path.abspath(local_path), "tipo": "local"}
        else:
            return {"ok": False, "error": f"Archivo local no encontrado en el equipo: {local_path}"}

    if parsed.scheme not in ("http", "https"):
        url = "https://" + url
        parsed = urllib.parse.urlparse(url)

    ts = int(time.time())
    nombre_limpio = "documento"
    if titulo_sugerido:
        nombre_limpio = re.sub(r"[^\w\-_\. ]", "_", titulo_sugerido)[:40].strip()
    elif parsed.path:
        base = os.path.basename(parsed.path)
        if base:
            nombre_limpio = re.sub(r"[^\w\-_\. ]", "_", base)[:40].strip()

    if not nombre_limpio:
        nombre_limpio = "documento"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }

    # 2. Verificar si es un PDF directo
    es_pdf = False
    path_lower = parsed.path.lower()
    query_lower = parsed.query.lower()
    if path_lower.endswith(".pdf") or ".pdf?" in url.lower() or "pdf" in query_lower:
        es_pdf = True
    else:
        try:
            head = requests.head(url, headers=headers, timeout=5, allow_redirects=True)
            ctype = head.headers.get("content-type", "").lower()
            if "application/pdf" in ctype:
                es_pdf = True
        except Exception:
            pass

    if es_pdf:
        ruta_pdf = os.path.join(TEMP_DIR, f"{nombre_limpio}_{ts}.pdf")
        logger.info(f"📥 [EXTENSIÓN] Descargando PDF directo desde: {url[:80]}...")
        try:
            with requests.get(url, headers=headers, stream=True, timeout=60) as resp:
                resp.raise_for_status()
                with open(ruta_pdf, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=65536):
                        if chunk:
                            f.write(chunk)

            if os.path.exists(ruta_pdf) and os.path.getsize(ruta_pdf) > 0:
                logger.info(f"✅ [EXTENSIÓN] PDF guardado en: {ruta_pdf}")
                return {"ok": True, "ruta": os.path.abspath(ruta_pdf), "tipo": "pdf"}
            else:
                return {"ok": False, "error": "El archivo descargado está vacío o dañado."}
        except Exception as e:
            logger.error(f"❌ [EXTENSIÓN] Error descargando PDF directo: {e}")
            return {"ok": False, "error": f"Fallo al descargar PDF: {str(e)[:120]}"}

    # 3. Caso página web HTML (convertir a PDF usando web_reader de LiraLoud)
    logger.info(f"🌐 [EXTENSIÓN] URL web no es PDF directo. Convirtiendo a PDF con web_reader...")
    try:
        from backend.estudio.web_reader import _procesar_url
        ruta_pdf = os.path.join(TEMP_DIR, f"web_{nombre_limpio}_{ts}.pdf")
        res = _procesar_url(url, parsed, ruta_pdf)
        return res
    except Exception as e:
        logger.error(f"❌ [EXTENSIÓN] Error convirtiendo página web: {e}")
        return {"ok": False, "error": f"Error al procesar página: {str(e)[:120]}"}


class ExtensionHTTPHandler(BaseHTTPRequestHandler):
    """Manejador HTTP multihilo para la comunicación con la extensión del navegador."""

    def _aplicar_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")

    def do_OPTIONS(self):
        try:
            self.send_response(204)
            self._aplicar_cors()
            self.end_headers()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ("/ping", "/", "/estado"):
            resp = json.dumps({"ok": True, "app": "LiraLoud", "version": "2.0"})
            self._responder_json(200, json.loads(resp))
        else:
            try:
                self.send_response(404)
                self.end_headers()
            except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
                pass

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/abrir":
            try:
                content_len = int(self.headers.get("Content-Length", 0))
                cuerpo = self.rfile.read(content_len).decode("utf-8")
                datos = json.loads(cuerpo) if cuerpo else {}
                url = datos.get("url", "").strip()
                titulo = datos.get("titulo", "")

                if not url:
                    self._responder_json(400, {"ok": False, "error": "No se recibió ninguna URL."})
                    return

                logger.info(f"🚀 [EXTENSIÓN] Petición de apertura recibida: {url[:80]}")
                resultado = procesar_url_extension(url, titulo)

                if resultado.get("ok"):
                    ruta_pdf = resultado.get("ruta")

                    # Responder de inmediato a la extensión para confirmar éxito
                    self._responder_json(200, {
                        "ok": True,
                        "mensaje": "Documento cargado en LiraLoud",
                        "ruta": ruta_pdf
                    })

                    # Despachar apertura a Eel y enfocar ventana de manera no bloqueante
                    def _despachar():
                        time.sleep(0.05)
                        try:
                            if hasattr(eel, "abrir_desde_extension"):
                                # NOTA: Sin () final para evitar esperar retorno síncrono
                                eel.abrir_desde_extension(ruta_pdf)
                                logger.info(f"✨ [EXTENSIÓN] Orden enviada a Eel para abrir: {ruta_pdf}")
                            else:
                                logger.warning("⚠️ [EXTENSIÓN] Eel aún no tiene la función abrir_desde_extension.")
                        except Exception as ex_eel:
                            logger.error(f"⚠️ [EXTENSIÓN] Error notificando a Eel: {ex_eel}")

                        enfocar_ventana_liraloud()

                    threading.Thread(target=_despachar, name="DespachoEelExtension", daemon=True).start()

                else:
                    self._responder_json(200, {
                        "ok": False,
                        "error": resultado.get("error", "No se pudo procesar el documento.")
                    })
            except Exception as e:
                logger.error(f"❌ [EXTENSIÓN] Excepción en manejador POST: {e}", exc_info=True)
                self._responder_json(500, {"ok": False, "error": str(e)})
        else:
            try:
                self.send_response(404)
                self.end_headers()
            except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
                pass

    def _responder_json(self, codigo, datos):
        try:
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._aplicar_cors()
            self.end_headers()
            self.wfile.write(json.dumps(datos, ensure_ascii=False).encode("utf-8"))
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass

    def log_message(self, format, *args):
        # Evitar ruido en la consola
        pass


def iniciar_servidor_extension(puerto=PUERTO_EXTENSION):
    """Inicia el servidor HTTP local multihilo en un hilo daemon en segundo plano."""
    global _servidor_http

    def _worker():
        global _servidor_http
        try:
            _servidor_http = ThreadingHTTPServer(("127.0.0.1", puerto), ExtensionHTTPHandler)
            logger.info(f"🔌 [EXTENSIÓN] Servidor receptor concurrente iniciado en http://127.0.0.1:{puerto}")
            _servidor_http.serve_forever()
        except OSError as e:
            if "address already in use" in str(e).lower() or getattr(e, "winerror", 0) == 10048:
                logger.warning(f"⚠️ [EXTENSIÓN] El puerto {puerto} ya está en uso (¿otra instancia de LiraLoud?).")
            else:
                logger.error(f"❌ [EXTENSIÓN] Error al iniciar servidor: {e}")
        except Exception as e:
            logger.error(f"❌ [EXTENSIÓN] Error inesperado en servidor: {e}")

    hilo = threading.Thread(target=_worker, name="ServidorExtensionThread", daemon=True)
    hilo.start()
    return hilo
