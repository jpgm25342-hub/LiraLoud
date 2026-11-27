import os
import ast
import cv2
import numpy as np
import onnxruntime as ort
import pymupdf as fitz
from backend.core.estado_global import estado_app
from backend.core.logger_config import logger
from backend.documento.layout_cortes import (  # noqa: F401
    _calcular_semillas_verticales_corte,
    _palabras_en_corredor_vertical,
    _proyectar_corte_raycasting,
    _buscar_candidatos_corte_histograma,
    _es_candidato_corte_yolo_valido,
    _detectar_cortes_yolo_raycasting,
    _banda_separa_columnas,
    _evaluar_bandas_corte_palabras,
    _buscar_brechas_palabras_histograma,
    _detectar_cortes_por_palabras,
    _filtrar_palabras_utiles_horizontales,
    _calcular_limites_horizontales,
)

_MODELO_REL = os.path.join("layout_models", "doclayout_yolo_docstructbench_imgsz1024.onnx")
MODELO_PATH = (
    os.path.join(estado_app.base_dir, _MODELO_REL)
    if os.path.exists(os.path.join(estado_app.base_dir, _MODELO_REL))
    else os.path.join(estado_app.bundle_dir, _MODELO_REL)
)

_session = None
_names = None
_stride = 32

def get_session():
    global _session, _names, _stride
    if _session is None:
        if not os.path.exists(MODELO_PATH):
            logger.warning(f"[DOCLAYOUT] Modelo no encontrado en {MODELO_PATH}")
            return None, None, 32
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 4
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        logger.info(f"[DOCLAYOUT] Cargando sesión ONNX DocLayout-YOLO...")
        _session = ort.InferenceSession(MODELO_PATH, opts, providers=['CPUExecutionProvider'])
        meta = _session.get_modelmeta().custom_metadata_map
        _names = ast.literal_eval(meta.get("names", "{}"))
        _stride = int(meta.get("stride", 32))
        logger.info(f"[DOCLAYOUT] Sesión cargada. Clases: {len(_names)}, Stride: {_stride}")
    return _session, _names, _stride

def resize_and_pad_image(image, new_shape=1024, stride=32):
    if isinstance(new_shape, int):
        new_shape = (new_shape, new_shape)
    h, w = image.shape[:2]
    new_h, new_w = new_shape
    r = min(new_h / h, new_w / w)
    resized_h, resized_w = int(round(h * r)), int(round(w * r))
    image = cv2.resize(image, (resized_w, resized_h), interpolation=cv2.INTER_LINEAR)
    pad_w = (new_w - resized_w) % stride
    pad_h = (new_h - resized_h) % stride
    top, bottom = pad_h // 2, pad_h - pad_h // 2
    left, right = pad_w // 2, pad_w - pad_w // 2
    image = cv2.copyMakeBorder(image, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(114, 114, 114))
    return image, r, (left, top)

def scale_boxes(boxes, orig_shape, r, pad):
    pad_x, pad_y = pad
    boxes[:, [0, 2]] = (boxes[:, [0, 2]] - pad_x) / r
    boxes[:, [1, 3]] = (boxes[:, [1, 3]] - pad_y) / r
    boxes[:, [0, 2]] = np.clip(boxes[:, [0, 2]], 0, orig_shape[1])
    boxes[:, [1, 3]] = np.clip(boxes[:, [1, 3]], 0, orig_shape[0])
    return boxes


def _es_bloque_columna_valido(caja, words_raw, orig_w):
    """Indica si una caja YOLO es candidata a columna (etiqueta, dimensiones y contenido real)."""
    if (
        caja["label"] not in ("plain text", "title", "table", "table_caption", "table_footnote", "figure")
        or (caja["x2"] - caja["x1"]) >= (orig_w * 0.62)
        or (caja["y2"] - caja["y1"]) <= 15
    ):
        return False
    if caja["label"] == "figure":
        return True
    return any(
        max(caja["x1"], w[0]) < min(caja["x2"], w[2]) and max(caja["y1"], w[1]) < min(caja["y2"], w[3])
        for w in words_raw
    )


def _detectar_pares_columnas_solapadas(cajas_pdf, words_raw, orig_w):
    """Identifica bloques candidatos a columna izquierda/derecha con contenido real y solapamiento vertical."""
    left_cols = []
    right_cols = []
    mitad_x = orig_w * 0.50
    for c in cajas_pdf:
        if not _es_bloque_columna_valido(c, words_raw, orig_w):
            continue
        if (c["x1"] + c["x2"]) / 2.0 < mitad_x:
            left_cols.append(c)
        else:
            right_cols.append(c)

    overlapping_left = []
    overlapping_right = []
    for l in left_cols:
        for r in right_cols:
            if min(l["y2"], r["y2"]) - max(l["y1"], r["y1"]) > 15:
                if l not in overlapping_left:
                    overlapping_left.append(l)
                if r not in overlapping_right:
                    overlapping_right.append(r)

    return overlapping_left, overlapping_right


