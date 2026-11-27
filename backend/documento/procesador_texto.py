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
from backend.documento.procesador_columnas import (
    fusionar_rectangulos,
    _buscar_linea_mas_cercana,
    ordenar_palabras_por_lineas_top_down,
    normalizar_corte_v,
    _ordenar_franja_horizontal,
    _filtrar_palabras_sobrantes_por_limites,
    _calcular_puntos_division_vertical,
    organizar_palabras_con_cortes_y_limites,
)
from backend.documento.procesador_segmentacion import (
    _SIGLAS_PROTEGIDAS,
    _pretokenizar_palabras,
    _es_titulo_aislado_linea,
    _detectar_senales_salto_editorial,
    _cambio_bloque_nativo_fuerza_salto,
    _evaluar_salto_por_bloque_o_linea,
    _evaluar_transicion_siguiente_palabra,
    _calcular_geometria_local_palabras,
    _filtrar_token_script,
    _es_abreviatura_protegida,
    _acumular_token_y_senales_cierre,
)


IDIOMAS_NO_LATINOS = {
    'zh', 'ja', 'ko', 'hi', 'bn', 'ar', 'ru', 'uk',
    'th', 'vi', 'he', 'el', 'ta', 'te', 'mr', 'ur', 'fa',
}


@eel.expose
def _obtener_reparto_teatro_activo(obra_actual):
    """Combina el reparto activo de teatro.json (para obra_actual) y de libros_reglas.json (si aplica)."""
    db = cargar_diccionario_teatro()
    fuentes = [db.get(obra_actual, {}) if isinstance(db, dict) else {}]
    if estado_app.doc and getattr(estado_app.doc, "name", None):
        reg_lib = cargar_reglas_libro(os.path.basename(estado_app.doc.name))
        fuentes.append(reg_lib.get("teatro", {}) if isinstance(reg_lib, dict) else {})

    reparto = {}
    for bloque in fuentes:
        if isinstance(bloque, dict) and bloque.get("active", True):
            reparto.update(bloque.get("actors", {}))
    return reparto


def _aplicar_teatro_a_texto(texto, obra_actual):
    """Detecta un pie de personaje en Modo Teatro (teatro.json + libros_reglas.json) y devuelve (texto, voz)."""
    voz_detectada = None
    try:
        reparto = _obtener_reparto_teatro_activo(obra_actual)
        for actor_key, data in reparto.items():
            if not data.get("on", True):
                continue

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
    return texto, voz_detectada


def _combinar_diccionario_libro(diccionario_activo):
    """Combina diccionario_activo con las reglas exclusivas del libro activo si existen."""
    if not isinstance(diccionario_activo, dict) or not diccionario_activo:
        return {}
    dicc = {k: v for k, v in diccionario_activo.items() if k != "📖 Este Libro"}
    try:
        if estado_app.doc and getattr(estado_app.doc, "name", None):
            _reglas_lib = cargar_reglas_libro(os.path.basename(estado_app.doc.name))
            _dict_lib = _reglas_lib.get("diccionario", {}) if isinstance(_reglas_lib, dict) else {}
            if isinstance(_dict_lib, dict) and _dict_lib and _dict_lib.get("active", True):
                dicc = {**dicc, "__ESTE_LIBRO__": _dict_lib}
    except Exception:
        pass
    return dicc


def _aplicar_filtros_estructurales_texto(texto, filtros):
    """Aplica filtros estructurales (paréntesis, corchetes, llaves, URLs), decimales y super/subíndices."""
    if filtros.get('chk-paren'):
        texto = re.sub(r'\(.*?\)', '', texto)
    if filtros.get('chk-corch'):
        texto = re.sub(r'\[.*?\]', '', texto)
    if filtros.get('chk-llaves'):
        texto = re.sub(r'\{.*?\}', '', texto)
    if filtros.get('chk-urls'):
        patron_web = r'https?://\S+|www\.\S+|\b\w+\.(?:com|org|net|edu|gov|mx)\b'
        texto = re.sub(patron_web, '', texto)

    # Protección decimal (36.5 -> 36 punto 5)
    texto = re.sub(r'(\d)\.(\d)', r'\1 punto \2', texto)

    # Procesamiento de superíndices y subíndices (sin borrado ciego de CO2, SpO2, B12, T4)
    omitir_sup = filtros.get('chk-superindices', filtros.get('omitirSuperindices', filtros.get('chk-referencias', True)))
    omitir_sub = filtros.get('chk-subindices', filtros.get('omitirSubindices', False))
    if omitir_sup:
        texto = re.sub(r'[⁰¹²³⁴⁵⁶⁷⁸⁹]', '', texto)
        texto = re.sub(r'\[\d{1,3}\]', '', texto)
    if omitir_sub:
        texto = re.sub(r'[₀₁₂₃₄₅₆₇₈₉]', '', texto)
    return texto


