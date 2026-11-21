# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import os
import ssl
import json
import logging
import asyncio
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Coroutine, TypeVar

try:
    import certifi
    CERTIFI_CAFILE = certifi.where()
except ImportError:
    certifi = None
    CERTIFI_CAFILE = None

try:
    import httpx
except ImportError:
    httpx = None

logger = logging.getLogger("LiraLLMProvider")

def obtener_ssl_context() -> ssl.SSLContext:
    """Genera un contexto SSL validado con certifi."""
    if CERTIFI_CAFILE and os.path.exists(CERTIFI_CAFILE):
        return ssl.create_default_context(cafile=CERTIFI_CAFILE)
    return ssl.create_default_context()

def crear_httpx_client(timeout: float = 60.0) -> Any:
    """Crea un cliente sincrónico httpx configurado con SSL certifi y connection pooling."""
    if httpx is None:
        return None
    ssl_ctx = obtener_ssl_context()
    limits = httpx.Limits(max_keepalive_connections=20, max_connections=50, keepalive_expiry=30.0)
    return httpx.Client(
        verify=ssl_ctx,
        timeout=httpx.Timeout(timeout, connect=10.0),
        limits=limits,
        follow_redirects=True
    )

def crear_httpx_async_client(timeout: float = 60.0) -> Any:
    """Crea un cliente asincrónico httpx configurado con SSL certifi y connection pooling."""
    if httpx is None:
        return None
    ssl_ctx = obtener_ssl_context()
    limits = httpx.Limits(max_keepalive_connections=20, max_connections=50, keepalive_expiry=30.0)
    return httpx.AsyncClient(
        verify=ssl_ctx,
        timeout=httpx.Timeout(timeout, connect=10.0),
        limits=limits,
        follow_redirects=True
    )

T = TypeVar("T")

def run_async_safely(coro: Coroutine[Any, Any, T]) -> T:
    """
    Ejecuta una corrutina asíncrona de manera segura tanto en entornos con bucle activo
    (como Eel o Jupyter) como en hilos secundarios sincrónicos.
    """
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    if loop.is_running():
        # Si el bucle del hilo actual ya está corriendo, ejecutar en un hilo separado para no bloquear
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(asyncio.run, coro)
            return future.result()
    else:
        return loop.run_until_complete(coro)


class BaseLLMProvider(ABC):
    """
    Clase base abstracta para todos los proveedores de Modelos de Lenguaje (LLM).
    Define la interfaz estándar para generación, catálogo de modelos, conectividad y telemetría,
    con soporte unificado tanto síncrono como asíncrono no bloqueante.
    """
    def __init__(self, name: str, default_model: str):
        self.name = name.lower().strip()
        self.default_model = default_model
        self.ua_standard = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json"
        }

    # =========================================================================
    # GENERACIÓN DE RESPUESTAS (SYNC / ASYNC)
    # =========================================================================
    def generar_respuesta(
        self,
        system_prompt: str,
        mensajes_previos: List[Dict[str, str]],
        user_prompt: str,
        temperatura: float = 0.2,
        api_key: str = "",
        modelo: str = ""
    ) -> Dict[str, Any]:
        """Versión sincrónica de generación de texto."""
        return run_async_safely(
            self.generar_respuesta_async(
                system_prompt=system_prompt,
                mensajes_previos=mensajes_previos,
                user_prompt=user_prompt,
                temperatura=temperatura,
                api_key=api_key,
                modelo=modelo
            )
        )

    @abstractmethod
    async def generar_respuesta_async(
        self,
        system_prompt: str,
        mensajes_previos: List[Dict[str, str]],
        user_prompt: str,
        temperatura: float = 0.2,
        api_key: str = "",
        modelo: str = ""
    ) -> Dict[str, Any]:
        """Versión asíncrona de generación de texto."""
        pass

    # =========================================================================
    # VERIFICACIÓN DE CONECTIVIDAD (SYNC / ASYNC)
    # =========================================================================
    def verificar_conexion(self, api_key: str, modelo: str = "") -> Dict[str, Any]:
        """Versión sincrónica de prueba de conectividad."""
        return run_async_safely(self.verificar_conexion_async(api_key=api_key, modelo=modelo))

    @abstractmethod
    async def verificar_conexion_async(self, api_key: str, modelo: str = "") -> Dict[str, Any]:
        """Versión asíncrona de prueba de conectividad."""
        pass

    # =========================================================================
    # CATÁLOGO DE MODELOS (SYNC / ASYNC)
    # =========================================================================
    def obtener_modelos(self, api_key: str = "") -> Dict[str, Any]:
        """Versión sincrónica para consultar modelos oficiales."""
        return run_async_safely(self.obtener_modelos_async(api_key=api_key))

    @abstractmethod
    async def obtener_modelos_async(self, api_key: str = "") -> Dict[str, Any]:
        """Versión asíncrona para consultar modelos oficiales."""
        pass

    # =========================================================================
    # SINCRONIZACIÓN DE TELEMETRÍA DE TOKENS (SYNC / ASYNC)
    # =========================================================================
    def sincronizar_tokens(
        self,
        api_key: str = "",
        stats_actuales: Optional[Dict[str, Any]] = None,
        modelo: str = ""
    ) -> Dict[str, Any]:
        """Versión sincrónica para consultar cuotas y telemetría."""
        return run_async_safely(
            self.sincronizar_tokens_async(
                api_key=api_key,
                stats_actuales=stats_actuales,
                modelo=modelo
            )
        )

    @abstractmethod
    async def sincronizar_tokens_async(
        self,
        api_key: str = "",
        stats_actuales: Optional[Dict[str, Any]] = None,
        modelo: str = ""
    ) -> Dict[str, Any]:
        """Versión asíncrona para consultar cuotas y telemetría."""
        pass

    # =========================================================================
    # CONTEO DE TOKENS (SYNC / ASYNC)
    # =========================================================================
    def contar_tokens(self, texto: str, modelo: str = "", api_key: str = "") -> int:
        """Versión sincrónica para conteo de tokens."""
        return run_async_safely(self.contar_tokens_async(texto=texto, modelo=modelo, api_key=api_key))

    async def contar_tokens_async(self, texto: str, modelo: str = "", api_key: str = "") -> int:
        """Versión asíncrona para conteo de tokens (fallback estándar ~4 chars/token)."""
        if not texto:
            return 0
        return max(1, len(texto) // 4)
