import statistics
import fitz

from .comun import normalizar_color

def _bboxes_similares(a, b, tolerancia=1.5):
    return all(abs(a[i] - b[i]) <= tolerancia for i in range(4))

def _extraer_items_geometria(items, tiene_trazo, clasificar_rect, verticales, horizontales):
    """Clasifica los ítems vectoriales ('l' y 're') de un dibujo en segmentos o rectángulos."""
    for item in items:
        op = item[0]
        if op == "l" and len(item) >= 3:
            p1, p2 = item[1], item[2]
            if abs(p1.x - p2.x) <= 2.0 and abs(p2.y - p1.y) >= 4.0:
                verticales.append(((p1.x + p2.x) / 2.0, min(p1.y, p2.y), max(p1.y, p2.y)))
            elif abs(p1.y - p2.y) <= 2.0 and abs(p2.x - p1.x) >= 4.0:
                horizontales.append(((p1.y + p2.y) / 2.0, min(p1.x, p2.x), max(p1.x, p2.x)))
        elif op == "re" and len(item) >= 2:
            clasificar_rect(fitz.Rect(item[1]), tiene_trazo, emitir_bordes_trazo=True)


def _procesar_drawing_geometria(d, clasificar_rect, verticales, horizontales):
    """Extrae líneas y rectángulos clasificables de un dibujo individual de PyMuPDF."""
    tiene_trazo = (d.get("color") is not None) and (
        d.get("width") is None or float(d.get("width") or 0.0) > 0.0
    )
    items = d.get("items", [])
    tiene_re = any(it and it[0] == "re" for it in items)
    r = d.get("rect")
    if r is not None and not tiene_re and items:
        solo_lineas = all(it and it[0] == "l" for it in items)
        if (not solo_lineas and len(items) <= 12) or (not tiene_trazo and len(items) <= 4):
            clasificar_rect(fitz.Rect(r), tiene_trazo, emitir_bordes_trazo=False)

    _extraer_items_geometria(items, tiene_trazo, clasificar_rect, verticales, horizontales)


def _extraer_geometria_drawings_detallada(page):
    """Extrae segmentos verticales, horizontales, celdas con trazo y rectángulos solo-relleno."""
    verticales = []      # (x, y0, y1)
    horizontales = []    # (y, x0, x1)
    celdas = []          # fitz.Rect
    celdas_relleno = []  # fitz.Rect
    pw, ph = page.rect.width, page.rect.height

    def _clasificar_rect(rr, tiene_trazo, emitir_bordes_trazo):
        rw, rh = rr.width, rr.height
        if rw <= 3.0 and rh >= 4.0:
            verticales.append(((rr.x0 + rr.x1) / 2.0, rr.y0, rr.y1))
        elif rh <= 3.0 and rw >= 4.0:
            horizontales.append(((rr.y0 + rr.y1) / 2.0, rr.x0, rr.x1))
        elif rw >= pw * 0.92 and rh >= ph * 0.92:
            return
        elif rw < 10.0 and rh >= max(12.0, rw * 2.5):
            if tiene_trazo:
                verticales.append((rr.x0, rr.y0, rr.y1))
                verticales.append((rr.x1, rr.y0, rr.y1))
            else:
                celdas_relleno.append(fitz.Rect(rr))
        elif rh < 8.0 and rw >= max(12.0, rh * 2.5):
            if tiene_trazo:
                horizontales.append((rr.y0, rr.x0, rr.x1))
                horizontales.append((rr.y1, rr.x0, rr.x1))
            else:
                celdas_relleno.append(fitz.Rect(rr))
        elif rw >= 10.0 and rh >= 8.0:
            if tiene_trazo:
                celdas.append(fitz.Rect(rr))
                if emitir_bordes_trazo:
                    verticales.append((rr.x0, rr.y0, rr.y1))
                    verticales.append((rr.x1, rr.y0, rr.y1))
                    horizontales.append((rr.y0, rr.x0, rr.x1))
                    horizontales.append((rr.y1, rr.x0, rr.x1))
            else:
                celdas_relleno.append(fitz.Rect(rr))

    try:
        for d in page.get_drawings():
            _procesar_drawing_geometria(d, _clasificar_rect, verticales, horizontales)
    except Exception:
        pass
    return verticales, horizontales, celdas, celdas_relleno

