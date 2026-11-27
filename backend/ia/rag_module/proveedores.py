import os
import sys
import json
import time
import re
import concurrent.futures
from typing import List, Dict, Any, Optional

from backend.ia.rag_module.comun import (
    LLMProviderFactory,
    _obtener_chromadb,
    _obtener_ollama,
    logger,
)


class RAGProveedoresMixin:
    """Gestión de proveedores LLM (Ollama y Cloud), telemetría de tokens y diagnóstico."""

    def _cargar_ajustes_guardados(self):
        """Carga automáticamente las claves de API y modelos guardados en ajustes_lectura.json."""
        try:
            from backend.core.estado_global import estado_app
            ruta_ajustes = os.path.join(estado_app.base_dir, "ajustes_lectura.json")
            if os.path.exists(ruta_ajustes):
                with open(ruta_ajustes, "r", encoding="utf-8") as f:
                    ajustes = json.load(f)
                    guardados_keys = ajustes.get("ia_cloud_keys", {})
                    if isinstance(guardados_keys, dict):
                        for k, v in guardados_keys.items():
                            if k in self.cloud_api_keys and v:
                                self.cloud_api_keys[k] = str(v).strip()

                    guardados_modelos = ajustes.get("ia_cloud_modelos", {})
                    if isinstance(guardados_modelos, dict):
                        for k, v in guardados_modelos.items():
                            if k in self.cloud_modelos and v:
                                self.cloud_modelos[k] = str(v).strip()

                    prov = ajustes.get("ia_proveedor_activo")
                    if prov and prov in ["ollama", "gemini", "groq", "openai", "deepseek", "openrouter"]:
                        self.proveedor_activo = prov
        except Exception as e:
            logger.warning(f"⚠️ [RAG] No se pudieron cargar ajustes_lectura.json iniciales: {e}")

    def configurar_proveedor(self, proveedor: str, api_key: str = "", modelo_cloud: str = "", modelo: str = "") -> Dict[str, Any]:
        """Actualiza el proveedor activo ('ollama', 'gemini', 'groq', 'openai', 'deepseek') y sus credenciales locales."""
        prov = str(proveedor or "ollama").lower().strip()
        self.proveedor_activo = prov
        mod = (modelo_cloud or modelo or "").strip()
        if prov in self.cloud_api_keys and api_key is not None:
            self.cloud_api_keys[prov] = str(api_key).strip()
        if prov in self.cloud_modelos and mod:
            self.cloud_modelos[prov] = mod
        logger.info(f"🔄 [RAG] Proveedor de IA configurado: {self.proveedor_activo} (Modelo: {self.cloud_modelos.get(self.proveedor_activo, self.chat_model)})")
        return {
            "exito": True,
            "proveedor_activo": self.proveedor_activo,
            "modelo": self.cloud_modelos.get(self.proveedor_activo, self.chat_model)
        }

    def verificar_conexion_cloud(self, proveedor: str, api_key: str, modelo: str = "") -> Dict[str, Any]:
        """Prueba rápida de conectividad a la API en la nube del proveedor especificado."""
        prov = str(proveedor or "").lower().strip()
        key = str(api_key or "").strip() or self.cloud_api_keys.get(prov, "")
        mod = str(modelo or "").strip() or self.cloud_modelos.get(prov, "")

        if not key:
            return {"exito": False, "error": "No se proporcionó API Key para la prueba."}

        try:
            provider = LLMProviderFactory.get_provider(prov, host=self.host)
            return provider.verificar_conexion(api_key=key, modelo=mod)
        except Exception as e:
            logger.error(f"❌ [RAG] Error verificando conexión con {prov}: {e}")
            return {"exito": False, "proveedor": prov, "error": str(e)}

    def obtener_modelos_disponibles(self, proveedor: str, api_key: str = "") -> Dict[str, Any]:
        """Consulta directamente la API oficial del proveedor para obtener la lista real de modelos activos y compatibles."""
        prov = str(proveedor or "ollama").lower().strip()
        key = str(api_key or "").strip() or self.cloud_api_keys.get(prov, "")

        provider = LLMProviderFactory.get_provider(prov, host=self.host)
        return provider.obtener_modelos(api_key=key)

    # =========================================================================
    # ESTADÍSTICAS Y MONITOR DE TOKENS EN TIEMPO REAL
    # =========================================================================
    def _cargar_estadisticas_tokens(self):
        """Carga el registro acumulado de tokens desde el archivo JSON persistente."""
        try:
            if hasattr(self, "token_file") and os.path.exists(self.token_file):
                with open(self.token_file, "r", encoding="utf-8") as f:
                    guardado = json.load(f)
                    if isinstance(guardado, dict):
                        for k, v in guardado.items():
                            if k in self.token_stats and isinstance(v, dict):
                                self.token_stats[k].update(v)
        except Exception as e:
            logger.warning(f"⚠️ [RAG] No se pudo cargar token_stats.json: {e}")

    def _guardar_estadisticas_tokens(self):
        """Guarda las métricas de tokens en disco de forma atómica."""
        try:
            if hasattr(self, "token_file"):
                os.makedirs(self.db_path, exist_ok=True)
                tmp = self.token_file + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(self.token_stats, f, ensure_ascii=False, indent=2)
                if os.path.exists(tmp):
                    os.replace(tmp, self.token_file)
        except Exception as e:
            logger.error(f"❌ [RAG] Error guardando token_stats.json: {e}")

    def _actualizar_estadisticas_tokens(
        self,
        proveedor: str,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        total_tokens: int = 0,
        limite_tokens: int = 0,
        tokens_restantes: Optional[int] = None,
        porcentaje_forzado: Optional[float] = None,
        detalle_api: str = "",
        reset_info: str = ""
    ):
        """Actualiza el consumo de tokens y las cuotas restantes del proveedor de forma acumulativa y en vivo.
        Thread-safe: protegido por _token_lock para evitar condiciones de carrera en acceso concurrente.
        """
        prov = str(proveedor).lower()
        with self._token_lock:
            if prov not in self.token_stats:
                default_limits = {
                    "gemini": 1000000,
                    "groq": 6000,
                    "openrouter": 128000,
                    "openai": 30000,
                    "deepseek": 64000,
                    "ollama": 8192
                }
                self.token_stats[prov] = {
                    "tokens_usados_sesion": 0,
                    "ultimo_prompt_tokens": 0,
                    "ultimo_completion_tokens": 0,
                    "ultimo_total_tokens": 0,
                    "limite_tokens": default_limits.get(prov, 8192),
                    "tokens_restantes": default_limits.get(prov, 8192),
                    "porcentaje_restante": 100.0,
                    "detalle_api": "",
                    "reset_info": "",
                    "timestamp": time.time()
                }

            stat = self.token_stats[prov]
            tot = total_tokens if total_tokens > 0 else (prompt_tokens + completion_tokens)
            if tot > 0:
                stat["tokens_usados_sesion"] += tot
                stat["ultimo_prompt_tokens"] = prompt_tokens
                stat["ultimo_completion_tokens"] = completion_tokens
                stat["ultimo_total_tokens"] = tot

            if limite_tokens > 0:
                stat["limite_tokens"] = limite_tokens

            if tokens_restantes is not None:
                stat["tokens_restantes"] = max(0, int(tokens_restantes))
            else:
                stat["tokens_restantes"] = max(0, stat["limite_tokens"] - stat["tokens_usados_sesion"])

            if porcentaje_forzado is not None:
                stat["porcentaje_restante"] = min(100.0, max(0.0, float(porcentaje_forzado)))
            elif stat["limite_tokens"] > 0:
                porcentaje = round((stat["tokens_restantes"] / stat["limite_tokens"]) * 100.0, 1)
                stat["porcentaje_restante"] = min(100.0, max(0.0, porcentaje))
            else:
                stat["porcentaje_restante"] = 100.0

            if detalle_api:
                stat["detalle_api"] = detalle_api
            if reset_info:
                stat["reset_info"] = reset_info

            stat["timestamp"] = time.time()
            self._guardar_estadisticas_tokens()
            logger.info(f"📊 [TOKENS - {prov.upper()}] Usados: {tot} | Restantes: {stat['tokens_restantes']}/{stat['limite_tokens']} ({stat['porcentaje_restante']}%) | Info: {stat.get('detalle_api', '')}")

    def sincronizar_tokens_api(self, proveedor: Optional[str] = None, api_key: str = "") -> Dict[str, Any]:
        """
        Consulta en tiempo real los límites de cuota, tokens restantes y saldo directamente desde la API oficial de cada proveedor.
        Detecta cuentas sin saldo, cuotas agotadas (HTTP 429 / credit_balance_exhausted) y actualiza el gauge a 0% real.
        """
        prov = (proveedor or getattr(self, "proveedor_activo", "ollama")).lower().strip()
        key = str(api_key or "").strip() or self.cloud_api_keys.get(prov, "")
        mod = self.cloud_modelos.get(prov, "")

        if prov == "ollama" or not key:
            return self.obtener_estadisticas_tokens(prov)

        try:
            provider = LLMProviderFactory.get_provider(prov, host=self.host)
            res_sync = provider.sincronizar_tokens(
                api_key=key,
                stats_actuales=self.token_stats.get(prov, {}),
                modelo=mod
            )
            if isinstance(res_sync, dict):
                self._actualizar_estadisticas_tokens(
                    proveedor=prov,
                    limite_tokens=res_sync.get("limite_tokens", 0),
                    tokens_restantes=res_sync.get("tokens_restantes"),
                    porcentaje_forzado=res_sync.get("porcentaje_restante"),
                    detalle_api=res_sync.get("detalle_api", ""),
                    reset_info=res_sync.get("reset_info", "")
                )
        except Exception as e:
            logger.warning(f"⚠️ [RAG] Sincronización en vivo de tokens con {prov}: {e}")

        return self.obtener_estadisticas_tokens(prov)

    def obtener_estadisticas_tokens(self, proveedor: Optional[str] = None) -> Dict[str, Any]:
        """Devuelve las métricas actuales de consumo y porcentaje de tokens disponibles."""
        prov = (proveedor or getattr(self, "proveedor_activo", "ollama")).lower()
        if prov not in self.token_stats:
            default_limits = {
                "gemini": 1000000,
                "groq": 6000,
                "openrouter": 128000,
                "openai": 30000,
                "deepseek": 64000,
                "ollama": 8192
            }
            lim = default_limits.get(prov, 8192)
            return {
                "proveedor": prov,
                "tokens_usados_sesion": 0,
                "ultimo_prompt_tokens": 0,
                "ultimo_completion_tokens": 0,
                "ultimo_total_tokens": 0,
                "limite_tokens": lim,
                "tokens_restantes": lim,
                "porcentaje_restante": 100.0,
                "detalle_api": "",
                "reset_info": ""
            }
        res = dict(self.token_stats[prov])
        res["proveedor"] = prov
        return res

    # =========================================================================
    # MÉTODOS ASÍNCRONOS Y CONCURRENTES (FASE 3 - No bloqueantes para la UI)
    # =========================================================================

    async def sincronizar_tokens_api_async(self, proveedor: Optional[str] = None, api_key: str = "") -> Dict[str, Any]:
        """Versión asíncrona no bloqueante de sincronizar_tokens_api. Ideal para actualizar el gauge de la UI sin freeze."""
        prov = (proveedor or getattr(self, "proveedor_activo", "ollama")).lower().strip()
        key = str(api_key or "").strip() or self.cloud_api_keys.get(prov, "")
        mod = self.cloud_modelos.get(prov, "")

        if prov == "ollama" or not key:
            return self.obtener_estadisticas_tokens(prov)

        try:
            provider = LLMProviderFactory.get_provider(prov, host=self.host)
            res_sync = await provider.sincronizar_tokens_async(
                api_key=key,
                stats_actuales=self.token_stats.get(prov, {}),
                modelo=mod
            )
            if isinstance(res_sync, dict):
                self._actualizar_estadisticas_tokens(
                    proveedor=prov,
                    limite_tokens=res_sync.get("limite_tokens", 0),
                    tokens_restantes=res_sync.get("tokens_restantes"),
                    porcentaje_forzado=res_sync.get("porcentaje_restante"),
                    detalle_api=res_sync.get("detalle_api", ""),
                    reset_info=res_sync.get("reset_info", "")
                )
        except Exception as e:
            logger.warning(f"⚠️ [RAG] sincronizar_tokens_api_async con {prov}: {e}")

        return self.obtener_estadisticas_tokens(prov)

    async def obtener_modelos_disponibles_async(self, proveedor: str, api_key: str = "") -> Dict[str, Any]:
        """Versión asíncrona no bloqueante de obtener_modelos_disponibles."""
        prov = str(proveedor or "ollama").lower().strip()
        key = str(api_key or "").strip() or self.cloud_api_keys.get(prov, "")
        provider = LLMProviderFactory.get_provider(prov, host=self.host)
        return await provider.obtener_modelos_async(api_key=key)

    async def _generar_respuesta_llm_async(
        self,
        system_prompt: str,
        mensajes_previos: List[Dict[str, str]],
        user_prompt: str,
        temperatura: float = 0.2,
        stream_callback: Optional[Any] = None
    ) -> str:
        """Versión asíncrona no bloqueante de _generar_respuesta_llm para uso en contextos async."""
        prov = getattr(self, "proveedor_activo", "ollama").lower()
        key = self.cloud_api_keys.get(prov, "")
        mod = self.cloud_modelos.get(prov, self.chat_model)

        provider = LLMProviderFactory.get_provider(prov, host=self.host)
        cb = stream_callback if stream_callback is not None else getattr(self, "stream_callback", None)
        kwargs_extra = {"stream_callback": cb} if (prov == "ollama" and cb is not None) else {}
        res = await provider.generar_respuesta_async(
            system_prompt=system_prompt,
            mensajes_previos=mensajes_previos,
            user_prompt=user_prompt,
            temperatura=temperatura,
            api_key=key,
            modelo=mod,
            **kwargs_extra
        )

        texto = res.get("texto", "").strip()
        usage = res.get("usage", {})
        rate_limits = res.get("rate_limits", {})

        p_tok = int(usage.get("prompt_tokens", 0))
        c_tok = int(usage.get("completion_tokens", 0))
        t_tok = int(usage.get("total_tokens", p_tok + c_tok))

        self._actualizar_estadisticas_tokens(
            proveedor=prov,
            prompt_tokens=p_tok,
            completion_tokens=c_tok,
            total_tokens=t_tok,
            limite_tokens=rate_limits.get("limite_tokens", 0),
            tokens_restantes=rate_limits.get("tokens_restantes"),
            porcentaje_forzado=rate_limits.get("porcentaje_restante"),
            detalle_api=res.get("detalle", ""),
            reset_info=rate_limits.get("reset_tokens", "")
        )

        return texto

    def sincronizar_tokens_api_en_background(self, proveedor: Optional[str] = None, api_key: str = "") -> "concurrent.futures.Future":
        """
        Dispara la sincronización de tokens en un hilo del ThreadPoolExecutor sin bloquear el hilo principal.
        Retorna un Future. Útil para actualizar el gauge de tokens en background.
        """
        return self._executor.submit(self.sincronizar_tokens_api, proveedor, api_key)

    # =========================================================================
    # LLAMADAS DIRECTAS A PROVEEDORES LLM (DESACOPLADOS MEDIANTE PROVIDER FACTORY)
    # =========================================================================
    def _llamar_gemini_api(
        self,
        system_prompt: str,
        mensajes_previos: List[Dict[str, str]],
        user_prompt: str,
        temperatura: float = 0.2,
        api_key: Optional[str] = None,
        modelo: Optional[str] = None
    ) -> str:
        key = api_key or self.cloud_api_keys.get("gemini", "")
        mod = modelo or self.cloud_modelos.get("gemini", "gemini-1.5-flash")
        provider = LLMProviderFactory.get_provider("gemini")
        res = provider.generar_respuesta(
            system_prompt=system_prompt,
            mensajes_previos=mensajes_previos,
            user_prompt=user_prompt,
            temperatura=temperatura,
            api_key=key,
            modelo=mod
        )
        return res.get("texto", "")

    def contar_tokens_gemini(
        self,
        texto: str,
        modelo: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> int:
        """Calcula el número exacto de tokens usando el endpoint oficial :countTokens de Google Gemini."""
        key = api_key or self.cloud_api_keys.get("gemini", "")
        mod = modelo or self.cloud_modelos.get("gemini", "gemini-1.5-flash")
        gemini_prov = LLMProviderFactory.get_provider("gemini")
        return gemini_prov.contar_tokens(texto, modelo=mod, api_key=key)

    def _llamar_groq_api(
        self,
        system_prompt: str,
        mensajes_previos: List[Dict[str, str]],
        user_prompt: str,
        temperatura: float = 0.2,
        api_key: Optional[str] = None,
        modelo: Optional[str] = None
    ) -> str:
        key = api_key or self.cloud_api_keys.get("groq", "")
        mod = modelo or self.cloud_modelos.get("groq", "llama-3.3-70b-versatile")
        provider = LLMProviderFactory.get_provider("groq")
        res = provider.generar_respuesta(
            system_prompt=system_prompt,
            mensajes_previos=mensajes_previos,
            user_prompt=user_prompt,
            temperatura=temperatura,
            api_key=key,
            modelo=mod
        )
        return res.get("texto", "")

    def _llamar_openai_compatible_api(
        self,
        endpoint_url: str,
        api_key: str,
        modelo: str,
        system_prompt: str,
        mensajes_previos: List[Dict[str, str]],
        user_prompt: str,
        temperatura: float = 0.2,
        extra_headers: Optional[Dict[str, str]] = None,
        proveedor_nombre: str = "openai"
    ) -> str:
        provider = LLMProviderFactory.get_provider(proveedor_nombre)
        res = provider.generar_respuesta(
            system_prompt=system_prompt,
            mensajes_previos=mensajes_previos,
            user_prompt=user_prompt,
            temperatura=temperatura,
            api_key=api_key,
            modelo=modelo
        )
        return res.get("texto", "")

    def _generar_respuesta_llm(
        self,
        system_prompt: str,
        mensajes_previos: List[Dict[str, str]],
        user_prompt: str,
        temperatura: float = 0.2
    ) -> str:
        """Despacha la generación de texto hacia Ollama o hacia el proveedor Cloud activo."""
        prov = getattr(self, "proveedor_activo", "ollama").lower()
        key = self.cloud_api_keys.get(prov, "")
        mod = self.cloud_modelos.get(prov, self.chat_model)

        provider = LLMProviderFactory.get_provider(prov, host=self.host)
        res = provider.generar_respuesta(
            system_prompt=system_prompt,
            mensajes_previos=mensajes_previos,
            user_prompt=user_prompt,
            temperatura=temperatura,
            api_key=key,
            modelo=mod
        )

        texto = res.get("texto", "").strip()
        usage = res.get("usage", {})
        rate_limits = res.get("rate_limits", {})

        p_tok = int(usage.get("prompt_tokens", 0))
        c_tok = int(usage.get("completion_tokens", 0))
        t_tok = int(usage.get("total_tokens", p_tok + c_tok))

        lim_tok = rate_limits.get("limite_tokens", 0)
        rem_tok = rate_limits.get("tokens_restantes")
        porc_forzado = rate_limits.get("porcentaje_restante")
        reset_inf = rate_limits.get("reset_tokens", "")

        self._actualizar_estadisticas_tokens(
            proveedor=prov,
            prompt_tokens=p_tok,
            completion_tokens=c_tok,
            total_tokens=t_tok,
            limite_tokens=lim_tok,
            tokens_restantes=rem_tok,
            porcentaje_forzado=porc_forzado,
            detalle_api=res.get("detalle", ""),
            reset_info=reset_inf
        )

        return texto

    @staticmethod
    def _extraer_nombres_modelos_ollama(res: Any) -> List[str]:
        """Extrae la lista de nombres de modelos desde la respuesta de Ollama client.list()."""
        if hasattr(res, "models"):
            modelos_raw = getattr(res, "models", [])
        elif isinstance(res, dict):
            modelos_raw = res.get("models", [])
        else:
            modelos_raw = []

        nombres = []
        for m in modelos_raw:
            nombre = getattr(m, "model", None) or getattr(m, "name", None) or (m.get("name") if isinstance(m, dict) else str(m))
            if nombre:
                nombres.append(nombre)
        return nombres

    def _inspeccionar_modelos_ollama(self, resultado: Dict[str, Any]) -> None:
        """Consulta los modelos instalados en Ollama y actualiza banderas de disponibilidad/auto-selección."""
        try:
            res = self.client_ollama.list()
            nombres = self._extraer_nombres_modelos_ollama(res)

            resultado["ollama_activo"] = True
            resultado["ollama_online"] = True
            resultado["modelos_disponibles"] = nombres
            resultado["modelos_instalados"] = nombres

            for nom in nombres:
                if self.embed_model in nom:
                    resultado["embed_model_listo"] = True
                if self.chat_model in nom:
                    resultado["chat_model_listo"] = True

            # Auto-selección inteligente del modelo de chat instalado
            if not resultado["chat_model_listo"] and nombres:
                for nom in nombres:
                    if not any(k in nom.lower() for k in ("embed", "nomic", "bge", "bert")):
                        self.chat_model = nom
                        resultado["chat_model"] = nom
                        resultado["chat_model_listo"] = True
                        break
                if not resultado["chat_model_listo"]:
                    self.chat_model = nombres[0]
                    resultado["chat_model"] = nombres[0]
                    resultado["chat_model_listo"] = True
        except Exception as e:
            resultado["error"] = str(e)
            resultado["ollama_activo"] = False
            resultado["ollama_online"] = False

    def verificar_estado_ia(self) -> Dict[str, Any]:
        """Diagnóstico completo del estado del servicio Ollama, proveedores Cloud y modelos disponibles."""
        resultado = {
            "proveedor_activo": self.proveedor_activo,
            "cloud_modelos": self.cloud_modelos,
            "cloud_keys_configuradas": {k: bool(v) for k, v in self.cloud_api_keys.items()},
            "ollama_instalado": _obtener_ollama() is not None,
            "chromadb_instalado": _obtener_chromadb()[0] is not None,
            "ollama_activo": False,
            "ollama_online": False,
            "modelos_disponibles": [],
            "modelos_instalados": [],
            "embed_model_listo": False,
            "chat_model_listo": False,
            "embed_model": self.embed_model,
            "chat_model": self.chat_model,
            "db_path": self.db_path,
            "total_vectores": 0,
            "fts_disponible": self.fts_store is not None,
            "total_chunks_fts": self.fts_store.contar_chunks() if self.fts_store else 0
        }

        if self.collection:
            try:
                resultado["total_vectores"] = self.collection.count()
            except Exception:
                pass

        if not self.client_ollama:
            return resultado

        self._inspeccionar_modelos_ollama(resultado)

        resultado["ollama_online"] = resultado.get("ollama_activo", False)
        resultado["modelos_instalados"] = resultado.get("modelos_disponibles", [])
        return resultado

    # =========================================================================
