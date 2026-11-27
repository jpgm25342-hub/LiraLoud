# LiraLoud - Operaciones sobre imágenes incrustadas en PDF
import math
import os
import re

import cv2
import numpy as np
import pymupdf as fitz

from backend.documento.edicion_pdf import asegurar_permiso_escritura
from .comun import (
    _abrir_doc_pagina,
    _bbox_l1,
    _cerrar_si_propio,
    _detectar_rotacion_recta_90,
    _llamar_guardar_cambio_pdf,
    _normalizar_rect_entrada,
    _recargar_pagina_segura,
    _rect_a_visible,
    _rect_para_insert_image,
    _transform_visible,
)
from .stream_xobjects import _recolectar_instancias_do, _remover_instancia_imagen
from .imagenes_raster import (
    _codificar_png,
    _detectar_overlay_imagen,
    _extraer_bgra_de_elemento,
    _extraer_bgra_de_xref,
    _filtrar_candidatos_imagen,
    _hornear_transform_bgra,
    _localizar_info_imagen,
    _muestrear_color_fondo_borde,
    _obtener_smask_xref,
    _rotar_bgra_multiplo_90,
    _transform_es_recto,
)


def _reubicar_imagen(pdf_path, pagina_idx, elemento, nuevo_bbox, doc_obj=None):
    doc = None
    owns_doc = False
    try:
        if pdf_path:
            asegurar_permiso_escritura(pdf_path)
        rect_dest_vis = _normalizar_rect_entrada(nuevo_bbox)
        doc, page, owns_doc = _abrir_doc_pagina(pdf_path, pagina_idx, doc_obj=doc_obj)

        idx_info, info = _localizar_info_imagen(page, elemento)
        target_xref = int(info.get("xref") or 0)
        bbox_unrot = tuple(info["bbox"])
        vis_bbox = tuple(_rect_a_visible(bbox_unrot, page))
        transform_vis = _transform_visible(info.get("transform"), page)
        rot_pag = getattr(page, "rotation", 0) % 360

        vis_rot_90 = _detectar_rotacion_recta_90(transform_vis)
        png_bytes = None
        if vis_rot_90 is None or target_xref <= 0:
            bgra = _extraer_bgra_de_elemento(doc, page, info)
            if target_xref > 0:
                bgra = _hornear_transform_bgra(bgra, transform_vis, vis_bbox)
            png_bytes = _codificar_png(bgra)

        usar_overlay = _detectar_overlay_imagen(doc, page, target_xref, bbox_unrot)
        page, _ = _remover_instancia_imagen(
            doc, page, target_xref, bbox_unrot, index=idx_info
        )

        rect_insert = _rect_para_insert_image(rect_dest_vis, page)
        if png_bytes is not None:
            new_xref = page.insert_image(
                rect_insert,
                stream=png_bytes,
                rotate=rot_pag,
                keep_proportion=False,
                overlay=usar_overlay,
            )
        else:
            fitz_rotate = (rot_pag - vis_rot_90) % 360
            new_xref = page.insert_image(
                rect_insert,
                xref=target_xref,
                rotate=fitz_rotate,
                keep_proportion=False,
                overlay=usar_overlay,
            )

        page = _recargar_pagina_segura(doc, page)
        return _llamar_guardar_cambio_pdf(
            doc,
            pdf_path,
            doc_obj,
            extra_result={
                "bbox": [
                    float(rect_dest_vis.x0),
                    float(rect_dest_vis.y0),
                    float(rect_dest_vis.x1),
                    float(rect_dest_vis.y1),
                ],
                "xref": int(new_xref),
            },
        )
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        _cerrar_si_propio(doc, owns_doc)


