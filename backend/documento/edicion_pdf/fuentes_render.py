# LiraLoud - Resolución tipográfica, fallback Unicode, medición e inserción de texto PDF
import re
import fitz

from .comun import (
    FUENTES_ESTANDAR,
    _MAPA_BASE14_FAMILIA,
    EQUIVALENCIAS_METRICAS,
    FLAG_ITALICO,
    FLAG_SERIF,
    FLAG_MONO,
    FLAG_NEGRITA,
)
from .fuentes import (
    _LOCK_CACHE_FUENTES,
    _CACHE_FUENTES_BUILTIN,
    _extraer_info_nombre_fuente,
    limpiar_nombre_fuente,
    normalizar_clave_familia,
    detectar_negrita_cursiva,
    clasificar_familia,
    _cargar_objeto_fuente_ruta,
    obtener_indice_fuentes,
    buscar_fuente_en_indice,
)


def cargar_fuente_builtin(codigo_base14):
    if codigo_base14 in _CACHE_FUENTES_BUILTIN:
        return _CACHE_FUENTES_BUILTIN[codigo_base14]
    try:
        font_obj = fitz.Font(codigo_base14)
        _CACHE_FUENTES_BUILTIN[codigo_base14] = font_obj
        return font_obj
    except Exception:
        _CACHE_FUENTES_BUILTIN[codigo_base14] = None
        return None

def _fuente_soporta_texto(font_obj, texto):
    if font_obj is None or not texto:
        return True
    for ch in texto:
        if ch in ("\n", "\r", "\t", " "):
            continue
        try:
            if not font_obj.has_glyph(ord(ch)):
                return False
        except Exception:
            return False
    return True

def _fuente_embebida_coincide(ext, basefont, nombre_ref, nombre_fuente, clave_objetivo, negrita, cursiva):
    """Determina si una fuente embebida completa (no subset) coincide con la fuente/estilo objetivo."""
    es_subset = bool(basefont and re.match(r"^[A-Z]{6}\+", basefont))
    if es_subset or ext == "n/a":
        return False
    _, clave_emb, emb_neg, emb_cur, _ = _extraer_info_nombre_fuente(basefont or "", 0)
    return bool(
        basefont == nombre_fuente
        or nombre_ref == nombre_fuente
        or (clave_objetivo and clave_emb == clave_objetivo and emb_neg == negrita and emb_cur == cursiva)
    )

def _buscar_fuente_embebida_completa(doc, page, nombre_fuente, clave_objetivo, negrita, cursiva):
    """Busca una fuente embebida NO-subset en el documento que coincida con nombre_fuente o clave_objetivo."""
    try:
        for f in page.get_fonts(full=True):
            xref, ext, tipo, basefont, nombre_ref, encoding = f[:6]
            if not _fuente_embebida_coincide(ext, basefont, nombre_ref, nombre_fuente, clave_objetivo, negrita, cursiva):
                continue
            try:
                _, extension, _, buffer_fuente = doc.extract_font(xref)
                if buffer_fuente and extension != "n/a":
                    font_emb = fitz.Font(fontbuffer=buffer_fuente)
                    if font_emb and not font_emb.flags.get("never-embed", 0):
                        return font_emb
            except Exception:
                continue
    except Exception:
        pass
    return None

def _seleccionar_mejor_fuente_por_glifos(entradas, faltantes):
    """Evalúa entradas de fuentes y retorna la primera con cobertura completa o la de mayor cobertura."""
    mejor_font = None
    mejor_score = 0
    total = len(faltantes)
    for entry in entradas:
        if not entry:
            continue
        f_cand = _cargar_objeto_fuente_ruta(entry["ruta"])
        if f_cand is None:
            continue
        score = sum(1 for ch in faltantes if f_cand.has_glyph(ord(ch)))
        if score == total:
            return f_cand
        if score > mejor_score:
            mejor_score = score
            mejor_font = f_cand
    return mejor_font

def _buscar_fuente_fallback_unicode(texto, font_primaria=None):
    """Encuentra una fuente del sistema/local con cobertura para los glifos ausentes en font_primaria."""
    faltantes = []
    for ch in (texto or ""):
        if ch in ("\n", "\r", "\t", " "):
            continue
        if font_primaria is None or not font_primaria.has_glyph(ord(ch)):
            if ch not in faltantes:
                faltantes.append(ch)
    if not faltantes:
        return None

    candidatos_claves = [
        ("segoeuisymbol", False, False),
        ("timesnewroman", False, False),
        ("liberationsans", False, False),
        ("dejavusans", False, False),
        ("msgothic", False, False),
        ("calibri", False, False),
        ("segoeui", False, False),
    ]
    indice = obtener_indice_fuentes()
    por_clave = indice["por_clave"]

    entradas = [por_clave.get(clave_c) for clave_c in candidatos_claves]
    entradas.extend(por_clave.values())
    return _seleccionar_mejor_fuente_por_glifos(entradas, faltantes)