def _extraer_geometria_drawings(page):
    """Extrae segmentos verticales, horizontales y rectángulos contenedores de los dibujos vectoriales."""
    verticales, horizontales, celdas, celdas_relleno = _extraer_geometria_drawings_detallada(page)
    return verticales, horizontales, celdas + celdas_relleno

def obtener_lineas_vectoriales(page):
    lineas = []
    verticales, horizontales, _ = _extraer_geometria_drawings(page)
    for x, y0, y1 in verticales:
        lineas.append((x, y0, x, y1))
    for y, x0, x1 in horizontales:
        lineas.append((x0, y, x1, y))
    return lineas

def limitar_rect_a_vecinos(page, rect_deseado, bbox_original_linea):
    data = page.get_text("dict")
    limite_arriba = 0.0
    limite_abajo = page.rect.height

    candidatos = []
    for b in data.get("blocks", []):
        if b.get("type") != 0:
            continue
        for l in b.get("lines", []):
            x0, y0, x1, y1 = l.get("bbox")
            if bbox_original_linea and _bboxes_similares((x0, y0, x1, y1), bbox_original_linea):
                continue
            candidatos.append((x0, y0, x1, y1))

    candidatos.extend(obtener_lineas_vectoriales(page))

    for x0, y0, x1, y1 in candidatos:
        if x1 < rect_deseado.x0 or x0 > rect_deseado.x1:
            continue
        centro_vecino = (y0 + y1) / 2.0
        centro_deseado = (rect_deseado.y0 + rect_deseado.y1) / 2.0

        if centro_vecino <= centro_deseado:
            limite_arriba = max(limite_arriba, y1)
        else:
            limite_abajo = min(limite_abajo, y0)

    nuevo_y0 = max(rect_deseado.y0, limite_arriba + 1)
    nuevo_y1 = min(rect_deseado.y1, limite_abajo - 1)
    nuevo_y1 = max(nuevo_y1, nuevo_y0 + 4)

    return fitz.Rect(rect_deseado.x0, nuevo_y0, rect_deseado.x1, nuevo_y1)

def obtener_origen_linea_original(page, bbox_original, tolerancia=1.5):
    data = page.get_text("dict")
    for b in data.get("blocks", []):
        if b.get("type") != 0:
            continue
        for l in b.get("lines", []):
            if _bboxes_similares(l.get("bbox"), bbox_original, tolerancia):
                spans = l.get("spans", [])
                if spans:
                    return spans[0].get("origin")
    return None

def _unir_spans_texto(spans):
    """Une los spans de una línea respetando kerning contiguo y puntuación."""
    texto = ""
    prev_sp = None
    for sp in spans:
        t = sp.get("text", "")
        if not t:
            continue
        if not texto:
            texto = t
        else:
            gap = None
            if prev_sp is not None and prev_sp.get("bbox") and sp.get("bbox"):
                gap = float(sp["bbox"][0]) - float(prev_sp["bbox"][2])
            tam_ref = min(
                float(prev_sp.get("size", 10.0) or 10.0) if prev_sp else 10.0,
                float(sp.get("size", 10.0) or 10.0),
            )
            contiguo = gap is not None and gap <= max(1.0, tam_ref * 0.12)
            if (
                contiguo
                or texto.endswith((" ", "\t", "\xa0"))
                or t.startswith((" ", "\t", "\xa0", ",", ".", ";", ":", "!", "?", ")", "]", "}", "…", "»"))
            ):
                texto += t
            else:
                texto += " " + t
        prev_sp = sp
    return texto.strip()

