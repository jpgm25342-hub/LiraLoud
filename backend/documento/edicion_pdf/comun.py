import os
import stat
import shutil
import fitz

from backend.core.estado_global import estado_app

def asegurar_permiso_escritura(ruta_archivo):
    """Garantiza que el archivo PDF no tenga el flag de solo lectura en el sistema de archivos."""
    if ruta_archivo and os.path.exists(ruta_archivo):
        try:
            modo_actual = os.stat(ruta_archivo).st_mode
            if not (modo_actual & stat.S_IWRITE):
                os.chmod(ruta_archivo, modo_actual | stat.S_IWRITE | stat.S_IWUSR)
        except Exception as e:
            print(f"⚠️ No se pudo cambiar permisos de archivo {ruta_archivo}: {e}")

def hex_to_rgb(hex_color):
    """Convierte un color '#RRGGBB' a una tupla de floats (R, G, B) en rango 0.0 - 1.0"""
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 3:
        hex_color = ''.join(c * 2 for c in hex_color)
    return tuple(int(hex_color[i:i+2], 16) / 255.0 for i in (0, 2, 4))

def _normalizar_color_secuencia(color):
    """Normaliza una lista/tupla de 1 (gris) o >=3 canales RGB a tupla (r, g, b) en [0.0, 1.0]."""
    if len(color) == 1:
        v = float(color[0])
        if v > 1.0:
            v /= 255.0
        v = max(0.0, min(1.0, v))
        return (v, v, v)
    if len(color) >= 3:
        vals = [float(color[i]) for i in range(3)]
        if any(v > 1.0 for v in vals):
            vals = [v / 255.0 for v in vals]
        return tuple(max(0.0, min(1.0, v)) for v in vals)
    return (0.0, 0.0, 0.0)


def normalizar_color(color):
    """Normaliza cualquier representación de color (int 0xRRGGBB, hex str, lista/tupla RGB) a tupla (r, g, b) en [0.0, 1.0]."""
    if color is None:
        return (0.0, 0.0, 0.0)
    if isinstance(color, int):
        return tuple(max(0.0, min(1.0, float(c))) for c in fitz.sRGB_to_pdf(color))
    if isinstance(color, str):
        try:
            return hex_to_rgb(color)
        except Exception:
            return (0.0, 0.0, 0.0)
    if isinstance(color, (list, tuple)):
        return _normalizar_color_secuencia(color)
    return (0.0, 0.0, 0.0)


FUENTES_ESTANDAR = {
    ("serif", False, False): "tiro",
    ("serif", True,  False): "tibo",
    ("serif", False, True):  "tiit",
    ("serif", True,  True):  "tibi",
    ("mono",  False, False): "cour",
    ("mono",  True,  False): "cobo",
    ("mono",  False, True):  "coit",
    ("mono",  True,  True):  "cobi",
    ("sans",  False, False): "helv",
    ("sans",  True,  False): "hebo",
    ("sans",  False, True):  "heit",
    ("sans",  True,  True):  "hebi",
}

_MAPA_BASE14_FAMILIA = {
    "helv": ("Helvetica", False, False, "sans"),
    "hebo": ("Helvetica", True,  False, "sans"),
    "heit": ("Helvetica", False, True,  "sans"),
    "hebi": ("Helvetica", True,  True,  "sans"),
    "tiro": ("Times",     False, False, "serif"),
    "tibo": ("Times",     True,  False, "serif"),
    "tiit": ("Times",     False, True,  "serif"),
    "tibi": ("Times",     True,  True,  "serif"),
    "cour": ("Courier",   False, False, "mono"),
    "cobo": ("Courier",   True,  False, "mono"),
    "coit": ("Courier",   False, True,  "mono"),
    "cobi": ("Courier",   True,  True,  "mono"),
    "symb": ("Symbol",    False, False, "sans"),
    "zadb": ("ZapfDingbats", False, False, "sans"),
}

# Equivalencias métricas exactas (prioridad 2 cuando la familia exacta no está instalada)
EQUIVALENCIAS_METRICAS = {
    "arial": ["liberationsans", "arimo"],
    "helvetica": ["liberationsans", "arimo"],
    "helv": ["liberationsans", "arimo"],
    "timesnewroman": ["liberationserif", "tinos"],
    "times": ["liberationserif", "tinos"],
    "tiro": ["liberationserif", "tinos"],
    "calibri": ["carlito"],
    "cambria": ["caladea"],
    "couriernew": ["liberationmono", "cousine"],
    "courier": ["liberationmono", "cousine"],
    "cour": ["liberationmono", "cousine"],
}

FLAG_ITALICO = 1 << 1
FLAG_SERIF   = 1 << 2
FLAG_MONO    = 1 << 3
FLAG_NEGRITA = 1 << 4


def _guardar_documento_seguro(doc, pdf_path, doc_obj):
    """Guarda incrementalmente o ejecuta guardado completo seguro según propiedad de doc_obj."""
    def _hacer_full_save_propio():
        temp_path = pdf_path + ".tmp"
        try:
            doc.save(temp_path, garbage=1, deflate=True)
            doc.close()
            asegurar_permiso_escritura(pdf_path)
            shutil.move(temp_path, pdf_path)
        finally:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

    if not getattr(doc, "can_save_incrementally", lambda: True)():
        if doc_obj is not None:
            return {"success": False, "error": "NEEDS_FULL_SAVE"}
        _hacer_full_save_propio()
        return {"success": True}

    try:
        doc.saveIncr()
        return {"success": True}
    except Exception as err:
        msg = str(err).lower()
        if "incremental writes" in msg or "repaired" in msg or "incremental" in msg:
            if doc_obj is not None:
                return {"success": False, "error": "NEEDS_FULL_SAVE"}
            _hacer_full_save_propio()
            return {"success": True}
        raise err
