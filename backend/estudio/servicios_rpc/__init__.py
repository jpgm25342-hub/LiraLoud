"""
Paquete modular de servicios RPC de estudio, multimedia, traducción, Ollama y RAG.
Reexporta la API pública completa y mantiene retrocompatibilidad con `servicios_rpc.rag_global`.
"""

# Atributo público compatible con patch.object(servicios_rpc, "rag_global", ...) sin cargar RAG al inicio
rag_global = None

from backend.estudio.servicios_rpc.comun import (
    _get_media_control,
    _get_rag,
)
from backend.estudio.servicios_rpc.sistema_media import (
    iniciar_captura_pantalla,
    system_media_play_pause,
    system_media_next,
    system_media_prev,
    system_media_status,
    backend_trigger_duck,
    backend_trigger_unduck,
    set_persistent_duck,
    abrir_enlace_externo,
    abrir_documento_legal,
    ping_heartbeat,
    registrar_log_frontend,
    guardar_texto_libre_disco,
)
from backend.estudio.servicios_rpc.ollama_rpc import (
    buscar_modelos_hf_gguf,
    iniciar_ollama_local,
    obtener_info_hardware_ollama,
    descargar_modelo_ollama,
    cancelar_descarga_ollama,
    pausar_descarga_ollama,
)
from backend.estudio.servicios_rpc.traduccion_busqueda import (
    buscar_texto_avanzado,
    pretraducir_bloque_paginas,
    traducir_texto_backend,
    obtener_catalogo_idiomas_traduccion,
    limpiar_cache_traducciones,
)
from backend.estudio.servicios_rpc.rag_coordenadas import (
    rag_buscar_coordenadas_fuente,
)
from backend.estudio.servicios_rpc.rag_rpc import (
    rag_verificar_estado,
    rag_indexar_documento_actual,
    rag_preguntar,
    rag_ejecutar_solicitud,
    rag_obtener_historial_chat,
    rag_limpiar_historial_chat,
    rag_cambiar_modelos,
    rag_configurar_proveedor,
    rag_verificar_conexion_cloud,
    rag_obtener_modelos_proveedor,
    rag_obtener_estadisticas_tokens,
    rag_sincronizar_tokens_api,
    rag_contar_tokens_gemini,
)

__all__ = [
    "rag_global",
    "_get_media_control",
    "_get_rag",
    "iniciar_captura_pantalla",
    "system_media_play_pause",
    "system_media_next",
    "system_media_prev",
    "system_media_status",
    "backend_trigger_duck",
    "backend_trigger_unduck",
    "set_persistent_duck",
    "abrir_enlace_externo",
    "abrir_documento_legal",
    "ping_heartbeat",
    "registrar_log_frontend",
    "guardar_texto_libre_disco",
    "buscar_modelos_hf_gguf",
    "iniciar_ollama_local",
    "obtener_info_hardware_ollama",
    "descargar_modelo_ollama",
    "cancelar_descarga_ollama",
    "pausar_descarga_ollama",
    "buscar_texto_avanzado",
    "pretraducir_bloque_paginas",
    "traducir_texto_backend",
    "obtener_catalogo_idiomas_traduccion",
    "limpiar_cache_traducciones",
    "rag_buscar_coordenadas_fuente",
    "rag_verificar_estado",
    "rag_indexar_documento_actual",
    "rag_preguntar",
    "rag_ejecutar_solicitud",
    "rag_obtener_historial_chat",
    "rag_limpiar_historial_chat",
    "rag_cambiar_modelos",
    "rag_configurar_proveedor",
    "rag_verificar_conexion_cloud",
    "rag_obtener_modelos_proveedor",
    "rag_obtener_estadisticas_tokens",
    "rag_sincronizar_tokens_api",
    "rag_contar_tokens_gemini",
]