def insertar_imagen_pdf(pdf_path, pagina_idx, ruta_imagen, bbox=None, doc_obj=None):
    """Inserta una nueva imagen en la página indicada, centrada y manteniendo su proporción."""
    if not ruta_imagen or not os.path.isfile(ruta_imagen):
        return {"success": False, "error": "Archivo de imagen no encontrado."}

    doc = None
    owns_doc = False
    try:
        if pdf_path:
            asegurar_permiso_escritura(pdf_path)
        doc, page, owns_doc = _abrir_doc_pagina(pdf_path, pagina_idx, doc_obj=doc_obj)

        if bbox is not None:
            rect_dest_vis = _normalizar_rect_entrada(bbox)
        else:
            img_w, img_h = 300.0, 200.0
            try:
                pix_tmp = fitz.Pixmap(ruta_imagen)
                if pix_tmp.width > 0 and pix_tmp.height > 0:
                    img_w = float(pix_tmp.width)
                    img_h = float(pix_tmp.height)
            except Exception:
                pass

            pw = float(page.rect.width)
            ph = float(page.rect.height)
            max_w = pw * 0.45
            max_h = ph * 0.45
            escala = min(max_w / max(1.0, img_w), max_h / max(1.0, img_h))
            w_pt = max(36.0, img_w * escala)
            h_pt = max(36.0, img_h * escala)
            x0 = (pw - w_pt) / 2.0
            y0 = (ph - h_pt) / 2.0
            rect_dest_vis = fitz.Rect(x0, y0, x0 + w_pt, y0 + h_pt)

        rot_pag = getattr(page, "rotation", 0) % 360
        rect_insert = _rect_para_insert_image(rect_dest_vis, page)
        new_xref = page.insert_image(
            rect_insert,
            filename=ruta_imagen,
            rotate=rot_pag,
            keep_proportion=False,
            overlay=True,
        )
        page = _recargar_pagina_segura(doc, page)
        return _llamar_guardar_cambio_pdf(
            doc,
            pdf_path,
            doc_obj,
            extra_result={
                "tipo": "imagen",
                "xref": int(new_xref),
                "bbox": [
                    float(rect_dest_vis.x0),
                    float(rect_dest_vis.y0),
                    float(rect_dest_vis.x1),
                    float(rect_dest_vis.y1),
                ],
            },
        )
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        _cerrar_si_propio(doc, owns_doc)






def mover_imagen(pdf_path, pagina_idx, elemento, nuevo_bbox, doc_obj=None):
    return _reubicar_imagen(pdf_path, pagina_idx, elemento, nuevo_bbox, doc_obj=doc_obj)


def redimensionar_imagen(pdf_path, pagina_idx, elemento, nuevo_bbox, doc_obj=None):
    return _reubicar_imagen(pdf_path, pagina_idx, elemento, nuevo_bbox, doc_obj=doc_obj)


def reemplazar_imagen(pdf_path, pagina_idx, elemento, ruta_imagen, doc_obj=None):
    if not ruta_imagen or not os.path.isfile(ruta_imagen):
        return {"success": False, "error": "El archivo de imagen seleccionado no existe."}

    doc = None
    owns_doc = False
    try:
        if pdf_path:
            asegurar_permiso_escritura(pdf_path)
        raw_bytes = np.fromfile(ruta_imagen, dtype=np.uint8)
        img = cv2.imdecode(raw_bytes, cv2.IMREAD_UNCHANGED)
        if img is None:
            return {"success": False, "error": "No se pudo decodificar la imagen seleccionada."}

        ext = os.path.splitext(ruta_imagen)[1].lower()
        if ext in (".jpg", ".jpeg", ".png"):
            with open(ruta_imagen, "rb") as f:
                stream_bytes = f.read()
        else:
            stream_bytes = _codificar_png(img)

        doc, page, owns_doc = _abrir_doc_pagina(pdf_path, pagina_idx, doc_obj=doc_obj)
        idx_info, info = _localizar_info_imagen(page, elemento)
        target_xref = int(info.get("xref") or 0)
        bbox_unrot = tuple(info["bbox"])
        vis_rect = _rect_a_visible(bbox_unrot, page)
        rot_pag = getattr(page, "rotation", 0) % 360

        rect_dest_vis = fitz.Rect(elemento.get("bbox") or vis_rect).normalize()
        if rect_dest_vis.width < 2.0 or rect_dest_vis.height < 2.0:
            rect_dest_vis = vis_rect

        page, _ = _remover_instancia_imagen(
            doc, page, target_xref, bbox_unrot, index=idx_info
        )

        rect_insert = _rect_para_insert_image(rect_dest_vis, page)
        new_xref = page.insert_image(
            rect_insert,
            stream=stream_bytes,
            rotate=rot_pag,
            keep_proportion=False,
            overlay=True,
        )
        page = _recargar_pagina_segura(doc, page)
        return _llamar_guardar_cambio_pdf(
            doc,
            pdf_path,
            doc_obj,
            extra_result={
                "bbox": [
                    float(rect_dest_vis.x0),
                    float(rect_dest_vis.y0),
                    float(rect_dest_vis.x1),
                    float(rect_dest_vis.y1),
                ],
                "xref": int(new_xref),
            },
        )
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        _cerrar_si_propio(doc, owns_doc)






