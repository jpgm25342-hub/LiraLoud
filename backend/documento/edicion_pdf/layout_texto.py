import math
import re
import fitz

from .comun import normalizar_color, FLAG_NEGRITA, FLAG_ITALICO
from .fuentes import (
    limpiar_nombre_fuente,
    resolver_fuente_completa,
    medir_texto,
    _dividir_runs_mixtos,
    _registrar_fuente_en_pagina,
    insertar_texto_con_fuente,
)
from .geometria import _bboxes_similares, _extraer_geometria_drawings_detallada
from .layout_subrayados import (
    _drawing_tiene_trazo,
    _agregar_verticales_de_item,
    _recopilar_segmentos_verticales,
    _segmento_toca_vertical,
    _extraer_candidato_linea_subrayado,
    _extraer_candidatos_subrayado_detalle,
    _extraer_candidatos_subrayado,
    _calcular_mascara_subrayado_chars,
    _agrupar_chars_por_subrayado,
    _filtrar_segmentos_subrayado_para_span,
    _dividir_span_por_subrayados_rawdict,
    _emitir_trazo_subrayado,
    _siguiente_subrayado_mismo_color,
    _extender_subrayado_activo,
    _actualizar_subrayado_segmento,
)

def _envolver_parrafo_texto(parrafo, fuente_info, tamano, ancho_max, permitir_corte_palabra):
    """Envuelve un párrafo de texto plano en líneas que quepan dentro de ancho_max."""
    lineas = []
    palabras = parrafo.split(" ")
    linea_actual = ""
    for palabra in palabras:
        if not palabra and linea_actual:
            continue
        candidato = (linea_actual + " " + palabra) if linea_actual else palabra
        if medir_texto(candidato, fuente_info, tamano) <= ancho_max:
            linea_actual = candidato
        else:
            if linea_actual:
                lineas.append(linea_actual)
                linea_actual = ""
            if medir_texto(palabra, fuente_info, tamano) <= ancho_max:
                linea_actual = palabra
            elif not permitir_corte_palabra:
                return None
            else:
                trozo = ""
                for ch in palabra:
                    if medir_texto(trozo + ch, fuente_info, tamano) <= ancho_max:
                        trozo += ch
                    else:
                        if trozo:
                            lineas.append(trozo)
                        trozo = ch
                linea_actual = trozo
    if linea_actual:
        lineas.append(linea_actual)
    return lineas


def _envolver_texto(texto, fuente_info, tamano, ancho_max, permitir_corte_palabra=True):
    """Envuelve el texto en líneas que quepan dentro de ancho_max."""
    ancho_max = max(8.0, float(ancho_max))
    lineas_resultado = []
    parrafos = texto.replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ").split("\n")

    for parrafo in parrafos:
        if not parrafo.strip():
            lineas_resultado.append("")
            continue
        lineas_parrafo = _envolver_parrafo_texto(
            parrafo, fuente_info, tamano, ancho_max, permitir_corte_palabra
        )
        if lineas_parrafo is None:
            return None
        lineas_resultado.extend(lineas_parrafo)

    while len(lineas_resultado) > 1 and not lineas_resultado[-1]:
        lineas_resultado.pop()

    return lineas_resultado


def _resolver_estilo_fuente_span(sp, fuente_default, flags_default):
    """Resuelve nombre de fuente, flags y overrides explícitos de negrita/cursiva para un span."""
    sp_fuente = sp.get("fuente") or fuente_default
    tiene_neg = "negrita" in sp and sp["negrita"] is not None
    tiene_cur = "cursiva" in sp and sp["cursiva"] is not None
    sp_neg = bool(sp["negrita"]) if tiene_neg else bool(flags_default & FLAG_NEGRITA)
    sp_cur = bool(sp["cursiva"]) if tiene_cur else bool(flags_default & FLAG_ITALICO)
    sp_flags = (flags_default & ~(FLAG_NEGRITA | FLAG_ITALICO)) | (FLAG_NEGRITA if sp_neg else 0) | (FLAG_ITALICO if sp_cur else 0)
    sp_fuente_arg = limpiar_nombre_fuente(sp_fuente) if (tiene_neg or tiene_cur) else sp_fuente
    return sp_fuente_arg, sp_flags, (sp_neg if tiene_neg else None), (sp_cur if tiene_cur else None)


