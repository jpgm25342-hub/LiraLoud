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

from backend.audio.kokoro_catalogo import (
    VOCES_KOKORO_DISPONIBLES_PARA_BLEND,
    obtener_catalogo_base_kokoro,
    VOCES_KOKORO_CATALOGO,
    MAPA_VOCES_KOKORO,
    es_voz_kokoro,
)


from backend.audio.kokoro_fonemas import KokoroFonemasMixin


class KokoroTimestampEngine(KokoroFonemasMixin):
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

    @staticmethod
    def _resolver_metadatos_voz(
        voz_id: str,
        voice_key: Optional[str],
        espeak_voice: Optional[str],
    ) -> Tuple[str, str, Optional[Dict[str, Any]]]:
        """Resuelve (voice_key, espeak_voice, info_voz) desde mapa Kokoro, blends o ID dinámico."""
        info_voz = None
        if voice_key:
            if not espeak_voice:
                pref = voice_key[0].lower() if voice_key else "e"
                espeak_voice = "es" if pref == "e" else ("en-us" if pref == "a" else "es")
            return voice_key, espeak_voice, info_voz

        info_voz = MAPA_VOCES_KOKORO.get(voz_id)
        if not info_voz:
            for b in cargar_blends_usuario():
                if b.get("id") == voz_id:
                    info_voz = b
                    break

        if not info_voz:
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
            return voice_key, espeak_map.get(pref, "es"), None

        return info_voz["voice_key"], info_voz.get("espeak_voice") or "es", info_voz

    def _sintetizar_lote_onnx(
        self,
        tokens: List[int],
        word_indices: List[int],
        pares_palabras: List[Tuple[int, str]],
        style_pack: Any,
        speed_tensor: Any,
        factor_extra: float,
        offset_tiempo_s: float,
        meta_palabras: List[Dict[str, Any]],
    ) -> Tuple[bytes, float]:
        """Ejecuta inferencia ONNX para un lote de tokens, ajusta velocidad extrema y acumula timestamps."""
        input_ids = np.array([[0] + tokens + [0]], dtype=np.int64)
        indices_con_pad = [-1] + word_indices + [-1]
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
            return b"", 0.0

        pred_dur = outputs[1].squeeze() if len(outputs) > 1 else None
        if abs(factor_extra - 1.0) > 0.01 and waveform.shape[0] > 4:
            n_orig = int(waveform.shape[0])
            n_target = max(1, int(round(n_orig / factor_extra)))
            idx_orig = np.linspace(0.0, 1.0, n_orig)
            idx_target = np.linspace(0.0, 1.0, n_target)
            waveform = np.interp(idx_target, idx_orig, waveform).astype(np.float32)

        num_samples = int(waveform.shape[0])
        duracion_lote_s = num_samples / float(KOKORO_SAMPLE_RATE)
        pcm_lote = (waveform * 32767.0).clip(-32768, 32767).astype(np.int16).tobytes()

        self._acumular_timestamps_lote(
            pred_dur,
            indices_con_pad,
            pares_palabras,
            duracion_lote_s,
            offset_tiempo_s,
            meta_palabras,
        )
        return pcm_lote, duracion_lote_s

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
        voice_key, espeak_voice, info_voz = self._resolver_metadatos_voz(
            voz_id, voice_key, espeak_voice
        )

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
            pcm_lote, duracion_lote_s = self._sintetizar_lote_onnx(
                tokens,
                word_indices,
                pares_palabras,
                style_pack,
                speed_tensor,
                factor_extra,
                offset_tiempo_s,
                meta_palabras,
            )
            if pcm_lote:
                fragmentos_pcm.append(pcm_lote)
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
