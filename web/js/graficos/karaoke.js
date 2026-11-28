/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// 4. LECTURA Y KARAOKE (VERSIÓN HÍBRIDA FINAL BLINDADA)
// ==========================================


window.modoSoloLecturaActivo = window.modoSoloLecturaActivo ?? false;

function notificarBloqueoSoloLectura() {
    const msg = (typeof window.t === 'function')
        ? window.t('msg-solo-lectura-activo', 'Modo Solo Lectura activo (sin voz).')
        : 'Modo Solo Lectura activo (sin voz).';
    if (typeof mostrarToastLira === 'function') {
        mostrarToastLira(msg);
    } else if (typeof actualizarEstado === 'function') {
        actualizarEstado(msg);
    }
}
window.notificarBloqueoSoloLectura = notificarBloqueoSoloLectura;

function _sincronizarUIBotonSoloLectura(nuevo) {
    const btn = document.getElementById('btn-solo-lectura');
    if (btn) {
        btn.classList.toggle('activo', nuevo);
        btn.setAttribute('aria-pressed', nuevo ? 'true' : 'false');
        const iconOn = btn.querySelector('.icon-voz-on');
        const iconOff = btn.querySelector('.icon-voz-off');
        if (iconOn) iconOn.style.display = nuevo ? 'none' : 'inline-block';
        if (iconOff) iconOff.style.display = nuevo ? 'inline-block' : 'none';
    }
    const boxLimites = document.getElementById('box-limites-toolbar');
    if (boxLimites) {
        boxLimites.style.opacity = nuevo ? '0.4' : '';
        boxLimites.style.pointerEvents = nuevo ? 'none' : '';
    }
    document.querySelectorAll('.linea-corte-v, .linea-limite-h, #capa-cortes-v, #capa-limites-h').forEach(el => {
        el.style.display = nuevo ? 'none' : '';
    });
}

function _puedeRecargarPaginaSoloLectura(silencioso) {
    return !silencioso && typeof rutaPDFActual !== 'undefined' && Boolean(rutaPDFActual)
        && typeof cargarPagina === 'function' && typeof paginaActual === 'number';
}

function _aplicarTransicionSoloLectura(nuevo, silencioso) {
    const capaKaraoke = document.getElementById('capa-karaoke');
    if (capaKaraoke) capaKaraoke.style.display = nuevo ? 'none' : '';

    if (nuevo) {
        if (typeof toggleCapturaCorte === 'function' && window.capturandoCorte) toggleCapturaCorte(false);
        if (typeof detenerLectura === 'function') detenerLectura(true);
        if (_puedeRecargarPaginaSoloLectura(silencioso)) cargarPagina(paginaActual);
        return;
    }
    if (typeof window.limpiarCapaTextoSoloLectura === 'function') window.limpiarCapaTextoSoloLectura();
    if (!silencioso && typeof dibujarCortesEnCanvas === 'function') dibujarCortesEnCanvas();
    if (_puedeRecargarPaginaSoloLectura(silencioso)) {
        if (typeof window.mostrarOverlayCargaAudio === 'function') window.mostrarOverlayCargaAudio(true);
        Promise.resolve(cargarPagina(paginaActual)).finally(() => {
            if (typeof window.mostrarOverlayCargaAudio === 'function') window.mostrarOverlayCargaAudio(false);
        });
    }
}

function toggleModoSoloLectura(activo, silencioso = false) {
    const nuevo = Boolean(activo);
    window.modoSoloLecturaActivo = nuevo;
    _sincronizarUIBotonSoloLectura(nuevo);
    _aplicarTransicionSoloLectura(nuevo, silencioso);
    if (!silencioso && nuevo) notificarBloqueoSoloLectura();
}
window.toggleModoSoloLectura = toggleModoSoloLectura;

function _resolverVelocidadLectura() {
    if (typeof velocidadLectura !== 'undefined') return velocidadLectura;
    const slider = document.getElementById('velocidad') || document.getElementById('rango-velocidad');
    return slider ? parseFloat(slider.value) : 1.0;
}

