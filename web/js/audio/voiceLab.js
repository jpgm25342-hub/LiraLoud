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

const _EQ_MUESTRA_KOKORO = {
    estudio: [
        { frequency: 300, gain: 1.8, Q: 0.9 },
        { frequency: 4200, gain: -1.8 }
    ],
    cristalino: [{ frequency: 4800, gain: 2.2, Q: 0.8 }],
    radio: [{ frequency: 180, gain: 2.8, Q: 1.0 }]
};

const _PREFIJOS_IDIOMA_ACENTO = [
    ['en', 'en'], ['fr', 'fr'], ['it', 'it'], ['pt', 'pt'],
    ['ja', 'ja'], ['cmn', 'zh'], ['zh', 'zh'], ['hi', 'hi']
];

function _resolverIdiomaDesdeAcento(acento) {
    const a = String(acento || '');
    for (const [prefijo, iso] of _PREFIJOS_IDIOMA_ACENTO) {
        if (a.startsWith(prefijo)) return iso;
    }
    return 'es';
}

function _leerParametrosBlendKokoro() {
    const vozA = document.getElementById('sel-kokoro-blend-voza')?.value || 'ef_dora';
    const vozB = document.getElementById('sel-kokoro-blend-vozb')?.value || 'af_bella';
    const vozC = document.getElementById('sel-kokoro-blend-vozc')?.value || 'ninguna';
    const pesoCRaw = (vozC !== 'ninguna') ? parseInt(document.getElementById('rng-kokoro-blend-pesoc')?.value || 0) : 0;
    const ratioAB = parseInt(document.getElementById('rng-kokoro-blend-ratio')?.value || 70);
    const restante = 100 - pesoCRaw;
    const pA = ((ratioAB / 100) * restante / 100).toFixed(2);
    const pB = ((restante - Math.round((ratioAB / 100) * restante)) / 100).toFixed(2);
    const pC = (pesoCRaw / 100).toFixed(2);
    const voiceKey = `${vozA}:${pA}+${vozB}:${pB}` + ((vozC !== 'ninguna' && pesoCRaw > 0) ? `+${vozC}:${pC}` : '');
    const acento = document.getElementById('sel-kokoro-blend-acento')?.value || 'es-419';
    const perfilEq = document.getElementById('sel-kokoro-blend-eq')?.value || 'estudio';
    const expresividad = parseFloat(document.getElementById('sel-kokoro-blend-expresividad')?.value || 1.0);
    const cadencia = parseFloat(document.getElementById('sel-kokoro-blend-cadencia')?.value || 1.0);
    return { vozA, vozB, vozC, pA, pB, pC, voiceKey, acento, lang: _resolverIdiomaDesdeAcento(acento), perfilEq, expresividad, cadencia };
}

function _formatearErrorVoiceLab(err) {
    return err?.error || err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
}

async function _resolverNombreVozLab(inputId, promptMsg, sugerido) {
    const inputNombre = document.getElementById(inputId);
    let nombre = inputNombre?.value?.trim() || "";
    if (!nombre) {
        nombre = await liraPrompt(promptMsg, sugerido, 'voz');
        if (!nombre || !nombre.trim()) return null;
        nombre = nombre.trim();
        if (inputNombre) inputNombre.value = nombre;
    }
    return { nombre, inputNombre };
}

async function _refrescarCatalogoYSeleccionarVoz(nuevoId = null) {
    const vocesActualizadas = await eel.obtener_voces_disponibles()();
    if (vocesActualizadas && vocesActualizadas.length > 0) {
        vocesPython = vocesActualizadas;
        if (typeof llenarTodosLosSelectores === 'function') llenarTodosLosSelectores();
        if (typeof actualizarListaVocesUI === 'function') actualizarListaVocesUI();
    }
    const selPrincipal = document.getElementById('selector-voz-live');
    if (selPrincipal && nuevoId) {
        selPrincipal.value = nuevoId;
        if (typeof cambiarVozLive === 'function') cambiarVozLive();
    }
}

function _leerBlobABase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("No se pudo leer el archivo de audio seleccionado."));
        reader.onload = (e) => resolve(e.target.result.split(',')[1]);
        reader.readAsDataURL(blob);
    });
}

