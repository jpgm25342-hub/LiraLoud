import os
import math
import fitz

from .comun import (
    asegurar_permiso_escritura,
    hex_to_rgb,
    normalizar_color,
    _guardar_documento_seguro,
    FUENTES_ESTANDAR,
)
from .fuentes import (
    limpiar_nombre_fuente,
    detectar_negrita_cursiva,
    verificar_fuente_disponible,
    resolver_fuente_completa,
    insertar_texto_con_fuente,
)
from .geometria import (
    _inspeccionar_spans_en_rect,
    obtener_origen_linea_original,
    _unir_spans_texto,
    _muestrear_color_fondo,
    _calcular_caja_disponible,
)
from .subrayados import _recopilar_rects_subrayados_antiguos
from .layout_texto import (
    _extraer_candidatos_subrayado,
    _extraer_candidatos_subrayado_detalle,
    _dividir_span_por_subrayados_rawdict,
    _normalizar_spans_entrada,
    _ajustar_y_renderizar_texto,
)

def _construir_bloque_ocr(l_idx, x0, y0, x1, y1, texto_linea, tamano_est):
    return {
        "id": f"ocr-line-{l_idx}",
        "bbox": [x0, y0, x1, y1],
        "texto": texto_linea,
        "fuente": "helv",
        "fuente_limpia": "Helvetica",
        "fuente_disponible": False,
        "flags": 0,
        "tamano": tamano_est,
        "color": [0, 0, 0],
        "is_ocr": True,
        "spans": [
            {
                "texto": texto_linea,
                "fuente": "helv",
                "fuente_limpia": "Helvetica",
                "tamano": tamano_est,
                "color": [0, 0, 0],
                "negrita": False,
                "cursiva": False,
                "subrayado": False,
            }
        ],
    }


def _construir_bloques_desde_palabras_ocr(palabras_ocr):
    """Agrupa palabras OCR por línea y construye los bloques editables equivalentes."""
    bloques = []
    if not palabras_ocr:
        return bloques
    lineas_dict = {}
    for p in palabras_ocr:
        l_idx = p[6] if len(p) > 6 else p[5]
        if l_idx not in lineas_dict:
            lineas_dict[l_idx] = []
        lineas_dict[l_idx].append(p)

    for l_idx, words in sorted(lineas_dict.items(), key=lambda item: item[0]):
        if not words:
            continue
        words_sorted = sorted(words, key=lambda w: w[0])
        x0 = min(w[0] for w in words_sorted)
        y0 = min(w[1] for w in words_sorted)
        x1 = max(w[2] for w in words_sorted)
        y1 = max(w[3] for w in words_sorted)
        texto_linea = " ".join(str(w[4]) for w in words_sorted).strip()

        if texto_linea:
            alto_linea = max(8.0, y1 - y0)
            tamano_est = round(alto_linea * 0.8, 1)
            bloques.append(_construir_bloque_ocr(l_idx, x0, y0, x1, y1, texto_linea, tamano_est))
    return bloques


