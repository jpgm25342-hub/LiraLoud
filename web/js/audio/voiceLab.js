// 🧪 LABORATORIO DE MEZCLAS KOKORO (VOICE LAB)
// ==========================================

let audioCtxMuestraKokoro = null;
let fuenteMuestraKokoro = null;

function actualizarEtiquetasBlendKokoro() {
    const vozC = document.getElementById('sel-kokoro-blend-vozc')?.value || 'ninguna';
    const pesoCRaw = (vozC !== 'ninguna')
        ? parseInt(document.getElementById('rng-kokoro-blend-pesoc')?.value || 0)
        : 0;

    const lblPesoC = document.getElementById('lbl-kokoro-blend-pesoc-txt');
    if (lblPesoC) lblPesoC.innerText = `${pesoCRaw}%`;

    const ratioAB = parseInt(document.getElementById('rng-kokoro-blend-ratio')?.value || 70);
    const restante = 100 - pesoCRaw;

    const pesoA = Math.round((ratioAB / 100) * restante);
    const pesoB = Math.max(0, restante - pesoA);
    const pesoC = pesoCRaw;

    const lbl = document.getElementById('lbl-kokoro-blend-ratio-txt');
    if (lbl) {
        if (pesoC > 0 && vozC !== 'ninguna') {
            lbl.innerText = `${pesoA}% A / ${pesoB}% B / ${pesoC}% C`;
        } else {
            lbl.innerText = `${ratioAB}% A / ${100 - ratioAB}% B`;
        }
    }
}

function reproducirMuestraPCM(pcmBase64, sampleRate = 24000, perfilEq = 'estudio') {
    if (!pcmBase64) return;
    try {
        if (!audioCtxMuestraKokoro) {
            audioCtxMuestraKokoro = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: sampleRate });
        }
        if (audioCtxMuestraKokoro.state === 'suspended') {
            audioCtxMuestraKokoro.resume();
        }
        if (fuenteMuestraKokoro) {
            try { fuenteMuestraKokoro.stop(); } catch(e) {}
            fuenteMuestraKokoro = null;
        }

        const binario = atob(pcmBase64);
        const len = binario.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binario.charCodeAt(i);
        }

        const int16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
        }

        const buffer = audioCtxMuestraKokoro.createBuffer(1, float32.length, sampleRate);
        buffer.getChannelData(0).set(float32);

        fuenteMuestraKokoro = audioCtxMuestraKokoro.createBufferSource();
        fuenteMuestraKokoro.buffer = buffer;

        // Aplicar ecualización según el perfil acústico elegido
        let ultimoNodo = fuenteMuestraKokoro;
        if (perfilEq === 'estudio') {
            const eqWarmth = audioCtxMuestraKokoro.createBiquadFilter();
            eqWarmth.type = 'peaking';
            eqWarmth.frequency.value = 300;
            eqWarmth.gain.value = 1.8;
            eqWarmth.Q.value = 0.9;

            const eqDeHarsh = audioCtxMuestraKokoro.createBiquadFilter();
            eqDeHarsh.type = 'peaking';
            eqDeHarsh.frequency.value = 4200;
            eqDeHarsh.gain.value = -1.8;

            ultimoNodo.connect(eqWarmth);
            eqWarmth.connect(eqDeHarsh);
            ultimoNodo = eqDeHarsh;
        } else if (perfilEq === 'cristalino') {
            const eqAir = audioCtxMuestraKokoro.createBiquadFilter();
            eqAir.type = 'peaking';
            eqAir.frequency.value = 4800;
            eqAir.gain.value = 2.2;
            eqAir.Q.value = 0.8;
            ultimoNodo.connect(eqAir);
            ultimoNodo = eqAir;
        } else if (perfilEq === 'radio') {
            const eqBass = audioCtxMuestraKokoro.createBiquadFilter();
            eqBass.type = 'peaking';
            eqBass.frequency.value = 180;
            eqBass.gain.value = 2.8;
            eqBass.Q.value = 1.0;
            ultimoNodo.connect(eqBass);
            ultimoNodo = eqBass;
        }

        // Conectar al masterGain global si existe, o al destino directo
        if (typeof masterGain !== 'undefined' && masterGain) {
            ultimoNodo.connect(masterGain);
        } else {
            ultimoNodo.connect(audioCtxMuestraKokoro.destination);
        }

        fuenteMuestraKokoro.start(0);
        console.log(`🔊 [KOKORO LAB] Muestra reproduciéndose (Perfil: ${perfilEq}).`);
    } catch (err) {
        console.error("🔥 Error al reproducir muestra de voz:", err);
    }
}

