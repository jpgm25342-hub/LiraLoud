/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// 7. AJUSTES DE LECTURA Y UI (SINCRONIZADOS)
// ==========================================

// ============================================================
// LLENADO DEL SELECTOR DE MP3 (HÍBRIDO: PIPER + EDGE)
// ============================================================
async function llenarTodosLosSelectores() {
    try {
        console.log("📡 [JS] Solicitando unificación de catálogo...");

        // 1. Forzamos la carga de voces del navegador
        let vocesDelNavegador = synth.getVoices();

        // 2. Mapeamos solo el nombre para no saturar el canal de datos
        const datosParaPython = vocesDelNavegador.map(v => ({ name: v.name }));

        // 3. Handshake con el backend enviando el catálogo vivo
        const catalogoHibrido = await eel.obtener_todas_las_voces_descarga(datosParaPython)();

        const selModal = document.getElementById('modal-voz');
        if (!selModal) return;

        selModal.innerHTML = ""; // Limpieza técnica

        catalogoHibrido.forEach(v => {
            let opt = document.createElement('option');
            opt.value = v.id;
            opt.innerText = v.nombre;

            // Estética para tu Red Ejecutiva: Diferenciamos lo local [cite: 2025-11-25]
            if (v.tipo === "local") {
                opt.style.color = "#d35400"; // Naranja Piper
                opt.style.fontWeight = "bold";
            }
            selModal.appendChild(opt);
        });

        console.log("✅ [JS] Catálogo MP3 actualizado.");
    } catch (e) {
        console.error("🔥 Error en Handshake de voces:", e);
    }
}




async function cambiarVozLive() {
    // 1. SILENCIO FÍSICO INMEDIATO
    detenerLectura(false);
    if (window.activeAudioSources) {
        window.activeAudioSources.forEach(s => { try { s.stop(); } catch (e) { } });
        window.activeAudioSources = [];
    }
    if (synth) synth.cancel();
    // 2. ACTUALIZAR IDENTIDAD VOCAL (Ancla de Oro)
    let sel = document.getElementById('selector-voz-live');
    if (sel && sel.selectedIndex >= 0) {
        // Fijamos la intención para que las siguientes oraciones la respeten
        vozPredeterminada = sel.value;

        // 💾 PERSISTENCIA AUTOMÁTICA: Guardamos en el JSON inmediatamente
        await eel.guardar_voz_default(vozPredeterminada)();
        console.log("💾 Voz Maestra sincronizada en JSON:", vozPredeterminada);

        // Sincronía visual del buscador inteligente
        const inpBuscador = document.getElementById('busqueda-voz-live');
        if (inpBuscador) inpBuscador.value = vozPredeterminada;
    }

    // 3. RE-FILTRADO POR SNAPSHOT (Materia Prima)
    // Limpiamos la caché para que no queden rastros de la voz pasada
    await eel.limpiar_pasteleria()();
    let dictActual = obtenerDiccionarioConsolidado();
    let nuevasOraciones = await eel.reaplicar_filtros_desde_snapshot(dictActual)();

    if (nuevasOraciones && typeof datosPagina !== 'undefined' && datosPagina) {
        datosPagina.oraciones = nuevasOraciones;
        window.vozActivaSnapshot = vozPredeterminada;
    }

    // 4. REANUDAR CON LA NUEVA IDENTIDAD
    if (leyendo && indiceOracion !== -1) {
        // 🎯 GUILLOTINA: Incrementamos la sesión para que CUALQUIER 
        // proceso de audio anterior (Edge o Piper) se ignore al instante.
        currentReadingSession += 10;
        window.currentReadingSession = currentReadingSession;

        if (window.timerReanudacionVoz) clearTimeout(window.timerReanudacionVoz);

        console.log("⚔️ Estableciendo sesión única: " + window.currentReadingSession);

        // Guardamos el timer en una global para poder cancelarlo si entra otra orden rápida
        window.timerReanudacionVoz = setTimeout(() => {
            // Solo si seguimos en modo "leyendo", disparamos la secuencia
            if (leyendo) {
                console.log("▶️ Disparo único de secuencia ejecutado.");
                reproducirSecuencia(indiceOracion);
            }
        }, 150);
    }
    // 5. ACTUALIZACIÓN FINAL DE INTERFAZ
    actualizarBotonEstrella();
}


