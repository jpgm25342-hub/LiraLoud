import os
import re
import gc
import base64
import tempfile
import numpy as np
import onnxruntime as ort
from piper.voice import PiperVoice

from backend.core.webview_bridge import eel
from backend.core.estado_global import estado_app
from backend.core.utils import normalizar_texto, safe_async_run, resolver_nombre_voz_unico
from backend.core.gestor_archivos import cargar_kokoro_blends, guardar_kokoro_blends
from backend.ia.traductor import traductor_global
from backend.audio.kokoro_engine import (
    DIRECTORIO_KOKORO,
    kokoro_engine_global,
    obtener_voces_kokoro,
    obtener_catalogo_base_kokoro,
    es_voz_kokoro,
)
from backend.audio.pocket_engine import (
    pocket_engine_global,
    obtener_voces_pocket,
    cargar_clones_pocket,
)
from backend.audio.voice_catalogue import (
    obtener_catalogo_tienda as _obtener_catalogo_tienda,
    descargar_voz_hf as _descargar_voz_hf,
    eliminar_voz_local as _eliminar_voz_local,
)

DIRECTORIO_PIPER = estado_app.directorio_piper
os.makedirs(DIRECTORIO_PIPER, exist_ok=True)


# ==========================================
# 1. ESCANEO Y CATÁLOGO DE VOCES
# ==========================================
@eel.expose
def escanear_voces_piper():
    voces_locales = obtener_voces_kokoro() + obtener_voces_pocket()
    if not os.path.exists(DIRECTORIO_PIPER):
        return voces_locales
    for archivo in os.listdir(DIRECTORIO_PIPER):
        if archivo.endswith(".onnx") and os.path.exists(
            os.path.join(DIRECTORIO_PIPER, archivo + ".json")
        ):
            nombre = (
                archivo.replace(".onnx", "")
                .replace("es_MX", "🇲🇽")
                .replace("-", " ")
                .title()
            )
            voces_locales.append(
                {
                    "id": f"Local-{archivo}",
                    "nombre": f"💻🪈 {nombre} (Local)",
                    "tipo": "local",
                }
            )
    return voces_locales


@eel.expose
def establecer_modo_privacidad(activo: bool):
    """Activa o desactiva el modo de aislamiento estricto offline."""
    estado_app.modo_privacidad_estricta = bool(activo)
    try:
        traductor_global.modo_privacidad_offline = estado_app.modo_privacidad_estricta
    except Exception as e:
        print(f"⚠️ Error actualizando estado en traductor: {e}")
    print(
        f"🛡️ [PRIVACIDAD BACKEND] Modo 100% Offline: {'ACTIVADO' if estado_app.modo_privacidad_estricta else 'DESACTIVADO'}"
    )
    return estado_app.modo_privacidad_estricta


@eel.expose
def obtener_voces_disponibles():
    try:
        if estado_app.modo_privacidad_estricta:
            return escanear_voces_piper()

        if estado_app.voces_disponibles:
            return escanear_voces_piper() + estado_app.voces_disponibles

        import edge_tts

        async def _fetch():
            try:
                voces_edge = await edge_tts.list_voices()
                estado_app.voces_disponibles = [
                    {
                        "id": v["ShortName"],
                        "nombre": f"🌐 {v.get('FriendlyName', v['ShortName'])}",
                        "tipo": "nube",
                    }
                    for v in voces_edge
                ]
                print(
                    f"🌐 [EDGE] Catálogo cargado: {len(estado_app.voces_disponibles)} voces."
                )
            except Exception as e:
                print(f"⚠️ [EDGE] No se pudo descargar catálogo: {e}")

        safe_async_run(_fetch())
        return escanear_voces_piper() + estado_app.voces_disponibles
    except Exception as e:
        print(f"🔥 Error en el catálogo de voces: {e}")
        return escanear_voces_piper()


