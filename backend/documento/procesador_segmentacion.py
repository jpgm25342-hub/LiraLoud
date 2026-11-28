# LiraLoud - Reglas puras de pretokenización, geometría local y transiciones de segmentación
import re


def _pretokenizar_palabras(palabras):
    """Divide puntos pegados (ej. '(2003).Treven') repartiendo [x0, x1] proporcionalmente, protegiendo números y siglas."""
    if not palabras:
        return palabras
    resultado = []
    # Patrón: cierre/letra (no dígito suelto ni abreviatura numérica) seguido de '.' y mayúscula/apertura sin espacio
    patron_corte = re.compile(r'^(.+?[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\)\]\»\"\”\’]\.)([A-ZÁÉÍÓÚÑ\(\[\"\“\‘].+)$')
    for p in palabras:
        txt = p[4]
        if (
            '.' in txt
            and not re.search(r'\d\.\d', txt)
            and not re.match(r'^(?:No|Fig|Figs|Vol|Art|Cap|Sec|v)\.\d', txt, re.IGNORECASE)
            and not re.match(r'^(?:[A-Za-z]\.){2,}$', txt)
        ):
            m = patron_corte.match(txt)
            if m:
                parte1, parte2 = m.group(1), m.group(2)
                x0, y0, x1, y1 = p[0], p[1], p[2], p[3]
                total_len = max(1, len(txt))
                x_mid = x0 + (x1 - x0) * (len(parte1) / total_len)
                resto = tuple(p[5:]) if len(p) > 5 else ()
                resultado.append((x0, y0, x_mid, y1, parte1, *resto))
                resultado.append((x_mid, y0, x1, y1, parte2, *resto))
                continue
        resultado.append(p)
    return resultado

def _es_titulo_aislado_linea(
    texto_acumulado, es_nueva_linea, es_final, termina_dos_puntos, altura_palabra, altura_referencia, brecha_vertical, altura_moda
):
    """Determina si la línea acumulada corresponde a un título breve o en mayúsculas aislado."""
    if not (es_nueva_linea and len(texto_acumulado) <= 8 and not termina_dos_puntos and not es_final):
        return False
    frase_acumulada_temp = " ".join(texto_acumulado).strip()
    letras = re.sub(r'[^a-zA-ZáéíóúñÁÉÍÓÚÑ]', '', frase_acumulada_temp)
    es_mayus = bool(letras and len(letras) >= 4 and letras.isupper())
    es_titulo_solitario = bool(
        (len(texto_acumulado) <= 3 and (brecha_vertical >= (altura_referencia * 0.4) or altura_palabra >= (altura_moda * 1.15)))
        or (len(texto_acumulado) <= 8 and brecha_vertical >= (altura_referencia * 0.55) and bool(re.match(r'^[A-ZÁÉÍÓÚÑ]', texto_acumulado[0])))
    )
    return es_mayus or es_titulo_solitario

def _detectar_senales_salto_editorial(
    texto_acumulado,
    siguiente_txt,
    siguiente_x0,
    es_nueva_linea,
    es_final,
    termina_dos_puntos,
    parentesis_abiertos,
    altura_palabra,
    altura_referencia,
    brecha_vertical,
    inicio_linea_x0,
    inicio_linea_txt,
    inicio_linea_alto,
    geom,
    cfg,
):
    """Evalúa título aislado, sangría híbrida y pie de personaje en modo teatro."""
    altura_moda = geom["altura_moda"]
    w_char = geom["w_char"]
    ancho_columna_local = geom["ancho_columna_local"]
    margen_base_columna = geom["margen_base_columna"]

    es_titulo_aislado = _es_titulo_aislado_linea(
        texto_acumulado, es_nueva_linea, es_final, termina_dos_puntos,
        altura_palabra, altura_referencia, brecha_vertical, altura_moda,
    )

    diff_margen = siguiente_x0 - margen_base_columna
    es_lista_actual = bool(cfg["patron_lista_vineta"].match(inicio_linea_txt.strip()))
    es_letra_capital = inicio_linea_alto > (1.8 * altura_moda)
    tiene_sangria_sig = (
        (1.5 * w_char) <= diff_margen <= (0.22 * ancho_columna_local)
        and (siguiente_x0 > inicio_linea_x0 + 1.0 * w_char or es_final)
        and not es_lista_actual
        and not es_letra_capital
    )

    es_salto = bool(es_nueva_linea and tiene_sangria_sig and es_final)

    if cfg["modo_teatro_seg"] and parentesis_abiertos == 0 and len(texto_acumulado) > 0:
        sig_clean = siguiente_txt.strip()
        if sig_clean.endswith(':'):
            sig_base = sig_clean[:-1].strip().lower()
            actores_teatro_norm = cfg["actores_teatro_norm"]
            es_actor_conocido = bool(actores_teatro_norm and sig_base in actores_teatro_norm)
            es_cue_teatro = bool(re.match(r'^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúñÑ0-9_]{0,20}:$', sig_clean))
            if es_actor_conocido or es_cue_teatro:
                es_salto = True

    return es_salto, es_titulo_aislado, tiene_sangria_sig

