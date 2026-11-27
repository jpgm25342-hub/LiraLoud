import os

from backend.core.webview_bridge import eel
from backend.core.estado_global import estado_app
from backend.documento.ocr_engine import obtener_palabras_cache_ocr
from backend.estudio.servicios_rpc.comun import _get_rag


# ==========================================
# MÓDULO RAG DE INTELIGENCIA ARTIFICIAL (LIRA AI)
# ==========================================
@eel.expose
def rag_verificar_estado():
    """Retorna el diagnóstico completo de Ollama, modelos y ChromaDB."""
    return _get_rag().verificar_estado_ia()


def _reconstruir_texto_ocr_pagina(doc_path, num_pag):
    """Reconstruye texto crudo por líneas desde la caché OCR de una página escaneada."""
    try:
        palabras_ocr = obtener_palabras_cache_ocr(doc_path, num_pag) or []
        if not palabras_ocr:
            return ""
        palabras_ord = sorted(palabras_ocr, key=lambda w: (w[5], w[6], w[7]))
        lineas_ocr = []
        clave_actual = None
        buf_linea = []
        for w in palabras_ord:
            clave = (w[5], w[6])
            txt_w = str(w[4] or "").strip()
            if not txt_w:
                continue
            if clave != clave_actual and buf_linea:
                lineas_ocr.append(" ".join(buf_linea))
                buf_linea = []
            clave_actual = clave
            buf_linea.append(txt_w)
        if buf_linea:
            lineas_ocr.append(" ".join(buf_linea))
        return "\n".join(lineas_ocr).strip()
    except Exception:
        return ""


@eel.expose
def rag_indexar_documento_actual(dict_activo=None):
    """Extrae texto crudo (sin reemplazos TTS) del PDF abierto y lo ingesta en el RAG híbrido."""
    doc = estado_app.doc
    if not doc:
        return {
            "exito": False,
            "error": "No hay ningún documento PDF abierto en LiraLoud.",
        }

    doc_id = (
        os.path.basename(doc.name) if (doc and doc.name) else "documento_actual"
    )
    todas_paginas_crudas = []
    bloques_paginas_texto = []

    try:
        total_pags = len(doc)
        doc_path = getattr(doc, "name", "") or ""
        for num_pag in range(total_pags):
            pag = doc[num_pag]
            texto_raw_pag = (pag.get_text("text") or "").strip()

            # Respaldo OCR crudo (sin reemplazos TTS) únicamente si la página escaneada no tiene texto nativo
            if not texto_raw_pag and doc_path:
                texto_raw_pag = _reconstruir_texto_ocr_pagina(doc_path, num_pag)

            if not texto_raw_pag:
                continue

            bloques_paginas_texto.append(
                f"--- PÁGINA {num_pag + 1} ---\n{texto_raw_pag}"
            )
            todas_paginas_crudas.append({"pagina": num_pag + 1, "texto": texto_raw_pag})

        if not todas_paginas_crudas and not bloques_paginas_texto:
            return {
                "exito": False,
                "error": "No se encontraron oraciones legibles en el PDF.",
            }

        texto_completo_doc = (
            "\n\n".join(bloques_paginas_texto) if bloques_paginas_texto else None
        )

        res = _get_rag().ingestar_documento(
            doc_id=doc_id,
            lista_oraciones=todas_paginas_crudas,
            limite_chars=1200,
            metadata_extra={"nombre_archivo": doc_id, "total_paginas": total_pags},
            texto_completo=texto_completo_doc,
        )
        _get_rag()._docs_integros = getattr(_get_rag(), "_docs_integros", set())
        _get_rag()._docs_integros.add(doc_id)
        return res
    except Exception as e:
        print(f"❌ [RAG] Error indexando documento: {e}")
        return {"exito": False, "error": str(e)}


