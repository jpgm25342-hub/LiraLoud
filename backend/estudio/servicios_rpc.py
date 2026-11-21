import os
import re
import sys
import time
import threading
import subprocess
import webbrowser
import unicodedata
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from backend.core.webview_bridge import eel
from backend.core.estado_global import estado_app
from backend.core.logger_config import logger
import backend.audio.media_control
from backend.core.utils import safe_async_run
from backend.estudio.captura_pantalla import iniciar_captura_pantalla
from backend.ia.traductor import traductor_global, IDIOMAS_SOPORTADOS
from backend.ia.rag_module import rag_global
from backend.documento.buscador_pdf import buscar_texto_en_doc
from backend.documento.procesador_texto import procesar_oraciones_de_palabras
from backend.documento.ocr_engine import obtener_palabras_cache_ocr
from backend.documento.gestor_documento_rpc import obtener_solo_texto_pagina_ligera
from backend.ia.ollama_store import (
    buscar_modelos_hf_gguf as _hf_buscar,
    iniciar_ollama_local as _iniciar_ollama,
    obtener_info_hardware_ollama as _info_hw,
    descargar_modelo_ollama as _descargar_ollama,
    cancelar_descarga_ollama as _cancelar_ollama,
    pausar_descarga_ollama as _pausar_ollama,
)

# Exponer captura de pantalla OCR
eel.expose(iniciar_captura_pantalla)


# ==========================================
# 1. CONTROL MULTIMEDIA (SMTC) Y AUDIO DUCKING
# ==========================================
@eel.expose
def system_media_play_pause():
    safe_async_run(backend.audio.media_control.media_controller.toggle_play_pause())


@eel.expose
def system_media_next():
    safe_async_run(backend.audio.media_control.media_controller.skip_next())


@eel.expose
def system_media_prev():
    if backend.audio.media_control.WINSDK_AVAILABLE:
        safe_async_run(backend.audio.media_control.media_controller.skip_previous())


@eel.expose
def system_media_status():
    if backend.audio.media_control.WINSDK_AVAILABLE:
        return safe_async_run(
            backend.audio.media_control.media_controller.get_playback_status()
        )
    return False


@eel.expose
def backend_trigger_duck():
    backend.audio.media_control.trigger_duck()


@eel.expose
def backend_trigger_unduck():
    backend.audio.media_control.trigger_unduck()


@eel.expose
def set_persistent_duck(active, nivel):
    if active:
        duck_level = float(nivel) / 100.0
        safe_async_run(
            backend.audio.media_control.media_controller.apply_persistent_duck(duck_level)
        )
    else:
        safe_async_run(
            backend.audio.media_control.media_controller.remove_persistent_duck()
        )


# ==========================================
# 2. UTILIDADES DE SISTEMA, LOGS Y DOCUMENTOS LEGALES
# ==========================================
@eel.expose
def abrir_enlace_externo(url):
    """Abre un enlace web seguro en el navegador predeterminado del usuario."""
    try:
        if url and (url.startswith("http://") or url.startswith("https://")):
            webbrowser.open(url)
            return {"exito": True}
        return {"exito": False, "error": "URL no válida"}
    except Exception as e:
        return {"exito": False, "error": str(e)}


@eel.expose
def abrir_documento_legal(nombre_archivo):
    base_dir = estado_app.base_dir
    ruta_raiz = os.path.join(base_dir, nombre_archivo)
    ruta_web = os.path.join(base_dir, "web", nombre_archivo)
    ruta_final = ruta_web if os.path.exists(ruta_web) else ruta_raiz

    if os.path.exists(ruta_final):
        try:
            if sys.platform == "win32":
                os.startfile(ruta_final)
            elif sys.platform == "darwin":
                subprocess.Popen(["open", ruta_final])
            else:
                subprocess.Popen(["xdg-open", ruta_final])
        except Exception as e:
            print(f"Error al abrir {nombre_archivo}: {e}")
    else:
        print(f"No se encontró el archivo: {nombre_archivo}")


@eel.expose
def ping_heartbeat(cliente_info=None):
    """Stub pasivo de compatibilidad con pywebview."""
    return {"status": "alive"}


@eel.expose
def registrar_log_frontend(nivel, mensaje, stack=None):
    """Recibe errores y advertencias desde JavaScript y los guarda en app.log."""
    texto = f"[FRONTEND] {mensaje}"
    if stack:
        texto += f"\nStack: {stack}"
    if nivel == "error":
        logger.error(texto)
    elif nivel == "warn":
        logger.warning(texto)
    else:
        logger.info(texto)