def _expandir_spans_linea_rawdict(raw_spans, linea_bbox, candidatos_subrayado):
    """Expande spans rawdict dividiendo por subrayados y recortando espacios puros extremos."""
    linea_max_size = max(
        (float(s.get("size", 10.0) or 10.0) for s in raw_spans),
        default=10.0,
    )
    spans_para_unir = []
    spans_detalle = []

    for sp in raw_spans:
        sp_font = sp.get("font", "helv")
        sp_flags = int(sp.get("flags", 0) or 0)
        sp_size = float(sp.get("size", 10.0) or 10.0)
        sp_color_int = sp.get("color")
        if sp_color_int is None:
            sp_color_int = 0
        sp_color_pdf = list(fitz.sRGB_to_pdf(sp_color_int))
        sp_neg, sp_cur = detectar_negrita_cursiva(sp_font, sp_flags)
        sp_fam_limpia = limpiar_nombre_fuente(sp_font)

        for sub_txt, sub_ul, sub_bb in _dividir_span_por_subrayados_rawdict(
            sp, candidatos_subrayado, linea_bbox=linea_bbox, linea_max_size=linea_max_size
        ):
            if not sub_txt:
                continue
            spans_para_unir.append({
                "text": sub_txt,
                "bbox": sub_bb,
                "size": sp_size,
                "font": sp_font,
                "flags": sp_flags,
                "color": sp_color_int,
            })
            spans_detalle.append({
                "texto": sub_txt,
                "fuente": sp_font,
                "fuente_limpia": sp_fam_limpia,
                "tamano": sp_size,
                "color": sp_color_pdf,
                "negrita": sp_neg,
                "cursiva": sp_cur,
                "subrayado": sub_ul,
            })

    # Limpiar spans de espacio puro al final/inicio (artefactos ArialMT de Google Docs)
    while len(spans_detalle) > 1 and not spans_detalle[-1]["texto"].strip():
        spans_detalle.pop()
        spans_para_unir.pop()
    while len(spans_detalle) > 1 and not spans_detalle[0]["texto"].strip():
        spans_detalle.pop(0)
        spans_para_unir.pop(0)

    return spans_para_unir, spans_detalle


def _construir_bloque_linea_nativa(doc, page, l, candidatos_subrayado, contador):
    """Normaliza los spans de una línea rawdict y construye su bloque editable, o None si queda vacía."""
    spans_para_unir, spans_detalle = _expandir_spans_linea_rawdict(
        l.get("spans", []), l.get("bbox"), candidatos_subrayado
    )

    texto_limpio = _unir_spans_texto(spans_para_unir)
    if not texto_limpio:
        return None

    spans_no_vacios = [s for s in spans_para_unir if (s.get("text") or "").strip()]
    span_dom = max(
        spans_no_vacios,
        key=lambda s: len((s.get("text") or "").strip()),
    ) if spans_no_vacios else spans_para_unir[0]

    fuente_base = span_dom.get("font", "helv")
    tamano_base = float(span_dom.get("size", 10.0) or 10.0)
    color_base = span_dom.get("color")
    if color_base is None:
        color_base = 0
    flags_base = int(span_dom.get("flags", 0) or 0)

    x0, y0, x1, y1 = l.get("bbox")
    color_pdf = list(fitz.sRGB_to_pdf(color_base))
    fuente_limpia_dom = limpiar_nombre_fuente(fuente_base)
    fuente_disp_dom = verificar_fuente_disponible(doc, page, fuente_base, flags_base)

    return {
        "id": f"line-{contador}",
        "bbox": [x0, y0, x1, y1],
        "texto": texto_limpio,
        "fuente": fuente_base,
        "fuente_limpia": fuente_limpia_dom,
        "fuente_disponible": fuente_disp_dom,
        "flags": flags_base,
        "tamano": tamano_base,
        "color": color_pdf,
        "is_ocr": False,
        "spans": spans_detalle,
    }


def _extraer_bloques_texto_nativo(doc, page):
    """Extrae y normaliza los bloques editables de texto vectorial nativo (rawdict) de una página."""
    bloques = []
    data_raw = page.get_text("rawdict")
    candidatos_subrayado = _extraer_candidatos_subrayado(page)
    contador = 0
    for b in data_raw.get("blocks", []):
        if b.get("type") != 0:
            continue
        for l in b.get("lines", []):
            bloque = _construir_bloque_linea_nativa(doc, page, l, candidatos_subrayado, contador)
            if bloque is not None:
                bloques.append(bloque)
                contador += 1

    return bloques


