/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// 4. LECTURA Y KARAOKE (VERSIÓN HÍBRIDA FINAL BLINDADA)
// ==========================================


async function hablarTexto(texto, callback, listaPalabrasVisuales = null, vozForzada = null) {

    // 🛡️ 1. SEMÁFORO DE ARRANQUE (Debounce)
    // Si hay una orden de lectura pendiente de hace menos de 50ms, la cancelamos.
    if (window.piperSetupTimeout) {
        console.warn("🚦 [SEGURIDAD] Orden duplicada detectada. Cancelando la anterior.");
        clearTimeout(window.piperSetupTimeout);
        window.piperSetupTimeout = null;
    }

    // --- 2. PREPARACIÓN DE DATOS (Síncrono) ---
    const normalizarTextoJS = (t) => String(t || "").toLowerCase().replace(/\W+/g, '');
    if (!texto) texto = "";

    // Actualizamos sesión global INMEDIATAMENTE para invalidar audios viejos
    if (typeof currentReadingSession === 'undefined' || isNaN(currentReadingSession)) {
        currentReadingSession = 0;
    }
    currentReadingSession++;
    window.currentReadingSession = currentReadingSession;

    // Detenemos visualmente (pero el audio real lo matamos dentro del timeout)
    leyendo = true;
    if (typeof actualizarBotonPlayPause === 'function') actualizarBotonPlayPause(true);
    window.nextScheduleTime = 0;
    window.piperJsCompensacion = 1.0;

    readingSessionID++;
    window.palabraKaraoke = null;
    dibujar();

    let textoLimpio = "";
    try { textoLimpio = String(texto).trim(); } catch (e) { textoLimpio = ""; }

    console.log(`📡 [RECEPTOR] Texto en cola...`);

    if (!textoLimpio) {
        if (callback) callback();
        return;
    }

    // --- 3. EJECUCIÓN DIFERIDA (El Blindaje) ---
    // Envolvemos TODO el arranque en un timeout. Si llega otro clic, esto muere antes de nacer.
    window.piperSetupTimeout = setTimeout(() => {

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

        // C) Limpieza Física Real
        detenerLectura(false);
        if (piperQueueTimer) clearInterval(piperQueueTimer);
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

        window.nextScheduleTime = (audioCtx) ? audioCtx.currentTime + 0.05 : 0;

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
        eel.iniciar_streaming_hibrido(
            texto,
            vozFinal,
            velFinal,
            window.currentReadingSession,
            teatroActivoBackend,
            obraActivaBackend
        );

        piperQueueTimer = setInterval(cicloConsumoPiper, 15);

        // Limpiamos la referencia
        window.piperSetupTimeout = null;

    }, 50); // 50ms de "colchón" para absorber el doble clic
}





/*
 * TITULO: DIRECTOR DE ORQUESTA (Blindado V5.0)
 * Diagnóstico: Protegido contra nulos y tipos incorrectos.
 */
