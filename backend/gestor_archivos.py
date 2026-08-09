# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import os
import sys
import json
import eel
"""
Gestor de Archivos y Persistencia
Maneja la lectura y escritura de todas las preferencias y configuraciones del usuario.
"""
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_FILE = os.path.join(BASE_DIR, "abreviaturas.json")
ARCHIVO_ATAJOS = os.path.join(BASE_DIR, "atajos.json")
ARCHIVO_BIBLIOTECA = os.path.join(BASE_DIR, "biblioteca.json")
ARCHIVO_FAVORITOS = os.path.join(BASE_DIR, "favoritos.json")
ARCHIVO_CONFIG_VOZ = os.path.join(BASE_DIR, "voz_default.json")
ARCHIVO_AJUSTES_LECTURA = os.path.join(BASE_DIR, "ajustes_lectura.json")
TEATRO_JSON = os.path.join(BASE_DIR, "teatro.json")
def validar_json(ruta, default_tipo=dict):
    """Lee JSON. Si está corrupto (string/basura), lo resetea a vacío."""
    val_inicial = {} if default_tipo == dict else []
    if not os.path.exists(ruta):
        try:
            with open(ruta, 'w', encoding='utf-8') as f: json.dump(val_inicial, f)
        except: pass
        return val_inicial
    try:
        with open(ruta, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if not isinstance(data, default_tipo):
                return val_inicial
            return data
    except:
        return val_inicial
@eel.expose
def cargar_diccionario():
    return validar_json(DB_FILE)
@eel.expose
def guardar_diccionario(data):
    try:
        import unicodedata
        from itertools import product

        def quitar_acentos(s):
            return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

        def generar_variantes_sigla(sigla_original):
            puntuaciones_finales = {'.', ',', ':', ';', '!', '?'}
            raiz = sigla_original
            while raiz and raiz[-1] in puntuaciones_finales:
                raiz = raiz[:-1]
                
            if not raiz: return {sigla_original}
                
            letras_limpias = raiz.replace('.', '')
            combinaciones_raiz = {raiz}
            
            # Puntos intermedios solo para siglas cortas (solo letras) o que ya tenían puntos
            if 2 <= len(letras_limpias) <= 5 and (letras_limpias.isalpha() or '.' in raiz):
                for prod in product(['', '.'], repeat=len(letras_limpias)-1):
                    var = ""
                    for i, char in enumerate(letras_limpias[:-1]):
                        var += char + prod[i]
                    var += letras_limpias[-1]
                    combinaciones_raiz.add(var)
                    
            variantes_completas = set()
            for c_raiz in combinaciones_raiz:
                variantes_completas.add(c_raiz)
                for p in puntuaciones_finales:
                    variantes_completas.add(c_raiz + p)
                    
            variantes_finales = set()
            for v in variantes_completas:
                variantes_finales.add(v)
                v_sin = quitar_acentos(v)
                if v_sin != v:
                    variantes_finales.add(v_sin)
                    
            return variantes_finales

        for cat_key, categoria in data.items():
            if not isinstance(categoria, dict): continue
            terminos = categoria.get("terms", {})
            
            # Limpiar auto-generados previamente
            terminos_manuales = {}
            for k, v in terminos.items():
                if isinstance(v, dict) and v.get("auto") == True:
                    continue
                terminos_manuales[k] = v
                
            nuevos_terminos = {}
            for sigla, valor in list(terminos_manuales.items()):
                nuevos_terminos[sigla] = valor
                
                def crear_auto(v_orig):
                    if isinstance(v_orig, dict):
                        c = v_orig.copy()
                        c["auto"] = True
                        return c
                    return {"val": v_orig, "on": True, "auto": True}

                variantes = generar_variantes_sigla(sigla)
                for var in variantes:
                    if var != sigla and var not in terminos_manuales:
                        nuevos_terminos[var] = crear_auto(valor)
                        
            categoria["terms"] = nuevos_terminos

        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        return True
    except: return False
@eel.expose
def cargar_atajos_desde_python():
    defaults = {
        "play_pause": " ", "add_limit": "control+ ", "add_abbr": "control+i",
        "speed_up": "arrowup", "speed_down": "arrowdown",
        "prev_page": "arrowleft", "next_page": "arrowright", "open_pdf": "control+o",
        "prev_sentence": "a", "next_sentence": "d", "cycle_voice": "v", "toggle_dicc": "tab"
    }
    datos = validar_json(ARCHIVO_ATAJOS)
    for k, v in defaults.items():
        if k not in datos: datos[k] = v
    return datos
@eel.expose
def guardar_atajos_en_python(atajos):
    try:
        with open(ARCHIVO_ATAJOS, 'w') as f:
            json.dump(atajos, f, indent=4)
        return True
    except: return False
@eel.expose
def cargar_ajustes_lectura():
    defaults = {
        "velocidad": 1.0, "tono": 1.0, "pausa": 300, "volumen": 100,
        "idioma": "Español", "color": "#ffff00", "padKaraoke": 2,
        "colorGuia": "#00b4ff", "padGuia": 2, "llenado": False,
        "margenPDF": 20, "seguirTexto": True,
        "omitirParen": True, "omitirCorch": True, "omitirLlaves": True,
        "omitirUrls": True, "omitirReferencias": True, "alto_rendimiento": False,
        "tema_oscuro": False, "pausa_sistema": False, "ducking_volumen": False,
        "ducking_nivel": 20,
        "traduccion_activa": False,
        "traduccion_origen": "auto",
        "traduccion_destino": "es",
        "traduccion_motor": "online",
        "traduccion_modo": "solo_traduccion",
        "ia_proveedor_activo": "ollama",
        "ia_cloud_keys": {
            "gemini": "",
            "groq": "",
            "openrouter": "",
            "openai": "",
            "deepseek": ""
        },
        "ia_cloud_modelos": {
            "gemini": "gemini-1.5-flash",
            "groq": "llama-3.3-70b-versatile",
            "openrouter": "meta-llama/llama-3.3-70b-instruct:free",
            "openai": "gpt-4o-mini",
            "deepseek": "deepseek-chat"
        }
    }
    datos = validar_json(ARCHIVO_AJUSTES_LECTURA)
    for k, v in defaults.items():
        if k not in datos: datos[k] = v
    return datos
@eel.expose
def guardar_ajustes_lectura(data):
    try:
        previos = validar_json(ARCHIVO_AJUSTES_LECTURA)
        if isinstance(data, dict):
            # Preservar claves de IA previas si en data viene un diccionario pero con claves vacías que antes tenían valor
            if "ia_cloud_keys" in data and isinstance(data["ia_cloud_keys"], dict) and "ia_cloud_keys" in previos and isinstance(previos["ia_cloud_keys"], dict):
                merged_keys = dict(previos["ia_cloud_keys"])
                for k, v in data["ia_cloud_keys"].items():
                    if v and str(v).strip():
                        merged_keys[k] = str(v).strip()
                data["ia_cloud_keys"] = merged_keys

            if "ia_cloud_modelos" in data and isinstance(data["ia_cloud_modelos"], dict) and "ia_cloud_modelos" in previos and isinstance(previos["ia_cloud_modelos"], dict):
                merged_mods = dict(previos["ia_cloud_modelos"])
                for k, v in data["ia_cloud_modelos"].items():
                    if v and str(v).strip() and str(v) != '__custom_model_prompt__':
                        merged_mods[k] = str(v).strip()
                data["ia_cloud_modelos"] = merged_mods

        with open(ARCHIVO_AJUSTES_LECTURA, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"❌ Error al escribir: {e}")
        return False
@eel.expose
def cargar_progreso_libro(ruta):
    datos = validar_json(ARCHIVO_BIBLIOTECA)
    return datos.get(ruta)
@eel.expose
def guardar_progreso_libro(ruta, pag, layout, segmentacion=None):
    try:
        d = validar_json(ARCHIVO_BIBLIOTECA)
        
        # Preservar segmentacion previa si existe y no se envía una nueva
        if not segmentacion and ruta in d and "segmentacion" in d[ruta]:
            segmentacion = d[ruta]["segmentacion"]
            
        d[ruta] = {"ultima_pagina": pag, "layouts": layout}
        if segmentacion:
            d[ruta]["segmentacion"] = segmentacion
        with open(ARCHIVO_BIBLIOTECA, 'w', encoding='utf-8') as f:
            json.dump(d, f, indent=4, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"❌ Error en biblioteca: {e}")
        return False
@eel.expose
def cargar_voz_default():
    datos = validar_json(ARCHIVO_CONFIG_VOZ)
    return datos.get("voz", "")
@eel.expose
def guardar_voz_default(voz):
    try:
        with open(ARCHIVO_CONFIG_VOZ, 'w', encoding='utf-8') as f:
            json.dump({"voz": voz}, f, indent=4, ensure_ascii=False)
        return True
    except: return False
@eel.expose
def cargar_lista_favoritos():
    return validar_json(ARCHIVO_FAVORITOS, default_tipo=list)
@eel.expose
def guardar_lista_favoritos(favs):
    try:
        with open(ARCHIVO_FAVORITOS, 'w', encoding='utf-8') as f:
            json.dump(favs, f, indent=4, ensure_ascii=False)
        return True
    except: return False
@eel.expose
def cargar_diccionario_teatro():
    datos = validar_json(TEATRO_JSON)
    if not datos: return {"General": {"active": True, "actors": {}}}
    return datos
@eel.expose
def guardar_diccionario_teatro(datos):
    try:
        with open(TEATRO_JSON, "w", encoding="utf-8") as f:
            json.dump(datos, f, indent=4, ensure_ascii=False)
        return "✅ Reparto guardado con éxito."
    except Exception as e:
        return f"❌ Error al guardar: {str(e)}"
