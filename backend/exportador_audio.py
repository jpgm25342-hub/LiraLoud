# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

"""
=============================================================================
LIRALOUD - MOTOR DE EXPORTACIÓN DE AUDIO DE ESTUDIO (MP3 / WAV)
=============================================================================
Módulo profesional y desacoplado para la generación y exportación de audios
completos desde documentos PDF/Word/OCR.

Soporta:
1. Motores de voz híbridos: Piper (Local ONNX), Edge-TTS (Nube) y Windows OneCore.
2. Integración con el pipeline de lectura:
   - Filtros de lectura (URLs, citas, paréntesis, corchetes, etc.)
   - Abreviaturas y Diccionario personalizado
   - OCR automático para páginas escaneadas/imágenes
   - Modo Teatro (cambio dinámico de voces según diálogos de personajes)
3. Formatos de salida: MP3 de alta fidelidad (192 kbps vía FFmpeg) y WAV PCM.
4. Control de ciclo de vida seguro y cancelación en tiempo real sin bloqueo de UI.
=============================================================================
"""

import os
import re
import sys
import time
import wave
import shutil
import asyncio
import logging
import threading
import subprocess
import numpy as np
from typing import Optional, Dict, Any, Callable, List, Tuple

import edge_tts
from piper.voice import PiperVoice
import onnxruntime as ort

from backend.gestor_archivos import (
    cargar_ajustes_lectura,
    cargar_diccionario,
    cargar_diccionario_teatro,
    validar_json
)
from backend.utils import crear_regex_inmune_acentos, normalizar_texto
from backend.ocr_engine import procesar_ocr_pagina

try:
    from winsdk.windows.media.speechsynthesis import SpeechSynthesizer
    from winsdk.windows.storage.streams import DataReader
    NOMBRES_ONECORE_LOCALES = [v.display_name for v in SpeechSynthesizer.all_voices]
except Exception:
    SpeechSynthesizer = None
    DataReader = None
    NOMBRES_ONECORE_LOCALES = []

logger = logging.getLogger("LiraAudioExporter")

# Rutas base
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRECTORIO_PIPER_DEFAULT = os.path.join(BASE_DIR, "piper_voices")


