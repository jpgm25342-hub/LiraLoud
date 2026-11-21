import json
import re
import shutil
import socket
import subprocess
import threading
import time
import urllib.parse
import urllib.request


def buscar_modelos_hf_gguf(query="", limit=15):
    """Consulta en tiempo real modelos LLM GGUF en Hugging Face ordenados por descargas."""
    try:
        params = {
            "filter": "gguf",
            "sort": "downloads",
            "direction": "-1",
            "limit": str(int(limit)),
            "full": "true"
        }
        if query and str(query).strip():
            params["search"] = str(query).strip()
        else:
            params["pipeline_tag"] = "text-generation"
        url = "https://huggingface.co/api/models?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent": "LiraLoud/1.0"})
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        resultados = []
        for m in data:
            mid = m.get("id") or m.get("modelId") or ""
            if not mid:
                continue
            bytes_peso = m.get("usedStorage") or 0
            if not bytes_peso:
                gguf_sizes = [
                    s.get("size", 0) for s in m.get("siblings", [])
                    if isinstance(s, dict) and str(s.get("rfilename", "")).lower().endswith(".gguf") and s.get("size", 0) > 0
                ]
                if gguf_sizes:
                    gguf_sizes.sort()
                    bytes_peso = gguf_sizes[len(gguf_sizes) // 2]
            if bytes_peso >= (1024 ** 3):
                peso_str = f"~{bytes_peso / (1024 ** 3):.1f} GB"
            elif bytes_peso >= (1024 ** 2):
                peso_str = f"~{bytes_peso / (1024 ** 2):.0f} MB"
            else:
                m_params = re.search(r'(\d+(?:\.\d+)?)\s*[bB]\b', mid)
                if m_params:
                    est_gb = float(m_params.group(1)) * 0.6
                    peso_str = f"~{est_gb:.1f} GB (Q4)" if est_gb >= 1.0 else f"~{int(est_gb * 1024)} MB (Q4)"
                else:
                    peso_str = "N/D"
            resultados.append({
                "id": mid,
                "hf_tag": f"hf.co/{mid}",
                "downloads": m.get("downloads", 0),
                "likes": m.get("likes", 0),
                "pipeline": m.get("pipeline_tag", "text-generation"),
                "peso": peso_str
            })
        return {"exito": True, "modelos": resultados}
    except Exception as e:
        return {"exito": False, "error": str(e), "modelos": []}


def iniciar_ollama_local():
    """Verifica si Ollama está instalado y lo inicia en segundo plano si no está corriendo."""
    if not shutil.which("ollama"):
        return {
            "exito": False,
            "instalado": False,
            "mensaje": "Ollama no está instalado. Descarga Ollama desde ollama.com para acceder a los modelos locales."
        }

    try:
        with urllib.request.urlopen("http://localhost:11434/api/tags", timeout=1.5) as resp:
            if resp.status == 200:
                return {"exito": True, "instalado": True, "mensaje": "Ollama ya está activo."}
    except Exception:
        pass

    try:
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        subprocess.Popen(["ollama", "serve"], creationflags=creationflags)
        for _ in range(6):
            time.sleep(0.5)
            try:
                with urllib.request.urlopen("http://localhost:11434/api/tags", timeout=1.0) as resp:
                    if resp.status == 200:
                        return {"exito": True, "instalado": True, "mensaje": "Ollama iniciado correctamente."}
            except Exception:
                continue
        return {"exito": True, "instalado": True, "mensaje": "Ollama iniciándose en segundo plano..."}
    except Exception as e:
        return {"exito": False, "instalado": True, "mensaje": f"No se pudo iniciar Ollama: {e}"}


def obtener_info_hardware_ollama():
    """Devuelve RAM total, VRAM (NVIDIA/AMD/Intel Arc), modelo sugerido e instalados en Ollama."""
    ram_gb = 8.0
    try:
        import psutil
        ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 1)
    except Exception:
        pass

    if ram_gb < 7.0:
        recomendado = "gemma2:2b"
    elif ram_gb < 14.0:
        recomendado = "qwen2.5:3b"
    else:
        recomendado = "qwen2.5:7b"

    vram_gb = 0.0
    gpu_nombre = ""
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            timeout=2.0,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
        ).decode("utf-8", errors="ignore").strip()
        if out:
            partes = [p.strip() for p in out.splitlines()[0].split(",")]
            if len(partes) >= 2:
                gpu_nombre = partes[0]
                vram_gb = round(float(partes[1]) / 1024.0, 1)
    except Exception:
        pass

    if vram_gb <= 0.0:
        try:
            ps_cmd = "Get-CimInstance Win32_VideoController | Where-Object { $_.AdapterRAM -gt 0 } | Sort-Object AdapterRAM -Descending | Select-Object -First 1 Name, AdapterRAM | ConvertTo-Json"
            out_ps = subprocess.check_output(
                ["powershell", "-NoProfile", "-Command", ps_cmd],
                timeout=2.5,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
            ).decode("utf-8", errors="ignore").strip()
            if out_ps:
                gpu_info = json.loads(out_ps)
                if isinstance(gpu_info, dict) and gpu_info.get("AdapterRAM"):
                    gpu_nombre = str(gpu_info.get("Name", "")).strip()
                    vram_gb = round(float(gpu_info["AdapterRAM"]) / (1024 ** 3), 1)
        except Exception:
            pass

    instalados = []
    ollama_activo = False
    try:
        with urllib.request.urlopen("http://localhost:11434/api/tags", timeout=2.0) as resp:
            if resp.status == 200:
                ollama_activo = True
                data = json.loads(resp.read().decode("utf-8"))
                instalados = [m.get("name", "") for m in data.get("models", []) if m.get("name")]
    except Exception:
        pass

    return {
        "ram_gb": ram_gb,
        "vram_gb": vram_gb,
        "gpu_nombre": gpu_nombre,
        "recomendado": recomendado,
        "instalados": instalados,
        "ollama_activo": ollama_activo
    }


