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
from backend.documento.ocr_modelos import (
    IDIOMA_OCR_DEFECTO,
    normalizar_idioma_ocr,
    obtener_rutas_modelo_ocr,
)
from backend.documento.ocr_layout import (
    _ordenar_lineas_dos_columnas,
    _detectar_gutter_dos_columnas,
    _ordenar_lineas_una_columna,
    ordenar_lineas_ocr_lectura,
    _extraer_palabras_desde_char_boxes,
    _peso_char_ocr,
    _extraer_palabras_ponderadas_linea,
    _convertir_lineas_ocr_a_palabras,
)

logger = logging.getLogger("LiraOCREngine")

BASE_PROYECTO = estado_app.base_dir

DIR_OCR_CACHE = os.path.join(BASE_PROYECTO, "lira_db", "ocr_cache")

os.makedirs(DIR_OCR_CACHE, exist_ok=True)

COORD_VERSION = 2



_rapid_ocr_instances: Dict[Tuple[str, str], Any] = {}
_ocr_lock = threading.Lock()


def es_ocr_alta_precision() -> bool:
    """Devuelve True si el modo OCR Alta Precisión está activo en el estado global."""
    return bool(getattr(estado_app, "ocr_alta_precision", False))


def establecer_ocr_alta_precision(activo: bool) -> bool:
    """Actualiza el modo OCR Alta Precisión en el estado global."""
    estado_app.ocr_alta_precision = bool(activo)
    logger.info(
        f"🎯 [OCREngine] Modo OCR actualizado: {'ALTA PRECISIÓN' if estado_app.ocr_alta_precision else 'RÁPIDO'}"
    )
    return estado_app.ocr_alta_precision


def obtener_idioma_ocr() -> str:
    """Devuelve el código de idioma OCR activo en el estado global."""
    return normalizar_idioma_ocr(getattr(estado_app, "ocr_idioma", IDIOMA_OCR_DEFECTO))


def establecer_idioma_ocr(idioma: str) -> str:
    """Actualiza el idioma OCR activo en el estado global."""
    idioma_norm = normalizar_idioma_ocr(idioma)
    estado_app.ocr_idioma = idioma_norm
    logger.info(f"🌐 [OCREngine] Idioma OCR actualizado: {idioma_norm}")
    return idioma_norm


def obtener_dpi_ocr(alta_precision: Optional[bool] = None) -> int:
    """DPI recomendado para renderizar páginas antes de RapidOCR."""
    usar_precision = es_ocr_alta_precision() if alta_precision is None else bool(alta_precision)
    return 220 if usar_precision else 165


def renderizar_pixmap_ocr(pagina, alta_precision: Optional[bool] = None):
    """Helper reutilizable para renderizar una página PyMuPDF al DPI adecuado para OCR."""
    return pagina.get_pixmap(dpi=obtener_dpi_ocr(alta_precision), alpha=False)


def _construir_instancia_rapidocr(
    usar_precision: bool,
    rec_model_path: Optional[str],
    rec_keys_path: Optional[str],
):
    """Instancia RapidOCR ONNX con los parámetros calibrados para el modo solicitado."""
    from rapidocr_onnxruntime import RapidOCR

    kwargs = {
        "use_cls": False,
        "det_limit_side_len": 2400 if usar_precision else 1920,
        "det_db_thresh": 0.2,
        "det_db_box_thresh": 0.25,
        "det_db_unclip_ratio": 1.5,
        "text_score": 0.3,
        "rec_batch_num": 12,
        "intra_op_num_threads": min(8, os.cpu_count() or 4),
    }
    if rec_model_path and rec_keys_path:
        kwargs["rec_model_path"] = rec_model_path
        kwargs["rec_keys_path"] = rec_keys_path

    try:
        return RapidOCR(**kwargs)
    except TypeError:
        return RapidOCR()