# ==========================================
# 3. TIENDA OLLAMA / MODELOS HUGGING FACE GGUF
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


# ==========================================
# 4. BÚSQUEDA AVANZADA Y TRADUCCIÓN
# ==========================================
@eel.expose
def buscar_texto_avanzado(query):
    return buscar_texto_en_doc(estado_app.doc, query)


@eel.expose
def pretraducir_bloque_paginas(
    num_pagina_central,
    origen="auto",
    destino="es",
    motor="online",
    incluir_adyacentes=True,
):
    """Pre-traduce en segundo plano las oraciones de la página actual y adyacentes."""
    if not estado_app.doc:
        return

    estado_app.abortar_pretraduccion = True

    def worker_traduccion():
        time.sleep(0.08)
        estado_app.abortar_pretraduccion = False

        doc = estado_app.doc
        if not doc:
            return
        total = len(doc)
        if num_pagina_central < 0 or num_pagina_central >= total:
            return

        orden = [num_pagina_central]
        if incluir_adyacentes:
            if num_pagina_central + 1 < total:
                orden.append(num_pagina_central + 1)
            if num_pagina_central - 1 >= 0:
                orden.append(num_pagina_central - 1)

        print(
            f"🌐 [PRE-TRADUCCIÓN NITRO] Procesando bloque en orden: {orden} ({origen} ➔ {destino}, motor: {motor})"
        )

        for p_num in orden:
            if estado_app.abortar_pretraduccion:
                print("🛑 [PRE-TRADUCCIÓN] Cancelada por cambio de página.")
                return

            frases = obtener_solo_texto_pagina_ligera(p_num, None)
            frases_a_traducir = []

            for frase in frases:
                if not frase or not isinstance(frase, str) or not frase.strip():
                    continue
                txt_limpio = frase.strip()
                key = traductor_global._generar_key(txt_limpio, origen, destino)
                cached_val = traductor_global.cache.get(key)
                if not cached_val or not traductor_global._es_traduccion_valida(
                    txt_limpio, cached_val, origen, destino
                ):
                    frases_a_traducir.append(txt_limpio)

            if frases_a_traducir:

                def _traducir_tarea(txt):
                    if estado_app.abortar_pretraduccion:
                        return
                    try:
                        traductor_global.traducir(txt, origen, destino, motor)
                    except Exception as err:
                        print(f"⚠️ [PRE-TRADUCCIÓN] Error en frase: {err}")

                with ThreadPoolExecutor(max_workers=4) as pool:
                    futures = [pool.submit(_traducir_tarea, t) for t in frases_a_traducir]
                    for f in futures:
                        if estado_app.abortar_pretraduccion:
                            pool.shutdown(wait=False, cancel_futures=True)
                            return
                        try:
                            f.result()
                        except Exception:
                            pass

            traductor_global._guardar_cache()
            print(f"✨ [PRE-TRADUCCIÓN] Hoja {p_num} traducida y lista.")

        print(f"✅ [PRE-TRADUCCIÓN] Bloque completo de páginas {orden} 100% listo.")

    estado_app.hilo_pretraduccion_actual = threading.Thread(
        target=worker_traduccion, daemon=True
    )
    estado_app.hilo_pretraduccion_actual.start()


@eel.expose
def traducir_texto_backend(texto, origen="auto", destino="es", motor="hibrido"):
    print(f"🌐 [TRADUCTOR ENTRADA] ({origen} -> {destino} | {motor}): '{texto[:60]}...'")
    res = traductor_global.traducir(texto, origen, destino, motor)
    print(
        f"🌐 [TRADUCTOR SALIDA] ({res.get('motor_usado', motor)}): '{res.get('traducido', '')[:60]}...'"
    )
    return {
        "texto_traducido": res.get("traducido", texto),
        "traducido": res.get("traducido", texto),
        "origen_detectado": res.get("origen", origen),
        "destino": res.get("destino", destino),
        "motor_usado": res.get("motor_usado", motor),
        "exito": res.get("exito", False),
    }


@eel.expose
def obtener_catalogo_idiomas_traduccion():
    return IDIOMAS_SOPORTADOS


@eel.expose
def limpiar_cache_traducciones():
    """Limpia la memoria RAM y el archivo de disco de la caché de traducciones."""
    return traductor_global.limpiar_cache()


