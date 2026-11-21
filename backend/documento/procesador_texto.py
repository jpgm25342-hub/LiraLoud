import os
import re
from backend.core.webview_bridge import eel
from backend.core.estado_global import estado_app
from backend.core.gestor_archivos import (
    cargar_ajustes_lectura,
    cargar_diccionario_teatro,
    cargar_reglas_libro,
    cargar_diccionario,
)
from backend.core.utils import crear_regex_inmune_acentos


IDIOMAS_NO_LATINOS = {
    'zh', 'ja', 'ko', 'hi', 'bn', 'ar', 'ru', 'uk',
    'th', 'vi', 'he', 'el', 'ta', 'te', 'mr', 'ur', 'fa',
}


@eel.expose
def aplicar_reemplazos(texto, diccionario_activo, filtros=None, modo_teatro=False, obra_actual="General", idioma_filtro=""):
    # 🛡️ BLINDAJE DE TIPO: Si el diccionario llegó corrupto, usar vacío
    if not isinstance(diccionario_activo, dict):
        diccionario_activo = {}

    # 📖 REGLAS EXCLUSIVAS DEL LIBRO ACTIVO (libros_reglas.json)
    if diccionario_activo:
        diccionario_activo = {k: v for k, v in diccionario_activo.items() if k != "📖 Este Libro"}
        try:
            if estado_app.doc and getattr(estado_app.doc, "name", None):
                _reglas_lib = cargar_reglas_libro(os.path.basename(estado_app.doc.name))
                _dict_lib = _reglas_lib.get("diccionario", {}) if isinstance(_reglas_lib, dict) else {}
                if isinstance(_dict_lib, dict) and _dict_lib and _dict_lib.get("active", True):
                    diccionario_activo = {**diccionario_activo, "__ESTE_LIBRO__": _dict_lib}
        except Exception:
            pass

    # 🛡️ BLINDAJE DE TEXTO
    if isinstance(texto, list):
        try: texto = " ".join([str(p.get('texto', p)) if isinstance(p, dict) else str(p) for p in texto])
        except: texto = str(texto)
    
    if not isinstance(texto, str):
        texto = str(texto) if texto is not None else ""
    
    if not texto: return "", None
    voz_detectada = None
    
    # 🎯 CARGA DE FILTROS
    if filtros is None:
        ajustes = cargar_ajustes_lectura() # Ya usa validar_json internamente
        filtros = {
            'chk-urls': ajustes.get('omitirUrls', False),
            'chk-paren': ajustes.get('omitirParen', False),
            'chk-corch': ajustes.get('omitirCorch', False),
            'chk-llaves': ajustes.get('omitirLlaves', False),
            'chk-barras': ajustes.get('omitirBarras', False),
            'chk-referencias': ajustes.get('omitirReferencias', True)
        }

    # 🎭 BLOQUE TEATRO (Consolidado: teatro.json + libros_reglas.json)
    if modo_teatro:
        try:
            db = cargar_diccionario_teatro() # Ya usa validar_json
            obra_data = db.get(obra_actual, {})
            reparto = {}
            if isinstance(obra_data, dict) and obra_data.get("active", True):
                reparto.update(obra_data.get("actors", {}))
            if estado_app.doc and getattr(estado_app.doc, "name", None):
                _reg_lib = cargar_reglas_libro(os.path.basename(estado_app.doc.name))
                _teatro_lib = _reg_lib.get("teatro", {}) if isinstance(_reg_lib, dict) else {}
                if isinstance(_teatro_lib, dict) and _teatro_lib.get("active", True):
                    reparto.update(_teatro_lib.get("actors", {}))
            if reparto:
                for actor_key, data in reparto.items():
                    if not data.get("on", True): continue
                    
                    patron_nombre = crear_regex_inmune_acentos(actor_key)
                    # Regex de francotirador tolerante a guiones/viñetas iniciales
                    regex_combate = rf"^\s*[-—–•·*>\s]*(?:(?:[\w\d]+\s+){{0,3}})?\b{patron_nombre}\s*[:](?:\s*,\s*)?"
                    match = re.search(regex_combate, texto, re.IGNORECASE)

                    if match:
                        voz_detectada = data["voz"]
                        texto = texto[match.end():].strip()
                        if not texto or re.match(r'^[\.,;]+$', texto) or texto == "...": 
                            texto = "..."
                        
                        # Persistencia global para el hilo actual
                        estado_app.voz_teatro_persistente = voz_detectada
                        break
        except Exception as e:
            print(f"⚠️ Error en lógica teatro: {e}")

    original = texto

    # ✂️ FILTROS ESTRUCTURALES
    if filtros.get('chk-paren'): texto = re.sub(r'\(.*?\)', '', texto)
    if filtros.get('chk-corch'): texto = re.sub(r'\[.*?\]', '', texto)
    if filtros.get('chk-llaves'): texto = re.sub(r'\{.*?\}', '', texto)
    if filtros.get('chk-urls'):
        patron_web = r'https?://\S+|www\.\S+|\b\w+\.(?:com|org|net|edu|gov|mx)\b'
        texto = re.sub(patron_web, '', texto) 

    # 3. PROTECCIÓN DECIMAL (36.5 -> 36 punto 5)
    texto = re.sub(r'(\d)\.(\d)', r'\1 punto \2', texto)
    
    # 4. PROCESAMIENTO DE SUPERÍNDICES Y SUBÍNDICES (sin borrado ciego de CO2, SpO2, B12, T4)
    omitir_sup = filtros.get('chk-superindices', filtros.get('omitirSuperindices', filtros.get('chk-referencias', True)))
    omitir_sub = filtros.get('chk-subindices', filtros.get('omitirSubindices', False))
    if omitir_sup:
        texto = re.sub(r'[⁰¹²³⁴⁵⁶⁷⁸⁹]', '', texto)
        texto = re.sub(r'\[\d{1,3}\]', '', texto)
    if omitir_sub:
        texto = re.sub(r'[₀₁₂₃₄₅₆₇₈₉]', '', texto)

    # 📚 DICCIONARIO DE ABREVIATURAS
    if diccionario_activo:
        for categoria in diccionario_activo.values():
            if not isinstance(categoria, dict) or not categoria.get("active", True): continue
            
            terminos = categoria.get("terms", {})
            claves_ordenadas = sorted(terminos.keys(), key=len, reverse=True)

            for sigla in claves_ordenadas:
                raw = terminos[sigla]
                if isinstance(raw, dict) and not raw.get("on", True): continue
                
                significado = str(raw.get("val", "")) if isinstance(raw, dict) else str(raw)
                s_esc = re.escape(sigla)
                
                # Aplicar filtro de palabra exacta independiente de puntuación
                patron = f"(?i)(?<![a-zA-Z0-9_ÁÉÍÓÚáéíóúÑñüÜ]){s_esc}(?![a-zA-Z0-9_ÁÉÍÓÚáéíóúÑñüÜ])"
                texto = re.sub(patron, f" {significado} ", texto)

    # 🧹 NORMALIZACIÓN FINAL
    lang_iso = (idioma_filtro or "").strip().lower()[:2]
    if lang_iso in IDIOMAS_NO_LATINOS:
        texto = re.sub(
            r"[^\w\s\u0600-\u06FF\u0900-\u097F\u0980-\u09FF\u0B80-\u0BFF\u0C00-\u0C7F\u0E00-\u0E7F\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF.,;:!?¿¡।。、！？，؛،\-—'\"()]",
            " ",
            texto,
        )
    else:
        texto = re.sub(r'[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s\.\,\:\;\-\(\)\[\]\?\¿\!\¡\%\+\°\=\⁰\¹\²\³\⁴\⁵\⁶\⁷\⁸\⁹]', ' ', texto)
    # Tarea 1: Sanitizador de Espacios Repetidos (Protegiendo saltos de línea)
    res = re.sub(r'[ \t]{2,}', ' ', texto).strip()
    
    return res, voz_detectada

