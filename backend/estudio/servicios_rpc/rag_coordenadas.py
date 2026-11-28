import os
import re
import unicodedata
from collections import defaultdict

from backend.core.webview_bridge import eel
from backend.core.estado_global import estado_app
from backend.documento.ocr_engine import obtener_palabras_cache_ocr
from backend.estudio.servicios_rpc.comun import _get_rag


def _construir_paginas_candidatas(pag_ini_num, pagina_fin, total_pags):
    """Construye la lista ordenada de números de página a explorar para localizar una fuente RAG."""
    paginas_a_probar = [pag_ini_num]
    if pagina_fin is not None:
        try:
            p_fin_num = int(pagina_fin)
            if p_fin_num > pag_ini_num:
                for p_extra in range(pag_ini_num + 1, min(p_fin_num, total_pags) + 1):
                    if p_extra not in paginas_a_probar:
                        paginas_a_probar.append(p_extra)
            elif 1 <= p_fin_num < pag_ini_num and p_fin_num not in paginas_a_probar:
                paginas_a_probar.append(p_fin_num)
        except Exception:
            pass
    return paginas_a_probar


def _buscar_y_consolidar_coordenadas_en_paginas(pag_ini_num, pagina_fin, total_pags, buscar_en_pagina):
    """Recorre las páginas candidatas y consolida los rectángulos y bbox resultantes."""
    paginas_a_probar = _construir_paginas_candidatas(pag_ini_num, pagina_fin, total_pags)

    todos_rects = []
    pagina_encontrada = pag_ini_num
    for p_cand in paginas_a_probar:
        rects_cand = buscar_en_pagina(p_cand)
        if rects_cand:
            todos_rects = rects_cand
            pagina_encontrada = p_cand
            break

    if not todos_rects:
        return {
            "exito": False,
            "pagina": pag_ini_num,
            "error": "Fragmento no localizado exactamente en esta página",
        }

    todos_rects.sort(key=lambda r: (r[1], r[0]))
    bbox = [
        min(r[0] for r in todos_rects),
        min(r[1] for r in todos_rects),
        max(r[2] for r in todos_rects),
        max(r[3] for r in todos_rects),
    ]
    return {
        "exito": True,
        "pagina": pagina_encontrada,
        "rects": todos_rects,
        "coords": todos_rects[0],
        "bbox": bbox,
    }


def _limpiar_texto_busqueda(raw_txt):
    """Limpia etiquetas de cita y une palabras partidas por guion al final de línea."""
    limpio = re.sub(
        r"\[(?:Pág|Págs|Pag|Pags|Página|Páginas|Fragmento|Sección|F\d+)[^\]]*\]",
        " ",
        str(raw_txt or ""),
        flags=re.IGNORECASE,
    ).strip()
    limpio = re.sub(
        r"([a-zA-ZáéíóúñÁÉÍÓÚÑ])-\s*\n+\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ])",
        r"\1\2",
        limpio,
    )
    return re.sub(
        r"([a-zA-ZáéíóúñÁÉÍÓÚÑ])-\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ])",
        r"\1\2",
        limpio,
    )


def _tokens_norm(texto):
    """Normaliza a minúsculas sin tildes y extrae tokens alfanuméricos."""
    sin_tildes = "".join(
        ch
        for ch in unicodedata.normalize("NFKD", str(texto).lower())
        if not unicodedata.combining(ch)
    )
    return re.findall(r"[a-z0-9]+", sin_tildes)


def _es_superindice_numerico(w, raw_w):
    alt_w = float(w[3] - w[1])
    solo_dig = raw_w.strip().replace(",", "").replace(".", "")
    return alt_w < 9.0 and solo_dig.isdigit() and len(solo_dig) <= 3


def _debe_unir_palabra_guion(words_pag, idx_w, raw_w):
    if not (raw_w.rstrip().endswith("-") and len(raw_w.strip()) >= 3 and (idx_w + 1) < len(words_pag)):
        return None
    w = words_pag[idx_w]
    nxt = words_pag[idx_w + 1]
    nxt_raw = str(nxt[4])
    nxt_sub = _tokens_norm(nxt_raw)
    misma_linea = nxt[5] == w[5] and nxt[6] == w[6]
    if nxt_sub and not misma_linea and nxt_raw[:1].islower():
        return nxt_sub[0]
    return None


