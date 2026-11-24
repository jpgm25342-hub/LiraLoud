 # LiraLoud

# Copyright 2026 José Pablo González Macías

# Licensed under the Apache License, Version 2.0



"""

=============================================================================

LIRALOUD - MOTOR OCR DE ALTO RENDIMIENTO (RapidOCR + ONNX Runtime)

=============================================================================

Proporciona reconocimiento óptico de caracteres para PDFs escaneados y de pura

imagen, extrayendo texto y generando coordenadas exactas de cada palabra

[x0, y0, x1, y1] para mantener el karaoke visual y la lectura de voz sincronizada.

=============================================================================

"""



import os

import json

import hashlib

import logging

import threading

from typing import List, Tuple, Dict, Any, Optional



from backend.core.estado_global import estado_app

logger = logging.getLogger("LiraOCREngine")

BASE_PROYECTO = estado_app.base_dir

DIR_OCR_CACHE = os.path.join(BASE_PROYECTO, "lira_db", "ocr_cache")

os.makedirs(DIR_OCR_CACHE, exist_ok=True)

COORD_VERSION = 2



_rapid_ocr_instance = None

_ocr_lock = threading.Lock()





def _get_ocr_engine():

    """Inicialización bajo demanda (Lazy Loading) para no ralentizar el inicio de LiraLoud."""

    global _rapid_ocr_instance

    if _rapid_ocr_instance is None:

        with _ocr_lock:

            if _rapid_ocr_instance is None:

                try:

                    from rapidocr_onnxruntime import RapidOCR

                    _rapid_ocr_instance = RapidOCR()

                    logger.info("✅ [OCREngine] RapidOCR ONNX cargado exitosamente.")

                except Exception as e:

                    logger.error(f"❌ [OCREngine] No se pudo cargar RapidOCR: {e}")

                    _rapid_ocr_instance = None

    return _rapid_ocr_instance





def _generar_clave_cache(doc_path: str, num_pagina: int) -> str:
    """Genera un nombre de archivo único y estable para la caché de OCR de una página."""
    if not doc_path:
        path_norm = "doc_anonimo"
    else:
        path_norm = os.path.abspath(doc_path).lower().replace("\\", "/")
    raw = f"{path_norm}_{num_pagina}"
    doc_hash = hashlib.md5(raw.encode("utf-8")).hexdigest()[:16]
    return f"ocr_{doc_hash}_p{num_pagina}.json"


