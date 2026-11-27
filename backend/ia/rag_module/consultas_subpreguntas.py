import json
import os
import re
import asyncio
from typing import List, Dict, Any, Optional

from backend.ia.llm_providers import LLMProviderFactory
from backend.ia.rag_module.comun import logger


class RAGConsultasSubpreguntasMixin:
    """Sub-preguntas concurrentes, recuperación por sección, normalización [F#] y síntesis fluida."""

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

    @staticmethod
    def _normalizar_citas_f(texto: str) -> str:
        """
        Expande citas agrupadas como `[F3, F4, F5, F6]`, `[F3, 4, 5]` o `[F3-F5]`
        en etiquetas individuales `[F3] [F4] [F5] [F6]` para garantizar trazabilidad 1:1.
        """
        if not texto:
            return ""

        def _expandir_match(match):
            cuerpo = match.group(1)
            partes = re.split(r"[,;/]+", cuerpo)
            nums: List[int] = []
            for parte in partes:
                p = parte.strip()
                if not p:
                    continue
                m_rango = re.match(r"^[fF]?\s*(\d+)\s*-\s*[fF]?\s*(\d+)$", p)
                if m_rango:
                    a, b = int(m_rango.group(1)), int(m_rango.group(2))
                    if a <= b and (b - a) <= 20:
                        for n in range(a, b + 1):
                            if n not in nums:
                                nums.append(n)
                    else:
                        for n in (a, b):
                            if n not in nums:
                                nums.append(n)
                else:
                    m_num = re.match(r"^[fF]?\s*(\d+)$", p)
                    if m_num:
                        n = int(m_num.group(1))
                        if n not in nums:
                            nums.append(n)
            if not nums:
                return match.group(0)
            return " ".join(f"[F{n}]" for n in nums)

        return re.sub(
            r"\[\s*[fF]\s*(\d+(?:\s*(?:[-,;/])\s*[fF]?\s*\d+)+)\s*\]",
            _expandir_match,
            str(texto),
        )

    async def _sintetizar_prosa_fluida_async(
        self,
        secciones: List[Dict[str, Any]],
        pregunta_original: str,
        temperatura: float = 0.2
    ) -> str:
        """
        Modo 2: Nodo de Ensamble y Síntesis que fusiona las secciones aisladas en un texto continuo,
        coherente y fluido conservando intactas las etiquetas de trazabilidad inline `[F#]`.
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
            "2. Preservar citas verificadas `[F#]`: CONSERVA intactas las etiquetas `[F1]` `[F2]`, etc. al final de cada afirmación o dato clave que provenga de los apartados originales. Escribe SIEMPRE cada etiqueta por separado (`[F1] [F2]`, NUNCA agrupadas como `[F1, F2]`). NO cambies los números ni inventes etiquetas `[F#]` nuevas.\n"
            "3. Fidelidad Temática: No agregues información inventada que no figure en los apartados originales.\n"
            "4. Estructura Limpia: Utiliza subtítulos claros si facilitan la lectura del informe."
        )

        user_prompt_sintesis = (
            f"SOLICITUD INICIAL DEL USUARIO:\n\"{pregunta_original}\"\n\n"
            f"APARTADOS EXTRAÍDOS DEL DOCUMENTO (con citas `[F#]` ya mapeadas):\n\"\"\"\n{bloque_insumos}\n\"\"\"\n\n"
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

    @staticmethod
    def _formatear_candidatos_subpregunta(candidatos: List[Dict[str, Any]]) -> tuple:
        """Formatea candidatos recuperados en bloque de contexto textual y lista de fuentes."""
        sub_fuentes = []
        contextos_formateados = []
        for d_idx, item in enumerate(candidatos, start=1):
            p_ini = int(item.get("pagina_inicio", 1) or 1)
            p_fin = int(item.get("pagina_fin", p_ini) or p_ini)
            p_tag = f"Pág. {p_ini}" if p_ini == p_fin else f"Págs. {p_ini}-{p_fin}"
            texto_puro = str(item.get("texto_puro") or "").strip()
            texto_fmt = str(item.get("texto") or f"[{p_tag}]\n{texto_puro}")
            if not texto_puro:
                texto_puro = re.sub(r"^\[(?:Pág\.|Págs\.)[^\]]*\]\s*", "", texto_fmt).strip()
            texto_por_pag = item.get("texto_por_pagina") or {str(p_ini): texto_puro}

            contextos_formateados.append(f"[F{d_idx} | {p_tag}]:\n{texto_puro}")
            sub_fuentes.append({
                "fragmento_num": d_idx,
                "chunk_id": item.get("chunk_id"),
                "pagina": p_ini,
                "pagina_inicio": p_ini,
                "pagina_fin": p_fin,
                "pags_tag": p_tag,
                "texto": texto_fmt,
                "texto_puro": texto_puro,
                "texto_por_pagina": texto_por_pag,
                "metadata": item.get("metadata") or {},
                "distancia": item.get("distancia"),
            })

        bloque_sub_ctx = "\n\n".join(contextos_formateados) if contextos_formateados else "No se encontraron fragmentos específicos."
        return bloque_sub_ctx, sub_fuentes

    def _recuperar_y_formatear_contexto_subpregunta(
        self,
        doc_id: str,
        idx: int,
        preg_text: str,
        chunks_guardados: List[Dict[str, Any]],
        total_subpreguntas: int,
    ) -> tuple:
        """Recupera evidencia híbrida/fallback para una subpregunta y formatea contexto y fuentes."""
        candidatos: List[Dict[str, Any]] = []
        ids_vistos = set()

        def _agregar_chunks_guardados(chunks_slice: List[Dict[str, Any]], distancia: float) -> None:
            for c in chunks_slice:
                cid = str(c.get("chunk_id") or f"{doc_id}_c{c.get('chunk_idx', 0)}")
                if cid in ids_vistos:
                    continue
                ids_vistos.add(cid)
                chunk_idx = int(c.get("chunk_idx", 0))
                pag_ini = int(c.get("pagina_inicio", 1))
                pag_fin = int(c.get("pagina_fin", pag_ini))
                candidatos.append({
                    "chunk_id": cid,
                    "chunk_idx": chunk_idx,
                    "pagina_inicio": pag_ini,
                    "pagina_fin": pag_fin,
                    "texto": c.get("texto", ""),
                    "texto_puro": c.get("texto_puro") or c.get("texto_crudo", ""),
                    "texto_por_pagina": c.get("texto_por_pagina") or {},
                    "metadata": {
                        "chunk_id": cid,
                        "chunk_idx": chunk_idx,
                        "pagina_inicio": pag_ini,
                        "pagina_fin": pag_fin,
                    },
                    "distancia": distancia,
                })

        # 1. En la primera subpregunta (idx == 0) inyectar portada/primeras páginas para autores y título
        if idx == 0 and chunks_guardados:
            _agregar_chunks_guardados(chunks_guardados[:2], 0.1)

        # 2. Recuperación híbrida (BM25 + ChromaDB opcional + RRF)
        hits_hibridos = self._recuperar_fragmentos_hibrido(doc_id, preg_text, top_k=6)
        for h in hits_hibridos:
            cid = str(h.get("chunk_id") or f"{doc_id}_c{h.get('chunk_idx', 0)}")
            if cid not in ids_vistos:
                ids_vistos.add(cid)
                candidatos.append(h)

        # 3. Fallback solo si no hubo ningún resultado híbrido
        if not candidatos and chunks_guardados:
            offset = (idx * len(chunks_guardados)) // max(total_subpreguntas, 1)
            _agregar_chunks_guardados(chunks_guardados[offset : offset + 3], 0.4)

        return self._formatear_candidatos_subpregunta(candidatos)

    async def _resolver_subpregunta_async(
        self,
        doc_id: str,
        idx: int,
        sub: Dict[str, str],
        chunks_guardados: List[Dict[str, Any]],
        nombre_doc_limpio: str,
        total_subpreguntas: int,
        temperatura: float = 0.2,
        cb_sec=None,
    ) -> Dict[str, Any]:
        """Recupera evidencia híbrida y genera la respuesta trazable para una subpregunta."""
        titulo = sub.get("titulo", f"Sección {idx + 1}")
        preg_text = sub.get("pregunta", "")

        bloque_sub_ctx, sub_fuentes = self._recuperar_y_formatear_contexto_subpregunta(
            doc_id, idx, preg_text, chunks_guardados, total_subpreguntas
        )

        if idx == 0:
            system_sub = (
                "Eres LiraAI, un asistente experto de análisis, lectura e investigación documental.\n"
                "Tu misión es responder con profundidad, claridad y rigor a la PREGUNTA asignada, basándote en los fragmentos del documento provistos.\n\n"
                "REGLAS:\n"
                "1. Responde de forma directa, limpia y bien estructurada a la pregunta.\n"
                "2. Identifica con exactitud el título del documento/obra, sus autores y el tema o premisa principal a partir de los fragmentos provistos o del nombre del archivo.\n"
                "3. Trazabilidad obligatoria: Inserta la etiqueta corta `[F1]` `[F2]`, etc. al final de cada afirmación o dato clave según el fragmento exacto que lo respalda. Cita SIEMPRE cada fragmento por separado (`[F1] [F2]`, nunca agrupado como `[F1, F2]`). No inventes números de fragmento que no existan.\n"
                "4. No agregues encabezados introductorios vacíos (como 'Respuesta directa:'). Ve directo al contenido."
            )
        else:
            system_sub = (
                "Eres LiraAI, un asistente experto de análisis, lectura e investigación documental.\n"
                "Tu misión es responder con profundidad, claridad y rigor a la PREGUNTA asignada, basándote exclusivamente en los fragmentos del documento provistos.\n\n"
                "REGLAS ESTRICTAS:\n"
                "1. CÉNTRATE EXCLUSIVAMENTE en responder la pregunta de esta sección. Ve DIRECTO al tema solicitado.\n"
                "2. NO repitas el título del libro/documento, ni los autores, traductores o fichas bibliográficas (eso ya fue respondido en la primera sección).\n"
                "3. Trazabilidad obligatoria: Inserta la etiqueta corta `[F1]` `[F2]`, etc. al final de cada afirmación o dato clave según el fragmento exacto que lo respalda. Cita SIEMPRE cada fragmento por separado (`[F1] [F2]`, nunca agrupado como `[F1, F2]`). No inventes números de fragmento que no existan.\n"
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
            error_llm = None
        except Exception as e:
            logger.error(f"❌ [RAG SubQ {idx+1}] Error generando respuesta: {e}")
            txt_resp = f"*(No se pudo generar respuesta para este apartado: {e})*"
            error_llm = str(e)

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
            "fuentes": sub_fuentes,
            "error_llm": error_llm,
        }

    def _recolectar_fuentes_y_citas_secciones(
        self,
        secciones: List[Dict[str, Any]],
        clave_fn,
    ) -> tuple:
        """Normaliza citas [F#] por sección y recolecta fuentes únicas, citadas y mapas locales."""
        todas_fuentes_unicas: Dict[str, Dict[str, Any]] = {}
        orden_todas: List[str] = []
        claves_citadas_orden: List[str] = []
        claves_citadas_set = set()
        mapas_locales: List[tuple] = []

        for sec in secciones:
            # Normalizar citas agrupadas ([F1, F2, F3], [F1-F3], etc.) antes de extraer y remapear
            sec["respuesta"] = self._normalizar_citas_f(sec.get("respuesta", ""))
            f_sec = sec.get("fuentes", [])
            mapa_local = {int(f["fragmento_num"]): f for f in f_sec if f.get("fragmento_num")}
            mapas_locales.append((f_sec, mapa_local))
            for f in f_sec:
                ck = clave_fn(f)
                if ck and ck not in todas_fuentes_unicas:
                    todas_fuentes_unicas[ck] = dict(f)
                    orden_todas.append(ck)

            # Detectar citas reales [F#] emitidas por el LLM en esta sección
            for m_num in re.findall(r'\[F(\d+)\]', sec.get("respuesta", "")):
                num_loc = int(m_num)
                if num_loc in mapa_local:
                    ck = clave_fn(mapa_local[num_loc])
                    if ck and ck not in claves_citadas_set:
                        claves_citadas_set.add(ck)
                        claves_citadas_orden.append(ck)

        claves_finales = claves_citadas_orden if claves_citadas_orden else orden_todas
        return todas_fuentes_unicas, claves_finales, mapas_locales

    def _consolidar_y_remapear_fuentes_subpreguntas(
        self,
        secciones: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Deduplica fuentes entre subpreguntas y remapea etiquetas locales [F#] a numeración global."""
        def _clave_fuente(f: Dict[str, Any]) -> str:
            if f.get("chunk_id"):
                return str(f["chunk_id"])
            return str(f.get("texto_puro") or f.get("texto") or "")[:120]

        todas_fuentes_unicas, claves_finales, mapas_locales = (
            self._recolectar_fuentes_y_citas_secciones(secciones, _clave_fuente)
        )

        clave_a_global_num: Dict[str, int] = {}
        fuentes_consolidadas: List[Dict[str, Any]] = []
        for idx_g, ck in enumerate(claves_finales, start=1):
            f_copy = dict(todas_fuentes_unicas[ck])
            f_copy["fragmento_num"] = idx_g
            fuentes_consolidadas.append(f_copy)
            clave_a_global_num[ck] = idx_g

        # Reescribir etiquetas [F<local>] -> [F<global>] en cada sección
        for sec, (f_sec, mapa_local) in zip(secciones, mapas_locales):
            citas_globales_sec: List[int] = []

            def _reemplazar_f(match):
                num_loc = int(match.group(1))
                f_loc = mapa_local.get(num_loc)
                if not f_loc:
                    return ""
                ck = _clave_fuente(f_loc)
                g_num = clave_a_global_num.get(ck)
                if not g_num:
                    return ""
                if g_num not in citas_globales_sec:
                    citas_globales_sec.append(g_num)
                return f"[F{g_num}]"

            sec["respuesta"] = re.sub(r'\[F(\d+)\]', _reemplazar_f, sec.get("respuesta", "")).strip()
            if citas_globales_sec:
                sec["fuentes_globales_nums"] = citas_globales_sec
            else:
                # Respaldo seguro si esta sección no emitió [F#]
                sec["fuentes_globales_nums"] = [
                    clave_a_global_num[_clave_fuente(f)]
                    for f in f_sec
                    if _clave_fuente(f) in clave_a_global_num
                ]

        return fuentes_consolidadas

    async def _ensamblar_respuesta_subpreguntas_async(
        self,
        secciones: List[Dict[str, Any]],
        fuentes_consolidadas: List[Dict[str, Any]],
        modo_salida: str,
        pregunta_original: str,
        temperatura: float,
        prov: str,
    ) -> Dict[str, Any]:
        """Ensambla la salida final en modo prosa fluida o tarjetas de trazabilidad 1:1."""
        if modo_salida == "prosa":
            logger.info(f"📝 [RAG Dual Mode] Ensamblando Modo 2 (Prosa Fluida) para {len(secciones)} secciones...")
            respuesta_final = await self._sintetizar_prosa_fluida_async(
                secciones=secciones,
                pregunta_original=pregunta_original or "Resumen integral del documento",
                temperatura=temperatura
            )
            respuesta_final = self._normalizar_citas_f(respuesta_final)
            respuesta_final = re.sub(r'\s*\[(?:Pág\.|Página|Págs\.|Pag\.|Pagina)\s*[xX]\s*\]', '', respuesta_final)
            if fuentes_consolidadas:
                refs_globales = ", ".join(f"[F{fc['fragmento_num']}]" for fc in fuentes_consolidadas if fc.get("fragmento_num"))
                if refs_globales:
                    respuesta_final = f"{respuesta_final}\n\n---\n\n> *📍 Fuentes verificadas: {refs_globales}*"
            modo_final = "prosa"
        else:
            logger.info(f"📑 [RAG Dual Mode] Estructurando Modo 1 (Trazabilidad 1:1) con {len(secciones)} tarjetas...")
            bloques_markdown = []
            for sec in secciones:
                tit = sec["titulo"]
                preg = sec.get("pregunta", "")
                resp = sec["respuesta"]
                nums_sec = sec.get("fuentes_globales_nums") or []
                refs_sec = []
                for g_num in nums_sec:
                    tag_ref = f"[F{g_num}]"
                    if tag_ref not in refs_sec:
                        refs_sec.append(tag_ref)
                pags_str = ", ".join(refs_sec) if refs_sec else "General"

                bloques_markdown.append(
                    f"### 📑 {sec['idx']}. {tit}\n"
                    f"> ❓ **Pregunta:** *{preg}*\n\n"
                    f"{resp}\n\n"
                    f"> *📍 Fuentes verificadas: {pags_str}*"
                )
            respuesta_final = "\n\n---\n\n".join(bloques_markdown)
            modo_final = "trazabilidad"

        return {
            "exito": True,
            "respuesta": respuesta_final,
            "modo": modo_final,
            "secciones": secciones,
            "fuentes": fuentes_consolidadas,
            "total_fuentes": len(fuentes_consolidadas),
            "proveedor": prov,
            "token_stats": self.obtener_estadisticas_tokens(prov),
        }

    async def _ejecutar_subpreguntas_concurrente_async(
        self,
        doc_id: str,
        subpreguntas: List[Dict[str, str]],
        modo_salida: str = "trazabilidad",
        temperatura: float = 0.2,
        pregunta_original: str = ""
    ) -> Dict[str, Any]:
        """
        Ejecuta las sub-preguntas de forma concurrente usando recuperación híbrida
        (SQLite FTS5 BM25 + ChromaDB opcional + RRF), trazabilidad verificada `[F#]`
        y doble modo de salida (`trazabilidad` / `prosa`).
        """
        prov = getattr(self, "proveedor_activo", "ollama").lower()
        self._asegurar_documento_en_memoria(doc_id)
        chunks_guardados = self.documentos_chunks.get(doc_id, [])
        nombre_doc_limpio = os.path.splitext(os.path.basename(doc_id))[0].replace('_', ' ')
        total_subpreguntas = len(subpreguntas)

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
                sec_res = await self._resolver_subpregunta_async(
                    doc_id=doc_id,
                    idx=i,
                    sub=s,
                    chunks_guardados=chunks_guardados,
                    nombre_doc_limpio=nombre_doc_limpio,
                    total_subpreguntas=total_subpreguntas,
                    temperatura=temperatura,
                    cb_sec=_cb_parcial,
                )
                secciones.append(sec_res)
                bloques_previos.append(f"{encabezado_sec}{sec_res['respuesta']}")
        else:
            tareas = [
                self._resolver_subpregunta_async(
                    doc_id=doc_id,
                    idx=i,
                    sub=s,
                    chunks_guardados=chunks_guardados,
                    nombre_doc_limpio=nombre_doc_limpio,
                    total_subpreguntas=total_subpreguntas,
                    temperatura=temperatura,
                )
                for i, s in enumerate(subpreguntas)
            ]
            secciones = await asyncio.gather(*tareas)

        # Si todas las subpreguntas fallaron en el LLM, propagar fallo sin guardar historial huérfano
        if secciones and all(s.get("error_llm") for s in secciones):
            primer_err = secciones[0].get("error_llm", "Error desconocido en LLM")
            return {
                "exito": False,
                "error": f"Error al generar respuesta ({prov.upper()}): {primer_err}",
                "fuentes": [],
                "proveedor": prov,
            }

        # Consolidación global y remapeo de etiquetas [F#] verificadas
        fuentes_consolidadas = self._consolidar_y_remapear_fuentes_subpreguntas(secciones)
        return await self._ensamblar_respuesta_subpreguntas_async(
            secciones=secciones,
            fuentes_consolidadas=fuentes_consolidadas,
            modo_salida=modo_salida,
            pregunta_original=pregunta_original,
            temperatura=temperatura,
            prov=prov,
        )
