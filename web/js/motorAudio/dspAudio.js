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

function validarPretraduccionRed(checkboxEl) {
    if (window.modoPrivacidadEstricta && checkboxEl.checked) {
        checkboxEl.checked = false;
        return false;
    }
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


function cicloConsumoPiper() {
    // Si el usuario pausó, salir para ahorrar ciclos.
    if (!isPlayingPiper) return;

    try {
        // 1. INTENTO DE CONEXIÓN
        let promesa = eel.obtener_chunk_audio()();

        if (!promesa || typeof promesa.then !== 'function') {
            // Silencioso para no saturar la consola si Python se cierra
            return;
        }

        promesa.then(function (paquete) {
            if (!paquete) return;

            // 2. LA ADUANA (SEGURIDAD DE SESIÓN)
            // Si el paquete es de una sesión vieja (usuario dio clic en otra frase), lo tiramos a la basura.
            if (paquete.sid !== undefined && paquete.sid !== window.currentReadingSession) {
                return;
            }

            const tipo = paquete.t || paquete;

            // 3. ENRUTAMIENTO INTELIGENTE
            switch (tipo) {

                // --- CASO A: LA PARTITURA (NUEVO MOTOR) ---
                case "lyrics":
                    // Recibimos la lista maestra de tiempos exactos desde Python
                    if (paquete.sid >= window.currentReadingSession) {
                        window.partituraActual = paquete.data;
                        console.log(`🎼 [PARTITURA] Sincronizada: ${paquete.data.length} elementos.`);
                    }
                    break;

                // --- CASO B: EL AUDIO RAW ---
                case "a":
                    if (paquete.d) {
                        procesarAudioRaw(paquete.d, paquete.sid);
                    }
                    break;

                // --- CASO C: CONFIGURACIÓN TÉCNICA ---
                case "meta":
                    window.piperSampleRate = paquete.sr;
                    break;

                // --- CASO D: FINAL DE FRASE ---
                case "fin":
                case "FIN":
                    let sesionAlLlegarFin = window.currentReadingSession;

                    // Calculamos cuánto falta para que termine el audio que ya está en cola
                    let tiempoRestante = 0;
                    if (audioCtx && window.nextScheduleTime > audioCtx.currentTime) {
                        tiempoRestante = (window.nextScheduleTime - audioCtx.currentTime) * 1000;
                    }

                    // Pausa extra configurada por el usuario (slider rng-pausa). Por defecto 0ms.
                    const _pausaExtra = (typeof pausaPunto !== 'undefined' && pausaPunto > 0) ? pausaPunto : 0;

                    // Solo adelantamos 280ms si hay una siguiente oración en la misma página;
                    // en la última oración esperamos el tiempoRestante completo (+40ms) para no cortar la última palabra.
                    const _haySiguienteEnPagina = (
                        typeof datosPagina !== 'undefined' &&
                        datosPagina &&
                        Array.isArray(datosPagina.oraciones) &&
                        typeof indiceOracion === 'number' &&
                        (indiceOracion + 1) < datosPagina.oraciones.length
                    );
                    const _delayFin = _haySiguienteEnPagina
                        ? Math.max(0, tiempoRestante - ((tiempoRestante > 80) ? 280 : 0))
                        : (tiempoRestante > 0 ? tiempoRestante + 40 : 0);

                    // Programamos el salto a la siguiente frase
                    setTimeout(() => {
                        // Verificación de seguridad por si el usuario cambió rápido
                        if (window.currentReadingSession !== sesionAlLlegarFin) return;

                        // Detenemos el consumo de ESTA frase
                        isPlayingPiper = false;

                        // Callback para pedir la siguiente oración (automático)
                        if (window.onPiperEndCallback && leyendo) {
                            if (_pausaExtra > 0 && window.nextScheduleTime > 0) {
                                window.nextScheduleTime += (_pausaExtra / 1000);
                            }
                            window.onPiperEndCallback();
                        }
                    }, _delayFin);

                    clearInterval(piperQueueTimer);
                    break;
            }

        }).catch(err => {
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

function procesarAudioRaw(b64Str, paqueteSID) {
    // 1. SEGURIDAD DE SESIÓN: Si el usuario ya cambió de frase, ignoramos este audio viejo.
    if (paqueteSID !== undefined && window.currentReadingSession && paqueteSID != window.currentReadingSession) {
        return;
    }

    // Aseguramos que el AudioContext esté vivo
    if (!audioCtx) initAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    // --- INTEGRACIÓN DEL NODO DE GANANCIA (VOLUMEN) 
    if (!gainNode) {
        gainNode = audioCtx.createGain();
        gainNode.connect(audioCtx.destination);
    }
    gainNode.gain.value = volumenPorcentaje / 100
    // Aplicamos el volumen actual guardado en la variable global

    try {
        // --- 2. DECODIFICACIÓN MANUAL (PCM Raw -> AudioBuffer) ---
        // Python envía Int16 (bytes crudos). Debemos convertirlos a Float32 para el navegador.
        const binaryString = window.atob(b64Str);
        const len = binaryString.length;
        const bufferCrudo = new Uint8Array(len);
        for (let i = 0; i < len; i++) bufferCrudo[i] = binaryString.charCodeAt(i);

        // Convertir bytes a enteros de 16 bits
        const int16Data = new Int16Array(bufferCrudo.buffer);

        // Convertir enteros a flotantes (-1.0 a 1.0)
        const float32Data = new Float32Array(int16Data.length);
        for (let i = 0; i < int16Data.length; i++) {
            float32Data[i] = int16Data[i] / 32768.0;
        }

        const sampleRate = window.piperSampleRate || 22050;
        const buffer = audioCtx.createBuffer(1, float32Data.length, sampleRate);
        buffer.getChannelData(0).set(float32Data);
        window.duracionAudioAcumulada += buffer.duration;

        // --- 3. CREACIÓN DE LA FUENTE ---
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        // Tono: leemos pitchLectura (slider rng-tono). Por defecto 1.0 = sin alteración.
        const _pitch = (typeof pitchLectura !== 'undefined' && pitchLectura > 0) ? pitchLectura : 1.0;
        source.playbackRate.value = _pitch;

        // RASTREO: Para poder cancelar el audio si damos Stop
        window.activeAudioSources.push(source);
        source.onended = () => {
            let i = window.activeAudioSources.indexOf(source);
            if (i > -1) window.activeAudioSources.splice(i, 1);
        };

        // --- 4. STUDIO MODE (Efectos y Ecualización Adaptativa) ---
        const vozActualId = window.vozActivaSnapshot || (document.getElementById('selector-voz-live')?.value) || "";
        const esKokoroActivo = vozActualId.includes("kokoro");

        if (esKokoroActivo) {
            // Verificar perfil acústico de la voz Kokoro (Estudio, Cristalino, Radio o Natural)
            let perfilEqVoz = 'estudio';
            if (typeof window.cachePerfilesEqKokoro !== 'undefined' && window.cachePerfilesEqKokoro[vozActualId]) {
                perfilEqVoz = window.cachePerfilesEqKokoro[vozActualId];
            }

            if (perfilEqVoz === 'natural') {
                // Modo plano / sin filtros DSP
                source.connect(gainNode);
            } else if (perfilEqVoz === 'cristalino') {
                // Brillo superior, aire y máxima inteligibilidad
                const eqAir = audioCtx.createBiquadFilter();
                eqAir.type = 'peaking';
                eqAir.frequency.value = 4800;
                eqAir.gain.value = 2.2;
                eqAir.Q.value = 0.8;

                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 11500;
                filter.Q.value = 0.6;

                const compressor = audioCtx.createDynamicsCompressor();
                compressor.threshold.value = -12;
                compressor.knee.value = 16;
                compressor.ratio.value = 2.0;

                source.connect(eqAir);
                eqAir.connect(filter);
                filter.connect(compressor);
                compressor.connect(gainNode);
            } else if (perfilEqVoz === 'radio') {
                // Radiodifusión: Graves de pecho y presencia
                const eqBass = audioCtx.createBiquadFilter();
                eqBass.type = 'peaking';
                eqBass.frequency.value = 180;
                eqBass.gain.value = 2.8;
                eqBass.Q.value = 1.0;

                const compressor = audioCtx.createDynamicsCompressor();
                compressor.threshold.value = -14;
                compressor.knee.value = 18;
                compressor.ratio.value = 2.5;

                source.connect(eqBass);
                eqBass.connect(compressor);
                compressor.connect(gainNode);
            } else {
                // 🎙️ PERFIL KOKORO HI-FI DE ESTUDIO (24 kHz por defecto)
                const eqWarmth = audioCtx.createBiquadFilter();
                eqWarmth.type = 'peaking';
                eqWarmth.frequency.value = 300;
                eqWarmth.gain.value = 1.8;
                eqWarmth.Q.value = 0.9;

                const eqDeHarsh = audioCtx.createBiquadFilter();
                eqDeHarsh.type = 'peaking';
                eqDeHarsh.frequency.value = 4200;
                eqDeHarsh.gain.value = -1.8;
                eqDeHarsh.Q.value = 1.1;

                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 10500;
                filter.Q.value = 0.6;

                const compressor = audioCtx.createDynamicsCompressor();
                compressor.threshold.value = -12;
                compressor.knee.value = 16;
                compressor.ratio.value = 2.2;
                compressor.attack.value = 0.01;
                compressor.release.value = 0.25;

                source.connect(eqWarmth);
                eqWarmth.connect(eqDeHarsh);
                eqDeHarsh.connect(filter);
                filter.connect(compressor);
                compressor.connect(gainNode);
            }

        } else {
            // 📻 PERFIL PIPER / SÍNTESIS CONVENCIONAL CON ECUALIZADOR DINÁMICO
            const perfilActivo = window.perfilEqPiperActivo || document.getElementById('sel-eq-piper-perfil')?.value || 'estudio';

            if (perfilActivo === 'natural') {
                // Sin DSP ni filtros, sonido directo del modelo
                source.connect(gainNode);
            } else if (perfilActivo === 'anti_siseo') {
                // Corte quirúrgico de agudos molestos / siseos de cuantización
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 5000;
                filter.Q.value = 0.9;

                const compressor = audioCtx.createDynamicsCompressor();
                compressor.threshold.value = -16;
                compressor.knee.value = 12;
                compressor.ratio.value = 3.0;
                compressor.attack.value = 0.005;
                compressor.release.value = 0.2;

                source.connect(filter);
                filter.connect(compressor);
                compressor.connect(gainNode);
            } else if (perfilActivo === 'cristalino') {
                // Realce de inteligibilidad y agudos limpios
                const peakClarity = audioCtx.createBiquadFilter();
                peakClarity.type = 'peaking';
                peakClarity.frequency.value = 3600;
                peakClarity.gain.value = 2.5;
                peakClarity.Q.value = 1.0;

                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 9200;
                filter.Q.value = 0.6;

                const compressor = audioCtx.createDynamicsCompressor();
                compressor.threshold.value = -14;
                compressor.knee.value = 14;
                compressor.ratio.value = 2.2;
                compressor.attack.value = 0.005;
                compressor.release.value = 0.2;

                source.connect(peakClarity);
                peakClarity.connect(filter);
                filter.connect(compressor);
                compressor.connect(gainNode);
            } else if (perfilActivo === 'radio') {
                // Realce de graves cálidos, estilo locutor de radio / audiolibro
                const bassBoost = audioCtx.createBiquadFilter();
                bassBoost.type = 'peaking';
                bassBoost.frequency.value = 180;
                bassBoost.gain.value = 3.5;
                bassBoost.Q.value = 0.9;

                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 6500;
                filter.Q.value = 0.8;

                const compressor = audioCtx.createDynamicsCompressor();
                compressor.threshold.value = -18;
                compressor.knee.value = 10;
                compressor.ratio.value = 4.0;
                compressor.attack.value = 0.005;
                compressor.release.value = 0.25;

                source.connect(bassBoost);
                bassBoost.connect(filter);
                filter.connect(compressor);
                compressor.connect(gainNode);
            } else if (perfilActivo === 'personalizado') {
                // Perfil con controles de usuario personalizados
                const gGraves = parseFloat(document.getElementById('rng-eq-piper-graves')?.value || 0);
                const gMedios = parseFloat(document.getElementById('rng-eq-piper-medios')?.value || 0);
                const gAgudos = parseFloat(document.getElementById('rng-eq-piper-agudos')?.value || 0);
                const fCorte = parseFloat(document.getElementById('rng-eq-piper-corte')?.value || 8000);

                let nodoActual = source;

                if (Math.abs(gGraves) > 0.1) {
                    const eqG = audioCtx.createBiquadFilter();
                    eqG.type = 'peaking';
                    eqG.frequency.value = 200;
                    eqG.gain.value = gGraves;
                    eqG.Q.value = 0.9;
                    nodoActual.connect(eqG);
                    nodoActual = eqG;
                }

                if (Math.abs(gMedios) > 0.1) {
                    const eqM = audioCtx.createBiquadFilter();
                    eqM.type = 'peaking';
                    eqM.frequency.value = 3000;
                    eqM.gain.value = gMedios;
                    eqM.Q.value = 1.0;
                    nodoActual.connect(eqM);
                    nodoActual = eqM;
                }

                if (Math.abs(gAgudos) > 0.1) {
                    const eqA = audioCtx.createBiquadFilter();
                    eqA.type = 'peaking';
                    eqA.frequency.value = 6000;
                    eqA.gain.value = gAgudos;
                    eqA.Q.value = 1.0;
                    nodoActual.connect(eqA);
                    nodoActual = eqA;
                }

                if (fCorte < 13500) {
                    const filter = audioCtx.createBiquadFilter();
                    filter.type = 'lowpass';
                    filter.frequency.value = fCorte;
                    filter.Q.value = 0.7;
                    nodoActual.connect(filter);
                    nodoActual = filter;
                }

                const compressor = audioCtx.createDynamicsCompressor();
                compressor.threshold.value = -15;
                compressor.knee.value = 12;
                compressor.ratio.value = 2.5;
                compressor.attack.value = 0.005;
                compressor.release.value = 0.25;

                nodoActual.connect(compressor);
                compressor.connect(gainNode);
            } else {
                // 'estudio' (predeterminado): Anti-ruido y calidez de voz
                const eqCalidez = audioCtx.createBiquadFilter();
                eqCalidez.type = 'peaking';
                eqCalidez.frequency.value = 250;
                eqCalidez.gain.value = 2.0;
                eqCalidez.Q.value = 1.0;

                const eqDeHarsh = audioCtx.createBiquadFilter();
                eqDeHarsh.type = 'peaking';
                eqDeHarsh.frequency.value = 3800;
                eqDeHarsh.gain.value = -2.5;
                eqDeHarsh.Q.value = 1.2;

                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 7500;
                filter.Q.value = 0.7;

                const compressor = audioCtx.createDynamicsCompressor();
                compressor.threshold.value = -15;
                compressor.knee.value = 12;
                compressor.ratio.value = 2.8;
                compressor.attack.value = 0.005;
                compressor.release.value = 0.25;

                source.connect(eqCalidez);
                eqCalidez.connect(eqDeHarsh);
                eqDeHarsh.connect(filter);
                filter.connect(compressor);
                compressor.connect(gainNode);
            }
        }

        // --- 5. RELOJ MAESTRO (Gapless Scheduling) ---
        const ahora = audioCtx.currentTime;

        // Si el reloj se quedó atrás (por lag o pausa), lo traemos al presente
        if (!window.nextScheduleTime || window.nextScheduleTime < ahora) {
            window.nextScheduleTime = ahora + 0.01; // 10ms de margen mínimo
        }

        source.start(window.nextScheduleTime);

        // --- 6. SINCRONÍA FASE CERO (El Disparador del Videojuego) ---


        // Detectamos si este audio es el INICIO de una nueva oración
        if (paqueteSID !== window.lastProcessedSID) {

            // A. FIJAMOS EL "ZERO HOUR" (El Ancla Temporal Absoluta)
            window.ultimoMomentoInicioPiper = window.nextScheduleTime;
            window.lastProcessedSID = paqueteSID;

            console.log(`⚓ [ANCLA] Nueva oración SID:${paqueteSID} inicia en T=${window.ultimoMomentoInicioPiper.toFixed(3)}`);

            // B. RESET VISUAL
            window._karaokeAlignState = { cursorIdx: 0, charOffset: 0, lastPIdx: -1, cachedResult: null };
            if (window.listaPalabrasActuales) {
                window.listaPalabrasActuales.forEach(p => p.yaLeida = false);
            }

            // C. ARRANCAR MOTOR GRÁFICO (Game Loop)
            // Ya no procesamos colas viejas. Arrancamos el renderizado de 60FPS.
            if (window.requestID_Karaoke) cancelAnimationFrame(window.requestID_Karaoke);
            loopKaraokeAltaPrecision();
        }

        // --- 7. AVANCE DEL RELOJ ---
        // Cuando el tono está alterado, el chunk dura más o menos tiempo real.
        // Si no compensamos, los chunks se solapan (pitch < 1) o quedan huecos (pitch > 1)
        // provocando el "efecto ventilador". Dividir por _pitch corrige el reloj exactamente.
        window.nextScheduleTime += buffer.duration / _pitch;

    } catch (e) {
        console.error("🔥 Error crítico en procesarAudioRaw:", e);
    }
}
/**
 * MOTOR DE RENDERIZADO "CURSOR DINÁMICO"
 * Optimizado para laptops con gráficos integrados (Bajo consumo de CPU).
 */
function loopKaraokeAltaPrecision() {
    // 1. GESTIÓN DE ESTADO: Si no hay audio o partitura, abortamos
    if (!leyendo || !audioCtx || !window.partituraActual) return;

    // 2. RELOJ DE HARDWARE: Tiempo exacto relativo al inicio de la frase
    const _tiempoReal = audioCtx.currentTime - window.ultimoMomentoInicioPiper;
    if (_tiempoReal < 0) {
        window.progresoFraccional = 0;
        window.requestID_Karaoke = requestAnimationFrame(loopKaraokeAltaPrecision);
        return;
    }
    // La partitura de Python fue calculada a velocidad 1.0. Si alteramos el tono con
    // playbackRate, el audio avanza más rápido o más lento, así que debemos escalar el
    // tiempo real para que coincida con los timestamps de la partitura.
    const _pitchActual = (typeof pitchLectura !== 'undefined' && pitchLectura > 0) ? pitchLectura : 1.0;
    const tiempoAudioActual = _tiempoReal * _pitchActual;

    // 3. BÚSQUEDA DE LA PALABRA/REBANADA ACTUAL
    const pIdx = window.partituraActual.findIndex(p =>
        tiempoAudioActual >= (p.s - 0.005) && tiempoAudioActual < p.e
    );

    if (pIdx !== -1) {
        window.ultimoIdxAudio = pIdx;
        const pAudio = window.partituraActual[pIdx];

        // --- CÁLCULO DE PROGRESO FRACCIONAL (Alineación Dinámica) ---
        // Determinamos el porcentaje de avance (0.0 a 1.0) dentro de la rebanada actual
        let duracionFragmento = pAudio.e - pAudio.s;
        let tiempoTranscurrido = tiempoAudioActual - pAudio.s;

        // Clamp entre 0 y 1 para evitar errores de renderizado
        window.progresoFraccional = Math.max(0, Math.min(1, tiempoTranscurrido / duracionFragmento));

        // 4. VÍNCULO CON EL CANVAS
        if (window.listaPalabrasActuales) {
            const resuelta = (typeof window.resolverPalabraKaraoke === 'function')
                ? window.resolverPalabraKaraoke(pAudio, window.listaPalabrasActuales, pIdx)
                : window.listaPalabrasActuales[pAudio.vIdx];
            if (resuelta) {
                window.palabraKaraoke = resuelta;

                // Forzamos el redibujado inmediato (60fps teóricos)
                dibujar();
            }
        }

        // 5. VÍNCULO CON SUBTÍTULOS FLOTANTES (KARAOKE EN SUBTÍTULOS)
        if (typeof actualizarKaraokeSubtitulos === 'function') {
            actualizarKaraokeSubtitulos(tiempoAudioActual, pAudio, pIdx);
        }

        // 6. VÍNCULO CON KARAOKE EN RESPUESTAS DE LIRAAI (Chat y Solicitudes)
        if (typeof window.actualizarKaraokeIA === 'function') {
            window.actualizarKaraokeIA(tiempoAudioActual, pAudio, pIdx);
        }
    } else {
        if (typeof actualizarKaraokeSubtitulos === 'function') {
            actualizarKaraokeSubtitulos(tiempoAudioActual, null, -1);
        }
        if (typeof window.actualizarKaraokeIA === 'function') {
            window.actualizarKaraokeIA(tiempoAudioActual, null, -1);
        }
    }

    // 6. RECURSIÓN DE ALTA PRECISIÓN: Se sincroniza con el refresco del monitor (Hz)
    window.requestID_Karaoke = requestAnimationFrame(loopKaraokeAltaPrecision);
}

// ==========================================

