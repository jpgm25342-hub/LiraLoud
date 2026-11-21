import os
import gc
import sys
import re
import shutil
import time
import base64
import asyncio
import threading
import subprocess
import webview
import numpy as np
import onnxruntime as ort
import edge_tts
from piper.voice import PiperVoice
from backend.core.webview_bridge import eel, puente_webview
from backend.core.estado_global import estado_app
from backend.core.logger_config import logger
from backend.core.utils import normalizar_texto, safe_async_run
from backend.documento.procesador_texto import aplicar_reemplazos, mapear_expansion_palabras_n_a_1
from backend.core.gestor_archivos import cargar_diccionario, cargar_ajustes_lectura
from backend.audio.gestor_voces_rpc import DIRECTORIO_PIPER
from backend.documento.gestor_documento_rpc import obtener_solo_texto_pagina_ligera
from backend.ia.traductor import traductor_global
from backend.audio.kokoro_engine import kokoro_engine_global, es_voz_kokoro
from backend.audio.pocket_engine import pocket_engine_global, es_voz_pocket
from backend.audio.exportador_audio import ExportadorAudio, exportador_audio_global

try:
    from winsdk.windows.media.speechsynthesis import SpeechSynthesizer
    NOMBRES_ONECORE_LOCALES = [v.display_name for v in SpeechSynthesizer.all_voices]
except Exception:
    SpeechSynthesizer = None
    NOMBRES_ONECORE_LOCALES = []

try:
    import psutil
    TIENE_PSUTIL = True
except ImportError:
    TIENE_PSUTIL = False

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