_descargas_estado = {}


def _cerrar_stream_ollama(st):
    resp = st.get("resp")
    if not resp:
        return
    try:
        fp = getattr(resp, "fp", None)
        raw = getattr(fp, "raw", fp)
        sock = getattr(raw, "_sock", None)
        if sock:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except Exception:
                pass
            try:
                sock.close()
            except Exception:
                pass
    except Exception:
        pass
    try:
        resp.close()
    except Exception:
        pass


def cancelar_descarga_ollama(nombre_modelo):
    """Cancela una descarga activa de Ollama cerrando el stream y socket."""
    st = _descargas_estado.get(nombre_modelo)
    if st:
        st["cancelar"] = True
        st["pausado"] = False
        _cerrar_stream_ollama(st)
    return {"cancelado": True}


def pausar_descarga_ollama(nombre_modelo):
    """Pausa una descarga activa cerrando el stream y socket (Ollama reanuda por capas al volver a pedir pull)."""
    st = _descargas_estado.get(nombre_modelo)
    if st:
        st["pausado"] = True
        _cerrar_stream_ollama(st)
    return {"pausado": True}


def descargar_modelo_ollama(nombre_modelo, callback_progreso):
    """Descarga un modelo de Ollama en segundo plano reportando progreso vía callback_progreso."""
    prev_pct = _descargas_estado.get(nombre_modelo, {}).get("last_pct", 0)
    st = {"cancelar": False, "pausado": False, "resp": None, "last_pct": prev_pct}
    _descargas_estado[nombre_modelo] = st

    def _worker():
        try:
            req = urllib.request.Request(
                "http://localhost:11434/api/pull",
                data=json.dumps({"name": nombre_modelo, "stream": True}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=600) as resp:
                st["resp"] = resp
                if st.get("cancelar") or st.get("pausado") or _descargas_estado.get(nombre_modelo) is not st:
                    _cerrar_stream_ollama(st)
                else:
                    for raw_line in resp:
                        if st.get("cancelar") or st.get("pausado") or _descargas_estado.get(nombre_modelo) is not st:
                            break
                        if not raw_line:
                            continue
                        try:
                            ev = json.loads(raw_line.decode("utf-8"))
                        except Exception:
                            continue
                        if ev.get("error"):
                            if _descargas_estado.get(nombre_modelo) is st and not st.get("cancelar") and not st.get("pausado"):
                                callback_progreso(nombre_modelo, 0, f"Error: {ev['error']}", False, True)
                            return
                        total = ev.get("total") or 0
                        completed = ev.get("completed") or 0
                        pct = int((completed / total) * 100) if total > 0 else st.get("last_pct", 0)
                        st["last_pct"] = pct
                        status = ev.get("status", "Descargando...")
                        if st.get("cancelar") or st.get("pausado") or _descargas_estado.get(nombre_modelo) is not st:
                            break
                        callback_progreso(nombre_modelo, pct, status, False, False)

            if _descargas_estado.get(nombre_modelo) is not st:
                return
            if st.get("cancelar"):
                _descargas_estado.pop(nombre_modelo, None)
                callback_progreso(nombre_modelo, 0, "Cancelado", False, True)
            elif st.get("pausado"):
                callback_progreso(nombre_modelo, st.get("last_pct", 0), "Pausado", False, False)
            else:
                _descargas_estado.pop(nombre_modelo, None)
                callback_progreso(nombre_modelo, 100, "¡Instalado!", True, False)
        except Exception as e:
            if _descargas_estado.get(nombre_modelo) is not st:
                return
            if st.get("cancelar"):
                _descargas_estado.pop(nombre_modelo, None)
                callback_progreso(nombre_modelo, 0, "Cancelado", False, True)
            elif st.get("pausado"):
                callback_progreso(nombre_modelo, st.get("last_pct", 0), "Pausado", False, False)
            else:
                try:
                    callback_progreso(nombre_modelo, 0, f"Error: {e}", False, True)
                except Exception:
                    pass

    threading.Thread(target=_worker, daemon=True).start()
    return {"iniciado": True}

