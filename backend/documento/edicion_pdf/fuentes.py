import os
import re
import sys
import threading
import fitz

from backend.core.estado_global import estado_app
from .comun import (
    FUENTES_ESTANDAR,
    _MAPA_BASE14_FAMILIA,
    EQUIVALENCIAS_METRICAS,
    FLAG_ITALICO,
    FLAG_SERIF,
    FLAG_MONO,
    FLAG_NEGRITA,
)

_LOCK_CACHE_FUENTES = threading.RLock()
_CACHE_FUENTES_BUILTIN = {}
_CACHE_OBJETOS_FUENTE = {}
_INDICE_FUENTES_CACHE = None

_SUFIJOS_ESTILO_RE = re.compile(
    r"(?:(?:[-_,\s]+(?:Bold\s*(?:Italic|Oblique)|"
    r"SemiBold\s*(?:Italic|Oblique)|Semibold\s*(?:Italic|Oblique)|"
    r"DemiBold\s*(?:Italic|Oblique)|ExtraBold\s*(?:Italic|Oblique)|"
    r"Light\s*(?:Italic|Oblique)|ExtraLight\s*(?:Italic|Oblique)|"
    r"Medium\s*(?:Italic|Oblique)|Thin\s*(?:Italic|Oblique)|"
    r"Heavy\s*(?:Italic|Oblique)|Black\s*(?:Italic|Oblique)|"
    r"SemiBold|Semibold|DemiBold|ExtraBold|ExtraLight|Bold|Italic|Oblique|"
    r"Regular|Light|Medium|Thin|Heavy|"
    r"Condensed|ItalicMT|BoldMT|BoldItalicMT))|"
    r"(?:[-_,]+(?:Book|Roman|Normal|Plain|It|Bd|BI|BdIt)))$",
    re.IGNORECASE,
)
_SUFIJOS_TECNICOS_RE = re.compile(r"(?:PSMT|PS|MT|Std|Pro|LT|W1G|VF|Web)$")
_EXTENSIONES_FUENTE = (".ttf", ".otf", ".ttc")


def invalidar_cache_fuentes():
    """Invalida la caché en memoria de fuentes del sistema y locales para recargar nuevas descargas."""
    global _INDICE_FUENTES_CACHE
    with _LOCK_CACHE_FUENTES:
        _INDICE_FUENTES_CACHE = None
        _CACHE_OBJETOS_FUENTE.clear()


def _dir_fuentes_locales():
    return os.path.join(estado_app.base_dir, "recursos", "fuentes")


def _rutas_directorios_fuentes_sistema():
    dirs = []
    if sys.platform == "win32" or os.name == "nt":
        win_dir = os.environ.get("WINDIR", r"C:\Windows")
        dirs.append(os.path.join(win_dir, "Fonts"))
        local_app = os.environ.get("LOCALAPPDATA", "")
        if local_app:
            dirs.append(os.path.join(local_app, "Microsoft", "Windows", "Fonts"))
    elif sys.platform == "darwin":
        dirs.extend([
            "/System/Library/Fonts",
            "/Library/Fonts",
            os.path.expanduser("~/Library/Fonts"),
        ])
    else:
        dirs.extend([
            "/usr/share/fonts",
            "/usr/local/share/fonts",
            os.path.expanduser("~/.local/share/fonts"),
            os.path.expanduser("~/.fonts"),
        ])
    return [d for d in dirs if d and os.path.isdir(d)]


