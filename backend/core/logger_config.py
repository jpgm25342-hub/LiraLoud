# LiraLoud
# Sistema Centralizado de Logs Persistentes y Captura de Errores
# Copyright 2026 José Pablo González Macías

import os
import sys
import io
import logging
from logging.handlers import RotatingFileHandler
import threading
import atexit
import datetime

# Reconfigurar codificación de consola si está disponible
if sys.stdout is not None and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

if sys.stderr is not None and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Ruta del archivo de log principal
if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOG_FILE = os.path.join(BASE_DIR, "app.log")

# Fallback a %LOCALAPPDATA%/LiraLoud/app.log si el directorio no tiene permisos de escritura
try:
    with open(LOG_FILE, "a", encoding="utf-8") as _f:
        _f.write("")
except Exception:
    appdata_dir = os.path.join(os.environ.get("LOCALAPPDATA", ""), "LiraLoud")
    os.makedirs(appdata_dir, exist_ok=True)
    LOG_FILE = os.path.join(appdata_dir, "app.log")

logger = logging.getLogger("LiraLoud")
logger.setLevel(logging.DEBUG)

class SafeRotatingFileHandler(RotatingFileHandler):
    """
    Subclase robusta de RotatingFileHandler para Windows.
    Evita que PermissionError [WinError 32] (archivo en uso por otro proceso/subproceso)
    rompa la ejecución o sature la consola con Logging errors.
    """
    def doRollover(self):
        try:
            super().doRollover()
        except (PermissionError, OSError):
            # En Windows el archivo puede estar bloqueado por otro thread/subproceso.
            # En lugar de colapsar, vaciamos el archivo actual (truncate) de forma segura.
            try:
                if self.stream:
                    self.stream.close()
                    self.stream = None
                with open(self.baseFilename, 'w', encoding=self.encoding or 'utf-8', errors='replace') as f:
                    f.truncate(0)
                if not self.delay:
                    self.stream = self._open()
            except Exception:
                pass

file_handler = None
if not logger.handlers:
    # Handler rotativo blindado de archivo en UTF-8 con reemplazo de caracteres no mapeables
    file_handler = SafeRotatingFileHandler(LOG_FILE, maxBytes=10 * 1024 * 1024, backupCount=3, encoding="utf-8", errors="replace")
    file_handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] [%(threadName)s] %(message)s", "%Y-%m-%d %H:%M:%S")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
else:
    for h in logger.handlers:
        if isinstance(h, RotatingFileHandler):
            file_handler = h
            break


class SafeStreamToLogger:
    """Redirige flujos estándar (stdout/stderr) hacia el logger y archivo app.log sin loops ni errores de codificación."""
    def __init__(self, logger, level, original_stream=None, fallback_file_handler=None):
        self.logger = logger
        self.level = level
        self.original_stream = original_stream
        self.fallback_file_handler = fallback_file_handler
        self.buffer = ""
        self._in_write = False

    def fileno(self):
        """Provee un descriptor de archivo válido para subprocess.Popen (necesario para Edge/Chrome en Eel)"""
        if self.original_stream and hasattr(self.original_stream, "fileno"):
            try:
                return self.original_stream.fileno()
            except Exception:
                pass
        if self.fallback_file_handler and hasattr(self.fallback_file_handler, "stream") and self.fallback_file_handler.stream:
            try:
                return self.fallback_file_handler.stream.fileno()
            except Exception:
                pass
        raise io.UnsupportedOperation("fileno no disponible")

    def isatty(self):
        if self.original_stream and hasattr(self.original_stream, "isatty"):
            try:
                return self.original_stream.isatty()
            except Exception:
                pass
        return False

    def write(self, buf):
        if self._in_write:
            return
        self._in_write = True
        try:
            # Escribir en la consola original de forma segura (reemplazando caracteres no imprimibles)
            if self.original_stream and hasattr(self.original_stream, "write"):
                try:
                    self.original_stream.write(buf)
                    self.original_stream.flush()
                except UnicodeEncodeError:
                    try:
                        safe_buf = buf.encode('ascii', errors='backslashreplace').decode('ascii')
                        self.original_stream.write(safe_buf)
                        self.original_stream.flush()
                    except Exception:
                        pass
                except Exception:
                    pass

            self.buffer += buf
            while "\n" in self.buffer:
                line, self.buffer = self.buffer.split("\n", 1)
                line = line.strip()
                if line:
                    self.logger.log(self.level, line)
        finally:
            self._in_write = False

    def flush(self):
        if self._in_write:
            return
        self._in_write = True
        try:
            if self.buffer.strip():
                self.logger.log(self.level, self.buffer.strip())
                self.buffer = ""
            if self.original_stream and hasattr(self.original_stream, "flush"):
                try:
                    self.original_stream.flush()
                except Exception:
                    pass
        finally:
            self._in_write = False


_captura_configurada = False

def configurar_captura_global():
    """Configura la redirección de stdout/stderr y hooks de excepciones no controladas."""
    global _captura_configurada
    if _captura_configurada:
        return
    _captura_configurada = True

    # Redirigir stdout y stderr usando SafeStreamToLogger
    orig_stdout = sys.stdout
    orig_stderr = sys.stderr
    sys.stdout = SafeStreamToLogger(logger, logging.INFO, orig_stdout, fallback_file_handler=file_handler)
    sys.stderr = SafeStreamToLogger(logger, logging.ERROR, orig_stderr, fallback_file_handler=file_handler)

    # Captura de excepciones globales del hilo principal
    def uncaught_exception_handler(exc_type, exc_value, exc_traceback):
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
            return
        logger.critical("🔥 [CRASH] EXCEPCIÓN NO CONTROLADA (HILO PRINCIPAL):", exc_info=(exc_type, exc_value, exc_traceback))

    sys.excepthook = uncaught_exception_handler

    # Captura de excepciones en hilos secundarios (Python >= 3.8)
    if hasattr(threading, "excepthook"):
        def thread_exception_handler(args):
            if issubclass(args.exc_type, KeyboardInterrupt):
                return
            logger.critical(f"🔥 [CRASH] EXCEPCIÓN NO CONTROLADA EN HILO [{args.thread.name}]:", exc_info=(args.exc_type, args.exc_value, args.exc_traceback))
        threading.excepthook = thread_exception_handler

    # Registro de fin de proceso
    def registrar_salida_proceso():
        logger.info(f"🛑 [SISTEMA] Proceso LiraLoud finalizado a las {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    atexit.register(registrar_salida_proceso)

    logger.info("=" * 70)
    logger.info(f"🚀 [SISTEMA] LiraLoud iniciado. PID: {os.getpid()} | Python: {sys.version.split()[0]} | OS: {sys.platform}")
    logger.info(f"📁 [SISTEMA] Archivo de logs persistentes: {LOG_FILE}")
    logger.info("=" * 70)
