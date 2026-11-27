# LiraLoud - Operaciones sobre anotaciones FreeText y Figuras vectoriales PDF
import pymupdf as fitz

from backend.documento.edicion_pdf import asegurar_permiso_escritura
from .comun import (
    _abrir_doc_pagina,
    _bbox_l1,
    _bbox_max_delta,
    _cerrar_si_propio,
    _hex_a_rgb,
    _llamar_guardar_cambio_pdf,
    _mover_anotacion_a_indice,
    _normalizar_rect_entrada,
    _obtener_indice_anotacion,
    _recargar_pagina_segura,
    _rect_a_visible,
    _rgb_a_hex,
)


def _seleccionar_anotacion_coincidente(compatibles, page, target_xref, bbox_original):
    """Selecciona la anotación objetivo por xref exacto, proximidad de bbox o fallback de xref."""
    xref_match = None
    if target_xref:
        for a in compatibles:
            if int(a.xref) == int(target_xref):
                xref_match = a
                if bbox_original is None:
                    return a
                vis_r = _rect_a_visible(a.rect, page)
                if _bbox_max_delta((vis_r.x0, vis_r.y0, vis_r.x1, vis_r.y1), bbox_original) <= 4.0:
                    return a
                break

    if bbox_original is not None:
        cands = [
            (a, _rect_a_visible(a.rect, page))
            for a in compatibles
        ]
        cands = [
            (a, vis_r)
            for a, vis_r in cands
            if _bbox_max_delta((vis_r.x0, vis_r.y0, vis_r.x1, vis_r.y1), bbox_original) <= 4.0
        ]
        if cands:
            return min(
                cands,
                key=lambda item: _bbox_l1(
                    (item[1].x0, item[1].y0, item[1].x1, item[1].y1), bbox_original
                ),
            )[0]

    return xref_match


def _encontrar_anotacion(page, target_xref, bbox_original, tipos_permitidos=None):
    annots = page.annots()
    if not annots:
        raise RuntimeError("La página no contiene anotaciones.")

    if tipos_permitidos is None:
        tipos_permitidos = (
            fitz.PDF_ANNOT_FREE_TEXT,
            fitz.PDF_ANNOT_SQUARE,
            fitz.PDF_ANNOT_CIRCLE,
            fitz.PDF_ANNOT_LINE,
        )

    compatibles = [a for a in annots if a.type and a.type[0] in tipos_permitidos]
    if not compatibles:
        raise RuntimeError("No hay anotaciones compatibles en la página.")

    encontrada = _seleccionar_anotacion_coincidente(compatibles, page, target_xref, bbox_original)
    if encontrada is not None:
        return encontrada

    raise RuntimeError("No se encontró la anotación objetivo.")


def _encontrar_freetext(page, target_xref, bbox_original):
    return _encontrar_anotacion(
        page, target_xref, bbox_original, tipos_permitidos=(fitz.PDF_ANNOT_FREE_TEXT,)
    )


def _recrear_linea_en_rect(page, annot, rect_dest, rot):
    """Recrea una anotación de línea/flecha escalando sus vértices al nuevo rectángulo visible."""
    v_raw = annot.vertices or []
    if len(v_raw) >= 2:
        if rot != 0:
            vis_v1 = fitz.Point(v_raw[0]) * page.rotation_matrix
            vis_v2 = fitz.Point(v_raw[1]) * page.rotation_matrix
        else:
            vis_v1 = fitz.Point(v_raw[0])
            vis_v2 = fitz.Point(v_raw[1])
    else:
        vis_v1 = fitz.Point(rect_dest.x0, rect_dest.y0)
        vis_v2 = fitz.Point(rect_dest.x1, rect_dest.y1)

    v_min_x = min(vis_v1.x, vis_v2.x)
    v_max_x = max(vis_v1.x, vis_v2.x)
    v_min_y = min(vis_v1.y, vis_v2.y)
    v_max_y = max(vis_v1.y, vis_v2.y)
    vw = max(1e-4, v_max_x - v_min_x)
    vh = max(1e-4, v_max_y - v_min_y)

    nw = rect_dest.width
    nh = rect_dest.height

    new_v1_vis = fitz.Point(
        rect_dest.x0 + (vis_v1.x - v_min_x) / vw * nw,
        rect_dest.y0 + (vis_v1.y - v_min_y) / vh * nh,
    )
    new_v2_vis = fitz.Point(
        rect_dest.x0 + (vis_v2.x - v_min_x) / vw * nw,
        rect_dest.y0 + (vis_v2.y - v_min_y) / vh * nh,
    )

    new_p1 = new_v1_vis * page.derotation_matrix if rot != 0 else new_v1_vis
    new_p2 = new_v2_vis * page.derotation_matrix if rot != 0 else new_v2_vis

    line_ends = annot.line_ends or (0, 0)
    colors = annot.colors or {}
    border = annot.border or {}
    opacity = annot.opacity

    page.delete_annot(annot)
    annot2 = page.add_line_annot(new_p1, new_p2)
    if len(line_ends) >= 2:
        annot2.set_line_ends(line_ends[0], line_ends[1])
    annot2.set_colors(stroke=colors.get("stroke"), fill=colors.get("fill"))
    annot2.set_border(width=float(border.get("width", 2.0)))
    if opacity is not None and opacity < 1.0:
        annot2.set_opacity(float(opacity))
    annot2.update()
    return int(annot2.xref)


