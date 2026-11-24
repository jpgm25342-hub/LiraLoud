# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import os
import sys
import ssl
import ctypes
import platform
import webview

from backend.core.logger_config import logger, configurar_captura_global

# 1. Inicializar captura persistente de stdout, stderr y excepciones no controladas en app.log
configurar_captura_global()

# 2. Configuración nativa de Windows (AppUserModelID, ocultar consola y certificados SSL)
if platform.system() == "Windows":
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("liraloud.reader.desktop.v1")
    except Exception:
        pass
    try:
        ctypes.windll.user32.ShowWindow(ctypes.windll.kernel32.GetConsoleWindow(), 0)
    except Exception:
        pass

try:
    import certifi
    if hasattr(ssl, "_create_default_https_context") and os.path.exists(certifi.where()):
        ssl._create_default_https_context = lambda: ssl.create_default_context(cafile=certifi.where())
except Exception:
    pass

# 3. Protocolo de identidad híbrida (EXE congelado vs Script de desarrollo)
from backend.core.estado_global import estado_app
from backend.core.webview_bridge import eel, puente_webview

if len(sys.argv) > 1:
    _arg_archivo = os.path.abspath(sys.argv[1])
    if os.path.isfile(_arg_archivo):
        try:
            import pathlib
            import requests
            _r_ping = requests.get("http://127.0.0.1:54321/ping", timeout=0.4)
            if _r_ping.ok:
                requests.post(
                    "http://127.0.0.1:54321/abrir",
                    json={"url": pathlib.Path(_arg_archivo).as_uri(), "titulo": os.path.basename(_arg_archivo)},
                    timeout=5,
                )
                sys.exit(0)
        except Exception:
            pass
        estado_app.archivo_inicial = _arg_archivo

if getattr(sys, "frozen", False):
    os.environ["ESPEAK_DATA_PATH"] = os.path.join(estado_app.bundle_dir, "piper", "espeak-ng-data")
    print("🚀 [SISTEMA] Modo EXE: Baipás de fonemas activo.")
else:
    print("💻 [SISTEMA] Modo Script: Rutas globales activas.")

os.makedirs(estado_app.directorio_piper, exist_ok=True)
eel.init("web")

# 4. Registrar todos los módulos RPC en el puente pywebview ANTES de crear la ventana
import backend.core.utils
import backend.core.gestor_archivos
import backend.estudio.gestor_notas
import backend.estudio.gestor_extracciones
import backend.documento.procesador_texto
import backend.estudio.web_reader
import backend.audio.gestor_voces_rpc
import backend.documento.gestor_documento_rpc
import backend.audio.motor_audio
import backend.audio.motor_audio_tutorial
import backend.estudio.servicios_rpc
import backend.audio.media_control
from backend.audio.motor_audio import iniciar_fuerza_laboral
from backend.estudio.servidor_extension import iniciar_servidor_extension

# 5. Iniciar workers de audio y servidor receptor de la extensión del navegador
iniciar_fuerza_laboral()

os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = (
    "--autoplay-policy=no-user-gesture-required "
    "--disable-background-timer-throttling "
    "--disable-backgrounding-occluded-windows "
    "--disable-renderer-backgrounding "
    "--disable-features=msSleepingTabs,msSleepingTabsForced,msResourceHeavyTabCPUOptimization,CalculateNativeWinOcclusion"
)

logger.info("🚀 Iniciando interfaz nativa con pywebview (Motor Edge WebView2)...")

try:
    iniciar_servidor_extension()
except Exception as e_ext:
    logger.warning(f"No se pudo iniciar el receptor de la extensión: {e_ext}")

# 6. Crear e iniciar la ventana principal nativa con pywebview
ruta_index_html = os.path.join(estado_app.bundle_dir, "web", "index.html")
if not os.path.exists(ruta_index_html):
    ruta_index_html = os.path.join(estado_app.base_dir, "web", "index.html")
ventana_principal = webview.create_window(
    title="LiraLoud",
    url=ruta_index_html,
    js_api=puente_webview.api_container,
    width=1350,
    height=950,
    min_size=(900, 620),
    text_select=True,
)


def al_mostrar_ventana_webview():
    """Fuerza la asignación del icono en la barra de tareas de Windows mediante Win32 API."""
    if sys.platform == "win32" and os.path.exists(estado_app.icono_path):
        try:
            hwnd = None
            if hasattr(ventana_principal, "native") and ventana_principal.native:
                hwnd = int(ventana_principal.native.Handle.ToInt64())
            if not hwnd:
                hwnd = ctypes.windll.user32.FindWindowW(None, "LiraLoud")
            if hwnd:
                hicon_big = ctypes.windll.user32.LoadImageW(None, estado_app.icono_path, 1, 0, 0, 0x00000010 | 0x00000040)
                hicon_small = ctypes.windll.user32.LoadImageW(None, estado_app.icono_path, 1, 16, 16, 0x00000010)
                if hicon_big:
                    ctypes.windll.user32.SendMessageW(hwnd, 0x0080, 1, hicon_big)
                if hicon_small:
                    ctypes.windll.user32.SendMessageW(hwnd, 0x0080, 0, hicon_small)
        except Exception as e_ico:
            logger.debug(f"Aviso fijando icono Win32: {e_ico}")


def al_cerrar_ventana_webview():
    logger.info("🔌 [PYWEBVIEW] Cerrando ventana principal de LiraLoud...")
    try:
        backend.audio.media_control.restaurar_volumenes_salida()
    except Exception as e:
        logger.error(f"Error restaurando volúmenes al cerrar: {e}")


ventana_principal.events.shown += al_mostrar_ventana_webview
ventana_principal.events.closed += al_cerrar_ventana_webview
puente_webview.vincular_ventana(ventana_principal)
webview.settings["OPEN_DEVTOOLS_IN_DEBUG"] = False

liraloud_profile = os.path.join(os.environ.get("LOCALAPPDATA", ""), "LiraLoudProfile")
webview.start(
    gui="edgechromium",
    http_server=True,
    debug=True,
    storage_path=liraloud_profile,
    icon=estado_app.icono_path if os.path.exists(estado_app.icono_path) else None,
)

logger.info("🛑 Bucle de pywebview finalizado.")
try:
    backend.audio.media_control.restaurar_volumenes_salida()
except Exception as e:
    logger.error(f"Error restaurando volúmenes al finalizar bucle: {e}")