def cocinar_ahora_pro(texto, voz_id, vel, es_prioridad_max=False):
    p = psutil.Process(os.getpid()) if (TIENE_PSUTIL and sys.platform == "win32") else None
    
    # ==========================================
    # 🧬 CAMINO P0: MOTOR CLONACIÓN ZERO-SHOT (POCKET TTS / KYUTAI)
    # ==========================================
    if es_voz_pocket(voz_id):
        try:
            if p and es_prioridad_max:
                p.nice(psutil.ABOVE_NORMAL_PRIORITY_CLASS)
            return pocket_engine_global.sintetizar(
                texto=texto,
                voz_id=voz_id,
                velocidad=vel
            )
        finally:
            if p:
                try:
                    p.nice(psutil.NORMAL_PRIORITY_CLASS)
                except Exception:
                    pass

    # ==========================================
    # 🧠 CAMINO A0: MOTOR NEURONAL KOKORO-82M (TIMESTAMPS NATIVOS)
    # ==========================================
    if es_voz_kokoro(voz_id):
        v_low = (voz_id or "").lower()
        if ("-zh-" in v_low or v_low.startswith("local-zh-")) and not getattr(estado_app, "modo_privacidad", False):
            # kokoro_engine usa piper.espeakbridge (sin G2P chino de misaki); evitar que espeak lea "símbolo chino"
            if not getattr(kokoro_engine_global, "tiene_g2p_zh", False):
                print("⚠️ [KOKORO ZH] G2P chino nativo no disponible en kokoro_engine; fallback automático a zh-CN-XiaoxiaoNeural.")
                voz_id = "zh-CN-XiaoxiaoNeural"

    if es_voz_kokoro(voz_id):
        hilos_so = os.cpu_count() or 4
        if es_prioridad_max:
            hilos_kokoro = max(4, min(8, hilos_so // 2)) if hilos_so > 4 else max(1, hilos_so)
        else:
            hilos_kokoro = max(2, min(6, hilos_so // 2)) if hilos_so > 2 else 1

        try:
            if p and es_prioridad_max:
                p.nice(psutil.ABOVE_NORMAL_PRIORITY_CLASS)
            return kokoro_engine_global.sintetizar(
                texto=texto,
                voz_id=voz_id,
                velocidad=vel,
                hilos=hilos_kokoro,
            )
        finally:
            if p:
                try:
                    p.nice(psutil.NORMAL_PRIORITY_CLASS)
                except Exception:
                    pass

    # ==========================================
    # 🏰 CAMINO A: MOTOR LOCAL (PIPER / NITRO)
    # ==========================================
    if voz_id.startswith("Local-"):
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
        es_turbo = es_prioridad_max or es_carga_nueva
        hilos_so = os.cpu_count() or 4
        
        # --- BLOQUE UNIFICADO DE HILOS ---
        if es_turbo:
            if hilos_so <= 2:
                hilos_nitro = 1 
                perfil = "Tostadora"
            elif hilos_so <= 4:
                hilos_nitro = 2 
                perfil = "Ofimática"
            else:
                # 🚀 Perfil Entusiasta (Tu Ryzen 7600)
                hilos_nitro = max(4, hilos_so // 2)
                if hilos_nitro > 8: hilos_nitro = 8 
                perfil = "Entusiasta/Ryzen"
        else:
            hilos_nitro = 1 if hilos_so <= 4 else 2
            perfil = "Bajo Consumo"

        print(f"📡 [NITRO] Perfil: {perfil} | {hilos_so} CPUs -> Usando {hilos_nitro} hilos.")

        try:
            if es_carga_nueva:
                if p: p.nice(psutil.HIGH_PRIORITY_CLASS)
                print(f"🔥 [NITRO ON] Carga fría: {nombre} | Hilos: {hilos_nitro}")
                
                sess_opts = ort.SessionOptions()
                sess_opts.intra_op_num_threads = hilos_nitro
                sess_opts.inter_op_num_threads = 1 
                
                estado_app.voces_cargadas[path_onnx] = PiperVoice.load(path_onnx, use_cuda=False)
                estado_app.voces_cargadas[path_onnx].session = ort.InferenceSession(path_onnx, sess_opts)
            
            elif p:
                p.nice(psutil.ABOVE_NORMAL_PRIORITY_CLASS)

            voice = estado_app.voces_cargadas[path_onnx]
            scale = 1.0 / vel
            
            # --- RECONSTRUCCIÓN DEL INPUT_FEED ---
            phonemes = voice.phonemize(texto)
            id_map = voice.config.phoneme_id_map
            phoneme_ids = []
            for item in phonemes:
                if isinstance(item, list):
                    for sub in item:
                        if sub in id_map: phoneme_ids.extend(id_map[sub])
                elif item in id_map: phoneme_ids.extend(id_map[item])
            
            final_ids = [0]
            for pid in phoneme_ids: final_ids.extend([pid, 0])
            id_tensor = np.expand_dims(np.array(final_ids, dtype=np.int64), 0)
            scales = np.array([0.667, scale, 0.8], dtype=np.float32)
            
            input_feed = {
                "input": id_tensor, 
                "input_lengths": np.array([id_tensor.shape[1]], dtype=np.int64), 
                "scales": scales
            }
            if "sid" in [i.name for i in voice.session.get_inputs()]:
                input_feed["sid"] = np.array([0], dtype=np.int64)

            audio_output = voice.session.run(None, input_feed)[0]
            
            ms_proceso = round((time.perf_counter() - t_inicio) * 1000, 2)
            print(f"[LOG] Piper: {nombre} | {len(texto)} chars | {ms_proceso}ms")

            pcm_raw = (audio_output.squeeze() * 32767).clip(-32768, 32767).astype(np.int16).tobytes()
            return {
                "pcm": _aplicar_fade_pcm(pcm_raw, voice.config.sample_rate, vel),
                "texto": texto, 
                "sr": voice.config.sample_rate
            }
        finally:
            if p: 
                try: p.nice(psutil.NORMAL_PRIORITY_CLASS)
                except: pass

    # ==========================================
    # 🪟 MODO 3: MOTOR ONECORE (VOCES MODERNAS DE WINDOWS)
    # ==========================================
    elif voz_id.startswith("Microsoft") and any(nombre in voz_id for nombre in NOMBRES_ONECORE_LOCALES):
        from winsdk.windows.storage.streams import DataReader
        
        async def generar_win_pcm():
            try:
                synth = SpeechSynthesizer()
                
                # Buscar la voz exacta (Soporta voces OneCore modernas como Raul)
                for v in SpeechSynthesizer.all_voices:
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
                if shutil.which("ffmpeg"):
                    flags_proc = 0x08000000 if sys.platform == "win32" else 0
                    process = subprocess.Popen(
                        ['ffmpeg', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', '22050', 'pipe:1'],
                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                        creationflags=flags_proc
                    )
                    pcm_data, _ = process.communicate(input=wav_bytes)
                    return {"pcm": pcm_data, "texto": texto, "sr": 22050}
                else:
                    return {"pcm": b"", "texto": texto, "sr": 22050}
            except Exception as e:
                print(f"🔥 Error en motor OneCore: {e}")
                return {"pcm": b"", "texto": texto, "sr": 22050}
                
        return safe_async_run(generar_win_pcm())

    # ===========================================
    # ☁️ MODO 2: MOTOR NUBE (EDGE TTS - RESOLUTOR DINÁMICO)
    # ==========================================
    else:
        async def generar_edge_pcm():
            tasa = f"{int((vel - 1) * 100):+d}%"
            
            # 1. TRADUCCIÓN DE NOMBRE
            v_lower = voz_id.lower()
            voz_tecnica = None
            
            # Identificación directa si ya es nombre técnico de voz Neural
            if "neural" in v_lower and "-" in voz_id:
                voz_tecnica = voz_id
            # Mapeo manual rápido
            elif "salome" in v_lower: voz_tecnica = "es-CO-SalomeNeural"
            elif "ramona" in v_lower: voz_tecnica = "es-DO-RamonaNeural"
            elif "dalia" in v_lower: voz_tecnica = "es-MX-DaliaNeural"
            elif "jorge" in v_lower: voz_tecnica = "es-MX-JorgeNeural"
            elif "elena" in v_lower: voz_tecnica = "es-AR-ElenaNeural"
            elif "tomas" in v_lower: voz_tecnica = "es-AR-TomasNeural"
            
            # Auto-descubrimiento (Fallback)
            if not voz_tecnica:
                if not estado_app.catalogo_edge_cache:
                    try:
                        voces_edge = await edge_tts.list_voices()
                        for v in voces_edge:
                            estado_app.catalogo_edge_cache[v['FriendlyName']] = v['ShortName']
                            estado_app.catalogo_edge_cache[v['ShortName']] = v['ShortName']
                    except: pass
                voz_tecnica = estado_app.catalogo_edge_cache.get(voz_id, "es-MX-DaliaNeural")

            # 2. DESCARGA (Esto baja MP3)
            # print(f"☁️ [NUBE] Bajando MP3: {voz_tecnica}...")
            try:
                com = edge_tts.Communicate(texto, voz_tecnica, rate=tasa)
                mp3_data = b""
                async for chunk in com.stream():
                    if chunk["type"] == "audio":
                        mp3_data += chunk["data"]
                return mp3_data
            except Exception as e:
                print(f"🔥 Error descarga Edge: {e}")
                return None

        try:
            mp3_bytes = safe_async_run(generar_edge_pcm())
            
            if not mp3_bytes:
                return {"pcm": b"", "texto": "", "sr": 24000}

            # 3. LA MAGIA: CONVERTIR MP3 A PCM (Adiós Pitido)
            # Usamos FFMPEG para transformar los bytes MP3 a bytes RAW S16LE (Lo que come Piper)
            if shutil.which("ffmpeg"):
                flags_proc = 0x08000000 if sys.platform == "win32" else 0
                process = subprocess.Popen(
                    ['ffmpeg', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', '22050', 'pipe:1'],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                    creationflags=flags_proc
                )
                pcm_data, _ = process.communicate(input=mp3_bytes)
                
                # print(f"✨ [FFMPEG] MP3 -> PCM convertido ({len(pcm_data)} bytes)")
                return {
                    "pcm": pcm_data,
                    "texto": texto,
                    "sr": 22050
                }
            else:
                print("⚠️ [ALERTA] FFmpeg no encontrado. Se enviará MP3 (Sonará como pitido).")
                # Si no hay ffmpeg, mandamos el mp3 y sonará mal, pero no crashea
                return {"pcm": mp3_bytes, "texto": texto, "sr": 24000}

        except Exception as e:
            print(f"🔥 Error Proceso Edge: {e}")
            return {"pcm": b"", "texto": "", "sr": 24000}
            
def worker_horno():
    while True:
        tarea = estado_app.cola_horno.get()
        if tarea is None: break
        if len(tarea) == 4:
            texto_recibido, voz, vel, epoch_tarea = tarea
        else:
            texto_recibido, voz, vel = tarea
            epoch_tarea = estado_app.pasteleria_epoch
        
        # Generamos ID único (Texto + Voz + Velocidad) para que no se mezclen audios de distinta velocidad o motor
        vel_key = round(float(vel or 1.0), 2)
        t_id = f"{normalizar_texto(texto_recibido)}|{voz}|{vel_key}"
        
        if epoch_tarea == estado_app.pasteleria_epoch and t_id not in estado_app.pasteleria_dict:
            try:
                # Llama a la cocina híbrida (Kokoro, Piper o Edge)
                res = cocinar_ahora_pro(texto_recibido, voz, vel)
                if res and "pcm" in res and len(res["pcm"]) > 0:
                    res["pcm"] = _recortar_silencio_pcm(res["pcm"], res.get("sr", 24000))
                # Solo guardamos si no hubo un limpiar_pasteleria() (Snapshot) mientras se cocinaba
                if epoch_tarea == estado_app.pasteleria_epoch and res and "pcm" in res and len(res["pcm"]) > 0:
                    estado_app.pasteleria_dict[t_id] = res
            except Exception as e:
                print(f"🔥 Error en el proceso: {e}")
        
        estado_app.textos_en_proceso.discard(t_id)
        
        estado_app.cola_horno.task_done()



def worker_reproductor():
    while True:
        tarea = estado_app.cola_de_trabajo.get()
        if tarea is None: break
        # 📦 Ahora desempaquetamos los 6 o 7 valores enviados
        sid, texto, voz, vel, t_on, obra, *rest = tarea
        idioma_filtro = rest[0] if rest else ""
        # Pasamos los valores a la lógica de audio
        run_local_logic_v21(sid, texto, voz, vel, t_on, obra, idioma_filtro)
        estado_app.cola_de_trabajo.task_done()

def iniciar_fuerza_laboral():
    # Asignación dinámica de workers según núcleos para evitar contención de CPU y micro-tirones en UI
    hilos_so = os.cpu_count() or 4
    num_workers_horno = 1 if hilos_so <= 4 else (2 if hilos_so <= 12 else 3)
    print(f"🔥 [SISTEMA] Iniciando {num_workers_horno} workers de horno para {hilos_so} hilos de CPU detectados.")
    for i in range(num_workers_horno): threading.Thread(target=worker_horno, daemon=True).start()
    threading.Thread(target=worker_reproductor, daemon=True).start()


def run_local_logic_v21(thread_id, texto_hilo, voz_hilo, vel_hilo, teatro_on, obra_actual, idioma_filtro=""):
    try:
        if estado_app.stream_counter != thread_id: return
        
        # 0. Cargar el diccionario de abreviaturas desde RAM (refresco cada 1s; limpia caché de reemplazos si cambió)
        ahora_ts = time.time()
        if _cache_diccionario_ram["data"] is None or (ahora_ts - _cache_diccionario_ram["ts"]) > 1.0:
            nuevo_dict = cargar_diccionario()
            if nuevo_dict != _cache_diccionario_ram["data"]:
                _cache_reemplazos_ram.clear()
            _cache_diccionario_ram["data"] = nuevo_dict
            _cache_diccionario_ram["ts"] = ahora_ts
        dict_activo = _cache_diccionario_ram["data"]

        # 1. GESTIÓN DE LA VOZ BASE Y DETECCIÓN (Caché en RAM por frase/teatro/obra/filtros)
        ajustes_act = cargar_ajustes_lectura()
        filtros_act = {
            'chk-urls': ajustes_act.get('omitirUrls', False),
            'chk-paren': ajustes_act.get('omitirParen', False),
            'chk-corch': ajustes_act.get('omitirCorch', False),
            'chk-llaves': ajustes_act.get('omitirLlaves', False),
            'chk-barras': ajustes_act.get('omitirBarras', False),
            'chk-referencias': ajustes_act.get('omitirSuperindices', ajustes_act.get('omitirReferencias', True)),
            'chk-superindices': ajustes_act.get('omitirSuperindices', ajustes_act.get('omitirReferencias', True)),
            'chk-subindices': ajustes_act.get('omitirSubindices', False),
        }
        lang_filtro_iso = (idioma_filtro or "").strip().lower()[:2]
        clave_reemp = (
            texto_hilo,
            bool(teatro_on),
            obra_actual,
            lang_filtro_iso,
            tuple(sorted(filtros_act.items())),
        )
        if clave_reemp in _cache_reemplazos_ram:
            texto_limpio, nueva_voz = _cache_reemplazos_ram[clave_reemp]
        else:
            texto_limpio, nueva_voz = aplicar_reemplazos(
                texto_hilo,
                dict_activo,
                filtros_act,
                teatro_on,
                obra_actual,
                idioma_filtro=idioma_filtro,
            )
            if len(_cache_reemplazos_ram) > 2000:
                _cache_reemplazos_ram.clear()
            _cache_reemplazos_ram[clave_reemp] = (texto_limpio, nueva_voz)

        from backend.documento.procesador_texto import IDIOMAS_NO_LATINOS
        tiene_texto_valido = bool(
            texto_limpio and (
                re.search(r'\w', texto_limpio) if lang_filtro_iso in IDIOMAS_NO_LATINOS
                else re.search(r'[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]', texto_limpio)
            )
        )
        if not tiene_texto_valido:
            if nueva_voz:
                estado_app.voz_teatro_persistente = nueva_voz
            estado_app.audio_queue.put({"t": "fin", "sid": thread_id})
            return

        # 2. LÓGICA DE PERSISTENCIA (El "Efecto Memoria")
        if not teatro_on:
            estado_app.voz_teatro_persistente = None
            voz_a_usar = voz_hilo
        else:
            # Si detectamos un actor nuevo, actualizamos la memoria
            if nueva_voz:
                estado_app.voz_teatro_persistente = nueva_voz
            
            # La voz final es: Nueva > Persistente > HUD
            voz_a_usar = nueva_voz if nueva_voz else (estado_app.voz_teatro_persistente if estado_app.voz_teatro_persistente else voz_hilo)

        # 3. SEGURIDAD: Si tras la mutilación del nombre el texto queda vacío, abortamos
        if not texto_limpio: return 

        # 🔓 BLOQUEO ELIMINADO: Ya no verificamos si es "Local-". 
        # Ahora dejamos pasar a Edge (Nube) hacia la cocina.

        # 4. MOTOR DE RENDERIZADO (Caché Híbrida Blindada por Velocidad y Época)
        # 🔥 AJUSTE VITAL: Usamos 'texto_limpio' + 'voz' + 'velocidad' para el ID.
        # Esto evita que un hilo de prefetch anterior contamine la caché con una velocidad vieja (ej. x1 vs x2).
        vel_key = round(float(vel_hilo or 1.0), 2)
        t_id = f"{normalizar_texto(texto_limpio)}|{voz_a_usar}|{vel_key}"
        epoch_inicio = estado_app.pasteleria_epoch
        
        # Verificamos el ID único (incluyendo velocidad) en la caché de audio
        if t_id not in estado_app.pasteleria_dict:
            # 🚀 COCINAMOS: Enviamos texto_limpio (sin nombre)
            datos = cocinar_ahora_pro(texto_limpio, voz_a_usar, vel_hilo)
            if datos and "pcm" in datos and len(datos["pcm"]) > 0:
                datos["pcm"] = _recortar_silencio_pcm(datos["pcm"], datos.get("sr", 24000))
            if epoch_inicio == estado_app.pasteleria_epoch and datos and "pcm" in datos and len(datos["pcm"]) > 0:
                estado_app.pasteleria_dict[t_id] = datos
        else:
            datos = estado_app.pasteleria_dict.get(t_id)

        # 5. CÁLCULO DE DURACIÓN Y SINCRONÍA
        sr = datos.get("sr", 24000)
        num_muestras = len(datos["pcm"]) / 2
        dur_total = num_muestras / sr

        # 6 y 7. TIMESTAMPS NATIVOS (Kokoro `pred_dur`) vs HEURÍSTICA PONDERADA (Piper / Edge)
        if datos.get("meta_palabras") and len(datos["meta_palabras"]) > 0:
            meta_palabras = datos["meta_palabras"]
        else:
            # 7. MOTOR DE SINCRONÍA FRACCIONADA (N:1 Inteligente)
            # Usamos palabras_visuales originales del PDF (texto_hilo) para que vIdx
            # coincida exactamente con las cajas del PDF en pantalla.
            palabras_pdf = texto_hilo.split()
            items_mapeados = mapear_expansion_palabras_n_a_1(palabras_pdf, dict_activo)
            
            total_peso = sum(item["peso"] for item in items_mapeados) if items_mapeados else 1.0
            if total_peso <= 0: total_peso = 1.0

            meta_palabras = []
            t_acum = 0.0

            for item in items_mapeados:
                v_idx = item["vIdx"]
                dur_caja_pdf = dur_total * (item["peso"] / total_peso)
                frags = item["frags"]
                num_frags = len(frags)
                pesos_f = item["pesos_frags"]
                suma_pesos_f = sum(pesos_f) if pesos_f else 1.0
                if suma_pesos_f <= 0: suma_pesos_f = 1.0

                for i, frag in enumerate(frags):
                    dur_por_frag = dur_caja_pdf * (pesos_f[i] / suma_pesos_f)
                    meta_palabras.append({
                        "w": frag.strip(".,!?"),
                        "s": round(t_acum, 4),
                        "e": round(t_acum + dur_por_frag, 4),
                        "vIdx": v_idx,
                        "sub_i": i,
                        "sub_t": num_frags
                    })
                    t_acum += dur_por_frag

        # 8. ENVÍO DE DATOS AL FRONTEND
        estado_app.audio_queue.put({"t": "meta", "sr": sr, "sid": thread_id})
        estado_app.audio_queue.put({"t": "lyrics", "data": meta_palabras, "sid": thread_id})
        
        CHUNK = 32768
        pcm = datos["pcm"]
        for i in range(0, len(pcm), CHUNK):
            if estado_app.stream_counter != thread_id or not estado_app.streaming_active: break
            estado_app.audio_queue.put({
                "t": "a", 
                "d": base64.b64encode(pcm[i:i+CHUNK]).decode('utf-8'), 
                "sid": thread_id
            })
            time.sleep(0.005)
            
    except Exception as e:
        print(f"🔥 ERROR CRÍTICO V21.5 (UNLOCKED): {e}")
    finally:
        if estado_app.stream_counter == thread_id: 
            estado_app.audio_queue.put({"t": "fin", "sid": thread_id})


@eel.expose
def iniciar_streaming_hibrido(texto, voz_id, velocidad_float, session_id, 
                              teatro_activo_ui=False, obra_activa_ui="General", idioma_filtro=""):
    
    print(f"\n📡 [PY -> ENTRADA] Texto: '{texto[:30]}...' | Teatro: {teatro_activo_ui} | Obra: {obra_activa_ui} | Filtro: {idioma_filtro or 'default'}")
    
    estado_app.streaming_active = True
    estado_app.stream_counter = int(session_id)
    
    with estado_app.audio_queue.mutex: 
        estado_app.audio_queue.queue.clear()
    
    estado_app.cola_de_trabajo.put((estado_app.stream_counter, texto, voz_id, velocidad_float, teatro_activo_ui, obra_activa_ui, idioma_filtro))



@eel.expose
def prender_horno_para_siguiente(texto_sig, voz_id, vel_float, idioma_filtro=""):
    # 🛡️ ESCUDO DE TIPO (Igual que en aplicar_reemplazos)
    if isinstance(texto_sig, list):
        texto_sig = " ".join([str(p.get('texto', p)) if isinstance(p, dict) else str(p) for p in texto_sig])
    
    if not isinstance(texto_sig, str):
        texto_sig = str(texto_sig) if texto_sig is not None else ""

    # Si después de limpiar no hay texto, abortamos la cocción
    if not texto_sig: return

    # Ahora sí, generamos el ID exacto coincidente con run_local_logic_v21 y worker_horno (incluyendo velocidad)
    vel_key = round(float(vel_float or 1.0), 2)
    t_id = f"{normalizar_texto(texto_sig)}|{voz_id}|{vel_key}"
    
    if t_id in estado_app.pasteleria_dict or t_id in estado_app.textos_en_proceso: return
    estado_app.textos_en_proceso.add(t_id)
    estado_app.cola_horno.put((texto_sig, voz_id, vel_float, estado_app.pasteleria_epoch))

@eel.expose
def detener_streaming_backend(limpiar_horno=False):
    estado_app.streaming_active = False
    
    with estado_app.audio_queue.mutex: estado_app.audio_queue.queue.clear()
    with estado_app.cola_de_trabajo.mutex: estado_app.cola_de_trabajo.queue.clear()
    if limpiar_horno:
        with estado_app.cola_horno.mutex: estado_app.cola_horno.queue.clear()

@eel.expose
def obtener_chunk_audio():
    try: return estado_app.audio_queue.get_nowait()
    except: return None


@eel.expose
def limpiar_pasteleria():
    estado_app.pasteleria_epoch += 1
    estado_app.abortar_renderizado = True
    estado_app.pasteleria_dict.clear()
    estado_app.textos_en_proceso.clear()
    # Importante: Vaciar la cola de procesamiento para no saturar la red/CPU cocinando audios de una época anterior
    with estado_app.cola_horno.mutex:
        estado_app.cola_horno.queue.clear()
    gc.collect()
    return True

@eel.expose
def pre_renderizar_bloque_paginas(lista_paginas, voz, velocidad, dict_activo, trad_config=None, layouts_por_pagina=None, auto_layout=False):
    # 🛡️ Si la voz es Pocket o Kokoro (modelos pesados), o si es Edge online,
    # no saturar la CPU/red cocinando páginas enteras en ráfaga
    if not voz or es_voz_pocket(voz) or es_voz_kokoro(voz):
        return False
    
    # 🛡️ CANCELACIÓN AGRESIVA: Si el usuario cambia de página o selección, 
    # matamos el renderizado anterior para no generar lag.
    estado_app.abortar_renderizado = True 
    
    def worker():
        time.sleep(0.1) # Breve pausa para limpieza de hilos
        estado_app.abortar_renderizado = False
        
        if not lista_paginas or not estado_app.doc: return

        actual = lista_paginas[0]
        # Prioridad 1: Página Actual (Hoja 1)
        # Prioridad 2: Página Siguiente (Hoja 2)
        # Prioridad 3: Página Anterior (Hoja 3)
        orden = [actual]
        if actual + 1 < len(estado_app.doc): orden.append(actual + 1)
        if actual - 1 >= 0: orden.append(actual - 1)

        print(f"🚀 [NITRO] Priorizando bloque de audio: {orden} con voz: {voz}")
        
        from concurrent.futures import ThreadPoolExecutor
        es_edge = not voz.startswith("Local-") and not any(nombre in voz for nombre in NOMBRES_ONECORE_LOCALES)
        max_trabajadores = 5 if es_edge else 2

        # Analizar configuración de traducción para audio pre-renderizado
        trad_activa = trad_config.get("activa", False) if isinstance(trad_config, dict) else False
        trad_modo = trad_config.get("modo", "subtitulos") if trad_activa else "subtitulos"
        trad_orig = trad_config.get("origen", "auto") if trad_activa else "auto"
        trad_dest = trad_config.get("destino", "es") if trad_activa else "es"
        trad_motor = trad_config.get("motor", "online") if trad_activa else "online"

        for num_pag in orden:
            if estado_app.abortar_renderizado: return

            layout_pag = None
            if isinstance(layouts_por_pagina, dict):
                layout_pag = layouts_por_pagina.get(str(num_pag)) or layouts_por_pagina.get(num_pag)

            # Extraer oraciones de forma ligera (0% GPU/Imagen) respetando el layout de esa página
            textos = obtener_solo_texto_pagina_ligera(
                num_pag,
                dict_activo,
                layout_pagina=layout_pag,
                auto_layout=bool(auto_layout),
            )
            es_prioridad_max = (num_pag == actual)
            
            # Construir la lista de textos a hornear según el modo
            textos_a_hornear = []
            for frase in textos:
                if not frase or not frase.strip(): continue
                frase_limpia = frase.strip()
                
                if trad_activa and trad_modo == "solo_traduccion":
                    # Solo necesitamos el audio de la traducción
                    res = traductor_global.traducir(frase_limpia, trad_orig, trad_dest, trad_motor)
                    txt_trad = res.get("traducido") or frase_limpia
                    textos_a_hornear.append(txt_trad)
                elif trad_activa and trad_modo == "aprendizaje":
                    # Necesitamos el audio original Y el de la traducción
                    textos_a_hornear.append(frase_limpia)
                    res = traductor_global.traducir(frase_limpia, trad_orig, trad_dest, trad_motor)
                    txt_trad = res.get("traducido")
                    if txt_trad and txt_trad != frase_limpia:
                        textos_a_hornear.append(txt_trad)
                else:
                    # Modo normal o subtítulos (solo audio original)
                    textos_a_hornear.append(frase_limpia)
            
            def hornear_frase(frase):
                if estado_app.abortar_renderizado or not frase or not frase.strip():
                    return
                vel_key = round(float(velocidad or 1.0), 2)
                t_id = f"{normalizar_texto(frase)}|{voz}|{vel_key}"
                epoch_local = estado_app.pasteleria_epoch
                if t_id not in estado_app.pasteleria_dict and t_id not in estado_app.textos_en_proceso:
                    try:
                        estado_app.textos_en_proceso.add(t_id)
                        res = cocinar_ahora_pro(frase, voz, velocidad, es_prioridad_max)
                        if not estado_app.abortar_renderizado and epoch_local == estado_app.pasteleria_epoch and res and "pcm" in res and len(res["pcm"]) > 0:
                            estado_app.pasteleria_dict[t_id] = res
                    except Exception as e:
                        print(f"⚠️ Error horneando frase: {e}")
                    finally:
                        estado_app.textos_en_proceso.discard(t_id)

            if es_edge:
                with ThreadPoolExecutor(max_workers=max_trabajadores) as pool:
                    futures = [pool.submit(hornear_frase, f) for f in textos_a_hornear]
                    for f in futures:
                        if estado_app.abortar_renderizado:
                            pool.shutdown(wait=False, cancel_futures=True)
                            return
                        try:
                            f.result()
                        except Exception:
                            pass
            else:
                for frase in textos_a_hornear:
                    if estado_app.abortar_renderizado: return
                    hornear_frase(frase)

        print(f"✨ [NITRO] Pre-renderizado de audio completado para páginas {orden}")

    estado_app.hilo_rendimiento_actual = threading.Thread(target=worker, daemon=True)
    estado_app.hilo_rendimiento_actual.start()

@eel.expose
def descargar_audio_dedicado(pag_ini, pag_fin, voz_id, velocidad_float, lista_cortes_v=None, limites_h=None, dict_activo=None, modo_teatro=False, obra_actual="General", opciones_corte=None):
    if not estado_app.doc:
        return "❌ Error: No hay ningún documento abierto."

    # Diálogo de guardado nativo sin Tkinter (usando pywebview FileDialog)
    ruta_guardado = None
    try:
        if puente_webview.ventana:
            ruta_guardado = puente_webview.ventana.create_file_dialog(
                webview.FileDialog.SAVE,
                save_filename="Audio_Estudio.mp3",
                file_types=(
                    'Audio MP3 (*.mp3)',
                    'Audio WAV (*.wav)',
                    'Todos los archivos (*.*)'
                )
            )
    except Exception as ex_dlg:
        logger.warning(f"Aviso en diálogo guardar audio: {ex_dlg}")

    if isinstance(ruta_guardado, (tuple, list)):
        ruta_guardado = ruta_guardado[0] if ruta_guardado else None
    
    if ruta_guardado and not os.path.splitext(ruta_guardado)[1]:
        ruta_guardado += ".mp3"

    if not ruta_guardado:
        return "⏹️ Cancelado por el usuario."

    def _progreso_ui(paso_actual, total_pasos):
        try:
            eel.actualizar_progreso_modal(paso_actual, total_pasos)()
        except Exception:
            try:
                eel.actualizar_progreso_modal(paso_actual, total_pasos)
            except Exception:
                pass

    res = exportador_audio_global.exportar_rango(
        doc=estado_app.doc,
        pag_ini=pag_ini,
        pag_fin=pag_fin,
        voz_id=voz_id,
        velocidad_float=velocidad_float,
        ruta_salida=ruta_guardado,
        dict_activo=dict_activo,
        modo_teatro=modo_teatro,
        obra_actual=obra_actual,
        cortes_v=lista_cortes_v,
        limites_h=limites_h,
        progress_callback=_progreso_ui,
        opciones_corte=opciones_corte,
    )

    return res.get("mensaje", "Finalizado.")
@eel.expose
def cancelar_exportacion_mp3():
    estado_app.exportacion_activa = False
    estado_app.streaming_active = False # Forzar detención cruzada del reproductor normal
    exportador_audio_global.cancelar()
    
    # Limpiamos las colas de trabajo para cortar hilos residuales inmediatamente
    with estado_app.audio_queue.mutex: 
        estado_app.audio_queue.queue.clear()
        
    print("⏹️ [SISTEMA] Cancelación de exportación y vaciado de colas completado.")
    return True



