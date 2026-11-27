import os
import json
import time
from typing import List, Dict, Any, Optional

from backend.ia.rag_module.comun import logger


class RAGHistorialMixin:
    """Persistencia de historial de chat y ventana de contexto por documento."""

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