function _aplicarEqMuestraPCM(ctx, fuente, perfilEq) {
    let ultimoNodo = fuente;
    for (const cfg of (_EQ_MUESTRA_KOKORO[perfilEq] || [])) {
        const eq = ctx.createBiquadFilter();
        eq.type = 'peaking';
        eq.frequency.value = cfg.frequency;
        eq.gain.value = cfg.gain;
        if (cfg.Q !== undefined) eq.Q.value = cfg.Q;
        ultimoNodo.connect(eq);
        ultimoNodo = eq;
    }
    ultimoNodo.connect((typeof masterGain !== 'undefined' && masterGain) ? masterGain : ctx.destination);
}

function reproducirMuestraPCM(pcmBase64, sampleRate = 24000, perfilEq = 'estudio') {
    if (!pcmBase64) return;
    try {
        if (!audioCtxMuestraKokoro) {
            audioCtxMuestraKokoro = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
        }
        if (audioCtxMuestraKokoro.state === 'suspended') audioCtxMuestraKokoro.resume();
        if (fuenteMuestraKokoro) {
            try { fuenteMuestraKokoro.stop(); } catch (e) {}
            fuenteMuestraKokoro = null;
        }

        const binario = atob(pcmBase64);
        const bytes = new Uint8Array(binario.length);
        for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
        const int16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;

        const buffer = audioCtxMuestraKokoro.createBuffer(1, float32.length, sampleRate);
        buffer.getChannelData(0).set(float32);

        fuenteMuestraKokoro = audioCtxMuestraKokoro.createBufferSource();
        fuenteMuestraKokoro.buffer = buffer;
        _aplicarEqMuestraPCM(audioCtxMuestraKokoro, fuenteMuestraKokoro, perfilEq);
        fuenteMuestraKokoro.start(0);
        console.log(`🔊 [KOKORO LAB] Muestra reproduciéndose (Perfil: ${perfilEq}).`);
    } catch (err) {
        console.error("🔥 Error al reproducir muestra de voz:", err);
    }
}

async function probarMezclaKokoroLive() {
    const btn = document.getElementById('btn-probar-kokoro-blend');
    const icn = document.getElementById('icon-probar-kokoro-blend');
    const p = _leerParametrosBlendKokoro();
    const nombreVoz = document.getElementById('txt-kokoro-blend-nombre')?.value?.trim();
    const frasePrueba = nombreVoz
        ? `Hola, esta es una prueba de mi nueva voz ${nombreVoz} con Kokoro.`
        : "Hola, esta es una prueba de mezcla personalizada con el motor neuronal Kokoro.";

    if (btn) btn.disabled = true;
    if (icn) icn.style.opacity = "0.5";

    try {
        console.log(`[KOKORO LAB] Solicitando muestra para: ${p.voiceKey} (${p.acento}) [EQ: ${p.perfilEq}, Exp: ${p.expresividad}, Cad: ${p.cadencia}]`);
        let res;
        try {
            res = await eel.probar_muestra_kokoro_blend(p.voiceKey, p.acento, frasePrueba, p.expresividad, p.cadencia)();
        } catch (argsErr) {
            console.warn("Servidor en memoria ejecutando versión de 3 parámetros. Reintentando con modo compatible...", argsErr);
            res = await eel.probar_muestra_kokoro_blend(p.voiceKey, p.acento, frasePrueba)();
        }

        if (res && res.exito && res.pcm_b64) {
            reproducirMuestraPCM(res.pcm_b64, res.sr || 24000, p.perfilEq);
        } else {
            await liraAlert("No se pudo generar la muestra: " + (res?.error || "Error desconocido"), 'error');
        }
    } catch (err) {
        const errorMsg = _formatearErrorVoiceLab(err);
        console.error("Error al pedir muestra:", errorMsg, err);
        await liraAlert("Error al generar muestra: " + errorMsg, 'error');
    } finally {
        if (btn) btn.disabled = false;
        if (icn) icn.style.opacity = "1";
    }
}

