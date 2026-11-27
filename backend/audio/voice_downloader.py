# LiraLoud - Autenticación HuggingFace, descarga, control y eliminación local de voces
import json
import os
import time
import urllib.request

from backend.audio.kokoro_engine import (
    DIRECTORIO_KOKORO,
    HF_REPO_ID as KOKORO_HF_REPO,
)
from backend.audio.pocket_engine import DIRECTORIO_POCKET, pocket_engine_global
from backend.core.estado_global import estado_app
from backend.audio.voice_catalogue import (
    _cargar_piper_desde_hf,
    _obtener_catalogo_pocket,
)


_ESTADO_DESCARGAS = {}


def _ruta_hf_token():
    return os.path.join(estado_app.base_dir, "hf_token.json")


def _leer_hf_config():
    ruta = _ruta_hf_token()
    if os.path.exists(ruta):
        try:
            with open(ruta, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return {
                        "hf_token": str(data.get("hf_token") or "").strip(),
                        "usuario": str(data.get("usuario") or "").strip(),
                    }
        except (OSError, ValueError):
            pass
    env_tok = (os.environ.get("HF_TOKEN") or "").strip()
    return {"hf_token": env_tok, "usuario": ""}


def obtener_hf_token():
    return _leer_hf_config()["hf_token"]


def obtener_hf_usuario():
    return _leer_hf_config()["usuario"]


def _consultar_usuario_hf(token):
    try:
        req = urllib.request.Request(
            "https://huggingface.co/api/whoami-v2",
            headers={"User-Agent": "LiraLoud/2.0", "Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(req, timeout=4) as resp:
            info = json.loads(resp.read().decode("utf-8"))
            return str(info.get("name") or "").strip()
    except Exception:
        return ""


def guardar_hf_token(token):
    tok = (token or "").strip()
    ruta = _ruta_hf_token()
    if not tok:
        if os.path.exists(ruta):
            try:
                os.remove(ruta)
            except OSError:
                pass
        return True
    usuario = _consultar_usuario_hf(tok)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump({"hf_token": tok, "usuario": usuario}, f, ensure_ascii=False, indent=2)
    return True


def pausar_descarga_voz(voz_id):
    if voz_id in _ESTADO_DESCARGAS:
        _ESTADO_DESCARGAS[voz_id]["pausada"] = True
    return True


def reanudar_descarga_voz(voz_id):
    if voz_id in _ESTADO_DESCARGAS:
        _ESTADO_DESCARGAS[voz_id]["pausada"] = False
    return True


def cancelar_descarga_voz(voz_id):
    if voz_id in _ESTADO_DESCARGAS:
        _ESTADO_DESCARGAS[voz_id]["cancelada"] = True
        _ESTADO_DESCARGAS[voz_id]["pausada"] = False
    else:
        _ESTADO_DESCARGAS[voz_id] = {"pausada": False, "cancelada": True}
    return True


def _descargar_archivo(url, destino, callback_progreso=None, voz_id=""):
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    estado = _ESTADO_DESCARGAS.get(voz_id) if voz_id else None
    headers = {"User-Agent": "LiraLoud/2.0"}
    token = obtener_hf_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as resp:
        total = int(resp.headers.get("Content-Length") or 0)
        descargado = 0
        tmp_destino = destino + ".tmp"
        with open(tmp_destino, "wb") as f:
            while True:
                if estado:
                    if estado.get("cancelada"):
                        raise RuntimeError("__CANCELADA__")
                    while estado.get("pausada") and not estado.get("cancelada"):
                        time.sleep(0.1)
                    if estado.get("cancelada"):
                        raise RuntimeError("__CANCELADA__")
                bloque = resp.read(65536)
                if not bloque:
                    break
                f.write(bloque)
                descargado += len(bloque)
                if callback_progreso and total > 0:
                    pct = min(99, int((descargado / total) * 100))
                    callback_progreso(voz_id, pct)
        os.replace(tmp_destino, destino)


def descargar_voz_hf(motor, voz_id, directorio_piper, callback_progreso=None):
    """Descarga una voz de Piper, Kokoro o Pocket desde Hugging Face."""
    _ESTADO_DESCARGAS[voz_id] = {"pausada": False, "cancelada": False}
    try:
        return _descargar_voz_hf_impl(motor, voz_id, directorio_piper, callback_progreso)
    finally:
        _ESTADO_DESCARGAS.pop(voz_id, None)


def _formatear_error_descarga(exc):
    if "__CANCELADA__" in str(exc):
        return {"ok": False, "cancelada": True, "error": "Descarga cancelada"}
    return {"ok": False, "error": str(exc)}


def _descargar_voz_piper(voz_id, directorio_piper, callback_progreso=None):
    """Descarga el modelo ONNX y su archivo .json de configuración para una voz Piper."""
    catalogo = _cargar_piper_desde_hf()
    voz = next((v for v in catalogo if v["id"] == voz_id), None)
    if not voz:
        return {"ok": False, "error": "Voz de Piper no encontrada en el catálogo."}
    os.makedirs(directorio_piper, exist_ok=True)
    destino_modelo = os.path.join(directorio_piper, voz["archivo"])
    destino_config = destino_modelo + ".json"
    try:
        _descargar_archivo(voz["url_modelo"], destino_modelo, callback_progreso, voz_id)
        if voz.get("url_config"):
            _descargar_archivo(voz["url_config"], destino_config)
        if callback_progreso:
            callback_progreso(voz_id, 100)
        return {"ok": True, "id": voz_id}
    except Exception as e:
        for p in (destino_modelo + ".tmp", destino_config + ".tmp"):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
        return _formatear_error_descarga(e)


def _descargar_voz_kokoro(voz_id, callback_progreso=None):
    """Descarga los artefactos base de Kokoro (si faltan) y el archivo `.bin` de la voz solicitada."""
    try:
        os.makedirs(os.path.join(DIRECTORIO_KOKORO, "voices"), exist_ok=True)
        tok_dest = os.path.join(DIRECTORIO_KOKORO, "tokenizer.json")
        if not os.path.exists(tok_dest):
            _descargar_archivo(
                f"https://huggingface.co/{KOKORO_HF_REPO}/resolve/main/tokenizer.json?download=true",
                tok_dest,
            )
        onnx_fp32 = os.path.join(DIRECTORIO_KOKORO, "onnx", "model.onnx")
        onnx_quant = os.path.join(DIRECTORIO_KOKORO, "onnx", "model_quantized.onnx")
        if not os.path.exists(onnx_fp32) and not os.path.exists(onnx_quant):
            _descargar_archivo(
                f"https://huggingface.co/{KOKORO_HF_REPO}/resolve/main/onnx/model_quantized.onnx?download=true",
                onnx_quant,
                callback_progreso,
                voz_id,
            )
        destino_bin = os.path.join(DIRECTORIO_KOKORO, "voices", f"{voz_id}.bin")
        url_bin = f"https://huggingface.co/{KOKORO_HF_REPO}/resolve/main/voices/{voz_id}.bin?download=true"
        _descargar_archivo(url_bin, destino_bin, callback_progreso, voz_id)
        if callback_progreso:
            callback_progreso(voz_id, 100)
        return {"ok": True, "id": voz_id}
    except Exception as e:
        return _formatear_error_descarga(e)


def _descargar_voz_hf_impl(motor, voz_id, directorio_piper, callback_progreso=None):
    if motor == "piper":
        return _descargar_voz_piper(voz_id, directorio_piper, callback_progreso)

    if motor == "kokoro":
        return _descargar_voz_kokoro(voz_id, callback_progreso)

    if motor == "pocket":
        try:
            catalogo_p = _obtener_catalogo_pocket()
            voz_p = next((v for v in catalogo_p if v["id"] == voz_id), None)
            if not voz_p:
                return {"ok": False, "error": "Modelo Pocket no encontrado."}
            if callback_progreso:
                callback_progreso(voz_id, 25)
            pocket_engine_global._obtener_modelo(voz_p["lang_key"])
            os.makedirs(DIRECTORIO_POCKET, exist_ok=True)
            with open(os.path.join(DIRECTORIO_POCKET, f".ready_{voz_p['lang_key']}"), "w", encoding="utf-8") as f:
                f.write("ok")
            if callback_progreso:
                callback_progreso(voz_id, 100)
            return {"ok": True, "id": voz_id}
        except Exception as e:
            return _formatear_error_descarga(e)

    return {"ok": False, "error": f"Motor '{motor}' no reconocido."}


def eliminar_voz_local(motor, voz_id, directorio_piper):
    """Elimina los archivos locales de una voz descargada."""
    if motor == "piper":
        catalogo = _cargar_piper_desde_hf()
        voz = next((v for v in catalogo if v["id"] == voz_id), None)
        archivo = voz["archivo"] if voz else f"{voz_id}.onnx"
        eliminado = False
        for path in (
            os.path.join(directorio_piper, archivo),
            os.path.join(directorio_piper, archivo + ".json"),
        ):
            if os.path.exists(path):
                os.remove(path)
                eliminado = True
        return {"ok": eliminado}

    if motor == "kokoro":
        ruta_bin = os.path.join(DIRECTORIO_KOKORO, "voices", f"{voz_id}.bin")
        if os.path.exists(ruta_bin):
            os.remove(ruta_bin)
            return {"ok": True}
        return {"ok": False, "error": "El archivo de voz Kokoro no existe en disco."}

    if motor == "pocket":
        catalogo_p = _obtener_catalogo_pocket()
        voz_p = next((v for v in catalogo_p if v["id"] == voz_id), None)
        if voz_p:
            marker = os.path.join(DIRECTORIO_POCKET, f".ready_{voz_p['lang_key']}")
            if os.path.exists(marker):
                os.remove(marker)
            pocket_engine_global._models.pop(voz_p["lang_key"], None)
            return {"ok": True}

    return {"ok": False, "error": f"Motor '{motor}' no soportado."}
