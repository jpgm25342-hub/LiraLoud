# LiraLoud - Utilidades comunes de manipulación de elementos PDF
import math
import os
import re
import shutil
import sys

import pymupdf as fitz

from backend.documento.edicion_pdf import asegurar_permiso_escritura


def _abrir_doc_pagina(pdf_path, pagina_idx, doc_obj=None):
    if doc_obj is None:
        if not pdf_path or not os.path.exists(pdf_path):
            raise FileNotFoundError("Documento PDF no encontrado.")
        asegurar_permiso_escritura(pdf_path)
        doc = fitz.open(pdf_path)
        owns_doc = True
    else:
        doc = doc_obj
        owns_doc = False

    if doc is None or getattr(doc, "is_closed", False):
        raise RuntimeError("El documento PDF no está abierto.")

    idx = int(pagina_idx)
    if idx < 0 or idx >= len(doc):
        if owns_doc:
            doc.close()
        raise IndexError(f"Índice de página fuera de rango: {idx}")

    return doc, doc[idx], owns_doc


def _cerrar_si_propio(doc, owns_doc):
    if owns_doc and doc is not None and not getattr(doc, "is_closed", False):
        try:
            doc.close()
        except Exception:
            pass


def _bbox_l1(b1, b2):
    return sum(abs(float(b1[i]) - float(b2[i])) for i in range(4))


def _bbox_max_delta(b1, b2):
    return max(abs(float(b1[i]) - float(b2[i])) for i in range(4))


def _normalizar_rect_entrada(nuevo_bbox):
    if not isinstance(nuevo_bbox, (list, tuple)) or len(nuevo_bbox) < 4:
        raise ValueError("nuevo_bbox debe tener 4 coordenadas [x0, y0, x1, y1].")
    rect = fitz.Rect(
        float(nuevo_bbox[0]),
        float(nuevo_bbox[1]),
        float(nuevo_bbox[2]),
        float(nuevo_bbox[3]),
    ).normalize()
    if not (
        math.isfinite(rect.x0)
        and math.isfinite(rect.y0)
        and math.isfinite(rect.x1)
        and math.isfinite(rect.y1)
    ):
        raise ValueError("Coordenadas inválidas en nuevo_bbox.")
    if rect.width < 2.0 or rect.height < 2.0:
        raise ValueError("El tamaño mínimo del elemento es 2x2 pt.")
    return rect


def _recargar_pagina_segura(doc, page):
    """Recarga la página evitando AssertionError si existe otra referencia fitz.Page (refs_old > 1)."""
    pno = int(page.number)
    try:
        page._image_info = None
    except Exception:
        pass
    try:
        refs = int(getattr(getattr(getattr(page, "this", None), "m_internal", None), "refs", 1) or 1)
    except Exception:
        refs = 1
    if refs <= 1:
        try:
            return doc.reload_page(page)
        except Exception:
            pass
    try:
        fitz.TOOLS.store_shrink(100)
    except Exception:
        pass
    reloaded = doc.load_page(pno)
    try:
        reloaded._image_info = None
    except Exception:
        pass
    return reloaded


def _rect_a_visible(bbox_unrot, page):
    """Convierte un bbox en espacio CropBox sin rotar al espacio visible page.rect."""
    r = fitz.Rect(bbox_unrot).normalize()
    if getattr(page, "rotation", 0) % 360 != 0:
        r = (r * page.rotation_matrix).normalize()
    return r


def _rect_para_insert_image(rect_vis, page):
    """Calcula el rectángulo a pasar a page.insert_image para que aterrice en rect_vis (page.rect)."""
    r_vis = fitz.Rect(rect_vis).normalize()
    rot = getattr(page, "rotation", 0) % 360
    if rot == 0:
        return r_vis
    cb = page.cropbox
    mb = page.mediabox
    tmat_unrot = fitz.Matrix(1.0, 0.0, 0.0, -1.0, -cb.x0, mb.y1 - cb.y0)
    r_unrot_cb = (r_vis * page.derotation_matrix).normalize()
    return ((r_unrot_cb * (~tmat_unrot)) * page.transformation_matrix).normalize()


