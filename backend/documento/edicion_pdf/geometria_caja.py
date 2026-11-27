# LiraLoud - Detección de celdas contenedoras y cálculo de caja disponible para edición PDF
import fitz

from .geometria import _extraer_geometria_drawings_detallada


def _segmentos_en_coordenada(segmentos, coord, tol=2.0):
    """Filtra segmentos cuyo tramo perpendicular cubre la coordenada dada con tolerancia."""
    return [seg for seg in segmentos if seg[1] <= coord + tol and seg[2] >= coord - tol]

def _es_celda_cerrada(cand_l, cand_r, cand_t, cand_b, pw, ph):
    """Valida dimensiones razonables y cierre geométrico de los 4 bordes candidatos."""
    cw = cand_r[0] - cand_l[0]
    ch = cand_b[0] - cand_t[0]
    if not (10.0 <= cw < pw * 0.90 and 8.0 <= ch < ph * 0.90):
        return False
    pares_borde = (
        (cand_l, cand_t[0], cand_b[0]),
        (cand_r, cand_t[0], cand_b[0]),
        (cand_t, cand_l[0], cand_r[0]),
        (cand_b, cand_l[0], cand_r[0]),
    )
    return all(seg[1] <= lo + 3.0 and seg[2] >= hi - 3.0 for seg, lo, hi in pares_borde)

def _inferir_celda_desde_bordes(verticales, horizontales, rect_original, x_start, centro_orig, pw, ph):
    """Infiere un rectángulo de celda cerrada a partir de segmentos vectoriales en los 4 lados."""
    v_banda = _segmentos_en_coordenada(verticales, centro_orig.y)
    h_banda = _segmentos_en_coordenada(horizontales, centro_orig.x)
    cand_l = max((s for s in v_banda if s[0] <= centro_orig.x), key=lambda s: s[0], default=None)
    cand_r = min(
        (s for s in v_banda if s[0] >= centro_orig.x and s[0] > x_start + 5.0),
        key=lambda s: s[0],
        default=None,
    )
    cand_t = max((s for s in h_banda if s[0] <= centro_orig.y), key=lambda s: s[0], default=None)
    cand_b = min(
        (s for s in h_banda if s[0] >= centro_orig.y and s[0] >= rect_original.y1 - 0.5),
        key=lambda s: s[0],
        default=None,
    )
    if None in (cand_l, cand_r, cand_t, cand_b):
        return None
    if _es_celda_cerrada(cand_l, cand_r, cand_t, cand_b, pw, ph):
        return fitz.Rect(cand_l[0], cand_t[0], cand_r[0], cand_b[0])
    return None

def _clasificar_celdas_relleno(celdas_relleno, rect_original, y_start, centro_orig, celdas, verticales, horizontales):
    """Clasifica celdas de relleno como contenedoras o como bordes virtuales vecinos."""
    for fc in celdas_relleno:
        if (
            fc.x0 <= rect_original.x0 + 2.0
            and fc.x1 >= rect_original.x1 - 2.0
            and fc.y0 <= centro_orig.y <= fc.y1
            and (fc.width > rect_original.width + 6.0 or fc.height > rect_original.height + 5.0)
        ):
            celdas.append(fc)
        elif fc.x0 >= rect_original.x1 - 1.5 and fc.y1 >= y_start - 2.0:
            verticales.append((fc.x0, fc.y0, fc.y1))
        elif fc.y0 >= rect_original.y1 - 1.5:
            horizontales.append((fc.y0, fc.x0, fc.x1))

def _detectar_celda_y_padding_horizontal(page, rect_original, x_start, y_start, centro_orig):
    """Analiza dibujos vectoriales de la página para inferir celda contenedora y padding horizontal."""
    pw, ph = page.rect.width, page.rect.height
    verticales, horizontales, celdas, celdas_relleno = _extraer_geometria_drawings_detallada(page)
    _clasificar_celdas_relleno(celdas_relleno, rect_original, y_start, centro_orig, celdas, verticales, horizontales)

    celda_contenedora = min(
        (c for c in celdas if c.contains(centro_orig)),
        key=lambda c: c.get_area(),
        default=None,
    )
    if celda_contenedora is None:
        celda_contenedora = _inferir_celda_desde_bordes(
            verticales, horizontales, rect_original, x_start, centro_orig, pw, ph
        )

    # Borde izquierdo más cercano para inferir padding simétrico de celda
    borde_izq = max(
        (
            vx for vx, vy0, vy1 in verticales
            if vy1 >= rect_original.y0 - 2.0 and vy0 <= rect_original.y1 + 2.0 and vx <= x_start
        ),
        default=None,
    )
    if celda_contenedora is not None:
        borde_izq = celda_contenedora.x0 if borde_izq is None else max(borde_izq, celda_contenedora.x0)

    pad_h = max(4.0, min(8.0, x_start - borde_izq)) if borde_izq is not None else 4.0
    return verticales, horizontales, celda_contenedora, pad_h