def _normalizar_familia_fuente(raw):
    """Elimina sufijos técnicos/estilo, separa CamelCase y retorna (familia_limpia, clave_norm)."""
    s = raw.split(",")[0].strip()

    # Iterativamente quitar sufijos técnicos y de estilo manteniendo MS en TrebuchetMS / ComicSansMS
    for _ in range(4):
        prev = s
        s = re.sub(r"(?:PS)?(?:-)?(?:BoldItalic|BoldOblique|Bold|Italic|Oblique|Regular)?(?:PS)?MT$", lambda m: "" if m.group(0) else "", s)
        # Re-aplicar limpieza más precisa de sufijos técnicos finales
        if s == prev:
            s = _SUFIJOS_ESTILO_RE.sub("", s).strip(" -_,")
        if s == prev:
            # Quitar sufijos técnicos sólo cuando no amputan la palabra completa
            cand = _SUFIJOS_TECNICOS_RE.sub("", s).strip(" -_,")
            if len(cand) >= 2:
                s = cand
        if s == prev:
            break

    # Caso especial: TimesNewRomanPS -> TimesNewRoman, CourierNewPS -> CourierNew
    if s.endswith("PS") and len(s) > 3:
        s = s[:-2].strip(" -_,")

    # Insertar espacios en nombres pegados CamelCase (TimesNewRoman -> Times New Roman, EBGaramond -> EB Garamond)
    if "-" in s:
        s = re.sub(r"\s*-\s*", " ", s)
    if " " not in s:
        s = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", s)
        s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", s)
        # Caso especial MS PGothic -> MS PGothic (evitar M S)
        s = re.sub(r"\bMS([A-Z])", r"MS \1", s)

    s = re.sub(r"\s+", " ", s).strip() or raw
    clave_norm = re.sub(r"[^a-z0-9]", "", s.lower())
    return s, clave_norm


def _extraer_info_nombre_fuente(nombre_fuente, flags=0):
    """
    Limpia prefijos de subconjunto (^[A-Z]{6}+) y sufijos técnicos/de estilo preservando
    tokens legítimos como 'MS' en 'TrebuchetMS' o 'ComicSansMS'.
    Retorna (familia_limpia, familia_norm, negrita, cursiva, es_peso_estandar).
    """
    raw = str(nombre_fuente or "").strip()
    if not raw:
        return ("Helvetica", "helvetica", bool(flags & FLAG_NEGRITA), bool(flags & FLAG_ITALICO), True)

    # Quitar escapes PDF (#20 -> ' ') y prefijo subset ^[A-Z]{6}+
    raw = raw.replace("#20", " ")
    raw = re.sub(r"^[A-Z]{6}\+", "", raw).strip()

    low_exact = raw.lower()
    if low_exact in _MAPA_BASE14_FAMILIA:
        fam_b14, b14_neg, b14_cur, _ = _MAPA_BASE14_FAMILIA[low_exact]
        return (
            fam_b14,
            re.sub(r"[^a-z0-9]", "", fam_b14.lower()),
            bool(flags & FLAG_NEGRITA) or b14_neg,
            bool(flags & FLAG_ITALICO) or b14_cur,
            True,
        )

    # Detectar estilo antes de limpiar sufijos
    negrita = bool(flags & FLAG_NEGRITA)
    cursiva = bool(flags & FLAG_ITALICO)

    # Detectar variantes secundarias de peso (Light/SemiBold/Medium) para priorizar Regular/Bold reales
    es_peso_estandar = True
    if re.search(
        r"(?:[-_,\s]|^)(?:light|extralight|thin|semibold|demibold|extrabold|medium|heavy)"
        r"(?:\s*(?:italic|oblique|it))?(?:[-_,\s]|$)",
        low_exact,
    ):
        es_peso_estandar = False

    if re.search(r"(?:bold|semibold|demibold|extrabold|heavy|negrita|hebo|tibo|cobo|hebi|tibi|cobi)", low_exact):
        negrita = True
    if re.search(r"(?:italic|oblique|cursiva|heit|tiit|coit|hebi|tibi|cobi)", low_exact) or re.search(
        r"(?:[-_,](?:ital|it|bi|bdit))$", low_exact
    ):
        cursiva = True

    s, clave_norm = _normalizar_familia_fuente(raw)
    return (s, clave_norm, negrita, cursiva, es_peso_estandar)


def limpiar_nombre_fuente(nombre_fuente):
    """Devuelve el nombre de familia limpio y legible (sin prefijo subset ni sufijos técnicos)."""
    fam, _, _, _, _ = _extraer_info_nombre_fuente(nombre_fuente, 0)
    return fam


