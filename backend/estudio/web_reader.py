# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

"""
Web Reader — Motor de importación de páginas web (estilo Ctrl+P) y texto libre como PDF.

Arquitectura:
  1. importar_url_como_pdf()  → NO bloqueante: lanza hilo y retorna.
  2. _worker()                → Llama a _procesar_url() y notifica a JS via eel.web_url_resultado().
  3. _procesar_url()          → Intenta Playwright (subprocess aislado de gevent).
                                Fallback a trafilatura si Playwright falla.
  4. playwright_worker.py     → Worker externo que ejecuta Playwright sin gevent.
"""

import os
import sys
import re
import time
import json
import subprocess
import threading
import requests
from backend.core.estado_global import estado_app
from backend.core.webview_bridge import eel
import pymupdf as fitz
from html.parser import HTMLParser
from urllib.parse import urlparse

BASE_DIR = estado_app.base_dir
TEMP_DIR = os.path.join(BASE_DIR, "temp_converted")
os.makedirs(TEMP_DIR, exist_ok=True)

LOG_PATH = os.path.join(BASE_DIR, "web_reader.log")

def _log(msg):
    """Escribe un log ASCII-safe con timestamp al archivo web_reader.log."""
    try:
        # Sanitizar: quitar caracteres no-ASCII para evitar UnicodeEncodeError en Windows
        msg_safe = msg.encode("ascii", errors="replace").decode("ascii")
        linea = f"[{time.strftime('%H:%M:%S')}] {msg_safe}\n"
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(linea)
    except Exception:
        pass  # Los logs nunca deben romper la app

# ──────────────────────────────────────────────
# EXTRACTOR DE CONTENIDO HTML (fallback sin deps)
# ──────────────────────────────────────────────

class _ExtractorHTML(HTMLParser):
    IGNORAR = {"script","style","noscript","nav","footer","aside",
               "form","button","select","option","textarea",
               "svg","canvas","iframe","object"}
    BLOQUES = {"h1","h2","h3","h4","h5","h6","p","li","blockquote",
               "pre","td","th","dt","dd","figcaption"}
    CONTENEDORES = {"article","main","section","div","span"}

    def __init__(self):
        super().__init__()
        self.parrafos = []
        self._pila_ignorar = 0
        self._tipo_bloque = None
        self._buffer = ""
        self._buf_libre = ""
        self._titulo_og = ""
        self._en_title = False
        self._titulo_tag = ""

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        attrs_dict = dict(attrs)
        if tag == "meta":
            p = attrs_dict.get("property","")
            c = attrs_dict.get("content","")
            if p == "og:title":
                self._titulo_og = c
            return
        if tag == "title":
            self._en_title = True
            return
        if tag in self.IGNORAR:
            self._pila_ignorar += 1
            return
        if self._pila_ignorar > 0:
            return
        if tag in self.BLOQUES:
            self._flush()
            self._tipo_bloque = tag
            self._buffer = ""
        elif tag == "br":
            self._flush_libre()

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "title":
            self._en_title = False
            return
        if tag in self.IGNORAR:
            self._pila_ignorar = max(0, self._pila_ignorar - 1)
            return
        if self._pila_ignorar > 0:
            return
        if tag in self.BLOQUES and self._tipo_bloque == tag:
            self._flush()
            self._tipo_bloque = None
        elif tag in self.CONTENEDORES:
            self._flush_libre()

    def handle_data(self, data):
        if self._en_title:
            self._titulo_tag += data
            return
        if self._pila_ignorar > 0:
            return
        if self._tipo_bloque:
            self._buffer += data
        else:
            self._buf_libre += data

    def _flush(self):
        texto = " ".join(self._buffer.split()).strip()
        if texto and len(texto) > 10:
            self.parrafos.append((self._tipo_bloque or "p", texto))
        self._buffer = ""

    def _flush_libre(self):
        texto = " ".join(self._buf_libre.split()).strip()
        if texto and len(texto) > 60:
            self.parrafos.append(("p", texto))
        self._buf_libre = ""

    def titulo_detectado(self):
        return (self._titulo_og or self._titulo_tag or "Página Web").strip()


