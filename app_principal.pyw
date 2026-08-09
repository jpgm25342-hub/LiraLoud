# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import eel
pagina_actual_global = 0
import pymupdf as fitz
import base64
import json
import os
import tkinter as tk
from tkinter import filedialog
import ssl
import sys
import re
import gc
import numpy as np
import time
import threading
import queue
import asyncio      
import edge_tts     
from piper.voice import PiperVoice
import onnxruntime as ort
import subprocess 
import shutil
import platform
import logging 
from winsdk.windows.media.speechsynthesis import SpeechSynthesizer
try:
    NOMBRES_ONECORE_LOCALES = [v.display_name for v in SpeechSynthesizer.all_voices]
except:
    NOMBRES_ONECORE_LOCALES = []
import platform
import ctypes
import backend.utils
from backend.utils import *
from backend.gestor_archivos import *
import backend.media_control # Tarea 9: Audio Ducking
from backend.traductor import traductor_global, IDIOMAS_SOPORTADOS
from backend.rag_module import rag_global, LiraRAG
from backend.docx_engine import convertir_word_a_pdf
from backend.ocr_engine import procesar_ocr_pagina, esta_en_cache_ocr
from backend.exportador_audio import exportador_audio_global

# --- CONFIGURACIÓN DE SISTEMA ---
try:
    import psutil
    TIENE_PSUTIL = True
except ImportError:
    TIENE_PSUTIL = False


if platform.system() == "Windows":
    try:
        # Esto agarra la ventana negra del CMD y la vuelve invisible (0)
        ctypes.windll.user32.ShowWindow(ctypes.windll.kernel32.GetConsoleWindow(), 0)
    except:
        pass
        
# --- CONFIGURACIÓN DE SISTEMA ---
try:
    import psutil
    TIENE_PSUTIL = True
except ImportError:
    TIENE_PSUTIL = False

try:
    import certifi
    if hasattr(ssl, '_create_default_https_context') and os.path.exists(certifi.where()):
        ssl._create_default_https_context = lambda: ssl.create_default_context(cafile=certifi.where())
except Exception:
    pass

# --- PROTOCOLO DE IDENTIDAD HÍBRIDA (CORREGIDO) ---
# Define las rutas ANTES de que cualquier función las necesite
if getattr(sys, 'frozen', False):
    # 💉 MODO EJECUTABLE (Producción)
    BASE_DIR = os.path.dirname(sys.executable)
    bundle_dir = sys._MEIPASS
    os.environ["ESPEAK_DATA_PATH"] = os.path.join(bundle_dir, "piper", "espeak-ng-data")
    DIRECTORIO_PIPER = os.path.join(BASE_DIR, "piper_voices")
    print("🚀 [SISTEMA] Modo EXE: Baipás de fonemas activo.")
else:
    # 🛠️ MODO SCRIPT (Desarrollo)
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DIRECTORIO_PIPER = os.path.join(BASE_DIR, "piper_voices")
    print("💻 [SISTEMA] Modo Script: Rutas globales activas.")

# Garantizar existencia de carpeta de voces
if not os.path.exists(DIRECTORIO_PIPER):
    os.makedirs(DIRECTORIO_PIPER)

# 📂 Rutas de Persistencia
DB_FILE = os.path.join(BASE_DIR, "abreviaturas.json")
ARCHIVO_ATAJOS = os.path.join(BASE_DIR, "atajos.json")
ARCHIVO_BIBLIOTECA = os.path.join(BASE_DIR, "biblioteca.json")
ARCHIVO_FAVORITOS = os.path.join(BASE_DIR, "favoritos.json")
ARCHIVO_CONFIG_VOZ = os.path.join(BASE_DIR, "voz_default.json")
ARCHIVO_AJUSTES_LECTURA = os.path.join(BASE_DIR, "ajustes_lectura.json")
TEATRO_JSON = os.path.join(BASE_DIR, "teatro.json")

# 🎨 Icono y Arranque
ICONO_PATH = os.path.join(BASE_DIR, "web", "LiraLoud.ico")
eel.init('web')

# --- VARIABLES GLOBALES ---
audio_queue = queue.Queue()
cola_horno = queue.Queue()
cola_de_trabajo = queue.Queue()
pasteleria_dict = {}
textos_en_proceso = set()
VOCES_CARGADAS = {}
VOCES_USO_TIEMPO = {} # Tarea 2: Control de RAM (Caché LRU)
streaming_active = False
stream_counter = 0
doc = None
CACHE_MAPA_VOCES = {}
hilo_rendimiento_actual = None
abortar_renderizado = False
hilo_pretraduccion_actual = None
abortar_pretraduccion = False
voz_teatro_persistente = None
CATALOGO_EDGE_CACHE = {}
VOCES_DISPONIBLES = []
cola_de_espera_audio = {}

# ==========================================
# 1. GESTIÓN DE DATOS (PROTEGIDA)
# ==========================================
@eel.expose
def cancelar_exportacion_mp3():
    global exportacion_activa, streaming_active
    exportacion_activa = False
    streaming_active = False # Forzar detención cruzada del reproductor normal
    exportador_audio_global.cancelar()
    
    # Limpiamos las colas de trabajo para cortar hilos residuales inmediatamente
    with audio_queue.mutex: 
        audio_queue.queue.clear()
        
    print("⏹️ [SISTEMA] Cancelación de exportación y vaciado de colas completado.")
    return True

@eel.expose
def escanear_voces_piper():
    voces_locales = []
    if not os.path.exists(DIRECTORIO_PIPER): return []
    for archivo in os.listdir(DIRECTORIO_PIPER):
        if archivo.endswith(".onnx") and os.path.exists(os.path.join(DIRECTORIO_PIPER, archivo+".json")):
            nombre = archivo.replace(".onnx", "").replace("es_MX", "🇲🇽").replace("-", " ").title()
            voces_locales.append({"id": f"Local-{archivo}", "nombre": f"⚡ {nombre} (Local)"})
    return voces_locales

@eel.expose
def abrir_documento_legal(nombre_archivo):
    ruta_raiz = os.path.join(BASE_DIR, nombre_archivo)
    ruta_web = os.path.join(BASE_DIR, "web", nombre_archivo)
    
    ruta_final = ruta_web if os.path.exists(ruta_web) else ruta_raiz
    
    if os.path.exists(ruta_final):
        try:
            os.startfile(ruta_final)
        except Exception as e:
            print(f"Error al abrir {nombre_archivo}: {e}")
    else:
        print(f"No se encontró el archivo: {nombre_archivo}")
            
@eel.expose
def obtener_voces_disponibles():
    global VOCES_DISPONIBLES
    try:
        # Si ya tenemos el catálogo Edge en RAM, lo devolvemos directo
        if VOCES_DISPONIBLES:
            return escanear_voces_piper() + VOCES_DISPONIBLES

        # Si aún no está, lo intentamos descargar ahora
        import asyncio, edge_tts
        async def _fetch():
            global VOCES_DISPONIBLES
            try:
                voces_edge = await edge_tts.list_voices()
                VOCES_DISPONIBLES = [
                    {
                        "id": v["ShortName"],
                        "nombre": f"🌐 {v.get('FriendlyName', v['ShortName'])}",
                        "tipo": "nube"
                    }
                    for v in voces_edge
                ]
                print(f"🌐 [EDGE] Catálogo cargado: {len(VOCES_DISPONIBLES)} voces.")
            except Exception as e:
                print(f"⚠️ [EDGE] No se pudo descargar catálogo: {e}")
        safe_async_run(_fetch())
        return escanear_voces_piper() + VOCES_DISPONIBLES
    except Exception as e:
        print(f"🔥 Error en el catálogo de voces: {e}")
        return escanear_voces_piper()

# --- GESTIÓN DE AJUSTES AVANZADOS ---

# ==========================================
# ✂️ Remplazos y filtros (ADUANA BLINDADA)
# ==========================================
@eel.expose
def aplicar_reemplazos(texto, diccionario_activo, filtros=None, modo_teatro=False, obra_actual="General"):
    # 🛡️ BLINDAJE DE TIPO: Si el diccionario llegó corrupto, usar vacío
    if not isinstance(diccionario_activo, dict):
        diccionario_activo = {}

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

    # 🎭 BLOQUE TEATRO (Consolidado)
    if modo_teatro:
        try:
            db = cargar_diccionario_teatro() # Ya usa validar_json
            obra_data = db.get(obra_actual, {})
            if isinstance(obra_data, dict) and obra_data.get("active", True):
                reparto = obra_data.get("actors", {})
                
                for actor_key, data in reparto.items():
                    if not data.get("on", True): continue
                    
                    patron_nombre = crear_regex_inmune_acentos(actor_key)
                    # Regex de francotirador
                    regex_combate = rf"^\s*(?:(?:[\w\d]+\s+){{0,3}})?\b{patron_nombre}\s*[:](?:\s*,\s*)?"
                    match = re.search(regex_combate, texto, re.IGNORECASE)

                    if match:
                        voz_detectada = data["voz"]
                        texto = texto[match.end():].strip()
                        if not texto or re.match(r'^[\.,;]+$', texto) or texto == "...": 
                            texto = "..."
                        
                        # Persistencia global para el hilo actual
                        global voz_teatro_persistente
                        voz_teatro_persistente = voz_detectada
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
    texto = re.sub(r'[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s\.\,\:\;\-\(\)\[\]\?\¿\!\¡\%\+\°\=\⁰\¹\²\³\⁴\⁵\⁶\⁷\⁸\⁹]', ' ', texto)
    # Tarea 1: Sanitizador de Espacios Repetidos (Protegiendo saltos de línea)
    res = re.sub(r'[ \t]{2,}', ' ', texto).strip()
    
    return res, voz_detectada

# ==========================================
# 2. MOTOR DE EXPORTACIÓN DE AUDIO (DESACOPLADO)
# ==========================================

