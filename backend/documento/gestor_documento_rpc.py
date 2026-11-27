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
    es_ocr_alta_precision,
    establecer_ocr_alta_precision,
    establecer_idioma_ocr,
    renderizar_pixmap_ocr,
)
from backend.documento.ocr_modelos import listar_idiomas_ocr, modelo_ocr_descargado
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
from backend.documento.elementos_pdf import (
    obtener_elementos_pagina as _obtener_elementos_pagina,
    mover_imagen as _mover_imagen,
    redimensionar_imagen as _redimensionar_imagen,
    reemplazar_imagen as _reemplazar_imagen,
    rotar_imagen as _rotar_imagen,
    eliminar_imagen as _eliminar_imagen,
    insertar_imagen_pdf as _insertar_imagen_pdf,
    recortar_zona_como_imagen_pdf as _recortar_zona_como_imagen_pdf,
    cambiar_capa_elemento_pdf as _cambiar_capa_elemento_pdf,
    mover_redimensionar_freetext as _mover_redimensionar_freetext,
    eliminar_freetext as _eliminar_freetext,
    crear_figura_pdf as _crear_figura_pdf,
    editar_figura_pdf as _editar_figura_pdf,
)
from backend.documento.historial_pdf import (
    registrar_snapshot,
    descartar_ultimo_snapshot,
    puede_deshacer,
    deshacer_snapshot,
    limpiar_historial_pdf,
)




@eel.expose
def obtener_archivo_inicial():
    """Devuelve y consume la ruta pasada por línea de comandos al abrir LiraLoud (ej. doble clic en PDF)."""
    ruta = getattr(estado_app, "archivo_inicial", "") or ""
    estado_app.archivo_inicial = ""
    return ruta