def _extraer_contenido_html(html_text):
    parser = _ExtractorHTML()
    try:
        parser.feed(html_text)
    except Exception:
        pass

    parrafos = parser.parrafos
    titulo = parser.titulo_detectado()

    if not parrafos:
        html_limpio = re.sub(r'<(script|style)[^>]*>.*?</(script|style)>', '', html_text,
                             flags=re.DOTALL | re.IGNORECASE)
        solo_texto = re.sub(r'<[^>]+>', ' ', html_limpio)
        lineas = [l.strip() for l in solo_texto.splitlines() if len(l.strip()) > 60]
        vistas = set()
        for l in lineas:
            if l not in vistas:
                parrafos.append(("p", l))
                vistas.add(l)

    return titulo, parrafos


# ──────────────────────────────────────────────
# GENERADOR DE PDF CON PyMuPDF (para texto libre y fallback)
# ──────────────────────────────────────────────

_FONT_NORMAL = "helv"
_FONT_BOLD   = "hebo"
_PAGE_W, _PAGE_H = 595, 842
_MARGEN_L   = 60
_MARGEN_R   = _PAGE_W - 60
_MARGEN_TOP = 72
_MARGEN_BOT = _PAGE_H - 60
_ANCHO      = _MARGEN_R - _MARGEN_L


def _tamaño_para_tipo(tipo):
    mapa = {"h1":20,"h2":17,"h3":15,"h4":13,"h5":12,"h6":11}
    return mapa.get(tipo, 11)

def _es_encabezado(tipo):
    return tipo in {"h1","h2","h3","h4","h5","h6"}


def _generar_pdf(titulo, url_origen, parrafos, ruta_salida):
    doc = fitz.open()
    pagina = doc.new_page(width=_PAGE_W, height=_PAGE_H)
    y = [_MARGEN_TOP]

    def nueva_pagina():
        pagina_ref[0] = doc.new_page(width=_PAGE_W, height=_PAGE_H)
        y[0] = _MARGEN_TOP

    pagina_ref = [pagina]

    def insertar_texto(texto, font, size, color=(0.15,0.15,0.15), pre=0, post=0):
        y[0] += pre
        palabras = texto.split()
        linea = ""
        lineas = []
        for p in palabras:
            prueba = linea + (" " if linea else "") + p
            if fitz.get_text_length(prueba, fontname=font, fontsize=size) <= _ANCHO:
                linea = prueba
            else:
                if linea: lineas.append(linea)
                linea = p
        if linea: lineas.append(linea)

        for ln in lineas:
            if y[0] + size + 4 > _MARGEN_BOT:
                nueva_pagina()
            pagina_ref[0].insert_text(
                (float(_MARGEN_L), float(y[0])),
                ln, fontname=font, fontsize=float(size), color=color
            )
            y[0] += size * 1.35
        y[0] += post

    insertar_texto(titulo, _FONT_BOLD, 16, color=(0.2,0.1,0.5), post=4)
    url_corta = url_origen[:80] + ("…" if len(url_origen) > 80 else "")
    insertar_texto(url_corta, _FONT_NORMAL, 8, color=(0.5,0.5,0.5), post=2)

    if y[0] + 12 > _MARGEN_BOT:
        nueva_pagina()
    pagina_ref[0].draw_line(
        (float(_MARGEN_L), float(y[0])),
        (float(_MARGEN_R), float(y[0])),
        color=(0.8,0.7,0.95), width=1.0
    )
    y[0] += 14

    for tipo, texto in parrafos:
        es_h = _es_encabezado(tipo)
        size = _tamaño_para_tipo(tipo)
        font  = _FONT_BOLD if es_h else _FONT_NORMAL
        color = (0.15,0.0,0.4) if es_h else (0.15,0.15,0.15)
        insertar_texto(texto, font, size, color=color,
                       pre=10 if es_h else 4, post=4 if es_h else 2)

    doc.save(ruta_salida)
    doc.close()


