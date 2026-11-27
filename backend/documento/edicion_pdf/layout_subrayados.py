# LiraLoud - Detección, división y trazado vectorial de subrayados en edición PDF
import fitz

from .fuentes import medir_texto


def _drawing_tiene_trazo(d):
    return (d.get("color") is not None) and (
        d.get("width") is None or float(d.get("width") or 0.0) > 0.0
    )

def _agregar_verticales_de_item(item, tiene_trazo, pw, ph, verticales):
    """Agrega segmentos verticales extraídos de un primitivo de dibujo ('l' o 're')."""
    op = item[0]
    if op == "l" and len(item) >= 3:
        p1, p2 = item[1], item[2]
        if abs(p1.x - p2.x) <= 2.0 and abs(p2.y - p1.y) >= 4.0:
            verticales.append(((p1.x + p2.x) / 2.0, min(p1.y, p2.y), max(p1.y, p2.y)))
    elif op == "re" and len(item) >= 2:
        rr = fitz.Rect(item[1])
        if rr.width <= 3.0 and rr.height >= 4.0:
            verticales.append(((rr.x0 + rr.x1) / 2.0, rr.y0, rr.y1))
        elif (
            tiene_trazo
            and rr.width >= 10.0
            and rr.height >= 4.0
            and not (rr.width >= pw * 0.92 and rr.height >= ph * 0.92)
        ):
            verticales.append((rr.x0, rr.y0, rr.y1))
            verticales.append((rr.x1, rr.y0, rr.y1))

def _recopilar_segmentos_verticales(drawings, pw, ph):
    """Recopila segmentos verticales (líneas y bordes de celdas/rectángulos) para filtrar bordes de tabla."""
    verticales = []
    for d in drawings:
        tiene_trazo = _drawing_tiene_trazo(d)
        for item in d.get("items", []):
            _agregar_verticales_de_item(item, tiene_trazo, pw, ph, verticales)
    return verticales

def _segmento_toca_vertical(hy, hx0, hx1, verticales):
    """Indica si un segmento horizontal toca bordes verticales (indicador de tabla/recuadro)."""
    toca_izq = False
    toca_der = False
    for vx, vy0, vy1 in verticales:
        if vy0 <= hy + 2.0 and vy1 >= hy - 2.0:
            dx0 = abs(vx - hx0)
            dx1 = abs(vx - hx1)
            if dx0 <= 0.8 or dx1 <= 0.8:
                return True
            if dx0 <= 1.2:
                toca_izq = True
            if dx1 <= 1.2:
                toca_der = True
    return toca_izq and toca_der

def _extraer_candidato_linea_subrayado(item, tiene_trazo, width, pw, verticales):
    """Evalúa un primitivo de línea ('l') y retorna (hy, hx0, hx1, width) si es candidato a subrayado."""
    if item[0] != "l" or len(item) < 3 or not tiene_trazo or width > 3.5:
        return None
    p1, p2 = item[1], item[2]
    if abs(p1.y - p2.y) <= 0.8 and abs(p2.x - p1.x) >= 3.0:
        hy = (p1.y + p2.y) / 2.0
        hx0, hx1 = min(p1.x, p2.x), max(p1.x, p2.x)
        if (hx1 - hx0) < pw * 0.78 and not _segmento_toca_vertical(hy, hx0, hx1, verticales):
            return (hy, hx0, hx1, width)
    return None

def _extraer_candidatos_subrayado_detalle(page):
    """
    Extrae segmentos horizontales candidatos a subrayado de texto (excluyendo bordes de tabla y divisores),
    deduplicados y conservando el grosor máximo detectado.
    Retorna lista de (y, x0, x1, stroke_width).
    """
    vistos = {}
    pw = float(page.rect.width)
    ph = float(page.rect.height)
    try:
        drawings = page.get_drawings()
        verticales = _recopilar_segmentos_verticales(drawings, pw, ph)

        def _registrar(hy, hx0, hx1, sw):
            k = (round(hy, 2), round(hx0, 2), round(hx1, 2))
            prev = vistos.get(k)
            if prev is None or sw > prev[3]:
                vistos[k] = (hy, hx0, hx1, sw)

        for d in drawings:
            tiene_trazo = _drawing_tiene_trazo(d)
            tiene_relleno = d.get("fill") is not None
            width = float(d.get("width") or 0.0) if d.get("width") is not None else 1.0
            for item in d.get("items", []):
                cand_l = _extraer_candidato_linea_subrayado(item, tiene_trazo, width, pw, verticales)
                if cand_l is not None:
                    _registrar(*cand_l)
                elif item[0] == "re" and len(item) >= 2 and (tiene_relleno or tiene_trazo):
                    rr = fitz.Rect(item[1])
                    if 0.1 <= rr.height <= 3.0 and 3.0 <= rr.width < pw * 0.78:
                        hy = (rr.y0 + rr.y1) / 2.0
                        if not _segmento_toca_vertical(hy, rr.x0, rr.x1, verticales):
                            sw_re = rr.height + (width if tiene_trazo else 0.0)
                            _registrar(hy, rr.x0, rr.x1, sw_re)
    except Exception:
        pass
    return list(vistos.values())

