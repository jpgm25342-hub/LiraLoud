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


def _inferir_idioma_y_archivo_piper(onnx_rel, repo_short):
    """Infiere el código de idioma y el nombre de archivo local .onnx para una voz comunitaria Piper."""
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
    return idioma, archivo_local


def _seleccionar_archivos_piper_repo(siblings):
    """Encuentra el par (onnx_rel, json_rel) principal en los siblings de un repo Piper, o (None, None)."""
    onnx_files = [s.get("rfilename", "") for s in siblings if s.get("rfilename", "").endswith(".onnx")]
    json_files = [
        s.get("rfilename", "")
        for s in siblings
        if s.get("rfilename", "").endswith(".onnx.json") or s.get("rfilename", "") == "config.json"
    ]
    if not onnx_files or not json_files:
        return None, None
    onnx_rel = onnx_files[0]
    json_rel = next((j for j in json_files if j == onnx_rel + ".json"), json_files[0])
    return onnx_rel, json_rel


def _construir_voz_comunidad_piper(m, vistos):
    """Valida un modelo HF comunitario de Piper y construye su ficha de catálogo, o None si no aplica."""
    repo_id = m.get("id") or m.get("modelId")
    if not repo_id or repo_id in vistos or repo_id == "rhasspy/piper-voices":
        return None
    if "checkpoint" in repo_id.lower():
        return None
    onnx_rel, json_rel = _seleccionar_archivos_piper_repo(m.get("siblings") or [])
    if not onnx_rel:
        return None
    vistos.add(repo_id)
    repo_short = repo_id.split("/")[-1]
    autor = repo_id.split("/")[0]
    idioma, archivo_local = _inferir_idioma_y_archivo_piper(onnx_rel, repo_short)
    return {
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
    }


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
                ficha = _construir_voz_comunidad_piper(m, vistos)
                if ficha is not None:
                    voces_comunidad.append(ficha)
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


from backend.audio.voice_downloader import (  # noqa: E402, F401
    _ESTADO_DESCARGAS,
    _ruta_hf_token,
    _leer_hf_config,
    obtener_hf_token,
    obtener_hf_usuario,
    _consultar_usuario_hf,
    guardar_hf_token,
    pausar_descarga_voz,
    reanudar_descarga_voz,
    cancelar_descarga_voz,
    _descargar_archivo,
    descargar_voz_hf,
    _formatear_error_descarga,
    _descargar_voz_piper,
    _descargar_voz_kokoro,
    _descargar_voz_hf_impl,
    eliminar_voz_local,
)
