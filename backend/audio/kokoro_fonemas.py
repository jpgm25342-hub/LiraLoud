# LiraLoud - Fonemización IPA, alineación de tokens y timestamps para Kokoro-82M
import os
import re
import logging
from typing import Dict, List, Any, Optional, Tuple

import numpy as np

logger = logging.getLogger("LiraKokoroEngine")
KOKORO_SAMPLE_RATE = 24000
KOKORO_HOP_SAMPLES = 600


class KokoroFonemasMixin:
    """Fonemización eSpeak, alineación monótona palabra-token y cálculo de timestamps `pred_dur`."""

    def _init_espeak(self) -> None:
        if self._espeak_initialized:
            return
        with self._espeak_lock:
            if self._espeak_initialized:
                return
            from piper import espeakbridge
            from piper.phonemize_espeak import ESPEAK_DATA_DIR

            data_dir = os.environ.get("ESPEAK_DATA_PATH") or str(ESPEAK_DATA_DIR)
            espeakbridge.initialize(str(data_dir))
            self._espeak_initialized = True

    def _fonemizar_clausula(self, texto: str, espeak_voice: str) -> str:
        """Convierte un texto a cadena IPA usando espeakbridge de forma thread-safe."""
        self._init_espeak()
        from piper import espeakbridge

        with self._espeak_lock:
            espeakbridge.set_voice(espeak_voice)
            clauses = espeakbridge.get_phonemes(texto)

        partes_ipa: List[str] = []
        for phonemes_str, terminator_str, _ in clauses:
            # Limpiar banderas de cambio de idioma de espeak como (en) o (es)
            phonemes_str = re.sub(r"\([^)]+\)", "", phonemes_str).strip()
            term = terminator_str or ""
            if phonemes_str:
                partes_ipa.append(phonemes_str + term)
            elif term:
                partes_ipa.append(term)

        return " ".join(partes_ipa).strip()

    def _calcular_asignacion_grupos_ipa(
        self,
        palabras_visuales: List[str],
        n_grupos: int,
        espeak_voice: str,
    ) -> List[int]:
        """Asigna cada grupo IPA a su índice de palabra visual usando pesos por palabra o interpolación monótona."""
        n_visual = len(palabras_visuales)
        if n_grupos == n_visual:
            return list(range(n_grupos))

        pesos_grupos: List[int] = []
        for w in palabras_visuales:
            ipa_w = self._fonemizar_clausula(w, espeak_voice)
            cnt = len([g for g in ipa_w.split(" ") if g])
            pesos_grupos.append(max(1, cnt))

        total_esperado = sum(pesos_grupos)
        asignacion: List[int] = []
        if total_esperado == n_grupos:
            for w_idx, cnt in enumerate(pesos_grupos):
                asignacion.extend([w_idx] * cnt)
            return asignacion

        # Interpolación monótona proporcional por acumulados
        acum = 0
        limites = []
        for cnt in pesos_grupos:
            acum += cnt
            limites.append(acum / total_esperado)
        for g_idx in range(n_grupos):
            pos_rel = (g_idx + 0.5) / n_grupos
            w_asignada = n_visual - 1
            for w_idx, lim in enumerate(limites):
                if pos_rel <= lim + 1e-6:
                    w_asignada = w_idx
                    break
            asignacion.append(w_asignada)
        return asignacion

    def _alinear_palabras_con_tokens(
        self,
        palabras_visuales: List[str],
        espeak_voice: str,
    ) -> Tuple[List[int], List[int]]:
        """
        Genera la secuencia completa de tokens de la frase preservando la coarticulación
        natural de la oración completa y asignando a cada token el índice de su palabra
        visual (`vIdx` en `0 .. len(palabras_visuales)-1`, o `-1` para espacios/bordes).
        """
        texto_completo = " ".join(palabras_visuales)
        ipa_completo = self._fonemizar_clausula(texto_completo, espeak_voice)

        # Dividimos los grupos fonéticos separados por espacio en la frase completa
        grupos_ipa = [g for g in ipa_completo.split(" ") if g]
        n_grupos = len(grupos_ipa)
        if n_grupos == 0:
            return [], []

        asignacion_grupo_a_palabra = self._calcular_asignacion_grupos_ipa(
            palabras_visuales, n_grupos, espeak_voice
        )

        tokens: List[int] = []
        word_indices: List[int] = []
        space_id = self.vocab.get(" ")

        for g_idx, grupo in enumerate(grupos_ipa):
            w_idx = asignacion_grupo_a_palabra[g_idx]
            if g_idx > 0 and space_id is not None:
                tokens.append(space_id)
                # Si el espacio está dentro de una misma palabra expandida (ej. "dos mil"),
                # mantener el índice de esa palabra para que el resaltado no parpadee
                if asignacion_grupo_a_palabra[g_idx - 1] == w_idx:
                    word_indices.append(w_idx)
                else:
                    word_indices.append(-1)
            for ch in grupo:
                if ch in self.vocab:
                    tokens.append(self.vocab[ch])
                    word_indices.append(w_idx)

        return tokens, word_indices

    def _dividir_en_lotes_seguros(
        self,
        palabras_visuales: List[str],
        espeak_voice: str,
        max_tokens: int = 460,
    ) -> List[Tuple[List[int], List[int], List[Tuple[int, str]]]]:
        """
        Kokoro-82M soporta hasta 510 tokens por inferencia (ventana de contexto de style pack).
        Si una oración es extraordinariamente larga (>460 tokens), la divide limpiamente en sub-lotes
        manteniendo los índices globales de `palabras_visuales`.
        """
        tokens, word_indices = self._alinear_palabras_con_tokens(palabras_visuales, espeak_voice)
        if len(tokens) <= max_tokens:
            pares = [(i, w) for i, w in enumerate(palabras_visuales)]
            return [(tokens, word_indices, pares)]

        # Dividir palabras_visuales en bloques de ~45 palabras
        lotes = []
        paso = 45
        for inicio in range(0, len(palabras_visuales), paso):
            sub_palabras = palabras_visuales[inicio : inicio + paso]
            sub_tokens, sub_w_idx_local = self._alinear_palabras_con_tokens(sub_palabras, espeak_voice)
            sub_w_idx_global = [
                (idx + inicio) if idx >= 0 else -1 for idx in sub_w_idx_local
            ]
            pares = [(inicio + i, w) for i, w in enumerate(sub_palabras)]
            lotes.append((sub_tokens[:max_tokens], sub_w_idx_global[:max_tokens], pares))
        return lotes

    def _acumular_timestamps_lote(
        self,
        pred_dur: Any,
        indices_con_pad: List[int],
        pares_palabras: List[Tuple[int, str]],
        duracion_lote_s: float,
        offset_tiempo_s: float,
        meta_palabras: List[Dict[str, Any]],
    ) -> None:
        """Calcula tiempos absolutos por palabra desde pred_dur y los añade a meta_palabras."""
        if pred_dur is None or pred_dur.size != len(indices_con_pad) or float(pred_dur.sum()) <= 0:
            return

        total_frames = float(pred_dur.sum())
        sec_per_frame = duracion_lote_s / total_frames
        cum_sec = np.cumsum(pred_dur, dtype=np.float64) * sec_per_frame
        starts_sec = np.concatenate([[0.0], cum_sec[:-1]])

        # Agrupar rango [start, end] para cada palabra del lote
        tiempos_por_palabra: Dict[int, Tuple[float, float]] = {}
        for tok_pos, w_idx in enumerate(indices_con_pad):
            if w_idx < 0:
                continue
            t_s = float(starts_sec[tok_pos])
            t_e = float(cum_sec[tok_pos])
            if w_idx not in tiempos_por_palabra:
                tiempos_por_palabra[w_idx] = (t_s, t_e)
            else:
                prev_s, prev_e = tiempos_por_palabra[w_idx]
                tiempos_por_palabra[w_idx] = (min(prev_s, t_s), max(prev_e, t_e))

        # Construir la partitura continua (sin huecos muertos entre palabras consecutivas
        # para que el cursor dinámico de LiraLoud se deslice con suavidad)
        ultimo_fin = offset_tiempo_s
        for w_idx_global, w_str in pares_palabras:
            if w_idx_global in tiempos_por_palabra:
                raw_s, raw_e = tiempos_por_palabra[w_idx_global]
                abs_s = offset_tiempo_s + raw_s
                abs_e = offset_tiempo_s + raw_e
            else:
                # Fallback para tokens puramente simbólicos sin fonema
                abs_s = ultimo_fin
                abs_e = min(offset_tiempo_s + duracion_lote_s, ultimo_fin + 0.04)

            # Extender suavemente el fin de la palabra anterior hasta el inicio de la actual
            # si el silencio inter-palabra es menor a 120ms (mantiene el cursor vivo)
            if meta_palabras and 0 < (abs_s - meta_palabras[-1]["e"]) < 0.12:
                meta_palabras[-1]["e"] = round(abs_s, 4)

            if abs_e <= abs_s:
                abs_e = abs_s + 0.02

            meta_palabras.append({
                "w": w_str.strip(".,!?¿¡;:()[]{}\"'"),
                "s": round(abs_s, 4),
                "e": round(abs_e, 4),
                "vIdx": w_idx_global,
                "sub_i": 0,
                "sub_t": 1,
            })
            ultimo_fin = abs_e
