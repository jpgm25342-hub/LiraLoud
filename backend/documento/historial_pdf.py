import atexit
import gc
import os
import shutil
import tempfile
import threading

import pymupdf as fitz

from backend.core.estado_global import estado_app
from backend.documento.edicion_pdf import asegurar_permiso_escritura

MAX_SNAPSHOTS = 15

_lock_historial = threading.RLock()
_pilas_por_doc = {}
_dirs_por_doc = {}
_seq_contador = 0


def _clave_doc(pdf_path):
    if not pdf_path:
        return ""
    return os.path.normcase(os.path.abspath(str(pdf_path)))


def registrar_snapshot(pdf_path, pagina_idx=None):
    """Guarda una copia temporal del estado actual del PDF antes de una mutación."""
    global _seq_contador
    if not pdf_path or not os.path.exists(pdf_path):
        return None

    key = _clave_doc(pdf_path)
    with _lock_historial:
        doc_dir = _dirs_por_doc.get(key)
        if not doc_dir or not os.path.isdir(doc_dir):
            doc_dir = tempfile.mkdtemp(prefix="liraloud_undo_")
            _dirs_por_doc[key] = doc_dir

        pila = _pilas_por_doc.setdefault(key, [])
        _seq_contador += 1
        snap_path = os.path.join(doc_dir, f"snap_{_seq_contador:06d}.pdf")
        shutil.copy2(pdf_path, snap_path)
        pila.append({"path": snap_path, "pagina_idx": pagina_idx})

        while len(pila) > MAX_SNAPSHOTS:
            viejo = pila.pop(0)
            try:
                if viejo.get("path") and os.path.exists(viejo["path"]):
                    os.remove(viejo["path"])
            except Exception:
                pass

        return snap_path


def descartar_ultimo_snapshot(pdf_path):
    """Elimina el snapshot más reciente (por ejemplo, si la mutación falló antes de guardar)."""
    key = _clave_doc(pdf_path)
    if not key:
        return False
    with _lock_historial:
        pila = _pilas_por_doc.get(key)
        if not pila:
            return False
        ultimo = pila.pop()
        try:
            if ultimo.get("path") and os.path.exists(ultimo["path"]):
                os.remove(ultimo["path"])
        except Exception:
            pass
        return True


def puede_deshacer(pdf_path):
    """Indica si existen snapshots disponibles para deshacer en el documento."""
    key = _clave_doc(pdf_path)
    if not key:
        return False
    with _lock_historial:
        pila = _pilas_por_doc.get(key)
        return bool(pila and len(pila) > 0)


def _restaurar_snapshot_en_disco(pdf_path, snap_path, debe_cerrar_estado, debe_reabrir_estado):
    """Cierra estado_app.doc si corresponde, reemplaza el PDF atómicamente desde snap_path y reabre."""
    temp_restore = pdf_path + ".undo_tmp"
    try:
        if debe_cerrar_estado and estado_app.doc is not None:
            try:
                if not getattr(estado_app.doc, "is_closed", False):
                    estado_app.doc.close()
            except Exception:
                pass
            estado_app.doc = None
            gc.collect()

        asegurar_permiso_escritura(pdf_path)
        shutil.copy2(snap_path, temp_restore)
        asegurar_permiso_escritura(temp_restore)
        shutil.move(temp_restore, pdf_path)

        try:
            os.remove(snap_path)
        except Exception:
            pass

        if debe_reabrir_estado:
            asegurar_permiso_escritura(pdf_path)
            estado_app.doc = fitz.open(pdf_path)
            estado_app.ruta_pdf_actual = pdf_path

        return True, None
    except Exception as e:
        if os.path.exists(temp_restore):
            try:
                os.remove(temp_restore)
            except Exception:
                pass
        if debe_reabrir_estado and estado_app.doc is None and os.path.exists(pdf_path):
            try:
                estado_app.doc = fitz.open(pdf_path)
                estado_app.ruta_pdf_actual = pdf_path
            except Exception:
                pass
        return False, str(e)


def deshacer_snapshot(pdf_path, cerrar_reabrir_estado=True):
    """
    Restaura el snapshot más reciente del PDF de forma segura en Windows:
    bajo `estado_app.lock_edicion_pdf`, cierra `estado_app.doc`, asegura permisos
    de escritura, reemplaza atómicamente el archivo y reabre `estado_app.doc`.
    """
    if not pdf_path:
        return {
            "success": False,
            "error": "No se especificó ruta de PDF.",
            "puede_deshacer": False,
        }

    key = _clave_doc(pdf_path)
    with estado_app.lock_edicion_pdf:
        with _lock_historial:
            pila = _pilas_por_doc.get(key)
            if not pila:
                return {
                    "success": False,
                    "error": "No hay cambios para deshacer.",
                    "puede_deshacer": False,
                }
            entrada = pila.pop()
            snap_path = entrada.get("path")
            pagina_idx = entrada.get("pagina_idx")
            restantes = len(pila)

        if not snap_path or not os.path.exists(snap_path):
            return {
                "success": False,
                "error": "El snapshot de respaldo temporal ya no existe.",
                "puede_deshacer": restantes > 0,
            }

        ruta_estado = getattr(estado_app, "ruta_pdf_actual", "") or ""
        mismo_doc_estado = bool(ruta_estado and _clave_doc(ruta_estado) == key)
        debe_cerrar_estado = bool(cerrar_reabrir_estado or mismo_doc_estado)
        debe_reabrir_estado = bool(cerrar_reabrir_estado)

        exito, err = _restaurar_snapshot_en_disco(
            pdf_path, snap_path, debe_cerrar_estado, debe_reabrir_estado
        )
        if not exito:
            return {
                "success": False,
                "error": err,
                "puede_deshacer": puede_deshacer(pdf_path),
            }
        return {
            "success": True,
            "pagina_idx": pagina_idx,
            "puede_deshacer": restantes > 0,
            "restantes": restantes,
        }


def limpiar_historial_pdf(pdf_path=None):
    """Elimina los snapshots temporales de un documento específico o de todos."""
    with _lock_historial:
        if pdf_path:
            key = _clave_doc(pdf_path)
            _pilas_por_doc.pop(key, None)
            doc_dir = _dirs_por_doc.pop(key, None)
            if doc_dir:
                shutil.rmtree(doc_dir, ignore_errors=True)
        else:
            _pilas_por_doc.clear()
            for doc_dir in list(_dirs_por_doc.values()):
                if doc_dir:
                    shutil.rmtree(doc_dir, ignore_errors=True)
            _dirs_por_doc.clear()


atexit.register(limpiar_historial_pdf)
