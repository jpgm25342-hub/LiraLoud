# LiraLoud - Inventario de elementos y gestión de capas (z-order) en PDF
import re

import pymupdf as fitz

from backend.documento.edicion_pdf import asegurar_permiso_escritura
from .anotaciones import _encontrar_anotacion
from .comun import (
    _abrir_doc_pagina,
    _cerrar_si_propio,
    _detectar_rotacion_recta_90,
    _leer_annots_refs,
    _llamar_guardar_cambio_pdf,
    _mover_anotacion_a_indice,
    _recargar_pagina_segura,
    _rect_a_visible,
    _rect_para_insert_image,
    _rgb_a_hex,
    _transform_visible,
)
from .imagenes import (
    _codificar_png,
    _extraer_bgra_de_elemento,
    _hornear_transform_bgra,
    _localizar_info_imagen,
)
from .stream_xobjects import _remover_instancia_imagen


def _leer_estilo_trazo_anotacion(annot):
    """Extrae (color_borde_hex, border_w, opacidad) de una anotación de figura con defaults seguros."""
    cols = annot.colors or {}
    c_stroke = cols.get("stroke")
    color_borde_hex = _rgb_a_hex(c_stroke) if c_stroke else "#000000"
    border_w = 2.0
    try:
        bdict = annot.border or {}
        border_w = float(bdict.get("width", 2.0))
    except Exception:
        pass
    op = 1.0
    try:
        op = float(annot.opacity) if annot.opacity is not None else 1.0
    except Exception:
        pass
    return color_borde_hex, border_w, op


def _serializar_anotacion_elemento(annot, page):
    """Convierte una anotación FreeText o figura vectorial a su diccionario de elemento editable, o None."""
    atype = annot.type
    if not atype:
        return None
    tipo_code = atype[0]

    if tipo_code == fitz.PDF_ANNOT_FREE_TEXT:
        r = _rect_a_visible(annot.rect, page)
        try:
            texto = str((annot.info or {}).get("content", "") or "")
        except Exception:
            texto = ""
        return {
            "id": f"freetext-{int(annot.xref)}",
            "tipo": "freetext",
            "xref": int(annot.xref),
            "bbox": [float(r.x0), float(r.y0), float(r.x1), float(r.y1)],
            "texto": texto,
        }

    if tipo_code in (fitz.PDF_ANNOT_SQUARE, fitz.PDF_ANNOT_CIRCLE):
        r = _rect_a_visible(annot.rect, page)
        tipo_fig = "rect" if tipo_code == fitz.PDF_ANNOT_SQUARE else "circle"
        c_fill = (annot.colors or {}).get("fill")
        color_relleno_hex = _rgb_a_hex(c_fill) if c_fill else None
        color_borde_hex, border_w, op = _leer_estilo_trazo_anotacion(annot)
        return {
            "id": f"figura-{int(annot.xref)}",
            "tipo": "figura",
            "tipo_figura": tipo_fig,
            "xref": int(annot.xref),
            "bbox": [float(r.x0), float(r.y0), float(r.x1), float(r.y1)],
            "color_borde": color_borde_hex,
            "color_relleno": color_relleno_hex,
            "grosor": border_w,
            "opacidad": op,
        }

    if tipo_code == fitz.PDF_ANNOT_LINE:
        r = _rect_a_visible(annot.rect, page)
        color_borde_hex, border_w, op = _leer_estilo_trazo_anotacion(annot)
        rot = getattr(page, "rotation", 0) % 360
        v_raw = annot.vertices or []
        if len(v_raw) >= 2:
            if rot != 0:
                p1_v = fitz.Point(v_raw[0]) * page.rotation_matrix
                p2_v = fitz.Point(v_raw[1]) * page.rotation_matrix
            else:
                p1_v = fitz.Point(v_raw[0])
                p2_v = fitz.Point(v_raw[1])
            verts_vis = [float(p1_v.x), float(p1_v.y), float(p2_v.x), float(p2_v.y)]
        else:
            verts_vis = [float(r.x0), float(r.y0), float(r.x1), float(r.y1)]
        return {
            "id": f"figura-{int(annot.xref)}",
            "tipo": "figura",
            "tipo_figura": "arrow",
            "xref": int(annot.xref),
            "bbox": [float(r.x0), float(r.y0), float(r.x1), float(r.y1)],
            "vertices": verts_vis,
            "color_borde": color_borde_hex,
            "color_relleno": color_borde_hex,
            "grosor": border_w,
            "opacidad": op,
        }

    return None


