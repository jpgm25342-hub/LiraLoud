# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import json
import logging
from typing import List, Dict, Any, Optional
from .base_provider import (
    BaseLLMProvider,
    construir_mensajes_openai,
    crear_httpx_async_client,
    obtener_ssl_context,
    parsear_respuesta_openai_chat,
)

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

        payload = {
            "model": mod,
            "messages": construir_mensajes_openai(system_prompt, mensajes_previos, user_prompt),
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
            return parsear_respuesta_openai_chat(
                resp, mod, self.name.upper(), default_limit=self.default_limit, incluir_reset=False
            )

    @staticmethod
    def _parsear_catalogo_openrouter(raw_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Normaliza y prioriza el catálogo /models de OpenRouter (máximo 80 modelos)."""
        modelos: List[Dict[str, Any]] = []
        for m in raw_list:
            m_id = m.get("id", "")
            d_name = m.get("name") or m_id
            if m_id:
                es_free = ":free" in m_id.lower() or "(free)" in d_name.lower()
                nombre_base = d_name.replace("(free)", "").replace(":free", "").strip()
                etiqueta = f"{nombre_base} (Gratis :free)" if es_free else nombre_base
                modelos.append({"id": m_id, "nombre": etiqueta, "free": es_free})
        if not modelos:
            return []
        familias_prioritarias = ("llama-3.3", "deepseek", "gemini", "qwen")
        modelos.sort(key=lambda x: (
            0 if x.get("free") else 1,
            next((i for i, fam in enumerate(familias_prioritarias) if fam in x["id"]), 4),
            x["nombre"],
        ))
        for mod_item in modelos:
            mod_item.pop("free", None)
        return modelos[:80]

    def _parsear_catalogo_modelos_live(self, raw_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Normaliza, filtra y ordena la lista de modelos devuelta por el endpoint /models."""
        if self.name == "openrouter":
            return self._parsear_catalogo_openrouter(raw_list)

        modelos: List[Dict[str, Any]] = []
        for m in raw_list:
            m_id = m.get("id", "")
            if m_id:
                if self.name == "deepseek" or any(x in m_id.lower() for x in ("gpt-4", "gpt-3.5", "o1", "o3")):
                    modelos.append({"id": m_id, "nombre": m_id})
        return modelos

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
                    modelos = self._parsear_catalogo_modelos_live(data.get("data", []))
                    if modelos:
                        return {"exito": True, "proveedor": self.name, "modelos": modelos, "origen": "live"}

        except Exception as e:
            logger.warning(f"⚠️ [OpenAICompatibleProvider:{self.name}] Fallo al listar modelos en vivo: {e}")

        return {"exito": True, "proveedor": self.name, "modelos": fallback_list, "origen": "fallback"}

    @staticmethod
    def _parsear_saldo_deepseek(bal_data: Dict[str, Any], limite_def: int) -> Dict[str, Any]:
        """Normaliza la respuesta JSON del endpoint de saldo de DeepSeek."""
        is_avail = bal_data.get("is_available", True)
        infos = bal_data.get("balance_infos", [])
        total_bal = infos[0].get("total_balance", "0.00") if infos else "0.00"
        curr = infos[0].get("currency", "USD") if infos else "USD"
        if not is_avail or float(total_bal or 0) <= 0:
            return {
                "limite_tokens": limite_def,
                "tokens_restantes": 0,
                "porcentaje_restante": 0.0,
                "detalle_api": f"⚠️ DeepSeek sin saldo ({total_bal} {curr})",
            }
        return {
            "limite_tokens": limite_def,
            "tokens_restantes": limite_def,
            "porcentaje_restante": 100.0,
            "detalle_api": f"DeepSeek Saldo: {total_bal} {curr} | Activo",
        }

    def _parsear_estado_tokens_resp(self, resp: Any, limite_def: int, nombre_vis: str) -> Optional[Dict[str, Any]]:
        """Interpreta la respuesta HTTP del endpoint de saldo/cuota para OpenRouter, DeepSeek u OpenAI."""
        if resp.status_code in (401, 403):
            return {
                "limite_tokens": limite_def,
                "tokens_restantes": 0,
                "porcentaje_restante": 0.0,
                "detalle_api": f"⚠️ Clave {nombre_vis} inválida (HTTP 401/403)",
            }

        if self.name == "openai" and resp.status_code in (402, 429):
            return {
                "limite_tokens": limite_def,
                "tokens_restantes": 0,
                "porcentaje_restante": 0.0,
                "detalle_api": "⚠️ Sin crédito / Cuota agotada (OpenAI)",
            }

        if resp.status_code != 200:
            return None

        if self.name == "openrouter":
            key_data = resp.json().get("data", {})
            lim = key_data.get("limit")
            usage = key_data.get("usage", 0.0)
            es_free = key_data.get("is_free_tier", True)
            lim_val = int(lim) if lim is not None else limite_def
            rem_val = max(0, lim_val - int(usage)) if lim is not None else limite_def
            pct = round((rem_val / max(1, lim_val)) * 100, 1) if lim is not None else 100.0
            return {
                "limite_tokens": lim_val,
                "tokens_restantes": rem_val,
                "porcentaje_restante": pct,
                "detalle_api": f"OpenRouter: {'Free Tier' if es_free else 'Paid'} (Gasto: ${usage:.6f} USD)",
            }

        if self.name == "deepseek":
            return self._parsear_saldo_deepseek(resp.json(), limite_def)

        return {
            "limite_tokens": limite_def,
            "tokens_restantes": limite_def,
            "porcentaje_restante": 100.0,
            "detalle_api": "OpenAI API: Conectado | Tier 1 / PayG",
        }

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

        endpoints = {
            "openrouter": ("https://openrouter.ai/api/v1/auth/key", 128000, "OpenRouter"),
            "deepseek": ("https://api.deepseek.com/user/balance", 64000, "DeepSeek"),
            "openai": ("https://api.openai.com/v1/models", 30000, "OpenAI"),
        }
        cfg_ep = endpoints.get(self.name)
        if not cfg_ep:
            return stats

        url_ep, limite_def, nombre_vis = cfg_ep
        req_h = dict(self.ua_standard)
        req_h["Authorization"] = f"Bearer {key}"

        try:
            async with crear_httpx_async_client(timeout=15.0) as client:
                resp = await client.get(url_ep, headers=req_h)
                parsed = self._parsear_estado_tokens_resp(resp, limite_def, nombre_vis)
                if parsed is not None:
                    return parsed
        except Exception as e:
            logger.warning(f"⚠️ [OpenAICompatibleProvider:{self.name}] Error en sincronizar_tokens_async: {e}")

        return stats