async function probarMezclaKokoroLive() {
    const btn = document.getElementById('btn-probar-kokoro-blend');
    const icn = document.getElementById('icon-probar-kokoro-blend');
    const vozA = document.getElementById('sel-kokoro-blend-voza')?.value || 'ef_dora';
    const vozB = document.getElementById('sel-kokoro-blend-vozb')?.value || 'af_bella';
    const vozC = document.getElementById('sel-kokoro-blend-vozc')?.value || 'ninguna';
    const pesoCRaw = (vozC !== 'ninguna')
        ? parseInt(document.getElementById('rng-kokoro-blend-pesoc')?.value || 0)
        : 0;

    const ratioAB = parseInt(document.getElementById('rng-kokoro-blend-ratio')?.value || 70);
    const restante = 100 - pesoCRaw;
    const pA = ((ratioAB / 100) * restante / 100).toFixed(2);
    const pB = ((restante - Math.round((ratioAB / 100) * restante)) / 100).toFixed(2);
    const pC = (pesoCRaw / 100).toFixed(2);

    let voiceKey = `${vozA}:${pA}+${vozB}:${pB}`;
    if (vozC !== 'ninguna' && pesoCRaw > 0) {
        voiceKey += `+${vozC}:${pC}`;
    }

    const acento = document.getElementById('sel-kokoro-blend-acento')?.value || 'es-419';
    const perfilEq = document.getElementById('sel-kokoro-blend-eq')?.value || 'estudio';
    const expresividad = parseFloat(document.getElementById('sel-kokoro-blend-expresividad')?.value || 1.0);
    const cadencia = parseFloat(document.getElementById('sel-kokoro-blend-cadencia')?.value || 1.0);

    const nombreVoz = document.getElementById('txt-kokoro-blend-nombre')?.value?.trim();
    const frasePrueba = nombreVoz
        ? `Hola, esta es una prueba de mi nueva voz ${nombreVoz} con Kokoro.`
        : "Hola, esta es una prueba de mezcla personalizada con el motor neuronal Kokoro.";

    if (btn) btn.disabled = true;
    if (icn) icn.style.opacity = "0.5";

    try {
        console.log(`[KOKORO LAB] Solicitando muestra para: ${voiceKey} (${acento}) [EQ: ${perfilEq}, Exp: ${expresividad}, Cad: ${cadencia}]`);
        let res;
        try {
            res = await eel.probar_muestra_kokoro_blend(voiceKey, acento, frasePrueba, expresividad, cadencia)();
        } catch (argsErr) {
            console.warn("Servidor en memoria ejecutando versión de 3 parámetros. Reintentando con modo compatible...", argsErr);
            res = await eel.probar_muestra_kokoro_blend(voiceKey, acento, frasePrueba)();
        }

        if (res && res.exito && res.pcm_b64) {
            reproducirMuestraPCM(res.pcm_b64, res.sr || 24000, perfilEq);
        } else {
            await liraAlert("No se pudo generar la muestra: " + (res?.error || "Error desconocido"), 'error');
        }
    } catch (err) {
        const errorMsg = err?.error || err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
        console.error("Error al pedir muestra:", errorMsg, err);
        await liraAlert("Error al generar muestra: " + errorMsg, 'error');
    } finally {
        if (btn) btn.disabled = false;
        if (icn) icn.style.opacity = "1";
    }
}

async function guardarMezclaKokoroLive() {
    const inputNombre = document.getElementById('txt-kokoro-blend-nombre');
    let nombre = inputNombre?.value?.trim() || "";
    if (!nombre) {
        const sugerido = "Voz Personalizada " + Math.floor(Math.random() * 900 + 100);
        nombre = await liraPrompt("Introduce un nombre para tu voz personalizada:", sugerido, 'voz');
        if (!nombre || !nombre.trim()) return;
        nombre = nombre.trim();
        if (inputNombre) inputNombre.value = nombre;
    }

    const vozA = document.getElementById('sel-kokoro-blend-voza')?.value || 'ef_dora';
    const vozB = document.getElementById('sel-kokoro-blend-vozb')?.value || 'af_bella';
    const vozC = document.getElementById('sel-kokoro-blend-vozc')?.value || 'ninguna';
    const pesoCRaw = (vozC !== 'ninguna')
        ? parseInt(document.getElementById('rng-kokoro-blend-pesoc')?.value || 0)
        : 0;

    const ratioAB = parseInt(document.getElementById('rng-kokoro-blend-ratio')?.value || 70);
    const restante = 100 - pesoCRaw;
    const pA = ((ratioAB / 100) * restante / 100).toFixed(2);
    const pB = ((restante - Math.round((ratioAB / 100) * restante)) / 100).toFixed(2);
    const pC = (pesoCRaw / 100).toFixed(2);

    const acento = document.getElementById('sel-kokoro-blend-acento')?.value || 'es-419';
    const perfilEq = document.getElementById('sel-kokoro-blend-eq')?.value || 'estudio';
    const expresividad = parseFloat(document.getElementById('sel-kokoro-blend-expresividad')?.value || 1.0);
    const cadencia = parseFloat(document.getElementById('sel-kokoro-blend-cadencia')?.value || 1.0);

    const lang = acento.startsWith('en') ? 'en' :
                 (acento.startsWith('fr') ? 'fr' :
                 (acento.startsWith('it') ? 'it' :
                 (acento.startsWith('pt') ? 'pt' :
                 (acento.startsWith('ja') ? 'ja' :
                 (acento.startsWith('cmn') || acento.startsWith('zh') ? 'zh' :
                 (acento.startsWith('hi') ? 'hi' : 'es'))))));

    const btn = document.getElementById('btn-guardar-kokoro-blend');
    if (btn) btn.disabled = true;

    try {
        console.log(`💾 [KOKORO LAB] Guardando mezcla: ${nombre} (${vozA}:${pA} + ${vozB}:${pB} + ${vozC}:${pC}) [EQ: ${perfilEq}]`);
        let res;
        try {
            res = await eel.guardar_nueva_mezcla_kokoro(nombre, vozA, pA, vozB, pB, acento, lang, vozC, pC, perfilEq, expresividad, cadencia)();
        } catch (argsErr) {
            console.warn("⚠️ Servidor en memoria ejecutando versión previa de guardado. Guardando compatible...", argsErr);
            res = await eel.guardar_nueva_mezcla_kokoro(nombre, vozA, pA, vozB, pB, acento, lang)();
        }
        if (res && res.exito) {
            // Actualizar lista en UI
            await cargarYRenderizarMezclasKokoroUI();
            
            // Recargar catálogo de voces en Python y refrescar todos los selectores de la app
            const vocesActualizadas = await eel.obtener_voces_disponibles()();
            if (vocesActualizadas && vocesActualizadas.length > 0) {
                vocesPython = vocesActualizadas;
                if (typeof llenarTodosLosSelectores === 'function') llenarTodosLosSelectores();
                if (typeof actualizarListaVocesUI === 'function') actualizarListaVocesUI();
            }

            // Seleccionar automáticamente la voz recién creada en el selector principal
            const nuevoId = res.blend?.id;
            const selPrincipal = document.getElementById('selector-voz-live');
            if (selPrincipal && nuevoId) {
                selPrincipal.value = nuevoId;
                if (typeof cambiarVozLive === 'function') cambiarVozLive();
            }

            // Reiniciar campo de texto para la próxima voz
            if (inputNombre) inputNombre.value = "";

            // Notificación visual rápida
            if (btn) {
                const txtOriginal = btn.innerHTML;
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px;"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>¡Guardada!</span>`;
                btn.style.background = "#27ae60";
                setTimeout(() => {
                    btn.innerHTML = txtOriginal;
                    btn.style.background = "#009432";
                    btn.disabled = false;
                }, 1600);
            }
        } else {
            await liraAlert("Error al guardar mezcla: " + (res?.error || "Error desconocido"), 'error');
            if (btn) btn.disabled = false;
        }
    } catch (err) {
        const errorMsg = err?.error || err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
        console.error("Error guardando mezcla:", errorMsg, err);
        await liraAlert("Error al guardar: " + errorMsg, 'error');
        if (btn) btn.disabled = false;
    }
}

