/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

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

                    // Programamos el salto a la siguiente frase
                    setTimeout(() => {
                        // Verificación de seguridad por si el usuario cambió rápido
                        if (window.currentReadingSession !== sesionAlLlegarFin) return;

                        // Detenemos el consumo de ESTA frase
                        isPlayingPiper = false;

                        // Callback para pedir la siguiente oración (automático)
                        if (window.onPiperEndCallback && leyendo) {
                            window.onPiperEndCallback();
                        }
                    }, tiempoRestante + 50 + _pausaExtra); // +50ms margen + pausa extra del usuario

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

        // --- 4. STUDIO MODE (Efectos de Audio) ---


        // A. Filtro Paso-Bajo (Quita el silbido metálico de la IA)
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        // Si leemos muy rápido, cortamos más agudos para evitar fatiga auditiva
        if ((window.velocidadLectura || 1.0) > 1.1) {
            filter.frequency.value = 4500;
            filter.Q.value = 0.8;
        } else {
            filter.frequency.value = 8000;
            filter.Q.value = 0.7;
        }

        // B. Compresor Dinámico (Iguala el volumen y da "presencia" de radio)
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -20; // Empezar a comprimir a -20dB
        compressor.knee.value = 10;       // Curva suave
        compressor.ratio.value = 12;      // Compresión fuerte
        compressor.attack.value = 0;      // Reacción instantánea
        compressor.release.value = 0.25;

        // CONECTOGRAMA: Fuente -> Filtro -> Compresor -> Altavoces
        source.connect(filter);
        filter.connect(compressor);
        //SALIDA DEL COMPRESOR:
        compressor.connect(gainNode);

        // --- 5. RELOJ MAESTRO (Gapless Scheduling) ---
        const ahora = audioCtx.currentTime;

        // Si el reloj se quedó atrás (por lag o pausa), lo traemos al presente
        if (!window.nextScheduleTime || window.nextScheduleTime < ahora) {
            window.nextScheduleTime = ahora + 0.05; // 50ms de margen de seguridad
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
        if (window.listaPalabrasActuales && window.listaPalabrasActuales[pAudio.vIdx]) {
            window.palabraKaraoke = window.listaPalabrasActuales[pAudio.vIdx];

            // Forzamos el redibujado inmediato (60fps teóricos)
            dibujar();
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

function aplicarMascaraParentesis(listaOriginalPalabras) {
    let listaFiltrada = [];
    let textoParaAudio = "";
    let ignorarBloque = false;

    const saltarUrls = document.getElementById('chk-urls')?.checked;
    const saltarParen = document.getElementById('chk-paren')?.checked;
    const saltarCorch = document.getElementById('chk-corch')?.checked;
    const saltarLlaves = document.getElementById('chk-llaves')?.checked;
    const saltarBarras = document.getElementById('chk-barras')?.checked;

    if (!listaOriginalPalabras) return { listaVisual: [], textoClean: "" };

    for (let i = 0; i < listaOriginalPalabras.length; i++) {
        let p = listaOriginalPalabras[i];
        let txtRaw = p.texto.trim();
        if (!txtRaw) continue;

        // 1. BLOQUES (Igual que links/paréntesis)
        if ((saltarParen && txtRaw.includes('(')) ||
            (saltarCorch && txtRaw.includes('[')) ||
            (saltarLlaves && txtRaw.includes('{'))) {
            ignorarBloque = true;
        }

        let esLink = saltarUrls && (txtRaw.toLowerCase().includes("http") || txtRaw.toLowerCase().includes("www"));

        // 2. PROCESAMIENTO (Detección de Voz y Silencios del Usuario)
        if (!ignorarBloque && !esLink) {
            let p_audio = txtRaw;

            // A) Filtro Manual de Barras (UI)
            if (saltarBarras) {
                p_audio = p_audio.split('/').join(' ').split('\\').join(' ');
            }

            // B) Validación de Contenido Real
            // Detectamos si queda algo que Piper pueda pronunciar (letras o números)
            // Si el usuario puso un vacío en el diccionario, tieneContenido será false.
            const tieneContenido = /[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(p_audio);
            const esDecimalProtegido = p_audio.includes("punto");

            if (tieneContenido || esDecimalProtegido) {
                listaFiltrada.push(p);
                textoParaAudio += p_audio + " ";
            } else {
                // Si la palabra es un silencio (por el diccionario o por el filtro de barras)
                // la marcamos como leída para que el Karaoke visual salte de inmediato.
                p.yaLeida = true;
            }
        } else {
            // Caso: Está dentro de un paréntesis/corchete que el usuario mandó saltar
            p.yaLeida = true;
        }
        // 3. SALIDA DE BLOQUES
        if ((saltarParen && txtRaw.includes(')')) ||
            (saltarCorch && txtRaw.includes(']')) ||
            (saltarLlaves && txtRaw.includes('}'))) {
            ignorarBloque = false;
        }
    } // <--- Cierre del FOR
    return { listaVisual: listaFiltrada, textoClean: textoParaAudio.trim() };
} // <--- Cierre de la FUNCIÓN

function obtenerEstadosFiltros() {
    return {
        'chk-urls': document.getElementById('chk-urls').checked,
        'chk-paren': document.getElementById('chk-paren').checked,
        'chk-corch': document.getElementById('chk-corch').checked,
        'chk-llaves': document.getElementById('chk-llaves').checked
    };
}


/**
 * SISTEMA DE NAVEGACIÓN DE PESTAÑAS (Configuración)
 */
function cambiarTabConfig(event, tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    const panel = document.getElementById(tabId);
    if (panel) panel.style.display = 'block';
    event.currentTarget.classList.add('active');
}

/**
 * CONTROL DE GANANCIA MAESTRO
 */
function sincronizarVolumen(val) {
    volumenPorcentaje = parseInt(val);
    if (isNaN(volumenPorcentaje)) volumenPorcentaje = 100;

    // 1. Actualizar UI
    document.getElementById('rng-volumen-master').value = volumenPorcentaje;
    document.getElementById('num-volumen-master').value = volumenPorcentaje;

    // 2. Calcular Ganancia (0.0 a 1.0)
    const gananciaReal = volumenPorcentaje / 100;

    // 3. Aplicar al motor de audio
    if (gainNode && audioCtx) {
        // Suavizado para evitar 'pops'
        gainNode.gain.setTargetAtTime(gananciaReal, audioCtx.currentTime, 0.02);
    }
}

/**
 * CIERRE UNIVERSAL (Tecla Escape)
 * Cierra diccionarios o configuraciones abiertas.
 */
function cerrarModalesAbiertos() {

    // 0. Prioridad: Modo Teatro (Añadido)
    const modalTeatro = document.getElementById('modal-teatro');
    if (modalTeatro && modalTeatro.style.display === 'flex') {
        cerrarTeatro();
        console.log("🎭 Modo Teatro cerrado vía ESC");
        return true;
    }
    // 1. Prioridad: Diccionario
    const modalDicc = document.getElementById('modal-diccionario');
    if (modalDicc && modalDicc.style.display === 'flex') {
        cerrarDiccionario();
        console.log("📘 Diccionario cerrado vía ESC");
        return true; // Retornamos true para indicar que ya hicimos una acción
    }

    // 2. Prioridad: Configuración Avanzada
    const modalConfig = document.getElementById('modalConfig');
    if (modalConfig && modalConfig.style.display === 'flex') {
        cerrarConfiguracion();
        console.log("⚙️ Configuración cerrada vía ESC");
        return true;
    }

    // 3. Prioridad: Modal de Descarga MP3
    const modalDescarga = document.getElementById('modal-descarga');
    if (modalDescarga && modalDescarga.style.display === 'flex') {
        cerrarModalDescarga();
        console.log("⬇️ Descarga cerrada vía ESC");
        return true;
    }

    // 4. Prioridad: Asistente LiraAI
    const modalIA = document.getElementById('modal-ia');
    if (modalIA && modalIA.style.display === 'flex') {
        if (typeof cerrarModalIA === 'function') cerrarModalIA();
        console.log("✨ LiraAI cerrado vía ESC");
        return true;
    }

    return false;
}

/**
 * ACTUALIZAR FILTROS SNAPSHOT (V3 Final)
 * Sincroniza Diccionario, Botones de Filtro, Tono y Pausa en tiempo real.
 * Realiza un Hot Swap de audio sin recargar el PDF visualmente.
 */

async function actualizarFiltrosSnapshot(resegmentar = false) {
    try {
        // 1. CORTAR EL BUCLE GRÁFICO (Game Loop)
        if (window.requestID_Karaoke) {
            cancelAnimationFrame(window.requestID_Karaoke);
            window.requestID_Karaoke = null;
        }

        // 2. DETENCIÓN AGRESIVA (Anti-Eco para Edge/Navegador)
        // Forzamos el estado de lectura a false antes de llamar a detenerLectura
        leyendo = false;

        if (window.speechSynthesis) {
            window.speechSynthesis.pause();  // Bloqueo físico del flujo
            window.speechSynthesis.cancel(); // Vaciado de la cola de Windows/Edge
        }

        // 3. LIMPIEZA DE COLAS LOCALES (Piper)
        detenerLectura(false); // Detiene timers y procesos de streaming

        // --- GUILLOTINA LÓGICA ---
        // Incrementamos la sesión para invalidar cualquier callback (onend/onerror) 
        // de la voz que estaba sonando justo antes del clic.
        currentReadingSession += 10;
        window.currentReadingSession = currentReadingSession;

        if (window.activeAudioSources) {
            window.activeAudioSources.forEach(s => { try { s.stop(); } catch (e) { } });
            window.activeAudioSources = [];
        }

        // 4. LIMPIAR COLA DE PROCESAMIENTO (Caché de Python)
        await eel.limpiar_pasteleria()();

        // 5. RE-FILTRADO DESDE EL SNAPSHOT (Operación Silenciosa)
        if (typeof datosPagina !== 'undefined' && datosPagina) {
            let dictActual = obtenerDiccionarioConsolidado();

            // Python lee los filtros autónomamente desde ajustes_lectura.json
            let nuevasOraciones = await eel.reaplicar_filtros_desde_snapshot(dictActual, null, resegmentar)();

            if (nuevasOraciones) {
                datosPagina.oraciones = nuevasOraciones;
                window.vozActivaSnapshot = vozPredeterminada;

                console.log("✅ Snapshot actualizado. Lectura detenida para aplicar nuevos filtros.");
            }
        }

        // 6. RESET VISUAL (Estado de Reposo)
        window.palabraKaraoke = null;
        dibujar();

    } catch (e) {
        console.error("🔥 Error en el Hot Swap del Snapshot:", e);
    }
}
async function guardarTodosAjustes(forceRamReload = false) {
    try {
        const proveedorActivo = (typeof configProveedores !== 'undefined' && configProveedores?.proveedorActivo)
            ? configProveedores.proveedorActivo
            : (document.getElementById('sel-ia-proveedor')?.value || 'ollama');

        let cloudKeys = (typeof configProveedores !== 'undefined' && configProveedores?.keys)
            ? { ...configProveedores.keys }
            : {};
        let cloudModelos = (typeof configProveedores !== 'undefined' && configProveedores?.modelos)
            ? { ...configProveedores.modelos }
            : {};

        // Sincronizar campo de clave API solo si el usuario escribió directamente una clave válida
        const txtApiKeyVal = document.getElementById('txt-ia-api-key')?.value;
        if (txtApiKeyVal && txtApiKeyVal.trim() && proveedorActivo && proveedorActivo !== 'ollama') {
            cloudKeys[proveedorActivo] = txtApiKeyVal.trim();
            if (typeof configProveedores !== 'undefined' && configProveedores.keys) {
                configProveedores.keys[proveedorActivo] = txtApiKeyVal.trim();
            }
        }

        // Sincronizar selector de modelo cloud
        const selModeloCloudVal = document.getElementById('sel-ia-modelo-cloud')?.value;
        if (selModeloCloudVal && selModeloCloudVal.trim() && selModeloCloudVal !== '__custom_model_prompt__' && proveedorActivo && proveedorActivo !== 'ollama') {
            cloudModelos[proveedorActivo] = selModeloCloudVal.trim();
            if (typeof configProveedores !== 'undefined' && configProveedores.modelos) {
                configProveedores.modelos[proveedorActivo] = selModeloCloudVal.trim();
            }
        }

        const config = {
            "velocidad": velocidadLectura,
            "tono": pitchLectura,
            "pausa": pausaPunto,
            "volumen": volumenPorcentaje,
            "idioma": document.getElementById('busqueda-idioma-live')?.value,
            "color": document.getElementById('color-resaltado')?.value || "#ffff00",
            "padKaraoke": parseInt(document.getElementById('rng-pad-karaoke')?.value || 2),
            "colorGuia": document.getElementById('color-guia-oracion')?.value || "#00b4ff",
            "padGuia": parseInt(document.getElementById('rng-pad-guia')?.value || 2),
            "llenado": document.getElementById('chk-llenado-fluido')?.checked ?? false,
            "margenPDF": parseInt(document.getElementById('rng-margen-pdf')?.value || 20),
            "seguirTexto": document.getElementById('chk-seguimiento')?.checked ?? true,
            "omitirParen": document.getElementById('chk-paren')?.checked ?? true,
            "omitirCorch": document.getElementById('chk-corch')?.checked ?? true,
            "omitirLlaves": document.getElementById('chk-llaves')?.checked ?? true,
            "omitirUrls": document.getElementById('chk-urls')?.checked ?? true,
            "omitirReferencias": document.getElementById('chk-referencias')?.checked ?? true,
            "usarBloquesNativos": document.getElementById('chk-usar-bloques')?.checked ?? true,
            "sensibilidadSalto": parseFloat(document.getElementById('rng-sensibilidad-salto')?.value || 0.5),
            "detectarSangria": document.getElementById('chk-detectar-sangria')?.checked ?? true,
            "alto_rendimiento": document.getElementById('chk-alto-rendimiento')?.checked ?? false,
            "tema_oscuro": document.getElementById('btn-tema-config')?.checked ?? false,
            "buffer_extendido": document.getElementById('chk-buffer-extendido')?.checked || false,
            "teatro_activo": document.getElementById('chk-teatro-global')?.checked ?? false,
            "precargaRAM": document.getElementById('chk-precarga-ram') ? document.getElementById('chk-precarga-ram').checked : false,
            "obra_actual": obraActualTeatro,
            "mostrarKofi": document.getElementById('chk-kofi')?.checked ?? true,
            "auto_avance": document.getElementById('chk-auto-avance')?.checked ?? true,
            "idioma_ui": document.querySelector('input[name="radio-idioma"]:checked')?.value || 'en',
            "pausa_sistema": document.getElementById('chk-pausa-sistema')?.checked ?? false,
            "ducking_volumen": document.getElementById('chk-ducking-volumen')?.checked ?? false,
            "ducking_nivel": parseInt(document.getElementById('rng-ducking-nivel')?.value || 20),
            "modo_zen": document.getElementById('chk-modo-zen')?.checked ?? true,
            "hide_filtros": document.getElementById('chk-hide-filtros')?.checked ?? false,
            "hide_dicc": document.getElementById('chk-hide-dicc')?.checked ?? false,
            "hide_teatro": document.getElementById('chk-hide-teatro')?.checked ?? false,
            "hide_mp3": document.getElementById('chk-hide-mp3')?.checked ?? false,
            "traduccion_activa": document.getElementById('chk-traduccion-activa')?.checked ?? document.getElementById('zen-chk-traduccion-activa')?.checked ?? false,
            "traduccion_origen": document.getElementById('sel-traduccion-origen')?.value || document.getElementById('zen-sel-traduccion-origen')?.value || 'auto',
            "traduccion_destino": document.getElementById('sel-traduccion-destino')?.value || document.getElementById('zen-sel-traduccion-destino')?.value || 'es',
            "traduccion_motor": document.getElementById('sel-traduccion-motor')?.value || 'online',
            "traduccion_modo": document.getElementById('sel-traduccion-modo')?.value || document.getElementById('zen-sel-traduccion-modo')?.value || 'solo_traduccion',
            "sub_lineheight": parseInt(document.getElementById('rng-sub-lineheight')?.value ?? 13),
            "sub_wordgap": parseInt(document.getElementById('rng-sub-wordgap')?.value ?? 4),
            "ia_modelo_chat": document.getElementById('ia-select-modelo-chat')?.value || (typeof estadoIA !== 'undefined' ? estadoIA.modeloChatSeleccionado : 'gemma4:12b'),
            "ia_modelo_embed": document.getElementById('ia-select-modelo-embed')?.value || (typeof estadoIA !== 'undefined' ? estadoIA.modeloEmbedSeleccionado : 'nomic-embed-text'),
            "ia_leer_bloque_clic": document.getElementById('chk-ia-leer-bloque')?.checked ?? true,
            "ia_modo_salida": document.getElementById('sel-ia-modo-salida')?.value || document.getElementById('sel-ia-modo-salida-config')?.value || (typeof modoSalidaIA !== 'undefined' ? modoSalidaIA : 'trazabilidad'),
            "ia_proveedor_activo": proveedorActivo,
            "ia_cloud_keys": cloudKeys,
            "ia_cloud_modelos": cloudModelos
        };

        console.log("💾 [PERSISTENCIA] Grabando paquete completo:", config);
        await eel.guardar_ajustes_lectura(config)();

        // 🧠 EJECUCIÓN REACTIVA: Si el usuario activa la precarga en caliente
        if (config.precargaRAM && vocesFavoritas && vocesFavoritas.length > 0 && forceRamReload) {
            const pantalla = document.getElementById('pantalla-carga');
            const hud = document.getElementById('txt-paso-carga');

            if (pantalla) {
                pantalla.style.display = 'flex';
                setTimeout(() => pantalla.style.opacity = '1', 10);
            }
            if (hud) hud.innerText = "Inyectando modelos en RAM...";

            if (typeof cerrarConfiguracion === 'function') cerrarConfiguracion();

            try {
                await eel.gestionar_ram_favoritos(vocesFavoritas)();
                await new Promise(resolve => setTimeout(resolve, 3500));
            } catch (err) {
                console.error("🔥 Error en la inyección dinámica de RAM:", err);
            } finally {
                if (pantalla) {
                    pantalla.style.opacity = '0';
                    setTimeout(() => { pantalla.style.display = 'none'; }, 500);
                }
            }
        }
    } catch (e) {
        console.error("🔥 Fallo en persistencia:", e);
    }
}

/**
 * RESTAURACIÓN POR BLOQUES (Dialéctica de Control)
 */

// BLOQUE A: Estilo y Visualización
async function restablecerEstiloBase() {
    if (!confirm("¿Restablecer solo Colores, Márgenes y Resaltado?")) return;
    const ajustes = await eel.cargar_ajustes_lectura()();
    const nuevosAjustes = {
        ...ajustes,
        "color": "#ffff00", "padKaraoke": 2, "colorGuia": "#00b4ff",
        "padGuia": 2, "llenado": false, "margenPDF": 20
    };
    await eel.guardar_ajustes_lectura(nuevosAjustes)();
    location.reload();
}

// BLOQUE B: Motor de Audio
async function restablecerAudioBase() {
    if (!confirm("¿Restablecer solo Velocidad, Tono y Pausas?")) return;
    const ajustes = await eel.cargar_ajustes_lectura()();
    const nuevosAjustes = {
        ...ajustes,
        "velocidad": 1.0, "tono": 1.0, "pausa": 300, "volumen": 100
    };
    await eel.guardar_ajustes_lectura(nuevosAjustes)();
    location.reload();
}

// BLOQUE C: Atajos de Teclado (Usa el archivo atajos.json)
async function restablecerAtajosBase() {
    if (!confirm("¿Restablecer todos los Atajos de Teclado a los de fábrica?")) return;
    const defaults = {
        "play_pause": " ", "add_limit": "control+ ", "add_abbr": "control+i",
        "speed_up": "arrowup", "speed_down": "arrowdown", "prev_page": "arrowleft",
        "next_page": "arrowright", "open_pdf": "control+o", "prev_sentence": "a",
        "next_sentence": "d", "cycle_voice": "v", "toggle_dicc": "tab"
    };
    await eel.guardar_atajos_en_python(defaults)();
    location.reload();
}

// ==================================================================
// SECCIÓN 16: MOTOR DE EXPORTACIÓN MP3 (INTERFAZ REACTIVA V3)
// ==================================================================

// --- 1. GESTIÓN DE COMBO BOXES INTELIGENTES (Windows Search Style) ---
function abrirCombo(tipo) {
    const el = document.getElementById(tipo === 'idioma' ? 'modal-filtro-idioma' : 'modal-voz');
    el.style.display = 'block';
}

function filtrarCombo(tipo) {
    const query = document.getElementById(`busqueda-${tipo}-mp3`).value.toLowerCase();
    const sel = document.getElementById(tipo === 'idioma' ? 'modal-filtro-idioma' : 'modal-voz');
    sel.style.display = 'block';

    Array.from(sel.options).forEach(opt => {
        // Coincidencia parcial permitida (ej: "rau" encuentra "Microsoft Raul")
        opt.style.display = opt.text.toLowerCase().includes(query) ? "block" : "none";
    });
}

function seleccionarCombo(tipo) {
    const sel = document.getElementById(tipo === 'idioma' ? 'modal-filtro-idioma' : 'modal-voz');
    const inp = document.getElementById(`busqueda-${tipo}-mp3`);
    if (sel.selectedIndex !== -1) {
        inp.value = sel.options[sel.selectedIndex].text;
        sel.style.display = 'none';
        // Si cambiamos idioma, refrescamos automáticamente la lista de voces compatibles
        sel.dispatchEvent(new Event('change'));
    }
}

// --- 2. MONITOR VISUAL DE PÁGINAS (Vista Previa Windows) ---
async function previsualizarPagina(tipo) {
    const input = document.getElementById(`modal-pag-${tipo}`);
    if (!input) return;

    const num = parseInt(input.value) - 1;
    // Validación Bayesiana: Evitamos pedir páginas inexistentes [cite: 2025-12-26]
    if (num < 0 || num >= totalPaginas) return;

    console.log(`📸 [MONITOR] Solicitando miniatura de página ${num + 1}...`);

    try {
        // Solicitamos a Python solo la materia prima (imagen) sin oraciones para ganar velocidad
        const data = await eel.obtener_pagina_data(num, null, null, null)();

        if (data && data.imagen) {
            const imgPreview = document.getElementById('img-preview-mp3');
            const txtPreview = document.getElementById('txt-preview-mp3');

            // Forzamos el refresco de la imagen
            imgPreview.src = data.imagen;
            imgPreview.style.display = 'block';
            if (txtPreview) txtPreview.style.display = 'none';
        }
    } catch (e) {
        console.error("🔥 Error en el Monitor Visual:", e);
    }
}

// --- 1. GESTIÓN DE MEMORIA Y FILTROS LIVE ---
function guardarPreferenciaIdioma(nombre) {
    localStorage.setItem('idioma_preferido_lira', nombre);
}

async function filtrarVocesPorIdiomaLive() {
    const inputStr = document.getElementById('busqueda-idioma-live').value.toLowerCase().trim();

    // Mapeo Bayesiano para evitar listas vacías
    const mapa = { "español": "es", "ingles": "en", "inglés": "en", "mexico": "es-mx" };
    const codigo = mapa[inputStr] || inputStr;

    const selVoz = document.getElementById('selector-voz-live');
    if (!selVoz) return;

    // Sincronizamos con el motor de voces actual
    const voces = synth.getVoices();
    selVoz.innerHTML = "";

    voces.forEach(v => {
        if (v.lang.toLowerCase().startsWith(codigo) || v.name.toLowerCase().includes(codigo)) {
            let opt = document.createElement('option');
            opt.value = v.name;
            opt.innerText = "[Edge] " + v.name;
            selVoz.appendChild(opt);
        }
    });
    // Si hay voces Piper cargadas, las añadimos también con su filtro
    actualizarListaVocesUI();
}

// --- 2. CONTROLADORES DE INTERFAZ REACTIVA ---
function abrirComboLive(tipo) {
    const sel = document.getElementById(tipo === 'idioma' ? 'filtro-idioma' : 'selector-voz-live');
    Array.from(sel.options).forEach(opt => opt.style.display = "block");
    sel.style.display = 'block';
}

function filtrarComboLive(tipo) {
    const query = document.getElementById(`busqueda-${tipo}-live`).value.toLowerCase();
    const sel = document.getElementById(tipo === 'idioma' ? 'filtro-idioma' : 'selector-voz-live');
    sel.style.display = 'block';
    Array.from(sel.options).forEach(opt => {
        opt.style.display = opt.text.toLowerCase().includes(query) ? "block" : "none";
    });
    if (tipo === 'idioma') filtrarVocesPorIdiomaLive();
}

function seleccionarComboLive(tipo) {
    const sel = document.getElementById(tipo === 'idioma' ? 'filtro-idioma' : 'selector-voz-live');
    const inp = document.getElementById(`busqueda-${tipo}-live`);

    if (sel && sel.selectedIndex !== -1) {
        const valorNuevo = sel.options[sel.selectedIndex].text;

        // 🛡️ BLOQUEO ANTI-REPETICIÓN: Si el valor ya es el mismo, no disparamos nada.
        if (inp.value === valorNuevo) {
            sel.style.display = 'none';
            return;
        }

        inp.value = valorNuevo;
        sel.style.display = 'none';

        if (tipo === 'idioma') {
            filtrarVocesPorIdiomaLive();
            guardarTodosAjustes();
        } else {
            // 🎯 LLAMADA ÚNICA: Al llamar aquí, cambiarVozLive ya hace todo.
            // Asegúrate de que el selector físico NO tenga otro listener 'onchange' 
            // que haga lo mismo, o se duplicará.
            cambiarVozLive();
        }
    }
}

// --- SENSOR DE CIERRE INTELIGENTE (HUD + MODAL) ---
document.addEventListener('mousedown', (e) => {
    // 1. Identificamos los elementos que deben cerrarse
    const combos = [
        { sel: 'filtro-idioma', inp: 'busqueda-idioma-live' },
        { sel: 'selector-voz-live', inp: 'busqueda-voz-live' },
        { sel: 'modal-filtro-idioma', inp: 'busqueda-idioma-mp3' },
        { sel: 'modal-voz', inp: 'busqueda-voz-mp3' }
    ];

    combos.forEach(combo => {
        const elSel = document.getElementById(combo.sel);
        const elInp = document.getElementById(combo.inp);

        if (elSel && elSel.style.display === 'block') {
            // REGLA: Si el clic NO fue en el input, NI en el select, NI en una opción interna
            if (!e.target.closest(`#${combo.sel}`) &&
                !e.target.closest(`#${combo.inp}`) &&
                !e.target.closest('option')) {

                elSel.style.display = 'none';
                console.log(`🙈 Ocultando lista: ${combo.sel}`);
            }
        }
    });
});


// --- HERRAMIENTA DE INGENIERÍA: TELEMETRÍA VISUAL ---
function logCarga(mensaje) {
    console.log("🛠️ [Telemetría] " + mensaje);
    const el = document.getElementById('txt-paso-carga');
    if (el) el.innerText = " " + mensaje;
}

async function forzarCargaPiper() {
    return new Promise((resolve) => {
        let intentos = 0;

        const intentarConexion = async () => {
            if (vocesPython && vocesPython.length > 0) return resolve();

            intentos++;
            logCarga(`Buscando catálogo Piper (Intento ${intentos}/10)...`);

            try {
                let voces = await Promise.race([
                    eel.obtener_voces_disponibles()(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 800))
                ]);

                if (voces !== undefined && voces !== null) {
                    vocesPython = voces;
                    try {
                        llenarTodosLosSelectores();
                        actualizarListaVocesUI();
                    } catch (e) { }

                    logCarga("¡Catálogo de voces enlazado!");
                    return resolve();
                }
            } catch (e) {
                // Falla silenciosa esperada
            }

            if (intentos >= 10) {
                logCarga("⚠️ Timeout de catálogo. Usando Edge TTS.");
                return resolve();
            }

            setTimeout(intentarConexion, 600);
        };
        intentarConexion();
    });
}

window.onload = async () => {
    // 🎨 BARRERA DE RENDERIZADO (First Paint Yield)
    // Obligamos al motor de Chromium a pintar el DOM (la pantalla azul)
    // ANTES de iniciar el bombardeo asíncrono con Python.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 120)); // 120ms de respiro para la GPU

    // 🛡️ CENTINELA (Watchdog Timer Independiente)
    // Si ocurre un deadlock absoluto en las promesas iniciales, fuerza la apertura a los 8 segundos.
    const seguroDeVida = setTimeout(() => {
        const pantalla = document.getElementById('pantalla-carga');
        if (pantalla && pantalla.style.display !== 'none') {
            logCarga("⚠️ Centinela: Deadlock detectado. Forzando apertura de UI.");
            pantalla.style.opacity = '0';
            setTimeout(() => {
                pantalla.style.display = 'none';
            }, 500);
        }
    }, 8000);

    try {
        logCarga("Preparando modales de interfaz...");
        document.getElementById('modal-descarga').style.display = 'none';
        document.getElementById('modalConfig').style.display = 'none';
        document.getElementById('modal-diccionario').style.display = 'none';

        logCarga("Cargando voces del navegador...");
        cargarVocesSistema();
        if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = cargarVocesSistema;

        // 🛑 FASE 1: Sincronización del catálogo base de voces Piper
        await forzarCargaPiper();

        // FASE 2: Preferencias de Voz del Usuario
        logCarga("Pidiendo voz predeterminada a Python...");
        vozPredeterminada = await eel.cargar_voz_default()();

        logCarga("Pidiendo lista de favoritos a Python...");
        vocesFavoritas = await eel.cargar_lista_favoritos()();

        const inpVozLive = document.getElementById('busqueda-voz-live');
        if (inpVozLive) inpVozLive.value = vozPredeterminada;
        actualizarListaVocesUI();

        const selIdiomaMain = document.getElementById('filtro-idioma');
        const selIdiomaModal = document.getElementById('modal-filtro-idioma');
        if (selIdiomaMain && selIdiomaModal) selIdiomaModal.innerHTML = selIdiomaMain.innerHTML;

        // FASE 3: Estructuras de Diccionario y Abreviaturas
        logCarga("Cargando Abreviaturas (abreviaturas.json)...");
        dbDiccionario = await eel.cargar_diccionario()();
        if (dbDiccionario && Object.keys(dbDiccionario).length > 0) {
            let huboCambios = false;
            for (let sec in dbDiccionario) {
                let terms = dbDiccionario[sec].terms;
                for (let key in terms) {
                    if (typeof terms[key] === 'string') {
                        terms[key] = { val: terms[key], on: true };
                        huboCambios = true;
                    }
                }
            }
            if (huboCambios) await eel.guardar_diccionario(dbDiccionario)();
        }

        // FASE 4: Reparto de Actores y Teatro Clínico
        logCarga("Cargando Reparto de Actores (teatro.json)...");
        try {
            dbTeatro = await eel.cargar_diccionario_teatro()();
            if (!dbTeatro || Object.keys(dbTeatro).length === 0) {
                dbTeatro = { "Cuento KJFñÑGDOLAP": { active: true, actors: {} } };
            }
            obraActualTeatro = Object.keys(dbTeatro)[0];
        } catch (e) {
            dbTeatro = { "Cuento General": { active: true, actors: {} } };
            obraActualTeatro = "Cuento General";
        }

        if (!dbDiccionario || Object.keys(dbDiccionario).length === 0) {
            dbDiccionario = { "General": { active: true, terms: {} } };
            seccionActual = "General";
        } else {
            seccionActual = Object.keys(dbDiccionario)[0];
        }

        // FASE 5: Mapeo de Atajos del Sistema
        logCarga("Cargando Atajos (atajos.json)...");
        misAtajos = await eel.cargar_atajos_desde_python()();
        aplicarAtajosAlNavegador();

        // FASE 6: Configuración General y Variables Dinámicas
        logCarga("Cargando Ajustes de Lectura...");
        const ajustes = await eel.cargar_ajustes_lectura()();
        velocidadLectura = ajustes?.velocidad ?? 1.0;
        pitchLectura = ajustes?.tono ?? 1.0;
        pausaPunto = ajustes?.pausa ?? 300;
        volumenPorcentaje = ajustes?.volumen ?? 100;
        window.seguirTextoActivo = ajustes?.seguirTexto ?? true;
        if (ajustes.obra_actual && dbTeatro[ajustes.obra_actual]) {
            obraActualTeatro = ajustes.obra_actual;
        }

        const idiomaGuardado = ajustes.idioma || "Español";
        const inpLive = document.getElementById('busqueda-idioma-live');
        const inpMp3 = document.getElementById('busqueda-idioma-mp3');
        if (inpLive) inpLive.value = idiomaGuardado;
        if (inpMp3) inpMp3.value = idiomaGuardado;

        setTimeout(() => {
            // Sincronizar selectores ocultos para que el filtro interno (actualizarListaVocesUI) funcione correctamente
            const sincronizarCombo = (id, texto) => {
                let select = document.getElementById(id);
                if (select && select.options.length > 0) {
                    let opt = Array.from(select.options).find(o => o.text === texto);
                    if (opt) select.value = opt.value;
                }
            };
            sincronizarCombo('filtro-idioma', idiomaGuardado);
            sincronizarCombo('modal-filtro-idioma', idiomaGuardado);

            if (typeof filtrarVocesPorIdiomaLive === 'function') {
                filtrarVocesPorIdiomaLive();
                if (vozPredeterminada) {
                    const selVoz = document.getElementById('selector-voz-live');
                    if (selVoz) {
                        const existeVoz = [...selVoz.options].some(o => o.value === vozPredeterminada);
                        if (existeVoz) {
                            selVoz.value = vozPredeterminada;
                            const inpVozLive = document.getElementById('busqueda-voz-live');
                            if (inpVozLive) inpVozLive.value = vozPredeterminada;
                        }
                    }
                }
            }
        }, 1300);

        // FASE 7: Acoplamiento de Componentes en el DOM
        logCarga("Aplicando ajustes a la interfaz visual...");
        window.safeUI = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        window.safeCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

        safeUI('rng-velocidad', velocidadLectura); safeUI('num-velocidad', velocidadLectura);
        safeUI('rng-tono', pitchLectura); safeUI('num-tono', pitchLectura);
        safeUI('rng-pausa', pausaPunto); safeUI('num-pausa', pausaPunto);
        safeUI('color-resaltado', ajustes?.color || "#ffff00");
        safeUI('rng-pad-karaoke', ajustes?.padKaraoke ?? 2);
        safeUI('color-guia-oracion', ajustes?.colorGuia || "#00b4ff");
        safeUI('rng-pad-guia', ajustes?.padGuia ?? 2);
        safeUI('rng-margen-pdf', ajustes?.margenPDF ?? 20);

        safeCheck('chk-llenado-fluido', ajustes?.llenado ?? false);
        safeCheck('chk-seguir-texto', window.seguirTextoActivo);
        safeCheck('chk-paren', ajustes?.omitirParen ?? true);
        safeCheck('chk-corch', ajustes?.omitirCorch ?? true);
        safeCheck('chk-llaves', ajustes?.omitirLlaves ?? true);
        safeCheck('chk-urls', ajustes?.omitirUrls ?? true);
        safeCheck('chk-referencias', ajustes?.omitirReferencias ?? true);
        safeCheck('chk-usar-bloques', ajustes?.usarBloquesNativos ?? true);

        const rngSalto = document.getElementById('rng-sensibilidad-salto');
        if (rngSalto) {
            rngSalto.value = ajustes?.sensibilidadSalto ?? 0.5;
            document.getElementById('lbl-sensibilidad').innerText = rngSalto.value;
        }

        safeCheck('chk-detectar-sangria', ajustes?.detectarSangria ?? true);
        safeCheck('chk-detectar-sangria-main', ajustes?.detectarSangria ?? true);
        const rngSaltoMain = document.getElementById('rng-sensibilidad-salto-main');
        if (rngSaltoMain) {
            rngSaltoMain.value = ajustes?.sensibilidadSalto ?? 0.5;
            document.getElementById('lbl-sensibilidad-main').innerText = rngSaltoMain.value;
        }

        const zenHabilitado = ajustes?.modo_zen ?? true;
        safeCheck('chk-modo-zen', zenHabilitado);
        if (typeof toggleModoZen === 'function') {
            toggleModoZen(zenHabilitado);
        }

        try { toggleOpcionesSegmentacion(); } catch (e) { }

        safeCheck('chk-alto-rendimiento', ajustes?.alto_rendimiento ?? false);
        safeCheck('chk-buffer-extendido', ajustes?.buffer_extendido ?? false);
        safeCheck('chk-teatro-global', ajustes?.teatro_activo ?? false);
        safeCheck('chk-kofi', ajustes?.mostrarKofi ?? true);
        safeCheck('chk-auto-avance', ajustes?.auto_avance ?? true);
        safeCheck('chk-pausa-sistema', ajustes?.pausa_sistema ?? false);
        safeCheck('chk-ducking-volumen', ajustes?.ducking_volumen ?? false);
        safeUI('rng-ducking-nivel', ajustes?.ducking_nivel ?? 20);
        const lblNivel = document.getElementById('lbl-ducking-nivel');
        if (lblNivel) lblNivel.innerText = (ajustes?.ducking_nivel ?? 20) + '%';

        safeCheck('btn-tema-config', ajustes?.tema_oscuro ?? false);
        if (ajustes?.tema_oscuro && typeof toggleDarkMode === 'function') {
            toggleDarkMode(true, false);
        }

        const idiomaUiGuardado = ajustes?.idioma_ui || 'en';
        const radioIdioma = document.querySelector(`input[name="radio-idioma"][value="${idiomaUiGuardado}"]`);
        if (radioIdioma) {
            radioIdioma.checked = true;
            if (typeof toggleIdiomaDrop === 'function') toggleIdiomaDrop(idiomaUiGuardado);
        }

        // Aplicar visibilidad inicial
        const btnKofi = document.getElementById('btn-kofi-global');
        if (btnKofi) {
            btnKofi.style.display = (ajustes?.mostrarKofi ?? true) ? 'flex' : 'none';
        }

        const hideFiltros = ajustes?.hide_filtros ?? false;
        safeCheck('chk-hide-filtros', hideFiltros);
        if (typeof toggleVisibilidadElemento === 'function') {
            toggleVisibilidadElemento('.fila-filtros', hideFiltros);
        }

        const hideDicc = ajustes?.hide_dicc ?? false;
        safeCheck('chk-hide-dicc', hideDicc);
        if (typeof toggleVisibilidadElemento === 'function') {
            toggleVisibilidadElemento('#btn-dicc', hideDicc);
        }

        const hideTeatro = ajustes?.hide_teatro ?? false;
        safeCheck('chk-hide-teatro', hideTeatro);
        if (typeof toggleVisibilidadElemento === 'function') {
            toggleVisibilidadElemento('#btn-teatro', hideTeatro);
        }

        const hideMp3 = ajustes?.hide_mp3 ?? false;
        safeCheck('chk-hide-mp3', hideMp3);
        if (typeof toggleVisibilidadElemento === 'function') {
            toggleVisibilidadElemento('#btn-abrir-descarga', hideMp3);
        }

        // Sincronizar ducking al cargar
        if (document.getElementById('rng-ducking-flotante')) {
            document.getElementById('rng-ducking-flotante').value = (ajustes?.ducking_nivel ?? 20);
            document.getElementById('lbl-ducking-flotante-nivel').innerText = (ajustes?.ducking_nivel ?? 20) + '%';
        }
        if (typeof aplicarVisibilidadDucking === 'function') aplicarVisibilidadDucking();

        // Sincronizar estado de Traducción
        const tradActiva = ajustes?.traduccion_activa ?? false;
        safeCheck('chk-traduccion-activa', tradActiva);
        safeCheck('zen-chk-traduccion-activa', tradActiva);
        const tradOrigen = ajustes?.traduccion_origen ?? 'auto';
        const tradDestino = ajustes?.traduccion_destino ?? 'es';
        const tradModo = ajustes?.traduccion_modo ?? 'solo_traduccion';
        safeUI('sel-traduccion-origen', tradOrigen);
        safeUI('zen-sel-traduccion-origen', tradOrigen);
        safeUI('sel-traduccion-destino', tradDestino);
        safeUI('zen-sel-traduccion-destino', tradDestino);
        safeUI('sel-traduccion-motor', ajustes?.traduccion_motor ?? 'online');
        safeUI('sel-traduccion-modo', tradModo);
        safeUI('zen-sel-traduccion-modo', tradModo);
        safeCheck('chk-pretraducir-paginas', ajustes?.pretraducir_paginas ?? true);

        if (typeof toggleMenuTraduccion === 'function') {
            toggleMenuTraduccion(tradActiva);
        }
        if (typeof actualizarVisibilidadBtnTraduccion === 'function') {
            actualizarVisibilidadBtnTraduccion();
        }

        // Subtítulos: Interlineado y Separación de palabras
        const subLineHeight = ajustes?.sub_lineheight ?? 12;
        const subWordGap = ajustes?.sub_wordgap ?? 2;
        safeUI('rng-sub-lineheight', subLineHeight);
        safeUI('rng-sub-wordgap', subWordGap);
        const lblLH = document.getElementById('val-sub-lineheight');
        if (lblLH) lblLH.innerText = (subLineHeight / 10).toFixed(1);
        const lblWG = document.getElementById('val-sub-wordgap');
        if (lblWG) lblWG.innerText = subWordGap + 'px';
        if (typeof aplicarSubtituloEspaciado === 'function') aplicarSubtituloEspaciado();


        // Control del nuevo interruptor de rendimiento
        const precargarVocesRAM = ajustes?.precargaRAM ?? false;
        safeCheck('chk-precarga-ram', precargarVocesRAM);

        // Restaurar estado de modelos de LiraAI y opciones de lectura
        if (typeof estadoIA !== 'undefined') {
            if (ajustes?.ia_modelo_chat) estadoIA.modeloChatSeleccionado = ajustes.ia_modelo_chat;
            if (ajustes?.ia_modelo_embed) estadoIA.modeloEmbedSeleccionado = ajustes.ia_modelo_embed;
        }
        if (typeof configProveedores !== 'undefined') {
            if (ajustes?.ia_proveedor_activo) configProveedores.proveedorActivo = ajustes.ia_proveedor_activo;
            if (ajustes?.ia_cloud_keys && typeof ajustes.ia_cloud_keys === 'object') {
                configProveedores.keys = Object.assign({}, configProveedores.keys, ajustes.ia_cloud_keys);
            }
            if (ajustes?.ia_cloud_modelos && typeof ajustes.ia_cloud_modelos === 'object') {
                configProveedores.modelos = Object.assign({}, configProveedores.modelos, ajustes.ia_cloud_modelos);
            }
        }
        if (typeof cambiarProveedorIA === 'function') {
            cambiarProveedorIA(ajustes?.ia_proveedor_activo || 'ollama');
        }
        const iaLeerBloque = ajustes?.ia_leer_bloque_clic ?? true;
        safeCheck('chk-ia-leer-bloque', iaLeerBloque);
        safeCheck('chk-ia-leer-bloque-config', iaLeerBloque);

        const modoSalidaRestaurado = ajustes?.ia_modo_salida || 'trazabilidad';
        safeUI('sel-ia-modo-salida', modoSalidaRestaurado);
        safeUI('sel-ia-modo-salida-config', modoSalidaRestaurado);
        if (typeof cambiarModoSalidaIA === 'function') {
            cambiarModoSalidaIA(modoSalidaRestaurado);
        }

        sincronizarVolumen(volumenPorcentaje);
        aplicarMargenDinamico(ajustes?.margenPDF ?? 20);

        let boxTexto = document.getElementById('texto-lectura');
        boxTexto.style.fontSize = tamanoLetraActual + "px";

        // Listeners estructurales para Zoom táctil/rueda
        boxTexto.addEventListener('wheel', function (e) {
            if (e.ctrlKey) {
                e.preventDefault();
                tamanoLetraActual += (e.deltaY < 0 ? 2 : -2);
                if (tamanoLetraActual < 10) tamanoLetraActual = 10;
                if (tamanoLetraActual > 60) tamanoLetraActual = 60;
                boxTexto.style.fontSize = tamanoLetraActual + "px";
            }
        }, { passive: false });

        let visorContainer = document.getElementById('visor-container');
        visorContainer.addEventListener('wheel', function (e) {
            if (e.ctrlKey) {
                e.preventDefault();
                nivelZoomPDF += (e.deltaY < 0 ? 0.1 : -0.1);
                if (nivelZoomPDF < 0.2) nivelZoomPDF = 0.2;
                if (nivelZoomPDF > 5.0) nivelZoomPDF = 5.0;
                if (datosPagina) {
                    canvas.style.width = (datosPagina.ancho_img * nivelZoomPDF) + "px";
                    canvas.style.height = (datosPagina.alto_img * nivelZoomPDF) + "px";
                }
            } else if (e.altKey) {
                e.preventDefault();
                visorContainer.scrollLeft += e.deltaY;
            }
        }, { passive: false });

        // 🧠 FASE 8: Calentamiento Síncrono de RAM 
        if (precargarVocesRAM && vocesFavoritas && vocesFavoritas.length > 0) {

            // 🛡️ REINSERCIÓN VISUAL ABSOLUTA: 
            // Invocamos la pantalla manualmente. Esto anula cualquier 'display: none' accidental de fases previas.
            invocarPantallaCarga("Calentando RAM con modelos acústicos...");
            logCarga("Calentando RAM con modelos acústicos...");

            console.log(`[⏱️ ${performance.now().toFixed(0)}ms] 🚀 Enviando orden a Python: gestionar_ram_favoritos`);

            clearTimeout(seguroDeVida);

            try {
                await eel.gestionar_ram_favoritos(vocesFavoritas)();
                console.log(`[⏱️ ${performance.now().toFixed(0)}ms] 🟢 Python devolvió el control a JavaScript.`);
            } catch (e) {
                console.error(`[⏱️ ${performance.now().toFixed(0)}ms] ❌ Falla en la promesa de Eel:`, e);
            }

            console.log(`[⏱️ ${performance.now().toFixed(0)}ms] ⏳ Aplicando retención visual forzada (3500ms)...`);
            await new Promise(resolve => setTimeout(resolve, 3500));
            console.log(`[⏱️ ${performance.now().toFixed(0)}ms] ⏰ Retención visual terminada.`);
        } else {
            console.log(`[⏱️ ${performance.now().toFixed(0)}ms] ⏭️ Fase 8 omitida. Precarga apagada o sin favoritos.`);
        }

        logCarga("¡Arranque exitoso! Liberando interfaz...");

    } catch (error) {
        logCarga("❌ Error crítico: " + error.message);
        console.error("🔥 Error detectado en flujo de arranque:", error);
    } finally {
        console.log(`[⏱️ ${performance.now().toFixed(0)}ms] 🪓 Ejecutando guillotina final (retirarPantallaCarga).`);
        clearTimeout(seguroDeVida);
        retirarPantallaCarga();
    }
}; // Fin del window.onload




// --- GUILLOTINA FINAL: RETIRAR PANTALLA DE CARGA
// Se ejecuta solo cuando todo el modelo interno ha sido construido
const pantallaCarga = document.getElementById('pantalla-carga');
if (pantallaCarga) {
    pantallaCarga.style.opacity = '0';
    setTimeout(() => pantallaCarga.style.display = 'none', 500);

};


// Listeners de alta eficiencia (Solo guardan al soltar el control)
const controles = [
    'color-resaltado', 'rng-pad-karaoke', 'color-guia-oracion',
    'rng-pad-guia', 'rng-margen-pdf', 'chk-llenado-fluido',
    'chk-seguimiento', 'chk-paren', 'chk-corch', 'chk-llaves', 'chk-urls',
    'rng-velocidad', 'num-velocidad', 'rng-tono', 'num-tono',
    'rng-pausa', 'num-pausa', 'rng-volumen-master', 'num-volumen-master', 'chk-teatro-global'
];

controles.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', () => {
            // 1. Sincronía básica de sliders/números
            if (id.includes('velocidad')) sincronizarInput('velocidad');
            else if (id.includes('tono')) sincronizarInput('tono');
            else if (id.includes('pausa')) sincronizarInput('pausa');
            else if (id.includes('volumen')) sincronizarVolumen(el.value);
            else if (id === 'rng-margen-pdf') aplicarMargenDinamico(el.value);

            // ❌ ELIMINAMOS EL LLAMADO A actualizarFiltrosSnapshot() AQUÍ.
            // Dejamos que el checkbox en el HTML lo haga solo una vez.

            // 2. Solo guardamos el estado para que Python esté actualizado
            guardarTodosAjustes();
            dibujar();
        });
    }
});