@eel.expose
def obtener_todas_las_voces_descarga(voces_sistema_cliente=None):
    """Mezcla las voces locales de Kokoro y Piper con las que el navegador detectó dinámicamente."""
    print("📥 [PY] Sincronizando catálogo con el navegador...")
    lista_final = []
    lista_final.extend(obtener_voces_kokoro())

    if voces_sistema_cliente:
        for v in voces_sistema_cliente:
            lista_final.append(
                {"id": v["name"], "nombre": f"🌐 {v['name']}", "tipo": "nube"}
            )

    if os.path.exists(DIRECTORIO_PIPER):
        for f in os.listdir(DIRECTORIO_PIPER):
            if f.endswith(".onnx"):
                nombre = f.replace(".onnx", "").replace("_", " ").title()
                lista_final.append(
                    {
                        "id": f"Local-{f}",
                        "nombre": f"⚡ Piper: {nombre}",
                        "tipo": "local",
                    }
                )

    print(f"✅ [PY] Catálogo unificado con {len(lista_final)} voces.")
    return lista_final


@eel.expose
def gestionar_ram_favoritos(favoritos_ids):
    """Mantiene en RAM solo las voces Piper/Kokoro que son favoritas."""
    rutas_favoritas = []
    tiene_kokoro_fav = False
    for vid in favoritos_ids:
        if es_voz_kokoro(vid):
            tiene_kokoro_fav = True
        elif vid.startswith("Local-"):
            nombre = vid.replace("Local-", "")
            rutas_favoritas.append(os.path.join(DIRECTORIO_PIPER, nombre))

    if tiene_kokoro_fav:
        try:
            eel.actualizar_log_carga("Cargando motor neuronal Kokoro-82M en RAM...")
            kokoro_engine_global.asegurar_modelo_cargado(
                log_callback=eel.actualizar_log_carga
            )
        except Exception as e:
            print(f"❌ Error precargando Kokoro-82M: {e}")

    for ruta in list(estado_app.voces_cargadas.keys()):
        if ruta not in rutas_favoritas:
            nombre_voz = os.path.basename(ruta)
            eel.actualizar_log_carga(f"Liberando memoria: {nombre_voz}...")
            del estado_app.voces_cargadas[ruta]

    for ruta_onnx in rutas_favoritas:
        if ruta_onnx not in estado_app.voces_cargadas:
            nombre_modelo = os.path.basename(ruta_onnx)
            eel.actualizar_log_carga(f"Cargando modelo: {nombre_modelo}")
            try:
                sess_opts = ort.SessionOptions()
                sess_opts.intra_op_num_threads = 2
                voice = PiperVoice.load(ruta_onnx, use_cuda=False)
                voice.session = ort.InferenceSession(ruta_onnx, sess_opts)
                estado_app.voces_cargadas[ruta_onnx] = voice
            except Exception as e:
                eel.actualizar_log_carga(f"Error en: {nombre_modelo}")
                print(f"❌ Error precargando {ruta_onnx}: {e}")

    eel.actualizar_log_carga("¡Todos los modelos listos!")
    gc.collect()
    return True


# ==========================================
# 2. TIENDA DE VOCES (HUGGING FACE)
# ==========================================
@eel.expose
def obtener_catalogo_tienda_voces():
    return _obtener_catalogo_tienda(DIRECTORIO_PIPER)


@eel.expose
def descargar_voz_tienda(motor, voz_id):
    def _cb(vid, pct):
        try:
            eel.actualizarProgresoVozTienda(vid, pct)()
        except Exception:
            pass

    res = _descargar_voz_hf(motor, voz_id, DIRECTORIO_PIPER, callback_progreso=_cb)
    if res.get("ok"):
        try:
            escanear_voces_piper()
        except Exception:
            pass
    return res


@eel.expose
def pausar_descarga_voz_tienda(voz_id):
    from backend.audio.voice_catalogue import pausar_descarga_voz
    return pausar_descarga_voz(voz_id)


@eel.expose
def reanudar_descarga_voz_tienda(voz_id):
    from backend.audio.voice_catalogue import reanudar_descarga_voz
    return reanudar_descarga_voz(voz_id)


@eel.expose
def cancelar_descarga_voz_tienda(voz_id):
    from backend.audio.voice_catalogue import cancelar_descarga_voz
    return cancelar_descarga_voz(voz_id)


@eel.expose
def obtener_token_hf_tienda():
    from backend.audio.voice_catalogue import obtener_hf_token, obtener_hf_usuario
    tok = obtener_hf_token()
    usuario = obtener_hf_usuario() if tok else ""
    return {"has_token": bool(tok), "usuario": usuario}


@eel.expose
def guardar_token_hf_tienda(token):
    from backend.audio.voice_catalogue import guardar_hf_token
    guardar_hf_token(token)
    return obtener_token_hf_tienda()