function _mostrarConfirmacionBtnGuardarBlend(btn) {
    if (!btn) return;
    const txtOriginal = btn.innerHTML;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px;"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>¡Guardada!</span>`;
    btn.style.background = "#27ae60";
    setTimeout(() => {
        btn.innerHTML = txtOriginal;
        btn.style.background = "#009432";
        btn.disabled = false;
    }, 1600);
}

async function guardarMezclaKokoroLive() {
    const sugerido = "Voz Personalizada " + Math.floor(Math.random() * 900 + 100);
    const resNombre = await _resolverNombreVozLab('txt-kokoro-blend-nombre', "Introduce un nombre para tu voz personalizada:", sugerido);
    if (!resNombre) return;
    const { nombre, inputNombre } = resNombre;

    const p = _leerParametrosBlendKokoro();
    const btn = document.getElementById('btn-guardar-kokoro-blend');
    if (btn) btn.disabled = true;

    try {
        console.log(`💾 [KOKORO LAB] Guardando mezcla: ${nombre} (${p.vozA}:${p.pA} + ${p.vozB}:${p.pB} + ${p.vozC}:${p.pC}) [EQ: ${p.perfilEq}]`);
        let res;
        try {
            res = await eel.guardar_nueva_mezcla_kokoro(nombre, p.vozA, p.pA, p.vozB, p.pB, p.acento, p.lang, p.vozC, p.pC, p.perfilEq, p.expresividad, p.cadencia)();
        } catch (argsErr) {
            console.warn("⚠️ Servidor en memoria ejecutando versión previa de guardado. Guardando compatible...", argsErr);
            res = await eel.guardar_nueva_mezcla_kokoro(nombre, p.vozA, p.pA, p.vozB, p.pB, p.acento, p.lang)();
        }

        if (res && res.exito) {
            await cargarYRenderizarMezclasKokoroUI();
            await _refrescarCatalogoYSeleccionarVoz(res.blend?.id);
            if (inputNombre) inputNombre.value = "";
            _mostrarConfirmacionBtnGuardarBlend(btn);
        } else {
            await liraAlert("Error al guardar mezcla: " + (res?.error || "Error desconocido"), 'error');
            if (btn) btn.disabled = false;
        }
    } catch (err) {
        const errorMsg = _formatearErrorVoiceLab(err);
        console.error("Error guardando mezcla:", errorMsg, err);
        await liraAlert("Error al guardar: " + errorMsg, 'error');
        if (btn) btn.disabled = false;
    }
}

async function _procesarArchivoAudioVoiceLab(inputElement, cfg) {
    const file = inputElement?.files?.[0];
    if (!file) return;
    inputElement.value = "";

    const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
    const sugerido = baseName ? `${cfg.prefijoSugerido} ${baseName}` : cfg.fallbackSugerido;
    const resNombre = await _resolverNombreVozLab(cfg.inputNombreId, cfg.promptMsg, sugerido);
    if (!resNombre) return;
    const { nombre, inputNombre } = resNombre;

    const btn = document.getElementById(cfg.btnId);
    const lbl = document.getElementById(cfg.lblId);
    const txtOriginal = lbl ? lbl.innerText : "Cargar Audio...";
    const restaurarUI = () => {
        if (lbl) lbl.innerText = txtOriginal;
        if (btn) btn.disabled = false;
    };

    if (btn) btn.disabled = true;
    if (lbl) lbl.innerText = cfg.textoProcesando;

    try {
        const b64 = await _leerBlobABase64(file);
        const res = await cfg.enviarRPC(nombre, b64, file.name);
        if (res && res.exito) {
            if (lbl) lbl.innerText = cfg.textoExito;
            await cfg.refrescarListaUI();
            await _refrescarCatalogoYSeleccionarVoz(cfg.extraerNuevoId(res));
            if (inputNombre) inputNombre.value = "";
            setTimeout(restaurarUI, 2000);
        } else {
            await liraAlert(`${cfg.textoError}: ${res?.error || "Error desconocido"}`, 'error');
            restaurarUI();
        }
    } catch (err) {
        console.error(cfg.logError, err);
        await liraAlert(`${cfg.textoError}: ${_formatearErrorVoiceLab(err)}`, 'error');
        restaurarUI();
    }
}

