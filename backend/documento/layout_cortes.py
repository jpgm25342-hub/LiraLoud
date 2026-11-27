# LiraLoud - Detección geométrica de cortes verticales de columnas y límites horizontales
import numpy as np


def _calcular_semillas_verticales_corte(cut_x, y_col_min, y_col_max, words_reading):
    """Calcula las cotas verticales semilla (top_seed_y, bot_seed_y) a ambos lados de cut_x."""
    w_left_col = [w for w in words_reading if w[2] < cut_x - 10 and max(w[1], y_col_min) < min(w[3], y_col_max)]
    w_right_col = [w for w in words_reading if w[0] > cut_x + 10 and max(w[1], y_col_min) < min(w[3], y_col_max)]
    if w_left_col and w_right_col:
        top_seed_y = min(min(w[1] for w in w_left_col), min(w[1] for w in w_right_col))
        bot_seed_y = max(max(w[3] for w in w_left_col), max(w[3] for w in w_right_col))
        return top_seed_y, bot_seed_y
    return y_col_min, y_col_max

def _palabras_en_corredor_vertical(words_raw, cut_x, margen=8):
    """Filtra palabras que intersectan el corredor vertical del rayo en torno a cut_x."""
    return [w for w in words_raw if w[0] < cut_x + margen and w[2] > cut_x - margen]

def _proyectar_corte_raycasting(cut_x, y_col_min, y_col_max, words_reading, words_raw, orig_h):
    """Proyecta un corte vertical hacia arriba y abajo (raycasting) hasta topar con obstáculos."""
    top_seed_y, bot_seed_y = _calcular_semillas_verticales_corte(cut_x, y_col_min, y_col_max, words_reading)
    en_corredor = _palabras_en_corredor_vertical(words_raw, cut_x)

    # Disparo láser hacia arriba
    obs_up = [w[3] for w in en_corredor if 35 < w[3] <= top_seed_y]
    laser_y_min = (max(obs_up) + 4.0) if obs_up else 40.0

    # Disparo láser hacia abajo
    obs_down = [w[1] for w in en_corredor if bot_seed_y <= w[1] < orig_h - 35]
    laser_y_max = (min(obs_down) - 4.0) if obs_down else (orig_h - 40.0)

    laser_y_min = max(0.0, float(laser_y_min))
    laser_y_max = min(float(orig_h), float(laser_y_max))

    es_hibrida = (laser_y_min > 85.0) or (laser_y_max < (orig_h - 85.0))
    if es_hibrida:
        return {
            "x": int(cut_x),
            "yMin": round(laser_y_min, 1),
            "yMax": round(laser_y_max, 1),
        }
    return int(cut_x)

