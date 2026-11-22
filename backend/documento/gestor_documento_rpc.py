import os
import re
import sys
import gc
import json
import time
import base64
import shutil
import ctypes
import threading
import webview
import pymupdf as fitz

from backend.core.webview_bridge import eel, puente_webview
from backend.core.estado_global import estado_app
from backend.core.logger_config import logger
from backend.documento.docx_engine import convertir_word_a_pdf, preparar_documento_como_pdf
from backend.documento.ocr_engine import (
    procesar_ocr_pagina,
    esta_en_cache_ocr,
    obtener_palabras_cache_ocr,
)
from backend.documento.layout_engine import analizar_layout_pagina
from backend.core.gestor_archivos import (
    cargar_ajustes_lectura,
    validar_json,
    ARCHIVO_BIBLIOTECA,
)
from backend.documento.procesador_texto import (
    organizar_palabras_con_cortes_y_limites,
    procesar_oraciones_de_palabras,
    aplicar_reemplazos,
)
from backend.documento.edicion_pdf import (
    asegurar_permiso_escritura,
    agregar_anotacion_freetext as _agregar_freetext,
    agregar_subrayados_lote as _agregar_subrayados_lote,
    eliminar_subrayados_area as _eliminar_subrayados_area,
    eliminar_subrayado_punto as _eliminar_subrayado_punto,
    obtener_todos_subrayados as _obtener_todos_subrayados,
    obtener_todos_subrayados_biblioteca as _obtener_todos_subrayados_biblioteca,
    obtener_bloques_texto_pagina as _obtener_bloques_texto_pagina,
    editar_texto_pdf as _editar_texto_pdf,
)
from backend.documento.gestor_fuentes import (
    listar_fuentes_editor as _listar_fuentes_editor,
    descargar_fuente_editor as _descargar_fuente_editor,
)


def _asegurar_doc_abierto(pdf_path):
    """Garantiza que estado_app.doc esté abierto y apunte al pdf_path actual."""
    if (
        (estado_app.doc is None or getattr(estado_app.doc, "is_closed", False))
        and pdf_path
        and os.path.exists(pdf_path)
    ):
        asegurar_permiso_escritura(pdf_path)
        estado_app.doc = fitz.open(pdf_path)
        estado_app.ruta_pdf_actual = pdf_path
    return estado_app.doc


def _ejecutar_full_save_seguro(pdf_path, res_original):
    """Realiza el guardado completo protegido por Lock y autocuración de estado_app.doc."""
    with estado_app.lock_edicion_pdf:
        temp_path = pdf_path + ".tmp"
        try:
            asegurar_permiso_escritura(pdf_path)
            _asegurar_doc_abierto(pdf_path)
            if estado_app.doc is None:
                return {
                    "success": False,
                    "error": "No se pudo abrir el documento PDF en memoria.",
                }

            estado_app.doc.save(temp_path, garbage=1, deflate=True)
            estado_app.doc.close()
            estado_app.doc = None

            asegurar_permiso_escritura(pdf_path)
            shutil.move(temp_path, pdf_path)
            estado_app.doc = fitz.open(pdf_path)
            estado_app.ruta_pdf_actual = pdf_path

            salida = {"success": True}
            if isinstance(res_original, dict) and "id_borrado" in res_original:
                salida["id_borrado"] = res_original.get("id_borrado")
            return salida
        except Exception as e:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
            try:
                if estado_app.doc is None and pdf_path and os.path.exists(pdf_path):
                    estado_app.doc = fitz.open(pdf_path)
                    estado_app.ruta_pdf_actual = pdf_path
            except Exception:
                pass
            return {"success": False, "error": str(e)}


# ==========================================
# 1. EDICIÓN Y ANOTACIONES PDF
# ==========================================
@eel.expose
def agregar_anotacion_freetext(pdf_path, pagina_idx, bbox, texto, config_fuente):
    with estado_app.lock_edicion_pdf:
        _asegurar_doc_abierto(pdf_path)
        res = _agregar_freetext(
            pdf_path, pagina_idx, bbox, texto, config_fuente, doc_obj=estado_app.doc
        )
        if not res.get("success") and res.get("error") == "NEEDS_FULL_SAVE":
            return _ejecutar_full_save_seguro(pdf_path, res)
        return res


@eel.expose
def agregar_subrayados_lote(
    pdf_path,
    pagina_idx,
    coordenadas_list,
    color_hex,
    id_anotacion=None,
    texto_extraido=None,
):
    with estado_app.lock_edicion_pdf:
        _asegurar_doc_abierto(pdf_path)
        res = _agregar_subrayados_lote(
            pdf_path,
            pagina_idx,
            coordenadas_list,
            color_hex,
            id_anotacion,
            texto_extraido,
            doc_obj=estado_app.doc,
        )
        if not res.get("success") and res.get("error") == "NEEDS_FULL_SAVE":
            return _ejecutar_full_save_seguro(pdf_path, res)
        return res