function _buscarPrimeraVozLocalEnSelect(sel) {
    if (!sel) return null;
    return Array.from(sel.options).find(o => {
        const vl = (o.value || '').toLowerCase();
        const tl = (o.text || '').toLowerCase();
        return !vl.includes('online') && !tl.includes('online') && !vl.includes('natural') && !tl.includes('natural')
            && (vl.startsWith('local-') || vl.includes('kokoro') || vl.endsWith('.onnx'));
    }) || null;
}

function _resolverVozSeguraParaLectura(vozForzada) {
    let vozFinal = vozForzada;
    if (!vozFinal && typeof vozIntencionUsuario !== 'undefined' && vozIntencionUsuario) vozFinal = vozIntencionUsuario;
    if (!vozFinal) vozFinal = document.getElementById('selector-voz-live')?.value || "";

    if (!window.modoPrivacidadEstricta) return vozFinal;
    const esOnline = typeof window.esVozOnlineRestringida === 'function'
        ? window.esVozOnlineRestringida(vozFinal)
        : /online|natural/i.test(vozFinal || '');
    if (!esOnline) return vozFinal;

    const sel = document.getElementById('selector-voz-live');
    const optSegura = _buscarPrimeraVozLocalEnSelect(sel);
    if (optSegura?.value) {
        vozFinal = optSegura.value;
        if (sel) sel.value = vozFinal;
        if (typeof vozIntencionUsuario !== 'undefined') vozIntencionUsuario = vozFinal;
        if (typeof vozPredeterminada !== 'undefined') vozPredeterminada = vozFinal;
    }
    return vozFinal;
}

function _asegurarAudioCtxParaLectura(esTransicionAutomatica) {
    if (!audioCtx) {
        try { initAudioContext(); } catch (e) { console.warn("AudioCtx init error", e); }
    } else if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    if (!esTransicionAutomatica || !audioCtx || !window.nextScheduleTime || window.nextScheduleTime < audioCtx.currentTime) {
        window.nextScheduleTime = audioCtx ? audioCtx.currentTime + 0.01 : 0;
    }
}

function _iniciarReproduccionPiperDiferida(texto, callback, vozForzada, esTransicionAutomatica) {
    const velFinal = _resolverVelocidadLectura();
    const vozFinal = _resolverVozSeguraParaLectura(vozForzada);

    if (!esTransicionAutomatica) detenerLectura(false);
    if (piperQueueTimer) clearInterval(piperQueueTimer);
    if (window.requestID_Karaoke) {
        cancelAnimationFrame(window.requestID_Karaoke);
        window.requestID_Karaoke = null;
    }
    window.partituraActual = null;
    isPlayingPiper = false;
    eel.detener_streaming_backend(false)();

    window.onPiperEndCallback = callback;
    _asegurarAudioCtxParaLectura(esTransicionAutomatica);

    const teatroActivoBackend = Boolean(document.getElementById('chk-teatro-global')?.checked);
    const obraActivaBackend = window.obraActualTeatro || "General";
    if (typeof eel !== 'undefined' && eel.backend_trigger_duck) eel.backend_trigger_duck()();

    isPlayingPiper = true;
    window.colaEsperaPalabras = [];
    const idiomaFiltroActual = document.getElementById('filtro-idioma')?.value || '';
    eel.iniciar_streaming_hibrido(
        texto, vozFinal, velFinal, window.currentReadingSession,
        teatroActivoBackend, obraActivaBackend, idiomaFiltroActual
    );
    piperQueueTimer = setInterval(cicloConsumoPiper, 15);
    window.piperSetupTimeout = null;
}