def verificar_fuente_disponible(doc, page, nombre_fuente, flags=0):
    """Retorna True si existe fuente real (local, OS o embebida no-subset) para nombre_fuente."""
    _, clave, negrita, cursiva, _ = _extraer_info_nombre_fuente(nombre_fuente, flags)
    f_exact, _ = buscar_fuente_en_indice(clave, negrita, cursiva, permitir_fallback_variante=True)
    if f_exact is not None:
        return True
    if doc is not None and page is not None:
        f_emb = _buscar_fuente_embebida_completa(doc, page, nombre_fuente, clave, negrita, cursiva)
        if f_emb is not None:
            return True
    return False

def _buscar_fuente_primaria(doc, page, nombre_fuente, clave, negrita, cursiva):
    """Resuelve la fuente primaria en cascada: exacta (local/SO) -> equivalencia métrica -> embebida no-subset."""
    # 1. Coincidencia exacta (familia + variante) en recursos/fuentes/ o SO
    # Nota: para familias con variante única sin Italic (p.ej. Oswald/Caveat), permitir Regular si cursiva=True y not negrita,
    # o Bold si negrita=True y cursiva=True; y para familias *Black (bold=0 en TTF), permitir fallback a Regular.
    f_exact, _ = buscar_fuente_en_indice(
        clave, negrita, cursiva, permitir_fallback_variante=(not negrita)
    )
    if f_exact is None and negrita and cursiva:
        f_exact, _ = buscar_fuente_en_indice(clave, True, False, permitir_fallback_variante=False)
    if f_exact is None and negrita and clave.endswith("black"):
        f_exact, _ = buscar_fuente_en_indice(clave, False, cursiva, permitir_fallback_variante=True)
    if f_exact is not None:
        return f_exact

    # 2. Equivalencia métrica exacta en local/SO
    if clave in EQUIVALENCIAS_METRICAS:
        for eq_clave in EQUIVALENCIAS_METRICAS[clave]:
            f_eq, _ = buscar_fuente_en_indice(eq_clave, negrita, cursiva, permitir_fallback_variante=False)
            if f_eq is not None:
                return f_eq

    # 3. Fuente embebida no-subset en el documento
    if doc is not None and page is not None:
        return _buscar_fuente_embebida_completa(doc, page, nombre_fuente, clave, negrita, cursiva)

    return None

def resolver_fuente_completa(doc, page, nombre_fuente, flags, texto="", negrita_override=None, cursiva_override=None):
    """
    Resolución con prioridad invertida:
      1. Coincidencia exacta familia + variante en recursos/fuentes/ o fuentes del sistema.
      2. Equivalencia métrica exacta disponible localmente/sistema (Liberation, Arimo, Tinos, Carlito, Caladea, Cousine).
      3. Fuente embebida completa (no subset) en el documento.
      4. Base-14 (FUENTES_ESTANDAR) solo como último recurso o si faltan glifos básicos.
    Si la fuente elegida soporta el texto latino pero le faltan glifos especiales (p. ej. '₂'),
    devuelve ("mixta", (font_primaria, font_fallback)) para conservar la tipografía real.
    """
    _, clave, negrita, cursiva, _ = _extraer_info_nombre_fuente(nombre_fuente, flags)
    if negrita_override is not None:
        negrita = bool(negrita_override)
    if cursiva_override is not None:
        cursiva = bool(cursiva_override)

    familia_cls = clasificar_familia(nombre_fuente, flags)
    codigo_base14 = FUENTES_ESTANDAR[(familia_cls, negrita, cursiva)]
    font_builtin = cargar_fuente_builtin(codigo_base14)

    font_primaria = _buscar_fuente_primaria(doc, page, nombre_fuente, clave, negrita, cursiva)

    # 4. Base-14 como último recurso
    if font_primaria is None:
        if font_builtin is not None:
            font_primaria = font_builtin
        else:
            return ("base14", codigo_base14)

    # Verificar soporte de glifos del texto (con fallback mixto por carácter para '₂', '⁴', etc.)
    if _fuente_soporta_texto(font_primaria, texto):
        return ("sistema", font_primaria)

    font_fb = _buscar_fuente_fallback_unicode(texto, font_primaria=font_primaria)
    if font_fb is not None:
        return ("mixta", (font_primaria, font_fb))

    # Si tampoco hubo fallback y la fuente primaria era TTF sin glifos básicos, intentar Base-14
    if font_builtin is not None and font_primaria is not font_builtin and _fuente_soporta_texto(font_builtin, texto):
        return ("sistema", font_builtin)

    return ("sistema", font_primaria)