async function reproducirSecuencia(idx) {
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

        // Tarea 7: Modos de Ritmo (Auto-avance)
        let chkAuto = document.getElementById('chk-auto-avance');
        if (chkAuto && chkAuto.checked) {
            console.log("⏩ Auto-avanzando a la siguiente página...");
            // Damos 500ms de pausa natural antes de cambiar
            setTimeout(() => {
                cambiarPagina(1);
                // Damos tiempo extra para que el PDF se renderice y se extraiga el texto antes de iniciarLectura
                setTimeout(() => iniciarLectura(), 1500);
            }, 500);
        }

        return;
    }

    // 2. SINCRONIZACIÓN DE DATOS
    indiceOracion = idx;
    oracionActiva = datosPagina.oraciones[idx];
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
        let isLocal = vozActual.startsWith("Local-");
        let limitePalabrasHorno = isLocal ? 1500 : 1200;
        let limiteOracionesHorno = isLocal ? 35 : 28;

        // [OPTIMIZACIÓN DE COLA DE TRADUCCIÓN]
        if (traduccionActiva) {
            limitePalabrasHorno = 150; // Aprox 2 o 3 oraciones largas
            limiteOracionesHorno = 3;  // Reducido drásticamente para no ahogar el puente Eel
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
                        if (traduccionActiva && typeof eel.traducir_texto_backend === 'function') {
                            if (tradModo === 'solo_traduccion') {
                                eel.traducir_texto_backend(textoFuturo, tradOrigen, tradDestino, tradMotor)().then(res => {
                                    const txtTrad = (res && (res.texto_traducido || res.traducido)) ? (res.texto_traducido || res.traducido) : textoFuturo;
                                    eel.prender_horno_para_siguiente(txtTrad, vozActual, velocidadLectura);
                                }).catch(() => {
                                    eel.prender_horno_para_siguiente(textoFuturo, vozActual, velocidadLectura);
                                });
                            } else {
                                if (i <= 6) eel.traducir_texto_backend(textoFuturo, tradOrigen, tradDestino, tradMotor)();
                                eel.prender_horno_para_siguiente(textoFuturo, vozActual, velocidadLectura);
                            }
                        } else {
                            eel.prender_horno_para_siguiente(textoFuturo, vozActual, velocidadLectura);
                        }
                        palabrasEnHorno += textoFuturo.split(' ').length;
                    } else break;
                }
            }
        }, 50);
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
        console.log("🌐 [TRADUCCIÓN ACTIVA]", { tradOrigen, tradDestino, tradMotor, tradModo, textoClean });

        // -------------------------------------------------------------
        // CASO A: MODO SOLO TRADUCCIÓN (Lee directamente el texto traducido)
        // -------------------------------------------------------------
        if (tradModo === 'solo_traduccion') {
            try {
                let res = await eel.traducir_texto_backend(textoClean, tradOrigen, tradDestino, tradMotor)();
                if (!leyendo) return;
                const textoTraducido = (res && (res.texto_traducido || res.traducido)) ? (res.texto_traducido || res.traducido) : textoClean;

                window.subtituloEsAudioDirecto = true;
                if (typeof mostrarSubtituloTraduccion === 'function') {
                    mostrarSubtituloTraduccion(textoTraducido, res?.origen_detectado || tradOrigen, tradDestino);
                }
                hablarTexto(textoTraducido, () => {
                    if (leyendo) {
                        let pausa = (textoTraducido.length < 3) ? 50 : pausaPunto;
                        setTimeout(() => reproducirSecuencia(idx + 1), pausa);
                    }
                }, window.listaPalabrasActuales, vozActual);
                return;
            } catch (err) {
                console.error("🔥 Error al traducir:", err);
            }
        }

        // -------------------------------------------------------------
        // CASO B: MODO APRENDIZAJE DUAL (Lee original + Lee traducción)
        // -------------------------------------------------------------
        if (tradModo === 'aprendizaje') {
            let promesaTraduccion = eel.traducir_texto_backend(textoClean, tradOrigen, tradDestino, tradMotor)();
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

            promesaTraduccion.then(res => {
                if (res && (res.texto_traducido || res.traducido) && leyendo && typeof mostrarSubtituloTraduccion === 'function') {
                    mostrarSubtituloTraduccion(res.texto_traducido || res.traducido, res?.origen_detectado || tradOrigen, tradDestino);
                }
            }).catch(() => { });
            return;
        }

        // -------------------------------------------------------------
        // CASO C: MODO SUBTÍTULOS TRADUCIDOS (Audio original + Subtítulo en pantalla)
        // -------------------------------------------------------------
        window.subtituloEsAudioDirecto = false;
        eel.traducir_texto_backend(textoClean, tradOrigen, tradDestino, tradMotor)().then(res => {
            if (res && (res.texto_traducido || res.traducido) && leyendo && typeof mostrarSubtituloTraduccion === 'function') {
                mostrarSubtituloTraduccion(res.texto_traducido || res.traducido, res?.origen_detectado || tradOrigen, tradDestino);
            }
        }).catch(e => console.warn("Error en subtítulo:", e));
    }

    // DISPARO DE LECTURA ESTÁNDAR
    window.subtituloEsAudioDirecto = false;
    hablarTexto(textoParaAudio, () => {
        if (leyendo) {
            let pausa = (textoParaAudio.length < 3) ? 50 : pausaPunto;
            setTimeout(() => reproducirSecuencia(idx + 1), pausa);
        }
    }, window.listaPalabrasActuales, vozActual);
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

