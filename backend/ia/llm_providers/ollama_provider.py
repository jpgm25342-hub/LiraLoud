# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import asyncio
import logging
from typing import List, Dict, Any, Optional
from .base_provider import BaseLLMProvider

try:
    import ollama
except ImportError:
    ollama = None

logger = logging.getLogger("LiraOllamaProvider")


def _get(obj: Any, key: str, default: Any = None) -> Any:
    """
    Extrae un valor de un objeto Ollama (que puede ser dataclass/objeto o dict).
    Soporta notación de punto para atributos anidados: _get(obj, "message.content").
    """
    keys = key.split(".")
    current = obj
    for k in keys:
        if current is None:
            return default
        if isinstance(current, dict):
            current = current.get(k)
        else:
            current = getattr(current, k, None)
    return current if current is not None else default


class OllamaProvider(BaseLLMProvider):
    """Proveedor asíncrono y local para modelos servidos mediante Ollama."""

    def __init__(self, host: str = "http://127.0.0.1:11434", default_model: str = "llama3.2"):
        super().__init__(name="ollama", default_model=default_model)
        self.host = host
        self.client: Optional[Any] = None
        self._inicializar_cliente()

    def _inicializar_cliente(self):
        if ollama:
            try:
                self.client = ollama.Client(host=self.host)
            except Exception as e:
                logger.warning(f"⚠️ [OllamaProvider] No se pudo inicializar cliente Ollama: {e}")

    async def generar_respuesta_async(
        self,
        system_prompt: str,
        mensajes_previos: List[Dict[str, str]],
        user_prompt: str,
        temperatura: float = 0.2,
        api_key: str = "",
        modelo: str = "",
        stream_callback: Optional[Any] = None
    ) -> Dict[str, Any]:
        if not self.client:
            self._inicializar_cliente()
        if not self.client:
            raise RuntimeError("Ollama no está disponible o no se pudo conectar.")

        mod = modelo or self.default_model
        messages = [{"role": "system", "content": system_prompt}]
        for m in mensajes_previos:
            messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})
        messages.append({"role": "user", "content": user_prompt})

        # Calcular tokens aprox del prompt para ajustar num_ctx dinámicamente
        # num_ctx debe ser mayor al prompt para que el modelo pueda generar respuesta
        chars_totales = sum(len(m["content"]) for m in messages)
        tokens_aprox = max(chars_totales // 3, 512)     # estimación conservadora: 3 chars/token
        # Dar al menos 2048 tokens de espacio para la respuesta
        num_ctx = max(tokens_aprox + 2048, 4096)
        # Respetar el límite práctico de 32768 para no agotar RAM
        num_ctx = min(num_ctx, 32768)

        def _do_chat():
            if stream_callback is not None:
                import time
                stream_iter = self.client.chat(
                    model=mod,
                    messages=messages,
                    stream=True,
                    options={
                        "temperature": max(0.0, min(1.0, temperatura)),
                        "num_ctx": num_ctx
                    }
                )
                partes = []
                last_emit = 0.0
                last_chunk = None
                for ch in stream_iter:
                    last_chunk = ch
                    delta = str(_get(ch, "message.content", "") or "")
                    if delta:
                        partes.append(delta)
                        ahora = time.monotonic()
                        if (ahora - last_emit) >= 0.06:
                            last_emit = ahora
                            try:
                                stream_callback("".join(partes))
                            except Exception:
                                pass
                texto_final = "".join(partes)
                try:
                    stream_callback(texto_final)
                except Exception:
                    pass
                return {
                    "message": {"content": texto_final},
                    "prompt_eval_count": _get(last_chunk, "prompt_eval_count", 0) if last_chunk else 0,
                    "eval_count": _get(last_chunk, "eval_count", 0) if last_chunk else 0
                }
            return self.client.chat(
                model=mod,
                messages=messages,
                options={
                    "temperature": max(0.0, min(1.0, temperatura)),
                    "num_ctx": num_ctx
                }
            )

        try:
            response = await asyncio.to_thread(_do_chat)

            # El SDK de Ollama retorna objetos con atributos (no dicts).
            # Usamos _get() para soportar ambas formas (objeto y dict).
            texto = str(_get(response, "message.content", "") or "").strip()

            p_tok = int(_get(response, "prompt_eval_count", 0) or 0)
            c_tok = int(_get(response, "eval_count", 0) or 0)
            t_tok = p_tok + c_tok

            if not texto:
                logger.warning(
                    f"⚠️ [OllamaProvider] Respuesta vacía de {mod}. "
                    f"num_ctx usado: {num_ctx} | chars_prompt: {chars_totales} | "
                    f"prompt_eval_count: {p_tok} | eval_count: {c_tok} | "
                    f"Tipo response: {type(response)}"
                )
                # Si el modelo no generó nada, es probable que el prompt sea aún muy largo
                # Retornamos un mensaje claro para el usuario en lugar de silencio
                texto = (
                    f"⚠️ El modelo {mod} recibió el contexto ({p_tok} tokens de prompt) "
                    "pero no pudo generar una respuesta. El documento puede ser muy extenso para el contexto disponible. "
                    "Intenta con una pregunta más específica o selecciona un proveedor cloud (Gemini / Groq) en Ajustes."
                )

            return {
                "texto": texto,
                "usage": {
                    "prompt_tokens": p_tok,
                    "completion_tokens": c_tok,
                    "total_tokens": t_tok
                },
                "modelo": mod
            }
        except Exception as e:
            raise RuntimeError(f"Error Ollama ({mod}): {e}")

    async def verificar_conexion_async(self, api_key: str = "", modelo: str = "") -> Dict[str, Any]:
        if not self.client:
            self._inicializar_cliente()
        if not self.client:
            return {"exito": False, "proveedor": "ollama", "error": "No se pudo conectar con el servidor Ollama."}

        mod = modelo or self.default_model
        try:
            res = await self.generar_respuesta_async(
                system_prompt="Eres un asistente de verificación.",
                mensajes_previos=[],
                user_prompt="OK",
                api_key="",
                modelo=mod
            )
            return {
                "exito": True,
                "proveedor": "ollama",
                "modelo": mod,
                "respuesta": res.get("texto", "OK"),
                "mensaje": f"¡Conexión exitosa con OLLAMA ({mod})!"
            }
        except Exception as e:
            return {"exito": False, "proveedor": "ollama", "error": str(e)}

    async def obtener_modelos_async(self, api_key: str = "") -> Dict[str, Any]:
        if not self.client:
            self._inicializar_cliente()

        if self.client:
            try:
                res = await asyncio.to_thread(self.client.list)
                # res puede ser objeto ListResponse con atributo .models, o un dict
                modelos_raw = _get(res, "models", []) or []
                modelos = []
                for m in modelos_raw:
                    # Cada modelo puede ser objeto Model con atributo .model, o dict
                    nom = _get(m, "model") or _get(m, "name")
                    if nom:
                        modelos.append({"id": nom, "nombre": nom})
                if modelos:
                    return {"exito": True, "proveedor": "ollama", "modelos": modelos, "origen": "live"}
            except Exception as e:
                logger.warning(f"⚠️ [OllamaProvider] Error al listar modelos: {e}")

        return {
            "exito": False,
            "proveedor": "ollama",
            "modelos": [{"id": "llama3.2", "nombre": "llama3.2"}],
            "origen": "fallback"
        }

    async def sincronizar_tokens_async(
        self,
        api_key: str = "",
        stats_actuales: Optional[Dict[str, Any]] = None,
        modelo: str = ""
    ) -> Dict[str, Any]:
        stats = stats_actuales or {}
        return stats
