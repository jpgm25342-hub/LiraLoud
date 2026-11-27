import os
import re
from typing import List, Dict, Any, Optional, Union

from backend.ia.rag_module.comun import (
    ABREVIATURAS_CIENTIFICAS,
    logger,
)


class RAGIngestaMixin:
    """Chunking semántico, embeddings, ingesta híbrida (FTS5 + ChromaDB), RRF y limpieza."""

    # 2. AGRUPADOR SEMÁNTICO DINÁMICO CON VENTANA ELÁSTICA Y OVERLAP
    # =========================================================================
    @staticmethod
    def _requiere_continuar_oracion(candidato: str) -> bool:
        """Indica si el candidato termina en abreviatura científica o número/fórmula incompleta."""
        palabras = candidato.split()
        ultima_palabra = palabras[-1].lower() if palabras else ""
        if any(ultima_palabra == ab or ultima_palabra.endswith(ab) for ab in ABREVIATURAS_CIENTIFICAS):
            return True
        return bool(
            re.search(r'\b[a-zA-Z]+\s*[=<>]+\s*\d+\.$', candidato)
            or re.search(r'\b\d+\.$', candidato)
        )

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
            if self._requiere_continuar_oracion(candidato):
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

    def _extraer_unidades_semanticas(
        self,
        lista_items: List[Union[str, Dict[str, Any]]],
        max_umbral: int,
    ) -> List[Dict[str, Any]]:
        """Normaliza los ítems de entrada y los divide en párrafos u oraciones semánticas con página."""
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
                if len(parrafo_limpio) <= max_umbral:
                    unidades.append({"texto": parrafo_limpio, "pagina": p})
                else:
                    # Si el párrafo es extenso, desglosarlo en oraciones semánticas
                    oraciones = self._dividir_en_oraciones_semanticas(parrafo_limpio)
                    for oracion in oraciones:
                        unidades.append({"texto": oracion, "pagina": p})
        return unidades

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

        max_umbral = limite_chars + margen_holgura
        unidades = self._extraer_unidades_semanticas(lista_items, max_umbral)
        if not unidades:
            return []

        chunks: List[Dict[str, Any]] = []
        bloque_actual: List[str] = []
        bloques_por_pagina: Dict[str, List[str]] = {}
        paginas_bloque: set = set()
        ultima_pagina = 1
        chars_acumulados = 0

        def _construir_chunk(idx_c: int, bloque: List[str], pags: set, por_pag: Dict[str, List[str]]) -> Dict[str, Any]:
            p_ini = min(pags) if pags else 1
            p_fin = max(pags) if pags else p_ini
            pags_str = f"Pág. {p_ini}" if p_ini == p_fin else f"Págs. {p_ini}-{p_fin}"
            texto_puro = "\n\n".join(bloque).strip()
            texto_chunk = f"[{pags_str}]\n{texto_puro}"
            mapa_pag = {
                str(k): "\n\n".join(v).strip()
                for k, v in sorted(por_pag.items(), key=lambda kv: int(kv[0]))
                if v
            }
            return {
                "chunk_idx": idx_c,
                "texto": texto_chunk,
                "texto_puro": texto_puro,
                "texto_crudo": texto_puro,
                "texto_por_pagina": mapa_pag,
                "pagina_inicio": p_ini,
                "pagina_fin": p_fin,
                "chars": len(texto_chunk),
                "num_oraciones": len(bloque),
                "num_elementos": len(bloque)
            }

        for el in unidades:
            txt = el["texto"]
            pag = int(el.get("pagina", 1) or 1)
            len_txt = len(txt)

            nuevo_total = chars_acumulados + len_txt + (2 if bloque_actual else 0)

            if bloque_actual and (nuevo_total > max_umbral):
                chunks.append(_construir_chunk(len(chunks), bloque_actual, paginas_bloque, bloques_por_pagina))

                # Overlap inteligente: conservar la última oración del bloque anterior
                ultimo_elem = bloque_actual[-1]
                oraciones_ultimo = self._dividir_en_oraciones_semanticas(ultimo_elem)
                overlap_elem = oraciones_ultimo[-1] if oraciones_ultimo else ultimo_elem

                bloque_actual = [overlap_elem, txt]
                paginas_bloque = {ultima_pagina, pag}
                bloques_por_pagina = {}
                bloques_por_pagina.setdefault(str(ultima_pagina), []).append(overlap_elem)
                bloques_por_pagina.setdefault(str(pag), []).append(txt)
                chars_acumulados = len(overlap_elem) + len_txt + 2
                ultima_pagina = pag
            else:
                bloque_actual.append(txt)
                paginas_bloque.add(pag)
                bloques_por_pagina.setdefault(str(pag), []).append(txt)
                chars_acumulados = nuevo_total
                ultima_pagina = pag

        # Último bloque pendiente
        if bloque_actual:
            chunks.append(_construir_chunk(len(chunks), bloque_actual, paginas_bloque, bloques_por_pagina))

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
    # 4. INGESTA HÍBRIDA (SQLite FTS5 BM25 + ChromaDB OPCIONAL) Y RECUPERACIÓN RRF
    # =========================================================================
    def _asegurar_documento_en_memoria(self, doc_id: str) -> None:
        """Reconstruye los chunks y el texto completo desde SQLite FTS5 si no están en RAM."""
        doc_key = self._normalizar_doc_id(doc_id)
        if not self.fts_store:
            return
        if not self.documentos_chunks.get(doc_key):
            cargados = self.fts_store.cargar_chunks_documento(doc_key)
            if cargados:
                self.documentos_chunks[doc_key] = cargados
        if not self.documentos_texto.get(doc_key):
            txt_full = self.fts_store.cargar_texto_completo(doc_key)
            if txt_full:
                self.documentos_texto[doc_key] = txt_full

    def _indexar_vectores_chroma(
        self,
        doc_id: str,
        chunks: List[Dict[str, Any]],
        metadata_extra: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Indexa embeddings opcionales en ChromaDB si Ollama y la colección están disponibles."""
        if not (self.client_ollama and self.collection):
            return "fts_bm25"

        ids = []
        embeddings = []
        documents = []
        metadatas = []

        doc_meta_base = metadata_extra.copy() if metadata_extra else {}
        doc_meta_base["doc_id"] = str(doc_id)

        for chunk in chunks:
            emb = self._obtener_embedding(chunk["texto_puro"])
            if emb is None:
                logger.warning(
                    f"⚠️ [RAG] Embeddings no disponibles con '{self.embed_model}'. "
                    f"Documento '{doc_id}' queda indexado en modo FTS5 BM25."
                )
                return "fts_bm25"

            chunk_id = chunk["chunk_id"]
            chunk_meta = doc_meta_base.copy()
            chunk_meta["chunk_id"] = chunk_id
            chunk_meta["chunk_idx"] = chunk["chunk_idx"]
            chunk_meta["pagina_inicio"] = chunk.get("pagina_inicio", 1)
            chunk_meta["pagina_fin"] = chunk.get("pagina_fin", 1)
            chunk_meta["chars"] = chunk["chars"]

            ids.append(chunk_id)
            embeddings.append(emb)
            documents.append(chunk["texto"])
            metadatas.append(chunk_meta)

        if not ids:
            return "fts_bm25"

        try:
            try:
                self.collection.delete(where={"doc_id": str(doc_id)})
            except Exception:
                pass
            self.collection.add(
                ids=ids,
                embeddings=embeddings,
                documents=documents,
                metadatas=metadatas
            )
            return "hibrido_fts_chroma"
        except Exception as e:
            logger.warning(f"⚠️ [RAG] Error al guardar vectores en ChromaDB ({e}); operando en FTS5 BM25.")
            return "fts_bm25"

    def ingestar_documento(
        self,
        doc_id: str,
        lista_oraciones: List[Union[str, Dict[str, Any]]],
        limite_chars: int = 1200,
        metadata_extra: Optional[Dict[str, Any]] = None,
        texto_completo: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Indexa un documento siempre en SQLite FTS5 (BM25) y, si Ollama + ChromaDB
        están activos y responden con embeddings válidos, también en ChromaDB.
        """
        doc_id = self._normalizar_doc_id(doc_id)

        chunks = self._agrupar_oraciones(lista_oraciones, limite_chars=limite_chars)
        if not chunks:
            return {"exito": False, "error": "No se generaron fragmentos para el documento."}

        for chunk in chunks:
            chunk["chunk_id"] = f"{doc_id}_c{chunk['chunk_idx']}"

        total_paginas = int((metadata_extra or {}).get("total_paginas", 1) or 1)
        if total_paginas <= 1:
            total_paginas = max((int(c.get("pagina_fin", 1) or 1) for c in chunks), default=1)

        # 1. Guardar siempre primero en SQLite FTS5 (100 % independiente de Ollama)
        try:
            self.fts_store.guardar_documento(doc_id, chunks, total_paginas=total_paginas)
        except Exception as e:
            logger.error(f"❌ [RAG] Error guardando en SQLite FTS5: {e}")
            return {"exito": False, "error": f"Error SQLite FTS5: {str(e)}"}

        # Guardar en memoria RAM
        if texto_completo:
            self.documentos_texto[doc_id] = texto_completo
        else:
            self.documentos_texto[doc_id] = "\n\n".join([c["texto"] for c in chunks])
        self.documentos_chunks[doc_id] = chunks

        # 2. Indexación vectorial opcional en ChromaDB (solo si Ollama y ChromaDB están disponibles)
        modo_indice = self._indexar_vectores_chroma(doc_id, chunks, metadata_extra)

        logger.info(
            f"✅ [RAG] Documento '{doc_id}' ingestó {len(chunks)} chunks con éxito (modo: {modo_indice})."
        )
        return {
            "exito": True,
            "doc_id": doc_id,
            "total_chunks": len(chunks),
            "total_paginas": total_paginas,
            "modo_indice": modo_indice,
            "mensaje": f"Documento indexado exitosamente ({len(chunks)} fragmentos, {modo_indice})."
        }

    @staticmethod
    def _normalizar_campos_hit_vectorial(
        doc_key: str,
        rank_idx: int,
        raw_id: Any,
        v_doc: Any,
        v_meta: Any,
        mapa_chunks_id: Dict[str, Dict[str, Any]],
        mapa_chunks_idx: Dict[int, Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Normaliza identificadores, paginación y textos de un hit vectorial contra el índice local."""
        meta_norm = v_meta or {}
        c_idx = int(meta_norm.get("chunk_idx", rank_idx - 1))
        cid = str(raw_id or meta_norm.get("chunk_id") or f"{doc_key}_c{c_idx}")

        ref = mapa_chunks_id.get(cid) or mapa_chunks_idx.get(c_idx) or {}
        p_ini = int(meta_norm.get("pagina_inicio", ref.get("pagina_inicio", 1)))
        p_fin = int(meta_norm.get("pagina_fin", ref.get("pagina_fin", p_ini)))
        texto_puro = (
            ref.get("texto_puro")
            or re.sub(r"^\[(?:Pág\.|Págs\.)[^\]]*\]\s*", "", str(v_doc or "")).strip()
        )
        return {
            "chunk_id": cid,
            "chunk_idx": c_idx,
            "pagina_inicio": p_ini,
            "pagina_fin": p_fin,
            "texto": ref.get("texto") or str(v_doc or ""),
            "texto_puro": texto_puro,
            "texto_por_pagina": ref.get("texto_por_pagina") or {str(p_ini): texto_puro},
            "metadata": dict(meta_norm),
        }

    @staticmethod
    def _acumular_hit_vectorial_rrf(
        doc_key: str,
        rank_idx: int,
        raw_id: Any,
        v_doc: Any,
        v_meta: Any,
        v_dist: Any,
        rrf_k: float,
        mapa_chunks_id: Dict[str, Dict[str, Any]],
        mapa_chunks_idx: Dict[int, Dict[str, Any]],
        fusionados: Dict[str, Dict[str, Any]],
    ) -> None:
        """Inserta o enriquece un hit vectorial en `fusionados` y acumula su puntaje RRF."""
        campos = RAGIngestaMixin._normalizar_campos_hit_vectorial(
            doc_key, rank_idx, raw_id, v_doc, v_meta, mapa_chunks_id, mapa_chunks_idx
        )
        cid = campos["chunk_id"]
        entry = fusionados.get(cid)
        if not entry:
            entry = {
                **campos,
                "distancia": v_dist,
                "bm25_rank": None,
                "vec_rank": rank_idx,
                "rrf_score": 0.0,
            }
            fusionados[cid] = entry
        else:
            entry["distancia"] = v_dist
            if not entry.get("texto_puro") and campos["texto_puro"]:
                entry["texto_puro"] = campos["texto_puro"]
            if not entry.get("texto_por_pagina") and campos["texto_por_pagina"]:
                entry["texto_por_pagina"] = campos["texto_por_pagina"]
        entry["vec_rank"] = rank_idx
        entry["rrf_score"] += 1.0 / (rrf_k + rank_idx)

    def _fusionar_resultados_vectoriales_chroma(
        self,
        doc_key: str,
        consulta: str,
        n_cand: int,
        rrf_k: float,
        mapa_chunks_id: Dict[str, Dict[str, Any]],
        mapa_chunks_idx: Dict[int, Dict[str, Any]],
        fusionados: Dict[str, Dict[str, Any]],
    ) -> None:
        """Consulta ChromaDB + Ollama (si están activos) y acumula sus puntajes RRF en `fusionados`."""
        if not (self.client_ollama and self.collection):
            return
        emb = self._obtener_embedding(str(consulta or "")[:1000])
        if emb is None:
            return
        try:
            q_res = self.collection.query(
                query_embeddings=[emb],
                n_results=n_cand,
                where={"doc_id": str(doc_key)}
            )
            v_ids = (q_res.get("ids") or [[]])[0]
            v_docs = (q_res.get("documents") or [[]])[0]
            v_metas = (q_res.get("metadatas") or [[]])[0]
            v_dists = (q_res.get("distances") or [[]])[0]

            for rank_idx, (v_doc, v_meta, v_dist) in enumerate(zip(v_docs, v_metas, v_dists), start=1):
                raw_id = v_ids[rank_idx - 1] if (rank_idx - 1) < len(v_ids) else None
                self._acumular_hit_vectorial_rrf(
                    doc_key, rank_idx, raw_id, v_doc, v_meta, v_dist, rrf_k,
                    mapa_chunks_id, mapa_chunks_idx, fusionados,
                )
        except Exception as e:
            logger.warning(f"⚠️ [RAG] Búsqueda vectorial ChromaDB falló ({e}); usando resultados BM25.")

    def _recuperar_fragmentos_hibrido(
        self,
        doc_id: str,
        consulta: str,
        top_k: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Recuperación híbrida: SQLite FTS5 BM25 + ChromaDB vectorial (si está activo)
        fusionados mediante Reciprocal Rank Fusion (RRF):
            score = 1 / (60 + rank_bm25) + 1 / (60 + rank_vec)
        """
        doc_key = self._normalizar_doc_id(doc_id)
        self._asegurar_documento_en_memoria(doc_key)

        chunks_mem = self.documentos_chunks.get(doc_key, [])
        mapa_chunks_idx = {int(c.get("chunk_idx", i)): c for i, c in enumerate(chunks_mem)}
        mapa_chunks_id = {
            str(c.get("chunk_id") or f"{doc_key}_c{c.get('chunk_idx', i)}"): c
            for i, c in enumerate(chunks_mem)
        }

        n_cand = max(int(top_k or 10), 12)
        rrf_k = 60.0
        fusionados: Dict[str, Dict[str, Any]] = {}

        # 1. Ranking léxico BM25 (SQLite FTS5)
        bm25_hits = self.fts_store.buscar_bm25(doc_key, consulta, top_k=n_cand) if self.fts_store else []
        for rank_idx, item in enumerate(bm25_hits, start=1):
            cid = str(item.get("chunk_id") or f"{doc_key}_c{item.get('chunk_idx', rank_idx)}")
            entry = fusionados.get(cid)
            if not entry:
                entry = {
                    "chunk_id": cid,
                    "chunk_idx": int(item.get("chunk_idx", 0)),
                    "pagina_inicio": int(item.get("pagina_inicio", 1)),
                    "pagina_fin": int(item.get("pagina_fin", item.get("pagina_inicio", 1))),
                    "texto": item.get("texto", ""),
                    "texto_puro": item.get("texto_puro") or item.get("texto_crudo", ""),
                    "texto_por_pagina": item.get("texto_por_pagina") or {},
                    "metadata": {
                        "chunk_id": cid,
                        "chunk_idx": int(item.get("chunk_idx", 0)),
                        "pagina_inicio": int(item.get("pagina_inicio", 1)),
                        "pagina_fin": int(item.get("pagina_fin", item.get("pagina_inicio", 1))),
                    },
                    "distancia": None,
                    "bm25_rank": rank_idx,
                    "vec_rank": None,
                    "rrf_score": 0.0,
                }
                fusionados[cid] = entry
            entry["bm25_rank"] = rank_idx
            entry["rrf_score"] += 1.0 / (rrf_k + rank_idx)

        # 2. Ranking vectorial semántico (ChromaDB + Ollama, opcional)
        self._fusionar_resultados_vectoriales_chroma(
            doc_key=doc_key,
            consulta=consulta,
            n_cand=n_cand,
            rrf_k=rrf_k,
            mapa_chunks_id=mapa_chunks_id,
            mapa_chunks_idx=mapa_chunks_idx,
            fusionados=fusionados,
        )

        if fusionados:
            ordenados = sorted(
                fusionados.values(),
                key=lambda x: (-x["rrf_score"], x["chunk_idx"])
            )
            return ordenados[: max(1, int(top_k or 10))]

        return []

    # =========================================================================

    # 7. GESTIÓN Y LIMPIEZA
    # =========================================================================
    def eliminar_documento(self, doc_id: str) -> Dict[str, Any]:
        """Elimina todos los chunks FTS5, vectores y metadatos de un doc_id."""
        doc_key = self._normalizar_doc_id(doc_id)
        if doc_key in self.documentos_texto:
            del self.documentos_texto[doc_key]
        if doc_key in self.documentos_chunks:
            del self.documentos_chunks[doc_key]

        if self.fts_store:
            try:
                self.fts_store.eliminar_documento(doc_key)
            except Exception as e:
                logger.warning(f"⚠️ [RAG] Error eliminando '{doc_key}' de FTS5: {e}")

        if self.collection:
            try:
                self.collection.delete(where={"doc_id": str(doc_key)})
            except Exception as e:
                logger.warning(f"⚠️ [RAG] Error eliminando '{doc_key}' de ChromaDB: {e}")

        return {"exito": True, "doc_id": doc_key, "mensaje": "Documento eliminado de los índices locales."}
