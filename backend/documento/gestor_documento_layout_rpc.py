# LiraLoud - RPC de caché/lookahead de layout, detección de escaneo, miniaturas y lote OCR
import os
import json
import time
import base64
import threading
import pymupdf as fitz

from backend.core.webview_bridge import eel, puente_webview
from backend.core.estado_global import estado_app
from backend.core.gestor_archivos import (
    ARCHIVO_BIBLIOTECA,
    cargar_ajustes_lectura,
    validar_json,
)
from backend.core.logger_config import logger
from backend.documento.layout_engine import analizar_layout_pagina
from backend.documento.ocr_engine import (
    procesar_ocr_pagina,
    esta_en_cache_ocr,
    obtener_palabras_cache_ocr,
    es_ocr_alta_precision,
    establecer_ocr_alta_precision,
    establecer_idioma_ocr,
    renderizar_pixmap_ocr,
)
from backend.documento.ocr_modelos import listar_idiomas_ocr, modelo_ocr_descargado


def _huella_documento(ruta):
    import hashlib
    abs_p = os.path.abspath(ruta or "")
    try:
        st = os.stat(abs_p)
        raw = f"{abs_p}|{st.st_size}|{int(st.st_mtime)}"
    except OSError:
        raw = abs_p
    return hashlib.sha256(raw.encode("utf-8", errors="ignore")).hexdigest()[:24]

def _ruta_cache_layout(ruta):
    carpeta = os.path.join(estado_app.base_dir, "cache_layout")
    os.makedirs(carpeta, exist_ok=True)
    return os.path.join(carpeta, f"{_huella_documento(ruta)}.json")

def _cargar_cache_layout_disco(ruta):
    if not ruta:
        return
    try:
        p = _ruta_cache_layout(ruta)
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                estado_app.layouts_por_pagina = {
                    int(k): v for k, v in data.items() if isinstance(v, dict)
                }
                doc_key = getattr(estado_app.doc, "name", "") or ruta or "doc"
                for k, v in estado_app.layouts_por_pagina.items():
                    if isinstance(v, dict) and v.get("estructura") is not None:
                        estado_app.cache_estructura_layout[(doc_key, int(k))] = v.get("estructura")
    except Exception:
        pass

def _guardar_cache_layout_disco(ruta):
    if not ruta or getattr(estado_app, "tipo_documento", "pdf") == "texto_escrito":
        return
    try:
        p = _ruta_cache_layout(ruta)
        serializable = {str(k): v for k, v in estado_app.layouts_por_pagina.items()}
        with open(p, "w", encoding="utf-8") as f:
            json.dump(serializable, f, ensure_ascii=False)
    except Exception:
        pass

@eel.expose
def invalidar_layout_pagina(num_pagina):
    try:
        idx = int(num_pagina)
    except Exception:
        return False
    eliminado = estado_app.layouts_por_pagina.pop(idx, None) is not None
    if eliminado and estado_app.ruta_pdf_actual:
        _guardar_cache_layout_disco(estado_app.ruta_pdf_actual)
    return eliminado

@eel.expose
def iniciar_lookahead_layout(pagina_actual, total_paginas=None, auto_layout=True):
    """Worker único secuencial de precarga por ventana deslizante (N+1 a N+5)."""
    import threading
    estado_app.layout_lookahead_token += 1
    token_local = estado_app.layout_lookahead_token
    if not auto_layout or getattr(estado_app, "tipo_documento", "pdf") == "texto_escrito":
        return False
    if not estado_app.doc:
        return False

    def _worker():
        for offset in range(1, 6):
            if token_local != estado_app.layout_lookahead_token or not estado_app.doc:
                break
            sig = int(pagina_actual) + offset
            if sig < 0 or sig >= len(estado_app.doc):
                break
            if sig in estado_app.layouts_por_pagina:
                continue
            try:
                with estado_app.lock_edicion_pdf:
                    if token_local != estado_app.layout_lookahead_token or not estado_app.doc:
                        break
                    res = analizar_layout_pagina(estado_app.doc, sig)
                if isinstance(res, dict) and res.get("exito"):
                    doc_key = getattr(estado_app.doc, "name", "") or "doc"
                    estado_app.cache_estructura_layout[(doc_key, sig)] = res.get("estructura")
                    estado_app.layouts_por_pagina[sig] = {
                        "cortesV": res.get("cortesV") or [],
                        "limitesH": res.get("limitesH") or {},
                        "zonasExcluidas": res.get("zonasExcluidas") or [],
                        "estructura": res.get("estructura"),
                    }
                    _guardar_cache_layout_disco(estado_app.ruta_pdf_actual)
            except Exception:
                pass

    threading.Thread(target=_worker, daemon=True).start()
    return True