def _filtrar_zonas_y_bloques_yolo(cajas_pdf, orig_w, orig_h):
    """Clasifica cajas YOLO en zonas excluidas, bloques de lectura y bandera de tabla dominante."""
    zonas_excluidas = []
    cajas_tablas = [c for c in cajas_pdf if c["label"] == "table"]

    for c in cajas_pdf:
        if c["label"] in ["figure", "abandon"]:
            w_box = c["x2"] - c["x1"]
            h_box = c["y2"] - c["y1"]
            if w_box < 15 and h_box < 15:
                continue
            if (w_box * h_box) > (orig_w * orig_h * 0.50):
                continue
            zonas_excluidas.append([
                int(max(0, c["x1"] - 2)),
                int(max(0, c["y1"] - 2)),
                int(min(orig_w, c["x2"] + 2)),
                int(min(orig_h, c["y2"] + 2)),
            ])

    bloques_lectura = [
        c for c in cajas_pdf
        if c["label"] in ["plain text", "title", "table", "figure_caption"]
        and (c["y2"] - c["y1"]) > 10
    ]

    tablas_anchas = [t for t in cajas_tablas if (t["x2"] - t["x1"]) > (orig_w * 0.65)]
    alto_tablas_anchas = sum((t["y2"] - t["y1"]) for t in tablas_anchas)
    tabla_completa_dominante = alto_tablas_anchas > (orig_h * 0.70)
    return zonas_excluidas, bloques_lectura, tabla_completa_dominante


def _extraer_zonas_y_contexto_pagina(page, cajas_pdf, orig_w, orig_h):
    """Calcula zonas excluidas, palabras/bloques de lectura y si domina una tabla ancha."""
    zonas_excluidas, bloques_lectura, tabla_completa_dominante = _filtrar_zonas_y_bloques_yolo(
        cajas_pdf, orig_w, orig_h
    )
    words_raw = page.get_text("words")
    words_reading = [w for w in words_raw if not (w[1] < 40 or w[3] > orig_h - 40)]
    blocks_text = [b for b in page.get_text("blocks") if 40 < b[1] < (orig_h - 40) and len(b[4].strip()) > 30]
    narrow_blocks = [b for b in blocks_text if (b[2] - b[0]) < (orig_w * 0.52)]

    return (
        zonas_excluidas,
        words_raw,
        words_reading,
        blocks_text,
        narrow_blocks,
        bloques_lectura,
        tabla_completa_dominante,
    )


def _resolver_cortes_verticales_pagina(
    cajas_pdf,
    words_raw,
    words_reading,
    blocks_text,
    narrow_blocks,
    tabla_completa_dominante,
    orig_w,
    orig_h,
):
    """Determina los cortes verticales de columna vía YOLO raycasting (Modo 1) o palabras (Modo 2)."""
    cortes_v = []
    overlapping_left, overlapping_right = _detectar_pares_columnas_solapadas(cajas_pdf, words_raw, orig_w)

    es_multicolumna_yolo = (
        len(overlapping_left) >= 1
        and len(overlapping_right) >= 1
        and not tabla_completa_dominante
        and (len(narrow_blocks) >= 1 or len(words_reading) > 80)
    )
    if es_multicolumna_yolo:
        cortes_v = _detectar_cortes_yolo_raycasting(
            overlapping_left, overlapping_right, words_reading, words_raw, blocks_text, orig_w, orig_h
        )

    wide_dominante = len([b for b in blocks_text if (b[2] - b[0]) > (orig_w * 0.60)]) >= 2
    if not cortes_v and not tabla_completa_dominante and not wide_dominante and len(words_reading) >= 60 and len(narrow_blocks) >= 2:
        cortes_v = _detectar_cortes_por_palabras(words_reading, orig_w, orig_h)
    return cortes_v