def _linea_en_banda_vertical(ly0, ly1, b_top, b_bot, b_centro, b_alto, tamano):
    """Indica si una línea de texto [ly0, ly1] solapa verticalmente la banda objetivo."""
    solape = min(ly1, b_bot) - max(ly0, b_top)
    if solape <= 0.0:
        return False
    ly_centro = (ly0 + ly1) / 2.0
    ly_alto = max(1.0, ly1 - ly0)
    if solape >= 0.5 * min(ly_alto, b_alto):
        return True
    return (b_top - 1.0) <= ly_centro <= (b_bot + 1.0) and abs(ly_centro - b_centro) <= max(tamano * 0.55, b_alto * 0.55)

def _limitar_derecha_por_obstaculos(
    limite_inicial,
    x_start,
    y_band_top,
    y_band_bot,
    b_top,
    b_bot,
    b_centro,
    b_alto,
    tamano,
    pad_h,
    verticales,
    text_lines,
    image_rects,
):
    """Recorta el límite derecho contra bordes verticales, líneas de texto e imágenes en la banda vertical."""
    limite = limite_inicial
    for vx, vy0, vy1 in verticales:
        if vy1 >= y_band_top and vy0 <= y_band_bot and vx > x_start + 5.0:
            limite = min(limite, vx - pad_h)
    for lx0, ly0, lx1, ly1 in text_lines:
        if lx0 > x_start + 5.0 and _linea_en_banda_vertical(ly0, ly1, b_top, b_bot, b_centro, b_alto, tamano):
            limite = min(limite, lx0 - 4.0)
    for ix0, iy0, ix1, iy1 in image_rects:
        if iy1 >= y_band_top and iy0 <= y_band_bot and ix0 > x_start + 5.0:
            limite = min(limite, ix0 - 3.0)
    return limite

def _es_subrayado_propio_borde_inferior(hy, hx0, hx1, rect_original, celda_contenedora, verticales):
    """Indica si un trazo horizontal pegado al borde inferior del texto es un subrayado sin verticales."""
    dentro_sobre_piso = celda_contenedora is None or hy < celda_contenedora.y1 - 2.0
    if not (dentro_sobre_piso and hy < rect_original.y1 + 3.0):
        return False
    return not any(
        vy0 <= hy + 2.0 and vy1 >= hy - 2.0 and (hx0 - 2.0) <= vx <= (hx1 + 2.0)
        for vx, vy0, vy1 in verticales
    )

def _limitar_abajo_por_cajas_vecinas(
    limite_abajo, text_lines, image_rects, x_start, x_max, y_centro_orig, rect_y1
):
    """Recorta el límite inferior contra líneas de texto e imágenes situadas debajo del bloque original."""
    for lx0, ly0, lx1, ly1 in text_lines:
        ly_centro = (ly0 + ly1) / 2.0
        if lx1 >= x_start and lx0 <= x_max and ly_centro > y_centro_orig + 2.0 and ly1 > rect_y1 + 1.0:
            limite_abajo = min(limite_abajo, ly0 - 1.0)

    for ix0, iy0, ix1, iy1 in image_rects:
        iy_centro = (iy0 + iy1) / 2.0
        if ix1 >= x_start and ix0 <= x_max and iy0 >= rect_y1 - 2.0 and iy_centro > y_centro_orig + 2.0 and iy1 > rect_y1 + 1.0:
            limite_abajo = min(limite_abajo, iy0 - 2.0)

    return limite_abajo

def _calcular_limite_inferior_caja(
    page_y1,
    x_start,
    x_max,
    rect_original,
    y_centro_orig,
    celda_contenedora,
    horizontales,
    verticales,
    text_lines,
    image_rects,
):
    """Calcula el límite vertical inferior disponible en el rango horizontal [x_start, x_max]."""
    limite_abajo = page_y1 - 12.0
    for hy, hx0, hx1 in horizontales:
        if hx1 >= x_start and hx0 <= x_max and hy >= rect_original.y1 - 0.5:
            if not _es_subrayado_propio_borde_inferior(hy, hx0, hx1, rect_original, celda_contenedora, verticales):
                limite_abajo = min(limite_abajo, hy - 3.0)

    if celda_contenedora is not None:
        limite_abajo = min(limite_abajo, celda_contenedora.y1 - 3.0)

    return _limitar_abajo_por_cajas_vecinas(
        limite_abajo, text_lines, image_rects, x_start, x_max, y_centro_orig, rect_original.y1
    )