@eel.expose
def eliminar_subrayados_area(pdf_path, pagina_idx, x0, y0, x1, y1):
    with estado_app.lock_edicion_pdf:
        _asegurar_doc_abierto(pdf_path)
        res = _eliminar_subrayados_area(
            pdf_path, pagina_idx, x0, y0, x1, y1, doc_obj=estado_app.doc
        )
        if not res.get("success") and res.get("error") == "NEEDS_FULL_SAVE":
            return _ejecutar_full_save_seguro(pdf_path, res)
        return res


@eel.expose
def eliminar_subrayado_punto(pdf_path, pagina_idx, x, y):
    with estado_app.lock_edicion_pdf:
        _asegurar_doc_abierto(pdf_path)
        res = _eliminar_subrayado_punto(
            pdf_path, pagina_idx, x, y, doc_obj=estado_app.doc
        )
        if not res.get("success") and res.get("error") == "NEEDS_FULL_SAVE":
            return _ejecutar_full_save_seguro(pdf_path, res)
        return res


@eel.expose
def obtener_todos_subrayados(pdf_path):
    with estado_app.lock_edicion_pdf:
        _asegurar_doc_abierto(pdf_path)
        return _obtener_todos_subrayados(pdf_path, doc_obj=estado_app.doc)


@eel.expose
def obtener_todos_subrayados_biblioteca(rutas_pdfs=None):
    return _obtener_todos_subrayados_biblioteca(rutas_pdfs)


@eel.expose
def obtener_bloques_texto_pagina(pdf_path, pagina_idx):
    with estado_app.lock_edicion_pdf:
        _asegurar_doc_abierto(pdf_path)
        return _obtener_bloques_texto_pagina(
            pdf_path, pagina_idx, doc_obj=estado_app.doc
        )


@eel.expose
def editar_texto_pdf(pdf_path, pagina_idx, datos):
    with estado_app.lock_edicion_pdf:
        _asegurar_doc_abierto(pdf_path)
        res = _editar_texto_pdf(
            pdf_path, pagina_idx, datos, doc_obj=estado_app.doc
        )
        if not res.get("success") and res.get("error") == "NEEDS_FULL_SAVE":
            res = _ejecutar_full_save_seguro(pdf_path, res)
        invalidar_layout_pagina(pagina_idx)
        return res


@eel.expose
def crear_cuadro_texto_pdf(pdf_path, pagina_idx, bbox):
    """Crea un cuadro de texto libre (FreeText annotation) en la posición indicada."""
    with estado_app.lock_edicion_pdf:
        _asegurar_doc_abierto(pdf_path)
        res = _agregar_freetext(
            pdf_path,
            pagina_idx,
            bbox,
            " ",
            {
                "fuente": "helv",
                "tamano": 12,
                "color": "#000000",
                "negrita": False,
                "cursiva": False,
            },
            doc_obj=estado_app.doc,
        )
        if not res.get("success") and res.get("error") == "NEEDS_FULL_SAVE":
            res = _ejecutar_full_save_seguro(pdf_path, res)
        invalidar_layout_pagina(pagina_idx)
        return res


@eel.expose
def listar_fuentes_editor():
    """Lista las fuentes instaladas (local/sistema) y descargables del catálogo para el editor PDF."""
    return _listar_fuentes_editor()


@eel.expose
def descargar_fuente_editor(nombre_familia):
    """Descarga una familia tipográfica oficial a recursos/fuentes/ y refresca la caché de fuentes."""
    with estado_app.lock_edicion_pdf:
        return _descargar_fuente_editor(nombre_familia)


# ==========================================
# 2. CARGA Y SELECCIÓN DE DOCUMENTOS (PDF / EPUB / WORD / IMÁGENES)
# ==========================================
@eel.expose
def cargar_documento(ruta, tipo_documento=None):
    """Carga un PDF (o EPUB, Word o Imagen convertidos) directamente desde una ruta, sin diálogo."""
    if estado_app.doc:
        try:
            estado_app.doc.close()
        except Exception:
            pass
        estado_app.doc = None
        gc.collect()

    estado_app.tipo_documento = str(tipo_documento or "pdf")
    estado_app.cache_estructura_layout = {}
    estado_app.layouts_por_pagina = {}
    estado_app.layout_lookahead_token += 1

    if ruta and os.path.exists(ruta):
        try:
            asegurar_permiso_escritura(ruta)
            ruta = preparar_documento_como_pdf(ruta)
            asegurar_permiso_escritura(ruta)
            estado_app.doc = fitz.open(ruta)
            estado_app.ruta_pdf_actual = ruta
            if estado_app.tipo_documento != "texto_escrito":
                _cargar_cache_layout_disco(ruta)
            return True
        except Exception as e:
            print(f"🔥 Error cargando documento {ruta}: {e}")
            return False
    return False


