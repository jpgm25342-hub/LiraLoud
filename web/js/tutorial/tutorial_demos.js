/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// ============================================================================
// TUTORIAL — GENERADORES DE DEMO Y MOCKS DE EEL
// ============================================================================

let demoSubrayadoAzulHecho = false;
let demoSubrayadoRosaHecho = false;
let demoCapturaHecha = false;
let origObtenerSubrayados = null;
let origObtenerCapturas = null;
let origNotasListar = null;

function activarMocksTutorialExtraccion() {
    if (typeof eel === 'undefined') window.eel = {};
    if (!origObtenerSubrayados && window.eel.obtener_todos_subrayados) {
        origObtenerSubrayados = window.eel.obtener_todos_subrayados;
    }
    if (!origObtenerCapturas && window.eel.obtener_capturas_libro) {
        origObtenerCapturas = window.eel.obtener_capturas_libro;
    }
    if (!origNotasListar && window.eel.notas_listar) {
        origNotasListar = window.eel.notas_listar;
    }

    window.eel.obtener_todos_subrayados = (ruta) => () => Promise.resolve({
        success: true,
        subrayados: window.demoSubrayadosTutorial || []
    });

    window.eel.obtener_capturas_libro = (ruta) => () => Promise.resolve({
        success: true,
        capturas: window.demoCapturasTutorial || []
    });

    window.eel.notas_listar = (libro, pag, clasif, q) => () => Promise.resolve({
        success: true,
        notas: window.notasLista || []
    });
}

function desactivarMocksTutorialExtraccion() {
    if (origObtenerSubrayados && window.eel) {
        window.eel.obtener_todos_subrayados = origObtenerSubrayados;
        origObtenerSubrayados = null;
    }
    if (origObtenerCapturas && window.eel) {
        window.eel.obtener_capturas_libro = origObtenerCapturas;
        origObtenerCapturas = null;
    }
    if (origNotasListar && window.eel) {
        window.eel.notas_listar = origNotasListar;
        origNotasListar = null;
    }
}

function generarMiniaturaDiagramaDemo() {
    const mini = document.createElement('canvas');
    mini.width = 400;
    mini.height = 140;
    const mctx = mini.getContext('2d');
    mctx.fillStyle = '#f8fafc';
    mctx.fillRect(0, 0, 400, 140);
    mctx.strokeStyle = '#0284c7';
    mctx.lineWidth = 2;
    mctx.strokeRect(1, 1, 398, 138);

    mctx.fillStyle = '#0284c7';
    mctx.font = 'bold 12px system-ui, sans-serif';
    mctx.fillText("Flujo de Aprendizaje", 18, 24);

    const boxes = ["1. Lectura", "2. Análisis", "3. Retención"];
    boxes.forEach((b, i) => {
        const bx = 16 + i * 128;
        mctx.fillStyle = '#ffffff';
        mctx.strokeStyle = '#cbd5e1';
        mctx.lineWidth = 1.2;
        mctx.fillRect(bx, 42, 110, 52);
        mctx.strokeRect(bx, 42, 110, 52);
        mctx.fillStyle = '#0f172a';
        mctx.font = 'bold 11px system-ui, sans-serif';
        mctx.fillText(b, bx + 16, 72);
        if (i < 2) {
            mctx.fillStyle = '#0284c7';
            mctx.font = 'bold 14px system-ui, sans-serif';
            mctx.fillText('➔', bx + 114, 72);
        }
    });
    return mini.toDataURL('image/png');
}
window.generarMiniaturaDiagramaDemo = generarMiniaturaDiagramaDemo;

