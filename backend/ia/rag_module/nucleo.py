import os
import threading
import concurrent.futures
from typing import List, Dict, Any, Optional

from backend.ia.rag_module.comun import (
    LiraFTSStore,
    _obtener_chromadb,
    _obtener_ollama,
    logger,
)
from backend.ia.rag_module.historial import RAGHistorialMixin
from backend.ia.rag_module.proveedores import RAGProveedoresMixin
from backend.ia.rag_module.ingesta import RAGIngestaMixin
from backend.ia.rag_module.consultas import RAGConsultasMixin


class LiraRAG(RAGConsultasMixin, RAGIngestaMixin, RAGProveedoresMixin, RAGHistorialMixin):
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
        from backend.core.estado_global import estado_app
        base_proyecto = estado_app.base_dir
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

        # Índice léxico SQLite FTS5 + BM25 (siempre disponible, sin depender de Ollama)
        self.fts_store = LiraFTSStore(os.path.join(self.db_path, "fts_index.sqlite"))

        # Cliente Ollama (inicialización diferida con Lock)
        self._ollama_lock = threading.Lock()
        self._ollama_inicializado = False
        self._client_ollama: Optional[Any] = None

        # Cliente ChromaDB Persistente (inicialización diferida con Lock)
        self._chroma_lock = threading.Lock()
        self._chroma_inicializado = False
        self.client_chroma: Optional[Any] = None
        self._collection: Optional[Any] = None

    @property
    def client_ollama(self) -> Optional[Any]:
        if not self._ollama_inicializado:
            with self._ollama_lock:
                if not self._ollama_inicializado:
                    _ol = _obtener_ollama()
                    if _ol:
                        try:
                            self._client_ollama = _ol.Client(host=self.host)
                        except Exception as e:
                            logger.warning(f"⚠️ [RAG] No se pudo inicializar cliente Ollama: {e}")
                    self._ollama_inicializado = True
        return self._client_ollama

    @client_ollama.setter
    def client_ollama(self, valor: Optional[Any]):
        self._client_ollama = valor
        self._ollama_inicializado = True

    @property
    def collection(self) -> Optional[Any]:
        if not self._chroma_inicializado:
            with self._chroma_lock:
                if not self._chroma_inicializado:
                    self._inicializar_chromadb()
                    self._chroma_inicializado = True
        return self._collection

    @collection.setter
    def collection(self, valor: Optional[Any]):
        self._collection = valor
        self._chroma_inicializado = True

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
        _chroma, _Settings = _obtener_chromadb()
        if not _chroma:
            logger.error("❌ [RAG] ChromaDB no está instalado.")
            return

        try:
            os.makedirs(self.db_path, exist_ok=True)
            self.client_chroma = _chroma.PersistentClient(
                path=self.db_path,
                settings=_Settings(anonymized_telemetry=False)
            )
            self._collection = self.client_chroma.get_or_create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"}
            )
            logger.info(f"💾 [RAG] ChromaDB listo en: {self.db_path} (Colección: {self.collection_name})")
        except Exception as e:
            logger.error(f"❌ [RAG] Error al conectar con ChromaDB: {e}")
            self.client_chroma = None
            self._collection = None

    # =========================================================================


# Instancia global accesible desde cualquier parte del backend
rag_global = LiraRAG()