def obtener_elementos_pagina(pdf_path, pagina_idx, doc_obj=None):
    """Lista únicamente imágenes y anotaciones FreeText de la página indicada."""
    doc = None
    owns_doc = False
    try:
        doc, page, owns_doc = _abrir_doc_pagina(pdf_path, pagina_idx, doc_obj=doc_obj)
        elementos = []

        for idx, info in enumerate(page.get_image_info(xrefs=True)):
            xref = int(info.get("xref") or 0)
            vis_rect = _rect_a_visible(info["bbox"], page)
            bbox = [float(vis_rect.x0), float(vis_rect.y0), float(vis_rect.x1), float(vis_rect.y1)]
            raw_tr = info.get("transform", (1.0, 0.0, 0.0, 1.0, info["bbox"][0], info["bbox"][1]))
            transform = list(_transform_visible(raw_tr, page))
            elementos.append(
                {
                    "id": f"img-{int(pagina_idx)}-{idx}-{xref}",
                    "tipo": "imagen",
                    "index": idx,
                    "xref": xref,
                    "bbox": bbox,
                    "width": int(info.get("width") or 0),
                    "height": int(info.get("height") or 0),
                    "transform": transform,
                }
            )

        annots = page.annots()
        if annots:
            for annot in annots:
                elem = _serializar_anotacion_elemento(annot, page)
                if elem is not None:
                    elementos.append(elem)

        return {
            "success": True,
            "ancho_pagina": float(page.rect.width),
            "alto_pagina": float(page.rect.height),
            "elementos": elementos,
        }
    except Exception as e:
        return {"success": False, "error": str(e), "elementos": []}
    finally:
        _cerrar_si_propio(doc, owns_doc)


def _reordenar_capa_anotacion(doc, page, annot_xref, accion):
    """Reordena `annot_xref` dentro del arreglo /Annots de la página (z-order de anotaciones PDF)."""
    refs, _ = _leer_annots_refs(doc, page)
    if not refs:
        return False
    if annot_xref not in refs or len(refs) <= 1:
        return True

    idx = refs.index(annot_xref)
    if accion == "frente":
        nuevo_idx = len(refs) - 1
    elif accion == "fondo":
        nuevo_idx = 0
    elif accion == "subir":
        nuevo_idx = min(len(refs) - 1, idx + 1)
    elif accion == "bajar":
        nuevo_idx = max(0, idx - 1)
    else:
        return False

    return _mover_anotacion_a_indice(doc, page, annot_xref, nuevo_idx)


def cambiar_capa_elemento_pdf(pdf_path, pagina_idx, elemento, accion, doc_obj=None):
    """
    Cambia el orden de capa (z-order) de una figura, cuadro de texto o imagen:
    accion ∈ {'frente', 'subir', 'bajar', 'fondo'}.
    """
    accion_norm = (accion or "").strip().lower()
    if accion_norm not in ("frente", "subir", "bajar", "fondo"):
        return {"success": False, "error": f"Acción de capa inválida: {accion}"}
    if not isinstance(elemento, dict):
        return {"success": False, "error": "Elemento inválido."}

    tipo = elemento.get("tipo")
    doc = None
    owns_doc = False
    try:
        if pdf_path:
            asegurar_permiso_escritura(pdf_path)
        doc, page, owns_doc = _abrir_doc_pagina(pdf_path, pagina_idx, doc_obj=doc_obj)

        if tipo in ("figura", "freetext"):
            target_xref = int(elemento.get("xref") or 0)
            bbox_orig = elemento.get("bbox")
            annot = _encontrar_anotacion(page, target_xref, bbox_orig)
            if annot is None:
                return {"success": False, "error": "No se encontró la anotación en la página."}
            annot_xref = int(annot.xref)
            vis_rect = _rect_a_visible(annot.rect, page)
            if not _reordenar_capa_anotacion(doc, page, annot_xref, accion_norm):
                return {"success": False, "error": "No se pudo reordenar el arreglo de anotaciones."}
            page = _recargar_pagina_segura(doc, page)
            return _llamar_guardar_cambio_pdf(
                doc,
                pdf_path,
                doc_obj,
                extra_result={
                    "tipo": tipo,
                    "xref": annot_xref,
                    "bbox": [
                        float(vis_rect.x0),
                        float(vis_rect.y0),
                        float(vis_rect.x1),
                        float(vis_rect.y1),
                    ],
                },
            )

        if tipo == "imagen":
            return _reordenar_capa_imagen(doc, page, pdf_path, doc_obj, elemento, accion_norm)

        return {"success": False, "error": f"Tipo de elemento no soportado: {tipo}"}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        _cerrar_si_propio(doc, owns_doc)