@eel.expose
def descargar_audio_dedicado(pag_ini, pag_fin, voz_id, velocidad_float, lista_cortes_v=None, limites_h=None, dict_activo=None, modo_teatro=False, obra_actual="General"):
    global doc
    if not doc:
        return "❌ Error: No hay ningún documento abierto."

    # Diálogo de guardado nativo
    root = tk.Tk()
    root.withdraw()
    root.wm_attributes('-topmost', 1)
    
    tipos_archivo = [
        ("Audio MP3 (*.mp3)", "*.mp3"),
        ("Audio WAV (*.wav)", "*.wav"),
        ("Todos los archivos", "*.*")
    ]
    
    ruta_guardado = filedialog.asksaveasfilename(
        title="Guardar Audio de Estudio",
        defaultextension=".mp3",
        filetypes=tipos_archivo
    )
    root.destroy()
    
    if not ruta_guardado:
        return "⏹️ Cancelado por el usuario."

    def _progreso_ui(paso_actual, total_pasos):
        try:
            eel.actualizar_progreso_modal(paso_actual, total_pasos)()
        except Exception:
            try:
                eel.actualizar_progreso_modal(paso_actual, total_pasos)
            except Exception:
                pass

    res = exportador_audio_global.exportar_rango(
        doc=doc,
        pag_ini=pag_ini,
        pag_fin=pag_fin,
        voz_id=voz_id,
        velocidad_float=velocidad_float,
        ruta_salida=ruta_guardado,
        dict_activo=dict_activo,
        modo_teatro=modo_teatro,
        obra_actual=obra_actual,
        cortes_v=lista_cortes_v,
        limites_h=limites_h,
        progress_callback=_progreso_ui
    )

    return res.get("mensaje", "Finalizado.")
# ==========================================
# 3. MOTOR DE AUDIO (POTENCIA)
# ==========================================
def worker_horno():
    while True:
        tarea = cola_horno.get()
        if tarea is None: break
        texto_recibido, voz, vel = tarea
        
        # Generamos ID único (Texto + Voz) para que no se mezclen audios de Piper y Edge
        t_id = normalizar_texto(texto_recibido) + str(voz)
        
        if t_id not in pasteleria_dict:
            try:
                # Llama a la cocina híbrida (Piper o Edge)
                res = cocinar_ahora_pro(texto_recibido, voz, vel)
                if res and "pcm" in res and len(res["pcm"]) > 0:
                    pasteleria_dict[t_id] = res
            except Exception as e:
                print(f"🔥 Error en el proceso: {e}")
        
        if t_id in textos_en_proceso:
            textos_en_proceso.remove(t_id)
        
        cola_horno.task_done()



@eel.expose
def gestionar_ram_favoritos(favoritos_ids):
    """
    Mantiene en RAM solo las voces Piper que son favoritas.
    Reporta el progreso en tiempo real a la interfaz.
    """
    global VOCES_CARGADAS
    
    # Identificamos qué rutas deben estar en RAM
    rutas_favoritas = []
    for vid in favoritos_ids:
        if vid.startswith("Local-"):
            nombre = vid.replace("Local-", "")
            rutas_favoritas.append(os.path.join(DIRECTORIO_PIPER, nombre))
    
    # 1. LIMPIEZA: Si una voz está en RAM pero ya no es favorita, la sacamos
    for ruta in list(VOCES_CARGADAS.keys()):
        if ruta not in rutas_favoritas:
            nombre_voz = os.path.basename(ruta)
            eel.actualizar_log_carga(f"Liberando memoria: {nombre_voz}...")
            del VOCES_CARGADAS[ruta]
    
    # 2. PRECARGA: Si es favorita y no está en RAM, la subimos
    for ruta_onnx in rutas_favoritas:
        if ruta_onnx not in VOCES_CARGADAS:
            nombre_modelo = os.path.basename(ruta_onnx)
            
            # 🔔 Reporte a la interfaz antes de cargar
            eel.actualizar_log_carga(f"Cargando modelo: {nombre_modelo}")
            
            try:
                sess_opts = ort.SessionOptions()
                sess_opts.intra_op_num_threads = 2
                
                voice = PiperVoice.load(ruta_onnx, use_cuda=False)
                voice.session = ort.InferenceSession(ruta_onnx, sess_opts)
                VOCES_CARGADAS[ruta_onnx] = voice
                
            except Exception as e:
                eel.actualizar_log_carga(f"Error en: {nombre_modelo}")
                print(f"❌ Error precargando {ruta_onnx}: {e}")
    
    # Finalización
    eel.actualizar_log_carga("¡Todos los modelos listos!")
    gc.collect()
    return True


