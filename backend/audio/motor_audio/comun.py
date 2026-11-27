import sys
import threading
import numpy as np

try:
    import psutil
    TIENE_PSUTIL = True
except ImportError:
    psutil = None
    TIENE_PSUTIL = False

_edge_tts_lock = threading.Lock()
edge_tts = None


def _pkg_attr(nombre, default):
    """Lee un símbolo desde el paquete `backend.audio.motor_audio` si está cargado (compatible con patch.object)."""
    pkg = sys.modules.get("backend.audio.motor_audio")
    if pkg is not None and hasattr(pkg, nombre):
        return getattr(pkg, nombre)
    return default


def _obtener_edge_tts():
    """Importa edge_tts de forma diferida (solo al sintetizar con voz en la nube)."""
    global edge_tts
    if edge_tts is not None:
        return edge_tts
    with _edge_tts_lock:
        if edge_tts is None:
            import edge_tts as _edge_tts
            edge_tts = _edge_tts
            pkg = sys.modules.get("backend.audio.motor_audio")
            if pkg is not None:
                pkg.edge_tts = _edge_tts
    return edge_tts


_exportador_lock = threading.Lock()
_exportador_audio_global = None


def _obtener_exportador_audio():
    """Importa exportador_audio de forma diferida solo al exportar o cancelar MP3."""
    global _exportador_audio_global
    if _exportador_audio_global is not None:
        return _exportador_audio_global
    with _exportador_lock:
        if _exportador_audio_global is None:
            from backend.audio.exportador_audio import exportador_audio_global as _exp
            _exportador_audio_global = _exp
    return _exportador_audio_global


_onecore_lock = threading.Lock()
_onecore_cargado = False
SpeechSynthesizer = None
NOMBRES_ONECORE_LOCALES = []


def _obtener_onecore():
    """Carga diferida (thread-safe) de Windows OneCore SpeechSynthesizer."""
    global SpeechSynthesizer, NOMBRES_ONECORE_LOCALES, _onecore_cargado
    if _onecore_cargado:
        return SpeechSynthesizer, NOMBRES_ONECORE_LOCALES
    with _onecore_lock:
        if not _onecore_cargado:
            try:
                from winsdk.windows.media.speechsynthesis import SpeechSynthesizer as _SS
                SpeechSynthesizer = _SS
                NOMBRES_ONECORE_LOCALES = [v.display_name for v in _SS.all_voices]
            except Exception:
                SpeechSynthesizer = None
                NOMBRES_ONECORE_LOCALES = []
            _onecore_cargado = True
            pkg = sys.modules.get("backend.audio.motor_audio")
            if pkg is not None:
                pkg.SpeechSynthesizer = SpeechSynthesizer
                pkg.NOMBRES_ONECORE_LOCALES = NOMBRES_ONECORE_LOCALES
    return SpeechSynthesizer, NOMBRES_ONECORE_LOCALES


_cache_diccionario_ram = {"data": None, "ts": 0.0}
_cache_reemplazos_ram = {}


def _recortar_silencio_pcm(pcm_bytes, sr, umbral=320, margen_ms=15):
    """Recorta silencio digital al inicio y final del PCM int16 conservando un margen de seguridad."""
    if not pcm_bytes or len(pcm_bytes) < 4:
        return pcm_bytes
    try:
        arr = np.frombuffer(pcm_bytes, dtype=np.int16)
        activos = np.where(np.abs(arr) > umbral)[0]
        if len(activos) == 0:
            return pcm_bytes
        margen_muestras = int((sr * margen_ms) / 1000)
        inicio = max(0, int(activos[0]) - margen_muestras)
        fin = min(len(arr), int(activos[-1]) + 1 + margen_muestras)
        if inicio >= fin:
            return pcm_bytes
        return arr[inicio:fin].tobytes()
    except Exception:
        return pcm_bytes


def _aplicar_fade_pcm(pcm_bytes, sr, vel):
    """Aplica micro-fade adaptativo según la velocidad para suavizar el ataque inicial sin cortar sílabas."""
    if not pcm_bytes or not sr:
        return pcm_bytes
    v = max(0.5, float(vel or 1.0))
    ms_in = max(10.0, min(60.0, 40.0 / v))
    ms_out = max(8.0, min(30.0, 15.0 / v))
    arr = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
    n_in = min(int(sr * ms_in / 1000.0), len(arr) // 2)
    n_out = min(int(sr * ms_out / 1000.0), len(arr) // 2)
    if n_in > 0:
        arr[:n_in] *= np.linspace(0.0, 1.0, n_in, dtype=np.float32)
    if n_out > 0:
        arr[-n_out:] *= np.linspace(1.0, 0.0, n_out, dtype=np.float32)
    return arr.clip(-32768, 32767).astype(np.int16).tobytes()