function cargarDemoExtraccion(subAzul = false, subRosa = false) {
    const langIso = detectarIdiomaTutorialActivo();
    const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = 800;
    offCanvas.height = 1100;
    const ctx = offCanvas.getContext('2d');

    // 1. Fondo blanco nítido
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 800, 1100);

    // 2. Borde exterior
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 796, 1096);

    // 3. Encabezado superior
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(2, 2, 796, 48);
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(2, 50);
    ctx.lineTo(798, 50);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(cfg.tituloDoc, 40, 31);

    // 4. Subtítulo
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
    ctx.fillText(cfg.subtituloDoc, 60, 95);

    // 5. Oraciones
    const fontTexto = '17px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.font = fontTexto;
    ctx.textBaseline = 'alphabetic';

    const yOracion1 = 160;
    const wOracion1 = Math.round(ctx.measureText(cfg.oracion1).width);
    if (subAzul) {
        ctx.fillStyle = 'rgba(0, 255, 255, 0.42)';
        ctx.fillRect(55, yOracion1 - 22, Math.min(680, wOracion1 + 10), 32);
    }
    ctx.fillStyle = '#0f172a';
    ctx.fillText(cfg.oracion1, 60, yOracion1);

    const yOracion2 = 230;
    const wOracion2 = Math.round(ctx.measureText(cfg.oracion2).width);
    if (subRosa) {
        ctx.fillStyle = 'rgba(255, 0, 255, 0.35)';
        ctx.fillRect(55, yOracion2 - 22, Math.min(680, wOracion2 + 10), 32);
    }
    ctx.fillStyle = '#0f172a';
    ctx.fillText(cfg.oracion2, 60, yOracion2);

    // 6. Recuadro del Diagrama Conceptual (x=60, y=300, w=680, h=230)
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(60, 300, 680, 230, 10);
    } else {
        ctx.rect(60, 300, 680, 230);
    }
    ctx.fill();
    ctx.stroke();

    // Cabecera interna del diagrama
    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(60, 300, 680, 42, [10, 10, 0, 0]);
    } else {
        ctx.rect(60, 300, 680, 42);
    }
    ctx.fill();
    ctx.strokeStyle = '#bae6fd';
    ctx.stroke();

    ctx.fillStyle = '#0369a1';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(cfg.diagramaTitulo, 80, 326);

    // 3 cajas esquemáticas
    const cajas = [cfg.diagramaPaso1, cfg.diagramaPaso2, cfg.diagramaPaso3];
    const iconos = ['📖', '💡', '🧠'];
    cajas.forEach((cTxt, idx) => {
        const bx = 90 + idx * 210;
        const by = 365;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(bx, by, 160, 95, 8);
        } else {
            ctx.rect(bx, by, 160, 95);
        }
        ctx.fill();
        ctx.stroke();

        ctx.font = '24px system-ui, sans-serif';
        ctx.fillText(iconos[idx], bx + 65, by + 40);

        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(cTxt, bx + 35, by + 75);

        if (idx < 2) {
            ctx.fillStyle = '#0284c7';
            ctx.font = 'bold 20px system-ui, sans-serif';
            ctx.fillText('➔', bx + 175, by + 55);
        }
    });

    ctx.fillStyle = '#64748b';
    ctx.font = 'italic 12px system-ui, sans-serif';
    ctx.fillText(cfg.diagramaSub, 80, 505);

    const palabras = [];
    const separarPalabras = (txt, startY) => {
        let curX = 60;
        txt.split(/\s+/).forEach(w => {
            const wWidth = Math.max(20, Math.round(ctx.measureText(w).width));
            palabras.push({
                texto: w,
                bbox: [curX, startY - 20, curX + wWidth, startY + 6]
            });
            curX += wWidth + 8;
        });
    };
    separarPalabras(cfg.oracion1, yOracion1);
    separarPalabras(cfg.oracion2, yOracion2);

    const oraciones = [
        {
            texto: cfg.oracion1,
            rects: [[55, yOracion1 - 22, Math.min(680, wOracion1 + 10), yOracion1 + 10]],
            indice_global: 0,
            palabras: palabras.slice(0, cfg.oracion1.split(/\s+/).length)
        },
        {
            texto: cfg.oracion2,
            rects: [[55, yOracion2 - 22, Math.min(680, wOracion2 + 10), yOracion2 + 10]],
            indice_global: 1,
            palabras: palabras.slice(cfg.oracion1.split(/\s+/).length)
        },
        {
            texto: cfg.diagramaTitulo,
            rects: [[60, 300, 740, 530]],
            indice_global: 2,
            palabras: []
        }
    ];

    datosPagina = {
        ancho_img: 800,
        alto_img: 1100,
        ancho_pagina_pdf: 800,
        alto_pagina_pdf: 1100,
        factor_zoom: 1.0,
        palabras: palabras,
        lineas: [{ palabras: palabras }],
        oraciones: oraciones,
        imagen: offCanvas.toDataURL('image/png')
    };

    cortesV = [];
    limitesH = { "0": [0, 1100] };
    zonasExcluidas = [];
    if (typeof dibujar === 'function') dibujar();
}

function _actualizarBurbujaTutorial(html) {
    const bubble = document.getElementById('tour-card-body')?.querySelector('.tutorial-speech-bubble');
    if (bubble) bubble.innerHTML = html;
}

function _registrarSubrayadoDemoEnPanel(sObj) {
    window.demoSubrayadosTutorial = window.demoSubrayadosTutorial || [];
    if (!window.demoSubrayadosTutorial.some(s => s.id === sObj.id)) window.demoSubrayadosTutorial.push(sObj);
    if (typeof appendExtractedText === 'function') appendExtractedText(sObj.texto, sObj.color, sObj.id, sObj.pagina);
    if (typeof actualizarContadoresExtraccion === 'function') {
        actualizarContadoresExtraccion(window.demoSubrayadosTutorial.length, (window.demoCapturasTutorial || []).length);
    }
}

function simularSubrayadoDemo(color, siguiente) {
    if (color !== 'azul' && color !== 'rosa') return;
    const cfg = DEMO_EXTRACCION_POR_IDIOMA[detectarIdiomaTutorialActivo()] || DEMO_EXTRACCION_POR_IDIOMA.es;
    const esAzul = (color === 'azul');

    if (esAzul) demoSubrayadoAzulHecho = true;
    else demoSubrayadoRosaHecho = true;
    cargarDemoExtraccion(true, esAzul ? demoSubrayadoRosaHecho : true);

    _registrarSubrayadoDemoEnPanel(esAzul
        ? { id: 'sub_demo_azul_1', texto: cfg.oracion1, color: '#00FFFF', pagina: 0 }
        : { id: 'sub_demo_rosa_2', texto: cfg.oracion2, color: '#FF00FF', pagina: 0 });
    removerMouseHintPaso3();
    _actualizarBurbujaTutorial(esAzul
        ? (cfg.exitoSubrayadoAzul || `<span style="color:#00ffff; font-weight:bold;">✔ 1ª Oración Subrayada en Azul</span>`)
        : (cfg.exitoSubrayadoRosa || cfg.exitoSubrayado));

    setTimeoutTutorial(() => { if (typeof siguiente === 'function') siguiente(); }, esAzul ? 900 : 1100);
}

