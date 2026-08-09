# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

# -*- coding: utf-8 -*-
"""
Módulo de Traducción Híbrida y Resiliente para LiraLoud
Soporta:
- Online Multi-Fuente (Google GTX -> Google ClientDict -> MyMemory API)
- Offline Ultrarrápido (Argos Translate / Modelos locales CTranslate2)
- Híbrido Inteligente (Online con fallback automático a Offline)
- Caché persistente con validación anti-corrupción (nunca guarda textos sin traducir)
"""

import os
import json
import urllib.request
import urllib.parse
import hashlib
import time
import threading

RUTA_CACHE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "traducciones_cache.json")

# Catálogo estándar de idiomas compatibles
IDIOMAS_SOPORTADOS = [
    {"codigo": "es", "nombre": "Español (Spanish)"},
    {"codigo": "en", "nombre": "Inglés (English)"},
    {"codigo": "fr", "nombre": "Francés (Français)"},
    {"codigo": "de", "nombre": "Alemán (Deutsch)"},
    {"codigo": "it", "nombre": "Italiano (Italiano)"},
    {"codigo": "pt", "nombre": "Portugués (Português)"},
    {"codigo": "ru", "nombre": "Ruso (Русский)"},
    {"codigo": "zh-CN", "nombre": "Chino Simplificado (中文)"},
    {"codigo": "ja", "nombre": "Japonés (日本語)"},
    {"codigo": "ko", "nombre": "Coreano (한국어)"},
    {"codigo": "ar", "nombre": "Árabe (العربية)"},
    {"codigo": "hi", "nombre": "Hindi (हिन्दी)"},
    {"codigo": "bn", "nombre": "Bengalí (বাংলা)"}
]

def _log(msg: str):
    try:
        print(msg)
    except Exception:
        try:
            print(msg.encode('ascii', errors='replace').decode('ascii'))
        except Exception:
            pass

# Configurar Stanza / Argos en modo 100% Offline (Evita que Stanza intente conectar a raw.githubusercontent.com)
try:
    import logging
    logging.getLogger('stanza').setLevel(logging.ERROR)
    import stanza
    from stanza.pipeline.core import DownloadMethod
    _orig_stanza_init = stanza.Pipeline.__init__
    def _patched_stanza_init(self, *args, **kwargs):
        if 'download_method' not in kwargs:
            kwargs['download_method'] = DownloadMethod.REUSE_RESOURCES
        if 'logging_level' not in kwargs:
            kwargs['logging_level'] = 'ERROR'
        return _orig_stanza_init(self, *args, **kwargs)
    stanza.Pipeline.__init__ = _patched_stanza_init
except Exception:
    pass

