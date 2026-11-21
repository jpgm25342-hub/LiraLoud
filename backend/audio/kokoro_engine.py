# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

"""
=============================================================================
LIRALOUD - MOTOR NEURONAL KOKORO-82M v1.0 ONNX CON TIMESTAMPS EXACTOS
=============================================================================
Integración nativa y autónoma de Kokoro-82M-v1.0-ONNX-timestamped
(https://huggingface.co/shawnahmed/Kokoro-82M-v1.0-ONNX-timestamped)

Características:
1. Inferencia ONNX local de alta fidelidad acústica a 24,000 Hz.
2. Extracción directa del tensor `pred_dur` (duración exacta en frames por token)
   para sincronización de karaoke al milisegundo sin costo adicional de cómputo.
3. Fonemización contextual por cláusula completa mediante `piper.espeakbridge`
   preservando coarticulación natural (sinalefas, alófonos fricativos, acentos)
   con alineación monótona exacta hacia cada palabra visual del documento.
4. Descarga automática bajo demanda desde HuggingFace Hub de los modelos y
   vectores de estilo (.bin) con soporte completo para ejecución offline una vez
   descargados en `kokoro_models/`.
5. Soporte para múltiples idiomas (Español, Inglés US/UK, Francés, Italiano,
   Portugués, Japonés, Chino, Hindi) y mezcla vectorial de voces (Voice Blending).
=============================================================================
"""

import os
import re
import sys
import time
import json
import logging
import threading
from typing import Dict, List, Any, Optional, Tuple

import numpy as np
import onnxruntime as ort

logger = logging.getLogger("LiraKokoroEngine")

# Desactivar advertencia de symlinks de HuggingFace en Windows
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DIRECTORIO_KOKORO = os.path.join(BASE_DIR, "kokoro_models")
HF_REPO_ID = "shawnahmed/Kokoro-82M-v1.0-ONNX-timestamped"
KOKORO_SAMPLE_RATE = 24000
KOKORO_HOP_SAMPLES = 600  # 600 muestras por frame a 24kHz = 25ms por frame