function sincronizarSlider(tipo) {
    const slider = document.getElementById(`rng-${tipo}`);
    const input = document.getElementById(`num-${tipo}`);

    if (slider && input) {
        // 1. Sincronía visual inmediata entre slider y número
        input.value = slider.value;

        // 2. Actualización de variables de estado en RAM
        const valor = parseFloat(slider.value);
        if (tipo === 'velocidad') velocidadLectura = valor;
        if (tipo === 'tono') pitchLectura = valor;
        if (tipo === 'pausa') pausaPunto = parseInt(valor);

        // 3. CAMBIO CLAVE: Ya no llamamos a actualizarFiltrosSnapshot() aquí.
        // Esto evita que el JSON se sobrescriba con datos incompletos 
        // mientras solo estamos pre-visualizando el cambio.
        console.log(`🎚️ Ajuste temporal: ${tipo} fijado en ${valor}`);
    }
}


function sincronizarInput(tipo) {
    let slider = document.getElementById(`rng-${tipo}`);
    let input = document.getElementById(`num-${tipo}`);
    let val = parseFloat(input.value);

    // Límites de seguridad
    if (val < parseFloat(input.min)) val = parseFloat(input.min);
    if (val > parseFloat(input.max)) val = parseFloat(input.max);

    input.value = val;
    slider.value = val;

    if (tipo === 'velocidad') velocidadLectura = val;
    if (tipo === 'tono') pitchLectura = val;
    if (tipo === 'pausa') pausaPunto = val;

    actualizarFiltrosSnapshot();
}

// Obtiene las coordenadas del área visible en píxeles internos del canvas según el recorte de bordes activo
function obtenerLimitesVisiblesRecorte() {
    const recorteActual = parseInt(document.getElementById('rng-recorte-pdf')?.value || 0);
    const w = canvas ? canvas.width : (datosPagina ? datosPagina.ancho_img : 9999);
    const h = canvas ? canvas.height : (datosPagina ? datosPagina.alto_img : 9999);
    if (!canvas || recorteActual <= 0) {
        return {
            minY: 0,
            maxY: h,
            minX: 0,
            maxX: w,
            cropH: 0,
            cropV: 0,
            activo: false
        };
    }
    const cropH = Math.round((recorteActual / 100) * w * 0.20);
    const cropV = Math.round((recorteActual / 100) * h * 0.12);
    return {
        minY: cropV,
        maxY: h - cropV,
        minX: cropH,
        maxX: w - cropH,
        cropH: cropH,
        cropV: cropV,
        activo: true
    };
}
window.obtenerLimitesVisiblesRecorte = obtenerLimitesVisiblesRecorte;

// Recorte de Bordes: recorta simétricamente los bordes blancos del PDF
// Usa position:relative en el canvas para desplazarlo hacia arriba/izquierda,
// mientras el wrapper (overflow:hidden) oculta lo que sobresale por fuera.
// El flex del visor-container centra automáticamente el wrapper resultante.
function _programarRecargaTrasRecorte() {
    if (window.timerDebounceRecorte) clearTimeout(window.timerDebounceRecorte);
    if (typeof rutaPDFActual !== 'string' || !rutaPDFActual) return;
    window.timerDebounceRecorte = setTimeout(() => {
        const listo = typeof cargarPagina === 'function' && typeof paginaActual !== 'undefined' && !window.bloqueoCambioPagina;
        if (listo && typeof rutaPDFActual === 'string' && rutaPDFActual) cargarPagina(paginaActual);
    }, 400);
}

