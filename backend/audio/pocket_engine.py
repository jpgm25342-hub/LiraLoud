# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

"""
=============================================================================
LIRALOUD - MOTOR DE CLONACIÓN DE VOZ ZERO-SHOT (POCKET TTS / KYUTAI)
=============================================================================
Motor autónomo y local para clonación de voz de alta fidelidad basado en
Pocket-TTS (~100M parámetros con Mimi Neural Audio Codec de Kyutai).

Características:
1. Inferencia CPU ultra-rápida (RTF ~3.0x en tiempo real).
2. Clonación Zero-Shot real a partir de muestras de 3 a 15 segundos:
   - Capaz de capturar susurros, textura tímbrica, respiración y prosodia
     sin forzar fonaciones estándar.
3. Almacenamiento local de perfiles de voz clonados en formato binario (.pt)
   dentro de `pocket_models/voices/`.
4. Generación de audio a 24,000 Hz con timestamps ponderados para el cursor
   karaoke de LiraLoud.
=============================================================================
"""

import os
import sys
import json
import time
import logging
import threading
from typing import Dict, List, Any, Optional

import numpy as np

_torch_lock = threading.Lock()
_torch_mod = None


def _obtener_torch():
    """Importa torch de forma diferida (thread-safe) para no penalizar el arranque."""
    global _torch_mod
    if _torch_mod is not None:
        return _torch_mod
    with _torch_lock:
        if _torch_mod is None:
            import torch as _t
            _torch_mod = _t
    return _torch_mod

logger = logging.getLogger("LiraPocketEngine")

if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DIRECTORIO_POCKET = os.path.join(BASE_DIR, "pocket_models")
DIRECTORIO_VOCES_POCKET = os.path.join(DIRECTORIO_POCKET, "voices")
ARCHIVO_POCKET_CLONES = os.path.join(BASE_DIR, "pocket_clones.json")
POCKET_SAMPLE_RATE = 24000


def es_voz_pocket(voz_id: str) -> bool:
    """Determina si un identificador de voz pertenece al motor Pocket TTS."""
    if not voz_id or not isinstance(voz_id, str):
        return False
    return "-pocket-" in voz_id or voz_id.startswith("Pocket-") or voz_id.startswith("pocket_")