def _dialogo_archivo_nativo():
    """Abre el explorador de archivos nativo con latencia ultrabaja (<50ms)."""
    if sys.platform == "win32":
        try:
            from ctypes import wintypes

            class OPENFILENAME(ctypes.Structure):
                _fields_ = [
                    ("lStructSize", wintypes.DWORD),
                    ("hwndOwner", wintypes.HWND),
                    ("hInstance", wintypes.HINSTANCE),
                    ("lpstrFilter", wintypes.LPCWSTR),
                    ("lpstrCustomFilter", wintypes.LPWSTR),
                    ("nMaxCustFilter", wintypes.DWORD),
                    ("nFilterIndex", wintypes.DWORD),
                    ("lpstrFile", wintypes.LPWSTR),
                    ("nMaxFile", wintypes.DWORD),
                    ("lpstrFileTitle", wintypes.LPWSTR),
                    ("nMaxFileTitle", wintypes.DWORD),
                    ("lpstrInitialDir", wintypes.LPCWSTR),
                    ("lpstrTitle", wintypes.LPCWSTR),
                    ("Flags", wintypes.DWORD),
                    ("nFileOffset", wintypes.WORD),
                    ("nFileExtension", wintypes.WORD),
                    ("lpstrDefExt", wintypes.LPCWSTR),
                    ("lCustData", wintypes.LPARAM),
                    ("lpfnHook", ctypes.c_void_p),
                    ("lpTemplateName", wintypes.LPCWSTR),
                    ("pvReserved", ctypes.c_void_p),
                    ("dwReserved", wintypes.DWORD),
                    ("FlagsEx", wintypes.DWORD),
                ]

            buffer = ctypes.create_unicode_buffer(1024)
            filtro = (
                "Todos los compatibles (*.pdf, *.epub, *.docx, *.doc, *.jpg, *.png, *.webp)\0"
                "*.pdf;*.epub;*.fb2;*.cbz;*.docx;*.doc;*.jpg;*.jpeg;*.png;*.webp;*.bmp;*.tif;*.tiff\0"
                "Archivos PDF (*.pdf)\0*.pdf\0"
                "Libros EPUB y eBooks (*.epub, *.fb2, *.cbz)\0*.epub;*.fb2;*.cbz\0"
                "Archivos Word (*.docx, *.doc)\0*.docx;*.doc\0"
                "Imágenes (*.jpg, *.jpeg, *.png, *.webp, *.bmp, *.tiff)\0*.jpg;*.jpeg;*.png;*.webp;*.bmp;*.tif;*.tiff\0"
                "Todos los archivos (*.*)\0*.*\0\0"
            )

            ofn = OPENFILENAME()
            ofn.lStructSize = ctypes.sizeof(OPENFILENAME)
            ofn.lpstrFilter = filtro
            ofn.lpstrFile = ctypes.cast(buffer, wintypes.LPWSTR)
            ofn.nMaxFile = 1024
            ofn.lpstrTitle = "Seleccionar Documento o Imagen - LiraLoud"
            ofn.Flags = 0x00001000 | 0x00000800 | 0x00000008

            try:
                ofn.hwndOwner = ctypes.windll.user32.GetForegroundWindow()
            except Exception:
                ofn.hwndOwner = None

            if ctypes.windll.comdlg32.GetOpenFileNameW(ctypes.byref(ofn)):
                return buffer.value
            return None
        except Exception as ex_win:
            print(f"⚠️ Fallback a pywebview tras aviso en diálogo nativo: {ex_win}")

    try:
        if puente_webview.ventana:
            rutas = puente_webview.ventana.create_file_dialog(
                webview.FileDialog.OPEN,
                allow_multiple=False,
                file_types=(
                    "Todos los compatibles (*.pdf;*.epub;*.fb2;*.cbz;*.docx;*.doc;*.jpg;*.jpeg;*.png;*.webp;*.bmp;*.tif;*.tiff)",
                    "Archivos PDF (*.pdf)",
                    "Libros EPUB y eBooks (*.epub;*.fb2;*.cbz)",
                    "Archivos Word (*.docx;*.doc)",
                    "Imágenes (*.jpg;*.jpeg;*.png;*.webp;*.bmp;*.tif;*.tiff)",
                    "Todos los archivos (*.*)",
                ),
            )
            if isinstance(rutas, (tuple, list)):
                return rutas[0] if rutas else None
            return rutas
    except Exception as ex_wv:
        print(f"⚠️ Error en selector de archivos fallback pywebview: {ex_wv}")
        return None
    return None


@eel.expose
def seleccionar_archivo():
    if estado_app.doc:
        try:
            estado_app.doc.close()
        except Exception:
            pass
        estado_app.doc = None
        gc.collect()

    ruta = _dialogo_archivo_nativo()

    if ruta and os.path.exists(ruta):
        try:
            asegurar_permiso_escritura(ruta)
            ruta_pdf = preparar_documento_como_pdf(ruta)
            asegurar_permiso_escritura(ruta_pdf)
            estado_app.doc = fitz.open(ruta_pdf)
            estado_app.ruta_pdf_actual = ruta_pdf
            return ruta_pdf
        except Exception as e:
            print(f"🔥 Error abriendo documento: {e}")
            return None
    return None