def _rotar_imagen_multiplo_90(
    doc, page, info, idx_info, target_xref, bbox_unrot, vis_bbox, transform_vis, rot_pag, w_pdf, h_pdf, cx, cy, ang
):
    """Aplica una rotación exacta múltiplo de 90° reutilizando xref nativo o rotando píxeles BGRA."""
    vis_rot_90 = _detectar_rotacion_recta_90(transform_vis)
    ang_90 = int(round(ang / 90.0) * 90) % 360
    if ang_90 in (90, 270):
        new_w, new_h = h_pdf, w_pdf
    else:
        new_w, new_h = w_pdf, h_pdf
    rect_dest_vis = fitz.Rect(
        cx - new_w / 2.0,
        cy - new_h / 2.0,
        cx + new_w / 2.0,
        cy + new_h / 2.0,
    )
    rect_insert = _rect_para_insert_image(rect_dest_vis, page)

    if vis_rot_90 is not None and target_xref > 0:
        new_vis_rot = (vis_rot_90 + ang_90) % 360
        fitz_rotate = (rot_pag - new_vis_rot) % 360
        page, _ = _remover_instancia_imagen(
            doc, page, target_xref, bbox_unrot, index=idx_info
        )
        new_xref = page.insert_image(
            rect_insert,
            xref=target_xref,
            rotate=fitz_rotate,
            keep_proportion=False,
            overlay=True,
        )
        return page, rect_dest_vis, new_xref

    bgra = _extraer_bgra_de_elemento(doc, page, info)
    if target_xref > 0:
        bgra = _hornear_transform_bgra(bgra, transform_vis, vis_bbox)
    if ang_90 == 90:
        bgra = cv2.rotate(bgra, cv2.ROTATE_90_CLOCKWISE)
    elif ang_90 == 180:
        bgra = cv2.rotate(bgra, cv2.ROTATE_180)
    elif ang_90 == 270:
        bgra = cv2.rotate(bgra, cv2.ROTATE_90_COUNTERCLOCKWISE)
    png_bytes = _codificar_png(bgra)
    page, _ = _remover_instancia_imagen(
        doc, page, target_xref, bbox_unrot, index=idx_info
    )
    new_xref = page.insert_image(
        rect_insert,
        stream=png_bytes,
        rotate=rot_pag,
        keep_proportion=False,
        overlay=True,
    )
    return page, rect_dest_vis, new_xref