def _transform_visible(transform, page):
    """Proyecta la matriz `transform` (espacio CropBox sin rotar) al espacio visible page.rect."""
    if not transform or len(transform) < 6:
        return (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    m = fitz.Matrix(*[float(v) for v in transform[:6]])
    if getattr(page, "rotation", 0) % 360 != 0:
        m = m * page.rotation_matrix
    return (float(m.a), float(m.b), float(m.c), float(m.d), float(m.e), float(m.f))


def _angulo_rotacion_ejes(a, b, c, d, eps=1e-2):
    """Evalúa los 4 cuadrantes axiales (0°, 90°, 180°, 270°) sin sesgo ni volteo."""
    if abs(b) <= eps and abs(c) <= eps:
        if a > 0 and d > 0:
            return 0
        if a < 0 and d < 0:
            return 180
    if abs(a) <= eps and abs(d) <= eps:
        if b > 0 and c < 0:
            return 90
        if b < 0 and c > 0:
            return 270
    return None


def _detectar_rotacion_recta_90(transform):
    """Si `transform` es rotación pura múltiplo de 90° sin sesgo ni volteo, retorna 0/90/180/270; si no, None."""
    if not transform or len(transform) < 6:
        return 0
    a, b, c, d, _, _ = [float(v) for v in transform[:6]]
    return _angulo_rotacion_ejes(a, b, c, d)


def _ejecutar_full_save_o_delegar(doc, pdf_path, doc_obj, extra):
    """Solicita NEEDS_FULL_SAVE si el documento es prestado o ejecuta un guardado completo propio."""
    if doc_obj is not None:
        return {"success": False, "error": "NEEDS_FULL_SAVE", **extra}
    temp_path = pdf_path + ".tmp"
    try:
        doc.save(temp_path, garbage=1, deflate=True)
        doc.close()
        asegurar_permiso_escritura(pdf_path)
        shutil.move(temp_path, pdf_path)
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
    return {"success": True, **extra}


def _guardar_cambio_pdf(doc, pdf_path, doc_obj, extra_result=None):
    """
    Guarda cambios en el PDF evitando corrupción en PDFs con XRef híbrido (/XRefStm).
    En PyMuPDF 1.26.7, >=2 saveIncr() consecutivos sobre un PDF con /XRefStm corrompen la tabla xref.
    Si el trailer contiene /XRefStm, el documento está reparado o no admite guardado incremental,
    fuerza un guardado completo limpio (o devuelve NEEDS_FULL_SAVE preservando extra_result).
    """
    extra = dict(extra_result) if extra_result else {}

    try:
        trailer = doc.pdf_trailer() or ""
    except Exception:
        trailer = ""

    requiere_full = (
        "/XRefStm" in trailer
        or getattr(doc, "is_repaired", False)
        or getattr(doc, "_lira_incr_saved", False)
        or not getattr(doc, "can_save_incrementally", lambda: True)()
    )
    if requiere_full:
        return _ejecutar_full_save_o_delegar(doc, pdf_path, doc_obj, extra)

    try:
        doc.saveIncr()
        try:
            doc._lira_incr_saved = True
        except Exception:
            pass
        return {"success": True, **extra}
    except Exception as err:
        msg = str(err).lower()
        if "repaired" in msg or "incremental" in msg:
            return _ejecutar_full_save_o_delegar(doc, pdf_path, doc_obj, extra)
        raise err


def _hex_a_rgb(hex_str):
    if not hex_str or not isinstance(hex_str, str):
        return None
    s = hex_str.strip().lstrip("#")
    if s.lower() in ("none", "transparent", ""):
        return None
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6:
        return None
    try:
        r = int(s[0:2], 16) / 255.0
        g = int(s[2:4], 16) / 255.0
        b = int(s[4:6], 16) / 255.0
        return (r, g, b)
    except Exception:
        return None


def _rgb_a_hex(rgb_tuple):
    if not rgb_tuple or len(rgb_tuple) < 3:
        return None
    try:
        r = max(0, min(255, int(round(rgb_tuple[0] * 255))))
        g = max(0, min(255, int(round(rgb_tuple[1] * 255))))
        b = max(0, min(255, int(round(rgb_tuple[2] * 255))))
        return f"#{r:02x}{g:02x}{b:02x}".upper()
    except Exception:
        return None


def _llamar_guardar_cambio_pdf(doc, pdf_path, doc_obj, extra_result=None):
    """Invoca _guardar_cambio_pdf respetando monkeypatches sobre el paquete elementos_pdf."""
    pkg_mod = sys.modules.get('backend.documento.elementos_pdf')
    fn = getattr(pkg_mod, '_guardar_cambio_pdf', None) if pkg_mod is not None else None
    if callable(fn) and fn is not _guardar_cambio_pdf:
        return fn(doc, pdf_path, doc_obj, extra_result=extra_result)
    return _guardar_cambio_pdf(doc, pdf_path, doc_obj, extra_result=extra_result)


def _leer_annots_refs(doc, page):
    """Devuelve `(refs, indirect_xref)` del arreglo /Annots de la página."""
    kind, val = doc.xref_get_key(page.xref, "Annots")
    if kind == "null" or not val:
        return [], None
    indirect_xref = None
    if kind == "xref":
        m_ref = re.match(r"^\s*(\d+)\s+0\s+R\s*$", val)
        if not m_ref:
            return [], None
        indirect_xref = int(m_ref.group(1))
        arr_str = doc.xref_object(indirect_xref, compressed=False)
    else:
        arr_str = val
    refs = [int(m) for m in re.findall(r"(\d+)\s+0\s+R", arr_str)]
    return refs, indirect_xref


def _obtener_indice_anotacion(doc, page, annot_xref):
    """Devuelve el índice actual de `annot_xref` en /Annots o None si no está."""
    refs, _ = _leer_annots_refs(doc, page)
    if annot_xref in refs:
        return refs.index(annot_xref)
    return None


def _mover_anotacion_a_indice(doc, page, annot_xref, nuevo_idx):
    """Coloca `annot_xref` en el índice `nuevo_idx` dentro del arreglo /Annots."""
    refs, indirect_xref = _leer_annots_refs(doc, page)
    if annot_xref not in refs or len(refs) <= 1:
        return True
    idx = refs.index(annot_xref)
    destino = max(0, min(len(refs) - 1, int(nuevo_idx)))
    if destino == idx:
        return True
    refs.pop(idx)
    refs.insert(destino, annot_xref)
    nuevo_arr = "[" + " ".join(f"{r} 0 R" for r in refs) + "]"
    if indirect_xref is not None:
        doc.update_object(indirect_xref, nuevo_arr)
    else:
        doc.xref_set_key(page.xref, "Annots", nuevo_arr)
    return True
