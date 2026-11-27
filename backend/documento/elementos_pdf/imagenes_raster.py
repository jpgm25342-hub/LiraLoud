# LiraLoud - Helpers raster, localización y transformación de imágenes PDF
import math

import cv2
import numpy as np
import pymupdf as fitz

from .comun import (
    _bbox_l1,
    _bbox_max_delta,
    _rect_a_visible,
)
from .stream_xobjects import _recolectar_instancias_do


def _detectar_overlay_imagen(doc, page, target_xref, bbox_unrot):
    """Devuelve False si la imagen vive en un stream de fondo (overlay=False); True en caso contrario."""
    try:
        streams = page.get_contents() or []
        if len(streams) <= 1:
            return True
        occurrences, _ = _recolectar_instancias_do(doc, page)
        mejor = None
        mejor_dist = float("inf")
        for occ in occurrences:
            if target_xref > 0 and occ.xref != target_xref:
                continue
            d = _bbox_l1(occ.bbox, bbox_unrot)
            if d < mejor_dist:
                mejor_dist = d
                mejor = occ
        if mejor is not None and mejor.stream_xref == streams[0]:
            return False
    except Exception:
        pass
    return True


def _filtrar_candidatos_imagen(infos, vis_bboxes, target_xref, bbox_orig, target_idx):
    """Filtra candidatos de imagen en cascada: xref exacto, proximidad de bbox o índice."""
    cands = []
    for idx, info in enumerate(infos):
        ixref = int(info.get("xref") or 0)
        if target_xref > 0 and ixref == target_xref:
            cands.append((idx, info))

    if not cands and bbox_orig is not None:
        for idx, info in enumerate(infos):
            if _bbox_max_delta(vis_bboxes[idx], bbox_orig) <= 2.5:
                cands.append((idx, info))

    if not cands and target_idx is not None and 0 <= int(target_idx) < len(infos):
        idx = int(target_idx)
        cands.append((idx, infos[idx]))

    return cands


def _localizar_info_imagen(page, elemento):
    infos = page.get_image_info(xrefs=True)
    if not infos:
        raise RuntimeError("La página no contiene imágenes.")

    target_xref = int(elemento.get("xref") or 0)
    bbox_orig = elemento.get("bbox")
    target_idx = elemento.get("index")

    vis_bboxes = [tuple(_rect_a_visible(info["bbox"], page)) for info in infos]
    cands = _filtrar_candidatos_imagen(infos, vis_bboxes, target_xref, bbox_orig, target_idx)

    if not cands:
        raise RuntimeError("No se encontró la imagen especificada en la página.")

    def _score(item):
        idx, _ = item
        l1 = _bbox_l1(vis_bboxes[idx], bbox_orig) if bbox_orig is not None else 0.0
        idx_diff = abs(idx - int(target_idx)) if target_idx is not None else 0
        return (round(l1, 4), idx_diff)

    best_idx, best_info = min(cands, key=_score)
    return best_idx, best_info


def _obtener_smask_xref(doc, page, xref):
    if xref <= 0:
        return 0
    try:
        kind, val = doc.xref_get_key(xref, "SMask")
        if kind == "xref":
            return int(val.split()[0])
    except Exception:
        pass
    try:
        for item in page.get_images(full=True):
            if int(item[0]) == int(xref) and int(item[1]) > 0:
                return int(item[1])
    except Exception:
        pass
    return 0


def _extraer_bgra_de_xref(doc, page, xref):
    """Extrae la imagen `xref` (+ `/SMask`) como arreglo BGRA uint8 sin premultiplicar."""
    pix = fitz.Pixmap(doc, int(xref))
    alpha_ch = None

    if pix.alpha:
        arr_full = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n).copy()
        alpha_ch = arr_full[:, :, -1]
        pix = fitz.Pixmap(pix, 0)

    if pix.colorspace is None or pix.colorspace.n != 3:
        pix = fitz.Pixmap(fitz.csRGB, pix)

    rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3).copy()

    smask_xref = _obtener_smask_xref(doc, page, int(xref))
    if smask_xref > 0:
        try:
            mp = fitz.Pixmap(doc, smask_xref)
            if mp.n > 1:
                mp = fitz.Pixmap(fitz.csGRAY, mp)
            mask_arr = np.frombuffer(mp.samples, dtype=np.uint8).reshape(mp.h, mp.w).copy()
            if (mp.h, mp.w) != (pix.h, pix.w):
                mask_arr = cv2.resize(mask_arr, (pix.w, pix.h), interpolation=cv2.INTER_LINEAR)
            alpha_ch = mask_arr
        except Exception:
            pass

    if alpha_ch is None:
        alpha_ch = np.full((pix.h, pix.w), 255, dtype=np.uint8)

    bgra = np.empty((pix.h, pix.w, 4), dtype=np.uint8)
    bgra[:, :, :3] = rgb[:, :, ::-1]
    bgra[:, :, 3] = alpha_ch
    return bgra