def _extraer_candidatos_subrayado(page):
    """
    Extrae segmentos horizontales candidatos a subrayado de texto (excluyendo bordes de tabla y divisores).
    Retorna lista de (y, x0, x1).
    """
    return [(uy, ux0, ux1) for (uy, ux0, ux1, _) in _extraer_candidatos_subrayado_detalle(page)]

def _calcular_mascara_subrayado_chars(chars, sp_bbox, segs):
    """Calcula la máscara booleana de subrayado por carácter limpiando espacios no rodeados."""
    n = len(chars)
    raw_ul = [False] * n
    es_espacio = [False] * n
    for idx, ch in enumerate(chars):
        c_txt = ch.get("c", "")
        cbb = ch.get("bbox", sp_bbox)
        cx0, cx1 = float(cbb[0]), float(cbb[2])
        cw = max(0.5, cx1 - cx0)
        if not c_txt or c_txt.isspace():
            es_espacio[idx] = True
        raw_ul[idx] = any((min(cx1, ux1) - max(cx0, ux0)) / cw >= 0.50 for _, ux0, ux1 in segs)

    # Un espacio solo se considera subrayado si está rodeado por caracteres no-espacio subrayados
    final_ul = list(raw_ul)
    for idx in range(n):
        if es_espacio[idx] and final_ul[idx]:
            tiene_izq = any((not es_espacio[j]) and final_ul[j] for j in range(idx - 1, -1, -1))
            tiene_der = any((not es_espacio[j]) and final_ul[j] for j in range(idx + 1, n))
            if not (tiene_izq and tiene_der):
                final_ul[idx] = False
    return final_ul

def _agrupar_chars_por_subrayado(chars, sp_bbox, segs):
    """Clasifica cada carácter contra los segmentos de subrayado y los agrupa en sub-spans contiguos."""
    n = len(chars)
    final_ul = _calcular_mascara_subrayado_chars(chars, sp_bbox, segs)

    grupos = []
    cur_ul = final_ul[0]
    cur_chars = [chars[0]]
    for idx in range(1, n):
        if final_ul[idx] == cur_ul:
            cur_chars.append(chars[idx])
        else:
            grupos.append((cur_ul, cur_chars))
            cur_ul = final_ul[idx]
            cur_chars = [chars[idx]]
    grupos.append((cur_ul, cur_chars))

    salida = []
    for ul_flag, gchars in grupos:
        t = "".join(c.get("c", "") for c in gchars)
        gx0 = min(float(c.get("bbox", sp_bbox)[0]) for c in gchars)
        gy0 = min(float(c.get("bbox", sp_bbox)[1]) for c in gchars)
        gx1 = max(float(c.get("bbox", sp_bbox)[2]) for c in gchars)
        gy1 = max(float(c.get("bbox", sp_bbox)[3]) for c in gchars)
        salida.append((t, ul_flag, (gx0, gy0, gx1, gy1)))
    return salida

def _filtrar_segmentos_subrayado_para_span(candidatos_subrayado, sp_bbox, orig_y, ref_size, linea_bbox):
    """Filtra segmentos de subrayado vectoriales que intersectan horizontal y verticalmente el span."""
    y_min_ul = orig_y - 0.5
    y_max_ul = orig_y + max(2.2, 0.22 * ref_size)
    return [
        (uy, ux0, ux1)
        for (uy, ux0, ux1) in candidatos_subrayado
        if y_min_ul <= uy <= y_max_ul
        and ux1 > float(sp_bbox[0])
        and ux0 < float(sp_bbox[2])
        and not (
            linea_bbox is not None
            and (float(linea_bbox[0]) - ux0) >= 0.8
            and (ux1 - float(linea_bbox[2])) >= 0.8
        )
    ]

