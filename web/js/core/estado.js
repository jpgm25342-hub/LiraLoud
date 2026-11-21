// LiraLoud
// Copyright 2026 José Pablo González Macías
// Licensed under the Apache License, Version 2.0

// ==========================================
// 1. VARIABLES GLOBALES
// ==========================================
let paginaActual = 0;
let totalPaginas = 0;
let datosPagina = null;
let canvas = document.getElementById('lienzo-pdf');
window.panel = canvas;
let ctx = canvas.getContext('2d');
let piperQueueTimer = null;
let isPlayingPiper = false;
let audioCtx = null;
let resaltadoBusqueda = null;
window.resaltadoBusqueda = null;
window.resaltadoBBox = null;
let readingSessionID = 0; 
window.palabraKaraoke = null;
let palabraHover = null;  
let oracionActiva = null; 
let indiceOracion = -1;
let leyendo = false;
let nextScheduleTime = 0;
let synth = window.speechSynthesis;
let currentReadingSession = 0;
window.currentReadingSession = 0
window.contadorPalabrasOracion = 0;
window.piperSetupTimeout = null;
let velocidadLectura = 1.0;
let pitchLectura = 1.0;
let pausaPunto = 300;
let tamanoLetraActual = 14; // Tamaño inicial en pixeles
let nivelZoomPDF = 1.0;
window.activeAudioSources = [];
// Datos del Sistema
let ajustesInicialesCargados = false;
let vocesPython = [];
let vocesSistema = [];
let vocesFavoritas = []; 
let vozPredeterminada = ""; 
let volumenPorcentaje = 100; 
let gainNode = null;
// Configuración de Lectura
let cortesV = []; 
let limitesH = {}; 
let zonasExcluidas = []; // Cajas negras de censura / omisión de lectura [x0, y0, x1, y1]
let arrastre = { tipo: null, index: -1, colKey: null, cual: null }; 


// MEMORIA DEL LIBRO
let memoriaLayout = {}; 
let rutaPDFActual = ""; 

let dbDiccionario = {}; 
let seccionActual = null; 
let misAtajos = {}; 

// --- VARIABLES DE OPTIMIZACIÓN ---
let timeoutGuardadoOrden = null;
let bloqueoCambioPagina = false; // "Semáforo" de seguridad

// TEATRO
window.obraActualTeatro = null;
let dbTeatro = {};

// --- VARIABLES PARA BARRA DE PROGRESO FLUIDA ---
let progresoVisualActual = 0;
let intervaloMicroAvance = null;

// KARAOKE
window.duracionAudioAcumulada = 0;
window.tiempoInicioRealAudio = 0;
window.latenciaGlobalMs = 0;       // Desplazamiento manual (+ atrás, - adelante)
window.umbralVelBaja = 1.5;        // Cuándo empieza a considerarse "lento"
window.umbralVelAlta = 5.5;        // Cuándo empieza a considerarse "ultra rápido"
window.factorCompensacionBaja = 1.10; // Multiplicador para zona lenta
window.factorCompensacionAlta = 0.85; // Multiplicador para zona rápida
window.multiplicadorKaraoke = 1.0;
window.partituraActual = [];        // Aquí guardaremos los tiempos exactos de Python ({w, s, e})
window.requestID_Karaoke = null;    // El ID del proceso de renderizado (Game Loop)
window.ultimoMomentoInicioPiper = 0;
const nombresAcciones = {
    "play_pause": "Reproducir / Pausar", "add_limit": " Añadir Límite", "add_abbr": " Crear Abreviatura",
    "speed_up": " Subir Velocidad", "speed_down": " Bajar Velocidad", "prev_page": "Página Anterior",
    "next_page": "Página Siguiente", "open_pdf": " Abrir PDF", "prev_sentence": "Oración Anterior",
    "next_sentence": "Oración Siguiente", "cycle_voice": "Cambiar Voz (Ciclo)", "toggle_dicc": " Mostrar/Ocultar Dicc.",
    "toggle_highlighter": "Marcatextos", "toggle_eraser": "Borrador", "crear_nota": "Crear Nota Rápida", "toggle_notas": "Cuaderno de Notas",
    "capturar_recorte": "Capturar Recorte (Gestor Extracción)"
};


const MAPA_IDIOMAS = {
    'es': 'Español',
    'en': 'English',
    'fr': 'Français',
    'de': 'Deutsch',
    'it': 'Italiano',
    'pt': 'Português',
    'zh': '中文',
    'ja': '日本語',
    'ko': '한국어',
    'ru': 'Русский',
    'ar': 'العربية',
    'hi': 'हिन्दी',
    'bn': 'বাংলা'
};

// Función para obtener el nombre legible o devolver el código si no existe
function obtenerNombreIdioma(codigoIso) {
    const prefijo = codigoIso.split('-')[0].toLowerCase();
    return MAPA_IDIOMAS[prefijo] || codigoIso.toUpperCase();
}

// ==========================================

