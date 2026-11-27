import io
import os
import re
import tarfile
import urllib.parse
import urllib.request

import fitz

from backend.core.estado_global import estado_app
from backend.documento.edicion_pdf import (
    _dir_fuentes_locales,
    clasificar_familia,
    invalidar_cache_fuentes,
    normalizar_clave_familia,
    obtener_indice_fuentes,
)

_USER_AGENT_STATIC_TTF = "Python-urllib/3.11"
_LIBERATION_TARBALL_URL = (
    "https://github.com/liberationfonts/liberation-fonts/files/7261482/"
    "liberation-fonts-ttf-2.1.5.tar.gz"
)
_MAGIC_HEADERS = (b"\x00\x01\x00\x00", b"OTTO", b"true", b"ttcf")

_DEFINICION_CATALOGO = [
    ("Roboto", "sans", "google_css2"),
    ("Open Sans", "sans", "google_css2"),
    ("Lato", "sans", "google_css2"),
    ("Montserrat", "sans", "google_css2"),
    ("Poppins", "sans", "google_css2"),
    ("Oswald", "display", "google_css2"),
    ("Raleway", "sans", "google_css2"),
    ("Nunito", "sans", "google_css2"),
    ("Work Sans", "sans", "google_css2"),
    ("EB Garamond", "serif", "google_css2"),
    ("Merriweather", "serif", "google_css2"),
    ("Lora", "serif", "google_css2"),
    ("Playfair Display", "serif", "google_css2"),
    ("Libre Baskerville", "serif", "google_css2"),
    ("Roboto Mono", "mono", "google_css2"),
    ("Caveat", "handwriting", "google_css2"),
    ("Liberation Sans", "sans", "liberation_tarball"),
    ("Liberation Serif", "serif", "liberation_tarball"),
    ("Liberation Mono", "mono", "liberation_tarball"),
    ("Carlito", "sans", "google_css2"),
    ("Caladea", "serif", "google_css2"),
]

CATALOGO_FUENTES = {}
for _fam, _cat, _src in _DEFINICION_CATALOGO:
    _clave = normalizar_clave_familia(_fam)
    CATALOGO_FUENTES[_clave] = {
        "familia": _fam,
        "clave": _clave,
        "slug": re.sub(r"[^a-z0-9]+", "_", _fam.lower()).strip("_"),
        "categoria": _cat,
        "fuente_descarga": _src,
    }


def validar_buffer_fuente(buffer):
    """Valida firma binaria .ttf/.otf y carga real mediante fitz.Font (sin fontTools)."""
    if not isinstance(buffer, (bytes, bytearray)) or len(buffer) < 256:
        return False, "Archivo de fuente vacío o demasiado pequeño."
    raw = bytes(buffer)
    if raw[:4] not in _MAGIC_HEADERS:
        return False, f"Cabecera mágica de fuente inválida: {raw[:4]!r}"
    try:
        font_obj = fitz.Font(fontbuffer=raw)
    except Exception as exc:
        return False, f"No se pudo parsear la fuente con PyMuPDF: {exc}"
    if not getattr(font_obj, "name", None):
        return False, "La fuente no expone nombre interno válido."
    if font_obj.flags.get("never-embed", 0):
        return False, f"La fuente '{font_obj.name}' prohíbe el embebido (never-embed)."
    return True, font_obj


def _guardar_fuente_atomica(directorio, nombre_archivo, buffer):
    os.makedirs(directorio, exist_ok=True)
    destino = os.path.join(directorio, nombre_archivo)
    temporal = destino + ".tmp"
    try:
        with open(temporal, "wb") as f:
            f.write(buffer)
            f.flush()
        os.replace(temporal, destino)
    finally:
        if os.path.exists(temporal):
            try:
                os.remove(temporal)
            except Exception:
                pass
    return destino


def _http_get_bytes(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT_STATIC_TTF})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _variante_desde_css_y_font(style_str, weight_str, font_obj):
    es_cursiva = (style_str or "").lower() in ("italic", "oblique") or bool(font_obj.flags.get("italic", 0))
    try:
        peso = int(weight_str)
    except Exception:
        peso = 700 if font_obj.flags.get("bold", 0) else 400
    es_negrita = peso >= 600 or bool(font_obj.flags.get("bold", 0))
    if es_negrita and es_cursiva:
        return "BoldItalic"
    if es_negrita:
        return "Bold"
    if es_cursiva:
        return "Italic"
    return "Regular"


