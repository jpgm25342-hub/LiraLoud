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

from backend.core.gestor_archivos import (
    cargar_ajustes_lectura,
    cargar_diccionario,
    cargar_diccionario_teatro,
    validar_json
)
from backend.core.utils import crear_regex_inmune_acentos, normalizar_texto
from backend.documento.ocr_engine import procesar_ocr_pagina
from backend.audio.kokoro_engine import kokoro_engine_global, es_voz_kokoro

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
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIRECTORIO_PIPER_DEFAULT = os.path.join(BASE_DIR, "piper_voices")

# Asegurar que el FFmpeg que viaja junto al ejecutable (instalador) sea encontrado
if BASE_DIR and BASE_DIR not in os.environ.get('PATH', '').split(os.pathsep):
    os.environ['PATH'] = BASE_DIR + os.pathsep + os.environ.get('PATH', '')


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

        if es_voz_kokoro(voz_objetivo):
            res = kokoro_engine_global.sintetizar(texto=texto, voz_id=voz_objetivo, velocidad=velocidad)
            if res and res.get("pcm"):
                return {"pcm": res["pcm"], "sr": res.get("sr", 24000)}
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
        voz_default: str = "es-MX-DaliaNeural",
        aplicar_layout: bool = True,
    ) -> List[Tuple[str, str]]:
        """
        Prepara la lista de (texto_frase, voz_asignada) usando el mismo pipeline
        de segmentación y filtros que el karaoke en vivo.
        """
        if not doc or num_pag < 0 or num_pag >= len(doc):
            return []

        from backend.core.estado_global import estado_app
        from backend.core.gestor_archivos import cargar_progreso_libro
        from backend.documento.gestor_documento_rpc import (
            _extraer_palabras_con_tipografia,
            _filtrar_palabras_por_exclusiones,
        )
        from backend.documento.procesador_texto import (
            organizar_palabras_con_cortes_y_limites,
            procesar_oraciones_de_palabras,
            aplicar_reemplazos,
        )

        pagina = doc[num_pag]
        ajustes = cargar_ajustes_lectura()
        if dict_activo is None:
            dict_activo = cargar_diccionario()

        if filtros is None:
            filtros = {
                "chk-urls": ajustes.get("omitirUrls", False),
                "chk-paren": ajustes.get("omitirParen", False),
                "chk-corch": ajustes.get("omitirCorch", False),
                "chk-llaves": ajustes.get("omitirLlaves", False),
                "chk-barras": ajustes.get("omitirBarras", False),
                "chk-referencias": ajustes.get("omitirSuperindices", ajustes.get("omitirReferencias", True)),
                "chk-superindices": ajustes.get("omitirSuperindices", ajustes.get("omitirReferencias", True)),
                "chk-subindices": ajustes.get("omitirSubindices", False),
            }
        filtros = {
            **filtros,
            "usarBloquesNativos": ajustes.get("usarBloquesNativos", True),
            "sensibilidadSalto": float(ajustes.get("sensibilidadSalto", 0.5)),
            "detectarSangria": ajustes.get("detectarSangria", True),
            "modo_teatro": bool(modo_teatro),
            "obra_actual": str(obra_actual or "General"),
        }

        pag_cortes_v = []
        pag_limites_h = {}
        pag_zonas = []
        est_ia = None
        doc_path = getattr(doc, "name", "") or ""

        if aplicar_layout:
            lay_mem = estado_app.layouts_por_pagina.get(int(num_pag))
            if isinstance(lay_mem, dict):
                pag_cortes_v = lay_mem.get("cortesV") or []
                pag_limites_h = lay_mem.get("limitesH") or {}
                pag_zonas = lay_mem.get("zonasExcluidas") or []
                est_ia = lay_mem.get("estructura")
            elif doc_path:
                prog = cargar_progreso_libro(doc_path)
                layouts = prog.get("layouts", {}) if isinstance(prog, dict) else {}
                pag_layout = layouts.get(str(num_pag), {})
                pag_cortes_v = pag_layout.get("cortesV", [])
                pag_limites_h = pag_layout.get("limitesH", {})
                pag_zonas = pag_layout.get("zonasExcluidas", [])

        tiene_cortes_v = bool(pag_cortes_v and len(pag_cortes_v) > 0)
        tiene_limites_h = any(
            isinstance(lim, (list, tuple)) and len(lim) >= 2 and (lim[0] > 5 or lim[1] < (pagina.rect.height - 5))
            for lim in (pag_limites_h or {}).values()
        )
        usar_sort = not tiene_cortes_v and not tiene_limites_h

        palabras_raw = _extraer_palabras_con_tipografia(pagina, sort=usar_sort)
        if not palabras_raw and ajustes.get("auto_ocr", True):
            try:
                pix = pagina.get_pixmap(dpi=150)
                palabras_raw = procesar_ocr_pagina(
                    pixmap_bytes=pix.tobytes("png"),
                    ancho_pdf=pagina.rect.width,
                    alto_pdf=pagina.rect.height,
                    ancho_px=pix.width,
                    alto_px=pix.height,
                    doc_path=doc_path or "doc_actual",
                    num_pagina=num_pag,
                    forzar=False,
                )
            except Exception as e:
                logger.warning(f"⚠️ No se pudo procesar OCR para la página {num_pag}: {e}")

        if aplicar_layout and pag_zonas:
            palabras_raw = _filtrar_palabras_por_exclusiones(palabras_raw, pag_zonas)

        if aplicar_layout and (tiene_cortes_v or tiene_limites_h):
            palabras_raw = organizar_palabras_con_cortes_y_limites(
                palabras_raw, pag_cortes_v, pag_limites_h, pagina.rect.width, pagina.rect.height
            )

        oraciones_raw = procesar_oraciones_de_palabras(palabras_raw, dict_activo, filtros_externos=filtros, estructura_ia=est_ia)
        oraciones_filtradas: List[Tuple[str, str]] = []

        for orac in oraciones_raw:
            txt_orac = str(orac.get("texto") or "").strip()
            if not txt_orac:
                continue
            pack = aplicar_reemplazos(
                txt_orac,
                dict_activo,
                filtros,
                modo_teatro=modo_teatro,
                obra_actual=obra_actual,
            )
            texto_final, voz_detectada = pack if isinstance(pack, tuple) else (pack, None)
            voz_actual = voz_detectada or (estado_app.voz_teatro_persistente if modo_teatro else None) or voz_default
            if texto_final and re.search(r"[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]", str(texto_final)):
                oraciones_filtradas.append((str(texto_final).strip(), voz_actual))

        return oraciones_filtradas

    def _es_inicio_seccion(self, texto: str) -> bool:
        t = (texto or "").strip()
        if not t or len(t) > 90:
            return False
        if re.match(r"^(?:cap[ií]tulo|secci[oó]n|parte|chapter|section|part|act|acto|escena)\b", t, re.IGNORECASE):
            return True
        letras = re.sub(r"[^a-zA-ZáéíóúÁÉÍÓÚñÑ]", "", t)
        return len(letras) >= 5 and letras.isupper() and len(t.split()) <= 10

    def _codificar_pista(self, ruta_wav: str, ruta_destino: str, es_mp3: bool) -> str:
        if es_mp3 and shutil.which("ffmpeg"):
            cmd = [
                "ffmpeg", "-y", "-i", ruta_wav,
                "-codec:a", "libmp3lame", "-b:a", "192k",
                ruta_destino,
            ]
            subprocess.run(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=0x08000000 if os.name == "nt" else 0,
            )
            if os.path.exists(ruta_wav):
                try:
                    os.remove(ruta_wav)
                except Exception:
                    pass
            return ruta_destino
        final_wav = ruta_destino.replace(".mp3", ".wav") if es_mp3 else ruta_destino
        if ruta_wav != final_wav and os.path.exists(ruta_wav):
            os.replace(ruta_wav, final_wav)
        return final_wav

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
        progress_callback: Optional[Callable[[int, int], None]] = None,
        opciones_corte: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Ejecuta la exportación a MP3/WAV con soporte de Modo Teatro (libro temporal),
        validación estricta de rango y cortes automáticos (único, página, sección, duración).
        """
        if not doc or len(doc) == 0:
            return {"exito": False, "mensaje": "Error: No hay documento cargado."}

        try:
            pag_ini = max(1, int(pag_ini))
            pag_fin = min(len(doc), int(pag_fin))
        except Exception:
            return {"exito": False, "mensaje": "Error: Rango de páginas inválido."}
        if pag_ini > pag_fin:
            return {"exito": False, "mensaje": f"Error: Rango inválido ({pag_ini} > {pag_fin})."}

        from backend.audio.pistas_exporter import (
            GestorPistasExportacion,
            es_inicio_seccion,
            extraer_mapa_capitulos_toc,
        )

        opts = opciones_corte if isinstance(opciones_corte, dict) else {}
        corte_modo = str(opts.get("corte_modo", "unico") or "unico").lower()
        corte_minutos = max(1.0, float(opts.get("corte_minutos", 15) or 15))
        corte_paginas = max(1, int(opts.get("corte_paginas", 1) or 1))
        max_segundos_pista = corte_minutos * 60.0
        empaquetar_zip = bool(opts.get("empaquetar_zip", True))
        usar_limites = bool(opts.get("usar_limites", True))
        libro_teatro = opts.get("libro_teatro") if isinstance(opts.get("libro_teatro"), list) else []
        trad_activa = bool(opts.get("traduccion_activa", False))
        trad_origen = str(opts.get("traduccion_origen", "auto") or "auto")
        trad_destino = str(opts.get("traduccion_destino", "es") or "es")
        trad_motor = str(opts.get("traduccion_motor", "hibrido") or "hibrido")
        trad_modo = str(opts.get("traduccion_modo", "solo_traduccion") or "solo_traduccion")

        traductor_global = None
        if trad_activa:
            from backend.ia.traductor import traductor_global as _tg
            traductor_global = _tg

        mapa_toc = extraer_mapa_capitulos_toc(doc) if corte_modo == "seccion" else {}
        libro_por_pag: Dict[int, List[Tuple[str, str]]] = {}
        if modo_teatro and libro_teatro:
            for item in libro_teatro:
                if not isinstance(item, dict):
                    continue
                p_idx = item.get("pagina")
                if p_idx is None:
                    continue
                p_num = int(p_idx)
                if (pag_ini - 1) <= p_num <= (pag_fin - 1):
                    txt_it = str(item.get("texto") or "").strip()
                    voz_it = str(item.get("voz") or voz_id)
                    if txt_it:
                        libro_por_pag.setdefault(p_num, []).append((txt_it, voz_it))

        with self._lock:
            self.exportacion_activa = True

        total_pags = max(1, pag_fin - pag_ini + 1)
        gestor = GestorPistasExportacion(ruta_salida, corte_modo, self.esta_activo)

        try:
            async def _proceso_asincrono():
                titulo_inicial = mapa_toc.get(pag_ini - 1, "") if corte_modo == "seccion" else ""
                gestor.abrir_nueva_pista(titulo_inicial)

                for p_idx in range(pag_ini - 1, pag_fin):
                    if not self.esta_activo():
                        break
                    hoja_actual = (p_idx - (pag_ini - 1)) + 1
                    if progress_callback:
                        progress_callback(hoja_actual, total_pags)

                    if corte_modo == "pagina" and p_idx > (pag_ini - 1) and ((p_idx - (pag_ini - 1)) % corte_paginas == 0) and gestor.seg_en_pista > 0:
                        gestor.abrir_nueva_pista(f"pag_{p_idx + 1}")
                    elif corte_modo == "seccion" and p_idx > (pag_ini - 1) and p_idx in mapa_toc and gestor.seg_en_pista > 0.5:
                        gestor.abrir_nueva_pista(mapa_toc[p_idx])

                    if p_idx in libro_por_pag:
                        oraciones = libro_por_pag[p_idx]
                    else:
                        oraciones = self.preparar_texto_pagina(
                            doc=doc,
                            num_pag=p_idx,
                            dict_activo=dict_activo,
                            modo_teatro=modo_teatro,
                            obra_actual=obra_actual,
                            voz_default=voz_id,
                            aplicar_layout=usar_limites,
                        )

                    for texto_frase, voz_frase in oraciones:
                        if not self.esta_activo():
                            break

                        if corte_modo == "seccion" and not mapa_toc and gestor.seg_en_pista > 0.5 and es_inicio_seccion(texto_frase):
                            gestor.abrir_nueva_pista(texto_frase)
                        elif corte_modo == "duracion" and gestor.seg_en_pista >= max_segundos_pista:
                            gestor.abrir_nueva_pista()

                        textos_sintesis = [texto_frase]
                        if trad_activa and traductor_global and texto_frase.strip():
                            res_trad = traductor_global.traducir(texto_frase, trad_origen, trad_destino, trad_motor)
                            txt_trad = (res_trad.get("traducido") or "").strip() if isinstance(res_trad, dict) else ""
                            if trad_modo == "aprendizaje":
                                if txt_trad and txt_trad != texto_frase.strip():
                                    textos_sintesis = [texto_frase, txt_trad]
                            elif txt_trad:
                                textos_sintesis = [txt_trad]

                        for txt_item in textos_sintesis:
                            if not self.esta_activo():
                                break
                            resultado = await self.generar_audio_oracion(
                                texto=txt_item,
                                voz_objetivo=voz_frase,
                                velocidad=velocidad_float,
                            )
                            if resultado and "pcm" in resultado and len(resultado["pcm"]) > 0:
                                gestor.escribir_pcm(resultado["pcm"], int(resultado.get("sr", 22050)))

                gestor.cerrar_pista_actual()

            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            loop.run_until_complete(_proceso_asincrono())

            if not self.esta_activo():
                gestor.limpiar_pistas()
                return {"exito": False, "mensaje": "⏹️ Exportación cancelada por el usuario."}

            if len(gestor.pistas_generadas) > 1 and empaquetar_zip:
                ruta_zip = gestor.empaquetar_zip()
                return {
                    "exito": True,
                    "pistas": [ruta_zip],
                    "cantidad_pistas": len(gestor.pistas_generadas),
                    "mensaje": f"✅ Exportación completada ({len(gestor.pistas_generadas)} pistas en ZIP):\n{ruta_zip}",
                }

            return {
                "exito": True,
                "pistas": gestor.pistas_generadas,
                "cantidad_pistas": len(gestor.pistas_generadas),
                "mensaje": f"✅ ¡Exportación completada exitosamente! ({len(gestor.pistas_generadas)} pista(s))\nGuardado en: {gestor.pistas_generadas[0] if gestor.pistas_generadas else ruta_salida}",
            }

        except Exception as e:
            logger.error(f"❌ Error durante la exportación de audio: {e}", exc_info=True)
            gestor.cerrar_pista_actual()
            return {"exito": False, "mensaje": f"❌ Error: {str(e)}"}
        finally:
            with self._lock:
                self.exportacion_activa = False


# Instancia global para ser utilizada en toda la aplicación
exportador_audio_global = ExportadorAudio()