def _cambio_bloque_nativo_fuerza_salto(
    p, siguiente, es_final, es_titulo_aislado, salto_vertical_adaptativo
):
    """Indica si el cambio de bloque nativo entre dos palabras debe forzar un salto de párrafo."""
    bloque_actual = p[5] if len(p) > 5 else 0
    siguiente_bloque = siguiente[5] if len(siguiente) > 5 else 0
    return siguiente_bloque != bloque_actual and (
        es_final or es_titulo_aislado or salto_vertical_adaptativo
    )

def _evaluar_salto_por_bloque_o_linea(
    p,
    siguiente,
    es_nueva_linea,
    es_final,
    es_titulo_aislado,
    tiene_sangria_sig,
    brecha_vertical,
    dy_modal,
    cfg,
):
    """Determina si corresponde salto de párrafo por cambio de bloque nativo o geometría de línea."""
    salto_vertical_adaptativo = brecha_vertical > (dy_modal * (1.35 + cfg["umbral_mult"]))

    if cfg["usar_bloques"]:
        return _cambio_bloque_nativo_fuerza_salto(
            p, siguiente, es_final, es_titulo_aislado, salto_vertical_adaptativo
        )

    if es_nueva_linea:
        if salto_vertical_adaptativo or es_titulo_aislado:
            return True
        if cfg["usar_sangria"] and tiene_sangria_sig and (es_final or brecha_vertical > (dy_modal * 0.6)):
            return True
    return False

def _ajustar_final_por_siguiente_token(es_final, termina_suspensivos, termina_punto_dentro_paren, termina_dos_puntos, siguiente_txt):
    if termina_suspensivos:
        return bool(re.match(r'^[A-ZÁÉÍÓÚÜÑ¿¡«(]', siguiente_txt))
    if termina_punto_dentro_paren and re.match(r'^[a-záéíóúüñ]', siguiente_txt):
        return False
    if es_final and not termina_dos_puntos and re.match(r'^[a-záéíóúüñ]', siguiente_txt):
        return False
    return es_final


