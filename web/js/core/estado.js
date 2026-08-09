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
let vocesPython = [];
let vocesSistema = [];
let vocesFavoritas = []; 
let vozPredeterminada = ""; 
let volumenPorcentaje = 100; 
let gainNode = null;
// Configuración de Lectura
let cortesV = []; 
let limitesH = {}; 
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
    "next_sentence": "Oración Siguiente", "cycle_voice": "Cambiar Voz (Ciclo)", "toggle_dicc": " Mostrar/Ocultar Dicc."
};


const MAPA_IDIOMAS = {
    'es': 'Español',
    'en': 'Inglés',
    'fr': 'Francés',
    'de': 'Alemán',
    'it': 'Italiano',
    'pt': 'Portugués',
    'zh': 'Chino',
    'ja': 'Japonés',
    'ko': 'Coreano',
    // Puedes seguir agregando más para tu expansión futura
};

// Función para obtener el nombre legible o devolver el código si no existe
function obtenerNombreIdioma(codigoIso) {
    const prefijo = codigoIso.split('-')[0].toLowerCase();
    return MAPA_IDIOMAS[prefijo] || codigoIso.toUpperCase();
}

// ==========================================
