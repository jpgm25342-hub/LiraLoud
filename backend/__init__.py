# LiraLoud Backend Package
# Organizado en 5 subpaquetes de dominio:
#   - backend.core       (Estado global, puente pywebview, logs, persistencia JSON, utilidades)
#   - backend.audio      (Motores TTS Piper/Kokoro/Pocket/Edge/OneCore, streaming, catálogo, exportación, SMTC/Ducking)
#   - backend.documento  (Ciclo de vida PDF/Word, edición y subrayados, RapidOCR, DocLayout-YOLO, buscador, procesador de texto)
#   - backend.ia         (RAG ChromaDB, Traducción neuronal híbrida, Tienda Ollama GGUF, Proveedores LLM Cloud/Local)
#   - backend.estudio    (Servicios RPC, notas, extracciones, captura de pantalla OCR, WebReader, extensión navegador)

import importlib
import sys

_MAPA_SUBPAQUETES = {
    # core
    "estado_global": "backend.core.estado_global",
    "webview_bridge": "backend.core.webview_bridge",
    "logger_config": "backend.core.logger_config",
    "gestor_archivos": "backend.core.gestor_archivos",
    "utils": "backend.core.utils",
    # audio
    "motor_audio": "backend.audio.motor_audio",
    "gestor_voces_rpc": "backend.audio.gestor_voces_rpc",
    "kokoro_engine": "backend.audio.kokoro_engine",
    "pocket_engine": "backend.audio.pocket_engine",
    "voice_catalogue": "backend.audio.voice_catalogue",
    "exportador_audio": "backend.audio.exportador_audio",
    "media_control": "backend.audio.media_control",
    # documento
    "gestor_documento_rpc": "backend.documento.gestor_documento_rpc",
    "edicion_pdf": "backend.documento.edicion_pdf",
    "procesador_texto": "backend.documento.procesador_texto",
    "buscador_pdf": "backend.documento.buscador_pdf",
    "ocr_engine": "backend.documento.ocr_engine",
    "layout_engine": "backend.documento.layout_engine",
    "docx_engine": "backend.documento.docx_engine",
    # ia
    "rag_module": "backend.ia.rag_module",
    "traductor": "backend.ia.traductor",
    "ollama_store": "backend.ia.ollama_store",
    "llm_providers": "backend.ia.llm_providers",
    # estudio
    "servicios_rpc": "backend.estudio.servicios_rpc",
    "gestor_notas": "backend.estudio.gestor_notas",
    "gestor_extracciones": "backend.estudio.gestor_extracciones",
    "captura_pantalla": "backend.estudio.captura_pantalla",
    "web_reader": "backend.estudio.web_reader",
    "playwright_worker": "backend.estudio.playwright_worker",
    "servidor_extension": "backend.estudio.servidor_extension",
}


def __getattr__(name: str):
    """Resolución perezosa retrocompatible para imports antiguos del tipo `backend.<modulo>`."""
    target = _MAPA_SUBPAQUETES.get(name)
    if target:
        mod = importlib.import_module(target)
        sys.modules[f"backend.{name}"] = mod
        return mod
    raise AttributeError(f"module 'backend' has no attribute {name!r}")