async function procesarArchivoMuestraAudio(inputElement) {
    const file = inputElement?.files?.[0];
    if (!file) return;

    // Resetear input para permitir seleccionar el mismo archivo si se desea
    inputElement.value = "";

    const inputNombre = document.getElementById('txt-kokoro-blend-nombre');
    let nombre = inputNombre?.value?.trim() || "";
    if (!nombre) {
        const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
        const sugerido = baseName ? `Voz ${baseName}` : "Mi Voz Muestra";
        nombre = await liraPrompt("Introduce un nombre para tu nueva voz:", sugerido, 'voz');
        if (!nombre || !nombre.trim()) return;
        nombre = nombre.trim();
        if (inputNombre) inputNombre.value = nombre;
    }

    const acento = document.getElementById('sel-kokoro-blend-acento')?.value || 'es-419';
    const perfilEq = document.getElementById('sel-kokoro-blend-eq')?.value || 'estudio';
    const lang = acento.startsWith('en') ? 'en' :
                 (acento.startsWith('fr') ? 'fr' :
                 (acento.startsWith('it') ? 'it' :
                 (acento.startsWith('pt') ? 'pt' :
                 (acento.startsWith('ja') ? 'ja' :
                 (acento.startsWith('cmn') || acento.startsWith('zh') ? 'zh' :
                 (acento.startsWith('hi') ? 'hi' : 'es'))))));

    const btn = document.getElementById('btn-cargar-muestra-audio');
    const lbl = document.getElementById('lbl-btn-cargar-audio');
    const txtOriginal = lbl ? lbl.innerText : "Cargar Audio...";

    if (btn) btn.disabled = true;
    if (lbl) lbl.innerText = "Afinando voz...";

    try {
        const reader = new FileReader();
        reader.onerror = async () => {
            await liraAlert("No se pudo leer el archivo de audio seleccionado.", 'error');
            if (btn) btn.disabled = false;
            if (lbl) lbl.innerText = txtOriginal;
        };
        reader.onload = async (e) => {
            try {
                const b64 = e.target.result.split(',')[1];
                const res = await eel.crear_voz_desde_muestra(nombre, b64, file.name, acento, lang, perfilEq)();

                if (res && res.exito) {
                    if (lbl) lbl.innerText = "¡Voz creada!";
                    await cargarYRenderizarMezclasKokoroUI();

                    const vocesActualizadas = await eel.obtener_voces_disponibles()();
                    if (vocesActualizadas && vocesActualizadas.length > 0) {
                        vocesPython = vocesActualizadas;
                        if (typeof llenarTodosLosSelectores === 'function') llenarTodosLosSelectores();
                        if (typeof actualizarListaVocesUI === 'function') actualizarListaVocesUI();
                    }

                    const nuevoId = res.blend?.id;
                    const selPrincipal = document.getElementById('selector-voz-live');
                    if (selPrincipal && nuevoId) {
                        selPrincipal.value = nuevoId;
                        if (typeof cambiarVozLive === 'function') cambiarVozLive();
                    }

                    // Reiniciar campo de texto para la próxima voz
                    if (inputNombre) inputNombre.value = "";

                    setTimeout(() => {
                        if (lbl) lbl.innerText = txtOriginal;
                        if (btn) btn.disabled = false;
                    }, 2000);
                } else {
                    await liraAlert("Error al procesar la muestra: " + (res?.error || "Error desconocido"), 'error');
                    if (lbl) lbl.innerText = txtOriginal;
                    if (btn) btn.disabled = false;
                }
            } catch (rpcErr) {
                console.error("Error en llamada RPC crear_voz_desde_muestra:", rpcErr);
                await liraAlert("Error al procesar audio: " + (rpcErr?.error || rpcErr?.message || rpcErr), 'error');
                if (lbl) lbl.innerText = txtOriginal;
                if (btn) btn.disabled = false;
            }
        };
        reader.readAsDataURL(file);
    } catch (err) {
        console.error("Error al cargar muestra:", err);
        if (btn) btn.disabled = false;
        if (lbl) lbl.innerText = txtOriginal;
    }
}

// Variables de estado para grabación de voz con micrófono
let mediaRecorderMuestra = null;
let audioChunksMuestra = [];
let streamMicrofonoMuestra = null;
let timerGrabacionMuestra = null;
let segundosGrabadosMuestra = 0;

/**
 * Convierte un Blob de audio grabado en el navegador (WebM/Ogg) a un Blob WAV PCM 16-bit
 * utilizando la Web Audio API estándar.
 */
