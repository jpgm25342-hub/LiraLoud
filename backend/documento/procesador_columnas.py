# LiraLoud - Fusión de rectángulos, ordenamiento top-down y organización por columnas/cortes


def fusionar_rectangulos(rects):
    """Une fragmentos de rectángulos para el resaltado visual (Karaoke)."""
    if not rects: return []
    res = []
    linea_actual = list(rects[0])
    for i in range(1, len(rects)):
        r = rects[i]
        # Tolerancia vertical de 8px para considerar misma línea
        if abs(r[1] - linea_actual[1]) < 8:
            linea_actual[0] = min(linea_actual[0], r[0]) # x0
            linea_actual[2] = max(linea_actual[2], r[2]) # x1
            linea_actual[3] = max(linea_actual[3], r[3]) # y1
        else:
            res.append(linea_actual)
            linea_actual = list(r)
    res.append(linea_actual)
    return res

def _buscar_linea_mas_cercana(p, lineas):
    """Retorna la línea abierta verticalmente más cercana a la palabra `p` dentro de tolerancia, o None."""
    y0, y1 = p[1], p[3]
    centro_y = (y0 + y1) / 2.0
    altura_p = max(1.0, y1 - y0)
    tipo_script = p[8] if len(p) > 8 else None

    mejor_linea = None
    mejor_dist = None
    for linea in lineas:
        y_min_linea = min(item[1] for item in linea)
        y_max_linea = max(item[3] for item in linea)
        centro_linea = (y_min_linea + y_max_linea) / 2.0
        altura_promedio = max(1.0, (y_max_linea - y_min_linea))

        # Anclaje simétrico: 'sup' por su borde inferior, 'sub' por su borde superior
        if tipo_script == 'sup':
            dist = abs(y1 - centro_linea)
        elif tipo_script == 'sub':
            dist = abs(y0 - centro_linea)
        else:
            dist = abs(centro_y - centro_linea)

        tolerancia = max(altura_p, altura_promedio) * 0.55
        if dist <= tolerancia and (mejor_dist is None or dist < mejor_dist):
            mejor_dist = dist
            mejor_linea = linea
    return mejor_linea

def ordenar_palabras_por_lineas_top_down(palabras_col):
    """
    Ordenamiento robusto de lectura top-down / left-right para columnas de texto.
    A diferencia de un redondeo fijo (w[1]/10) que colapsa renglones en tipografías
    compactas o con subíndices, agrupa palabras calculando el solapamiento vertical
    real del centroide (y0+y1)/2 con respecto a la línea base activa.
    """
    if not palabras_col:
        return []

    # 1. Orden inicial aproximado por posición vertical y0
    candidatas = sorted(palabras_col, key=lambda w: (w[1], w[0]))

    lineas = []  # lista de listas de palabras
    for p in candidatas:
        mejor_linea = _buscar_linea_mas_cercana(p, lineas)
        if mejor_linea is not None:
            mejor_linea.append(p)
        else:
            lineas.append([p])

    # 2. Ordenar las líneas verticalmente por su centro Y y cada línea horizontalmente por x0
    lineas.sort(key=lambda lin: sum((item[1] + item[3]) / 2.0 for item in lin) / len(lin))

    resultado = []
    for lin in lineas:
        lin.sort(key=lambda w: w[0])
        resultado.extend(lin)

    return resultado

def normalizar_corte_v(c):
    """Convierte un corte V que puede ser float/int o dict {'x': ..., 'yMin': ..., 'yMax': ...} a dict."""
    if isinstance(c, dict):
        return {
            "x": float(c.get("x", 0)),
            "yMin": float(c.get("yMin", 0)),
            "yMax": float(c.get("yMax", 999999))
        }
    return {
        "x": float(c),
        "yMin": 0.0,
        "yMax": 999999.0
    }