def mapear_expansion_palabras_n_a_1(palabras_visuales, dict_activo):
    """
    Toma la lista de palabras visuales originales del PDF (o texto de entrada)
    y para cada token visual genera su expansión por abreviaturas manteniendo su vIdx.
    Retorna: lista de diccionarios con { 'vIdx', 'w_orig', 'frags', 'pesos_frags', 'peso_total' }
    """
    if not isinstance(dict_activo, dict):
        dict_activo = {}
        
    patrones = []
    for cat in dict_activo.values():
        if not isinstance(cat, dict) or not cat.get("active", True):
            continue
        terminos = cat.get("terms", {})
        for sigla in sorted(terminos.keys(), key=len, reverse=True):
            raw = terminos[sigla]
            if isinstance(raw, dict) and not raw.get("on", True):
                continue
            sig = str(raw.get("val", "")) if isinstance(raw, dict) else str(raw)
            s_esc = re.escape(sigla)
            pat = re.compile(rf"(?<![a-zA-Z0-9_ÁÉÍÓÚáéíóúÑñüÜ]){s_esc}(?![a-zA-Z0-9_ÁÉÍÓÚáéíóúÑñüÜ])", re.IGNORECASE)
            patrones.append((pat, sig))
            
    items = []
    for v_idx, p_vis in enumerate(palabras_visuales):
        # 1. Decimales (ej. 36.5 -> 36 punto 5)
        w_trans = re.sub(r'(\d)\.(\d)', r'\1 punto \2', str(p_vis or ""))
        # 2. Abreviaturas
        for pat, sig in patrones:
            w_trans = pat.sub(f" {sig} ", w_trans)
        # 3. Limpieza de caracteres no pronunciables
        w_trans = re.sub(r'[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s\.\,\:\;\-\?\¿\!\¡\%\+\=]', ' ', w_trans)
        frags = [f.strip() for f in w_trans.split() if f.strip()]
        if not frags:
            frags = [p_vis] if p_vis else [" "]
            
        pesos_frags = []
        peso_total = 0.0
        for f in frags:
            f_clean = re.sub(r'[^\w]', '', f)
            peso_f = max(1, len(f_clean))
            if any(c in f for c in '.,;:?!'):
                peso_f += 12
            pesos_frags.append(peso_f)
            peso_total += peso_f
            
        items.append({
            "vIdx": v_idx,
            "w_orig": p_vis,
            "frags": frags,
            "pesos_frags": pesos_frags,
            "peso": peso_total
        })
    return items

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
    
    lineas = [] # lista de listas de palabras
    for p in candidatas:
        y0, y1 = p[1], p[3]
        centro_y = (y0 + y1) / 2.0
        altura_p = max(1.0, y1 - y0)
        tipo_script = p[8] if len(p) > 8 else None

        # Asignar a la línea abierta más cercana dentro de la tolerancia
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
    
    # Extraer puntos de corte vertical relevantes para segmentar en franjas horizontales
    y_splits = {0.0, float(alto_pag)}
    for c in cortes:
        if c["yMin"] > 5 and c["yMin"] < alto_pag - 5:
            y_splits.add(c["yMin"])
        if c["yMax"] > 5 and c["yMax"] < alto_pag - 5:
            y_splits.add(c["yMax"])

    sorted_y = sorted(list(y_splits))
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

        if not cortes_activos:
            # Franja sin corte vertical (e.g. título superior, tabla corrida, o pie)
            # Aplicar filtro horizontal si hay límites
            palabras_ordenadas.extend(ordenar_palabras_por_lineas_top_down(franja_palabras))
        else:
            # Franja dividida en columnas
            xs = [0.0] + sorted(cortes_activos) + [float(ancho_pag)]
            for col_i in range(len(xs) - 1):
                col_x0 = xs[col_i]
                col_x1 = xs[col_i + 1]
                
                # Respetar límites horizontales si están asignados a esta columna
                lim_y0 = f_y0
                lim_y1 = f_y1
                if limites_h and str(col_i) in limites_h:
                    lh = limites_h[str(col_i)]
                    if isinstance(lh, (list, tuple)) and len(lh) >= 2:
                        lim_y0 = max(f_y0, float(lh[0]))
                        lim_y1 = min(f_y1, float(lh[1]))

                col_palabras = [
                    p for p in franja_palabras
                    if ((p[0] + p[2]) / 2.0) >= col_x0 and ((p[0] + p[2]) / 2.0) < col_x1
                    and ((p[1] + p[3]) / 2.0) >= lim_y0 and ((p[1] + p[3]) / 2.0) <= lim_y1
                ]
                if col_palabras:
                    palabras_ordenadas.extend(ordenar_palabras_por_lineas_top_down(col_palabras))

    # Aseguramos que no se pierdan palabras que hayan caído en bordes exactos
    ids_procesadas = set(id(p) for p in palabras_ordenadas)
    sobrantes = [p for p in palabras_raw if id(p) not in ids_procesadas]
    if sobrantes:
        palabras_ordenadas.extend(ordenar_palabras_por_lineas_top_down(sobrantes))

    return palabras_ordenadas



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