# ==========================================
# 5. MÓDULO RAG DE INTELIGENCIA ARTIFICIAL (LIRA AI)
# ==========================================
@eel.expose
def rag_verificar_estado():
    """Retorna el diagnóstico completo de Ollama, modelos y ChromaDB."""
    return rag_global.verificar_estado_ia()


@eel.expose
def rag_indexar_documento_actual(dict_activo=None):
    """Extrae todas las oraciones del PDF actualmente abierto y las ingesta en ChromaDB."""
    doc = estado_app.doc
    if not doc:
        return {
            "exito": False,
            "error": "No hay ningún documento PDF abierto en LiraLoud.",
        }

    doc_id = (
        os.path.basename(doc.name) if (doc and doc.name) else "documento_actual"
    )
    todas_oraciones = []
    bloques_paginas_texto = []

    try:
        total_pags = len(doc)
        for num_pag in range(total_pags):
            pag = doc[num_pag]
            texto_raw_pag = pag.get_text("text").strip()
            if texto_raw_pag:
                bloques_paginas_texto.append(
                    f"--- PÁGINA {num_pag + 1} ---\n{texto_raw_pag}"
                )

            palabras_raw = pag.get_text("words", sort=True)
            if not palabras_raw:
                try:
                    palabras_raw = (
                        obtener_palabras_cache_ocr(getattr(doc, "name", ""), num_pag)
                        or []
                    )
                except Exception:
                    palabras_raw = []
            if not palabras_raw:
                continue

            filtros_rag_integros = {
                "chk-urls": False,
                "chk-paren": False,
                "chk-corch": False,
                "chk-llaves": False,
                "chk-barras": False,
                "chk-referencias": False,
                "usarBloquesNativos": True,
                "sensibilidadSalto": 0.5,
                "detectarSangria": True,
            }
            oraciones_pag = procesar_oraciones_de_palabras(
                palabras_raw, {}, filtros_externos=filtros_rag_integros
            )
            for o in oraciones_pag:
                t = (
                    o.get("texto", "").strip()
                    if isinstance(o, dict)
                    else str(o).strip()
                )
                if t:
                    todas_oraciones.append({"pagina": num_pag + 1, "texto": t})

        if not todas_oraciones and not bloques_paginas_texto:
            return {
                "exito": False,
                "error": "No se encontraron oraciones legibles en el PDF.",
            }

        texto_completo_doc = (
            "\n\n".join(bloques_paginas_texto) if bloques_paginas_texto else None
        )

        res = rag_global.ingestar_documento(
            doc_id=doc_id,
            lista_oraciones=todas_oraciones,
            limite_chars=1200,
            metadata_extra={"nombre_archivo": doc_id, "total_paginas": total_pags},
            texto_completo=texto_completo_doc,
        )
        rag_global._docs_integros = getattr(rag_global, "_docs_integros", set())
        rag_global._docs_integros.add(doc_id)
        return res
    except Exception as e:
        print(f"❌ [RAG] Error indexando documento: {e}")
        return {"exito": False, "error": str(e)}