def _dividir_span_por_subrayados_rawdict(sp_raw, candidatos_subrayado, linea_bbox=None, linea_max_size=None):
    """
    Divide un span de rawdict en sub-spans según la intersección carácter-por-carácter
    con segmentos de subrayado vectoriales.
    """
    chars = sp_raw.get("chars")
    sp_bbox = sp_raw.get("bbox", (0.0, 0.0, 0.0, 0.0))
    sp_size = float(sp_raw.get("size", 10.0) or 10.0)
    ref_size = max(sp_size, float(linea_max_size)) if linea_max_size is not None else sp_size
    sp_y1 = float(sp_bbox[3])
    orig_y = float(sp_raw["origin"][1]) if sp_raw.get("origin") else sp_y1

    segs = _filtrar_segmentos_subrayado_para_span(
        candidatos_subrayado, sp_bbox, orig_y, ref_size, linea_bbox
    )

    if not chars:
        texto_sp = sp_raw.get("text", "")
        sub_flag = False
        if segs and texto_sp.strip():
            sw = max(0.5, float(sp_bbox[2]) - float(sp_bbox[0]))
            sub_flag = any((min(float(sp_bbox[2]), ux1) - max(float(sp_bbox[0]), ux0)) / sw >= 0.5 for _, ux0, ux1 in segs)
        return [(texto_sp, sub_flag, sp_bbox)]

    if not segs:
        texto_sp = "".join(c.get("c", "") for c in chars)
        return [(texto_sp, False, sp_bbox)]

    return _agrupar_chars_por_subrayado(chars, sp_bbox, segs)

def _emitir_trazo_subrayado(page, y_bl, ul_actual):
    """Dibuja un trazo vectorial de subrayado sobre la línea base indicada."""
    if ul_actual is None:
        return
    y_ul = y_bl + max(0.8, ul_actual[3] * 0.10)
    w_ul = max(0.5, min(2.0, ul_actual[3] * 0.085))
    sh = page.new_shape()
    sh.draw_line(fitz.Point(ul_actual[0], y_ul), fitz.Point(ul_actual[1], y_ul))
    sh.finish(color=ul_actual[2], width=w_ul)
    sh.commit()

def _siguiente_subrayado_mismo_color(next_meta, color):
    """Indica si el siguiente segmento no vacío mantiene subrayado con el mismo color."""
    return (
        next_meta is not None
        and bool(next_meta["subrayado"])
        and next_meta["color"] == color
    )

def _extender_subrayado_activo(
    page, y_bl, x_cur, seg_txt, meta, seg_size, seg_color, seg_w, next_non_empty_meta, ul_actual
):
    """Calcula el tramo visible del subrayado para un segmento con texto y lo fusiona o emite."""
    lead_len = len(seg_txt) - len(seg_txt.lstrip(" "))
    trail_len = len(seg_txt) - len(seg_txt.rstrip(" "))
    w_lead = medir_texto(seg_txt[:lead_len], meta["fuente_info"], seg_size) if lead_len else 0.0
    continua_ul_mismo_color = _siguiente_subrayado_mismo_color(next_non_empty_meta, seg_color)
    w_trail = (
        medir_texto(seg_txt[len(seg_txt) - trail_len:], meta["fuente_info"], seg_size)
        if (trail_len and not continua_ul_mismo_color)
        else 0.0
    )
    seg_ux0 = x_cur + w_lead
    seg_ux1 = x_cur + max(w_lead, seg_w - w_trail)
    if seg_ux1 > seg_ux0 + 0.5:
        if ul_actual is not None and ul_actual[2] == seg_color and abs(ul_actual[1] - seg_ux0) <= 2.5:
            ul_actual[1] = seg_ux1
            ul_actual[3] = max(ul_actual[3], seg_size)
        else:
            _emitir_trazo_subrayado(page, y_bl, ul_actual)
            ul_actual = [seg_ux0, seg_ux1, seg_color, seg_size]
    return ul_actual

def _actualizar_subrayado_segmento(
    page, y_bl, x_cur, seg_txt, meta, seg_size, seg_color, seg_w, ln, seg_idx, ul_actual
):
    """Actualiza o emite el trazo continuo de subrayado correspondiente al segmento actual."""
    next_non_empty_meta = next(
        (nxt_m for nxt_t, nxt_m in ln[seg_idx + 1:] if nxt_t and nxt_t.strip()),
        None,
    )

    if meta["subrayado"] and seg_txt.strip():
        return _extender_subrayado_activo(
            page, y_bl, x_cur, seg_txt, meta, seg_size, seg_color, seg_w, next_non_empty_meta, ul_actual
        )
    if (
        not seg_txt.strip()
        and ul_actual is not None
        and _siguiente_subrayado_mismo_color(next_non_empty_meta, ul_actual[2])
        and (meta["subrayado"] or len(seg_txt) <= 2)
    ):
        ul_actual[1] = x_cur + seg_w
        ul_actual[3] = max(ul_actual[3], seg_size)
        return ul_actual
    if ul_actual is not None:
        _emitir_trazo_subrayado(page, y_bl, ul_actual)
        ul_actual = None

    return ul_actual
