# LiraLoud - Ordenamiento de lectura (1/2 columnas) y conversión de líneas OCR a palabras
from typing import List, Tuple


def _ordenar_lineas_dos_columnas(lineas, mejor_gutter: float, alto_pdf: float):
    """Clasifica y ordena encabezados, columna izquierda, columna derecha y pies en páginas de 2 columnas."""
    lineas_en_cols = [l for l in lineas if l["x1"] <= mejor_gutter or l["x0"] >= mejor_gutter]
    min_y_cols = min((l["y0"] for l in lineas_en_cols), default=0)
    max_y_cols = max((l["y1"] for l in lineas_en_cols), default=alto_pdf)

    top_headers = []
    bottom_footers = []
    col_izq = []
    col_der = []

    for l in lineas:
        if l["x1"] <= mejor_gutter + 5:
            col_izq.append(l)
        elif l["x0"] >= mejor_gutter - 5:
            col_der.append(l)
        elif l["cy"] < min_y_cols + 12:
            top_headers.append(l)
        elif l["cy"] > max_y_cols - 12:
            bottom_footers.append(l)
        elif l["cx"] < mejor_gutter:
            col_izq.append(l)
        else:
            col_der.append(l)

    top_headers.sort(key=lambda l: l["y0"])
    col_izq.sort(key=lambda l: l["y0"])
    col_der.sort(key=lambda l: l["y0"])
    bottom_footers.sort(key=lambda l: l["y0"])
    return top_headers + col_izq + col_der + bottom_footers

def _detectar_gutter_dos_columnas(lineas):
    """Detecta un canal central de dos columnas a partir de las líneas OCR normalizadas, o retorna None."""
    min_x = min(l["x0"] for l in lineas)
    max_x = max(l["x1"] for l in lineas)
    ancho_contenido = max_x - min_x
    if ancho_contenido <= 80 or len(lineas) < 4:
        return None
    centro_x = (min_x + max_x) / 2.0
    margen = ancho_contenido * 0.08
    izq = [l for l in lineas if l["x1"] <= centro_x + margen]
    der = [l for l in lineas if l["x0"] >= centro_x - margen]
    if len(izq) >= 2 and len(der) >= 2 and (len(izq) + len(der)) / len(lineas) >= 0.65:
        return centro_x
    return None

def _ordenar_lineas_una_columna(lineas):
    """Ordena líneas OCR de una sola columna de arriba a abajo agrupando fragmentos en la misma fila visual."""
    lineas.sort(key=lambda l: (l["cy"], l["x0"]))
    filas = []
    for l in lineas:
        if not filas:
            filas.append([l])
            continue
        fila_actual = filas[-1]
        cy_ref = sum(it["cy"] for it in fila_actual) / len(fila_actual)
        h_ref = sum(max(1.0, it["h"]) for it in fila_actual) / len(fila_actual)
        tol_y = max(2.0, min(h_ref, max(1.0, l["h"])) * 0.45)
        if abs(l["cy"] - cy_ref) <= tol_y:
            fila_actual.append(l)
        else:
            filas.append([l])
    lineas_ordenadas = []
    for fila in filas:
        fila.sort(key=lambda l: l["x0"])
        lineas_ordenadas.extend(fila)
    return lineas_ordenadas

def ordenar_lineas_ocr_lectura(ocr_items, scale_x: float, scale_y: float, ancho_pdf: float, alto_pdf: float):
    """
    Ordena las líneas de OCR en orden natural de lectura respetando estructuras
    de 1 o 2 columnas (artículos científicos, libros, periódicos).
    """
    if not ocr_items:
        return []

    lineas = []
    for item in ocr_items:
        box = item[0]
        texto_linea = str(item[1]).strip()
        if not texto_linea:
            continue
        xs = [pt[0] * scale_x for pt in box]
        ys = [pt[1] * scale_y for pt in box]
        x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
        lineas.append({
            "item": item,
            "x0": x0,
            "y0": y0,
            "x1": x1,
            "y1": y1,
            "cx": (x0 + x1) / 2.0,
            "cy": (y0 + y1) / 2.0,
            "w": x1 - x0,
            "h": y1 - y0,
        })

    if not lineas:
        return []

    mejor_gutter = _detectar_gutter_dos_columnas(lineas)

    if mejor_gutter is not None:
        lineas_ordenadas = _ordenar_lineas_dos_columnas(lineas, mejor_gutter, alto_pdf)
    else:
        lineas_ordenadas = _ordenar_lineas_una_columna(lineas)

    return [l["item"] for l in lineas_ordenadas]