def rotar_imagen(pdf_path, pagina_idx, elemento, angulo_grados, doc_obj=None):
    """
    Rota una imagen alrededor de su centro original.
    Convención: `angulo_grados > 0` = sentido horario ("a la derecha").
    """
    doc = None
    owns_doc = False
    try:
        if pdf_path:
            asegurar_permiso_escritura(pdf_path)
        ang = float(angulo_grados) % 360.0
        doc, page, owns_doc = _abrir_doc_pagina(pdf_path, pagina_idx, doc_obj=doc_obj)
        idx_info, info = _localizar_info_imagen(page, elemento)
        target_xref = int(info.get("xref") or 0)
        bbox_unrot = tuple(info["bbox"])
        vis_rect = _rect_a_visible(bbox_unrot, page)
        vis_bbox = tuple(vis_rect)
        transform_vis = _transform_visible(info.get("transform"), page)
        rot_pag = getattr(page, "rotation", 0) % 360

        if abs(ang) < 1e-4 or abs(ang - 360.0) < 1e-4:
            return {
                "success": True,
                "bbox": [
                    float(vis_rect.x0),
                    float(vis_rect.y0),
                    float(vis_rect.x1),
                    float(vis_rect.y1),
                ],
                "xref": target_xref,
            }

        w_pdf = max(2.0, float(vis_rect.width))
        h_pdf = max(2.0, float(vis_rect.height))
        cx = (float(vis_rect.x0) + float(vis_rect.x1)) / 2.0
        cy = (float(vis_rect.y0) + float(vis_rect.y1)) / 2.0

        dist_90 = min(ang % 90.0, 90.0 - (ang % 90.0))
        es_multiplo_90 = dist_90 < 1e-3

        if es_multiplo_90:
            page, rect_dest_vis, new_xref = _rotar_imagen_multiplo_90(
                doc, page, info, idx_info, target_xref, bbox_unrot, vis_bbox,
                transform_vis, rot_pag, w_pdf, h_pdf, cx, cy, ang,
            )
        else:
            bgra = _extraer_bgra_de_elemento(doc, page, info)
            if target_xref > 0:
                bgra = _hornear_transform_bgra(bgra, transform_vis, vis_bbox)
            src_h, src_w = bgra.shape[:2]

            px_scale = max(1.0, min(4.0, max(src_w / w_pdf, src_h / h_pdf)))
            if max(w_pdf, h_pdf) * px_scale > 2400.0:
                px_scale = max(1.0, 2400.0 / max(w_pdf, h_pdf))

            base_w = max(2, int(round(w_pdf * px_scale)))
            base_h = max(2, int(round(h_pdf * px_scale)))
            if (src_w, src_h) != (base_w, base_h):
                interp = (
                    cv2.INTER_AREA
                    if (base_w < src_w and base_h < src_h)
                    else cv2.INTER_CUBIC
                )
                base_bgra = cv2.resize(bgra, (base_w, base_h), interpolation=interp)
            else:
                base_bgra = bgra

            rad = math.radians(ang)
            cos_a = abs(math.cos(rad))
            sin_a = abs(math.sin(rad))

            new_cw = max(2, int(round(base_w * cos_a + base_h * sin_a)))
            new_ch = max(2, int(round(base_w * sin_a + base_h * cos_a)))
            M = cv2.getRotationMatrix2D((base_w / 2.0, base_h / 2.0), -ang, 1.0)
            M[0, 2] += (new_cw - base_w) / 2.0
            M[1, 2] += (new_ch - base_h) / 2.0

            rot_bgra = cv2.warpAffine(
                base_bgra,
                M,
                (new_cw, new_ch),
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_CONSTANT,
                borderValue=(0, 0, 0, 0),
            )

            new_w_pdf = w_pdf * cos_a + h_pdf * sin_a
            new_h_pdf = w_pdf * sin_a + h_pdf * cos_a
            rect_dest_vis = fitz.Rect(
                cx - new_w_pdf / 2.0,
                cy - new_h_pdf / 2.0,
                cx + new_w_pdf / 2.0,
                cy + new_h_pdf / 2.0,
            )
            rect_insert = _rect_para_insert_image(rect_dest_vis, page)

            png_bytes = _codificar_png(rot_bgra)
            page, _ = _remover_instancia_imagen(
                doc, page, target_xref, bbox_unrot, index=idx_info
            )
            new_xref = page.insert_image(
                rect_insert,
                stream=png_bytes,
                rotate=rot_pag,
                keep_proportion=False,
                overlay=True,
            )

        page = _recargar_pagina_segura(doc, page)
        return _llamar_guardar_cambio_pdf(
            doc,
            pdf_path,
            doc_obj,
            extra_result={
                "bbox": [
                    float(rect_dest_vis.x0),
                    float(rect_dest_vis.y0),
                    float(rect_dest_vis.x1),
                    float(rect_dest_vis.y1),
                ],
                "xref": int(new_xref),
            },
        )
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        _cerrar_si_propio(doc, owns_doc)






