import os
import gc
import re
import time
import base64
import threading

from backend.core.webview_bridge import eel
from backend.core.estado_global import estado_app
from backend.core.utils import normalizar_texto
from backend.core.gestor_archivos import cargar_diccionario, cargar_ajustes_lectura
from backend.documento.procesador_texto import aplicar_reemplazos, mapear_expansion_palabras_n_a_1
from backend.audio.motor_audio.comun import (
    _cache_diccionario_ram,
    _cache_reemplazos_ram,
    _recortar_silencio_pcm,
)
from backend.audio.motor_audio.sintesis import cocinar_ahora_pro


def _procesar_tarea_horno(tarea):
    """Sintetiza en segundo plano una tarea de la cola del horno y guarda el resultado en pastelería."""
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
            tiene_pcm = bool(res and "pcm" in res and len(res["pcm"]) > 0)
            if tiene_pcm:
                res["pcm"] = _recortar_silencio_pcm(res["pcm"], res.get("sr", 24000))
                # Solo guardamos si no hubo un limpiar_pasteleria() (Snapshot) mientras se cocinaba
                if epoch_tarea == estado_app.pasteleria_epoch and len(res["pcm"]) > 0:
                    estado_app.pasteleria_dict[t_id] = res
        except Exception as e:
            print(f"🔥 Error en el proceso: {e}")

    estado_app.textos_en_proceso.discard(t_id)


def worker_horno():
    while True:
        tarea = estado_app.cola_horno.get()
        if tarea is None:
            break
        _procesar_tarea_horno(tarea)
        estado_app.cola_horno.task_done()


def worker_reproductor():
    while True:
        tarea = estado_app.cola_de_trabajo.get()
        if tarea is None:
            break
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
    for _ in range(num_workers_horno):
        threading.Thread(target=worker_horno, daemon=True).start()
    threading.Thread(target=worker_reproductor, daemon=True).start()


def _obtener_diccionario_y_reemplazo_cacheado(texto_hilo, teatro_on, obra_actual, idioma_filtro=""):
    """Refresca el diccionario de abreviaturas en RAM y resuelve reemplazos con caché."""
    ahora_ts = time.time()
    if _cache_diccionario_ram["data"] is None or (ahora_ts - _cache_diccionario_ram["ts"]) > 1.0:
        nuevo_dict = cargar_diccionario()
        if nuevo_dict != _cache_diccionario_ram["data"]:
            _cache_reemplazos_ram.clear()
        _cache_diccionario_ram["data"] = nuevo_dict
        _cache_diccionario_ram["ts"] = ahora_ts
    dict_activo = _cache_diccionario_ram["data"]

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
    return texto_limpio, nueva_voz, dict_activo, lang_filtro_iso


def _preparar_texto_y_voz_streaming(texto_hilo, voz_hilo, teatro_on, obra_actual, idioma_filtro=""):
    """Refresca caché de diccionario/reemplazos, valida texto útil y resuelve la voz activa (teatro/HUD)."""
    texto_limpio, nueva_voz, dict_activo, lang_filtro_iso = _obtener_diccionario_y_reemplazo_cacheado(
        texto_hilo, teatro_on, obra_actual, idioma_filtro
    )

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
        return None, None, dict_activo

    # LÓGICA DE PERSISTENCIA (El "Efecto Memoria")
    if not teatro_on:
        estado_app.voz_teatro_persistente = None
        voz_a_usar = voz_hilo
    else:
        if nueva_voz:
            estado_app.voz_teatro_persistente = nueva_voz
        voz_a_usar = nueva_voz or estado_app.voz_teatro_persistente or voz_hilo

    return texto_limpio, voz_a_usar, dict_activo


def _construir_timestamps_streaming(datos, texto_hilo, dict_activo, dur_total):
    """Retorna timestamps nativos (Kokoro) o calcula heurística ponderada por fragmento."""
    if datos.get("meta_palabras"):
        return datos["meta_palabras"]

    palabras_pdf = texto_hilo.split()
    items_mapeados = mapear_expansion_palabras_n_a_1(palabras_pdf, dict_activo)
    total_peso = sum(item["peso"] for item in items_mapeados) if items_mapeados else 1.0
    if total_peso <= 0:
        total_peso = 1.0

    meta_palabras = []
    t_acum = 0.0
    for item in items_mapeados:
        v_idx = item["vIdx"]
        dur_caja_pdf = dur_total * (item["peso"] / total_peso)
        frags = item["frags"]
        num_frags = len(frags)
        pesos_f = item["pesos_frags"]
        suma_pesos_f = sum(pesos_f) if pesos_f else 1.0
        if suma_pesos_f <= 0:
            suma_pesos_f = 1.0

        for i, frag in enumerate(frags):
            dur_por_frag = dur_caja_pdf * (pesos_f[i] / suma_pesos_f)
            meta_palabras.append({
                "w": frag.strip(".,!?"),
                "s": round(t_acum, 4),
                "e": round(t_acum + dur_por_frag, 4),
                "vIdx": v_idx,
                "sub_i": i,
                "sub_t": num_frags,
            })
            t_acum += dur_por_frag
    return meta_palabras