class GestorTraduccionHibrida:
    def __init__(self):
        self.cache = {}
        self._modelos_argos = {}
        self._lock = threading.Lock()
        self._argos_init_lock = threading.Lock()
        self._rate_limiter_lock = threading.Lock()
        self._ultimo_request_time = 0.0
        self._online_reintento_despues = 0.0
        self._timer_guardado = None
        self._cargar_y_sanitizar_cache()
        self._iniciar_calentamiento_argos()

    def _iniciar_calentamiento_argos(self):
        """Carga en segundo plano el modelo local de ArgosTranslate para que la traducción offline sea instantánea."""
        def _warmup():
            try:
                with self._argos_init_lock:
                    if ('en', 'es') in self._modelos_argos:
                        return
                    import argostranslate.translate
                    installed = argostranslate.translate.get_installed_languages()
                    from_lang = next((l for l in installed if l.code == 'en'), None)
                    to_lang = next((l for l in installed if l.code == 'es'), None)
                    if from_lang and to_lang:
                        trans = from_lang.get_translation(to_lang)
                        if trans:
                            with self._lock:
                                self._modelos_argos[('en', 'es')] = trans
                            trans.translate("Hello")
                            _log("[TRADUCCION OFFLINE] Motor Argos (en->es) pre-cargado y listo en RAM.")
            except Exception as e:
                _log(f"[TRADUCCION OFFLINE] Aviso pre-carga Argos: {e}")

        t = threading.Thread(target=_warmup, daemon=True)
        t.start()

    def _cargar_y_sanitizar_cache(self):
        if os.path.exists(RUTA_CACHE):
            try:
                with open(RUTA_CACHE, "r", encoding="utf-8") as f:
                    raw_cache = json.load(f)
                    self.cache = {}
                    # Sanitizar entradas corruptas o no strings
                    for k, v in raw_cache.items():
                        if v and isinstance(v, str) and v.strip():
                            self.cache[k] = v.strip()
            except Exception as e:
                _log(f"[TRADUCCION] No se pudo leer cache de traduccion: {e}")
                self.cache = {}
        else:
            self.cache = {}

    def limpiar_cache(self):
        """Borra la caché tanto de la memoria RAM activa como del archivo en disco."""
        with self._lock:
            self.cache = {}
            if self._timer_guardado and self._timer_guardado.is_alive():
                try:
                    self._timer_guardado.cancel()
                except Exception:
                    pass
            try:
                with open(RUTA_CACHE, "w", encoding="utf-8") as f:
                    json.dump({}, f, indent=2)
                _log("[TRADUCCION] Cache de traduccion limpiada al 100% (RAM y Disco).")
                return True
            except Exception as e:
                _log(f"[TRADUCCION] Error al limpiar archivo de cache: {e}")
                return False

    def _guardar_cache(self):
        with self._lock:
            try:
                with open(RUTA_CACHE, "w", encoding="utf-8") as f:
                    json.dump(self.cache, f, ensure_ascii=False, indent=2)
            except Exception as e:
                _log(f"[TRADUCCION] Error al guardar cache: {e}")

    def _programar_guardado_cache(self):
        """Guarda la caché a disco de forma diferida (debounced) para no ahogar la I/O."""
        if self._timer_guardado and self._timer_guardado.is_alive():
            return
        self._timer_guardado = threading.Timer(1.5, self._guardar_cache)
        self._timer_guardado.daemon = True
        self._timer_guardado.start()

    def _generar_key(self, texto: str, origen: str, destino: str) -> str:
        clave_cruda = f"{origen.strip().lower()}->{destino.strip().lower()}::{texto.strip()}"
        return hashlib.md5(clave_cruda.encode("utf-8")).hexdigest()

    def _pacing_online(self):
        """Previene llamadas simultáneas explosivas contra la API online."""
        with self._rate_limiter_lock:
            ahora = time.time()
            delta = ahora - self._ultimo_request_time
            if delta < 0.04:  # Mínimo 40ms entre peticiones online
                time.sleep(0.04 - delta)
            self._ultimo_request_time = time.time()

    def _traducir_online_google_gtx(self, texto: str, sl: str, tl: str) -> str:
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={urllib.parse.quote(sl)}&tl={urllib.parse.quote(tl)}&dt=t&q={urllib.parse.quote(texto)}"
        req = urllib.request.Request(
            url, 
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
        )
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
                frases_traducidas = [frag[0] for frag in data[0] if frag and len(frag) > 0 and frag[0]]
                res = "".join(frases_traducidas).strip()
                if res: return res
        raise ValueError("Respuesta vacía de Google GTX")

    def _traducir_online_google_dict(self, texto: str, sl: str, tl: str) -> str:
        url = f"https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl={urllib.parse.quote(sl)}&tl={urllib.parse.quote(tl)}&q={urllib.parse.quote(texto)}"
        req = urllib.request.Request(
            url, 
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if isinstance(data, list) and len(data) > 0:
                if isinstance(data[0], str) and data[0]:
                    return data[0].strip()
                elif isinstance(data[0], list) and len(data[0]) > 0:
                    return "".join(data[0]).strip()
        raise ValueError("Respuesta vacía de Google Dict")

    def _traducir_online_mymemory(self, texto: str, sl: str, tl: str) -> str:
        src = "en" if sl == "auto" else sl
        url = f"https://api.mymemory.translated.net/get?q={urllib.parse.quote(texto)}&langpair={urllib.parse.quote(src)}|{urllib.parse.quote(tl)}"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            res = data.get("responseData", {}).get("translatedText")
            if res and isinstance(res, str) and res.strip():
                return res.strip()
        raise ValueError("Respuesta vacía de MyMemory")

    def _traducir_online(self, texto: str, origen: str = "auto", destino: str = "es") -> str:
        """Traducción online robusta con multi-fallback y bypass instantáneo si estamos desconectados."""
        if time.time() < self._online_reintento_despues:
            raise RuntimeError("Sin conexión a internet (Bypass rápido a Offline)")

        sl = "auto" if not origen or origen == "auto" else origen.lower()
        tl = destino.lower() if destino else "es"
        
        self._pacing_online()

        # Intento 1: Google GTX
        try:
            res = self._traducir_online_google_gtx(texto, sl, tl)
            self._online_reintento_despues = 0.0  # Conexión confirmada exitosa
            return res
        except Exception:
            pass

        # Intento 2: Google Dict API
        try:
            res = self._traducir_online_google_dict(texto, sl, tl)
            self._online_reintento_despues = 0.0
            return res
        except Exception:
            pass

        # Intento 3: MyMemory API
        try:
            res = self._traducir_online_mymemory(texto, sl, tl)
            self._online_reintento_despues = 0.0
            return res
        except Exception:
            pass

        # Si todos fallaron, activar cooldown offline por 20 segundos para no bloquear la app
        self._online_reintento_despues = time.time() + 20.0
        raise RuntimeError("Todos los endpoints de traducción online fallaron")

    def _asegurar_paquete_argos(self, from_code: str, to_code: str):
        """Descarga e instala el modelo offline de ArgosTranslate si no está disponible y hay internet."""
        try:
            import argostranslate.package
            import argostranslate.translate
            
            installed_languages = argostranslate.translate.get_installed_languages()
            from_lang = next((l for l in installed_languages if l.code == from_code), None)
            to_lang = next((l for l in installed_languages if l.code == to_code), None)
            
            if from_lang and to_lang and from_lang.get_translation(to_lang):
                return True

            if time.time() < self._online_reintento_despues:
                return False

            _log(f"📥 [TRADUCCIÓN OFFLINE] Descargando modelo {from_code} -> {to_code}...")
            argostranslate.package.update_package_index()
            available = argostranslate.package.get_available_packages()
            pkg = next(filter(lambda x: x.from_code == from_code and x.to_code == to_code, available), None)
            if pkg:
                download_path = pkg.download()
                argostranslate.package.install_from_path(download_path)
                _log(f"✅ [TRADUCCIÓN OFFLINE] Modelo {from_code} -> {to_code} instalado con éxito.")
                return True
        except Exception as e:
            _log(f"⚠️ [TRADUCCIÓN OFFLINE] No se pudo auto-instalar modelo {from_code}->{to_code}: {e}")
        return False

    def _traducir_offline(self, texto: str, origen: str = "auto", destino: str = "es") -> str:
        """Traducción offline ultrarrápida mediante ArgosTranslate (CTranslate2 local) con caché en RAM."""
        try:
            import argostranslate.translate
            
            from_code = "en" if not origen or origen == "auto" else origen.lower().split('-')[0]
            to_code = destino.lower().split('-')[0] if destino else "es"
            par = (from_code, to_code)
            
            with self._lock:
                translation = self._modelos_argos.get(par)
            
            if not translation:
                with self._argos_init_lock:
                    translation = self._modelos_argos.get(par)
                    if not translation:
                        installed_languages = argostranslate.translate.get_installed_languages()
                        from_lang = next((l for l in installed_languages if l.code == from_code), None)
                        to_lang = next((l for l in installed_languages if l.code == to_code), None)
                        if from_lang and to_lang:
                            translation = from_lang.get_translation(to_lang)
                        
                        if not translation:
                            if self._asegurar_paquete_argos(from_code, to_code):
                                installed_languages = argostranslate.translate.get_installed_languages()
                                from_lang = next((l for l in installed_languages if l.code == from_code), None)
                                to_lang = next((l for l in installed_languages if l.code == to_code), None)
                                if from_lang and to_lang:
                                    translation = from_lang.get_translation(to_lang)
                        
                        if translation:
                            with self._lock:
                                self._modelos_argos[par] = translation

            if translation:
                res = translation.translate(texto).strip()
                if res:
                    return res
        except Exception as e:
            _log(f"❌ [TRADUCCIÓN OFFLINE] Error en motor local: {e}")
        
        raise RuntimeError("Motor offline no disponible o sin modelo para el par solicitado")

    def _es_traduccion_valida(self, texto_original: str, texto_traducido: str, origen: str, destino: str) -> bool:
        """Valida que la traducción realmente transformó el texto y no devolvió el original por error."""
        if not texto_traducido or not isinstance(texto_traducido, str) or not texto_traducido.strip():
            return False
        
        t_orig = texto_original.strip().lower()
        t_trad = texto_traducido.strip().lower()
        
        from_code = "auto" if not origen else origen.lower().split('-')[0]
        to_code = "es" if not destino else destino.lower().split('-')[0]
        if from_code != "auto" and from_code == to_code:
            return True
            
        # Si origen != destino pero el texto resultante es idéntico al original de más de 5 letras, no es traducción válida
        if len(t_orig) > 5 and t_orig == t_trad:
            return False
            
        return True

    def traducir(self, texto: str, origen: str = "auto", destino: str = "es", motor: str = "hibrido") -> dict:
        """
        Traduce un fragmento de texto con la estrategia especificada.
        motor: 'hibrido', 'online', 'offline'
        """
        if not texto or not texto.strip():
            return {"traducido": "", "texto_traducido": "", "origen": origen, "destino": destino, "motor_usado": motor, "exito": True}

        texto_limpio = texto.strip()
        key_cache = self._generar_key(texto_limpio, origen, destino)

        # 1. Verificar Caché en Memoria / Disco
        if key_cache in self.cache:
            valor_cache = self.cache[key_cache]
            if self._es_traduccion_valida(texto_limpio, valor_cache, origen, destino):
                return {
                    "traducido": valor_cache,
                    "texto_traducido": valor_cache,
                    "origen": origen,
                    "origen_detectado": origen,
                    "destino": destino,
                    "motor_usado": "cache",
                    "exito": True
                }
            else:
                # Entrada corrupta o idéntica al original: eliminar de caché
                with self._lock:
                    self.cache.pop(key_cache, None)

        resultado_texto = ""
        motor_utilizado = motor

        # 2. Ejecutar según motor con cascada de seguridad inteligente
        if motor == "online":
            try:
                resultado_texto = self._traducir_online(texto_limpio, origen, destino)
                motor_utilizado = "online"
            except Exception as e:
                _log(f"⚠️ [TRADUCCIÓN ONLINE] Falló online ({e}), recurriendo a Argos offline...")
                try:
                    resultado_texto = self._traducir_offline(texto_limpio, origen, destino)
                    motor_utilizado = "offline (fallback)"
                except Exception as e_off:
                    _log(f"❌ [TRADUCCIÓN] Fallaron online y offline: {e_off}")
                    resultado_texto = texto_limpio
                    motor_utilizado = "original"

        elif motor == "offline":
            try:
                resultado_texto = self._traducir_offline(texto_limpio, origen, destino)
                motor_utilizado = "offline"
            except Exception as e:
                _log(f"⚠️ [TRADUCCIÓN OFFLINE] Falló offline ({e}), recurriendo a online...")
                try:
                    resultado_texto = self._traducir_online(texto_limpio, origen, destino)
                    motor_utilizado = "online (fallback)"
                except Exception as e_on:
                    _log(f"❌ [TRADUCCIÓN] Fallaron offline y online: {e_on}")
                    resultado_texto = texto_limpio
                    motor_utilizado = "original"

        else:  # Híbrido (Auto)
            try:
                resultado_texto = self._traducir_online(texto_limpio, origen, destino)
                motor_utilizado = "online"
            except Exception as e:
                _log(f"⚠️ [TRADUCCIÓN HÍBRIDA] Online no disponible ({e}), pasando a offline Argos...")
                try:
                    resultado_texto = self._traducir_offline(texto_limpio, origen, destino)
                    motor_utilizado = "offline"
                except Exception as e_off:
                    _log(f"❌ [TRADUCCIÓN HÍBRIDA] Falló offline: {e_off}")
                    resultado_texto = texto_limpio
                    motor_utilizado = "original"

        # 3. Guardar en Caché SÓLO SI LA TRADUCCIÓN ES VÁLIDA
        if self._es_traduccion_valida(texto_limpio, resultado_texto, origen, destino):
            with self._lock:
                self.cache[key_cache] = resultado_texto
            self._programar_guardado_cache()
            exito = True
        else:
            exito = False

        return {
            "traducido": resultado_texto,
            "texto_traducido": resultado_texto,
            "origen": origen,
            "origen_detectado": origen,
            "destino": destino,
            "motor_usado": motor_utilizado,
            "exito": exito
        }

    def pretraducir_textos_async(self, lista_textos: list, origen: str = "auto", destino: str = "es", motor: str = "online"):
        """
        Pre-traduce una lista de textos en segundo plano de forma no bloqueante.
        """
        def _tarea():
            if not lista_textos:
                return
            count = 0
            for txt in lista_textos:
                if not txt or not isinstance(txt, str) or not txt.strip():
                    continue
                txt_limpio = txt.strip()
                key = self._generar_key(txt_limpio, origen, destino)
                if key not in self.cache:
                    try:
                        self.traducir(txt_limpio, origen, destino, motor)
                        count += 1
                        time.sleep(0.02)
                    except Exception as e:
                        _log(f"⚠️ [PRE-TRADUCCIÓN] Error en fragmento: {e}")
            if count > 0:
                _log(f"✨ [PRE-TRADUCCIÓN] {count} oraciones cacheadas con éxito.")

        t = threading.Thread(target=_tarea, daemon=True)
        t.start()

# Instancia singleton para uso en todo el backend
traductor_global = GestorTraduccionHibrida()
