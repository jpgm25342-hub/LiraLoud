import json
import os
import urllib.request

from backend.audio.kokoro_engine import (
    DIRECTORIO_KOKORO,
    HF_REPO_ID as KOKORO_HF_REPO,
    VOCES_KOKORO_DISPONIBLES_PARA_BLEND,
)
from backend.audio.pocket_engine import DIRECTORIO_POCKET, pocket_engine_global
from backend.core.estado_global import estado_app

PIPER_VOICES_JSON_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json"
PIPER_HF_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/"

# Catálogo base offline de respaldo para Piper
CATALOGO_PIPER_FALLBACK = [
    {
        "id": "es_ES-davefx-medium",
        "motor": "piper",
        "nombre": "DaveFX (España - Media)",
        "idioma": "es_ES",
        "peso": "~63 MB",
        "archivo": "es_ES-davefx-medium.onnx",
        "url_modelo": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx?download=true",
        "url_config": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json?download=true",
    },
    {
        "id": "es_ES-sharvard-medium",
        "motor": "piper",
        "nombre": "Sharvard (España - Media)",
        "idioma": "es_ES",
        "peso": "~63 MB",
        "archivo": "es_ES-sharvard-medium.onnx",
        "url_modelo": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx?download=true",
        "url_config": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx.json?download=true",
    },
    {
        "id": "es_ES-carlfm-x_low",
        "motor": "piper",
        "nombre": "CarlFM (España - Ligera)",
        "idioma": "es_ES",
        "peso": "~28 MB",
        "archivo": "es_ES-carlfm-x_low.onnx",
        "url_modelo": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx?download=true",
        "url_config": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx.json?download=true",
    },
    {
        "id": "es_MX-ald-medium",
        "motor": "piper",
        "nombre": "Ald (México - Media)",
        "idioma": "es_MX",
        "peso": "~63 MB",
        "archivo": "es_MX-ald-medium.onnx",
        "url_modelo": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx?download=true",
        "url_config": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx.json?download=true",
    },
    {
        "id": "es_MX-claude-high",
        "motor": "piper",
        "nombre": "Claude (México - Alta)",
        "idioma": "es_MX",
        "peso": "~110 MB",
        "archivo": "es_MX-claude-high.onnx",
        "url_modelo": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx?download=true",
        "url_config": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx.json?download=true",
    },
    {
        "id": "es_AR-daniela-high",
        "motor": "piper",
        "nombre": "Daniela (Argentina - Alta)",
        "idioma": "es_AR",
        "peso": "~110 MB",
        "archivo": "es_AR-daniela-high.onnx",
        "url_modelo": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high/es_AR-daniela-high.onnx?download=true",
        "url_config": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high/es_AR-daniela-high.onnx.json?download=true",
    },
    {
        "id": "en_US-lessac-medium",
        "motor": "piper",
        "nombre": "Lessac (EE.UU. - Media)",
        "idioma": "en_US",
        "peso": "~63 MB",
        "archivo": "en_US-lessac-medium.onnx",
        "url_modelo": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx?download=true",
        "url_config": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json?download=true",
    },
    {
        "id": "en_US-amy-medium",
        "motor": "piper",
        "nombre": "Amy (EE.UU. - Media)",
        "idioma": "en_US",
        "peso": "~63 MB",
        "archivo": "en_US-amy-medium.onnx",
        "url_modelo": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx?download=true",
        "url_config": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json?download=true",
    },
    {
        "id": "en_GB-alba-medium",
        "motor": "piper",
        "nombre": "Alba (Reino Unido - Media)",
        "idioma": "en_GB",
        "peso": "~63 MB",
        "archivo": "en_GB-alba-medium.onnx",
        "url_modelo": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx?download=true",
        "url_config": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx.json?download=true",
    },
]

_CACHE_PIPER_HF = None
_CACHE_REPO_DOWNLOADS = {}


