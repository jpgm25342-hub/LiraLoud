# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import os
import platform
import subprocess
import re
import sys
import eel
import json

import asyncio
import concurrent.futures

"""
Módulo de Utilidades
Contiene funciones de transformación de texto, apertura de archivos locales y ejecución segura de tareas asíncronas.
No depende del estado global de la aplicación.
"""

def safe_async_run(coro):
    """
    Ejecuta una corrutina de forma síncrona y segura desde cualquier contexto,
    incluso si ya existe o se está ejecutando un event loop de asyncio en el hilo actual.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, coro).result()
    else:
        try:
            return asyncio.run(coro)
        except RuntimeError:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                return pool.submit(asyncio.run, coro).result()


def normalizar_texto(t):
    """Limpia el texto para usarlo como ID."""
    if isinstance(t, list):
        try:
            t = " ".join([str(x.get('texto', x)) if isinstance(x, dict) else str(x) for x in t])
        except:
            t = str(t)
    if not isinstance(t, str):
        t = str(t) if t is not None else ""
    return re.sub(r'\W+', '', t).lower()

def crear_regex_inmune_acentos(nombre):
    n = re.sub(r"[:.,]", "", nombre).strip()
    n = re.sub(r"[aáÁ]", "[aáÁ]", n)
    n = re.sub(r"[eéÉ]", "[eéÉ]", n)
    n = re.sub(r"[iíÍ]", "[iíÍ]", n)
    n = re.sub(r"[oóÓ]", "[oóÓ]", n)
    n = re.sub(r"[uúÚ]", "[uúÚ]", n)
    return n

@eel.expose
def abrir_archivo_legal(nombre_archivo):
    # Forzar la importación local para aislar el hilo de ejecución de Eel
    import os
    import platform
    import subprocess

    # Intentar buscarlo en la raíz o dentro de la carpeta web
    ruta_raiz = os.path.join(os.path.dirname(os.path.dirname(__file__)), nombre_archivo)
    ruta_web = os.path.join(os.path.dirname(os.path.dirname(__file__)), "web", nombre_archivo)
    
    ruta_final = ruta_web if os.path.exists(ruta_web) else ruta_raiz

    if os.path.exists(ruta_final):
        if platform.system() == "Windows":
            os.startfile(ruta_final)
        else:
            opener = "open" if platform.system() == "Darwin" else "xdg-open"
            subprocess.call([opener, ruta_final])
    else:
        print(f"🔥 Error: No se encontró el archivo legal en {ruta_final}")
    return True
