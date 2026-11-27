import asyncio
import base64
import hashlib
import io
import os
import re
import shutil

from backend.core.estado_global import estado_app
from backend.core.webview_bridge import eel


def _obtener_dir_cache_tutorial():
    """Retorna y asegura el directorio raíz de caché de audios del tutorial."""
    ruta = os.path.join(estado_app.base_dir, "cache_tutorial_audio")
    os.makedirs(ruta, exist_ok=True)
    return ruta


@eel.expose
def limpiar_cache_audio_tutorial(idioma_conservar=None):
    """Elimina subcarpetas de caché de audio del tutorial de idiomas distintos a idioma_conservar."""
    cache_root = _obtener_dir_cache_tutorial()
    conservar = re.sub(r"[^a-z]", "", (idioma_conservar or "").lower().strip())[:5]
    eliminados = []

    try:
        for entrada in os.listdir(cache_root):
            ruta_sub = os.path.join(cache_root, entrada)
            if os.path.isdir(ruta_sub) and (not conservar or entrada.lower() != conservar):
                shutil.rmtree(ruta_sub, ignore_errors=True)
                eliminados.append(entrada)
        return {"ok": True, "eliminados": eliminados}
    except Exception as e:
        return {"ok": False, "error": str(e)[:150]}


@eel.expose
def sintetizar_audio_tutorial(texto, voz_edge="es-MX-DaliaNeural", lang_iso=None):
    """Sintetiza (o lee de caché en disco) una locución del tutorial vía Edge-TTS en MP3 base64."""
    texto_limpio = (texto or "").strip()
    if not texto_limpio:
        return {"ok": False, "error": "Texto vacío"}

    lang_raw = (lang_iso or (voz_edge.split("-")[0] if voz_edge else "es")).lower().strip()
    lang_dir = re.sub(r"[^a-z]", "", lang_raw)[:5] or "es"
    dir_idioma = os.path.join(_obtener_dir_cache_tutorial(), lang_dir)
    os.makedirs(dir_idioma, exist_ok=True)

    clave_sha1 = hashlib.sha1(f"{voz_edge}|{texto_limpio}".encode("utf-8")).hexdigest()
    ruta_mp3 = os.path.join(dir_idioma, f"{clave_sha1}.mp3")
    ruta_mp3_bundle = os.path.join(estado_app.bundle_dir, "cache_tutorial_audio", lang_dir, f"{clave_sha1}.mp3")

    # 1. Hit de caché en disco o en bundle empaquetado (instantáneo y funcional en modo offline)
    for ruta_candidata in (ruta_mp3, ruta_mp3_bundle):
        if os.path.isfile(ruta_candidata) and os.path.getsize(ruta_candidata) > 0:
            try:
                with open(ruta_candidata, "rb") as f:
                    audio_bytes = f.read()
                return {
                    "ok": True,
                    "audio_b64": base64.b64encode(audio_bytes).decode("utf-8"),
                    "mime": "audio/mpeg",
                    "cached": True,
                }
            except Exception:
                pass

    # 2. Miss de caché: bloquear solo la descarga externa si el modo privacidad está activo
    if getattr(estado_app, "modo_privacidad_estricta", False):
        return {"ok": False, "error": "Modo privacidad activo"}

    import edge_tts

    async def _generar():
        com = edge_tts.Communicate(texto_limpio, voz_edge, rate="+5%")
        buf = io.BytesIO()
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        return buf.getvalue()

    try:
        audio_bytes = asyncio.run(_generar())
        if not audio_bytes:
            return {"ok": False, "error": "Sin audio generado"}
        try:
            with open(ruta_mp3, "wb") as f:
                f.write(audio_bytes)
        except Exception:
            pass
        return {
            "ok": True,
            "audio_b64": base64.b64encode(audio_bytes).decode("utf-8"),
            "mime": "audio/mpeg",
            "cached": False,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)[:150]}