@eel.expose
def abrir_url_hf_tienda(url):
    import webbrowser
    if isinstance(url, str) and url.startswith("https://huggingface.co/"):
        webbrowser.open(url)
        return True
    return False


@eel.expose
def eliminar_voz_tienda(motor, voz_id):
    res = _eliminar_voz_local(motor, voz_id, DIRECTORIO_PIPER)
    if res.get("ok"):
        try:
            escanear_voces_piper()
        except Exception:
            pass
    return res


# ==========================================
# 3. LABORATORIO DE MEZCLAS Y MUESTRAS KOKORO
# ==========================================
@eel.expose
def obtener_voces_base_kokoro_blend():
    """Expone el catálogo de voces individuales base de Kokoro al laboratorio de mezclas en JavaScript."""
    return obtener_catalogo_base_kokoro()


@eel.expose
def probar_muestra_kokoro_blend(
    voice_key,
    espeak_voice="es-419",
    texto="Hola, esta es una prueba de mi nueva voz personalizada con Kokoro.",
    style_scale=1.0,
    cadencia=1.0,
):
    """Genera una muestra rápida de audio y la devuelve como base64 PCM."""
    try:
        vel = float(cadencia or 1.0)
        res = kokoro_engine_global.sintetizar(
            texto=texto,
            voz_id=f"Local-kokoro-{voice_key}",
            velocidad=vel,
            voice_key=voice_key,
            espeak_voice=espeak_voice,
            style_scale=float(style_scale or 1.0),
        )
        if res and res.get("pcm"):
            return {
                "exito": True,
                "pcm_b64": base64.b64encode(res["pcm"]).decode("utf-8"),
                "sr": res.get("sr", 24000),
            }
        return {"exito": False, "error": "No se generó audio"}
    except Exception as e:
        print(f"🔥 Error en muestra de mezcla Kokoro: {e}")
        return {"exito": False, "error": str(e)}


@eel.expose
def guardar_nueva_mezcla_kokoro(
    nombre_usuario,
    voz_a,
    peso_a,
    voz_b,
    peso_b,
    espeak_voice="es-419",
    lang="es",
    voz_c="ninguna",
    peso_c=0.0,
    perfil_eq="estudio",
    style_scale=1.0,
    cadencia=1.0,
):
    """Crea o actualiza una mezcla personalizada en kokoro_blends.json y sincroniza el catálogo."""
    try:
        blends = cargar_kokoro_blends()
        nombres_existentes = [
            b.get("nombre_simple") or b.get("nombre") for b in blends
        ]
        nombre_limpio = resolver_nombre_voz_unico(nombre_usuario, nombres_existentes)

        p_a = round(float(peso_a), 2)
        p_b = round(float(peso_b), 2)
        p_c = round(float(peso_c or 0.0), 2)

        if voz_c and voz_c != "ninguna" and p_c > 0:
            voice_key = f"{voz_a}:{p_a}+{voz_b}:{p_b}+{voz_c}:{p_c}"
        else:
            voice_key = f"{voz_a}:{p_a}+{voz_b}:{p_b}"
            voz_c = "ninguna"
            p_c = 0.0

        slug = (
            re.sub(r"[^a-zA-Z0-9_]", "_", normalizar_texto(nombre_limpio))
            .strip("_")
            .lower()
        )
        if not slug:
            slug = "blend"
        blend_id = f"Local-{lang}-kokoro-custom_{slug}"

        blends = [
            b
            for b in blends
            if b.get("id") != blend_id
            and b.get("nombre")
            not in (
                f"Kokoro: {nombre_limpio} (Mezcla)",
                f"⚡ 🧪 Kokoro: {nombre_limpio} (Mezcla)",
            )
        ]

        nuevo_blend = {
            "id": blend_id,
            "voice_key": voice_key,
            "lang": lang,
            "espeak_voice": espeak_voice,
            "nombre": f"Kokoro: {nombre_limpio} (Mezcla)",
            "nombre_simple": nombre_limpio,
            "voz_a": voz_a,
            "peso_a": p_a,
            "voz_b": voz_b,
            "peso_b": p_b,
            "voz_c": voz_c,
            "peso_c": p_c,
            "perfil_eq": perfil_eq or "estudio",
            "style_scale": float(style_scale or 1.0),
            "cadencia": float(cadencia or 1.0),
        }
        blends.append(nuevo_blend)
        guardar_kokoro_blends(blends)
        print(
            f"🧪 [KOKORO] Nueva mezcla guardada: {blend_id} ({voice_key}) [EQ: {perfil_eq}]"
        )
        return {"exito": True, "blend": nuevo_blend}
    except Exception as e:
        print(f"🔥 Error al guardar nueva mezcla: {e}")
        return {"exito": False, "error": str(e)}