async function procesarArchivoMuestraAudio(inputElement) {
    const acento = document.getElementById('sel-kokoro-blend-acento')?.value || 'es-419';
    const perfilEq = document.getElementById('sel-kokoro-blend-eq')?.value || 'estudio';
    const lang = _resolverIdiomaDesdeAcento(acento);
    return _procesarArchivoAudioVoiceLab(inputElement, {
        inputNombreId: 'txt-kokoro-blend-nombre',
        prefijoSugerido: 'Voz',
        fallbackSugerido: 'Mi Voz Muestra',
        promptMsg: 'Introduce un nombre para tu nueva voz:',
        btnId: 'btn-cargar-muestra-audio',
        lblId: 'lbl-btn-cargar-audio',
        textoProcesando: 'Afinando voz...',
        textoExito: '¡Voz creada!',
        textoError: 'Error al procesar la muestra',
        logError: 'Error en llamada RPC crear_voz_desde_muestra:',
        enviarRPC: (nombre, b64, fileName) => eel.crear_voz_desde_muestra(nombre, b64, fileName, acento, lang, perfilEq)(),
        refrescarListaUI: cargarYRenderizarMezclasKokoroUI,
        extraerNuevoId: (res) => res.blend?.id
    });
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

const _estadoGrabacionKokoro = { recorder: null, chunks: [], stream: null, timer: null, segundos: 0 };
const _estadoGrabacionPocket = { recorder: null, chunks: [], stream: null, timer: null, segundos: 0 };

function _detectarMimeTypeGrabacionVoiceLab() {
    for (const mime of ['audio/webm', 'audio/ogg', 'audio/wav']) {
        if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return '';
}

function _restaurarBotonGrabacionVoiceLab(ui) {
    if (ui.lbl) ui.lbl.innerText = "Grabar Voz";
    if (ui.btn) {
        ui.btn.disabled = false;
        ui.btn.style.background = "#2c3e50";
    }
    if (ui.icn) {
        ui.icn.innerHTML = '<circle cx="12" cy="12" r="8"/>';
        ui.icn.style.color = "#e74c3c";
    }
    if (ui.lblTimer) ui.lblTimer.style.display = "none";
}

function _detenerGrabacionActivaVoiceLab(estado, ui) {
    estado.recorder.stop();
    if (estado.stream) {
        estado.stream.getTracks().forEach(track => track.stop());
        estado.stream = null;
    }
    clearInterval(estado.timer);
    estado.timer = null;

    if (ui.lbl) ui.lbl.innerText = "Procesando...";
    if (ui.btn) {
        ui.btn.disabled = true;
        ui.btn.style.background = "#2c3e50";
    }
    if (ui.icn) {
        ui.icn.innerHTML = '<circle cx="12" cy="12" r="8"/>';
        ui.icn.style.color = "#e74c3c";
    }
}

function _activarEstadoGrabandoUI(estado, ui) {
    if (ui.lbl) ui.lbl.innerText = "Detener";
    if (ui.btn) ui.btn.style.background = "#c0392b";
    if (ui.icn) {
        ui.icn.innerHTML = '<rect x="6" y="6" width="12" height="12" rx="2"/>';
        ui.icn.style.color = "#ffffff";
    }
    if (ui.lblTimer) {
        ui.lblTimer.innerText = "00:00";
        ui.lblTimer.style.display = "inline";
    }
    estado.timer = setInterval(() => {
        estado.segundos++;
        const m = String(Math.floor(estado.segundos / 60)).padStart(2, '0');
        const s = String(estado.segundos % 60).padStart(2, '0');
        if (ui.lblTimer) ui.lblTimer.innerText = `${m}:${s}`;
    }, 1000);
}

async function _procesarGrabacionFinalizadaVoiceLab(estado, ui, cfg) {
    if (ui.lblTimer) ui.lblTimer.style.display = "none";

    if (estado.segundos < 2) {
        await liraAlert(cfg.msgCorta, 'advertencia');
        estado.recorder = null;
        _restaurarBotonGrabacionVoiceLab(ui);
        return;
    }

    const audioBlob = new Blob(estado.chunks, { type: estado.recorder.mimeType || 'audio/webm' });
    estado.recorder = null;

    const sugerido = cfg.prefijoSugerido + " " + Math.floor(Math.random() * 900 + 100);
    const resNombre = await _resolverNombreVozLab(cfg.inputNombreId, cfg.promptMsg, sugerido);
    if (!resNombre) {
        _restaurarBotonGrabacionVoiceLab(ui);
        return;
    }
    const { nombre, inputNombre } = resNombre;
    if (ui.lbl) ui.lbl.innerText = cfg.textoProcesando;

    try {
        const wavBlob = await convertirBlobAudioAWav(audioBlob);
        const b64 = await _leerBlobABase64(wavBlob);
        const res = await cfg.enviarRPC(nombre, b64);

        if (res && res.exito) {
            if (ui.lbl) ui.lbl.innerText = cfg.textoExito;
            await cfg.refrescarListaUI();
            await _refrescarCatalogoYSeleccionarVoz(cfg.extraerNuevoId(res));
            if (cfg.limpiarInput && inputNombre) inputNombre.value = "";
            if (res.interpolacion_desc) console.log(`[KOKORO LAB] Interpolación detectada para ${nombre}: ${res.interpolacion_desc}`);
            setTimeout(() => _restaurarBotonGrabacionVoiceLab(ui), 2000);
        } else {
            await liraAlert("Error al procesar la grabación: " + (res?.error || "Error desconocido"), 'error');
            _restaurarBotonGrabacionVoiceLab(ui);
        }
    } catch (err) {
        console.error(cfg.logError, err);
        await liraAlert(`${cfg.textoErrorGrabacion}: ${_formatearErrorVoiceLab(err)}`, 'error');
        _restaurarBotonGrabacionVoiceLab(ui);
    }
}

async function _toggleGrabacionVoiceLab(estado, cfg) {
    const ui = {
        btn: document.getElementById(cfg.btnId),
        lbl: document.getElementById(cfg.lblId),
        icn: document.getElementById(cfg.icnId),
        lblTimer: document.getElementById(cfg.lblTimerId)
    };

    if (estado.recorder && estado.recorder.state === 'recording') {
        _detenerGrabacionActivaVoiceLab(estado, ui);
        return;
    }

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            await liraAlert("Tu navegador no soporta grabación de audio desde micrófono.", 'advertencia');
            return;
        }
        estado.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        estado.chunks = [];
        estado.segundos = 0;

        const mimeType = _detectarMimeTypeGrabacionVoiceLab();
        estado.recorder = mimeType ? new MediaRecorder(estado.stream, { mimeType }) : new MediaRecorder(estado.stream);
        estado.recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) estado.chunks.push(e.data); };
        estado.recorder.onstop = () => _procesarGrabacionFinalizadaVoiceLab(estado, ui, cfg);
        estado.recorder.start();
        _activarEstadoGrabandoUI(estado, ui);
    } catch (micErr) {
        console.error("Error al acceder al micrófono:", micErr);
        const esPermiso = micErr && (micErr.name === 'NotAllowedError' || micErr.name === 'PermissionDeniedError');
        await liraAlert(
            esPermiso ? cfg.msgPermisoDenegado : ("No se pudo acceder al micrófono: " + (micErr?.message || "Verifica los permisos en tu sistema.")),
            esPermiso ? 'advertencia' : 'error'
        );
        _restaurarBotonGrabacionVoiceLab(ui);
    }
}

