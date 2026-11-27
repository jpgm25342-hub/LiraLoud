# LiraLoud - Voice Lab RPC (mezclas de voces Kokoro y clonación Pocket)
import os
import re
import base64
import tempfile
import numpy as np

from backend.core.webview_bridge import eel
from backend.core.utils import normalizar_texto, resolver_nombre_voz_unico
from backend.core.gestor_archivos import cargar_kokoro_blends, guardar_kokoro_blends
from backend.audio.kokoro_engine import (
    DIRECTORIO_KOKORO,
    kokoro_engine_global,
    obtener_catalogo_base_kokoro,
)
from backend.audio.pocket_engine import (
    pocket_engine_global,
    cargar_clones_pocket,
)


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

def _construir_registro_mezcla_kokoro(
    nombre_limpio,
    voz_a,
    peso_a,
    voz_b,
    peso_b,
    espeak_voice,
    lang,
    voz_c,
    peso_c,
    perfil_eq,
    style_scale,
    cadencia,
):
    """Construye el diccionario normalizado de una mezcla Kokoro personalizada."""
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

    return {
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

        nuevo_blend = _construir_registro_mezcla_kokoro(
            nombre_limpio, voz_a, peso_a, voz_b, peso_b, espeak_voice, lang,
            voz_c, peso_c, perfil_eq, style_scale, cadencia,
        )
        blend_id = nuevo_blend["id"]
        voice_key = nuevo_blend["voice_key"]

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

        blends.append(nuevo_blend)
        guardar_kokoro_blends(blends)
        print(
            f"🧪 [KOKORO] Nueva mezcla guardada: {blend_id} ({voice_key}) [EQ: {perfil_eq}]"
        )
        return {"exito": True, "blend": nuevo_blend}
    except Exception as e:
        print(f"🔥 Error al guardar nueva mezcla: {e}")
        return {"exito": False, "error": str(e)}

def _extraer_timbre_desde_audio_b64(audio_b64, filename=""):
    """Decodifica audio base64 a un temporal, recorta a 15s y ejecuta inno_kokoro.enroll."""
    from inno_kokoro.enroll import Tuner, enroll, read

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
        return pack_np, top_weights
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

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

        pack_np, top_weights = _extraer_timbre_desde_audio_b64(audio_b64, filename)

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