@eel.expose
def rag_preguntar(
    pregunta,
    doc_id=None,
    top_k=10,
    modo_salida="trazabilidad",
    contexto_extra="",
    ignorar_pdf=False,
):
    """Consulta semántica y analítica al documento actual con soporte de Doble Modo y Fuentes Modulares."""
    doc = estado_app.doc
    if not doc_id:
        doc_id = (
            os.path.basename(doc.name) if (doc and doc.name) else "documento_actual"
        )

    docs_integros = getattr(_get_rag(), "_docs_integros", set())
    if (
        not ignorar_pdf
        and doc
        and (
            doc_id not in _get_rag().documentos_chunks or doc_id not in docs_integros
        )
    ):
        try:
            rag_indexar_documento_actual()
        except Exception as e:
            print(f"⚠️ [RAG] Auto-indexación preventiva: {e}")

    _get_rag().stream_callback = lambda txt_parcial: eel.recibirStreamIA(
        "chat", txt_parcial
    )()
    try:
        return _get_rag().preguntar_al_documento(
            doc_id=doc_id,
            pregunta=pregunta,
            top_k=int(top_k),
            modo_salida=modo_salida,
            contexto_extra=contexto_extra,
            ignorar_pdf=ignorar_pdf,
        )
    finally:
        _get_rag().stream_callback = None


_ENFOQUES_RESUMEN_RAG = {
    "academico": "academico",
    "resumen": "general",
}

_PLANTILLAS_SOLICITUD_RAG = {
    "conceptos": "conceptos",
    "glosario": "conceptos",
    "conclusiones": "conclusiones",
    "analisis_critico": "analisis_critico",
}


def _despachar_solicitud_rag(
    tipo_solicitud,
    doc_id,
    prompt_personalizado,
    modo_salida,
    contexto_extra,
    ignorar_pdf,
):
    """Despacha la solicitud analítica al método correspondiente del motor RAG."""
    if tipo_solicitud in _ENFOQUES_RESUMEN_RAG:
        return _get_rag().resumir_documento(
            doc_id=doc_id,
            enfoque=_ENFOQUES_RESUMEN_RAG[tipo_solicitud],
            modo_salida=modo_salida,
        )
    if tipo_solicitud in _PLANTILLAS_SOLICITUD_RAG:
        return _get_rag().preguntar_al_documento(
            doc_id=doc_id,
            pregunta="",
            tipo_solicitud=_PLANTILLAS_SOLICITUD_RAG[tipo_solicitud],
            modo_salida=modo_salida,
            contexto_extra=contexto_extra,
            ignorar_pdf=ignorar_pdf,
        )
    if tipo_solicitud == "flashcards":
        prompt_flashcards = (
            "Genera 5 preguntas clave de autoevaluación o estudio con sus respectivas respuestas detalladas basadas exclusivamente en el documento y fuentes provistas.\n"
            "Formato:\n"
            "**Pregunta 1:** [Pregunta clave] `[Pág. X]`\n"
            "**Respuesta 1:** [Respuesta completa y fundamentada]\n"
            "(Continúa con las preguntas 2 a 5)."
        )
        return _get_rag().preguntar_al_documento(
            doc_id=doc_id,
            pregunta=prompt_flashcards,
            top_k=12,
            modo_salida=modo_salida,
            contexto_extra=contexto_extra,
            ignorar_pdf=ignorar_pdf,
        )

    pregunta_final = (
        prompt_personalizado
        if (tipo_solicitud == "personalizado" and prompt_personalizado)
        else str(tipo_solicitud)
    )
    return _get_rag().preguntar_al_documento(
        doc_id=doc_id,
        pregunta=pregunta_final,
        top_k=12,
        tipo_solicitud=(
            "personalizado" if tipo_solicitud == "personalizado" else None
        ),
        modo_salida=modo_salida,
        contexto_extra=contexto_extra,
        ignorar_pdf=ignorar_pdf,
    )