def _snapshot_imagen_para_reinsercion(doc, page, idx_info, info):
    """Captura los datos necesarios para remover y reinsertar una imagen preservando rotación y alpha."""
    target_xref = int(info.get("xref") or 0)
    bbox_unrot = tuple(info["bbox"])
    vis_bbox = tuple(_rect_a_visible(bbox_unrot, page))
    rect_dest_vis = fitz.Rect(*vis_bbox)
    transform_vis = _transform_visible(info.get("transform"), page)
    rot_pag = getattr(page, "rotation", 0) % 360

    vis_rot_90 = _detectar_rotacion_recta_90(transform_vis)
    png_bytes = None
    if vis_rot_90 is None or target_xref <= 0:
        bgra = _extraer_bgra_de_elemento(doc, page, info)
        if target_xref > 0:
            bgra = _hornear_transform_bgra(bgra, transform_vis, vis_bbox)
        png_bytes = _codificar_png(bgra)

    return {
        "idx": idx_info,
        "xref": target_xref,
        "bbox_unrot": bbox_unrot,
        "rect_dest_vis": rect_dest_vis,
        "rot_pag": rot_pag,
        "vis_rot_90": vis_rot_90,
        "png_bytes": png_bytes,
    }


def _reinsertar_imagen_snapshot(page, snap, overlay=True):
    """Reinserta un snapshot de imagen en `page` con `overlay=True/False`."""
    rect_insert = _rect_para_insert_image(snap["rect_dest_vis"], page)
    if snap["png_bytes"] is not None:
        return page.insert_image(
            rect_insert,
            stream=snap["png_bytes"],
            rotate=snap["rot_pag"],
            keep_proportion=False,
            overlay=overlay,
        )
    fitz_rotate = (snap["rot_pag"] - snap["vis_rot_90"]) % 360
    return page.insert_image(
        rect_insert,
        xref=snap["xref"],
        rotate=fitz_rotate,
        keep_proportion=False,
        overlay=overlay,
    )


def _reordenar_secuencia_imagenes(doc, page, infos, idx_info, target_snap, indices_orden):
    """Toma snapshots de indices_orden, los remueve de atrás hacia adelante y los reinserta en ese orden."""
    snaps = [
        target_snap if k == idx_info else _snapshot_imagen_para_reinsercion(doc, page, k, infos[k])
        for k in indices_orden
    ]
    for snap in sorted(snaps, key=lambda s: s["idx"], reverse=True):
        page, _ = _remover_instancia_imagen(
            doc, page, snap["xref"], snap["bbox_unrot"], index=snap["idx"]
        )
    new_xref = target_snap["xref"]
    for snap in snaps:
        inserted_xref = _reinsertar_imagen_snapshot(page, snap, overlay=True)
        if snap is target_snap:
            new_xref = inserted_xref
    return page, new_xref


def _reordenar_capa_imagen(doc, page, pdf_path, doc_obj, elemento, accion_norm):
    """Reordena una imagen en N capas reales respecto a las demás imágenes y el contenido de la página."""
    infos = page.get_image_info(xrefs=True)
    idx_info, info = _localizar_info_imagen(page, elemento)
    n = len(infos)
    target_snap = _snapshot_imagen_para_reinsercion(doc, page, idx_info, info)

    if n <= 1 or accion_norm == "frente" or (accion_norm == "subir" and idx_info >= n - 1):
        poner_arriba = accion_norm in ("frente", "subir")
        page, _ = _remover_instancia_imagen(
            doc, page, target_snap["xref"], target_snap["bbox_unrot"], index=idx_info
        )
        new_xref = _reinsertar_imagen_snapshot(page, target_snap, overlay=poner_arriba)
    elif accion_norm == "fondo" or (accion_norm == "bajar" and idx_info <= 1):
        # Enviar al fondo (detrás de las demás imágenes y contenido)
        page, _ = _remover_instancia_imagen(
            doc, page, target_snap["xref"], target_snap["bbox_unrot"], index=idx_info
        )
        new_xref = _reinsertar_imagen_snapshot(page, target_snap, overlay=False)
    elif accion_norm == "subir":
        # Subir exactamente 1 capa: dejar idx_info+1 intacta, reinsertar [target] y luego [idx_info+2 .. n-1]
        indices_orden = [idx_info] + list(range(idx_info + 2, n))
        page, new_xref = _reordenar_secuencia_imagenes(doc, page, infos, idx_info, target_snap, indices_orden)
    else:
        # Bajar exactamente 1 capa (idx_info >= 2): reinsertar [target, idx_info-1, idx_info+1 .. n-1]
        indices_orden = [idx_info, idx_info - 1] + list(range(idx_info + 1, n))
        page, new_xref = _reordenar_secuencia_imagenes(doc, page, infos, idx_info, target_snap, indices_orden)

    page = _recargar_pagina_segura(doc, page)
    r_vis = target_snap["rect_dest_vis"]
    return _llamar_guardar_cambio_pdf(
        doc,
        pdf_path,
        doc_obj,
        extra_result={
            "tipo": "imagen",
            "xref": int(new_xref),
            "bbox": [
                float(r_vis.x0),
                float(r_vis.y0),
                float(r_vis.x1),
                float(r_vis.y1),
            ],
        },
    )
