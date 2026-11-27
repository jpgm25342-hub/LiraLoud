# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import os
import platform
import subprocess
import re
import sys
from backend.core.webview_bridge import eel
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
        except Exception:
            t = str(t)
    if not isinstance(t, str):
        t = str(t) if t is not None else ""
    return re.sub(r'\W+', '', t).lower()


def resolver_nombre_voz_unico(nombre_base, nombres_existentes):
    """
    Si nombre_base ya existe en la lista de nombres_existentes (comparación case-insensitive),
    genera un nombre correlativo tipo 'Nombre copia 1', 'Nombre copia 2', etc.
    """
    nombre_limpio = str(nombre_base or "").strip()
    if not nombre_limpio:
        nombre_limpio = "Voz Personalizada"

    existentes_lower = {str(n).strip().lower() for n in nombres_existentes if n}
    if nombre_limpio.lower() not in existentes_lower:
        return nombre_limpio

    # Extraer base sin sufijo ' copia X' si ya lo tenía
    m = re.match(r'^(.*?)(?:\s+copia(?:\s+(\d+))?)?$', nombre_limpio, flags=re.IGNORECASE)
    base = m.group(1).strip() if m else nombre_limpio
    if not base:
        base = nombre_limpio

    copia_num = 1
    while True:
        sufijo = f" copia {copia_num}"
        cand = f"{base}{sufijo}"
        if cand.lower() not in existentes_lower:
            return cand
        copia_num += 1

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

    # Intentar buscarlo en la raíz o dentro de la carpeta web (base_dir o bundle_dir)
    from backend.core.estado_global import estado_app
    candidatos = [
        os.path.join(estado_app.base_dir, "web", nombre_archivo),
        os.path.join(estado_app.base_dir, nombre_archivo),
        os.path.join(estado_app.bundle_dir, "web", nombre_archivo),
        os.path.join(estado_app.bundle_dir, nombre_archivo),
    ]
    ruta_final = next((r for r in candidatos if os.path.exists(r)), candidatos[0])

    if os.path.exists(ruta_final):
        if platform.system() == "Windows":
            os.startfile(ruta_final)
        else:
            opener = "open" if platform.system() == "Darwin" else "xdg-open"
            subprocess.call([opener, ruta_final])
    else:
        print(f"🔥 Error: No se encontró el archivo legal en {ruta_final}")
    return True