function aplicarRecorteDinamico(valor) {
    const v = parseInt(valor) || 0;
    const wrapper = document.getElementById('pdf-crop-wrapper');
    const canvas = document.getElementById('lienzo-pdf');
    const spanVal = document.getElementById('val-recorte-pdf');
    if (spanVal) spanVal.innerText = v + '%';
    if (!canvas || !wrapper) return;

    const canvasW = parseFloat(canvas.style.width) || canvas.offsetWidth || canvas.width;
    const canvasH = parseFloat(canvas.style.height) || canvas.offsetHeight || canvas.height;
    const cropH = Math.round((v / 100) * canvasW * 0.20);
    const cropV = Math.round((v / 100) * canvasH * 0.12);

    canvas.style.position = 'relative';
    canvas.style.left = '-' + cropH + 'px';
    canvas.style.top = '-' + cropV + 'px';
    canvas.style.margin = '0';

    wrapper.style.width = Math.max(100, canvasW - cropH * 2) + 'px';
    wrapper.style.height = Math.max(100, canvasH - cropV * 2) + 'px';
    wrapper.style.overflow = 'hidden';

    if (datosPagina && typeof dibujar === 'function') dibujar();
    _programarRecargaTrasRecorte();
}

// Zoom Dinámico: ajusta el nivel de zoom del canvas y redibuja
function aplicarZoomDinamico(valor) {
    const num = Number(valor);
    const z = Number.isFinite(num) && num > 0 ? Math.max(50, Math.min(250, Math.round(num))) : 100;
    const spanVal = document.getElementById('val-zoom-pdf');
    if (spanVal) spanVal.innerText = z + '%';
    const btnZenZoom = document.getElementById('btn-zen-zoom-reset');
    if (btnZenZoom) btnZenZoom.innerText = z + '%';
    const rngZoom = document.getElementById('rng-zoom-pdf');
    if (rngZoom && Number(rngZoom.value) !== z) rngZoom.value = z;
    nivelZoomPDF = z / 100;
    dibujar();
}
window.aplicarZoomDinamico = aplicarZoomDinamico;

// Márgenes Laterales Dinámicos: ajusta el padding horizontal del visor de PDF
function aplicarMargenDinamico(valor) {
    const num = Number(valor);
    const m = Number.isFinite(num) ? Math.max(0, Math.min(150, Math.round(num))) : 20;
    const spanVal = document.getElementById('val-margen-pdf');
    if (spanVal) spanVal.innerText = m + 'px';
    const rngMargen = document.getElementById('rng-margen-pdf');
    if (rngMargen && Number(rngMargen.value) !== m) rngMargen.value = m;
    const visor = document.getElementById('visor-container');
    if (visor) {
        visor.style.paddingLeft = m + 'px';
        visor.style.paddingRight = m + 'px';
    }
}
window.aplicarMargenDinamico = aplicarMargenDinamico;

function toggleVisibilidadElemento(selector, isHidden) {
    const el = document.querySelector(selector);
    if (el) {
        if (isHidden) {
            if (!el.dataset.displayOriginal) {
                el.dataset.displayOriginal = el.style.display || getComputedStyle(el).display;
            }
            el.style.setProperty('display', 'none', 'important');
        } else {
            el.style.display = el.dataset.displayOriginal || '';
        }
    }
}
window.toggleVisibilidadElemento = toggleVisibilidadElemento;

function toggleBotonKofi(mostrar) {
    if (typeof mostrar === 'undefined') {
        mostrar = document.getElementById('chk-kofi')?.checked ?? true;
    }
    const btnKofi = document.getElementById('btn-kofi-global');
    if (btnKofi) {
        if (mostrar) {
            btnKofi.classList.remove('hidden-kofi');
            btnKofi.style.setProperty('display', 'inline-flex', 'important');
        } else {
            btnKofi.classList.add('hidden-kofi');
            btnKofi.style.setProperty('display', 'none', 'important');
        }
    }
}
window.toggleBotonKofi = toggleBotonKofi;