document.addEventListener('mousedown', (e) => {
    // Si NO estamos tocando un buscador, una lista .opcion-combo, o una opción interna
    if (!e.target.closest('.opcion-combo') &&
        !e.target.id.includes('busqueda-') &&
        !e.target.closest('option')) {

        const idio = document.getElementById('modal-filtro-idioma');
        const voz = document.getElementById('modal-voz');
        if (idio) idio.style.display = 'none';
        if (voz) voz.style.display = 'none';
    }
});


eel.expose(actualizar_progreso_modal);
function actualizar_progreso_modal(paso, total) {
    const barra = document.getElementById('barra-progreso');
    const texto = document.getElementById('txt-estado-descarga');
    if (!barra || !texto) return;

    // 1. Calculamos el porcentaje real que reporta Python
    const porcentajeReal = (paso / total) * 100;

    // 2. Limpiamos cualquier animación previa para evitar solapamientos
    clearInterval(intervaloMicroAvance);

    // 3. MOTOR DE INTERPOLACIÓN (Micro-avances inventados)
    // Estimamos que una página tarda ~1.8 segundos en procesarse con tu Ryzen 7600
    const duracionEstimadaMs = 1800;
    const fps = 25; // Suavidad visual
    const pasosTotales = (duracionEstimadaMs / 1000) * fps;
    const incrementoPorPaso = (porcentajeReal - progresoVisualActual) / pasosTotales;

    let contadorTicks = 0;

    intervaloMicroAvance = setInterval(() => {
        if (contadorTicks < pasosTotales) {
            // Avanzamos el porcentaje visual poco a poco
            progresoVisualActual += incrementoPorPaso;

            // 🚀 EFECTO VIVO: Un pequeño ruido aleatorio para que se sienta dinámico
            let visualRealista = progresoVisualActual + (Math.random() * 0.15);

            // Umbral de seguridad: No llegar al 100% hasta que Python termine realmente
            if (visualRealista > 99.1 && paso < total) visualRealista = 99.1;

            // Actualizamos la interfaz
            barra.style.width = visualRealista + "%";
            texto.innerText = `Cocinando estudio: ${Math.floor(visualRealista)}% (Pág. ${paso}/${total})`;

            contadorTicks++;
        } else {
            // Sincronización final con el dato real de Python
            progresoVisualActual = porcentajeReal;
            barra.style.width = porcentajeReal + "%";
            clearInterval(intervaloMicroAvance);
        }
    }, 1000 / fps);
}
// --- MOTOR DE BÚSQUEDA (Ctrl + F) ---

