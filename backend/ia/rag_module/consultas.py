import os
import sys
import json
import re
import asyncio
import concurrent.futures
from typing import List, Dict, Any, Optional

from backend.ia.rag_module.comun import (
    LLMProviderFactory,
    PLANTILLAS_SUBPREGUNTAS,
    run_async_safely,
    logger,
)


from backend.ia.rag_module.consultas_subpreguntas import RAGConsultasSubpreguntasMixin


class RAGConsultasMixin(RAGConsultasSubpreguntasMixin):
    """Enrutador Fase 0, sub-preguntas concurrentes, normalización [F#] y doble modo de salida."""

    # 5. ENRUTADOR FASE 0, SUB-PREGUNTAS Y DOBLE MODO DE SALIDA
    # =========================================================================
    _REGLAS_PLANTILLA_KEYWORDS = (
        # Evaluar "academico" ANTES de "resumen" para que "resumen académico" no sea absorbido por "resumen"
        ("academico", (
            "resumen academico", "resumen académico", "sintesis academica", "síntesis académica",
            "articulo academico", "artículo académico", "cientifico", "científico",
        )),
        ("resumen", (
            "resumen", "resumir", "de que trata", "de qué trata", "sobre que trata", "sobre qué trata",
            "de que va", "de qué va", "explica el documento", "explicame el documento", "explícame el documento",
            "puntos principales", "puntos clave", "de que habla", "de qué habla",
        )),
        ("conceptos", (
            "glosario", "conceptos clave", "terminos tecnicos", "términos técnicos",
            "abreviaturas", "definiciones", "conceptos",
        )),
        ("conclusiones", (
            "conclusiones principales", "conclusiones del estudio", "extraer conclusiones",
            "conclusiones", "hallazgos principales",
        )),
        ("analisis_critico", (
            "analisis critico", "análisis crítico", "fortalezas y limitaciones", "critica", "crítica",
        )),
    )

    def _enrutar_consulta(self, pregunta: str, tipo_solicitud: Optional[str] = None) -> tuple:
        """
        Fase 0: Enrutador de Complejidad.
        - Vía 1: Plantillas Predefinidas (Académico, Resumen, Conclusiones, Glosario, Análisis Crítico).
        - Vía 2: Desglose Dinámico con Structured Output (prompts libres largos > 180 chars o con múltiples intenciones).
        - Vía 3: Pase Directo (preguntas cortas / puntuales <= 180 chars).
        """
        # Vía 1: Solicitudes con plantilla explícita
        if tipo_solicitud and str(tipo_solicitud).lower() in PLANTILLAS_SUBPREGUNTAS:
            return ("via_1", PLANTILLAS_SUBPREGUNTAS[str(tipo_solicitud).lower()])

        preg_norm = (pregunta or "").strip().lower()
        if not preg_norm:
            return ("via_1", PLANTILLAS_SUBPREGUNTAS["resumen"])

        for clave_plantilla, keywords in self._REGLAS_PLANTILLA_KEYWORDS:
            if any(kw in preg_norm for kw in keywords):
                return ("via_1", PLANTILLAS_SUBPREGUNTAS[clave_plantilla])

        # Vía 2: Desglose Dinámico para preguntas libres extensas (> 180 caracteres)
        if len(pregunta.strip()) > 180 or ("?" in pregunta and pregunta.count("?") >= 2):
            return ("via_2", None)

        # Vía 3: Pase Directo para preguntas puntuales / cortas
        return ("via_3", None)

    async def _responder_solo_fuentes_usuario_async(
        self,
        doc_id: str,
        pregunta: str,
        prov: str,
        temperatura: float,
        system_prompt_custom: Optional[str],
        tipo_solicitud: Optional[str],
        contexto_extra: str,
    ) -> Dict[str, Any]:
        """Responde de forma directa usando únicamente los apuntes y subrayados del usuario (ignorar_pdf=True)."""
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

        try:
            texto_limpio = await self._generar_respuesta_llm_async(
                system_prompt=system_prompt,
                mensajes_previos=mensajes_contexto_previo,
                user_prompt=user_prompt_actual,
                temperatura=temperatura
            )
            self.agregar_mensaje_chat(doc_id=doc_id, role="user", texto=pregunta)
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

    @staticmethod
    def _formatear_hits_a_contexto_y_fuentes(hits: List[Dict[str, Any]]):
        """Formatea una lista de fragmentos recuperados en bloque [F#] y su lista estructurada de fuentes."""
        contextos_formateados = []
        fuentes = []
        for idx, item in enumerate(hits, start=1):
            pag_ini = int(item.get("pagina_inicio", 1) or 1)
            pag_fin = int(item.get("pagina_fin", pag_ini) or pag_ini)
            pags_tag = f"Pág. {pag_ini}" if pag_ini == pag_fin else f"Págs. {pag_ini}-{pag_fin}"
            t_puro = str(item.get("texto_puro") or "").strip()
            t_fmt = str(item.get("texto") or f"[{pags_tag}]\n{t_puro}")
            if not t_puro:
                t_puro = re.sub(r"^\[(?:Pág\.|Págs\.)[^\]]*\]\s*", "", t_fmt).strip()
            t_por_pag = item.get("texto_por_pagina") or {str(pag_ini): t_puro}

            contextos_formateados.append(f"[F{idx} | {pags_tag}]:\n{t_puro}")
            fuentes.append({
                "fragmento_num": idx,
                "chunk_id": item.get("chunk_id"),
                "pagina": pag_ini,
                "pagina_inicio": pag_ini,
                "pagina_fin": pag_fin,
                "pags_tag": pags_tag,
                "texto": t_fmt,
                "texto_puro": t_puro,
                "texto_por_pagina": t_por_pag,
                "metadata": item.get("metadata") or {},
                "distancia": item.get("distancia")
            })
        return "\n\n".join(contextos_formateados), fuentes

    @staticmethod
    def _construir_hits_fallback_via3(
        doc_id: str, chunks_guardados: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Construye hits de respaldo con los primeros chunks cuando la recuperación híbrida no devuelve resultados."""
        hits: List[Dict[str, Any]] = []
        for c in chunks_guardados[:10]:
            hits.append({
                "chunk_id": c.get("chunk_id") or f"{doc_id}_c{c.get('chunk_idx', 0)}",
                "chunk_idx": int(c.get("chunk_idx", 0)),
                "pagina_inicio": int(c.get("pagina_inicio", 1)),
                "pagina_fin": int(c.get("pagina_fin", c.get("pagina_inicio", 1))),
                "texto": c.get("texto", ""),
                "texto_puro": c.get("texto_puro") or c.get("texto_crudo", ""),
                "texto_por_pagina": c.get("texto_por_pagina") or {},
                "metadata": {
                    "pagina_inicio": c.get("pagina_inicio", 1),
                    "pagina_fin": c.get("pagina_fin", 1),
                    "chunk_idx": c.get("chunk_idx", 0),
                },
                "distancia": 0.5,
            })
        return hits

    @staticmethod
    def _finalizar_bloque_contexto_via3(bloque_contexto: str, contexto_extra: str, prov: str) -> str:
        """Inyecta apuntes adicionales del usuario y ajusta la longitud de contexto para Ollama."""
        if contexto_extra and contexto_extra.strip():
            bloque_contexto = (
                f"--- APUNTES Y SUBRAYADOS DEL USUARIO ---\n{contexto_extra.strip()}\n\n"
                f"--- FRAGMENTOS DEL DOCUMENTO PDF ---\n{bloque_contexto}"
            )
        if prov == "ollama" and len(bloque_contexto) > 16000:
            bloque_contexto = (
                bloque_contexto[:16000]
                + "\n\n[... contexto truncado para ajustar ventana de contexto ...]"
            )
        return bloque_contexto

    def _construir_contexto_via3(
        self,
        doc_id: str,
        pregunta: str,
        top_k: int,
        prov: str,
        contexto_extra: str = "",
    ):
        """Construye el bloque de contexto y lista de fuentes para VÍA 3 (bypass completo o recuperación híbrida)."""
        self._asegurar_documento_en_memoria(doc_id)
        texto_completo = self.documentos_texto.get(doc_id, "")
        chunks_guardados = self.documentos_chunks.get(doc_id, [])

        fuentes = []
        bloque_contexto = ""
        usando_bypass_completo = False

        limites_bypass = {
            "gemini": 500_000,
            "openai": 120_000,
            "deepseek": 120_000,
            "openrouter": 120_000,
            "groq": 24_000,
            "ollama": 16_000,
        }
        limite_contexto = limites_bypass.get(prov, 16_000)

        if texto_completo and len(texto_completo) <= limite_contexto:
            usando_bypass_completo = True
            bloque_contexto = texto_completo
            fuentes = [{
                "fragmento_num": 1,
                "pagina": 1,
                "pagina_inicio": 1,
                "pagina_fin": max((int(c.get("pagina_fin", 1) or 1) for c in chunks_guardados), default=1),
                "texto": f"Documento completo estructurado ({len(texto_completo)} caracteres)",
                "texto_puro": "",
                "texto_por_pagina": {},
                "metadata": {"modo": "contexto_completo_documento"}
            }]
        else:
            cant_a_pedir = min(max(top_k, 8), 15)
            hits_hibridos = self._recuperar_fragmentos_hibrido(doc_id, pregunta, top_k=cant_a_pedir)

            if not hits_hibridos and chunks_guardados:
                # Fallback solo si BM25 y ChromaDB devolvieron 0 resultados
                hits_hibridos = self._construir_hits_fallback_via3(doc_id, chunks_guardados)

            if not hits_hibridos and not chunks_guardados and not texto_completo:
                if not contexto_extra:
                    return "", [], False, {
                        "exito": True,
                        "respuesta": "No se encontró información para este documento. Por favor asegúrate de abrir un archivo PDF.",
                        "fuentes": []
                    }

            bloque_contexto, fuentes = self._formatear_hits_a_contexto_y_fuentes(hits_hibridos)

        bloque_contexto = self._finalizar_bloque_contexto_via3(bloque_contexto, contexto_extra, prov)
        return bloque_contexto, fuentes, usando_bypass_completo, None

    def _filtrar_y_remapear_fuentes_via3(
        self,
        texto_limpio: str,
        fuentes: List[Dict[str, Any]],
        usando_bypass_completo: bool,
    ):
        """Normaliza citas [F#], filtra las fuentes efectivamente citadas y las remapea desde [F1]."""
        fuentes_finales = fuentes
        if not usando_bypass_completo and fuentes:
            texto_limpio = self._normalizar_citas_f(texto_limpio)
            mapa_f = {int(f["fragmento_num"]): f for f in fuentes if f.get("fragmento_num")}
            citados_orden = []
            for m_num in re.findall(r'\[F(\d+)\]', texto_limpio):
                n = int(m_num)
                if n in mapa_f and n not in citados_orden:
                    citados_orden.append(n)
            if citados_orden:
                remap = {old_n: new_n for new_n, old_n in enumerate(citados_orden, start=1)}
                fuentes_finales = []
                for old_n in citados_orden:
                    f_copy = dict(mapa_f[old_n])
                    f_copy["fragmento_num"] = remap[old_n]
                    fuentes_finales.append(f_copy)
                texto_limpio = re.sub(
                    r'\[F(\d+)\]',
                    lambda m: f"[F{remap[int(m.group(1))]}]" if int(m.group(1)) in remap else "",
                    texto_limpio
                ).strip()
        return texto_limpio, fuentes_finales

    async def _intentar_vias_subpreguntas_async(
        self,
        doc_id: str,
        pregunta: str,
        tipo_solicitud: Optional[str],
        modo_salida: str,
        temperatura: float,
    ) -> Optional[Dict[str, Any]]:
        """Enruta la consulta y ejecuta Vía 1 (plantilla) o Vía 2 (desglose), o retorna None para Vía 3."""
        if tipo_solicitud == "personalizado":
            via, plantilla = ("via_2", None) if (modo_salida == "trazabilidad" or len(pregunta.strip()) > 180) else ("via_3", None)
        else:
            via, plantilla = self._enrutar_consulta(pregunta, tipo_solicitud)
        logger.info(f"🚦 [RAG Enrutador] Consulta dirigida por: {via.upper()} (Modo: {modo_salida})")

        subpreguntas = None
        texto_usuario = pregunta
        if via == "via_1" and plantilla:
            subpreguntas = plantilla.get("subpreguntas", [])
            texto_usuario = pregunta or plantilla.get("nombre", "")
        elif via == "via_2":
            cand = await self._desglosar_consulta_compleja_async(pregunta)
            if len(cand) >= 2:
                subpreguntas = cand

        if subpreguntas is None:
            return None

        resultado = await self._ejecutar_subpreguntas_concurrente_async(
            doc_id=doc_id,
            subpreguntas=subpreguntas,
            modo_salida=modo_salida,
            temperatura=temperatura,
            pregunta_original=texto_usuario,
        )
        if resultado.get("exito"):
            self.agregar_mensaje_chat(doc_id=doc_id, role="user", texto=texto_usuario)
            self.agregar_mensaje_chat(doc_id=doc_id, role="ai", texto=resultado["respuesta"], fuentes=resultado.get("fuentes", []))
        return resultado

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
            return await self._responder_solo_fuentes_usuario_async(
                doc_id=doc_id,
                pregunta=pregunta,
                prov=prov,
                temperatura=temperatura,
                system_prompt_custom=system_prompt_custom,
                tipo_solicitud=tipo_solicitud,
                contexto_extra=contexto_extra,
            )

        resultado_vias = await self._intentar_vias_subpreguntas_async(
            doc_id=doc_id,
            pregunta=pregunta,
            tipo_solicitud=tipo_solicitud,
            modo_salida=modo_salida,
            temperatura=temperatura,
        )
        if resultado_vias is not None:
            return resultado_vias

        # 3. VÍA 3: Pase Directo Tradicional (1 Paso)
        bloque_contexto, fuentes, usando_bypass_completo, respuesta_vacia = self._construir_contexto_via3(
            doc_id=doc_id,
            pregunta=pregunta,
            top_k=top_k,
            prov=prov,
            contexto_extra=contexto_extra,
        )
        if respuesta_vacia is not None:
            return respuesta_vacia

        if usando_bypass_completo:
            regla_citas = "2. Citas de Páginas Interactivas: Añade al final de cada afirmación clave la cita en formato `[Pág. X]` según los separadores `--- PÁGINA X ---` del documento."
        else:
            regla_citas = "2. Trazabilidad obligatoria: Añade al final de cada afirmación clave la etiqueta corta `[F1]` `[F2]`, etc. correspondiente al fragmento exacto que respalda ese dato. Cita SIEMPRE cada fragmento por separado (`[F1] [F2]`, nunca agrupado como `[F1, F2]`). No inventes números de fragmento."

        system_prompt_default = (
            "Eres LiraAI, un asistente experto y riguroso de lectura, investigación y análisis de documentos y literatura científica.\n"
            "Tu tarea es responder con la más estricta veracidad y precisión basándote en el contexto del documento y en los apuntes/subrayados provistos.\n\n"
            "DIRECTRICES GENERALES DE RESPUESTA:\n"
            "1. Fidelidad estricta al usuario: Responde DIRECTA y PRECISAMENTE a lo que el usuario pregunte.\n"
            f"{regla_citas}\n"
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

        try:
            texto_limpio = await self._generar_respuesta_llm_async(
                system_prompt=system_prompt,
                mensajes_previos=mensajes_contexto_previo,
                user_prompt=user_prompt_actual,
                temperatura=temperatura
            )

            # En modo híbrido de Vía 3, normalizar citas agrupadas y filtrar/remapear fuentes según [F#] citadas realmente
            texto_limpio, fuentes_finales = self._filtrar_y_remapear_fuentes_via3(
                texto_limpio, fuentes, usando_bypass_completo
            )

            # Persistir el par (user, ai) SOLO tras éxito del LLM
            self.agregar_mensaje_chat(doc_id=doc_id, role="user", texto=pregunta)
            self.agregar_mensaje_chat(
                doc_id=doc_id,
                role="ai",
                texto=texto_limpio,
                fuentes=fuentes_finales
            )

            return {
                "exito": True,
                "respuesta": texto_limpio,
                "fuentes": fuentes_finales,
                "total_fuentes": len(fuentes_finales),
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