def _get_ocr_engine(alta_precision: Optional[bool] = None, idioma: Optional[str] = None):
    """Inicialización bajo demanda (Lazy Loading) de RapidOCR por (modo, idioma)."""
    usar_precision = es_ocr_alta_precision() if alta_precision is None else bool(alta_precision)
    clave_modo = "precision" if usar_precision else "rapido"
    idioma_norm = obtener_idioma_ocr() if idioma is None else normalizar_idioma_ocr(idioma)
    cache_key = (clave_modo, idioma_norm)

    if _rapid_ocr_instances.get(cache_key) is None:
        # Descargar modelo fuera del lock de inferencia si hace falta
        rec_model_path, rec_keys_path = obtener_rutas_modelo_ocr(idioma_norm)

        with _ocr_lock:
            if _rapid_ocr_instances.get(cache_key) is None:
                try:
                    _rapid_ocr_instances[cache_key] = _construir_instancia_rapidocr(
                        usar_precision, rec_model_path, rec_keys_path
                    )

                    # Mantener acotada la RAM si el usuario cambia entre muchos idiomas
                    if len(_rapid_ocr_instances) > 4:
                        for k_vieja in list(_rapid_ocr_instances.keys()):
                            if k_vieja != cache_key:
                                _rapid_ocr_instances.pop(k_vieja, None)
                                break

                    logger.info(
                        f"✅ [OCREngine] RapidOCR ONNX ({clave_modo}, {idioma_norm}) cargado exitosamente."
                    )
                except Exception as e:
                    logger.error(f"❌ [OCREngine] No se pudo cargar RapidOCR ({clave_modo}, {idioma_norm}): {e}")
                    _rapid_ocr_instances[cache_key] = None

    return _rapid_ocr_instances.get(cache_key)


def _preparar_imagen_ocr(img, alta_precision: bool):
    """Reescala la imagen preservando su nitidez original sin sobre-procesarla."""
    import cv2

    orig_h, orig_w = img.shape[:2]
    max_dim = 2600 if alta_precision else 2200

    if max(orig_w, orig_h) > max_dim:
        ratio = max_dim / float(max(orig_w, orig_h))
        opt_w = max(32, int(orig_w * ratio))
        opt_h = max(32, int(orig_h * ratio))
        img_opt = cv2.resize(img, (opt_w, opt_h), interpolation=cv2.INTER_AREA)
    else:
        img_opt = img
        opt_w, opt_h = orig_w, orig_h

    return img_opt, opt_w, opt_h





def _generar_clave_cache(doc_path: str, num_pagina: int) -> str:
    """Genera un nombre de archivo único y estable para la caché de OCR de una página."""
    if not doc_path:
        path_norm = "doc_anonimo"
    else:
        path_norm = os.path.abspath(doc_path).lower().replace("\\", "/")
    raw = f"{path_norm}_{num_pagina}"
    doc_hash = hashlib.md5(raw.encode("utf-8")).hexdigest()[:16]
    return f"ocr_{doc_hash}_p{num_pagina}.json"


def _cache_cumple_modo(
    data: dict, alta_precision: Optional[bool] = None, idioma: Optional[str] = None
) -> bool:
    """Valida que la caché corresponda al idioma OCR vigente y al nivel de precisión."""
    idioma_esperado = obtener_idioma_ocr() if idioma is None else normalizar_idioma_ocr(idioma)
    if data.get("idioma_ocr") != idioma_esperado:
        return False
    usar_precision = es_ocr_alta_precision() if alta_precision is None else bool(alta_precision)
    if not usar_precision:
        return True
    return data.get("modo_ocr") == "precision"


