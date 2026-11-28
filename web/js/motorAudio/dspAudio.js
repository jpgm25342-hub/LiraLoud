/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// ==========================================

// Guardianes interactivos para prevenir activar opciones online mientras Privacidad está activa
function validarCambioMotorTraduccion(selectEl) {
    if (window.modoPrivacidadEstricta && (selectEl.value === 'online' || selectEl.value === 'hibrido')) {
        selectEl.value = 'offline';
        return false;
    }
    if (typeof guardarTodosAjustes === 'function') guardarTodosAjustes(false);
    return true;
}
window.validarCambioMotorTraduccion = validarCambioMotorTraduccion;

function actualizarVisibilidadPrecargaHojas() {
    const chk = document.getElementById('chk-pretraducir-paginas');
    const panel = document.getElementById('panel-precarga-hojas');
    if (!panel) return;
    panel.style.display = (chk && chk.checked) ? 'block' : 'none';
}
window.actualizarVisibilidadPrecargaHojas = actualizarVisibilidadPrecargaHojas;

function validarPretraduccionRed(checkboxEl) {
    if (window.modoPrivacidadEstricta && checkboxEl.checked) {
        checkboxEl.checked = false;
        actualizarVisibilidadPrecargaHojas();
        return false;
    }
    actualizarVisibilidadPrecargaHojas();
    if (typeof guardarTodosAjustes === 'function') guardarTodosAjustes();
    if (typeof dispararPretraduccionEntorno === 'function') dispararPretraduccionEntorno();
    return true;
}
window.validarPretraduccionRed = validarPretraduccionRed;

function validarProveedorIA(selectEl) {
    if (window.modoPrivacidadEstricta && selectEl.value !== 'ollama') {
        selectEl.value = 'ollama';
        if (typeof cambiarProveedorIA === 'function') cambiarProveedorIA('ollama');
        return false;
    }
    if (typeof cambiarProveedorIA === 'function') cambiarProveedorIA(selectEl.value);
    if (typeof guardarTodosAjustes === 'function') guardarTodosAjustes(false);
    return true;
}
window.validarProveedorIA = validarProveedorIA;

// 8. MOTOR PIPER "GAPLESS DJ" (Fluido y Continuo)
// Reemplaza todo el bloque final de audio con esto
// ==========================================