# ==========================================
# 2. CARGA Y SELECCIÓN DE DOCUMENTOS (PDF / EPUB / WORD / IMÁGENES)
# ==========================================
@eel.expose
def cargar_documento(ruta, tipo_documento=None):
    """Carga un PDF (o EPUB, Word o Imagen convertidos) directamente desde una ruta, sin diálogo."""
    with estado_app.lock_edicion_pdf:
        limpiar_historial_pdf()
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
    with estado_app.lock_edicion_pdf:
        limpiar_historial_pdf()
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
    try:
        with estado_app.lock_edicion_pdf:
            doc = estado_app.doc
            if not doc or num < 0 or num >= len(doc):
                return None
            pagina = doc[num]
            zoom = 1.5
            pix = pagina.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            ancho_pdf = pagina.rect.width
            alto_pdf = pagina.rect.height
            total_pags = len(doc)
            doc_path = getattr(doc, "name", "doc_actual")
            raw_words = pagina.get_text("words") if incluir_palabras else None

        img_data = base64.b64encode(pix.tobytes("jpg", jpg_quality=80)).decode("utf-8")
        res = {
            "imagen": f"data:image/jpeg;base64,{img_data}",
            "ancho_img": int(ancho_pdf * zoom),
            "alto_img": int(alto_pdf * zoom),
            "ancho_pagina_pdf": ancho_pdf,
            "alto_pagina_pdf": alto_pdf,
            "total_paginas": total_pags,
        }
        if incluir_palabras:
            if not raw_words:
                if esta_en_cache_ocr(doc_path, num):
                    raw_words = obtener_palabras_cache_ocr(doc_path, num) or []
            res["palabras_rapidas"] = [
                [round(float(w[0]), 2), round(float(w[1]), 2), round(float(w[2]), 2), round(float(w[3]), 2), str(w[4])]
                for w in (raw_words or [])
                if len(w) >= 5 and str(w[4]).strip()
            ]
        return res
    except Exception as e:
        print(f"⚠️ Error obteniendo vista rápida de página {num}: {e}")
        return None


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

        tiene_cortes_v, tiene_limites_h, usar_sort = _calcular_banderas_y_guardar_layout_pagina(
            doc, pagina, num, es_texto_escrito, lista_cortes_v, limites_h, zonas_excluidas
        )
        doc_path = getattr(doc, "name", "doc_actual")

        palabras_raw = _obtener_palabras_pagina_con_ocr(
            pagina=pagina,
            num=num,
            doc_path=doc_path,
            zoom=zoom,
            pix=pix,
            ajustes_json=ajustes_json,
            es_texto_escrito=es_texto_escrito,
            usar_sort=usar_sort,
            forzar_ocr=forzar_ocr,
            auto_ocr=auto_ocr,
        )

        palabras_raw, palabras_sin_organizar = _filtrar_y_organizar_palabras_pagina(
            palabras_raw,
            zonas_excluidas,
            recorte_pdf,
            kwargs,
            ajustes_json,
            tiene_cortes_v,
            tiene_limites_h,
            lista_cortes_v,
            limites_h,
            pagina,
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

        oraciones_finales = _segmentar_y_filtrar_oraciones_pagina(
            doc, num, palabras_raw, dict_activo, filtros_ui
        )
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


def obtener_solo_texto_pagina_ligera(num, dict_activo, layout_pagina=None, auto_layout=False):
    """Extrae oraciones de una página sin renderizar imágenes ni snapshots visuales."""
    doc = estado_app.doc
    if not doc or num < 0 or num >= len(doc):
        return []
    try:
        pagina = doc[num]
        es_texto_escrito = getattr(estado_app, "tipo_documento", "pdf") == "texto_escrito"
        doc_key = getattr(doc, "name", "") or "doc"

        (
            lista_cortes_v,
            limites_h,
            zonas_excluidas,
            tiene_cortes_v,
            tiene_limites_h,
            usar_sort,
        ) = _resolver_layout_pagina_ligera(
            doc, pagina, num, doc_key, es_texto_escrito, layout_pagina, auto_layout
        )

        palabras_raw = _extraer_y_filtrar_palabras_ligera(
            doc,
            pagina,
            num,
            es_texto_escrito,
            lista_cortes_v,
            limites_h,
            zonas_excluidas,
            tiene_cortes_v,
            tiene_limites_h,
            usar_sort,
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

from backend.documento.gestor_documento_export_rpc import (  # noqa: E402, F401
    _dialogo_guardar_pdf_nativo,
    _construir_subdocumento_pdf,
    _construir_rangos_exportacion_pdf,
    _preparar_plan_exportacion_pdf,
    exportar_pdf_configurado,
)

from backend.documento.gestor_documento_edicion_rpc import (  # noqa: E402, F401
    _asegurar_doc_abierto,
    _ejecutar_full_save_seguro,
    _reabrir_estado_doc,
    agregar_anotacion_freetext,
    agregar_subrayados_lote,
    eliminar_subrayados_area,
    eliminar_subrayado_punto,
    obtener_todos_subrayados,
    obtener_todos_subrayados_biblioteca,
    obtener_bloques_texto_pagina,
    editar_texto_pdf,
    crear_cuadro_texto_pdf,
    _resolver_pdf_path,
    _asegurar_doc_para_ruta,
    _ejecutar_mutacion_elemento,
    obtener_elementos_pagina,
    mover_elemento_pdf,
    redimensionar_elemento_pdf,
    crear_figura_pdf_rpc,
    editar_figura_pdf_rpc,
    rotar_imagen_pdf,
    seleccionar_imagen_reemplazo,
    reemplazar_imagen_pdf,
    insertar_imagen_pdf_rpc,
    recortar_zona_como_imagen_rpc,
    cambiar_capa_elemento_rpc,
    eliminar_elemento_pdf,
    deshacer_edicion_pdf,
    limpiar_historial_edicion_pdf,
    listar_fuentes_editor,
    descargar_fuente_editor,
)

from backend.documento.gestor_documento_layout_rpc import (  # noqa: E402, F401
    _huella_documento,
    _ruta_cache_layout,
    _cargar_cache_layout_disco,
    _guardar_cache_layout_disco,
    invalidar_layout_pagina,
    iniciar_lookahead_layout,
    _resolver_layout_pagina_con_cache,
    autodetectar_layout_pagina,
    _tiene_texto_nativo_en_muestreo,
    detectar_si_documento_es_escaneado,
    establecer_modo_ocr_precision,
    establecer_idioma_ocr_rpc,
    obtener_idiomas_ocr_rpc,
    pre_cache_ocr_pagina,
    obtener_miniatura_pagina,
    ejecutar_batch_ocr,
    cancelar_batch_ocr,
)

from backend.documento.gestor_documento_lectura import (  # noqa: E402, F401
    _clasificar_script_span,
    _extraer_palabras_de_linea,
    _extraer_palabras_con_tipografia,
    _obtener_palabras_pagina_con_ocr,
    _tiene_limites_horizontales_activos,
    _calcular_banderas_y_guardar_layout_pagina,
    _segmentar_y_filtrar_oraciones_pagina,
    _filtrar_y_organizar_palabras_pagina,
    _palabra_en_exclusion,
    _filtrar_palabras_por_exclusiones,
    _filtrar_palabras_por_recorte,
    _obtener_layout_pagina_para_lectura,
    _resolver_layout_pagina_ligera,
    _extraer_y_filtrar_palabras_ligera,
)