def esta_en_cache_ocr(doc_path: str, num_pagina: int, alta_precision: Optional[bool] = None) -> bool:
    """Comprueba si una página ya cuenta con reconocimiento OCR guardado con coord_version y modo vigente."""
    if not doc_path:
        return False
    cache_file = os.path.join(DIR_OCR_CACHE, _generar_clave_cache(doc_path, num_pagina))
    if not os.path.exists(cache_file):
        return False
    try:
        with open(cache_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        return (
            isinstance(data, dict)
            and data.get("coord_version") == COORD_VERSION
            and isinstance(data.get("palabras"), list)
            and _cache_cumple_modo(data, alta_precision)
        )
    except Exception:
        return False


def obtener_palabras_cache_ocr(
    doc_path: str, num_pagina: int, alta_precision: Optional[bool] = None
) -> Optional[List[Tuple[float, float, float, float, str, int, int, int]]]:
    """Obtiene las palabras guardadas en la caché OCR para una página si tienen coord_version y modo vigente."""
    if not doc_path:
        return None
    cache_file = os.path.join(DIR_OCR_CACHE, _generar_clave_cache(doc_path, num_pagina))
    if not os.path.exists(cache_file):
        return None
    try:
        with open(cache_file, "r", encoding="utf-8") as f:
            cached_data = json.load(f)
        if (
            not isinstance(cached_data, dict)
            or cached_data.get("coord_version") != COORD_VERSION
            or not _cache_cumple_modo(cached_data, alta_precision)
        ):
            return None
        return [tuple(item) for item in cached_data.get("palabras", [])]
    except Exception as e:
        logger.warning(f"⚠️ [OCREngine] Error leyendo caché OCR para página {num_pagina}: {e}")
        return None


def guardar_palabras_cache_ocr(
    doc_path: str,
    num_pagina: int,
    palabras: List[Tuple],
    modo_ocr: Optional[str] = None,
    idioma_ocr: Optional[str] = None,
) -> bool:
    """Guarda una lista de palabras en la caché OCR de una página con coord_version, modo_ocr e idioma_ocr."""
    if not doc_path or not palabras:
        return False
    cache_file = os.path.join(DIR_OCR_CACHE, _generar_clave_cache(doc_path, num_pagina))
    modo_final = modo_ocr or ("precision" if es_ocr_alta_precision() else "rapido")
    idioma_final = obtener_idioma_ocr() if idioma_ocr is None else normalizar_idioma_ocr(idioma_ocr)
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "coord_version": COORD_VERSION,
                    "modo_ocr": modo_final,
                    "idioma_ocr": idioma_final,
                    "palabras": palabras,
                },
                f,
                ensure_ascii=False,
            )
        return True
    except Exception as e:
        logger.warning(f"⚠️ [OCREngine] Error guardando caché OCR para página {num_pagina}: {e}")
        return False


def _generar_palabras_ocr_linea(nuevo_texto: str, bbox_original: list, nuevo_bbox: list, target_idx: int) -> list:
    """Distribuye las palabras de nuevo_texto dentro del bbox de la línea editada para caché OCR."""
    texto_limpio = nuevo_texto.strip()
    if not texto_limpio:
        return []
    partes = texto_limpio.split()
    if not partes:
        return []

    if bbox_original and len(bbox_original) == 4:
        bx0, by0, bx1, by1 = float(bbox_original[0]), float(bbox_original[1]), float(bbox_original[2]), float(bbox_original[3])
    elif nuevo_bbox and len(nuevo_bbox) == 4:
        bx0, by0, bx1, by1 = float(nuevo_bbox[0]), float(nuevo_bbox[1]), float(nuevo_bbox[2]), float(nuevo_bbox[3])
    else:
        bx0, by0, bx1, by1 = 50.0, 50.0, 200.0, 70.0

    total_chars = sum(len(w) for w in partes)
    ancho_total = max(10.0, bx1 - bx0)
    curr_x = bx0
    nuevas_palabras = []

    for w_idx, w in enumerate(partes):
        frac = len(w) / max(1, total_chars)
        ancho_w = ancho_total * frac
        w_x0 = curr_x
        w_x1 = min(bx1, curr_x + ancho_w)
        curr_x = w_x1 + (ancho_total * 0.05 / max(1, len(partes)))

        nuevas_palabras.append((
            round(w_x0, 2),
            round(by0, 2),
            round(w_x1, 2),
            round(by1, 2),
            w,
            target_idx,
            target_idx,
            w_idx,
        ))
    return nuevas_palabras


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
    nuevas_palabras = _generar_palabras_ocr_linea(nuevo_texto, bbox_original, nuevo_bbox, target_idx)

    todas = palabras_restantes + nuevas_palabras
    # Ordenar por orden de lectura
    todas.sort(key=lambda item: (int(item[1] / 10), item[0]))

    return guardar_palabras_cache_ocr(doc_path, num_pagina, todas)


