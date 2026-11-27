import os
import gc
import sys
import shutil
import time
import subprocess
from contextlib import contextmanager
import numpy as np
import onnxruntime as ort
from piper.voice import PiperVoice

from backend.core.estado_global import estado_app
from backend.core.utils import safe_async_run
from backend.audio.gestor_voces_rpc import DIRECTORIO_PIPER
from backend.audio.kokoro_engine import kokoro_engine_global, es_voz_kokoro
from backend.audio.pocket_engine import pocket_engine_global, es_voz_pocket
from backend.audio.motor_audio.comun import (
    TIENE_PSUTIL,
    psutil,
    _pkg_attr,
    _obtener_edge_tts,
    _obtener_onecore,
    _aplicar_fade_pcm,
)


@contextmanager
def _con_prioridad_proceso(p, prioridad_clase):
    """Eleva temporalmente la prioridad del proceso en Windows y la restaura al salir."""
    try:
        if p and prioridad_clase is not None:
            p.nice(prioridad_clase)
        yield
    finally:
        if p:
            try:
                p.nice(psutil.NORMAL_PRIORITY_CLASS)
            except Exception:
                pass


def _convertir_audio_a_pcm_ffmpeg(audio_bytes):
    """Convierte MP3/WAV en memoria a PCM crudo (s16le, mono, 22050 Hz) usando FFmpeg, o None si falta."""
    if not shutil.which("ffmpeg"):
        return None
    flags_proc = 0x08000000 if sys.platform == "win32" else 0
    process = subprocess.Popen(
        ['ffmpeg', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', '22050', 'pipe:1'],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        creationflags=flags_proc
    )
    pcm_data, _ = process.communicate(input=audio_bytes)
    return pcm_data


def _sintetizar_edge(texto, voz_id, vel, safe_async_run_fn, get_edge_tts_fn):
    """Sintetiza audio en la nube con Edge TTS (bloqueado en Modo 100 % Offline) y convierte MP3 a PCM."""
    if getattr(estado_app, "modo_privacidad_estricta", False):
        print(f"🔒 [PRIVACIDAD] Modo 100% Offline activo: bloqueada síntesis Edge TTS para '{voz_id}'.")
        return {"pcm": b"", "texto": "", "sr": 24000}

    _edge = get_edge_tts_fn()

    async def generar_edge_pcm():
        tasa = f"{int((vel - 1) * 100):+d}%"

        # 1. TRADUCCIÓN DE NOMBRE
        v_lower = voz_id.lower()
        voz_tecnica = None

        # Identificación directa si ya es nombre técnico de voz Neural
        if "neural" in v_lower and "-" in voz_id:
            voz_tecnica = voz_id
        # Mapeo manual rápido
        elif "salome" in v_lower:
            voz_tecnica = "es-CO-SalomeNeural"
        elif "ramona" in v_lower:
            voz_tecnica = "es-DO-RamonaNeural"
        elif "dalia" in v_lower:
            voz_tecnica = "es-MX-DaliaNeural"
        elif "jorge" in v_lower:
            voz_tecnica = "es-MX-JorgeNeural"
        elif "elena" in v_lower:
            voz_tecnica = "es-AR-ElenaNeural"
        elif "tomas" in v_lower:
            voz_tecnica = "es-AR-TomasNeural"

        # Auto-descubrimiento (Fallback)
        if not voz_tecnica:
            if not estado_app.catalogo_edge_cache:
                try:
                    voces_edge = await _edge.list_voices()
                    for v in voces_edge:
                        estado_app.catalogo_edge_cache[v['FriendlyName']] = v['ShortName']
                        estado_app.catalogo_edge_cache[v['ShortName']] = v['ShortName']
                except Exception:
                    pass
            voz_tecnica = estado_app.catalogo_edge_cache.get(voz_id, "es-MX-DaliaNeural")

        # 2. DESCARGA (Esto baja MP3)
        try:
            com = _edge.Communicate(texto, voz_tecnica, rate=tasa)
            mp3_data = b""
            async for chunk in com.stream():
                if chunk["type"] == "audio":
                    mp3_data += chunk["data"]
            return mp3_data
        except Exception as e:
            print(f"🔥 Error descarga Edge: {e}")
            return None

    try:
        mp3_bytes = safe_async_run_fn(generar_edge_pcm())

        if not mp3_bytes:
            return {"pcm": b"", "texto": "", "sr": 24000}

        # 3. LA MAGIA: CONVERTIR MP3 A PCM (Adiós Pitido)
        pcm_data = _convertir_audio_a_pcm_ffmpeg(mp3_bytes)
        if pcm_data is not None:
            return {
                "pcm": pcm_data,
                "texto": texto,
                "sr": 22050
            }
        print("⚠️ [ALERTA] FFmpeg no encontrado. Se enviará MP3 (Sonará como pitido).")
        return {"pcm": mp3_bytes, "texto": texto, "sr": 24000}

    except Exception as e:
        print(f"🔥 Error Proceso Edge: {e}")
        return {"pcm": b"", "texto": "", "sr": 24000}


def _sintetizar_pocket(texto, voz_id, vel, es_prioridad_max, p, pocket_engine):
    """Sintetiza audio con Pocket TTS (clonación zero-shot) gestionando prioridad de proceso."""
    prio = psutil.ABOVE_NORMAL_PRIORITY_CLASS if (p and es_prioridad_max) else None
    with _con_prioridad_proceso(p, prio):
        return pocket_engine.sintetizar(
            texto=texto,
            voz_id=voz_id,
            velocidad=vel,
        )


def _sintetizar_kokoro(texto, voz_id, vel, es_prioridad_max, p, kokoro_engine, es_voz_kokoro_fn):
    """Sintetiza con Kokoro-82M gestionando fallback chino (respetando privacidad estricta), hilos y prioridad."""
    v_low = (voz_id or "").lower()
    if ("-zh-" in v_low or v_low.startswith("local-zh-")) and not getattr(estado_app, "modo_privacidad_estricta", False):
        # kokoro_engine usa piper.espeakbridge (sin G2P chino de misaki); evitar que espeak lea "símbolo chino"
        if not getattr(kokoro_engine, "tiene_g2p_zh", False):
            print("⚠️ [KOKORO ZH] G2P chino nativo no disponible en kokoro_engine; fallback automático a zh-CN-XiaoxiaoNeural.")
            voz_id = "zh-CN-XiaoxiaoNeural"

    if not es_voz_kokoro_fn(voz_id):
        return None, voz_id

    hilos_so = os.cpu_count() or 4
    if es_prioridad_max:
        hilos_kokoro = max(4, min(8, hilos_so // 2)) if hilos_so > 4 else max(1, hilos_so)
    else:
        hilos_kokoro = max(2, min(6, hilos_so // 2)) if hilos_so > 2 else 1

    prio = psutil.ABOVE_NORMAL_PRIORITY_CLASS if (p and es_prioridad_max) else None
    with _con_prioridad_proceso(p, prio):
        res = kokoro_engine.sintetizar(
            texto=texto,
            voz_id=voz_id,
            velocidad=vel,
            hilos=hilos_kokoro,
        )
        return res, voz_id


def _construir_input_feed_piper(voice, texto, vel):
    """Fonemiza el texto y arma el diccionario input_feed para la sesión ONNX de Piper."""
    scale = 1.0 / vel
    phonemes = voice.phonemize(texto)
    id_map = voice.config.phoneme_id_map
    phoneme_ids = []
    for item in phonemes:
        if isinstance(item, list):
            for sub in item:
                if sub in id_map:
                    phoneme_ids.extend(id_map[sub])
        elif item in id_map:
            phoneme_ids.extend(id_map[item])

    final_ids = [0]
    for pid in phoneme_ids:
        final_ids.extend([pid, 0])
    id_tensor = np.expand_dims(np.array(final_ids, dtype=np.int64), 0)
    scales = np.array([0.667, scale, 0.8], dtype=np.float32)

    input_feed = {
        "input": id_tensor,
        "input_lengths": np.array([id_tensor.shape[1]], dtype=np.int64),
        "scales": scales,
    }
    if "sid" in [i.name for i in voice.session.get_inputs()]:
        input_feed["sid"] = np.array([0], dtype=np.int64)
    return input_feed


def _calcular_perfil_hilos_piper(es_prioridad_max, es_carga_nueva):
    """Determina el perfil de hardware y cantidad de hilos ONNX según CPUs y prioridad."""
    es_turbo = es_prioridad_max or es_carga_nueva
    hilos_so = os.cpu_count() or 4
    if not es_turbo:
        return hilos_so, (1 if hilos_so <= 4 else 2), "Bajo Consumo"
    if hilos_so <= 2:
        return hilos_so, 1, "Tostadora"
    if hilos_so <= 4:
        return hilos_so, 2, "Ofimática"
    return hilos_so, min(8, max(4, hilos_so // 2)), "Entusiasta/Ryzen"


def _sintetizar_piper(texto, voz_id, vel, es_prioridad_max, p):
    """Sintetiza audio local con Piper ONNX gestionando caché LRU en RAM, hilos y prioridad."""
    t_inicio = time.perf_counter()
    nombre = voz_id.replace("Local-", "")
    path_onnx = os.path.join(DIRECTORIO_PIPER, nombre)
    es_carga_nueva = path_onnx not in estado_app.voces_cargadas

    # Tarea 2: Recolector de basura LRU (Liberar modelos viejos)
    LIMITE_VOCES_RAM = 3
    estado_app.voces_uso_tiempo[path_onnx] = time.time()

    if es_carga_nueva and len(estado_app.voces_cargadas) >= LIMITE_VOCES_RAM:
        # Encontrar la voz más antigua que NO sea la que estamos cargando ahora
        voces_ordenadas = sorted(estado_app.voces_uso_tiempo.items(), key=lambda x: x[1])
        for v_path, _ in voces_ordenadas:
            if v_path != path_onnx and v_path in estado_app.voces_cargadas:
                print(f"🧹 [GC] Liberando memoria RAM: {os.path.basename(v_path)}")
                del estado_app.voces_cargadas[v_path]
                del estado_app.voces_uso_tiempo[v_path]
                gc.collect()
                break

    # 🧠 DETECCIÓN DE HARDWARE CON "UMBRAL DE TOSTADORA"
    hilos_so, hilos_nitro, perfil = _calcular_perfil_hilos_piper(es_prioridad_max, es_carga_nueva)
    print(f"📡 [NITRO] Perfil: {perfil} | {hilos_so} CPUs -> Usando {hilos_nitro} hilos.")

    prio_piper = (
        (psutil.HIGH_PRIORITY_CLASS if es_carga_nueva else psutil.ABOVE_NORMAL_PRIORITY_CLASS)
        if p else None
    )
    with _con_prioridad_proceso(p, prio_piper):
        if es_carga_nueva:
            print(f"🔥 [NITRO ON] Carga fría: {nombre} | Hilos: {hilos_nitro}")

            sess_opts = ort.SessionOptions()
            sess_opts.intra_op_num_threads = hilos_nitro
            sess_opts.inter_op_num_threads = 1

            estado_app.voces_cargadas[path_onnx] = PiperVoice.load(path_onnx, use_cuda=False)
            estado_app.voces_cargadas[path_onnx].session = ort.InferenceSession(path_onnx, sess_opts)

        voice = estado_app.voces_cargadas[path_onnx]
        input_feed = _construir_input_feed_piper(voice, texto, vel)

        audio_output = voice.session.run(None, input_feed)[0]

        ms_proceso = round((time.perf_counter() - t_inicio) * 1000, 2)
        print(f"[LOG] Piper: {nombre} | {len(texto)} chars | {ms_proceso}ms")

        pcm_raw = (audio_output.squeeze() * 32767).clip(-32768, 32767).astype(np.int16).tobytes()
        return {
            "pcm": _aplicar_fade_pcm(pcm_raw, voice.config.sample_rate, vel),
            "texto": texto,
            "sr": voice.config.sample_rate
        }


def _sintetizar_onecore(texto, voz_id, vel, safe_async_run_fn):
    """Sintetiza audio con voces locales Windows OneCore y convierte WAV en memoria a PCM vía FFmpeg."""
    from winsdk.windows.storage.streams import DataReader
    _SpeechSynth, _ = _obtener_onecore()

    async def generar_win_pcm():
        try:
            synth = _SpeechSynth()

            # Buscar la voz exacta (Soporta voces OneCore modernas como Raul)
            for v in _SpeechSynth.all_voices:
                if v.display_name in voz_id or voz_id in v.display_name:
                    synth.voice = v
                    break

            # Velocidad nativa (1.0 = normal, 1.5 = rápida)
            synth.options.speaking_rate = max(0.5, min(6.0, float(vel)))

            # Generar WAV en memoria (Sin archivos temporales)
            stream = await synth.synthesize_text_to_stream_async(texto)
            size = stream.size
            reader = DataReader(stream.get_input_stream_at(0))
            await reader.load_async(size)
            buffer = reader.read_buffer(size)
            wav_bytes = bytes(memoryview(buffer))

            # Convertir WAV de memoria a PCM crudo (s16le 22050Hz) con FFMPEG
            pcm_data = _convertir_audio_a_pcm_ffmpeg(wav_bytes)
            return {"pcm": pcm_data if pcm_data is not None else b"", "texto": texto, "sr": 22050}
        except Exception as e:
            print(f"🔥 Error en motor OneCore: {e}")
            return {"pcm": b"", "texto": texto, "sr": 22050}

    return safe_async_run_fn(generar_win_pcm())


def cocinar_ahora_pro(texto, voz_id, vel, es_prioridad_max=False):
    p = psutil.Process(os.getpid()) if (TIENE_PSUTIL and sys.platform == "win32") else None

    _es_voz_pocket = _pkg_attr("es_voz_pocket", es_voz_pocket)
    _es_voz_kokoro = _pkg_attr("es_voz_kokoro", es_voz_kokoro)
    _pocket_engine = _pkg_attr("pocket_engine_global", pocket_engine_global)
    _kokoro_engine = _pkg_attr("kokoro_engine_global", kokoro_engine_global)
    _safe_async_run = _pkg_attr("safe_async_run", safe_async_run)
    _get_edge_tts = _pkg_attr("_obtener_edge_tts", _obtener_edge_tts)

    # ==========================================
    # 🧬 CAMINO P0: MOTOR CLONACIÓN ZERO-SHOT (POCKET TTS / KYUTAI)
    # ==========================================
    if _es_voz_pocket(voz_id):
        return _sintetizar_pocket(texto, voz_id, vel, es_prioridad_max, p, _pocket_engine)

    # ==========================================
    # 🧠 CAMINO A0: MOTOR NEURONAL KOKORO-82M (TIMESTAMPS NATIVOS)
    # ==========================================
    if _es_voz_kokoro(voz_id):
        res_kokoro, voz_id = _sintetizar_kokoro(
            texto, voz_id, vel, es_prioridad_max, p, _kokoro_engine, _es_voz_kokoro
        )
        if res_kokoro is not None:
            return res_kokoro

    # ==========================================
    # 🏰 CAMINO A: MOTOR LOCAL (PIPER / NITRO)
    # ==========================================
    if voz_id.startswith("Local-"):
        return _sintetizar_piper(texto, voz_id, vel, es_prioridad_max, p)

    # ==========================================
    # 🪟 MODO 3: MOTOR ONECORE (VOCES MODERNAS DE WINDOWS)
    # ==========================================
    elif voz_id.startswith("Microsoft") and any(nombre in voz_id for nombre in _obtener_onecore()[1]):
        return _sintetizar_onecore(texto, voz_id, vel, _safe_async_run)

    # ===========================================
    # ☁️ MODO 2: MOTOR NUBE (EDGE TTS - RESOLUTOR DINÁMICO)
    # ==========================================
    else:
        return _sintetizar_edge(texto, voz_id, vel, _safe_async_run, _get_edge_tts)
