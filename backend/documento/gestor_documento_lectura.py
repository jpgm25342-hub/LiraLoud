# LiraLoud - Extracción tipográfica/OCR, filtrado espacial y segmentación de páginas para lectura
import os
import re
import pymupdf as fitz

from backend.core.webview_bridge import puente_webview
from backend.core.estado_global import estado_app
from backend.core.gestor_archivos import cargar_ajustes_lectura
from backend.core.logger_config import logger
from backend.documento.layout_engine import analizar_layout_pagina
from backend.documento.ocr_engine import (
    procesar_ocr_pagina,
    esta_en_cache_ocr,
    obtener_palabras_cache_ocr,
    es_ocr_alta_precision,
    renderizar_pixmap_ocr,
)
from backend.documento.procesador_texto import (
    organizar_palabras_con_cortes_y_limites,
    procesar_oraciones_de_palabras,
    aplicar_reemplazos,
)
from backend.documento.gestor_documento_layout_rpc import (
    _guardar_cache_layout_disco,
    _resolver_layout_pagina_con_cache,
)


def _clasificar_script_span(sp, sy1, s_linea, b_linea, baseline_fn):
    """Clasifica un span de línea como superíndice ('sup'), subíndice ('sub') o normal (None)."""
    s_span = float(sp.get("size", s_linea) or s_linea)
    b_span = baseline_fn(sp, sy1)
    flags = int(sp.get("flags", 0) or 0)
    if (flags & 1) or (s_linea > 0 and (s_span / s_linea) <= 0.82 and ((b_linea - b_span) / s_linea) > 0.18):
        return "sup"
    if s_linea > 0 and (s_span / s_linea) <= 0.82 and ((b_span - b_linea) / s_linea) > 0.12:
        return "sub"
    return None

def _extraer_palabras_de_linea(line, b_idx, l_idx, statistics_mod):
    """Extrae tuplas de palabras con clasificación tipográfica ('sup'/'sub'/None) desde una línea de dict."""
    spans = [s for s in line.get("spans", []) if (s.get("text") or "").strip()]
    if not spans:
        return []

    def _baseline_span(sp, fallback_y):
        origin = sp.get("origin")
        if isinstance(origin, (list, tuple)) and len(origin) >= 2:
            return float(origin[1])
        return float(fallback_y)

    sizes = [float(s.get("size", 10.0) or 10.0) for s in spans]
    baselines = [_baseline_span(s, s.get("bbox", [0, 0, 0, 0])[3]) for s in spans]
    s_linea = statistics_mod.median(sizes) if sizes else 10.0
    b_linea = statistics_mod.median(baselines) if baselines else 0.0

    palabras_linea = []
    w_idx = 0
    for sp in spans:
        txt_sp = sp.get("text", "")
        bbox = sp.get("bbox", (0, 0, 0, 0))
        sx0, sy0, sx1, sy1 = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
        tipo_script = _clasificar_script_span(sp, sy1, s_linea, b_linea, _baseline_span)

        total_len = max(1, len(txt_sp))
        span_w = max(0.0, sx1 - sx0)
        for m in re.finditer(r"\S+", txt_sp):
            tok = m.group(0)
            wx0 = sx0 + (m.start() / total_len) * span_w
            wx1 = sx0 + (m.end() / total_len) * span_w
            palabras_linea.append((wx0, sy0, wx1, sy1, tok, b_idx, l_idx, w_idx, tipo_script))
            w_idx += 1

    return palabras_linea

def _extraer_palabras_con_tipografia(pagina, sort=False):
    """Extrae palabras con bbox y clasificación tipográfica ('sup', 'sub' o None) desde get_text('dict')."""
    import statistics

    dic = pagina.get_text("dict")
    palabras = []
    for b_idx, block in enumerate(dic.get("blocks", [])):
        if block.get("type", 0) != 0:
            continue
        for l_idx, line in enumerate(block.get("lines", [])):
            palabras.extend(_extraer_palabras_de_linea(line, b_idx, l_idx, statistics))

    if sort and palabras:
        palabras.sort(key=lambda p: (round(p[1], 1), p[0]))
    return palabras