def _normalizar_un_span(doc, page, sp, fuente_default, flags_default, tamano_default, color_default):
    """Normaliza un diccionario de span de entrada y resuelve su tipografía, o None si está vacío."""
    if not isinstance(sp, dict):
        return None
    sp_texto = str(sp.get("texto", "") or "").replace("\xa0", " ").replace("\t", " ")
    if sp_texto == "":
        return None

    sp_fuente_arg, sp_flags, neg_override, cur_override = _resolver_estilo_fuente_span(
        sp, fuente_default, flags_default
    )

    tam_def = float(tamano_default)
    raw_tam = sp.get("tamano")
    try:
        sp_tam = float(raw_tam) if raw_tam is not None and raw_tam != "" else tam_def
    except Exception:
        sp_tam = tam_def
    if not math.isfinite(sp_tam) or sp_tam <= 0.0:
        sp_tam = tam_def
    sp_tam = max(4.0, sp_tam)

    sp_color = normalizar_color(sp["color"]) if ("color" in sp and sp["color"] is not None) else color_default
    sp_subrayado = bool(sp.get("subrayado", False))
    sp_fuente_info = resolver_fuente_completa(
        doc, page, sp_fuente_arg, sp_flags, texto=sp_texto,
        negrita_override=neg_override,
        cursiva_override=cur_override,
    )
    return {
        "texto": sp_texto,
        "fuente_info": sp_fuente_info,
        "tamano": sp_tam,
        "color": sp_color,
        "subrayado": sp_subrayado,
    }


def _normalizar_spans_entrada(doc, page, raw_spans, fuente_default, flags_default, tamano_default, color_default):
    """Normaliza datos['spans'] a objetos listos para reflow y renderizado."""
    spans_norm = []
    for sp in raw_spans:
        item = _normalizar_un_span(doc, page, sp, fuente_default, flags_default, tamano_default, color_default)
        if item is not None:
            spans_norm.append(item)
    return spans_norm


def _partir_cluster_por_caracteres(cluster, escala, ancho_max, lineas_parrafo, linea_actual, ancho_actual):
    """Divide carácter a carácter un clúster de palabra más ancho que ancho_max."""
    for t_seg, m_seg in cluster:
        s_eff = m_seg["tamano"] * escala
        trozo = ""
        for ch in t_seg:
            w_ch_cand = medir_texto(trozo + ch, m_seg["fuente_info"], s_eff)
            if ancho_actual + w_ch_cand <= ancho_max + 0.3:
                trozo += ch
            else:
                if trozo:
                    linea_actual.append((trozo, m_seg))
                    trozo = ""
                if linea_actual:
                    lineas_parrafo.append(linea_actual)
                    linea_actual = []
                    ancho_actual = 0.0
                trozo = ch
        if trozo:
            linea_actual.append((trozo, m_seg))
            ancho_actual += medir_texto(trozo, m_seg["fuente_info"], s_eff)
    return linea_actual, ancho_actual


def _tokenizar_parrafo_spans_en_clusters(parrafo):
    """Tokeniza un párrafo de spans en elementos ('space', txt, meta) o ('word', [(txt, meta), ...])."""
    tokens_raw = []
    for seg_txt, meta in parrafo:
        for tok in re.findall(r" +|[^ ]+", seg_txt):
            tokens_raw.append((tok.startswith(" "), tok, meta))

    elementos = []
    cur_word = []
    for is_sp, tok, meta in tokens_raw:
        if is_sp:
            if cur_word:
                elementos.append(("word", cur_word))
                cur_word = []
            elementos.append(("space", tok, meta))
        else:
            cur_word.append((tok, meta))
    if cur_word:
        elementos.append(("word", cur_word))
    return elementos


def _medir_cluster_y_espacio(cluster, espacio_pendiente, escala):
    w_cluster = sum(
        medir_texto(t_seg, m_seg["fuente_info"], m_seg["tamano"] * escala)
        for t_seg, m_seg in cluster
    )
    w_sp = (
        medir_texto(espacio_pendiente[0], espacio_pendiente[1]["fuente_info"], espacio_pendiente[1]["tamano"] * escala)
        if espacio_pendiente is not None else 0.0
    )
    return w_cluster, w_sp