# Voces individuales base disponibles para mezclar en el Voice Lab (55 voces oficiales)
VOCES_KOKORO_DISPONIBLES_PARA_BLEND = [
    # --- ESPAÑOL (es) ---
    {"key": "ef_dora", "nombre": "Dora (Español · Femenina Clara)", "lang": "es", "categoria": "Español"},
    {"key": "em_alex", "nombre": "Alex (Español · Masculina Estándar)", "lang": "es", "categoria": "Español"},
    {"key": "em_santa", "nombre": "Santa (Español · Masculina Profunda)", "lang": "es", "categoria": "Español"},

    # --- INGLÉS AMERICANO · FEMENINAS (af_) ---
    {"key": "af_heart", "nombre": "Heart (⭐ Insignia · Ultra Natural)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_bella", "nombre": "Bella (Cálida · Audiolibros)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_nicole", "nombre": "Nicole (Suave / ASMR · Relajante)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_sarah", "nombre": "Sarah (Formal · Articulada)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_nova", "nombre": "Nova (Dinámica · Juvenil)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_sky", "nombre": "Sky (Fresca · Enérgica)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_alloy", "nombre": "Alloy (Neutra · Asistente)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_jessica", "nombre": "Jessica (Madura · Expresiva)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_river", "nombre": "River (Pausada · Profunda)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_aoede", "nombre": "Aoede (Melódica · Teatral)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_kore", "nombre": "Kore (Serena · Equilibrada)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af", "nombre": "Default Female (Original)", "lang": "en", "categoria": "Inglés US · Femeninas"},

    # --- INGLÉS AMERICANO · MASCULINAS (am_) ---
    {"key": "am_adam", "nombre": "Adam (Locutor de Noticias · Firme)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_michael", "nombre": "Michael (Corporativo · Serio)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_fenrir", "nombre": "Fenrir (Grave · Épico / Tráiler)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_echo", "nombre": "Echo (Resonante · Teatral)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_eric", "nombre": "Eric (Conversacional · Cercano)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_liam", "nombre": "Liam (Joven · Dinámico)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_onyx", "nombre": "Onyx (Muy Grave · Cinematográfico)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_puck", "nombre": "Puck (Enérgico · Jovial)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_santa", "nombre": "Santa (Maduro · Profundo)", "lang": "en", "categoria": "Inglés US · Masculinas"},

    # --- INGLÉS BRITÁNICO · FEMENINAS (bf_) ---
    {"key": "bf_emma", "nombre": "Emma (Británica · Refinada / Audiolibros)", "lang": "en", "categoria": "Inglés Británico · Femeninas"},
    {"key": "bf_isabella", "nombre": "Isabella (Británica · Poética)", "lang": "en", "categoria": "Inglés Británico · Femeninas"},
    {"key": "bf_alice", "nombre": "Alice (Británica · Estilo BBC)", "lang": "en", "categoria": "Inglés Británico · Femeninas"},
    {"key": "bf_lily", "nombre": "Lily (Británica · Pedagógica)", "lang": "en", "categoria": "Inglés Británico · Femeninas"},

    # --- INGLÉS BRITÁNICO · MASCULINAS (bm_) ---
    {"key": "bm_george", "nombre": "George (Británico · Documental Clásico)", "lang": "en", "categoria": "Inglés Británico · Masculinas"},
    {"key": "bm_fable", "nombre": "Fable (Británico · Cuentos / Narrativa)", "lang": "en", "categoria": "Inglés Británico · Masculinas"},
    {"key": "bm_lewis", "nombre": "Lewis (Británico · Sobrio / Académico)", "lang": "en", "categoria": "Inglés Británico · Masculinas"},
    {"key": "bm_daniel", "nombre": "Daniel (Británico · Conversacional)", "lang": "en", "categoria": "Inglés Británico · Masculinas"},

    # --- PORTUGUÉS (pf_ / pm_) ---
    {"key": "pf_dora", "nombre": "Dora (Portugués · Femenina)", "lang": "pt", "categoria": "Portugués"},
    {"key": "pm_alex", "nombre": "Alex (Portugués · Masculina)", "lang": "pt", "categoria": "Portugués"},
    {"key": "pm_santa", "nombre": "Santa (Portugués · Profunda)", "lang": "pt", "categoria": "Portugués"},

    # --- ITALIANO (if_ / im_) ---
    {"key": "if_sara", "nombre": "Sara (Italiano · Femenina)", "lang": "it", "categoria": "Italiano"},
    {"key": "im_nicola", "nombre": "Nicola (Italiano · Masculina)", "lang": "it", "categoria": "Italiano"},

    # --- FRANCÉS (ff_) ---
    {"key": "ff_siwis", "nombre": "Siwis (Francés · Femenina)", "lang": "fr", "categoria": "Francés"},

    # --- JAPONÉS (jf_ / jm_) ---
    {"key": "jf_alpha", "nombre": "Alpha (Japonés · Femenina)", "lang": "ja", "categoria": "Japonés"},
    {"key": "jf_gongitsune", "nombre": "Gongitsune (Japonés · Cuentos)", "lang": "ja", "categoria": "Japonés"},
    {"key": "jf_nezumi", "nombre": "Nezumi (Japonés · Caracterizada)", "lang": "ja", "categoria": "Japonés"},
    {"key": "jf_tebukuro", "nombre": "Tebukuro (Japonés · Suave)", "lang": "ja", "categoria": "Japonés"},
    {"key": "jm_kumo", "nombre": "Kumo (Japonés · Masculina)", "lang": "ja", "categoria": "Japonés"},

    # --- CHINO MANDARÍN (zf_ / zm_) ---
    {"key": "zf_xiaoxiao", "nombre": "Xiaoxiao (Chino Mandarín · Femenina)", "lang": "zh", "categoria": "Chino Mandarín"},
    {"key": "zf_xiaobei", "nombre": "Xiaobei (Chino Mandarín · Femenina Cálida)", "lang": "zh", "categoria": "Chino Mandarín"},
    {"key": "zf_xiaoni", "nombre": "Xiaoni (Chino Mandarín · Femenina Suave)", "lang": "zh", "categoria": "Chino Mandarín"},
    {"key": "zf_xiaoyi", "nombre": "Xiaoyi (Chino Mandarín · Femenina Expresiva)", "lang": "zh", "categoria": "Chino Mandarín"},
    {"key": "zm_yunxi", "nombre": "Yunxi (Chino Mandarín · Masculina Natural)", "lang": "zh", "categoria": "Chino Mandarín"},
    {"key": "zm_yunjian", "nombre": "Yunjian (Chino Mandarín · Masculina Narrativa)", "lang": "zh", "categoria": "Chino Mandarín"},
    {"key": "zm_yunxia", "nombre": "Yunxia (Chino Mandarín · Masculina Dinámica)", "lang": "zh", "categoria": "Chino Mandarín"},
    {"key": "zm_yunyang", "nombre": "Yunyang (Chino Mandarín · Masculina Formal)", "lang": "zh", "categoria": "Chino Mandarín"},

    # --- HINDI (hf_ / hm_) ---
    {"key": "hf_alpha", "nombre": "Alpha (Hindi · Femenina)", "lang": "hi", "categoria": "Hindi"},
    {"key": "hf_beta", "nombre": "Beta (Hindi · Femenina)", "lang": "hi", "categoria": "Hindi"},
    {"key": "hm_omega", "nombre": "Omega (Hindi · Masculina)", "lang": "hi", "categoria": "Hindi"},
    {"key": "hm_psi", "nombre": "Psi (Hindi · Masculina)", "lang": "hi", "categoria": "Hindi"},
]

def obtener_catalogo_base_kokoro() -> List[Dict[str, str]]:
    """Devuelve las voces individuales disponibles para mezclar en la interfaz."""
    return VOCES_KOKORO_DISPONIBLES_PARA_BLEND