def _obtener_palabras_pagina_con_ocr(
    pagina,
    num,
    doc_path,
    zoom,
    pix,
    ajustes_json,
    es_texto_escrito,
    usar_sort,
    forzar_ocr,
    auto_ocr,
):
    """Extrae palabras digitales o ejecuta RapidOCR (forzado, caché o auto-OCR) sin duplicar el flujo OCR."""
    def _notificar_ocr_ui(metodo_nombre):
        try:
            puente_webview.evaluar_js_seguro(metodo_nombre, num)
        except Exception:
            pass

    def _ejecutar_rapidocr(forzar_flag):
        nonlocal pix
        _notificar_ocr_ui("notificar_inicio_ocr_pagina")
        if es_ocr_alta_precision():
            pix_ocr = renderizar_pixmap_ocr(pagina, alta_precision=True)
        else:
            if pix is None:
                pix = pagina.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            pix_ocr = pix
        pix_bytes = pix_ocr.tobytes("png")
        try:
            return procesar_ocr_pagina(
                pixmap_bytes=pix_bytes,
                ancho_pdf=pagina.rect.width,
                alto_pdf=pagina.rect.height,
                ancho_px=pix_ocr.width,
                alto_px=pix_ocr.height,
                doc_path=doc_path,
                num_pagina=num,
                forzar=forzar_flag,
            )
        finally:
            _notificar_ocr_ui("notificar_fin_ocr_pagina")

    if forzar_ocr:
        print(f"🔍 [PY] Forzando RapidOCR en página {num}...")
        return _ejecutar_rapidocr(True)

    palabras_raw = _extraer_palabras_con_tipografia(pagina, sort=usar_sort)
    auto_ocr_activo = (
        False
        if es_texto_escrito
        else (auto_ocr if auto_ocr is not None else ajustes_json.get("auto_ocr", True))
    )
    esta_cacheador = False if es_texto_escrito else esta_en_cache_ocr(doc_path, num)

    if len(palabras_raw) == 0 or esta_cacheador:
        if esta_cacheador:
            palabras_ocr = obtener_palabras_cache_ocr(doc_path, num)
            if palabras_ocr:
                palabras_raw = palabras_ocr
        elif auto_ocr_activo and len(palabras_raw) == 0:
            print(
                f"🔍 [PY] Página {num} sin texto digital detectado (0 palabras) y Auto-OCR activo. Activando RapidOCR..."
            )
            palabras_ocr = _ejecutar_rapidocr(False)
            if palabras_ocr:
                palabras_raw = palabras_ocr

    return palabras_raw

def _tiene_limites_horizontales_activos(limites_h, alto_pagina):
    """Indica si algún límite horizontal del diccionario recorta la altura útil de la página."""
    if not isinstance(limites_h, dict):
        return False
    for lim in limites_h.values():
        if isinstance(lim, (list, tuple)) and len(lim) >= 2:
            if lim[0] > 5 or lim[1] < (alto_pagina - 5):
                return True
    return False

def _calcular_banderas_y_guardar_layout_pagina(
    doc, pagina, num, es_texto_escrito, lista_cortes_v, limites_h, zonas_excluidas
):
    """Calcula banderas de cortes/límites activos y sincroniza el layout de la página en estado_app."""
    tiene_cortes_v = bool(lista_cortes_v)
    tiene_limites_h = _tiene_limites_horizontales_activos(limites_h, pagina.rect.height)
    usar_sort = not tiene_cortes_v and not tiene_limites_h
    if not es_texto_escrito:
        prev_lay = estado_app.layouts_por_pagina.get(int(num)) or {}
        doc_key_cur = getattr(doc, "name", "") or "doc"
        est_actual = estado_app.cache_estructura_layout.get((doc_key_cur, int(num))) or prev_lay.get("estructura")
        estado_app.layouts_por_pagina[int(num)] = {
            "cortesV": list(lista_cortes_v) if lista_cortes_v else [],
            "limitesH": dict(limites_h) if isinstance(limites_h, dict) else {},
            "zonasExcluidas": list(zonas_excluidas) if zonas_excluidas else [],
            "estructura": est_actual,
        }
    return tiene_cortes_v, tiene_limites_h, usar_sort

