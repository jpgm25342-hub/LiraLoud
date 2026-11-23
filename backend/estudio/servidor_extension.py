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
import base64
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import threading
import requests
from backend.core.estado_global import estado_app
from backend.core.webview_bridge import eel, puente_webview
from backend.core.logger_config import logger

BASE_DIR = estado_app.base_dir
TEMP_DIR = os.path.join(BASE_DIR, "temp_converted")
os.makedirs(TEMP_DIR, exist_ok=True)

PUERTO_EXTENSION = 54321
_servidor_http = None


def _enfocar_hwnd_win32(hwnd: int):
    """Restaura (solo si está minimizada) y trae al frente una ventana Win32 incluso desde segundo plano."""
    if not hwnd:
        return False
    try:
        import ctypes
        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32

        SW_RESTORE = 9
        SW_SHOW = 5
        HWND_TOPMOST = -1
        HWND_NOTOPMOST = -2
        SWP_NOSIZE = 0x0001
        SWP_NOMOVE = 0x0002
        SWP_SHOWWINDOW = 0x0040

        if user32.IsIconic(hwnd):
            user32.ShowWindow(hwnd, SW_RESTORE)
        else:
            user32.ShowWindow(hwnd, SW_SHOW)

        fg_hwnd = user32.GetForegroundWindow()
        fg_thread = user32.GetWindowThreadProcessId(fg_hwnd, None) if fg_hwnd else 0
        cur_thread = kernel32.GetCurrentThreadId()
        target_thread = user32.GetWindowThreadProcessId(hwnd, None)

        attached_fg = False
        attached_target = False
        try:
            if fg_thread and fg_thread != cur_thread:
                attached_fg = bool(user32.AttachThreadInput(fg_thread, cur_thread, True))
            if target_thread and target_thread != cur_thread:
                attached_target = bool(user32.AttachThreadInput(target_thread, cur_thread, True))

            user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)
            user32.SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)
            user32.BringWindowToTop(hwnd)
            user32.SetForegroundWindow(hwnd)
        finally:
            if attached_target:
                user32.AttachThreadInput(target_thread, cur_thread, False)
            if attached_fg:
                user32.AttachThreadInput(fg_thread, cur_thread, False)
        return True
    except Exception as e:
        logger.debug(f"[EXTENSIÓN] Aviso en _enfocar_hwnd_win32: {e}")
        return False


def enfocar_ventana_liraloud():
    """Trae la ventana pywebview de LiraLoud al primer plano si está minimizada o detrás del navegador."""
    try:
        hwnd = None
        ventana = getattr(puente_webview, "ventana", None)
        if ventana is not None:
            try:
                if hasattr(ventana, "native") and ventana.native:
                    hwnd = int(ventana.native.Handle.ToInt64())
            except Exception:
                hwnd = None

        if not hwnd and sys.platform == "win32":
            import ctypes
            hwnd = ctypes.windll.user32.FindWindowW(None, "LiraLoud")

        if hwnd and _enfocar_hwnd_win32(hwnd):
            return

        import win32gui

        def enum_handler(h, extra):
            if win32gui.IsWindowVisible(h):
                title = win32gui.GetWindowText(h)
                if "lira loud" in title.lower() or "liraloud" in title.lower():
                    _enfocar_hwnd_win32(h)

        win32gui.EnumWindows(enum_handler, None)
    except Exception as e:
        logger.debug(f"[EXTENSIÓN] No se pudo enfocar ventana: {e}")

def _limpiar_nombre_archivo(titulo_sugerido="", url_path=""):
    nombre_limpio = "documento"
    if titulo_sugerido:
        nombre_limpio = re.sub(r"[^\w\-_\. ]", "_", titulo_sugerido)[:40].strip()
    elif url_path:
        base = os.path.basename(url_path)
        if base:
            nombre_limpio = re.sub(r"[^\w\-_\. ]", "_", base)[:40].strip()
    if nombre_limpio.lower().endswith(".pdf"):
        nombre_limpio = nombre_limpio[:-4].strip()
    return nombre_limpio or "documento"