function initAudioContext() {
    if (!audioCtx || audioCtx.state === 'closed') {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}


function _calcularDelayFinFrasePiper() {
    const tiempoRestante = (audioCtx && window.nextScheduleTime > audioCtx.currentTime)
        ? (window.nextScheduleTime - audioCtx.currentTime) * 1000
        : 0;
    const haySiguiente = (
        typeof datosPagina !== 'undefined' &&
        Array.isArray(datosPagina?.oraciones) &&
        typeof indiceOracion === 'number' &&
        (indiceOracion + 1) < datosPagina.oraciones.length
    );
    return haySiguiente
        ? Math.max(0, tiempoRestante - ((tiempoRestante > 80) ? 280 : 0))
        : (tiempoRestante > 0 ? tiempoRestante + 40 : 0);
}

function _manejarFinFrasePiper() {
    const sesionAlLlegarFin = window.currentReadingSession;
    const pausaExtra = (typeof pausaPunto !== 'undefined' && pausaPunto > 0) ? pausaPunto : 0;

    setTimeout(() => {
        if (window.currentReadingSession !== sesionAlLlegarFin) return;
        isPlayingPiper = false;
        if (window.onPiperEndCallback && leyendo) {
            if (pausaExtra > 0 && window.nextScheduleTime > 0) {
                window.nextScheduleTime += (pausaExtra / 1000);
            }
            window.onPiperEndCallback();
        }
    }, _calcularDelayFinFrasePiper());

    clearInterval(piperQueueTimer);
}

function _enrutarPaquetePiper(paquete) {
    if (!paquete) return;
    if (paquete.sid !== undefined && paquete.sid !== window.currentReadingSession) return;

    const tipo = paquete.t || paquete;
    if (tipo === "lyrics") {
        if (paquete.sid >= window.currentReadingSession) {
            window.partituraActual = paquete.data;
            console.log(`🎼 [PARTITURA] Sincronizada: ${paquete.data.length} elementos.`);
        }
    } else if (tipo === "a") {
        if (paquete.d) procesarAudioRaw(paquete.d, paquete.sid);
    } else if (tipo === "meta") {
        window.piperSampleRate = paquete.sr;
    } else if (tipo === "fin" || tipo === "FIN") {
        _manejarFinFrasePiper();
    }
}

function cicloConsumoPiper() {
    if (!isPlayingPiper) return;
    try {
        const promesa = eel.obtener_chunk_audio()();
        if (!promesa || typeof promesa.then !== 'function') return;
        promesa.then(_enrutarPaquetePiper).catch(() => {
            console.warn("🔌 [ADUANA] Micro-corte en transporte (normal en cambios rápidos).");
            isPlayingPiper = false;
        });
    } catch (e) {
        console.error("🔥 [ADUANA] Error crítico:", e);
        isPlayingPiper = false;
    }
}

// ==========================================
// PROCESADOR DE AUDIO "STUDIO MODE" + "FASE CERO"
// (Limpia el ruido, da cuerpo y sincroniza al milisegundo)
// ==========================================

// Control de visibilidad del panel ecualizador personalizado
function actualizarVisibilidadEqPiperPersonalizado() {
    const sel = document.getElementById('sel-eq-piper-perfil');
    const panel = document.getElementById('panel-eq-piper-personalizado');
    if (!sel || !panel) return;
    panel.style.display = (sel.value === 'personalizado') ? 'block' : 'none';
}
window.actualizarVisibilidadEqPiperPersonalizado = actualizarVisibilidadEqPiperPersonalizado;

// Variable global para rastrear cambios de oración
window.lastProcessedSID = -1;

const _PERFILES_DSP_KOKORO = {
    cristalino: {
        filtros: [
            { type: 'peaking', frequency: 4800, gain: 2.2, Q: 0.8 },
            { type: 'lowpass', frequency: 11500, Q: 0.6 }
        ],
        comp: { threshold: -12, knee: 16, ratio: 2.0 }
    },
    radio: {
        filtros: [{ type: 'peaking', frequency: 180, gain: 2.8, Q: 1.0 }],
        comp: { threshold: -14, knee: 18, ratio: 2.5 }
    },
    estudio: {
        filtros: [
            { type: 'peaking', frequency: 300, gain: 1.8, Q: 0.9 },
            { type: 'peaking', frequency: 4200, gain: -1.8, Q: 1.1 },
            { type: 'lowpass', frequency: 10500, Q: 0.6 }
        ],
        comp: { threshold: -12, knee: 16, ratio: 2.2, attack: 0.01, release: 0.25 }
    }
};

const _PERFILES_DSP_PIPER = {
    anti_siseo: {
        filtros: [{ type: 'lowpass', frequency: 5000, Q: 0.9 }],
        comp: { threshold: -16, knee: 12, ratio: 3.0, attack: 0.005, release: 0.2 }
    },
    cristalino: {
        filtros: [
            { type: 'peaking', frequency: 3600, gain: 2.5, Q: 1.0 },
            { type: 'lowpass', frequency: 9200, Q: 0.6 }
        ],
        comp: { threshold: -14, knee: 14, ratio: 2.2, attack: 0.005, release: 0.2 }
    },
    radio: {
        filtros: [
            { type: 'peaking', frequency: 180, gain: 3.5, Q: 0.9 },
            { type: 'lowpass', frequency: 6500, Q: 0.8 }
        ],
        comp: { threshold: -18, knee: 10, ratio: 4.0, attack: 0.005, release: 0.25 }
    },
    estudio: {
        filtros: [
            { type: 'peaking', frequency: 250, gain: 2.0, Q: 1.0 },
            { type: 'peaking', frequency: 3800, gain: -2.5, Q: 1.2 },
            { type: 'lowpass', frequency: 7500, Q: 0.7 }
        ],
        comp: { threshold: -15, knee: 12, ratio: 2.8, attack: 0.005, release: 0.25 }
    }
};

function _conectarCadenaDSP(source, perfil, destino) {
    let nodoActual = source;
    for (const f of perfil.filtros) {
        const filtro = audioCtx.createBiquadFilter();
        filtro.type = f.type;
        filtro.frequency.value = f.frequency;
        if (f.gain !== undefined) filtro.gain.value = f.gain;
        if (f.Q !== undefined) filtro.Q.value = f.Q;
        nodoActual.connect(filtro);
        nodoActual = filtro;
    }
    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = perfil.comp.threshold;
    comp.knee.value = perfil.comp.knee;
    comp.ratio.value = perfil.comp.ratio;
    if (perfil.comp.attack !== undefined) comp.attack.value = perfil.comp.attack;
    if (perfil.comp.release !== undefined) comp.release.value = perfil.comp.release;
    nodoActual.connect(comp);
    comp.connect(destino);
}

function _construirPerfilPiperPersonalizado() {
    const bandas = [
        { id: 'rng-eq-piper-graves', frequency: 200, Q: 0.9 },
        { id: 'rng-eq-piper-medios', frequency: 3000, Q: 1.0 },
        { id: 'rng-eq-piper-agudos', frequency: 6000, Q: 1.0 }
    ];
    const filtros = [];
    for (const b of bandas) {
        const gain = parseFloat(document.getElementById(b.id)?.value || 0);
        if (Math.abs(gain) > 0.1) filtros.push({ type: 'peaking', frequency: b.frequency, gain, Q: b.Q });
    }
    const fCorte = parseFloat(document.getElementById('rng-eq-piper-corte')?.value || 8000);
    if (fCorte < 13500) filtros.push({ type: 'lowpass', frequency: fCorte, Q: 0.7 });
    return { filtros, comp: { threshold: -15, knee: 12, ratio: 2.5, attack: 0.005, release: 0.25 } };
}

function _conectarFuenteAudioConDSP(source, destino) {
    const vozActualId = window.vozActivaSnapshot || (document.getElementById('selector-voz-live')?.value) || "";
    if (vozActualId.includes("kokoro")) {
        const perfilEqVoz = window.cachePerfilesEqKokoro?.[vozActualId] || 'estudio';
        if (perfilEqVoz === 'natural') { source.connect(destino); return; }
        _conectarCadenaDSP(source, _PERFILES_DSP_KOKORO[perfilEqVoz] || _PERFILES_DSP_KOKORO.estudio, destino);
        return;
    }

    const perfilActivo = window.perfilEqPiperActivo || document.getElementById('sel-eq-piper-perfil')?.value || 'estudio';
    if (perfilActivo === 'natural') { source.connect(destino); return; }
    const cfg = (perfilActivo === 'personalizado')
        ? _construirPerfilPiperPersonalizado()
        : (_PERFILES_DSP_PIPER[perfilActivo] || _PERFILES_DSP_PIPER.estudio);
    _conectarCadenaDSP(source, cfg, destino);
}

function _decodificarPCM16ABuffer(b64Str) {
    const binaryString = window.atob(b64Str);
    const bufferCrudo = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bufferCrudo[i] = binaryString.charCodeAt(i);
    const int16Data = new Int16Array(bufferCrudo.buffer);
    const float32Data = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) float32Data[i] = int16Data[i] / 32768.0;

    const buffer = audioCtx.createBuffer(1, float32Data.length, window.piperSampleRate || 22050);
    buffer.getChannelData(0).set(float32Data);
    return buffer;
}

