# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import asyncio
from backend.core.gestor_archivos import cargar_ajustes_lectura
from backend.core.utils import safe_async_run
# Intentar importar winsdk para la pausa del sistema
try:
    from winsdk.windows.media.control import GlobalSystemMediaTransportControlsSessionManager
    WINSDK_AVAILABLE = True
except ImportError:
    WINSDK_AVAILABLE = False
    print("⚠️ winsdk no está instalado. Pausa inteligente deshabilitada.")
# Intentar importar pycaw para el Audio Ducking de volumen
try:
    from pycaw.pycaw import AudioUtilities, ISimpleAudioVolume
    PYCAW_AVAILABLE = True
except ImportError:
    PYCAW_AVAILABLE = False
    print("⚠️ pycaw no está instalado. Ducking de volumen deshabilitado.")
import psutil
def get_liraloud_pids():
    """Obtiene el PID de Python y de la ventana de Edge aislada de LiraLoud."""
    pids = []
    try:
        for p in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                cmd = " ".join(p.info.get('cmdline') or [])
                if "LiraLoudProfile" in cmd or "liraloud" in p.info.get('name', '').lower():
                    pids.append(p.info['pid'])
            except Exception:
                pass
    except Exception:
        pass
    return pids
class MediaController:
    def __init__(self):
        self.was_playing_before_duck = False
        self._manager = None
        self.ducked_sessions = {} # {pid: original_volume}
        self.persistent_duck_active = False
    
    async def get_manager(self):
        if not WINSDK_AVAILABLE: return None
        if not self._manager:
            try:
                self._manager = await GlobalSystemMediaTransportControlsSessionManager.request_async()
            except Exception as e:
                print(f"Error accediendo a Windows Media: {e}")
        return self._manager

    async def get_current_session(self):
        manager = await self.get_manager()
        if not manager: return None
        return manager.get_current_session()

    async def duck_audio(self, pause_system=False):
        """Aplica la pausa global de la pausa inteligente."""
        # 1. Pausa Inteligente (winsdk)
        if pause_system and WINSDK_AVAILABLE:
            try:
                session = await self.get_current_session()
                if session:
                    info = session.get_playback_info()
                    if info and info.playback_status == 4: # 4 = Playing
                        self.was_playing_before_duck = True
                        await session.try_pause_async()
                        print("🎧 [Audio Ducking] Música de fondo pausada.")
                    else:
                        self.was_playing_before_duck = False
            except Exception as e:
                print(f"Error en pausa de sistema: {e}")

    async def unduck_audio(self, unpause_system=False):
        """Restaura la pausa global de la pausa inteligente."""
        # 1. Quitar Pausa Inteligente
        if unpause_system and WINSDK_AVAILABLE:
            try:
                if self.was_playing_before_duck:
                    session = await self.get_current_session()
                    if session:
                        await session.try_play_async()
                        print("🎧 [Audio Ducking] Música de fondo reanudada.")
                    self.was_playing_before_duck = False
            except Exception as e:
                print(f"Error en reanudar sistema: {e}")

    async def apply_persistent_duck(self, duck_level):
        """Mantiene atenuadas permanentemente todas las otras apps."""
        if not PYCAW_AVAILABLE: return
        self.persistent_duck_active = True
        try:
            liraloud_pids = get_liraloud_pids()
            sessions = AudioUtilities.GetAllSessions()
            for session in sessions:
                pid = session.Process.pid if session.Process else None
                if pid and pid not in liraloud_pids:
                    volume = session._ctl.QueryInterface(ISimpleAudioVolume)
                    # Guardamos su volumen si es nueva (p. ej. el usuario abrió spotify recién)
                    if pid not in self.ducked_sessions:
                        self.ducked_sessions[pid] = volume.GetMasterVolume()
                    volume.SetMasterVolume(duck_level, None)
        except Exception as e:
            print(f"Error en apply_persistent_duck: {e}")

    async def remove_persistent_duck(self):
        """Restaura el volumen de todas las apps y desactiva el ducking permanente."""
        if not PYCAW_AVAILABLE: return
        self.persistent_duck_active = False
        try:
            sessions = AudioUtilities.GetAllSessions()
            for session in sessions:
                pid = session.Process.pid if session.Process else None
                if pid in self.ducked_sessions:
                    volume = session._ctl.QueryInterface(ISimpleAudioVolume)
                    volume.SetMasterVolume(self.ducked_sessions[pid], None)
            self.ducked_sessions.clear()
            print("📈 [Audio Ducking Permanente] Volúmenes restaurados.")
        except Exception as e:
            print(f"Error en remove_persistent_duck: {e}")

    # --- Controles Remotos del Sistema ---
    async def toggle_play_pause(self):
        if WINSDK_AVAILABLE:
            session = await self.get_current_session()
            if session: await session.try_toggle_play_pause_async()
            
    async def skip_next(self):
        if WINSDK_AVAILABLE:
            session = await self.get_current_session()
            if session: await session.try_skip_next_async()
            
    async def skip_previous(self):
        if WINSDK_AVAILABLE:
            session = await self.get_current_session()
            if session: await session.try_skip_previous_async()

    async def get_playback_status(self):
        if WINSDK_AVAILABLE:
            session = await self.get_current_session()
            if session:
                info = session.get_playback_info()
                if info:
                    return info.playback_status == 4 # 4 = Playing
        return False

# Instancia global
media_controller = MediaController()

def trigger_duck():
    ajustes = cargar_ajustes_lectura()
    pause_sys = ajustes.get("pausa_sistema", False)
    if pause_sys:
        safe_async_run(media_controller.duck_audio(pause_system=pause_sys))

def trigger_unduck():
    ajustes = cargar_ajustes_lectura()
    pause_sys = ajustes.get("pausa_sistema", False)
    if pause_sys:
        safe_async_run(media_controller.unduck_audio(unpause_system=pause_sys))

def restaurar_volumenes_salida():
    """Restaura los volúmenes originales de todas las apps al cerrar el programa."""
    if not PYCAW_AVAILABLE: return
    try:
        if media_controller.ducked_sessions:
            sessions = AudioUtilities.GetAllSessions()
            for session in sessions:
                pid = session.Process.pid if session.Process else None
                if pid and pid in media_controller.ducked_sessions:
                    volume = session._ctl.QueryInterface(ISimpleAudioVolume)
                    volume.SetMasterVolume(media_controller.ducked_sessions[pid], None)
            media_controller.ducked_sessions.clear()
            media_controller.persistent_duck_active = False
            print("📈 [Audio Ducking] Volúmenes restaurados automáticamente al salir.")
    except Exception as e:
        print(f"Error restaurando volúmenes al salir: {e}")

import atexit
atexit.register(restaurar_volumenes_salida)
