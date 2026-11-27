# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

"""
==============================================================================
LIRALOUD - MÓDULO RAG OFFLINE & ASISTENTE ACADÉMICO / CIENTÍFICO (FASE 3)
==============================================================================
Gestión vectorial persistente y análisis profundo de literatura científica y PDFs.
Tecnologías:
  - Base de Datos Vectorial: ChromaDB (Local / Persistente en ./lira_db)
  - Motor de Embeddings & LLM: Ollama (gemma4:12b, llama3.1, nomic-embed-text)
  - Chunking Inteligente con Metadatos de Página y Multi-Etapa
  - Soporte de Contexto Completo para Artículos Médicos (hasta 100k caracteres)
  - Concurrencia No Bloqueante: ThreadPoolExecutor + corrutinas async/await (Fase 3)
==============================================================================
"""

import os
import sys
import json
import time
import asyncio
import logging
import ssl
import re
import threading
import urllib.request
import urllib.error
import concurrent.futures
from typing import List, Dict, Any, Optional, Union

try:
    import certifi
    CERTIFI_CAFILE = certifi.where()
except ImportError:
    certifi = None
    CERTIFI_CAFILE = None

try:
    from backend.ia.llm_providers import LLMProviderFactory, BaseLLMProvider, obtener_ssl_context, run_async_safely
except ImportError:
    try:
        from .llm_providers import LLMProviderFactory, BaseLLMProvider, obtener_ssl_context, run_async_safely
    except ImportError:
        from llm_providers import LLMProviderFactory, BaseLLMProvider, obtener_ssl_context, run_async_safely

        def obtener_ssl_context() -> ssl.SSLContext:
            if CERTIFI_CAFILE and os.path.exists(CERTIFI_CAFILE):
                return ssl.create_default_context(cafile=CERTIFI_CAFILE)
            return ssl.create_default_context()

        from backend.core.utils import safe_async_run as run_async_safely

_chromadb_lock = threading.Lock()
_chromadb_cargado = False
chromadb = None
Settings = None


def _obtener_chromadb():
    """Importa chromadb de forma diferida (thread-safe) para no penalizar el arranque."""
    global chromadb, Settings, _chromadb_cargado
    if _chromadb_cargado:
        return chromadb, Settings
    with _chromadb_lock:
        if not _chromadb_cargado:
            try:
                import chromadb as _chromadb
                from chromadb.config import Settings as _Settings
                chromadb = _chromadb
                Settings = _Settings
                _pkg = sys.modules.get("backend.ia.rag_module")
                if _pkg is not None:
                    _pkg.chromadb = _chromadb
            except ImportError:
                chromadb = None
                Settings = None
            _chromadb_cargado = True
    return chromadb, Settings


_ollama_lock = threading.Lock()
_ollama_cargado = False
ollama = None


def _obtener_ollama():
    """Importa ollama de forma diferida (thread-safe) para no penalizar el arranque."""
    global ollama, _ollama_cargado
    if _ollama_cargado:
        return ollama
    with _ollama_lock:
        if not _ollama_cargado:
            try:
                import ollama as _ollama
                ollama = _ollama
                _pkg = sys.modules.get("backend.ia.rag_module")
                if _pkg is not None:
                    _pkg.ollama = _ollama
            except ImportError:
                ollama = None
            _ollama_cargado = True
    return ollama

try:
    from backend.ia.fts_store import LiraFTSStore
except ImportError:
    try:
        from .fts_store import LiraFTSStore
    except ImportError:
        from fts_store import LiraFTSStore

# Configuración de logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("LiraRAG")

# Abreviaturas científicas y médicas comunes que no deben causar corte de oración
ABREVIATURAS_CIENTIFICAS = {
    "dr.", "dra.", "prof.", "et al.", "vs.", "fig.", "figs.", "pág.", "págs.", "pag.", "pags.",
    "vol.", "vols.", "no.", "nos.", "e.g.", "i.e.", "p.ej.", "aprox.", "min.", "max.",
    "obs.", "ref.", "refs.", "art.", "arts.", "tab.", "tabs.", "cap.", "caps.", "ed.", "eds."
}