function _fijarAnclaInicioOracionDSP(paqueteSID) {
    window.ultimoMomentoInicioPiper = window.nextScheduleTime;
    window.lastProcessedSID = paqueteSID;
    console.log(`⚓ [ANCLA] Nueva oración SID:${paqueteSID} inicia en T=${window.ultimoMomentoInicioPiper.toFixed(3)}`);

    window._karaokeAlignState = { cursorIdx: 0, charOffset: 0, lastPIdx: -1, cachedResult: null };
    if (window.listaPalabrasActuales) window.listaPalabrasActuales.forEach(p => { p.yaLeida = false; });
    if (window.requestID_Karaoke) cancelAnimationFrame(window.requestID_Karaoke);
    loopKaraokeAltaPrecision();
}

function procesarAudioRaw(b64Str, paqueteSID) {
    if (paqueteSID !== undefined && window.currentReadingSession && paqueteSID != window.currentReadingSession) return;

    if (!audioCtx) initAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!gainNode) {
        gainNode = audioCtx.createGain();
        gainNode.connect(audioCtx.destination);
    }
    gainNode.gain.value = volumenPorcentaje / 100;

    try {
        const buffer = _decodificarPCM16ABuffer(b64Str);
        window.duracionAudioAcumulada += buffer.duration;

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        const pitch = (typeof pitchLectura !== 'undefined' && pitchLectura > 0) ? pitchLectura : 1.0;
        source.playbackRate.value = pitch;

        window.activeAudioSources.push(source);
        source.onended = () => {
            const idx = window.activeAudioSources.indexOf(source);
            if (idx > -1) window.activeAudioSources.splice(idx, 1);
        };

        _conectarFuenteAudioConDSP(source, gainNode);

        const ahora = audioCtx.currentTime;
        if (!window.nextScheduleTime || window.nextScheduleTime < ahora) window.nextScheduleTime = ahora + 0.01;
        source.start(window.nextScheduleTime);

        if (paqueteSID !== window.lastProcessedSID) _fijarAnclaInicioOracionDSP(paqueteSID);
        window.nextScheduleTime += buffer.duration / pitch;
    } catch (e) {
        console.error("🔥 Error crítico en procesarAudioRaw:", e);
    }
}

