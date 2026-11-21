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
    
    # 4. PROCESAMIENTO DE REFERENCIAS
    if filtros.get('chk-referencias'):
        texto = re.sub(r'[⁰¹²³⁴⁵⁶⁷⁸⁹]', '', texto)
        texto = re.sub(r'\[\d{1,3}\]', '', texto)
        texto = re.sub(r'([a-zA-Záéíóúñ])\d{1,3}([.,;:?\s]|$)', r'\1\2', texto)

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
        
        # Buscar si pertenece a alguna línea ya abierta
        asignado = False
        for linea in lineas:
            # Calcular la cota vertical promedio de la línea
            y_min_linea = min(item[1] for item in linea)
            y_max_linea = max(item[3] for item in linea)
            centro_linea = (y_min_linea + y_max_linea) / 2.0
            altura_promedio = max(1.0, (y_max_linea - y_min_linea))
            
            # Tolerancia: el centroide cae dentro del rango o a menos del 55% de la altura
            tolerancia = max(altura_p, altura_promedio) * 0.55
            if abs(centro_y - centro_linea) <= tolerancia:
                linea.append(p)
                asignado = True
                break
        
        if not asignado:
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



def procesar_oraciones_de_palabras(palabras, dict_activo, filtros_externos=None, estructura_ia=None):
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
    
    # Calcular el margen izquierdo de la página para el detector de sangría
    margen_izquierdo = min([p[0] for p in palabras]) if palabras else 0
    
    # Calcular la altura modal (Size_body) para comparar títulos de forma robusta
    alturas_muestras = [round(p[3] - p[1], 1) for p in palabras] if palabras else []
    altura_moda = max(set(alturas_muestras), key=alturas_muestras.count) if alturas_muestras else 10.0
    
    # Priorizamos filtros directos sobre lectura de disco para velocidad
    if filtros_externos:
        omitir_ref = filtros_externos.get('chk-referencias', True)
        usar_bloques = filtros_externos.get('usarBloquesNativos', True)
        umbral_mult = float(filtros_externos.get('sensibilidadSalto', 0.5))
        usar_sangria = filtros_externos.get('detectarSangria', True)
    else:
        ajustes = cargar_ajustes_lectura() # Usa la versión blindada del Bloque 1
        omitir_ref = ajustes.get('omitirReferencias', True)
        usar_bloques = ajustes.get('usarBloquesNativos', True)
        umbral_mult = float(ajustes.get('sensibilidadSalto', 0.5))
        usar_sangria = ajustes.get('detectarSangria', True)


    for i, p in enumerate(palabras):
        x0, y0, x1, y1, txt = p[0], p[1], p[2], p[3], p[4]
        altura_palabra = y1 - y0
        
        # --- PROCESAMIENTO DE REFERENCIAS ---
        if omitir_ref:
            es_superindice = False
            # A. Detección por altura relativa (Baseline)
            if i > 0:
                prev_y0, prev_y1 = palabras[i-1][1], palabras[i-1][3]
                punto_medio_prev = prev_y0 + ((prev_y1 - prev_y0) / 2)
                if y1 < punto_medio_prev: es_superindice = True

            # B. Números pegados (Ej: glucosa2 o phase.2)
            match_pegado = re.search(r'([a-zA-Záéíóúñ][.,]?)(\d{1,3})([.,]?)$', txt)
            if match_pegado and altura_palabra < 10:
                txt = txt.replace(match_pegado.group(2), "")

            # C. Filtro de omisión (Números flotantes pequeños / superíndices)
            txt_limpio = txt.strip().replace(',', '').replace('.', '')
            if (es_superindice or (altura_palabra < 8.5)) and txt_limpio.isdigit() and len(txt_limpio) <= 3:
                # Si el superíndice traía un punto (ej: ".2" o "2."), preservamos el punto en el texto acumulado
                if '.' in txt and texto_acumulado and not texto_acumulado[-1].endswith('.'):
                    texto_acumulado[-1] += '.'
                continue

        # Monitor de paréntesis
        parentesis_abiertos += (txt.count('(') + txt.count('['))
        parentesis_abiertos -= (txt.count(')') + txt.count(']'))
        if parentesis_abiertos < 0:
            parentesis_abiertos = 0
        
        texto_acumulado.append(txt)
        rects_acumulados.append([x0, y0, x1, y1])
        palabras_objetos.append({"texto": txt, "bbox": [int(x0), int(y0), int(x1), int(y1)]})
        
        # --- LÓGICA DE SEGMENTACIÓN HÍBRIDA ROBUSTA (DLA Coalescence V2 Blindada) ---
        # Detectar puntuación final incluso si viene pegada a paréntesis/corchetes, ej: "(2).", "[12].", "paciente."
        es_final = bool(re.search(r'[.?!:;][)\]"\'”’]?$', txt))
        es_salto = False
        es_titulo_aislado = False
        
        if i + 1 < len(palabras):
            siguiente_txt = palabras[i+1][4]
            siguiente_x0 = palabras[i+1][0]
            siguiente_y0 = palabras[i+1][1]
            siguiente_y1 = palabras[i+1][3]
            
            # Altura efectiva de la línea
            altura_referencia = max(altura_palabra, siguiente_y1 - siguiente_y0, 8.0)
            brecha_vertical = siguiente_y0 - y1
            es_nueva_linea = (siguiente_y0 - y0) > (altura_referencia * 0.45)
            
            # Regla 1: Encabezado/Título aislado (ej: "Introduction", "Abstract", "INTRODUCCIÓN", "Resumen")
            # Si hay cambio de línea y lo acumulado tiene 1 a 3 palabras y está solo en su línea
            if es_nueva_linea and len(texto_acumulado) <= 3:
                frase_acumulada_temp = " ".join(texto_acumulado).strip()
                letras = re.sub(r'[^a-zA-ZáéíóúñÁÉÍÓÚÑ]', '', frase_acumulada_temp)
                
                # A: Mayúsculas (ej: "INTRODUCCIÓN")
                es_mayus = bool(letras and len(letras) >= 4 and letras.isupper())
                # B: Título en renglón solitario con salto visual apreciable o fuente mayor
                es_titulo_solitario = bool(brecha_vertical >= (altura_referencia * 0.4) or altura_palabra >= (altura_moda * 1.15))
                
                if es_mayus or es_titulo_solitario:
                    es_titulo_aislado = True
            
            # Regla 2: Sangría de nuevo párrafo
            # Si la siguiente línea tiene un sangrado evidente a la derecha de la columna
            # y la línea actual ya terminó con punto o cita (ej: "...fast phase.²")
            tiene_sangria_sig = siguiente_x0 > (margen_izquierdo + (altura_referencia * 1.4))
            if es_nueva_linea and tiene_sangria_sig and es_final:
                es_salto = True
            
            # Si la siguiente palabra empieza con Mayúscula y la actual termina con punto real,
            # el punto es concluyente y forzamos reinicio de paréntesis
            sig_empieza_mayus = bool(re.match(r'^[A-ZÁÉÍÓÚÑ]', siguiente_txt))
            if es_final and sig_empieza_mayus:
                parentesis_abiertos = 0
            
            if mapa_cajas_ia is not None and (mapa_cajas_ia[i] != mapa_cajas_ia[i+1]) and (mapa_cajas_ia[i] != -1 or mapa_cajas_ia[i+1] != -1):
                es_salto = True

            if usar_bloques:
                # LÓGICA AUTOMÁTICA BLINDADA:
                bloque_actual = p[5] if len(p) > 5 else 0
                siguiente_bloque = palabras[i+1][5] if len(palabras[i+1]) > 5 else 0
                
                if siguiente_bloque != bloque_actual:
                    if es_final or es_titulo_aislado or brecha_vertical > (altura_referencia * 1.3):
                        es_salto = True
            else:
                # LÓGICA MANUAL (GEOMÉTRICA)
                if es_nueva_linea:
                    if brecha_vertical > (altura_referencia * umbral_mult) or es_titulo_aislado: 
                        es_salto = True
                    elif usar_sangria and tiene_sangria_sig:
                        if es_final or brecha_vertical > (altura_referencia * 0.6):
                            es_salto = True

        # Siglas y abreviaturas comunes protegidas (para no cortar en "Dr.", "Fig.", "et al.", "vs.")
        siglas_protegidas = {'dr.', 'dra.', 'sr.', 'sra.', 'prof.', 'fig.', 'figs.', 'vs.', 'et.', 'al.', 'e.g.', 'i.e.', 'p.', 'pp.', 'vol.', 'no.'}
        txt_lower = txt.lower().strip()
        es_abreviatura = txt_lower in siglas_protegidas or (len(txt.replace('.', '')) <= 2 and not bool(re.search(r'\d+[.)]', txt)))
        
        esperar = (parentesis_abiertos > 0) or es_abreviatura
        
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
        if pagina and (estado_app.snapshot_cortes_v or estado_app.snapshot_limites_h):
            palabras_organizadas = organizar_palabras_con_cortes_y_limites(
                estado_app.snapshot_palabras_raw, estado_app.snapshot_cortes_v, estado_app.snapshot_limites_h, pagina.rect.width, pagina.rect.height
            )
            estado_app.snapshot_oraciones_raw = procesar_oraciones_de_palabras(palabras_organizadas, dict_activo, filtros)
        else:
            estado_app.snapshot_oraciones_raw = procesar_oraciones_de_palabras(estado_app.snapshot_palabras_raw, dict_activo, filtros)

    omitir_ref = filtros.get('chk-referencias', True)
    nuevas_oraciones = []
    
    for oracion in estado_app.snapshot_oraciones_raw:
        palabras_limpias = []
        for p_obj in oracion['palabras']:
            txt_p = p_obj['texto']
            if omitir_ref:
                match = re.search(r'([a-zA-Záéíóúñ])(\d{1,3})([.,]?)$', txt_p)
                if match: txt_p = txt_p.replace(match.group(2), "")
            palabras_limpias.append(txt_p)

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