def _extraer_bgra_de_elemento(doc, page, info):
    xref = int(info.get("xref") or 0)
    if xref > 0:
        return _extraer_bgra_de_xref(doc, page, xref)
    rect = _rect_a_visible(info["bbox"], page)
    pix = page.get_pixmap(clip=rect, dpi=200, alpha=True)
    rgba = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 4).copy()
    return cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA)


def _transform_es_recto(transform):
    if not transform or len(transform) < 6:
        return True
    a, b, c, d, _, _ = [float(v) for v in transform[:6]]
    return abs(b) <= 1e-2 and abs(c) <= 1e-2 and a > 0 and d > 0


def _rotar_bgra_multiplo_90(bgra, a, b, c, d):
    """Aplica rotación exacta de 90°, 180° o 270° si la matriz lineal corresponde a un múltiplo de 90° sin sesgo."""
    if abs(a) <= 1e-2 and abs(d) <= 1e-2:
        if b > 0 and c < 0:
            return cv2.rotate(bgra, cv2.ROTATE_90_CLOCKWISE)
        if b < 0 and c > 0:
            return cv2.rotate(bgra, cv2.ROTATE_90_COUNTERCLOCKWISE)
    if abs(b) <= 1e-2 and abs(c) <= 1e-2 and a < 0 and d < 0:
        return cv2.rotate(bgra, cv2.ROTATE_180)
    return None


def _hornear_transform_bgra(bgra, transform, bbox):
    """Aplica la transformación actual (rotación/volteo/skew) al raster para dejarlo recto en `bbox`."""
    if _transform_es_recto(transform):
        return bgra

    a, b, c, d, e, f = [float(v) for v in transform[:6]]
    x0, y0, x1, y1 = [float(v) for v in bbox[:4]]
    w_pdf = max(1.0, x1 - x0)
    h_pdf = max(1.0, y1 - y0)

    rotada = _rotar_bgra_multiplo_90(bgra, a, b, c, d)
    if rotada is not None:
        return rotada

    src_h, src_w = bgra.shape[:2]
    len_u = max(1.0, math.hypot(a, b))
    len_v = max(1.0, math.hypot(c, d))
    px_scale = max(1.0, min(4.0, max(src_w / len_u, src_h / len_v)))
    if max(w_pdf, h_pdf) * px_scale > 2400.0:
        px_scale = max(1.0, 2400.0 / max(w_pdf, h_pdf))

    out_w = max(2, int(round(w_pdf * px_scale)))
    out_h = max(2, int(round(h_pdf * px_scale)))

    M = np.array(
        [
            [
                (a / max(1, src_w)) * (out_w / w_pdf),
                (c / max(1, src_h)) * (out_w / w_pdf),
                (e - x0) * (out_w / w_pdf),
            ],
            [
                (b / max(1, src_w)) * (out_h / h_pdf),
                (d / max(1, src_h)) * (out_h / h_pdf),
                (f - y0) * (out_h / h_pdf),
            ],
        ],
        dtype=np.float64,
    )
    return cv2.warpAffine(
        bgra,
        M,
        (out_w, out_h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )


def _codificar_png(bgra):
    ok, buf = cv2.imencode(".png", bgra)
    if not ok:
        raise RuntimeError("No se pudo codificar el raster RGBA como PNG.")
    return buf.tobytes()


def _muestrear_color_fondo_borde(page, rect_vis):
    """Muestrea la mediana RGB del perímetro exterior de `rect_vis` para cubrir fondos blancos o teñidos."""
    try:
        margen = 3.0
        clip_ext = fitz.Rect(
            max(0.0, rect_vis.x0 - margen),
            max(0.0, rect_vis.y0 - margen),
            min(float(page.rect.width), rect_vis.x1 + margen),
            min(float(page.rect.height), rect_vis.y1 + margen),
        )
        pix = page.get_pixmap(dpi=72, clip=clip_ext, alpha=False)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
        if arr.shape[0] < 4 or arr.shape[1] < 4:
            return (1.0, 1.0, 1.0)
        borde = np.concatenate(
            [
                arr[0:2, :, :].reshape(-1, 3),
                arr[-2:, :, :].reshape(-1, 3),
                arr[:, 0:2, :].reshape(-1, 3),
                arr[:, -2:, :].reshape(-1, 3),
            ],
            axis=0,
        )
        med = np.median(borde, axis=0) / 255.0
        return (float(med[0]), float(med[1]), float(med[2]))
    except Exception:
        return (1.0, 1.0, 1.0)
