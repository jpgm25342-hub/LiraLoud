"""
Paquete modular del motor de audio híbrido de LiraLoud.
Reexporta la API pública completa (síntesis, streaming, pre-renderizado, exportación MP3,
loaders diferidos y motores) preservando compatibilidad total con `patch.object(motor_audio, ...)`.
"""

from backend.core.utils import safe_async_run
from backend.audio.gestor_voces_rpc import DIRECTORIO_PIPER
from backend.audio.kokoro_engine import kokoro_engine_global, es_voz_kokoro
from backend.audio.pocket_engine import pocket_engine_global, es_voz_pocket

from backend.audio.motor_audio.comun import (
    TIENE_PSUTIL,
    edge_tts,
    SpeechSynthesizer,
    NOMBRES_ONECORE_LOCALES,
    _edge_tts_lock,
    _exportador_lock,
    _onecore_lock,
    _obtener_edge_tts,
    _obtener_exportador_audio,
    _obtener_onecore,
    _cache_diccionario_ram,
    _cache_reemplazos_ram,
    _recortar_silencio_pcm,
    _aplicar_fade_pcm,
)
from backend.audio.motor_audio.sintesis import (
    cocinar_ahora_pro,
)
from backend.audio.motor_audio.streaming import (
    worker_horno,
    worker_reproductor,
    iniciar_fuerza_laboral,
    run_local_logic_v21,
    iniciar_streaming_hibrido,
    prender_horno_para_siguiente,
    detener_streaming_backend,
    obtener_chunk_audio,
    limpiar_pasteleria,
)
from backend.audio.motor_audio.prerender import (
    pre_renderizar_bloque_paginas,
)
from backend.audio.motor_audio.exportacion_rpc import (
    descargar_audio_dedicado,
    cancelar_exportacion_mp3,
)

__all__ = [
    "safe_async_run",
    "DIRECTORIO_PIPER",
    "kokoro_engine_global",
    "es_voz_kokoro",
    "pocket_engine_global",
    "es_voz_pocket",
    "TIENE_PSUTIL",
    "edge_tts",
    "SpeechSynthesizer",
    "NOMBRES_ONECORE_LOCALES",
    "_edge_tts_lock",
    "_exportador_lock",
    "_onecore_lock",
    "_obtener_edge_tts",
    "_obtener_exportador_audio",
    "_obtener_onecore",
    "_cache_diccionario_ram",
    "_cache_reemplazos_ram",
    "_recortar_silencio_pcm",
    "_aplicar_fade_pcm",
    "cocinar_ahora_pro",
    "worker_horno",
    "worker_reproductor",
    "iniciar_fuerza_laboral",
    "run_local_logic_v21",
    "iniciar_streaming_hibrido",
    "prender_horno_para_siguiente",
    "detener_streaming_backend",
    "obtener_chunk_audio",
    "limpiar_pasteleria",
    "pre_renderizar_bloque_paginas",
    "descargar_audio_dedicado",
    "cancelar_exportacion_mp3",
]