def _recolectar_bloques_pagina(doc, page, doc_path, pagina_idx):
    """Extrae bloques de texto de la página priorizando caché OCR, luego texto nativo y OCR bajo demanda."""
    from backend.documento.ocr_engine import esta_en_cache_ocr, obtener_palabras_cache_ocr
    es_pagina_ocr = esta_en_cache_ocr(doc_path, pagina_idx)
    bloques = []

    if es_pagina_ocr:
        palabras_ocr = obtener_palabras_cache_ocr(doc_path, pagina_idx)
        bloques.extend(_construir_bloques_desde_palabras_ocr(palabras_ocr))

    if not es_pagina_ocr or len(bloques) == 0:
        bloques.extend(_extraer_bloques_texto_nativo(doc, page))
        if len(bloques) == 0:
            pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
            from backend.documento.ocr_engine import procesar_ocr_pagina
            palabras_ocr = procesar_ocr_pagina(
                pixmap_bytes=pix.tobytes("png"),
                ancho_pdf=page.rect.width,
                alto_pdf=page.rect.height,
                ancho_px=pix.width,
                alto_px=pix.height,
                doc_path=doc_path,
                num_pagina=pagina_idx,
                forzar=False,
            )
            bloques.extend(_construir_bloques_desde_palabras_ocr(palabras_ocr))
    return bloques


def obtener_bloques_texto_pagina(pdf_path, pagina_idx, doc_obj=None):
    if not doc_obj and not os.path.exists(pdf_path):
        return {"success": False, "error": "Documento no encontrado."}

    doc = None
    try:
        doc = doc_obj if doc_obj else fitz.open(pdf_path)
        page = doc[pagina_idx]
        doc_path = getattr(doc, "name", pdf_path) or pdf_path
        bloques = _recolectar_bloques_pagina(doc, page, doc_path, pagina_idx)

        if not doc_obj and not getattr(doc, "is_closed", False):
            doc.close()
        return {"success": True, "bloques": bloques}
    except Exception as e:
        print(f"Error obteniendo bloques de texto: {e}")
        return {"success": False, "error": str(e)}
    finally:
        if not doc_obj and doc is not None and not getattr(doc, "is_closed", False):
            try:
                doc.close()
            except Exception:
                pass


def _resolver_tipografia_edicion(datos, span_dom):
    """Resuelve fuente, flags, tamaño y color normalizado combinando datos de entrada y span dominante."""
    fuente_original = datos.get('fuente') or (span_dom.get('font') if span_dom else 'helv')
    if datos.get('flags') is not None:
        flags_original = int(datos['flags'])
    else:
        flags_original = int(span_dom.get('flags', 0)) if span_dom else 0

    tam_default = float(span_dom.get('size', 10.0)) if span_dom else 10.0
    raw_tam = datos.get('tamano')
    tam_f = float(raw_tam) if (raw_tam is not None and raw_tam != "") else tam_default
    if not math.isfinite(tam_f):
        tam_f = tam_default
    tamano = max(4.0, tam_f)

    color_src = datos['color'] if datos.get('color') is not None else (span_dom.get('color', 0) if span_dom else 0)
    color = normalizar_color(color_src)
    return fuente_original, flags_original, tamano, color


def _preparar_edicion_texto(page, datos):
    """Inspecciona los spans originales y resuelve parámetros tipográficos antes de mutar el PDF."""
    raw_bbox = datos['bbox']
    bbox_original = datos.get('bbox_original') or raw_bbox
    raw_spans = datos.get('spans')
    raw_texto = datos.get('texto', None)
    if raw_texto is None and isinstance(raw_spans, list):
        raw_texto = "".join(str(sp.get("texto", "") or "") for sp in raw_spans if isinstance(sp, dict))
    nuevo_texto = "" if raw_texto is None else str(raw_texto).replace("\xa0", " ").replace("\t", " ")

    rect_original = fitz.Rect(bbox_original).normalize()
    rect_deseado = fitz.Rect(raw_bbox).normalize()

    # 0. Inspeccionar spans originales ANTES de redactar
    tiene_vector, origen_original, span_dom, rects_redact = _inspeccionar_spans_en_rect(page, rect_original)
    if origen_original is None:
        origen_original = obtener_origen_linea_original(page, tuple(rect_original))
    rects_subrayados_viejos = (
        _recopilar_rects_subrayados_antiguos(page, rect_original, rects_redact) if tiene_vector else []
    )

    fuente_original, flags_original, tamano, color = _resolver_tipografia_edicion(datos, span_dom)

    return {
        "raw_bbox": raw_bbox,
        "bbox_original": bbox_original,
        "raw_spans": raw_spans,
        "nuevo_texto": nuevo_texto,
        "rect_original": rect_original,
        "rect_deseado": rect_deseado,
        "tiene_vector": tiene_vector,
        "origen_original": origen_original,
        "rects_redact": rects_redact,
        "rects_subrayados_viejos": rects_subrayados_viejos,
        "fuente_original": fuente_original,
        "flags_original": flags_original,
        "tamano": tamano,
        "color": color,
    }