function _leerNumUI(id, def, esFloat = false) {
    const raw = document.getElementById(id)?.value;
    if (raw === undefined || raw === null || raw === '') return def;
    const n = esFloat ? parseFloat(raw) : parseInt(raw, 10);
    return Number.isNaN(n) ? def : n;
}

function _leerChkUI(id, def) {
    const el = document.getElementById(id);
    return el ? Boolean(el.checked) : def;
}

function _capturarPackAjustesLecturaUI() {
    velocidadLectura = _leerNumUI('rng-velocidad', 1.0, true);
    pitchLectura = _leerNumUI('rng-tono', 1.0, true);
    pausaPunto = _leerNumUI('rng-pausa', 300);
    volumenPorcentaje = _leerNumUI('rng-volumen-master', _leerNumUI('num-volumen-master', 100));
    toggleBotonKofi(_leerChkUI('chk-kofi', true));

    return {
        velocidad: velocidadLectura,
        tono: pitchLectura,
        pausa: pausaPunto,
        volumen: volumenPorcentaje,
        color: document.getElementById('color-resaltado')?.value || "#ffff00",
        padKaraoke: _leerNumUI('rng-pad-karaoke', 2),
        colorGuia: document.getElementById('color-guia-oracion')?.value || "#00b4ff",
        padGuia: _leerNumUI('rng-pad-guia', 2),
        llenado: _leerChkUI('chk-llenado-fluido', false),
        margenPDF: _leerNumUI('rng-margen-pdf', 20),
        seguirTexto: _leerChkUI('chk-seguir-texto', true),
        omitirParen: _leerChkUI('chk-paren', true),
        omitirCorch: _leerChkUI('chk-corch', true),
        omitirLlaves: _leerChkUI('chk-llaves', true),
        omitirUrls: _leerChkUI('chk-urls', true)
    };
}

function _detenerFuentesYColaLecturaUI(detenerBackend) {
    if (detenerBackend) {
        if (piperQueueTimer) clearInterval(piperQueueTimer);
        isPlayingPiper = false;
        try { eel.detener_streaming_backend()(); } catch (e) {}
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    } else {
        detenerLectura(false);
    }
    if (window.activeAudioSources && window.activeAudioSources.length > 0) {
        window.activeAudioSources.forEach(s => { try { s.stop(); } catch (e) {} });
        window.activeAudioSources = [];
        if (!detenerBackend && synth) synth.cancel();
    }
}

async function _reaplicarSnapshotAjustes(packAjustes) {
    if (typeof datosPagina === 'undefined' || !datosPagina?.oraciones) return;
    const dictActual = dbDiccionario[seccionActual]?.terms || {};
    const filtrosActuales = {
        'chk-urls': packAjustes.omitirUrls,
        'chk-paren': packAjustes.omitirParen,
        'chk-corch': packAjustes.omitirCorch,
        'chk-llaves': packAjustes.omitirLlaves
    };
    console.log("📤 [JS -> PY] Enviando Snapshot con filtros reales:", filtrosActuales);
    const nuevasOraciones = await eel.reaplicar_filtros_desde_snapshot(dictActual, filtrosActuales)();
    if (nuevasOraciones) {
        datosPagina.oraciones = nuevasOraciones;
        console.log("⚡ Snapshot y Filtros aplicados con éxito.");
    }
}

function _reanudarLecturaTrasAjustes() {
    if (!leyendo || indiceOracion === -1) {
        window.palabraKaraoke = null;
        dibujar();
        return;
    }
    if (window.timerReanudacionFiltros) clearTimeout(window.timerReanudacionFiltros);
    window.timerReanudacionFiltros = setTimeout(() => {
        if (!leyendo) return;
        console.log("▶️ Reanudación tras cambio de filtros (Fase Sincronizada)");
        window.palabraKaraoke = null;
        dibujar();
        reproducirSecuencia(indiceOracion);
    }, 150);
}