window.IDIOMAS_VOCES = [
    ['af', 'Afrikaans'], ['sq', 'Shqip'], ['de', 'Deutsch'], ['am', 'አማርኛ'],
    ['ar', 'العربية'], ['az', 'Azərbaycan'], ['bn', 'বাংলা'], ['my', 'မြန်မာ'],
    ['bs', 'Bosanski'], ['bg', 'Български'], ['kn', 'ಕನ್ನಡ'], ['ca', 'Català'],
    ['cs', 'Čeština'], ['zh', '中文'], ['si', 'සිංහල'], ['ko', '한국어'],
    ['hr', 'Hrvatski'], ['da', 'Dansk'], ['sk', 'Slovenčina'], ['sl', 'Slovenščina'],
    ['es', 'Español'], ['et', 'Eesti'], ['fi', 'Suomi'], ['fr', 'Français'],
    ['cy', 'Cymraeg'], ['gl', 'Galego'], ['ka', 'ქართული'], ['el', 'Ελληνικά'],
    ['gu', 'ગુજરાતી'], ['he', 'עברית'], ['hi', 'हिन्दी'], ['nl', 'Nederlands'],
    ['hu', 'Magyar'], ['id', 'Bahasa Indonesia'], ['en', 'English'], ['iu', 'ᐃᓄᒃᑎᑐᑦ'],
    ['ga', 'Gaeilge'], ['is', 'Íslenska'], ['it', 'Italiano'], ['ja', '日本語'],
    ['jv', 'Basa Jawa'], ['km', 'ភាសាខ្មែរ'], ['kk', 'Қазақша'], ['lo', 'ລາວ'],
    ['lv', 'Latviešu'], ['lt', 'Lietuvių'], ['mk', 'Македонски'], ['ml', 'മലയാളം'],
    ['ms', 'Bahasa Melayu'], ['mt', 'Malti'], ['mr', 'मराठी'], ['mn', 'Монгол'],
    ['ne', 'नेपाली'], ['nb', 'Norsk'], ['ps', 'پښتو'], ['fa', 'فارسی'],
    ['pl', 'Polski'], ['pt', 'Português'], ['ro', 'Română'], ['ru', 'Русский'],
    ['sr', 'Српски'], ['so', 'Soomaali'], ['sw', 'Kiswahili'], ['sv', 'Svenska'],
    ['th', 'ไทย'], ['ta', 'தமிழ்'], ['te', 'తెలుగు'], ['tr', 'Türkçe'],
    ['uk', 'Українська'], ['ur', 'اردو'], ['uz', 'Oʻzbekcha'], ['vi', 'Tiếng Việt'],
    ['zu', 'isiZulu']
];

window.ALIASES_IDIOMAS = {
    af: 'afrikaans afrikáans', sq: 'albanian albanés shqip', de: 'german alemán aleman deutsch',
    am: 'amharic amhárico', ar: 'arabic árabe arabe', az: 'azerbaijani azerbaiyano',
    bn: 'bengali bengalí bangla', my: 'burmese birmano', bs: 'bosnian bosnio',
    bg: 'bulgarian búlgaro', kn: 'kannada canarés', ca: 'catalan catalán',
    cs: 'czech checo', zh: 'chinese chino mandarin', si: 'sinhala cingalés',
    ko: 'korean coreano', hr: 'croatian croata', da: 'danish danés',
    sk: 'slovak eslovaco', sl: 'slovenian esloveno', es: 'spanish español espanol',
    et: 'estonian estonio', fi: 'finnish finlandés', fr: 'french francés frances',
    cy: 'welsh galés', gl: 'galician gallego', ka: 'georgian georgiano',
    el: 'greek griego', gu: 'gujarati guyaratí', he: 'hebrew hebreo',
    hi: 'hindi हिन्दी', nl: 'dutch holandés neerlandés', hu: 'hungarian húngaro',
    id: 'indonesian indonesio', en: 'english inglés ingles', iu: 'inuktitut',
    ga: 'irish irlandés', is: 'icelandic islandés', it: 'italian italiano',
    ja: 'japanese japonés japones', jv: 'javanese javanés', km: 'khmer jemer',
    kk: 'kazakh kazajo', lo: 'lao', lv: 'latvian letón', lt: 'lithuanian lituano',
    mk: 'macedonian macedonio', ml: 'malayalam', ms: 'malay malayo',
    mt: 'maltese maltés', mr: 'marathi maratí', mn: 'mongolian mongol',
    ne: 'nepali nepalí', nb: 'norwegian noruego', ps: 'pashto pastún',
    fa: 'persian persa farsi', pl: 'polish polaco', pt: 'portuguese portugués portugues',
    ro: 'romanian rumano', ru: 'russian ruso', sr: 'serbian serbio',
    so: 'somali somalí', sw: 'swahili suajili', sv: 'swedish sueco',
    th: 'thai tailandés', ta: 'tamil', te: 'telugu', tr: 'turkish turco',
    uk: 'ukrainian ucraniano', ur: 'urdu', uz: 'uzbek uzbeko',
    vi: 'vietnamese vietnamita', zu: 'zulu zulú'
};

window.poblarSelectIdiomas = function (sel) {
    if (!sel) return;
    window.IDIOMAS_VOCES.forEach(([codigo, nombre]) => {
        const opt = document.createElement('option');
        opt.value = codigo;
        opt.textContent = nombre;
        if (window.ALIASES_IDIOMAS[codigo]) {
            opt.dataset.aliases = window.ALIASES_IDIOMAS[codigo];
        }
        sel.appendChild(opt);
    });
};