def _aplicar_reflow_y_renderizar_texto(doc, page, prep):
    """Normaliza spans (si existen), calcula la caja disponible y renderiza el texto actualizado."""
    raw_spans = prep["raw_spans"]
    nuevo_texto = prep["nuevo_texto"]
    fuente_original = prep["fuente_original"]
    flags_original = prep["flags_original"]
    tamano = prep["tamano"]
    color = prep["color"]

    spans_norm = None
    if isinstance(raw_spans, list) and len(raw_spans) > 0:
        spans_norm = _normalizar_spans_entrada(
            doc, page, raw_spans, fuente_original, flags_original, tamano, color
        )
        if spans_norm:
            nuevo_texto = "".join(sp["texto"] for sp in spans_norm)

    if nuevo_texto.strip():
        tam_caja = max(sp["tamano"] for sp in spans_norm) if spans_norm else tamano
        rect_caja = _calcular_caja_disponible(
            page, prep["rect_original"], prep["rect_deseado"], prep["origen_original"], tam_caja
        )
        fuente_info = None
        if not spans_norm:
            fuente_info = resolver_fuente_completa(
                doc, page, fuente_original, flags_original, texto=nuevo_texto
            )
        _ajustar_y_renderizar_texto(
            page, rect_caja, prep["rect_original"], prep["origen_original"],
            nuevo_texto, fuente_info, tamano, color,
            spans_config=spans_norm,
        )

    return nuevo_texto


def _limpiar_area_texto_original(page, datos, prep):
    """Borra quirúrgicamente el texto y subrayados previos, y cubre fondo solo en regiones OCR/imagen."""
    rect_original = prep["rect_original"]
    tiene_vector = prep["tiene_vector"]
    rects_redact = prep["rects_redact"]
    rects_subrayados_viejos = prep["rects_subrayados_viejos"]

    # 1. Borrado quirúrgico sin destruir vectores ni imágenes ni fondo de celda
    for r_red in rects_redact:
        page.add_redact_annot(r_red, fill=None)
    page.apply_redactions(
        images=fitz.PDF_REDACT_IMAGE_NONE,
        graphics=fitz.PDF_REDACT_LINE_ART_NONE,
    )

    # Eliminar únicamente líneas de subrayado propias del texto reemplazado (manteniendo bordes y rellenos)
    if rects_subrayados_viejos:
        for r_ul in rects_subrayados_viejos:
            page.add_redact_annot(r_ul, fill=None)
        page.apply_redactions(
            text=fitz.PDF_REDACT_TEXT_NONE,
            images=fitz.PDF_REDACT_IMAGE_NONE,
            graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
        )

    # Solo cubrir píxeles con rectángulo de fondo si el área es OCR/imagen (sin texto vectorial nativo)
    if (not tiene_vector) or bool(datos.get("is_ocr", False)) or str(datos.get("id", "")).startswith("ocr-line-"):
        bg_color = _muestrear_color_fondo(page, rect_original)
        page.draw_rect(rect_original, color=None, fill=bg_color, width=0)