def procesar_oraciones_de_palabras(palabras, dict_activo, filtros_externos=None, estructura_ia=None):
    import statistics

    palabras = _pretokenizar_palabras(palabras)
    oraciones = []
    texto_acumulado = []
    rects_acumulados = []
    palabras_objetos = []
    parentesis_abiertos = 0

    # Mapa de cajas estructurales (DocLayout-YOLO: titulo / subtitulo / parrafo)
    mapa_cajas_ia = None
    if estructura_ia and palabras:
        mapa_cajas_ia = []
        for p_item in palabras:
            cx = (p_item[0] + p_item[2]) * 0.5
            cy = (p_item[1] + p_item[3]) * 0.5
            idx_caja = -1
            for idx_b, b_ia in enumerate(estructura_ia):
                if b_ia["x1"] <= cx <= b_ia["x2"] and b_ia["y1"] <= cy <= b_ia["y2"]:
                    idx_caja = idx_b
                    break
            mapa_cajas_ia.append(idx_caja)

    # Geometría adaptativa local (sin margen_izquierdo global ni umbral fijo 8.5)
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

    # Priorizamos filtros directos sobre lectura de disco para velocidad
    if filtros_externos:
        omitir_sup = filtros_externos.get('chk-superindices', filtros_externos.get('omitirSuperindices', filtros_externos.get('chk-referencias', True)))
        omitir_sub = filtros_externos.get('chk-subindices', filtros_externos.get('omitirSubindices', False))
        usar_bloques = filtros_externos.get('usarBloquesNativos', True)
        umbral_mult = float(filtros_externos.get('sensibilidadSalto', 0.5))
        usar_sangria = filtros_externos.get('detectarSangria', True)
    else:
        ajustes = cargar_ajustes_lectura()
        omitir_sup = ajustes.get('omitirSuperindices', ajustes.get('omitirReferencias', True))
        omitir_sub = ajustes.get('omitirSubindices', False)
        usar_bloques = ajustes.get('usarBloquesNativos', True)
        umbral_mult = float(ajustes.get('sensibilidadSalto', 0.5))
        usar_sangria = ajustes.get('detectarSangria', True)

    patron_lista_vineta = re.compile(r'^(?:[•\-–—*▪►]|\d+[.)]|[a-zA-Z][.)])')
    patron_cierre = re.compile(r'(?:[.?!][)\]"\'”’»]?|[)\]"\'”’»][.?!])$')
    patron_letra = re.compile(r'[a-zA-ZÁÉÍÓÚáéíóúñÑüÜ]')
    siglas_protegidas = {'dr.', 'dra.', 'sr.', 'sra.', 'prof.', 'fig.', 'figs.', 'vs.', 'et.', 'al.', 'e.g.', 'i.e.', 'p.', 'pp.', 'vol.', 'no.'}
    margen_base_columna = min_x0_col
    inicio_linea_x0 = palabras[0][0] if palabras else 0.0
    inicio_linea_txt = palabras[0][4] if palabras else ""
    inicio_linea_alto = (palabras[0][3] - palabras[0][1]) if palabras else altura_moda

    def _es_abreviatura(token):
        tok = re.sub(r'[*_]', '', (token or '')).lower().strip()
        if not patron_letra.search(tok):
            return False
        ultima = tok.split()[-1] if tok.split() else tok
        if ultima in siglas_protegidas or tok in siglas_protegidas:
            return True
        if re.match(r'^(?:[a-záéíóúñ]\.){2,}$', ultima, re.IGNORECASE):
            return True
        if re.search(r'\d+[.)]', ultima):
            return False
        return len(ultima.replace('.', '')) <= 2 and ultima.endswith('.')

    def _tipo(idx):
        if 0 <= idx < len(palabras):
            q = palabras[idx]
            return q[8] if len(q) > 8 else None
        return None

    for i, p in enumerate(palabras):
        x0, y0, x1, y1, txt = p[0], p[1], p[2], p[3], p[4]
        altura_palabra = y1 - y0
        tipo_script = p[8] if len(p) > 8 else None
        token_omitido = False
        cierre_por_sup = False

        # --- PROCESAMIENTO DE SUPERÍNDICES Y SUBÍNDICES ---
        if omitir_sup:
            if tipo_script == 'sup':
                token_omitido = True
                if re.search(r'[.?!]', txt) and texto_acumulado:
                    if not texto_acumulado[-1].endswith(('.', '?', '!')):
                        texto_acumulado[-1] += '.'
                    cierre_por_sup = True
            elif txt.strip() in {',', '-', '–', '—'} and _tipo(i - 1) == 'sup' and _tipo(i + 1) == 'sup':
                continue
            else:
                txt_sin_sup = re.sub(r'[⁰¹²³⁴⁵⁶⁷⁸⁹]+', '', txt)
                if txt_sin_sup != txt:
                    if not txt_sin_sup.strip():
                        token_omitido = True
                        if re.search(r'[.?!]', txt) and texto_acumulado:
                            if not texto_acumulado[-1].endswith(('.', '?', '!')):
                                texto_acumulado[-1] += '.'
                            cierre_por_sup = True
                    else:
                        txt = txt_sin_sup

        if not token_omitido and omitir_sub:
            if tipo_script == 'sub':
                continue
            txt_sin_sub = re.sub(r'[₀₁₂₃₄₅₆₇₈₉]+', '', txt)
            if txt_sin_sub != txt:
                if not txt_sin_sub.strip():
                    continue
                txt = txt_sin_sub

        if token_omitido and not cierre_por_sup:
            continue

        es_solo_puntuacion = not patron_letra.search(txt) and not re.search(r'\d', txt)

        if not token_omitido:
            # Monitor de paréntesis
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

        # --- LÓGICA DE SEGMENTACIÓN HÍBRIDA ROBUSTA ---
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
        es_salto = False
        es_titulo_aislado = False
        sig_inicia_coma = False

        if i + 1 < len(palabras):
            siguiente_txt = palabras[i + 1][4]
            siguiente_x0 = palabras[i + 1][0]
            siguiente_y0 = palabras[i + 1][1]
            siguiente_y1 = palabras[i + 1][3]

            if termina_suspensivos:
                es_final = bool(re.match(r'^[A-ZÁÉÍÓÚÜÑ¿¡«(]', siguiente_txt))
            elif termina_punto_dentro_paren and re.match(r'^[a-záéíóúüñ]', siguiente_txt):
                es_final = False
            elif es_final and not termina_dos_puntos and re.match(r'^[a-záéíóúüñ]', siguiente_txt):
                es_final = False
            sig_inicia_coma = bool(re.match(r'^[,;]', siguiente_txt))

            altura_referencia = max(altura_palabra, siguiente_y1 - siguiente_y0, 8.0)
            brecha_vertical = siguiente_y0 - y1
            es_nueva_linea = (siguiente_y0 - y0) > (altura_referencia * 0.45)

            if es_nueva_linea and len(texto_acumulado) <= 8 and not termina_dos_puntos and not es_final:
                frase_acumulada_temp = " ".join(texto_acumulado).strip()
                letras = re.sub(r'[^a-zA-ZáéíóúñÁÉÍÓÚÑ]', '', frase_acumulada_temp)
                es_mayus = bool(letras and len(letras) >= 4 and letras.isupper())
                es_titulo_solitario = bool(
                    (len(texto_acumulado) <= 3 and (brecha_vertical >= (altura_referencia * 0.4) or altura_palabra >= (altura_moda * 1.15)))
                    or (len(texto_acumulado) <= 8 and brecha_vertical >= (altura_referencia * 0.55) and bool(re.match(r'^[A-ZÁÉÍÓÚÑ]', texto_acumulado[0])))
                )
                if es_mayus or es_titulo_solitario:
                    es_titulo_aislado = True

            # Sangría híbrida adaptativa con candados (viñeta / letra capital)
            diff_margen = siguiente_x0 - margen_base_columna
            es_lista_actual = bool(patron_lista_vineta.match(inicio_linea_txt.strip()))
            es_letra_capital = inicio_linea_alto > (1.8 * altura_moda)
            tiene_sangria_sig = (
                (1.5 * w_char) <= diff_margen <= (0.22 * ancho_columna_local)
                and (siguiente_x0 > inicio_linea_x0 + 1.0 * w_char or es_final)
                and not es_lista_actual
                and not es_letra_capital
            )

            if es_nueva_linea and tiene_sangria_sig and es_final:
                es_salto = True

            sig_empieza_mayus = bool(re.match(r'^[A-ZÁÉÍÓÚÑ]', siguiente_txt))
            if es_final and sig_empieza_mayus:
                parentesis_abiertos = 0

            if mapa_cajas_ia is not None and (mapa_cajas_ia[i] != mapa_cajas_ia[i + 1]) and (mapa_cajas_ia[i] != -1 or mapa_cajas_ia[i + 1] != -1):
                es_salto = True

            salto_vertical_adaptativo = brecha_vertical > (dy_modal * (1.35 + umbral_mult))

            if usar_bloques:
                bloque_actual = p[5] if len(p) > 5 else 0
                siguiente_bloque = palabras[i + 1][5] if len(palabras[i + 1]) > 5 else 0
                if siguiente_bloque != bloque_actual:
                    if es_final or es_titulo_aislado or salto_vertical_adaptativo:
                        es_salto = True
            else:
                if es_nueva_linea:
                    if salto_vertical_adaptativo or es_titulo_aislado:
                        es_salto = True
                    elif usar_sangria and tiene_sangria_sig:
                        if es_final or brecha_vertical > (dy_modal * 0.6):
                            es_salto = True

            if es_nueva_linea:
                inicio_linea_x0 = siguiente_x0
                inicio_linea_txt = siguiente_txt
                inicio_linea_alto = siguiente_y1 - siguiente_y0

        # Siglas y abreviaturas comunes protegidas (exige al menos una letra)
        es_abreviatura = _es_abreviatura(token_eval)

        esperar = (parentesis_abiertos > 0) or es_abreviatura or sig_inicia_coma
        
        # Cortar si termina en punto legítimo, o si es un salto de párrafo real, o un título aislado
        cortar_ahora = (es_final and not esperar) or (es_salto and not esperar) or es_titulo_aislado

        if cortar_ahora:
            frase_raw = " ".join(texto_acumulado).strip()
            if frase_raw:
                # Usamos aplicar_reemplazos del Bloque 1
                pack = aplicar_reemplazos(frase_raw, dict_activo, filtros_externos)
                if isinstance(pack, tuple): frase_final = pack[0]
                else: frase_final = pack

                if frase_final and len(frase_final) > 1:
                    cajas = fusionar_rectangulos(rects_acumulados)
                    oraciones.append({
                        "texto": frase_final, 
                        "rects": cajas, 
                        "palabras": palabras_objetos
                    })
            
            texto_acumulado, rects_acumulados, palabras_objetos = [], [], []
            parentesis_abiertos = 0

    # Remanente
    if texto_acumulado:
        frase_raw = " ".join(texto_acumulado).strip()
        pack = aplicar_reemplazos(frase_raw, dict_activo, filtros_externos)
        frase_final = pack[0] if isinstance(pack, tuple) else pack
        if frase_final:
            cajas = fusionar_rectangulos(rects_acumulados) if rects_acumulados else []
            oraciones.append({
                "texto": frase_final, 
                "rects": cajas, 
                "palabras": palabras_objetos
            })
            
    return oraciones

