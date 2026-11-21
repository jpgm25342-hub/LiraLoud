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

        def run_async_safely(coro):
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            if loop.is_running():
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                    return ex.submit(asyncio.run, coro).result()
            return loop.run_until_complete(coro)

try:
    import chromadb
    from chromadb.config import Settings
except ImportError:
    chromadb = None

try:
    import ollama
except ImportError:
    ollama = None

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


class LiraRAG:
    """
    Controlador central del sistema RAG y Asistente de Investigación de LiraLoud.
    Maneja la base vectorial local (ChromaDB), memoria de documentos, historial persistente por documento y comunicación con Ollama, Gemini, Groq y OpenAI.
    """

    def __init__(
        self,
        db_path: str = "./lira_db",
        embed_model: str = "nomic-embed-text",
        chat_model: str = "gemma4:12b",
        host: str = "http://127.0.0.1:11434"
    ):
        base_proyecto = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        if db_path == "./lira_db" or not db_path:
            self.db_path = os.path.join(base_proyecto, "lira_db")
        else:
            self.db_path = os.path.abspath(db_path)

        self.embed_model = embed_model
        self.chat_model = chat_model
        self.host = host
        self.collection_name = "lira_documentos"
        self.history_file = os.path.join(self.db_path, "chat_history.json")

        # Configuración de Proveedor de IA Activo ('ollama' | 'gemini' | 'groq' | 'openai' | 'deepseek' | 'openrouter')
        self.proveedor_activo = "ollama"
        self.cloud_api_keys: Dict[str, str] = {
            "gemini": "",
            "groq": "",
            "openai": "",
            "deepseek": "",
            "openrouter": ""
        }
        self.cloud_modelos: Dict[str, str] = {
            "gemini": "gemini-1.5-flash",
            "groq": "llama-3.3-70b-versatile",
            "openai": "gpt-4o-mini",
            "deepseek": "deepseek-chat",
            "openrouter": "meta-llama/llama-3.3-70b-instruct:free"
        }

        # Monitor de consumo de tokens y cuotas en tiempo real por proveedor
        self.token_file = os.path.join(self.db_path, "token_stats.json")
        self.token_stats: Dict[str, Dict[str, Any]] = {
            "gemini": {"tokens_usados_sesion": 0, "ultimo_prompt_tokens": 0, "ultimo_completion_tokens": 0, "ultimo_total_tokens": 0, "limite_tokens": 1000000, "tokens_restantes": 1000000, "porcentaje_restante": 100.0, "detalle_api": "1M TPM (Free Tier)"},
            "groq": {"tokens_usados_sesion": 0, "ultimo_prompt_tokens": 0, "ultimo_completion_tokens": 0, "ultimo_total_tokens": 0, "limite_tokens": 6000, "tokens_restantes": 6000, "porcentaje_restante": 100.0, "detalle_api": "6k TPM (Free Tier)"},
            "openrouter": {"tokens_usados_sesion": 0, "ultimo_prompt_tokens": 0, "ultimo_completion_tokens": 0, "ultimo_total_tokens": 0, "limite_tokens": 128000, "tokens_restantes": 128000, "porcentaje_restante": 100.0, "detalle_api": "Free / BYOK"},
            "openai": {"tokens_usados_sesion": 0, "ultimo_prompt_tokens": 0, "ultimo_completion_tokens": 0, "ultimo_total_tokens": 0, "limite_tokens": 30000, "tokens_restantes": 30000, "porcentaje_restante": 100.0, "detalle_api": "Tier 1 / PayG"},
            "deepseek": {"tokens_usados_sesion": 0, "ultimo_prompt_tokens": 0, "ultimo_completion_tokens": 0, "ultimo_total_tokens": 0, "limite_tokens": 64000, "tokens_restantes": 64000, "porcentaje_restante": 100.0, "detalle_api": "DeepSeek API"},
            "ollama": {"tokens_usados_sesion": 0, "ultimo_prompt_tokens": 0, "ultimo_completion_tokens": 0, "ultimo_total_tokens": 0, "limite_tokens": 8192, "tokens_restantes": 8192, "porcentaje_restante": 100.0, "detalle_api": "Local 32k Ctx"}
        }
        # Lock para proteger escrituras concurrentes sobre token_stats
        self._token_lock = threading.Lock()

        # Executor de I/O para tareas de red en segundo plano sin bloquear la UI
        self._executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=4,
            thread_name_prefix="LiraRAG-IO"
        )

        self._cargar_estadisticas_tokens()
        self._cargar_ajustes_guardados()

        self.stream_callback: Optional[Any] = None
        # Memoria en RAM para acceso directo al texto estructurado completo
        self.documentos_texto: Dict[str, str] = {}
        self.documentos_chunks: Dict[str, List[Dict[str, Any]]] = {}

        # Historial de conversaciones persistente por documento {doc_id: [{role, texto, fuentes, timestamp}, ...]}
        self.historial_chats: Dict[str, List[Dict[str, Any]]] = {}
        self._cargar_historial_chats()

        # Cliente Ollama
        self.client_ollama: Optional[Any] = None
        if ollama:
            try:
                self.client_ollama = ollama.Client(host=self.host)
            except Exception as e:
                logger.warning(f"⚠️ [RAG] No se pudo inicializar cliente Ollama: {e}")

        # Cliente ChromaDB Persistente
        self.client_chroma: Optional[Any] = None
        self.collection: Optional[Any] = None
        self._inicializar_chromadb()

    @staticmethod
    def _normalizar_doc_id(doc_id: str) -> str:
        """Normaliza el ID del documento para que sea consistente independientemente de la ruta."""
        if not doc_id:
            return "documento_actual"
        limpio = str(doc_id).replace("\\", "/").rstrip("/")
        nombre = os.path.basename(limpio)
        return nombre if nombre else "documento_actual"

    # =========================================================================
    # 1. INICIALIZACIÓN Y DIAGNÓSTICO DEL ENTORNO
    # =========================================================================
    def _inicializar_chromadb(self):
        """Inicializa o recupera la colección de ChromaDB de forma segura."""
        if not chromadb:
            logger.error("❌ [RAG] ChromaDB no está instalado.")
            return

        try:
            os.makedirs(self.db_path, exist_ok=True)
            self.client_chroma = chromadb.PersistentClient(
                path=self.db_path,
                settings=Settings(anonymized_telemetry=False)
            )
            self.collection = self.client_chroma.get_or_create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"}
            )
            logger.info(f"💾 [RAG] ChromaDB listo en: {self.db_path} (Colección: {self.collection_name})")
        except Exception as e:
            logger.error(f"❌ [RAG] Error al conectar con ChromaDB: {e}")
            self.client_chroma = None
            self.collection = None

    # =========================================================================
    # 1.1 PERSISTENCIA DE HISTORIAL DE CHAT Y VENTANA DE CONTEXTO POR DOCUMENTO
    # =========================================================================
    def _cargar_historial_chats(self):
        """Carga el historial de chats de todos los documentos desde el archivo JSON persistente."""
        try:
            if os.path.exists(self.history_file):
                with open(self.history_file, "r", encoding="utf-8") as f:
                    self.historial_chats = json.load(f)
            else:
                self.historial_chats = {}
        except Exception as e:
            logger.warning(f"⚠️ [RAG] No se pudo cargar historial de chats: {e}")
            self.historial_chats = {}

    def _guardar_historial_chats(self):
        """Guarda el historial de chats en disco de forma atómica y segura."""
        try:
            os.makedirs(self.db_path, exist_ok=True)
            temp_file = self.history_file + ".tmp"
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(self.historial_chats, f, ensure_ascii=False, indent=2)
            if os.path.exists(temp_file):
                os.replace(temp_file, self.history_file)
        except Exception as e:
            logger.error(f"❌ [RAG] Error al guardar historial de chats en disco: {e}")

    def obtener_historial_chat(self, doc_id: str) -> List[Dict[str, Any]]:
        """Retorna la lista de mensajes de chat guardados para un documento específico."""
        if not doc_id:
            return []
        self._cargar_historial_chats()
        doc_key = self._normalizar_doc_id(doc_id)
        # Búsqueda directa o por coincidencia de nombre base
        if doc_key in self.historial_chats:
            return self.historial_chats[doc_key]
        for k, v in self.historial_chats.items():
            if self._normalizar_doc_id(k) == doc_key:
                return v
        return []

    def agregar_mensaje_chat(
        self,
        doc_id: str,
        role: str,
        texto: str,
        fuentes: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Añade un nuevo mensaje al historial del documento y lo persiste en disco."""
        if not doc_id or not texto:
            return {}
        
        doc_key = self._normalizar_doc_id(doc_id)
        if doc_key not in self.historial_chats:
            self.historial_chats[doc_key] = []
        
        mensaje = {
            "role": role,  # "user" o "ai"
            "texto": texto,
            "fuentes": fuentes or [],
            "timestamp": time.time()
        }
        self.historial_chats[doc_key].append(mensaje)
        
        # Mantener un límite razonable por documento (100 mensajes)
        if len(self.historial_chats[doc_key]) > 100:
            self.historial_chats[doc_key] = self.historial_chats[doc_key][-100:]
            
        self._guardar_historial_chats()
        return mensaje

    def limpiar_historial_chat(self, doc_id: str) -> bool:
        """Borra el historial de conversación exclusivamente del documento especificado."""
        if not doc_id:
            return False
        doc_key = self._normalizar_doc_id(doc_id)
        borrado = False
        if doc_key in self.historial_chats:
            self.historial_chats[doc_key] = []
            borrado = True
        for k in list(self.historial_chats.keys()):
            if self._normalizar_doc_id(k) == doc_key:
                self.historial_chats[k] = []
                borrado = True
        if borrado:
            self._guardar_historial_chats()
            logger.info(f"🧹 [RAG] Historial de chat limpiado para '{doc_key}'")
        return True

    def obtener_mensajes_contexto_ollama(
        self,
        doc_id: str,
        max_turnos: int = 4
    ) -> List[Dict[str, str]]:
        """
        Retorna los últimos N turnos de conversación formateados para Ollama:
        [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
        """
        historial = self.obtener_historial_chat(doc_id)
        if not historial:
            return []
        
        # Tomar los últimos max_turnos * 2 mensajes
        mensajes_recientes = historial[-(max_turnos * 2):]
        formateados = []
        for m in mensajes_recientes:
            rol_ollama = "assistant" if m.get("role") in ["ai", "assistant"] else "user"
            txt = m.get("texto", "").strip()
            if txt:
                formateados.append({"role": rol_ollama, "content": txt})
        return formateados

    def _cargar_ajustes_guardados(self):
        """Carga automáticamente las claves de API y modelos guardados en ajustes_lectura.json."""
        try:
            ruta_ajustes = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "ajustes_lectura.json")
            if os.path.exists(ruta_ajustes):
                with open(ruta_ajustes, "r", encoding="utf-8") as f:
                    ajustes = json.load(f)
                    guardados_keys = ajustes.get("ia_cloud_keys", {})
                    if isinstance(guardados_keys, dict):
                        for k, v in guardados_keys.items():
                            if k in self.cloud_api_keys and v:
                                self.cloud_api_keys[k] = str(v).strip()

                    guardados_modelos = ajustes.get("ia_cloud_modelos", {})
                    if isinstance(guardados_modelos, dict):
                        for k, v in guardados_modelos.items():
                            if k in self.cloud_modelos and v:
                                self.cloud_modelos[k] = str(v).strip()

                    prov = ajustes.get("ia_proveedor_activo")
                    if prov and prov in ["ollama", "gemini", "groq", "openai", "deepseek", "openrouter"]:
                        self.proveedor_activo = prov
        except Exception as e:
            logger.warning(f"⚠️ [RAG] No se pudieron cargar ajustes_lectura.json iniciales: {e}")

    def configurar_proveedor(self, proveedor: str, api_key: str = "", modelo_cloud: str = "", modelo: str = "") -> Dict[str, Any]:
        """Actualiza el proveedor activo ('ollama', 'gemini', 'groq', 'openai', 'deepseek') y sus credenciales locales."""
        prov = str(proveedor or "ollama").lower().strip()
        self.proveedor_activo = prov
        mod = (modelo_cloud or modelo or "").strip()
        if prov in self.cloud_api_keys and api_key is not None:
            self.cloud_api_keys[prov] = str(api_key).strip()
        if prov in self.cloud_modelos and mod:
            self.cloud_modelos[prov] = mod
        logger.info(f"🔄 [RAG] Proveedor de IA configurado: {self.proveedor_activo} (Modelo: {self.cloud_modelos.get(self.proveedor_activo, self.chat_model)})")
        return {
            "exito": True,
            "proveedor_activo": self.proveedor_activo,
            "modelo": self.cloud_modelos.get(self.proveedor_activo, self.chat_model)
        }

    def verificar_conexion_cloud(self, proveedor: str, api_key: str, modelo: str = "") -> Dict[str, Any]:
        """Prueba rápida de conectividad a la API en la nube del proveedor especificado."""
        prov = str(proveedor or "").lower().strip()
        key = str(api_key or "").strip() or self.cloud_api_keys.get(prov, "")
        mod = str(modelo or "").strip() or self.cloud_modelos.get(prov, "")

        if not key:
            return {"exito": False, "error": "No se proporcionó API Key para la prueba."}

        try:
            provider = LLMProviderFactory.get_provider(prov, host=self.host)
            return provider.verificar_conexion(api_key=key, modelo=mod)
        except Exception as e:
            logger.error(f"❌ [RAG] Error verificando conexión con {prov}: {e}")
            return {"exito": False, "proveedor": prov, "error": str(e)}

    def obtener_modelos_disponibles(self, proveedor: str, api_key: str = "") -> Dict[str, Any]:
        """Consulta directamente la API oficial del proveedor para obtener la lista real de modelos activos y compatibles."""
        prov = str(proveedor or "ollama").lower().strip()
        key = str(api_key or "").strip() or self.cloud_api_keys.get(prov, "")

        provider = LLMProviderFactory.get_provider(prov, host=self.host)
        return provider.obtener_modelos(api_key=key)

    # =========================================================================
    # ESTADÍSTICAS Y MONITOR DE TOKENS EN TIEMPO REAL
    # =========================================================================
    def _cargar_estadisticas_tokens(self):
        """Carga el registro acumulado de tokens desde el archivo JSON persistente."""
        try:
            if hasattr(self, "token_file") and os.path.exists(self.token_file):
                with open(self.token_file, "r", encoding="utf-8") as f:
                    guardado = json.load(f)
                    if isinstance(guardado, dict):
                        for k, v in guardado.items():
                            if k in self.token_stats and isinstance(v, dict):
                                self.token_stats[k].update(v)
        except Exception as e:
            logger.warning(f"⚠️ [RAG] No se pudo cargar token_stats.json: {e}")

    def _guardar_estadisticas_tokens(self):
        """Guarda las métricas de tokens en disco de forma atómica."""
        try:
            if hasattr(self, "token_file"):
                os.makedirs(self.db_path, exist_ok=True)
                tmp = self.token_file + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(self.token_stats, f, ensure_ascii=False, indent=2)
                if os.path.exists(tmp):
                    os.replace(tmp, self.token_file)
        except Exception as e:
            logger.error(f"❌ [RAG] Error guardando token_stats.json: {e}")

    def _actualizar_estadisticas_tokens(
        self,
        proveedor: str,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        total_tokens: int = 0,
        limite_tokens: int = 0,
        tokens_restantes: Optional[int] = None,
        porcentaje_forzado: Optional[float] = None,
        detalle_api: str = "",
        reset_info: str = ""
    ):
        """Actualiza el consumo de tokens y las cuotas restantes del proveedor de forma acumulativa y en vivo.
        Thread-safe: protegido por _token_lock para evitar condiciones de carrera en acceso concurrente.
        """
        prov = str(proveedor).lower()
        with self._token_lock:
            if prov not in self.token_stats:
                default_limits = {
                    "gemini": 1000000,
                    "groq": 6000,
                    "openrouter": 128000,
                    "openai": 30000,
                    "deepseek": 64000,
                    "ollama": 8192
                }
                self.token_stats[prov] = {
                    "tokens_usados_sesion": 0,
                    "ultimo_prompt_tokens": 0,
                    "ultimo_completion_tokens": 0,
                    "ultimo_total_tokens": 0,
                    "limite_tokens": default_limits.get(prov, 8192),
                    "tokens_restantes": default_limits.get(prov, 8192),
                    "porcentaje_restante": 100.0,
                    "detalle_api": "",
                    "reset_info": "",
                    "timestamp": time.time()
                }

            stat = self.token_stats[prov]
            tot = total_tokens if total_tokens > 0 else (prompt_tokens + completion_tokens)
            if tot > 0:
                stat["tokens_usados_sesion"] += tot
                stat["ultimo_prompt_tokens"] = prompt_tokens
                stat["ultimo_completion_tokens"] = completion_tokens
                stat["ultimo_total_tokens"] = tot

            if limite_tokens > 0:
                stat["limite_tokens"] = limite_tokens

            if tokens_restantes is not None:
                stat["tokens_restantes"] = max(0, int(tokens_restantes))
            else:
                stat["tokens_restantes"] = max(0, stat["limite_tokens"] - stat["tokens_usados_sesion"])

            if porcentaje_forzado is not None:
                stat["porcentaje_restante"] = min(100.0, max(0.0, float(porcentaje_forzado)))
            elif stat["limite_tokens"] > 0:
                porcentaje = round((stat["tokens_restantes"] / stat["limite_tokens"]) * 100.0, 1)
                stat["porcentaje_restante"] = min(100.0, max(0.0, porcentaje))
            else:
                stat["porcentaje_restante"] = 100.0

            if detalle_api:
                stat["detalle_api"] = detalle_api
            if reset_info:
                stat["reset_info"] = reset_info

            stat["timestamp"] = time.time()
            self._guardar_estadisticas_tokens()
            logger.info(f"📊 [TOKENS - {prov.upper()}] Usados: {tot} | Restantes: {stat['tokens_restantes']}/{stat['limite_tokens']} ({stat['porcentaje_restante']}%) | Info: {stat.get('detalle_api', '')}")

    def sincronizar_tokens_api(self, proveedor: Optional[str] = None, api_key: str = "") -> Dict[str, Any]:
        """
        Consulta en tiempo real los límites de cuota, tokens restantes y saldo directamente desde la API oficial de cada proveedor.
        Detecta cuentas sin saldo, cuotas agotadas (HTTP 429 / credit_balance_exhausted) y actualiza el gauge a 0% real.
        """
        prov = (proveedor or getattr(self, "proveedor_activo", "ollama")).lower().strip()
        key = str(api_key or "").strip() or self.cloud_api_keys.get(prov, "")
        mod = self.cloud_modelos.get(prov, "")

        if prov == "ollama" or not key:
            return self.obtener_estadisticas_tokens(prov)

        try:
            provider = LLMProviderFactory.get_provider(prov, host=self.host)
            res_sync = provider.sincronizar_tokens(
                api_key=key,
                stats_actuales=self.token_stats.get(prov, {}),
                modelo=mod
            )
            if isinstance(res_sync, dict):
                self._actualizar_estadisticas_tokens(
                    proveedor=prov,
                    limite_tokens=res_sync.get("limite_tokens", 0),
                    tokens_restantes=res_sync.get("tokens_restantes"),
                    porcentaje_forzado=res_sync.get("porcentaje_restante"),
                    detalle_api=res_sync.get("detalle_api", ""),
                    reset_info=res_sync.get("reset_info", "")
                )
        except Exception as e:
            logger.warning(f"⚠️ [RAG] Sincronización en vivo de tokens con {prov}: {e}")

        return self.obtener_estadisticas_tokens(prov)

    def obtener_estadisticas_tokens(self, proveedor: Optional[str] = None) -> Dict[str, Any]:
        """Devuelve las métricas actuales de consumo y porcentaje de tokens disponibles."""
        prov = (proveedor or getattr(self, "proveedor_activo", "ollama")).lower()
        if prov not in self.token_stats:
            default_limits = {
                "gemini": 1000000,
                "groq": 6000,
                "openrouter": 128000,
                "openai": 30000,
                "deepseek": 64000,
                "ollama": 8192
            }
            lim = default_limits.get(prov, 8192)
            return {
                "proveedor": prov,
                "tokens_usados_sesion": 0,
                "ultimo_prompt_tokens": 0,
                "ultimo_completion_tokens": 0,
                "ultimo_total_tokens": 0,
                "limite_tokens": lim,
                "tokens_restantes": lim,
                "porcentaje_restante": 100.0,
                "detalle_api": "",
                "reset_info": ""
            }
        res = dict(self.token_stats[prov])
        res["proveedor"] = prov
        return res

    # =========================================================================
    # MÉTODOS ASÍNCRONOS Y CONCURRENTES (FASE 3 - No bloqueantes para la UI)
    # =========================================================================

    async def sincronizar_tokens_api_async(self, proveedor: Optional[str] = None, api_key: str = "") -> Dict[str, Any]:
        """Versión asíncrona no bloqueante de sincronizar_tokens_api. Ideal para actualizar el gauge de la UI sin freeze."""
        prov = (proveedor or getattr(self, "proveedor_activo", "ollama")).lower().strip()
        key = str(api_key or "").strip() or self.cloud_api_keys.get(prov, "")
        mod = self.cloud_modelos.get(prov, "")

        if prov == "ollama" or not key:
            return self.obtener_estadisticas_tokens(prov)

        try:
            provider = LLMProviderFactory.get_provider(prov, host=self.host)
            res_sync = await provider.sincronizar_tokens_async(
                api_key=key,
                stats_actuales=self.token_stats.get(prov, {}),
                modelo=mod
            )
            if isinstance(res_sync, dict):
                self._actualizar_estadisticas_tokens(
                    proveedor=prov,
                    limite_tokens=res_sync.get("limite_tokens", 0),
                    tokens_restantes=res_sync.get("tokens_restantes"),
                    porcentaje_forzado=res_sync.get("porcentaje_restante"),
                    detalle_api=res_sync.get("detalle_api", ""),
                    reset_info=res_sync.get("reset_info", "")
                )
        except Exception as e:
            logger.warning(f"⚠️ [RAG] sincronizar_tokens_api_async con {prov}: {e}")

        return self.obtener_estadisticas_tokens(prov)

    async def obtener_modelos_disponibles_async(self, proveedor: str, api_key: str = "") -> Dict[str, Any]:
        """Versión asíncrona no bloqueante de obtener_modelos_disponibles."""
        prov = str(proveedor or "ollama").lower().strip()
        key = str(api_key or "").strip() or self.cloud_api_keys.get(prov, "")
        provider = LLMProviderFactory.get_provider(prov, host=self.host)
        return await provider.obtener_modelos_async(api_key=key)

    async def _generar_respuesta_llm_async(
        self,
        system_prompt: str,
        mensajes_previos: List[Dict[str, str]],
        user_prompt: str,
        temperatura: float = 0.2,
        stream_callback: Optional[Any] = None
    ) -> str:
        """Versión asíncrona no bloqueante de _generar_respuesta_llm para uso en contextos async."""
        prov = getattr(self, "proveedor_activo", "ollama").lower()
        key = self.cloud_api_keys.get(prov, "")
        mod = self.cloud_modelos.get(prov, self.chat_model)

        provider = LLMProviderFactory.get_provider(prov, host=self.host)
        cb = stream_callback if stream_callback is not None else getattr(self, "stream_callback", None)
        kwargs_extra = {"stream_callback": cb} if (prov == "ollama" and cb is not None) else {}
        res = await provider.generar_respuesta_async(
            system_prompt=system_prompt,
            mensajes_previos=mensajes_previos,
            user_prompt=user_prompt,
            temperatura=temperatura,
            api_key=key,
            modelo=mod,
            **kwargs_extra
        )

        texto = res.get("texto", "").strip()
        usage = res.get("usage", {})
        rate_limits = res.get("rate_limits", {})

        p_tok = int(usage.get("prompt_tokens", 0))
        c_tok = int(usage.get("completion_tokens", 0))
        t_tok = int(usage.get("total_tokens", p_tok + c_tok))

        self._actualizar_estadisticas_tokens(
            proveedor=prov,
            prompt_tokens=p_tok,
            completion_tokens=c_tok,
            total_tokens=t_tok,
            limite_tokens=rate_limits.get("limite_tokens", 0),
            tokens_restantes=rate_limits.get("tokens_restantes"),
            porcentaje_forzado=rate_limits.get("porcentaje_restante"),
            detalle_api=res.get("detalle", ""),
            reset_info=rate_limits.get("reset_tokens", "")
        )

        return texto

    def sincronizar_tokens_api_en_background(self, proveedor: Optional[str] = None, api_key: str = "") -> "concurrent.futures.Future":
        """
        Dispara la sincronización de tokens en un hilo del ThreadPoolExecutor sin bloquear el hilo principal.
        Retorna un Future. Útil para actualizar el gauge de tokens en background.
        """
        return self._executor.submit(self.sincronizar_tokens_api, proveedor, api_key)

    # =========================================================================
    # LLAMADAS DIRECTAS A PROVEEDORES LLM (DESACOPLADOS MEDIANTE PROVIDER FACTORY)
    # =========================================================================
    def _llamar_gemini_api(
        self,
        system_prompt: str,
        mensajes_previos: List[Dict[str, str]],
        user_prompt: str,
        temperatura: float = 0.2,
        api_key: Optional[str] = None,
        modelo: Optional[str] = None
    ) -> str:
        key = api_key or self.cloud_api_keys.get("gemini", "")
        mod = modelo or self.cloud_modelos.get("gemini", "gemini-1.5-flash")
        provider = LLMProviderFactory.get_provider("gemini")
        res = provider.generar_respuesta(
            system_prompt=system_prompt,
            mensajes_previos=mensajes_previos,
            user_prompt=user_prompt,
            temperatura=temperatura,
            api_key=key,
            modelo=mod
        )
        return res.get("texto", "")

    def contar_tokens_gemini(
        self,
        texto: str,
        modelo: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> int:
        """Calcula el número exacto de tokens usando el endpoint oficial :countTokens de Google Gemini."""
        key = api_key or self.cloud_api_keys.get("gemini", "")
        mod = modelo or self.cloud_modelos.get("gemini", "gemini-1.5-flash")
        gemini_prov = LLMProviderFactory.get_provider("gemini")
        return gemini_prov.contar_tokens(texto, modelo=mod, api_key=key)

    def _llamar_groq_api(
        self,
        system_prompt: str,
        mensajes_previos: List[Dict[str, str]],
        user_prompt: str,
        temperatura: float = 0.2,
        api_key: Optional[str] = None,
        modelo: Optional[str] = None
    ) -> str:
        key = api_key or self.cloud_api_keys.get("groq", "")
        mod = modelo or self.cloud_modelos.get("groq", "llama-3.3-70b-versatile")
        provider = LLMProviderFactory.get_provider("groq")
        res = provider.generar_respuesta(
            system_prompt=system_prompt,
            mensajes_previos=mensajes_previos,
            user_prompt=user_prompt,
            temperatura=temperatura,
            api_key=key,
            modelo=mod
        )
        return res.get("texto", "")

    def _llamar_openai_compatible_api(
        self,
        endpoint_url: str,
        api_key: str,
        modelo: str,
        system_prompt: str,
        mensajes_previos: List[Dict[str, str]],
        user_prompt: str,
        temperatura: float = 0.2,
        extra_headers: Optional[Dict[str, str]] = None,
        proveedor_nombre: str = "openai"
    ) -> str:
        provider = LLMProviderFactory.get_provider(proveedor_nombre)
        res = provider.generar_respuesta(
            system_prompt=system_prompt,
            mensajes_previos=mensajes_previos,
            user_prompt=user_prompt,
            temperatura=temperatura,
            api_key=api_key,
            modelo=modelo
        )
        return res.get("texto", "")

    def _generar_respuesta_llm(
        self,
        system_prompt: str,
        mensajes_previos: List[Dict[str, str]],
        user_prompt: str,
        temperatura: float = 0.2
    ) -> str:
        """Despacha la generación de texto hacia Ollama o hacia el proveedor Cloud activo."""
        prov = getattr(self, "proveedor_activo", "ollama").lower()
        key = self.cloud_api_keys.get(prov, "")
        mod = self.cloud_modelos.get(prov, self.chat_model)

        provider = LLMProviderFactory.get_provider(prov, host=self.host)
        res = provider.generar_respuesta(
            system_prompt=system_prompt,
            mensajes_previos=mensajes_previos,
            user_prompt=user_prompt,
            temperatura=temperatura,
            api_key=key,
            modelo=mod
        )

        texto = res.get("texto", "").strip()
        usage = res.get("usage", {})
        rate_limits = res.get("rate_limits", {})

        p_tok = int(usage.get("prompt_tokens", 0))
        c_tok = int(usage.get("completion_tokens", 0))
        t_tok = int(usage.get("total_tokens", p_tok + c_tok))

        lim_tok = rate_limits.get("limite_tokens", 0)
        rem_tok = rate_limits.get("tokens_restantes")
        porc_forzado = rate_limits.get("porcentaje_restante")
        reset_inf = rate_limits.get("reset_tokens", "")

        self._actualizar_estadisticas_tokens(
            proveedor=prov,
            prompt_tokens=p_tok,
            completion_tokens=c_tok,
            total_tokens=t_tok,
            limite_tokens=lim_tok,
            tokens_restantes=rem_tok,
            porcentaje_forzado=porc_forzado,
            detalle_api=res.get("detalle", ""),
            reset_info=reset_inf
        )

        return texto

    def verificar_estado_ia(self) -> Dict[str, Any]:
        """Diagnóstico completo del estado del servicio Ollama, proveedores Cloud y modelos disponibles."""
        resultado = {
            "proveedor_activo": self.proveedor_activo,
            "cloud_modelos": self.cloud_modelos,
            "cloud_keys_configuradas": {k: bool(v) for k, v in self.cloud_api_keys.items()},
            "ollama_instalado": ollama is not None,
            "chromadb_instalado": chromadb is not None,
            "ollama_activo": False,
            "ollama_online": False,
            "modelos_disponibles": [],
            "modelos_instalados": [],
            "embed_model_listo": False,
            "chat_model_listo": False,
            "embed_model": self.embed_model,
            "chat_model": self.chat_model,
            "db_path": self.db_path,
            "total_vectores": 0
        }

        if self.collection:
            try:
                resultado["total_vectores"] = self.collection.count()
            except Exception:
                pass

        if not self.client_ollama:
            return resultado

        try:
            res = self.client_ollama.list()
            modelos_raw = getattr(res, "models", []) if hasattr(res, "models") else (res.get("models", []) if isinstance(res, dict) else [])
            nombres = []
            for m in modelos_raw:
                nombre = getattr(m, "model", None) or getattr(m, "name", None) or (m.get("name") if isinstance(m, dict) else str(m))
                if nombre:
                    nombres.append(nombre)

            resultado["ollama_activo"] = True
            resultado["ollama_online"] = True
            resultado["modelos_disponibles"] = nombres
            resultado["modelos_instalados"] = nombres

            for nom in nombres:
                if self.embed_model in nom:
                    resultado["embed_model_listo"] = True
                if self.chat_model in nom:
                    resultado["chat_model_listo"] = True

            # Auto-selección inteligente del modelo de chat instalado
            if not resultado["chat_model_listo"] and nombres:
                for nom in nombres:
                    if not any(k in nom.lower() for k in ["embed", "nomic", "bge", "bert"]):
                        self.chat_model = nom
                        resultado["chat_model"] = nom
                        resultado["chat_model_listo"] = True
                        break
                if not resultado["chat_model_listo"] and nombres:
                    self.chat_model = nombres[0]
                    resultado["chat_model"] = nombres[0]
                    resultado["chat_model_listo"] = True

        except Exception as e:
            resultado["error"] = str(e)
            resultado["ollama_activo"] = False
            resultado["ollama_online"] = False

        resultado["ollama_online"] = resultado.get("ollama_activo", False)
        resultado["modelos_instalados"] = resultado.get("modelos_disponibles", [])
        return resultado

    # =========================================================================
    # 2. AGRUPADOR SEMÁNTICO DINÁMICO CON VENTANA ELÁSTICA Y OVERLAP
    # =========================================================================
    def _dividir_en_oraciones_semanticas(self, texto: str) -> List[str]:
        """
        Segmenta un texto en oraciones semánticas respetando abreviaturas científicas,
        médicas, p-values (p < 0.05) y fórmulas numéricas sin romper el significado.
        """
        texto = str(texto or "").strip()
        if not texto:
            return []

        # Candidatos a fin de oración: punto, signo de interrogación o exclamación seguido de espacio y mayúscula/símbolo
        patron = r'(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ"\'¿¡\d])'
        partes = re.split(patron, texto)
        
        oraciones: List[str] = []
        buffer = ""

        for parte in partes:
            candidato = f"{buffer} {parte}".strip() if buffer else parte.strip()
            palabras = candidato.split()
            ultima_palabra = palabras[-1].lower() if palabras else ""

            # Si la última palabra es una abreviatura conocida, concatenar sin cortar
            if any(ultima_palabra == ab or ultima_palabra.endswith(ab) for ab in ABREVIATURAS_CIENTIFICAS):
                buffer = candidato
                continue
            
            # Si concluye en número decimal parcial o fórmula (ej. "p < 0." o "HR = 1.")
            if re.search(r'\b[a-zA-Z]+\s*[=<>]+\s*\d+\.$', candidato) or re.search(r'\b\d+\.$', candidato):
                buffer = candidato
                continue

            oraciones.append(candidato)
            buffer = ""

        if buffer:
            if oraciones:
                oraciones[-1] = f"{oraciones[-1]} {buffer}"
            else:
                oraciones.append(buffer)

        return [o.strip() for o in oraciones if o.strip()]

    def _agrupar_oraciones(
        self,
        lista_items: List[Union[str, Dict[str, Any]]],
        limite_chars: int = 1200,
        margen_holgura: int = 300
    ) -> List[Dict[str, Any]]:
        """
        Segmentador semántico con ventana elástica (1200±300 chars) y metadatos de página.
        - Prioriza saltos de párrafo (\n\n) como fronteras naturales de pensamiento.
        - Aplica ventana elástica (limite_chars ± margen_holgura) para evitar mutilar datos críticos.
        - Mantiene overlap inteligente de 1 oración o fragmento entre chunks adyacentes.
        """
        if not lista_items:
            return []

        # 1. Normalizar y extraer unidades semánticas básicas (párrafos / oraciones con metadatos de página)
        unidades: List[Dict[str, Any]] = []
        
        for it in lista_items:
            if isinstance(it, dict):
                t_raw = str(it.get("texto", "")).strip()
                p = it.get("pagina", 1)
            else:
                t_raw = str(it).strip()
                p = 1
            
            if not t_raw:
                continue

            # Separar por párrafos lógicos (\n\n)
            parrafos = re.split(r'\n\s*\n+', t_raw)
            for parrafo in parrafos:
                parrafo_limpio = parrafo.strip()
                if not parrafo_limpio:
                    continue
                
                # Si el párrafo no excede el umbral máximo elástico, mantenerlo como una unidad coherente
                if len(parrafo_limpio) <= (limite_chars + margen_holgura):
                    unidades.append({"texto": parrafo_limpio, "pagina": p})
                else:
                    # Si el párrafo es extenso, desglosarlo en oraciones semánticas
                    oraciones = self._dividir_en_oraciones_semanticas(parrafo_limpio)
                    for oracion in oraciones:
                        unidades.append({"texto": oracion, "pagina": p})

        if not unidades:
            return []

        chunks: List[Dict[str, Any]] = []
        bloque_actual: List[str] = []
        paginas_bloque: set = set()
        chars_acumulados = 0
        max_umbral = limite_chars + margen_holgura

        for el in unidades:
            txt = el["texto"]
            pag = el["pagina"]
            len_txt = len(txt)

            nuevo_total = chars_acumulados + len_txt + (2 if bloque_actual else 0)

            if bloque_actual and (nuevo_total > max_umbral):
                pags_str = f"Pág. {min(paginas_bloque)}" if len(paginas_bloque) == 1 else f"Págs. {min(paginas_bloque)}-{max(paginas_bloque)}"
                texto_puro = "\n\n".join(bloque_actual).strip()
                texto_chunk = f"[{pags_str}]\n{texto_puro}"

                chunks.append({
                    "chunk_idx": len(chunks),
                    "texto": texto_chunk,
                    "texto_puro": texto_puro,
                    "pagina_inicio": min(paginas_bloque),
                    "pagina_fin": max(paginas_bloque),
                    "chars": len(texto_chunk),
                    "num_oraciones": len(bloque_actual),
                    "num_elementos": len(bloque_actual)
                })

                # Overlap inteligente: conservar la última oración del bloque anterior
                ultimo_elem = bloque_actual[-1]
                oraciones_ultimo = self._dividir_en_oraciones_semanticas(ultimo_elem)
                overlap_elem = oraciones_ultimo[-1] if oraciones_ultimo else ultimo_elem

                bloque_actual = [overlap_elem, txt]
                paginas_bloque = {pag}
                chars_acumulados = len(overlap_elem) + len_txt + 2
            else:
                bloque_actual.append(txt)
                paginas_bloque.add(pag)
                chars_acumulados = nuevo_total

        # Último bloque pendiente
        if bloque_actual:
            pags_str = f"Pág. {min(paginas_bloque)}" if len(paginas_bloque) == 1 else f"Págs. {min(paginas_bloque)}-{max(paginas_bloque)}"
            texto_puro = "\n\n".join(bloque_actual).strip()
            texto_chunk = f"[{pags_str}]\n{texto_puro}"
            chunks.append({
                "chunk_idx": len(chunks),
                "texto": texto_chunk,
                "texto_puro": texto_puro,
                "pagina_inicio": min(paginas_bloque),
                "pagina_fin": max(paginas_bloque),
                "chars": len(texto_chunk),
                "num_oraciones": len(bloque_actual),
                "num_elementos": len(bloque_actual)
            })

        return chunks

    # =========================================================================
    # 3. GENERACIÓN DE EMBEDDINGS
    # =========================================================================
    def _obtener_embedding(self, texto: str) -> Optional[List[float]]:
        """Calcula el vector de embedding usando Ollama."""
        if not self.client_ollama:
            return None

        try:
            if hasattr(self.client_ollama, "embed"):
                res = self.client_ollama.embed(model=self.embed_model, input=texto)
                embeddings = getattr(res, "embeddings", None) or (res.get("embeddings") if isinstance(res, dict) else None)
                if embeddings and len(embeddings) > 0:
                    return embeddings[0]

            res = self.client_ollama.embeddings(model=self.embed_model, prompt=texto)
            return getattr(res, "embedding", None) or (res.get("embedding") if isinstance(res, dict) else None)
        except Exception as e:
            logger.warning(f"⚠️ [RAG] Error al calcular embedding con '{self.embed_model}': {e}")
            return None

    # =========================================================================
    # 4. INGESTA VECTORIAL Y GUARDADO ESTRUCTURADO
    # =========================================================================
    def ingestar_documento(
        self,
        doc_id: str,
        lista_oraciones: List[Union[str, Dict[str, Any]]],
        limite_chars: int = 1200,
        metadata_extra: Optional[Dict[str, Any]] = None,
        texto_completo: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Indexa un documento en ChromaDB y guarda el texto completo formateado.
        """
        if not self.collection:
            return {"exito": False, "error": "ChromaDB no está disponible."}

        if not self.client_ollama:
            return {"exito": False, "error": "Cliente Ollama no disponible."}

        doc_id = self._normalizar_doc_id(doc_id)

        chunks = self._agrupar_oraciones(lista_oraciones, limite_chars=limite_chars)
        if not chunks:
            return {"exito": False, "error": "No se generaron fragmentos para el documento."}

        # Guardar en memoria de texto completo
        if texto_completo:
            self.documentos_texto[doc_id] = texto_completo
        else:
            self.documentos_texto[doc_id] = "\n\n".join([c["texto"] for c in chunks])
        self.documentos_chunks[doc_id] = chunks

        try:
            self.collection.delete(where={"doc_id": str(doc_id)})
        except Exception:
            pass

        ids = []
        embeddings = []
        documents = []
        metadatas = []

        doc_meta_base = metadata_extra.copy() if metadata_extra else {}
        doc_meta_base["doc_id"] = str(doc_id)

        for chunk in chunks:
            emb = self._obtener_embedding(chunk["texto"])
            if emb is None:
                return {
                    "exito": False,
                    "error": f"Fallo al vectorizar con modelo '{self.embed_model}'. ¿Está descargado en Ollama?"
                }

            chunk_id = f"{doc_id}_c{chunk['chunk_idx']}"
            chunk_meta = doc_meta_base.copy()
            chunk_meta["chunk_idx"] = chunk["chunk_idx"]
            chunk_meta["pagina_inicio"] = chunk.get("pagina_inicio", 1)
            chunk_meta["pagina_fin"] = chunk.get("pagina_fin", 1)
            chunk_meta["chars"] = chunk["chars"]

            ids.append(chunk_id)
            embeddings.append(emb)
            documents.append(chunk["texto"])
            metadatas.append(chunk_meta)

        try:
            self.collection.add(
                ids=ids,
                embeddings=embeddings,
                documents=documents,
                metadatas=metadatas
            )
            logger.info(f"✅ [RAG] Documento '{doc_id}' ingestó {len(chunks)} chunks con éxito.")
            return {
                "exito": True,
                "doc_id": doc_id,
                "total_chunks": len(chunks),
                "total_paginas": metadata_extra.get("total_paginas", 1) if metadata_extra else 1,
                "mensaje": f"Documento indexado exitosamente ({len(chunks)} fragmentos)."
            }
        except Exception as e:
            logger.error(f"❌ [RAG] Error al guardar en ChromaDB: {e}")
            return {"exito": False, "error": f"Error ChromaDB: {str(e)}"}

    # =========================================================================
    # 5. ENRUTADOR FASE 0, SUB-PREGUNTAS Y DOBLE MODO DE SALIDA
    # =========================================================================
    def _enrutar_consulta(self, pregunta: str, tipo_solicitud: Optional[str] = None) -> tuple:
        """
        Fase 0: Enrutador de Complejidad.
        - Vía 1: Plantillas Predefinidas (Resumen, Académico, Conclusiones, Glosario, Análisis Crítico).
        - Vía 2: Desglose Dinámico con Structured Output (prompts libres largos > 180 chars o con múltiples intenciones).
        - Vía 3: Pase Directo (preguntas cortas / puntuales <= 180 chars).
        """
        # Vía 1: Solicitudes con plantilla explícita
        if tipo_solicitud and str(tipo_solicitud).lower() in PLANTILLAS_SUBPREGUNTAS:
            return ("via_1", PLANTILLAS_SUBPREGUNTAS[str(tipo_solicitud).lower()])

        preg_norm = (pregunta or "").strip().lower()
        if not preg_norm:
            return ("via_1", PLANTILLAS_SUBPREGUNTAS["resumen"])

        # Detectar intenciones que mapean directamente a plantillas estándar
        if any(kw in preg_norm for kw in [
            "resumen", "resumir", "de que trata", "de qué trata", "sobre que trata", "sobre qué trata", 
            "de que va", "de qué va", "explica el documento", "explicame el documento", "explícame el documento",
            "puntos principales", "puntos clave", "de que habla", "de qué habla"
        ]):
            return ("via_1", PLANTILLAS_SUBPREGUNTAS["resumen"])
        if any(kw in preg_norm for kw in ["resumen academico", "resumen académico", "sintesis academica", "síntesis académica", "articulo academico", "artículo académico", "cientifico", "científico"]):
            return ("via_1", PLANTILLAS_SUBPREGUNTAS["academico"])
        if any(kw in preg_norm for kw in ["glosario", "conceptos clave", "terminos tecnicos", "términos técnicos", "abreviaturas", "definiciones", "conceptos"]):
            return ("via_1", PLANTILLAS_SUBPREGUNTAS["conceptos"])
        if any(kw in preg_norm for kw in ["conclusiones principales", "conclusiones del estudio", "extraer conclusiones", "conclusiones", "hallazgos principales"]):
            return ("via_1", PLANTILLAS_SUBPREGUNTAS["conclusiones"])
        if any(kw in preg_norm for kw in ["analisis critico", "análisis crítico", "fortalezas y limitaciones", "critica", "crítica"]):
            return ("via_1", PLANTILLAS_SUBPREGUNTAS["analisis_critico"])

        # Vía 2: Desglose Dinámico para preguntas libres extensas (> 180 caracteres)
        if len(pregunta.strip()) > 180 or ("?" in pregunta and pregunta.count("?") >= 2):
            return ("via_2", None)

        # Vía 3: Pase Directo para preguntas puntuales / cortas
        return ("via_3", None)

    async def _desglosar_consulta_compleja_async(self, pregunta: str) -> List[Dict[str, str]]:
        """
        Fase 0 - Vía 2: Utiliza el LLM activo con Structured Output para desglosar una consulta libre en 2-4 sub-preguntas atómicas.
        """
        system_prompt_planner = (
            "Eres un planificador experto de consultas de búsqueda semántica y análisis documental.\n"
            "Tu objetivo es descomponer la solicitud del usuario en 2 a 6 apartados o sub-preguntas específicas, claras y atómicas.\n"
            "Si el prompt del usuario ya viene numerado o dividido en secciones (ej. 1. Contexto, 2. Características, 3. Metodología, 4. Resultados, 5. Análisis), respeta cada sección como una sub-pregunta conservando todas las instrucciones específicas de esa sección.\n"
            "Debes responder EXCLUSIVAMENTE con un JSON válido siguiendo este esquema:\n"
            "{\n"
            '  "subpreguntas": [\n'
            '    {"titulo": "Título de Sección 1", "pregunta": "Instrucción y preguntas detalladas de la sección 1..."},\n'
            '    {"titulo": "Título de Sección 2", "pregunta": "Instrucción y preguntas detalladas de la sección 2..."}\n'
            "  ]\n"
            "}"
        )
        user_prompt_planner = f"Desglosa la siguiente solicitud en sub-preguntas atómicas:\n\"{pregunta}\""

        try:
            prov = getattr(self, "proveedor_activo", "ollama").lower()
            key = self.cloud_api_keys.get(prov, "")
            mod = self.cloud_modelos.get(prov, self.chat_model)
            provider = LLMProviderFactory.get_provider(prov, host=self.host)

            res = await provider.generar_respuesta_async(
                system_prompt=system_prompt_planner,
                mensajes_previos=[],
                user_prompt=user_prompt_planner,
                temperatura=0.1,
                api_key=key,
                modelo=mod
            )
            raw_text = res.get("texto", "").strip()

            # Extraer bloque JSON con expresión regular
            json_match = re.search(r'\{[\s\S]*\}', raw_text)
            if json_match:
                parsed = json.loads(json_match.group(0))
                sub_list = parsed.get("subpreguntas") or parsed.get("sub_preguntas") or []
                if isinstance(sub_list, list) and len(sub_list) >= 2:
                    subpreguntas_limpias = []
                    for item in sub_list[:8]:
                        if isinstance(item, dict) and "pregunta" in item:
                            subpreguntas_limpias.append({
                                "titulo": str(item.get("titulo", "Sección")).strip(),
                                "pregunta": str(item.get("pregunta", "")).strip()
                            })
                    if subpreguntas_limpias:
                        logger.info(f"🧩 [RAG Desglosador] Consulta descompuesta en {len(subpreguntas_limpias)} sub-preguntas.")
                        return subpreguntas_limpias
        except Exception as e:
            logger.warning(f"⚠️ [RAG Desglosador] Error al desglosar dinámicamente ({e}). Fallback a consulta directa.")

        return [
            {"titulo": "Consulta Principal", "pregunta": pregunta}
        ]

    async def _sintetizar_prosa_fluida_async(
        self,
        secciones: List[Dict[str, Any]],
        pregunta_original: str,
        temperatura: float = 0.2
    ) -> str:
        """
        Modo 2: Nodo de Ensamble y Síntesis que fusiona las secciones aisladas en un texto continuo, coherente y fluido con conectores lógicos naturales.
        """
        cuerpo_secciones = []
        for s in secciones:
            cuerpo_secciones.append(f"## {s['titulo']}\n{s['respuesta']}")
        bloque_insumos = "\n\n".join(cuerpo_secciones)

        system_sintesis = (
            "Eres LiraAI, un redactor académico y científico de élite.\n"
            "Tu misión es fusionar y sintetizar los siguientes apartados extraídos de un documento en un único informe continuo, orgánico y perfectamente redactado.\n\n"
            "DIRECTRICES DE REDACCIÓN:\n"
            "1. Cohesión y Fluidez: Usa conectores lógicos elegantes para unir las ideas en una prosa continua y profesional.\n"
            "2. Sin etiquetas inventadas: NO escribas etiquetas como `[Pág. X]` ni referencias dentro del texto (el sistema agregará todos los fragmentos consultados al final del informe).\n"
            "3. Fidelidad Temática: No agregues información inventada que no figure en los apartados originales.\n"
            "4. Estructura Limpia: Utiliza subtítulos claros si facilitan la lectura del informe."
        )

        user_prompt_sintesis = (
            f"SOLICITUD INICIAL DEL USUARIO:\n\"{pregunta_original}\"\n\n"
            f"APARTADOS EXTRAÍDOS DEL DOCUMENTO:\n\"\"\"\n{bloque_insumos}\n\"\"\"\n\n"
            f"INFORME FINAL INTEGRADO:"
        )

        try:
            txt_sintetizado = await self._generar_respuesta_llm_async(
                system_prompt=system_sintesis,
                mensajes_previos=[],
                user_prompt=user_prompt_sintesis,
                temperatura=temperatura
            )
            return txt_sintetizado.strip()
        except Exception as e:
            logger.warning(f"⚠️ [RAG Síntesis] Error en pase de ensamble ({e}), devolviendo texto concatenado.")
            return "\n\n".join([f"### {s['titulo']}\n{s['respuesta']}" for s in secciones])

    async def _ejecutar_subpreguntas_concurrente_async(
        self,
        doc_id: str,
        subpreguntas: List[Dict[str, str]],
        modo_salida: str = "trazabilidad",
        temperatura: float = 0.2,
        pregunta_original: str = ""
    ) -> Dict[str, Any]:
        """
        Ejecuta las sub-preguntas de forma concurrente (en paralelo) en ChromaDB y el LLM,
        y formatea el resultado según el Modo 1 (Trazabilidad 1:1) o Modo 2 (Prosa Fluida).
        """
        prov = getattr(self, "proveedor_activo", "ollama").lower()
        chunks_guardados = self.documentos_chunks.get(doc_id, [])
        nombre_doc_limpio = os.path.splitext(os.path.basename(doc_id))[0].replace('_', ' ')

        async def _resolver_una_subpregunta(idx: int, sub: Dict[str, str], cb_sec=None) -> Dict[str, Any]:
            titulo = sub.get("titulo", f"Sección {idx + 1}")
            preg_text = sub.get("pregunta", "")

            sub_docs = []
            sub_metas = []
            sub_dists = []

            # 1. Solo en la primera subpregunta (idx == 0) inyectar portada/primeras páginas para autores y título
            es_intro = (idx == 0)
            if es_intro and chunks_guardados:
                for c in chunks_guardados[:2]:
                    sub_docs.append(c["texto"])
                    sub_metas.append({
                        "pagina_inicio": c.get("pagina_inicio", 1),
                        "pagina_fin": c.get("pagina_fin", 1),
                        "chunk_idx": c.get("chunk_idx", 0)
                    })
                    sub_dists.append(0.1)

            # 2. Búsqueda Vectorial Semántica en ChromaDB orientada a la pregunta específica
            emb_sub = self._obtener_embedding(preg_text[:1000]) if self.client_ollama else None
            if emb_sub is not None and self.collection:
                try:
                    q_res = self.collection.query(
                        query_embeddings=[emb_sub],
                        n_results=4,
                        where={"doc_id": str(doc_id)}
                    )
                    v_docs = q_res.get("documents", [[]])[0]
                    v_metas = q_res.get("metadatas", [[]])[0]
                    v_dists = q_res.get("distances", [[]])[0]

                    for vd, vm, vdist in zip(v_docs, v_metas, v_dists):
                        if vd not in sub_docs:
                            sub_docs.append(vd)
                            sub_metas.append(vm)
                            sub_dists.append(vdist)
                except Exception as e:
                    logger.warning(f"⚠️ [RAG SubQ {idx+1}] Búsqueda vectorial falló: {e}")

            # 3. Fallback de fragmentos si no hubo coincidencia vectorial
            if len(sub_docs) < 2 and chunks_guardados:
                offset = (idx * len(chunks_guardados)) // max(len(subpreguntas), 1)
                for c in chunks_guardados[offset : offset + 3]:
                    if c["texto"] not in sub_docs:
                        sub_docs.append(c["texto"])
                        sub_metas.append({
                            "pagina_inicio": c.get("pagina_inicio", 1),
                            "pagina_fin": c.get("pagina_fin", 1),
                            "chunk_idx": c.get("chunk_idx", 0)
                        })
                        sub_dists.append(0.4)

            sub_fuentes = []
            contextos_formateados = []
            for d_idx, d_txt in enumerate(sub_docs):
                m = sub_metas[d_idx] if d_idx < len(sub_metas) else {}
                p_ini = m.get("pagina_inicio", 1)
                p_fin = m.get("pagina_fin", p_ini)
                p_tag = f"Pág. {p_ini}" if p_ini == p_fin else f"Págs. {p_ini}-{p_fin}"
                contextos_formateados.append(f"[Fragmento {d_idx + 1} | {p_tag}]:\n{d_txt}")
                sub_fuentes.append({
                    "fragmento_num": d_idx + 1,
                    "pagina": p_ini,
                    "pagina_inicio": p_ini,
                    "pagina_fin": p_fin,
                    "pags_tag": p_tag,
                    "texto": d_txt,
                    "metadata": m,
                    "distancia": sub_dists[d_idx] if d_idx < len(sub_dists) else None
                })

            bloque_sub_ctx = "\n\n".join(contextos_formateados) if contextos_formateados else "No se encontraron fragmentos específicos."

            if idx == 0:
                system_sub = (
                    "Eres LiraAI, un asistente experto de análisis, lectura e investigación documental.\n"
                    "Tu misión es responder con profundidad, claridad y rigor a la PREGUNTA asignada, basándote en los fragmentos del documento provistos.\n\n"
                    "REGLAS:\n"
                    "1. Responde de forma directa, limpia y bien estructurada a la pregunta.\n"
                    "2. Identifica con exactitud el título del documento/obra, sus autores y el tema o premisa principal a partir de los fragmentos provistos o del nombre del archivo.\n"
                    "3. Redacta con prosa natural. NO agregues etiquetas manuales de páginas dentro de tu redacción (el sistema vincula automáticamente las páginas y fragmentos al pie de la sección).\n"
                    "4. No agregues encabezados introductorios vacíos (como 'Respuesta directa:'). Ve directo al contenido."
                )
            else:
                system_sub = (
                    "Eres LiraAI, un asistente experto de análisis, lectura e investigación documental.\n"
                    "Tu misión es responder con profundidad, claridad y rigor a la PREGUNTA asignada, basándote exclusivamente en los fragmentos del documento provistos.\n\n"
                    "REGLAS ESTRICTAS:\n"
                    "1. CÉNTRATE EXCLUSIVAMENTE en responder la pregunta de esta sección. Ve DIRECTO al tema solicitado.\n"
                    "2. NO repitas el título del libro/documento, ni los autores, traductores o fichas bibliográficas (eso ya fue respondido en la primera sección).\n"
                    "3. Redacta con prosa natural, analítica y fluida. NO agregues etiquetas manuales de páginas dentro de tus oraciones (el sistema vincula automáticamente las páginas y fragmentos al pie de la sección).\n"
                    "4. No agregues encabezados introductorios vacíos (como 'Respuesta directa:' o 'Identificación de la Obra'). Inicia directamente con el desarrollo temático."
                )

            user_prompt_sub = (
                f"DOCUMENTO: {nombre_doc_limpio}\n\n"
                f"FRAGMENTOS DE REFERENCIA:\n\"\"\"\n{bloque_sub_ctx}\n\"\"\"\n\n"
                f"SECCIÓN {idx + 1}: {titulo}\n"
                f"PREGUNTA ESPECÍFICA A RESPONDER:\n{preg_text}\n\n"
                f"DESARROLLO DIRECTO DE LA RESPUESTA:"
            )

            try:
                txt_resp = await self._generar_respuesta_llm_async(
                    system_prompt=system_sub,
                    mensajes_previos=[],
                    user_prompt=user_prompt_sub,
                    temperatura=temperatura,
                    stream_callback=cb_sec
                )
            except Exception as e:
                logger.error(f"❌ [RAG SubQ {idx+1}] Error generando respuesta: {e}")
                txt_resp = f"*(No se pudo generar respuesta para este apartado: {e})*"

            # Limpiar posibles prefijos redundantes generados por el LLM
            txt_resp_limpio = txt_resp.strip()
            txt_resp_limpio = re.sub(r'^(?:(?:RESPUESTA|DESARROLLO)(?:\s+DIRECT[AO](?:\s+Y\s+FUNDAMENTAD[AO])?)?:?|RESPUESTA:\s*)\s*', '', txt_resp_limpio, flags=re.IGNORECASE)
            if idx > 0:
                txt_resp_limpio = re.sub(r'^(?:\*{0,2}Identificación de la Obra[^\n]*\n(?:[^\n]*\n){1,6})', '', txt_resp_limpio, flags=re.IGNORECASE)

            return {
                "idx": idx + 1,
                "titulo": titulo,
                "pregunta": preg_text,
                "respuesta": txt_resp_limpio.strip(),
                "fuentes": sub_fuentes
            }

        # En Ollama ejecutamos secuencialmente para ir mostrando apartado por apartado en tiempo real
        cb_global = getattr(self, "stream_callback", None)
        if prov == "ollama" and cb_global is not None:
            secciones = []
            bloques_previos = []
            for i, s in enumerate(subpreguntas):
                tit_s = s.get("titulo", f"Sección {i + 1}")
                preg_s = s.get("pregunta", "")
                prefijo = "\n\n---\n\n".join(bloques_previos) + ("\n\n---\n\n" if bloques_previos else "")
                encabezado_sec = f"### 📑 {i + 1}. {tit_s}\n> ❓ **Pregunta:** *{preg_s}*\n\n"
                def _cb_parcial(parcial, _pref=prefijo, _enc=encabezado_sec):
                    try:
                        cb_global(_pref + _enc + parcial)
                    except Exception:
                        pass
                sec_res = await _resolver_una_subpregunta(i, s, cb_sec=_cb_parcial)
                secciones.append(sec_res)
                bloques_previos.append(f"{encabezado_sec}{sec_res['respuesta']}")
        else:
            tareas = [_resolver_una_subpregunta(i, s) for i, s in enumerate(subpreguntas)]
            secciones = await asyncio.gather(*tareas)

        # Consolidar y deduplicar fuentes
        fuentes_consolidadas = []
        textos_vistos = set()
        for sec in secciones:
            for f in sec.get("fuentes", []):
                snippet_key = f.get("texto", "")[:100]
                if snippet_key and snippet_key not in textos_vistos:
                    textos_vistos.add(snippet_key)
                    f_copy = dict(f)
                    f_copy["fragmento_num"] = len(fuentes_consolidadas) + 1
                    fuentes_consolidadas.append(f_copy)

        if modo_salida == "prosa":
            logger.info(f"📝 [RAG Dual Mode] Ensamblando Modo 2 (Prosa Fluida) para {len(secciones)} secciones...")
            texto_fluido = await self._sintetizar_prosa_fluida_async(
                secciones=secciones,
                pregunta_original=pregunta_original or "Resumen integral del documento",
                temperatura=temperatura
            )
            # Limpiar cualquier placeholder literal [Pág. X] que el modelo pudiera haber generado
            texto_fluido = re.sub(r'\s*\[(?:Pág\.|Página|Págs\.|Pag\.|Pagina)\s*[xX]\s*\]', '', texto_fluido)
            if fuentes_consolidadas:
                refs_globales = ", ".join(f"[Fragmento {fc['fragmento_num']}]" for fc in fuentes_consolidadas if fc.get("fragmento_num"))
                if refs_globales:
                    texto_fluido = f"{texto_fluido}\n\n---\n\n> *📍 Fragmentos consultados: {refs_globales}*"
            return {
                "exito": True,
                "respuesta": texto_fluido,
                "modo": "prosa",
                "secciones": secciones,
                "fuentes": fuentes_consolidadas,
                "total_fuentes": len(fuentes_consolidadas),
                "proveedor": prov,
                "token_stats": self.obtener_estadisticas_tokens(prov)
            }
        else:
            logger.info(f"📑 [RAG Dual Mode] Estructurando Modo 1 (Trazabilidad 1:1) con {len(secciones)} tarjetas...")
            bloques_markdown = []
            for sec in secciones:
                tit = sec["titulo"]
                preg = sec.get("pregunta", "")
                resp = sec["respuesta"]
                f_sec = sec.get("fuentes", [])
                refs_sec = []
                for f in f_sec:
                    s_key = f.get("texto", "")[:100]
                    f_match = next((fc for fc in fuentes_consolidadas if fc.get("texto", "")[:100] == s_key), f)
                    f_num = f_match.get("fragmento_num")
                    p_num = f.get("pagina", 1)
                    tag_ref = f"[Fragmento {f_num}]" if f_num else f"[Pág. {p_num}]"
                    if tag_ref not in refs_sec:
                        refs_sec.append(tag_ref)
                pags_str = ", ".join(refs_sec) if refs_sec else "General"

                bloques_markdown.append(
                    f"### 📑 {sec['idx']}. {tit}\n"
                    f"> ❓ **Pregunta:** *{preg}*\n\n"
                    f"{resp}\n\n"
                    f"> *📍 Fragmentos consultados: {pags_str}*"
                )

            respuesta_markdown = "\n\n---\n\n".join(bloques_markdown)
            return {
                "exito": True,
                "respuesta": respuesta_markdown,
                "modo": "trazabilidad",
                "secciones": secciones,
                "fuentes": fuentes_consolidadas,
                "total_fuentes": len(fuentes_consolidadas),
                "proveedor": prov,
                "token_stats": self.obtener_estadisticas_tokens(prov)
            }

    async def preguntar_al_documento_async(
        self,
        doc_id: str,
        pregunta: str,
        top_k: int = 10,
        temperatura: float = 0.2,
        system_prompt_custom: Optional[str] = None,
        tipo_solicitud: Optional[str] = None,
        modo_salida: str = "trazabilidad",
        contexto_extra: str = "",
        ignorar_pdf: bool = False
    ) -> Dict[str, Any]:
        """
        Versión asíncrona central de consulta al documento con enrutador Fase 0, soporte de doble modo
        y control granular de fuentes (PDF, Apuntes, Subrayados).
        """
        prov = getattr(self, "proveedor_activo", "ollama").lower()
        if prov == "ollama" and not self.client_ollama:
            return {"exito": False, "error": "Ollama no está conectado. Inicia Ollama en tu PC o selecciona un proveedor Cloud en Ajustes."}

        doc_id = self._normalizar_doc_id(doc_id)

        # Si se ignora el PDF, respondemos de forma directa y enfocada con las notas/subrayados
        if ignorar_pdf:
            logger.info("🚫 [RAG Fuentes] Modo ignorar_pdf activo: Respondiendo exclusivamente con notas/subrayados.")
            bloque_contexto = contexto_extra.strip() if contexto_extra else "(No se seleccionaron notas ni subrayados adicionales)"
            fuentes = [{
                "fragmento_num": 1,
                "texto": "Apuntes y Subrayados seleccionados por el usuario",
                "metadata": {"modo": "fuentes_personalizadas_usuario"}
            }]
            system_prompt_fuentes = (
                "Eres LiraAI, el asistente personal de estudio del usuario en LiraLoud.\n"
                "El usuario ha configurado las fuentes para responder ÚNICAMENTE con base en sus apuntes personales y/o texto subrayado proporcionado.\n"
                "REGLAS:\n"
                "1. Basa tu respuesta exclusivamente en los apuntes y subrayados provistos.\n"
                "2. NO inventes información ni asumas contenido externo del libro.\n"
                "3. Responde de forma clara, directa y estructurada en formato Markdown."
            )
            system_prompt = system_prompt_custom or system_prompt_fuentes
            user_prompt_actual = (
                f"APUNTES Y SUBRAYADOS SELECCIONADOS POR EL USUARIO:\n\"\"\"\n{bloque_contexto}\n\"\"\"\n\n"
                f"SOLICITUD / PREGUNTA DEL USUARIO:\n{pregunta}\n\n"
                f"RESPUESTA:"
            )
            mensajes_contexto_previo = [] if tipo_solicitud == "personalizado" else self.obtener_mensajes_contexto_ollama(doc_id, max_turnos=4)
            self.agregar_mensaje_chat(doc_id=doc_id, role="user", texto=pregunta)

            try:
                texto_limpio = await self._generar_respuesta_llm_async(
                    system_prompt=system_prompt,
                    mensajes_previos=mensajes_contexto_previo,
                    user_prompt=user_prompt_actual,
                    temperatura=temperatura
                )
                self.agregar_mensaje_chat(doc_id=doc_id, role="ai", texto=texto_limpio, fuentes=fuentes)
                return {
                    "exito": True,
                    "respuesta": texto_limpio,
                    "fuentes": fuentes,
                    "total_fuentes": len(fuentes),
                    "modo": "directo",
                    "proveedor": prov,
                    "token_stats": self.obtener_estadisticas_tokens(prov)
                }
            except Exception as e:
                logger.error(f"❌ [RAG Fuentes] Error en generación LLM ({prov}): {e}")
                return {"exito": False, "error": f"Error al generar respuesta ({prov.upper()}): {str(e)}"}

        if tipo_solicitud == "personalizado":
            via, plantilla = ("via_2", None) if (modo_salida == "trazabilidad" or len(pregunta.strip()) > 180) else ("via_3", None)
        else:
            via, plantilla = self._enrutar_consulta(pregunta, tipo_solicitud)
        logger.info(f"🚦 [RAG Enrutador] Consulta dirigida por: {via.upper()} (Modo: {modo_salida})")

        # 1. VÍA 1: Plantillas Predefinidas
        if via == "via_1" and plantilla:
            subpreguntas = plantilla.get("subpreguntas", [])
            resultado = await self._ejecutar_subpreguntas_concurrente_async(
                doc_id=doc_id,
                subpreguntas=subpreguntas,
                modo_salida=modo_salida,
                temperatura=temperatura,
                pregunta_original=pregunta or plantilla.get("nombre", "")
            )
            self.agregar_mensaje_chat(doc_id=doc_id, role="user", texto=pregunta or plantilla.get("nombre", ""))
            self.agregar_mensaje_chat(doc_id=doc_id, role="ai", texto=resultado["respuesta"], fuentes=resultado.get("fuentes", []))
            return resultado

        # 2. VÍA 2: Desglose Dinámico de Consultas Complejas
        if via == "via_2":
            subpreguntas = await self._desglosar_consulta_compleja_async(pregunta)
            if len(subpreguntas) >= 2:
                resultado = await self._ejecutar_subpreguntas_concurrente_async(
                    doc_id=doc_id,
                    subpreguntas=subpreguntas,
                    modo_salida=modo_salida,
                    temperatura=temperatura,
                    pregunta_original=pregunta
                )
                self.agregar_mensaje_chat(doc_id=doc_id, role="user", texto=pregunta)
                self.agregar_mensaje_chat(doc_id=doc_id, role="ai", texto=resultado["respuesta"], fuentes=resultado.get("fuentes", []))
                return resultado

        # 3. VÍA 3: Pase Directo Tradicional (1 Paso)
        texto_completo = self.documentos_texto.get(doc_id, "")
        chunks_guardados = self.documentos_chunks.get(doc_id, [])

        fuentes = []
        bloque_contexto = ""

        limite_contexto = 500000 if prov in ["gemini", "groq", "openai", "deepseek", "openrouter"] else 20000
        if texto_completo and len(texto_completo) <= limite_contexto and prov == "gemini":
            bloque_contexto = texto_completo
            fuentes = [{
                "fragmento_num": 1,
                "texto": f"Documento completo estructurado ({len(texto_completo)} caracteres)",
                "metadata": {"modo": "contexto_completo_documento"}
            }]
        else:
            emb_pregunta = self._obtener_embedding(pregunta[:1000]) if self.client_ollama else None
            docs_encontrados = []
            metas_encontradas = []
            distancias = []

            if emb_pregunta is not None and self.collection:
                try:
                    cant_a_pedir = min(max(top_k, 8), 15)
                    query_res = self.collection.query(
                        query_embeddings=[emb_pregunta],
                        n_results=cant_a_pedir,
                        where={"doc_id": str(doc_id)}
                    )
                    docs_encontrados = query_res.get("documents", [[]])[0]
                    metas_encontradas = query_res.get("metadatas", [[]])[0]
                    distancias = query_res.get("distances", [[]])[0]
                except Exception as e:
                    logger.warning(f"⚠️ [RAG] Búsqueda vectorial falló ({e}), usando fallback de chunks.")

            if not docs_encontrados and chunks_guardados:
                for c in chunks_guardados[:10]:
                    docs_encontrados.append(c["texto"])
                    metas_encontradas.append({
                        "pagina_inicio": c.get("pagina_inicio", 1),
                        "pagina_fin": c.get("pagina_fin", 1),
                        "chunk_idx": c.get("chunk_idx", 0)
                    })
                    distancias.append(0.5)

            if not docs_encontrados and not chunks_guardados and not texto_completo:
                if not contexto_extra:
                    return {
                        "exito": True,
                        "respuesta": "No se encontró información para este documento. Por favor asegúrate de abrir un archivo PDF.",
                        "fuentes": []
                    }

            lista_docs_final = []
            for idx, doc_text in enumerate(docs_encontrados):
                meta = metas_encontradas[idx] if idx < len(metas_encontradas) else {}
                lista_docs_final.append({
                    "texto": doc_text,
                    "meta": meta,
                    "distancia": distancias[idx] if idx < len(distancias) else None
                })

            contextos_formateados = []
            for idx, item in enumerate(lista_docs_final):
                t = item["texto"]
                m = item.get("meta", {})
                pag_ini = m.get("pagina_inicio", 1)
                pag_fin = m.get("pagina_fin", pag_ini)
                pags_tag = f"Pág. {pag_ini}" if pag_ini == pag_fin else f"Págs. {pag_ini}-{pag_fin}"
                contextos_formateados.append(f"[Fragmento {idx + 1} | {pags_tag}]:\n{t}")
                fuentes.append({
                    "fragmento_num": idx + 1,
                    "pagina": pag_ini,
                    "pagina_inicio": pag_ini,
                    "pagina_fin": pag_fin,
                    "pags_tag": pags_tag,
                    "texto": t,
                    "metadata": m,
                    "distancia": item.get("distancia")
                })

            bloque_contexto = "\n\n".join(contextos_formateados)

        # Inyectar contexto adicional del usuario si existe
        if contexto_extra and contexto_extra.strip():
            bloque_contexto = f"--- APUNTES Y SUBRAYADOS DEL USUARIO ---\n{contexto_extra.strip()}\n\n--- FRAGMENTOS DEL DOCUMENTO PDF ---\n{bloque_contexto}"

        if prov == "ollama" and len(bloque_contexto) > 15000:
            bloque_contexto = bloque_contexto[:15000] + "\n\n[... contexto truncado para ajustar ventana de contexto ...]"

        system_prompt_default = (
            "Eres LiraAI, un asistente experto y riguroso de lectura, investigación y análisis de documentos y literatura científica.\n"
            "Tu tarea es responder con la más estricta veracidad y precisión basándote en el contexto del documento y en los apuntes/subrayados provistos.\n\n"
            "DIRECTRICES GENERALES DE RESPUESTA:\n"
            "1. Fidelidad estricta al usuario: Responde DIRECTA y PRECISAMENTE a lo que el usuario pregunte.\n"
            "2. Citas de Páginas Interactivas: Añade al final de cada afirmación clave la cita en formato `[Pág. X]` si proviene del documento.\n"
            "3. Rigor con la Evidencia: Basa todas tus afirmaciones estrictamente en las fuentes provistas.\n"
            "4. Respuesta completa: Desarrolla y finaliza la explicación solicitada."
        )

        system_prompt = system_prompt_custom or system_prompt_default
        user_prompt_actual = (
            f"TEXTO DEL DOCUMENTO Y FUENTES:\n\"\"\"\n{bloque_contexto}\n\"\"\"\n\n"
            f"SOLICITUD / PREGUNTA DEL USUARIO:\n{pregunta}\n\n"
            f"RESPUESTA:"
        )

        mensajes_contexto_previo = [] if tipo_solicitud == "personalizado" else self.obtener_mensajes_contexto_ollama(doc_id, max_turnos=4)
        self.agregar_mensaje_chat(doc_id=doc_id, role="user", texto=pregunta)

        try:
            texto_limpio = await self._generar_respuesta_llm_async(
                system_prompt=system_prompt,
                mensajes_previos=mensajes_contexto_previo,
                user_prompt=user_prompt_actual,
                temperatura=temperatura
            )

            self.agregar_mensaje_chat(
                doc_id=doc_id,
                role="ai",
                texto=texto_limpio,
                fuentes=fuentes
            )

            return {
                "exito": True,
                "respuesta": texto_limpio,
                "fuentes": fuentes,
                "total_fuentes": len(fuentes),
                "modo": "directo",
                "proveedor": prov,
                "token_stats": self.obtener_estadisticas_tokens(prov)
            }
        except Exception as e:
            logger.error(f"❌ [RAG] Error en generación LLM ({prov}): {e}")
            return {
                "exito": False,
                "error": f"Error al generar respuesta ({prov.upper()}): {str(e)}"
            }

    def preguntar_al_documento(
        self,
        doc_id: str,
        pregunta: str,
        top_k: int = 10,
        temperatura: float = 0.2,
        system_prompt_custom: Optional[str] = None,
        tipo_solicitud: Optional[str] = None,
        modo_salida: str = "trazabilidad",
        contexto_extra: str = "",
        ignorar_pdf: bool = False
    ) -> Dict[str, Any]:
        """
        Punto de entrada síncrono para consultas al documento con soporte de enrutador y doble modo.
        """
        return run_async_safely(
            self.preguntar_al_documento_async(
                doc_id=doc_id,
                pregunta=pregunta,
                top_k=top_k,
                temperatura=temperatura,
                system_prompt_custom=system_prompt_custom,
                tipo_solicitud=tipo_solicitud,
                modo_salida=modo_salida,
                contexto_extra=contexto_extra,
                ignorar_pdf=ignorar_pdf
            )
        )

    # =========================================================================
    # 6. RESÚMENES EJECUTIVOS Y CIENTÍFICOS INTELIGENTES
    # =========================================================================
    def resumir_documento(
        self,
        doc_id: str,
        enfoque: str = "general",
        modo_salida: str = "trazabilidad"
    ) -> Dict[str, Any]:
        """
        Genera resúmenes estructurados según el enfoque solicitado (resumen general, academico, etc.).
        """
        tipo_sol = "academico" if enfoque == "academico" else "resumen"
        return self.preguntar_al_documento(
            doc_id=doc_id,
            pregunta="",
            tipo_solicitud=tipo_sol,
            modo_salida=modo_salida
        )

    # =========================================================================
    # 7. GESTIÓN Y LIMPIEZA
    # =========================================================================
    def eliminar_documento(self, doc_id: str) -> Dict[str, Any]:
        """Elimina todos los vectores y metadatos de un doc_id."""
        if doc_id in self.documentos_texto:
            del self.documentos_texto[doc_id]
        if doc_id in self.documentos_chunks:
            del self.documentos_chunks[doc_id]

        if not self.collection:
            return {"exito": False, "error": "ChromaDB no disponible."}

        try:
            self.collection.delete(where={"doc_id": str(doc_id)})
            return {"exito": True, "doc_id": doc_id, "mensaje": "Documento eliminado de la base vectorial."}
        except Exception as e:
            return {"exito": False, "error": str(e)}


# Instancia global accesible desde cualquier parte del backend
rag_global = LiraRAG()
