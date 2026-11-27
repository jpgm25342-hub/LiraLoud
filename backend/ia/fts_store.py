# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

"""
==============================================================================
LIRALOUD - MOTOR DE BÚSQUEDA LÉXICA PERSISTENTE (SQLite FTS5 + BM25)
==============================================================================
Almacena chunks crudos y metadatos por página en `lira_db/fts_index.sqlite`,
garantizando recuperación BM25 rápida, determinista y 100 % offline sin
depender de Ollama ni de librerías externas fuera de la stdlib de Python.
==============================================================================
"""

import json
import logging
import os
import re
import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger("LiraFTSStore")

STOPWORDS_ES_EN = {
    # Español
    "a", "acá", "ahí", "al", "algo", "algunas", "algunos", "allá", "allí", "ante",
    "antes", "aquel", "aquella", "aquellas", "aquello", "aquellos", "aquí", "así",
    "aun", "aún", "aunque", "bajo", "bien", "cada", "casi", "como", "cómo", "con",
    "contra", "cual", "cuál", "cuales", "cuáles", "cuando", "cuándo", "cuanto",
    "cuánto", "de", "del", "desde", "donde", "dónde", "dos", "el", "él", "ella",
    "ellas", "ello", "ellos", "en", "entre", "era", "eran", "eres", "es", "esa",
    "esas", "ese", "eso", "esos", "esta", "está", "están", "estas", "este", "esto",
    "estos", "fue", "fueron", "ha", "haber", "había", "hace", "hacen", "hacer",
    "hacia", "han", "hasta", "hay", "haz", "la", "las", "le", "les", "lo", "los",
    "mas", "más", "me", "mi", "mí", "mis", "mucho", "muchos", "muy", "nada", "ni",
    "no", "nos", "nosotros", "nuestra", "nuestro", "o", "os", "otra", "otras",
    "otro", "otros", "para", "pero", "poco", "por", "porque", "porqué", "puede",
    "pueden", "que", "qué", "quien", "quién", "quienes", "se", "sea", "según",
    "ser", "si", "sí", "sido", "siempre", "sin", "sobre", "solo", "sólo", "somos",
    "son", "soy", "su", "sus", "tal", "también", "tampoco", "tan", "tanto", "te",
    "tenemos", "tener", "tengo", "ti", "tiene", "tienen", "toda", "todas", "todo",
    "todos", "tu", "tú", "tus", "un", "una", "unas", "uno", "unos", "usted",
    "ustedes", "va", "van", "vamos", "ya", "y", "yo",
    # Inglés
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
    "any", "are", "as", "at", "be", "because", "been", "before", "being", "below",
    "between", "both", "but", "by", "can", "could", "did", "do", "does", "doing",
    "down", "during", "each", "few", "for", "from", "further", "had", "has",
    "have", "having", "he", "her", "here", "hers", "herself", "him", "himself",
    "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just",
    "me", "more", "most", "my", "myself", "no", "nor", "not", "now", "of", "off",
    "on", "once", "only", "or", "other", "our", "ours", "ourselves", "out", "over",
    "own", "same", "she", "should", "so", "some", "such", "than", "that", "the",
    "their", "theirs", "them", "themselves", "then", "there", "these", "they",
    "this", "those", "through", "to", "too", "under", "until", "up", "very", "was",
    "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why",
    "will", "with", "would", "you", "your", "yours", "yourself", "yourselves",
}