@eel.expose
def crear_voz_desde_muestra(
    nombre_usuario,
    audio_b64,
    filename="",
    espeak_voice="es-419",
    lang="es",
    perfil_eq="estudio",
):
    """Extrae el timbre con inno_kokoro desde un audio base64 (5-15s) y genera un .bin nativo."""
    try:
        from inno_kokoro.enroll import Tuner, enroll, read

        if not audio_b64:
            return {"exito": False, "error": "No se recibió archivo de audio"}

        blends_actuales = cargar_kokoro_blends()
        nombres_existentes = [
            b.get("nombre_simple") or b.get("nombre") for b in blends_actuales
        ]
        nombre_limpio = resolver_nombre_voz_unico(nombre_usuario, nombres_existentes)

        slug = (
            re.sub(r"[^a-zA-Z0-9_]", "_", normalizar_texto(nombre_limpio))
            .strip("_")
            .lower()
        )
        if not slug:
            slug = "muestra"
        voice_key = f"custom_{slug}"
        blend_id = f"Local-{lang}-kokoro-{voice_key}"

        ext = ".wav"
        if filename and "." in filename:
            ext = "." + filename.rsplit(".", 1)[1].lower()

        audio_bytes = base64.b64decode(audio_b64)
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp_file:
            tmp_file.write(audio_bytes)
            tmp_path = tmp_file.name

        try:
            tuner = Tuner()
            wav, sr = read(tmp_path)

            max_segundos = 15
            max_muestras = int(max_segundos * sr)
            if len(wav) > max_muestras:
                print(
                    f"✂️ [KOKORO LAB] Muestra grande detectada ({len(wav)/sr:.1f}s). Recortando a los primeros {max_segundos}s..."
                )
                wav = wav[:max_muestras]

            pack, weights = enroll(wav, sr, tuner)
            pack_np = pack.detach().cpu().numpy().astype(np.float32)

            top_weights = []
            if isinstance(weights, dict):
                sorted_w = sorted(weights.items(), key=lambda x: x[1], reverse=True)
                for v_name, v_weight in sorted_w:
                    porcentaje = round(float(v_weight) * 100, 1)
                    if porcentaje >= 3.0:
                        top_weights.append({"voz": v_name, "peso": porcentaje})
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass

        dest_dir = (
            kokoro_engine_global.models_dir
            if kokoro_engine_global
            else DIRECTORIO_KOKORO
        )
        voices_dir = os.path.join(dest_dir, "voices")
        os.makedirs(voices_dir, exist_ok=True)
        bin_path = os.path.join(voices_dir, f"{voice_key}.bin")
        pack_np.tofile(bin_path)

        if kokoro_engine_global:
            kokoro_engine_global.voices_cache[voice_key] = pack_np.reshape(-1, 1, 256)

        desc_interpolacion = ""
        if top_weights:
            desc_interpolacion = " + ".join(
                [
                    f"{item['voz'].replace('am_','').replace('af_','').replace('bm_','').replace('bf_','')} ({item['peso']}%)"
                    for item in top_weights[:3]
                ]
            )

        blends = cargar_kokoro_blends()
        blends = [
            b
            for b in blends
            if b.get("id") != blend_id
            and b.get("nombre")
            not in (
                f"Kokoro: {nombre_limpio} (Muestra)",
                f"Kokoro: {nombre_limpio} (Mezcla)",
            )
        ]

        nuevo_blend = {
            "id": blend_id,
            "voice_key": voice_key,
            "lang": lang,
            "espeak_voice": espeak_voice,
            "nombre": f"Kokoro: {nombre_limpio} (Muestra)",
            "nombre_simple": nombre_limpio,
            "tipo_origen": "muestra_audio",
            "perfil_eq": perfil_eq or "estudio",
            "style_scale": 1.0,
            "cadencia": 1.0,
            "interpolacion": top_weights,
            "interpolacion_desc": desc_interpolacion,
        }
        blends.append(nuevo_blend)
        guardar_kokoro_blends(blends)
        print(
            f"[KOKORO] Nueva voz creada desde muestra: {blend_id} ({bin_path}) | Interpolación: {desc_interpolacion}"
        )
        return {
            "exito": True,
            "blend": nuevo_blend,
            "interpolacion": top_weights,
            "interpolacion_desc": desc_interpolacion,
        }
    except Exception as e:
        print(f"Error al crear voz desde muestra: {e}")
        return {"exito": False, "error": str(e)}