def normalizar_clave_familia(nombre_fuente):
    """Devuelve la clave canónica alfanumérica en minúsculas de la familia."""
    _, clave, _, _, _ = _extraer_info_nombre_fuente(nombre_fuente, 0)
    return clave


def detectar_negrita_cursiva(nombre_fuente, flags):
    _, _, negrita, cursiva, _ = _extraer_info_nombre_fuente(nombre_fuente, flags)
    return negrita, cursiva


def clasificar_familia(nombre_fuente, flags):
    """Clasifica en 'mono', 'serif' o 'sans' sin confiar en el bit flags & 4 (Google sans lo activa)."""
    fam_limpia, clave, _, _, _ = _extraer_info_nombre_fuente(nombre_fuente, flags)
    nombre = fam_limpia.lower()
    if (
        (flags & FLAG_MONO)
        or any(k in nombre for k in ("courier", "cour", "consolas", "mono", "menlo", "lucon", "cousine", "code"))
    ):
        return "mono"
    if any(k in clave for k in (
        "sans", "arial", "helv", "helvetica", "calibri", "segoe", "verdana", "tahoma",
        "roboto", "lato", "montserrat", "poppins", "oswald", "raleway", "nunito",
        "worksans", "trebuchet", "comicsans", "impact", "caveat", "carlito", "arimo", "inter",
    )):
        return "sans"
    if any(k in clave for k in (
        "serif", "times", "tiro", "georgia", "cambria", "garamond", "ebgaramond",
        "merriweather", "lora", "playfair", "baskerville", "caladea", "tinos",
        "roman", "palatino", "book",
    )):
        return "serif"
    return "sans"


def _cargar_objeto_fuente_ruta(ruta):
    with _LOCK_CACHE_FUENTES:
        if ruta in _CACHE_OBJETOS_FUENTE:
            return _CACHE_OBJETOS_FUENTE[ruta]
    try:
        f = fitz.Font(fontfile=ruta)
        with _LOCK_CACHE_FUENTES:
            _CACHE_OBJETOS_FUENTE[ruta] = f
        return f
    except Exception:
        return None


def _construir_entrada_fuente(f, ruta, fn, low, origen, prioridad_origen):
    """Construye la entrada normalizada de catálogo para un objeto fitz.Font y retorna (entry, es_estandar)."""
    internal_name = f.name or os.path.splitext(fn)[0]
    fam_limpia, fam_norm, neg_name, cur_name, es_estandar = _extraer_info_nombre_fuente(internal_name, 0)
    if not fam_norm:
        return None, False

    negrita = bool(f.flags.get("bold", 0)) or neg_name
    cursiva = bool(f.flags.get("italic", 0)) or cur_name
    # Para variantes como "Arial Black" con bold=0, no forzar negrita por nombre
    if fam_norm.endswith("black") and not f.flags.get("bold", 0) and "bold" not in internal_name.lower():
        negrita = False

    es_ttc = 1 if low.endswith(".ttc") else 0
    # Prioridad menor = mejor: (origen local vs sistema, peso estándar vs light/semibold, ttf/otf vs ttc)
    prio = (prioridad_origen, 0 if es_estandar else 1, es_ttc)

    variante_nombre = (
        "BoldItalic" if (negrita and cursiva)
        else "Bold" if negrita
        else "Italic" if cursiva
        else "Regular"
    )
    entry = {
        "ruta": ruta,
        "nombre_interno": internal_name,
        "familia": fam_limpia,
        "clave": fam_norm,
        "negrita": negrita,
        "cursiva": cursiva,
        "variante": variante_nombre,
        "origen": origen,
        "prio": prio,
    }
    return entry, es_estandar


