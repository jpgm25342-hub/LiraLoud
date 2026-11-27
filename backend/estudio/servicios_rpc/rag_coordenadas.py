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
        if hasattr(_get_rag(), "_asegurar_documento_en_memoria"):
            _get_rag()._asegurar_documento_en_memoria(doc_id)
        chunks = _get_rag().documentos_chunks.get(doc_id, [])

        tiene_snippet_chunk = bool(
            texto_snippet and len(str(texto_snippet).strip()) >= 5
        )
        if not tiene_snippet_chunk:
            textos_pag = [
                c.get("texto_puro") or c.get("texto", "")
                for c in chunks
                if int(c.get("pagina_inicio", 0))
                <= pag_ini_num
                <= int(c.get("pagina_fin", c.get("pagina_inicio", 0)))
            ]
            if textos_pag:
                texto_snippet = "\n".join(textos_pag[:3])

        def _limpiar_texto_busqueda(raw_txt):
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
            limpio = re.sub(
                r"([a-zA-ZáéíóúñÁÉÍÓÚÑ])-\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ])",
                r"\1\2",
                limpio,
            )
            return limpio

        snippet_clean = _limpiar_texto_busqueda(texto_snippet)
        afirmacion_clean = _limpiar_texto_busqueda(texto_afirmacion) if texto_afirmacion else ""

        def _tokens_norm(texto):
            sin_tildes = "".join(
                ch
                for ch in unicodedata.normalize("NFKD", str(texto).lower())
                if not unicodedata.combining(ch)
            )
            return re.findall(r"[a-z0-9]+", sin_tildes)

        def _construir_stream(words_pag, omitir_superindices=False):
            toks = []
            w_map = []
            saltar_primero = False
            for idx_w, w in enumerate(words_pag):
                raw_w = str(w[4])
                if omitir_superindices:
                    alt_w = float(w[3] - w[1])
                    solo_dig = raw_w.strip().replace(",", "").replace(".", "")
                    if alt_w < 9.0 and solo_dig.isdigit() and len(solo_dig) <= 3:
                        continue
                sub = _tokens_norm(raw_w)
                if not sub:
                    continue
                if saltar_primero:
                    sub = sub[1:]
                    saltar_primero = False
                    if not sub:
                        continue
                if (
                    raw_w.rstrip().endswith("-")
                    and len(raw_w.strip()) >= 3
                    and (idx_w + 1) < len(words_pag)
                ):
                    nxt_raw = str(words_pag[idx_w + 1][4])
                    nxt_sub = _tokens_norm(nxt_raw)
                    misma_linea = (
                        words_pag[idx_w + 1][5] == w[5]
                        and words_pag[idx_w + 1][6] == w[6]
                    )
                    if nxt_sub and not misma_linea and nxt_raw[:1].islower():
                        for t in sub[:-1]:
                            toks.append(t)
                            w_map.append((idx_w,))
                        toks.append(sub[-1] + nxt_sub[0])
                        w_map.append((idx_w, idx_w + 1))
                        saltar_primero = True
                        continue
                for t in sub:
                    toks.append(t)
                    w_map.append((idx_w,))
            return toks, w_map

        def _buscar_coincidencias(snip_toks, pag_toks, w_map):
            if len(snip_toks) < 3 or len(pag_toks) < 3:
                return set()
            pos_index = defaultdict(list)
            for j, tok in enumerate(pag_toks):
                pos_index[tok].append(j)

            posiciones_fuertes = set()
            posiciones_3gram = set()

            for tam_v in [6, 5, 4]:
                if len(snip_toks) < tam_v or len(pag_toks) < tam_v:
                    continue
                for i in range(len(snip_toks) - tam_v + 1):
                    win = snip_toks[i : i + tam_v]
                    for j in pos_index.get(win[0], ()):
                        if j + tam_v <= len(pag_toks) and pag_toks[j : j + tam_v] == win:
                            for k in range(j, j + tam_v):
                                posiciones_fuertes.add(k)

            for i in range(len(snip_toks) - 2):
                win = snip_toks[i : i + 3]
                if max(len(t) for t in win) < 5 or sum(1 for t in win if len(t) >= 3) < 2:
                    continue
                for j in pos_index.get(win[0], ()):
                    if j + 3 <= len(pag_toks) and pag_toks[j : j + 3] == win:
                        cerca_ancla = (not posiciones_fuertes) or any(
                            abs(j - a) <= 45 for a in posiciones_fuertes
                        )
                        if cerca_ancla:
                            for k in range(j, j + 3):
                                posiciones_3gram.add(k)

            posiciones = posiciones_fuertes | posiciones_3gram
            if not posiciones:
                return set()

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

            w_idxs = set()
            for p in pos_filtradas:
                for wi in w_map[p]:
                    w_idxs.add(wi)
            return w_idxs

        def _buscar_rects_en_pagina(pag_1based):
            p_idx = pag_1based - 1
            if p_idx < 0 or p_idx >= len(doc):
                return []
            pag_obj = doc[p_idx]
            rects_pag = []

            def _agregar_rect_unico(coord):
                if not any(
                    abs(c[0] - coord[0]) < 1 and abs(c[1] - coord[1]) < 1
                    for c in rects_pag
                ):
                    rects_pag.append(coord)

            words_pagina = pag_obj.get_text("words")
            if not words_pagina and doc_path:
                try:
                    words_pagina = obtener_palabras_cache_ocr(doc_path, p_idx) or []
                except Exception:
                    words_pagina = []

            if words_pagina:
                words_pagina = sorted(words_pagina, key=lambda w: (w[5], w[6], w[7]))

            def _buscar_rango_continuo_anclas(snip_toks, pag_toks, w_map):
                """
                Localiza el ancla de inicio (primeras 5-7 palabras) y el ancla de fin
                (últimas 5-7 palabras) del snippet en el stream ordenado de la página,
                devolviendo todos los índices de palabras comprendidos entre ambos extremos.
                """
                n_snip = len(snip_toks)
                n_pag = len(pag_toks)
                if n_snip < 5 or n_pag < 5:
                    return set()

                pos_index = defaultdict(list)
                for j, tok in enumerate(pag_toks):
                    pos_index[tok].append(j)

                # 1. Ancla de inicio (primeras 7, 6 o 5 palabras cerca del inicio)
                pos_ini = None
                for tam in (7, 6, 5):
                    if n_snip < tam:
                        continue
                    max_off = min(10, n_snip - tam)
                    for off in range(0, max_off + 1):
                        win_ini = snip_toks[off : off + tam]
                        candidatos_ini = [
                            j
                            for j in pos_index.get(win_ini[0], ())
                            if j + tam <= n_pag and pag_toks[j : j + tam] == win_ini
                        ]
                        if candidatos_ini:
                            pos_ini = candidatos_ini[0]
                            break
                    if pos_ini is not None:
                        break

                if pos_ini is None:
                    return set()

                # 2. Ancla de fin (últimas 7, 6 o 5 palabras cerca del final)
                pos_fin_end = None
                max_span = max(int(n_snip * 2.5), 40)
                for tam in (7, 6, 5):
                    if n_snip < tam:
                        continue
                    max_back = min(10, n_snip - tam)
                    for back in range(0, max_back + 1):
                        end_i = n_snip - back
                        win_fin = snip_toks[end_i - tam : end_i]
                        candidatos_fin = [
                            j + tam - 1
                            for j in pos_index.get(win_fin[0], ())
                            if j >= pos_ini
                            and (j + tam - 1 - pos_ini) <= max_span
                            and j + tam <= n_pag
                            and pag_toks[j : j + tam] == win_fin
                        ]
                        if candidatos_fin:
                            pos_fin_end = candidatos_fin[-1]
                            break
                    if pos_fin_end is not None:
                        break

                if pos_fin_end is None or pos_fin_end < pos_ini:
                    return set()

                w_idxs = set()
                for p in range(pos_ini, pos_fin_end + 1):
                    for wi in w_map[p]:
                        w_idxs.add(wi)
                return w_idxs

            def _resolver_para_texto(texto_obj, modo_bloque_continuo=True):
                rects_loc = []

                def _add_loc(coord):
                    if not any(
                        abs(c[0] - coord[0]) < 1 and abs(c[1] - coord[1]) < 1
                        for c in rects_loc
                    ):
                        rects_loc.append(coord)

                if words_pagina and texto_obj:
                    snip_toks = _tokens_norm(texto_obj)
                    pag_toks_raw, w_map_raw = _construir_stream(
                        words_pagina, omitir_superindices=False
                    )
                    pag_toks_clean, w_map_clean = _construir_stream(
                        words_pagina, omitir_superindices=True
                    )

                    coincidentes_idxs = set()
                    if modo_bloque_continuo:
                        r_a = _buscar_rango_continuo_anclas(
                            snip_toks, pag_toks_raw, w_map_raw
                        )
                        r_b = _buscar_rango_continuo_anclas(
                            snip_toks, pag_toks_clean, w_map_clean
                        )
                        coincidentes_idxs = r_a if len(r_a) >= len(r_b) else r_b

                    # Respaldo al matcher de n-gramas si faltó alguna ancla de inicio/fin
                    if not coincidentes_idxs:
                        idxs_a = _buscar_coincidencias(snip_toks, pag_toks_raw, w_map_raw)
                        idxs_b = _buscar_coincidencias(snip_toks, pag_toks_clean, w_map_clean)
                        coincidentes_idxs = idxs_a if len(idxs_a) >= len(idxs_b) else idxs_b
                        if modo_bloque_continuo and len(coincidentes_idxs) >= 2:
                            min_i = min(coincidentes_idxs)
                            max_i = max(coincidentes_idxs)
                            # Cerrar huecos interiores del mismo bloque continuo sin extenderse desproporcionadamente
                            if (max_i - min_i) <= max(int(len(snip_toks) * 2.2), 45):
                                coincidentes_idxs = set(range(min_i, max_i + 1))

                    if coincidentes_idxs:
                        lineas_dict = {}
                        for idx in sorted(coincidentes_idxs):
                            w = words_pagina[idx]
                            key = (w[5], w[6])
                            if key not in lineas_dict:
                                lineas_dict[key] = []
                            lineas_dict[key].append((idx, w))

                        for key, items_linea in lineas_dict.items():
                            items_linea.sort(key=lambda it: it[0])
                            if modo_bloque_continuo:
                                # Una sola caja limpia y continua por línea dentro del bloque del chunk
                                l_words = [it[1] for it in items_linea]
                                _add_loc(
                                    [
                                        min(w[0] for w in l_words),
                                        min(w[1] for w in l_words),
                                        max(w[2] for w in l_words),
                                        max(w[3] for w in l_words),
                                    ]
                                )
                            else:
                                runs = [[items_linea[0]]]
                                for idx_curr, w_curr in items_linea[1:]:
                                    idx_prev, w_prev = runs[-1][-1]
                                    altura_ref = max(8.0, float(w_curr[3] - w_curr[1]))
                                    gap_words = idx_curr - idx_prev
                                    gap_px = float(w_curr[0] - w_prev[2])
                                    if gap_words <= 4 and gap_px <= (altura_ref * 4.0):
                                        runs[-1].append((idx_curr, w_curr))
                                    else:
                                        runs.append([(idx_curr, w_curr)])

                                for run in runs:
                                    l_words = [it[1] for it in run]
                                    _add_loc(
                                        [
                                            min(w[0] for w in l_words),
                                            min(w[1] for w in l_words),
                                            max(w[2] for w in l_words),
                                            max(w[3] for w in l_words),
                                        ]
                                    )

                # Fallback 1: search_for() sobre segmentos de oración
                if not rects_loc and texto_obj:
                    segmentos = [
                        s.strip()
                        for s in re.split(r"[\n\.\?!;:]+", texto_obj)
                        if len(s.strip()) >= 15
                    ]
                    for seg in segmentos[:15]:
                        sub = seg[:80].strip()
                        for r in pag_obj.search_for(sub):
                            _add_loc([r.x0, r.y0, r.x1, r.y1])

                # Fallback 2: anclas deslizantes de 5 a 7 palabras con search_for()
                if not rects_loc and texto_obj:
                    palabras_snip = re.findall(r"[^\s]+", texto_obj)
                    if len(palabras_snip) >= 5:
                        for tam_ancla in (7, 6, 5):
                            if len(palabras_snip) < tam_ancla:
                                continue
                            paso = 2 if len(palabras_snip) > 40 else 1
                            for i in range(0, len(palabras_snip) - tam_ancla + 1, paso):
                                ancla = " ".join(palabras_snip[i : i + tam_ancla]).strip()
                                if len(ancla) < 16:
                                    continue
                                for r in pag_obj.search_for(ancla):
                                    _add_loc([r.x0, r.y0, r.x1, r.y1])
                                if len(rects_loc) >= 25:
                                    break
                            if rects_loc:
                                break
                    elif len(texto_obj) >= 6:
                        for r in pag_obj.search_for(texto_obj[:80]):
                            _add_loc([r.x0, r.y0, r.x1, r.y1])

                return rects_loc

            # Prioridad 1: Cuando llega snippet de un chunk ([F#]), ignorar texto_afirmacion
            # y resaltar el bloque continuo completo del chunk en esta página.
            if tiene_snippet_chunk and snippet_clean:
                return _resolver_para_texto(snippet_clean, modo_bloque_continuo=True)

            # Prioridad 2: Solo sin snippet de chunk (modo bypass [Pág. X]), usar texto_afirmacion
            if afirmacion_clean and len(afirmacion_clean) >= 15:
                rects_afirm = _resolver_para_texto(
                    afirmacion_clean, modo_bloque_continuo=True
                )
                if rects_afirm:
                    return rects_afirm

            return _resolver_para_texto(snippet_clean, modo_bloque_continuo=True)

        return _buscar_y_consolidar_coordenadas_en_paginas(
            pag_ini_num, pagina_fin, len(doc), _buscar_rects_en_pagina
        )
    except Exception as e:
        print(f"⚠️ [RAG] Error buscando coordenadas del chunk: {e}")
        return {"exito": False, "error": str(e)}