@eel.expose
def reaplicar_filtros_desde_snapshot(dict_activo, filtros=None, resegmentar=False):
    if not estado_app.snapshot_oraciones_raw: return None
    
    # Handshake de filtros
    if filtros is None:
        ajustes = cargar_ajustes_lectura()
        filtros = {
            'chk-urls': ajustes.get('omitirUrls', False),
            'chk-paren': ajustes.get('omitirParen', False),
            'chk-corch': ajustes.get('omitirCorch', False),
            'chk-llaves': ajustes.get('omitirLlaves', False),
            'chk-referencias': ajustes.get('omitirReferencias', True),
            'usarBloquesNativos': ajustes.get('usarBloquesNativos', True),
            'sensibilidadSalto': float(ajustes.get('sensibilidadSalto', 0.5)),
            'detectarSangria': ajustes.get('detectarSangria', True)
        }

    # RE-ENSAMBLAJE (Segmentación en vivo)
    if resegmentar and estado_app.snapshot_palabras_raw:
        pagina = estado_app.doc[estado_app.pagina_actual_global] if estado_app.doc else None
        _doc_key = (getattr(estado_app.doc, "name", "") if estado_app.doc else "") or "doc"
        _est_ia = estado_app.cache_estructura_layout.get((_doc_key, int(estado_app.pagina_actual_global)))
        if pagina and (estado_app.snapshot_cortes_v or estado_app.snapshot_limites_h):
            palabras_organizadas = organizar_palabras_con_cortes_y_limites(
                estado_app.snapshot_palabras_raw, estado_app.snapshot_cortes_v, estado_app.snapshot_limites_h, pagina.rect.width, pagina.rect.height
            )
            estado_app.snapshot_oraciones_raw = procesar_oraciones_de_palabras(palabras_organizadas, dict_activo, filtros, estructura_ia=_est_ia)
        else:
            estado_app.snapshot_oraciones_raw = procesar_oraciones_de_palabras(estado_app.snapshot_palabras_raw, dict_activo, filtros, estructura_ia=_est_ia)

    nuevas_oraciones = []

    for oracion in estado_app.snapshot_oraciones_raw:
        palabras_limpias = [p_obj['texto'] for p_obj in oracion['palabras']]
        texto_reconstruido = " ".join(palabras_limpias).strip()
        
        # Aplicamos reemplazos globales
        pack = aplicar_reemplazos(texto_reconstruido, dict_activo, filtros)
        texto_filtrado = pack[0] if isinstance(pack, tuple) else pack
        
        nuevas_oraciones.append({
            "texto": texto_filtrado,
            "rects": oracion['rects'],
            "palabras": oracion['palabras']
        })
    
    return nuevas_oraciones