def _evaluar_transicion_siguiente_palabra(
    i,
    p,
    siguiente,
    texto_acumulado,
    altura_palabra,
    es_final,
    termina_suspensivos,
    termina_punto_dentro_paren,
    termina_dos_puntos,
    parentesis_abiertos,
    inicio_linea_x0,
    inicio_linea_txt,
    inicio_linea_alto,
    geom,
    cfg,
):
    """Evalúa señales de corte, título aislado, sangría, teatro y bloques respecto a la siguiente palabra."""
    y0, y1 = p[1], p[3]
    siguiente_txt = siguiente[4]
    siguiente_x0 = siguiente[0]
    siguiente_y0 = siguiente[1]
    siguiente_y1 = siguiente[3]

    es_final = _ajustar_final_por_siguiente_token(
        es_final, termina_suspensivos, termina_punto_dentro_paren, termina_dos_puntos, siguiente_txt
    )
    sig_inicia_coma = bool(re.match(r'^[,;]', siguiente_txt))

    altura_referencia = max(altura_palabra, siguiente_y1 - siguiente_y0, 8.0)
    brecha_vertical = siguiente_y0 - y1
    es_nueva_linea = (siguiente_y0 - y0) > (altura_referencia * 0.45)

    dy_modal = geom["dy_modal"]
    sig_empieza_mayus = bool(re.match(r'^[A-ZÁÉÍÓÚÑ]', siguiente_txt))
    if es_final and sig_empieza_mayus:
        parentesis_abiertos = 0

    es_salto, es_titulo_aislado, tiene_sangria_sig = _detectar_senales_salto_editorial(
        texto_acumulado,
        siguiente_txt,
        siguiente_x0,
        es_nueva_linea,
        es_final,
        termina_dos_puntos,
        parentesis_abiertos,
        altura_palabra,
        altura_referencia,
        brecha_vertical,
        inicio_linea_x0,
        inicio_linea_txt,
        inicio_linea_alto,
        geom,
        cfg,
    )

    mapa_cajas_ia = cfg["mapa_cajas_ia"]
    if mapa_cajas_ia is not None and (mapa_cajas_ia[i] != mapa_cajas_ia[i + 1]) and (mapa_cajas_ia[i] != -1 or mapa_cajas_ia[i + 1] != -1):
        es_salto = True

    if _evaluar_salto_por_bloque_o_linea(
        p,
        siguiente,
        es_nueva_linea,
        es_final,
        es_titulo_aislado,
        tiene_sangria_sig,
        brecha_vertical,
        dy_modal,
        cfg,
    ):
        es_salto = True

    if es_nueva_linea:
        inicio_linea_x0 = siguiente_x0
        inicio_linea_txt = siguiente_txt
        inicio_linea_alto = siguiente_y1 - siguiente_y0

    return (
        es_final,
        es_salto,
        es_titulo_aislado,
        sig_inicia_coma,
        parentesis_abiertos,
        inicio_linea_x0,
        inicio_linea_txt,
        inicio_linea_alto,
    )

def _calcular_geometria_local_palabras(palabras):
    """Calcula métricas geométricas adaptativas locales de columna y salto de línea."""
    import statistics

    alturas_validas = [max(1.0, p[3] - p[1]) for p in palabras] if palabras else [10.0]
    altura_moda = statistics.median(alturas_validas) if alturas_validas else 10.0
    anchos_char = [
        (p[2] - p[0]) / len(p[4])
        for p in palabras
        if len(p[4]) > 0 and (p[2] - p[0]) > 0
    ]
    w_char = statistics.median(anchos_char) if anchos_char else max(3.5, altura_moda * 0.45)
    min_x0_col = min((p[0] for p in palabras), default=0.0)
    max_x1_col = max((p[2] for p in palabras), default=400.0)
    ancho_columna_local = max(80.0, max_x1_col - min_x0_col)

    brechas_linea = []
    for k in range(len(palabras) - 1):
        p_cur, p_nxt = palabras[k], palabras[k + 1]
        if (p_nxt[1] - p_cur[1]) > (altura_moda * 0.45):
            gap = max(0.0, p_nxt[1] - p_cur[3])
            if gap <= (2.2 * altura_moda):
                brechas_linea.append(gap)
    dy_modal = max(0.25 * altura_moda, statistics.median(brechas_linea)) if len(brechas_linea) >= 3 else (0.35 * altura_moda)

    return {
        "altura_moda": altura_moda,
        "w_char": w_char,
        "ancho_columna_local": ancho_columna_local,
        "margen_base_columna": min_x0_col,
        "dy_modal": dy_modal,
    }