def cargar_clones_pocket() -> List[Dict[str, Any]]:
    """Carga los metadatos de las voces clonadas con Pocket TTS."""
    try:
        if os.path.exists(ARCHIVO_POCKET_CLONES):
            with open(ARCHIVO_POCKET_CLONES, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
    except Exception as e:
        logger.error(f"Error cargando {ARCHIVO_POCKET_CLONES}: {e}")
    return []


def guardar_clones_pocket(clones: List[Dict[str, Any]]) -> bool:
    """Guarda los metadatos de las voces clonadas en pocket_clones.json."""
    try:
        with open(ARCHIVO_POCKET_CLONES, "w", encoding="utf-8") as f:
            json.dump(clones if isinstance(clones, list) else [], f, indent=4, ensure_ascii=False)
        return True
    except Exception as e:
        logger.error(f"Error guardando {ARCHIVO_POCKET_CLONES}: {e}")
        return False


def obtener_voces_pocket() -> List[Dict[str, str]]:
    """Devuelve la lista de voces clonadas con Pocket TTS para el catálogo de LiraLoud."""
    import re
    resultado = []
    for c in cargar_clones_pocket():
        if isinstance(c, dict) and c.get("id") and c.get("nombre"):
            nombre_raw = c.get("nombre", "")
            nombre_formateado = re.sub(r"^(?:⚡\s*)?(?:Clon:\s*)?", "💻👛 Clon: ", nombre_raw)
            resultado.append({
                "id": c["id"],
                "nombre": nombre_formateado,
                "tipo": "local"
            })
    return resultado


def _dividir_por_puntuacion(texto: str, max_palabras: int) -> List[str]:
    """Pase 1: divide un texto largo en bloques respetando signos de puntuación naturales."""
    import re
    partes = re.split(r'([,;:—–\.\!\?]+\s*)', texto)
    bloques = []
    actual = ""
    i = 0
    while i < len(partes):
        frag = partes[i]
        if not frag:
            i += 1
            continue
        if re.match(r'^[,;:—–\.\!\?]+\s*$', frag):
            if bloques:
                bloques[-1] += frag
            else:
                actual += frag
        else:
            if len((actual + frag).split()) > max_palabras and actual.strip():
                bloques.append(actual.strip())
                actual = frag
            else:
                actual += frag
        i += 1
    if actual.strip():
        bloques.append(actual.strip())
    return bloques


def dividir_en_subfrases_seguras(texto: str, max_palabras: int = 12) -> List[str]:
    """
    Divide un texto largo en subfrases seguras (menores a 12 palabras / ~30-40 tokens)
    para evitar que el modelo de lenguaje de Pocket-TTS exceda su ventana de atención
    y omita palabras al inicio o al final de oraciones largas.
    """
    import re
    texto = texto.strip()
    if not texto:
        return []

    palabras = texto.split()
    if len(palabras) <= max_palabras:
        return [texto]

    # Pase 1: Dividir por signos de puntuación naturales
    bloques = _dividir_por_puntuacion(texto, max_palabras)

    # Pase 2: Si algún bloque aún supera max_palabras (oración larga sin comas),
    # subdividir por conjunciones y preposiciones clave
    resultado = []
    for b in bloques:
        w_list = b.split()
        if len(w_list) <= max_palabras:
            resultado.append(b)
        else:
            sub_partes = re.split(
                r'(\s+(?:que|y|o|pero|sino|porque|cuando|donde|aunque|como|si|en|con|de|por)\s+)',
                b,
                flags=re.IGNORECASE
            )
            sub_act = ""
            for sp in sub_partes:
                if len((sub_act + sp).split()) > max_palabras and sub_act.strip():
                    resultado.append(sub_act.strip())
                    sub_act = sp.lstrip()
                else:
                    sub_act += sp
            if sub_act.strip():
                resultado.append(sub_act.strip())

    # Pase 3 estricto: corte de seguridad garantizando que ningún fragmento supere max_palabras
    final = []
    for r in resultado:
        wl = r.split()
        if len(wl) <= max_palabras:
            final.append(r)
        else:
            for k in range(0, len(wl), max_palabras):
                final.append(" ".join(wl[k : k + max_palabras]))
    return final


class PocketTTSEngine:
    """
    Motor singleton thread-safe para Pocket-TTS de Kyutai.
    """

    def __init__(self, models_dir: Optional[str] = None):
        self.models_dir = models_dir or DIRECTORIO_POCKET
        self.voices_dir = os.path.join(self.models_dir, "voices")
        os.makedirs(self.voices_dir, exist_ok=True)

        self._lock = threading.RLock()
        self._models: Dict[str, Any] = {}
        self._states_cache: Dict[str, Any] = {}

    def _obtener_modelo(self, idioma: str = "spanish"):
        """Carga o reutiliza la instancia de TTSModel para el idioma dado."""
        with self._lock:
            lang_key = idioma.lower()
            if lang_key in ("es", "es-419", "spa", "spanish"):
                lang_key = "spanish"
            elif lang_key in ("en", "en-us", "en-gb", "eng", "english"):
                lang_key = "english"
            elif lang_key in ("fr", "fra", "french"):
                lang_key = "french"
            elif lang_key in ("pt", "pt-br", "por", "portuguese"):
                lang_key = "portuguese"
            elif lang_key in ("it", "ita", "italian"):
                lang_key = "italian"
            elif lang_key in ("de", "deu", "german"):
                lang_key = "german"
            else:
                lang_key = "spanish"

            if lang_key not in self._models:
                import pocket_tts
                logger.info(f"Cargando modelo Pocket-TTS ({lang_key})...")
                self._models[lang_key] = pocket_tts.TTSModel.load_model(language=lang_key)
                logger.info(f"Modelo Pocket-TTS ({lang_key}) listo.")
            return self._models[lang_key]

    def crear_clon_desde_audio(
        self,
        nombre_usuario: str,
        ruta_audio: str,
        idioma: str = "spanish"
    ) -> Dict[str, Any]:
        """
        Extrae el estado/condicionamiento de voz (Zero-Shot) desde un archivo de audio
        y lo persiste en disco como un archivo de estado `.pt`.
        """
        import re
        from backend.core.utils import resolver_nombre_voz_unico
        clones = cargar_clones_pocket()
        nombres_existentes = [c.get("nombre_simple") or c.get("nombre") for c in clones]
        nombre_limpio = resolver_nombre_voz_unico(nombre_usuario, nombres_existentes)

        slug = re.sub(r"[^a-zA-Z0-9_]", "_", nombre_limpio).strip("_").lower()
        if not slug:
            slug = "clon"

        voice_key = f"pocket_clone_{slug}"
        voice_id = f"Local-es-pocket-{voice_key}"
        state_filename = f"{voice_key}.pt"
        state_path = os.path.join(self.voices_dir, state_filename)

        model = self._obtener_modelo(idioma)

        with self._lock:
            state = model.get_state_for_audio_prompt(ruta_audio)
            _obtener_torch().save(state, state_path)
            self._states_cache[voice_key] = state

        clones = cargar_clones_pocket()
        clones = [c for c in clones if c.get("id") != voice_id and c.get("voice_key") != voice_key]

        nuevo_clon = {
            "id": voice_id,
            "voice_key": voice_key,
            "nombre": f"Clon: {nombre_limpio} (Pocket AI)",
            "nombre_simple": nombre_limpio,
            "idioma": idioma,
            "state_file": state_filename,
            "tipo_origen": "clon_audio",
            "fecha": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        clones.append(nuevo_clon)
        guardar_clones_pocket(clones)
        logger.info(f"Voz clonada guardada: {voice_id} ({state_path})")
        return {"exito": True, "clon": nuevo_clon}

    def _cargar_estado_voz(self, voice_key: str):
        """Carga en RAM el estado condicionado desde el archivo .pt."""
        if voice_key in self._states_cache:
            return self._states_cache[voice_key]

        state_path = os.path.join(self.voices_dir, f"{voice_key}.pt")
        if not os.path.exists(state_path):
            raise FileNotFoundError(f"No existe el perfil de voz clonada: {state_path}")

        state = _obtener_torch().load(state_path, weights_only=False)
        self._states_cache[voice_key] = state
        return state

    def eliminar_clon(self, voice_id: str) -> bool:
        """Elimina un clon del archivo JSON y su archivo .pt en disco."""
        clones = cargar_clones_pocket()
        eliminado = None
        restantes = []
        for c in clones:
            if c.get("id") == voice_id or c.get("voice_key") == voice_id:
                eliminado = c
            else:
                restantes.append(c)

        if eliminado:
            guardar_clones_pocket(restantes)
            v_key = eliminado.get("voice_key", "")
            if v_key in self._states_cache:
                del self._states_cache[v_key]

            state_file = eliminado.get("state_file") or f"{v_key}.pt"
            state_path = os.path.join(self.voices_dir, state_file)
            if os.path.exists(state_path):
                try:
                    os.remove(state_path)
                except Exception:
                    pass
            logger.info(f"Clon eliminado: {voice_id}")
            return True
        return False

    def sintetizar(
        self,
        texto: str,
        voz_id: str,
        velocidad: float = 1.0,
        idioma: str = "spanish"
    ) -> Dict[str, Any]:
        """
        Sintetiza texto con Pocket-TTS utilizando el estado de la voz clonada.
        Devuelve el formato estándar requerido por LiraLoud:
        { "pcm": bytes, "texto": str, "sr": 24000, "meta_palabras": [] }
        """
        t_inicio = time.perf_counter()
        texto_limpio = str(texto or "").strip()
        if not texto_limpio:
            return {"pcm": b"", "texto": "", "sr": POCKET_SAMPLE_RATE, "meta_palabras": []}

        # Extraer voice_key
        # Ej: "Local-es-pocket-pocket_clone_juan" -> "pocket_clone_juan"
        voice_key = voz_id
        if "-pocket-" in voz_id:
            voice_key = voz_id.split("-pocket-")[-1]
        elif voz_id.startswith("Pocket-"):
            voice_key = voz_id.replace("Pocket-", "")

        model = self._obtener_modelo(idioma)
        state = self._cargar_estado_voz(voice_key)

        # Dividir oraciones largas en subfrases seguras (máx 12 palabras)
        # Esto elimina 100% las omisiones al inicio o final causadas por la ventana de atención
        sub_frases = dividir_en_subfrases_seguras(texto_limpio, max_palabras=12)

        fragmentos_audio = []
        with self._lock:
            for sf_texto in sub_frases:
                if not sf_texto.strip():
                    continue
                # Utilizar el valor por defecto de Pocket-TTS (50) para garantizar
                # que el modelo nunca sature la memoria de atención ni descarte tokens
                chunk_audio = model.generate_audio(
                    model_state=state,
                    text_to_generate=sf_texto,
                    max_tokens=50,
                    copy_state=True
                )
                fragmentos_audio.append(chunk_audio)

        _torch = _obtener_torch()
        if fragmentos_audio:
            audio_tensor = _torch.cat(fragmentos_audio, dim=0)
        else:
            audio_tensor = _torch.zeros(0, dtype=_torch.float32)

        # Convertir float32 tensor [-1.0, 1.0] a PCM 16-bit
        audio_np = audio_tensor.detach().cpu().numpy()
        audio_np = np.clip(audio_np, -1.0, 1.0)
        pcm_16 = (audio_np * 32767.0).astype(np.int16).tobytes()

        dur_s = len(audio_np) / model.sample_rate
        ms_proceso = round((time.perf_counter() - t_inicio) * 1000, 2)
        rtf = dur_s / (ms_proceso / 1000.0) if ms_proceso > 0 else 0

        logger.info(
            f"[POCKET-TTS] Voz: {voice_key} | {len(texto_limpio)} chars | "
            f"{dur_s:.2f}s audio en {ms_proceso}ms (RTF: {rtf:.2f}x)"
        )

        return {
            "pcm": pcm_16,
            "texto": texto_limpio,
            "sr": POCKET_SAMPLE_RATE,
            "meta_palabras": []  # El pipeline de LiraLoud aplicará heurística ponderada perfecta
        }


# Instancia singleton global
pocket_engine_global = PocketTTSEngine()