def _construir_stream(words_pag, omitir_superindices=False):
    """Construye la secuencia de tokens normalizados y su mapa a índices de palabra."""
    toks = []
    w_map = []
    saltar_primero = False
    for idx_w, w in enumerate(words_pag):
        raw_w = str(w[4])
        if omitir_superindices and _es_superindice_numerico(w, raw_w):
            continue
        sub = _tokens_norm(raw_w)
        if saltar_primero:
            sub = sub[1:]
            saltar_primero = False
        if not sub:
            continue

        nxt_tok = _debe_unir_palabra_guion(words_pag, idx_w, raw_w)
        if nxt_tok is not None:
            for t in sub[:-1]:
                toks.append(t)
                w_map.append((idx_w,))
            toks.append(sub[-1] + nxt_tok)
            w_map.append((idx_w, idx_w + 1))
            saltar_primero = True
            continue

        for t in sub:
            toks.append(t)
            w_map.append((idx_w,))
    return toks, w_map


def _indexar_posiciones_tokens(pag_toks):
    pos_index = defaultdict(list)
    for j, tok in enumerate(pag_toks):
        pos_index[tok].append(j)
    return pos_index


def _buscar_ngrams_fuertes(snip_toks, pag_toks, pos_index):
    posiciones = set()
    n_snip, n_pag = len(snip_toks), len(pag_toks)
    for tam_v in (6, 5, 4):
        if n_snip < tam_v or n_pag < tam_v:
            continue
        for i in range(n_snip - tam_v + 1):
            win = snip_toks[i : i + tam_v]
            for j in pos_index.get(win[0], ()):
                if j + tam_v <= n_pag and pag_toks[j : j + tam_v] == win:
                    posiciones.update(range(j, j + tam_v))
    return posiciones


def _buscar_3grams_cercanos(snip_toks, pag_toks, pos_index, posiciones_fuertes):
    posiciones = set()
    n_pag = len(pag_toks)
    for i in range(len(snip_toks) - 2):
        win = snip_toks[i : i + 3]
        if max(len(t) for t in win) < 5 or sum(1 for t in win if len(t) >= 3) < 2:
            continue
        for j in pos_index.get(win[0], ()):
            if j + 3 <= n_pag and pag_toks[j : j + 3] == win:
                if (not posiciones_fuertes) or any(abs(j - a) <= 45 for a in posiciones_fuertes):
                    posiciones.update(range(j, j + 3))
    return posiciones