document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.key === 'f') {
        e.preventDefault(); // Evita que el navegador use su propio buscador
        const panel = document.getElementById('panel-busqueda');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        if (panel.style.display === 'block') document.getElementById('input-busqueda-pdf').focus();
    }
});

function cerrarBuscadorPDF() {
    // 1. Ocultamos el panel
    document.getElementById('panel-busqueda').style.display = 'none';

    // 2. Limpiamos el marcador visual
    resaltadoBusqueda = null;

    // 3. Forzamos redibujado para quitar el naranja del PDF
    dibujar();
}

// Escuchar el Enter en el input
document.getElementById('input-busqueda-pdf').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') ejecutarBusquedaPDF();
});

async function ejecutarBusquedaPDF() {
    const query = document.getElementById('input-busqueda-pdf').value.trim();
    if (query.length < 3) return;

    const contenedor = document.getElementById('resultados-busqueda');
    contenedor.innerHTML = "<div style='font-size:11px; color:#7f8c8d; text-align:center; padding:10px;'>🔍 Buscando en el documento...</div>";

    try {
        const resultados = await eel.buscar_texto_avanzado(query)();
        contenedor.innerHTML = "";

        if (!resultados || resultados.length === 0) {
            contenedor.innerHTML = "<div style='font-size:11px; color:#c0392b; text-align:center; padding:10px;'>Sin coincidencias.</div>";
            return;
        }

        resultados.forEach(res => {
            const div = document.createElement('div');
            div.style = "padding:10px; border-bottom:1px solid #eee; cursor:pointer; transition:background 0.2s; border-left: 3px solid transparent;";

            // Efecto Hover visual
            div.onmouseover = () => {
                div.style.background = "#f1f2f6";
                div.style.borderLeftColor = "#2980b9";
            };
            div.onmouseout = () => {
                div.style.background = "white";
                div.style.borderLeftColor = "transparent";
            };

            // Lógica al hacer clic: Salto + Resaltado
            div.onclick = () => {
                // 1. Cargamos las coordenadas para el marcador
                resaltadoBusqueda = res.coords;

                // 2. Cambiamos el valor del input de página (índice real para el usuario)
                // Usamos res.pagina que viene de Python (base 1)
                document.getElementById('input-pagina-actual').value = res.pagina;

                // 3. Llamamos a tu función estable de navegación
                irAPaginaDirecta();

                console.log(`🎯 Saltando a pág ${res.pagina} y resaltando coordenadas.`);
            };

            div.innerHTML = `
                <div style="font-weight:bold; color:#2980b9; font-size:11px; margin-bottom:3px;">Página ${res.pagina}</div>
                <div style="font-size:10px; color:#2d3436; line-height:1.3; font-style:italic;">"${res.frase}"</div>
            `;
            contenedor.appendChild(div);
        });
    } catch (error) {
        console.error("Error en búsqueda:", error);
        contenedor.innerHTML = "<div style='color:red; font-size:10px;'>Error en el motor de búsqueda.</div>";
    }
}