function _notificarSincroniaKaraokeExterna(tiempoAudioActual, pAudio, pIdx) {
    if (typeof actualizarKaraokeSubtitulos === 'function') {
        actualizarKaraokeSubtitulos(tiempoAudioActual, pAudio, pIdx);
    }
    if (typeof window.actualizarKaraokeIA === 'function') {
        window.actualizarKaraokeIA(tiempoAudioActual, pAudio, pIdx);
    }
}

function loopKaraokeAltaPrecision() {
    if (!leyendo || !audioCtx || !window.partituraActual) return;

    const tiempoReal = audioCtx.currentTime - window.ultimoMomentoInicioPiper;
    if (tiempoReal < 0) {
        window.progresoFraccional = 0;
        window.requestID_Karaoke = requestAnimationFrame(loopKaraokeAltaPrecision);
        return;
    }

    const pitchActual = (typeof pitchLectura !== 'undefined' && pitchLectura > 0) ? pitchLectura : 1.0;
    const tiempoAudioActual = tiempoReal * pitchActual;
    const pIdx = window.partituraActual.findIndex(p => tiempoAudioActual >= (p.s - 0.005) && tiempoAudioActual < p.e);

    if (pIdx !== -1) {
        window.ultimoIdxAudio = pIdx;
        const pAudio = window.partituraActual[pIdx];
        window.progresoFraccional = Math.max(0, Math.min(1, (tiempoAudioActual - pAudio.s) / (pAudio.e - pAudio.s)));

        if (window.listaPalabrasActuales) {
            const resuelta = (typeof window.resolverPalabraKaraoke === 'function')
                ? window.resolverPalabraKaraoke(pAudio, window.listaPalabrasActuales, pIdx)
                : window.listaPalabrasActuales[pAudio.vIdx];
            if (resuelta) { window.palabraKaraoke = resuelta; dibujar(); }
        }
        _notificarSincroniaKaraokeExterna(tiempoAudioActual, pAudio, pIdx);
    } else {
        _notificarSincroniaKaraokeExterna(tiempoAudioActual, null, -1);
    }

    window.requestID_Karaoke = requestAnimationFrame(loopKaraokeAltaPrecision);
}

// ==========================================