# ──────────────────────────────────────────────
# MOTOR DE CONVERSIÓN URL→PDF
# ──────────────────────────────────────────────

def _fallback_html_a_pdf(url, parsed, ruta_pdf, html_provisto="", titulo_sugerido=""):
    """
    Fallback ligero sin Playwright: descarga el HTML con requests (o usa el HTML
    enviado directamente por la extensión del navegador) y genera un PDF limpio con PyMuPDF.
    """
    try:
        html_text = html_provisto
        if not html_text:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/127.0.0.0 Safari/537.36"
                )
            }
            resp = requests.get(url, headers=headers, timeout=25)
            resp.raise_for_status()
            resp.encoding = resp.apparent_encoding or "utf-8"
            html_text = resp.text

        titulo, parrafos = _extraer_contenido_html(html_text)
        if titulo_sugerido and (not titulo or titulo == "Página Web"):
            titulo = titulo_sugerido

        if not parrafos:
            return {"ok": False, "error": "No se encontró texto legible en la página web."}

        _generar_pdf(titulo, url, parrafos, ruta_pdf)
        if os.path.exists(ruta_pdf) and os.path.getsize(ruta_pdf) > 0:
            _log(f"[FALLBACK] PDF generado con éxito via PyMuPDF: {ruta_pdf}")
            return {"ok": True, "ruta": os.path.abspath(ruta_pdf), "titulo": titulo, "tipo": "web"}
        return {"ok": False, "error": "No se pudo generar el archivo PDF de respaldo."}
    except Exception as e:
        _log(f"[FALLBACK] Error en fallback HTML->PDF: {e}")
        return {"ok": False, "error": f"No se pudo procesar la página web: {str(e)[:120]}"}


def _procesar_url(url, parsed, ruta_pdf, html_fallback="", titulo_sugerido=""):
    """
    Estilo Ctrl+P: Playwright en subprocess aislado.
    Fallback automático a extractor HTML + PyMuPDF si Playwright falla o no está disponible.
    """
    # Resolver rutas del worker y del interprete
    if getattr(sys, "frozen", False):
        python_exe = os.path.join(os.path.dirname(sys.executable), "python.exe")
        worker_path = os.path.join(estado_app.bundle_dir, "backend", "estudio", "playwright_worker.py")
        if not os.path.exists(worker_path):
            worker_path = os.path.join(BASE_DIR, "backend", "estudio", "playwright_worker.py")
    else:
        python_exe = sys.executable
        worker_path = os.path.join(BASE_DIR, "backend", "estudio", "playwright_worker.py")

    _log(f"[PROC] python_exe={python_exe}")
    _log(f"[PROC] worker_path={worker_path} exists={os.path.exists(worker_path)}")

    error_playwright = None

    # -- INTENTO 1: Playwright via subprocess --------------------------------
    if os.path.exists(worker_path) and os.path.exists(python_exe):
        proc = None
        try:
            _log("[PROC] Lanzando subprocess Playwright...")
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
            proc = subprocess.Popen(
                [python_exe, worker_path, url, ruta_pdf],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                encoding="utf-8",
                errors="replace",
                creationflags=creationflags,
            )
            _log(f"[PROC] subprocess PID={proc.pid} lanzado, esperando (timeout=75s)...")
            try:
                stdout, stderr = proc.communicate(timeout=75)
                _log(f"[PROC] subprocess terminó con returncode={proc.returncode}")
                _log(f"[PROC] stdout={stdout[:200].strip()!r}")
                if stderr:
                    _log(f"[PROC] stderr={stderr[:200].strip()!r}")
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.communicate()  # limpiar buffers
                _log("[PROC] subprocess TIMEOUT (75s) -> kill() -> fallback")
                proc = None
                error_playwright = "El renderizado superó el límite de tiempo (75s)."

            if proc is not None:
                salida = stdout.strip()
                if salida:
                    try:
                        lineas_json = [ln.strip() for ln in salida.splitlines() if ln.strip().startswith("{")]
                        datos = json.loads(lineas_json[-1] if lineas_json else salida)
                    except Exception:
                        datos = {}
                    if datos.get("ok") and os.path.exists(ruta_pdf) and os.path.getsize(ruta_pdf) > 0:
                        _log(f"[PROC] Playwright OK -> titulo={datos.get('titulo','?')[:60]}")
                        return {"ok": True, "ruta": os.path.abspath(ruta_pdf), "titulo": datos.get("titulo", parsed.netloc), "tipo": "web"}
                    else:
                        error_playwright = datos.get("error", "Error desconocido en Playwright")
                        _log(f"[PROC] Playwright error en worker: {error_playwright} -> intentando fallback HTML")
                else:
                    stderr_txt = (stderr or "")[:300] or "(sin stdout ni stderr)"
                    _log(f"[PROC] Playwright sin stdout. stderr={stderr_txt!r} -> intentando fallback HTML")
                    error_playwright = f"El navegador externo falló: {stderr_txt}"
        except Exception as e:
            if proc:
                try:
                    proc.kill()
                except Exception:
                    pass
            _log(f"[PROC] EXCEPCION en subprocess: {e} -> intentando fallback HTML")
            error_playwright = str(e)[:120]

    # -- INTENTO 2: Fallback con extractor HTML + PyMuPDF --------------------
    _log("[PROC] Ejecutando fallback HTML -> PDF con PyMuPDF...")
    res_fb = _fallback_html_a_pdf(url, parsed, ruta_pdf, html_provisto=html_fallback, titulo_sugerido=titulo_sugerido)
    if res_fb.get("ok"):
        return res_fb

    return {
        "ok": False,
        "error": error_playwright or res_fb.get("error", "No se pudo convertir la página web a PDF.")
    }


