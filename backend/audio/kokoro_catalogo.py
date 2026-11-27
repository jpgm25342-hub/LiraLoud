# LiraLoud - Catálogo de voces oficiales Kokoro-82M v1.0 y utilidades de identificación
from typing import Dict, List

# Voces individuales base disponibles para mezclar en el Voice Lab (55 voces oficiales)
VOCES_KOKORO_DISPONIBLES_PARA_BLEND = [
    # --- ESPAÑOL (es) ---
    {"key": "ef_dora", "nombre": "Dora (Español · Femenina Clara)", "lang": "es", "categoria": "Español"},
    {"key": "em_alex", "nombre": "Alex (Español · Masculina Estándar)", "lang": "es", "categoria": "Español"},
    {"key": "em_santa", "nombre": "Santa (Español · Masculina Profunda)", "lang": "es", "categoria": "Español"},

    # --- INGLÉS AMERICANO · FEMENINAS (af_) ---
    {"key": "af_heart", "nombre": "Heart (⭐ Insignia · Ultra Natural)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_bella", "nombre": "Bella (Cálida · Audiolibros)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_nicole", "nombre": "Nicole (Suave / ASMR · Relajante)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_sarah", "nombre": "Sarah (Formal · Articulada)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_nova", "nombre": "Nova (Dinámica · Juvenil)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_sky", "nombre": "Sky (Fresca · Enérgica)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_alloy", "nombre": "Alloy (Neutra · Asistente)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_jessica", "nombre": "Jessica (Madura · Expresiva)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_river", "nombre": "River (Pausada · Profunda)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_aoede", "nombre": "Aoede (Melódica · Teatral)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af_kore", "nombre": "Kore (Serena · Equilibrada)", "lang": "en", "categoria": "Inglés US · Femeninas"},
    {"key": "af", "nombre": "Default Female (Original)", "lang": "en", "categoria": "Inglés US · Femeninas"},

    # --- INGLÉS AMERICANO · MASCULINAS (am_) ---
    {"key": "am_adam", "nombre": "Adam (Locutor de Noticias · Firme)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_michael", "nombre": "Michael (Corporativo · Serio)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_fenrir", "nombre": "Fenrir (Grave · Épico / Tráiler)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_echo", "nombre": "Echo (Resonante · Teatral)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_eric", "nombre": "Eric (Conversacional · Cercano)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_liam", "nombre": "Liam (Joven · Dinámico)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_onyx", "nombre": "Onyx (Muy Grave · Cinematográfico)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_puck", "nombre": "Puck (Enérgico · Jovial)", "lang": "en", "categoria": "Inglés US · Masculinas"},
    {"key": "am_santa", "nombre": "Santa (Maduro · Profundo)", "lang": "en", "categoria": "Inglés US · Masculinas"},

    # --- INGLÉS BRITÁNICO · FEMENINAS (bf_) ---
    {"key": "bf_emma", "nombre": "Emma (Británica · Refinada / Audiolibros)", "lang": "en", "categoria": "Inglés Británico · Femeninas"},
    {"key": "bf_isabella", "nombre": "Isabella (Británica · Poética)", "lang": "en", "categoria": "Inglés Británico · Femeninas"},
    {"key": "bf_alice", "nombre": "Alice (Británica · Estilo BBC)", "lang": "en", "categoria": "Inglés Británico · Femeninas"},
    {"key": "bf_lily", "nombre": "Lily (Británica · Pedagógica)", "lang": "en", "categoria": "Inglés Británico · Femeninas"},

    # --- INGLÉS BRITÁNICO · MASCULINAS (bm_) ---
    {"key": "bm_george", "nombre": "George (Británico · Documental Clásico)", "lang": "en", "categoria": "Inglés Británico · Masculinas"},
    {"key": "bm_fable", "nombre": "Fable (Británico · Cuentos / Narrativa)", "lang": "en", "categoria": "Inglés Británico · Masculinas"},
    {"key": "bm_lewis", "nombre": "Lewis (Británico · Sobrio / Académico)", "lang": "en", "categoria": "Inglés Británico · Masculinas"},
    {"key": "bm_daniel", "nombre": "Daniel (Británico · Conversacional)", "lang": "en", "categoria": "Inglés Británico · Masculinas"},

    # --- PORTUGUÉS (pf_ / pm_) ---
    {"key": "pf_dora", "nombre": "Dora (Portugués · Femenina)", "lang": "pt", "categoria": "Portugués"},
    {"key": "pm_alex", "nombre": "Alex (Portugués · Masculina)", "lang": "pt", "categoria": "Portugués"},
    {"key": "pm_santa", "nombre": "Santa (Portugués · Profunda)", "lang": "pt", "categoria": "Portugués"},

    # --- ITALIANO (if_ / im_) ---
    {"key": "if_sara", "nombre": "Sara (Italiano · Femenina)", "lang": "it", "categoria": "Italiano"},
    {"key": "im_nicola", "nombre": "Nicola (Italiano · Masculina)", "lang": "it", "categoria": "Italiano"},

    # --- FRANCÉS (ff_) ---
    {"key": "ff_siwis", "nombre": "Siwis (Francés · Femenina)", "lang": "fr", "categoria": "Francés"},

    # --- JAPONÉS (jf_ / jm_) ---
    {"key": "jf_alpha", "nombre": "Alpha (Japonés · Femenina)", "lang": "ja", "categoria": "Japonés"},
    {"key": "jf_gongitsune", "nombre": "Gongitsune (Japonés · Cuentos)", "lang": "ja", "categoria": "Japonés"},
    {"key": "jf_nezumi", "nombre": "Nezumi (Japonés · Caracterizada)", "lang": "ja", "categoria": "Japonés"},
    {"key": "jf_tebukuro", "nombre": "Tebukuro (Japonés · Suave)", "lang": "ja", "categoria": "Japonés"},
    {"key": "jm_kumo", "nombre": "Kumo (Japonés · Masculina)", "lang": "ja", "categoria": "Japonés"},

    # --- CHINO MANDARÍN (zf_ / zm_) ---
    {"key": "zf_xiaoxiao", "nombre": "Xiaoxiao (Chino Mandarín · Femenina)", "lang": "zh", "categoria": "Chino Mandarín"},
    {"key": "zf_xiaobei", "nombre": "Xiaobei (Chino Mandarín · Femenina Cálida)", "lang": "zh", "categoria": "Chino Mandarín"},
    {"key": "zf_xiaoni", "nombre": "Xiaoni (Chino Mandarín · Femenina Suave)", "lang": "zh", "categoria": "Chino Mandarín"},
    {"key": "zf_xiaoyi", "nombre": "Xiaoyi (Chino Mandarín · Femenina Expresiva)", "lang": "zh", "categoria": "Chino Mandarín"},
    {"key": "zm_yunxi", "nombre": "Yunxi (Chino Mandarín · Masculina Natural)", "lang": "zh", "categoria": "Chino Mandarín"},
    {"key": "zm_yunjian", "nombre": "Yunjian (Chino Mandarín · Masculina Narrativa)", "lang": "zh", "categoria": "Chino Mandarín"},
    {"key": "zm_yunxia", "nombre": "Yunxia (Chino Mandarín · Masculina Dinámica)", "lang": "zh", "categoria": "Chino Mandarín"},
    {"key": "zm_yunyang", "nombre": "Yunyang (Chino Mandarín · Masculina Formal)", "lang": "zh", "categoria": "Chino Mandarín"},

    # --- HINDI (hf_ / hm_) ---
    {"key": "hf_alpha", "nombre": "Alpha (Hindi · Femenina)", "lang": "hi", "categoria": "Hindi"},
    {"key": "hf_beta", "nombre": "Beta (Hindi · Femenina)", "lang": "hi", "categoria": "Hindi"},
    {"key": "hm_omega", "nombre": "Omega (Hindi · Masculina)", "lang": "hi", "categoria": "Hindi"},
    {"key": "hm_psi", "nombre": "Psi (Hindi · Masculina)", "lang": "hi", "categoria": "Hindi"},
]

