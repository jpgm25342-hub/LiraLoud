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

function toggleModoSoloLectura(activo, silencioso = false) {
    const nuevo = Boolean(activo);
    window.modoSoloLecturaActivo = nuevo;
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

    if (nuevo) {
        if (typeof toggleCapturaCorte === 'function' && window.capturandoCorte) {
            toggleCapturaCorte(false);
        }
        if (typeof detenerLectura === 'function') {
            detenerLectura(true);
        }
        const capaKaraoke = document.getElementById('capa-karaoke');
        if (capaKaraoke) capaKaraoke.style.display = 'none';
        if (!silencioso && typeof rutaPDFActual !== 'undefined' && rutaPDFActual && typeof cargarPagina === 'function' && typeof paginaActual === 'number') {
            cargarPagina(paginaActual);
        }
    } else {
        if (typeof window.limpiarCapaTextoSoloLectura === 'function') {
            window.limpiarCapaTextoSoloLectura();
        }
        const capaKaraoke = document.getElementById('capa-karaoke');
        if (capaKaraoke) capaKaraoke.style.display = '';
        if (!silencioso) {
            if (typeof dibujarCortesEnCanvas === 'function') dibujarCortesEnCanvas();
            if (typeof rutaPDFActual !== 'undefined' && rutaPDFActual && typeof cargarPagina === 'function' && typeof paginaActual === 'number') {
                if (typeof window.mostrarOverlayCargaAudio === 'function') window.mostrarOverlayCargaAudio(true);
                Promise.resolve(cargarPagina(paginaActual)).finally(() => {
                    if (typeof window.mostrarOverlayCargaAudio === 'function') window.mostrarOverlayCargaAudio(false);
                });
            }
        }
    }

    if (!silencioso && nuevo) {
        notificarBloqueoSoloLectura();
    }
}
window.toggleModoSoloLectura = toggleModoSoloLectura;