def procesar_url_extension(url="", titulo_sugerido="", html_fallback="", texto_directo="", pdf_base64=""):
    """
    Descarga o procesa la URL / contenido recibido desde la extensión del navegador.
    Retorna un diccionario con {"ok": True, "ruta": ..., "tipo": ...} o {"ok": False, "error": ...}.
    """
    ts = int(time.time())
    url = (url or "").strip()

    # Desempaquetar visores PDF internos de Chrome/Edge que envuelven una URL real (?file=... o file:///)
    if "file:///" in url and not url.lower().startswith("file:///"):
        idx = url.lower().find("file:///")
        url = urllib.parse.unquote(url[idx:])

    parsed = urllib.parse.urlparse(url) if url else urllib.parse.urlparse("")
    nombre_limpio = _limpiar_nombre_archivo(titulo_sugerido, parsed.path)

    # 0. Caso PDF enviado directamente en Base64 por la extensión (ej. blob: o sesión autenticada)
    if pdf_base64:
        try:
            b64_clean = pdf_base64.split(",", 1)[-1].strip()
            raw_bytes = base64.b64decode(b64_clean)
            if raw_bytes.startswith(b"%PDF"):
                ruta_pdf = os.path.join(TEMP_DIR, f"{nombre_limpio}_{ts}.pdf")
                with open(ruta_pdf, "wb") as f:
                    f.write(raw_bytes)
                logger.info(f"✅ [EXTENSIÓN] PDF recibido desde sesión del navegador guardado en: {ruta_pdf}")
                return {"ok": True, "ruta": os.path.abspath(ruta_pdf), "tipo": "pdf"}
        except Exception as e_b64:
            logger.warning(f"⚠️ [EXTENSIÓN] Falló decodificación de pdf_base64, continuando por URL: {e_b64}")

    # 0.5 Caso texto seleccionado enviado directamente desde la extensión
    if texto_directo and texto_directo.strip():
        try:
            from backend.estudio.web_reader import importar_texto_como_pdf
            res_txt = importar_texto_como_pdf(texto_directo.strip(), titulo_sugerido or "Selección Web")
            if res_txt and res_txt.get("ok"):
                res_txt["tipo"] = "web"
                return res_txt
            return {"ok": False, "error": res_txt.get("error", "No se pudo convertir el texto seleccionado.")}
        except Exception as e_txt:
            logger.error(f"❌ [EXTENSIÓN] Error convirtiendo texto seleccionado: {e_txt}")
            return {"ok": False, "error": f"Error al procesar texto seleccionado: {str(e_txt)[:120]}"}

    if not url:
        return {"ok": False, "error": "No se recibió ninguna URL ni texto válido."}

    # 1. Caso archivo local abierto en el navegador (file:///)
    if parsed.scheme == "file":
        local_path = urllib.request.url2pathname(urllib.parse.unquote(parsed.path))
        if re.match(r"^[\\/][a-zA-Z]:", local_path):
            local_path = local_path[1:]
        if os.path.exists(local_path):
            logger.info(f"📂 [EXTENSIÓN] Archivo local detectado: {local_path}")
            return {"ok": True, "ruta": os.path.abspath(local_path), "tipo": "local"}
        else:
            return {"ok": False, "error": f"Archivo local no encontrado en el equipo: {local_path}"}

    if parsed.scheme == "blob":
        if html_fallback:
            from backend.estudio.web_reader import _fallback_html_a_pdf
            ruta_pdf = os.path.join(TEMP_DIR, f"web_{nombre_limpio}_{ts}.pdf")
            return _fallback_html_a_pdf(url, parsed, ruta_pdf, html_provisto=html_fallback, titulo_sugerido=titulo_sugerido)
        return {
            "ok": False,
            "error": "Este PDF usa una URL temporal (blob:) protegida por el sitio. Descárgalo primero o ábrelo como archivo local."
        }

    if parsed.scheme not in ("http", "https"):
        url = "https://" + url
        parsed = urllib.parse.urlparse(url)

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/127.0.0.0 Safari/537.36"
        )
    }

    # 2. Verificar si es un PDF directo (por extensión, cabecera Content-Type o firma mágica %PDF-)
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
            with requests.get(url, headers=headers, stream=True, timeout=60, allow_redirects=True) as resp:
                resp.raise_for_status()
                ctype = resp.headers.get("content-type", "").lower()
                iterador = resp.iter_content(chunk_size=65536)
                primer_chunk = next(iterador, b"")
                # Si la URL tenía "pdf" en query pero el servidor devolvió una página HTML en vez de un binario %PDF
                if primer_chunk and not primer_chunk.lstrip().startswith(b"%PDF") and "text/html" in ctype:
                    logger.info("🌐 [EXTENSIÓN] La respuesta es HTML y no un binario %PDF; redirigiendo a conversor web.")
                    es_pdf = False
                else:
                    with open(ruta_pdf, "wb") as f:
                        if primer_chunk:
                            f.write(primer_chunk)
                        for chunk in iterador:
                            if chunk:
                                f.write(chunk)

            if es_pdf:
                if os.path.exists(ruta_pdf) and os.path.getsize(ruta_pdf) > 0:
                    logger.info(f"✅ [EXTENSIÓN] PDF guardado en: {ruta_pdf}")
                    return {"ok": True, "ruta": os.path.abspath(ruta_pdf), "tipo": "pdf"}
                else:
                    return {"ok": False, "error": "El archivo descargado está vacío o dañado."}
        except Exception as e:
            if path_lower.endswith(".pdf"):
                logger.error(f"❌ [EXTENSIÓN] Error descargando PDF directo: {e}")
                return {"ok": False, "error": f"Fallo al descargar PDF: {str(e)[:120]}"}
            logger.warning(f"⚠️ [EXTENSIÓN] Falló descarga como PDF directo ({e}), intentando como página web...")

    # 3. Caso página web HTML (convertir a PDF usando web_reader de LiraLoud + fallback DOM del navegador)
    logger.info("🌐 [EXTENSIÓN] Convirtiendo página web a PDF con web_reader...")
    try:
        from backend.estudio.web_reader import _procesar_url
        ruta_pdf = os.path.join(TEMP_DIR, f"web_{nombre_limpio}_{ts}.pdf")
        res = _procesar_url(url, parsed, ruta_pdf, html_fallback=html_fallback, titulo_sugerido=titulo_sugerido)
        if isinstance(res, dict):
            res.setdefault("tipo", "web")
            return res
        return {"ok": False, "error": "No se pudo convertir la página web."}
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
                url = (datos.get("url") or "").strip()
                titulo = datos.get("titulo") or ""
                html_fallback = datos.get("html") or ""
                texto_directo = datos.get("texto") or ""
                pdf_base64 = datos.get("pdf_base64") or ""

                if not url and not texto_directo and not pdf_base64:
                    self._responder_json(400, {"ok": False, "error": "No se recibió ninguna URL ni contenido."})
                    return

                logger.info(f"🚀 [EXTENSIÓN] Petición de apertura recibida: {(url or titulo or 'contenido directo')[:80]}")
                resultado = procesar_url_extension(
                    url=url,
                    titulo_sugerido=titulo,
                    html_fallback=html_fallback,
                    texto_directo=texto_directo,
                    pdf_base64=pdf_base64,
                )

                if isinstance(resultado, dict) and resultado.get("ok"):
                    ruta_pdf = resultado.get("ruta")
                    tipo_doc = resultado.get("tipo", "pdf")

                    # Responder de inmediato a la extensión para confirmar éxito
                    self._responder_json(200, {
                        "ok": True,
                        "mensaje": "Documento cargado en LiraLoud",
                        "ruta": ruta_pdf,
                        "tipo": tipo_doc,
                    })

                    # Despachar apertura al puente pywebview y enfocar ventana de manera no bloqueante
                    def _despachar():
                        time.sleep(0.05)
                        try:
                            eel.abrir_desde_extension(ruta_pdf, tipo_doc)
                            logger.info(f"✨ [EXTENSIÓN] Orden enviada a pywebview para abrir: {ruta_pdf} (tipo={tipo_doc})")
                        except Exception as ex_eel:
                            logger.error(f"⚠️ [EXTENSIÓN] Error notificando a pywebview: {ex_eel}")

                        enfocar_ventana_liraloud()

                    threading.Thread(target=_despachar, name="DespachoWebviewExtension", daemon=True).start()

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