async function aplicarCambiosLectura() {
    try {
        console.log("🔍 [AUDITORÍA] Iniciando recolección de datos para guardado masivo...");
        const packAjustes = _capturarPackAjustesLecturaUI();

        _detenerFuentesYColaLecturaUI(false);
        currentReadingSession += 10;
        window.currentReadingSession = currentReadingSession;
        window.seguirTextoActivo = packAjustes.seguirTexto;

        await eel.limpiar_pasteleria()();
        await _reaplicarSnapshotAjustes(packAjustes);
        await eel.guardar_ajustes_lectura(packAjustes)();

        const recorteGuardado = parseInt(document.getElementById('rng-recorte-pdf')?.value || 0);
        if (typeof aplicarRecorteDinamico === 'function') aplicarRecorteDinamico(recorteGuardado);
        dibujar();
        _reanudarLecturaTrasAjustes();
    } catch (e) {
        console.error("🔥 Error en el Hot Swap del Snapshot:", e);
    }
}

function cambiarValorInput(idSlider, delta) {
    let tipo = idSlider.split('-')[1];
    let input = document.getElementById(`num-${tipo}`);
    let slider = document.getElementById(`rng-${tipo}`);

    let valActual = parseFloat(input.value);
    let nuevoVal = valActual + delta;
    nuevoVal = Math.round(nuevoVal * 10) / 10;

    let min = parseFloat(input.min);
    let max = parseFloat(input.max);

    if (nuevoVal >= min && nuevoVal <= max) {
        input.value = nuevoVal;
        slider.value = nuevoVal;
        aplicarCambiosLectura();
    }
}

// Función antigua para mantener compatibilidad
function actConfig() { aplicarCambiosLectura(); }

// DICCIONARIO - FUNCIONES
function prepararEdicion(sigla) {
    // 1. Verificamos que la sección exista en nuestra RAM (dbDiccionario)
    if (!seccionActual || !dbDiccionario[seccionActual]) return;

    const data = dbDiccionario[seccionActual].terms[sigla];
    if (data) {
        // 2. Llenamos los inputs superiores de tu HTML
        document.getElementById('input-sigla').value = sigla;
        document.getElementById('input-significado').value = data.val;

        // 3. Llevamos el foco al significado para editar rápido
        document.getElementById('input-significado').focus();

        // 4. Feedback visual en la caja de agregar (opcional)
        const cajaAdd = document.querySelector('.add-termino-box');
        if (cajaAdd) {
            cajaAdd.style.border = "2px solid #f39c12";
            setTimeout(() => cajaAdd.style.border = "1px solid #f1c40f", 1000);
        }
    }
}