def _recuperar_banda_vertical_segura(rect_target, unmatched_rects, cy_self):
    """Recalcula una banda vertical segura usando puntos medios contra vecinos cuando el recorte colapsa en Y."""
    y0_band = rect_target.y0
    y1_band = rect_target.y1
    for ur in unmatched_rects:
        if ur.x1 <= rect_target.x0 + 0.5 or ur.x0 >= rect_target.x1 - 0.5:
            continue
        if (rect_target & ur).is_empty:
            continue
        cy_ur = (ur.y0 + ur.y1) / 2.0
        if cy_ur < cy_self:
            y0_band = max(y0_band, (cy_ur + cy_self) / 2.0 + 0.1)
        elif cy_ur > cy_self:
            y1_band = min(y1_band, (cy_self + cy_ur) / 2.0 - 0.1)
    if y1_band > y0_band + 0.4:
        return y0_band, y1_band
    return cy_self - 0.5, cy_self + 0.5


def _recortar_intervalo_eje(v0, v1, ur_min, ur_max, centro_self):
    """Recorta el intervalo [v0, v1] alejándolo de un rectángulo vecino [ur_min, ur_max] en el eje dado."""
    c_ur = (ur_min + ur_max) / 2.0
    if c_ur < centro_self and ur_max > v0:
        return max(v0, ur_max + 0.1), v1
    if c_ur > centro_self and ur_min < v1:
        return v0, min(v1, ur_min - 0.1)
    return v0, v1


def _recortar_rect_contra_vecinos(rect_target, unmatched_rects):
    """Recorta rect_target respecto a spans vecinos no coincidentes sin invadir líneas ni columnas vecinas."""
    if not unmatched_rects or not any(not (rect_target & ur).is_empty for ur in unmatched_rects):
        return fitz.Rect(rect_target)

    x0, y0, x1, y1 = rect_target.x0, rect_target.y0, rect_target.x1, rect_target.y1
    cx_self = (rect_target.x0 + rect_target.x1) / 2.0
    cy_self = (rect_target.y0 + rect_target.y1) / 2.0

    for ur in unmatched_rects:
        inter = fitz.Rect(x0, y0, x1, y1) & ur
        if inter.is_empty:
            continue
        min_w = max(1e-6, min(rect_target.width, ur.width))
        min_h = max(1e-6, min(rect_target.height, ur.height))
        overlap_x = inter.width / min_w
        overlap_y = inter.height / min_h

        if overlap_x >= overlap_y:
            y0, y1 = _recortar_intervalo_eje(y0, y1, ur.y0, ur.y1, cy_self)
        else:
            x0, x1 = _recortar_intervalo_eje(x0, x1, ur.x0, ur.x1, cx_self)

    if y1 <= y0 + 1.0:
        y0, y1 = _recuperar_banda_vertical_segura(rect_target, unmatched_rects, cy_self)

    if x1 <= x0 + 0.5:
        x0, x1 = rect_target.x0, rect_target.x1

    return fitz.Rect(x0, y0, x1, y1)

def _particionar_spans_por_rect(page, rect_original):
    """Separa los spans no vacíos de la página en afectados por rect_original y rects vecinos."""
    data = page.get_text("dict")
    matched = []
    unmatched_rects = []

    for b in data.get("blocks", []):
        if b.get("type") != 0:
            continue
        for l in b.get("lines", []):
            for sp in l.get("spans", []):
                txt = sp.get("text", "")
                if not txt.strip():
                    continue
                sr = fitz.Rect(sp.get("bbox"))
                inter = sr & rect_original
                area_sp = max(1e-6, sr.get_area())
                centro = fitz.Point((sr.x0 + sr.x1) / 2.0, (sr.y0 + sr.y1) / 2.0)
                if (not inter.is_empty and (inter.get_area() / area_sp) >= 0.45) or rect_original.contains(centro):
                    matched.append(sp)
                else:
                    unmatched_rects.append(sr)
    return matched, unmatched_rects