async function convertirBlobAudioAWav(audioBlob) {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const numChannels = 1; // Forzar mono
        const sampleRate = audioBuffer.sampleRate;
        const channelData = audioBuffer.numberOfChannels > 1
            ? mezclarACanalMono(audioBuffer)
            : audioBuffer.getChannelData(0);

        const pcmData = new Int16Array(channelData.length);
        for (let i = 0; i < channelData.length; i++) {
            let s = Math.max(-1, Math.min(1, channelData[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Crear encabezado RIFF WAV
        const wavBuffer = new ArrayBuffer(44 + pcmData.byteLength);
        const view = new DataView(wavBuffer);

        function writeString(offset, string) {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        }

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + pcmData.byteLength, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true); // SubChunk1Size (PCM = 16)
        view.setUint16(20, 1, true);  // AudioFormat (PCM = 1)
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
        view.setUint16(32, numChannels * 2, true);             // BlockAlign
        view.setUint16(34, 16, true);                           // BitsPerSample
        writeString(36, 'data');
        view.setUint32(40, pcmData.byteLength, true);

        new Uint8Array(wavBuffer, 44).set(new Uint8Array(pcmData.buffer));
        return new Blob([wavBuffer], { type: 'audio/wav' });
    } finally {
        if (audioCtx && audioCtx.state !== 'closed') {
            try { audioCtx.close(); } catch (e) {}
        }
    }
}

function mezclarACanalMono(audioBuffer) {
    const len = audioBuffer.length;
    const mono = new Float32Array(len);
    const numChannels = audioBuffer.numberOfChannels;
    for (let c = 0; c < numChannels; c++) {
        const cData = audioBuffer.getChannelData(c);
        for (let i = 0; i < len; i++) {
            mono[i] += cData[i] / numChannels;
        }
    }
    return mono;
}

async function toggleGrabacionMuestraAudio() {
    const btn = document.getElementById('btn-grabar-muestra-audio');
    const lbl = document.getElementById('lbl-btn-grabar-audio');
    const icn = document.getElementById('icon-grabar-muestra-audio');
    const lblTimer = document.getElementById('lbl-tiempo-grabacion');

    if (mediaRecorderMuestra && mediaRecorderMuestra.state === 'recording') {
        // Detener grabación
        mediaRecorderMuestra.stop();
        if (streamMicrofonoMuestra) {
            streamMicrofonoMuestra.getTracks().forEach(track => track.stop());
            streamMicrofonoMuestra = null;
        }
        clearInterval(timerGrabacionMuestra);
        timerGrabacionMuestra = null;

        if (lbl) lbl.innerText = "Procesando...";
        if (btn) {
            btn.disabled = true;
            btn.style.background = "#2c3e50";
        }
        if (icn) {
            icn.innerHTML = '<circle cx="12" cy="12" r="8"/>';
            icn.style.color = "#e74c3c";
        }
        return;
    }

    // Iniciar grabación
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            await liraAlert("Tu navegador no soporta grabación de audio desde micrófono.", 'advertencia');
            return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamMicrofonoMuestra = stream;
        audioChunksMuestra = [];
        segundosGrabadosMuestra = 0;

        let mimeType = '';
        if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
            mimeType = 'audio/ogg';
        } else if (MediaRecorder.isTypeSupported('audio/wav')) {
            mimeType = 'audio/wav';
        }

        mediaRecorderMuestra = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

        mediaRecorderMuestra.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                audioChunksMuestra.push(e.data);
            }
        };

        mediaRecorderMuestra.onstop = async () => {
            if (lblTimer) lblTimer.style.display = "none";

            if (segundosGrabadosMuestra < 2) {
                await liraAlert("La grabación fue demasiado corta. Habla al menos de 4 a 10 segundos para afinar la voz.", 'advertencia');
                if (lbl) lbl.innerText = "Grabar Voz";
                if (btn) btn.disabled = false;
                mediaRecorderMuestra = null;
                return;
            }

            const audioBlob = new Blob(audioChunksMuestra, { type: mediaRecorderMuestra.mimeType || 'audio/webm' });
            mediaRecorderMuestra = null;

            // Solicitar nombre si no tiene
            const inputNombre = document.getElementById('txt-kokoro-blend-nombre');
            let nombre = inputNombre?.value?.trim() || "";
            if (!nombre) {
                const sugerido = "Mi Voz Grabada " + Math.floor(Math.random() * 900 + 100);
                nombre = await liraPrompt("Introduce un nombre para tu nueva voz grabada:", sugerido, 'voz');
                if (!nombre || !nombre.trim()) {
                    if (lbl) lbl.innerText = "Grabar Voz";
                    if (btn) btn.disabled = false;
                    return;
                }
                nombre = nombre.trim();
                if (inputNombre) inputNombre.value = nombre;
            }

            const acento = document.getElementById('sel-kokoro-blend-acento')?.value || 'es-419';
            const perfilEq = document.getElementById('sel-kokoro-blend-eq')?.value || 'estudio';
            const lang = acento.startsWith('en') ? 'en' :
                         (acento.startsWith('fr') ? 'fr' :
                         (acento.startsWith('it') ? 'it' :
                         (acento.startsWith('pt') ? 'pt' :
                         (acento.startsWith('ja') ? 'ja' :
                         (acento.startsWith('cmn') || acento.startsWith('zh') ? 'zh' :
                         (acento.startsWith('hi') ? 'hi' : 'es'))))));

            if (lbl) lbl.innerText = "Afinando voz...";

            try {
                // Convertir WebM / Blob a WAV PCM 16-bit nativo en el navegador para que libsndfile lo lea sin error
                const wavBlob = await convertirBlobAudioAWav(audioBlob);
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    try {
                        const b64 = ev.target.result.split(',')[1];
                        const res = await eel.crear_voz_desde_muestra(nombre, b64, "grabacion.wav", acento, lang, perfilEq)();

                        if (res && res.exito) {
                            if (lbl) lbl.innerText = "¡Voz creada!";
                            await cargarYRenderizarMezclasKokoroUI();

                            const vocesActualizadas = await eel.obtener_voces_disponibles()();
                            if (vocesActualizadas && vocesActualizadas.length > 0) {
                                vocesPython = vocesActualizadas;
                                if (typeof llenarTodosLosSelectores === 'function') llenarTodosLosSelectores();
                                if (typeof actualizarListaVocesUI === 'function') actualizarListaVocesUI();
                            }

                            const nuevoId = res.blend?.id;
                            const selPrincipal = document.getElementById('selector-voz-live');
                            if (selPrincipal && nuevoId) {
                                selPrincipal.value = nuevoId;
                                if (typeof cambiarVozLive === 'function') cambiarVozLive();
                            }

                            if (res.interpolacion_desc) {
                                console.log(`[KOKORO LAB] Interpolación detectada para ${nombre}: ${res.interpolacion_desc}`);
                            }

                            setTimeout(() => {
                                if (lbl) lbl.innerText = "Grabar Voz";
                                if (btn) btn.disabled = false;
                            }, 2000);
                        } else {
                            await liraAlert("Error al procesar la grabación: " + (res?.error || "Error desconocido"), 'error');
                            if (lbl) lbl.innerText = "Grabar Voz";
                            if (btn) btn.disabled = false;
                        }
                    } catch (rpcErr) {
                        console.error("Error en llamada RPC crear_voz_desde_muestra:", rpcErr);
                        await liraAlert("Error al afinar la voz grabada: " + (rpcErr?.error || rpcErr?.message || rpcErr), 'error');
                        if (lbl) lbl.innerText = "Grabar Voz";
                        if (btn) btn.disabled = false;
                    }
                };
                reader.readAsDataURL(wavBlob);
            } catch (convErr) {
                console.error("Error al convertir grabación a WAV:", convErr);
                await liraAlert("Error al procesar audio grabado: " + convErr, 'error');
                if (lbl) lbl.innerText = "Grabar Voz";
                if (btn) btn.disabled = false;
            }
        };

        mediaRecorderMuestra.start();

        if (lbl) lbl.innerText = "Detener";
        if (btn) {
            btn.style.background = "#c0392b";
        }
        if (icn) {
            icn.innerHTML = '<rect x="6" y="6" width="12" height="12" rx="2"/>';
            icn.style.color = "#ffffff";
        }
        if (lblTimer) {
            lblTimer.innerText = "00:00";
            lblTimer.style.display = "inline";
        }

        timerGrabacionMuestra = setInterval(() => {
            segundosGrabadosMuestra++;
            const m = String(Math.floor(segundosGrabadosMuestra / 60)).padStart(2, '0');
            const s = String(segundosGrabadosMuestra % 60).padStart(2, '0');
            if (lblTimer) lblTimer.innerText = `${m}:${s}`;
        }, 1000);

    } catch (micErr) {
        console.error("Error al acceder al micrófono:", micErr);
        if (micErr && (micErr.name === 'NotAllowedError' || micErr.name === 'PermissionDeniedError')) {
            await liraAlert("Acceso al micrófono denegado.\n\nPara solucionarlo:\n1. Revisa en la barra de direcciones o en Windows si los permisos de micrófono para Chrome/la aplicación están permitidos.\n2. Si prefieres no usar el micrófono, puedes grabar tu voz con la grabadora de Windows o tu celular y usar el botón 'Cargar Audio...'", 'advertencia');
        } else {
            await liraAlert("No se pudo acceder al micrófono: " + (micErr?.message || "Verifica los permisos en tu sistema."), 'error');
        }
        if (lbl) lbl.innerText = "Grabar Voz";
        if (btn) {
            btn.disabled = false;
            btn.style.background = "#2c3e50";
        }
        if (icn) {
            icn.innerHTML = '<circle cx="12" cy="12" r="8"/>';
            icn.style.color = "#e74c3c";
        }
        if (lblTimer) lblTimer.style.display = "none";
    }
}