def _registrar_archivo_fuente(ruta, fn, low, origen, prioridad_origen, indice_claves, familias):
    """Inspecciona un archivo de fuente TTF/OTF/TTC y lo registra en indice_claves y familias por prioridad."""
    try:
        f = fitz.Font(fontfile=ruta)
    except Exception:
        return
    if not f or f.flags.get("never-embed", 0):
        return

    entry, es_estandar = _construir_entrada_fuente(f, ruta, fn, low, origen, prioridad_origen)
    if entry is None:
        return

    fam_limpia = entry["familia"]
    fam_norm = entry["clave"]
    variante_nombre = entry["variante"]
    prio = entry["prio"]

    key = (fam_norm, entry["negrita"], entry["cursiva"])
    prev = indice_claves.get(key)
    if prev is None or prio < prev["prio"]:
        indice_claves[key] = entry

    fam_rec = familias.setdefault(
        fam_norm,
        {"familia": fam_limpia, "clave": fam_norm, "variantes": {}, "origenes": set()},
    )
    fam_rec["origenes"].add(origen)
    # Preferir nombre de archivo/carpeta más limpio si el actual es Regular
    if variante_nombre == "Regular" and es_estandar:
        fam_rec["familia"] = fam_limpia
    prev_var = fam_rec["variantes"].get(variante_nombre)
    if prev_var is None or prio < prev_var["prio"]:
        fam_rec["variantes"][variante_nombre] = entry


def _escanear_directorio_fuentes(directorio, origen, prioridad_origen, indice_claves, familias):
    if not directorio or not os.path.isdir(directorio):
        return
    for root, _, files in os.walk(directorio):
        for fn in sorted(files):
            low = fn.lower()
            if not low.endswith(_EXTENSIONES_FUENTE):
                continue
            _registrar_archivo_fuente(
                os.path.join(root, fn), fn, low, origen, prioridad_origen, indice_claves, familias
            )


def obtener_indice_fuentes(forzar_recarga=False):
    """Construye y cachea el índice de fuentes de recursos/fuentes/ y del sistema operativo."""
    global _INDICE_FUENTES_CACHE
    with _LOCK_CACHE_FUENTES:
        if _INDICE_FUENTES_CACHE is not None and not forzar_recarga:
            return _INDICE_FUENTES_CACHE

        indice_claves = {}
        familias = {}

        # 1. Locales del proyecto (recursos/fuentes/) tienen prioridad máxima (0)
        _escanear_directorio_fuentes(_dir_fuentes_locales(), "local", 0, indice_claves, familias)

        # 2. Fuentes instaladas en el sistema operativo (1)
        for sys_dir in _rutas_directorios_fuentes_sistema():
            _escanear_directorio_fuentes(sys_dir, "sistema", 1, indice_claves, familias)

        _INDICE_FUENTES_CACHE = {
            "por_clave": indice_claves,
            "familias": familias,
        }
        return _INDICE_FUENTES_CACHE


def buscar_fuente_en_indice(familia_norm, negrita=False, cursiva=False, permitir_fallback_variante=False):
    """Busca (familia_norm, negrita, cursiva) en el índice cacheado y devuelve (fitz.Font, entry) o (None, None)."""
    indice = obtener_indice_fuentes()
    por_clave = indice["por_clave"]
    entry = por_clave.get((familia_norm, bool(negrita), bool(cursiva)))
    if entry is None and permitir_fallback_variante:
        if negrita and cursiva:
            entry = por_clave.get((familia_norm, True, False)) or por_clave.get((familia_norm, False, True))
        if entry is None and not negrita:
            entry = por_clave.get((familia_norm, False, False))
    if entry is None:
        return None, None
    f_obj = _cargar_objeto_fuente_ruta(entry["ruta"])
    if f_obj is None:
        return None, None
    return f_obj, entry

# Reexportación de resolución tipográfica y renderizado para compatibilidad de imports
from .fuentes_render import (  # noqa: E402, F401
    cargar_fuente_builtin,
    _fuente_soporta_texto,
    _fuente_embebida_coincide,
    _buscar_fuente_embebida_completa,
    _seleccionar_mejor_fuente_por_glifos,
    _buscar_fuente_fallback_unicode,
    verificar_fuente_disponible,
    _buscar_fuente_primaria,
    resolver_fuente_completa,
    _dividir_runs_mixtos,
    medir_texto,
    _parchear_tounicode_espacio,
    _registrar_fuente_en_pagina,
    insertar_texto_con_fuente,
)