async function toggleGrabacionMuestraAudio() {
    return _toggleGrabacionVoiceLab(_estadoGrabacionKokoro, {
        btnId: 'btn-grabar-muestra-audio',
        lblId: 'lbl-btn-grabar-audio',
        icnId: 'icon-grabar-muestra-audio',
        lblTimerId: 'lbl-tiempo-grabacion',
        inputNombreId: 'txt-kokoro-blend-nombre',
        prefijoSugerido: 'Mi Voz Grabada',
        promptMsg: 'Introduce un nombre para tu nueva voz grabada:',
        msgCorta: 'La grabación fue demasiado corta. Habla al menos de 4 a 10 segundos para afinar la voz.',
        msgPermisoDenegado: "Acceso al micrófono denegado.\n\nPara solucionarlo:\n1. Revisa en la barra de direcciones o en Windows si los permisos de micrófono para Chrome/la aplicación están permitidos.\n2. Si prefieres no usar el micrófono, puedes grabar tu voz con la grabadora de Windows o tu celular y usar el botón 'Cargar Audio...'",
        textoProcesando: 'Afinando voz...',
        textoExito: '¡Voz creada!',
        textoErrorGrabacion: 'Error al afinar la voz grabada',
        logError: 'Error en llamada RPC crear_voz_desde_muestra:',
        limpiarInput: false,
        enviarRPC: (nombre, b64) => {
            const acento = document.getElementById('sel-kokoro-blend-acento')?.value || 'es-419';
            const perfilEq = document.getElementById('sel-kokoro-blend-eq')?.value || 'estudio';
            return eel.crear_voz_desde_muestra(nombre, b64, "grabacion.wav", acento, _resolverIdiomaDesdeAcento(acento), perfilEq)();
        },
        refrescarListaUI: cargarYRenderizarMezclasKokoroUI,
        extraerNuevoId: (res) => res.blend?.id
    });
}