def _extraer_descargas_google_css2(css_text):
    """Extrae tuplas deduplicadas (style, weight, url) de bloques @font-face .ttf/.otf."""
    bloques = re.findall(r"@font-face\s*\{([^}]+)\}", css_text, flags=re.IGNORECASE | re.DOTALL)
    descargas = []
    vistas = set()
    for blk in bloques:
        m_url = re.search(r"url\((https://[^)]+\.(?:ttf|otf))\)", blk, flags=re.IGNORECASE)
        if not m_url:
            continue
        font_url = m_url.group(1).strip("'\" ")
        if font_url in vistas:
            continue
        vistas.add(font_url)

        m_style = re.search(r"font-style\s*:\s*([a-zA-Z]+)", blk, flags=re.IGNORECASE)
        m_weight = re.search(r"font-weight\s*:\s*(\d+)", blk, flags=re.IGNORECASE)
        descargas.append((
            m_style.group(1) if m_style else "normal",
            m_weight.group(1) if m_weight else "400",
            font_url,
        ))
    return descargas


def _descargar_google_css2(entry, archivos_escritos=None):
    fam = entry["familia"]
    q = urllib.parse.quote_plus(fam)
    css_urls = [
        f"https://fonts.googleapis.com/css2?family={q}:ital,wght@0,400;0,700;1,400;1,700",
        f"https://fonts.googleapis.com/css2?family={q}:wght@400;700",
        f"https://fonts.googleapis.com/css2?family={q}",
    ]

    css_text = None
    ultimo_error = None
    for css_url in css_urls:
        try:
            css_text = _http_get_bytes(css_url, timeout=15).decode("utf-8", errors="replace")
            if "@font-face" in css_text:
                break
        except Exception as exc:
            ultimo_error = exc
            continue

    if not css_text or "@font-face" not in css_text:
        raise RuntimeError(f"No se pudo obtener CSS2 para '{fam}': {ultimo_error}")

    descargas = _extraer_descargas_google_css2(css_text)
    if not descargas:
        raise RuntimeError(f"Google Fonts no devolvió URLs .ttf/.otf estáticas para '{fam}'.")

    dir_destino = os.path.join(_dir_fuentes_locales(), entry["slug"])
    base_nombre = re.sub(r"[^A-Za-z0-9]+", "", fam)
    guardados = []
    variantes = []

    for style_str, weight_str, font_url in descargas:
        buf = _http_get_bytes(font_url, timeout=25)
        ok, res_val = validar_buffer_fuente(buf)
        if not ok:
            raise RuntimeError(f"Fuente inválida descargada desde {font_url}: {res_val}")
        font_obj = res_val
        variante = _variante_desde_css_y_font(style_str, weight_str, font_obj)
        ext = ".otf" if buf[:4] == b"OTTO" else ".ttf"
        nombre_archivo = f"{base_nombre}-{variante}{ext}"
        ruta = _guardar_fuente_atomica(dir_destino, nombre_archivo, buf)
        guardados.append(ruta)
        if archivos_escritos is not None:
            archivos_escritos.append(ruta)
        if variante not in variantes:
            variantes.append(variante)

    return guardados, variantes