def _filtrar_token_script(txt, tipo_script, i, palabras, omitir_sup, omitir_sub, texto_acumulado):
    """Filtra superíndices/subíndices del token actual y retorna (txt, token_omitido, cierre_por_sup, saltar)."""
    def _tipo(idx):
        if 0 <= idx < len(palabras):
            q = palabras[idx]
            return q[8] if len(q) > 8 else None
        return None

    def _marcar_cierre_si_puntua():
        if re.search(r'[.?!]', txt) and texto_acumulado:
            if not texto_acumulado[-1].endswith(('.', '?', '!')):
                texto_acumulado[-1] += '.'
            return True
        return False

    token_omitido = False
    cierre_por_sup = False

    if omitir_sup:
        if tipo_script == 'sup':
            token_omitido = True
            cierre_por_sup = _marcar_cierre_si_puntua()
        elif txt.strip() in {',', '-', '–', '—'} and _tipo(i - 1) == 'sup' and _tipo(i + 1) == 'sup':
            return txt, True, False, True
        else:
            txt_sin_sup = re.sub(r'[⁰¹²³⁴⁵⁶⁷⁸⁹]+', '', txt)
            if txt_sin_sup != txt:
                if not txt_sin_sup.strip():
                    token_omitido = True
                    cierre_por_sup = _marcar_cierre_si_puntua()
                else:
                    txt = txt_sin_sup

    if not token_omitido and omitir_sub:
        if tipo_script == 'sub':
            return txt, True, False, True
        txt_sin_sub = re.sub(r'[₀₁₂₃₄₅₆₇₈₉]+', '', txt)
        if txt_sin_sub != txt:
            if not txt_sin_sub.strip():
                return txt, True, False, True
            txt = txt_sin_sub

    return txt, token_omitido, cierre_por_sup, (token_omitido and not cierre_por_sup)

_SIGLAS_PROTEGIDAS = {
    'dr.', 'dra.', 'sr.', 'sra.', 'prof.', 'fig.', 'figs.', 'vs.',
    'et.', 'al.', 'e.g.', 'i.e.', 'p.', 'pp.', 'vol.', 'no.',
}

def _es_abreviatura_protegida(token, patron_letra):
    """Determina si un token corresponde a una sigla o abreviatura que no debe cortar oración."""
    tok = re.sub(r'[*_]', '', (token or '')).lower().strip()
    if not patron_letra.search(tok):
        return False
    ultima = tok.split()[-1] if tok.split() else tok
    if ultima in _SIGLAS_PROTEGIDAS or tok in _SIGLAS_PROTEGIDAS:
        return True
    if re.match(r'^(?:[a-záéíóúñ]\.){2,}$', ultima, re.IGNORECASE):
        return True
    if re.search(r'\d+[.)]', ultima):
        return False
    return len(ultima.replace('.', '')) <= 2 and ultima.endswith('.')

def _acumular_token_y_senales_cierre(
    txt,
    token_omitido,
    cierre_por_sup,
    x0,
    y0,
    x1,
    y1,
    texto_acumulado,
    rects_acumulados,
    palabras_objetos,
    parentesis_abiertos,
    patron_letra,
    patron_cierre,
):
    """Acumula el token actual, actualiza balance de paréntesis y calcula señales de cierre de oración."""
    es_solo_puntuacion = not patron_letra.search(txt) and not re.search(r'\d', txt)
    if not token_omitido:
        parentesis_abiertos += (txt.count('(') + txt.count('['))
        parentesis_abiertos -= (txt.count(')') + txt.count(']'))
        if parentesis_abiertos < 0:
            parentesis_abiertos = 0

        if es_solo_puntuacion and texto_acumulado:
            texto_acumulado[-1] += txt.strip()
        else:
            texto_acumulado.append(txt)
        rects_acumulados.append([x0, y0, x1, y1])
        palabras_objetos.append({"texto": txt, "bbox": [int(x0), int(y0), int(x1), int(y1)]})

    token_eval = texto_acumulado[-1] if texto_acumulado else txt
    es_numeracion_lista = (
        len(texto_acumulado) == 1
        and bool(re.match(r'^\d+(?:\.\d+)*\.$|^\d+[.)]$', token_eval.strip()))
    )
    es_final = (cierre_por_sup or bool(patron_cierre.search(token_eval))) and not es_numeracion_lista
    termina_suspensivos = token_eval.rstrip().endswith(('...', '…'))
    termina_punto_dentro_paren = bool(re.search(r'[.?!][)\]]$', token_eval.strip()))
    termina_dos_puntos = bool(re.search(r'[:;][)\]"\'”’»]?$', token_eval))
    if termina_dos_puntos and len(texto_acumulado) >= 25:
        es_final = True
    return (
        parentesis_abiertos,
        token_eval,
        es_final,
        termina_suspensivos,
        termina_punto_dentro_paren,
        termina_dos_puntos,
    )