// DIBUJO E INTERACCIÓN (Versión Alineación Dinámica V5)
// Herramienta de Ingeniería: Conversor para transparencia dinámica
// Colócala fuera de la función dibujar para que esté disponible globalmente
function buscarEnPDF() {
    const menu = document.getElementById('menu-contextual');
    if (menu) menu.style.display = 'none';
    const panel = document.getElementById('panel-busqueda');
    if (panel) {
        panel.style.display = 'block';
        const input = document.getElementById('input-busqueda-pdf');
        if (input) {
            const palabra = window.palabraContextual || palabraHover;
            if (palabra && palabra.texto) {
                input.value = palabra.texto.trim();
                if (typeof ejecutarBusquedaPDF === 'function') {
                    ejecutarBusquedaPDF();
                }
            }
            input.focus();
            input.select();
        }
    }
}
window.buscarEnPDF = buscarEnPDF;
function _centroBBoxUI(bbox) {
    return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

function _puntoDentroDeRectsOracion(px, py, rects, tol) {
    if (!Array.isArray(rects)) return false;
    for (const r of rects) {
        if (r[0] === 0 && r[1] === 0 && r[2] === 0 && r[3] === 0) continue;
        if (px >= r[0] - tol && px <= r[2] + tol && py >= r[1] - tol && py <= r[3] + tol) return true;
    }
    return false;
}

function _oracionContienePalabraCercana(palabras, px, py) {
    if (!Array.isArray(palabras)) return false;
    return palabras.some(p => {
        if (!p.bbox) return false;
        const [bx, by] = _centroBBoxUI(p.bbox);
        return Math.abs(px - bx) <= 5 && Math.abs(py - by) <= 5;
    });
}

function buscarOracionPorGeometria(palabra) {
    if (!datosPagina?.oraciones || !palabra?.bbox) return -1;
    const [px, py] = _centroBBoxUI(palabra.bbox);

    const idxRect = datosPagina.oraciones.findIndex(o => _puntoDentroDeRectsOracion(px, py, o.rects, 2));
    if (idxRect !== -1) return idxRect;
    return datosPagina.oraciones.findIndex(o => _oracionContienePalabraCercana(o.palabras, px, py));
}

function obtenerPalabrasDeOracion(oracion) {
    if (!oracion || !datosPagina) return [];

    const palabrasBase = oracion._palabrasOriginales || oracion.palabras;
    if (Array.isArray(palabrasBase) && palabrasBase.length > 0) return [...palabrasBase];
    if (!oracion.rects || oracion.rects.length === 0) return [];

    return (datosPagina.palabras || []).filter(p => {
        const [px, py] = _centroBBoxUI(p.bbox);
        return _puntoDentroDeRectsOracion(px, py, oracion.rects, 5);
    });
}

function restaurarOracionesRecortadas() {
    if (typeof datosPagina === 'undefined' || !datosPagina || !Array.isArray(datosPagina.oraciones)) return;
    for (const orac of datosPagina.oraciones) {
        if (orac && orac._textoOriginal !== undefined) {
            orac.texto = orac._textoOriginal;
            delete orac._textoOriginal;
        }
        if (orac && orac._palabrasOriginales !== undefined) {
            orac.palabras = orac._palabrasOriginales;
            delete orac._palabrasOriginales;
        }
    }
}
window.restaurarOracionesRecortadas = restaurarOracionesRecortadas;

function _buscarIndicePalabraEnOracion(todasLasPalabras, palabraObj) {
    let idx = todasLasPalabras.indexOf(palabraObj);
    if (idx !== -1 || !palabraObj?.bbox) return idx === -1 ? 0 : idx;

    idx = todasLasPalabras.findIndex(p =>
        p.bbox && Math.abs(p.bbox[0] - palabraObj.bbox[0]) <= 4 && Math.abs(p.bbox[1] - palabraObj.bbox[1]) <= 4
    );
    if (idx !== -1) return idx;

    let bestIdx = 0;
    let bestDist = Infinity;
    const targetX = palabraObj.bbox[0];
    const targetY = (palabraObj.bbox[1] + palabraObj.bbox[3]) / 2;
    for (let k = 0; k < todasLasPalabras.length; k++) {
        const b = todasLasPalabras[k].bbox;
        if (!b) continue;
        const d = Math.abs(((b[1] + b[3]) / 2) - targetY) * 4 + Math.abs(b[0] - targetX);
        if (d < bestDist) { bestDist = d; bestIdx = k; }
    }
    return bestIdx;
}

function _inyectarYLanzarFragmentoOracion(idx, fragmentoTexto, visualesFinales) {
    const orac = datosPagina?.oraciones?.[idx];
    if (!orac) {
        hablarTexto(fragmentoTexto, () => { if (leyendo) reproducirSecuencia(idx + 1); }, visualesFinales, vozPredeterminada);
        return;
    }
    if (orac._textoOriginal === undefined) orac._textoOriginal = orac.texto;
    if (orac._palabrasOriginales === undefined) orac._palabrasOriginales = orac.palabras;
    orac.texto = fragmentoTexto;
    orac.palabras = visualesFinales;
    window._oracionRecortadaActivaIdx = idx;
    reproducirSecuencia(idx);
}

// --- FUNCIÓN DE LECTURA MANUAL (VERSIÓN INTEGRAL V23) ---
function empezarDesdePalabra(palabraObj) {
    restaurarOracionesRecortadas();
    window.palabraPausada = null;
    const idx = buscarOracionPorGeometria(palabraObj);
    if (idx === -1) return;

    _detenerFuentesYColaLecturaUI(true);
    currentReadingSession++;
    window.currentReadingSession = currentReadingSession;

    leyendo = true;
    indiceOracion = idx;
    oracionActiva = datosPagina.oraciones[idx];
    document.getElementById('texto-lectura').innerText = oracionActiva.texto;

    if (window.requestID_Karaoke) cancelAnimationFrame(window.requestID_Karaoke);
    window.ultimoMomentoInicioPiper = 0;
    window.progresoFraccional = 0;
    dibujar();

    const todasLasPalabras = obtenerPalabrasDeOracion(oracionActiva);
    const indicePalabra = _buscarIndicePalabraEnOracion(todasLasPalabras, palabraObj);
    const resultadoFiltrado = aplicarMascaraParentesis(todasLasPalabras.slice(indicePalabra));

    let visualesFinales = resultadoFiltrado.listaVisual;
    let fragmentoTexto = resultadoFiltrado.textoClean;
    if (!fragmentoTexto && oracionActiva.texto) {
        fragmentoTexto = oracionActiva.texto;
        visualesFinales = todasLasPalabras.length > 0 ? todasLasPalabras : (oracionActiva.palabras || []);
    }

    window.listaPalabrasActuales = visualesFinales;
    window.lastProcessedSID = -1;
    window.duracionAudioAcumulada = 0;
    window.nextScheduleTime = 0;
    _inyectarYLanzarFragmentoOracion(idx, fragmentoTexto, visualesFinales);
}


// ==========================================

// --- CONTROL DE AUDIO DE FONDO FLOTANTE ---
function toggleMediaFondoPlayPause() {
    if (typeof eel !== 'undefined' && eel.system_media_play_pause) {
        eel.system_media_play_pause()();

        // 1. Optimización visual inmediata (Sin esperar a Python)
        let svg = document.getElementById('icono-fondo-play');
        if (svg) {
            let actual = svg.innerHTML;
            if (actual.includes("M8 5")) {
                svg.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'; // Poner pausa
            } else {
                svg.innerHTML = '<path d="M8 5v14l11-7z"/>'; // Poner play
            }
        }

        // 2. Confirmación real poco después
        setTimeout(actualizarIconoMediaFondo, 500);
    }
}

async function actualizarIconoMediaFondo() {
    if (typeof eel !== 'undefined' && eel.system_media_status) {
        try {
            let isPlaying = await eel.system_media_status()();
            let svg = document.getElementById('icono-fondo-play');
            if (svg) {
                if (isPlaying) {
                    svg.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'; // Pause
                } else {
                    svg.innerHTML = '<path d="M8 5v14l11-7z"/>'; // Play
                }
            }
        } catch (e) { }
    }
}

setInterval(actualizarIconoMediaFondo, 2000);

function toggleOpcionesSegmentacion() {
    const usarBloques = document.getElementById('chk-usar-bloques').checked;
    document.getElementById('panel-segmentacion-manual').style.display = usarBloques ? 'none' : 'block';
    const barraMain = document.getElementById('barra-segmentacion-manual-main');
    if (barraMain) barraMain.style.display = usarBloques ? 'none' : 'inline-flex';
    const lblSangria = document.getElementById('lbl-sangria-main');
    if (lblSangria) lblSangria.style.display = usarBloques ? 'none' : 'inline-block';
}

window.limpiarCacheTraduccionFrontend = async function () {
    try {
        if (typeof eel !== 'undefined' && eel.limpiar_cache_traducciones) {
            const ok = await eel.limpiar_cache_traducciones()();
            if (ok) {
                await liraAlert("Caché de traducción eliminada con éxito (Memoria RAM y Disco).", 'borrar');
            } else {
                await liraAlert("No se pudo vaciar la caché.", 'advertencia');
            }
        } else {
            await liraAlert("Conexión con el backend no disponible.", 'advertencia');
        }
    } catch (e) {
        console.error("Error al limpiar caché:", e);
        await liraAlert("Solicitud de limpieza completada.", 'borrar');
    }
};

/**
 * Alterna el estado colapsado / expandido de la barra lateral izquierda en modo Old School.
 * @param {boolean} [colapsar] - Si se especifica, establece explícitamente el estado.
 */
window.toggleSidebarIzquierda = function (colapsar) {
    const sidebar = document.getElementById('sidebar-izquierda');
    const flecha = document.getElementById('icono-flecha-sidebar');
    if (!sidebar) return;

    const estaColapsado = colapsar !== undefined ? colapsar : !sidebar.classList.contains('colapsado');

    if (estaColapsado) {
        sidebar.classList.add('colapsado');
        if (flecha) flecha.style.transform = 'rotate(180deg)';
    } else {
        sidebar.classList.remove('colapsado');
        if (flecha) flecha.style.transform = 'rotate(0deg)';
    }
};

// Cursor de cruz al presionar Alt para dibujar cajas negras de exclusión
window.addEventListener('keydown', (e) => {
    if (e.key === 'Alt' && typeof canvas !== 'undefined' && canvas && !window.modoCuadroTextoActivo) {
        if (!window.creandoZonaExcluida && (!arrastre || !arrastre.tipo)) {
            canvas.style.cursor = 'crosshair';
        }
    }
});
window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt' && typeof canvas !== 'undefined' && canvas && !window.modoCuadroTextoActivo) {
        if (!window.creandoZonaExcluida && (!arrastre || !arrastre.tipo)) {
            if ((window.modoSubrayadorActivo || window.modoBorradorActivo) && typeof window.actualizarCursorSubrayador === 'function') {
                window.actualizarCursorSubrayador();
            } else {
                canvas.style.cursor = 'default';
            }
        }
    }
});