function _resetearEstadoVisualHablar(listaPalabrasVisuales, esTransicionAutomatica) {
    window._karaokeAlignState = { cursorIdx: 0, charOffset: 0, lastPIdx: -1, cachedResult: null };
    if (typeof currentReadingSession === 'undefined' || isNaN(currentReadingSession)) currentReadingSession = 0;
    currentReadingSession++;
    window.currentReadingSession = currentReadingSession;

    if (typeof detenerAudioTutorial === 'function') detenerAudioTutorial();
    leyendo = true;
    if (typeof actualizarBotonPlayPause === 'function') actualizarBotonPlayPause(true);
    if (!esTransicionAutomatica) window.nextScheduleTime = 0;
    window.piperJsCompensacion = 1.0;

    readingSessionID++;
    if (window.requestID_Karaoke) { cancelAnimationFrame(window.requestID_Karaoke); window.requestID_Karaoke = null; }
    window.partituraActual = null;
    window.progresoFraccional = 0;
    window.palabraKaraoke = (Array.isArray(listaPalabrasVisuales) && listaPalabrasVisuales.length > 0) ? listaPalabrasVisuales[0] : null;
    dibujar();
}

async function hablarTexto(texto, callback, listaPalabrasVisuales = null, vozForzada = null, esTransicionAutomatica = false) {
    if (window.modoSoloLecturaActivo) {
        if (!esTransicionAutomatica) notificarBloqueoSoloLectura();
        return;
    }
    if (window.piperSetupTimeout) { clearTimeout(window.piperSetupTimeout); window.piperSetupTimeout = null; }

    _resetearEstadoVisualHablar(listaPalabrasVisuales, esTransicionAutomatica);
    const textoLimpio = String(texto || "").trim();
    if (!textoLimpio) { if (callback) callback(); return; }

    const lanzar = () => _iniciarReproduccionPiperDiferida(texto || "", callback, vozForzada, esTransicionAutomatica);
    if (esTransicionAutomatica) lanzar();
    else window.piperSetupTimeout = setTimeout(lanzar, 50);
}





// ==========================================
// PIPELINE DE TRADUCCIÓN OPTIMIZADA EN RAM (0ms)
// ==========================================
window.cacheTraduccionesJS = window.cacheTraduccionesJS || new Map();
window.promesasTraduccionJS = window.promesasTraduccionJS || new Map();

/**
 * Obtiene la traducción de un texto de forma inmediata desde memoria si ya existe,
 * o reutiliza la promesa en curso, evitando peticiones duplicadas y eliminando
 * el tiempo de espera entre oraciones.
 */
function obtenerTraduccionOptimizada(texto, origen, destino, motor) {
    if (!texto || typeof texto !== 'string' || !texto.trim()) {
        return Promise.resolve({ texto_traducido: "" });
    }
    const txtLimpio = texto.trim();
    const key = `${origen}-->${destino}::${motor}::${txtLimpio}`;

    // 1. Memoria RAM de JavaScript (0 ms)
    if (window.cacheTraduccionesJS.has(key)) {
        return Promise.resolve(window.cacheTraduccionesJS.get(key));
    }

    // 2. Si ya hay una solicitud en vuelo para este mismo texto, reutilizarla
    if (window.promesasTraduccionJS.has(key)) {
        return window.promesasTraduccionJS.get(key);
    }

    // 3. Si no existe, invocar al backend y cachear
    if (typeof eel === 'undefined' || typeof eel.traducir_texto_backend !== 'function') {
        return Promise.resolve({ texto_traducido: texto });
    }

    const promesa = eel.traducir_texto_backend(txtLimpio, origen, destino, motor)().then(res => {
        window.promesasTraduccionJS.delete(key);
        if (res && (res.texto_traducido || res.traducido)) {
            window.cacheTraduccionesJS.set(key, res);
        }
        return res;
    }).catch(err => {
        window.promesasTraduccionJS.delete(key);
        console.warn("⚠️ Error en traducción optimizada:", err);
        return { texto_traducido: texto };
    });

    window.promesasTraduccionJS.set(key, promesa);
    return promesa;
}