function simularCapturaDemo(siguiente, customDataUrl) {
    const langIso = detectarIdiomaTutorialActivo();
    const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;

    demoCapturaHecha = true;
    const esValido = typeof customDataUrl === 'string' && customDataUrl.startsWith('data:image') && customDataUrl.length > 200;
    const miniDataUrl = esValido
        ? customDataUrl
        : generarMiniaturaDiagramaDemo();

    const cObj = {
        id: 'cap_demo_diagrama_1',
        titulo: cfg.diagramaTitulo,
        data_url: miniDataUrl,
        img_src: miniDataUrl,
        pagina: 0,
        fecha: new Date().toISOString()
    };
    window.demoCapturasTutorial = [cObj];

    const visorEl = document.getElementById('visor-container') || document.body;
    const flash = document.createElement('div');
    flash.style.position = 'absolute';
    flash.style.inset = '0';
    flash.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
    flash.style.zIndex = '99999';
    flash.style.pointerEvents = 'none';
    flash.style.transition = 'opacity 0.4s ease';
    visorEl.appendChild(flash);
    setTimeout(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), 400);
    }, 50);

    const cont = document.getElementById('extracted-texts');
    if (cont && typeof renderizarTarjetaCaptura === 'function') {
        renderizarTarjetaCaptura(cObj, cont);
    }
    if (typeof actualizarContadoresExtraccion === 'function') {
        actualizarContadoresExtraccion((window.demoSubrayadosTutorial || []).length, window.demoCapturasTutorial.length);
    }

    removerMouseHintPaso3();
    const bodyEl = document.getElementById('tour-card-body');
    if (bodyEl) {
        const bubble = bodyEl.querySelector('.tutorial-speech-bubble');
        if (bubble) {
            bubble.innerHTML = cfg.exitoRecorte;
        }
    }
    setTimeoutTutorial(() => {
        if (typeof siguiente === 'function') siguiente();
    }, 1100);
}

function configurarTraduccionTutorial(activa = true, origen = 'auto', destino = 'es', modo = 'solo_traduccion') {
    if (typeof safeCheck === 'function') {
        safeCheck('chk-traduccion-activa', activa);
        safeCheck('main-chk-traduccion-activa', activa);
        safeCheck('zen-chk-traduccion-activa', activa);
    } else {
        const c1 = document.getElementById('chk-traduccion-activa');
        if (c1) c1.checked = activa;
        const c2 = document.getElementById('main-chk-traduccion-activa');
        if (c2) c2.checked = activa;
        const c3 = document.getElementById('zen-chk-traduccion-activa');
        if (c3) c3.checked = activa;
    }
    if (typeof safeUI === 'function') {
        safeUI('sel-traduccion-origen', origen);
        safeUI('main-sel-traduccion-origen', origen);
        safeUI('zen-sel-traduccion-origen', origen);
        safeUI('sel-traduccion-destino', destino);
        safeUI('main-sel-traduccion-destino', destino);
        safeUI('zen-sel-traduccion-destino', destino);
        safeUI('sel-traduccion-modo', modo);
        safeUI('main-sel-traduccion-modo', modo);
        safeUI('zen-sel-traduccion-modo', modo);
    } else {
        ['sel-traduccion-origen', 'main-sel-traduccion-origen', 'zen-sel-traduccion-origen'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = origen;
        });
        ['sel-traduccion-destino', 'main-sel-traduccion-destino', 'zen-sel-traduccion-destino'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = destino;
        });
        ['sel-traduccion-modo', 'main-sel-traduccion-modo', 'zen-sel-traduccion-modo'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = modo;
        });
    }
    if (!activa) {
        const detMain = document.getElementById('details-traduccion-main');
        if (detMain) detMain.open = false;
        const detZen = document.getElementById('zen-details-traduccion');
        if (detZen) detZen.open = false;
        if (typeof window.limpiarSubtitulosTraduccion === 'function') {
            window.limpiarSubtitulosTraduccion();
        }
    }
}

function cargarDemoTraduccion() {
    const langIso = detectarIdiomaTutorialActivo();
    const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
    window.cacheTraduccionesJS = window.cacheTraduccionesJS || new Map();
    const resCache = { texto_traducido: cfg.textoTraducido, origen_detectado: cfg.origen };

    const motores = ['hibrido', 'online', 'offline', 'libre'];
    motores.forEach(m => {
        window.cacheTraduccionesJS.set(`${cfg.origen}-->${cfg.destino}::${m}::${cfg.textoDoc.trim()}`, resCache);
        window.cacheTraduccionesJS.set(`auto-->${cfg.destino}::${m}::${cfg.textoDoc.trim()}`, resCache);
    });

    if (typeof eel === 'undefined') window.eel = {};
    if (typeof window.eel.traducir_texto_backend !== 'function') {
        window.eel.traducir_texto_backend = (txt, orig, dest, mot) => Promise.resolve({ texto_traducido: cfg.textoTraducido, origen_detectado: orig });
    }

    configurarTraduccionTutorial(true, cfg.origen, cfg.destino, 'solo_traduccion');
    cargarTextoDemoEnVisor(cfg.textoDoc, cfg.tituloDoc, cfg.subtituloDoc);
}

const _EDGE_FALLBACKS_TEATRO_TOUR = {
    es: ['es-MX-DaliaNeural', 'es-ES-AlvaroNeural', 'es-CL-LorenzoNeural'],
    en: ['en-US-JennyNeural', 'en-US-GuyNeural'],
    fr: ['fr-FR-DeniseNeural', 'fr-FR-HenriNeural'],
    pt: ['pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural'],
    de: ['de-DE-KatjaNeural', 'de-DE-ConradNeural'],
    zh: ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'],
    ru: ['ru-RU-SvetlanaNeural', 'ru-RU-DmitryNeural'],
    ar: ['ar-SA-ZariyahNeural', 'ar-SA-HamedNeural'],
    hi: ['hi-IN-SwaraNeural', 'hi-IN-MadhurNeural'],
    bn: ['bn-IN-TanishaaNeural', 'bn-IN-BashkarNeural']
};

function _esVozEdgeTutorial(v) {
    const low = String(v || '').toLowerCase();
    return low.includes('neural') && !low.includes('kokoro') && !low.includes('pocket');
}

function _esVozPiperTutorial(v) {
    const low = String(v || '').toLowerCase();
    return low.endsWith('.onnx') && !low.includes('kokoro') && !low.includes('pocket');
}