def _resolver_layout_pagina_con_cache(doc, target_num, forzar=False):
    """Consulta la caché de layout de la página o ejecuta DocLayout-YOLO y persiste el resultado."""
    doc_key = getattr(doc, "name", "") or "doc"
    if not forzar and int(target_num) in estado_app.layouts_por_pagina:
        cached = estado_app.layouts_por_pagina[int(target_num)]
        if cached.get("estructura") is not None:
            estado_app.cache_estructura_layout[(doc_key, int(target_num))] = cached.get("estructura")
            return {
                "exito": True,
                "desde_cache": True,
                "cortesV": list(cached.get("cortesV") or []),
                "limitesH": dict(cached.get("limitesH") or {}),
                "zonasExcluidas": list(cached.get("zonasExcluidas") or []),
                "estructura": cached.get("estructura"),
            }
    with estado_app.lock_edicion_pdf:
        resultado = analizar_layout_pagina(doc, target_num)
    if isinstance(resultado, dict) and resultado.get("exito"):
        estado_app.cache_estructura_layout[(doc_key, int(target_num))] = (
            resultado.get("estructura")
        )
        estado_app.layouts_por_pagina[int(target_num)] = {
            "cortesV": resultado.get("cortesV") or [],
            "limitesH": resultado.get("limitesH") or {},
            "zonasExcluidas": resultado.get("zonasExcluidas") or [],
            "estructura": resultado.get("estructura"),
        }
        _guardar_cache_layout_disco(estado_app.ruta_pdf_actual)
    return resultado

@eel.expose
def autodetectar_layout_pagina(num=None, forzar=False):
    """Ejecuta DocLayout-YOLO en la página solicitada y devuelve cortesV, limitesH y zonasExcluidas."""
    doc = estado_app.doc
    if not doc:
        return {"exito": False, "error": "No hay ningún documento abierto"}
    if getattr(estado_app, "tipo_documento", "pdf") == "texto_escrito":
        return {"exito": False, "omitido": True, "cortesV": [], "limitesH": {}, "zonasExcluidas": []}
    target_num = estado_app.pagina_actual_global if num is None else num
    try:
        return _resolver_layout_pagina_con_cache(doc, target_num, forzar=forzar)
    except Exception as e:
        logger.error(f"[DOCLAYOUT] Error al detectar layout: {e}")
        return {"exito": False, "error": str(e)}