# ==========================================
# 3. RENDERIZADO DE PÁGINAS, LAYOUT Y OCR
# ==========================================
@eel.expose
def obtener_vista_rapida_pagina(num, incluir_palabras=False):
    """Devuelve rápidamente solo la imagen y dimensiones de la página para dibujarla de inmediato en el visor."""
    doc = estado_app.doc
    if not doc or num < 0 or num >= len(doc):
        return None
    try:
        pagina = doc[num]
        zoom = 1.5
        pix = pagina.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        img_data = base64.b64encode(pix.tobytes("jpg", jpg_quality=80)).decode("utf-8")
        res = {
            "imagen": f"data:image/jpeg;base64,{img_data}",
            "ancho_img": int(pagina.rect.width * zoom),
            "alto_img": int(pagina.rect.height * zoom),
            "ancho_pagina_pdf": pagina.rect.width,
            "alto_pagina_pdf": pagina.rect.height,
            "total_paginas": len(doc),
        }
        if incluir_palabras:
            raw_words = pagina.get_text("words")
            if not raw_words:
                doc_path = getattr(doc, "name", "doc_actual")
                if esta_en_cache_ocr(doc_path, num):
                    raw_words = obtener_palabras_cache_ocr(doc_path, num) or []
            res["palabras_rapidas"] = [
                [round(float(w[0]), 2), round(float(w[1]), 2), round(float(w[2]), 2), round(float(w[3]), 2), str(w[4])]
                for w in raw_words
                if len(w) >= 5 and str(w[4]).strip()
            ]
        return res
    except Exception as e:
        print(f"⚠️ Error obteniendo vista rápida de página {num}: {e}")
        return None


def _extraer_palabras_con_tipografia(pagina, sort=False):
    """Extrae palabras con bbox y clasificación tipográfica ('sup', 'sub' o None) desde get_text('dict')."""
    import statistics

    dic = pagina.get_text("dict")
    palabras = []
    for b_idx, block in enumerate(dic.get("blocks", [])):
        if block.get("type", 0) != 0:
            continue
        for l_idx, line in enumerate(block.get("lines", [])):
            spans = [s for s in line.get("spans", []) if (s.get("text") or "").strip()]
            if not spans:
                continue
            sizes = [float(s.get("size", 10.0) or 10.0) for s in spans]
            baselines = [
                float(s["origin"][1]) if isinstance(s.get("origin"), (list, tuple)) and len(s["origin"]) >= 2
                else float(s.get("bbox", [0, 0, 0, 0])[3])
                for s in spans
            ]
            s_linea = statistics.median(sizes) if sizes else 10.0
            b_linea = statistics.median(baselines) if baselines else 0.0

            w_idx = 0
            for sp in spans:
                txt_sp = sp.get("text", "")
                bbox = sp.get("bbox", (0, 0, 0, 0))
                sx0, sy0, sx1, sy1 = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
                s_span = float(sp.get("size", s_linea) or s_linea)
                b_span = (
                    float(sp["origin"][1])
                    if isinstance(sp.get("origin"), (list, tuple)) and len(sp["origin"]) >= 2
                    else sy1
                )
                flags = int(sp.get("flags", 0) or 0)

                tipo_script = None
                if (flags & 1) or (s_linea > 0 and (s_span / s_linea) <= 0.82 and ((b_linea - b_span) / s_linea) > 0.18):
                    tipo_script = "sup"
                elif s_linea > 0 and (s_span / s_linea) <= 0.82 and ((b_span - b_linea) / s_linea) > 0.12:
                    tipo_script = "sub"

                total_len = max(1, len(txt_sp))
                span_w = max(0.0, sx1 - sx0)
                for m in re.finditer(r"\S+", txt_sp):
                    tok = m.group(0)
                    wx0 = sx0 + (m.start() / total_len) * span_w
                    wx1 = sx0 + (m.end() / total_len) * span_w
                    palabras.append((wx0, sy0, wx1, sy1, tok, b_idx, l_idx, w_idx, tipo_script))
                    w_idx += 1

    if sort and palabras:
        palabras.sort(key=lambda p: (round(p[1], 1), p[0]))
    return palabras