def _recopilar_lineas_e_imagenes_pagina(page, rect_original, centro_orig):
    """Recopila bboxes de líneas de texto restantes e imágenes que no envuelven al texto original."""
    text_lines = []
    try:
        data = page.get_text("dict")
        for b in data.get("blocks", []):
            if b.get("type") != 0:
                continue
            for l in b.get("lines", []):
                if any((sp.get("text") or "").strip() for sp in l.get("spans", [])):
                    text_lines.append(l.get("bbox"))
    except Exception:
        pass

    area_orig = max(1e-6, rect_original.get_area())
    image_rects = []
    try:
        for img in page.get_image_info(xrefs=False):
            bb = img.get("bbox")
            if bb:
                ir = fitz.Rect(bb)
                inter = ir & rect_original
                if ir.contains(centro_orig) or (not inter.is_empty and (inter.get_area() / area_orig) >= 0.25):
                    continue
                image_rects.append((ir.x0, ir.y0, ir.x1, ir.y1))
    except Exception:
        pass
    return text_lines, image_rects

def _calcular_caja_disponible(page, rect_original, rect_deseado, origen_original, tamano):
    """
    Calcula la caja disponible (x_start, y_start, x_max, y_max) respetando bordes de tabla,
    celdas contenedoras, bloques de texto vecinos e imágenes en la página.
    """
    x_start = float(origen_original[0]) if origen_original else float(rect_original.x0)
    y_start = float(rect_original.y0)

    centro_orig = fitz.Point(
        (rect_original.x0 + rect_original.x1) / 2.0,
        (rect_original.y0 + rect_original.y1) / 2.0,
    )
    verticales, horizontales, celda_contenedora, pad_h = _detectar_celda_y_padding_horizontal(
        page, rect_original, x_start, y_start, centro_orig
    )

    # Líneas de texto restantes (ya redactado el texto original) e imágenes
    text_lines, image_rects = _recopilar_lineas_e_imagenes_pagina(page, rect_original, centro_orig)

    # 1. Límite derecho inicial (en la banda vertical original)
    y_band_top = y_start - 2.0
    y_band_bot = max(rect_original.y1, y_start + tamano * 1.2) + 2.0
    y_centro_orig = (rect_original.y0 + rect_original.y1) / 2.0
    h_orig = max(1.0, rect_original.y1 - rect_original.y0)

    limite_der = _limitar_derecha_por_obstaculos(
        page.rect.x1 - 12.0,
        x_start,
        y_band_top,
        y_band_bot,
        rect_original.y0,
        rect_original.y1,
        y_centro_orig,
        h_orig,
        tamano,
        pad_h,
        verticales,
        text_lines,
        image_rects,
    )
    if celda_contenedora is not None:
        limite_der = min(limite_der, celda_contenedora.x1 - pad_h)

    popup_desplazado_izq = (rect_deseado.x0 < rect_original.x0 - 5.0) and (
        rect_deseado.x1 <= rect_original.x1 + 1.0
        or (rect_deseado.x1 - x_start) < 0.5 * max(1.0, rect_deseado.width)
    )

    if rect_deseado.x1 > rect_original.x1 + 1.0 and not popup_desplazado_izq:
        x_max = min(float(rect_deseado.x1), limite_der)
    elif rect_deseado.height > rect_original.height + 4.0 and not popup_desplazado_izq:
        # El llamador especificó un cuadro multilínea acotado: respetar su ancho deseado
        x_max = min(float(rect_deseado.x1), limite_der)
    elif celda_contenedora is not None:
        x_max = limite_der
    elif rect_original.height > tamano * 1.6 and not popup_desplazado_izq:
        x_max = min(float(rect_original.x1), limite_der)
    else:
        # Línea única sin celda contenedora (o popup UI desplazado a la izquierda): permitir expansión hasta
        # limite_der y margen simétrico para no aplastar el texto contra rect_original.x1.
        margen_der = max(12.0, min(72.0, x_start - page.rect.x0))
        x_max = min(limite_der, page.rect.x1 - margen_der)
        x_max = max(x_max, min(float(rect_original.x1), limite_der))

    x_max = max(x_max, x_start + 12.0)

    # 2. Límite inferior (en el rango horizontal [x_start, x_max])
    limite_abajo = _calcular_limite_inferior_caja(
        page.rect.y1,
        x_start,
        x_max,
        rect_original,
        y_centro_orig,
        celda_contenedora,
        horizontales,
        verticales,
        text_lines,
        image_rects,
    )

    y_max_deseado = max(float(rect_original.y1), float(rect_deseado.y1))
    if celda_contenedora is not None and rect_deseado.y1 <= rect_original.y1 + 1.0:
        y_max_deseado = max(y_max_deseado, limite_abajo)
    y_max = min(y_max_deseado, limite_abajo)
    y_max = max(y_max, y_start + 4.0)

    # 3. Re-verificar obstáculos derechos en toda la altura [y_start, y_max]
    y_centro_caja = (y_start + y_max) / 2.0
    h_caja = max(1.0, y_max - y_start)
    x_max = _limitar_derecha_por_obstaculos(
        x_max,
        x_start,
        y_start,
        y_max,
        y_start,
        y_max,
        y_centro_caja,
        h_caja,
        tamano,
        pad_h,
        verticales,
        text_lines,
        image_rects,
    )

    x_max = max(x_max, x_start + 12.0)
    return fitz.Rect(x_start, y_start, x_max, y_max)
