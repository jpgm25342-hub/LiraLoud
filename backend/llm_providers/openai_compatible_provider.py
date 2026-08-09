# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import json
import logging
from typing import List, Dict, Any, Optional
from .base_provider import BaseLLMProvider, crear_httpx_async_client, obtener_ssl_context

logger = logging.getLogger("LiraOpenAICompatibleProvider")

FALLBACK_CATALOGOS: Dict[str, List[Dict[str, str]]] = {
    "openai": [
        {"id": "gpt-4o-mini", "nombre": "GPT-4o Mini (Rápido y económico)"},
        {"id": "gpt-4o", "nombre": "GPT-4o (Modelo insignia)"},
        {"id": "o1-mini", "nombre": "o1-mini (Razonamiento)"},
        {"id": "gpt-3.5-turbo", "nombre": "GPT-3.5 Turbo"}
    ],
    "deepseek": [
        {"id": "deepseek-chat", "nombre": "DeepSeek-V3 (deepseek-chat)"},
        {"id": "deepseek-reasoner", "nombre": "DeepSeek-R1 (Razonamiento profundo)"}
    ],
    "openrouter": [
        {"id": "meta-llama/llama-3.3-70b-instruct:free", "nombre": "Llama 3.3 70B Instruct (Gratis :free)"},
        {"id": "deepseek/deepseek-r1:free", "nombre": "DeepSeek R1 (Gratis :free)"},
        {"id": "google/gemini-2.0-flash-exp:free", "nombre": "Gemini 2.0 Flash (Gratis :free)"},
        {"id": "qwen/qwen-2.5-72b-instruct:free", "nombre": "Qwen 2.5 72B Instruct (Gratis :free)"},
        {"id": "meta-llama/llama-3.1-8b-instruct:free", "nombre": "Llama 3.1 8B Instruct (Gratis :free)"},
        {"id": "mistralai/mistral-7b-instruct:free", "nombre": "Mistral 7B Instruct (Gratis :free)"}
    ]
}

PROVIDER_CONFIGS: Dict[str, Dict[str, Any]] = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o-mini",
        "default_limit": 30000,
        "extra_headers": {}
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "default_model": "deepseek-chat",
        "default_limit": 64000,
        "extra_headers": {}
    },
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "default_model": "meta-llama/llama-3.3-70b-instruct:free",
        "default_limit": 128000,
        "extra_headers": {
            "HTTP-Referer": "http://localhost:8000",
            "X-Title": "LiraLoud"
        }
    }
}