async function eliminarMezclaKokoroLive(blendId) {
    if (!await liraConfirm("¿Deseas eliminar esta mezcla de voz personalizada?", 'borrar')) return;
    try {
        const ok = await eel.eliminar_mezcla_kokoro(blendId)();
        if (ok) {
            await cargarYRenderizarMezclasKokoroUI();
            await _refrescarCatalogoYSeleccionarVoz();
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

async function procesarArchivoClonPocket(inputElement) {
    return _procesarArchivoAudioVoiceLab(inputElement, {
        inputNombreId: 'txt-pocket-clone-nombre',
        prefijoSugerido: 'Clon',
        fallbackSugerido: 'Mi Voz Clonada',
        promptMsg: 'Introduce un nombre para tu nueva voz clonada:',
        btnId: 'btn-cargar-clon-pocket',
        lblId: 'lbl-btn-cargar-clon-pocket',
        textoProcesando: 'Clonando voz...',
        textoExito: '¡Voz clonada!',
        textoError: 'Error al clonar voz',
        logError: 'Error en llamada RPC clonar_voz_pocket:',
        enviarRPC: (nombre, b64, fileName) => eel.clonar_voz_pocket(nombre, b64, fileName, "spanish")(),
        refrescarListaUI: cargarYRenderizarClonesPocketUI,
        extraerNuevoId: (res) => res.clon?.id
    });
}

async function toggleGrabacionClonPocket() {
    return _toggleGrabacionVoiceLab(_estadoGrabacionPocket, {
        btnId: 'btn-grabar-clon-pocket',
        lblId: 'lbl-btn-grabar-clon-pocket',
        icnId: 'icon-grabar-clon-pocket',
        lblTimerId: 'lbl-tiempo-grabacion-pocket',
        inputNombreId: 'txt-pocket-clone-nombre',
        prefijoSugerido: 'Mi Voz Clonada',
        promptMsg: 'Introduce un nombre para tu nueva voz clonada:',
        msgCorta: 'La grabación fue demasiado corta. Habla o susurra de 4 a 10 segundos para clonar la voz.',
        msgPermisoDenegado: "Acceso al micrófono denegado. Puedes usar el botón 'Cargar Audio...' para subir una grabación.",
        textoProcesando: 'Clonando voz...',
        textoExito: '¡Voz clonada!',
        textoErrorGrabacion: 'Error al clonar voz grabada',
        logError: 'Error en llamada RPC clonar_voz_pocket:',
        limpiarInput: true,
        enviarRPC: (nombre, b64) => eel.clonar_voz_pocket(nombre, b64, "grabacion.wav", "spanish")(),
        refrescarListaUI: cargarYRenderizarClonesPocketUI,
        extraerNuevoId: (res) => res.clon?.id
    });
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
            await _refrescarCatalogoYSeleccionarVoz();
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