/*
 * TITULO: DIRECTOR DE ORQUESTA (Blindado V5.0)
 * Diagnóstico: Protegido contra nulos y tipos incorrectos.
 */
function _manejarFinDePaginaLectura() {
    detenerLectura();
    const chkAuto = document.getElementById('chk-auto-avance');
    if (!window.tutorialActivo && chkAuto?.checked && datosPagina.oraciones.length > 0) {
        if (window.timerAutoAvance) clearTimeout(window.timerAutoAvance);
        window.autoContinuarLectura = true;
        window.timerAutoAvance = setTimeout(() => cambiarPagina(1), 500);
    }
}

function _calcularLimitesHorno(vozActual, traduccionActiva) {
    if (traduccionActiva) return { limitePalabras: 150, limiteOraciones: 3 };
    if (vozActual.includes("pocket") || vozActual.includes("kokoro")) return { limitePalabras: 80, limiteOraciones: 2 };
    const isLocal = vozActual.startsWith("Local-");
    return { limitePalabras: isLocal ? 1500 : 1200, limiteOraciones: isLocal ? 35 : 28 };
}

function _alimentarHornoOracionFutura(textoFuturo, vozActual, tradCfg) {
    const idiomaFiltro = document.getElementById('filtro-idioma')?.value || '';
    if (!tradCfg.activa || typeof eel.traducir_texto_backend !== 'function') {
        eel.prender_horno_para_siguiente(textoFuturo, vozActual, velocidadLectura, idiomaFiltro);
        return;
    }
    obtenerTraduccionOptimizada(textoFuturo, tradCfg.origen, tradCfg.destino, tradCfg.motor).then(res => {
        if (!leyendo) return;
        const txtTrad = res?.texto_traducido || res?.traducido || textoFuturo;
        const objetivo = tradCfg.modo === 'solo_traduccion' ? txtTrad : textoFuturo;
        eel.prender_horno_para_siguiente(objetivo, vozActual, velocidadLectura, idiomaFiltro);
    }).catch(() => {
        eel.prender_horno_para_siguiente(textoFuturo, vozActual, velocidadLectura, idiomaFiltro);
    });
}

function _programarHornoProactivo(idx, vozActual, tradCfg) {
    if (!vozActual) return;
    const { limitePalabras, limiteOraciones } = _calcularLimitesHorno(vozActual, tradCfg.activa);
    setTimeout(() => {
        let palabrasEnHorno = 0;
        for (let i = 1; i < limiteOraciones; i++) {
            const oracionFutura = datosPagina.oraciones[idx + i];
            if (!oracionFutura) break;
            let textoFuturo = String(oracionFutura.texto || "");
            if (oracionFutura.palabras?.length > 0) {
                const resF = aplicarMascaraParentesis(oracionFutura.palabras);
                if (resF.textoClean) textoFuturo = resF.textoClean;
            }
            if (!textoFuturo.trim()) continue;
            if (palabrasEnHorno >= limitePalabras) break;
            _alimentarHornoOracionFutura(textoFuturo, vozActual, tradCfg);
            palabrasEnHorno += textoFuturo.split(' ').length;
        }
    }, 30);
}

function _aplicarAutoScrollOracion(idx) {
    const chkSeguir = document.getElementById('chk-seguimiento');
    if (!chkSeguir?.checked || !oracionActiva?.rects?.length || idx >= datosPagina.oraciones.length - 1) return;
    try {
        const yPos = oracionActiva.rects[0][1] * datosPagina.factor_zoom;
        const visor = document.getElementById('visor-container');
        if (visor) visor.scrollTo({ top: yPos - (visor.clientHeight / 3), behavior: 'smooth' });
    } catch (e) { console.warn("Error en scroll:", e); }
}

function _mostrarSubtituloSiCorresponde(res, idxCapturado, tradCfg) {
    const txt = res?.texto_traducido || res?.traducido;
    if (txt && leyendo && indiceOracion === idxCapturado && typeof mostrarSubtituloTraduccion === 'function') {
        mostrarSubtituloTraduccion(txt, res?.origen_detectado || tradCfg.origen, tradCfg.destino);
    }
}

