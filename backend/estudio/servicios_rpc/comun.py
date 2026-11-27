import sys
import threading

# --- Loaders diferidos (thread-safe) para no bloquear el arranque ---
_media_control_lock = threading.Lock()
_media_control_mod = None


def _get_media_control():
    global _media_control_mod
    if _media_control_mod is not None:
        return _media_control_mod
    with _media_control_lock:
        if _media_control_mod is None:
            import backend.audio.media_control as _mc
            _media_control_mod = _mc
    return _media_control_mod


_rag_lock = threading.Lock()
_rag_cache_local = None


def _get_rag():
    """Devuelve la instancia RAG respetando parches en servicios_rpc.rag_global (thread-safe)."""
    global _rag_cache_local
    pkg = sys.modules.get("backend.estudio.servicios_rpc")
    if pkg is not None:
        patched = getattr(pkg, "rag_global", None)
        if patched is not None:
            return patched
    if _rag_cache_local is not None:
        return _rag_cache_local
    with _rag_lock:
        if pkg is not None:
            patched = getattr(pkg, "rag_global", None)
            if patched is not None:
                return patched
        if _rag_cache_local is None:
            from backend.ia.rag_module import rag_global as _rg
            _rag_cache_local = _rg
            if pkg is not None and getattr(pkg, "rag_global", None) is None:
                pkg.rag_global = _rg
    return _rag_cache_local