def _obtener_o_cocinar_audio_cacheado(texto_limpio, voz_a_usar, vel_hilo):
    """Recupera audio PCM de la caché de pastelería o lo sintetiza y recorta silencios."""
    vel_key = round(float(vel_hilo or 1.0), 2)
    t_id = f"{normalizar_texto(texto_limpio)}|{voz_a_usar}|{vel_key}"
    epoch_inicio = estado_app.pasteleria_epoch

    if t_id in estado_app.pasteleria_dict:
        return estado_app.pasteleria_dict.get(t_id)

    datos = cocinar_ahora_pro(texto_limpio, voz_a_usar, vel_hilo)
    tiene_pcm = bool(datos and "pcm" in datos and len(datos["pcm"]) > 0)
    if tiene_pcm:
        datos["pcm"] = _recortar_silencio_pcm(datos["pcm"], datos.get("sr", 24000))
        if epoch_inicio == estado_app.pasteleria_epoch:
            estado_app.pasteleria_dict[t_id] = datos
    return datos


def run_local_logic_v21(thread_id, texto_hilo, voz_hilo, vel_hilo, teatro_on, obra_actual, idioma_filtro=""):
    try:
        if estado_app.stream_counter != thread_id:
            return

        texto_limpio, voz_a_usar, dict_activo = _preparar_texto_y_voz_streaming(
            texto_hilo, voz_hilo, teatro_on, obra_actual, idioma_filtro=idioma_filtro
        )
        if texto_limpio is None:
            estado_app.audio_queue.put({"t": "fin", "sid": thread_id})
            return

        # 3. SEGURIDAD: Si tras la mutilación del nombre el texto queda vacío, abortamos
        if not texto_limpio:
            return

        # 4. MOTOR DE RENDERIZADO (Caché Híbrida Blindada por Velocidad y Época)
        datos = _obtener_o_cocinar_audio_cacheado(texto_limpio, voz_a_usar, vel_hilo)

        # 5. CÁLCULO DE DURACIÓN Y SINCRONÍA
        sr = datos.get("sr", 24000)
        num_muestras = len(datos["pcm"]) / 2
        dur_total = num_muestras / sr

        # 6 y 7. TIMESTAMPS NATIVOS (Kokoro `pred_dur`) vs HEURÍSTICA PONDERADA (Piper / Edge)
        meta_palabras = _construir_timestamps_streaming(datos, texto_hilo, dict_activo, dur_total)

        # 8. ENVÍO DE DATOS AL FRONTEND
        estado_app.audio_queue.put({"t": "meta", "sr": sr, "sid": thread_id})
        estado_app.audio_queue.put({"t": "lyrics", "data": meta_palabras, "sid": thread_id})

        CHUNK = 32768
        pcm = datos["pcm"]
        for i in range(0, len(pcm), CHUNK):
            if estado_app.stream_counter != thread_id or not estado_app.streaming_active:
                break
            estado_app.audio_queue.put({
                "t": "a",
                "d": base64.b64encode(pcm[i:i + CHUNK]).decode('utf-8'),
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

    if not texto_sig:
        return

    vel_key = round(float(vel_float or 1.0), 2)
    t_id = f"{normalizar_texto(texto_sig)}|{voz_id}|{vel_key}"

    if t_id in estado_app.pasteleria_dict or t_id in estado_app.textos_en_proceso:
        return
    estado_app.textos_en_proceso.add(t_id)
    estado_app.cola_horno.put((texto_sig, voz_id, vel_float, estado_app.pasteleria_epoch))


@eel.expose
def detener_streaming_backend(limpiar_horno=False):
    estado_app.streaming_active = False

    with estado_app.audio_queue.mutex:
        estado_app.audio_queue.queue.clear()
    with estado_app.cola_de_trabajo.mutex:
        estado_app.cola_de_trabajo.queue.clear()
    if limpiar_horno:
        with estado_app.cola_horno.mutex:
            estado_app.cola_horno.queue.clear()


@eel.expose
def obtener_chunk_audio():
    try:
        return estado_app.audio_queue.get_nowait()
    except Exception:
        return None


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