class OpenAICompatibleProvider(BaseLLMProvider):
    """Proveedor genérico y adaptable para APIs compatibles con la especificación OpenAI (OpenAI, DeepSeek, OpenRouter)."""

    def __init__(self, provider_type: str = "openai"):
        cfg = PROVIDER_CONFIGS.get(provider_type.lower(), PROVIDER_CONFIGS["openai"])
        super().__init__(name=provider_type.lower(), default_model=cfg["default_model"])
        self.base_url = cfg["base_url"]
        self.default_limit = cfg["default_limit"]
        self.extra_headers = cfg.get("extra_headers", {})

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
            raise ValueError(f"No se ha configurado la API Key para {self.name.upper()}.")

        mod = modelo or self.default_model
        endpoint_url = f"{self.base_url}/chat/completions"

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

        req_headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
            **self.ua_standard
        }
        if self.extra_headers:
            req_headers.update(self.extra_headers)

        async with crear_httpx_async_client(timeout=90.0) as client:
            resp = await client.post(endpoint_url, json=payload, headers=req_headers)

            if resp.status_code != 200:
                err_body = resp.text
                try:
                    err_json = resp.json()
                    msg = err_json.get("error", {}).get("message", err_body)
                except Exception:
                    msg = err_body
                raise RuntimeError(f"Error {self.name.upper()} ({resp.status_code}): {msg}")

            headers = dict(resp.headers)
            res_json = resp.json()
            choices = res_json.get("choices", [])
            if not choices:
                raise ValueError(f"{self.name.upper()} no devolvió opciones de respuesta.")

            texto = choices[0].get("message", {}).get("content", "").strip()

            usage = res_json.get("usage", {})
            p_tok = int(usage.get("prompt_tokens", 0))
            c_tok = int(usage.get("completion_tokens", 0))
            t_tok = int(usage.get("total_tokens", p_tok + c_tok))

            lim_hdr = headers.get("x-ratelimit-limit-tokens")
            rem_hdr = headers.get("x-ratelimit-remaining-tokens")
            lim_tok = int(lim_hdr) if lim_hdr and str(lim_hdr).isdigit() else self.default_limit
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
                    "tokens_restantes": rem_tok
                },
                "modelo": mod
            }

    async def verificar_conexion_async(self, api_key: str, modelo: str = "") -> Dict[str, Any]:
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
                modelo=mod
            )
            return {
                "exito": True,
                "proveedor": self.name,
                "modelo": mod,
                "respuesta": res.get("texto", "OK"),
                "mensaje": f"¡Conexión exitosa con {self.name.upper()} ({mod})!"
            }
        except Exception as e:
            logger.error(f"❌ [OpenAICompatibleProvider:{self.name}] Error de verificación: {e}")
            return {"exito": False, "proveedor": self.name, "error": str(e)}

    async def obtener_modelos_async(self, api_key: str = "") -> Dict[str, Any]:
        key = str(api_key or "").strip()
        fallback_list = FALLBACK_CATALOGOS.get(self.name, [])
        if not key:
            return {
                "exito": True,
                "proveedor": self.name,
                "modelos": fallback_list,
                "origen": "fallback_sin_key",
                "mensaje": f"Ingresa tu clave para cargar los modelos en tiempo real de {self.name.upper()}."
            }

        url = f"{self.base_url}/models"
        req_headers = dict(self.ua_standard)
        req_headers["Authorization"] = f"Bearer {key}"
        if self.extra_headers:
            req_headers.update(self.extra_headers)

        try:
            async with crear_httpx_async_client(timeout=15.0) as client:
                resp = await client.get(url, headers=req_headers)
                if resp.status_code == 200:
                    data = resp.json()
                    raw_list = data.get("data", [])
                    modelos = []

                    if self.name == "openrouter":
                        for m in raw_list:
                            m_id = m.get("id", "")
                            d_name = m.get("name") or m_id
                            if m_id:
                                es_free = ":free" in m_id.lower() or "(free)" in d_name.lower()
                                nombre_base = d_name.replace("(free)", "").replace(":free", "").strip()
                                etiqueta = f"{nombre_base} (Gratis :free)" if es_free else nombre_base
                                modelos.append({"id": m_id, "nombre": etiqueta, "free": es_free})
                        if modelos:
                            modelos.sort(key=lambda x: (
                                0 if x.get("free") else 1,
                                0 if "llama-3.3" in x["id"] else (
                                    1 if "deepseek" in x["id"] else (
                                        2 if "gemini" in x["id"] else (
                                            3 if "qwen" in x["id"] else 4
                                        )
                                    )
                                ),
                                x["nombre"]
                            ))
                            for mod_item in modelos:
                                mod_item.pop("free", None)
                            return {"exito": True, "proveedor": self.name, "modelos": modelos[:80], "origen": "live"}

                    else:
                        for m in raw_list:
                            m_id = m.get("id", "")
                            if m_id:
                                if self.name == "deepseek":
                                    modelos.append({"id": m_id, "nombre": m_id})
                                else:
                                    if any(x in m_id.lower() for x in ["gpt-4", "gpt-3.5", "o1", "o3"]):
                                        modelos.append({"id": m_id, "nombre": m_id})
                        if modelos:
                            return {"exito": True, "proveedor": self.name, "modelos": modelos, "origen": "live"}

        except Exception as e:
            logger.warning(f"⚠️ [OpenAICompatibleProvider:{self.name}] Fallo al listar modelos en vivo: {e}")

        return {"exito": True, "proveedor": self.name, "modelos": fallback_list, "origen": "fallback"}

    async def sincronizar_tokens_async(
        self,
        api_key: str = "",
        stats_actuales: Optional[Dict[str, Any]] = None,
        modelo: str = ""
    ) -> Dict[str, Any]:
        key = str(api_key or "").strip()
        stats = stats_actuales or {}

        if not key:
            return stats

        req_h = dict(self.ua_standard)
        req_h["Authorization"] = f"Bearer {key}"

        try:
            async with crear_httpx_async_client(timeout=15.0) as client:
                if self.name == "openrouter":
                    url_key = "https://openrouter.ai/api/v1/auth/key"
                    resp = await client.get(url_key, headers=req_h)
                    if resp.status_code == 200:
                        key_data = resp.json().get("data", {})
                        lim = key_data.get("limit")
                        usage = key_data.get("usage", 0.0)
                        es_free = key_data.get("is_free_tier", True)

                        lim_val = int(lim) if lim is not None else 128000
                        rem_val = max(0, lim_val - int(usage)) if lim is not None else 128000
                        pct = round((rem_val / max(1, lim_val)) * 100, 1) if lim is not None else 100.0
                        detalle = f"OpenRouter: {'Free Tier' if es_free else 'Paid'} (Gasto: ${usage:.6f} USD)"

                        return {
                            "limite_tokens": lim_val,
                            "tokens_restantes": rem_val,
                            "porcentaje_restante": pct,
                            "detalle_api": detalle
                        }
                    elif resp.status_code in [401, 403]:
                        return {
                            "limite_tokens": 128000,
                            "tokens_restantes": 0,
                            "porcentaje_restante": 0.0,
                            "detalle_api": "⚠️ Clave OpenRouter inválida (HTTP 401/403)"
                        }

                elif self.name == "deepseek":
                    url_bal = "https://api.deepseek.com/user/balance"
                    resp = await client.get(url_bal, headers=req_h)
                    if resp.status_code == 200:
                        bal_data = resp.json()
                        is_avail = bal_data.get("is_available", True)
                        infos = bal_data.get("balance_infos", [])
                        total_bal = "0.00"
                        curr = "USD"
                        if infos:
                            total_bal = infos[0].get("total_balance", "0.00")
                            curr = infos[0].get("currency", "USD")

                        if not is_avail or float(total_bal or 0) <= 0:
                            return {
                                "limite_tokens": 64000,
                                "tokens_restantes": 0,
                                "porcentaje_restante": 0.0,
                                "detalle_api": f"⚠️ DeepSeek sin saldo ({total_bal} {curr})"
                            }
                        else:
                            return {
                                "limite_tokens": 64000,
                                "tokens_restantes": 64000,
                                "porcentaje_restante": 100.0,
                                "detalle_api": f"DeepSeek Saldo: {total_bal} {curr} | Activo"
                            }
                    elif resp.status_code in [401, 403]:
                        return {
                            "limite_tokens": 64000,
                            "tokens_restantes": 0,
                            "porcentaje_restante": 0.0,
                            "detalle_api": "⚠️ Clave DeepSeek inválida (HTTP 401/403)"
                        }

                elif self.name == "openai":
                    url_mod = "https://api.openai.com/v1/models"
                    resp = await client.get(url_mod, headers=req_h)
                    if resp.status_code == 200:
                        return {
                            "limite_tokens": 30000,
                            "tokens_restantes": 30000,
                            "porcentaje_restante": 100.0,
                            "detalle_api": "OpenAI API: Conectado | Tier 1 / PayG"
                        }
                    elif resp.status_code in [401, 403]:
                        return {
                            "limite_tokens": 30000,
                            "tokens_restantes": 0,
                            "porcentaje_restante": 0.0,
                            "detalle_api": "⚠️ Clave OpenAI inválida (HTTP 401/403)"
                        }
                    elif resp.status_code in [402, 429]:
                        return {
                            "limite_tokens": 30000,
                            "tokens_restantes": 0,
                            "porcentaje_restante": 0.0,
                            "detalle_api": "⚠️ Sin crédito / Cuota agotada (OpenAI)"
                        }

        except Exception as e:
            logger.warning(f"⚠️ [OpenAICompatibleProvider:{self.name}] Error en sincronizar_tokens_async: {e}")

        return stats