def _segmentar_y_filtrar_oraciones_pagina(doc, num, palabras_raw, dict_activo, filtros_ui):
    """Resuelve estructura IA de la página, segmenta oraciones raw y aplica filtros de lectura."""
    est_ia = None
    try:
        doc_key = getattr(doc, "name", "") or "doc"
        est_ia = estado_app.cache_estructura_layout.get((doc_key, int(num)))
        if est_ia is None and int(num) in estado_app.layouts_por_pagina:
            est_ia = estado_app.layouts_por_pagina[int(num)].get("estructura")
            if est_ia is not None:
                estado_app.cache_estructura_layout[(doc_key, int(num))] = est_ia
    except Exception:
        est_ia = None

    estado_app.snapshot_oraciones_raw = procesar_oraciones_de_palabras(
        palabras_raw, None, estructura_ia=est_ia
    )

    procesadas = []
    for oracion in estado_app.snapshot_oraciones_raw:
        texto_crudo = " ".join([p["texto"] for p in oracion["palabras"]])
        pack = aplicar_reemplazos(texto_crudo, dict_activo, filtros_ui)
        texto_final = pack[0] if isinstance(pack, tuple) else pack
        procesadas.append(
            {
                "texto": texto_final,
                "rects": oracion["rects"],
                "palabras": oracion["palabras"],
            }
        )
    return procesadas

def _filtrar_y_organizar_palabras_pagina(
    palabras_raw,
    zonas_excluidas,
    recorte_pdf,
    kwargs,
    ajustes_json,
    tiene_cortes_v,
    tiene_limites_h,
    lista_cortes_v,
    limites_h,
    pagina,
):
    """Aplica exclusiones, recorte de márgenes y ordenamiento por cortes/límites a `palabras_raw`."""
    if zonas_excluidas and isinstance(zonas_excluidas, (list, tuple)):
        palabras_raw = _filtrar_palabras_por_exclusiones(palabras_raw, zonas_excluidas)

    recorte_val = (
        recorte_pdf
        if recorte_pdf is not None
        else (kwargs.get("recorte_pdf", None) if kwargs else None)
    )
    if recorte_val is None:
        recorte_val = ajustes_json.get("recortePDF", 0)
    palabras_raw = _filtrar_palabras_por_recorte(
        palabras_raw, recorte_val, pagina.rect.width, pagina.rect.height
    )

    palabras_sin_organizar = list(palabras_raw)
    if tiene_cortes_v or tiene_limites_h:
        palabras_raw = organizar_palabras_con_cortes_y_limites(
            palabras_raw,
            lista_cortes_v,
            limites_h,
            pagina.rect.width,
            pagina.rect.height,
        )
    return palabras_raw, palabras_sin_organizar

def _palabra_en_exclusion(p, zonas):
    cx = (p[0] + p[2]) / 2.0
    cy = (p[1] + p[3]) / 2.0
    for z in zonas:
        if isinstance(z, (list, tuple)) and len(z) >= 4:
            x0 = min(z[0], z[2])
            x1 = max(z[0], z[2])
            y0 = min(z[1], z[3])
            y1 = max(z[1], z[3])
            if x0 <= cx <= x1 and y0 <= cy <= y1:
                return True
            ix0 = max(p[0], x0)
            iy0 = max(p[1], y0)
            ix1 = min(p[2], x1)
            iy1 = min(p[3], y1)
            if ix1 > ix0 and iy1 > iy0:
                area_inter = (ix1 - ix0) * (iy1 - iy0)
                area_palabra = max(1.0, (p[2] - p[0]) * (p[3] - p[1]))
                if (area_inter / area_palabra) >= 0.35:
                    return True
    return False

def _filtrar_palabras_por_exclusiones(palabras_raw, zonas_excluidas):
    if not zonas_excluidas or not isinstance(zonas_excluidas, (list, tuple)):
        return palabras_raw
    return [p for p in palabras_raw if not _palabra_en_exclusion(p, zonas_excluidas)]

def _filtrar_palabras_por_recorte(palabras_raw, recorte_val, ancho_pagina, alto_pagina):
    try:
        recorte_int = int(recorte_val)
    except Exception:
        recorte_int = 0
    if recorte_int <= 0 or not palabras_raw:
        return palabras_raw
    crop_h = (float(recorte_int) / 100.0) * ancho_pagina * 0.20
    crop_v = (float(recorte_int) / 100.0) * alto_pagina * 0.12
    x_min_visible = crop_h
    x_max_visible = ancho_pagina - crop_h
    y_min_visible = crop_v
    y_max_visible = alto_pagina - crop_v
    return [
        p
        for p in palabras_raw
        if (x_min_visible <= (p[0] + p[2]) / 2.0 <= x_max_visible)
        and (y_min_visible <= (p[1] + p[3]) / 2.0 <= y_max_visible)
    ]

