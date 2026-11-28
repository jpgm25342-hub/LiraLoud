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

try:
    from backend.core.utils import safe_async_run as run_async_safely
except ImportError:
    def run_async_safely(coro: Coroutine[Any, Any, T]) -> T:
        """Fallback si base_provider se importa fuera del paquete backend."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop and loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                return executor.submit(asyncio.run, coro).result()
        return asyncio.run(coro)


def extraer_mensaje_error_http(resp: Any) -> str:
    """Extrae el mensaje de error legible de una respuesta HTTP JSON o texto plano."""
    err_body = resp.text
    try:
        err_json = resp.json()
        return err_json.get("error", {}).get("message", err_body)
    except Exception:
        return err_body


def construir_mensajes_openai(
    system_prompt: str,
    mensajes_previos: List[Dict[str, str]],
    user_prompt: str,
) -> List[Dict[str, str]]:
    """Construye la lista estándar de mensajes estilo OpenAI (system + historial + user)."""
    messages = [{"role": "system", "content": system_prompt}]
    for m in mensajes_previos:
        messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})
    messages.append({"role": "user", "content": user_prompt})
    return messages


def parsear_respuesta_openai_chat(
    resp: Any,
    mod: str,
    nombre_prov: str,
    default_limit: int,
    incluir_reset: bool = False,
) -> Dict[str, Any]:
    """Valida HTTP 200 y extrae texto, uso de tokens y rate-limits de una respuesta chat/completions."""
    if resp.status_code != 200:
        raise RuntimeError(f"Error {nombre_prov} ({resp.status_code}): {extraer_mensaje_error_http(resp)}")

    headers = dict(resp.headers)
    res_json = resp.json()
    choices = res_json.get("choices", [])
    if not choices:
        raise ValueError(f"{nombre_prov} no devolvió opciones de respuesta.")

    texto = choices[0].get("message", {}).get("content", "").strip()
    usage = res_json.get("usage", {})
    p_tok = int(usage.get("prompt_tokens", 0))
    c_tok = int(usage.get("completion_tokens", 0))
    t_tok = int(usage.get("total_tokens", p_tok + c_tok))

    lim_hdr = headers.get("x-ratelimit-limit-tokens")
    rem_hdr = headers.get("x-ratelimit-remaining-tokens")
    lim_tok = int(lim_hdr) if lim_hdr and str(lim_hdr).isdigit() else default_limit
    rem_tok = int(rem_hdr) if rem_hdr and str(rem_hdr).isdigit() else max(0, lim_tok - t_tok)

    rate_limits: Dict[str, Any] = {
        "limite_tokens": lim_tok,
        "tokens_restantes": rem_tok,
    }
    if incluir_reset:
        rate_limits["reset_tokens"] = headers.get("x-ratelimit-reset-tokens", "")

    return {
        "texto": texto,
        "usage": {
            "prompt_tokens": p_tok,
            "completion_tokens": c_tok,
            "total_tokens": t_tok,
        },
        "rate_limits": rate_limits,
        "modelo": mod,
    }


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

    async def verificar_conexion_async(self, api_key: str, modelo: str = "") -> Dict[str, Any]:
        """Versión asíncrona estándar de prueba de conectividad."""
        key = str(api_key or "").strip()
        if not key:
            return {"exito": False, "error": f"No se proporcionó API Key para la prueba de {self.name.upper()}."}

        mod = modelo or self.default_model
        try:
            res = await self.generar_respuesta_async(
                system_prompt="Eres un asistente de verificación técnica.",
                mensajes_previos=[],
                user_prompt="Responde únicamente con la palabra: OK",
                api_key=key,
                modelo=mod,
            )
            return {
                "exito": True,
                "proveedor": self.name,
                "modelo": mod,
                "respuesta": res.get("texto", "OK"),
                "mensaje": f"¡Conexión exitosa con {self.name.upper()} ({mod})!",
            }
        except Exception as e:
            logger.error(f"❌ [{self.__class__.__name__}:{self.name}] Error de verificación: {e}")
            return {"exito": False, "proveedor": self.name, "error": str(e)}

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