def mover_redimensionar_freetext(pdf_path, pagina_idx, elemento, nuevo_bbox, doc_obj=None):
    doc = None
    owns_doc = False
    try:
        if pdf_path:
            asegurar_permiso_escritura(pdf_path)
        rect_dest = _normalizar_rect_entrada(nuevo_bbox)
        doc, page, owns_doc = _abrir_doc_pagina(pdf_path, pagina_idx, doc_obj=doc_obj)

        target_xref = int(elemento.get("xref") or 0)
        bbox_orig = elemento.get("bbox")
        annot = _encontrar_anotacion(page, target_xref, bbox_orig)
        idx_capa_orig = _obtener_indice_anotacion(doc, page, int(annot.xref))

        rot = getattr(page, "rotation", 0) % 360
        if annot.type and annot.type[0] == fitz.PDF_ANNOT_LINE:
            annot_xref = _recrear_linea_en_rect(page, annot, rect_dest, rot)
        else:
            rect_unrot = (
                (rect_dest * page.derotation_matrix).normalize()
                if rot != 0
                else rect_dest
            )
            annot.set_rect(rect_unrot)
            annot.update()
            annot_xref = int(annot.xref)

        if idx_capa_orig is not None:
            _mover_anotacion_a_indice(doc, page, annot_xref, idx_capa_orig)
        page = _recargar_pagina_segura(doc, page)

        return _llamar_guardar_cambio_pdf(
            doc,
            pdf_path,
            doc_obj,
            extra_result={
                "bbox": [
                    float(rect_dest.x0),
                    float(rect_dest.y0),
                    float(rect_dest.x1),
                    float(rect_dest.y1),
                ],
                "xref": annot_xref,
            },
        )
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        _cerrar_si_propio(doc, owns_doc)


def eliminar_freetext(pdf_path, pagina_idx, elemento, doc_obj=None):
    doc = None
    owns_doc = False
    try:
        if pdf_path:
            asegurar_permiso_escritura(pdf_path)
        doc, page, owns_doc = _abrir_doc_pagina(pdf_path, pagina_idx, doc_obj=doc_obj)

        target_xref = int(elemento.get("xref") or 0)
        bbox_orig = elemento.get("bbox")
        annot = _encontrar_anotacion(page, target_xref, bbox_orig)
        idx_capa_orig = _obtener_indice_anotacion(doc, page, int(annot.xref))

        page.delete_annot(annot)
        page = _recargar_pagina_segura(doc, page)
        return _llamar_guardar_cambio_pdf(doc, pdf_path, doc_obj)
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        _cerrar_si_propio(doc, owns_doc)


def _construir_anotacion_figura(page, rot, tipo_norm, x0, y0, x1, y1, color_borde, color_relleno):
    """Crea la anotación de flecha, círculo o rectángulo y devuelve sus metadatos visuales."""
    rgb_borde = _hex_a_rgb(color_borde) or (0.0, 0.0, 0.0)
    if tipo_norm in ("arrow", "flecha"):
        p1 = fitz.Point(float(x0), float(y0))
        p2 = fitz.Point(float(x1), float(y1))
        p1_unrot = p1 * page.derotation_matrix if rot != 0 else p1
        p2_unrot = p2 * page.derotation_matrix if rot != 0 else p2
        annot = page.add_line_annot(p1_unrot, p2_unrot)
        annot.set_line_ends(fitz.PDF_ANNOT_LE_NONE, fitz.PDF_ANNOT_LE_CLOSED_ARROW)
        return annot, "arrow", rgb_borde, rgb_borde, None, [float(x0), float(y0), float(x1), float(y1)]

    rect_dest = _normalizar_rect_entrada([x0, y0, x1, y1])
    rect_unrot = (
        (rect_dest * page.derotation_matrix).normalize()
        if rot != 0
        else rect_dest
    )
    if tipo_norm in ("circle", "oval", "circulo", "ovalo"):
        annot = page.add_circle_annot(rect_unrot)
        tipo_final = "circle"
    else:
        annot = page.add_rect_annot(rect_unrot)
        tipo_final = "rect"
    return annot, tipo_final, rgb_borde, _hex_a_rgb(color_relleno), rect_dest, None