# El ID comienza con "Local- {lang}-kokoro-{voice_key}" (sin espacio) -> "Local-{lang}-kokoro-{voice_key}"
# para integrarse de forma transparente con todos los filtros de idioma y motores locales de LiraLoud.
VOCES_KOKORO_CATALOGO: List[Dict[str, str]] = [
    # --- ESPAÑOL (es) ---
    {
        "id": "Local-es-kokoro-ef_dora",
        "voice_key": "ef_dora",
        "lang": "es",
        "espeak_voice": "es",
        "nombre": "⚡ 🧠 Kokoro: Dora (Español · Femenina)",
    },
    {
        "id": "Local-es-kokoro-em_alex",
        "voice_key": "em_alex",
        "lang": "es",
        "espeak_voice": "es",
        "nombre": "⚡ 🧠 Kokoro: Alex (Español · Masculina)",
    },
    {
        "id": "Local-es-kokoro-em_santa",
        "voice_key": "em_santa",
        "lang": "es",
        "espeak_voice": "es",
        "nombre": "⚡ 🧠 Kokoro: Santa (Español · Profunda)",
    },
    {
        "id": "Local-es-kokoro-ef_dora_latam",
        "voice_key": "ef_dora",
        "lang": "es",
        "espeak_voice": "es-419",
        "nombre": "⚡ 🧠 Kokoro: Dora LatAm (Español Neutro · Femenina)",
    },
    {
        "id": "Local-es-kokoro-em_alex_latam",
        "voice_key": "em_alex",
        "lang": "es",
        "espeak_voice": "es-419",
        "nombre": "⚡ 🧠 Kokoro: Alex LatAm (Español Neutro · Masculina)",
    },
    {
        "id": "Local-es-kokoro-blend_dora_bella",
        "voice_key": "ef_dora:0.7+af_bella:0.3",
        "lang": "es",
        "espeak_voice": "es-419",
        "nombre": "⚡ 🧠 Kokoro: Lira Studio (Español Cálida · Blend)",
    },

    # --- INGLÉS (en) ---
    {
        "id": "Local-en-kokoro-af_heart",
        "voice_key": "af_heart",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Heart ⭐ (English US · Female)",
    },
    {
        "id": "Local-en-kokoro-af_bella",
        "voice_key": "af_bella",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Bella (English US · Female)",
    },
    {
        "id": "Local-en-kokoro-af_nicole",
        "voice_key": "af_nicole",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Nicole (English US · Whisper/ASMR)",
    },
    {
        "id": "Local-en-kokoro-af_sarah",
        "voice_key": "af_sarah",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Sarah (English US · Female)",
    },
    {
        "id": "Local-en-kokoro-af_nova",
        "voice_key": "af_nova",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Nova (English US · Female)",
    },
    {
        "id": "Local-en-kokoro-am_michael",
        "voice_key": "am_michael",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Michael (English US · Male)",
    },
    {
        "id": "Local-en-kokoro-am_adam",
        "voice_key": "am_adam",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Adam (English US · Male)",
    },
    {
        "id": "Local-en-kokoro-am_fenrir",
        "voice_key": "am_fenrir",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Fenrir (English US · Male)",
    },
    {
        "id": "Local-en-kokoro-am_puck",
        "voice_key": "am_puck",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Puck (English US · Male)",
    },
    {
        "id": "Local-en-kokoro-bf_emma",
        "voice_key": "bf_emma",
        "lang": "en",
        "espeak_voice": "en-gb",
        "nombre": "⚡ 🧠 Kokoro: Emma (English UK · Female)",
    },
    {
        "id": "Local-en-kokoro-bf_isabella",
        "voice_key": "bf_isabella",
        "lang": "en",
        "espeak_voice": "en-gb",
        "nombre": "⚡ 🧠 Kokoro: Isabella (English UK · Female)",
    },
    {
        "id": "Local-en-kokoro-bm_george",
        "voice_key": "bm_george",
        "lang": "en",
        "espeak_voice": "en-gb",
        "nombre": "⚡ 🧠 Kokoro: George (English UK · Male)",
    },
    {
        "id": "Local-en-kokoro-bm_lewis",
        "voice_key": "bm_lewis",
        "lang": "en",
        "espeak_voice": "en-gb",
        "nombre": "⚡ 🧠 Kokoro: Lewis (English UK · Male)",
    },

    # --- FRANCÉS (fr) ---
    {
        "id": "Local-fr-kokoro-ff_siwis",
        "voice_key": "ff_siwis",
        "lang": "fr",
        "espeak_voice": "fr-fr",
        "nombre": "⚡ 🧠 Kokoro: Siwis (Français · Féminin)",
    },

    # --- ITALIANO (it) ---
    {
        "id": "Local-it-kokoro-if_sara",
        "voice_key": "if_sara",
        "lang": "it",
        "espeak_voice": "it",
        "nombre": "⚡ 🧠 Kokoro: Sara (Italiano · Femminile)",
    },
    {
        "id": "Local-it-kokoro-im_nicola",
        "voice_key": "im_nicola",
        "lang": "it",
        "espeak_voice": "it",
        "nombre": "⚡ 🧠 Kokoro: Nicola (Italiano · Maschile)",
    },

    # --- PORTUGUÉS (pt) ---
    {
        "id": "Local-pt-kokoro-pf_dora",
        "voice_key": "pf_dora",
        "lang": "pt",
        "espeak_voice": "pt-br",
        "nombre": "⚡ 🧠 Kokoro: Dora (Português BR · Feminina)",
    },
    {
        "id": "Local-pt-kokoro-pm_alex",
        "voice_key": "pm_alex",
        "lang": "pt",
        "espeak_voice": "pt-br",
        "nombre": "⚡ 🧠 Kokoro: Alex (Português BR · Masculina)",
    },
    {
        "id": "Local-pt-kokoro-pm_santa",
        "voice_key": "pm_santa",
        "lang": "pt",
        "espeak_voice": "pt-br",
        "nombre": "⚡ 🧠 Kokoro: Santa (Português BR · Profunda)",
    },

    # --- JAPONÉS (ja) ---
    {
        "id": "Local-ja-kokoro-jf_alpha",
        "voice_key": "jf_alpha",
        "lang": "ja",
        "espeak_voice": "ja",
        "nombre": "⚡ 🧠 Kokoro: Alpha (日本語 · 女性)",
    },
    {
        "id": "Local-ja-kokoro-jm_kumo",
        "voice_key": "jm_kumo",
        "lang": "ja",
        "espeak_voice": "ja",
        "nombre": "⚡ 🧠 Kokoro: Kumo (日本語 · 男性)",
    },

    # --- CHINO MANDARÍN (zh) ---
    {
        "id": "Local-zh-kokoro-zf_xiaoxiao",
        "voice_key": "zf_xiaoxiao",
        "lang": "zh",
        "espeak_voice": "cmn",
        "nombre": "⚡ 🧠 Kokoro: Xiaoxiao (中文 · 女声)",
    },
    {
        "id": "Local-zh-kokoro-zm_yunxi",
        "voice_key": "zm_yunxi",
        "lang": "zh",
        "espeak_voice": "cmn",
        "nombre": "⚡ 🧠 Kokoro: Yunxi (中文 · 男声)",
    },

    # --- HINDI (hi) ---
    {
        "id": "Local-hi-kokoro-hf_alpha",
        "voice_key": "hf_alpha",
        "lang": "hi",
        "espeak_voice": "hi",
        "nombre": "⚡ 🧠 Kokoro: Alpha (हिन्दी · Female)",
    },
    {
        "id": "Local-hi-kokoro-hm_omega",
        "voice_key": "hm_omega",
        "lang": "hi",
        "espeak_voice": "hi",
        "nombre": "⚡ 🧠 Kokoro: Omega (हिन्दी · Male)",
    },
]