def _buscar_candidatos_corte_histograma(words_reading, y_col_min, y_col_max, orig_w):
    """Construye el histograma horizontal en la franja de columnas y devuelve coordenadas X candidatas."""
    words_in_col = [w for w in words_reading if (y_col_min - 15) <= w[1] and w[3] <= (y_col_max + 15)]
    hist_x = np.zeros(int(orig_w) + 1, dtype=np.int32)
    for w in words_in_col:
        x0, x1 = max(0, int(w[0])), min(int(orig_w), int(w[2]))
        hist_x[x0:x1] += 1

    zona_busqueda_min = int(orig_w * 0.30)
    zona_busqueda_max = int(orig_w * 0.70)

    gaps = [x for x in range(zona_busqueda_min, zona_busqueda_max) if hist_x[x] == 0]
    cut_candidates = []
    if gaps:
        g_start = gaps[0]
        g_prev = gaps[0]
        for gx in gaps[1:]:
            if gx - g_prev > 15:
                cut_candidates.append((g_start + g_prev) // 2)
                g_start = gx
            g_prev = gx
        cut_candidates.append((g_start + g_prev) // 2)
    else:
        sub_hist = hist_x[zona_busqueda_min:zona_busqueda_max]
        if len(sub_hist) > 0:
            cut_candidates.append(zona_busqueda_min + int(np.argmin(sub_hist)))
    return cut_candidates

def _es_candidato_corte_yolo_valido(
    cut_x, overlapping_left, overlapping_right, blocks_text, y_col_min, y_col_max, orig_w
):
    """Valida que cut_x separe columnas izquierda/derecha sin cruzar párrafos anchos del cuerpo."""
    vis_left = [c for c in overlapping_left if c["x2"] < (cut_x + 10)]
    vis_right = [c for c in overlapping_right if c["x1"] > (cut_x - 10)]
    if not (vis_left and vis_right):
        return False
    for b in blocks_text:
        inter_y = max(b[1], y_col_min) < min(b[3], y_col_max)
        w_b = b[2] - b[0]
        if inter_y and w_b > (orig_w * 0.55) and (b[0] < cut_x - 15) and (b[2] > cut_x + 15):
            return False
    return True

def _detectar_cortes_yolo_raycasting(
    overlapping_left, overlapping_right, words_reading, words_raw, blocks_text, orig_w, orig_h
):
    """MODO 1: calcula cortes verticales desde columnas solapadas YOLO usando histograma y raycasting."""
    cortes_v = []
    # La franja vertical se restringe a donde efectivamente coexisten las columnas
    y_col_min = min(min(c["y1"] for c in overlapping_left), min(c["y1"] for c in overlapping_right))
    y_col_max = max(max(c["y2"] for c in overlapping_left), max(c["y2"] for c in overlapping_right))

    cut_candidates = _buscar_candidatos_corte_histograma(words_reading, y_col_min, y_col_max, orig_w)

    for cut_x in cut_candidates:
        if _es_candidato_corte_yolo_valido(
            cut_x, overlapping_left, overlapping_right, blocks_text, y_col_min, y_col_max, orig_w
        ):
            cortes_v.append(
                _proyectar_corte_raycasting(cut_x, y_col_min, y_col_max, words_reading, words_raw, orig_h)
            )
    return cortes_v

def _banda_separa_columnas(words_reading, cur_y, cand_x):
    """Indica si en la banda vertical [cur_y, cur_y + 35] hay palabras a ambos lados de cand_x sin cruzarlo."""
    bw = [w for w in words_reading if max(cur_y, w[1]) < min(cur_y + 35, w[3])]
    has_l = any(w[2] < (cand_x - 5) for w in bw)
    has_r = any(w[0] > (cand_x + 5) for w in bw)
    has_cross = any(w[0] < cand_x and w[2] > cand_x for w in bw)
    return has_l and has_r and not has_cross

def _evaluar_bandas_corte_palabras(cand_x, words_reading, orig_h):
    """Evalúa si cand_x separa bandas de palabras a izquierda/derecha y retorna el corte o None."""
    col_bands = 0
    band_y_starts = []
    y_min = min(w[1] for w in words_reading)
    y_max = max(w[3] for w in words_reading)
    cur_y = y_min
    while cur_y < y_max:
        if _banda_separa_columnas(words_reading, cur_y, cand_x):
            col_bands += 1
            band_y_starts.append(cur_y)
        cur_y += 20

    if col_bands < 4:
        return None

    y_col_min = min(band_y_starts)
    y_col_max = max(band_y_starts) + 35
    es_hibrida = (y_col_min > 90) or (y_col_max < (orig_h - 100))
    if es_hibrida:
        return {
            "x": int(cand_x),
            "yMin": round(max(0, y_col_min - 10), 1),
            "yMax": round(min(orig_h, y_col_max + 10), 1),
        }
    return int(cand_x)

def _buscar_brechas_palabras_histograma(words_reading, orig_w):
    """Construye el histograma horizontal de words_reading y devuelve brechas X candidatas."""
    hist_w = np.zeros(int(orig_w) + 1, dtype=np.int32)
    for w in words_reading:
        x0, x1 = max(0, int(w[0])), min(int(orig_w), int(w[2]))
        hist_w[x0:x1] += 1

    z_min, z_max = int(orig_w * 0.25), int(orig_w * 0.75)
    cand_cuts = []
    en_gap = False
    g_start = 0
    for x in range(z_min, z_max):
        if hist_w[x] == 0:
            if not en_gap:
                en_gap = True
                g_start = x
        else:
            if en_gap:
                en_gap = False
                if (x - g_start) >= 5:
                    cand_cuts.append((g_start + x) // 2)
    if en_gap and (z_max - g_start) >= 5:
        cand_cuts.append((g_start + z_max) // 2)

    if not cand_cuts:
        sub_w = hist_w[z_min:z_max]
        if len(sub_w) > 0 and np.min(sub_w) <= 4:
            val_min = np.min(sub_w)
            xs = [z_min + i for i, v in enumerate(sub_w) if v == val_min]
            cand_cuts.append(xs[len(xs) // 2])
    return cand_cuts

def _detectar_cortes_por_palabras(words_reading, orig_w, orig_h):
    """MODO 2: detecta cortes verticales por distribución real de palabras cuando YOLO no halla columnas."""
    cortes_v = []
    cand_cuts = _buscar_brechas_palabras_histograma(words_reading, orig_w)

    for cand_x in cand_cuts:
        corte = _evaluar_bandas_corte_palabras(cand_x, words_reading, orig_h)
        if corte is None:
            continue
        # Evitar cortes duplicados en el mismo canal (distancia mínima 40px)
        ya_existe = any(
            abs((c["x"] if isinstance(c, dict) else c) - int(cand_x)) < 40
            for c in cortes_v
        )
        if not ya_existe:
            cortes_v.append(corte)

    if len(cortes_v) > 1:
        cortes_v.sort(key=lambda c: c["x"] if isinstance(c, dict) else c)
    return cortes_v

def _filtrar_palabras_utiles_horizontales(words_raw, zonas_excluidas):
    """Filtra palabras fuera de zonas excluidas y por debajo de la franja superior de cabecera."""
    return [
        w for w in words_raw
        if not any(not (w[2] < z[0] or w[0] > z[2] or w[3] < z[1] or w[1] > z[3]) for z in zonas_excluidas)
        and not (w[1] < 40 and w[3] < 40)
    ]

def _calcular_limites_horizontales(words_raw, bloques_lectura, zonas_excluidas, cortes_v, orig_h):
    """Calcula el rango vertical [yMin, yMax] útil de la página y lo asigna a las columnas activas."""
    w_valid = _filtrar_palabras_utiles_horizontales(words_raw, zonas_excluidas)
    if w_valid:
        y_min = max(0, min(w[1] for w in w_valid) - 14)
        y_max = min(orig_h, max(w[3] for w in w_valid) + 14)
    elif bloques_lectura:
        y_min = max(0, min(b["y1"] for b in bloques_lectura) - 14)
        y_max = min(orig_h, max(b["y2"] for b in bloques_lectura) + 14)
    else:
        y_min, y_max = 0, orig_h

    rango = [round(y_min, 1), round(y_max, 1)]
    if cortes_v:
        return {"0": list(rango), "1": list(rango)}
    return {"0": rango}
