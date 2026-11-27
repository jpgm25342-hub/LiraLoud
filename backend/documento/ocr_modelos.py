# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

"""
Gestor modular de modelos ONNX multilingües para RapidOCR.
Descarga bajo demanda modelos de reconocimiento (PP-OCR ONNX + diccionario)
en `lira_db/ocr_models/<idioma>/` con escritura atómica y fallback seguro.
"""

import os
import logging
import threading
import urllib.request
from typing import Dict, List, Optional, Tuple

from backend.core.estado_global import estado_app

logger = logging.getLogger("LiraOCRModelos")

DIR_OCR_MODELOS = os.path.join(estado_app.base_dir, "lira_db", "ocr_models")
os.makedirs(DIR_OCR_MODELOS, exist_ok=True)

HF_BASE_URL = "https://huggingface.co/monkt/paddleocr-onnx/resolve/main/languages"
IDIOMA_OCR_DEFECTO = "latin"

CATALOGO_IDIOMAS_OCR: Dict[str, Dict[str, str]] = {
    "latin": {
        "nombre": "Latino (ES, EN, FR, DE, PT, IT...)",
        "carpeta": "latin",
    },
    "english": {
        "nombre": "Inglés (EN)",
        "carpeta": "english",
    },
    "chinese": {
        "nombre": "Chino / Multilingüe integrado (ZH)",
        "carpeta": "",  # Usa el modelo ch_PP-OCRv4_rec incluido en rapidocr_onnxruntime
    },
    "eslav": {
        "nombre": "Cirílico (RU, UK, BG...)",
        "carpeta": "eslav",
    },
    "arabic": {
        "nombre": "Árabe (AR, FA, UR)",
        "carpeta": "arabic",
    },
    "hindi": {
        "nombre": "Devanagari (HI, MR, NE)",
        "carpeta": "hindi",
    },
    "korean": {
        "nombre": "Coreano (KO)",
        "carpeta": "korean",
    },
    "greek": {
        "nombre": "Griego (EL)",
        "carpeta": "greek",
    },
    "thai": {
        "nombre": "Tailandés (TH)",
        "carpeta": "thai",
    },
}

_download_lock = threading.Lock()


def normalizar_idioma_ocr(idioma: Optional[str]) -> str:
    """Valida y normaliza un código de idioma OCR contra el catálogo soportado."""
    clave = (idioma or "").strip().lower()
    if clave in CATALOGO_IDIOMAS_OCR:
        return clave
    return IDIOMA_OCR_DEFECTO


def _rutas_locales_modelo(idioma: str) -> Tuple[str, str]:
    carpeta = os.path.join(DIR_OCR_MODELOS, idioma)
    return os.path.join(carpeta, "rec.onnx"), os.path.join(carpeta, "dict.txt")


def modelo_ocr_descargado(idioma: str) -> bool:
    """Devuelve True si el modelo ONNX y su diccionario ya están disponibles localmente."""
    clave = normalizar_idioma_ocr(idioma)
    if not CATALOGO_IDIOMAS_OCR[clave]["carpeta"]:
        return True
    rec_path, dict_path = _rutas_locales_modelo(clave)
    return (
        os.path.isfile(rec_path)
        and os.path.getsize(rec_path) > 100_000
        and os.path.isfile(dict_path)
        and os.path.getsize(dict_path) > 10
    )


def listar_idiomas_ocr() -> List[Dict[str, object]]:
    """Lista los idiomas OCR soportados y si su modelo está listo localmente."""
    return [
        {
            "id": clave,
            "nombre": info["nombre"],
            "descargado": modelo_ocr_descargado(clave),
        }
        for clave, info in CATALOGO_IDIOMAS_OCR.items()
    ]


def _descargar_archivo_atomico(url: str, destino: str, timeout: int = 45) -> bool:
    """Descarga un archivo a un temporal y lo mueve atómicamente al destino final."""
    tmp_path = f"{destino}.tmp"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "LiraLoud-OCR/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp, open(tmp_path, "wb") as out:
            while True:
                bloque = resp.read(65536)
                if not bloque:
                    break
                out.write(bloque)
        os.replace(tmp_path, destino)
        return True
    except Exception as e:
        logger.warning(f"⚠️ [OCRModelos] Error descargando {url}: {e}")
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass
        return False


def obtener_rutas_modelo_ocr(
    idioma: Optional[str], descargar_si_falta: bool = True
) -> Tuple[Optional[str], Optional[str]]:
    """
    Devuelve `(rec_model_path, rec_keys_path)` para el idioma indicado.
    Retorna `(None, None)` para usar el modelo chino/multilingüe integrado de RapidOCR
    o como fallback seguro si no hay conexión / privacidad estricta está activa.
    """
    clave = normalizar_idioma_ocr(idioma)
    carpeta_remota = CATALOGO_IDIOMAS_OCR[clave]["carpeta"]
    if not carpeta_remota:
        return None, None

    rec_path, dict_path = _rutas_locales_modelo(clave)
    if modelo_ocr_descargado(clave):
        return rec_path, dict_path

    if not descargar_si_falta:
        return None, None

    if getattr(estado_app, "modo_privacidad_estricta", False):
        logger.info(
            f"🔒 [OCRModelos] Privacidad estricta activa: se omite descarga de modelo '{clave}'."
        )
        return None, None

    with _download_lock:
        if modelo_ocr_descargado(clave):
            return rec_path, dict_path

        os.makedirs(os.path.dirname(rec_path), exist_ok=True)
        logger.info(f"⬇️ [OCRModelos] Descargando modelo OCR '{clave}' desde HuggingFace...")

        ok_rec = _descargar_archivo_atomico(f"{HF_BASE_URL}/{carpeta_remota}/rec.onnx", rec_path)
        ok_dict = ok_rec and _descargar_archivo_atomico(
            f"{HF_BASE_URL}/{carpeta_remota}/dict.txt", dict_path
        )

        if ok_rec and ok_dict and modelo_ocr_descargado(clave):
            logger.info(f"✅ [OCRModelos] Modelo OCR '{clave}' listo en {os.path.dirname(rec_path)}.")
            return rec_path, dict_path

        logger.warning(
            f"⚠️ [OCRModelos] No se pudo obtener modelo '{clave}'. Usando modelo integrado de respaldo."
        )
        return None, None