async function _reproducirModoSoloTraduccion(idx, textoClean, vozActual, tradCfg, esAutomatico) {
    try {
        const res = await obtenerTraduccionOptimizada(textoClean, tradCfg.origen, tradCfg.destino, tradCfg.motor);
        if (!leyendo) return true;
        const textoTraducido = res?.texto_traducido || res?.traducido || textoClean;
        window.subtituloEsAudioDirecto = true;
        if (typeof mostrarSubtituloTraduccion === 'function') {
            mostrarSubtituloTraduccion(textoTraducido, res?.origen_detectado || tradCfg.origen, tradCfg.destino);
        }
        hablarTexto(textoTraducido, () => { if (leyendo) reproducirSecuencia(idx + 1, true); }, window.listaPalabrasActuales, vozActual, esAutomatico);
        return true;
    } catch (err) {
        console.error("🔥 Error al traducir:", err);
        return false;
    }
}

function _reproducirModoAprendizajeDual(idx, textoParaAudio, textoClean, vozActual, tradCfg) {
    const promesaTraduccion = obtenerTraduccionOptimizada(textoClean, tradCfg.origen, tradCfg.destino, tradCfg.motor);
    window.subtituloEsAudioDirecto = false;

    hablarTexto(textoParaAudio, async () => {
        if (!leyendo) return;
        try {
            const res = await promesaTraduccion;
            const textoTraducido = res?.texto_traducido || res?.traducido || "";
            if (textoTraducido && leyendo) {
                window.subtituloEsAudioDirecto = true;
                if (typeof mostrarSubtituloTraduccion === 'function') {
                    mostrarSubtituloTraduccion(textoTraducido, res?.origen_detectado || tradCfg.origen, tradCfg.destino);
                }
                setTimeout(() => {
                    if (!leyendo) return;
                    hablarTexto(textoTraducido, () => {
                        if (leyendo) setTimeout(() => reproducirSecuencia(idx + 1), textoTraducido.length < 3 ? 50 : pausaPunto);
                    }, null, vozActual);
                }, Math.max(300, pausaPunto / 2));
                return;
            }
        } catch (e) { console.warn("Error en aprendizaje dual:", e); }
        if (leyendo) setTimeout(() => reproducirSecuencia(idx + 1), pausaPunto);
    }, window.listaPalabrasActuales, vozActual);

    promesaTraduccion.then(res => _mostrarSubtituloSiCorresponde(res, idx, tradCfg)).catch(() => {});
}

function _leerConfigTraduccionSecuencia() {
    return {
        activa: document.getElementById('chk-traduccion-activa')?.checked ?? false,
        origen: document.getElementById('sel-traduccion-origen')?.value || 'auto',
        destino: document.getElementById('sel-traduccion-destino')?.value || 'es',
        motor: document.getElementById('sel-traduccion-motor')?.value || 'online',
        modo: document.getElementById('sel-traduccion-modo')?.value || 'solo_traduccion',
    };
}

function _prepararOracionActualSecuencia(idx) {
    if (window._oracionRecortadaActivaIdx !== undefined && window._oracionRecortadaActivaIdx !== -1 && window._oracionRecortadaActivaIdx !== idx) {
        if (typeof window.restaurarOracionesRecortadas === 'function') window.restaurarOracionesRecortadas();
        window._oracionRecortadaActivaIdx = -1;
    }
    indiceOracion = idx;
    oracionActiva = datosPagina.oraciones[idx];
    if (window.requestID_Karaoke) { cancelAnimationFrame(window.requestID_Karaoke); window.requestID_Karaoke = null; }
    window.partituraActual = null;
    window.progresoFraccional = 0;
    window.palabraKaraoke = null;
}