function _esVozRapidaTutorial(v) {
    return _esVozEdgeTutorial(v) || _esVozPiperTutorial(v);
}

function _extraerVocesRapidasDeSelect(selEl) {
    if (!selEl) return [];
    const vals = Array.from(selEl.options).map(o => o.value).filter(Boolean);
    const edges = vals.filter(_esVozEdgeTutorial);
    return edges.length > 0 ? edges : vals.filter(_esVozPiperTutorial);
}

function _asegurarOpcionVozTeatroUI(selVoz, vozPersonaje, vozNarrador) {
    if (!selVoz || !vozPersonaje) return;
    if (!Array.from(selVoz.options).some(o => o.value === vozPersonaje)) {
        const opt = document.createElement('option');
        opt.value = vozPersonaje;
        opt.textContent = `🌐 ${vozPersonaje}`;
        selVoz.appendChild(opt);
    }
    if (!_esVozRapidaTutorial(selVoz.value) || selVoz.value === vozNarrador) {
        selVoz.value = vozPersonaje;
    }
}

function _seleccionarIdiomaSelectTeatroTutorial(langIso) {
    const selIdioma = document.getElementById('select-idioma-teatro');
    if (selIdioma) {
        if (selIdioma.options.length === 0 && typeof cargarIdiomasTeatro === 'function') cargarIdiomasTeatro();
        if (Array.from(selIdioma.options).some(o => o.value === langIso)) selIdioma.value = langIso;
    }
    if (typeof filtrarVocesTeatroClon === 'function') filtrarVocesTeatroClon();
}

function _elegirVozPersonajeDistinta(poolCombinado, fallbackPar, vozNarrador, langIso) {
    return poolCombinado.find(v => v !== vozNarrador && v.toLowerCase().startsWith(langIso))
        || poolCombinado.find(v => v !== vozNarrador)
        || fallbackPar.find(v => v !== vozNarrador)
        || vozNarrador;
}

function obtenerParVocesTeatroTutorial(langIso = 'es') {
    _seleccionarIdiomaSelectTeatroTutorial(langIso);
    const selVoz = document.getElementById('select-voz-teatro');
    const selLive = document.getElementById('selector-voz-live') || document.getElementById('modal-voz');
    const fallbackPar = _EDGE_FALLBACKS_TEATRO_TOUR[langIso] || _EDGE_FALLBACKS_TEATRO_TOUR.es;

    const poolCombinado = [...new Set([..._extraerVocesRapidasDeSelect(selVoz), ..._extraerVocesRapidasDeSelect(selLive), ...fallbackPar])];
    const vozBaseRaw = selLive?.value || '';
    const vozNarrador = _esVozRapidaTutorial(vozBaseRaw) ? vozBaseRaw : (poolCombinado[0] || fallbackPar[0]);
    const vozPersonaje = _elegirVozPersonajeDistinta(poolCombinado, fallbackPar, vozNarrador, langIso);

    _asegurarOpcionVozTeatroUI(selVoz, vozPersonaje, vozNarrador);
    return { vozNarrador: vozNarrador || vozPersonaje, vozPersonaje: vozPersonaje || vozNarrador };
}

function _asegurarEstructuraObraTeatroTutorial() {
    if (typeof dbTeatro === 'undefined' || !dbTeatro) window.dbTeatro = {};
    if (typeof obraActualTeatro === 'undefined' || !obraActualTeatro) {
        window.obraActualTeatro = Object.keys(dbTeatro)[0] || 'General';
        obraActualTeatro = window.obraActualTeatro;
    }
    if (!dbTeatro[obraActualTeatro]) dbTeatro[obraActualTeatro] = { active: true, actors: {} };
    dbTeatro[obraActualTeatro].active = true;
    dbTeatro[obraActualTeatro].actors = dbTeatro[obraActualTeatro].actors || {};
    return dbTeatro[obraActualTeatro].actors;
}

function _limpiarDuplicadosActoresTutorial(actorsObj, cfg, eliminarActorEjemplo) {
    const norm = (s) => s.replace(/[:.,;]/g, '').trim().toLowerCase();
    const preNorm = norm(cfg.actorPreRegistrado);
    const ejNorm = norm(cfg.actorEjemplo);
    for (const k of Object.keys(actorsObj)) {
        const kNorm = norm(k);
        if (kNorm === preNorm && k !== cfg.actorPreRegistrado) delete actorsObj[k];
        if (kNorm === ejNorm && (eliminarActorEjemplo || k !== cfg.actorEjemplo)) delete actorsObj[k];
    }
}

function _configurarActorEjemploTutorial(actorsObj, cfg, vozNarrador, vozPersonaje, incluirActorEjemplo, eliminarActorEjemplo) {
    if (eliminarActorEjemplo) { delete actorsObj[cfg.actorEjemplo]; return; }
    if (!incluirActorEjemplo) return;

    const selVoz = document.getElementById('select-voz-teatro');
    const vozElegida = (selVoz?.value && selVoz.value !== vozNarrador && _esVozRapidaTutorial(selVoz.value))
        ? selVoz.value
        : (vozPersonaje || vozNarrador);
    if (selVoz && vozElegida) selVoz.value = vozElegida;
    if (vozElegida) actorsObj[cfg.actorEjemplo] = { voz: vozElegida, on: true };
}