async function eliminarMezclaKokoroLive(blendId) {
    if (!await liraConfirm("¿Deseas eliminar esta mezcla de voz personalizada?", 'borrar')) return;
    try {
        const ok = await eel.eliminar_mezcla_kokoro(blendId)();
        if (ok) {
            await cargarYRenderizarMezclasKokoroUI();
            const vocesActualizadas = await eel.obtener_voces_disponibles()();
            if (vocesActualizadas && vocesActualizadas.length > 0) {
                vocesPython = vocesActualizadas;
                if (typeof llenarTodosLosSelectores === 'function') llenarTodosLosSelectores();
                if (typeof actualizarListaVocesUI === 'function') actualizarListaVocesUI();
            }
        }
    } catch (err) {
        console.error("Error al eliminar mezcla:", err);
    }
}

async function cargarYRenderizarMezclasKokoroUI() {
    const contenedor = document.getElementById('lista-mezclas-kokoro-items');
    const lblCount = document.getElementById('lbl-total-blends-count');
    if (!contenedor) return;

    try {
        const blends = await eel.cargar_kokoro_blends()();
        const lista = Array.isArray(blends) ? blends : [];
        if (lblCount) lblCount.innerText = `(${lista.length})`;

        if (lista.length === 0) {
            contenedor.innerHTML = '<div style="font-size:11px; color:#95a5a6; font-style:italic; padding:6px 0;">No has creado mezclas personalizadas aún.</div>';
            return;
        }

        let html = '';
        lista.forEach(b => {
            const nombreMostrar = b.nombre_simple || (b.nombre || "").replace("⚡ 🧪 Kokoro: ", "").replace("Kokoro: ", "").replace(" (Mezcla)", "").replace(" (Muestra)", "");
            const formula = b.tipo_origen === 'muestra_audio' 
                ? (b.interpolacion_desc ? `Muestra: ${b.interpolacion_desc}` : 'Muestra afinada')
                : (b.voice_key || `${b.voz_a || 'A'} + ${b.voz_b || 'B'}`);
            const acento = b.espeak_voice || 'es';
            const eqNombre = b.perfil_eq || 'estudio';
            const idEscapado = encodeURIComponent(b.id);
            const keyEscapada = encodeURIComponent(b.voice_key || "");
            const acentoEscapado = encodeURIComponent(acento);
            const eqEscapado = encodeURIComponent(eqNombre);

            html += `
            <div class="voz-lab-item" style="display:flex; justify-content:space-between; align-items:center;">
                <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:8px;">
                    <span style="font-size:12px; font-weight:600; color:#333333;">${nombreMostrar}</span>
                    <span style="font-size:10px; color:#7f8c8d; margin-left:6px;" title="${formula} · ${acento} · ${eqNombre}">(${formula} · ${acento} · ${eqNombre})</span>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button type="button" class="btn-voz-item-test" title="Probar muestra rápida" onclick="reproducirMuestraRapidaBlend('${keyEscapada}', '${acentoEscapado}', '${encodeURIComponent(nombreMostrar)}', '${eqEscapado}')">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width:12px; height:12px;"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
                    </button>
                    <button type="button" class="btn-voz-item-delete" title="Eliminar mezcla" onclick="eliminarMezclaKokoroLive(decodeURIComponent('${idEscapado}'))">
                        ✕
                    </button>
                </div>
            </div>`;
        });
        contenedor.innerHTML = html;
    } catch (err) {
        console.error("Error al renderizar mezclas Kokoro:", err);
    }
}