function aplicarResaltadoBuscador(ctx, factorZoom) {
    const fuente = window.resaltadoBusqueda || (typeof resaltadoBusqueda !== 'undefined' ? resaltadoBusqueda : null);
    if (!fuente) return;

    ctx.save();

    // Normalizar a una lista de rectángulos
    let rects = [];
    if (Array.isArray(fuente)) {
        if (fuente.length > 0 && Array.isArray(fuente[0])) {
            rects = fuente;
        } else if (fuente.length >= 4 && typeof fuente[0] === 'number') {
            rects = [fuente];
        }
    } else if (fuente && typeof fuente === 'object' && fuente.rects) {
        rects = fuente.rects;
    }

    if (!rects || rects.length === 0) {
        ctx.restore();
        return;
    }

    // Resaltado visual moderno, visible y elegante para las líneas del fragmento
    ctx.fillStyle = "rgba(108, 92, 231, 0.28)";
    ctx.strokeStyle = "rgba(95, 39, 205, 0.85)";
    ctx.lineWidth = 1.5;

    const padH = 2.0;
    const padV = 1.5;
    for (let r of rects) {
        const [x0, y0, x1, y1] = r;
        const rectX = (x0 * factorZoom) - padH;
        const rectY = (y0 * factorZoom) - padV;
        const rectW = Math.max(8, ((x1 - x0) * factorZoom) + (padH * 2));
        const rectH = Math.max(8, ((y1 - y0) * factorZoom) + (padV * 2));

        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(rectX, rectY, rectW, rectH, 3);
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.fillRect(rectX, rectY, rectW, rectH);
            ctx.strokeRect(rectX, rectY, rectW, rectH);
        }
    }

    // Si existe Bounding Box del fragmento, dibujar una barra lateral indicadora en el margen
    const bbox = window.resaltadoBBox || (fuente && fuente.bbox ? fuente.bbox : null);
    if (bbox && Array.isArray(bbox) && bbox.length >= 4) {
        const [bx0, by0, bx1, by1] = bbox;
        ctx.fillStyle = "#6c5ce7";
        const barX = Math.max(0, (bx0 * factorZoom) - 8);
        const barY = by0 * factorZoom;
        const barH = Math.max(16, (by1 - by0) * factorZoom);
        ctx.fillRect(barX, barY, 4, barH);
    }

    ctx.restore();
}