function asegurarEstadoTeatroTutorial(incluirActorEjemplo = true, eliminarActorEjemplo = false) {
    try {
        const langIso = detectarIdiomaTutorialActivo();
        const cfg = DEMO_TEATRO_POR_IDIOMA[langIso] || DEMO_TEATRO_POR_IDIOMA.es;
        const { vozNarrador, vozPersonaje } = obtenerParVocesTeatroTutorial(langIso);

        const actorsObj = _asegurarEstructuraObraTeatroTutorial();
        _limpiarDuplicadosActoresTutorial(actorsObj, cfg, eliminarActorEjemplo);
        if (vozNarrador) actorsObj[cfg.actorPreRegistrado] = { voz: vozNarrador, on: true };
        _configurarActorEjemploTutorial(actorsObj, cfg, vozNarrador, vozPersonaje, incluirActorEjemplo, eliminarActorEjemplo);

        const chkGlobal = document.getElementById('chk-teatro-global');
        if (chkGlobal) chkGlobal.checked = true;
        if (typeof renderizarSidebarTeatro === 'function') renderizarSidebarTeatro();
        if (typeof renderizarActores === 'function') renderizarActores();
        if (typeof eel !== 'undefined' && typeof eel.guardar_diccionario_teatro === 'function') eel.guardar_diccionario_teatro(dbTeatro)();
        if (typeof eel !== 'undefined' && typeof eel.limpiar_pasteleria === 'function') eel.limpiar_pasteleria()();
    } catch (e) {
        console.warn("⚠️ Error sincronizando estado de Modo Teatro en tutorial:", e);
    }
}

function _debeEliminarClaveDiccionarioTour(sec, k, objetivo, forzar) {
    if (!objetivo) return false;
    if (k.toLowerCase() !== objetivo.toLowerCase()) return false;
    return sec !== seccionActual || k !== objetivo || forzar;
}

function _limpiarDuplicadosDiccionarioTutorial(cfg, eliminarEjemplo) {
    for (const sec in dbDiccionario) {
        const termsObj = dbDiccionario[sec]?.terms;
        if (!termsObj) continue;
        for (const k of Object.keys(termsObj)) {
            if (_debeEliminarClaveDiccionarioTour(sec, k, cfg.siglaEjemplo, eliminarEjemplo)
                || _debeEliminarClaveDiccionarioTour(sec, k, cfg.siglaExtra, false)) {
                delete termsObj[k];
            }
        }
    }
}

function _persistirDiccionarioTutorial() {
    if (typeof renderizarTerminos === 'function') renderizarTerminos();
    if (typeof eel !== 'undefined' && typeof eel.guardar_diccionario === 'function') eel.guardar_diccionario(dbDiccionario)();
    if (typeof eel !== 'undefined' && typeof eel.limpiar_pasteleria === 'function') eel.limpiar_pasteleria()();
}

function asegurarEstadoDiccionarioTutorial(activarEjemplo = true, eliminarEjemplo = false) {
    try {
        if (typeof dbDiccionario === 'undefined' || !dbDiccionario) return;
        const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[detectarIdiomaTutorialActivo()] || DEMO_ABREVIATURAS_POR_IDIOMA.es;

        if (!seccionActual) seccionActual = Object.keys(dbDiccionario)[0] || 'GENERAL';
        if (!dbDiccionario[seccionActual]) dbDiccionario[seccionActual] = { active: true, terms: {} };
        dbDiccionario[seccionActual].active = true;
        dbDiccionario[seccionActual].terms = dbDiccionario[seccionActual].terms || {};

        _limpiarDuplicadosDiccionarioTutorial(cfg, eliminarEjemplo);

        const terms = dbDiccionario[seccionActual].terms;
        if (cfg.siglaExtra && cfg.significadoExtra) terms[cfg.siglaExtra] = { val: cfg.significadoExtra, on: true };
        if (cfg.siglaEjemplo && cfg.significadoEjemplo) {
            if (eliminarEjemplo) delete terms[cfg.siglaEjemplo];
            else terms[cfg.siglaEjemplo] = { val: cfg.significadoEjemplo, on: Boolean(activarEjemplo) };
        }
        _persistirDiccionarioTutorial();
    } catch (e) {
        console.warn("⚠️ Error sincronizando estado de diccionario en tutorial:", e);
    }
}

function configurarOracionDemoAbreviaturas(expandirEjemplo = true) {
    try {
        const langIso = detectarIdiomaTutorialActivo();
        const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
        if (!datosPagina || !datosPagina.oraciones || !datosPagina.oraciones[0] || !datosPagina.palabras) return;

        const palsMapeadas = [];
        datosPagina.palabras.forEach(pObj => {
            const limpio = pObj.texto.replace(/[.,;:]/g, '').toLowerCase();
            if (cfg.siglaExtra && limpio === cfg.siglaExtra.toLowerCase()) {
                const n = cfg.significadoExtra.trim().split(/\s+/).length;
                for (let k = 0; k < n; k++) palsMapeadas.push(pObj);
            } else if (expandirEjemplo && cfg.siglaEjemplo && limpio === cfg.siglaEjemplo.toLowerCase()) {
                const n = cfg.significadoEjemplo.trim().split(/\s+/).length;
                for (let k = 0; k < n; k++) palsMapeadas.push(pObj);
            } else {
                palsMapeadas.push(pObj);
            }
        });

        datosPagina.oraciones[0].texto = cfg.texto;
        datosPagina.oraciones[0].palabras = palsMapeadas;
    } catch (e) {
        console.warn("⚠️ Error mapeando oración demo de abreviaturas:", e);
    }
}

