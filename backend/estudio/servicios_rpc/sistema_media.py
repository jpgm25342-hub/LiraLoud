import os
import sys
import subprocess
import webbrowser

from backend.core.webview_bridge import eel, puente_webview
from backend.core.estado_global import estado_app
from backend.core.logger_config import logger
from backend.core.utils import safe_async_run
from backend.estudio.captura_pantalla import iniciar_captura_pantalla
from backend.estudio.servicios_rpc.comun import _get_media_control

# Exponer captura de pantalla OCR
eel.expose(iniciar_captura_pantalla)


# ==========================================
# 1. CONTROL MULTIMEDIA (SMTC) Y AUDIO DUCKING
# ==========================================
@eel.expose
def system_media_play_pause():
    safe_async_run(_get_media_control().media_controller.toggle_play_pause())


@eel.expose
def system_media_next():
    safe_async_run(_get_media_control().media_controller.skip_next())


@eel.expose
def system_media_prev():
    mc = _get_media_control()
    if mc.WINSDK_AVAILABLE:
        safe_async_run(mc.media_controller.skip_previous())


@eel.expose
def system_media_status():
    mc = _get_media_control()
    if mc.WINSDK_AVAILABLE:
        return safe_async_run(mc.media_controller.get_playback_status())
    return False


@eel.expose
def backend_trigger_duck():
    _get_media_control().trigger_duck()


@eel.expose
def backend_trigger_unduck():
    _get_media_control().trigger_unduck()


@eel.expose
def set_persistent_duck(active, nivel):
    mc = _get_media_control()
    if active:
        duck_level = float(nivel) / 100.0
        safe_async_run(mc.media_controller.apply_persistent_duck(duck_level))
    else:
        safe_async_run(mc.media_controller.remove_persistent_duck())


# ==========================================
# 2. UTILIDADES DE SISTEMA, LOGS, LEGALES Y TEXTO LIBRE
# ==========================================
@eel.expose
def abrir_enlace_externo(url):
    """Abre un enlace web seguro en el navegador predeterminado del usuario."""
    try:
        if url and (url.startswith("http://") or url.startswith("https://")):
            webbrowser.open(url)
            return {"exito": True}
        return {"exito": False, "error": "URL no válida"}
    except Exception as e:
        return {"exito": False, "error": str(e)}


@eel.expose
def abrir_documento_legal(nombre_archivo):
    base_dir = estado_app.base_dir
    ruta_raiz = os.path.join(base_dir, nombre_archivo)
    ruta_web = os.path.join(base_dir, "web", nombre_archivo)
    ruta_final = ruta_web if os.path.exists(ruta_web) else ruta_raiz

    if os.path.exists(ruta_final):
        try:
            if sys.platform == "win32":
                os.startfile(ruta_final)
            elif sys.platform == "darwin":
                subprocess.Popen(["open", ruta_final])
            else:
                subprocess.Popen(["xdg-open", ruta_final])
        except Exception as e:
            print(f"Error al abrir {nombre_archivo}: {e}")
    else:
        print(f"No se encontró el archivo: {nombre_archivo}")


@eel.expose
def ping_heartbeat(cliente_info=None):
    """Stub pasivo de compatibilidad con pywebview."""
    return {"status": "alive"}


@eel.expose
def registrar_log_frontend(nivel, mensaje, stack=None):
    """Recibe errores y advertencias desde JavaScript y los guarda en app.log."""
    texto = f"[FRONTEND] {mensaje}"
    if stack:
        texto += f"\nStack: {stack}"
    if nivel == "error":
        logger.error(texto)
    elif nivel == "warn":
        logger.warning(texto)
    else:
        logger.info(texto)


@eel.expose
def guardar_texto_libre_disco(texto, ruta=None, guardar_como=False):
    """Guarda el contenido del modo 'Escribir texto' en disco (.txt/.md, UTF-8) de forma atómica."""
    try:
        contenido = "" if texto is None else str(texto)
        ruta_objetivo = (ruta or "").strip()

        if guardar_como or not ruta_objetivo:
            if not puente_webview.ventana:
                return {"ok": False, "error": "Ventana principal no disponible para el diálogo."}
            import webview
            nombre_sugerido = os.path.basename(ruta_objetivo) if ruta_objetivo else "texto.txt"
            dir_sugerido = os.path.dirname(ruta_objetivo) if ruta_objetivo else ""
            seleccion = puente_webview.ventana.create_file_dialog(
                webview.SAVE_DIALOG,
                directory=dir_sugerido,
                save_filename=nombre_sugerido,
                file_types=(
                    "Archivos de texto (*.txt)",
                    "Markdown (*.md)",
                    "Todos los archivos (*.*)",
                ),
            )
            if not seleccion:
                return {"ok": False, "cancelado": True}
            ruta_objetivo = seleccion[0] if isinstance(seleccion, (list, tuple)) else str(seleccion)
            if not os.path.splitext(ruta_objetivo)[1]:
                ruta_objetivo += ".txt"

        dir_dest = os.path.dirname(os.path.abspath(ruta_objetivo)) or "."
        os.makedirs(dir_dest, exist_ok=True)
        tmp_path = f"{ruta_objetivo}.tmp"
        with open(tmp_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(contenido)
        os.replace(tmp_path, ruta_objetivo)
        return {"ok": True, "ruta": ruta_objetivo}
    except Exception as e:
        logger.error(f"Error guardando texto libre en disco: {e}", exc_info=True)
        return {"ok": False, "error": str(e)}
