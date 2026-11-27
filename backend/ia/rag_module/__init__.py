"""
Paquete modular RAG híbrido (SQLite FTS5 BM25 + ChromaDB opcional) de LiraLoud.
Reexporta la API pública completa preservando lazy loaders con Lock y retrocompatibilidad.
"""

from backend.ia.rag_module.comun import (
    ABREVIATURAS_CIENTIFICAS,
    PLANTILLAS_SUBPREGUNTAS,
    _obtener_chromadb,
    _obtener_ollama,
    chromadb,
    ollama,
    logger,
)
from backend.ia.rag_module.nucleo import (
    LiraRAG,
    rag_global,
)

__all__ = [
    "LiraRAG",
    "rag_global",
    "PLANTILLAS_SUBPREGUNTAS",
    "ABREVIATURAS_CIENTIFICAS",
    "_obtener_chromadb",
    "_obtener_ollama",
    "chromadb",
    "ollama",
    "logger",
]