@eel.expose
def rag_ejecutar_solicitud(
    tipo_solicitud,
    doc_id=None,
    prompt_personalizado=None,
    modo_salida="trazabilidad",
    contexto_extra="",
    ignorar_pdf=False,
):
    """Ejecuta tareas analíticas y resúmenes sobre el documento o fuentes modulares."""
    doc = estado_app.doc
    if not doc_id:
        doc_id = (
            os.path.basename(doc.name) if (doc and doc.name) else "documento_actual"
        )

    docs_integros = getattr(_get_rag(), "_docs_integros", set())
    if (
        not ignorar_pdf
        and doc
        and (
            doc_id not in _get_rag().documentos_chunks or doc_id not in docs_integros
        )
    ):
        try:
            rag_indexar_documento_actual()
        except Exception as e:
            print(f"⚠️ [RAG] Auto-indexación preventiva: {e}")

    _get_rag().stream_callback = lambda txt_parcial: eel.recibirStreamIA(
        "solicitud", txt_parcial
    )()
    try:
        return _despachar_solicitud_rag(
            tipo_solicitud=tipo_solicitud,
            doc_id=doc_id,
            prompt_personalizado=prompt_personalizado,
            modo_salida=modo_salida,
            contexto_extra=contexto_extra,
            ignorar_pdf=ignorar_pdf,
        )
    finally:
        _get_rag().stream_callback = None


@eel.expose
def rag_obtener_historial_chat(doc_id=None):
    """Obtiene el historial de conversación persistente guardado para el documento actual."""
    doc = estado_app.doc
    if not doc_id:
        doc_id = (
            os.path.basename(doc.name) if (doc and doc.name) else "documento_actual"
        )
    return {
        "exito": True,
        "doc_id": doc_id,
        "historial": _get_rag().obtener_historial_chat(doc_id),
    }


@eel.expose
def rag_limpiar_historial_chat(doc_id=None):
    """Limpia el historial de conversación del documento actual."""
    doc = estado_app.doc
    if not doc_id:
        doc_id = (
            os.path.basename(doc.name) if (doc and doc.name) else "documento_actual"
        )
    _get_rag().limpiar_historial_chat(doc_id)
    return {"exito": True, "doc_id": doc_id}


@eel.expose
def rag_cambiar_modelos(chat_model=None, embed_model=None):
    """Actualiza los modelos en la instancia global de RAG."""
    if chat_model:
        _get_rag().chat_model = chat_model
    if embed_model:
        _get_rag().embed_model = embed_model
    return {
        "exito": True,
        "chat_model": _get_rag().chat_model,
        "embed_model": _get_rag().embed_model,
    }


@eel.expose
def rag_configurar_proveedor(proveedor, api_key=None, modelo_cloud=None):
    """Configura el proveedor de IA activo (ollama, gemini, groq, openai, deepseek) y sus credenciales locales."""
    return _get_rag().configurar_proveedor(
        proveedor=proveedor, api_key=api_key or "", modelo_cloud=modelo_cloud or ""
    )


@eel.expose
def rag_verificar_conexion_cloud(proveedor, api_key=None, modelo_cloud=None):
    """Verifica la conexión con la API en la nube del proveedor especificado."""
    return _get_rag().verificar_conexion_cloud(
        proveedor=proveedor, api_key=api_key or "", modelo=modelo_cloud or ""
    )


@eel.expose
def rag_obtener_modelos_proveedor(proveedor, api_key=None):
    """Consulta en tiempo real la lista de modelos activos y soportados directamente por la API del proveedor."""
    return _get_rag().obtener_modelos_disponibles(
        proveedor=proveedor, api_key=api_key or ""
    )


@eel.expose
def rag_obtener_estadisticas_tokens(proveedor=None):
    """Retorna las estadísticas en tiempo real del uso y límite de tokens para el proveedor consultado."""
    return _get_rag().obtener_estadisticas_tokens(proveedor=proveedor)


@eel.expose
def rag_sincronizar_tokens_api(proveedor=None, api_key=None):
    """Sincroniza y consulta en tiempo real los límites y tokens consumidos directamente con la API del proveedor."""
    return _get_rag().sincronizar_tokens_api(
        proveedor=proveedor, api_key=api_key or ""
    )


@eel.expose
def rag_contar_tokens_gemini(texto, modelo=None, api_key=None):
    """Calcula el número exacto de tokens usando el endpoint oficial :countTokens de Google Gemini."""
    return _get_rag().contar_tokens_gemini(
        texto=texto, modelo=modelo, api_key=api_key
    )
