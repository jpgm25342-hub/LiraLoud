# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import logging
from typing import Dict, List, Optional
from .base_provider import BaseLLMProvider
from .gemini_provider import GeminiProvider
from .groq_provider import GroqProvider
from .ollama_provider import OllamaProvider
from .openai_compatible_provider import OpenAICompatibleProvider

logger = logging.getLogger("LiraLLMFactory")

class LLMProviderFactory:
    """Fábrica y registro centralizado de proveedores LLM."""

    _instances: Dict[str, BaseLLMProvider] = {}

    @classmethod
    def get_provider(cls, name: str, host: Optional[str] = None) -> BaseLLMProvider:
        prov_key = str(name or "ollama").lower().strip()

        if prov_key in cls._instances:
            inst = cls._instances[prov_key]
            if prov_key == "ollama" and host and hasattr(inst, "host") and inst.host != host:
                inst.host = host
                inst._inicializar_cliente()
            return inst

        if prov_key == "gemini":
            provider = GeminiProvider()
        elif prov_key == "groq":
            provider = GroqProvider()
        elif prov_key == "ollama":
            provider = OllamaProvider(host=host or "http://127.0.0.1:11434")
        elif prov_key in ["openai", "deepseek", "openrouter"]:
            provider = OpenAICompatibleProvider(provider_type=prov_key)
        else:
            logger.warning(f"⚠️ [LLMProviderFactory] Proveedor desconocido '{prov_key}', usando Ollama por defecto.")
            provider = OllamaProvider(host=host or "http://127.0.0.1:11434")

        cls._instances[prov_key] = provider
        return provider

    @classmethod
    def list_supported_providers(cls) -> List[str]:
        return ["ollama", "gemini", "groq", "openrouter", "openai", "deepseek"]
