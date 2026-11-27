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
    es_voz_pocket,
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
        elif es_voz_pocket(vid):
            # Pocket TTS gestiona su propio estado/clones en pocket_models/
            continue
        elif vid.startswith("Local-"):
            nombre = vid.replace("Local-", "")
            ruta_candidata = os.path.join(DIRECTORIO_PIPER, nombre)
            if nombre.endswith(".onnx") and os.path.isfile(ruta_candidata):
                rutas_favoritas.append(ruta_candidata)

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

# Reexportación de endpoints Voice Lab (Kokoro Blends + Pocket Clones)
from backend.audio.voice_lab_rpc import (  # noqa: E402, F401
    obtener_voces_base_kokoro_blend,
    probar_muestra_kokoro_blend,
    _construir_registro_mezcla_kokoro,
    guardar_nueva_mezcla_kokoro,
    _extraer_timbre_desde_audio_b64,
    crear_voz_desde_muestra,
    eliminar_mezcla_kokoro,
    clonar_voz_pocket,
    listar_clones_pocket,
    eliminar_clon_pocket,
    probar_muestra_clon_pocket,
)