def _obtener_descargas_repo(repo_id):
    if repo_id in _CACHE_REPO_DOWNLOADS:
        return _CACHE_REPO_DOWNLOADS[repo_id]
    try:
        url = f"https://huggingface.co/api/models/{repo_id}"
        req = urllib.request.Request(url, headers={"User-Agent": "LiraLoud/2.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        dl = int(data.get("downloads", 0) or 0)
        _CACHE_REPO_DOWNLOADS[repo_id] = dl
        return dl
    except Exception:
        return 0


def _buscar_repos_comunidad_piper():
    """Busca repositorios comunitarios de Piper en Hugging Face (ej. piper-es, piper-voice) que contengan .onnx y .onnx.json."""
    voces_comunidad = []
    vistos = set()
    consultas = ["piper-es", "piper-voice-es", "piper-voice", "piper-en"]
    for q in consultas:
        url = f"https://huggingface.co/api/models?search={q}&full=true&limit=50"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "LiraLoud/2.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                modelos = json.loads(resp.read().decode("utf-8"))
            if not isinstance(modelos, list):
                continue
            for m in modelos:
                repo_id = m.get("id") or m.get("modelId")
                if not repo_id or repo_id in vistos or repo_id == "rhasspy/piper-voices":
                    continue
                if "checkpoint" in repo_id.lower():
                    continue
                siblings = m.get("siblings") or []
                onnx_files = [s.get("rfilename", "") for s in siblings if s.get("rfilename", "").endswith(".onnx")]
                json_files = [s.get("rfilename", "") for s in siblings if s.get("rfilename", "").endswith(".onnx.json") or s.get("rfilename", "") == "config.json"]
                if not onnx_files or not json_files:
                    continue
                vistos.add(repo_id)
                onnx_rel = onnx_files[0]
                # Preferir el .onnx.json que coincida con el nombre del .onnx
                json_rel = next((j for j in json_files if j == onnx_rel + ".json"), json_files[0])
                repo_short = repo_id.split("/")[-1]
                autor = repo_id.split("/")[0]
                import re
                texto_id = f"{os.path.basename(onnx_rel)} {repo_short}"
                m_loc = re.search(r"(?:^|[_/-])([a-z]{2})[_-]([A-Z]{2})(?:[_/-]|\.|$)", texto_id)
                if m_loc:
                    idioma = f"{m_loc.group(1).lower()}_{m_loc.group(2).upper()}"
                else:
                    m_lang = re.search(
                        r"(?:^|[_/-])(ar|bg|bn|ca|cs|cy|da|de|el|en|es|et|eu|fa|fi|fr|he|hi|hu|hy|id|is|it|ja|ka|kk|ko|ku|lb|lt|lv|ml|mr|ne|nl|no|pl|pt|ro|ru|sk|sl|sq|sr|sv|sw|te|th|tr|uk|ur|vi|zh)(?:[_/-]|\.|$)",
                        texto_id.lower(),
                    )
                    mapa_def = {"es": "es_ES", "en": "en_US", "fr": "fr_FR", "pt": "pt_BR", "it": "it_IT", "de": "de_DE", "ca": "ca_ES"}
                    idioma = mapa_def.get(m_lang.group(1), m_lang.group(1)) if m_lang else "es_ES"
                base_onnx = os.path.basename(onnx_rel).replace("/", "_")
                if not base_onnx.lower().startswith(("es_", "es-", "en_", "en-", "fr_", "pt_", "it_", "de_")):
                    archivo_local = f"{idioma}_{base_onnx}"
                else:
                    archivo_local = base_onnx
                if not archivo_local.endswith(".onnx"):
                    archivo_local += ".onnx"
                voces_comunidad.append({
                    "id": f"hf_{repo_id.replace('/', '__')}",
                    "motor": "piper",
                    "nombre": f"🌐 {repo_short} (por {autor})",
                    "idioma": idioma,
                    "peso": "~60 MB (Comunidad HF)",
                    "descargas": int(m.get("downloads", 0) or 0),
                    "gated": m.get("gated") or False,
                    "repo_url": f"https://huggingface.co/{repo_id}",
                    "archivo": archivo_local,
                    "url_modelo": f"https://huggingface.co/{repo_id}/resolve/main/{onnx_rel}?download=true",
                    "url_config": f"https://huggingface.co/{repo_id}/resolve/main/{json_rel}?download=true",
                })
        except Exception:
            continue
    return voces_comunidad


def _cargar_piper_desde_hf():
    """Obtiene el índice completo de voces de Piper desde Hugging Face (con caché en RAM)."""
    global _CACHE_PIPER_HF
    if _CACHE_PIPER_HF is not None:
        return _CACHE_PIPER_HF
    try:
        req = urllib.request.Request(PIPER_VOICES_JSON_URL, headers={"User-Agent": "LiraLoud/2.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        voces = []
        dl_oficial = _obtener_descargas_repo("rhasspy/piper-voices")
        for key, info in data.items():
            files = info.get("files", {})
            onnx_rel = None
            json_rel = None
            size_bytes = 0
            for fpath, fmeta in files.items():
                if fpath.endswith(".onnx"):
                    onnx_rel = fpath
                    size_bytes = fmeta.get("size_bytes", 0)
                elif fpath.endswith(".onnx.json"):
                    json_rel = fpath
            if not onnx_rel:
                continue
            lang_info = info.get("language", {})
            lang_code = lang_info.get("code", "es_ES")
            lang_name = lang_info.get("name_native") or lang_info.get("name_english") or lang_code
            name_clean = info.get("name", key).capitalize()
            quality = info.get("quality", "medium")
            peso_mb = f"~{max(1, round(size_bytes / (1024 * 1024)))} MB" if size_bytes else "~60 MB"
            archivo = os.path.basename(onnx_rel)
            voces.append({
                "id": key,
                "motor": "piper",
                "nombre": f"{name_clean} ({lang_name} - {quality})",
                "idioma": lang_code,
                "peso": peso_mb,
                "descargas": dl_oficial,
                "archivo": archivo,
                "url_modelo": PIPER_HF_BASE + onnx_rel + "?download=true",
                "url_config": (PIPER_HF_BASE + json_rel + "?download=true") if json_rel else "",
            })
        if voces:
            voces.extend(_buscar_repos_comunidad_piper())
            _CACHE_PIPER_HF = voces
            return voces
    except Exception:
        pass
    comunidad = _buscar_repos_comunidad_piper()
    return CATALOGO_PIPER_FALLBACK + comunidad


def _obtener_catalogo_kokoro():
    voces = []
    dl_kokoro = _obtener_descargas_repo(KOKORO_HF_REPO)
    for v in VOCES_KOKORO_DISPONIBLES_PARA_BLEND:
        key = v["key"]
        url_bin = f"https://huggingface.co/{KOKORO_HF_REPO}/resolve/main/voices/{key}.bin?download=true"
        ruta_bin = os.path.join(DIRECTORIO_KOKORO, "voices", f"{key}.bin")
        voces.append({
            "id": key,
            "motor": "kokoro",
            "nombre": v["nombre"],
            "idioma": v["lang"],
            "peso": "~510 KB (Vector) / ~92 MB Motor base",
            "descargas": dl_kokoro,
            "archivo": f"{key}.bin",
            "url_modelo": url_bin,
            "instalada": os.path.exists(ruta_bin) and os.path.getsize(ruta_bin) > 0,
        })
    return voces


def _obtener_catalogo_pocket():
    idiomas_pocket = [
        ("pocket-es", "Pocket TTS - Motor Español (Zero-Shot)", "es", "spanish"),
        ("pocket-en", "Pocket TTS - Motor Inglés (Zero-Shot)", "en", "english"),
        ("pocket-fr", "Pocket TTS - Motor Francés (Zero-Shot)", "fr", "french"),
        ("pocket-pt", "Pocket TTS - Motor Portugués (Zero-Shot)", "pt", "portuguese"),
        ("pocket-it", "Pocket TTS - Motor Italiano (Zero-Shot)", "it", "italian"),
        ("pocket-de", "Pocket TTS - Motor Alemán (Zero-Shot)", "de", "german"),
    ]
    voces = []
    dl_pocket = _obtener_descargas_repo("kyutai/pocket-tts")
    for pid, nombre, lang_code, lang_key in idiomas_pocket:
        marker = os.path.join(DIRECTORIO_POCKET, f".ready_{lang_key}")
        instalada = (lang_key in getattr(pocket_engine_global, "_models", {})) or os.path.exists(marker)
        voces.append({
            "id": pid,
            "motor": "pocket",
            "nombre": nombre,
            "idioma": lang_code,
            "lang_key": lang_key,
            "peso": "~180 MB (Kyutai Pocket-TTS)",
            "descargas": dl_pocket,
            "archivo": pid,
            "instalada": instalada,
        })
    return voces


def _normalizar_nombres_piper(directorio_piper):
    """Si hay archivos descargados con prefijo de autor (ej. Autor_es_Voz.onnx), mueve el código de idioma al inicio."""
    if not os.path.exists(directorio_piper):
        return
    import re
    for fname in list(os.listdir(directorio_piper)):
        m = re.match(r"^[A-Za-z0-9-]+_((?:es|en|fr|pt|it|de)[_-].+)$", fname)
        if m:
            nuevo = m.group(1)
            origen = os.path.join(directorio_piper, fname)
            destino = os.path.join(directorio_piper, nuevo)
            try:
                if not os.path.exists(destino):
                    os.replace(origen, destino)
            except OSError:
                pass


def obtener_catalogo_tienda(directorio_piper):
    """Devuelve el catálogo completo de voces de Piper indicando cuáles están instaladas."""
    global _CACHE_PIPER_HF
    _CACHE_PIPER_HF = None
    _normalizar_nombres_piper(directorio_piper)
    resultado = []
    for v in _cargar_piper_desde_hf():
        item = dict(v)
        ruta = os.path.join(directorio_piper, v["archivo"])
        item["instalada"] = os.path.exists(ruta)
        resultado.append(item)
    return resultado


import time

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


def _descargar_voz_hf_impl(motor, voz_id, directorio_piper, callback_progreso=None):
    if motor == "piper":
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
            if "__CANCELADA__" in str(e):
                return {"ok": False, "cancelada": True, "error": "Descarga cancelada"}
            return {"ok": False, "error": str(e)}

    if motor == "kokoro":
        try:
            os.makedirs(os.path.join(DIRECTORIO_KOKORO, "voices"), exist_ok=True)
            # Asegurar tokenizer y modelo base cuantizado de Kokoro si aún no existen
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
            if "__CANCELADA__" in str(e):
                return {"ok": False, "cancelada": True, "error": "Descarga cancelada"}
            return {"ok": False, "error": str(e)}

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
            if "__CANCELADA__" in str(e):
                return {"ok": False, "cancelada": True, "error": "Descarga cancelada"}
            return {"ok": False, "error": str(e)}

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