function _prepararPalabrasVisualesSecuencia(oracion) {
    const textoParaAudio = String(oracion.texto || "");
    const resultado = aplicarMascaraParentesis(oracion.palabras || []);
    window.listaPalabrasActuales = resultado.listaVisual;
    if (window.listaPalabrasActuales.length > 0) {
        window.listaPalabrasActuales.forEach(p => { p.yaLeida = false; });
        window.palabraKaraoke = window.listaPalabrasActuales[0];
        dibujar();
    }
    return { textoParaAudio, textoClean: resultado.textoClean || textoParaAudio };
}

async function _despacharTraduccionSecuencia(idx, textoParaAudio, textoClean, vozActual, tradCfg, esAutomatico) {
    if (!tradCfg.activa || typeof eel === 'undefined' || typeof eel.traducir_texto_backend !== 'function') {
        return false;
    }
    if (tradCfg.modo === 'solo_traduccion') {
        return await _reproducirModoSoloTraduccion(idx, textoClean, vozActual, tradCfg, esAutomatico);
    }
    if (tradCfg.modo === 'aprendizaje') {
        _reproducirModoAprendizajeDual(idx, textoParaAudio, textoClean, vozActual, tradCfg);
        return true;
    }
    window.subtituloEsAudioDirecto = false;
    obtenerTraduccionOptimizada(textoClean, tradCfg.origen, tradCfg.destino, tradCfg.motor)
        .then(res => _mostrarSubtituloSiCorresponde(res, idx, tradCfg))
        .catch(e => console.warn("Error en subtítulo:", e));
    return false;
}

async function reproducirSecuencia(idx, esAutomatico = false) {
    if (!leyendo || !datosPagina?.oraciones) { detenerLectura(); return; }
    if (idx < 0 || idx >= datosPagina.oraciones.length) { _manejarFinDePaginaLectura(); return; }

    _prepararOracionActualSecuencia(idx);
    if (!oracionActiva) { setTimeout(() => reproducirSecuencia(idx + 1), 10); return; }

    const { textoParaAudio, textoClean } = _prepararPalabrasVisualesSecuencia(oracionActiva);
    if (window.listaPalabrasActuales.length === 0 && !textoParaAudio.trim()) {
        setTimeout(() => reproducirSecuencia(idx + 1), 10);
        return;
    }

    const vozActual = window.vozActivaSnapshot || vozPredeterminada || document.getElementById('selector-voz-live')?.value || "";
    const tradCfg = _leerConfigTraduccionSecuencia();
    _programarHornoProactivo(idx, vozActual, tradCfg);

    const cajaTexto = document.getElementById('texto-lectura');
    if (cajaTexto) cajaTexto.innerText = textoParaAudio;
    dibujar();
    _aplicarAutoScrollOracion(idx);

    window.contadorPalabrasOracion = 0;
    window.colaEsperaPalabras = [];
    window.duracionAudioAcumulada = 0;

    if (await _despacharTraduccionSecuencia(idx, textoParaAudio, textoClean, vozActual, tradCfg, esAutomatico)) return;

    window.subtituloEsAudioDirecto = false;
    hablarTexto(textoParaAudio, () => { if (leyendo) reproducirSecuencia(idx + 1, true); }, window.listaPalabrasActuales, vozActual, esAutomatico);
}



function togglePlayPause() {
    if (leyendo) {
        pausarLectura();
    } else {
        iniciarLectura();
    }
}

