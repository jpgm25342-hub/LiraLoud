# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import json
import logging
from typing import List, Dict, Any, Optional
from .base_provider import BaseLLMProvider, crear_httpx_async_client, obtener_ssl_context

logger = logging.getLogger("LiraGeminiProvider")

FALLBACK_MODELOS_GEMINI = [
    {"id": "gemini-2.0-flash", "nombre": "Gemini 2.0 Flash (Última generación)"},
    {"id": "gemini-1.5-flash", "nombre": "Gemini 1.5 Flash (Ultrarrápido, Recomendado)"},
    {"id": "gemini-1.5-pro", "nombre": "Gemini 1.5 Pro (Máximo razonamiento)"},
    {"id": "gemini-1.0-pro", "nombre": "Gemini 1.0 Pro"}
]

class GeminiProvider(BaseLLMProvider):
    """Proveedor asíncrono y de alto rendimiento para la API oficial de Google Gemini (v1beta REST)."""

    def __init__(self, default_model: str = "gemini-1.5-flash"):
        super().__init__(name="gemini", default_model=default_model)

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
            raise ValueError("No se ha configurado la API Key de Google Gemini.")
        
        mod = (modelo or self.default_model).replace("models/", "").strip()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{mod}:generateContent?key={key}"

        contents = []
        for m in mensajes_previos:
            role = "user" if m.get("role") in ["user", "human"] else "model"
            contents.append({
                "role": role,
                "parts": [{"text": m.get("content", "")}]
            })
        contents.append({
            "role": "user",
            "parts": [{"text": user_prompt}]
        })

        payload = {
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": contents,
            "generationConfig": {
                "temperature": max(0.0, min(1.0, temperatura)),
                "maxOutputTokens": 8192
            }
        }

        async with crear_httpx_async_client(timeout=90.0) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json", **self.ua_standard}
            )

            if resp.status_code != 200:
                err_body = resp.text
                try:
                    err_json = resp.json()
                    msg = err_json.get("error", {}).get("message", err_body)
                except Exception:
                    msg = err_body
                raise RuntimeError(f"Error Google Gemini ({resp.status_code}): {msg}")

            res_json = resp.json()
            candidates = res_json.get("candidates", [])
            if not candidates:
                block_reason = res_json.get("promptFeedback", {}).get("blockReason", "Sin candidatos generados")
                raise ValueError(f"Gemini no generó respuesta: {block_reason}")
            
            parts = candidates[0].get("content", {}).get("parts", [])
            texto = "".join([p.get("text", "") for p in parts]).strip()

            usage = res_json.get("usageMetadata", {})
            p_tok = int(usage.get("promptTokenCount", 0))
            c_tok = int(usage.get("candidatesTokenCount", 0))
            t_tok = int(usage.get("totalTokenCount", p_tok + c_tok))

            return {
                "texto": texto,
                "usage": {
                    "prompt_tokens": p_tok,
                    "completion_tokens": c_tok,
                    "total_tokens": t_tok
                },
                "modelo": mod,
                "detalle": f"Gemini {mod}: {p_tok} entrada + {c_tok} salida = {t_tok} tokens"
            }

    async def verificar_conexion_async(self, api_key: str, modelo: str = "") -> Dict[str, Any]:
        key = str(api_key or "").strip()
        if not key:
            return {"exito": False, "error": "No se proporcionó API Key para la prueba de Gemini."}
        
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
                "proveedor": "gemini",
                "modelo": mod,
                "respuesta": res.get("texto", "OK"),
                "mensaje": f"¡Conexión exitosa con GEMINI ({mod})!"
            }
        except Exception as e:
            logger.error(f"❌ [GeminiProvider] Error de verificación: {e}")
            return {"exito": False, "proveedor": "gemini", "error": str(e)}

    async def obtener_modelos_async(self, api_key: str = "") -> Dict[str, Any]:
        key = str(api_key or "").strip()
        if not key:
            return {
                "exito": True,
                "proveedor": "gemini",
                "modelos": FALLBACK_MODELOS_GEMINI,
                "origen": "fallback_sin_key",
                "mensaje": "Ingresa tu clave para cargar los modelos en tiempo real de Google Gemini."
            }

        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
        try:
            async with crear_httpx_async_client(timeout=15.0) as client:
                resp = await client.get(url, headers=self.ua_standard)
                if resp.status_code == 200:
                    data = resp.json()
                    raw_list = data.get("models", [])
                    modelos = []
                    for m in raw_list:
                        methods = m.get("supportedGenerationMethods", [])
                        if "generateContent" in methods:
                            m_id = m.get("name", "").replace("models/", "")
                            d_name = m.get("displayName") or m_id
                            if "embedding" not in m_id.lower() and "aqa" not in m_id.lower():
                                modelos.append({"id": m_id, "nombre": f"{d_name} ({m_id})" if d_name != m_id else m_id})
                    if modelos:
                        return {"exito": True, "proveedor": "gemini", "modelos": modelos, "origen": "live"}
        except Exception as e:
            logger.warning(f"⚠️ [GeminiProvider] Fallo al listar modelos en vivo: {e}")

        return {"exito": True, "proveedor": "gemini", "modelos": FALLBACK_MODELOS_GEMINI, "origen": "fallback"}

    async def sincronizar_tokens_async(
        self,
        api_key: str = "",
        stats_actuales: Optional[Dict[str, Any]] = None,
        modelo: str = ""
    ) -> Dict[str, Any]:
        key = str(api_key or "").strip()
        mod = (modelo or self.default_model).replace("models/", "").strip()
        stats = stats_actuales or {}

        if not key:
            return stats

        url_model = f"https://generativelanguage.googleapis.com/v1beta/models/{mod}?key={key}"
        url_count = f"https://generativelanguage.googleapis.com/v1beta/models/{mod}:countTokens?key={key}"

        try:
            async with crear_httpx_async_client(timeout=15.0) as client:
                resp_info = await client.get(url_model, headers=self.ua_standard)
                disp_name = mod
                in_lim = 1048576

                if resp_info.status_code == 200:
                    info_json = resp_info.json()
                    disp_name = info_json.get("displayName", mod)
                    in_lim = int(info_json.get("inputTokenLimit", 1048576))
                elif resp_info.status_code in [400, 401, 403]:
                    return {
                        "limite_tokens": 1048576,
                        "tokens_restantes": 0,
                        "porcentaje_restante": 0.0,
                        "detalle_api": f"⚠️ Clave Gemini no válida (HTTP {resp_info.status_code})"
                    }

                resp_count = await client.post(
                    url_count,
                    json={"contents": [{"parts": [{"text": "1"}]}]},
                    headers={"Content-Type": "application/json", **self.ua_standard}
                )

                if resp_count.status_code == 200:
                    usados = stats.get("tokens_usados_sesion", 0)
                    rem_tok = max(0, in_lim - usados)
                    label_name = disp_name if disp_name.startswith("Gemini") else f"Gemini {disp_name}"
                    return {
                        "limite_tokens": in_lim,
                        "tokens_restantes": rem_tok,
                        "porcentaje_restante": round((rem_tok / max(1, in_lim)) * 100, 1),
                        "detalle_api": f"{label_name}: Conectado | Ctx: {in_lim:,} tokens | 15 RPM / 1M TPM"
                    }
                elif resp_count.status_code == 429:
                    return {
                        "limite_tokens": in_lim,
                        "tokens_restantes": 0,
                        "porcentaje_restante": 0.0,
                        "detalle_api": "⚠️ Cuota de Gemini agotada (HTTP 429 / RESOURCE_EXHAUSTED)"
                    }
                else:
                    # Fallback con los datos de modelo ya obtenidos
                    usados = stats.get("tokens_usados_sesion", 0)
                    rem_tok = max(0, in_lim - usados)
                    label_name = disp_name if disp_name.startswith("Gemini") else f"Gemini {disp_name}"
                    return {
                        "limite_tokens": in_lim,
                        "tokens_restantes": rem_tok,
                        "porcentaje_restante": round((rem_tok / max(1, in_lim)) * 100, 1),
                        "detalle_api": f"{label_name}: Conectado (HTTP {resp_count.status_code})"
                    }
        except Exception as e:
            logger.warning(f"⚠️ [GeminiProvider] Error en sincronizar_tokens_async: {e}")
            # Retornar stats con límites conocidos en lugar de dict vacío
            return {
                "limite_tokens": stats.get("limite_tokens", 1048576),
                "tokens_restantes": stats.get("tokens_restantes", 1048576),
                "porcentaje_restante": stats.get("porcentaje_restante", 100.0),
                "detalle_api": stats.get("detalle_api", "Gemini: Error de sincronización")
            }

        return stats

    async def contar_tokens_async(self, texto: str, modelo: str = "", api_key: str = "") -> int:
        if not texto:
            return 0
        key = str(api_key or "").strip()
        if not key:
            return max(1, len(texto) // 4)

        mod = (modelo or self.default_model).replace("models/", "").strip()
        url_count = f"https://generativelanguage.googleapis.com/v1beta/models/{mod}:countTokens?key={key}"
        try:
            async with crear_httpx_async_client(timeout=10.0) as client:
                resp = await client.post(
                    url_count,
                    json={"contents": [{"parts": [{"text": texto}]}]},
                    headers={"Content-Type": "application/json", **self.ua_standard}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return int(data.get("totalTokens", max(1, len(texto) // 4)))
        except Exception as e:
            logger.debug(f"[GeminiProvider] Fallback en conteo de tokens: {e}")

        return max(1, len(texto) // 4)