def esta_en_cache_ocr(doc_path: str, num_pagina: int) -> bool:
    """Comprueba si una página ya cuenta con reconocimiento OCR guardado con coord_version vigente."""
    if not doc_path:
        return False
    cache_file = os.path.join(DIR_OCR_CACHE, _generar_clave_cache(doc_path, num_pagina))
    if not os.path.exists(cache_file):
        return False
    try:
        with open(cache_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        return isinstance(data, dict) and data.get("coord_version") == COORD_VERSION and isinstance(data.get("palabras"), list)
    except Exception:
        return False


def obtener_palabras_cache_ocr(doc_path: str, num_pagina: int) -> Optional[List[Tuple[float, float, float, float, str, int, int, int]]]:
    """Obtiene las palabras guardadas en la caché OCR para una página si tienen coord_version vigente."""
    if not doc_path:
        return None
    cache_file = os.path.join(DIR_OCR_CACHE, _generar_clave_cache(doc_path, num_pagina))
    if not os.path.exists(cache_file):
        return None
    try:
        with open(cache_file, "r", encoding="utf-8") as f:
            cached_data = json.load(f)
        if not isinstance(cached_data, dict) or cached_data.get("coord_version") != COORD_VERSION:
            return None
        return [tuple(item) for item in cached_data.get("palabras", [])]
    except Exception as e:
        logger.warning(f"⚠️ [OCREngine] Error leyendo caché OCR para página {num_pagina}: {e}")
        return None


def guardar_palabras_cache_ocr(doc_path: str, num_pagina: int, palabras: List[Tuple]) -> bool:
    """Guarda una lista de palabras en la caché OCR de una página con coord_version."""
    if not doc_path or not palabras:
        return False
    cache_file = os.path.join(DIR_OCR_CACHE, _generar_clave_cache(doc_path, num_pagina))
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump({"coord_version": COORD_VERSION, "palabras": palabras}, f, ensure_ascii=False)
        return True
    except Exception as e:
        logger.warning(f"⚠️ [OCREngine] Error guardando caché OCR para página {num_pagina}: {e}")
        return False


def actualizar_linea_cache_ocr(doc_path: str, num_pagina: int, id_linea: str, bbox_original: list, nuevo_texto: str, nuevo_bbox: list) -> bool:
    """Actualiza una línea específica en la caché de OCR tras una edición de texto."""
    palabras = obtener_palabras_cache_ocr(doc_path, num_pagina)
    if not palabras:
        return False

    line_idx = None
    if id_linea and id_linea.startswith("ocr-line-"):
        try:
            line_idx = int(id_linea.split("-")[-1])
        except Exception:
            line_idx = None

    # Filtrar palabras que pertenezcan a la línea editada
    def es_de_linea(p):
        if line_idx is not None and len(p) > 6 and p[6] == line_idx:
            return True
        if bbox_original and len(bbox_original) == 4:
            px0, py0, px1, py1 = p[0], p[1], p[2], p[3]
            bx0, by0, bx1, by1 = bbox_original
            cx, cy = (px0 + px1) / 2.0, (py0 + py1) / 2.0
            if (bx0 - 4 <= cx <= bx1 + 4) and (by0 - 4 <= cy <= by1 + 4):
                return True
        return False

    palabras_restantes = [p for p in palabras if not es_de_linea(p)]

    # Si hay nuevo texto, generar palabras dentro de las coordenadas de bbox_original
    target_idx = line_idx if line_idx is not None else 0
    nuevas_palabras = []
    texto_limpio = nuevo_texto.strip()
    if texto_limpio:
        partes = texto_limpio.split()
        if partes:
            if bbox_original and len(bbox_original) == 4:
                bx0, by0, bx1, by1 = float(bbox_original[0]), float(bbox_original[1]), float(bbox_original[2]), float(bbox_original[3])
            elif nuevo_bbox and len(nuevo_bbox) == 4:
                bx0, by0, bx1, by1 = float(nuevo_bbox[0]), float(nuevo_bbox[1]), float(nuevo_bbox[2]), float(nuevo_bbox[3])
            else:
                bx0, by0, bx1, by1 = 50.0, 50.0, 200.0, 70.0

            total_chars = sum(len(w) for w in partes)
            ancho_total = max(10.0, bx1 - bx0)
            curr_x = bx0

            for w_idx, w in enumerate(partes):
                frac = len(w) / max(1, total_chars)
                ancho_w = ancho_total * frac
                w_x0 = curr_x
                w_x1 = min(bx1, curr_x + ancho_w)
                w_y0 = by0
                w_y1 = by1
                curr_x = w_x1 + (ancho_total * 0.05 / max(1, len(partes)))

                nuevas_palabras.append((
                    round(w_x0, 2),
                    round(w_y0, 2),
                    round(w_x1, 2),
                    round(w_y1, 2),
                    w,
                    target_idx,
                    target_idx,
                    w_idx
                ))

    todas = palabras_restantes + nuevas_palabras
    # Ordenar por orden de lectura
    todas.sort(key=lambda item: (int(item[1] / 10), item[0]))

    return guardar_palabras_cache_ocr(doc_path, num_pagina, todas)


def ordenar_lineas_ocr_lectura(ocr_items, scale_x: float, scale_y: float, ancho_pdf: float, alto_pdf: float):
    """
    Ordena las líneas de OCR en orden natural de lectura respetando estructuras
    de 1 o 2 columnas (artículos científicos, libros, periódicos).
    """
    if not ocr_items:
        return []

    lineas = []
    for item in ocr_items:
        box = item[0]
        texto_linea = str(item[1]).strip()
        if not texto_linea:
            continue
        xs = [pt[0] * scale_x for pt in box]
        ys = [pt[1] * scale_y for pt in box]
        x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
        lineas.append({
            "item": item,
            "x0": x0,
            "y0": y0,
            "x1": x1,
            "y1": y1,
            "cx": (x0 + x1) / 2.0,
            "cy": (y0 + y1) / 2.0,
            "w": x1 - x0,
            "h": y1 - y0,
        })

    if not lineas:
        return []

    min_x = min(l["x0"] for l in lineas)
    max_x = max(l["x1"] for l in lineas)
    ancho_contenido = max_x - min_x

    mejor_gutter = None
    if ancho_contenido > 80 and len(lineas) >= 4:
        centro_x = (min_x + max_x) / 2.0
        # Tolerancia del canal central
        margen = ancho_contenido * 0.08
        izq = [l for l in lineas if l["x1"] <= centro_x + margen]
        der = [l for l in lineas if l["x0"] >= centro_x - margen]

        # Si al menos el 65% de las líneas caen limpiamente a la izquierda o derecha
        if len(izq) >= 2 and len(der) >= 2 and (len(izq) + len(der)) / len(lineas) >= 0.65:
            mejor_gutter = centro_x

    if mejor_gutter is not None:
        min_y_cols = min([l["y0"] for l in lineas if l["x1"] <= mejor_gutter or l["x0"] >= mejor_gutter] or [0])
        max_y_cols = max([l["y1"] for l in lineas if l["x1"] <= mejor_gutter or l["x0"] >= mejor_gutter] or [alto_pdf])

        top_headers = []
        bottom_footers = []
        col_izq = []
        col_der = []

        for l in lineas:
            if l["x1"] <= mejor_gutter + 5:
                col_izq.append(l)
            elif l["x0"] >= mejor_gutter - 5:
                col_der.append(l)
            elif l["cy"] < min_y_cols + 12:
                top_headers.append(l)
            elif l["cy"] > max_y_cols - 12:
                bottom_footers.append(l)
            elif l["cx"] < mejor_gutter:
                col_izq.append(l)
            else:
                col_der.append(l)

        top_headers.sort(key=lambda l: l["y0"])
        col_izq.sort(key=lambda l: l["y0"])
        col_der.sort(key=lambda l: l["y0"])
        bottom_footers.sort(key=lambda l: l["y0"])

        lineas_ordenadas = top_headers + col_izq + col_der + bottom_footers
    else:
        # 1 sola columna: ordenar de arriba a abajo agrupando por líneas horizontales
        lineas.sort(key=lambda l: (int(l["y0"] / 12), l["x0"]))
        lineas_ordenadas = lineas

    return [l["item"] for l in lineas_ordenadas]


def procesar_ocr_pagina(

    pixmap_bytes: bytes,

    ancho_pdf: float,

    alto_pdf: float,

    ancho_px: int,

    alto_px: int,

    doc_path: str = "",

    num_pagina: int = 0,

    forzar: bool = False

) -> List[Tuple[float, float, float, float, str, int, int, int]]:

    """

    Ejecuta OCR sobre la imagen de una página y devuelve una lista de palabras con formato idéntico a fitz.get_text('words'):

    (x0, y0, x1, y1, palabra, block_no, line_no, word_no)

    en coordenadas de puntos del PDF.

    """

    cache_file = os.path.join(DIR_OCR_CACHE, _generar_clave_cache(doc_path, num_pagina)) if doc_path else None



    # 1. Verificar si ya está en caché con coord_version vigente
    if not forzar and doc_path:
        palabras_cached = obtener_palabras_cache_ocr(doc_path, num_pagina)
        if palabras_cached is not None:
            logger.info(f"⚡ [OCREngine] Página {num_pagina} recuperada desde caché OCR ({len(palabras_cached)} palabras).")
            return palabras_cached



    engine = _get_ocr_engine()

    if engine is None:

        logger.warning("⚠️ [OCREngine] RapidOCR no está disponible.")

        return []



    logger.info(f"🔍 [OCREngine] Ejecutando reconocimiento OCR en página {num_pagina} ({ancho_px}x{alto_px}px)...")



    try:

        import numpy as np

        import cv2



        # Decodificar imagen para optimización de resolución

        nparr = np.frombuffer(pixmap_bytes, np.uint8)

        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)



        if img is None:

            # Fallback a bytes directos

            with _ocr_lock:

                ocr_result, _ = engine(pixmap_bytes)

            opt_w, opt_h = ancho_px, alto_px

        else:

            orig_h, orig_w = img.shape[:2]

            # Downscaling inteligente: límite máximo de 1800px para preservar espaciado y precisión
            MAX_DIM = 1800
            if max(orig_w, orig_h) > MAX_DIM:
                ratio = MAX_DIM / float(max(orig_w, orig_h))
                opt_w = max(32, int(orig_w * ratio))
                opt_h = max(32, int(orig_h * ratio))
                img_opt = cv2.resize(img, (opt_w, opt_h), interpolation=cv2.INTER_AREA)
            else:
                img_opt = img
                opt_w, opt_h = orig_w, orig_h

            with _ocr_lock:
                try:
                    ocr_result, _ = engine(img_opt, return_word_box=True)
                except TypeError:
                    ocr_result, _ = engine(img_opt)



        if not ocr_result:

            logger.info(f"ℹ️ [OCREngine] No se detectó texto en la página {num_pagina}.")

            return []



        scale_x = ancho_pdf / max(1.0, float(opt_w))

        scale_y = alto_pdf / max(1.0, float(opt_h))



        ocr_result_ordenado = ordenar_lineas_ocr_lectura(ocr_result, scale_x, scale_y, ancho_pdf, alto_pdf)



        palabras_finales = []



        def _peso_char(c: str) -> float:
            if c.isspace():
                return 0.35
            if c in "iIljtfr.,;:!|'\"`":
                return 0.45
            if c in "mwMW@":
                return 1.45
            return 1.0

        for line_idx, item in enumerate(ocr_result_ordenado):
            box = item[0]
            texto_linea = str(item[1]).strip()
            if not texto_linea:
                continue

            xs = [pt[0] for pt in box]
            ys = [pt[1] for pt in box]
            x_min_pt = min(xs) * scale_x
            x_max_pt = max(xs) * scale_x
            y_min_pt = min(ys) * scale_y
            y_max_pt = max(ys) * scale_y

            char_boxes = item[3] if len(item) > 3 and isinstance(item[3], list) else None
            char_list = item[4] if len(item) > 4 and isinstance(item[4], list) else None

            # Priorizar cajas nativas por carácter de RapidOCR (return_word_box=True)
            if char_boxes and char_list and len(char_boxes) == len(char_list):
                word_idx = 0
                cur_chars = []
                cur_boxes = []
                for ch, cbox in zip(char_list, char_boxes):
                    if str(ch).isspace():
                        if cur_chars:
                            w_txt = "".join(cur_chars)
                            cxs = [pt[0] for b in cur_boxes for pt in b]
                            cys = [pt[1] for b in cur_boxes for pt in b]
                            wx0 = max(0.0, min(cxs) * scale_x - 0.4)
                            wy0 = min(cys) * scale_y
                            wx1 = max(cxs) * scale_x + 0.4
                            wy1 = max(cys) * scale_y
                            h_w = max(1.0, wy1 - wy0)
                            wy0 = max(0.0, wy0 - h_w * 0.065)
                            wy1 = max(wy0 + 1.0, wy1 - h_w * 0.075)
                            palabras_finales.append((
                                round(wx0, 2),
                                round(wy0, 2),
                                round(wx1, 2),
                                round(wy1, 2),
                                w_txt,
                                line_idx,
                                line_idx,
                                word_idx,
                            ))
                            word_idx += 1
                            cur_chars, cur_boxes = [], []
                    else:
                        cur_chars.append(str(ch))
                        cur_boxes.append(cbox)
                if cur_chars:
                    w_txt = "".join(cur_chars)
                    cxs = [pt[0] for b in cur_boxes for pt in b]
                    cys = [pt[1] for b in cur_boxes for pt in b]
                    wx0 = max(0.0, min(cxs) * scale_x - 0.4)
                    wy0 = min(cys) * scale_y
                    wx1 = max(cxs) * scale_x + 0.4
                    wy1 = max(cys) * scale_y
                    h_w = max(1.0, wy1 - wy0)
                    wy0 = max(0.0, wy0 - h_w * 0.065)
                    wy1 = max(wy0 + 1.0, wy1 - h_w * 0.075)
                    palabras_finales.append((
                        round(wx0, 2),
                        round(wy0, 2),
                        round(wx1, 2),
                        round(wy1, 2),
                        w_txt,
                        line_idx,
                        line_idx,
                        word_idx,
                    ))
                continue

            # Fallback ponderado sin deriva acumulada
            palabras_linea = texto_linea.split()
            if not palabras_linea:
                continue

            pesos_palabras = [sum(_peso_char(c) for c in w) for w in palabras_linea]
            peso_espacio = 0.35
            peso_total = sum(pesos_palabras) + peso_espacio * max(0, len(palabras_linea) - 1)
            ancho_total_linea_pt = max(10.0, x_max_pt - x_min_pt)
            curr_x = x_min_pt

            for word_idx, (w, pw) in enumerate(zip(palabras_linea, pesos_palabras)):
                ancho_w_pt = ancho_total_linea_pt * (pw / max(1e-6, peso_total))
                w_x0 = curr_x
                w_x1 = min(x_max_pt, curr_x + ancho_w_pt)
                curr_x = w_x1 + ancho_total_linea_pt * (peso_espacio / max(1e-6, peso_total))

                palabras_finales.append((
                    round(w_x0, 2),
                    round(y_min_pt, 2),
                    round(w_x1, 2),
                    round(y_max_pt, 2),
                    w,
                    line_idx,
                    line_idx,
                    word_idx,
                ))

        logger.info(f"✅ [OCREngine] OCR completado en página {num_pagina}: {len(palabras_finales)} palabras detectadas.")

        # Guardar en caché con coord_version vigente
        if doc_path and palabras_finales:
            guardar_palabras_cache_ocr(doc_path, num_pagina, palabras_finales)



        return palabras_finales



    except Exception as e:

        logger.error(f"❌ [OCREngine] Error durante el procesamiento OCR: {e}")

        return []

