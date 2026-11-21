"""Helpers modulares para división de pistas, TOC y empaquetado ZIP en exportación."""

import os
import re
import wave
import shutil
import zipfile
import subprocess
from typing import Any, Dict, List, Optional


def sanitizar_nombre_archivo(texto: str, max_len: int = 36) -> str:
    limpio = re.sub(r"[^\w\s-]", "", (texto or "").strip(), flags=re.UNICODE)
    limpio = re.sub(r"[\s-]+", "_", limpio).strip("_")
    return limpio[:max_len]


def extraer_mapa_capitulos_toc(doc: Any) -> Dict[int, str]:
    """Mapea índice de página (0-based) al título del capítulo desde el TOC del PDF (niveles 1-2)."""
    mapa: Dict[int, str] = {}
    if not doc or not hasattr(doc, "get_toc"):
        return mapa
    try:
        toc = doc.get_toc(simple=True) or []
        for entry in toc:
            if not isinstance(entry, (list, tuple)) or len(entry) < 3:
                continue
            nivel, titulo, pag_1based = entry[0], str(entry[1] or "").strip(), int(entry[2])
            if nivel <= 2 and pag_1based >= 1 and titulo:
                pag_idx = pag_1based - 1
                if pag_idx not in mapa:
                    mapa[pag_idx] = titulo
    except Exception:
        pass
    return mapa


def es_inicio_seccion(texto: str) -> bool:
    t = (texto or "").strip()
    if not t or len(t) > 90:
        return False
    if re.match(r"^(?:cap[ií]tulo|secci[oó]n|parte|chapter|section|part|act|acto|escena)\b", t, re.IGNORECASE):
        return True
    letras = re.sub(r"[^a-zA-ZáéíóúÁÉÍÓÚñÑ]", "", t)
    return len(letras) >= 5 and letras.isupper() and len(t.split()) <= 10


class GestorPistasExportacion:
    """Gestiona la escritura de pistas WAV/MP3 secuenciales y el empaquetado opcional en ZIP."""

    def __init__(self, ruta_salida: str, corte_modo: str, esta_activo_fn):
        self.ruta_salida = ruta_salida
        self.corte_modo = corte_modo
        self.esta_activo_fn = esta_activo_fn
        self.es_mp3 = ruta_salida.lower().endswith(".mp3")
        self.dir_salida = os.path.dirname(os.path.abspath(ruta_salida)) or "."
        self.base_nombre = os.path.splitext(os.path.basename(ruta_salida))[0]
        self.ext_salida = ".mp3" if self.es_mp3 else ".wav"

        self.pistas_generadas: List[str] = []
        self.wav_actual: Optional[wave.Wave_write] = None
        self.ruta_wav_actual = ""
        self.ruta_final_actual = ""
        self.sr_maestro = 22050
        self.header_listo = False
        self.seg_en_pista = 0.0
        self.idx_pista = 0

    def _codificar_pista(self, ruta_wav: str, ruta_destino: str) -> str:
        if self.es_mp3 and shutil.which("ffmpeg"):
            cmd = [
                "ffmpeg", "-y", "-i", ruta_wav,
                "-codec:a", "libmp3lame", "-b:a", "192k",
                ruta_destino,
            ]
            subprocess.run(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=0x08000000 if os.name == "nt" else 0,
            )
            if os.path.exists(ruta_wav):
                try:
                    os.remove(ruta_wav)
                except Exception:
                    pass
            return ruta_destino
        final_wav = ruta_destino.replace(".mp3", ".wav") if self.es_mp3 else ruta_destino
        if ruta_wav != final_wav and os.path.exists(ruta_wav):
            os.replace(ruta_wav, final_wav)
        return final_wav

    def abrir_nueva_pista(self, sufijo_titulo: str = ""):
        self.cerrar_pista_actual()
        self.idx_pista += 1
        if self.corte_modo == "unico":
            self.ruta_final_actual = self.ruta_salida
        else:
            suf = f"_{sanitizar_nombre_archivo(sufijo_titulo)}" if sufijo_titulo else ""
            self.ruta_final_actual = os.path.join(
                self.dir_salida,
                f"{self.idx_pista:02d}_{self.base_nombre}{suf}{self.ext_salida}",
            )
        self.ruta_wav_actual = self.ruta_final_actual + ".temp.wav"
        self.wav_actual = wave.open(self.ruta_wav_actual, "wb")
        self.wav_actual.setparams((1, 2, 22050, 0, "NONE", "not compressed"))
        self.sr_maestro = 22050
        self.header_listo = False
        self.seg_en_pista = 0.0

    def escribir_pcm(self, pcm_bytes: bytes, sr_actual: int):
        if self.wav_actual is None or not pcm_bytes:
            return
        if not self.header_listo:
            self.sr_maestro = sr_actual
            self.wav_actual.setframerate(self.sr_maestro)
            self.header_listo = True
        elif sr_actual != self.sr_maestro and len(pcm_bytes) >= 4:
            import numpy as np
            arr = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
            n_out = max(1, int(round(len(arr) * float(self.sr_maestro) / float(sr_actual))))
            x_old = np.linspace(0.0, 1.0, len(arr))
            x_new = np.linspace(0.0, 1.0, n_out)
            pcm_bytes = np.interp(x_new, x_old, arr).clip(-32768, 32767).astype(np.int16).tobytes()
        self.wav_actual.writeframes(pcm_bytes)
        self.seg_en_pista += len(pcm_bytes) / float(2 * max(1, self.sr_maestro))

    def cerrar_pista_actual(self):
        if self.wav_actual is not None:
            try:
                self.wav_actual.close()
            except Exception:
                pass
            self.wav_actual = None
            if self.esta_activo_fn() and os.path.exists(self.ruta_wav_actual):
                if os.path.getsize(self.ruta_wav_actual) > 44:
                    self.pistas_generadas.append(
                        self._codificar_pista(self.ruta_wav_actual, self.ruta_final_actual)
                    )
                else:
                    try:
                        os.remove(self.ruta_wav_actual)
                    except Exception:
                        pass
            elif os.path.exists(self.ruta_wav_actual):
                try:
                    os.remove(self.ruta_wav_actual)
                except Exception:
                    pass

    def limpiar_pistas(self):
        for p in self.pistas_generadas:
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass

    def empaquetar_zip(self) -> str:
        ruta_zip = os.path.join(self.dir_salida, f"{self.base_nombre}.zip")
        with zipfile.ZipFile(ruta_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for p in self.pistas_generadas:
                if os.path.exists(p):
                    zf.write(p, arcname=os.path.basename(p))
                    try:
                        os.remove(p)
                    except Exception:
                        pass
        return ruta_zip