def crear_figura_pdf(
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
    doc_obj=None,
):
    """Inserta una figura nativa (rectángulo, círculo/óvalo o flecha) como anotación en la página."""
    doc = None
    owns_doc = False
    try:
        if pdf_path:
            asegurar_permiso_escritura(pdf_path)
        doc, page, owns_doc = _abrir_doc_pagina(pdf_path, pagina_idx, doc_obj=doc_obj)
        rot = getattr(page, "rotation", 0) % 360

        tipo_norm = str(tipo or "rect").lower()
        annot, tipo_final, rgb_borde, rgb_relleno, rect_dest, vertices = _construir_anotacion_figura(
            page, rot, tipo_norm, x0, y0, x1, y1, color_borde, color_relleno
        )
        grosor_val = float(grosor if grosor is not None else 2.0)

        annot.set_colors(stroke=rgb_borde, fill=rgb_relleno)
        annot.set_border(width=grosor_val)
        if opacidad is not None and float(opacidad) < 1.0:
            annot.set_opacity(float(opacidad))
        annot.update()
        annot_xref = int(annot.xref)
        rect_out = rect_dest if rect_dest is not None else _rect_a_visible(annot.rect, page)
        page = _recargar_pagina_segura(doc, page)

        extra_result = {
            "xref": annot_xref,
            "bbox": [
                float(rect_out.x0),
                float(rect_out.y0),
                float(rect_out.x1),
                float(rect_out.y1),
            ],
            "tipo": "figura",
            "tipo_figura": tipo_final,
            "color_borde": _rgb_a_hex(rgb_borde),
            "color_relleno": _rgb_a_hex(rgb_relleno),
            "grosor": grosor_val,
        }
        if vertices is not None:
            extra_result["vertices"] = vertices

        return _llamar_guardar_cambio_pdf(
            doc,
            pdf_path,
            doc_obj,
            extra_result=extra_result,
        )
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        _cerrar_si_propio(doc, owns_doc)


def _aplicar_estilos_figura(doc, annot, color_borde, color_relleno, grosor, opacidad):
    """Aplica borde, relleno (o transparencia /IC), grosor y opacidad a una anotación de figura."""
    current_colors = annot.colors or {}
    c_stroke = current_colors.get("stroke")
    c_fill = current_colors.get("fill")

    quitar_relleno = False
    if isinstance(color_relleno, str) and color_relleno.strip().lower() in ("none", "transparent"):
        quitar_relleno = True
        c_fill = []
    elif color_relleno is not None:
        c_fill = _hex_a_rgb(color_relleno)

    if color_borde is not None:
        c_stroke = _hex_a_rgb(color_borde) or (0.0, 0.0, 0.0)
        if annot.type and annot.type[0] == fitz.PDF_ANNOT_LINE:
            c_fill = c_stroke

    annot.set_colors(stroke=c_stroke, fill=c_fill)
    if quitar_relleno:
        try:
            ic_kind, _ = doc.xref_get_key(annot.xref, "IC")
            if ic_kind != "null":
                doc.xref_set_key(annot.xref, "IC", "null")
        except Exception:
            pass

    if grosor is not None:
        annot.set_border(width=float(grosor))

    if opacidad is not None:
        annot.set_opacity(float(opacidad))

    return c_stroke, c_fill, quitar_relleno


def editar_figura_pdf(
    pdf_path,
    pagina_idx,
    elemento,
    color_borde=None,
    color_relleno=None,
    grosor=None,
    opacidad=None,
    doc_obj=None,
):
    """Actualiza color de borde, relleno (o ninguno), grosor y opacidad de una figura existente."""
    doc = None
    owns_doc = False
    try:
        if pdf_path:
            asegurar_permiso_escritura(pdf_path)
        doc, page, owns_doc = _abrir_doc_pagina(pdf_path, pagina_idx, doc_obj=doc_obj)

        target_xref = int(elemento.get("xref") or 0)
        bbox_orig = elemento.get("bbox")
        annot = _encontrar_anotacion(
            page,
            target_xref,
            bbox_orig,
            tipos_permitidos=(
                fitz.PDF_ANNOT_SQUARE,
                fitz.PDF_ANNOT_CIRCLE,
                fitz.PDF_ANNOT_LINE,
            ),
        )

        c_stroke, c_fill, quitar_relleno = _aplicar_estilos_figura(
            doc, annot, color_borde, color_relleno, grosor, opacidad
        )

        vis_rect = _rect_a_visible(annot.rect, page)
        border_width = float(grosor) if grosor is not None else float((annot.border or {}).get("width", 2.0))
        annot.update()
        annot_xref = int(annot.xref)
        page = _recargar_pagina_segura(doc, page)

        return _llamar_guardar_cambio_pdf(
            doc,
            pdf_path,
            doc_obj,
            extra_result={
                "xref": annot_xref,
                "bbox": [
                    float(vis_rect.x0),
                    float(vis_rect.y0),
                    float(vis_rect.x1),
                    float(vis_rect.y1),
                ],
                "color_borde": _rgb_a_hex(c_stroke),
                "color_relleno": None if (quitar_relleno or not c_fill) else _rgb_a_hex(c_fill),
                "grosor": border_width,
            },
        )
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        _cerrar_si_propio(doc, owns_doc)