def _descargar_liberation_tarball(clave_objetivo, archivos_escritos=None):
    raw_tgz = _http_get_bytes(_LIBERATION_TARBALL_URL, timeout=45)
    guardados_objetivo = []
    variantes_objetivo = []

    prefijos_lib = {
        "liberationsans": ("Liberation Sans", "liberation_sans"),
        "liberationserif": ("Liberation Serif", "liberation_serif"),
        "liberationmono": ("Liberation Mono", "liberation_mono"),
    }

    with tarfile.open(fileobj=io.BytesIO(raw_tgz), mode="r:gz") as tf:
        for member in tf.getmembers():
            if not member.isfile():
                continue
            fname = os.path.basename(member.name)
            if not fname.lower().endswith((".ttf", ".otf")):
                continue
            extracted = tf.extractfile(member)
            if extracted is None:
                continue
            buf = extracted.read()
            ok, res_val = validar_buffer_fuente(buf)
            if not ok:
                continue
            font_obj = res_val
            clave_m = normalizar_clave_familia(font_obj.name or fname)
            if clave_m not in prefijos_lib:
                continue
            _, slug_dir = prefijos_lib[clave_m]
            dir_destino = os.path.join(_dir_fuentes_locales(), slug_dir)
            ruta = _guardar_fuente_atomica(dir_destino, fname, buf)
            if archivos_escritos is not None:
                archivos_escritos.append(ruta)
            if clave_m == clave_objetivo:
                guardados_objetivo.append(ruta)
                var = _variante_desde_css_y_font("", "", font_obj)
                if var not in variantes_objetivo:
                    variantes_objetivo.append(var)

    if not guardados_objetivo:
        raise RuntimeError(f"No se encontraron archivos TTF válidos para '{clave_objetivo}' en el archivo Liberation.")
    return guardados_objetivo, variantes_objetivo


def listar_fuentes_editor():
    """Lista fuentes disponibles localmente/sistema y descargables desde el catálogo oficial."""
    indice = obtener_indice_fuentes()
    familias_idx = indice.get("familias", {})

    resultado = {}

    # 1. Incorporar todas las familias del catálogo oficial
    for clave, cat_info in CATALOGO_FUENTES.items():
        idx_rec = familias_idx.get(clave)
        if idx_rec:
            origenes = sorted(idx_rec.get("origenes", set()))
            origen = "+".join(origenes) if origenes else "sistema"
            variantes = sorted(idx_rec.get("variantes", {}).keys())
            instalada = True
        else:
            origen = "catalogo"
            variantes = []
            instalada = False

        resultado[clave] = {
            "familia": cat_info["familia"],
            "clave": clave,
            "instalada": instalada,
            "descargable": True,
            "variantes_disponibles": variantes,
            "origen": origen,
            "categoria": cat_info["categoria"],
        }

    # 2. Incorporar familias detectadas en local o sistema que no están en el catálogo
    for clave, idx_rec in familias_idx.items():
        if clave in resultado:
            continue
        origenes = sorted(idx_rec.get("origenes", set()))
        resultado[clave] = {
            "familia": idx_rec["familia"],
            "clave": clave,
            "instalada": True,
            "descargable": False,
            "variantes_disponibles": sorted(idx_rec.get("variantes", {}).keys()),
            "origen": "+".join(origenes) if origenes else "sistema",
            "categoria": clasificar_familia(idx_rec["familia"], 0),
        }

    lista_ordenada = sorted(
        resultado.values(),
        key=lambda item: (not item["instalada"], not item["descargable"], item["familia"].lower()),
    )
    return {
        "success": True,
        "fuentes": lista_ordenada,
        "total": len(lista_ordenada),
    }


def descargar_fuente_editor(nombre_familia):
    """
    Descarga e instala en recursos/fuentes/ una familia del catálogo oficial,
    valida los binarios .ttf/.otf con fitz.Font e invalida la caché de edicion_pdf.
    """
    if not nombre_familia or not str(nombre_familia).strip():
        return {"success": False, "error": "Debe especificar el nombre de la familia tipográfica."}

    clave = normalizar_clave_familia(str(nombre_familia))
    entry = CATALOGO_FUENTES.get(clave)
    if entry is None:
        return {
            "success": False,
            "error": f"La familia '{nombre_familia}' no está en el catálogo oficial descargable.",
        }

    archivos_escritos = []
    cache_actualizada = False
    try:
        if entry["fuente_descarga"] == "liberation_tarball":
            archivos, variantes = _descargar_liberation_tarball(clave, archivos_escritos)
        else:
            archivos, variantes = _descargar_google_css2(entry, archivos_escritos)

        invalidar_cache_fuentes()
        obtener_indice_fuentes(forzar_recarga=True)
        cache_actualizada = True

        return {
            "success": True,
            "familia": entry["familia"],
            "clave": clave,
            "archivos": archivos,
            "variantes_disponibles": variantes,
        }
    except Exception as exc:
        return {"success": False, "error": str(exc)}
    finally:
        if archivos_escritos and not cache_actualizada:
            invalidar_cache_fuentes()