def _tiene_texto_nativo_en_muestreo(doc, total, umbral_palabras=5):
    """Comprueba mediante muestreo distribuido (primeras páginas + puntos medios) si el PDF tiene texto digital."""
    pags_fase1 = [p for p in (0, 1, 2) if p < total]
    puntos_muestreo = []
    if total <= 4:
        puntos_muestreo = [p for p in range(total) if p not in pags_fase1]
    else:
        num_puntos = min(8, max(5, total // 15))
        for i in range(num_puntos):
            pos = max(0, min(total - 1, int((total * (i + 0.5)) / num_puntos)))
            if pos not in pags_fase1 and pos not in puntos_muestreo:
                puntos_muestreo.append(pos)

    for idx in pags_fase1 + puntos_muestreo:
        if len(doc[idx].get_text("words")) >= umbral_palabras:
            return True
    return False

@eel.expose
def detectar_si_documento_es_escaneado():
    """Detecta si el documento actual es escaneado / pura imagen mediante muestreo distribuido inteligente."""
    doc = estado_app.doc
    if not doc or len(doc) == 0:
        return {"es_escaneado": False, "total_paginas": 0}
    if getattr(estado_app, "tipo_documento", "pdf") == "texto_escrito":
        return {
            "es_escaneado": False,
            "total_paginas": len(doc),
            "doc_path": getattr(doc, "name", ""),
            "paginas_en_cache": 0,
            "completamente_cacheado": False,
        }
    try:
        total = len(doc)
        doc_path = getattr(doc, "name", "")

        try:
            bib = validar_json(ARCHIVO_BIBLIOTECA)
            if bib and doc_path in bib and bib[doc_path].get("ocr_completado", False):
                return {
                    "es_escaneado": True,
                    "total_paginas": total,
                    "doc_path": doc_path,
                    "paginas_en_cache": total,
                    "completamente_cacheado": True,
                }
        except Exception:
            pass

        if _tiene_texto_nativo_en_muestreo(doc, total):
            return {
                "es_escaneado": False,
                "total_paginas": total,
                "doc_path": doc_path,
                "paginas_en_cache": 0,
                "completamente_cacheado": False,
            }

        total_en_cache = sum(
            1 for i in range(min(total, 10)) if esta_en_cache_ocr(doc_path, i)
        )
        ya_procesado = (total_en_cache >= min(total, 10)) and esta_en_cache_ocr(
            doc_path, total - 1
        )

        return {
            "es_escaneado": True,
            "total_paginas": total,
            "doc_path": doc_path,
            "paginas_en_cache": total_en_cache,
            "completamente_cacheado": ya_procesado,
        }
    except Exception as e:
        print(f"⚠️ Error detectando tipo de documento: {e}")
        return {"es_escaneado": False, "total_paginas": len(doc) if doc else 0}

@eel.expose
def establecer_modo_ocr_precision(activo=False):
    """Activa o desactiva el modo OCR Alta Precisión para escaneos densos o texto pequeño."""
    estado_nuevo = establecer_ocr_alta_precision(bool(activo))
    return {"exito": True, "alta_precision": estado_nuevo}

@eel.expose
def establecer_idioma_ocr_rpc(idioma="latin"):
    """Actualiza el idioma/escritura del modelo RapidOCR (latin, english, chinese, eslav, arabic, etc.)."""
    idioma_norm = establecer_idioma_ocr(idioma)
    return {
        "exito": True,
        "idioma": idioma_norm,
        "descargado": modelo_ocr_descargado(idioma_norm),
    }

@eel.expose
def obtener_idiomas_ocr_rpc():
    """Devuelve el catálogo de idiomas OCR disponibles y su estado local."""
    return {"exito": True, "idiomas": listar_idiomas_ocr()}

@eel.expose
def pre_cache_ocr_pagina(num):
    """Pre-escanea en segundo plano la página indicada (Lookahead OCR de solo 1 página siguiente)."""
    doc = estado_app.doc
    if not doc or num < 0 or num >= len(doc):
        return False
    doc_path = getattr(doc, "name", "")
    if esta_en_cache_ocr(doc_path, num):
        return True

    ajustes_json = cargar_ajustes_lectura()
    if not ajustes_json.get("auto_ocr", True):
        return False

    estado_app.pre_cache_ocr_token += 1
    mi_token = estado_app.pre_cache_ocr_token

    def worker():
        time.sleep(0.35)
        if mi_token != estado_app.pre_cache_ocr_token:
            return
        try:
            with estado_app.lock_edicion_pdf:
                doc_act = estado_app.doc
                if not doc_act or num < 0 or num >= len(doc_act):
                    return
                pag = doc_act[num]
                if len(pag.get_text("words")) != 0 or esta_en_cache_ocr(doc_path, num):
                    return
                pix = renderizar_pixmap_ocr(pag)
                ancho_pdf = pag.rect.width
                alto_pdf = pag.rect.height

            if mi_token != estado_app.pre_cache_ocr_token:
                return
            procesar_ocr_pagina(
                pixmap_bytes=pix.tobytes("png"),
                ancho_pdf=ancho_pdf,
                alto_pdf=alto_pdf,
                ancho_px=pix.width,
                alto_px=pix.height,
                doc_path=doc_path,
                num_pagina=num,
                forzar=False,
            )
        except Exception as e:
            print(f"⚠️ Error en pre_cache_ocr página {num}: {e}")

    threading.Thread(target=worker, daemon=True).start()
    return True

@eel.expose
def obtener_miniatura_pagina(num):
    """Devuelve la imagen en base64 de una página a baja resolución para vistas previas ultrarrápidas."""
    doc = estado_app.doc
    if not doc or num < 0 or num >= len(doc):
        return None
    try:
        pag = doc[num]
        pix = pag.get_pixmap(matrix=fitz.Matrix(0.35, 0.35), alpha=False)
        return "data:image/jpeg;base64," + base64.b64encode(
            pix.tobytes("jpg", jpg_quality=65)
        ).decode("utf-8")
    except Exception as e:
        print(f"⚠️ Error generando miniatura de página {num}: {e}")
        return None

@eel.expose
def ejecutar_batch_ocr(inicio=0, fin=None):
    """Ejecuta el reconocimiento OCR para el rango indicado en segundo plano con notificación de progreso."""
    doc = estado_app.doc
    if not doc:
        return {"exito": False, "error": "No hay documento abierto"}

    estado_app.abortar_batch_ocr = False
    doc_path = getattr(doc, "name", "")
    total_doc = len(doc)

    inicio_idx = max(0, min(total_doc - 1, int(inicio)))
    fin_idx = (
        total_doc
        if (fin is None or fin == "" or int(fin) <= 0)
        else min(total_doc, int(fin))
    )
    if fin_idx <= inicio_idx:
        fin_idx = inicio_idx + 1

    total_rango = fin_idx - inicio_idx

    def worker_batch():
        print(
            f"⚡ [BATCH OCR] Iniciando escaneo de {total_rango} páginas (Págs. {inicio_idx + 1} a {fin_idx})..."
        )
        paginas_ocr_reales = 0
        tiempo_ocr_real_acumulado = 0.0

        for p in range(inicio_idx, fin_idx):
            if estado_app.abortar_batch_ocr:
                print(
                    f"⏹️ [BATCH OCR] Cancelado por el usuario en página {p + 1}/{fin_idx}"
                )
                break
            try:
                doc_act = estado_app.doc
                if not doc_act:
                    break
                if not esta_en_cache_ocr(doc_path, p):
                    pag = doc_act[p]
                    if len(pag.get_text("words")) == 0:
                        t_pag_ini = time.time()
                        pix = renderizar_pixmap_ocr(pag)
                        procesar_ocr_pagina(
                            pixmap_bytes=pix.tobytes("png"),
                            ancho_pdf=pag.rect.width,
                            alto_pdf=pag.rect.height,
                            ancho_px=pix.width,
                            alto_px=pix.height,
                            doc_path=doc_path,
                            num_pagina=p,
                            forzar=False,
                        )
                        dur_pag = time.time() - t_pag_ini
                        paginas_ocr_reales += 1
                        tiempo_ocr_real_acumulado += dur_pag

                paginas_hechas = (p - inicio_idx) + 1
                pct = int((paginas_hechas / total_rango) * 100)
                paginas_restantes = total_rango - paginas_hechas

                if paginas_ocr_reales > 0:
                    promedio_por_pag = tiempo_ocr_real_acumulado / paginas_ocr_reales
                else:
                    promedio_por_pag = 1.6

                segundos_est = paginas_restantes * promedio_por_pag

                if paginas_restantes <= 0:
                    tiempo_texto = "Finalizando..."
                elif segundos_est < 60:
                    tiempo_texto = f"~{int(segundos_est)}s restantes"
                elif segundos_est < 3600:
                    mins = int(segundos_est // 60)
                    segs = int(segundos_est % 60)
                    tiempo_texto = f"~{mins}m {segs}s restantes"
                else:
                    horas = int(segundos_est // 3600)
                    mins = int((segundos_est % 3600) // 60)
                    tiempo_texto = f"~{horas}h {mins}m restantes"

                if hasattr(eel, "actualizar_progreso_ocr_batch"):
                    try:
                        eel.actualizar_progreso_ocr_batch(
                            p + 1, fin_idx, pct, tiempo_texto
                        )()
                    except Exception:
                        pass
            except Exception as ex:
                print(f"⚠️ [BATCH OCR] Error en página {p}: {ex}")

        if (
            not estado_app.abortar_batch_ocr
            and doc_path
            and inicio_idx == 0
            and fin_idx >= total_doc
        ):
            try:
                bib = validar_json(ARCHIVO_BIBLIOTECA)
                if doc_path in bib:
                    bib[doc_path]["ocr_completado"] = True
                else:
                    bib[doc_path] = {"ocr_completado": True}
                with open(ARCHIVO_BIBLIOTECA, "w", encoding="utf-8") as f:
                    json.dump(bib, f, indent=4, ensure_ascii=False)
            except Exception as ex:
                print(f"⚠️ Error guardando ocr_completado: {ex}")

        if hasattr(eel, "finalizar_batch_ocr"):
            try:
                eel.finalizar_batch_ocr(not estado_app.abortar_batch_ocr)()
            except Exception:
                pass

    estado_app.hilo_batch_ocr = threading.Thread(target=worker_batch, daemon=True)
    estado_app.hilo_batch_ocr.start()
    return {
        "exito": True,
        "total": total_rango,
        "inicio": inicio_idx,
        "fin": fin_idx,
    }

@eel.expose
def cancelar_batch_ocr():
    """Cancela la ejecución del lote de OCR."""
    estado_app.abortar_batch_ocr = True
    return True