MAPA_VOCES_KOKORO: Dict[str, Dict[str, str]] = {
    v["id"]: v for v in VOCES_KOKORO_CATALOGO
}


def es_voz_kokoro(voz_id: str) -> bool:
    """Determina si un identificador de voz pertenece al motor Kokoro-82M."""
    if not voz_id or not isinstance(voz_id, str):
        return False
    return "-kokoro-" in voz_id or voz_id.startswith("Kokoro-")


class KokoroTimestampEngine:
    """
    Motor singleton thread-safe para Kokoro-82M ONNX con soporte de `pred_dur` (timestamps).
    """

    def __init__(self, models_dir: Optional[str] = None):
        self.models_dir = models_dir or DIRECTORIO_KOKORO
        os.makedirs(self.models_dir, exist_ok=True)
        os.makedirs(os.path.join(self.models_dir, "voices"), exist_ok=True)
        os.makedirs(os.path.join(self.models_dir, "onnx"), exist_ok=True)

        self._lock = threading.RLock()
        self._espeak_lock = threading.Lock()
        self._espeak_initialized = False

        self.session: Optional[ort.InferenceSession] = None
        self.vocab: Dict[str, int] = {}
        self.voices_cache: Dict[str, np.ndarray] = {}
        self.model_variant = "onnx/model.onnx"  # FP32 timestamped: máxima calidad acústica y ~10x más rápido en CPU AVX2/AVX-512 que int8 dinámico

    def _init_espeak(self) -> None:
        if self._espeak_initialized:
            return
        with self._espeak_lock:
            if self._espeak_initialized:
                return
            from piper import espeakbridge
            from piper.phonemize_espeak import ESPEAK_DATA_DIR

            data_dir = os.environ.get("ESPEAK_DATA_PATH") or str(ESPEAK_DATA_DIR)
            espeakbridge.initialize(str(data_dir))
            self._espeak_initialized = True

    def _asegurar_archivo_hf(self, rel_path: str, log_callback=None) -> str:
        """
        Verifica si el archivo existe en `kokoro_models/`. Si no existe, lo descarga
        desde HuggingFace (`shawnahmed/Kokoro-82M-v1.0-ONNX-timestamped`) y lo guarda localmente.
        """
        local_path = os.path.join(self.models_dir, *rel_path.split("/"))
        if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
            return local_path

        if log_callback:
            try:
                log_callback(f"Descargando componente Kokoro: {rel_path}...")
            except Exception:
                pass

        print(f"📥 [KOKORO] Descargando '{rel_path}' desde {HF_REPO_ID}...")
        from huggingface_hub import hf_hub_download

        downloaded = hf_hub_download(
            repo_id=HF_REPO_ID,
            filename=rel_path,
            local_dir=self.models_dir,
        )
        return downloaded if os.path.exists(downloaded) else local_path

    def asegurar_modelo_cargado(self, hilos: Optional[int] = None, log_callback=None) -> bool:
        """Carga el modelo ONNX y el tokenizador en memoria RAM si aún no están cargados."""
        if self.session is not None and self.vocab:
            return True

        with self._lock:
            if self.session is not None and self.vocab:
                return True

            try:
                self._init_espeak()

                # 1. Cargar Tokenizer (vocabulario IPA -> token_id)
                tok_path = self._asegurar_archivo_hf("tokenizer.json", log_callback=log_callback)
                with open(tok_path, "r", encoding="utf-8") as f:
                    tok_data = json.load(f)
                self.vocab = tok_data.get("model", {}).get("vocab", {})

                # 2. Cargar modelo ONNX con salida `pred_dur`
                # Preferimos `onnx/model.onnx` (FP32) si el usuario ya lo colocó manualmente,
                # o `onnx/model_quantized.onnx` (92 MB) por defecto para descarga rápida y baja RAM.
                fp32_local = os.path.join(self.models_dir, "onnx", "model.onnx")
                if os.path.exists(fp32_local) and os.path.getsize(fp32_local) > 100_000_000:
                    onnx_path = fp32_local
                else:
                    onnx_path = self._asegurar_archivo_hf(self.model_variant, log_callback=log_callback)

                if hilos is None:
                    cpus = os.cpu_count() or 4
                    hilos = max(2, min(8, cpus // 2))

                sess_opts = ort.SessionOptions()
                sess_opts.intra_op_num_threads = hilos
                sess_opts.inter_op_num_threads = 1
                sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

                # Usar proveedores óptimos disponibles (CPUExecutionProvider es ultra estable para 82M)
                avail_providers = ort.get_available_providers()
                providers = ["CPUExecutionProvider"]
                if "CUDAExecutionProvider" in avail_providers:
                    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]

                if log_callback:
                    try:
                        log_callback("Inicializando red neuronal Kokoro-82M en RAM...")
                    except Exception:
                        pass

                t0 = time.perf_counter()
                self.session = ort.InferenceSession(onnx_path, sess_opts, providers=providers)
                dt = round((time.perf_counter() - t0) * 1000, 1)
                print(f"🧠 [KOKORO] Motor ONNX timestamped cargado en {dt}ms ({os.path.basename(onnx_path)} | {hilos} hilos).")
                return True

            except Exception as e:
                logger.error(f"🔥 Error cargando motor Kokoro-82M: {e}", exc_info=True)
                print(f"🔥 [KOKORO] Error crítico al inicializar el modelo: {e}")
                return False

    def _obtener_estilo_voz(self, voice_spec: str, log_callback=None) -> np.ndarray:
        """
        Obtiene el tensor de estilo `[510, 1, 256]` para una voz o una mezcla ponderada
        (ej. `ef_dora:0.7+af_bella:0.3`).
        """
        if voice_spec in self.voices_cache:
            return self.voices_cache[voice_spec]

        with self._lock:
            if voice_spec in self.voices_cache:
                return self.voices_cache[voice_spec]

            # Soporte para Voice Blending (mezcla de vectores de estilo)
            if "+" in voice_spec:
                partes = voice_spec.split("+")
                acumulado = None
                peso_total = 0.0
                for parte in partes:
                    if ":" in parte:
                        v_name, w_str = parte.split(":", 1)
                        peso = float(w_str)
                    else:
                        v_name = parte
                        peso = 1.0
                    v_arr = self._obtener_estilo_voz(v_name.strip(), log_callback=log_callback)
                    acumulado = v_arr * peso if acumulado is None else acumulado + (v_arr * peso)
                    peso_total += peso
                if acumulado is not None and peso_total > 0:
                    mezcla = (acumulado / peso_total).astype(np.float32)
                    self.voices_cache[voice_spec] = mezcla
                    return mezcla

            rel_bin = f"voices/{voice_spec}.bin"
            bin_path = self._asegurar_archivo_hf(rel_bin, log_callback=log_callback)
            raw = np.fromfile(bin_path, dtype=np.float32)
            style_pack = raw.reshape(-1, 1, 256)
            self.voices_cache[voice_spec] = style_pack
            return style_pack

    def _fonemizar_clausula(self, texto: str, espeak_voice: str) -> str:
        """Convierte un texto a cadena IPA usando espeakbridge de forma thread-safe."""
        self._init_espeak()
        from piper import espeakbridge

        with self._espeak_lock:
            espeakbridge.set_voice(espeak_voice)
            clauses = espeakbridge.get_phonemes(texto)

        partes_ipa: List[str] = []
        for phonemes_str, terminator_str, _ in clauses:
            # Limpiar banderas de cambio de idioma de espeak como (en) o (es)
            phonemes_str = re.sub(r"\([^)]+\)", "", phonemes_str).strip()
            term = terminator_str or ""
            if phonemes_str:
                partes_ipa.append(phonemes_str + term)
            elif term:
                partes_ipa.append(term)

        return " ".join(partes_ipa).strip()

    def _alinear_palabras_con_tokens(
        self,
        palabras_visuales: List[str],
        espeak_voice: str,
    ) -> Tuple[List[int], List[int]]:
        """
        Genera la secuencia completa de tokens de la frase preservando la coarticulación
        natural de la oración completa y asignando a cada token el índice de su palabra
        visual (`vIdx` en `0 .. len(palabras_visuales)-1`, o `-1` para espacios/bordes).
        """
        texto_completo = " ".join(palabras_visuales)
        ipa_completo = self._fonemizar_clausula(texto_completo, espeak_voice)

        # Dividimos los grupos fonéticos separados por espacio en la frase completa
        grupos_ipa = [g for g in ipa_completo.split(" ") if g]

        n_visual = len(palabras_visuales)
        n_grupos = len(grupos_ipa)

        tokens: List[int] = []
        word_indices: List[int] = []
        space_id = self.vocab.get(" ")

        if n_grupos == 0:
            return [], []

        # Caso 1: Correspondencia 1 a 1 exacta entre palabras visuales y grupos IPA (el más común)
        if n_grupos == n_visual:
            for w_idx, grupo in enumerate(grupos_ipa):
                if w_idx > 0 and space_id is not None:
                    tokens.append(space_id)
                    word_indices.append(-1)
                for ch in grupo:
                    if ch in self.vocab:
                        tokens.append(self.vocab[ch])
                        word_indices.append(w_idx)
            return tokens, word_indices

        # Caso 2: Una palabra visual produjo múltiples grupos IPA (ej. números "2026" -> "dos mil veintiséis"
        # o palabras con guion/abreviaturas). Medimos cuántos grupos IPA genera cada palabra visual
        # para repartir los grupos de `grupos_ipa` con precisión exacta.
        pesos_grupos: List[int] = []
        for w in palabras_visuales:
            ipa_w = self._fonemizar_clausula(w, espeak_voice)
            cnt = len([g for g in ipa_w.split(" ") if g])
            pesos_grupos.append(max(1, cnt))

        total_esperado = sum(pesos_grupos)
        asignacion_grupo_a_palabra: List[int] = []
        if total_esperado == n_grupos:
            for w_idx, cnt in enumerate(pesos_grupos):
                asignacion_grupo_a_palabra.extend([w_idx] * cnt)
        else:
            # Interpolación monótona proporcional por acumulados
            acum = 0
            limites = []
            for cnt in pesos_grupos:
                acum += cnt
                limites.append(acum / total_esperado)
            for g_idx in range(n_grupos):
                pos_rel = (g_idx + 0.5) / n_grupos
                w_asignada = n_visual - 1
                for w_idx, lim in enumerate(limites):
                    if pos_rel <= lim + 1e-6:
                        w_asignada = w_idx
                        break
                asignacion_grupo_a_palabra.append(w_asignada)

        for g_idx, grupo in enumerate(grupos_ipa):
            w_idx = asignacion_grupo_a_palabra[g_idx]
            if g_idx > 0 and space_id is not None:
                tokens.append(space_id)
                # Si el espacio está dentro de una misma palabra expandida (ej. "dos mil"),
                # mantener el índice de esa palabra para que el resaltado no parpadee
                if asignacion_grupo_a_palabra[g_idx - 1] == w_idx:
                    word_indices.append(w_idx)
                else:
                    word_indices.append(-1)
            for ch in grupo:
                if ch in self.vocab:
                    tokens.append(self.vocab[ch])
                    word_indices.append(w_idx)

        return tokens, word_indices

    def _dividir_en_lotes_seguros(
        self,
        palabras_visuales: List[str],
        espeak_voice: str,
        max_tokens: int = 460,
    ) -> List[Tuple[List[int], List[int], List[Tuple[int, str]]]]:
        """
        Kokoro-82M soporta hasta 510 tokens por inferencia (ventana de contexto de style pack).
        Si una oración es extraordinariamente larga (>460 tokens), la divide limpiamente en sub-lotes
        manteniendo los índices globales de `palabras_visuales`.
        """
        tokens, word_indices = self._alinear_palabras_con_tokens(palabras_visuales, espeak_voice)
        if len(tokens) <= max_tokens:
            pares = [(i, w) for i, w in enumerate(palabras_visuales)]
            return [(tokens, word_indices, pares)]

        # Dividir palabras_visuales en bloques de ~45 palabras
        lotes = []
        paso = 45
        for inicio in range(0, len(palabras_visuales), paso):
            sub_palabras = palabras_visuales[inicio : inicio + paso]
            sub_tokens, sub_w_idx_local = self._alinear_palabras_con_tokens(sub_palabras, espeak_voice)
            sub_w_idx_global = [
                (idx + inicio) if idx >= 0 else -1 for idx in sub_w_idx_local
            ]
            pares = [(inicio + i, w) for i, w in enumerate(sub_palabras)]
            lotes.append((sub_tokens[:max_tokens], sub_w_idx_global[:max_tokens], pares))
        return lotes

    def sintetizar(
        self,
        texto: str,
        voz_id: str,
        velocidad: float = 1.0,
        hilos: Optional[int] = None,
        log_callback=None,
        voice_key: Optional[str] = None,
        espeak_voice: Optional[str] = None,
        style_scale: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Sintetiza texto con Kokoro-82M ONNX y calcula timestamps exactos por palabra
        a partir de `pred_dur`.

        Retorna:
        {
            "pcm": bytes (int16 little-endian a 24000 Hz),
            "texto": str,
            "sr": 24000,
            "meta_palabras": [
                {"w": str, "s": float, "e": float, "vIdx": int, "sub_i": 0, "sub_t": 1},
                ...
            ]
        }
        """
        t_inicio = time.perf_counter()
        if not texto or not texto.strip():
            return {"pcm": b"", "texto": "", "sr": KOKORO_SAMPLE_RATE, "meta_palabras": []}

        if not self.asegurar_modelo_cargado(hilos=hilos, log_callback=log_callback):
            return {"pcm": b"", "texto": texto, "sr": KOKORO_SAMPLE_RATE, "meta_palabras": []}

        # Resolver metadatos de la voz
        info_voz = None
        if voice_key:
            if not espeak_voice:
                pref = voice_key[0].lower() if voice_key else "e"
                espeak_voice = "es" if pref == "e" else ("en-us" if pref == "a" else "es")
        else:
            info_voz = MAPA_VOCES_KOKORO.get(voz_id)
            if not info_voz:
                # Buscar en las mezclas personalizadas del usuario
                for b in cargar_blends_usuario():
                    if b.get("id") == voz_id:
                        info_voz = b
                        break

            if not info_voz:
                # Soportar IDs dinámicos como "Local-es-kokoro-ef_dora"
                m = re.search(r"kokoro-([a-zA-Z0-9_+:.]+)", voz_id)
                voice_key = m.group(1) if m else "ef_dora"
                pref = voice_key[0].lower() if voice_key else "e"
                espeak_map = {
                    "e": "es",
                    "a": "en-us",
                    "b": "en-gb",
                    "f": "fr-fr",
                    "i": "it",
                    "p": "pt-br",
                    "j": "ja",
                    "z": "cmn",
                    "h": "hi",
                }
                espeak_voice = espeak_map.get(pref, "es")
            else:
                voice_key = info_voz["voice_key"]
                espeak_voice = info_voz.get("espeak_voice") or "es"

        style_pack = self._obtener_estilo_voz(voice_key, log_callback=log_callback)
        scale = float(style_scale if style_scale is not None else (info_voz.get("style_scale", 1.0) if info_voz else 1.0))
        if scale != 1.0 and 0.5 <= scale <= 2.0:
            style_pack = (style_pack * scale).astype(np.float32)
        vel_solicitada = float(max(0.25, min(10.0, float(velocidad or 1.0))))
        # Kokoro v1.0 tiene su punto óptimo acústico entre 0.5x y 2.0x en el tensor `speed`.
        # Si el usuario pide > 2.0x (ej. 2.7x, 3.5x, 10x), generamos a 2.0x en la red neuronal
        # y aplicamos compresión temporal exacta al PCM y a los timestamps (`pred_dur`).
        vel_modelo = min(2.0, max(0.5, vel_solicitada))
        factor_extra = vel_solicitada / vel_modelo
        speed_tensor = np.array([vel_modelo], dtype=np.float32)

        palabras_visuales = texto.split()
        if not palabras_visuales:
            return {"pcm": b"", "texto": texto, "sr": KOKORO_SAMPLE_RATE, "meta_palabras": []}

        lotes = self._dividir_en_lotes_seguros(palabras_visuales, espeak_voice)

        fragmentos_pcm: List[bytes] = []
        meta_palabras: List[Dict[str, Any]] = []
        offset_tiempo_s = 0.0

        for tokens, word_indices, pares_palabras in lotes:
            if not tokens:
                continue

            # Padding con token '$' (id=0) al inicio y al final
            input_ids = np.array([[0] + tokens + [0]], dtype=np.int64)
            indices_con_pad = [-1] + word_indices + [-1]

            # Selección del vector de estilo según la longitud de tokens (estándar Kokoro v1.0)
            style_idx = min(len(tokens), style_pack.shape[0] - 1)
            style_vec = style_pack[style_idx]  # shape (1, 256)

            outputs = self.session.run(
                None,
                {
                    "input_ids": input_ids,
                    "style": style_vec,
                    "speed": speed_tensor,
                },
            )

            waveform = outputs[0].squeeze()
            if waveform.ndim == 0:
                continue

            pred_dur = outputs[1].squeeze() if len(outputs) > 1 else None

            # Si el usuario solicitó una velocidad fuera del rango nativo de Kokoro (> 2.0x o < 0.5x),
            # ajustamos la longitud del waveform para alcanzar exactamente la velocidad pedida.
            if abs(factor_extra - 1.0) > 0.01 and waveform.shape[0] > 4:
                n_orig = int(waveform.shape[0])
                n_target = max(1, int(round(n_orig / factor_extra)))
                idx_orig = np.linspace(0.0, 1.0, n_orig)
                idx_target = np.linspace(0.0, 1.0, n_target)
                waveform = np.interp(idx_target, idx_orig, waveform).astype(np.float32)

            num_samples = int(waveform.shape[0])
            duracion_lote_s = num_samples / float(KOKORO_SAMPLE_RATE)

            # Convertir waveform float32 (-1..1) a PCM int16
            pcm_lote = (waveform * 32767.0).clip(-32768, 32767).astype(np.int16).tobytes()
            fragmentos_pcm.append(pcm_lote)

            # Calcular tiempos exactos de inicio y fin de cada palabra usando pred_dur
            if pred_dur is not None and pred_dur.size == len(indices_con_pad) and float(pred_dur.sum()) > 0:
                total_frames = float(pred_dur.sum())
                sec_per_frame = duracion_lote_s / total_frames
                cum_sec = np.cumsum(pred_dur, dtype=np.float64) * sec_per_frame
                starts_sec = np.concatenate([[0.0], cum_sec[:-1]])

                # Agrupar rango [start, end] para cada palabra del lote
                tiempos_por_palabra: Dict[int, Tuple[float, float]] = {}
                for tok_pos, w_idx in enumerate(indices_con_pad):
                    if w_idx < 0:
                        continue
                    t_s = float(starts_sec[tok_pos])
                    t_e = float(cum_sec[tok_pos])
                    if w_idx not in tiempos_por_palabra:
                        tiempos_por_palabra[w_idx] = (t_s, t_e)
                    else:
                        prev_s, prev_e = tiempos_por_palabra[w_idx]
                        tiempos_por_palabra[w_idx] = (min(prev_s, t_s), max(prev_e, t_e))

                # Construir la partitura continua (sin huecos muertos entre palabras consecutivas
                # para que el cursor dinámico de LiraLoud se deslice con suavidad)
                ultimo_fin = offset_tiempo_s
                n_pares = len(pares_palabras)
                for idx_local, (w_idx_global, w_str) in enumerate(pares_palabras):
                    if w_idx_global in tiempos_por_palabra:
                        raw_s, raw_e = tiempos_por_palabra[w_idx_global]
                        abs_s = offset_tiempo_s + raw_s
                        abs_e = offset_tiempo_s + raw_e
                    else:
                        # Fallback para tokens puramente simbólicos sin fonema
                        abs_s = ultimo_fin
                        abs_e = min(offset_tiempo_s + duracion_lote_s, ultimo_fin + 0.04)

                    # Extender suavemente el fin de la palabra anterior hasta el inicio de la actual
                    # si el silencio inter-palabra es menor a 120ms (mantiene el cursor vivo)
                    if meta_palabras and (abs_s - meta_palabras[-1]["e"]) > 0 and (abs_s - meta_palabras[-1]["e"]) < 0.12:
                        meta_palabras[-1]["e"] = round(abs_s, 4)

                    if abs_e <= abs_s:
                        abs_e = abs_s + 0.02

                    meta_palabras.append({
                        "w": w_str.strip(".,!?¿¡;:()[]{}\"'"),
                        "s": round(abs_s, 4),
                        "e": round(abs_e, 4),
                        "vIdx": w_idx_global,
                        "sub_i": 0,
                        "sub_t": 1,
                    })
                    ultimo_fin = abs_e

            offset_tiempo_s += duracion_lote_s

        pcm_total = b"".join(fragmentos_pcm)
        ms_proceso = round((time.perf_counter() - t_inicio) * 1000, 2)
        print(
            f"⚡ [KOKORO-82M] Voz: {voice_key} | {len(texto)} chars | "
            f"{len(meta_palabras)} palabras con timestamps | {ms_proceso}ms"
        )

        return {
            "pcm": pcm_total,
            "texto": texto,
            "sr": KOKORO_SAMPLE_RATE,
            "meta_palabras": meta_palabras,
        }


# Instancia global singleton
kokoro_engine_global = KokoroTimestampEngine()


def cargar_blends_usuario() -> List[Dict[str, str]]:
    """Carga las mezclas creadas por el usuario desde kokoro_blends.json."""
    ruta_blends = os.path.join(BASE_DIR, "kokoro_blends.json")
    if not os.path.exists(ruta_blends):
        return []
    try:
        with open(ruta_blends, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []

def obtener_voces_kokoro() -> List[Dict[str, str]]:
    """Devuelve la lista de voces de Kokoro-82M (oficiales + mezclas personalizadas del usuario)."""
    import re
    resultado = []
    for v in VOCES_KOKORO_CATALOGO:
        nombre_raw = v.get("nombre", "")
        # Asegurar prefijo distintivo 💻❤️
        nombre_formateado = re.sub(r"^(?:⚡\s*(?:🧠\s*)?)?(?:Kokoro:\s*)?", "💻❤️ Kokoro: ", nombre_raw)
        resultado.append({
            "id": v["id"],
            "nombre": nombre_formateado,
            "tipo": "local",
        })

    # Inyectar las mezclas del usuario
    for b in cargar_blends_usuario():
        if isinstance(b, dict) and b.get("id") and b.get("nombre"):
            nombre_raw = b.get("nombre", "")
            nombre_formateado = re.sub(r"^(?:⚡\s*(?:🧪\s*)?)?(?:Kokoro:\s*)?", "💻❤️ Kokoro: ", nombre_raw)
            resultado.append({
                "id": b["id"],
                "nombre": nombre_formateado,
                "tipo": "local"
            })
    return resultado