@eel.expose
def obtener_pagina_data(
    num,
    lista_cortes_v=None,
    limites_h=None,
    dict_activo=None,
    forzar_ocr=False,
    auto_ocr=None,
    zonas_excluidas=None,
    recorte_pdf=None,
    incluir_imagen=True,
    *args,
    **kwargs,
):
    doc = estado_app.doc
    if not doc:
        return None
    estado_app.pagina_actual_global = num
    try:
        pagina = doc[num]
        zoom = 1.5
        img_data = None
        pix = None
        if incluir_imagen:
            pix = pagina.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            img_data = base64.b64encode(pix.tobytes("jpg", jpg_quality=80)).decode("utf-8")

        ajustes_json = cargar_ajustes_lectura()

        filtros_ui = {
            "chk-urls": ajustes_json.get("omitirUrls", False),
            "chk-paren": ajustes_json.get("omitirParen", False),
            "chk-corch": ajustes_json.get("omitirCorch", False),
            "chk-llaves": ajustes_json.get("omitirLlaves", False),
            "chk-barras": ajustes_json.get("omitirBarras", False),
            "chk-referencias": ajustes_json.get("omitirSuperindices", ajustes_json.get("omitirReferencias", True)),
            "chk-superindices": ajustes_json.get("omitirSuperindices", ajustes_json.get("omitirReferencias", True)),
            "chk-subindices": ajustes_json.get("omitirSubindices", False),
            "modo_teatro": bool(ajustes_json.get("teatro_activo", False)),
            "obra_actual": str(ajustes_json.get("obra_actual", "General") or "General"),
        }

        es_texto_escrito = getattr(estado_app, "tipo_documento", "pdf") == "texto_escrito"
        if es_texto_escrito:
            lista_cortes_v = None
            limites_h = {}
            zonas_excluidas = []
            forzar_ocr = False
            auto_ocr = False

        tiene_cortes_v = bool(lista_cortes_v and len(lista_cortes_v) > 0)
        tiene_limites_h = False
        if limites_h and isinstance(limites_h, dict):
            for k, lim in limites_h.items():
                if isinstance(lim, (list, tuple)) and len(lim) >= 2:
                    if lim[0] > 5 or lim[1] < (pagina.rect.height - 5):
                        tiene_limites_h = True
                        break

        usar_sort = not tiene_cortes_v and not tiene_limites_h
        doc_path = getattr(doc, "name", "doc_actual")

        if not es_texto_escrito:
            prev_lay = estado_app.layouts_por_pagina.get(int(num)) or {}
            doc_key_cur = getattr(doc, "name", "") or "doc"
            est_actual = estado_app.cache_estructura_layout.get((doc_key_cur, int(num))) or prev_lay.get("estructura")
            estado_app.layouts_por_pagina[int(num)] = {
                "cortesV": list(lista_cortes_v) if lista_cortes_v else [],
                "limitesH": dict(limites_h) if isinstance(limites_h, dict) else {},
                "zonasExcluidas": list(zonas_excluidas) if zonas_excluidas else [],
                "estructura": est_actual,
            }

        if forzar_ocr:
            print(f"🔍 [PY] Forzando RapidOCR en página {num}...")
            if hasattr(eel, "notificar_inicio_ocr_pagina"):
                try:
                    eel.notificar_inicio_ocr_pagina(num)()
                except Exception:
                    pass
            if pix is None:
                pix = pagina.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            pix_bytes = pix.tobytes("png")
            try:
                palabras_raw = procesar_ocr_pagina(
                    pixmap_bytes=pix_bytes,
                    ancho_pdf=pagina.rect.width,
                    alto_pdf=pagina.rect.height,
                    ancho_px=pix.width,
                    alto_px=pix.height,
                    doc_path=doc_path,
                    num_pagina=num,
                    forzar=True,
                )
            finally:
                if hasattr(eel, "notificar_fin_ocr_pagina"):
                    try:
                        eel.notificar_fin_ocr_pagina(num)()
                    except Exception:
                        pass
        else:
            palabras_raw = _extraer_palabras_con_tipografia(pagina, sort=usar_sort)

            auto_ocr_activo = (
                False
                if es_texto_escrito
                else (auto_ocr if auto_ocr is not None else ajustes_json.get("auto_ocr", True))
            )
            esta_cacheador = False if es_texto_escrito else esta_en_cache_ocr(doc_path, num)

            if len(palabras_raw) == 0 or esta_cacheador:
                if esta_cacheador:
                    palabras_ocr = obtener_palabras_cache_ocr(doc_path, num)
                    if palabras_ocr:
                        palabras_raw = palabras_ocr
                elif auto_ocr_activo and len(palabras_raw) == 0:
                    print(
                        f"🔍 [PY] Página {num} sin texto digital detectado (0 palabras) y Auto-OCR activo. Activando RapidOCR..."
                    )
                    if hasattr(eel, "notificar_inicio_ocr_pagina"):
                        try:
                            eel.notificar_inicio_ocr_pagina(num)()
                        except Exception:
                            pass
                    if pix is None:
                        pix = pagina.get_pixmap(
                            matrix=fitz.Matrix(zoom, zoom), alpha=False
                        )
                    pix_bytes = pix.tobytes("png")
                    try:
                        palabras_ocr = procesar_ocr_pagina(
                            pixmap_bytes=pix_bytes,
                            ancho_pdf=pagina.rect.width,
                            alto_pdf=pagina.rect.height,
                            ancho_px=pix.width,
                            alto_px=pix.height,
                            doc_path=doc_path,
                            num_pagina=num,
                            forzar=False,
                        )
                    finally:
                        if hasattr(eel, "notificar_fin_ocr_pagina"):
                            try:
                                eel.notificar_fin_ocr_pagina(num)()
                            except Exception:
                                pass
                    if palabras_ocr:
                        palabras_raw = palabras_ocr

        if (
            zonas_excluidas
            and isinstance(zonas_excluidas, (list, tuple))
            and len(zonas_excluidas) > 0
        ):

            def _palabra_en_exclusion(p, zonas):
                cx = (p[0] + p[2]) / 2.0
                cy = (p[1] + p[3]) / 2.0
                for z in zonas:
                    if isinstance(z, (list, tuple)) and len(z) >= 4:
                        x0 = min(z[0], z[2])
                        x1 = max(z[0], z[2])
                        y0 = min(z[1], z[3])
                        y1 = max(z[1], z[3])
                        if x0 <= cx <= x1 and y0 <= cy <= y1:
                            return True
                        ix0 = max(p[0], x0)
                        iy0 = max(p[1], y0)
                        ix1 = min(p[2], x1)
                        iy1 = min(p[3], y1)
                        if ix1 > ix0 and iy1 > iy0:
                            area_inter = (ix1 - ix0) * (iy1 - iy0)
                            area_palabra = max(1.0, (p[2] - p[0]) * (p[3] - p[1]))
                            if (area_inter / area_palabra) >= 0.35:
                                return True
                return False

            palabras_raw = [
                p for p in palabras_raw if not _palabra_en_exclusion(p, zonas_excluidas)
            ]

        recorte_val = (
            recorte_pdf
            if recorte_pdf is not None
            else (kwargs.get("recorte_pdf", None) if kwargs else None)
        )
        if recorte_val is None:
            recorte_val = ajustes_json.get("recortePDF", 0)
        try:
            recorte_val = int(recorte_val)
        except Exception:
            recorte_val = 0

        if recorte_val > 0 and palabras_raw:
            crop_h = (float(recorte_val) / 100.0) * pagina.rect.width * 0.20
            crop_v = (float(recorte_val) / 100.0) * pagina.rect.height * 0.12
            x_min_visible = crop_h
            x_max_visible = pagina.rect.width - crop_h
            y_min_visible = crop_v
            y_max_visible = pagina.rect.height - crop_v
            palabras_raw = [
                p
                for p in palabras_raw
                if (x_min_visible <= (p[0] + p[2]) / 2.0 <= x_max_visible)
                and (y_min_visible <= (p[1] + p[3]) / 2.0 <= y_max_visible)
            ]

        palabras_sin_organizar = list(palabras_raw)

        if tiene_cortes_v or tiene_limites_h:
            palabras_raw = organizar_palabras_con_cortes_y_limites(
                palabras_raw,
                lista_cortes_v,
                limites_h,
                pagina.rect.width,
                pagina.rect.height,
            )

        mapa_palabras = [
            {"texto": p[4], "bbox": [int(p[0]), int(p[1]), int(p[2]), int(p[3])]}
            for p in palabras_raw
        ]

        # Guardar estado original (snapshot) en estado_app para hot-swap de segmentación y filtros
        estado_app.snapshot_palabras_raw = palabras_sin_organizar
        estado_app.snapshot_cortes_v = lista_cortes_v
        estado_app.snapshot_limites_h = limites_h
        estado_app.snapshot_zonas_excluidas = zonas_excluidas

        _est_ia = None
        try:
            _doc_key = getattr(doc, "name", "") or "doc"
            _est_ia = estado_app.cache_estructura_layout.get((_doc_key, int(num)))
            if _est_ia is None and int(num) in estado_app.layouts_por_pagina:
                _est_ia = estado_app.layouts_por_pagina[int(num)].get("estructura")
                if _est_ia is not None:
                    estado_app.cache_estructura_layout[(_doc_key, int(num))] = _est_ia
        except Exception:
            _est_ia = None

        estado_app.snapshot_oraciones_raw = procesar_oraciones_de_palabras(
            palabras_raw, None, estructura_ia=_est_ia
        )

        def procesar_con_filtros(lista_oraciones_raw):
            procesadas = []
            for oracion in lista_oraciones_raw:
                texto_crudo = " ".join([p["texto"] for p in oracion["palabras"]])
                pack = aplicar_reemplazos(texto_crudo, dict_activo, filtros_ui)
                texto_final = pack[0] if isinstance(pack, tuple) else pack

                procesadas.append(
                    {
                        "texto": texto_final,
                        "rects": oracion["rects"],
                        "palabras": oracion["palabras"],
                    }
                )
            return procesadas

        oraciones_finales = procesar_con_filtros(estado_app.snapshot_oraciones_raw)
        print(f"📸 Página {num} procesada. Oraciones: {len(oraciones_finales)}")

        res_pagina = {
            "oraciones": oraciones_finales,
            "palabras": mapa_palabras,
            "total_paginas": len(doc),
            "factor_zoom": zoom,
            "ancho_img": int(pagina.rect.width * zoom),
            "alto_img": int(pagina.rect.height * zoom),
            "ancho_pagina_pdf": pagina.rect.width,
            "alto_pagina_pdf": pagina.rect.height,
        }
        if img_data is not None:
            res_pagina["imagen"] = f"data:image/jpeg;base64,{img_data}"
        return res_pagina
    except Exception as e:
        print(f"🔥 Error en obtener_pagina_data: {e}")
        return None