def aplicar_reemplazos(texto, diccionario_activo, filtros=None, modo_teatro=False, obra_actual="General", idioma_filtro=""):
    # 🛡️ BLINDAJE DE TIPO Y REGLAS EXCLUSIVAS DEL LIBRO ACTIVO (libros_reglas.json)
    diccionario_activo = _combinar_diccionario_libro(diccionario_activo)

    # 🛡️ BLINDAJE DE TEXTO
    if isinstance(texto, list):
        try: texto = " ".join([str(p.get('texto', p)) if isinstance(p, dict) else str(p) for p in texto])
        except Exception: texto = str(texto)
    
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
        texto, voz_detectada = _aplicar_teatro_a_texto(texto, obra_actual)

    original = texto

    # ✂️ FILTROS ESTRUCTURALES, PROTECCIÓN DECIMAL Y SUPER/SUBÍNDICES
    texto = _aplicar_filtros_estructurales_texto(texto, filtros)

    # 📚 DICCIONARIO DE ABREVIATURAS
    if diccionario_activo:
        for pat, significado in _compilar_patrones_abreviaturas(diccionario_activo):
            texto = pat.sub(f" {significado} ", texto)

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

def _compilar_patrones_abreviaturas(dict_activo):
    """Compila los patrones regex activos del diccionario de abreviaturas ordenados por longitud."""
    if not isinstance(dict_activo, dict):
        return []
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
    return patrones


def mapear_expansion_palabras_n_a_1(palabras_visuales, dict_activo):
    """
    Toma la lista de palabras visuales originales del PDF (o texto de entrada)
    y para cada token visual genera su expansión por abreviaturas manteniendo su vIdx.
    Retorna: lista de diccionarios con { 'vIdx', 'w_orig', 'frags', 'pesos_frags', 'peso_total' }
    """
    patrones = _compilar_patrones_abreviaturas(dict_activo)
            
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


def _cargar_actores_teatro_normalizados(obra_actual_seg):
    """Carga y normaliza el conjunto de nombres de actores activos para la obra y el libro actual."""
    actores_teatro_norm = set()
    try:
        reparto_seg = _obtener_reparto_teatro_activo(obra_actual_seg)
        for a_k, a_v in reparto_seg.items():
            if isinstance(a_v, dict) and a_v.get("on", True):
                actores_teatro_norm.add(a_k.rstrip(":").strip().lower())
    except Exception:
        pass
    return actores_teatro_norm


def _cargar_config_y_actores_segmentacion(filtros_externos):
    """Carga preferencias de segmentación y normaliza el reparto de actores si el modo teatro está activo."""
    if filtros_externos:
        omitir_sup = filtros_externos.get('chk-superindices', filtros_externos.get('omitirSuperindices', filtros_externos.get('chk-referencias', True)))
        omitir_sub = filtros_externos.get('chk-subindices', filtros_externos.get('omitirSubindices', False))
        usar_bloques = filtros_externos.get('usarBloquesNativos', True)
        umbral_mult = float(filtros_externos.get('sensibilidadSalto', 0.5))
        usar_sangria = filtros_externos.get('detectarSangria', True)
        modo_teatro_seg = bool(filtros_externos.get('modo_teatro', False))
        obra_actual_seg = str(filtros_externos.get('obra_actual', 'General') or 'General')
    else:
        ajustes = cargar_ajustes_lectura()
        omitir_sup = ajustes.get('omitirSuperindices', ajustes.get('omitirReferencias', True))
        omitir_sub = ajustes.get('omitirSubindices', False)
        usar_bloques = ajustes.get('usarBloquesNativos', True)
        umbral_mult = float(ajustes.get('sensibilidadSalto', 0.5))
        usar_sangria = ajustes.get('detectarSangria', True)
        modo_teatro_seg = bool(ajustes.get('teatro_activo', False))
        obra_actual_seg = str(ajustes.get('obra_actual', 'General') or 'General')

    actores_teatro_norm = _cargar_actores_teatro_normalizados(obra_actual_seg) if modo_teatro_seg else set()

    return (
        omitir_sup,
        omitir_sub,
        usar_bloques,
        umbral_mult,
        usar_sangria,
        modo_teatro_seg,
        actores_teatro_norm,
    )