def analizar_layout_pagina(pdf_doc, num_pagina, conf_umbral=0.28):
    """
    Analiza la página con DocLayout-YOLO y calcula:
    - cortesV: Lista de coordenadas X recomendadas para cortar columnas.
    - limitesH: Diccionario con límites verticales por columna {'0': [yMin, yMax], ...}.
    - zonasExcluidas: Lista de [x1, y1, x2, y2] para figuras y tablas que deben omitirse.
    - detecciones_count: Cantidad total de regiones detectadas.
    """
    session, names, stride = get_session()
    if session is None:
        return {"error": "Modelo de layout no disponible"}
    
    if num_pagina < 0 or num_pagina >= len(pdf_doc):
        return {"error": "Número de página fuera de rango"}
        
    page = pdf_doc[num_pagina]
    rect = page.rect
    orig_w, orig_h = rect.width, rect.height
    
    # Renderizamos a 150 DPI
    pix = page.get_pixmap(dpi=150)
    img_np = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, pix.n))
    if pix.n == 4:
        img_np = cv2.cvtColor(img_np, cv2.COLOR_RGBA2RGB)
    elif pix.n == 1:
        img_np = cv2.cvtColor(img_np, cv2.COLOR_GRAY2RGB)
        
    img_h, img_w = img_np.shape[:2]
    
    img_padded, ratio, pad = resize_and_pad_image(img_np, new_shape=1024, stride=stride)
    blob = np.transpose(img_padded, (2, 0, 1))
    blob = np.expand_dims(blob, axis=0).astype(np.float32) / 255.0
    
    preds = session.run(None, {"images": blob})[0]
    
    mask = preds[..., 4] > conf_umbral
    valid_preds = preds[mask]
    
    if len(valid_preds) == 0:
        return {
            "exito": True,
            "ancho_pagina": orig_w,
            "alto_pagina": orig_h,
            "cortesV": [],
            "limitesH": {"0": [0, round(orig_h, 1)]},
            "zonasExcluidas": [],
            "detecciones_count": 0
        }
        
    valid_preds = scale_boxes(valid_preds, (img_h, img_w), ratio, pad)
    
    # Escalar coordenadas a puntos PDF (72 DPI)
    scale_x = orig_w / img_w
    scale_y = orig_h / img_h
    
    cajas_pdf = []
    for box in valid_preds:
        bx0, by0, bx1, by1, conf, cls_id = box[:6]
        c_name = names.get(int(cls_id), f"clase_{int(cls_id)}")
        cajas_pdf.append({
            "label": c_name,
            "conf": float(conf),
            "x1": round(float(bx0) * scale_x, 1),
            "y1": round(float(by0) * scale_y, 1),
            "x2": round(float(bx1) * scale_x, 1),
            "y2": round(float(by1) * scale_y, 1)
        })
        
    # 1. Zonas Excluidas y contexto de palabras/bloques de la página
    (
        zonas_excluidas,
        words_raw,
        words_reading,
        blocks_text,
        narrow_blocks,
        bloques_lectura,
        tabla_completa_dominante,
    ) = _extraer_zonas_y_contexto_pagina(page, cajas_pdf, orig_w, orig_h)
    cortes_v = _resolver_cortes_verticales_pagina(
        cajas_pdf,
        words_raw,
        words_reading,
        blocks_text,
        narrow_blocks,
        tabla_completa_dominante,
        orig_w,
        orig_h,
    )

    # 3. Límites Horizontales
    limites_h = _calcular_limites_horizontales(
        words_raw, bloques_lectura, zonas_excluidas, cortes_v, orig_h
    )
        
    # Clasificación de bloques estructurales (titulo / subtitulo / parrafo)
    estructura = _clasificar_bloques_estructura(page, cajas_pdf)

    return {
        "exito": True,
        "ancho_pagina": orig_w,
        "alto_pagina": orig_h,
        "cortesV": cortes_v,
        "limitesH": limites_h,
        "zonasExcluidas": zonas_excluidas,
        "detecciones_count": len(cajas_pdf),
        "estructura": estructura
    }


def _extraer_spans_y_tamano_base(page):
    """Extrae lista de spans (x1, y1, x2, y2, size) y la mediana del tamaño de fuente del cuerpo."""
    spans_info = []
    tamanios_cuerpo = []
    try:
        dict_pag = page.get_text("dict")
        for b in dict_pag.get("blocks", []):
            if b.get("type", 0) != 0:
                continue
            for l in b.get("lines", []):
                for s in l.get("spans", []):
                    txt = s.get("text", "").strip()
                    if not txt:
                        continue
                    sb = s.get("bbox", (0, 0, 0, 0))
                    sz = float(s.get("size", 0))
                    spans_info.append((sb[0], sb[1], sb[2], sb[3], sz))
                    if len(txt) >= 15 and sz > 0:
                        tamanios_cuerpo.append(sz)
    except Exception:
        pass
    base_size = float(np.median(tamanios_cuerpo)) if tamanios_cuerpo else 11.0
    return spans_info, base_size


def _clasificar_bloques_estructura(page, cajas_pdf):
    """Clasifica cajas de DocLayout-YOLO en titulo, subtitulo o parrafo usando tamaños de fuente de PyMuPDF."""
    spans_info, base_size = _extraer_spans_y_tamano_base(page)
    estructura = []
    for c in cajas_pdf:
        lbl = c.get("label")
        if lbl not in ("title", "plain text") or (c["y2"] - c["y1"]) <= 10:
            continue

        if lbl == "plain text":
            tipo = "parrafo"
        else:
            # Buscar el tamaño de fuente máximo dentro de la caja del título
            max_sz = 0.0
            for sx1, sy1, sx2, sy2, sz in spans_info:
                if not (sx2 < c["x1"] or sx1 > c["x2"] or sy2 < c["y1"] or sy1 > c["y2"]):
                    if sz > max_sz:
                        max_sz = sz
            tipo = "titulo" if max_sz >= (base_size * 1.35) else "subtitulo"

        estructura.append({
            "tipo": tipo,
            "x1": round(c["x1"], 1),
            "y1": round(c["y1"], 1),
            "x2": round(c["x2"], 1),
            "y2": round(c["y2"], 1),
            "score": round(c.get("score", 0.0), 3)
        })

    estructura.sort(key=lambda item: (item["y1"], item["x1"]))
    return estructura