function generarImagenBase64Demo(ancho, alto, lineasTexto) {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = ancho;
    offCanvas.height = alto;
    const offCtx = offCanvas.getContext('2d');

    // Fondo blanco nítido
    offCtx.fillStyle = '#ffffff';
    offCtx.fillRect(0, 0, ancho, alto);

    // Borde de página
    offCtx.strokeStyle = '#cbd5e1';
    offCtx.lineWidth = 2;
    offCtx.strokeRect(2, 2, ancho - 4, alto - 4);

    // Cabecera elegante
    offCtx.fillStyle = '#f1f5f9';
    offCtx.fillRect(0, 0, ancho, 55);
    offCtx.fillStyle = '#475569';
    offCtx.font = 'bold 13px system-ui, sans-serif';
    offCtx.fillText('DOCUMENTO DE CALIBRACIÓN - LIRALOUD', 40, 34);

    // Renderizar textos
    lineasTexto.forEach(lt => {
        offCtx.fillStyle = lt.color || '#0f172a';
        offCtx.font = lt.font || '16px system-ui, sans-serif';
        offCtx.fillText(lt.texto, lt.x, lt.y);
    });

    return offCanvas.toDataURL('image/png');
}

function cargarTextoDemoEnVisor(textoOpcional = null, tituloOpcional = null, subtituloOpcional = null) {
    const langIso = detectarIdiomaTutorialActivo();
    const cfg = CALIBRACION_POR_IDIOMA[langIso] || CALIBRACION_POR_IDIOMA.es;
    const texto = textoOpcional || cfg.texto;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = 800;
    offCanvas.height = 1100;
    const offCtx = offCanvas.getContext('2d');

    // 1. Fondo blanco nítido
    offCtx.fillStyle = '#ffffff';
    offCtx.fillRect(0, 0, 800, 1100);

    // 2. Borde de página sutil
    offCtx.strokeStyle = '#cbd5e1';
    offCtx.lineWidth = 2;
    offCtx.strokeRect(2, 2, 796, 1096);

    // 3. Cabecera superior elegante
    offCtx.fillStyle = '#f8fafc';
    offCtx.fillRect(2, 2, 796, 48);
    offCtx.strokeStyle = '#e2e8f0';
    offCtx.beginPath();
    offCtx.moveTo(2, 50);
    offCtx.lineTo(798, 50);
    offCtx.stroke();

    offCtx.fillStyle = '#64748b';
    offCtx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    offCtx.fillText(tituloOpcional || cfg.tituloDoc, 40, 31);

    // 4. Subtítulo con margen amplio antes del texto (para que el ratón animado tenga espacio cómodo)
    offCtx.fillStyle = '#0284c7';
    offCtx.font = 'bold 15px system-ui, -apple-system, sans-serif';
    offCtx.fillText(subtituloOpcional || cfg.subtituloDoc, 60, 95);

    // 5. Configurar tipografía del texto principal
    const fontTexto = '18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    offCtx.font = fontTexto;
    offCtx.textBaseline = 'alphabetic';

    let palabras = [];
    let curX = 60;
    let curY = 165; // Margen vertical amplio respecto al subtítulo (70px)
    const maxLineX = 720;
    const lineHeight = 40;

    const palabrasRaw = texto.split(/\s+/).filter(Boolean);
    const spaceWidth = Math.round(offCtx.measureText(" ").width);

    palabrasRaw.forEach((p) => {
        const wordMetrics = offCtx.measureText(p);
        const wordWidth = Math.max(20, Math.round(wordMetrics.width));

        if (curX + wordWidth > maxLineX) {
            curX = 60;
            curY += lineHeight;
        }

        // Pintar cada palabra directamente en el lienzo en curX, curY
        offCtx.fillStyle = '#0f172a';
        offCtx.font = fontTexto;
        offCtx.fillText(p, curX, curY);

        // Bbox que coincide exactamente con los píxeles donde fue dibujada
        const palObj = {
            texto: p,
            bbox: [curX, curY - 19, curX + wordWidth, curY + 5]
        };
        palabras.push(palObj);

        curX += wordWidth + spaceWidth;
    });

    // Dividir en oraciones naturales para sincronización precisa con el motor de audio
    const idxPunto = palabras.findIndex(p => p.texto.includes('.'));
    let oraciones = [];

    if (idxPunto !== -1 && idxPunto < palabras.length - 1) {
        const palsOracion1 = palabras.slice(0, idxPunto + 1);
        const palsOracion2 = palabras.slice(idxPunto + 1);
        const txtOracion1 = palsOracion1.map(p => p.texto).join(" ");
        const txtOracion2 = palsOracion2.map(p => p.texto).join(" ");

        const rectOracion1 = [
            Math.min(...palsOracion1.map(p => p.bbox[0])),
            Math.min(...palsOracion1.map(p => p.bbox[1])),
            Math.max(...palsOracion1.map(p => p.bbox[2])),
            Math.max(...palsOracion1.map(p => p.bbox[3]))
        ];
        const rectOracion2 = [
            Math.min(...palsOracion2.map(p => p.bbox[0])),
            Math.min(...palsOracion2.map(p => p.bbox[1])),
            Math.max(...palsOracion2.map(p => p.bbox[2])),
            Math.max(...palsOracion2.map(p => p.bbox[3]))
        ];

        oraciones = [
            { texto: txtOracion1, rects: [rectOracion1], indice_global: 0, palabras: palsOracion1 },
            { texto: txtOracion2, rects: [rectOracion2], indice_global: 1, palabras: palsOracion2 }
        ];
    } else {
        oraciones = [{
            texto: texto,
            rects: [[60, 140, 740, curY + 15]],
            indice_global: 0,
            palabras: palabras
        }];
    }

    let imgData = offCanvas.toDataURL('image/png');

    datosPagina = {
        ancho_img: 800,
        alto_img: 1100,
        ancho_pagina_pdf: 800,
        alto_pagina_pdf: 1100,
        factor_zoom: 1.0,
        palabras: palabras,
        lineas: [{ palabras: palabras }],
        oraciones: oraciones,
        imagen: imgData
    };

    cortesV = [];
    limitesH = { "0": [0, 1100] };
    zonasExcluidas = [];
    if (typeof dibujar === 'function') dibujar();
}