@eel.expose
def rag_buscar_coordenadas_fuente(pagina, texto_snippet=None):
    """Busca las coordenadas exactas de las líneas de un chunk en una página de PDF."""
    doc = estado_app.doc
    if not doc:
        return {"exito": False, "error": "No hay PDF activo"}
    try:
        pag_idx = int(pagina) - 1
        if pag_idx < 0 or pag_idx >= len(doc):
            return {"exito": False, "error": "Página fuera de rango"}

        pag = doc[pag_idx]
        doc_path = getattr(doc, "name", "") or ""
        doc_id = os.path.basename(doc_path) if doc_path else "documento_actual"
        chunks = rag_global.documentos_chunks.get(doc_id, [])

        if not texto_snippet or len(str(texto_snippet).strip()) < 5:
            textos_pag = [
                c.get("texto_puro") or c.get("texto", "")
                for c in chunks
                if int(c.get("pagina_inicio", 0))
                <= int(pagina)
                <= int(c.get("pagina_fin", c.get("pagina_inicio", 0)))
            ]
            if textos_pag:
                texto_snippet = "\n".join(textos_pag[:3])

        snippet_clean = re.sub(
            r"\[(?:Pág|Págs|Pag|Pags|Página|Páginas|Fragmento|Sección)[^\]]*\]",
            " ",
            str(texto_snippet or ""),
            flags=re.IGNORECASE,
        ).strip()
        snippet_clean = re.sub(
            r"([a-zA-ZáéíóúñÁÉÍÓÚÑ])-\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ])",
            r"\1\2",
            snippet_clean,
        )

        words_pagina = pag.get_text("words")
        if not words_pagina and doc_path:
            try:
                words_pagina = obtener_palabras_cache_ocr(doc_path, pag_idx) or []
            except Exception:
                words_pagina = []

        if words_pagina:
            words_pagina = sorted(words_pagina, key=lambda w: (w[5], w[6], w[7]))

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

        todos_rects = []

        if words_pagina and snippet_clean:
            snip_toks = _tokens_norm(snippet_clean)
            pag_toks_raw, w_map_raw = _construir_stream(
                words_pagina, omitir_superindices=False
            )
            pag_toks_clean, w_map_clean = _construir_stream(
                words_pagina, omitir_superindices=True
            )

            idxs_a = _buscar_coincidencias(snip_toks, pag_toks_raw, w_map_raw)
            idxs_b = _buscar_coincidencias(snip_toks, pag_toks_clean, w_map_clean)
            coincidentes_idxs = idxs_a if len(idxs_a) >= len(idxs_b) else idxs_b

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
                        todos_rects.append(
                            [
                                min(w[0] for w in l_words),
                                min(w[1] for w in l_words),
                                max(w[2] for w in l_words),
                                max(w[3] for w in l_words),
                            ]
                        )

        if not todos_rects and snippet_clean:
            segmentos = [
                s.strip()
                for s in re.split(r"[\n\.\?!;:]+", snippet_clean)
                if len(s.strip()) >= 20
            ]
            for seg in segmentos[:15]:
                sub = seg[:80].strip()
                rects = pag.search_for(sub)
                if not rects:
                    palabras_seg = re.findall(r"\b[\wáéíóúñÁÉÍÓÚÑ-]{2,}\b", seg)
                    if len(palabras_seg) >= 4:
                        frase = " ".join(palabras_seg[:5])
                        if len(frase) >= 20:
                            rects = pag.search_for(frase)

                for r in rects:
                    coord = [r.x0, r.y0, r.x1, r.y1]
                    if not any(
                        abs(c[0] - coord[0]) < 1 and abs(c[1] - coord[1]) < 1
                        for c in todos_rects
                    ):
                        todos_rects.append(coord)

        if not todos_rects:
            return {
                "exito": False,
                "pagina": int(pagina),
                "error": "Fragmento no localizado exactamente en esta página",
            }

        todos_rects.sort(key=lambda r: (r[1], r[0]))
        min_x0 = min(r[0] for r in todos_rects)
        min_y0 = min(r[1] for r in todos_rects)
        max_x1 = max(r[2] for r in todos_rects)
        max_y1 = max(r[3] for r in todos_rects)
        bbox = [min_x0, min_y0, max_x1, max_y1]

        return {
            "exito": True,
            "pagina": int(pagina),
            "rects": todos_rects,
            "coords": todos_rects[0],
            "bbox": bbox,
        }
    except Exception as e:
        print(f"⚠️ [RAG] Error buscando coordenadas del chunk: {e}")
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

    docs_integros = getattr(rag_global, "_docs_integros", set())
    if (
        not ignorar_pdf
        and doc
        and (
            doc_id not in rag_global.documentos_chunks or doc_id not in docs_integros
        )
    ):
        try:
            rag_indexar_documento_actual()
        except Exception as e:
            print(f"⚠️ [RAG] Auto-indexación preventiva: {e}")

    rag_global.stream_callback = lambda txt_parcial: eel.recibirStreamIA(
        "chat", txt_parcial
    )()
    try:
        return rag_global.preguntar_al_documento(
            doc_id=doc_id,
            pregunta=pregunta,
            top_k=int(top_k),
            modo_salida=modo_salida,
            contexto_extra=contexto_extra,
            ignorar_pdf=ignorar_pdf,
        )
    finally:
        rag_global.stream_callback = None


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

    docs_integros = getattr(rag_global, "_docs_integros", set())
    if (
        not ignorar_pdf
        and doc
        and (
            doc_id not in rag_global.documentos_chunks or doc_id not in docs_integros
        )
    ):
        try:
            rag_indexar_documento_actual()
        except Exception as e:
            print(f"⚠️ [RAG] Auto-indexación preventiva: {e}")

    rag_global.stream_callback = lambda txt_parcial: eel.recibirStreamIA(
        "solicitud", txt_parcial
    )()
    try:
        if tipo_solicitud == "academico":
            return rag_global.resumir_documento(
                doc_id=doc_id, enfoque="academico", modo_salida=modo_salida
            )
        elif tipo_solicitud == "resumen":
            return rag_global.resumir_documento(
                doc_id=doc_id, enfoque="general", modo_salida=modo_salida
            )
        elif tipo_solicitud in ["conceptos", "glosario"]:
            return rag_global.preguntar_al_documento(
                doc_id=doc_id,
                pregunta="",
                tipo_solicitud="conceptos",
                modo_salida=modo_salida,
                contexto_extra=contexto_extra,
                ignorar_pdf=ignorar_pdf,
            )
        elif tipo_solicitud == "conclusiones":
            return rag_global.preguntar_al_documento(
                doc_id=doc_id,
                pregunta="",
                tipo_solicitud="conclusiones",
                modo_salida=modo_salida,
                contexto_extra=contexto_extra,
                ignorar_pdf=ignorar_pdf,
            )
        elif tipo_solicitud == "analisis_critico":
            return rag_global.preguntar_al_documento(
                doc_id=doc_id,
                pregunta="",
                tipo_solicitud="analisis_critico",
                modo_salida=modo_salida,
                contexto_extra=contexto_extra,
                ignorar_pdf=ignorar_pdf,
            )
        elif tipo_solicitud == "flashcards":
            prompt_flashcards = (
                "Genera 5 preguntas clave de autoevaluación o estudio con sus respectivas respuestas detalladas basadas exclusivamente en el documento y fuentes provistas.\n"
                "Formato:\n"
                "**Pregunta 1:** [Pregunta clave] `[Pág. X]`\n"
                "**Respuesta 1:** [Respuesta completa y fundamentada]\n"
                "(Continúa con las preguntas 2 a 5)."
            )
            return rag_global.preguntar_al_documento(
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
        return rag_global.preguntar_al_documento(
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
    finally:
        rag_global.stream_callback = None


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
        "historial": rag_global.obtener_historial_chat(doc_id),
    }


@eel.expose
def rag_limpiar_historial_chat(doc_id=None):
    """Limpia el historial de conversación del documento actual."""
    doc = estado_app.doc
    if not doc_id:
        doc_id = (
            os.path.basename(doc.name) if (doc and doc.name) else "documento_actual"
        )
    rag_global.limpiar_historial_chat(doc_id)
    return {"exito": True, "doc_id": doc_id}


@eel.expose
def rag_cambiar_modelos(chat_model=None, embed_model=None):
    """Actualiza los modelos en la instancia global de RAG."""
    if chat_model:
        rag_global.chat_model = chat_model
    if embed_model:
        rag_global.embed_model = embed_model
    return {
        "exito": True,
        "chat_model": rag_global.chat_model,
        "embed_model": rag_global.embed_model,
    }


@eel.expose
def rag_configurar_proveedor(proveedor, api_key=None, modelo_cloud=None):
    """Configura el proveedor de IA activo (ollama, gemini, groq, openai, deepseek) y sus credenciales locales."""
    return rag_global.configurar_proveedor(
        proveedor=proveedor, api_key=api_key or "", modelo_cloud=modelo_cloud or ""
    )


@eel.expose
def rag_verificar_conexion_cloud(proveedor, api_key=None, modelo_cloud=None):
    """Verifica la conexión con la API en la nube del proveedor especificado."""
    return rag_global.verificar_conexion_cloud(
        proveedor=proveedor, api_key=api_key or "", modelo=modelo_cloud or ""
    )


@eel.expose
def rag_obtener_modelos_proveedor(proveedor, api_key=None):
    """Consulta en tiempo real la lista de modelos activos y soportados directamente por la API del proveedor."""
    return rag_global.obtener_modelos_disponibles(
        proveedor=proveedor, api_key=api_key or ""
    )


@eel.expose
def rag_obtener_estadisticas_tokens(proveedor=None):
    """Retorna las estadísticas en tiempo real del uso y límite de tokens para el proveedor consultado."""
    return rag_global.obtener_estadisticas_tokens(proveedor=proveedor)


@eel.expose
def rag_sincronizar_tokens_api(proveedor=None, api_key=None):
    """Sincroniza y consulta en tiempo real los límites y tokens consumidos directamente con la API del proveedor."""
    return rag_global.sincronizar_tokens_api(
        proveedor=proveedor, api_key=api_key or ""
    )


@eel.expose
def rag_contar_tokens_gemini(texto, modelo=None, api_key=None):
    """Calcula el número exacto de tokens usando el endpoint oficial :countTokens de Google Gemini."""
    return rag_global.contar_tokens_gemini(
        texto=texto, modelo=modelo, api_key=api_key
    )