def _resolver_origen_primera_linea(matched):
    """Calcula el punto de origen (x, y) representativo de la primera línea de spans afectados."""
    top_span = min(matched, key=lambda s: float(s.get("bbox", (0, 0, 0, 0))[1]))
    top_bb = top_span.get("bbox", (0, 0, 0, 0))
    primera_linea = [
        s for s in matched
        if (float(top_bb[1]) - 2.0)
        <= ((float(s.get("bbox", (0, 0, 0, 0))[1]) + float(s.get("bbox", (0, 0, 0, 0))[3])) / 2.0)
        <= (float(top_bb[3]) + 2.0)
    ] or matched
    span_izq = min(primera_linea, key=lambda s: float(s.get("bbox", (0, 0, 0, 0))[0]))
    span_dom_linea = max(primera_linea, key=lambda s: len((s.get("text") or "").strip()))
    orig_izq = span_izq.get("origin")
    orig_dom = span_dom_linea.get("origin")
    if orig_izq and orig_dom:
        return (float(orig_izq[0]), float(orig_dom[1]))
    return orig_dom or orig_izq


def _inspeccionar_spans_en_rect(page, rect_original):
    """Antes de redactar, recopila metadatos reales y bboxes exactos de los spans afectados."""
    matched, unmatched_rects = _particionar_spans_por_rect(page, rect_original)

    if not matched:
        return False, None, None, [fitz.Rect(rect_original)]

    span_dom = max(matched, key=lambda s: len((s.get("text") or "").strip()))
    origen = _resolver_origen_primera_linea(matched)

    rect_union = fitz.Rect(matched[0].get("bbox"))
    for sp in matched[1:]:
        rect_union |= fitz.Rect(sp.get("bbox"))

    toca_vecino_original = any(not (rect_original & ur).is_empty for ur in unmatched_rects)
    toca_vecino_union = any(not (rect_union & ur).is_empty for ur in unmatched_rects)

    if not toca_vecino_union:
        rect_redact = fitz.Rect(rect_union) if toca_vecino_original else fitz.Rect(rect_original | rect_union)
        return True, origen, span_dom, [rect_redact]

    rects_redact = [
        _recortar_rect_contra_vecinos(fitz.Rect(sp.get("bbox")), unmatched_rects)
        for sp in matched
    ]
    return True, origen, span_dom, rects_redact

def _muestrear_color_fondo(page, rect):
    """Muestrea el color de fondo alrededor de rect para páginas escaneadas/OCR."""
    try:
        pr = page.rect
        clip = fitz.Rect(
            max(pr.x0, rect.x0 - 2.0),
            max(pr.y0, rect.y0 - 2.0),
            min(pr.x1, rect.x1 + 2.0),
            min(pr.y1, rect.y1 + 2.0),
        )
        pix = page.get_pixmap(matrix=fitz.Matrix(1, 1), clip=clip, alpha=False)
        if pix.width >= 3 and pix.height >= 3 and pix.n >= 3:
            samples = pix.samples
            w, h, n = pix.width, pix.height, pix.n
            borde = []
            for x in range(w):
                for y in (0, h - 1):
                    idx = (y * w + x) * n
                    borde.append((samples[idx], samples[idx + 1], samples[idx + 2]))
            for y in range(h):
                for x in (0, w - 1):
                    idx = (y * w + x) * n
                    borde.append((samples[idx], samples[idx + 1], samples[idx + 2]))
            if borde:
                r = statistics.median(p[0] for p in borde) / 255.0
                g = statistics.median(p[1] for p in borde) / 255.0
                b = statistics.median(p[2] for p in borde) / 255.0
                return (r, g, b)
    except Exception:
        pass
    return (1.0, 1.0, 1.0)

# Reexportación de cálculo de celdas y caja disponible para compatibilidad de imports
from .geometria_caja import (  # noqa: E402, F401
    _segmentos_en_coordenada,
    _es_celda_cerrada,
    _inferir_celda_desde_bordes,
    _clasificar_celdas_relleno,
    _detectar_celda_y_padding_horizontal,
    _linea_en_banda_vertical,
    _limitar_derecha_por_obstaculos,
    _es_subrayado_propio_borde_inferior,
    _limitar_abajo_por_cajas_vecinas,
    _calcular_limite_inferior_caja,
    _recopilar_lineas_e_imagenes_pagina,
    _calcular_caja_disponible,
)
