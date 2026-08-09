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

logger = logging.getLogger("LiraOCREngine")

BASE_PROYECTO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_OCR_CACHE = os.path.join(BASE_PROYECTO, "lira_db", "ocr_cache")
os.makedirs(DIR_OCR_CACHE, exist_ok=True)

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
    """Genera un nombre de archivo único para la caché de OCR de una página."""
    try:
        st = os.stat(doc_path)
        raw = f"{doc_path}_{st.st_size}_{st.st_mtime}_{num_pagina}"
    except Exception:
        raw = f"{doc_path}_{num_pagina}"
    doc_hash = hashlib.md5(raw.encode("utf-8")).hexdigest()[:16]
    return f"ocr_{doc_hash}_p{num_pagina}.json"


def esta_en_cache_ocr(doc_path: str, num_pagina: int) -> bool:
    """Comprueba si una página ya cuenta con reconocimiento OCR guardado."""
    if not doc_path:
        return False
    cache_file = os.path.join(DIR_OCR_CACHE, _generar_clave_cache(doc_path, num_pagina))
    return os.path.exists(cache_file)


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

    # 1. Verificar si ya está en caché
    if not forzar and cache_file and os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                cached_data = json.load(f)
                palabras_cached = [tuple(item) for item in cached_data]
                logger.info(f"⚡ [OCREngine] Página {num_pagina} recuperada desde caché OCR ({len(palabras_cached)} palabras).")
                return palabras_cached
        except Exception as e:
            logger.warning(f"⚠️ [OCREngine] Error leyendo caché OCR: {e}")

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
            # Downscaling inteligente: límite máximo de 1200px para detección ultra-rápida (3x-4x speedup)
            MAX_DIM = 1200
            if max(orig_w, orig_h) > MAX_DIM:
                ratio = MAX_DIM / float(max(orig_w, orig_h))
                opt_w = max(32, int(orig_w * ratio))
                opt_h = max(32, int(orig_h * ratio))
                img_opt = cv2.resize(img, (opt_w, opt_h), interpolation=cv2.INTER_AREA)
            else:
                img_opt = img
                opt_w, opt_h = orig_w, orig_h

            with _ocr_lock:
                ocr_result, _ = engine(img_opt)

        if not ocr_result:
            logger.info(f"ℹ️ [OCREngine] No se detectó texto en la página {num_pagina}.")
            return []

        scale_x = ancho_pdf / max(1.0, float(opt_w))
        scale_y = alto_pdf / max(1.0, float(opt_h))

        palabras_finales = []
        
        # ocr_result es una lista de líneas: [ [box_pts, texto_linea, score], ... ]
        for line_idx, item in enumerate(ocr_result):
            box = item[0]  # [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
            texto_linea = str(item[1]).strip()
            if not texto_linea:
                continue

            # Obtener rectángulo de la línea en píxeles optimizados
            xs = [pt[0] for pt in box]
            ys = [pt[1] for pt in box]
            x_min_px = min(xs)
            x_max_px = max(xs)
            y_min_px = min(ys)
            y_max_px = max(ys)

            # Convertir a puntos del PDF original
            x_min_pt = x_min_px * scale_x
            x_max_pt = x_max_px * scale_x
            y_min_pt = y_min_px * scale_y
            y_max_pt = y_max_px * scale_y

            palabras_linea = texto_linea.split()
            if not palabras_linea:
                continue

            total_chars = sum(len(w) for w in palabras_linea)
            ancho_total_linea_pt = max(10.0, x_max_pt - x_min_pt)
            curr_x = x_min_pt

            for word_idx, w in enumerate(palabras_linea):
                # Estimación proporcional del ancho de cada palabra
                frac = len(w) / max(1, total_chars)
                ancho_w_pt = ancho_total_linea_pt * frac
                w_x0 = curr_x
                w_x1 = min(x_max_pt, curr_x + ancho_w_pt)
                w_y0 = y_min_pt
                w_y1 = y_max_pt

                curr_x = w_x1 + (ancho_total_linea_pt * 0.05 / max(1, len(palabras_linea)))

                palabras_finales.append((
                    round(w_x0, 2),
                    round(w_y0, 2),
                    round(w_x1, 2),
                    round(w_y1, 2),
                    w,
                    line_idx,
                    line_idx,
                    word_idx
                ))

        logger.info(f"✅ [OCREngine] OCR completado en página {num_pagina}: {len(palabras_finales)} palabras detectadas.")

        # Guardar en caché
        if cache_file and palabras_finales:
            try:
                with open(cache_file, "w", encoding="utf-8") as f:
                    json.dump(palabras_finales, f, ensure_ascii=False)
            except Exception as e:
                logger.warning(f"⚠️ [OCREngine] No se pudo guardar caché OCR: {e}")

        return palabras_finales

    except Exception as e:
        logger.error(f"❌ [OCREngine] Error durante el procesamiento OCR: {e}")
        return []