def _envolver_parrafo_spans(parrafo, escala, ancho_max, permitir_corte_palabra):
    """Tokeniza un párrafo de spans en clústeres de palabra y los envuelve en líneas dentro de ancho_max."""
    elementos = _tokenizar_parrafo_spans_en_clusters(parrafo)

    lineas_parrafo = []
    linea_actual = []
    ancho_actual = 0.0
    espacio_pendiente = None

    for elem in elementos:
        if elem[0] == "space":
            if linea_actual:
                espacio_pendiente = (elem[1], elem[2])
            continue

        cluster = elem[1]
        w_cluster, w_sp = _medir_cluster_y_espacio(cluster, espacio_pendiente, escala)

        if linea_actual and (ancho_actual + w_sp + w_cluster <= ancho_max + 0.3):
            if espacio_pendiente is not None:
                linea_actual.append(espacio_pendiente)
                ancho_actual += w_sp
                espacio_pendiente = None
            linea_actual.extend(cluster)
            ancho_actual += w_cluster
        elif not linea_actual and w_cluster <= ancho_max + 0.3:
            linea_actual.extend(cluster)
            ancho_actual = w_cluster
            espacio_pendiente = None
        else:
            if linea_actual:
                lineas_parrafo.append(linea_actual)
                linea_actual = []
                ancho_actual = 0.0
                espacio_pendiente = None

            if w_cluster <= ancho_max + 0.3:
                linea_actual.extend(cluster)
                ancho_actual = w_cluster
            elif not permitir_corte_palabra:
                return None
            else:
                linea_actual, ancho_actual = _partir_cluster_por_caracteres(
                    cluster, escala, ancho_max, lineas_parrafo, linea_actual, ancho_actual
                )

    if linea_actual:
        lineas_parrafo.append(linea_actual)
    return lineas_parrafo


def _compactar_lineas_spans(lineas_resultado):
    """Fusiona segmentos adyacentes con estilo idéntico dentro de cada línea envuelta."""
    lineas_compactas = []
    for ln in lineas_resultado:
        comp = []
        for txt_seg, meta in ln:
            if comp:
                prev_txt, prev_meta = comp[-1]
                mismo_estilo = (
                    prev_meta["fuente_info"] == meta["fuente_info"]
                    and abs(prev_meta["tamano"] - meta["tamano"]) < 1e-4
                    and prev_meta["color"] == meta["color"]
                    and prev_meta["subrayado"] == meta["subrayado"]
                )
                if mismo_estilo:
                    comp[-1] = (prev_txt + txt_seg, prev_meta)
                    continue
            comp.append((txt_seg, meta))
        lineas_compactas.append(comp)
    return lineas_compactas


def _envolver_spans(spans_norm, escala, ancho_max, permitir_corte_palabra=True):
    """
    Envuelve una secuencia de spans heterogéneos token por token dentro de ancho_max,
    manteniendo unidos los clústeres de palabra sin espacios entre spans contiguos.
    Retorna lista de líneas; cada línea es lista de (texto, span_meta_dict), o None si desborda.
    """
    ancho_max = max(8.0, float(ancho_max))
    # 1. Dividir en párrafos por '\n'
    parrafos = [[]]
    for sp in spans_norm:
        partes = sp["texto"].replace("\r\n", "\n").replace("\r", "\n").split("\n")
        for p_idx, parte in enumerate(partes):
            if p_idx > 0:
                parrafos.append([])
            if parte:
                parrafos[-1].append((parte, sp))

    lineas_resultado = []
    for parrafo in parrafos:
        if not parrafo or not "".join(t for t, _ in parrafo).strip():
            lineas_resultado.append([])
            continue

        lineas_p = _envolver_parrafo_spans(parrafo, escala, ancho_max, permitir_corte_palabra)
        if lineas_p is None:
            return None
        lineas_resultado.extend(lineas_p)

    while len(lineas_resultado) > 1 and not lineas_resultado[-1]:
        lineas_resultado.pop()

    return _compactar_lineas_spans(lineas_resultado)


def _calcular_baseline(t_val, tamano_ref, rect_caja, rect_original, origen_original):
    """Calcula la coordenada Y de la línea base conservando el ascendente original si existe."""
    if origen_original is not None:
        offset_asc_orig = max(0.75 * tamano_ref, float(origen_original[1]) - float(rect_original.y0))
        if abs(t_val - tamano_ref) < 0.01:
            return float(origen_original[1])
        return rect_caja.y0 + offset_asc_orig * (t_val / max(1.0, tamano_ref))
    return rect_caja.y0 + 0.90 * t_val