class ExportadorAudio:
    """
    Controlador maestro de exportación de audios para LiraLoud.
    Diseñado para ejecutarse en subprocesos/hilos sin bloquear Eel ni la interfaz.
    """

    def __init__(self, dir_piper: Optional[str] = None):
        self.dir_piper = dir_piper or DIRECTORIO_PIPER_DEFAULT
        self.exportacion_activa = False
        self._lock = threading.Lock()
        self.catalogo_edge_cache: Dict[str, str] = {}
        self.voces_piper_cache: Dict[str, PiperVoice] = {}

    def cancelar(self) -> bool:
        """Cancela de forma inmediata y segura cualquier exportación en curso."""
        with self._lock:
            self.exportacion_activa = False
        logger.info("⏹️ [ExportadorAudio] Orden de cancelación emitida.")
        return True

    def esta_activo(self) -> bool:
        with self._lock:
            return self.exportacion_activa

    async def resolver_identidad_voz(self, nombre_visual: str) -> str:
        """Resuelve el ID técnico exacto según el motor de voz correspondiente."""
        if not nombre_visual:
            return "es-MX-DaliaNeural"

        if nombre_visual.startswith("Local-"):
            return nombre_visual

        v_lower = nombre_visual.lower()
        if "-" in nombre_visual and "neural" in v_lower:
            return nombre_visual

        if "salome" in v_lower: return "es-CO-SalomeNeural"
        if "ramona" in v_lower: return "es-DO-RamonaNeural"
        if "dalia" in v_lower: return "es-MX-DaliaNeural"
        if "jorge" in v_lower: return "es-MX-JorgeNeural"
        if "elena" in v_lower: return "es-AR-ElenaNeural"
        if "tomas" in v_lower: return "es-AR-TomasNeural"

        if not self.catalogo_edge_cache:
            try:
                voces = await edge_tts.list_voices()
                for v in voces:
                    self.catalogo_edge_cache[v.get('FriendlyName', '')] = v.get('ShortName', '')
                    self.catalogo_edge_cache[v.get('ShortName', '')] = v.get('ShortName', '')
            except Exception as e:
                logger.warning(f"⚠️ Error cargando catálogo Edge TTS: {e}")

        return self.catalogo_edge_cache.get(nombre_visual, "es-MX-DaliaNeural")

    def _obtener_modelo_piper(self, nombre_modelo: str) -> Optional[PiperVoice]:
        """Carga o recupera de caché un modelo Piper ONNX optimizado."""
        path_onnx = os.path.join(self.dir_piper, nombre_modelo)
        if not os.path.exists(path_onnx):
            logger.error(f"❌ Modelo Piper no encontrado: {path_onnx}")
            return None

        if path_onnx in self.voces_piper_cache:
            return self.voces_piper_cache[path_onnx]

        try:
            hilos_so = os.cpu_count() or 4
            hilos_nitro = max(2, min(8, hilos_so // 2))

            sess_opts = ort.SessionOptions()
            sess_opts.intra_op_num_threads = hilos_nitro
            sess_opts.inter_op_num_threads = 1

            voice = PiperVoice.load(path_onnx, use_cuda=False)
            voice.session = ort.InferenceSession(path_onnx, sess_opts)
            self.voces_piper_cache[path_onnx] = voice
            return voice
        except Exception as e:
            logger.error(f"🔥 Error cargando Piper ONNX '{nombre_modelo}': {e}")
            return None

    def sintetizar_piper(self, texto: str, voz_id: str, velocidad: float) -> Optional[Dict[str, Any]]:
        """Sintetiza audio con el motor local Piper y devuelve PCM s16le a 22050Hz."""
        if not self.esta_activo():
            return None

        nombre_archivo = voz_id.replace("Local-", "").strip()
        voice = self._obtener_modelo_piper(nombre_archivo)
        if not voice:
            return None

        try:
            scale = 1.0 / max(0.2, min(5.0, float(velocidad)))
            phonemes = voice.phonemize(texto)
            id_map = voice.config.phoneme_id_map
            phoneme_ids = []

            for item in phonemes:
                if isinstance(item, list):
                    for sub in item:
                        if sub in id_map: phoneme_ids.extend(id_map[sub])
                elif item in id_map:
                    phoneme_ids.extend(id_map[item])

            final_ids = [0]
            for pid in phoneme_ids:
                final_ids.extend([pid, 0])

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
            pcm_bytes = (audio_output.squeeze() * 32767).clip(-32768, 32767).astype(np.int16).tobytes()

            return {
                "pcm": pcm_bytes,
                "sr": voice.config.sample_rate or 22050
            }
        except Exception as e:
            logger.error(f"🔥 Error en síntesis Piper: {e}")
            return None

    async def sintetizar_onecore(self, texto: str, voz_id: str, velocidad: float) -> Optional[Dict[str, Any]]:
        """Sintetiza audio con Windows SpeechSynthesizer y convierte a PCM 22050Hz."""
        if not self.esta_activo() or not SpeechSynthesizer:
            return None

        try:
            synth = SpeechSynthesizer()
            for v in SpeechSynthesizer.all_voices:
                if v.display_name in voz_id or voz_id in v.display_name:
                    synth.voice = v
                    break

            synth.options.speaking_rate = max(0.5, min(6.0, float(velocidad)))
            stream = await synth.synthesize_text_to_stream_async(texto)
            size = stream.size
            reader = DataReader(stream.get_input_stream_at(0))
            await reader.load_async(size)
            buffer = reader.read_buffer(size)
            wav_bytes = bytes(memoryview(buffer))

            if shutil.which("ffmpeg"):
                process = subprocess.Popen(
                    ['ffmpeg', '-y', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', '22050', 'pipe:1'],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                    creationflags=0x08000000 if os.name == 'nt' else 0
                )
                pcm_data, _ = process.communicate(input=wav_bytes)
                return {"pcm": pcm_data, "sr": 22050}
            return None
        except Exception as e:
            logger.error(f"🔥 Error en síntesis OneCore: {e}")
            return None

    async def sintetizar_edge(self, texto: str, voz_tecnica: str, velocidad: float) -> Optional[Dict[str, Any]]:
        """Descarga audio streaming desde Edge TTS y lo convierte a PCM 22050Hz con FFmpeg."""
        if not self.esta_activo():
            return None

        tasa_str = f"{int((velocidad - 1) * 100):+d}%"
        try:
            com = edge_tts.Communicate(texto, voz_tecnica, rate=tasa_str)
            mp3_data = b""
            async for chunk in com.stream():
                if not self.esta_activo():
                    return None
                if chunk["type"] == "audio":
                    mp3_data += chunk["data"]

            if not mp3_data or not self.esta_activo():
                return None

            if shutil.which("ffmpeg"):
                process = subprocess.Popen(
                    ['ffmpeg', '-y', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', '22050', 'pipe:1'],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                    creationflags=0x08000000 if os.name == 'nt' else 0
                )
                pcm_data, _ = process.communicate(input=mp3_data)
                return {"pcm": pcm_data, "sr": 22050}
            return None
        except Exception as e:
            logger.error(f"🔥 Error en síntesis Edge-TTS: {e}")
            return None

    async def generar_audio_oracion(self, texto: str, voz_objetivo: str, velocidad: float) -> Optional[Dict[str, Any]]:
        """Ruta unificada que delega al motor correspondiente según el tipo de voz."""
        if not self.esta_activo() or not texto.strip():
            return None

        if voz_objetivo.startswith("Local-"):
            return self.sintetizar_piper(texto, voz_objetivo, velocidad)

        if voz_objetivo.startswith("Microsoft") and any(n in voz_objetivo for n in NOMBRES_ONECORE_LOCALES):
            return await self.sintetizar_onecore(texto, voz_objetivo, velocidad)

        voz_final = await self.resolver_identidad_voz(voz_objetivo)
        return await self.sintetizar_edge(texto, voz_final, velocidad)

    def preparar_texto_pagina(
        self,
        doc: Any,
        num_pag: int,
        dict_activo: Optional[Dict[str, Any]] = None,
        filtros: Optional[Dict[str, Any]] = None,
        modo_teatro: bool = False,
        obra_actual: str = "General",
        voz_default: str = "es-MX-DaliaNeural"
    ) -> List[Tuple[str, str]]:
        """
        Extrae oraciones de la página aplicando la cadena completa de filtros,
        abreviaturas, OCR automático si es escaneado, y detección de personajes en Teatro.
        Devuelve lista de tuplas: [(texto_a_leer, voz_a_usar), ...]
        """
        if not doc or num_pag < 0 or num_pag >= len(doc):
            return []

        if filtros is None:
            ajustes = cargar_ajustes_lectura()
            filtros = {
                'chk-urls': ajustes.get('omitirUrls', False),
                'chk-paren': ajustes.get('omitirParen', False),
                'chk-corch': ajustes.get('omitirCorch', False),
                'chk-llaves': ajustes.get('omitirLlaves', False),
                'chk-barras': ajustes.get('omitirBarras', False),
                'chk-referencias': ajustes.get('omitirReferencias', True)
            }

        if dict_activo is None:
            dict_activo = cargar_diccionario()

        db_teatro = cargar_diccionario_teatro() if modo_teatro else {}

        pagina = doc[num_pag]
        palabras_raw = pagina.get_text("words", sort=True)

        # Fallback inteligente a OCR si la página es escaneada o solo imagen
        if len(palabras_raw) < 5:
            try:
                pix = pagina.get_pixmap(dpi=150)
                palabras_ocr = procesar_ocr_pagina(
                    pixmap_bytes=pix.tobytes("png"),
                    ancho_pdf=pagina.rect.width,
                    alto_pdf=pagina.rect.height,
                    ancho_px=pix.width,
                    alto_px=pix.height,
                    doc_path=getattr(doc, "name", "doc_actual"),
                    num_pagina=num_pag,
                    forzar=False
                )
                if palabras_ocr:
                    palabras_raw = palabras_ocr
            except Exception as e:
                logger.warning(f"⚠️ No se pudo procesar OCR para la página {num_pag}: {e}")

        # Extracción de bloques de texto
        bloques_texto: List[str] = []
        if palabras_raw:
            # Reconstrucción de texto a partir de palabras ordenadas
            linea_actual: List[str] = []
            ultimo_y = None
            for p in palabras_raw:
                w_texto = p[4] if len(p) > 4 else ""
                w_y0 = p[1] if len(p) > 1 else 0
                if ultimo_y is not None and abs(w_y0 - ultimo_y) > 8:
                    if linea_actual:
                        bloques_texto.append(" ".join(linea_actual))
                        linea_actual = []
                linea_actual.append(w_texto)
                ultimo_y = w_y0
            if linea_actual:
                bloques_texto.append(" ".join(linea_actual))
        else:
            bloques = pagina.get_text("blocks", sort=True)
            bloques_texto = [b[4].replace("\n", " ").strip() for b in bloques if b[6] == 0]

        texto_completo = " ".join(bloques_texto)
        if not texto_completo.strip():
            return []

        # 1. Filtros estructurales de bloque completo
        if filtros.get('chk-paren'): texto_completo = re.sub(r'\(.*?\)', '', texto_completo)
        if filtros.get('chk-corch'): texto_completo = re.sub(r'\[.*?\]', '', texto_completo)
        if filtros.get('chk-llaves'): texto_completo = re.sub(r'\{.*?\}', '', texto_completo)
        if filtros.get('chk-urls'):
            texto_completo = re.sub(r'https?://\S+|www\.\S+|\b\w+\.(?:com|org|net|edu|gov|mx)\b', '', texto_completo)
        if filtros.get('chk-barras'):
            texto_completo = texto_completo.replace('/', ' ').replace('\\', ' ')

        # 2. Protección decimal (36.5 -> 36 punto 5)
        texto_completo = re.sub(r'(\d)\.(\d)', r'\1 punto \2', texto_completo)

        # 3. Filtrado de referencias
        if filtros.get('chk-referencias'):
            texto_completo = re.sub(r'[⁰¹²³⁴⁵⁶⁷⁸⁹]', '', texto_completo)
            texto_completo = re.sub(r'\[\d{1,3}\]', '', texto_completo)
            texto_completo = re.sub(r'([a-zA-Záéíóúñ])\d{1,3}([.,;:?\s]|$)', r'\1\2', texto_completo)

        # 4. Segmentación en oraciones lógicas
        frases_crudas = re.split(r'(?<=[.?!;:])\s+', texto_completo)
        oraciones_filtradas: List[Tuple[str, str]] = []

        voz_personaje_persistente = None

        for frase in frases_crudas:
            frase = frase.strip()
            if not frase or not re.search(r'[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]', frase):
                continue

            voz_actual = voz_default

            # Modo Teatro: Detección de personaje
            if modo_teatro and db_teatro:
                try:
                    obra_data = db_teatro.get(obra_actual, {})
                    if isinstance(obra_data, dict) and obra_data.get("active", True):
                        reparto = obra_data.get("actors", {})
                        for actor_key, data in reparto.items():
                            if not data.get("on", True): continue
                            patron_nombre = crear_regex_inmune_acentos(actor_key)
                            regex_combate = rf"^\s*(?:(?:[\w\d]+\s+){{0,3}})?\b{patron_nombre}\s*[:](?:\s*,\s*)?"
                            match = re.search(regex_combate, frase, re.IGNORECASE)
                            if match:
                                voz_actual = data["voz"]
                                voz_personaje_persistente = voz_actual
                                frase = frase[match.end():].strip()
                                break
                        else:
                            if voz_personaje_persistente:
                                voz_actual = voz_personaje_persistente
                except Exception as e:
                    logger.warning(f"⚠️ Error evaluando teatro en frase: {e}")

            # Diccionario y Abreviaturas
            if dict_activo:
                for categoria in dict_activo.values():
                    if not isinstance(categoria, dict) or not categoria.get("active", True):
                        continue
                    terminos = categoria.get("terms", {})
                    claves_ordenadas = sorted(terminos.keys(), key=len, reverse=True)
                    for sigla in claves_ordenadas:
                        raw = terminos[sigla]
                        if isinstance(raw, dict) and not raw.get("on", True):
                            continue
                        significado = str(raw.get("val", "")) if isinstance(raw, dict) else str(raw)
                        s_esc = re.escape(sigla)
                        patron = f"(?i)(?<![a-zA-Z0-9_ÁÉÍÓÚáéíóúÑñüÜ]){s_esc}(?![a-zA-Z0-9_ÁÉÍÓÚáéíóúÑñüÜ])"
                        frase = re.sub(patron, f" {significado} ", frase)

            # Sanitización de caracteres extraños y espacios
            frase = re.sub(r'[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s\.\,\:\;\-\(\)\[\]\?\¿\!\¡\%\+\°\=\⁰\¹\²\³\⁴\⁵\⁶\⁷\⁸\⁹]', ' ', frase)
            frase = re.sub(r'[ \t]{2,}', ' ', frase).strip()

            if frase and re.search(r'[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]', frase):
                oraciones_filtradas.append((frase, voz_actual))

        return oraciones_filtradas

    def exportar_rango(
        self,
        doc: Any,
        pag_ini: int,
        pag_fin: int,
        voz_id: str,
        velocidad_float: float,
        ruta_salida: str,
        dict_activo: Optional[Dict[str, Any]] = None,
        modo_teatro: bool = False,
        obra_actual: str = "General",
        cortes_v: Optional[List[Any]] = None,
        limites_h: Optional[List[Any]] = None,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> Dict[str, Any]:
        """
        Ejecuta el proceso completo de exportación a archivo WAV/MP3.
        """
        if not doc:
            return {"exito": False, "mensaje": "Error: No hay documento cargado."}

        with self._lock:
            self.exportacion_activa = True

        total_pags = max(1, pag_fin - pag_ini + 1)
        paso_actual = 0

        es_mp3 = ruta_salida.lower().endswith(".mp3")
        ruta_wav_temp = ruta_salida if not es_mp3 else ruta_salida + ".temp.wav"

        # Archivo WAV receptor
        try:
            with wave.open(ruta_wav_temp, "wb") as wav_file:
                wav_file.setparams((1, 2, 22050, 0, 'NONE', 'not compressed'))
                header_listo = False

                async def _proceso_asincrono():
                    nonlocal paso_actual, header_listo
                    for i in range(pag_ini - 1, pag_fin):
                        if not self.esta_activo():
                            break

                        if i >= len(doc):
                            break

                        hoja_actual = (i - (pag_ini - 1)) + 1
                        if progress_callback:
                            progress_callback(hoja_actual, total_pags)

                        oraciones = self.preparar_texto_pagina(
                            doc=doc,
                            num_pag=i,
                            dict_activo=dict_activo,
                            modo_teatro=modo_teatro,
                            obra_actual=obra_actual,
                            voz_default=voz_id
                        )

                        for texto_frase, voz_frase in oraciones:
                            if not self.esta_activo():
                                break

                            resultado = await self.generar_audio_oracion(
                                texto=texto_frase,
                                voz_objetivo=voz_frase,
                                velocidad=velocidad_float
                            )

                            if resultado and "pcm" in resultado and len(resultado["pcm"]) > 0:
                                if not header_listo:
                                    wav_file.setframerate(resultado.get("sr", 22050))
                                    header_listo = True
                                wav_file.writeframes(resultado["pcm"])

                        paso_actual += 1
                        if progress_callback:
                            progress_callback(paso_actual, total_pags)

                # Ejecución en bucle asíncrono
                try:
                    loop = asyncio.get_event_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)

                loop.run_until_complete(_proceso_asincrono())

            # Verificación de cancelación
            if not self.esta_activo():
                if os.path.exists(ruta_wav_temp):
                    try: os.remove(ruta_wav_temp)
                    except Exception: pass
                return {"exito": False, "mensaje": "⏹️ Exportación cancelada por el usuario."}

            # Conversión a MP3 si fue solicitado
            if es_mp3:
                if shutil.which("ffmpeg"):
                    logger.info("🎼 [FFmpeg] Codificando a MP3 de 192kbps...")
                    cmd = [
                        'ffmpeg', '-y', '-i', ruta_wav_temp,
                        '-codec:a', 'libmp3lame', '-b:a', '192k',
                        ruta_salida
                    ]
                    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=0x08000000 if os.name == 'nt' else 0)
                    if os.path.exists(ruta_wav_temp):
                        try: os.remove(ruta_wav_temp)
                        except Exception: pass
                else:
                    # Si no hay FFmpeg, renombrar el temporal como WAV
                    os.replace(ruta_wav_temp, ruta_salida.replace(".mp3", ".wav"))
                    return {
                        "exito": True,
                        "mensaje": f"✅ Audio exportado en formato WAV (FFmpeg no disponible para MP3):\n{ruta_salida.replace('.mp3', '.wav')}"
                    }

            return {
                "exito": True,
                "mensaje": f"✅ ¡Exportación completada exitosamente!\nGuardado en: {ruta_salida}"
            }

        except Exception as e:
            logger.error(f"❌ Error durante la exportación de audio: {e}", exc_info=True)
            if os.path.exists(ruta_wav_temp):
                try: os.remove(ruta_wav_temp)
                except Exception: pass
            return {"exito": False, "mensaje": f"❌ Error: {str(e)}"}
        finally:
            with self._lock:
                self.exportacion_activa = False


# Instancia global para ser utilizada en toda la aplicación
exportador_audio_global = ExportadorAudio()