def _filtrar_palabras_por_exclusiones(palabras_raw, zonas_excluidas):
    if not zonas_excluidas or not isinstance(zonas_excluidas, (list, tuple)):
        return palabras_raw

    def _palabra_en_exclusion(p, zonas):
        cx = (p[0] + p[2]) / 2.0
        cy = (p[1] + p[3]) / 2.0
        for z in zonas:
            if isinstance(z, (list, tuple)) and len(z) >= 4:
                x0 = min(z[0], z[2])
                x1 = max(z[0], z[2])
                y0 = min(z[1], z[3])
                y1 = max(z[1], z[3])
                if x0 <= cx <= x1 and y0 <= cy <= y1:
                    return True
                ix0 = max(p[0], x0)
                iy0 = max(p[1], y0)
                ix1 = min(p[2], x1)
                iy1 = min(p[3], y1)
                if ix1 > ix0 and iy1 > iy0:
                    area_inter = (ix1 - ix0) * (iy1 - iy0)
                    area_palabra = max(1.0, (p[2] - p[0]) * (p[3] - p[1]))
                    if (area_inter / area_palabra) >= 0.35:
                        return True
        return False

    return [p for p in palabras_raw if not _palabra_en_exclusion(p, zonas_excluidas)]


def obtener_solo_texto_pagina_ligera(num, dict_activo, layout_pagina=None, auto_layout=False):
    """Extrae oraciones de una página sin renderizar imágenes ni snapshots visuales."""
    doc = estado_app.doc
    if not doc or num < 0 or num >= len(doc):
        return []
    try:
        pagina = doc[num]
        es_texto_escrito = getattr(estado_app, "tipo_documento", "pdf") == "texto_escrito"
        doc_key = getattr(doc, "name", "") or "doc"

        layout = None
        if not es_texto_escrito:
            if isinstance(layout_pagina, dict):
                layout = layout_pagina
            elif int(num) in estado_app.layouts_por_pagina:
                layout = estado_app.layouts_por_pagina.get(int(num))
            elif auto_layout:
                try:
                    res_ia = analizar_layout_pagina(doc, int(num))
                    if isinstance(res_ia, dict) and res_ia.get("exito"):
                        estado_app.cache_estructura_layout[(doc_key, int(num))] = res_ia.get("estructura")
                        layout = {
                            "cortesV": res_ia.get("cortesV") or [],
                            "limitesH": res_ia.get("limitesH") or {},
                            "zonasExcluidas": res_ia.get("zonasExcluidas") or [],
                        }
                        estado_app.layouts_por_pagina[int(num)] = layout
                except Exception:
                    layout = None

        lista_cortes_v = (layout.get("cortesV") or []) if isinstance(layout, dict) else []
        limites_h = (layout.get("limitesH") or {}) if isinstance(layout, dict) else {}
        zonas_excluidas = (layout.get("zonasExcluidas") or []) if isinstance(layout, dict) else []

        tiene_cortes_v = bool(lista_cortes_v and len(lista_cortes_v) > 0)
        tiene_limites_h = False
        if limites_h and isinstance(limites_h, dict):
            for lim in limites_h.values():
                if isinstance(lim, (list, tuple)) and len(lim) >= 2:
                    if lim[0] > 5 or lim[1] < (pagina.rect.height - 5):
                        tiene_limites_h = True
                        break
        usar_sort = not tiene_cortes_v and not tiene_limites_h

        palabras_raw = _extraer_palabras_con_tipografia(pagina, sort=usar_sort)
        if len(palabras_raw) == 0 and not es_texto_escrito:
            doc_path = getattr(doc, "name", "doc_actual")
            if esta_en_cache_ocr(doc_path, num):
                palabras_ocr = obtener_palabras_cache_ocr(doc_path, num)
                if not palabras_ocr:
                    pix = pagina.get_pixmap(dpi=150)
                    palabras_ocr = procesar_ocr_pagina(
                        pixmap_bytes=pix.tobytes("png"),
                        ancho_pdf=pagina.rect.width,
                        alto_pdf=pagina.rect.height,
                        ancho_px=pix.width,
                        alto_px=pix.height,
                        doc_path=doc_path,
                        num_pagina=num,
                        forzar=False,
                    )
                if palabras_ocr:
                    palabras_raw = palabras_ocr

        if not es_texto_escrito and zonas_excluidas:
            palabras_raw = _filtrar_palabras_por_exclusiones(palabras_raw, zonas_excluidas)

        ajustes_json = cargar_ajustes_lectura()
        recorte_val = ajustes_json.get("recortePDF", 0)
        try:
            recorte_val = int(recorte_val)
        except Exception:
            recorte_val = 0

        if recorte_val > 0 and palabras_raw:
            crop_h = (float(recorte_val) / 100.0) * pagina.rect.width * 0.20
            crop_v = (float(recorte_val) / 100.0) * pagina.rect.height * 0.12
            x_min_visible = crop_h
            x_max_visible = pagina.rect.width - crop_h
            y_min_visible = crop_v
            y_max_visible = pagina.rect.height - crop_v
            palabras_raw = [
                p
                for p in palabras_raw
                if (x_min_visible <= (p[0] + p[2]) / 2.0 <= x_max_visible)
                and (y_min_visible <= (p[1] + p[3]) / 2.0 <= y_max_visible)
            ]

        if not es_texto_escrito and (tiene_cortes_v or tiene_limites_h):
            palabras_raw = organizar_palabras_con_cortes_y_limites(
                palabras_raw,
                lista_cortes_v,
                limites_h,
                pagina.rect.width,
                pagina.rect.height,
            )

        _est_ia = None if es_texto_escrito else estado_app.cache_estructura_layout.get((doc_key, int(num)))
        oraciones_raw = procesar_oraciones_de_palabras(palabras_raw, None, estructura_ia=_est_ia)

        textos_limpios = []
        for oracion in oraciones_raw:
            texto_crudo = " ".join([p["texto"] for p in oracion["palabras"]]).strip()
            pack = aplicar_reemplazos(texto_crudo, dict_activo)
            texto_final = pack[0] if isinstance(pack, tuple) else pack
            if texto_final and isinstance(texto_final, str):
                textos_limpios.append(texto_final)

        return textos_limpios
    except Exception as e:
        print(f"⚠️ Error ligero en pág {num}: {e}")
        return []