async function reproducirMuestraRapidaBlend(keyEncoded, acentoEncoded, nombreEncoded, eqEncoded) {
    const voiceKey = decodeURIComponent(keyEncoded);
    const acento = decodeURIComponent(acentoEncoded);
    const nombre = decodeURIComponent(nombreEncoded);
    const perfilEq = decodeURIComponent(eqEncoded || 'estudio');
    const frase = `Hola, estás escuchando la voz ${nombre} generada con Kokoro.`;
    try {
        const res = await eel.probar_muestra_kokoro_blend(voiceKey, acento, frase)();
        if (res && res.exito && res.pcm_b64) {
            reproducirMuestraPCM(res.pcm_b64, res.sr || 24000, perfilEq);
        }
    } catch (err) {
        console.error("🔥 Error en muestra rápida:", err);
    }
}

window.actualizarEtiquetasBlendKokoro = actualizarEtiquetasBlendKokoro;
window.probarMezclaKokoroLive = probarMezclaKokoroLive;
window.guardarMezclaKokoroLive = guardarMezclaKokoroLive;
window.eliminarMezclaKokoroLive = eliminarMezclaKokoroLive;
window.cargarYRenderizarMezclasKokoroUI = cargarYRenderizarMezclasKokoroUI;
window.reproducirMuestraRapidaBlend = reproducirMuestraRapidaBlend;

// ==========================================
// 🧬 CLONACIÓN DE VOZ (POCKET TTS / KYUTAI)
// ==========================================
let mediaRecorderPocket = null;
let audioChunksPocket = [];
let streamMicrofonoPocket = null;
let timerGrabacionPocket = null;
let segundosGrabadosPocket = 0;

async function procesarArchivoClonPocket(inputElement) {
    const file = inputElement?.files?.[0];
    if (!file) return;
    inputElement.value = "";

    const inputNombre = document.getElementById('txt-pocket-clone-nombre');
    let nombre = inputNombre?.value?.trim() || "";
    if (!nombre) {
        const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
        const sugerido = baseName ? `Clon ${baseName}` : "Mi Voz Clonada";
        nombre = await liraPrompt("Introduce un nombre para tu nueva voz clonada:", sugerido, 'voz');
        if (!nombre || !nombre.trim()) return;
        nombre = nombre.trim();
        if (inputNombre) inputNombre.value = nombre;
    }

    const btn = document.getElementById('btn-cargar-clon-pocket');
    const lbl = document.getElementById('lbl-btn-cargar-clon-pocket');
    const txtOriginal = lbl ? lbl.innerText : "Cargar Audio...";

    if (btn) btn.disabled = true;
    if (lbl) lbl.innerText = "Clonando voz...";

    try {
        const reader = new FileReader();
        reader.onerror = async () => {
            await liraAlert("No se pudo leer el archivo de audio seleccionado.", 'error');
            if (btn) btn.disabled = false;
            if (lbl) lbl.innerText = txtOriginal;
        };
        reader.onload = async (e) => {
            try {
                const b64 = e.target.result.split(',')[1];
                const res = await eel.clonar_voz_pocket(nombre, b64, file.name, "spanish")();

                if (res && res.exito) {
                    if (lbl) lbl.innerText = "¡Voz clonada!";
                    await cargarYRenderizarClonesPocketUI();

                    const vocesActualizadas = await eel.obtener_voces_disponibles()();
                    if (vocesActualizadas && vocesActualizadas.length > 0) {
                        vocesPython = vocesActualizadas;
                        if (typeof llenarTodosLosSelectores === 'function') llenarTodosLosSelectores();
                        if (typeof actualizarListaVocesUI === 'function') actualizarListaVocesUI();
                    }

                    const nuevoId = res.clon?.id;
                    const selPrincipal = document.getElementById('selector-voz-live');
                    if (selPrincipal && nuevoId) {
                        selPrincipal.value = nuevoId;
                        if (typeof cambiarVozLive === 'function') cambiarVozLive();
                    }

                    // Reiniciar campo de texto para la próxima voz
                    if (inputNombre) inputNombre.value = "";

                    setTimeout(() => {
                        if (lbl) lbl.innerText = txtOriginal;
                        if (btn) btn.disabled = false;
                    }, 2000);
                } else {
                    await liraAlert("Error al clonar voz: " + (res?.error || "Error desconocido"), 'error');
                    if (lbl) lbl.innerText = txtOriginal;
                    if (btn) btn.disabled = false;
                }
            } catch (rpcErr) {
                console.error("Error en llamada RPC clonar_voz_pocket:", rpcErr);
                await liraAlert("Error al clonar audio: " + (rpcErr?.error || rpcErr?.message || rpcErr), 'error');
                if (lbl) lbl.innerText = txtOriginal;
                if (btn) btn.disabled = false;
            }
        };
        reader.readAsDataURL(file);
    } catch (err) {
        console.error("Error al cargar audio para clonar:", err);
        if (btn) btn.disabled = false;
        if (lbl) lbl.innerText = txtOriginal;
    }
}

