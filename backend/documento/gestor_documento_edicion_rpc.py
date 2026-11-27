# LiraLoud - RPC de edición, anotaciones, subrayados, elementos, capas, historial y fuentes PDF
import os
import sys
import gc
import shutil
import ctypes
import webview
import pymupdf as fitz

from backend.core.webview_bridge import eel, puente_webview
from backend.core.estado_global import estado_app
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


def _invalidar_layout(pagina_idx):
    from backend.documento import gestor_documento_rpc as _gdr
    return _gdr.invalidar_layout_pagina(pagina_idx)


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

def _reabrir_estado_doc(target_path=None):
    """Cierra estado_app.doc si está abierto y lo reabre limpiamente desde disco."""
    ruta = _resolver_pdf_path(target_path)
    if estado_app.doc is not None and not getattr(estado_app.doc, "is_closed", False):
        try:
            estado_app.doc.close()
        except Exception:
            pass
    estado_app.doc = None
    gc.collect()
    if ruta and os.path.exists(ruta):
        asegurar_permiso_escritura(ruta)
        estado_app.doc = fitz.open(ruta)
        estado_app.ruta_pdf_actual = ruta
    return estado_app.doc

@eel.expose
def agregar_anotacion_freetext(pdf_path, pagina_idx, bbox, texto, config_fuente):
    with estado_app.lock_edicion_pdf:
        _asegurar_doc_abierto(pdf_path)
        res = _agregar_freetext(
            pdf_path, pagina_idx, bbox, texto, config_fuente, doc_obj=estado_app.doc
        )
        if not res.get("success") and res.get("error") == "NEEDS_FULL_SAVE":
            return _ejecutar_full_save_seguro(pdf_path, res)
        if res.get("success"):
            _reabrir_estado_doc(pdf_path)
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
        if res.get("success"):
            _reabrir_estado_doc(pdf_path)
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
        if res.get("success") and res.get("borrados", 0) > 0:
            _reabrir_estado_doc(pdf_path)
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
        if res.get("success") and res.get("id_borrado") is not None:
            _reabrir_estado_doc(pdf_path)
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
        elif res.get("success"):
            _reabrir_estado_doc(pdf_path)
        _invalidar_layout(pagina_idx)
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
        elif res.get("success"):
            _reabrir_estado_doc(pdf_path)
        _invalidar_layout(pagina_idx)
        return res

def _resolver_pdf_path(pdf_path):
    ruta = pdf_path if (pdf_path and str(pdf_path).strip()) else (estado_app.ruta_pdf_actual or "")
    if not ruta and estado_app.doc is not None and not getattr(estado_app.doc, "is_closed", False):
        ruta = getattr(estado_app.doc, "name", "") or ""
    return ruta

def _asegurar_doc_para_ruta(target_path):
    if (
        estado_app.doc is not None
        and not getattr(estado_app.doc, "is_closed", False)
        and target_path
        and os.path.exists(target_path)
    ):
        actual = estado_app.ruta_pdf_actual or getattr(estado_app.doc, "name", "") or ""
        if actual and os.path.normcase(os.path.abspath(actual)) != os.path.normcase(
            os.path.abspath(target_path)
        ):
            try:
                estado_app.doc.close()
            except Exception:
                pass
            estado_app.doc = None
            gc.collect()
    return _asegurar_doc_abierto(target_path)

def _ejecutar_mutacion_elemento(pdf_path, pagina_idx, fn_mutacion, *args):
    target_path = _resolver_pdf_path(pdf_path)
    if not target_path or not os.path.exists(target_path):
        return {"success": False, "error": "No hay ningún documento PDF abierto."}

    with estado_app.lock_edicion_pdf:
        asegurar_permiso_escritura(target_path)
        if estado_app.doc is not None and not getattr(estado_app.doc, "is_closed", False):
            _reabrir_estado_doc(target_path)
        else:
            _asegurar_doc_para_ruta(target_path)

        registrar_snapshot(target_path, pagina_idx=pagina_idx)
        try:
            res = fn_mutacion(target_path, pagina_idx, *args, doc_obj=estado_app.doc)
        except Exception as e:
            descartar_ultimo_snapshot(target_path)
            _reabrir_estado_doc(target_path)
            return {"success": False, "error": str(e)}

        if not isinstance(res, dict):
            descartar_ultimo_snapshot(target_path)
            _reabrir_estado_doc(target_path)
            return {"success": False, "error": "Respuesta inválida de mutación."}

        if not res.get("success") and res.get("error") == "NEEDS_FULL_SAVE":
            res_save = _ejecutar_full_save_seguro(target_path, res)
            if res_save.get("success"):
                res.update(res_save)
                res.pop("error", None)
            else:
                res = res_save
        if not res.get("success"):
            descartar_ultimo_snapshot(target_path)
            _reabrir_estado_doc(target_path)
        else:
            if estado_app.doc is not None and getattr(estado_app.doc, "_lira_incr_saved", False):
                _reabrir_estado_doc(target_path)
            _invalidar_layout(pagina_idx)
            res["puede_deshacer"] = puede_deshacer(target_path)
        return res