const _CJK_DEMO_RE = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

function _tokenizarTextoConCJKDemo(ctx, texto, maxWidth) {
    const tokens = [];
    for (const parte of String(texto || '').split(/\s+/).filter(Boolean)) {
        if (_CJK_DEMO_RE.test(parte) && ctx.measureText(parte).width > maxWidth) {
            for (const ch of Array.from(parte)) tokens.push({ t: ch, cjk: true });
        } else {
            tokens.push({ t: parte, cjk: false });
        }
    }
    return tokens;
}

function _pintarBloqueTokensDemo(ctx, texto, opts, todasPalabras) {
    const pals = [];
    let curX = opts.x0;
    let curY = opts.y0;
    for (const { t: p, cjk } of _tokenizarTextoConCJKDemo(ctx, texto, opts.x1 - opts.x0)) {
        const w = cjk ? Math.max(6, Math.round(ctx.measureText(p).width)) : Math.max(14, Math.round(ctx.measureText(p).width));
        if (curX + w > opts.x1) { curX = opts.x0; curY += opts.lineHeight; }
        ctx.fillText(p, curX, curY);
        const objPal = { texto: p, bbox: [curX, curY - opts.topPad, curX + w, curY + opts.botPad] };
        todasPalabras.push(objPal);
        pals.push(objPal);
        curX += w + (cjk ? 1 : opts.gap);
    }
    return pals;
}

function _dibujarColumnaPaso4(ctx, titulo, texto, colX0, colX1, todasPalabras) {
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(titulo, colX0, 100);
    ctx.fillStyle = '#0f172a';
    ctx.font = '14px system-ui, sans-serif';
    const palsCol = _pintarBloqueTokensDemo(ctx, texto, { x0: colX0, x1: colX1, y0: 128, lineHeight: 24, topPad: 14, botPad: 5, gap: 6 }, todasPalabras);
    const minY = palsCol.length > 0 ? Math.min(...palsCol.map(w => w.bbox[1])) : 110;
    const maxY = palsCol.length > 0 ? Math.max(...palsCol.map(w => w.bbox[3])) : 420;
    return { pals: palsCol, rect: [colX0 - 4, minY - 4, colX1 + 4, maxY + 4] };
}

function _aplicarLimitesFasePaso4(fase) {
    const mapaFases = {
        columnas: { v: [], h: { "0": [0, 1100] } },
        horizontales: { v: [275, 525], h: { "0": [0, 1100], "1": [0, 1100], "2": [0, 1100] } },
        excluir: { v: [275, 525], h: { "0": [75, 990], "1": [75, 990], "2": [75, 990] } }
    };
    const cfgFase = mapaFases[fase];
    if (cfgFase) {
        cortesV = [...cfgFase.v];
        limitesH = JSON.parse(JSON.stringify(cfgFase.h));
    }
    if (fase !== 'excluir') zonasExcluidas = [];
}

function cargarDemoPaso4Limites(fase = 'columnas') {
    const langIso = detectarIdiomaTutorialActivo();
    const cfg = DEMO_PASO4_POR_IDIOMA[langIso] || DEMO_PASO4_POR_IDIOMA.es;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = 800; offCanvas.height = 1100;
    const ctx = offCanvas.getContext('2d');

    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 800, 1100);
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.strokeRect(2, 2, 796, 1096);
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(4, 4, 792, 55);
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath(); ctx.moveTo(4, 60); ctx.lineTo(796, 60); ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.fillText(cfg.encabezado, 40, 36);

    ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(275, 75); ctx.lineTo(275, 975); ctx.moveTo(525, 75); ctx.lineTo(525, 975); ctx.stroke();

    const todasPalabras = [];
    cfg.encabezado.split(/\s+/).forEach((p, idx) => {
        todasPalabras.push({ texto: p, bbox: [40 + (idx * 55), 20, 90 + (idx * 55), 45] });
    });

    const col1 = _dibujarColumnaPaso4(ctx, cfg.col1Titulo, cfg.col1Texto, 40, 260, todasPalabras);
    const col2 = _dibujarColumnaPaso4(ctx, cfg.col2Titulo, cfg.col2Texto, 290, 510, todasPalabras);
    const col3 = _dibujarColumnaPaso4(ctx, cfg.col3Titulo, cfg.col3Texto, 540, 760, todasPalabras);

    ctx.fillStyle = '#fffbeb'; ctx.fillRect(538, 430, 222, 95);
    ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 1.5; ctx.strokeRect(538, 430, 222, 95);
    ctx.fillStyle = '#b45309'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillText("📢 " + cfg.anuncioTitulo, 546, 452);
    ctx.fillStyle = '#78350f'; ctx.font = '12px system-ui, sans-serif';
    _pintarBloqueTokensDemo(ctx, cfg.anuncioTexto, { x0: 546, x1: 750, y0: 474, lineHeight: 20, topPad: 12, botPad: 4, gap: 5 }, todasPalabras);

    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath(); ctx.moveTo(4, 1000); ctx.lineTo(796, 1000); ctx.stroke();
    ctx.fillStyle = '#94a3b8'; ctx.font = 'italic 13px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(cfg.pieTexto, 400, 1032);
    ctx.textAlign = 'start';
    cfg.pieTexto.split(/\s+/).forEach((p, idx) => {
        todasPalabras.push({ texto: p, bbox: [320 + (idx * 40), 1018, 355 + (idx * 40), 1042] });
    });

    datosPagina = {
        ancho_img: 800, alto_img: 1100, ancho_pagina_pdf: 800, alto_pagina_pdf: 1100, factor_zoom: 1.0,
        palabras: todasPalabras, lineas: [{ palabras: todasPalabras }],
        oraciones: [
            { texto: cfg.col1Texto, rects: [col1.rect], indice_global: 0, palabras: col1.pals },
            { texto: cfg.col2Texto, rects: [col2.rect], indice_global: 1, palabras: col2.pals },
            { texto: cfg.col3Texto, rects: [col3.rect], indice_global: 2, palabras: col3.pals }
        ],
        imagen: offCanvas.toDataURL('image/png')
    };

    _aplicarLimitesFasePaso4(fase);
    if (typeof dibujar === 'function') dibujar();
}