def _dividir_runs_mixtos(texto, font_primaria, font_fallback):
    """Divide texto en runs usando font_primaria para espacios y glifos soportados, y font_fallback para el resto."""
    runs = []
    cur_font = None
    cur_chars = []
    for ch in texto:
        if ch in (" ", "\t", "\n", "\r") or font_primaria.has_glyph(ord(ch)):
            fnt = font_primaria
        elif font_fallback is not None and font_fallback.has_glyph(ord(ch)):
            fnt = font_fallback
        else:
            fnt = font_primaria
        if fnt is cur_font:
            cur_chars.append(ch)
        else:
            if cur_chars:
                runs.append((cur_font, "".join(cur_chars)))
            cur_font = fnt
            cur_chars = [ch]
    if cur_chars:
        runs.append((cur_font, "".join(cur_chars)))
    return runs

def medir_texto(texto, fuente_info, tamano):
    if not texto:
        return 0.0
    tipo, valor = fuente_info
    if tipo == "mixta":
        f_prim, f_fb = valor
        return sum(fnt.text_length(s, fontsize=tamano) for fnt, s in _dividir_runs_mixtos(texto, f_prim, f_fb))
    if tipo == "sistema":
        return valor.text_length(texto, fontsize=tamano)
    return fitz.get_text_length(texto, fontname=valor, fontsize=tamano)

def _parchear_tounicode_espacio(page, font_xref, font_obj):
    """
    Corrige el bug de PyMuPDF con TTFs de Windows que mapean el glifo de espacio ASCII (0x20)
    a <00a0> en el stream /ToUnicode, evitando que get_text('text') extraiga '\xa0'.
    """
    try:
        doc = getattr(page, "parent", None)
        if doc is None or not font_xref or font_obj is None:
            return
        gid_sp = font_obj.has_glyph(32)
        if not gid_sp:
            return
        obj_str = doc.xref_object(font_xref)
        m = re.search(r"/ToUnicode\s+(\d+)\s+0\s+R", obj_str)
        if not m:
            return
        tu_xref = int(m.group(1))
        tu = doc.xref_stream(tu_xref).decode("latin1", errors="replace")
        gid_hex = f"<{gid_sp:04x}>"
        pat = re.compile(rf"({re.escape(gid_hex)})\s+<00[aA]0>", re.IGNORECASE)
        if pat.search(tu):
            tu_nuevo = pat.sub(r"\1 <0020>", tu, count=1)
            doc.update_stream(tu_xref, tu_nuevo.encode("latin1"))
    except Exception:
        pass

def _registrar_fuente_en_pagina(page, font_obj, mapa_fuentes=None):
    """Registra un fitz.Font en la página con nombre único, aplica parche /ToUnicode y devuelve fontname."""
    if mapa_fuentes is not None and id(font_obj) in mapa_fuentes:
        return mapa_fuentes[id(font_obj)]
    existentes = {f[4] for f in page.get_fonts(full=False) if len(f) > 4 and f[4]}
    idx = len(existentes) + (len(mapa_fuentes) if mapa_fuentes else 0)
    nombre_reg = f"LiraF{idx}"
    while nombre_reg in existentes:
        idx += 1
        nombre_reg = f"LiraF{idx}"
    xref = page.insert_font(fontname=nombre_reg, fontbuffer=font_obj.buffer)
    _parchear_tounicode_espacio(page, xref, font_obj)
    if mapa_fuentes is not None:
        mapa_fuentes[id(font_obj)] = nombre_reg
    return nombre_reg

def insertar_texto_con_fuente(page, punto, texto, fuente_info, tamano, color, mapa_fuentes=None):
    tipo, valor = fuente_info
    if tipo == "mixta":
        f_prim, f_fb = valor
        mapa = mapa_fuentes if mapa_fuentes is not None else {}
        x_cur = float(punto.x)
        y_cur = float(punto.y)
        for fnt, s in _dividir_runs_mixtos(texto, f_prim, f_fb):
            fname = _registrar_fuente_en_pagina(page, fnt, mapa)
            page.insert_text(
                fitz.Point(x_cur, y_cur),
                s,
                fontname=fname,
                fontsize=tamano,
                color=color,
            )
            x_cur += fnt.text_length(s, fontsize=tamano)
    elif tipo == "sistema":
        fname = _registrar_fuente_en_pagina(page, valor, mapa_fuentes)
        page.insert_text(
            punto,
            texto,
            fontname=fname,
            fontsize=tamano,
            color=color,
        )
    else:
        page.insert_text(
            punto,
            texto,
            fontname=valor,
            fontsize=tamano,
            color=color,
        )