@eel.expose
def obtener_elementos_pagina(pdf_path, pagina_idx):
    """Devuelve imágenes y cuadros FreeText de la página indicada (0-based)."""
    target_path = _resolver_pdf_path(pdf_path)
    if not target_path or not os.path.exists(target_path):
        return {"success": False, "error": "Documento no encontrado.", "elementos": [], "puede_deshacer": False}
    with estado_app.lock_edicion_pdf:
        _asegurar_doc_para_ruta(target_path)
        res = _obtener_elementos_pagina(target_path, pagina_idx, doc_obj=estado_app.doc)
        res["puede_deshacer"] = puede_deshacer(target_path)
        return res

@eel.expose
def mover_elemento_pdf(pdf_path, pagina_idx, elemento, nuevo_bbox):
    """Mueve una imagen, cuadro FreeText o figura a `nuevo_bbox`."""
    if not isinstance(elemento, dict):
        return {"success": False, "error": "Elemento inválido."}
    tipo = elemento.get("tipo")
    if tipo == "imagen":
        return _ejecutar_mutacion_elemento(
            pdf_path, pagina_idx, _mover_imagen, elemento, nuevo_bbox
        )
    if tipo in ("freetext", "figura"):
        return _ejecutar_mutacion_elemento(
            pdf_path, pagina_idx, _mover_redimensionar_freetext, elemento, nuevo_bbox
        )
    return {"success": False, "error": f"Tipo de elemento no soportado: {tipo}"}

@eel.expose
def redimensionar_elemento_pdf(pdf_path, pagina_idx, elemento, nuevo_bbox):
    """Redimensiona una imagen, cuadro FreeText o figura a `nuevo_bbox`."""
    if not isinstance(elemento, dict):
        return {"success": False, "error": "Elemento inválido."}
    tipo = elemento.get("tipo")
    if tipo == "imagen":
        return _ejecutar_mutacion_elemento(
            pdf_path, pagina_idx, _redimensionar_imagen, elemento, nuevo_bbox
        )
    if tipo in ("freetext", "figura"):
        return _ejecutar_mutacion_elemento(
            pdf_path, pagina_idx, _mover_redimensionar_freetext, elemento, nuevo_bbox
        )
    return {"success": False, "error": f"Tipo de elemento no soportado: {tipo}"}

@eel.expose
def crear_figura_pdf_rpc(
    pdf_path,
    pagina_idx,
    x0,
    y0,
    x1,
    y1,
    tipo="rect",
    color_borde="#000000",
    color_relleno=None,
    grosor=2,
    opacidad=1.0,
):
    """Inserta una figura nativa (rectángulo o círculo/óvalo) en la página del PDF."""
    return _ejecutar_mutacion_elemento(
        pdf_path,
        pagina_idx,
        _crear_figura_pdf,
        x0,
        y0,
        x1,
        y1,
        tipo,
        color_borde,
        color_relleno,
        grosor,
        opacidad,
    )

@eel.expose
def editar_figura_pdf_rpc(
    pdf_path,
    pagina_idx,
    elemento,
    color_borde=None,
    color_relleno=None,
    grosor=None,
    opacidad=None,
):
    """Actualiza color de borde, relleno (o ninguno), grosor y opacidad de una figura existente."""
    return _ejecutar_mutacion_elemento(
        pdf_path,
        pagina_idx,
        _editar_figura_pdf,
        elemento,
        color_borde,
        color_relleno,
        grosor,
        opacidad,
    )

@eel.expose
def rotar_imagen_pdf(pdf_path, pagina_idx, elemento, angulo_grados):
    """Rota una imagen (múltiplos de 90° o ángulo libre RGBA con transparencia)."""
    if not isinstance(elemento, dict) or elemento.get("tipo") != "imagen":
        return {"success": False, "error": "Solo las imágenes pueden rotarse."}
    return _ejecutar_mutacion_elemento(
        pdf_path, pagina_idx, _rotar_imagen, elemento, angulo_grados
    )