@eel.expose
def forzar_ocr_pagina_actual(
    num=None,
    lista_cortes_v=None,
    limites_h=None,
    dict_activo=None,
    zonas_excluidas=None,
    recorte_pdf=None,
    *args,
    **kwargs,
):
    """Fuerza el re-procesamiento con RapidOCR de la página solicitada o activa."""
    if not estado_app.doc:
        return {"exito": False, "error": "No hay ningún documento abierto"}
    target_num = estado_app.pagina_actual_global if num is None else num
    try:
        data = obtener_pagina_data(
            target_num,
            lista_cortes_v,
            limites_h,
            dict_activo,
            forzar_ocr=True,
            zonas_excluidas=zonas_excluidas,
            recorte_pdf=recorte_pdf,
        )
        if data:
            return {"exito": True, "data": data, "pagina": target_num}
        return {"exito": False, "error": "No se pudo procesar la página con OCR"}
    except Exception as e:
        print(f"🔥 Error forzando OCR: {e}")
        return {"exito": False, "error": str(e)}


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
    except Exception as e:
        logger.error(f"[DOCLAYOUT] Error al detectar layout: {e}")
        return {"exito": False, "error": str(e)}


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

        UMBRAL_PALABRAS = 5
        pags_fase1 = [p for p in [0, 1, 2] if p < total]
        for idx in pags_fase1:
            pag = doc[idx]
            palabras = pag.get_text("words")
            if len(palabras) >= UMBRAL_PALABRAS:
                return {
                    "es_escaneado": False,
                    "total_paginas": total,
                    "doc_path": doc_path,
                    "paginas_en_cache": 0,
                    "completamente_cacheado": False,
                }

        puntos_muestreo = []
        if total <= 4:
            puntos_muestreo = [p for p in range(total) if p not in pags_fase1]
        else:
            num_puntos = min(8, max(5, total // 15))
            for i in range(num_puntos):
                pos = int((total * (i + 0.5)) / num_puntos)
                pos = max(0, min(total - 1, pos))
                if pos not in pags_fase1 and pos not in puntos_muestreo:
                    puntos_muestreo.append(pos)

        for idx in puntos_muestreo:
            pag = doc[idx]
            palabras = pag.get_text("words")
            if len(palabras) >= UMBRAL_PALABRAS:
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
            doc_act = estado_app.doc
            if not doc_act or num < 0 or num >= len(doc_act):
                return
            pag = doc_act[num]
            if len(pag.get_text("words")) == 0 and not esta_en_cache_ocr(doc_path, num):
                pix = pag.get_pixmap(dpi=150)
                if mi_token != estado_app.pre_cache_ocr_token:
                    return
                procesar_ocr_pagina(
                    pixmap_bytes=pix.tobytes("png"),
                    ancho_pdf=pag.rect.width,
                    alto_pdf=pag.rect.height,
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
                        pix = pag.get_pixmap(dpi=150)
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