function actualizarBotonPlayPause(isLeyendo) {
    const btnPlay = document.getElementById('btn-play');
    if (!btnPlay) return;
    if (isLeyendo) {
        btnPlay.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20" class="svg-icon"><g stroke-width="0"></g><g stroke-linecap="round" stroke-linejoin="round"></g><g> <path d="M15 6C15 6 15.5 9 15.5 12C15.5 15 15 18 15 18M9 6C9 6 8.5 9 8.5 12C8.5 15 9 18 9 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path> </g></svg>`;
        btnPlay.title = "Pausa";
    } else {
        btnPlay.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20" class="svg-icon"><g stroke-width="0"></g><g stroke-linecap="round" stroke-linejoin="round"></g><g> <path d="M21.4086 9.35258C23.5305 10.5065 23.5305 13.4935 21.4086 14.6474L8.59662 21.6145C6.53435 22.736 4 21.2763 4 18.9671L4 5.0329C4 2.72368 6.53435 1.26402 8.59661 2.38548L21.4086 9.35258Z" fill="currentColor"></path> </g></svg>`;
        btnPlay.title = "Leer";
    }
}

function toggleLectura() {
    togglePlayPause();
}

async function iniciarLectura() {
    if (window.modoSoloLecturaActivo) { notificarBloqueoSoloLectura(); return; }
    if (leyendo) return;
    if (typeof bloqueoCambioPagina !== 'undefined' && bloqueoCambioPagina && window._promesaCargaPaginaActual) {
        try { await window._promesaCargaPaginaActual; } catch (e) {}
    }
    if (leyendo || !datosPagina?.oraciones?.length) return;
    if (typeof eel !== 'undefined' && eel.backend_trigger_duck) eel.backend_trigger_duck()();
    leyendo = true;
    actualizarBotonPlayPause(true);

    if (window.palabraPausada && typeof empezarDesdePalabra === 'function') {
        const palabraReanudar = window.palabraPausada;
        window.palabraPausada = null;
        empezarDesdePalabra(palabraReanudar);
    } else {
        if (indiceOracion === -1) indiceOracion = 0;
        reproducirSecuencia(indiceOracion);
    }
}

function pausarLectura() {
    if (leyendo) {
        if (typeof eel !== 'undefined' && eel.backend_trigger_unduck) {
            eel.backend_trigger_unduck()();
        }
        leyendo = false;
        actualizarBotonPlayPause(false);

        // Guardamos la palabra exacta donde nos quedamos antes de destruir el audio
        if (window.listaPalabrasActuales && window.ultimoIdxAudio !== undefined && window.ultimoIdxAudio >= 0) {
            window.palabraPausada = window.listaPalabrasActuales[window.ultimoIdxAudio];
        }

        // Detención clásica y segura (Evita audios fantasma)
        detenerLectura(false); // Falso para no limpiar la UI
    }
}

function limpiarTexto(texto) {
    return texto.trim();
}

function _limpiarTimersKaraoke() {
    if (piperQueueTimer) clearInterval(piperQueueTimer);
    if (window.requestID_Karaoke) {
        cancelAnimationFrame(window.requestID_Karaoke);
        window.requestID_Karaoke = null;
    }
    window.partituraActual = null;
}

function _limpiarUILecturaTotal() {
    if (typeof window.restaurarOracionesRecortadas === 'function') window.restaurarOracionesRecortadas();
    window._oracionRecortadaActivaIdx = -1;
    actualizarBotonPlayPause(false);
    window.palabraPausada = null;
    oracionActiva = null;
    palabraKaraoke = null;
    if (typeof limpiarSubtitulosTraduccion === 'function') limpiarSubtitulosTraduccion();
    if (window.promesasTraduccionJS) window.promesasTraduccionJS.clear();
    dibujar();
}

function _detenerFuentesAudioActivas(suspenderCtx) {
    if (window.activeAudioSources?.length > 0) {
        window.activeAudioSources.forEach(src => { try { src.stop(); } catch (e) {} });
        window.activeAudioSources = [];
    }
    if (suspenderCtx && audioCtx && audioCtx.state !== 'closed') {
        try { audioCtx.suspend(); } catch (e) {}
        window.nextScheduleTime = 0;
    }
}