def _ajustar_y_renderizar_spans(page, rect_caja, rect_original, origen_original, ancho_max, alto_max, spans_config):
    """Ajusta escala, envuelve y renderiza spans mixtos (con trazos de subrayado continuos) en rect_caja."""
    tamano_ref = max(sp["tamano"] for sp in spans_config)
    tamano_min = max(2.0, min(4.0, tamano_ref * 0.45))

    def _buscar_ajuste_spans(t_limite, permitir_corte_palabra):
        t = float(tamano_ref)
        ultimo_escala = None
        ultimas_lineas = None
        while t >= t_limite - 1e-6:
            escala = t / max(1.0, tamano_ref)
            lineas = _envolver_spans(
                spans_config, escala, ancho_max,
                permitir_corte_palabra=permitir_corte_palabra,
            )
            if lineas is not None:
                if not lineas:
                    lineas = [[]]
                cabe_ancho = all(
                    sum(medir_texto(seg_t, meta["fuente_info"], meta["tamano"] * escala) for seg_t, meta in ln)
                    <= ancho_max + 0.5
                    for ln in lineas
                )
                if len(lineas) == 1:
                    cabe_alto = (t <= alto_max + 1.5) or (t <= tamano_ref + 0.1 and origen_original is not None) or (t <= tamano_min)
                else:
                    y_bl_0 = _calcular_baseline(t, tamano_ref, rect_caja, rect_original, origen_original)
                    y_bottom = y_bl_0 + (len(lineas) - 1) * (t * 1.18) + 0.22 * t
                    cabe_alto = (y_bottom <= rect_caja.y1 + 0.5) and (((len(lineas) - 1) * 1.18 + 1.12) * t <= alto_max + 1.5)
                ultimo_escala = escala
                ultimas_lineas = lineas
                if cabe_ancho and cabe_alto:
                    return True, escala, lineas
            t = round(t - 0.25, 2)
        return False, ultimo_escala, ultimas_lineas

    texto_plano = "".join(sp["texto"] for sp in spans_config)
    palabras_no_vacias = [w for w in texto_plano.replace("\xa0", " ").split() if w]
    t_limite_intacto = tamano_min if len(palabras_no_vacias) <= 3 else max(tamano_min, round(tamano_ref * 0.5, 2))
    ok, escala_elegida, lineas_elegidas = _buscar_ajuste_spans(t_limite_intacto, permitir_corte_palabra=False)
    if not ok:
        _, esc_fb, ln_fb = _buscar_ajuste_spans(tamano_min, permitir_corte_palabra=True)
        if ln_fb is not None:
            escala_elegida, lineas_elegidas = esc_fb, ln_fb
        elif lineas_elegidas is None:
            escala_elegida = 1.0
            lineas_elegidas = [[(sp["texto"], sp) for sp in spans_config]]

    t_eff_ref = tamano_ref * escala_elegida
    y_baseline_0 = _calcular_baseline(t_eff_ref, tamano_ref, rect_caja, rect_original, origen_original)
    line_step = t_eff_ref * 1.18
    mapa_fuentes = {}

    for idx, ln in enumerate(lineas_elegidas):
        if not ln:
            continue
        y_bl = y_baseline_0 + idx * line_step
        x_cur = float(rect_caja.x0)

        ul_actual = None  # [ux0, ux1, color, size]
        for seg_idx, (seg_txt, meta) in enumerate(ln):
            if not seg_txt:
                continue
            seg_size = meta["tamano"] * escala_elegida
            seg_color = meta["color"]
            seg_w = medir_texto(seg_txt, meta["fuente_info"], seg_size)

            insertar_texto_con_fuente(
                page,
                fitz.Point(x_cur, y_bl),
                seg_txt,
                meta["fuente_info"],
                seg_size,
                seg_color,
                mapa_fuentes=mapa_fuentes,
            )

            ul_actual = _actualizar_subrayado_segmento(
                page, y_bl, x_cur, seg_txt, meta, seg_size, seg_color, seg_w, ln, seg_idx, ul_actual
            )
            x_cur += seg_w

        _emitir_trazo_subrayado(page, y_bl, ul_actual)