def obtener_catalogo_base_kokoro() -> List[Dict[str, str]]:
    """Devuelve las voces individuales disponibles para mezclar en la interfaz."""
    return VOCES_KOKORO_DISPONIBLES_PARA_BLEND
# El ID comienza con "Local- {lang}-kokoro-{voice_key}" (sin espacio) -> "Local-{lang}-kokoro-{voice_key}"
# para integrarse de forma transparente con todos los filtros de idioma y motores locales de LiraLoud.
VOCES_KOKORO_CATALOGO: List[Dict[str, str]] = [
    # --- ESPAÑOL (es) ---
    {
        "id": "Local-es-kokoro-ef_dora",
        "voice_key": "ef_dora",
        "lang": "es",
        "espeak_voice": "es",
        "nombre": "⚡ 🧠 Kokoro: Dora (Español · Femenina)",
    },
    {
        "id": "Local-es-kokoro-em_alex",
        "voice_key": "em_alex",
        "lang": "es",
        "espeak_voice": "es",
        "nombre": "⚡ 🧠 Kokoro: Alex (Español · Masculina)",
    },
    {
        "id": "Local-es-kokoro-em_santa",
        "voice_key": "em_santa",
        "lang": "es",
        "espeak_voice": "es",
        "nombre": "⚡ 🧠 Kokoro: Santa (Español · Profunda)",
    },
    {
        "id": "Local-es-kokoro-ef_dora_latam",
        "voice_key": "ef_dora",
        "lang": "es",
        "espeak_voice": "es-419",
        "nombre": "⚡ 🧠 Kokoro: Dora LatAm (Español Neutro · Femenina)",
    },
    {
        "id": "Local-es-kokoro-em_alex_latam",
        "voice_key": "em_alex",
        "lang": "es",
        "espeak_voice": "es-419",
        "nombre": "⚡ 🧠 Kokoro: Alex LatAm (Español Neutro · Masculina)",
    },
    {
        "id": "Local-es-kokoro-blend_dora_bella",
        "voice_key": "ef_dora:0.7+af_bella:0.3",
        "lang": "es",
        "espeak_voice": "es-419",
        "nombre": "⚡ 🧠 Kokoro: Lira Studio (Español Cálida · Blend)",
    },

    # --- INGLÉS (en) ---
    {
        "id": "Local-en-kokoro-af_heart",
        "voice_key": "af_heart",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Heart ⭐ (English US · Female)",
    },
    {
        "id": "Local-en-kokoro-af_bella",
        "voice_key": "af_bella",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Bella (English US · Female)",
    },
    {
        "id": "Local-en-kokoro-af_nicole",
        "voice_key": "af_nicole",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Nicole (English US · Whisper/ASMR)",
    },
    {
        "id": "Local-en-kokoro-af_sarah",
        "voice_key": "af_sarah",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Sarah (English US · Female)",
    },
    {
        "id": "Local-en-kokoro-af_nova",
        "voice_key": "af_nova",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Nova (English US · Female)",
    },
    {
        "id": "Local-en-kokoro-am_michael",
        "voice_key": "am_michael",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Michael (English US · Male)",
    },
    {
        "id": "Local-en-kokoro-am_adam",
        "voice_key": "am_adam",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Adam (English US · Male)",
    },
    {
        "id": "Local-en-kokoro-am_fenrir",
        "voice_key": "am_fenrir",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Fenrir (English US · Male)",
    },
    {
        "id": "Local-en-kokoro-am_puck",
        "voice_key": "am_puck",
        "lang": "en",
        "espeak_voice": "en-us",
        "nombre": "⚡ 🧠 Kokoro: Puck (English US · Male)",
    },
    {
        "id": "Local-en-kokoro-bf_emma",
        "voice_key": "bf_emma",
        "lang": "en",
        "espeak_voice": "en-gb",
        "nombre": "⚡ 🧠 Kokoro: Emma (English UK · Female)",
    },
    {
        "id": "Local-en-kokoro-bf_isabella",
        "voice_key": "bf_isabella",
        "lang": "en",
        "espeak_voice": "en-gb",
        "nombre": "⚡ 🧠 Kokoro: Isabella (English UK · Female)",
    },
    {
        "id": "Local-en-kokoro-bm_george",
        "voice_key": "bm_george",
        "lang": "en",
        "espeak_voice": "en-gb",
        "nombre": "⚡ 🧠 Kokoro: George (English UK · Male)",
    },
    {
        "id": "Local-en-kokoro-bm_lewis",
        "voice_key": "bm_lewis",
        "lang": "en",
        "espeak_voice": "en-gb",
        "nombre": "⚡ 🧠 Kokoro: Lewis (English UK · Male)",
    },

    # --- FRANCÉS (fr) ---
    {
        "id": "Local-fr-kokoro-ff_siwis",
        "voice_key": "ff_siwis",
        "lang": "fr",
        "espeak_voice": "fr-fr",
        "nombre": "⚡ 🧠 Kokoro: Siwis (Français · Féminin)",
    },

    # --- ITALIANO (it) ---
    {
        "id": "Local-it-kokoro-if_sara",
        "voice_key": "if_sara",
        "lang": "it",
        "espeak_voice": "it",
        "nombre": "⚡ 🧠 Kokoro: Sara (Italiano · Femminile)",
    },
    {
        "id": "Local-it-kokoro-im_nicola",
        "voice_key": "im_nicola",
        "lang": "it",
        "espeak_voice": "it",
        "nombre": "⚡ 🧠 Kokoro: Nicola (Italiano · Maschile)",
    },

    # --- PORTUGUÉS (pt) ---
    {
        "id": "Local-pt-kokoro-pf_dora",
        "voice_key": "pf_dora",
        "lang": "pt",
        "espeak_voice": "pt-br",
        "nombre": "⚡ 🧠 Kokoro: Dora (Português BR · Feminina)",
    },
    {
        "id": "Local-pt-kokoro-pm_alex",
        "voice_key": "pm_alex",
        "lang": "pt",
        "espeak_voice": "pt-br",
        "nombre": "⚡ 🧠 Kokoro: Alex (Português BR · Masculina)",
    },
    {
        "id": "Local-pt-kokoro-pm_santa",
        "voice_key": "pm_santa",
        "lang": "pt",
        "espeak_voice": "pt-br",
        "nombre": "⚡ 🧠 Kokoro: Santa (Português BR · Profunda)",
    },

    # --- JAPONÉS (ja) ---
    {
        "id": "Local-ja-kokoro-jf_alpha",
        "voice_key": "jf_alpha",
        "lang": "ja",
        "espeak_voice": "ja",
        "nombre": "⚡ 🧠 Kokoro: Alpha (日本語 · 女性)",
    },
    {
        "id": "Local-ja-kokoro-jm_kumo",
        "voice_key": "jm_kumo",
        "lang": "ja",
        "espeak_voice": "ja",
        "nombre": "⚡ 🧠 Kokoro: Kumo (日本語 · 男性)",
    },

    # --- CHINO MANDARÍN (zh) ---
    {
        "id": "Local-zh-kokoro-zf_xiaoxiao",
        "voice_key": "zf_xiaoxiao",
        "lang": "zh",
        "espeak_voice": "cmn",
        "nombre": "⚡ 🧠 Kokoro: Xiaoxiao (中文 · 女声)",
    },
    {
        "id": "Local-zh-kokoro-zm_yunxi",
        "voice_key": "zm_yunxi",
        "lang": "zh",
        "espeak_voice": "cmn",
        "nombre": "⚡ 🧠 Kokoro: Yunxi (中文 · 男声)",
    },

    # --- HINDI (hi) ---
    {
        "id": "Local-hi-kokoro-hf_alpha",
        "voice_key": "hf_alpha",
        "lang": "hi",
        "espeak_voice": "hi",
        "nombre": "⚡ 🧠 Kokoro: Alpha (हिन्दी · Female)",
    },
    {
        "id": "Local-hi-kokoro-hm_omega",
        "voice_key": "hm_omega",
        "lang": "hi",
        "espeak_voice": "hi",
        "nombre": "⚡ 🧠 Kokoro: Omega (हिन्दी · Male)",
    },
]

MAPA_VOCES_KOKORO: Dict[str, Dict[str, str]] = {
    v["id"]: v for v in VOCES_KOKORO_CATALOGO
}


def es_voz_kokoro(voz_id: str) -> bool:
    """Determina si un identificador de voz pertenece al motor Kokoro-82M."""
    if not voz_id or not isinstance(voz_id, str):
        return False
    return "-kokoro-" in voz_id or voz_id.startswith("Kokoro-")