def _extraer_palabras_desde_char_boxes(
    char_list,
    char_boxes,
    line_idx: int,
    scale_x: float,
    scale_y: float,
) -> List[Tuple[float, float, float, float, str, int, int, int]]:
    """Agrupa caracteres con cajas nativas RapidOCR en tuplas de palabra en puntos PDF."""
    palabras: List[Tuple[float, float, float, float, str, int, int, int]] = []

    def _construir_palabra(cur_chars, cur_boxes, word_idx: int):
        w_txt = "".join(cur_chars)
        cxs = [pt[0] for b in cur_boxes for pt in b]
        cys = [pt[1] for b in cur_boxes for pt in b]
        wx0 = max(0.0, min(cxs) * scale_x - 0.4)
        wy0 = min(cys) * scale_y
        wx1 = max(cxs) * scale_x + 0.4
        wy1 = max(cys) * scale_y
        h_w = max(1.0, wy1 - wy0)
        wy0 = max(0.0, wy0 - h_w * 0.065)
        wy1 = max(wy0 + 1.0, wy1 - h_w * 0.075)
        return (
            round(wx0, 2),
            round(wy0, 2),
            round(wx1, 2),
            round(wy1, 2),
            w_txt,
            line_idx,
            line_idx,
            word_idx,
        )

    word_idx = 0
    cur_chars = []
    cur_boxes = []
    for ch, cbox in zip(char_list, char_boxes):
        if str(ch).isspace():
            if cur_chars:
                palabras.append(_construir_palabra(cur_chars, cur_boxes, word_idx))
                word_idx += 1
                cur_chars, cur_boxes = [], []
        else:
            cur_chars.append(str(ch))
            cur_boxes.append(cbox)
    if cur_chars:
        palabras.append(_construir_palabra(cur_chars, cur_boxes, word_idx))
    return palabras

def _peso_char_ocr(c: str) -> float:
    if c.isspace():
        return 0.35
    if c in "iIljtfr.,;:!|'\"`":
        return 0.45
    if c in "mwMW@":
        return 1.45
    return 1.0

def _extraer_palabras_ponderadas_linea(
    texto_linea: str,
    x_min_pt: float,
    x_max_pt: float,
    y_min_pt: float,
    y_max_pt: float,
    line_idx: int,
) -> List[Tuple[float, float, float, float, str, int, int, int]]:
    """Divide una línea OCR en palabras con anchos ponderados por carácter sin deriva acumulada."""
    palabras_linea = texto_linea.split()
    if not palabras_linea:
        return []

    pesos_palabras = [sum(_peso_char_ocr(c) for c in w) for w in palabras_linea]
    peso_espacio = 0.35
    peso_total = sum(pesos_palabras) + peso_espacio * max(0, len(palabras_linea) - 1)
    ancho_total_linea_pt = max(10.0, x_max_pt - x_min_pt)
    curr_x = x_min_pt
    palabras: List[Tuple[float, float, float, float, str, int, int, int]] = []

    for word_idx, (w, pw) in enumerate(zip(palabras_linea, pesos_palabras)):
        ancho_w_pt = ancho_total_linea_pt * (pw / max(1e-6, peso_total))
        w_x0 = curr_x
        w_x1 = min(x_max_pt, curr_x + ancho_w_pt)
        curr_x = w_x1 + ancho_total_linea_pt * (peso_espacio / max(1e-6, peso_total))
        palabras.append((
            round(w_x0, 2),
            round(y_min_pt, 2),
            round(w_x1, 2),
            round(y_max_pt, 2),
            w,
            line_idx,
            line_idx,
            word_idx,
        ))
    return palabras

def _convertir_lineas_ocr_a_palabras(
    ocr_result_ordenado,
    scale_x: float,
    scale_y: float,
) -> List[Tuple[float, float, float, float, str, int, int, int]]:
    """Convierte líneas OCR ordenadas a tuplas (x0, y0, x1, y1, palabra, block, line, word) en puntos PDF."""
    palabras_finales: List[Tuple[float, float, float, float, str, int, int, int]] = []

    for line_idx, item in enumerate(ocr_result_ordenado):
        box = item[0]
        texto_linea = str(item[1]).strip()
        if not texto_linea:
            continue

        xs = [pt[0] for pt in box]
        ys = [pt[1] for pt in box]
        x_min_pt = min(xs) * scale_x
        x_max_pt = max(xs) * scale_x
        y_min_pt = min(ys) * scale_y
        y_max_pt = max(ys) * scale_y

        char_boxes = item[3] if len(item) > 3 and isinstance(item[3], list) else None
        char_list = item[4] if len(item) > 4 and isinstance(item[4], list) else None

        # Priorizar cajas nativas por carácter de RapidOCR (return_word_box=True)
        if char_boxes and char_list and len(char_boxes) == len(char_list):
            palabras_finales.extend(
                _extraer_palabras_desde_char_boxes(char_list, char_boxes, line_idx, scale_x, scale_y)
            )
            continue

        # Fallback ponderado sin deriva acumulada
        palabras_finales.extend(
            _extraer_palabras_ponderadas_linea(
                texto_linea, x_min_pt, x_max_pt, y_min_pt, y_max_pt, line_idx
            )
        )

    return palabras_finales