# ──────────────────────────────────────────────
# FUNCIONES EXPUESTAS A EEL
# ──────────────────────────────────────────────

@eel.expose
def importar_url_como_pdf(url):
    """
    NO BLOQUEANTE: Lanza el trabajo en un hilo y retorna inmediatamente.
    El resultado llega a JS mediante eel.web_url_resultado(resultado).
    """
    url = url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        url = "https://" + url
        parsed = urlparse(url)
    if not parsed.netloc:
        return {"ok": False, "error": "URL no valida. Incluye https://"}

    ts = int(time.time())
    nombre = re.sub(r"[^\w]", "_", parsed.netloc)[:30]
    ruta_pdf = os.path.join(TEMP_DIR, f"web_{nombre}_{ts}.pdf")

    _log(f"--- NUEVA PETICION URL: {url[:80]}")
    _log(f"    ruta_pdf: {ruta_pdf}")

    try:
        resultado = _procesar_url(url, parsed, ruta_pdf)
        _log(f"[MAIN] _procesar_url termino -> ok={resultado.get('ok')}")
        return resultado
    except Exception as ex:
        _log(f"[MAIN] EXCEPCION en _procesar_url: {ex}")
        return {"ok": False, "error": str(ex)[:150]}


@eel.expose
def importar_texto_como_pdf(texto, titulo="Texto"):
    """Convierte texto plano en PDF temporal."""
    try:
        texto = texto.strip()
        if not texto:
            return {"ok": False, "error": "El texto está vacío."}

        lineas = [l.strip() for l in texto.splitlines() if l.strip()]
        if not titulo or titulo == "Texto":
            titulo = lineas[0][:80] if lineas else "Texto"

        parrafos = [("p", l) for l in lineas]

        if not parrafos:
            return {"ok": False, "error": "No hay texto para convertir."}

        ts = int(time.time())
        nombre_seg = re.sub(r"[^\w]", "_", titulo[:20])
        ruta_pdf = os.path.join(TEMP_DIR, f"texto_{nombre_seg}_{ts}.pdf")
        _generar_pdf(titulo, "Texto libre", parrafos, ruta_pdf)

        return {"ok": True, "ruta": ruta_pdf, "titulo": titulo}

    except Exception as e:
        return {"ok": False, "error": f"Error al generar PDF: {str(e)[:120]}"}