def _obtener_layout_pagina_para_lectura(doc, num, doc_key, es_texto_escrito, layout_pagina, auto_layout):
    """Obtiene el diccionario de layout desde argumento, caché en memoria o DocLayout-YOLO."""
    if es_texto_escrito:
        return None
    if isinstance(layout_pagina, dict):
        return layout_pagina
    if int(num) in estado_app.layouts_por_pagina:
        return estado_app.layouts_por_pagina.get(int(num))
    if not auto_layout:
        return None
    try:
        res_ia = analizar_layout_pagina(doc, int(num))
        if isinstance(res_ia, dict) and res_ia.get("exito"):
            estado_app.cache_estructura_layout[(doc_key, int(num))] = res_ia.get("estructura")
            layout = {
                "cortesV": res_ia.get("cortesV") or [],
                "limitesH": res_ia.get("limitesH") or {},
                "zonasExcluidas": res_ia.get("zonasExcluidas") or [],
            }
            estado_app.layouts_por_pagina[int(num)] = layout
            return layout
    except Exception:
        return None
    return None

def _resolver_layout_pagina_ligera(doc, pagina, num, doc_key, es_texto_escrito, layout_pagina, auto_layout):
    """Resuelve layout, cortes verticales, límites horizontales, zonas excluidas y bandera usar_sort."""
    layout = _obtener_layout_pagina_para_lectura(
        doc, num, doc_key, es_texto_escrito, layout_pagina, auto_layout
    )

    lista_cortes_v = (layout.get("cortesV") or []) if isinstance(layout, dict) else []
    limites_h = (layout.get("limitesH") or {}) if isinstance(layout, dict) else {}
    zonas_excluidas = (layout.get("zonasExcluidas") or []) if isinstance(layout, dict) else []

    tiene_cortes_v = bool(lista_cortes_v)
    tiene_limites_h = _tiene_limites_horizontales_activos(limites_h, pagina.rect.height)
    usar_sort = not tiene_cortes_v and not tiene_limites_h
    return lista_cortes_v, limites_h, zonas_excluidas, tiene_cortes_v, tiene_limites_h, usar_sort

def _extraer_y_filtrar_palabras_ligera(
    doc,
    pagina,
    num,
    es_texto_escrito,
    lista_cortes_v,
    limites_h,
    zonas_excluidas,
    tiene_cortes_v,
    tiene_limites_h,
    usar_sort,
):
    """Extrae palabras de una página en modo ligero (con fallback OCR en caché, exclusiones, recorte y cortes)."""
    palabras_raw = _extraer_palabras_con_tipografia(pagina, sort=usar_sort)
    if len(palabras_raw) == 0 and not es_texto_escrito:
        doc_path = getattr(doc, "name", "doc_actual")
        if esta_en_cache_ocr(doc_path, num):
            palabras_ocr = obtener_palabras_cache_ocr(doc_path, num)
            if not palabras_ocr:
                pix = renderizar_pixmap_ocr(pagina)
                palabras_ocr = procesar_ocr_pagina(
                    pixmap_bytes=pix.tobytes("png"),
                    ancho_pdf=pagina.rect.width,
                    alto_pdf=pagina.rect.height,
                    ancho_px=pix.width,
                    alto_px=pix.height,
                    doc_path=doc_path,
                    num_pagina=num,
                    forzar=False,
                )
            if palabras_ocr:
                palabras_raw = palabras_ocr

    if not es_texto_escrito and zonas_excluidas:
        palabras_raw = _filtrar_palabras_por_exclusiones(palabras_raw, zonas_excluidas)

    ajustes_json = cargar_ajustes_lectura()
    recorte_val = ajustes_json.get("recortePDF", 0)
    palabras_raw = _filtrar_palabras_por_recorte(
        palabras_raw, recorte_val, pagina.rect.width, pagina.rect.height
    )

    if not es_texto_escrito and (tiene_cortes_v or tiene_limites_h):
        palabras_raw = organizar_palabras_con_cortes_y_limites(
            palabras_raw,
            lista_cortes_v,
            limites_h,
            pagina.rect.width,
            pagina.rect.height,
        )
    return palabras_raw