class LiraFTSStore:
    """
    Índice léxico persistente en SQLite FTS5 con ranking BM25.
    Thread-safe mediante `threading.Lock` y modo WAL.
    """

    def __init__(self, db_path: str):
        self.db_path = os.path.abspath(db_path)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._lock = threading.Lock()
        self._inicializar_esquema()

    def _conectar(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _inicializar_esquema(self) -> None:
        with self._lock:
            conn = self._conectar()
            try:
                with conn:
                    conn.execute(
                        """
                        CREATE TABLE IF NOT EXISTS chunks (
                            chunk_id TEXT PRIMARY KEY,
                            doc_id TEXT NOT NULL,
                            chunk_idx INTEGER NOT NULL,
                            pagina_inicio INTEGER NOT NULL,
                            pagina_fin INTEGER NOT NULL,
                            texto_crudo TEXT NOT NULL,
                            texto_por_pagina_json TEXT NOT NULL,
                            chars INTEGER NOT NULL,
                            total_paginas INTEGER NOT NULL,
                            updated_at REAL NOT NULL
                        )
                        """
                    )
                    conn.execute(
                        """
                        CREATE INDEX IF NOT EXISTS idx_chunks_doc_idx
                        ON chunks (doc_id, chunk_idx)
                        """
                    )
                    conn.execute(
                        """
                        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                            chunk_id UNINDEXED,
                            doc_id UNINDEXED,
                            texto_crudo,
                            tokenize='unicode61 remove_diacritics 2'
                        )
                        """
                    )
            finally:
                conn.close()

    @staticmethod
    def _construir_texto_formateado(
        texto_crudo: str, pagina_inicio: int, pagina_fin: int
    ) -> str:
        pags_str = (
            f"Pág. {pagina_inicio}"
            if pagina_inicio == pagina_fin
            else f"Págs. {pagina_inicio}-{pagina_fin}"
        )
        return f"[{pags_str}]\n{texto_crudo}"

    @staticmethod
    def _fila_a_chunk(row: sqlite3.Row, bm25_score: Optional[float] = None) -> Dict[str, Any]:
        p_ini = int(row["pagina_inicio"])
        p_fin = int(row["pagina_fin"])
        texto_crudo = str(row["texto_crudo"] or "")
        try:
            texto_por_pagina = json.loads(row["texto_por_pagina_json"] or "{}")
            if not isinstance(texto_por_pagina, dict):
                texto_por_pagina = {}
        except Exception:
            texto_por_pagina = {}

        chunk: Dict[str, Any] = {
            "chunk_id": str(row["chunk_id"]),
            "doc_id": str(row["doc_id"]),
            "chunk_idx": int(row["chunk_idx"]),
            "pagina_inicio": p_ini,
            "pagina_fin": p_fin,
            "texto_crudo": texto_crudo,
            "texto_puro": texto_crudo,
            "texto": LiraFTSStore._construir_texto_formateado(texto_crudo, p_ini, p_fin),
            "texto_por_pagina": texto_por_pagina,
            "chars": int(row["chars"]),
            "total_paginas": int(row["total_paginas"]),
            "updated_at": float(row["updated_at"]),
        }
        if bm25_score is not None:
            chunk["bm25_score"] = float(bm25_score)
        return chunk

    def guardar_documento(
        self,
        doc_id: str,
        chunks: List[Dict[str, Any]],
        total_paginas: int = 1,
    ) -> int:
        """Reemplaza atómicamente todos los chunks de `doc_id` en `chunks` y `chunks_fts`."""
        doc_key = str(doc_id)
        ahora = time.time()
        total_p = max(1, int(total_paginas or 1))

        filas_chunks = []
        filas_fts = []
        for idx, c in enumerate(chunks or []):
            c_idx = int(c.get("chunk_idx", idx))
            chunk_id = str(c.get("chunk_id") or f"{doc_key}_c{c_idx}")
            p_ini = int(c.get("pagina_inicio", 1) or 1)
            p_fin = int(c.get("pagina_fin", p_ini) or p_ini)
            texto_crudo = str(
                c.get("texto_puro")
                if c.get("texto_puro") is not None
                else (c.get("texto_crudo") if c.get("texto_crudo") is not None else c.get("texto", ""))
            ).strip()
            t_por_pag = c.get("texto_por_pagina")
            if not isinstance(t_por_pag, dict) or not t_por_pag:
                t_por_pag = {str(p_ini): texto_crudo} if texto_crudo else {}
            t_por_pag_json = json.dumps(t_por_pag, ensure_ascii=False)
            chars = int(c.get("chars") or len(texto_crudo))

            filas_chunks.append(
                (
                    chunk_id,
                    doc_key,
                    c_idx,
                    p_ini,
                    p_fin,
                    texto_crudo,
                    t_por_pag_json,
                    chars,
                    total_p,
                    ahora,
                )
            )
            filas_fts.append((chunk_id, doc_key, texto_crudo))

        with self._lock:
            conn = self._conectar()
            try:
                with conn:
                    conn.execute("DELETE FROM chunks WHERE doc_id = ?", (doc_key,))
                    conn.execute("DELETE FROM chunks_fts WHERE doc_id = ?", (doc_key,))
                    if filas_chunks:
                        conn.executemany(
                            """
                            INSERT INTO chunks (
                                chunk_id, doc_id, chunk_idx, pagina_inicio, pagina_fin,
                                texto_crudo, texto_por_pagina_json, chars, total_paginas, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            filas_chunks,
                        )
                        conn.executemany(
                            """
                            INSERT INTO chunks_fts (chunk_id, doc_id, texto_crudo)
                            VALUES (?, ?, ?)
                            """,
                            filas_fts,
                        )
            finally:
                conn.close()

        return len(filas_chunks)

    def cargar_chunks_documento(self, doc_id: str) -> List[Dict[str, Any]]:
        """Reconstruye los chunks de `doc_id` desde SQLite ordenados por `chunk_idx`."""
        doc_key = str(doc_id)
        with self._lock:
            conn = self._conectar()
            try:
                cur = conn.execute(
                    """
                    SELECT chunk_id, doc_id, chunk_idx, pagina_inicio, pagina_fin,
                           texto_crudo, texto_por_pagina_json, chars, total_paginas, updated_at
                    FROM chunks
                    WHERE doc_id = ?
                    ORDER BY chunk_idx ASC
                    """,
                    (doc_key,),
                )
                rows = cur.fetchall()
            finally:
                conn.close()

        return [self._fila_a_chunk(r) for r in rows]

    @staticmethod
    def _agrupar_chunks_por_pagina(chunks: List[Dict[str, Any]]) -> Dict[int, List[str]]:
        """Agrupa y deduplica los fragmentos de texto por número de página."""
        paginas: Dict[int, List[str]] = {}
        vistos_por_pag: Dict[int, set] = {}

        for c in chunks:
            t_pag = c.get("texto_por_pagina") or {}
            if t_pag:
                for p_str, txt_p in t_pag.items():
                    try:
                        p_num = int(p_str)
                    except Exception:
                        p_num = int(c.get("pagina_inicio", 1))
                    txt_limpio = str(txt_p or "").strip()
                    if not txt_limpio:
                        continue
                    paginas.setdefault(p_num, [])
                    vistos_por_pag.setdefault(p_num, set())
                    clave = txt_limpio[:120]
                    if clave not in vistos_por_pag[p_num]:
                        vistos_por_pag[p_num].add(clave)
                        paginas[p_num].append(txt_limpio)
            else:
                p_num = int(c.get("pagina_inicio", 1))
                txt_limpio = str(c.get("texto_puro") or "").strip()
                if txt_limpio:
                    paginas.setdefault(p_num, []).append(txt_limpio)

        return paginas

    def cargar_texto_completo(self, doc_id: str) -> str:
        """Reconstruye el texto completo estructurado por páginas desde SQLite."""
        chunks = self.cargar_chunks_documento(doc_id)
        if not chunks:
            return ""

        paginas = self._agrupar_chunks_por_pagina(chunks)
        if not paginas:
            return "\n\n".join(c["texto"] for c in chunks if c.get("texto"))

        bloques = []
        for p_num in sorted(paginas.keys()):
            cuerpo = "\n\n".join(paginas[p_num]).strip()
            if cuerpo:
                bloques.append(f"--- PÁGINA {p_num} ---\n{cuerpo}")
        return "\n\n".join(bloques)

    @staticmethod
    def _filtrar_tokens_fts5(raw_tokens: List[str], stopwords) -> List[str]:
        """Deduplica tokens en minúsculas descartando los muy cortos y los presentes en stopwords."""
        terminos: List[str] = []
        vistos = set()
        for tok in raw_tokens:
            low = tok.lower()
            if low in vistos or low in stopwords:
                continue
            if len(low) < 2 and not low.isdigit():
                continue
            vistos.add(low)
            terminos.append(low)
        return terminos

    @staticmethod
    def _construir_query_fts5(consulta: str) -> str:
        """
        Sanitiza la consulta eliminando puntuación y stopwords en ES/EN,
        y construye una expresión FTS5 segura con términos entrecomillados unidos por OR.
        """
        texto = str(consulta or "").strip()
        if not texto:
            return ""

        # Extraer palabras alfanuméricas Unicode (incluyendo acentos y números)
        raw_tokens = re.findall(r"[^\W_]+", texto, flags=re.UNICODE)
        if not raw_tokens:
            return ""

        terminos_filtrados = LiraFTSStore._filtrar_tokens_fts5(raw_tokens, STOPWORDS_ES_EN)
        # Si todo eran stopwords, usar los tokens crudos no vacíos como respaldo
        if not terminos_filtrados:
            terminos_filtrados = LiraFTSStore._filtrar_tokens_fts5(raw_tokens, frozenset())

        if not terminos_filtrados:
            return ""

        # Limitar a 24 términos significativos para mantener consultas FTS5 rápidas
        terminos_seguros = []
        for t in terminos_filtrados[:24]:
            escaped = t.replace('"', '""')
            terminos_seguros.append(f'"{escaped}"')

        return " OR ".join(terminos_seguros)

    def buscar_bm25(
        self, doc_id: str, consulta: str, top_k: int = 10
    ) -> List[Dict[str, Any]]:
        """Busca fragmentos relevantes para `doc_id` usando FTS5 + BM25."""
        fts_query = self._construir_query_fts5(consulta)
        if not fts_query:
            return []

        doc_key = str(doc_id)
        limite = max(1, int(top_k or 10))

        with self._lock:
            conn = self._conectar()
            try:
                cur = conn.execute(
                    """
                    SELECT c.chunk_id, c.doc_id, c.chunk_idx, c.pagina_inicio, c.pagina_fin,
                           c.texto_crudo, c.texto_por_pagina_json, c.chars, c.total_paginas,
                           c.updated_at, bm25(chunks_fts) AS score
                    FROM chunks_fts
                    JOIN chunks c ON c.chunk_id = chunks_fts.chunk_id
                    WHERE chunks_fts.doc_id = ? AND chunks_fts MATCH ?
                    ORDER BY score ASC
                    LIMIT ?
                    """,
                    (doc_key, fts_query, limite),
                )
                rows = cur.fetchall()
            except sqlite3.OperationalError as e:
                logger.warning(f"⚠️ [FTS5] Error en consulta BM25 ({fts_query}): {e}")
                return []
            finally:
                conn.close()

        return [self._fila_a_chunk(r, bm25_score=r["score"]) for r in rows]

    def eliminar_documento(self, doc_id: str) -> bool:
        """Elimina todos los chunks de `doc_id` en ambas tablas."""
        doc_key = str(doc_id)
        with self._lock:
            conn = self._conectar()
            try:
                with conn:
                    conn.execute("DELETE FROM chunks WHERE doc_id = ?", (doc_key,))
                    conn.execute("DELETE FROM chunks_fts WHERE doc_id = ?", (doc_key,))
            finally:
                conn.close()
        return True

    def contar_chunks(self, doc_id: Optional[str] = None) -> int:
        """Retorna el conteo de chunks almacenados (total o por documento)."""
        with self._lock:
            conn = self._conectar()
            try:
                if doc_id:
                    cur = conn.execute(
                        "SELECT COUNT(*) FROM chunks WHERE doc_id = ?", (str(doc_id),)
                    )
                else:
                    cur = conn.execute("SELECT COUNT(*) FROM chunks")
                row = cur.fetchone()
                return int(row[0]) if row else 0
            finally:
                conn.close()