@eel.expose
def seleccionar_imagen_reemplazo():
    """Abre el diálogo nativo para seleccionar una imagen de reemplazo."""
    if sys.platform == "win32":
        try:
            from ctypes import wintypes

            class OPENFILENAME_IMG(ctypes.Structure):
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
                "Imágenes (*.png;*.jpg;*.jpeg;*.webp;*.bmp)\0"
                "*.png;*.jpg;*.jpeg;*.webp;*.bmp\0"
                "Todos los archivos (*.*)\0*.*\0\0"
            )
            ofn = OPENFILENAME_IMG()
            ofn.lStructSize = ctypes.sizeof(OPENFILENAME_IMG)
            ofn.lpstrFilter = filtro
            ofn.lpstrFile = ctypes.cast(buffer, wintypes.LPWSTR)
            ofn.nMaxFile = 1024
            ofn.lpstrTitle = "Seleccionar imagen de reemplazo - LiraLoud"
            ofn.Flags = 0x00001000 | 0x00000800 | 0x00000008

            try:
                ofn.hwndOwner = ctypes.windll.user32.GetForegroundWindow()
            except Exception:
                ofn.hwndOwner = None

            if ctypes.windll.comdlg32.GetOpenFileNameW(ctypes.byref(ofn)):
                return buffer.value
            return None
        except Exception:
            pass

    try:
        if puente_webview.ventana:
            rutas = puente_webview.ventana.create_file_dialog(
                webview.FileDialog.OPEN,
                allow_multiple=False,
                file_types=(
                    "Imágenes (*.png;*.jpg;*.jpeg;*.webp;*.bmp)",
                    "Todos los archivos (*.*)",
                ),
            )
            if isinstance(rutas, (tuple, list)):
                return rutas[0] if rutas else None
            return rutas
    except Exception:
        return None
    return None

@eel.expose
def reemplazar_imagen_pdf(pdf_path, pagina_idx, elemento, ruta_imagen=None):
    """Sustituye una imagen manteniendo exactamente su bbox actual."""
    if not isinstance(elemento, dict) or elemento.get("tipo") != "imagen":
        return {"success": False, "error": "Solo las imágenes pueden reemplazarse."}
    if ruta_imagen is None:
        ruta_imagen = seleccionar_imagen_reemplazo()
        if not ruta_imagen:
            return {"success": False, "cancelado": True}
    return _ejecutar_mutacion_elemento(
        pdf_path, pagina_idx, _reemplazar_imagen, elemento, ruta_imagen
    )

@eel.expose
def insertar_imagen_pdf_rpc(pdf_path, pagina_idx, ruta_imagen=None, bbox=None):
    """Inserta una imagen nueva en la página actual del PDF (con soporte de deshacer)."""
    if ruta_imagen is None:
        ruta_imagen = seleccionar_imagen_reemplazo()
        if not ruta_imagen:
            return {"success": False, "cancelado": True}
    return _ejecutar_mutacion_elemento(
        pdf_path, pagina_idx, _insertar_imagen_pdf, ruta_imagen, bbox
    )

@eel.expose
def recortar_zona_como_imagen_rpc(pdf_path, pagina_idx, x0, y0, x1, y1, duplicar=False):
    """Recorta una zona del PDF (diagrama/tabla) y la convierte en imagen movible con soporte Undo."""
    return _ejecutar_mutacion_elemento(
        pdf_path,
        pagina_idx,
        _recortar_zona_como_imagen_pdf,
        float(x0),
        float(y0),
        float(x1),
        float(y1),
        bool(duplicar),
    )

@eel.expose
def cambiar_capa_elemento_rpc(pdf_path, pagina_idx, elemento, accion):
    """Cambia la capa (frente, subir, bajar, fondo) de una figura, cuadro de texto o imagen."""
    return _ejecutar_mutacion_elemento(
        pdf_path, pagina_idx, _cambiar_capa_elemento_pdf, elemento, accion
    )

@eel.expose
def eliminar_elemento_pdf(pdf_path, pagina_idx, elemento):
    """Elimina una imagen (instancia única) o cuadro FreeText del PDF."""
    if not isinstance(elemento, dict):
        return {"success": False, "error": "Elemento inválido."}
    tipo = elemento.get("tipo")
    if tipo == "imagen":
        return _ejecutar_mutacion_elemento(
            pdf_path, pagina_idx, _eliminar_imagen, elemento
        )
    if tipo in ("freetext", "figura"):
        return _ejecutar_mutacion_elemento(
            pdf_path, pagina_idx, _eliminar_freetext, elemento
        )
    return {"success": False, "error": f"Tipo de elemento no soportado: {tipo}"}

@eel.expose
def deshacer_edicion_pdf(pdf_path=None):
    """Restaura el último snapshot temporal del PDF (Ctrl + Z)."""
    target_path = _resolver_pdf_path(pdf_path)
    if not target_path:
        return {"success": False, "error": "No hay ningún documento PDF abierto.", "puede_deshacer": False}
    res = deshacer_snapshot(target_path, cerrar_reabrir_estado=True)
    if res.get("success") and res.get("pagina_idx") is not None:
        _invalidar_layout(res["pagina_idx"])
    return res

@eel.expose
def limpiar_historial_edicion_pdf(pdf_path=None):
    """Limpia los snapshots temporales del historial Undo."""
    limpiar_historial_pdf(pdf_path)
    return {"success": True}

@eel.expose
def listar_fuentes_editor():
    """Lista las fuentes instaladas (local/sistema) y descargables del catálogo para el editor PDF."""
    return _listar_fuentes_editor()

@eel.expose
def descargar_fuente_editor(nombre_familia):
    """Descarga una familia tipográfica oficial a recursos/fuentes/ y refresca la caché de fuentes."""
    with estado_app.lock_edicion_pdf:
        return _descargar_fuente_editor(nombre_familia)