function toggleDarkMode(forzarActivo = null, guardar = true) {
    // 1. Oscurecer la Interfaz (UI)
    if (forzarActivo !== null) {
        if (forzarActivo) {
            document.body.classList.add("ui-dark-mode");
        } else {
            document.body.classList.remove("ui-dark-mode");
        }
    } else {
        document.body.classList.toggle("ui-dark-mode");
    }

    // 2. Oscurecer el lienzo del PDF
    const canvas = document.getElementById("lienzo-pdf");
    if(canvas) {
        if (forzarActivo !== null) {
            if (forzarActivo) canvas.classList.add("canvas-dark-mode");
            else canvas.classList.remove("canvas-dark-mode");
        } else {
            canvas.classList.toggle("canvas-dark-mode");
        }
    }
    
    // 3. Guardar ajuste en persistencia
    if (guardar && typeof guardarTodosAjustes === 'function') {
        guardarTodosAjustes();
    }
}

window.toggleDarkMode = toggleDarkMode;


function abrirLegalExterno(nombre_archivo, forzarExterno = false) {
    if (!forzarExterno && nombre_archivo === 'CREDITS.txt' && typeof abrirModalCreditos === 'function') {
        abrirModalCreditos();
        return;
    }
    if (typeof eel !== 'undefined' && eel.abrir_documento_legal) {
        eel.abrir_documento_legal(nombre_archivo)();
    } else {
        window.open(nombre_archivo, '_blank');
    }
}