def eliminar_imagen(pdf_path, pagina_idx, elemento, doc_obj=None):
    doc = None
    owns_doc = False
    try:
        if pdf_path:
            asegurar_permiso_escritura(pdf_path)
        doc, page, owns_doc = _abrir_doc_pagina(pdf_path, pagina_idx, doc_obj=doc_obj)
        idx_info, info = _localizar_info_imagen(page, elemento)
        target_xref = int(info.get("xref") or 0)
        bbox_orig = tuple(info["bbox"])

        page, _ = _remover_instancia_imagen(
            doc, page, target_xref, bbox_orig, index=idx_info
        )
        return _llamar_guardar_cambio_pdf(doc, pdf_path, doc_obj)
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        _cerrar_si_propio(doc, owns_doc)






def recortar_zona_como_imagen_pdf(
    pdf_path, pagina_idx, x0, y0, x1, y1, duplicar=False, doc_obj=None
):
    """
    Captura una región del PDF (diagrama, tabla, ilustración) a 300 DPI y la inserta como
    imagen movible/redimensionable. Si `duplicar=False`, cubre la zona original con el color
    de fondo muestreado del borde.
    """
    doc = None
    owns_doc = False
    try:
        if pdf_path:
            asegurar_permiso_escritura(pdf_path)
        rect_vis = _normalizar_rect_entrada([x0, y0, x1, y1])
        doc, page, owns_doc = _abrir_doc_pagina(pdf_path, pagina_idx, doc_obj=doc_obj)

        # Limitar al área visible de la página
        rect_vis = rect_vis & page.rect
        if rect_vis.is_empty or rect_vis.width < 6 or rect_vis.height < 6:
            return {"success": False, "error": "La zona seleccionada es demasiado pequeña."}

        # 1. Capturar la región original a 300 DPI antes de modificar nada
        pix_crop = page.get_pixmap(dpi=300, clip=rect_vis, alpha=False)
        png_bytes = pix_crop.tobytes("png")

        rot_pag = getattr(page, "rotation", 0) % 360

        # 2. Si es cortar (no duplicar), cubrir el área original con el color de fondo muestreado
        if not duplicar:
            bg_rgb = _muestrear_color_fondo_borde(page, rect_vis)
            rect_unrot = (
                (rect_vis * page.derotation_matrix).normalize()
                if rot_pag != 0
                else rect_vis
            )
            page.draw_rect(rect_unrot, color=None, fill=bg_rgb, overlay=True)
            rect_dest = rect_vis
        else:
            dx = min(14.0, max(0.0, float(page.rect.width) - rect_vis.x1))
            dy = min(14.0, max(0.0, float(page.rect.height) - rect_vis.y1))
            rect_dest = fitz.Rect(
                rect_vis.x0 + dx, rect_vis.y0 + dy, rect_vis.x1 + dx, rect_vis.y1 + dy
            )

        # 3. Insertar el recorte nítido como imagen manipulable
        rect_insert = _rect_para_insert_image(rect_dest, page)
        new_xref = page.insert_image(
            rect_insert,
            stream=png_bytes,
            rotate=rot_pag,
            keep_proportion=False,
            overlay=True,
        )
        page = _recargar_pagina_segura(doc, page)
        return _llamar_guardar_cambio_pdf(
            doc,
            pdf_path,
            doc_obj,
            extra_result={
                "tipo": "imagen",
                "xref": int(new_xref),
                "bbox": [
                    float(rect_dest.x0),
                    float(rect_dest.y0),
                    float(rect_dest.x1),
                    float(rect_dest.y1),
                ],
            },
        )
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        _cerrar_si_propio(doc, owns_doc)