function detenerLectura(resetUI = true) {
    if (window.timerAutoAvance) { clearTimeout(window.timerAutoAvance); window.timerAutoAvance = null; }
    if (resetUI === false && leyendo === true) { _limpiarTimersKaraoke(); return; }

    if (leyendo && typeof eel !== 'undefined' && eel.backend_trigger_unduck) eel.backend_trigger_unduck()();
    leyendo = false;
    isPlayingPiper = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    _limpiarTimersKaraoke();
    _detenerFuentesAudioActivas(resetUI);
    try { eel.detener_streaming_backend()(); } catch (e) {}
    if (resetUI) _limpiarUILecturaTotal();
}

function _normUnicodeKaraoke(t) {
    return String(t || "").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, '');
}

function _buscarPalabraKaraokeCJK(tokNorm, listaPalabras, st) {
    const startIdx = Math.max(0, Math.min(st.cursorIdx, listaPalabras.length - 1));
    const maxLook = Math.min(listaPalabras.length - 1, startIdx + 3);
    for (let i = startIdx; i <= maxLook; i++) {
        const bloque = listaPalabras[i];
        const blockNorm = _normUnicodeKaraoke(bloque?.texto || "");
        if (!blockNorm) continue;
        const pos = blockNorm.indexOf(tokNorm, i === startIdx ? st.charOffset : 0);
        if (pos === -1) continue;
        const endPos = pos + tokNorm.length;
        const res = blockNorm.length > tokNorm.length
            ? Object.assign({}, bloque, { _cjkSlice: { startFrac: pos / blockNorm.length, endFrac: Math.min(1, endPos / blockNorm.length) } })
            : bloque;
        st.cursorIdx = endPos >= blockNorm.length ? i + 1 : i;
        st.charOffset = endPos >= blockNorm.length ? 0 : endPos;
        return res;
    }
    return null;
}

function _buscarPalabraKaraokeLatina(tokNorm, listaPalabras, st) {
    const startIdx = Math.max(0, Math.min(st.cursorIdx, listaPalabras.length - 1));
    const maxLook = Math.min(listaPalabras.length - 1, startIdx + 3);
    for (let i = startIdx; i <= maxLook; i++) {
        const palNorm = _normUnicodeKaraoke(listaPalabras[i]?.texto || "");
        if (!palNorm) continue;
        if (palNorm === tokNorm || palNorm.includes(tokNorm) || tokNorm.includes(palNorm)) {
            st.cursorIdx = i + 1;
            st.charOffset = 0;
            return listaPalabras[i];
        }
    }
    return null;
}

function _obtenerEstadoAlineacionKaraoke() {
    if (!window._karaokeAlignState) {
        window._karaokeAlignState = { cursorIdx: 0, charOffset: 0, lastPIdx: -1, cachedResult: null };
    }
    return window._karaokeAlignState;
}

window.resolverPalabraKaraoke = function(pAudio, listaPalabras, pIdx = -1) {
    if (!pAudio || !Array.isArray(listaPalabras) || listaPalabras.length === 0) return null;
    const st = _obtenerEstadoAlineacionKaraoke();
    if (pIdx !== -1 && pIdx === st.lastPIdx && st.cachedResult) return st.cachedResult;

    const tokNorm = _normUnicodeKaraoke(pAudio.w || "");
    let resultado = (typeof pAudio.vIdx === 'number') ? (listaPalabras[pAudio.vIdx] || null) : null;

    if (tokNorm) {
        const esCjk = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(tokNorm);
        const match = esCjk ? _buscarPalabraKaraokeCJK(tokNorm, listaPalabras, st) : _buscarPalabraKaraokeLatina(tokNorm, listaPalabras, st);
        if (match) resultado = match;
    }
    if (pIdx !== -1) { st.lastPIdx = pIdx; st.cachedResult = resultado; }
    return resultado;
};

function copiarTexto() {
    const palabra = window.palabraContextual || palabraHover;
    if (palabra && palabra.texto) {
        navigator.clipboard.writeText(palabra.texto);
    }
    const menu = document.getElementById('menu-contextual');
    if (menu) menu.style.display = 'none';
}













// ==========================================