def _preparar_contexto_segmentacion(palabras, filtros_externos, estructura_ia):
    """Construye geometría adaptativa local, mapa de cajas IA y configuración de segmentación."""
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

    geom_transicion = _calcular_geometria_local_palabras(palabras)

    (
        omitir_sup,
        omitir_sub,
        usar_bloques,
        umbral_mult,
        usar_sangria,
        modo_teatro_seg,
        actores_teatro_norm,
    ) = _cargar_config_y_actores_segmentacion(filtros_externos)

    cfg_transicion = {
        "patron_lista_vineta": re.compile(r'^(?:[•\-–—*▪►]|\d+[.)]|[a-zA-Z][.)])'),
        "mapa_cajas_ia": mapa_cajas_ia,
        "modo_teatro_seg": modo_teatro_seg,
        "actores_teatro_norm": actores_teatro_norm,
        "umbral_mult": umbral_mult,
        "usar_bloques": usar_bloques,
        "usar_sangria": usar_sangria,
    }
    return geom_transicion, cfg_transicion, omitir_sup, omitir_sub


def _emitir_oracion_acumulada(
    oraciones,
    texto_acumulado,
    rects_acumulados,
    palabras_objetos,
    dict_activo,
    filtros_externos,
    longitud_min=1,
):
    """Aplica reemplazos al texto acumulado y agrega la oración a `oraciones` si supera `longitud_min`."""
    frase_raw = " ".join(texto_acumulado).strip()
    if not frase_raw:
        return
    pack = aplicar_reemplazos(frase_raw, dict_activo, filtros_externos)
    frase_final = pack[0] if isinstance(pack, tuple) else pack
    if frase_final and len(frase_final) >= longitud_min:
        cajas = fusionar_rectangulos(rects_acumulados) if rects_acumulados else []
        oraciones.append({
            "texto": frase_final,
            "rects": cajas,
            "palabras": palabras_objetos,
        })


def procesar_oraciones_de_palabras(palabras, dict_activo, filtros_externos=None, estructura_ia=None):
    palabras = _pretokenizar_palabras(palabras)
    oraciones = []
    texto_acumulado = []
    rects_acumulados = []
    palabras_objetos = []
    parentesis_abiertos = 0

    geom_transicion, cfg_transicion, omitir_sup, omitir_sub = _preparar_contexto_segmentacion(
        palabras, filtros_externos, estructura_ia
    )
    altura_moda = geom_transicion["altura_moda"]

    patron_cierre = re.compile(r'(?:[.?!][)\]"\'”’»]?|[)\]"\'”’»][.?!])$')
    patron_letra = re.compile(r'[a-zA-ZÁÉÍÓÚáéíóúñÑüÜ]')
    inicio_linea_x0 = palabras[0][0] if palabras else 0.0
    inicio_linea_txt = palabras[0][4] if palabras else ""
    inicio_linea_alto = (palabras[0][3] - palabras[0][1]) if palabras else altura_moda

    for i, p in enumerate(palabras):
        x0, y0, x1, y1, txt = p[0], p[1], p[2], p[3], p[4]
        altura_palabra = y1 - y0
        tipo_script = p[8] if len(p) > 8 else None

        # --- PROCESAMIENTO DE SUPERÍNDICES Y SUBÍNDICES ---
        txt, token_omitido, cierre_por_sup, saltar = _filtrar_token_script(
            txt, tipo_script, i, palabras, omitir_sup, omitir_sub, texto_acumulado
        )
        if saltar:
            continue

        (
            parentesis_abiertos,
            token_eval,
            es_final,
            termina_suspensivos,
            termina_punto_dentro_paren,
            termina_dos_puntos,
        ) = _acumular_token_y_senales_cierre(
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
        )
        es_salto = False
        es_titulo_aislado = False
        sig_inicia_coma = False

        if i + 1 < len(palabras):
            (
                es_final,
                es_salto,
                es_titulo_aislado,
                sig_inicia_coma,
                parentesis_abiertos,
                inicio_linea_x0,
                inicio_linea_txt,
                inicio_linea_alto,
            ) = _evaluar_transicion_siguiente_palabra(
                i,
                p,
                palabras[i + 1],
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
                geom_transicion,
                cfg_transicion,
            )

        # Siglas y abreviaturas comunes protegidas (exige al menos una letra)
        es_abreviatura = _es_abreviatura_protegida(token_eval, patron_letra)

        esperar = (parentesis_abiertos > 0) or es_abreviatura or sig_inicia_coma

        # Cortar si termina en punto legítimo, o si es un salto de párrafo real, o un título aislado
        cortar_ahora = ((es_final or es_salto) and not esperar) or es_titulo_aislado

        if cortar_ahora:
            _emitir_oracion_acumulada(
                oraciones,
                texto_acumulado,
                rects_acumulados,
                palabras_objetos,
                dict_activo,
                filtros_externos,
                longitud_min=2,
            )
            texto_acumulado, rects_acumulados, palabras_objetos = [], [], []
            parentesis_abiertos = 0

    # Remanente
    if texto_acumulado:
        _emitir_oracion_acumulada(
            oraciones,
            texto_acumulado,
            rects_acumulados,
            palabras_objetos,
            dict_activo,
            filtros_externos,
            longitud_min=1,
        )

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