async function toggleGrabacionClonPocket() {
    const btn = document.getElementById('btn-grabar-clon-pocket');
    const lbl = document.getElementById('lbl-btn-grabar-clon-pocket');
    const icn = document.getElementById('icon-grabar-clon-pocket');
    const lblTimer = document.getElementById('lbl-tiempo-grabacion-pocket');

    if (mediaRecorderPocket && mediaRecorderPocket.state === 'recording') {
        // Detener grabación
        mediaRecorderPocket.stop();
        if (streamMicrofonoPocket) {
            streamMicrofonoPocket.getTracks().forEach(track => track.stop());
            streamMicrofonoPocket = null;
        }
        clearInterval(timerGrabacionPocket);
        timerGrabacionPocket = null;

        if (lbl) lbl.innerText = "Procesando...";
        if (btn) {
            btn.disabled = true;
            btn.style.background = "#2c3e50";
        }
        if (icn) {
            icn.innerHTML = '<circle cx="12" cy="12" r="8"/>';
            icn.style.color = "#e74c3c";
        }
        return;
    }

    // Iniciar grabación
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            await liraAlert("Tu navegador no soporta grabación de audio desde micrófono.", 'advertencia');
            return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamMicrofonoPocket = stream;
        audioChunksPocket = [];
        segundosGrabadosPocket = 0;

        let mimeType = '';
        if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
            mimeType = 'audio/ogg';
        } else if (MediaRecorder.isTypeSupported('audio/wav')) {
            mimeType = 'audio/wav';
        }

        mediaRecorderPocket = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

        mediaRecorderPocket.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                audioChunksPocket.push(e.data);
            }
        };

        mediaRecorderPocket.onstop = async () => {
            if (lblTimer) lblTimer.style.display = "none";

            if (segundosGrabadosPocket < 2) {
                await liraAlert("La grabación fue demasiado corta. Habla o susurra de 4 a 10 segundos para clonar la voz.", 'advertencia');
                if (lbl) lbl.innerText = "Grabar Voz";
                if (btn) btn.disabled = false;
                mediaRecorderPocket = null;
                return;
            }

            const audioBlob = new Blob(audioChunksPocket, { type: mediaRecorderPocket.mimeType || 'audio/webm' });
            mediaRecorderPocket = null;

            const inputNombre = document.getElementById('txt-pocket-clone-nombre');
            let nombre = inputNombre?.value?.trim() || "";
            if (!nombre) {
                const sugerido = "Mi Voz Clonada " + Math.floor(Math.random() * 900 + 100);
                nombre = await liraPrompt("Introduce un nombre para tu nueva voz clonada:", sugerido, 'voz');
                if (!nombre || !nombre.trim()) {
                    if (lbl) lbl.innerText = "Grabar Voz";
                    if (btn) btn.disabled = false;
                    return;
                }
                nombre = nombre.trim();
                if (inputNombre) inputNombre.value = nombre;
            }

            if (lbl) lbl.innerText = "Clonando voz...";

            try {
                const wavBlob = await convertirBlobAudioAWav(audioBlob);
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    try {
                        const b64 = ev.target.result.split(',')[1];
                        const res = await eel.clonar_voz_pocket(nombre, b64, "grabacion.wav", "spanish")();

                        if (res && res.exito) {
                            if (lbl) lbl.innerText = "¡Voz clonada!";
                            await cargarYRenderizarClonesPocketUI();

                            const vocesActualizadas = await eel.obtener_voces_disponibles()();
                            if (vocesActualizadas && vocesActualizadas.length > 0) {
                                vocesPython = vocesActualizadas;
                                if (typeof llenarTodosLosSelectores === 'function') llenarTodosLosSelectores();
                                if (typeof actualizarListaVocesUI === 'function') actualizarListaVocesUI();
                            }

                            const nuevoId = res.clon?.id;
                            const selPrincipal = document.getElementById('selector-voz-live');
                            if (selPrincipal && nuevoId) {
                                selPrincipal.value = nuevoId;
                                if (typeof cambiarVozLive === 'function') cambiarVozLive();
                            }

                            // Reiniciar campo de texto para la próxima voz
                            if (inputNombre) inputNombre.value = "";

                            setTimeout(() => {
                                if (lbl) lbl.innerText = "Grabar Voz";
                                if (btn) btn.disabled = false;
                            }, 2000);
                        } else {
                            await liraAlert("Error al procesar la grabación: " + (res?.error || "Error desconocido"), 'error');
                            if (lbl) lbl.innerText = "Grabar Voz";
                            if (btn) btn.disabled = false;
                        }
                    } catch (rpcErr) {
                        console.error("Error en llamada RPC clonar_voz_pocket:", rpcErr);
                        await liraAlert("Error al clonar voz grabada: " + (rpcErr?.error || rpcErr?.message || rpcErr), 'error');
                        if (lbl) lbl.innerText = "Grabar Voz";
                        if (btn) btn.disabled = false;
                    }
                };
                reader.readAsDataURL(wavBlob);
            } catch (convErr) {
                console.error("Error al convertir grabación a WAV:", convErr);
                await liraAlert("Error al procesar audio grabado: " + convErr, 'error');
                if (lbl) lbl.innerText = "Grabar Voz";
                if (btn) btn.disabled = false;
            }
        };

        mediaRecorderPocket.start();

        if (lbl) lbl.innerText = "Detener";
        if (btn) {
            btn.style.background = "#c0392b";
        }
        if (icn) {
            icn.innerHTML = '<rect x="6" y="6" width="12" height="12" rx="2"/>';
            icn.style.color = "#ffffff";
        }
        if (lblTimer) {
            lblTimer.innerText = "00:00";
            lblTimer.style.display = "inline";
        }

        timerGrabacionPocket = setInterval(() => {
            segundosGrabadosPocket++;
            const m = String(Math.floor(segundosGrabadosPocket / 60)).padStart(2, '0');
            const s = String(segundosGrabadosPocket % 60).padStart(2, '0');
            if (lblTimer) lblTimer.innerText = `${m}:${s}`;
        }, 1000);

    } catch (micErr) {
        console.error("Error al acceder al micrófono:", micErr);
        if (micErr && (micErr.name === 'NotAllowedError' || micErr.name === 'PermissionDeniedError')) {
            await liraAlert("Acceso al micrófono denegado. Puedes usar el botón 'Cargar Audio...' para subir una grabación.", 'advertencia');
        } else {
            await liraAlert("No se pudo acceder al micrófono: " + (micErr?.message || "Verifica los permisos en tu sistema."), 'error');
        }
        if (lbl) lbl.innerText = "Grabar Voz";
        if (btn) {
            btn.disabled = false;
            btn.style.background = "#2c3e50";
        }
        if (icn) {
            icn.innerHTML = '<circle cx="12" cy="12" r="8"/>';
            icn.style.color = "#e74c3c";
        }
        if (lblTimer) lblTimer.style.display = "none";
    }
}

