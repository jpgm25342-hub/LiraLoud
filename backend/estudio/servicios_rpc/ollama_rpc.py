from backend.core.webview_bridge import eel
from backend.ia.ollama_store import (
    buscar_modelos_hf_gguf as _hf_buscar,
    iniciar_ollama_local as _iniciar_ollama,
    obtener_info_hardware_ollama as _info_hw,
    descargar_modelo_ollama as _descargar_ollama,
    cancelar_descarga_ollama as _cancelar_ollama,
    pausar_descarga_ollama as _pausar_ollama,
)


# ==========================================
# TIENDA OLLAMA / MODELOS HUGGING FACE GGUF
# ==========================================
@eel.expose
def buscar_modelos_hf_gguf(query="", limit=15):
    return _hf_buscar(query, limit)


@eel.expose
def iniciar_ollama_local():
    return _iniciar_ollama()


@eel.expose
def obtener_info_hardware_ollama():
    return _info_hw()


@eel.expose
def descargar_modelo_ollama(nombre_modelo):
    return _descargar_ollama(
        nombre_modelo,
        lambda n, pct, st, comp, err: eel.actualizarProgresoOllama(
            n, pct, st, comp, err
        )(),
    )


@eel.expose
def cancelar_descarga_ollama(nombre_modelo):
    return _cancelar_ollama(nombre_modelo)


@eel.expose
def pausar_descarga_ollama(nombre_modelo):
    return _pausar_ollama(nombre_modelo)