def editar_texto_pdf(pdf_path, pagina_idx, datos, doc_obj=None):
    asegurar_permiso_escritura(pdf_path)
    if not doc_obj and not os.path.exists(pdf_path):
        return {"success": False, "error": "Documento no encontrado."}

    doc = None
    try:
        doc = doc_obj if doc_obj else fitz.open(pdf_path)
        page = doc[pagina_idx]

        prep = _preparar_edicion_texto(page, datos)
        raw_bbox = prep["raw_bbox"]
        bbox_original = prep["bbox_original"]

        # 1. Borrado quirúrgico del texto/subrayados previos
        _limpiar_area_texto_original(page, datos, prep)

        # 2. Reflow inteligente y fidelidad tipográfica (simple o multi-span)
        nuevo_texto = _aplicar_reflow_y_renderizar_texto(doc, page, prep)

        # 3. Actualizar la caché OCR para mantener sincronía con el lector/karaoke
        try:
            doc_path = getattr(doc, "name", pdf_path) or pdf_path
            from backend.documento.ocr_engine import actualizar_linea_cache_ocr
            actualizar_linea_cache_ocr(doc_path, pagina_idx, datos.get('id', ''), bbox_original, nuevo_texto, raw_bbox)
        except Exception as ocr_err:
            print(f"Nota: No se actualizó caché OCR tras edición: {ocr_err}")

        # 4. Guardado seguro
        res_guardado = _guardar_documento_seguro(doc, pdf_path, doc_obj)
        if not doc_obj and not getattr(doc, "is_closed", False):
            doc.close()
        return res_guardado
    except Exception as e:
        print(f"Error editando texto: {e}")
        return {"success": False, "error": str(e)}
    finally:
        if not doc_obj and doc is not None and not getattr(doc, "is_closed", False):
            try:
                doc.close()
            except Exception:
                pass


def _resolver_estilo_freetext(config_fuente):
    """Mapea la configuración de fuente del usuario a (fontname base-14, tamano, text_color)."""
    familia_raw = config_fuente.get("fuente", "helv").lower()
    negrita = config_fuente.get("negrita", False)
    cursiva = config_fuente.get("cursiva", False)
    color_hex = config_fuente.get("color", "#000000")

    if "mono" in familia_raw or "courier" in familia_raw or "consolas" in familia_raw:
        familia = "mono"
    elif "serif" in familia_raw or "times" in familia_raw or "georgia" in familia_raw or "roman" in familia_raw:
        familia = "serif"
    else:
        familia = "sans"

    fontname = FUENTES_ESTANDAR[(familia, negrita, cursiva)]
    tamano = config_fuente.get("tamano", 16)
    text_color = hex_to_rgb(color_hex)
    return fontname, tamano, text_color


def agregar_anotacion_freetext(pdf_path, pagina_idx, bbox, texto, config_fuente, doc_obj=None):
    """
    Crea una anotación FreeText (Cuadro de texto flotante interactivo) en la posición especificada.
    bbox: [x0, y0, x1, y1] en puntos PDF
    config_fuente: dict con fuente, tamano, color, negrita, cursiva
    """
    asegurar_permiso_escritura(pdf_path)
    if not doc_obj and not os.path.exists(pdf_path):
        return {"success": False, "error": "Documento no encontrado."}
    
    try:
        doc = doc_obj if doc_obj else fitz.open(pdf_path)
        page = doc[pagina_idx]
        
        rect = fitz.Rect(bbox)
        fontname, tamano, text_color = _resolver_estilo_freetext(config_fuente)
        
        annot = page.add_freetext_annot(
            rect,
            texto,
            fontsize=tamano,
            fontname=fontname,
            text_color=text_color,
            fill_color=None # transparente para pintar por encima (overlay)
        )
        
        annot.update()
        
        try:
            doc.saveIncr()
        except Exception as err:
            if "incremental writes" in str(err) or "repaired" in str(err):
                return {"success": False, "error": "NEEDS_FULL_SAVE"}
            raise err
            
        if not doc_obj:
            doc.close()
            
        return {"success": True}
    except Exception as e:
        print(f"Error creando anotación FreeText: {e}")
        return {"success": False, "error": str(e)}