def _filtrar_clusters_posiciones(posiciones):
    sorted_pos = sorted(posiciones)
    clusters = [[sorted_pos[0]]]
    for p in sorted_pos[1:]:
        if p - clusters[-1][-1] <= 35:
            clusters[-1].append(p)
        else:
            clusters.append([p])

    max_c = max(len(c) for c in clusters)
    umbral_c = max(4, max_c // 2) if max_c >= 6 else max_c
    pos_filtradas = set()
    for cl in clusters:
        if len(cl) >= umbral_c or len(cl) >= 8:
            pos_filtradas.update(cl)
    return pos_filtradas


def _buscar_coincidencias(snip_toks, pag_toks, w_map):
    if len(snip_toks) < 3 or len(pag_toks) < 3:
        return set()
    pos_index = _indexar_posiciones_tokens(pag_toks)
    pos_fuertes = _buscar_ngrams_fuertes(snip_toks, pag_toks, pos_index)
    pos_3gram = _buscar_3grams_cercanos(snip_toks, pag_toks, pos_index, pos_fuertes)
    posiciones = pos_fuertes | pos_3gram
    if not posiciones:
        return set()

    pos_filtradas = _filtrar_clusters_posiciones(posiciones)
    return {wi for p in pos_filtradas for wi in w_map[p]}


def _localizar_ancla_inicio(snip_toks, pag_toks, pos_index):
    n_snip, n_pag = len(snip_toks), len(pag_toks)
    for tam in (7, 6, 5):
        if n_snip < tam:
            continue
        for off in range(0, min(10, n_snip - tam) + 1):
            win = snip_toks[off : off + tam]
            cands = [j for j in pos_index.get(win[0], ()) if j + tam <= n_pag and pag_toks[j : j + tam] == win]
            if cands:
                return cands[0]
    return None


def _localizar_ancla_fin(snip_toks, pag_toks, pos_index, pos_ini):
    n_snip, n_pag = len(snip_toks), len(pag_toks)
    max_span = max(int(n_snip * 2.5), 40)
    for tam in (7, 6, 5):
        if n_snip < tam:
            continue
        for back in range(0, min(10, n_snip - tam) + 1):
            end_i = n_snip - back
            win = snip_toks[end_i - tam : end_i]
            cands = [
                j + tam - 1
                for j in pos_index.get(win[0], ())
                if j >= pos_ini and (j + tam - 1 - pos_ini) <= max_span and j + tam <= n_pag and pag_toks[j : j + tam] == win
            ]
            if cands:
                return cands[-1]
    return None


def _buscar_rango_continuo_anclas(snip_toks, pag_toks, w_map):
    """Localiza ancla de inicio y fin del snippet en el stream ordenado de la página."""
    if len(snip_toks) < 5 or len(pag_toks) < 5:
        return set()
    pos_index = _indexar_posiciones_tokens(pag_toks)
    pos_ini = _localizar_ancla_inicio(snip_toks, pag_toks, pos_index)
    if pos_ini is None:
        return set()
    pos_fin = _localizar_ancla_fin(snip_toks, pag_toks, pos_index, pos_ini)
    if pos_fin is None or pos_fin < pos_ini:
        return set()
    return {wi for p in range(pos_ini, pos_fin + 1) for wi in w_map[p]}


def _agregar_rect_unico(rects_loc, coord):
    if not any(abs(c[0] - coord[0]) < 1 and abs(c[1] - coord[1]) < 1 for c in rects_loc):
        rects_loc.append(coord)


def _rect_envolvente_palabras(l_words):
    return [
        min(w[0] for w in l_words),
        min(w[1] for w in l_words),
        max(w[2] for w in l_words),
        max(w[3] for w in l_words),
    ]


def _construir_rects_desde_indices(words_pagina, coincidentes_idxs, modo_bloque_continuo):
    rects_loc = []
    lineas_dict = defaultdict(list)
    for idx in sorted(coincidentes_idxs):
        w = words_pagina[idx]
        lineas_dict[(w[5], w[6])].append((idx, w))

    for items_linea in lineas_dict.values():
        items_linea.sort(key=lambda it: it[0])
        if modo_bloque_continuo:
            _agregar_rect_unico(rects_loc, _rect_envolvente_palabras([it[1] for it in items_linea]))
            continue

        runs = [[items_linea[0]]]
        for idx_curr, w_curr in items_linea[1:]:
            idx_prev, w_prev = runs[-1][-1]
            altura_ref = max(8.0, float(w_curr[3] - w_curr[1]))
            if (idx_curr - idx_prev) <= 4 and float(w_curr[0] - w_prev[2]) <= (altura_ref * 4.0):
                runs[-1].append((idx_curr, w_curr))
            else:
                runs.append([(idx_curr, w_curr)])
        for run in runs:
            _agregar_rect_unico(rects_loc, _rect_envolvente_palabras([it[1] for it in run]))
    return rects_loc


def _buscar_indices_coincidentes_en_streams(words_pagina, texto_obj, modo_bloque_continuo):
    snip_toks = _tokens_norm(texto_obj)
    pag_toks_raw, w_map_raw = _construir_stream(words_pagina, omitir_superindices=False)
    pag_toks_clean, w_map_clean = _construir_stream(words_pagina, omitir_superindices=True)

    coincidentes = set()
    if modo_bloque_continuo:
        r_a = _buscar_rango_continuo_anclas(snip_toks, pag_toks_raw, w_map_raw)
        r_b = _buscar_rango_continuo_anclas(snip_toks, pag_toks_clean, w_map_clean)
        coincidentes = r_a if len(r_a) >= len(r_b) else r_b

    if not coincidentes:
        idxs_a = _buscar_coincidencias(snip_toks, pag_toks_raw, w_map_raw)
        idxs_b = _buscar_coincidencias(snip_toks, pag_toks_clean, w_map_clean)
        coincidentes = idxs_a if len(idxs_a) >= len(idxs_b) else idxs_b
        if modo_bloque_continuo and len(coincidentes) >= 2:
            min_i, max_i = min(coincidentes), max(coincidentes)
            if (max_i - min_i) <= max(int(len(snip_toks) * 2.2), 45):
                coincidentes = set(range(min_i, max_i + 1))
    return coincidentes


def _agregar_search_for_en_rects(pag_obj, consulta, rects_loc):
    for r in pag_obj.search_for(consulta):
        _agregar_rect_unico(rects_loc, [r.x0, r.y0, r.x1, r.y1])


def _buscar_fallback_anclas_search_for(pag_obj, palabras_snip):
    rects_loc = []
    paso = 2 if len(palabras_snip) > 40 else 1
    for tam_ancla in (7, 6, 5):
        if len(palabras_snip) < tam_ancla:
            continue
        for i in range(0, len(palabras_snip) - tam_ancla + 1, paso):
            ancla = " ".join(palabras_snip[i : i + tam_ancla]).strip()
            if len(ancla) < 16:
                continue
            _agregar_search_for_en_rects(pag_obj, ancla, rects_loc)
            if len(rects_loc) >= 25:
                break
        if rects_loc:
            break
    return rects_loc


def _buscar_fallbacks_search_for(pag_obj, texto_obj):
    rects_loc = []
    segmentos = [s.strip() for s in re.split(r"[\n\.\?!;:]+", texto_obj) if len(s.strip()) >= 15]
    for seg in segmentos[:15]:
        _agregar_search_for_en_rects(pag_obj, seg[:80].strip(), rects_loc)
    if rects_loc:
        return rects_loc

    palabras_snip = re.findall(r"[^\s]+", texto_obj)
    if len(palabras_snip) >= 5:
        return _buscar_fallback_anclas_search_for(pag_obj, palabras_snip)
    if len(texto_obj) >= 6:
        _agregar_search_for_en_rects(pag_obj, texto_obj[:80], rects_loc)
    return rects_loc


def _resolver_para_texto(pag_obj, words_pagina, texto_obj, modo_bloque_continuo=True):
    if not texto_obj:
        return []
    if words_pagina:
        coincidentes = _buscar_indices_coincidentes_en_streams(words_pagina, texto_obj, modo_bloque_continuo)
        if coincidentes:
            return _construir_rects_desde_indices(words_pagina, coincidentes, modo_bloque_continuo)
    return _buscar_fallbacks_search_for(pag_obj, texto_obj)


def _obtener_palabras_pagina_ordenadas(pag_obj, doc_path, p_idx):
    words_pagina = pag_obj.get_text("words")
    if not words_pagina and doc_path:
        try:
            words_pagina = obtener_palabras_cache_ocr(doc_path, p_idx) or []
        except Exception:
            words_pagina = []
    return sorted(words_pagina, key=lambda w: (w[5], w[6], w[7])) if words_pagina else []


def _resolver_snippet_fallback_pagina(doc_id, pag_ini_num, texto_snippet):
    tiene_snippet_chunk = bool(texto_snippet and len(str(texto_snippet).strip()) >= 5)
    if tiene_snippet_chunk:
        return texto_snippet, True
    if hasattr(_get_rag(), "_asegurar_documento_en_memoria"):
        _get_rag()._asegurar_documento_en_memoria(doc_id)
    chunks = _get_rag().documentos_chunks.get(doc_id, [])
    textos_pag = [
        c.get("texto_puro") or c.get("texto", "")
        for c in chunks
        if int(c.get("pagina_inicio", 0)) <= pag_ini_num <= int(c.get("pagina_fin", c.get("pagina_inicio", 0)))
    ]
    return ("\n".join(textos_pag[:3]) if textos_pag else texto_snippet), False


@eel.expose
def rag_buscar_coordenadas_fuente(pagina, texto_snippet=None, pagina_fin=None, texto_afirmacion=None):
    """Busca las coordenadas exactas de un fragmento en el PDF, priorizando la afirmación cercana, con anclas deslizantes y respaldo multi-página."""
    doc = estado_app.doc
    if not doc:
        return {"exito": False, "error": "No hay PDF activo"}
    try:
        pag_ini_num = int(pagina)
        if pag_ini_num < 1 or pag_ini_num > len(doc):
            return {"exito": False, "error": "Página fuera de rango"}

        doc_path = getattr(doc, "name", "") or ""
        doc_id = os.path.basename(doc_path) if doc_path else "documento_actual"
        texto_snippet, tiene_snippet_chunk = _resolver_snippet_fallback_pagina(doc_id, pag_ini_num, texto_snippet)
        snippet_clean = _limpiar_texto_busqueda(texto_snippet)
        afirmacion_clean = _limpiar_texto_busqueda(texto_afirmacion) if texto_afirmacion else ""

        def _buscar_rects_en_pagina(pag_1based):
            p_idx = pag_1based - 1
            if p_idx < 0 or p_idx >= len(doc):
                return []
            pag_obj = doc[p_idx]
            words_pag = _obtener_palabras_pagina_ordenadas(pag_obj, doc_path, p_idx)
            if tiene_snippet_chunk and snippet_clean:
                return _resolver_para_texto(pag_obj, words_pag, snippet_clean, modo_bloque_continuo=True)
            if afirmacion_clean and len(afirmacion_clean) >= 15:
                rects_afirm = _resolver_para_texto(pag_obj, words_pag, afirmacion_clean, modo_bloque_continuo=True)
                if rects_afirm:
                    return rects_afirm
            return _resolver_para_texto(pag_obj, words_pag, snippet_clean, modo_bloque_continuo=True)

        return _buscar_y_consolidar_coordenadas_en_paginas(
            pag_ini_num, pagina_fin, len(doc), _buscar_rects_en_pagina
        )
    except Exception as e:
        print(f"⚠️ [RAG] Error buscando coordenadas del chunk: {e}")
        return {"exito": False, "error": str(e)}