def _ejecutar_inferencia_ocr_con_lock(
    engine,
    pixmap_bytes: bytes,
    img,
    ancho_px: int,
    alto_px: int,
    doc_path: str,
    num_pagina: int,
    forzar: bool,
    usar_precision: bool,
):
    """Ejecuta inferencia RapidOCR bajo `_ocr_lock` con doble verificación de caché."""
    if img is None:
        entrada = pixmap_bytes
        opt_w, opt_h = ancho_px, alto_px
    else:
        entrada, opt_w, opt_h = _preparar_imagen_ocr(img, usar_precision)

    with _ocr_lock:
        if not forzar and doc_path:
            palabras_cached = obtener_palabras_cache_ocr(doc_path, num_pagina, alta_precision=usar_precision)
            if palabras_cached is not None:
                return None, palabras_cached, opt_w, opt_h
        if img is None:
            ocr_result, _ = engine(entrada)
        else:
            try:
                ocr_result, _ = engine(entrada, return_word_box=True)
            except TypeError:
                ocr_result, _ = engine(entrada)
    return ocr_result, None, opt_w, opt_h


def procesar_ocr_pagina(

    pixmap_bytes: bytes,

    ancho_pdf: float,

    alto_pdf: float,

    ancho_px: int,

    alto_px: int,

    doc_path: str = "",

    num_pagina: int = 0,

    forzar: bool = False,

    alta_precision: Optional[bool] = None

) -> List[Tuple[float, float, float, float, str, int, int, int]]:

    """

    Ejecuta OCR sobre la imagen de una página y devuelve una lista de palabras con formato idéntico a fitz.get_text('words'):

    (x0, y0, x1, y1, palabra, block_no, line_no, word_no)

    en coordenadas de puntos del PDF.

    """
    usar_precision = es_ocr_alta_precision() if alta_precision is None else bool(alta_precision)
    modo_ocr = "precision" if usar_precision else "rapido"
    idioma_ocr = obtener_idioma_ocr()

    # 1. Verificar si ya está en caché con coord_version, idioma y modo vigente
    if not forzar and doc_path:
        palabras_cached = obtener_palabras_cache_ocr(doc_path, num_pagina, alta_precision=usar_precision)
        if palabras_cached is not None:
            logger.info(f"⚡ [OCREngine] Página {num_pagina} recuperada desde caché OCR ({len(palabras_cached)} palabras).")
            return palabras_cached

    engine = _get_ocr_engine(alta_precision=usar_precision, idioma=idioma_ocr)

    if engine is None:
        logger.warning("⚠️ [OCREngine] RapidOCR no está disponible.")
        return []

    logger.info(
        f"🔍 [OCREngine] Ejecutando RapidOCR ({modo_ocr}, {idioma_ocr}) en página {num_pagina} ({ancho_px}x{alto_px}px)..."
    )

    try:
        import numpy as np
        import cv2

        # Decodificar imagen para optimización de resolución
        nparr = np.frombuffer(pixmap_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        ocr_result, palabras_cached, opt_w, opt_h = _ejecutar_inferencia_ocr_con_lock(
            engine, pixmap_bytes, img, ancho_px, alto_px, doc_path, num_pagina, forzar, usar_precision
        )
        if palabras_cached is not None:
            return palabras_cached



        if not ocr_result:

            logger.info(f"ℹ️ [OCREngine] No se detectó texto en la página {num_pagina}.")

            return []



        scale_x = ancho_pdf / max(1.0, float(opt_w))

        scale_y = alto_pdf / max(1.0, float(opt_h))



        ocr_result_ordenado = ordenar_lineas_ocr_lectura(ocr_result, scale_x, scale_y, ancho_pdf, alto_pdf)



        palabras_finales = _convertir_lineas_ocr_a_palabras(ocr_result_ordenado, scale_x, scale_y)

        logger.info(f"✅ [OCREngine] OCR completado en página {num_pagina}: {len(palabras_finales)} palabras detectadas.")

        # Guardar en caché con coord_version, modo_ocr e idioma_ocr vigente
        if doc_path and palabras_finales:
            guardar_palabras_cache_ocr(
                doc_path, num_pagina, palabras_finales, modo_ocr=modo_ocr, idioma_ocr=idioma_ocr
            )



        return palabras_finales



    except Exception as e:

        logger.error(f"❌ [OCREngine] Error durante el procesamiento OCR: {e}")

        return []