// --- FUNCIONES DE CONTROL DE MODAL TEATRO ---
function abrirTeatro() {
    detenerLectura();

    // 🛡️ LÓGICA DE EXCLUSIÓN MUTUA UNIVERSAL
    if (typeof cerrarOtrasFuncionesPrincipales === 'function') {
        cerrarOtrasFuncionesPrincipales('teatro');
    }

    const modal = document.getElementById('modal-teatro');
    if (modal) {
        modal.style.display = 'flex';
        cargarIdiomasTeatro();
        renderizarSidebarTeatro();
        renderizarActores();
    }
}

function cerrarTeatro() {
    const modal = document.getElementById('modal-teatro');
    if (modal) modal.style.display = 'none';
    // Persistencia: Guardar el estado al salir
    if (typeof guardarAjustesTeatro === "function") guardarAjustesTeatro();
}


function cargarIdiomasTeatro() {
    const selIdioma = document.getElementById('select-idioma-teatro');
    if (!selIdioma) return;

    // Usamos el mapa que ya tienes definido para mantener la consistencia
    selIdioma.innerHTML = Object.entries(MAPA_IDIOMAS).map(([iso, nombre]) =>
        `<option value="${iso}">${nombre}</option>`
    ).join('');

    filtrarVocesTeatro();
}