@eel.expose
def eliminar_mezcla_kokoro(blend_id):
    """Elimina una mezcla personalizada por ID."""
    try:
        blends = cargar_kokoro_blends()
        dest_dir = (
            kokoro_engine_global.models_dir
            if kokoro_engine_global
            else DIRECTORIO_KOKORO
        )
        for b in blends:
            if b.get("id") == blend_id and b.get("tipo_origen") == "muestra_audio":
                v_key = b.get("voice_key")
                if v_key:
                    bin_file = os.path.join(dest_dir, "voices", f"{v_key}.bin")
                    if os.path.exists(bin_file):
                        try:
                            os.remove(bin_file)
                        except Exception:
                            pass
                    if (
                        kokoro_engine_global
                        and v_key in kokoro_engine_global.voices_cache
                    ):
                        kokoro_engine_global.voices_cache.pop(v_key, None)

        nuevos = [b for b in blends if b.get("id") != blend_id]
        guardar_kokoro_blends(nuevos)
        return True
    except Exception as e:
        print(f"Error al eliminar mezcla: {e}")
        return False


# ==========================================
# 4. CLONACIÓN ZERO-SHOT POCKET TTS
# ==========================================
@eel.expose
def clonar_voz_pocket(
    nombre_usuario, audio_b64, filename="muestra.wav", idioma="spanish"
):
    """Recibe un audio (base64 de micrófono o archivo) y lo clona con Pocket-TTS."""
    try:
        import soundfile as sf

        if not audio_b64:
            return {"exito": False, "error": "No se recibió archivo de audio"}

        ext = ".wav"
        if filename and "." in filename:
            ext = "." + filename.rsplit(".", 1)[1].lower()

        audio_bytes = base64.b64decode(audio_b64)
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp_file:
            tmp_file.write(audio_bytes)
            tmp_path = tmp_file.name

        try:
            try:
                data, sr = sf.read(tmp_path)
                max_s = 15
                if len(data) > max_s * sr:
                    print(
                        f"✂️ [POCKET] Muestra de {len(data)/sr:.1f}s recortada a {max_s}s"
                    )
                    sf.write(tmp_path, data[: max_s * sr], sr)
            except Exception as e_trim:
                print(f"Aviso al validar duración de muestra: {e_trim}")

            return pocket_engine_global.crear_clon_desde_audio(
                nombre_usuario=nombre_usuario, ruta_audio=tmp_path, idioma=idioma
            )
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
    except Exception as e:
        print(f"🔥 Error al clonar voz con Pocket-TTS: {e}")
        return {"exito": False, "error": str(e)}


@eel.expose
def listar_clones_pocket():
    """Devuelve la lista de clones creados con Pocket-TTS."""
    return cargar_clones_pocket()


@eel.expose
def eliminar_clon_pocket(voice_id):
    """Elimina una voz clonada con Pocket-TTS."""
    return pocket_engine_global.eliminar_clon(voice_id)


@eel.expose
def probar_muestra_clon_pocket(
    voice_id,
    texto="Hola, esta es una prueba de mi voz clonada con inteligencia artificial.",
):
    """Genera una muestra rápida de una voz clonada y devuelve el PCM base64."""
    try:
        res = pocket_engine_global.sintetizar(texto=texto, voz_id=voice_id)
        if res and res.get("pcm"):
            return {
                "exito": True,
                "pcm_b64": base64.b64encode(res["pcm"]).decode("utf-8"),
                "sr": res.get("sr", 24000),
            }
        return {"exito": False, "error": "No se generó audio"}
    except Exception as e:
        print(f"🔥 Error en muestra de clon Pocket: {e}")
        return {"exito": False, "error": str(e)}
