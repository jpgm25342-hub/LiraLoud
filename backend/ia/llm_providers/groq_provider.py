# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import json
import logging
from typing import List, Dict, Any, Optional
from .base_provider import BaseLLMProvider, crear_httpx_async_client, obtener_ssl_context

logger = logging.getLogger("LiraGroqProvider")

FALLBACK_MODELOS_GROQ = [
    {"id": "llama-3.3-70b-versatile", "nombre": "Llama 3.3 70B Versatile (Recomendado)"},
    {"id": "llama-3.1-8b-instant", "nombre": "Llama 3.1 8B Instant (Ultra veloz)"},
    {"id": "deepseek-r1-distill-llama-70b", "nombre": "DeepSeek R1 Distill Llama 70B"},
    {"id": "mixtral-8x7b-32768", "nombre": "Mixtral 8x7B (Contexto 32k)"}
]

class GroqProvider(BaseLLMProvider):
    """Proveedor asíncrono de alto rendimiento para la API oficial de Groq Cloud."""

    def __init__(self, default_model: str = "llama-3.3-70b-versatile"):
        super().__init__(name="groq", default_model=default_model)

    async def generar_respuesta_async(
        self,
        system_prompt: str,
        mensajes_previos: List[Dict[str, str]],
        user_prompt: str,
        temperatura: float = 0.2,
        api_key: str = "",
        modelo: str = ""
    ) -> Dict[str, Any]:
        key = str(api_key or "").strip()
        if not key:
            raise ValueError("No se ha configurado la API Key de Groq.")
        
        mod = modelo or self.default_model
        url = "https://api.groq.com/openai/v1/chat/completions"

        messages = [{"role": "system", "content": system_prompt}]
        for m in mensajes_previos:
            messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})
        messages.append({"role": "user", "content": user_prompt})

        payload = {
            "model": mod,
            "messages": messages,
            "temperature": max(0.0, min(1.0, temperatura)),
            "max_tokens": 8192
        }

        async with crear_httpx_async_client(timeout=90.0) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {key}",
                    **self.ua_standard
                }
            )

            if resp.status_code != 200:
                err_body = resp.text
                try:
                    err_json = resp.json()
                    msg = err_json.get("error", {}).get("message", err_body)
                except Exception:
                    msg = err_body
                raise RuntimeError(f"Error Groq ({resp.status_code}): {msg}")

            headers = dict(resp.headers)
            res_json = resp.json()
            choices = res_json.get("choices", [])
            if not choices:
                raise ValueError("Groq no devolvió opciones de respuesta.")
            
            texto = choices[0].get("message", {}).get("content", "").strip()

            usage = res_json.get("usage", {})
            p_tok = int(usage.get("prompt_tokens", 0))
            c_tok = int(usage.get("completion_tokens", 0))
            t_tok = int(usage.get("total_tokens", p_tok + c_tok))

            lim_hdr = headers.get("x-ratelimit-limit-tokens")
            rem_hdr = headers.get("x-ratelimit-remaining-tokens")
            lim_tok = int(lim_hdr) if lim_hdr and str(lim_hdr).isdigit() else 6000
            rem_tok = int(rem_hdr) if rem_hdr and str(rem_hdr).isdigit() else max(0, lim_tok - t_tok)

            return {
                "texto": texto,
                "usage": {
                    "prompt_tokens": p_tok,
                    "completion_tokens": c_tok,
                    "total_tokens": t_tok
                },
                "rate_limits": {
                    "limite_tokens": lim_tok,
                    "tokens_restantes": rem_tok,
                    "reset_tokens": headers.get("x-ratelimit-reset-tokens", "")
                },
                "modelo": mod
            }

    async def verificar_conexion_async(self, api_key: str, modelo: str = "") -> Dict[str, Any]:
        key = str(api_key or "").strip()
        if not key:
            return {"exito": False, "error": "No se proporcionó API Key para la prueba de Groq."}
        
        mod = modelo or self.default_model
        try:
            res = await self.generar_respuesta_async(
                system_prompt="Eres un asistente de verificación técnica.",
                mensajes_previos=[],
                user_prompt="Responde únicamente con la palabra: OK",
                api_key=key,
                modelo=mod
            )
            return {
                "exito": True,
                "proveedor": "groq",
                "modelo": mod,
                "respuesta": res.get("texto", "OK"),
                "mensaje": f"¡Conexión exitosa con GROQ ({mod})!"
            }
        except Exception as e:
            logger.error(f"❌ [GroqProvider] Error de verificación: {e}")
            return {"exito": False, "proveedor": "groq", "error": str(e)}

    async def obtener_modelos_async(self, api_key: str = "") -> Dict[str, Any]:
        key = str(api_key or "").strip()
        if not key:
            return {
                "exito": True,
                "proveedor": "groq",
                "modelos": FALLBACK_MODELOS_GROQ,
                "origen": "fallback_sin_key",
                "mensaje": "Ingresa tu clave para cargar los modelos en tiempo real de Groq."
            }

        url = "https://api.groq.com/openai/v1/models"
        try:
            async with crear_httpx_async_client(timeout=15.0) as client:
                resp = await client.get(
                    url,
                    headers={"Authorization": f"Bearer {key}", **self.ua_standard}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    raw_list = data.get("data", [])
                    modelos = []
                    for m in raw_list:
                        m_id = m.get("id", "")
                        is_active = m.get("active", True)
                        if is_active and "whisper" not in m_id.lower() and "embed" not in m_id.lower():
                            modelos.append({"id": m_id, "nombre": m_id})
                    if modelos:
                        return {"exito": True, "proveedor": "groq", "modelos": modelos, "origen": "live"}
        except Exception as e:
            logger.warning(f"⚠️ [GroqProvider] Fallo al listar modelos en vivo: {e}")

        return {"exito": True, "proveedor": "groq", "modelos": FALLBACK_MODELOS_GROQ, "origen": "fallback"}

    async def sincronizar_tokens_async(
        self,
        api_key: str = "",
        stats_actuales: Optional[Dict[str, Any]] = None,
        modelo: str = ""
    ) -> Dict[str, Any]:
        key = str(api_key or "").strip()
        mod = modelo or self.default_model
        stats = stats_actuales or {}

        if not key:
            return stats

        url = "https://api.groq.com/openai/v1/chat/completions"
        payload = {
            "model": mod,
            "messages": [{"role": "user", "content": "1"}],
            "max_tokens": 1
        }

        try:
            async with crear_httpx_async_client(timeout=15.0) as client:
                resp = await client.post(
                    url,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {key}",
                        **self.ua_standard
                    }
                )

                if resp.status_code == 200:
                    hdrs = dict(resp.headers)
                    lim_hdr = hdrs.get("x-ratelimit-limit-tokens")
                    rem_hdr = hdrs.get("x-ratelimit-remaining-tokens")
                    reset_hdr = hdrs.get("x-ratelimit-reset-tokens", "")
                    req_rem_hdr = hdrs.get("x-ratelimit-remaining-requests", "")

                    if lim_hdr and rem_hdr:
                        lim = int(lim_hdr)
                        rem = int(rem_hdr)
                        pct = round((rem / max(1, lim)) * 100, 1)
                        detalle = f"Groq Live: {rem:,}/{lim:,} TPM"
                        if reset_hdr:
                            detalle += f" (Reset: {reset_hdr})"
                        if req_rem_hdr:
                            detalle += f" | {req_rem_hdr} RPM"

                        return {
                            "limite_tokens": lim,
                            "tokens_restantes": rem,
                            "porcentaje_restante": pct,
                            "detalle_api": detalle
                        }
                elif resp.status_code == 429:
                    return {
                        "limite_tokens": 6000,
                        "tokens_restantes": 0,
                        "porcentaje_restante": 0.0,
                        "detalle_api": "⚠️ Límite de Groq alcanzado (Rate Limit 429)"
                    }
                elif resp.status_code in [400, 401, 403]:
                    return {
                        "limite_tokens": 6000,
                        "tokens_restantes": 0,
                        "porcentaje_restante": 0.0,
                        "detalle_api": f"⚠️ Clave Groq no válida (HTTP {resp.status_code})"
                    }
        except Exception as e:
            logger.warning(f"⚠️ [GroqProvider] Error en sincronizar_tokens_async: {e}")

        return stats