function filtrarVocesTeatro() {
    const lang = document.getElementById('select-idioma-teatro').value; // Ej: 'es'
    const selVoz = document.getElementById('select-voz-teatro');
    if (!selVoz) return;

    selVoz.innerHTML = "";

    // 1. Añadimos Piper (Locales)
    // Usamos includes() o regex para que 'es' detecte 'es_MX' o 'es-ES'
    vocesPython.filter(v => v.id.toLowerCase().includes(lang.toLowerCase())).forEach(v => {
        let opt = document.createElement('option');
        // VITAL: El ID para el teatro debe ser el mismo que usa el selector principal: "Local-archivo.onnx"
        let idFinal = v.id.startsWith("Local-") ? v.id : "Local-" + v.id;
        opt.value = idFinal;
        opt.innerText = "[Piper] " + v.nombre.replace("⚡ ", ""); // Evitamos duplicar el rayito
        selVoz.appendChild(opt);
    });

    // 2. Añadimos Sistema (Navegador)
    vocesSistema.filter(v => v.lang.toLowerCase().startsWith(lang.toLowerCase())).forEach(v => {
        let opt = document.createElement('option');
        opt.value = v.name;
        opt.innerText = "[Edge] " + v.name;
        selVoz.appendChild(opt);
    });

    console.log(`🎭 Catálogo de Teatro filtrado para: ${lang} (Piper: ${selVoz.querySelectorAll('option[value^="Local-"]').length})`);
}

