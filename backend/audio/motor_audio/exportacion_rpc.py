import os
import webview

from backend.core.webview_bridge import eel, puente_webview
from backend.core.estado_global import estado_app
from backend.core.logger_config import logger
from backend.audio.motor_audio.comun import _obtener_exportador_audio


@eel.expose
def descargar_audio_dedicado(pag_ini, pag_fin, voz_id, velocidad_float, lista_cortes_v=None, limites_h=None, dict_activo=None, modo_teatro=False, obra_actual="General", opciones_corte=None):
    if not estado_app.doc:
        return "❌ Error: No hay ningún documento abierto."

    # Diálogo de guardado nativo sin Tkinter (usando pywebview FileDialog)
    ruta_guardado = None
    try:
        if puente_webview.ventana:
            ruta_guardado = puente_webview.ventana.create_file_dialog(
                webview.FileDialog.SAVE,
                save_filename="Audio_Estudio.mp3",
                file_types=(
                    'Audio MP3 (*.mp3)',
                    'Audio WAV (*.wav)',
                    'Todos los archivos (*.*)'
                )
            )
    except Exception as ex_dlg:
        logger.warning(f"Aviso en diálogo guardar audio: {ex_dlg}")

    if isinstance(ruta_guardado, (tuple, list)):
        ruta_guardado = ruta_guardado[0] if ruta_guardado else None

    if ruta_guardado and not os.path.splitext(ruta_guardado)[1]:
        ruta_guardado += ".mp3"

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

    res = _obtener_exportador_audio().exportar_rango(
        doc=estado_app.doc,
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
        progress_callback=_progreso_ui,
        opciones_corte=opciones_corte,
    )

    return res.get("mensaje", "Finalizado.")


@eel.expose
def cancelar_exportacion_mp3():
    estado_app.exportacion_activa = False
    estado_app.streaming_active = False  # Forzar detención cruzada del reproductor normal
    _obtener_exportador_audio().cancelar()

    # Limpiamos las colas de trabajo para cortar hilos residuales inmediatamente
    with estado_app.audio_queue.mutex:
        estado_app.audio_queue.queue.clear()

    print("⏹️ [SISTEMA] Cancelación de exportación y vaciado de colas completado.")
    return True