async function cargarYRenderizarClonesPocketUI() {
    const contenedor = document.getElementById('lista-clones-pocket-items');
    const lblCount = document.getElementById('lbl-total-clones-pocket-count');
    if (!contenedor) return;

    try {
        const clones = await eel.listar_clones_pocket()();
        const lista = Array.isArray(clones) ? clones : [];
        if (lblCount) lblCount.innerText = `(${lista.length})`;

        if (lista.length === 0) {
            contenedor.innerHTML = '<div style="font-size:11px; color:#95a5a6; font-style:italic; padding:6px 0;">No has clonado ninguna voz aún.</div>';
            return;
        }

        let html = '';
        lista.forEach(c => {
            const nombreMostrar = c.nombre_simple || (c.nombre || "").replace("Clon: ", "").replace(" (Pocket AI)", "");
            const idEscapado = encodeURIComponent(c.id);
            const nombreEscapado = encodeURIComponent(nombreMostrar);

            html += `
            <div class="voz-lab-item" style="display:flex; justify-content:space-between; align-items:center;">
                <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:8px;">
                    <span style="font-size:12px; font-weight:600; color:#333333;">${nombreMostrar}</span>
                    <span style="font-size:10px; color:#7f8c8d; margin-left:6px;">(Clon Zero-Shot · Pocket AI)</span>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button type="button" class="btn-voz-item-test" title="Probar muestra de voz clonada" onclick="probarMuestraClonPocket('${idEscapado}', '${nombreEscapado}')">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width:12px; height:12px;"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
                    </button>
                    <button type="button" class="btn-voz-item-delete" title="Eliminar voz clonada" onclick="eliminarClonPocketLive(decodeURIComponent('${idEscapado}'))">
                        ✕
                    </button>
                </div>
            </div>`;
        });
        contenedor.innerHTML = html;
    } catch (err) {
        console.error("Error al renderizar clones Pocket:", err);
    }
}

async function probarMuestraClonPocket(idEncoded, nombreEncoded) {
    const voiceId = decodeURIComponent(idEncoded);
    const nombre = decodeURIComponent(nombreEncoded);
    const frase = `Hola, estás escuchando la voz clonada de ${nombre} mediante Pocket AI en LiraLoud.`;
    try {
        const res = await eel.probar_muestra_clon_pocket(voiceId, frase)();
        if (res && res.exito && res.pcm_b64) {
            reproducirMuestraPCM(res.pcm_b64, res.sr || 24000, "estudio");
        } else {
            await liraAlert("No se pudo generar la muestra: " + (res?.error || "Error"), 'error');
        }
    } catch (err) {
        console.error("Error al probar muestra de clon Pocket:", err);
    }
}

async function eliminarClonPocketLive(voiceId) {
    if (!await liraConfirm("¿Deseas eliminar esta voz clonada?", 'borrar')) return;
    try {
        const ok = await eel.eliminar_clon_pocket(voiceId)();
        if (ok) {
            await cargarYRenderizarClonesPocketUI();
            const vocesActualizadas = await eel.obtener_voces_disponibles()();
            if (vocesActualizadas && vocesActualizadas.length > 0) {
                vocesPython = vocesActualizadas;
                if (typeof llenarTodosLosSelectores === 'function') llenarTodosLosSelectores();
                if (typeof actualizarListaVocesUI === 'function') actualizarListaVocesUI();
            }
        }
    } catch (err) {
        console.error("Error al eliminar clon Pocket:", err);
    }
}

window.procesarArchivoClonPocket = procesarArchivoClonPocket;
window.toggleGrabacionClonPocket = toggleGrabacionClonPocket;
window.cargarYRenderizarClonesPocketUI = cargarYRenderizarClonesPocketUI;
window.probarMuestraClonPocket = probarMuestraClonPocket;
window.eliminarClonPocketLive = eliminarClonPocketLive;