async function hablarTexto(texto, callback, listaPalabrasVisuales = null, vozForzada = null, esTransicionAutomatica = false) {
    if (window.modoSoloLecturaActivo) {
        if (!esTransicionAutomatica) notificarBloqueoSoloLectura();
        return;
    }

    // 🛡️ 1. SEMÁFORO DE ARRANQUE (Debounce)
    // Si hay una orden de lectura pendiente de hace menos de 50ms, la cancelamos.
    if (window.piperSetupTimeout) {
        console.warn("🚦 [SEGURIDAD] Orden duplicada detectada. Cancelando la anterior.");
        clearTimeout(window.piperSetupTimeout);
        window.piperSetupTimeout = null;
    }

    // --- 2. PREPARACIÓN DE DATOS (Síncrono) ---
    const normalizarTextoJS = (t) => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, '');
    window._karaokeAlignState = { cursorIdx: 0, charOffset: 0, lastPIdx: -1, cachedResult: null };
    if (!texto) texto = "";

    // Actualizamos sesión global INMEDIATAMENTE para invalidar audios viejos
    if (typeof currentReadingSession === 'undefined' || isNaN(currentReadingSession)) {
        currentReadingSession = 0;
    }
    currentReadingSession++;
    window.currentReadingSession = currentReadingSession;

    // Detenemos la voz del tutorial si estuviera narrando un paso
    if (typeof detenerAudioTutorial === 'function') {
        detenerAudioTutorial();
    }

    // Detenemos visualmente (pero el audio real lo matamos dentro del timeout)
    leyendo = true;
    if (typeof actualizarBotonPlayPause === 'function') actualizarBotonPlayPause(true);
    if (!esTransicionAutomatica) {
        window.nextScheduleTime = 0;
    }
    window.piperJsCompensacion = 1.0;

    readingSessionID++;
    if (window.requestID_Karaoke) {
        cancelAnimationFrame(window.requestID_Karaoke);
        window.requestID_Karaoke = null;
    }
    window.partituraActual = null;
    window.progresoFraccional = 0;
    window.palabraKaraoke = (Array.isArray(listaPalabrasVisuales) && listaPalabrasVisuales.length > 0)
        ? listaPalabrasVisuales[0]
        : null;
    dibujar();

    let textoLimpio = "";
    try { textoLimpio = String(texto).trim(); } catch (e) { textoLimpio = ""; }

    console.log(`📡 [RECEPTOR] Texto en cola...`);

    if (!textoLimpio) {
        if (callback) callback();
        return;
    }

    // --- 3. EJECUCIÓN DIFERIDA (El Blindaje) ---
    // Envolvemos el arranque en una función para poder ejecutarla al instante en transiciones automáticas
    // o con 50ms de colchón cuando es un clic manual del usuario.
    const iniciarReproduccionPiper = () => {

        // A) Recuperar variables globales
        let velFinal = 1.0;
        if (typeof velocidadLectura !== 'undefined') {
            velFinal = velocidadLectura;
        } else {
            let slider = document.getElementById('velocidad') || document.getElementById('rango-velocidad');
            if (slider) velFinal = parseFloat(slider.value);
        }

        // B) Determinar Voz
        let vozFinal = vozForzada;
        if (!vozFinal && typeof vozIntencionUsuario !== 'undefined' && vozIntencionUsuario) {
            vozFinal = vozIntencionUsuario;
        }
        if (!vozFinal) {
            let sel = document.getElementById('selector-voz-live');
            vozFinal = (sel && sel.value) ? sel.value : "";
        }

        // 🛡️ BARRERA ABSOLUTA DE PRIVACIDAD: Si estamos en modo privacidad, impedir el uso de cualquier voz online
        if (window.modoPrivacidadEstricta) {
            const vLower = (vozFinal || '').toLowerCase();
            const esOnline = vLower.includes('online') || vLower.includes('natural') ||
                            (!vLower.startsWith('local-') && !vLower.endsWith('.onnx') && !vLower.includes('kokoro'));
            if (esOnline) {
                const sel = document.getElementById('selector-voz-live');
                const optSegura = sel ? Array.from(sel.options).find(o => {
                    const vl = (o.value || '').toLowerCase();
                    const tl = (o.text || '').toLowerCase();
                    return !vl.includes('online') && !tl.includes('online') && !vl.includes('natural') && !tl.includes('natural') &&
                           (vl.startsWith('local-') || vl.includes('kokoro') || vl.endsWith('.onnx'));
                }) : null;

                if (optSegura && optSegura.value) {
                    vozFinal = optSegura.value;
                    if (sel) sel.value = vozFinal;
                    if (typeof vozIntencionUsuario !== 'undefined') vozIntencionUsuario = vozFinal;
                    if (typeof vozPredeterminada !== 'undefined') vozPredeterminada = vozFinal;
                    console.log(`🛡️ [PRIVACIDAD KARAOKE] Voz desviada a local segura: ${vozFinal}`);
                }
            }
        }

        // C) Limpieza Física Real (Solo en arranque manual; en transición automática dejamos terminar A en audioCtx)
        if (!esTransicionAutomatica) {
            detenerLectura(false);
        }
        if (piperQueueTimer) clearInterval(piperQueueTimer);
    if (window.requestID_Karaoke) {
        cancelAnimationFrame(window.requestID_Karaoke);
        window.requestID_Karaoke = null;
    }
    window.partituraActual = null;
        isPlayingPiper = false;
        eel.detener_streaming_backend(false)();

        // D) Sincronización Final
        window.onPiperEndCallback = callback;

        console.log(`🚀 Motor Híbrido (Python V3) -> Voz: ${vozFinal} | Vel: ${velFinal}`);

        if (!audioCtx) {
            try { initAudioContext(); } catch (e) { console.warn("AudioCtx init error", e); }
        } else if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        if (!esTransicionAutomatica || !audioCtx || !window.nextScheduleTime || window.nextScheduleTime < audioCtx.currentTime) {
            window.nextScheduleTime = (audioCtx) ? audioCtx.currentTime + 0.01 : 0;
        }

        // E) DATOS PARA EL DIRECTOR PYTHON
        // Importante: Leemos el checkbox AQUÍ y AHORA
        const chkTeatro = document.getElementById('chk-teatro-global');
        const teatroActivoBackend = chkTeatro ? chkTeatro.checked : false;
        const obraActivaBackend = window.obraActualTeatro || "General";

        console.log(`📤 [JS->PY] Enviando Teatro: ${teatroActivoBackend}`);

        if (typeof eel !== 'undefined' && eel.backend_trigger_duck) {
            eel.backend_trigger_duck()();
        }

        isPlayingPiper = true;
        window.colaEsperaPalabras = [];

        // F) LLAMADA ÚNICA A PYTHON
        const idiomaFiltroActual = document.getElementById('filtro-idioma')?.value || '';
        eel.iniciar_streaming_hibrido(
            texto,
            vozFinal,
            velFinal,
            window.currentReadingSession,
            teatroActivoBackend,
            obraActivaBackend,
            idiomaFiltroActual
        );

        piperQueueTimer = setInterval(cicloConsumoPiper, 15);

        // Limpiamos la referencia
        window.piperSetupTimeout = null;
    };

    if (esTransicionAutomatica) {
        iniciarReproduccionPiper();
    } else {
        window.piperSetupTimeout = setTimeout(iniciarReproduccionPiper, 50); // 50ms de "colchón" para absorber el doble clic
    }
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
async function reproducirSecuencia(idx, esAutomatico = false) {
    // 1. VERIFICACIÓN DE SEGURIDAD
    if (!leyendo || !datosPagina || !datosPagina.oraciones) {
        console.warn("⚠️ [SEC] Lectura detenida o datos no disponibles.");
        detenerLectura();
        return;
    }

    // Validación de rango
    if (idx < 0 || idx >= datosPagina.oraciones.length) {
        console.log("🏁 [SEC] Fin de la página alcanzado.");
        detenerLectura();

        // Tarea 7: Modos de Ritmo (Auto-avance) - Solo si la página tenía oraciones reales y el tutorial no está activo
        let chkAuto = document.getElementById('chk-auto-avance');
        if (!window.tutorialActivo && chkAuto && chkAuto.checked && datosPagina.oraciones.length > 0) {
            console.log("⏩ Auto-avanzando a la siguiente página...");
            if (window.timerAutoAvance) clearTimeout(window.timerAutoAvance);
            window.autoContinuarLectura = true;
            window.timerAutoAvance = setTimeout(() => {
                cambiarPagina(1);
            }, 500);
        }

        return;
    }

    // 2. SINCRONIZACIÓN DE DATOS
    if (window._oracionRecortadaActivaIdx !== undefined && window._oracionRecortadaActivaIdx !== -1 && window._oracionRecortadaActivaIdx !== idx) {
        if (typeof window.restaurarOracionesRecortadas === 'function') {
            window.restaurarOracionesRecortadas();
        }
        window._oracionRecortadaActivaIdx = -1;
    }
    indiceOracion = idx;
    oracionActiva = datosPagina.oraciones[idx];
    if (window.requestID_Karaoke) {
        cancelAnimationFrame(window.requestID_Karaoke);
        window.requestID_Karaoke = null;
    }
    window.partituraActual = null;
    window.progresoFraccional = 0;
    window.palabraKaraoke = null;

    // --- ESCUDO ANTI-CRASH: Objeto nulo ---
    if (!oracionActiva) {
        console.error(`❌ [ERROR CRÍTICO] La oración ${idx} es NULL en el array. Saltando...`);
        setTimeout(() => reproducirSecuencia(idx + 1), 10);
        return;
    }

    const textoParaAudio = String(oracionActiva.texto || "");

    // Preparación Visual + Filtrado de paréntesis/referencias/URLs
    const resultado = aplicarMascaraParentesis(oracionActiva.palabras || []);
    window.listaPalabrasActuales = resultado.listaVisual;
    if (Array.isArray(window.listaPalabrasActuales) && window.listaPalabrasActuales.length > 0) {
        window.listaPalabrasActuales.forEach(p => { p.yaLeida = false; });
        window.palabraKaraoke = window.listaPalabrasActuales[0];
        dibujar();
    }

    // textoClean = texto ya sin paréntesis, URLs, referencias (según opciones del usuario)
    // Es el que debe ir al traductor para no traducir ruido tipográfico
    const textoClean = resultado.textoClean || textoParaAudio;

    // VALIDACIÓN ANTI-VACÍO BLINDADA
    if (window.listaPalabrasActuales.length === 0 && textoParaAudio.trim().length === 0) {
        console.warn(`⏩ Oración ${idx} vacía. Saltando automáticamente.`);
        setTimeout(() => reproducirSecuencia(idx + 1), 10);
        return;
    }

    // 4. REAFIRMACIÓN DE VOZ BASE
    let vozActual = window.vozActivaSnapshot || vozPredeterminada;
    if (!vozActual) {
        let sel = document.getElementById('selector-voz-live');
        vozActual = (sel && sel.value) ? sel.value : "";
    }

    // 5. CACHÉ PROACTIVA BLINDADA (Para Local, Nube y Traducción)
    const traduccionActiva = document.getElementById('chk-traduccion-activa')?.checked ?? false;
    const tradOrigen = document.getElementById('sel-traduccion-origen')?.value || 'auto';
    const tradDestino = document.getElementById('sel-traduccion-destino')?.value || 'es';
    const tradMotor = document.getElementById('sel-traduccion-motor')?.value || 'online';
    const tradModo = document.getElementById('sel-traduccion-modo')?.value || 'solo_traduccion';

    if (vozActual) {
        let isPocketOKokoro = vozActual.includes("pocket") || vozActual.includes("kokoro");
        let isLocal = vozActual.startsWith("Local-");
        
        let limitePalabrasHorno = isLocal ? 1500 : 1200;
        let limiteOracionesHorno = isLocal ? 35 : 28;

        // Modelos neuronales pesados (Pocket / Kokoro): ventana corta para evitar saturación de CPU
        if (isPocketOKokoro) {
            limitePalabrasHorno = 80;
            limiteOracionesHorno = 2; // Solo la siguiente oración inmediata
        }

        // [OPTIMIZACIÓN DE COLA DE TRADUCCIÓN: Ventana anticipada de 2 oraciones]
        if (traduccionActiva) {
            limitePalabrasHorno = 150; // Aprox 2 o 3 oraciones
            limiteOracionesHorno = 3;  // Ventana deslizante de 2 oraciones siguientes
        }

        // Ejecutar en segundo plano con un ligero retraso para darle prioridad a la oración ACTUAL (Paso 7)
        setTimeout(() => {
            let palabrasEnHorno = 0;
            for (let i = 1; i < limiteOracionesHorno; i++) {
                let sigIdx = idx + i;
                if (sigIdx >= datosPagina.oraciones.length) break;

                let oracionFutura = datosPagina.oraciones[sigIdx];
                if (!oracionFutura) continue;

                let textoFuturo = String(oracionFutura.texto || "");

                // Filtrar paréntesis/URLs del prefetch igual que la oración actual
                if (oracionFutura.palabras && oracionFutura.palabras.length > 0) {
                    const resFuturo = aplicarMascaraParentesis(oracionFutura.palabras);
                    if (resFuturo.textoClean) textoFuturo = resFuturo.textoClean;
                }

                if (textoFuturo.trim().length > 0) {
                    if (palabrasEnHorno < limitePalabrasHorno) {
                        const idiomaFiltroHorno = document.getElementById('filtro-idioma')?.value || '';
                        if (traduccionActiva && typeof eel.traducir_texto_backend === 'function') {
                            // Pre-traducir anticipadamente en RAM y alimentar el horno de audio con el texto traducido
                            obtenerTraduccionOptimizada(textoFuturo, tradOrigen, tradDestino, tradMotor).then(res => {
                                if (!leyendo) return;
                                const txtTrad = (res && (res.texto_traducido || res.traducido)) ? (res.texto_traducido || res.traducido) : textoFuturo;
                                if (tradModo === 'solo_traduccion') {
                                    eel.prender_horno_para_siguiente(txtTrad, vozActual, velocidadLectura, idiomaFiltroHorno);
                                } else {
                                    eel.prender_horno_para_siguiente(textoFuturo, vozActual, velocidadLectura, idiomaFiltroHorno);
                                }
                            }).catch(() => {
                                eel.prender_horno_para_siguiente(textoFuturo, vozActual, velocidadLectura, idiomaFiltroHorno);
                            });
                        } else {
                            eel.prender_horno_para_siguiente(textoFuturo, vozActual, velocidadLectura, idiomaFiltroHorno);
                        }
                        palabrasEnHorno += textoFuturo.split(' ').length;
                    } else break;
                }
            }
        }, 30);
    }

    // 6. ACTUALIZACIÓN UI
    let cajaTexto = document.getElementById('texto-lectura');
    if (cajaTexto) cajaTexto.innerText = textoParaAudio;
    dibujar();

    // Auto-Scroll Seguro
    const chkSeguir = document.getElementById('chk-seguimiento');
    if (chkSeguir && chkSeguir.checked && oracionActiva.rects && oracionActiva.rects.length > 0) {
        try {
            if (idx < datosPagina.oraciones.length - 1) {
                let z = datosPagina.factor_zoom;
                let yPos = oracionActiva.rects[0][1] * z;
                let visor = document.getElementById('visor-container');
                if (visor) visor.scrollTo({ top: yPos - (visor.clientHeight / 3), behavior: 'smooth' });
            }
        } catch (e) { console.warn("Error en scroll:", e); }
    }

    // Reset de contadores
    window.contadorPalabrasOracion = 0;
    window.colaEsperaPalabras = [];
    window.duracionAudioAcumulada = 0;

    // 7. GESTIÓN DE TRADUCCIÓN HÍBRIDA & LECTURA DUAL
    // ⚠️ IMPORTANTE: usamos textoClean (sin paréntesis/referencias) en lugar de textoParaAudio crudo
    if (traduccionActiva && typeof eel !== 'undefined' && typeof eel.traducir_texto_backend === 'function') {
        console.log("🌐 [TRADUCCIÓN ACTIVA NITRO]", { tradOrigen, tradDestino, tradMotor, tradModo, textoClean });

        // -------------------------------------------------------------
        // CASO A: MODO SOLO TRADUCCIÓN (Lee directamente el texto traducido)
        // -------------------------------------------------------------
        if (tradModo === 'solo_traduccion') {
            try {
                let res = await obtenerTraduccionOptimizada(textoClean, tradOrigen, tradDestino, tradMotor);
                if (!leyendo) return;
                const textoTraducido = (res && (res.texto_traducido || res.traducido)) ? (res.texto_traducido || res.traducido) : textoClean;

                window.subtituloEsAudioDirecto = true;
                if (typeof mostrarSubtituloTraduccion === 'function') {
                    mostrarSubtituloTraduccion(textoTraducido, res?.origen_detectado || tradOrigen, tradDestino);
                }
                hablarTexto(textoTraducido, () => {
                    if (leyendo) {
                        reproducirSecuencia(idx + 1, true);
                    }
                }, window.listaPalabrasActuales, vozActual, esAutomatico);
                return;
            } catch (err) {
                console.error("🔥 Error al traducir:", err);
            }
        }

        // -------------------------------------------------------------
        // CASO B: MODO APRENDIZAJE DUAL (Lee original + Lee traducción)
        // -------------------------------------------------------------
        if (tradModo === 'aprendizaje') {
            let promesaTraduccion = obtenerTraduccionOptimizada(textoClean, tradOrigen, tradDestino, tradMotor);
            window.subtituloEsAudioDirecto = false;

            hablarTexto(textoParaAudio, async () => {
                if (!leyendo) return;
                try {
                    const res = await promesaTraduccion;
                    const textoTraducido = (res && (res.texto_traducido || res.traducido)) ? (res.texto_traducido || res.traducido) : "";
                    if (textoTraducido && leyendo) {
                        window.subtituloEsAudioDirecto = true;
                        if (typeof mostrarSubtituloTraduccion === 'function') {
                            mostrarSubtituloTraduccion(textoTraducido, res?.origen_detectado || tradOrigen, tradDestino);
                        }
                        // Pausa breve pedagógica entre el idioma original y la traducción
                        setTimeout(() => {
                            if (!leyendo) return;
                            hablarTexto(textoTraducido, () => {
                                if (leyendo) {
                                    let pausa = (textoTraducido.length < 3) ? 50 : pausaPunto;
                                    setTimeout(() => reproducirSecuencia(idx + 1), pausa);
                                }
                            }, null, vozActual);
                        }, Math.max(300, pausaPunto / 2));
                        return;
                    }
                } catch (e) {
                    console.warn("Error en aprendizaje dual:", e);
                }
                if (leyendo) {
                    setTimeout(() => reproducirSecuencia(idx + 1), pausaPunto);
                }
            }, window.listaPalabrasActuales, vozActual);

            const idxCapturado = idx;
            promesaTraduccion.then(res => {
                if (res && (res.texto_traducido || res.traducido) && leyendo && typeof mostrarSubtituloTraduccion === 'function') {
                    if (indiceOracion === idxCapturado) {
                        mostrarSubtituloTraduccion(res.texto_traducido || res.traducido, res?.origen_detectado || tradOrigen, tradDestino);
                    }
                }
            }).catch(() => { });
            return;
        }

        // -------------------------------------------------------------
        // CASO C: MODO SUBTÍTULOS TRADUCIDOS (Audio original + Subtítulo en pantalla)
        // -------------------------------------------------------------
        window.subtituloEsAudioDirecto = false;
        const idxCapturadoC = idx;
        obtenerTraduccionOptimizada(textoClean, tradOrigen, tradDestino, tradMotor).then(res => {
            if (res && (res.texto_traducido || res.traducido) && leyendo && typeof mostrarSubtituloTraduccion === 'function') {
                if (indiceOracion === idxCapturadoC) {
                    mostrarSubtituloTraduccion(res.texto_traducido || res.traducido, res?.origen_detectado || tradOrigen, tradDestino);
                }
            }
        }).catch(e => console.warn("Error en subtítulo:", e));
    }

    // DISPARO DE LECTURA ESTÁNDAR
    window.subtituloEsAudioDirecto = false;
    hablarTexto(textoParaAudio, () => {
        if (leyendo) {
            reproducirSecuencia(idx + 1, true);
        }
    }, window.listaPalabrasActuales, vozActual, esAutomatico);
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
    if (window.modoSoloLecturaActivo) {
        notificarBloqueoSoloLectura();
        return;
    }
    if (!leyendo) {
        if (typeof bloqueoCambioPagina !== 'undefined' && bloqueoCambioPagina && window._promesaCargaPaginaActual) {
            try {
                await window._promesaCargaPaginaActual;
            } catch (e) {}
        }
        if (leyendo) return;
        if (!datosPagina || !datosPagina.oraciones || datosPagina.oraciones.length === 0) {
            console.log("ℹ️ No hay oraciones disponibles en la página actual para lectura.");
            return;
        }
        if (typeof eel !== 'undefined' && eel.backend_trigger_duck) {
            eel.backend_trigger_duck()();
        }
        leyendo = true;
        actualizarBotonPlayPause(true);

        // Reanudación exacta usando el motor de "Reproducir desde aquí"
        if (window.palabraPausada && typeof empezarDesdePalabra === 'function') {
            let palabraReanudar = window.palabraPausada;
            window.palabraPausada = null; // Limpiamos para el futuro
            empezarDesdePalabra(palabraReanudar);
        } else {
            if (indiceOracion === -1) indiceOracion = 0;
            reproducirSecuencia(indiceOracion);
        }
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

function detenerLectura(resetUI = true) {
    if (window.timerAutoAvance) {
        clearTimeout(window.timerAutoAvance);
        window.timerAutoAvance = null;
    }

    // 1. FILTRO DE TRANSICIÓN: Si es un cambio interno de frase, no matamos el audio
    if (resetUI === false && leyendo === true) {
        // Solo limpiamos el timer para evitar solapamientos
        if (piperQueueTimer) clearInterval(piperQueueTimer);
    if (window.requestID_Karaoke) {
        cancelAnimationFrame(window.requestID_Karaoke);
        window.requestID_Karaoke = null;
    }
    window.partituraActual = null;
        return;
    }

    // 2. APAGADO GENERAL
    if (leyendo && typeof eel !== 'undefined' && eel.backend_trigger_unduck) {
        eel.backend_trigger_unduck()();
    }
    leyendo = false;
    isPlayingPiper = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    if (piperQueueTimer) clearInterval(piperQueueTimer);
    if (window.requestID_Karaoke) {
        cancelAnimationFrame(window.requestID_Karaoke);
        window.requestID_Karaoke = null;
    }
    window.partituraActual = null;

    // 3. LA GUILLOTINA DE AUDIO (Matar sonidos pendientes)
    if (window.activeAudioSources && window.activeAudioSources.length > 0) {
        window.activeAudioSources.forEach(src => {
            try { src.stop(); } catch (e) { }
        });
        window.activeAudioSources = []; // Vaciamos la lista
    }

    // 4. GESTIÓN DEL CONTEXTO DE AUDIO
    if (audioCtx && audioCtx.state !== 'closed' && resetUI) {
        try { audioCtx.suspend(); } catch (e) { }
        window.nextScheduleTime = 0; // Reiniciar reloj interno
    }

    // 5. AVISAR A PYTHON
    try { eel.detener_streaming_backend()(); } catch (e) { }

    // 6. LIMPIEZA VISUAL (Solo si es STOP total)
    if (resetUI) {
        if (typeof window.restaurarOracionesRecortadas === 'function') {
            window.restaurarOracionesRecortadas();
        }
        window._oracionRecortadaActivaIdx = -1;
        actualizarBotonPlayPause(false);
        window.palabraPausada = null;
        oracionActiva = null;
        palabraKaraoke = null;
        if (typeof limpiarSubtitulosTraduccion === 'function') limpiarSubtitulosTraduccion();
        if (window.promesasTraduccionJS) window.promesasTraduccionJS.clear();
        dibujar();
    }
}



function _normUnicodeKaraoke(t) {
    return String(t || "").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, '');
}

window.resolverPalabraKaraoke = function(pAudio, listaPalabras, pIdx = -1) {
    if (!pAudio || !Array.isArray(listaPalabras) || listaPalabras.length === 0) return null;

    if (!window._karaokeAlignState) {
        window._karaokeAlignState = { cursorIdx: 0, charOffset: 0, lastPIdx: -1, cachedResult: null };
    }
    const st = window._karaokeAlignState;
    if (pIdx !== -1 && pIdx === st.lastPIdx && st.cachedResult) {
        return st.cachedResult;
    }

    const tokNorm = _normUnicodeKaraoke(pAudio.w || "");
    const cjkRe = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/;
    const fallbackVIdx = (typeof pAudio.vIdx === 'number' && listaPalabras[pAudio.vIdx])
        ? listaPalabras[pAudio.vIdx]
        : null;

    let resultado = fallbackVIdx;

    if (tokNorm) {
        if (cjkRe.test(tokNorm)) {
            const startIdx = Math.max(0, Math.min(st.cursorIdx, listaPalabras.length - 1));
            const maxLook = Math.min(listaPalabras.length - 1, startIdx + 3);
            for (let i = startIdx; i <= maxLook; i++) {
                const bloque = listaPalabras[i];
                const blockNorm = _normUnicodeKaraoke(bloque?.texto || "");
                if (!blockNorm) continue;

                const offset = (i === startIdx) ? st.charOffset : 0;
                const pos = blockNorm.indexOf(tokNorm, offset);
                if (pos !== -1) {
                    const endPos = pos + tokNorm.length;
                    if (blockNorm.length > tokNorm.length) {
                        resultado = Object.assign({}, bloque, {
                            _cjkSlice: {
                                startFrac: pos / blockNorm.length,
                                endFrac: Math.min(1, endPos / blockNorm.length)
                            }
                        });
                    } else {
                        resultado = bloque;
                    }
                    if (endPos >= blockNorm.length) {
                        st.cursorIdx = i + 1;
                        st.charOffset = 0;
                    } else {
                        st.cursorIdx = i;
                        st.charOffset = endPos;
                    }
                    break;
                }
            }
        } else {
            const startIdx = Math.max(0, Math.min(st.cursorIdx, listaPalabras.length - 1));
            const maxLook = Math.min(listaPalabras.length - 1, startIdx + 3);
            for (let i = startIdx; i <= maxLook; i++) {
                const palNorm = _normUnicodeKaraoke(listaPalabras[i]?.texto || "");
                if (!palNorm) continue;
                if (palNorm === tokNorm || palNorm.includes(tokNorm) || tokNorm.includes(palNorm)) {
                    resultado = listaPalabras[i];
                    st.cursorIdx = i + 1;
                    st.charOffset = 0;
                    break;
                }
            }
        }
    }

    if (pIdx !== -1) {
        st.lastPIdx = pIdx;
        st.cachedResult = resultado;
    }
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