def _ordenar_franja_horizontal(franja_palabras, f_y0, f_y1, cortes_activos, limites_h, ancho_pag):
    """Ordena palabras dentro de una franja horizontal respetando cortes verticales y límites horizontales."""
    def _limites_y_columna(col_key):
        if limites_h and col_key in limites_h:
            lh = limites_h[col_key]
            if isinstance(lh, (list, tuple)) and len(lh) >= 2:
                return max(f_y0, float(lh[0])), min(f_y1, float(lh[1]))
        return f_y0, f_y1

    if not cortes_activos:
        # Franja sin corte vertical: respetar igualmente el límite horizontal azul de la columna 0
        lim_y0, lim_y1 = _limites_y_columna("0")
        if lim_y0 != f_y0 or lim_y1 != f_y1:
            palabras_franja = [
                p for p in franja_palabras
                if lim_y0 <= ((p[1] + p[3]) / 2.0) <= lim_y1
            ]
        else:
            palabras_franja = franja_palabras
        return ordenar_palabras_por_lineas_top_down(palabras_franja) if palabras_franja else []

    # Franja dividida en columnas
    resultado = []
    xs = [0.0] + sorted(cortes_activos) + [float(ancho_pag)]
    for col_i in range(len(xs) - 1):
        col_x0 = xs[col_i]
        col_x1 = xs[col_i + 1]
        lim_y0, lim_y1 = _limites_y_columna(str(col_i))
        col_palabras = [
            p for p in franja_palabras
            if ((p[0] + p[2]) / 2.0) >= col_x0 and ((p[0] + p[2]) / 2.0) < col_x1
            and ((p[1] + p[3]) / 2.0) >= lim_y0 and ((p[1] + p[3]) / 2.0) <= lim_y1
        ]
        if col_palabras:
            resultado.extend(ordenar_palabras_por_lineas_top_down(col_palabras))
    return resultado

def _filtrar_palabras_sobrantes_por_limites(palabras_raw, palabras_ordenadas, limites_h):
    """Recupera palabras no procesadas en bordes exactos respetando limites_h."""
    ids_procesadas = {id(p) for p in palabras_ordenadas}
    sobrantes = []
    for p in palabras_raw:
        if id(p) in ids_procesadas:
            continue
        if limites_h and isinstance(limites_h, dict):
            cy = (p[1] + p[3]) / 2.0
            dentro_algun_limite = any(
                isinstance(lh, (list, tuple)) and len(lh) >= 2 and float(lh[0]) <= cy <= float(lh[1])
                for lh in limites_h.values()
            )
            if not dentro_algun_limite:
                continue
        sobrantes.append(p)
    return sobrantes

def _calcular_puntos_division_vertical(cortes, alto_pag):
    """Extrae los límites Y relevantes de los cortes verticales para segmentar la página en franjas."""
    y_splits = {0.0, float(alto_pag)}
    for c in cortes:
        if 5 < c["yMin"] < alto_pag - 5:
            y_splits.add(c["yMin"])
        if 5 < c["yMax"] < alto_pag - 5:
            y_splits.add(c["yMax"])
    return sorted(y_splits)

def organizar_palabras_con_cortes_y_limites(palabras_raw, lista_cortes_v, limites_h, ancho_pag, alto_pag):
    """
    Organiza palabras según cortes verticales (que pueden ser segmentados con yMin/yMax)
    y límites horizontales por columna.
    Las zonas fuera de las líneas verticales se leen a ancho completo.
    Las zonas dentro de las líneas verticales se dividen en columnas y se ordenan de izquierda a derecha.
    """
    if not palabras_raw:
        return []
    if not lista_cortes_v and not limites_h:
        return ordenar_palabras_por_lineas_top_down(palabras_raw)

    cortes = [normalizar_corte_v(c) for c in (lista_cortes_v or [])]
    sorted_y = _calcular_puntos_division_vertical(cortes, alto_pag)
    palabras_ordenadas = []

    for f_idx in range(len(sorted_y) - 1):
        f_y0 = sorted_y[f_idx]
        f_y1 = sorted_y[f_idx + 1]

        # Palabras cuyo centroide Y cae en esta franja horizontal
        franja_palabras = [
            p for p in palabras_raw
            if ((p[1] + p[3]) / 2.0) >= f_y0 and ((p[1] + p[3]) / 2.0) < f_y1
        ]
        if not franja_palabras:
            continue

        # Cortes activos en esta franja
        cortes_activos = [
            c["x"] for c in cortes
            if c["yMin"] <= f_y0 + 2 and c["yMax"] >= f_y1 - 2
        ]

        palabras_ordenadas.extend(
            _ordenar_franja_horizontal(franja_palabras, f_y0, f_y1, cortes_activos, limites_h, ancho_pag)
        )

    # Aseguramos que no se pierdan palabras en bordes exactos, sin re-inyectar texto excluido por limites_h
    sobrantes = _filtrar_palabras_sobrantes_por_limites(palabras_raw, palabras_ordenadas, limites_h)
    if sobrantes:
        palabras_ordenadas.extend(ordenar_palabras_por_lineas_top_down(sobrantes))

    return palabras_ordenadas
