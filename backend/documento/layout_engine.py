import os
import ast
import cv2
import numpy as np
import onnxruntime as ort
import pymupdf as fitz
from backend.core.logger_config import logger

MODELO_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "layout_models", "doclayout_yolo_docstructbench_imgsz1024.onnx")

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
        
    # 1. Zonas Excluidas (Figuras, abandon / decoraciones)
    # NOTA CRÍTICA: Las tablas ('table') NUNCA deben excluirse, ya que contienen texto importante
    # y recomendaciones que el usuario desea que el lector de voz lea.
    zonas_excluidas = []
    cajas_tablas = [c for c in cajas_pdf if c["label"] == "table"]
    
    for c in cajas_pdf:
        if c["label"] in ["figure", "abandon"]:
            w_box = c["x2"] - c["x1"]
            h_box = c["y2"] - c["y1"]
            # Filtrar artefactos minúsculos (números de capítulo, viñetas, caracteres aislados)
            if w_box < 15 and h_box < 15:
                continue
            # Salvaguarda: Evitar que una caja anómala cubra más del 50% de la página entera
            if (w_box * h_box) > (orig_w * orig_h * 0.50):
                continue
            zonas_excluidas.append([
                int(max(0, c["x1"] - 2)),
                int(max(0, c["y1"] - 2)),
                int(min(orig_w, c["x2"] + 2)),
                int(min(orig_h, c["y2"] + 2))
            ])
            
    # Extraer palabras reales de la página y filtrar aquellas que caigan dentro de zonas excluidas
    words_raw = page.get_text("words")
    def dentro_zona_excluida(w):
        return any(not (w[2] < z[0] or w[0] > z[2] or w[3] < z[1] or w[1] > z[3]) for z in zonas_excluidas)
    words_validas = [w for w in words_raw if not dentro_zona_excluida(w)]

    # Palabras del cuerpo de lectura (descartando encabezados y pies de página extremos)
    words_reading = [w for w in words_raw if not (w[1] < 40 or w[3] > orig_h - 40)]

    # Bloques de texto reales con contenido
    blocks_text = [b for b in page.get_text("blocks") if 40 < b[1] < (orig_h - 40) and len(b[4].strip()) > 30]
    narrow_blocks = [b for b in blocks_text if (b[2] - b[0]) < (orig_w * 0.52)]

    # 2. Análisis de Columnas y Franjas
    # En documentos maquetados, tanto 'plain text' como 'title', 'table' y 'figure_caption' forman bloques de lectura
    bloques_lectura = [
        c for c in cajas_pdf 
        if c["label"] in ["plain text", "title", "table", "figure_caption"]
        and (c["y2"] - c["y1"]) > 10
    ]
    
    cortes_v = []
    limites_h = {}
    
    # Comprobar si hay tablas anchas (que ocupen más del 65% del ancho de página)
    tablas_anchas = [t for t in cajas_tablas if (t["x2"] - t["x1"]) > (orig_w * 0.65)]
    alto_tablas_anchas = sum((t["y2"] - t["y1"]) for t in tablas_anchas)
    tabla_completa_dominante = (alto_tablas_anchas > (orig_h * 0.70))

    # Candidatos a columnas según DocLayout (< 62% del ancho de página)
    # Incluimos también 'figure' como posible componente visual de una columna (ej. atlas de anatomía)
    # y descartamos bloques fantasma de texto que no contengan palabras reales
    def tiene_contenido_real(c):
        if c["label"] == "figure":
            return True
        # Verificar que el bloque tenga al menos una palabra real dentro
        return any(max(c["x1"], w[0]) < min(c["x2"], w[2]) and max(c["y1"], w[1]) < min(c["y2"], w[3]) for w in words_raw)

    bloques_col = [
        c for c in cajas_pdf 
        if c["label"] in ["plain text", "title", "table", "table_caption", "table_footnote", "figure"]
        and (c["x2"] - c["x1"]) < (orig_w * 0.62)
        and (c["y2"] - c["y1"]) > 15
        and tiene_contenido_real(c)
    ]
    left_cols = [c for c in bloques_col if (c["x1"] + c["x2"]) / 2.0 < (orig_w * 0.50)]
    right_cols = [c for c in bloques_col if (c["x1"] + c["x2"]) / 2.0 >= (orig_w * 0.50)]

    # Determinar si existen pares de bloques a izquierda y derecha con solapamiento vertical real
    # (Evita que una cita arriba a la derecha y un título abajo a la izquierda parezcan dos columnas)
    overlapping_left = []
    overlapping_right = []
    for l in left_cols:
        for r in right_cols:
            if min(l["y2"], r["y2"]) - max(l["y1"], r["y1"]) > 15:
                if l not in overlapping_left:
                    overlapping_left.append(l)
                if r not in overlapping_right:
                    overlapping_right.append(r)

    # MODO 1: Detección primaria mediante cajas YOLO (con columnas izquierda y derecha que coexisten)
    # Requiere que la página no sea portada/portadilla de una sola columna (debe tener bloques angostos si hay texto denso)
    es_multicolumna_yolo = (
        len(overlapping_left) >= 1 and 
        len(overlapping_right) >= 1 and 
        not tabla_completa_dominante and
        (len(narrow_blocks) >= 1 or len(words_reading) > 80)
    )

    if es_multicolumna_yolo:
        # La franja vertical se restringe a donde efectivamente coexisten las columnas
        y_col_min = min(min(c["y1"] for c in overlapping_left), min(c["y1"] for c in overlapping_right))
        y_col_max = max(max(c["y2"] for c in overlapping_left), max(c["y2"] for c in overlapping_right))
        
        # Histograma de palabras dentro de la franja vertical de las columnas
        words_in_col = [w for w in words_reading if (y_col_min - 15) <= w[1] and w[3] <= (y_col_max + 15)]
        hist_x = np.zeros(int(orig_w) + 1, dtype=np.int32)
        for w in words_in_col:
            x0, x1 = max(0, int(w[0])), min(int(orig_w), int(w[2]))
            hist_x[x0:x1] += 1
            
        zona_busqueda_min = int(orig_w * 0.30)
        zona_busqueda_max = int(orig_w * 0.70)
        
        # Buscar brechas intercolumnares (gaps) agrupadas por canal
        gaps = [x for x in range(zona_busqueda_min, zona_busqueda_max) if hist_x[x] == 0]
        cut_candidates = []
        if gaps:
            g_start = gaps[0]
            g_prev = gaps[0]
            for gx in gaps[1:]:
                if gx - g_prev > 15:
                    cut_candidates.append((g_start + g_prev) // 2)
                    g_start = gx
                g_prev = gx
            cut_candidates.append((g_start + g_prev) // 2)
        else:
            sub_hist = hist_x[zona_busqueda_min:zona_busqueda_max]
            if len(sub_hist) > 0:
                cut_candidates.append(zona_busqueda_min + int(np.argmin(sub_hist)))

        for cut_x in cut_candidates:
            # Salvaguarda: Verificar que no cruce párrafos anchos del cuerpo
            vis_left = [c for c in overlapping_left if c["x2"] < (cut_x + 10)]
            vis_right = [c for c in overlapping_right if c["x1"] > (cut_x - 10)]
            candidato_valido = (len(vis_left) >= 1 and len(vis_right) >= 1)
            if candidato_valido:
                for b in blocks_text:
                    inter_y = max(b[1], y_col_min) < min(b[3], y_col_max)
                    w_b = b[2] - b[0]
                    if inter_y and w_b > (orig_w * 0.55) and (b[0] < cut_x - 15) and (b[2] > cut_x + 15):
                        candidato_valido = False
                        break
                    
            if candidato_valido:
                # Algoritmo Láser / Raycasting:
                # Proyectamos el corte vertical hacia arriba y hacia abajo desde la zona de columnas
                # hasta topar con una palabra que cruce el corte (o el margen de página).
                w_left_col = [w for w in words_reading if w[2] < cut_x - 10 and max(w[1], y_col_min) < min(w[3], y_col_max)]
                w_right_col = [w for w in words_reading if w[0] > cut_x + 10 and max(w[1], y_col_min) < min(w[3], y_col_max)]
                top_seed_y = min((min(w[1] for w in w_left_col), min(w[1] for w in w_right_col))) if (w_left_col and w_right_col) else y_col_min
                bot_seed_y = max((max(w[3] for w in w_left_col), max(w[3] for w in w_right_col))) if (w_left_col and w_right_col) else y_col_max

                # Disparo láser hacia arriba
                obs_up = [w for w in words_raw if w[3] <= top_seed_y and w[0] < cut_x + 8 and w[2] > cut_x - 8 and w[3] > 35]
                if obs_up:
                    laser_y_min = max(w[3] for w in obs_up) + 4.0
                else:
                    laser_y_min = 40.0

                # Disparo láser hacia abajo
                obs_down = [w for w in words_raw if w[1] >= bot_seed_y and w[0] < cut_x + 8 and w[2] > cut_x - 8 and w[1] < orig_h - 35]
                if obs_down:
                    laser_y_max = min(w[1] for w in obs_down) - 4.0
                else:
                    laser_y_max = orig_h - 40.0

                laser_y_min = max(0.0, float(laser_y_min))
                laser_y_max = min(float(orig_h), float(laser_y_max))

                es_hibrida = (laser_y_min > 85.0) or (laser_y_max < (orig_h - 85.0))
                if es_hibrida:
                    cortes_v.append({
                        "x": int(cut_x),
                        "yMin": round(laser_y_min, 1),
                        "yMax": round(laser_y_max, 1)
                    })
                else:
                    cortes_v.append(int(cut_x))

    # MODO 2: Detección secundaria por distribución real de palabras (salvaguarda ante falsos negativos de YOLO
    # cuando hay listas, viñetas continuas o tablas que YOLO unificó como un único bloque grande)
    # Requiere que la página no esté dominada por párrafos de ancho completo
    wide_dominante = len([b for b in blocks_text if (b[2] - b[0]) > (orig_w * 0.60)]) >= 2
    if not cortes_v and not tabla_completa_dominante and not wide_dominante and len(words_reading) >= 60 and len(narrow_blocks) >= 2:
        hist_w = np.zeros(int(orig_w) + 1, dtype=np.int32)
        for w in words_reading:
            x0, x1 = max(0, int(w[0])), min(int(orig_w), int(w[2]))
            hist_w[x0:x1] += 1
            
        z_min, z_max = int(orig_w * 0.25), int(orig_w * 0.75)
        cand_cuts = []
        en_gap = False
        g_start = 0
        for x in range(z_min, z_max):
            if hist_w[x] == 0:
                if not en_gap:
                    en_gap = True
                    g_start = x
            else:
                if en_gap:
                    en_gap = False
                    if (x - g_start) >= 5:
                        cand_cuts.append((g_start + x) // 2)
        if en_gap and (z_max - g_start) >= 5:
            cand_cuts.append((g_start + z_max) // 2)
            
        if not cand_cuts:
            sub_w = hist_w[z_min:z_max]
            if len(sub_w) > 0 and np.min(sub_w) <= 4:
                val_min = np.min(sub_w)
                xs = [z_min + i for i, v in enumerate(sub_w) if v == val_min]
                cand_cuts.append(xs[len(xs) // 2])
                
        for cand_x in cand_cuts:
            col_bands = 0
            band_y_starts = []
            y_min = min(w[1] for w in words_reading)
            y_max = max(w[3] for w in words_reading)
            cur_y = y_min
            while cur_y < y_max:
                bw = [w for w in words_reading if max(cur_y, w[1]) < min(cur_y + 35, w[3])]
                has_l = any(w[2] < (cand_x - 5) for w in bw)
                has_r = any(w[0] > (cand_x + 5) for w in bw)
                has_cross = any(w[0] < cand_x and w[2] > cand_x for w in bw)
                if has_l and has_r and not has_cross:
                    col_bands += 1
                    band_y_starts.append(cur_y)
                cur_y += 20
                
            if col_bands >= 4:
                # Evitar cortes duplicados en el mismo canal (distancia mínima 40px)
                ya_existe = any(
                    abs((c["x"] if isinstance(c, dict) else c) - int(cand_x)) < 40
                    for c in cortes_v
                )
                if ya_existe:
                    continue
                y_col_min = min(band_y_starts)
                y_col_max = max(band_y_starts) + 35
                es_hibrida = (y_col_min > 90) or (y_col_max < (orig_h - 100))
                if es_hibrida:
                    cortes_v.append({
                        "x": int(cand_x),
                        "yMin": round(max(0, y_col_min - 10), 1),
                        "yMax": round(min(orig_h, y_col_max + 10), 1)
                    })
                else:
                    cortes_v.append(int(cand_x))

        if len(cortes_v) > 1:
            cortes_v.sort(key=lambda c: c["x"] if isinstance(c, dict) else c)

    # 3. Límites Horizontales
    w_valid = [w for w in words_raw if not dentro_zona_excluida(w) and not (w[1] < 40 and w[3] < 40)]
    if cortes_v:
        if w_valid:
            y_p_min = max(0, min(w[1] for w in w_valid) - 14)
            y_p_max = min(orig_h, max(w[3] for w in w_valid) + 14)
        elif bloques_lectura:
            y_p_min = max(0, min(b["y1"] for b in bloques_lectura) - 14)
            y_p_max = min(orig_h, max(b["y2"] for b in bloques_lectura) + 14)
        else:
            y_p_min, y_p_max = 0, orig_h

        limites_h["0"] = [round(y_p_min, 1), round(y_p_max, 1)]
        limites_h["1"] = [round(y_p_min, 1), round(y_p_max, 1)]
    else:
        # Página continua de una sola columna (portadas, resúmenes o tablas completas)
        if w_valid:
            y_min = max(0, min(w[1] for w in w_valid) - 14)
            y_max = min(orig_h, max(w[3] for w in w_valid) + 14)
        elif bloques_lectura:
            y_min = max(0, min(b["y1"] for b in bloques_lectura) - 14)
            y_max = min(orig_h, max(b["y2"] for b in bloques_lectura) + 14)
        else:
            y_min, y_max = 0, orig_h
        limites_h["0"] = [round(y_min, 1), round(y_max, 1)]
        
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


def _clasificar_bloques_estructura(page, cajas_pdf):
    """Clasifica cajas de DocLayout-YOLO en titulo, subtitulo o parrafo usando tamaños de fuente de PyMuPDF."""
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