function cargarDemoAbreviaturas() {
    const langIso = detectarIdiomaTutorialActivo();
    const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
    cargarTextoDemoEnVisor(cfg.texto);
}

function cargarDemoTeatro() {
    const langIso = detectarIdiomaTutorialActivo();
    const cfg = DEMO_TEATRO_POR_IDIOMA[langIso] || DEMO_TEATRO_POR_IDIOMA.es;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = 800;
    offCanvas.height = 1100;
    const offCtx = offCanvas.getContext('2d');

    // 1. Fondo blanco nítido
    offCtx.fillStyle = '#ffffff';
    offCtx.fillRect(0, 0, 800, 1100);

    // 2. Borde de página sutil
    offCtx.strokeStyle = '#cbd5e1';
    offCtx.lineWidth = 2;
    offCtx.strokeRect(2, 2, 796, 1096);

    // 3. Cabecera superior elegante
    offCtx.fillStyle = '#f8fafc';
    offCtx.fillRect(2, 2, 796, 48);
    offCtx.strokeStyle = '#e2e8f0';
    offCtx.beginPath();
    offCtx.moveTo(2, 50);
    offCtx.lineTo(798, 50);
    offCtx.stroke();

    offCtx.fillStyle = '#64748b';
    offCtx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    offCtx.fillText(cfg.tituloDoc, 40, 31);

    // 4. Subtítulo de la escena
    offCtx.fillStyle = '#0284c7';
    offCtx.font = 'bold 15px system-ui, -apple-system, sans-serif';
    offCtx.fillText(cfg.subtituloDoc, 60, 95);

    const fontNormal = '18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const fontActor = 'bold 18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const coloresActores = ['#5b4db8', '#0284c7', '#059669'];

    let palabrasTodas = [];
    let oraciones = [];
    let curY = 175;
    const maxLineX = 720;
    const lineHeight = 38;

    cfg.lineas.forEach((lin, lIdx) => {
        let curX = 60;
        let linPalabras = [];
        const tokens = lin.split(/\s+/).filter(Boolean);
        const startY = curY - 22;

        tokens.forEach((p, pIdx) => {
            const esNombreActor = pIdx === 0 && p.endsWith(':');
            offCtx.font = esNombreActor ? fontActor : fontNormal;
            offCtx.fillStyle = esNombreActor ? (coloresActores[lIdx % coloresActores.length]) : '#0f172a';

            const wordMetrics = offCtx.measureText(p);
            const wordWidth = Math.max(20, Math.round(wordMetrics.width));
            const spaceWidth = Math.round(offCtx.measureText(" ").width);

            if (curX + wordWidth > maxLineX) {
                curX = 60;
                curY += lineHeight;
            }

            offCtx.fillText(p, curX, curY);

            const objPal = {
                texto: p,
                bbox: [curX, curY - 19, curX + wordWidth, curY + 5]
            };
            palabrasTodas.push(objPal);
            linPalabras.push(objPal);

            curX += wordWidth + spaceWidth;
        });

        // En Modo Teatro, Python elimina el prefijo "Personaje:" antes de sintetizar el audio,
        // por lo que las palabras habladas para el Karaoke corresponden al diálogo (sin el token 0).
        const palabrasDialogo = linPalabras.length > 1 ? linPalabras.slice(1) : linPalabras;

        oraciones.push({
            texto: lin,
            rects: [[56, startY, 740, curY + 10]],
            indice_global: lIdx,
            palabras: palabrasDialogo
        });

        curY += 68;
    });

    const imgData = offCanvas.toDataURL('image/png');

    datosPagina = {
        ancho_img: 800,
        alto_img: 1100,
        ancho_pagina_pdf: 800,
        alto_pagina_pdf: 1100,
        factor_zoom: 1.0,
        palabras: palabrasTodas,
        lineas: [{ palabras: palabrasTodas }],
        oraciones: oraciones,
        imagen: imgData
    };

    cortesV = [];
    limitesH = { "0": [0, 1100] };
    zonasExcluidas = [];

    if (typeof dibujar === 'function') dibujar();
}


window.activarMocksTutorialExtraccion = activarMocksTutorialExtraccion;
window.desactivarMocksTutorialExtraccion = desactivarMocksTutorialExtraccion;
window.cargarDemoExtraccion = cargarDemoExtraccion;
window.simularSubrayadoDemo = simularSubrayadoDemo;
window.simularCapturaDemo = simularCapturaDemo;
window.configurarTraduccionTutorial = configurarTraduccionTutorial;
window.cargarDemoTraduccion = cargarDemoTraduccion;
window.obtenerParVocesTeatroTutorial = obtenerParVocesTeatroTutorial;
window.asegurarEstadoTeatroTutorial = asegurarEstadoTeatroTutorial;
window.asegurarEstadoDiccionarioTutorial = asegurarEstadoDiccionarioTutorial;
window.configurarOracionDemoAbreviaturas = configurarOracionDemoAbreviaturas;
window.generarImagenBase64Demo = generarImagenBase64Demo;
window.cargarTextoDemoEnVisor = cargarTextoDemoEnVisor;
window.cargarDemoPaso4Limites = cargarDemoPaso4Limites;
window.cargarDemoAbreviaturas = cargarDemoAbreviaturas;
window.cargarDemoTeatro = cargarDemoTeatro;