def cocinar_ahora_pro(texto, voz_id, vel, es_prioridad_max=False):
    global VOCES_CARGADAS, VOCES_USO_TIEMPO, CATALOGO_EDGE_CACHE
    
    # ==========================================
    # 🏰 CAMINO A: MOTOR LOCAL (PIPER / NITRO)
    # ==========================================
    if voz_id.startswith("Local-"):
        t_inicio = time.perf_counter() 
        nombre = voz_id.replace("Local-", "")
        path_onnx = os.path.join(DIRECTORIO_PIPER, nombre)
        es_carga_nueva = path_onnx not in VOCES_CARGADAS 
        
        # Tarea 2: Recolector de basura LRU (Liberar modelos viejos)
        LIMITE_VOCES_RAM = 3
        VOCES_USO_TIEMPO[path_onnx] = time.time()
        
        if es_carga_nueva and len(VOCES_CARGADAS) >= LIMITE_VOCES_RAM:
            # Encontrar la voz más antigua que NO sea la que estamos cargando ahora
            voces_ordenadas = sorted(VOCES_USO_TIEMPO.items(), key=lambda x: x[1])
            for v_path, _ in voces_ordenadas:
                if v_path != path_onnx and v_path in VOCES_CARGADAS:
                    print(f"🧹 [GC] Liberando memoria RAM: {os.path.basename(v_path)}")
                    del VOCES_CARGADAS[v_path]
                    del VOCES_USO_TIEMPO[v_path]
                    gc.collect()
                    break 
        
        # 🧠 DETECCIÓN DE HARDWARE CON "UMBRAL DE TOSTADORA"
        es_turbo = es_prioridad_max or es_carga_nueva
        hilos_so = os.cpu_count() or 4
        
        # --- BLOQUE UNIFICADO DE HILOS ---
        if es_turbo:
            if hilos_so <= 2:
                hilos_nitro = 1 
                perfil = "Tostadora"
            elif hilos_so <= 4:
                hilos_nitro = 2 
                perfil = "Ofimática"
            else:
                # 🚀 Perfil Entusiasta (Tu Ryzen 7600)
                hilos_nitro = max(4, hilos_so // 2)
                if hilos_nitro > 8: hilos_nitro = 8 
                perfil = "Entusiasta/Ryzen"
        else:
            hilos_nitro = 1 if hilos_so <= 4 else 2
            perfil = "Bajo Consumo"

        print(f"📡 [NITRO] Perfil: {perfil} | {hilos_so} CPUs -> Usando {hilos_nitro} hilos.")

        p = psutil.Process(os.getpid()) if TIENE_PSUTIL else None

        try:
            if es_carga_nueva:
                if p: p.nice(psutil.HIGH_PRIORITY_CLASS)
                print(f"🔥 [NITRO ON] Carga fría: {nombre} | Hilos: {hilos_nitro}")
                
                sess_opts = ort.SessionOptions()
                sess_opts.intra_op_num_threads = hilos_nitro
                sess_opts.inter_op_num_threads = 1 
                
                VOCES_CARGADAS[path_onnx] = PiperVoice.load(path_onnx, use_cuda=False)
                VOCES_CARGADAS[path_onnx].session = ort.InferenceSession(path_onnx, sess_opts)
            
            elif p:
                p.nice(psutil.ABOVE_NORMAL_PRIORITY_CLASS)

            voice = VOCES_CARGADAS[path_onnx]
            scale = 1.0 / vel
            
            # --- RECONSTRUCCIÓN DEL INPUT_FEED ---
            phonemes = voice.phonemize(texto)
            id_map = voice.config.phoneme_id_map
            phoneme_ids = []
            for item in phonemes:
                if isinstance(item, list):
                    for sub in item:
                        if sub in id_map: phoneme_ids.extend(id_map[sub])
                elif item in id_map: phoneme_ids.extend(id_map[item])
            
            final_ids = [0]
            for pid in phoneme_ids: final_ids.extend([pid, 0])
            id_tensor = np.expand_dims(np.array(final_ids, dtype=np.int64), 0)
            scales = np.array([0.667, scale, 0.8], dtype=np.float32)
            
            input_feed = {
                "input": id_tensor, 
                "input_lengths": np.array([id_tensor.shape[1]], dtype=np.int64), 
                "scales": scales
            }
            if "sid" in [i.name for i in voice.session.get_inputs()]:
                input_feed["sid"] = np.array([0], dtype=np.int64)

            audio_output = voice.session.run(None, input_feed)[0]
            
            ms_proceso = round((time.perf_counter() - t_inicio) * 1000, 2)
            print(f"[LOG] Piper: {nombre} | {len(texto)} chars | {ms_proceso}ms")

            return {
                "pcm": (audio_output.squeeze() * 32767).clip(-32768, 32767).astype(np.int16).tobytes(),
                "texto": texto, 
                "sr": voice.config.sample_rate
            }
        finally:
            if p: 
                try: p.nice(psutil.NORMAL_PRIORITY_CLASS)
                except: pass

    # ==========================================
    # 🪟 MODO 3: MOTOR ONECORE (VOCES MODERNAS DE WINDOWS)
    # ==========================================
    elif voz_id.startswith("Microsoft") and any(nombre in voz_id for nombre in NOMBRES_ONECORE_LOCALES):
        from winsdk.windows.storage.streams import DataReader
        
        async def generar_win_pcm():
            try:
                synth = SpeechSynthesizer()
                
                # Buscar la voz exacta (Soporta voces OneCore modernas como Raul)
                for v in SpeechSynthesizer.all_voices:
                    if v.display_name in voz_id or voz_id in v.display_name:
                        synth.voice = v
                        break
                
                # Velocidad nativa (1.0 = normal, 1.5 = rápida)
                synth.options.speaking_rate = max(0.5, min(6.0, float(vel)))
                
                # Generar WAV en memoria (Sin archivos temporales)
                stream = await synth.synthesize_text_to_stream_async(texto)
                size = stream.size
                reader = DataReader(stream.get_input_stream_at(0))
                await reader.load_async(size)
                buffer = reader.read_buffer(size)
                wav_bytes = bytes(memoryview(buffer))
                
                # Convertir WAV de memoria a PCM crudo (s16le 22050Hz) con FFMPEG
                if shutil.which("ffmpeg"):
                    process = subprocess.Popen(
                        ['ffmpeg', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', '22050', 'pipe:1'],
                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                        creationflags=0x08000000
                    )
                    pcm_data, _ = process.communicate(input=wav_bytes)
                    return {"pcm": pcm_data, "texto": texto, "sr": 22050}
                else:
                    return {"pcm": b"", "texto": texto, "sr": 22050}
            except Exception as e:
                print(f"🔥 Error en motor OneCore: {e}")
                return {"pcm": b"", "texto": texto, "sr": 22050}
                
        return safe_async_run(generar_win_pcm())

    # ===========================================
    # ☁️ MODO 2: MOTOR NUBE (EDGE TTS - RESOLUTOR DINÁMICO)
    # ==========================================
    else:
        async def generar_edge_pcm():
            global CATALOGO_EDGE_CACHE
            tasa = f"{int((vel - 1) * 100):+d}%"
            
            # 1. TRADUCCIÓN DE NOMBRE
            v_lower = voz_id.lower()
            voz_tecnica = None
            
            # Identificación directa si ya es nombre técnico de voz Neural
            if "neural" in v_lower and "-" in voz_id:
                voz_tecnica = voz_id
            # Mapeo manual rápido
            elif "salome" in v_lower: voz_tecnica = "es-CO-SalomeNeural"
            elif "ramona" in v_lower: voz_tecnica = "es-DO-RamonaNeural"
            elif "dalia" in v_lower: voz_tecnica = "es-MX-DaliaNeural"
            elif "jorge" in v_lower: voz_tecnica = "es-MX-JorgeNeural"
            elif "elena" in v_lower: voz_tecnica = "es-AR-ElenaNeural"
            elif "tomas" in v_lower: voz_tecnica = "es-AR-TomasNeural"
            
            # Auto-descubrimiento (Fallback)
            if not voz_tecnica:
                if not CATALOGO_EDGE_CACHE:
                    try:
                        voces_edge = await edge_tts.list_voices()
                        for v in voces_edge:
                            CATALOGO_EDGE_CACHE[v['FriendlyName']] = v['ShortName']
                            CATALOGO_EDGE_CACHE[v['ShortName']] = v['ShortName']
                    except: pass
                voz_tecnica = CATALOGO_EDGE_CACHE.get(voz_id, "es-MX-DaliaNeural")

            # 2. DESCARGA (Esto baja MP3)
            # print(f"☁️ [NUBE] Bajando MP3: {voz_tecnica}...")
            try:
                com = edge_tts.Communicate(texto, voz_tecnica, rate=tasa)
                mp3_data = b""
                async for chunk in com.stream():
                    if chunk["type"] == "audio":
                        mp3_data += chunk["data"]
                return mp3_data
            except Exception as e:
                print(f"🔥 Error descarga Edge: {e}")
                return None

        try:
            mp3_bytes = safe_async_run(generar_edge_pcm())
            
            if not mp3_bytes:
                return {"pcm": b"", "texto": "", "sr": 24000}

            # 3. LA MAGIA: CONVERTIR MP3 A PCM (Adiós Pitido)
            # Usamos FFMPEG para transformar los bytes MP3 a bytes RAW S16LE (Lo que come Piper)
            if shutil.which("ffmpeg"):
                process = subprocess.Popen(
                    ['ffmpeg', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', '22050', 'pipe:1'],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                    creationflags=0x08000000
                )
                pcm_data, _ = process.communicate(input=mp3_bytes)
                
                # print(f"✨ [FFMPEG] MP3 -> PCM convertido ({len(pcm_data)} bytes)")
                return {
                    "pcm": pcm_data,
                    "texto": texto,
                    "sr": 22050
                }
            else:
                print("⚠️ [ALERTA] FFmpeg no encontrado. Se enviará MP3 (Sonará como pitido).")
                # Si no hay ffmpeg, mandamos el mp3 y sonará mal, pero no crashea
                return {"pcm": mp3_bytes, "texto": texto, "sr": 24000}

        except Exception as e:
            print(f"🔥 Error Proceso Edge: {e}")
            return {"pcm": b"", "texto": "", "sr": 24000}
            
def worker_reproductor():
    while True:
        tarea = cola_de_trabajo.get()
        if tarea is None: break
        # 📦 Ahora desempaquetamos los 6 valores enviados
        sid, texto, voz, vel, t_on, obra = tarea 
        # Pasamos los 6 valores a la lógica de audio
        run_local_logic_v21(sid, texto, voz, vel, t_on, obra)
        cola_de_trabajo.task_done()

def iniciar_fuerza_laboral():
    for i in range(4): threading.Thread(target=worker_horno, daemon=True).start()
    threading.Thread(target=worker_reproductor, daemon=True).start()


iniciar_fuerza_laboral()



@eel.expose
def iniciar_streaming_hibrido(texto, voz_id, velocidad_float, session_id, 
                              teatro_activo_ui=False, obra_activa_ui="General"):
    
    print(f"\n📡 [PY -> ENTRADA] Texto: '{texto[:30]}...' | Teatro: {teatro_activo_ui} | Obra: {obra_activa_ui}")
    
    global streaming_active, stream_counter
    streaming_active = True
    stream_counter = int(session_id)
    
    with audio_queue.mutex: 
        audio_queue.queue.clear()
    
    cola_de_trabajo.put((stream_counter, texto, voz_id, velocidad_float, teatro_activo_ui, obra_activa_ui))



# --- FUNCIÓN MAESTRA V21.5 (DESBLOQUEADA PARA EDGE) ---
def run_local_logic_v21(thread_id, texto_hilo, voz_hilo, vel_hilo, teatro_on, obra_actual):
    global audio_queue, streaming_active, stream_counter, pasteleria_dict, voz_teatro_persistente
    try:
        if stream_counter != thread_id: return
        
        # 0. Cargar el diccionario de abreviaturas una sola vez por frase
        dict_activo = cargar_diccionario()

        # 1. GESTIÓN DE LA VOZ BASE Y DETECCIÓN (Integración con aplicar_reemplazos)
        # Python decide internamente: ¿Hay un actor nuevo? ¿Mutilamos el nombre?
        texto_limpio, nueva_voz = aplicar_reemplazos(
            texto_hilo, 
            dict_activo, 
            None, 
            teatro_on, 
            obra_actual
        )

        # 2. LÓGICA DE PERSISTENCIA (El "Efecto Memoria")
        if not teatro_on:
            voz_teatro_persistente = None
            voz_a_usar = voz_hilo
        else:
            # Si detectamos un actor nuevo, actualizamos la memoria
            if nueva_voz:
                voz_teatro_persistente = nueva_voz
            
            # La voz final es: Nueva > Persistente > HUD
            voz_a_usar = nueva_voz if nueva_voz else (voz_teatro_persistente if voz_teatro_persistente else voz_hilo)

        # 3. SEGURIDAD: Si tras la mutilación del nombre el texto queda vacío, abortamos
        if not texto_limpio: return 

        # 🔓 BLOQUEO ELIMINADO: Ya no verificamos si es "Local-". 
        # Ahora dejamos pasar a Edge (Nube) hacia la cocina.

        # 4. MOTOR DE RENDERIZADO (Caché Híbrida)
        # 🔥 AJUSTE VITAL: Usamos 'texto_limpio' + 'voz' para el ID.
        # Esto evita que se mezcle el audio de Piper con el de Edge si el texto es igual.
        t_id = normalizar_texto(texto_limpio) + str(voz_a_usar)
        
        # Ya no importa si es default o no, verificamos el ID único en la caché de audio
        if t_id not in pasteleria_dict:
            # 🚀 COCINAMOS: Enviamos texto_limpio (sin nombre)
            datos = cocinar_ahora_pro(texto_limpio, voz_a_usar, vel_hilo)
            pasteleria_dict[t_id] = datos
        else:
            datos = pasteleria_dict.get(t_id)

        # 5. CÁLCULO DE DURACIÓN Y SINCRONÍA
        # Si es Edge (MP3), la duración exacta es difícil, hacemos una estimación para el karaoke
        sr = datos.get("sr", 24000)
        num_muestras = len(datos["pcm"]) / 2
        
    

        dur_total = num_muestras / sr

        # 6. CÁLCULO DE PESOS CON FILTRO DE RUIDO VISUAL
        # Usamos texto_limpio para que el karaoke coincida con lo que se escucha
        palabras_pdf = texto_limpio.split()
        pesos = []
        for p in palabras_pdf:
            if any(c in p for c in "([{") or "http" in p or "www." in p:
                peso = 0.1 
            else:
                peso = len(p)
                if any(c in p for c in ".,;:?!"): peso += 12 
            pesos.append(peso)
        
        total_peso = sum(pesos) if pesos else 1
        
        # 7. MOTOR DE SINCRONÍA FRACCIONADA (N:1)
        meta_palabras = []
        t_acum = 0.0

        for idx_visual, p_orig in enumerate(palabras_pdf):
            # No aplicamos reemplazos aquí porque ya usamos texto_limpio arriba
            p_expandida = p_orig
            
            fragmentos = p_expandida.split()
            num_frags = len(fragmentos) if fragmentos else 1
            dur_caja_pdf = dur_total * (pesos[idx_visual] / total_peso)
            dur_por_frag = dur_caja_pdf / num_frags

            for i, frag in enumerate(fragmentos):
                meta_palabras.append({
                    "w": frag.strip(".,!?"),
                    "s": round(t_acum, 4),
                    "e": round(t_acum + dur_por_frag, 4),
                    "vIdx": idx_visual,
                    "sub_i": i,
                    "sub_t": num_frags
                })
                t_acum += dur_por_frag

        # 8. ENVÍO DE DATOS AL FRONTEND
        audio_queue.put({"t": "lyrics", "data": meta_palabras, "sid": thread_id})
        
        CHUNK = 32768
        pcm = datos["pcm"]
        for i in range(0, len(pcm), CHUNK):
            if stream_counter != thread_id or not streaming_active: break
            audio_queue.put({
                "t": "a", 
                "d": base64.b64encode(pcm[i:i+CHUNK]).decode('utf-8'), 
                "sid": thread_id
            })
            time.sleep(0.005)
            
    except Exception as e:
        print(f"🔥 ERROR CRÍTICO V21.5 (UNLOCKED): {e}")
    finally:
        if stream_counter == thread_id: 
            audio_queue.put({"t": "fin", "sid": thread_id})


@eel.expose
def prender_horno_para_siguiente(texto_sig, voz_id, vel_float):
    # 🛡️ ESCUDO DE TIPO (Igual que en aplicar_reemplazos)
    if isinstance(texto_sig, list):
        texto_sig = " ".join([str(p.get('texto', p)) if isinstance(p, dict) else str(p) for p in texto_sig])
    
    if not isinstance(texto_sig, str):
        texto_sig = str(texto_sig) if texto_sig is not None else ""

    # Si después de limpiar no hay texto, abortamos la cocción
    if not texto_sig: return

    # Ahora sí, generamos el ID exacto coincidente con run_local_logic_v21 y worker_horno
    t_id = normalizar_texto(texto_sig) + str(voz_id)
    
    if t_id in pasteleria_dict or t_id in textos_en_proceso: return
    textos_en_proceso.add(t_id)
    cola_horno.put((texto_sig, voz_id, vel_float))

@eel.expose
def detener_streaming_backend(limpiar_horno=False):
    global streaming_active
    streaming_active = False
    
    with audio_queue.mutex: audio_queue.queue.clear()

@eel.expose
def obtener_chunk_audio():
    try: return audio_queue.get_nowait()
    except: return None


# ==========================================
# 4. MOTOR DE CATÁLOGO DINÁMICO
# ==========================================
@eel.expose
def obtener_todas_las_voces_descarga(voces_sistema_cliente=None):
    """
    Mezcla las voces locales de Piper con las que el navegador 
    detectó dinámicamente (Edge/Sistema).
    """
    print("📥 [PY] Sincronizando catálogo con el navegador...")
    lista_final = []
    
    # 1. Agregamos lo que el JS nos mandó (Dalia, Jorge, Alonso, etc.)
    if voces_sistema_cliente:
        for v in voces_sistema_cliente:
            lista_final.append({
                "id": v['name'], 
                "nombre": f"🌐 {v['name']}",
                "tipo": "nube"
            })
    
    # 2. Agregamos lo que hay físicamente en la carpeta piper_voices
    if os.path.exists(DIRECTORIO_PIPER):
        for f in os.listdir(DIRECTORIO_PIPER):
            if f.endswith(".onnx"):
                nombre = f.replace(".onnx", "").replace("_", " ").title()
                lista_final.append({
                    "id": f"Local-{f}", 
                    "nombre": f"⚡ Piper: {nombre}",
                    "tipo": "local"
                })
                
    print(f"✅ [PY] Catálogo unificado con {len(lista_final)} voces.")
    return lista_final
# ==========================================
# 5. PROCESAMIENTO PDF (MOTOR VISUAL)
# ==========================================

@eel.expose
def seleccionar_archivo():
    global doc
    if doc: 
        doc.close()
        doc = None
        gc.collect()
    
    root = tk.Tk()
    root.withdraw()
    root.wm_attributes('-topmost', 1)
    tipos = [
        ("Documentos compatibles (*.pdf, *.docx, *.doc)", "*.pdf;*.docx;*.doc"),
        ("Archivos PDF (*.pdf)", "*.pdf"),
        ("Archivos Word (*.docx, *.doc)", "*.docx;*.doc"),
        ("Todos los archivos", "*.*")
    ]
    ruta = filedialog.askopenfilename(filetypes=tipos)
    root.destroy()
    
    if ruta and os.path.exists(ruta):
        try:
            ext = os.path.splitext(ruta)[1].lower()
            if ext in [".docx", ".doc"]:
                print(f"📄 [PY] Convirtiendo documento Word: {os.path.basename(ruta)}")
                ruta_pdf = convertir_word_a_pdf(ruta)
                doc = fitz.open(ruta_pdf)
                return ruta_pdf
            else:
                doc = fitz.open(ruta)
                return ruta
        except Exception as e:
            print(f"🔥 Error abriendo documento: {e}")
            return None
    return None

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

def procesar_oraciones_de_palabras(palabras, dict_activo, filtros_externos=None):
    oraciones = []
    texto_acumulado = []
    rects_acumulados = []
    palabras_objetos = []
    parentesis_abiertos = 0 
    
    # Calcular el margen izquierdo de la página para el detector de sangría
    margen_izquierdo = min([p[0] for p in palabras]) if palabras else 0
    
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

            # B. Números pegados (Ej: glucosa2)
            match_pegado = re.search(r'([a-zA-Záéíóúñ])(\d{1,3})([.,]?)$', txt)
            if match_pegado and altura_palabra < 10:
                txt = txt.replace(match_pegado.group(2), "")

            # C. Filtro de omisión (Números flotantes pequeños)
            txt_limpio = txt.strip().replace(',', '').replace('.', '')
            if (es_superindice or (altura_palabra < 8.5)) and txt_limpio.isdigit() and len(txt_limpio) <= 3:
                continue

        # Monitor de paréntesis
        parentesis_abiertos += (txt.count('(') + txt.count('['))
        parentesis_abiertos -= (txt.count(')') + txt.count(']'))
        
        texto_acumulado.append(txt)
        rects_acumulados.append([x0, y0, x1, y1])
        palabras_objetos.append({"texto": txt, "bbox": [int(x0), int(y0), int(x1), int(y1)]})
        
        # --- LÓGICA DE SEGMENTACIÓN HÍBRIDA ---
        es_final = txt.endswith(('.', '?', '!', ':', ';'))
        es_salto = False
        if i + 1 < len(palabras):
            if usar_bloques:
                # LÓGICA NATIVA DEL PDF
                bloque_actual = p[5] if len(p) > 5 else 0
                siguiente_bloque = palabras[i+1][5] if len(palabras[i+1]) > 5 else 0
                if siguiente_bloque != bloque_actual:
                    es_salto = True
            else:
                # LÓGICA MANUAL (GEOMÉTRICA)
                siguiente_x0 = palabras[i+1][0]
                siguiente_y0 = palabras[i+1][1]
                siguiente_y1 = palabras[i+1][3]
                
                es_nueva_linea = (siguiente_y0 - y0) > (altura_palabra * 0.5)
                
                if es_nueva_linea:
                    # 1. Brecha Vertical Pura basada en sensibilidad manual
                    if (siguiente_y0 - y1) > (altura_palabra * umbral_mult): 
                        es_salto = True
                    # 2. Detector de Sangría / Texto Centrado (opcional)
                    elif usar_sangria and siguiente_x0 > (margen_izquierdo + (altura_palabra * 1.5)):
                        es_salto = True

        # No cortar si hay paréntesis abiertos o es una sigla (ej. "Sra.")
        esperar = (parentesis_abiertos > 0) or (len(txt.replace('.','')) <= 3 and i + 1 < len(palabras))
        cortar_ahora = (es_final and not esperar) or es_salto

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
            oraciones.append({"texto": frase_final, "rects": [[0,0,0,0]], "palabras": palabras_objetos})
            
    return oraciones

snapshot_oraciones_raw = []
snapshot_palabras_raw = []
snapshot_cortes_v = None
snapshot_limites_h = None

@eel.expose
def reaplicar_filtros_desde_snapshot(dict_activo, filtros=None, resegmentar=False):
    global doc, snapshot_oraciones_raw, snapshot_palabras_raw, snapshot_cortes_v, snapshot_limites_h
    if not snapshot_oraciones_raw: return None
    
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
    if resegmentar and snapshot_palabras_raw:
        usar_sort = (snapshot_cortes_v is None or len(snapshot_cortes_v) == 0)
        
        if usar_sort:
            snapshot_oraciones_raw = procesar_oraciones_de_palabras(snapshot_palabras_raw, filtros)
        else:
            pagina = doc[pagina_actual_global] if doc else None
            if pagina:
                limites_v = [0] + sorted(snapshot_cortes_v or []) + [pagina.rect.width]
                temp_snapshot = []
                for i in range(len(limites_v) - 1):
                    x_min, x_max = limites_v[i], limites_v[i+1]
                    y_min, y_max = 0, pagina.rect.height
                    if snapshot_limites_h and str(i) in snapshot_limites_h:
                        y_min, y_max = snapshot_limites_h[str(i)]
                    col = [p for p in snapshot_palabras_raw if (p[0]+p[2])/2 >= x_min and (p[0]+p[2])/2 < x_max and (p[1]+p[3])/2 >= y_min and (p[1]+p[3])/2 <= y_max]
                    if col:
                        col.sort(key=lambda w: (int(w[1]/10), w[0]))
                        temp_snapshot.extend(procesar_oraciones_de_palabras(col, filtros))
                snapshot_oraciones_raw = temp_snapshot

    omitir_ref = filtros.get('chk-referencias', True)
    nuevas_oraciones = []
    
    for oracion in snapshot_oraciones_raw:
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

@eel.expose
def limpiar_pasteleria():
    global pasteleria_dict, textos_en_proceso, cola_horno
    pasteleria_dict.clear()
    textos_en_proceso.clear()
    # Importante: Vaciar la cola de procesamiento para no saturar la red descargando audios viejos de Edge que ya no se usarán
    cola_horno.queue.clear()
    gc.collect()
    return True

@eel.expose
def obtener_pagina_data(num, lista_cortes_v=None, limites_h=None, dict_activo=None, forzar_ocr=False):
    global doc, snapshot_oraciones_raw, snapshot_palabras_raw, snapshot_cortes_v, snapshot_limites_h, pagina_actual_global
    if not doc: return None
    pagina_actual_global = num
    try:
        pagina = doc[num]
        zoom = 1.5 
        pix = pagina.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        img_data = base64.b64encode(pix.tobytes("jpg", jpg_quality=80)).decode('utf-8')
        
        # Handshake: Leemos el estado real del disco (ya reparado por Bloque 1)
        ajustes_json = cargar_ajustes_lectura() 
        
        filtros_ui = {
            'chk-urls': ajustes_json.get('omitirUrls', False),
            'chk-paren': ajustes_json.get('omitirParen', False),
            'chk-corch': ajustes_json.get('omitirCorch', False),
            'chk-llaves': ajustes_json.get('omitirLlaves', False),
            'chk-barras': ajustes_json.get('omitirBarras', False),
            'chk-referencias': ajustes_json.get('omitirReferencias', True)
        }

        usar_sort = (lista_cortes_v is None or len(lista_cortes_v) == 0)
        
        if forzar_ocr:
            print(f"🔍 [PY] Forzando RapidOCR en página {num}...")
            pix_bytes = pix.tobytes("png")
            palabras_raw = procesar_ocr_pagina(
                pixmap_bytes=pix_bytes,
                ancho_pdf=pagina.rect.width,
                alto_pdf=pagina.rect.height,
                ancho_px=pix.width,
                alto_px=pix.height,
                doc_path=getattr(doc, "name", "doc_actual"),
                num_pagina=num,
                forzar=True
            )
        else:
            palabras_raw = pagina.get_text("words", sort=usar_sort)
            # Auto-detección: si la página tiene < 5 palabras pero contiene dibujos/imágenes
            if len(palabras_raw) < 5:
                imagenes_en_pag = pagina.get_images()
                if imagenes_en_pag or len(palabras_raw) == 0:
                    print(f"🔍 [PY] Página {num} sin texto digital detectado ({len(palabras_raw)} palabras). Activando RapidOCR...")
                    pix_bytes = pix.tobytes("png")
                    palabras_ocr = procesar_ocr_pagina(
                        pixmap_bytes=pix_bytes,
                        ancho_pdf=pagina.rect.width,
                        alto_pdf=pagina.rect.height,
                        ancho_px=pix.width,
                        alto_px=pix.height,
                        doc_path=getattr(doc, "name", "doc_actual"),
                        num_pagina=num,
                        forzar=False
                    )
                    if palabras_ocr:
                        palabras_raw = palabras_ocr

        mapa_palabras = [{"texto": p[4], "bbox": [int(p[0]), int(p[1]), int(p[2]), int(p[3])]} for p in palabras_raw]
        
        # Guardar estado original (snapshot) para hot-swap de segmentación
        snapshot_palabras_raw = palabras_raw
        snapshot_cortes_v = lista_cortes_v
        snapshot_limites_h = limites_h

        # CREACIÓN DEL SNAPSHOT (LIENZO PURO)
        if usar_sort:
            snapshot_oraciones_raw = procesar_oraciones_de_palabras(palabras_raw, None)
        else:
            # Lógica de columnas manuales
            limites_v = [0] + sorted(lista_cortes_v or []) + [pagina.rect.width]
            temp_snapshot = []
            for i in range(len(limites_v) - 1):
                x_min, x_max = limites_v[i], limites_v[i+1]
                y_min, y_max = 0, pagina.rect.height
                if limites_h and str(i) in limites_h:
                    y_min, y_max = limites_h[str(i)]
                
                col = [p for p in palabras_raw if (p[0]+p[2])/2 >= x_min and (p[0]+p[2])/2 < x_max and (p[1]+p[3])/2 >= y_min and (p[1]+p[3])/2 <= y_max]
                if col:
                    col.sort(key=lambda w: (int(w[1]/10), w[0]))
                    temp_snapshot.extend(procesar_oraciones_de_palabras(col, None))
            snapshot_oraciones_raw = temp_snapshot

        # Procesado final con filtros actuales
        def procesar_con_filtros(lista_oraciones_raw):
            procesadas = []
            for oracion in lista_oraciones_raw:
                texto_crudo = " ".join([p['texto'] for p in oracion['palabras']])
                pack = aplicar_reemplazos(texto_crudo, dict_activo, filtros_ui)
                texto_final = pack[0] if isinstance(pack, tuple) else pack
                
                procesadas.append({
                    "texto": texto_final,
                    "rects": oracion['rects'],
                    "palabras": oracion['palabras']
                })
            return procesadas

        oraciones_finales = procesar_con_filtros(snapshot_oraciones_raw)
        print(f"📸 Página {num} procesada. Oraciones: {len(oraciones_finales)}")

        return {
            "imagen": f"data:image/jpeg;base64,{img_data}",
            "oraciones": oraciones_finales,
            "palabras": mapa_palabras,
            "total_paginas": len(doc),
            "factor_zoom": zoom,
            "ancho_img": int(pagina.rect.width * zoom),
            "alto_img": int(pagina.rect.height * zoom),
            "ancho_pagina_pdf": pagina.rect.width,
            "alto_pagina_pdf": pagina.rect.height
        }
    except Exception as e:
        print(f"🔥 Error en obtener_pagina_data: {e}")
        return None

def obtener_solo_texto_pagina_ligera(num, dict_activo):
    """Extrae oraciones de una página sin renderizar imágenes ni snapshots visuales."""
    global doc
    if not doc or num < 0 or num >= len(doc): 
        return []
    try:
        pagina = doc[num]
        # Extraemos palabras con orden lógico, pero SIN generar pixmaps (CPU 0%)
        palabras_raw = pagina.get_text("words", sort=True)
        if len(palabras_raw) < 5:
            # Intentar leer desde caché OCR o generar OCR si es escaneado
            pix = pagina.get_pixmap(dpi=150)
            palabras_ocr = procesar_ocr_pagina(
                pixmap_bytes=pix.tobytes("png"),
                ancho_pdf=pagina.rect.width,
                alto_pdf=pagina.rect.height,
                ancho_px=pix.width,
                alto_px=pix.height,
                doc_path=getattr(doc, "name", "doc_actual"),
                num_pagina=num,
                forzar=False
            )
            if palabras_ocr:
                palabras_raw = palabras_ocr
        
        # Reutilizamos tu segmentador. Al pasar None como dict_activo aquí, 
        # forzamos a que procesar_oraciones no intente limpiezas visuales extra.
        oraciones_raw = procesar_oraciones_de_palabras(palabras_raw, None)
        
        textos_limpios = []
        for oracion in oraciones_raw:
            # Unimos las palabras de la oración
            texto_crudo = " ".join([p['texto'] for p in oracion['palabras']]).strip()
            pack = aplicar_reemplazos(texto_crudo, dict_activo)
            texto_final = pack[0] if isinstance(pack, tuple) else pack
            if texto_final and isinstance(texto_final, str):
                textos_limpios.append(texto_final)
        
        return textos_limpios
    except Exception as e:
        print(f"⚠️ Error ligero en pág {num}: {e}")
        return []

@eel.expose
def forzar_ocr_pagina_actual(num=None, lista_cortes_v=None, limites_h=None, dict_activo=None):
    """Fuerza el re-procesamiento con RapidOCR de la página solicitada o activa."""
    global doc, pagina_actual_global
    if not doc:
        return {"exito": False, "error": "No hay ningún documento abierto"}
    target_num = pagina_actual_global if num is None else num
    try:
        data = obtener_pagina_data(target_num, lista_cortes_v, limites_h, dict_activo, forzar_ocr=True)
        if data:
            return {"exito": True, "data": data, "pagina": target_num}
        else:
            return {"exito": False, "error": "No se pudo procesar la página con OCR"}
    except Exception as e:
        print(f"🔥 Error forzando OCR: {e}")
        return {"exito": False, "error": str(e)}

abortar_batch_ocr = False
hilo_batch_ocr = None

@eel.expose
def detectar_si_documento_es_escaneado():
    """Detecta si el documento actual es escaneado / pura imagen analizando las primeras páginas."""
    global doc
    if not doc or len(doc) == 0:
        return {"es_escaneado": False, "total_paginas": 0}
    try:
        total = len(doc)
        doc_path = getattr(doc, "name", "")
        muestras = min(3, total)
        paginas_sin_texto = 0
        
        for i in range(muestras):
            pag = doc[i]
            palabras = pag.get_text("words")
            if len(palabras) < 5:
                paginas_sin_texto += 1
        
        es_escaneado = (paginas_sin_texto >= (muestras / 2.0))
        total_en_cache = sum(1 for i in range(total) if esta_en_cache_ocr(doc_path, i))
        
        return {
            "es_escaneado": bool(es_escaneado),
            "total_paginas": total,
            "doc_path": doc_path,
            "paginas_en_cache": total_en_cache,
            "completamente_cacheado": total_en_cache >= total
        }
    except Exception as e:
        print(f"⚠️ Error detectando tipo de documento: {e}")
        return {"es_escaneado": False, "total_paginas": len(doc) if doc else 0}

@eel.expose
def pre_cache_ocr_pagina(num):
    """Pre-escanea en segundo plano la página indicada (Lookahead OCR)."""
    global doc
    if not doc or num < 0 or num >= len(doc):
        return False
    doc_path = getattr(doc, "name", "")
    if esta_en_cache_ocr(doc_path, num):
        return True
        
    def worker():
        try:
            pag = doc[num]
            if len(pag.get_text("words")) < 5:
                pix = pag.get_pixmap(dpi=150)
                procesar_ocr_pagina(
                    pixmap_bytes=pix.tobytes("png"),
                    ancho_pdf=pag.rect.width,
                    alto_pdf=pag.rect.height,
                    ancho_px=pix.width,
                    alto_px=pix.height,
                    doc_path=doc_path,
                    num_pagina=num,
                    forzar=False
                )
        except Exception as e:
            print(f"⚠️ Error en pre_cache_ocr página {num}: {e}")
            
    threading.Thread(target=worker, daemon=True).start()
    return True

@eel.expose
def ejecutar_batch_ocr(inicio=0):
    """Ejecuta el reconocimiento OCR para todo el documento en segundo plano con notificación de progreso."""
    global doc, abortar_batch_ocr, hilo_batch_ocr
    if not doc:
        return {"exito": False, "error": "No hay documento abierto"}
        
    abortar_batch_ocr = False
    doc_path = getattr(doc, "name", "")
    total = len(doc)

    def worker_batch():
        global abortar_batch_ocr
        print(f"⚡ [BATCH OCR] Iniciando escaneo completo de {total} páginas...")
        for p in range(inicio, total):
            if abortar_batch_ocr:
                print(f"⏹️ [BATCH OCR] Cancelado por el usuario en página {p}/{total}")
                break
            try:
                if not esta_en_cache_ocr(doc_path, p):
                    pag = doc[p]
                    if len(pag.get_text("words")) < 5:
                        pix = pag.get_pixmap(dpi=150)
                        procesar_ocr_pagina(
                            pixmap_bytes=pix.tobytes("png"),
                            ancho_pdf=pag.rect.width,
                            alto_pdf=pag.rect.height,
                            ancho_px=pix.width,
                            alto_px=pix.height,
                            doc_path=doc_path,
                            num_pagina=p,
                            forzar=False
                        )
                pct = int(((p + 1) / total) * 100)
                if hasattr(eel, "actualizar_progreso_ocr_batch"):
                    eel.actualizar_progreso_ocr_batch(p + 1, total, pct)()
            except Exception as ex:
                print(f"⚠️ [BATCH OCR] Error en página {p}: {ex}")

        if hasattr(eel, "finalizar_batch_ocr"):
            eel.finalizar_batch_ocr(not abortar_batch_ocr)()

    hilo_batch_ocr = threading.Thread(target=worker_batch, daemon=True)
    hilo_batch_ocr.start()
    return {"exito": True}

@eel.expose
def cancelar_batch_ocr():
    """Cancela la ejecución del lote de OCR."""
    global abortar_batch_ocr
    abortar_batch_ocr = True
    return True
def pre_renderizar_bloque_paginas(lista_paginas, voz, velocidad, dict_activo, trad_config=None):
    global hilo_rendimiento_actual, abortar_renderizado
    
    # 🛡️ CANCELACIÓN AGRESIVA: Si el usuario cambia de página o selección, 
    # matamos el renderizado anterior para no generar lag.
    abortar_renderizado = True 
    
    def worker():
        global abortar_renderizado
        time.sleep(0.1) # Breve pausa para limpieza de hilos
        abortar_renderizado = False
        
        if not lista_paginas: return

        actual = lista_paginas[0]
        # Prioridad 1: Página Actual (Hoja 1)
        # Prioridad 2: Página Siguiente (Hoja 2)
        # Prioridad 3: Página Anterior (Hoja 3)
        orden = [actual]
        if actual + 1 < len(doc): orden.append(actual + 1)
        if actual - 1 >= 0: orden.append(actual - 1)

        print(f"🚀 [NITRO] Priorizando bloque de audio: {orden} con voz: {voz}")
        
        from concurrent.futures import ThreadPoolExecutor
        es_edge = not voz.startswith("Local-") and not any(nombre in voz for nombre in NOMBRES_ONECORE_LOCALES)
        max_trabajadores = 5 if es_edge else 2

        # Analizar configuración de traducción para audio pre-renderizado
        trad_activa = trad_config.get("activa", False) if isinstance(trad_config, dict) else False
        trad_modo = trad_config.get("modo", "subtitulos") if trad_activa else "subtitulos"
        trad_orig = trad_config.get("origen", "auto") if trad_activa else "auto"
        trad_dest = trad_config.get("destino", "es") if trad_activa else "es"
        trad_motor = trad_config.get("motor", "online") if trad_activa else "online"

        for num_pag in orden:
            if abortar_renderizado: return
            
            # Extraer oraciones de forma ligera (0% GPU/Imagen)
            textos = obtener_solo_texto_pagina_ligera(num_pag, dict_activo)
            es_prioridad_max = (num_pag == actual)
            
            # Construir la lista de textos a hornear según el modo
            textos_a_hornear = []
            for frase in textos:
                if not frase or not frase.strip(): continue
                frase_limpia = frase.strip()
                
                if trad_activa and trad_modo == "solo_traduccion":
                    # Solo necesitamos el audio de la traducción
                    res = traductor_global.traducir(frase_limpia, trad_orig, trad_dest, trad_motor)
                    txt_trad = res.get("traducido") or frase_limpia
                    textos_a_hornear.append(txt_trad)
                elif trad_activa and trad_modo == "aprendizaje":
                    # Necesitamos el audio original Y el de la traducción
                    textos_a_hornear.append(frase_limpia)
                    res = traductor_global.traducir(frase_limpia, trad_orig, trad_dest, trad_motor)
                    txt_trad = res.get("traducido")
                    if txt_trad and txt_trad != frase_limpia:
                        textos_a_hornear.append(txt_trad)
                else:
                    # Modo normal o subtítulos (solo audio original)
                    textos_a_hornear.append(frase_limpia)
            
            def hornear_frase(frase):
                if abortar_renderizado or not frase or not frase.strip():
                    return
                t_id = normalizar_texto(frase) + str(voz)
                if t_id not in pasteleria_dict and t_id not in textos_en_proceso:
                    try:
                        textos_en_proceso.add(t_id)
                        res = cocinar_ahora_pro(frase, voz, velocidad, es_prioridad_max)
                        if res and "pcm" in res and len(res["pcm"]) > 0:
                            pasteleria_dict[t_id] = res
                    except Exception as e:
                        print(f"⚠️ Error horneando frase: {e}")
                    finally:
                        if t_id in textos_en_proceso:
                            textos_en_proceso.remove(t_id)

            if es_edge:
                with ThreadPoolExecutor(max_workers=max_trabajadores) as pool:
                    futures = [pool.submit(hornear_frase, f) for f in textos_a_hornear]
                    for f in futures:
                        if abortar_renderizado:
                            pool.shutdown(wait=False, cancel_futures=True)
                            return
                        try:
                            f.result()
                        except Exception:
                            pass
            else:
                for frase in textos_a_hornear:
                    if abortar_renderizado: return
                    hornear_frase(frase)

        print(f"✨ [NITRO] Pre-renderizado de audio completado para páginas {orden}")

    hilo_rendimiento_actual = threading.Thread(target=worker, daemon=True)
    hilo_rendimiento_actual.start()

@eel.expose
def pretraducir_bloque_paginas(num_pagina_central, origen="auto", destino="es", motor="online", incluir_adyacentes=True):
    """
    Pre-traduce en segundo plano las oraciones con orden estricto de prioridad:
    1) Hoja Actual (num_pagina_central)
    2) Hoja Siguiente (num_pagina_central + 1)
    3) Hoja Anterior (num_pagina_central - 1)
    Procesa de forma concurrente para máxima velocidad (~1s por hoja).
    """
    global hilo_pretraduccion_actual, abortar_pretraduccion, doc
    if not doc:
        return
    
    abortar_pretraduccion = True
    
    def worker_traduccion():
        global abortar_pretraduccion
        time.sleep(0.08)
        abortar_pretraduccion = False
        
        total = len(doc)
        if num_pagina_central < 0 or num_pagina_central >= total:
            return
            
        # 🎯 ORDEN ESTRICTO: 1) Hoja Actual, 2) Hoja Siguiente, 3) Hoja Anterior
        orden = [num_pagina_central]
        if incluir_adyacentes:
            if num_pagina_central + 1 < total:
                orden.append(num_pagina_central + 1)
            if num_pagina_central - 1 >= 0:
                orden.append(num_pagina_central - 1)
                
        print(f"🌐 [PRE-TRADUCCIÓN NITRO] Procesando bloque en orden: {orden} ({origen} ➔ {destino}, motor: {motor})")
        
        from concurrent.futures import ThreadPoolExecutor
        
        for p_num in orden:
            if abortar_pretraduccion:
                print("🛑 [PRE-TRADUCCIÓN] Cancelada por cambio de página.")
                return
                
            frases = obtener_solo_texto_pagina_ligera(p_num, None)
            frases_a_traducir = []
            
            for frase in frases:
                if not frase or not isinstance(frase, str) or not frase.strip():
                    continue
                txt_limpio = frase.strip()
                key = traductor_global._generar_key(txt_limpio, origen, destino)
                cached_val = traductor_global.cache.get(key)
                if not cached_val or not traductor_global._es_traduccion_valida(txt_limpio, cached_val, origen, destino):
                    frases_a_traducir.append(txt_limpio)
            
            if frases_a_traducir:
                def _traducir_tarea(txt):
                    if abortar_pretraduccion: return
                    try:
                        traductor_global.traducir(txt, origen, destino, motor)
                    except Exception as err:
                        print(f"⚠️ [PRE-TRADUCCIÓN] Error en frase: {err}")

                with ThreadPoolExecutor(max_workers=4) as pool:
                    futures = [pool.submit(_traducir_tarea, t) for t in frases_a_traducir]
                    for f in futures:
                        if abortar_pretraduccion:
                            pool.shutdown(wait=False, cancel_futures=True)
                            return
                        try:
                            f.result()
                        except Exception:
                            pass
            
            # Guardamos caché de disco al finalizar cada hoja
            traductor_global._guardar_cache()
            print(f"✨ [PRE-TRADUCCIÓN] Hoja {p_num} traducida y lista.")
                        
        print(f"✅ [PRE-TRADUCCIÓN] Bloque completo de páginas {orden} 100% listo.")

    hilo_pretraduccion_actual = threading.Thread(target=worker_traduccion, daemon=True)
    hilo_pretraduccion_actual.start()
    
    #========================
    #/////Modo Teatro////////
    #========================
   # Lógica conceptual en Python para el cambio de voz
def procesar_audio_teatro(texto, voz_narrador, db_teatro):
    # 1. ¿Hay un nombre al inicio? (Ej: "Sergio: Hola")
    match = re.match(r"^([^:]+):", texto)
    if match:
        personaje = match.group(0) # "Sergio:"
        reparto_activo = consolidar_reparto(db_teatro)
        
        if personaje in reparto_activo:
            # 🎭 CAMBIO DE ACTOR: Mutilamos el nombre para el audio
            texto_limpio = texto.replace(personaje, "").strip()
            voz_personaje = reparto_activo[personaje]
            return texto_limpio, voz_personaje
            
    return texto, voz_narrador 
    
def filtrar_texto_teatro(texto_oracion, voz_default, db_teatro):
    """
    Detecta si la oración inicia con un personaje y cambia la voz.
    Recorta el nombre del audio para mantener la fluidez narrativa.
    """
    # 1. Buscamos el patrón "Nombre:" al inicio
    match = re.match(r"^([^:]+):", texto_oracion)
    
    if match:
        nombre_detectado = match.group(0) # Ej: "Sergio:"
        
        # 2. Verificamos si el actor está en el reparto activo
        reparto = obtener_reparto_consolidado(db_teatro)
        
        if nombre_detectado in reparto:
            # 🎭 CAMBIO DE ACTOR: Mutilamos el nombre del texto para el audio
            texto_para_audio = texto_oracion.replace(nombre_detectado, "").strip()
            voz_a_usar = reparto[nombre_detectado]
            return texto_para_audio, voz_personaje
            
    # Si no hay match, usamos la voz que el usuario eligió en el HUD (Narrador)
    return texto_oracion, voz_default 
    
def obtener_reparto_consolidado(db_teatro, obra_nombre):
    """Extrae solo los actores encendidos de la obra seleccionada."""
    if not db_teatro or obra_nombre not in db_teatro:
        return {}
    
    actores_raw = db_teatro[obra_nombre].get("actors", {})
    # Solo devolvemos los que tienen el switch 'on'
    return {nombre: data["voz"] for nombre, data in actores_raw.items() if data.get("on", True)}
    
# --- RESTO DE UTILIDADES ---
@eel.expose
def buscar_texto_avanzado(query):
    global doc
    if not doc or not query: return []
    
    resultados = []
    for i in range(len(doc)):
        pagina = doc[i]
        # Obtenemos las coordenadas (quads) de cada coincidencia
        instancias = pagina.search_for(query)
        
        if instancias:
            texto_puro = pagina.get_text("text").replace("\n", " ")
            idx = texto_puro.lower().find(query.lower())
            inicio = max(0, idx - 40)
            fin = min(len(texto_puro), idx + len(query) + 40)
            snippet = "..." + texto_puro[inicio:fin].strip() + "..."
            
            # Guardamos la primera coordenada para el resaltado visual
            # Convertimos el objeto Rect a una lista simple [x0, y0, x1, y1]
            coords = [instancias[0].x0, instancias[0].y0, instancias[0].x1, instancias[0].y1]
            
            resultados.append({
                "pagina": i + 1,
                "frase": snippet,
                "coords": coords # 🔑 Enviamos el mapa visual al JS
            })
            if len(resultados) > 50: break
            
    return resultados

@eel.expose
def system_media_play_pause():
    import backend.media_control
    safe_async_run(backend.media_control.media_controller.toggle_play_pause())

@eel.expose
def system_media_next():
    import backend.media_control
    safe_async_run(backend.media_control.media_controller.skip_next())

@eel.expose
def system_media_prev():
    import backend.media_control
    if backend.media_control.WINSDK_AVAILABLE:
        safe_async_run(backend.media_control.media_controller.skip_previous())

@eel.expose
def system_media_status():
    import backend.media_control
    if backend.media_control.WINSDK_AVAILABLE:
        return safe_async_run(backend.media_control.media_controller.get_playback_status())
    return False

@eel.expose
def backend_trigger_duck():
    import backend.media_control
    backend.media_control.trigger_duck()

@eel.expose
def backend_trigger_unduck():
    import backend.media_control
    backend.media_control.trigger_unduck()

@eel.expose
def set_persistent_duck(active, nivel):
    import backend.media_control
    if active:
        duck_level = float(nivel) / 100.0
        safe_async_run(backend.media_control.media_controller.apply_persistent_duck(duck_level))
    else:
        safe_async_run(backend.media_control.media_controller.remove_persistent_duck())

@eel.expose
def traducir_texto_backend(texto, origen="auto", destino="es", motor="hibrido"):
    print(f"🌐 [TRADUCTOR ENTRADA] ({origen} -> {destino} | {motor}): '{texto[:60]}...'")
    res = traductor_global.traducir(texto, origen, destino, motor)
    print(f"🌐 [TRADUCTOR SALIDA] ({res.get('motor_usado', motor)}): '{res.get('traducido', '')[:60]}...'")
    return {
        "texto_traducido": res.get("traducido", texto),
        "traducido": res.get("traducido", texto),
        "origen_detectado": res.get("origen", origen),
        "destino": res.get("destino", destino),
        "motor_usado": res.get("motor_usado", motor),
        "exito": res.get("exito", False)
    }

@eel.expose
def obtener_catalogo_idiomas_traduccion():
    return IDIOMAS_SOPORTADOS

@eel.expose
def limpiar_cache_traducciones():
    """Limpia la memoria RAM y el archivo de disco de la caché de traducciones."""
    return traductor_global.limpiar_cache()

# =============================================================================
# 10. MÓDULO RAG DE INTELIGENCIA ARTIFICIAL (OLLAMA + CHROMADB)
# =============================================================================
@eel.expose
def rag_verificar_estado():
    """Retorna el diagnóstico completo de Ollama, modelos y ChromaDB."""
    return rag_global.verificar_estado_ia()

@eel.expose
def rag_indexar_documento_actual(dict_activo=None):
    """
    Extrae todas las oraciones del PDF actualmente abierto y las ingesta en ChromaDB.
    """
    global doc
    if not doc:
        return {"exito": False, "error": "No hay ningún documento PDF abierto en LiraLoud."}
    
    doc_id = os.path.basename(doc.name) if (doc and doc.name) else "documento_actual"
    todas_oraciones = []
    bloques_paginas_texto = []
    
    try:
        total_pags = len(doc)
        for num_pag in range(total_pags):
            pag = doc[num_pag]
            texto_raw_pag = pag.get_text("text").strip()
            if texto_raw_pag:
                bloques_paginas_texto.append(f"--- PÁGINA {num_pag + 1} ---\n{texto_raw_pag}")

            palabras_raw = pag.get_text("words")
            if not palabras_raw:
                continue
            oraciones_pag = procesar_oraciones_de_palabras(palabras_raw, dict_activo or {})
            for o in oraciones_pag:
                t = o.get("texto", "").strip() if isinstance(o, dict) else str(o).strip()
                if t:
                    todas_oraciones.append({"pagina": num_pag + 1, "texto": t})
        
        if not todas_oraciones and not bloques_paginas_texto:
            return {"exito": False, "error": "No se encontraron oraciones legibles en el PDF."}
        
        texto_completo_doc = "\n\n".join(bloques_paginas_texto) if bloques_paginas_texto else None

        res = rag_global.ingestar_documento(
            doc_id=doc_id,
            lista_oraciones=todas_oraciones,
            limite_chars=1200,
            metadata_extra={"nombre_archivo": doc_id, "total_paginas": total_pags},
            texto_completo=texto_completo_doc
        )
        return res
    except Exception as e:
        print(f"❌ [RAG] Error indexando documento: {e}")
        return {"exito": False, "error": str(e)}

@eel.expose
def rag_buscar_coordenadas_fuente(pagina, texto_snippet=None):
    """
    Busca las coordenadas de todas las líneas/oraciones del chunk en una página de PDF
    utilizando correspondencia de n-gramas por palabras y líneas en PyMuPDF.
    """
    global doc
    if not doc:
        return {"exito": False, "error": "No hay PDF activo"}
    try:
        pag_idx = int(pagina) - 1
        if pag_idx < 0 or pag_idx >= len(doc):
            return {"exito": False, "error": "Página fuera de rango"}
        
        pag = doc[pag_idx]
        doc_id = os.path.basename(doc.name) if (doc and doc.name) else "documento_actual"
        chunks = rag_global.documentos_chunks.get(doc_id, [])

        # Si no vino snippet o es muy corto, buscar en los chunks guardados de RAG para esta página
        if not texto_snippet or len(str(texto_snippet).strip()) < 5:
            for c in chunks:
                if c.get("pagina_inicio") == int(pagina) or c.get("pagina_fin") == int(pagina):
                    texto_snippet = c.get("texto", "")
                    break

        snippet_clean = re.sub(r'\[.*?\]', '', str(texto_snippet or "")).strip()
        todos_rects = []

        words_pagina = pag.get_text("words")  # (x0, y0, x1, y1, word, block_no, line_no, word_no)
        
        # --- ESTRATEGIA 1: Correspondencia de N-gramas de palabras consecutivas ---
        if words_pagina and snippet_clean:
            palabras_snippet = [re.sub(r'^\W+|\W+$', '', w.lower()) for w in re.findall(r'\b\w+\b', snippet_clean) if len(w) > 1]
            palabras_pag_limpias = [re.sub(r'^\W+|\W+$', '', w[4].lower()) for w in words_pagina]

            if palabras_snippet and palabras_pag_limpias:
                coincidentes_idxs = set()
                # Probar ventanas de 5, 4, 3 y 2 palabras consecutivas
                for tam_ventana in [5, 4, 3, 2]:
                    if len(palabras_snippet) >= tam_ventana and len(palabras_pag_limpias) >= tam_ventana:
                        for i in range(len(palabras_snippet) - tam_ventana + 1):
                            ventana = palabras_snippet[i : i + tam_ventana]
                            for j in range(len(palabras_pag_limpias) - tam_ventana + 1):
                                if palabras_pag_limpias[j : j + tam_ventana] == ventana:
                                    for k in range(j, j + tam_ventana):
                                        coincidentes_idxs.add(k)
                        if len(coincidentes_idxs) >= 4:
                            break

                if coincidentes_idxs:
                    # Agrupar palabras coincidentes por bloque y línea de texto
                    lineas_dict = {}
                    for idx in sorted(coincidentes_idxs):
                        w = words_pagina[idx]
                        key = (w[5], w[6])  # (block_no, line_no)
                        if key not in lineas_dict:
                            lineas_dict[key] = []
                        lineas_dict[key].append(w)

                    for key, l_words in lineas_dict.items():
                        todos_rects.append([
                            min(w[0] for w in l_words),
                            min(w[1] for w in l_words),
                            max(w[2] for w in l_words),
                            max(w[3] for w in l_words)
                        ])

        # --- ESTRATEGIA 2: Búsqueda por subfrases con search_for ---
        if not todos_rects and snippet_clean:
            segmentos = [s.strip() for s in re.split(r'[\n\.\?!;:]+', snippet_clean) if len(s.strip()) > 6]
            for seg in segmentos[:20]:
                sub = seg[:60].strip()
                rects = pag.search_for(sub)
                if not rects:
                    palabras = [w for w in re.findall(r'\b[\w-]{4,}\b', seg)]
                    if len(palabras) >= 3:
                        frase = " ".join(palabras[:3])
                        rects = pag.search_for(frase)
                
                for r in rects:
                    coord = [r.x0, r.y0, r.x1, r.y1]
                    if not any(abs(c[0]-coord[0]) < 1 and abs(c[1]-coord[1]) < 1 for c in todos_rects):
                        todos_rects.append(coord)

    # --- ESTRATEGIA 3: Fallback a líneas individuales superiores si no hubo coincidencia ---
        if not todos_rects:
            if words_pagina:
                # Agrupar las primeras palabras por su línea real para evitar cajas gigantescas
                primeras_palabras = words_pagina[:12]
                lineas_fb = {}
                for w in primeras_palabras:
                    key = (w[5], w[6])
                    if key not in lineas_fb:
                        lineas_fb[key] = []
                    lineas_fb[key].append(w)
                for key, l_words in lineas_fb.items():
                    todos_rects.append([
                        min(w[0] for w in l_words),
                        min(w[1] for w in l_words),
                        max(w[2] for w in l_words),
                        max(w[3] for w in l_words)
                    ])

        if not todos_rects:
            return {"exito": False, "pagina": int(pagina), "error": "No se pudieron obtener coordenadas en la página"}

        # Ordenar de arriba a abajo
        todos_rects.sort(key=lambda r: (r[1], r[0]))

        min_x0 = min(r[0] for r in todos_rects)
        min_y0 = min(r[1] for r in todos_rects)
        max_x1 = max(r[2] for r in todos_rects)
        max_y1 = max(r[3] for r in todos_rects)
        bbox = [min_x0, min_y0, max_x1, max_y1]

        return {
            "exito": True,
            "pagina": int(pagina),
            "rects": todos_rects,
            "coords": todos_rects[0],
            "bbox": bbox
        }
    except Exception as e:
        print(f"⚠️ [RAG] Error buscando coordenadas del chunk: {e}")
        return {"exito": False, "error": str(e)}

@eel.expose
def rag_preguntar(pregunta, doc_id=None, top_k=10, modo_salida="trazabilidad"):
    """Consulta semántica y analítica al documento actual con soporte de Doble Modo."""
    global doc
    if not doc_id:
        doc_id = os.path.basename(doc.name) if (doc and doc.name) else "documento_actual"
    
    # Auto-indexación preventiva si aún no se ha indexado el documento
    if doc and doc_id not in rag_global.documentos_chunks:
        try:
            rag_indexar_documento_actual()
        except Exception as e:
            print(f"⚠️ [RAG] Auto-indexación preventiva: {e}")

    return rag_global.preguntar_al_documento(
        doc_id=doc_id,
        pregunta=pregunta,
        top_k=int(top_k),
        modo_salida=modo_salida
    )

@eel.expose
def rag_ejecutar_solicitud(tipo_solicitud, doc_id=None, prompt_personalizado=None, modo_salida="trazabilidad"):
    """
    Ejecuta tareas analíticas y resúmenes sobre el documento:
    - 'resumen' / 'academico': Resumen analítico y metodológico estructurado
    - 'conclusiones': Extracción de conclusiones y resultados numéricos
    - 'conceptos': Glosario y explicación de términos técnicos
    - 'flashcards': Preguntas y respuestas de estudio
    - 'personalizado': Prompt libre
    """
    global doc
    if not doc_id:
        doc_id = os.path.basename(doc.name) if (doc and doc.name) else "documento_actual"
    
    # Auto-indexación preventiva
    if doc and doc_id not in rag_global.documentos_chunks:
        try:
            rag_indexar_documento_actual()
        except Exception as e:
            print(f"⚠️ [RAG] Auto-indexación preventiva: {e}")

    if tipo_solicitud == "academico":
        return rag_global.resumir_documento(doc_id=doc_id, enfoque="academico", modo_salida=modo_salida)
    elif tipo_solicitud == "resumen":
        return rag_global.resumir_documento(doc_id=doc_id, enfoque="general", modo_salida=modo_salida)
    elif tipo_solicitud in ["conceptos", "glosario"]:
        return rag_global.preguntar_al_documento(doc_id=doc_id, pregunta="", tipo_solicitud="conceptos", modo_salida=modo_salida)
    elif tipo_solicitud == "conclusiones":
        return rag_global.preguntar_al_documento(doc_id=doc_id, pregunta="", tipo_solicitud="conclusiones", modo_salida=modo_salida)
    elif tipo_solicitud == "analisis_critico":
        return rag_global.preguntar_al_documento(doc_id=doc_id, pregunta="", tipo_solicitud="analisis_critico", modo_salida=modo_salida)
    elif tipo_solicitud == "flashcards":
        prompt_flashcards = (
            "Genera 5 preguntas clave de autoevaluación o estudio con sus respectivas respuestas detalladas basadas exclusivamente en el documento.\n"
            "Formato:\n"
            "**Pregunta 1:** [Pregunta clave] `[Pág. X]`\n"
            "**Respuesta 1:** [Respuesta completa y fundamentada]\n"
            "(Continúa con las preguntas 2 a 5)."
        )
        return rag_global.preguntar_al_documento(doc_id=doc_id, pregunta=prompt_flashcards, top_k=12, modo_salida=modo_salida)
    
    pregunta_final = prompt_personalizado if (tipo_solicitud == "personalizado" and prompt_personalizado) else str(tipo_solicitud)
    return rag_global.preguntar_al_documento(doc_id=doc_id, pregunta=pregunta_final, top_k=12, modo_salida=modo_salida)

@eel.expose
def rag_obtener_historial_chat(doc_id=None):
    """Obtiene el historial de conversación persistente guardado para el documento actual."""
    global doc
    if not doc_id:
        doc_id = os.path.basename(doc.name) if (doc and doc.name) else "documento_actual"
    return {
        "exito": True,
        "doc_id": doc_id,
        "historial": rag_global.obtener_historial_chat(doc_id)
    }

@eel.expose
def rag_limpiar_historial_chat(doc_id=None):
    """Limpia el historial de conversación del documento actual."""
    global doc
    if not doc_id:
        doc_id = os.path.basename(doc.name) if (doc and doc.name) else "documento_actual"
    rag_global.limpiar_historial_chat(doc_id)
    return {"exito": True, "doc_id": doc_id}

@eel.expose
def rag_cambiar_modelos(chat_model=None, embed_model=None):
    """Actualiza los modelos en la instancia global de RAG."""
    if chat_model:
        rag_global.chat_model = chat_model
    if embed_model:
        rag_global.embed_model = embed_model
    return {"exito": True, "chat_model": rag_global.chat_model, "embed_model": rag_global.embed_model}

@eel.expose
def rag_configurar_proveedor(proveedor, api_key=None, modelo_cloud=None):
    """Configura el proveedor de IA activo (ollama, gemini, groq, openai, deepseek) y sus credenciales locales."""
    return rag_global.configurar_proveedor(proveedor=proveedor, api_key=api_key or "", modelo_cloud=modelo_cloud or "")

@eel.expose
def rag_verificar_conexion_cloud(proveedor, api_key=None, modelo_cloud=None):
    """Verifica la conexión con la API en la nube del proveedor especificado."""
    return rag_global.verificar_conexion_cloud(proveedor=proveedor, api_key=api_key or "", modelo=modelo_cloud or "")

@eel.expose
def rag_obtener_modelos_proveedor(proveedor, api_key=None):
    """Consulta en tiempo real la lista de modelos activos y soportados directamente por la API del proveedor."""
    return rag_global.obtener_modelos_disponibles(proveedor=proveedor, api_key=api_key or "")

@eel.expose
def rag_obtener_estadisticas_tokens(proveedor=None):
    """Retorna las estadísticas en tiempo real del uso y límite de tokens para el proveedor consultado."""
    return rag_global.obtener_estadisticas_tokens(proveedor=proveedor)

@eel.expose
def rag_sincronizar_tokens_api(proveedor=None, api_key=None):
    """Sincroniza y consulta en tiempo real los límites y tokens consumidos directamente con la API del proveedor."""
    return rag_global.sincronizar_tokens_api(proveedor=proveedor, api_key=api_key or "")

@eel.expose
def rag_contar_tokens_gemini(texto, modelo=None, api_key=None):
    """Calcula el número exacto de tokens usando el endpoint oficial :countTokens de Google Gemini."""
    return rag_global.contar_tokens_gemini(texto=texto, modelo=modelo, api_key=api_key)

@eel.expose
def abrir_enlace_externo(url):
    """Abre un enlace web seguro en el navegador predeterminado del usuario."""
    try:
        import webbrowser
        if url and (url.startswith("http://") or url.startswith("https://")):
            webbrowser.open(url)
            return {"exito": True}
        return {"exito": False, "error": "URL no válida"}
    except Exception as e:
        return {"exito": False, "error": str(e)}

import os
liraloud_profile = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'LiraLoudProfile')

def al_cerrar_aplicacion(page, sockets):
    try:
        import backend.media_control
        backend.media_control.restaurar_volumenes_salida()
    except Exception:
        pass

# --- INICIO DE LA INTERFAZ ---
eel.start(
    'index.html', 
    mode='edge', 
    size=(1350, 950), 
    port=0, 
    cmdline_args=[f'--icon-it-path={ICONO_PATH}', f'--user-data-dir={liraloud_profile}'],
    close_callback=al_cerrar_aplicacion
)

# Garantizar restauración si el bucle termina
try:
    import backend.media_control
    backend.media_control.restaurar_volumenes_salida()
except Exception:
    pass