function iniciarLectura() {
    if (!leyendo) {
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
    // 1. FILTRO DE TRANSICIÓN: Si es un cambio interno de frase, no matamos el audio
    if (resetUI === false && leyendo === true) {
        // Solo limpiamos el timer para evitar solapamientos
        if (piperQueueTimer) clearInterval(piperQueueTimer);
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
        actualizarBotonPlayPause(false);
        window.palabraPausada = null;
        oracionActiva = null;
        palabraKaraoke = null;
        if (typeof limpiarSubtitulosTraduccion === 'function') limpiarSubtitulosTraduccion();
        dibujar();
    }
}



function copiarTexto() {
    if (palabraHover) navigator.clipboard.writeText(palabraHover.texto);
    document.getElementById('menu-contextual').style.display = 'none';
}

function abrirModalDescarga() {
    // 🛡️ Lógica de exclusión mutua universal
    if (typeof cerrarOtrasFuncionesPrincipales === 'function') {
        cerrarOtrasFuncionesPrincipales('mp3');
    }

    const modal = document.getElementById('modal-descarga');
    if (modal) {
        modal.style.display = 'flex';

        // Blindaje contra el error de 'aviso-columnas'
        const aviso = document.getElementById('aviso-columnas');
        if (aviso) {
            aviso.style.display = (cortesV && cortesV.length > 0) ? 'block' : 'none';
        }
    } else {
        console.error("🔥 Error: No se encontró el elemento 'modal-descarga' en el HTML.");
    }
}


async function cerrarModalDescarga() {
    console.log("⏹️ [EXPORTACIÓN] Cerrando modal y cancelando exportación si está activa...");

    // 1. Ocultamos el modal inmediatamente
    const modal = document.getElementById('modal-descarga');
    if (modal) {
        modal.style.display = 'none';
        modal.style.pointerEvents = 'auto';
    }
    const barra = document.getElementById('barra-contenedor');
    if (barra) barra.style.display = 'none';

    // 2. Ejecutamos la orden de cancelación en Python
    if (typeof eel !== 'undefined' && eel.cancelar_exportacion_mp3) {
        try {
            await eel.cancelar_exportacion_mp3()();
        } catch (e) {
            console.warn("Aviso al cancelar:", e);
        }
    }

    // 3. Restauramos estado de los botones
    const btnCancelar = document.getElementById('btn-cancelar-exportacion');
    const btnGenerar = document.getElementById('btn-iniciar-descarga');
    if (btnCancelar) {
        btnCancelar.style.display = 'block';
        btnCancelar.innerText = "Cancelar";
    }
    if (btnGenerar) btnGenerar.style.display = 'block';
    const txtEstado = document.getElementById('txt-estado-descarga');
    if (txtEstado) txtEstado.innerText = "";
}

function actModalVel() {
    document.getElementById('modal-val-vel').innerText = document.getElementById('modal-rng-vel').value + "x";
}

function iniciarDescargaFinal() {
    try {
        const ini = parseInt(document.getElementById('modal-pag-ini').value);
        const fin = parseInt(document.getElementById('modal-pag-fin').value);
        const voz = document.getElementById('modal-voz').value || document.getElementById('selector-voz-live').value;
        const vel = parseFloat(document.getElementById('modal-rng-vel').value);

        if (!ini || !fin || !voz) {
            alert("Por favor configure las páginas y la voz antes de exportar.");
            return;
        }

        const chkTeatroExport = document.getElementById('chk-teatro-export');
        const usarTeatro = chkTeatroExport && chkTeatroExport.checked;
        const obraMP3 = window.obraActualTeatro || "General";

        const chkAbbr = document.getElementById('mp3-chk-abbr')?.checked ?? true;
        const dictActivo = chkAbbr ? (window.dbDiccionario || null) : {};

        const btnCancelar = document.getElementById('btn-cancelar-exportacion');
        const btnGenerar = document.getElementById('btn-iniciar-descarga');

        if (btnGenerar) btnGenerar.style.display = 'none';
        if (btnCancelar) {
            btnCancelar.style.display = 'block';
            btnCancelar.innerText = "Detener exportación";
        }

        const txtEstado = document.getElementById('txt-estado-descarga');
        if (txtEstado) {
            txtEstado.innerText = "⏳ Generando audio de estudio...";
            txtEstado.style.color = "#d35400";
        }
        const barra = document.getElementById('barra-contenedor');
        if (barra) barra.style.display = "block";

        // Llamada al backend
        eel.descargar_audio_dedicado(
            ini, fin, voz, vel, null, null, dictActivo, usarTeatro, obraMP3
        )(function (res) {
            if (txtEstado) {
                txtEstado.innerText = res;
                txtEstado.style.color = (typeof res === 'string' && res.includes("❌")) ? "#e74c3c" : "#27ae60";
            }

            setTimeout(() => {
                if (typeof res === 'string' && res.trim()) {
                    alert(res);
                }
                cerrarModalDescarga();
            }, 600);
        });

    } catch (e) {
        console.error("🔥 Error crítico en exportación:", e);
        alert("Error al iniciar exportación: " + e);
        const btnCancelar = document.getElementById('btn-cancelar-exportacion');
        const btnGenerar = document.getElementById('btn-iniciar-descarga');
        if (btnCancelar) {
            btnCancelar.style.display = 'block';
            btnCancelar.innerText = "Cancelar";
        }
        if (btnGenerar) btnGenerar.style.display = 'block';
    }
}




// ==========================================