function renderizarActores() {
    // Si no hay obra seleccionada o no existe la DB, abortamos para evitar crash
    if (!obraActualTeatro || !dbTeatro[obraActualTeatro]) {
        document.getElementById('tabla-actores').innerHTML =
            "<div style='color:#7f8c8d; font-size:11px; text-align:center; padding:20px;'>Crea o selecciona una obra para asignar actores.</div>";
        return;
    }

    const contenedor = document.getElementById('tabla-actores');
    const filtro = document.getElementById('buscador-actores')?.value.toLowerCase() || "";
    contenedor.innerHTML = "";

    const actores = dbTeatro[obraActualTeatro].actors;

    for (let personaje in actores) {
        const data = actores[personaje];
        const fila = document.createElement('div');
        fila.className = "fila-termino fila-actor"; // Reutiliza estilos + nuevo hook
        fila.draggable = true;
        fila.dataset.personaje = personaje; // Para identificarlo al soltar

        fila.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                <input type="checkbox" class="switch-individual" ${data.on ? 'checked' : ''} 
                       onchange="toggleActorIndividual('${personaje}', this.checked)">
                <div style="display:flex; flex-direction:column; cursor:pointer; flex:1; min-width:0;" onclick="prepararEdicionActor('${personaje}')">
                    <span style="font-weight:700; color:#2c3e50;">${personaje}</span>
                    <span class="badge-voz-actor"><img src="assets/imagenes/voces/piper.svg" class="svg-icon" style="margin:0; width:12px; height:12px;"> ${data.voz.replace("Local-", "")}</span>
                </div>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
                <span class="btn-editar-term" onclick="prepararEdicionActor('${personaje}')" title="Editar">
                    <svg class="svg-icon" viewBox="0 0 16 16" fill="currentColor" style="width:14px; height:14px;">
                        <path d="M8.29289 3.70711L1 11V15H5L12.2929 7.70711L8.29289 3.70711Z"/>
                        <path d="M9.70711 2.29289L13.7071 6.29289L15.1716 4.82843C15.702 4.29799 16 3.57857 16 2.82843C16 1.26633 14.7337 0 13.1716 0C12.4214 0 11.702 0.297995 11.1716 0.828428L9.70711 2.29289Z"/>
                    </svg>
                </span>
                <span onclick="borrarActor('${personaje}')" class="btn-borrar-term" title="Eliminar">✕</span>
            </div>
        `;

        function habilitarDragTeatro(contenedor) {
            contenedor.addEventListener('dragover', e => {
                e.preventDefault();
                const draggingItem = document.querySelector('.dragging');
                if (!draggingItem || !draggingItem.classList.contains('fila-actor')) return;

                const afterElement = getDragAfterElement(contenedor, e.clientY);
                if (afterElement == null) {
                    contenedor.appendChild(draggingItem);
                } else {
                    contenedor.insertBefore(draggingItem, afterElement);
                }
            });
        }

        async function guardarOrdenTeatro() {
            let nuevoOrdenActors = {};
            const filas = document.querySelectorAll('.fila-actor');

            filas.forEach(f => {
                const personaje = f.dataset.personaje;
                nuevoOrdenActors[personaje] = dbTeatro[obraActualTeatro].actors[personaje];
            });

            // Actualizamos RAM y persistencia
            dbTeatro[obraActualTeatro].actors = nuevoOrdenActors;
            await eel.guardar_diccionario_teatro(dbTeatro)();
            console.log("🎭 Elenco reordenado y sincronizado.");
        }

        // Eventos de Drag & Drop
        fila.addEventListener('dragstart', () => fila.classList.add('dragging'));
        fila.addEventListener('dragend', () => {
            fila.classList.remove('dragging');
            guardarOrdenTeatro();
        });

        contenedor.appendChild(fila);
    }

    // Habilitar el radar de proximidad
    habilitarDragTeatro(contenedor);
}


async function agregarActor() {
    if (!obraActualTeatro) return alert("Selecciona o crea una obra primero.");

    const inPersonaje = document.getElementById('input-personaje');
    const selVoz = document.getElementById('select-voz-teatro');

    let nombre = inPersonaje.value.trim();
    // Forzamos que termine en ":" si el usuario lo olvida para la coherencia del Regex
    if (nombre && !nombre.endsWith(":")) nombre += ":";

    if (nombre) {
        // 1. Inyección en el Modelo (dbTeatro)
        dbTeatro[obraActualTeatro].actors[nombre] = {
            voz: selVoz.value,
            on: true
        };

        // 2. Persistencia en disco vía Python
        await eel.guardar_diccionario_teatro(dbTeatro)();

        // 3. Limpieza y Feedback
        inPersonaje.value = "";
        renderizarActores();
        inPersonaje.focus();

        console.log(`🎭 Actor asignado: ${nombre} con voz ${selVoz.value}`);
    }
}

// --- FUNCIONES DE PERSISTENCIA Y ESTADO ---
window.toggleActorIndividual = async (personaje, estado) => {
    if (dbTeatro[obraActualTeatro] && dbTeatro[obraActualTeatro].actors[personaje]) {
        dbTeatro[obraActualTeatro].actors[personaje].on = estado;
        await eel.guardar_diccionario_teatro(dbTeatro)();
        renderizarActores();
    }
};

async function eliminarObraTeatro(nombre) {
    if (confirm(`¿Eliminar la obra "${nombre}"?`)) {
        delete dbTeatro[nombre];
        obraActualTeatro = Object.keys(dbTeatro)[0] || null;
        await eel.guardar_diccionario_teatro(dbTeatro)();
        renderizarSidebarTeatro();
        renderizarActores();
    }
}

async function borrarActor(personaje) {
    if (confirm(`¿Eliminar al actor ${personaje}?`)) {
        delete dbTeatro[obraActualTeatro].actors[personaje];
        await eel.guardar_diccionario_teatro(dbTeatro)();
        renderizarActores();
    }
}

function prepararEdicionActor(personaje) {
    const data = dbTeatro[obraActualTeatro].actors[personaje];
    document.getElementById('input-personaje').value = personaje;
    document.getElementById('select-voz-teatro').value = data.voz;
}

function renderizarSidebarTeatro() {
    const lista = document.getElementById('lista-obras-teatro');
    lista.innerHTML = "";

    for (let obra in dbTeatro) {
        const div = document.createElement('div');
        div.className = `tab-item tab-teatro ${obraActualTeatro === obra ? 'active' : ''}`;

        div.innerHTML = `
            <span onclick="seleccionarObraTeatro('${obra}')" style="flex:1; cursor:pointer;">
                🎭 ${obra}
            </span>
            <span onclick="eliminarObraTeatro('${obra}'); event.stopPropagation();" 
                  class="btn-cerrar-bloque" title="Eliminar obra">✕</span>
        `;
        lista.appendChild(div);
    }
}

function seleccionarObraTeatro(nombre) {
    obraActualTeatro = nombre;
    renderizarSidebarTeatro();
    renderizarActores();
    guardarTodosAjustes(); // 💾 Notificamos a Python el cambio de obra
}

async function crearObraTeatro() {
    const input = document.getElementById('input-nueva-obra');
    const nombre = input.value.trim();
    if (nombre && !dbTeatro[nombre]) {
        dbTeatro[nombre] = { active: true, actors: {} };
        await eel.guardar_diccionario_teatro(dbTeatro)();
        input.value = "";
        seleccionarObraTeatro(nombre);
    }
}

function abrirLegalExterno(nombre_archivo) {
    if (typeof eel !== 'undefined' && eel.abrir_documento_legal) {
        eel.abrir_documento_legal(nombre_archivo)();
    } else {
        window.open(nombre_archivo, '_blank');
    }
}

// -------------------------------------------------------------
// FUNCIONES DE DUCKING UI
// -------------------------------------------------------------
window.sincronizarDuckingNivel = function (valor) {
    // Sincronizar slider principal
    let rngPrincipal = document.getElementById('rng-ducking-nivel');
    let lblPrincipal = document.getElementById('lbl-ducking-nivel');
    if (rngPrincipal) rngPrincipal.value = valor;
    if (lblPrincipal) lblPrincipal.innerText = valor + '%';

    // Sincronizar slider flotante
    let rngFlotante = document.getElementById('rng-ducking-flotante');
    let lblFlotante = document.getElementById('lbl-ducking-flotante-nivel');
    if (rngFlotante) rngFlotante.value = valor;
    if (lblFlotante) lblFlotante.innerText = valor + '%';

    let chkDucking = document.getElementById('chk-ducking-volumen');
    let isActive = chkDucking ? chkDucking.checked : false;

    // Actualizar en tiempo real el audio del sistema
    if (typeof eel !== 'undefined' && eel.set_persistent_duck) {
        eel.set_persistent_duck(isActive, valor)();
    }

    // Guardar cambios
    if (typeof guardarTodosAjustes === 'function') guardarTodosAjustes(false);
};

window.aplicarVisibilidadDucking = function () {
    let panelFlotante = document.getElementById('panel-ducking-flotante');
    let chkDucking = document.getElementById('chk-ducking-volumen');
    let rngPrincipal = document.getElementById('rng-ducking-nivel');
    let valor = rngPrincipal ? rngPrincipal.value : 20;

    if (panelFlotante && chkDucking) {
        if (chkDucking.checked) {
            panelFlotante.style.display = 'flex';
        } else {
            panelFlotante.style.display = 'none';
        }
    }

    // Aplicar o quitar el ducking permanente en python
    let isActive = chkDucking ? chkDucking.checked : false;
    if (typeof eel !== 'undefined' && eel.set_persistent_duck) {
        eel.set_persistent_duck(isActive, valor)();
    }
};

// =============================================================
// FUNCIONES DE CONTROL DE TRADUCCIÓN HÍBRIDA & SUBTÍTULOS
// =============================================================
window.toggleMenuTraduccion = function (activo) {
    const panel = document.getElementById('panel-ajustes-traduccion');
    if (panel) panel.style.display = activo ? 'block' : 'none';
};

window.abrirConfiguracionTraduccion = function() {
    // Abrir la ventana modal de configuración avanzada
    if (typeof abrirConfiguracion === 'function') {
        abrirConfiguracion();
    }
    
    // Esperar a que se abra y hacer scroll hasta la sección de Traducción
    setTimeout(() => {
        const panel = document.getElementById('panel-ajustes-traduccion');
        if (panel) {
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Efecto visual para destacar la sección
            const originalShadow = panel.style.boxShadow;
            panel.style.boxShadow = '0 0 15px rgba(230, 126, 34, 0.8)';
            setTimeout(() => {
                panel.style.boxShadow = originalShadow;
            }, 1500);
        }
    }, 300);
};

window.actualizarVisibilidadBtnTraduccion = function() {
    const btn = document.getElementById('btn-traduccion');
    const chk = document.getElementById('chk-traduccion-activa');
    if (btn && chk) {
        if (chk.checked) {
            btn.style.background = '#e67e22'; // Naranja activo
            btn.style.color = 'white';
        } else {
            btn.style.background = ''; // Vuelve al estilo CSS secundario normal
            btn.style.color = '';
        }
    }
};

window.subtituloPalabrasActuales = [];
window.ultimoIdxSubtituloKaraoke = -1;

window.mostrarSubtituloTraduccion = function (texto, origen = 'AUTO', destino = 'ES') {
    const flotante = document.getElementById('subtitulo-traduccion-flotante');
    const txtCuerpo = document.getElementById('subtitulo-texto-traducido');
    const tagIdiomas = document.getElementById('subtitulo-idiomas-tag');
    if (!flotante || !txtCuerpo) return;

    window.ultimoIdxSubtituloKaraoke = -1;
    window.subtituloPalabrasActuales = [];

    const textoStr = String(texto || '').trim();
    if (!textoStr) {
        txtCuerpo.innerText = '...';
        return;
    }

    const fragmentos = textoStr.split(/\s+/).filter(w => w.length > 0);
    txtCuerpo.innerHTML = '';

    fragmentos.forEach((palabra, idx) => {
        const span = document.createElement('span');
        span.className = 'sub-palabra';
        span.id = `sub-palabra-${idx}`;
        span.dataset.idx = idx;
        span.innerText = palabra;
        txtCuerpo.appendChild(span);
        window.subtituloPalabrasActuales.push(span);
    });

    if (tagIdiomas) tagIdiomas.innerText = `${(origen || 'AUTO').toUpperCase()} ➔ ${(destino || 'ES').toUpperCase()}`;
    flotante.style.display = 'block';

    // Aplicar el espaciado configurado por el usuario
    if (typeof aplicarSubtituloEspaciado === 'function') aplicarSubtituloEspaciado();
};

window.actualizarKaraokeSubtitulos = function (tiempoAudioActual, pAudio, pIdx) {
    const flotante = document.getElementById('subtitulo-traduccion-flotante');
    if (!flotante || flotante.style.display === 'none' || !window.subtituloPalabrasActuales || window.subtituloPalabrasActuales.length === 0) {
        return;
    }

    const totalSubPalabras = window.subtituloPalabrasActuales.length;
    let targetIdx = -1;

    // Si hay partitura sincronizamos
    if (window.partituraActual && window.partituraActual.length > 0) {
        const ultimaRebanada = window.partituraActual[window.partituraActual.length - 1];
        const durTotal = (ultimaRebanada && ultimaRebanada.e > 0) ? ultimaRebanada.e : 1.0;

        // Si el audio es directo de la traducción (modo solo_traduccion o 2da fase aprendizaje)
        if (window.subtituloEsAudioDirecto && pAudio && pAudio.vIdx !== undefined) {
            targetIdx = Math.min(totalSubPalabras - 1, Math.max(0, pAudio.vIdx));
        } else {
            // Modo subtítulos (audio original): sincronizamos por tiempo relativo
            const progresoRel = Math.max(0, Math.min(1, tiempoAudioActual / durTotal));
            targetIdx = Math.min(totalSubPalabras - 1, Math.floor(progresoRel * totalSubPalabras));
        }
    } else if (pIdx !== -1) {
        targetIdx = Math.min(totalSubPalabras - 1, pIdx);
    }

    if (targetIdx === window.ultimoIdxSubtituloKaraoke) {
        return;
    }
    window.ultimoIdxSubtituloKaraoke = targetIdx;

    for (let i = 0; i < totalSubPalabras; i++) {
        const el = window.subtituloPalabrasActuales[i];
        if (!el) continue;
        if (i < targetIdx) {
            if (el.className !== 'sub-palabra sub-leida') {
                el.className = 'sub-palabra sub-leida';
            }
        } else if (i === targetIdx) {
            if (el.className !== 'sub-palabra sub-activa') {
                el.className = 'sub-palabra sub-activa';
            }
        } else {
            if (el.className !== 'sub-palabra') {
                el.className = 'sub-palabra';
            }
        }
    }
};

window.cerrarSubtituloTraduccion = function () {
    const flotante = document.getElementById('subtitulo-traduccion-flotante');
    if (flotante) flotante.style.display = 'none';
    window.subtituloPalabrasActuales = [];
    window.ultimoIdxSubtituloKaraoke = -1;
};

window.limpiarSubtitulosTraduccion = function () {
    cerrarSubtituloTraduccion();
};

window.aplicarSubtituloEspaciado = function () {
    const lineHeightRaw = parseInt(document.getElementById('rng-sub-lineheight')?.value ?? 12);
    const wordGapRaw = parseInt(document.getElementById('rng-sub-wordgap')?.value ?? 2);
    const lineHeight = (lineHeightRaw / 10).toFixed(1);   // 10→1.0, 12→1.2, 20→2.0
    const wordGap = wordGapRaw + 'px';

    // Actualizar etiquetas
    const lblLH = document.getElementById('val-sub-lineheight');
    if (lblLH) lblLH.innerText = lineHeight;
    const lblWG = document.getElementById('val-sub-wordgap');
    if (lblWG) lblWG.innerText = wordGap;

    // Aplicar al contenedor de subtítulos
    const cuerpo = document.getElementById('subtitulo-texto-traducido');
    if (cuerpo) {
        cuerpo.style.lineHeight = lineHeight;
        cuerpo.style.gap = `0px ${wordGap}`;
    }
};

window.dispararPretraduccionEntorno = function () {
    const pretraducirActivo = document.getElementById('chk-pretraducir-paginas')?.checked ?? true;
    const tradActiva = document.getElementById('chk-traduccion-activa')?.checked ?? false;
    if (pretraducirActivo && tradActiva && typeof paginaActual !== 'undefined' && typeof eel !== 'undefined' && typeof eel.pretraducir_bloque_paginas === 'function') {
        const origen = document.getElementById('sel-traduccion-origen')?.value || 'auto';
        const destino = document.getElementById('sel-traduccion-destino')?.value || 'es';
        const motor = document.getElementById('sel-traduccion-motor')?.value || 'online';
        eel.pretraducir_bloque_paginas(paginaActual, origen, destino, motor, true)();
    }
};
