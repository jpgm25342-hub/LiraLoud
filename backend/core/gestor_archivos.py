from backend.core.estado_global import estado_app
# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import os
import sys
import json
from backend.core.webview_bridge import eel
"""
Gestor de Archivos y Persistencia
Maneja la lectura y escritura de todas las preferencias y configuraciones del usuario.
"""
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_FILE = os.path.join(BASE_DIR, "abreviaturas.json")
ARCHIVO_ATAJOS = os.path.join(BASE_DIR, "atajos.json")
ARCHIVO_BIBLIOTECA = os.path.join(BASE_DIR, "biblioteca.json")
ARCHIVO_FAVORITOS = os.path.join(BASE_DIR, "favoritos.json")
ARCHIVO_CONFIG_VOZ = os.path.join(BASE_DIR, "voz_default.json")
ARCHIVO_AJUSTES_LECTURA = os.path.join(BASE_DIR, "ajustes_lectura.json")
ARCHIVO_TUTORIAL = os.path.join(BASE_DIR, "tutorial_estado.json")
TEATRO_JSON = os.path.join(BASE_DIR, "teatro.json")
ARCHIVO_KOKORO_BLENDS = os.path.join(BASE_DIR, "kokoro_blends.json")
def validar_json(ruta, default_tipo=dict):
    """Lee JSON. Si está corrupto (string/basura), lo resetea a vacío."""
    val_inicial = {} if default_tipo == dict else []
    if not os.path.exists(ruta):
        try:
            with open(ruta, 'w', encoding='utf-8') as f: json.dump(val_inicial, f)
        except OSError: pass
        return val_inicial
    try:
        with open(ruta, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if not isinstance(data, default_tipo):
                return val_inicial
            return data
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
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
    except Exception: return False
@eel.expose
def cargar_atajos_desde_python():
    defaults = {
        "play_pause": " ", "add_limit": "control+ ", "add_abbr": "control+i",
        "speed_up": "arrowup", "speed_down": "arrowdown",
        "prev_page": "arrowleft", "next_page": "arrowright", "open_pdf": "control+o",
        "prev_sentence": "a", "next_sentence": "d", "cycle_voice": "v", "toggle_dicc": "tab",
        "toggle_highlighter": "h", "toggle_eraser": "e", "crear_nota": "alt+n", "toggle_notas": "n"
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
    except (OSError, TypeError, ValueError): return False
@eel.expose
def cargar_ajustes_lectura():
    defaults = {
        "velocidad": 1.0, "tono": 1.0, "pausa": 300, "volumen": 100,
        "idioma": "Español", "color": "#ffff00", "padKaraoke": 2,
        "colorGuia": "#00b4ff", "padGuia": 2, "llenado": False,
        "margenPDF": 20, "seguirTexto": True,
        "omitirParen": True, "omitirCorch": True, "omitirLlaves": True,
        "omitirUrls": True, "omitirReferencias": True, "omitirSuperindices": True, "omitirSubindices": False, "alto_rendimiento": False,
        "tema_oscuro": False, "pausa_sistema": False, "ducking_volumen": False,
        "ducking_nivel": 20,
        "traduccion_activa": False,
        "traduccion_origen": "auto",
        "traduccion_destino": "es",
        "traduccion_motor": "online",
        "traduccion_modo": "solo_traduccion",
        "ia_proveedor_activo": "ollama",
        "modo_subrayador": False,
        "modo_borrador": False,
        "color_subrayador": "#FFFF00",
        "sidebar_colapsado": False,
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
        },
        "ruta_carpeta_notas": "",
        "notas_filtro_modo": "pagina_actual",
        "notas_filtro_clasif": "TODAS",
        "modo_zen": True,
        "etiquetas_zen": True,
        "tutorial_completado": False
    }
    datos = validar_json(ARCHIVO_AJUSTES_LECTURA)
    for k, v in defaults.items():
        if k not in datos: datos[k] = v
    return datos
def _fusionar_subdict_no_vacios(data, previos, clave, valores_ignorados=()):
    """Preserva entradas previas de un subdiccionario cuando las nuevas llegan vacías o ignoradas."""
    nuevo = data.get(clave)
    prev = previos.get(clave)
    if not (isinstance(nuevo, dict) and isinstance(prev, dict)):
        return
    merged = dict(prev)
    for k, v in nuevo.items():
        if v and str(v).strip() and str(v) not in valores_ignorados:
            merged[k] = str(v).strip()
    data[clave] = merged


@eel.expose
def guardar_ajustes_lectura(data):
    try:
        previos = validar_json(ARCHIVO_AJUSTES_LECTURA)
        if isinstance(data, dict):
            # Preservar claves de IA previas si en data viene un diccionario pero con claves vacías que antes tenían valor
            _fusionar_subdict_no_vacios(data, previos, "ia_cloud_keys")
            _fusionar_subdict_no_vacios(
                data, previos, "ia_cloud_modelos", valores_ignorados=("__custom_model_prompt__",)
            )

            if previos.get("tutorial_completado") is True:
                data["tutorial_completado"] = True

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
    except (OSError, TypeError, ValueError): return False
@eel.expose
def cargar_lista_favoritos():
    return validar_json(ARCHIVO_FAVORITOS, default_tipo=list)
@eel.expose
def guardar_lista_favoritos(favs):
    try:
        with open(ARCHIVO_FAVORITOS, 'w', encoding='utf-8') as f:
            json.dump(favs, f, indent=4, ensure_ascii=False)
        return True
    except (OSError, TypeError, ValueError): return False
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

@eel.expose
def cargar_kokoro_blends():
    """Carga la lista de mezclas de voz personalizadas creadas por el usuario."""
    return validar_json(ARCHIVO_KOKORO_BLENDS, default_tipo=list)

@eel.expose
def guardar_kokoro_blends(blends):
    """Guarda la lista de mezclas de voz personalizadas en kokoro_blends.json."""
    try:
        with open(ARCHIVO_KOKORO_BLENDS, "w", encoding="utf-8") as f:
            json.dump(blends if isinstance(blends, list) else [], f, indent=4, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"❌ Error al guardar mezclas Kokoro: {e}")
        return False


# --- PERSISTENCIA JSON EXTRAÍDA DE app_principal.pyw ---
@eel.expose
def guardar_api_keys_json(datos):
    """Guarda las API keys y modelos cloud en un archivo dedicado api_keys.json."""
    try:
        ruta = os.path.join(BASE_DIR, "api_keys.json")
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(datos or {}, f, ensure_ascii=False, indent=2)
        return {"exito": True}
    except Exception as e:
        return {"exito": False, "error": str(e)}

@eel.expose
def cargar_api_keys_json():
    """Carga las API keys desde api_keys.json si existe."""
    try:
        ruta = os.path.join(BASE_DIR, "api_keys.json")
        if not os.path.exists(ruta):
            return {}
        with open(ruta, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def _ruta_libros_reglas():
    return os.path.join(BASE_DIR, "libros_reglas.json")

def _cargar_todo_libros_reglas():
    try:
        r = _ruta_libros_reglas()
        if not os.path.exists(r):
            return {}
        with open(r, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}

@eel.expose
def cargar_reglas_libro(nombre_libro=None):
    """Carga las reglas de diccionario y teatro exclusivas de un libro."""
    if not nombre_libro:
        nombre_libro = os.path.basename(estado_app.doc.name) if (estado_app.doc and getattr(estado_app.doc, "name", None)) else "General"
    todo = _cargar_todo_libros_reglas()
    return todo.get(nombre_libro, {"diccionario": {}, "teatro": {"actors": {}, "active": True}})

@eel.expose
def guardar_reglas_libro(nombre_libro, tipo, datos):
    """Guarda las reglas de 'diccionario' o 'teatro' exclusivas de un libro en libros_reglas.json."""
    if not nombre_libro:
        nombre_libro = os.path.basename(estado_app.doc.name) if (estado_app.doc and getattr(estado_app.doc, "name", None)) else "General"
    todo = _cargar_todo_libros_reglas()
    if nombre_libro not in todo or not isinstance(todo[nombre_libro], dict):
        todo[nombre_libro] = {"diccionario": {}, "teatro": {"actors": {}, "active": True}}
    todo[nombre_libro][tipo] = datos
    try:
        with open(_ruta_libros_reglas(), "w", encoding="utf-8") as f:
            json.dump(todo, f, ensure_ascii=False, indent=2)
        return {"exito": True}
    except Exception as e:
        return {"exito": False, "error": str(e)}

@eel.expose
def cargar_prompts_personalizados():
    """Carga la lista de prompts personalizados guardados desde prompts_personalizados.json."""
    try:
        ruta = os.path.join(BASE_DIR, "prompts_personalizados.json")
        if not os.path.exists(ruta):
            return []
        with open(ruta, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []

@eel.expose
def guardar_prompts_personalizados(lista):
    """Guarda la lista de prompts personalizados en prompts_personalizados.json."""
    try:
        ruta = os.path.join(BASE_DIR, "prompts_personalizados.json")
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(lista if isinstance(lista, list) else [], f, ensure_ascii=False, indent=2)
        return {"exito": True}
    except Exception as e:
        return {"exito": False, "error": str(e)}


@eel.expose
def cargar_estado_tutorial():
    """
    Carga el estado del tutorial desde su archivo aislado tutorial_estado.json.
    Si el archivo no existe todavía (primera ejecución), lo crea con {"completado": False}
    para que el tutorial se muestre la primera vez que se abre la aplicación.
    """
    try:
        if os.path.exists(ARCHIVO_TUTORIAL):
            with open(ARCHIVO_TUTORIAL, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "completado" in data:
                    return {"completado": bool(data["completado"])}

        estado = {"completado": False}
        with open(ARCHIVO_TUTORIAL, "w", encoding="utf-8") as f:
            json.dump(estado, f, ensure_ascii=False, indent=4)
        return estado
    except Exception:
        return {"completado": False}


@eel.expose
def guardar_estado_tutorial(completado=True):
    """Guarda de forma atómica y aislada el estado del tutorial en tutorial_estado.json."""
    try:
        estado = {"completado": bool(completado)}
        with open(ARCHIVO_TUTORIAL, "w", encoding="utf-8") as f:
            json.dump(estado, f, ensure_ascii=False, indent=4)
        return {"ok": True, "completado": estado["completado"]}
    except Exception as e:
        return {"ok": False, "error": str(e)}