# =============================================================================
# PLANTILLAS DE SUB-PREGUNTAS ESTÁTICAS PARA TAREAS FRECUENTES (FASE 0 - VÍA 1)
# =============================================================================
PLANTILLAS_SUBPREGUNTAS: Dict[str, Dict[str, Any]] = {
    "resumen": {
        "nombre": "Resumen Estructurado",
        "subpreguntas": [
            {
                "titulo": "Título, Autor y Tema Central",
                "pregunta": "¿Cuál es el título de la obra o documento, quién es su autor o autores y cuál es el tema o premisa central que aborda?"
            },
            {
                "titulo": "Tesis y Planteamiento Principal",
                "pregunta": "¿Cuál es la tesis central, planteamiento o hipótesis que defiende el texto y cómo se articula a lo largo de la obra?"
            },
            {
                "titulo": "Argumentos Clave y Desarrollo Temático",
                "pregunta": "¿Cuáles son los argumentos fundamentales, conceptos clave, análisis o hitos que se desarrollan a lo largo del documento?"
            },
            {
                "titulo": "Conclusiones y Reflexiones Finales",
                "pregunta": "¿Cuáles son las conclusiones principales, reflexiones finales, consecuencias o propuestas que deja la obra/documento?"
            }
        ]
    },
    "academico": {
        "nombre": "Síntesis Médica y Científica",
        "subpreguntas": [
            {
                "titulo": "Contexto Clínico y Objetivos",
                "pregunta": "Identifica el título original del artículo, autores, contexto clínico, objetivo primario y outcomes evaluados."
            },
            {
                "titulo": "Metodología, Población y Diseño",
                "pregunta": "Detalla el diseño del estudio (ensayo clínico, cohorte, etc.), criterios de selección, número de participantes (N) y análisis estadístico."
            },
            {
                "titulo": "Resultados Numéricos y Estadísticos",
                "pregunta": "Extrae valores numéricos exactos, p-values, intervalos de confianza (IC 95%), HR, RR, OR, NNT o heterogeneidad (I²)."
            },
            {
                "titulo": "Discusión, Limitaciones y Conclusiones",
                "pregunta": "Sintetiza la interpretación clínica del efecto, reducción de riesgo, limitaciones metodológicas y conclusión final."
            }
        ]
    },
    "conclusiones": {
        "nombre": "Extracción de Conclusiones y Hallazgos",
        "subpreguntas": [
            {
                "titulo": "Hallazgos y Resultados Principales",
                "pregunta": "¿Cuáles son los principales hallazgos, tesis demostradas o descubrimientos expuestos en el texto?"
            },
            {
                "titulo": "Conclusiones Finales e Implicaciones",
                "pregunta": "¿Cuáles son las conclusiones directas expresadas por los autores, sus implicaciones prácticas y recomendaciones futuras?"
            }
        ]
    },
    "conceptos": {
        "nombre": "Glosario y Conceptos Clave",
        "subpreguntas": [
            {
                "titulo": "Conceptos y Términos Clave",
                "pregunta": "Extrae y define con precisión los conceptos fundamentales, términos teóricos y categorías centrales explicadas en la obra."
            },
            {
                "titulo": "Abreviaturas y Terminología Especializada",
                "pregunta": "Lista los términos especializados, abreviaturas y distinciones conceptuales relevantes introducidas en el documento."
            }
        ]
    },
    "analisis_critico": {
        "nombre": "Análisis Crítico y Argumentativo",
        "subpreguntas": [
            {
                "titulo": "Fortalezas Argumentativas y Teóricas",
                "pregunta": "¿Cuáles son las mayores fortalezas, originalidad o aciertos argumentativos y metodológicos del texto?"
            },
            {
                "titulo": "Limitaciones, Tensiones o Posibles Sesgos",
                "pregunta": "¿Qué limitaciones, contradicciones, tensiones conceptuales o aspectos no resueltos se identifican en el trabajo?"
            }
        ]
    }
}