def _renderizar_lineas_texto_simple(
    page, rect_caja, lineas_elegidas, y_baseline_0, line_step, fuente_info, tamano_elegido, color
):
    """Renderiza líneas de texto simple en la página manejando fuentes mixtas, de sistema o estándar."""
    tipo, valor = fuente_info
    if tipo == "mixta":
        f_prim, f_fb = valor
        mapa = {}
        for idx, ln in enumerate(lineas_elegidas):
            if not ln:
                continue
            y_bl = y_baseline_0 + idx * line_step
            x_cur = float(rect_caja.x0)
            for fnt, s in _dividir_runs_mixtos(ln, f_prim, f_fb):
                fname = _registrar_fuente_en_pagina(page, fnt, mapa)
                page.insert_text(
                    fitz.Point(x_cur, y_bl),
                    s,
                    fontname=fname,
                    fontsize=tamano_elegido,
                    color=color,
                )
                x_cur += fnt.text_length(s, fontsize=tamano_elegido)
        return

    fname = _registrar_fuente_en_pagina(page, valor, {}) if tipo == "sistema" else valor
    for idx, ln in enumerate(lineas_elegidas):
        if not ln:
            continue
        y_bl = y_baseline_0 + idx * line_step
        page.insert_text(
            fitz.Point(rect_caja.x0, y_bl),
            ln,
            fontname=fname,
            fontsize=tamano_elegido,
            color=color,
        )


def _ajustar_y_renderizar_texto(
    page, rect_caja, rect_original, origen_original, nuevo_texto, fuente_info, tamano, color, spans_config=None
):
    """Aplica reflow inteligente y escalado proporcional suave dentro de rect_caja (soporta spans mixtos)."""
    ancho_max = max(8.0, rect_caja.width)
    alto_max = max(6.0, rect_caja.height)

    if spans_config:
        _ajustar_y_renderizar_spans(
            page, rect_caja, rect_original, origen_original, ancho_max, alto_max, spans_config
        )
        return

    tamano_min = max(2.0, min(4.0, tamano * 0.45))

    def _buscar_ajuste(t_limite, permitir_corte_palabra):
        t = float(tamano)
        ultimo_t = None
        ultimas_lineas = None
        while t >= t_limite - 1e-6:
            lineas = _envolver_texto(
                nuevo_texto, fuente_info, t, ancho_max,
                permitir_corte_palabra=permitir_corte_palabra,
            )
            if lineas is not None:
                if not lineas:
                    lineas = [""]
                cabe_ancho = all(medir_texto(ln, fuente_info, t) <= ancho_max + 0.5 for ln in lineas)
                if len(lineas) == 1:
                    cabe_alto = (t <= alto_max + 1.5) or (t <= tamano + 0.1 and origen_original is not None) or (t <= tamano_min)
                else:
                    y_bl_0 = _calcular_baseline(t, tamano, rect_caja, rect_original, origen_original)
                    y_bottom = y_bl_0 + (len(lineas) - 1) * (t * 1.18) + 0.22 * t
                    cabe_alto = (y_bottom <= rect_caja.y1 + 0.5) and (((len(lineas) - 1) * 1.18 + 1.12) * t <= alto_max + 1.5)
                ultimo_t = t
                ultimas_lineas = lineas
                if cabe_ancho and cabe_alto:
                    return True, t, lineas
            t = round(t - 0.25, 2)
        return False, ultimo_t, ultimas_lineas

    palabras_no_vacias = [w for w in nuevo_texto.replace("\xa0", " ").split() if w]
    t_limite_intacto = tamano_min if len(palabras_no_vacias) <= 3 else max(tamano_min, round(tamano * 0.5, 2))
    ok, tamano_elegido, lineas_elegidas = _buscar_ajuste(t_limite_intacto, permitir_corte_palabra=False)
    if not ok:
        _, t_fb, ln_fb = _buscar_ajuste(tamano_min, permitir_corte_palabra=True)
        if ln_fb is not None:
            tamano_elegido, lineas_elegidas = t_fb, ln_fb
        elif lineas_elegidas is None:
            tamano_elegido, lineas_elegidas = tamano, [nuevo_texto]

    y_baseline_0 = _calcular_baseline(tamano_elegido, tamano, rect_caja, rect_original, origen_original)
    line_step = tamano_elegido * 1.18
    _renderizar_lineas_texto_simple(
        page, rect_caja, lineas_elegidas, y_baseline_0, line_step, fuente_info, tamano_elegido, color
    )
