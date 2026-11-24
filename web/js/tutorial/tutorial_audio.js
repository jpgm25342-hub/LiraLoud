/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// ============================================================================
// TUTORIAL — NARRACIÓN Y AUDIO
// ============================================================================

let tutorialSpeechToken = 0;
let tutorialSpeechTimeout = null;
let tutorialAutoAvanceTimeout = null;
window.tutorialAudioMuteado = false;
window._tutorialAudioEl = window._tutorialAudioEl || (typeof Audio !== 'undefined' ? new Audio() : null);

function detenerAudioTutorial() {
    tutorialSpeechToken++;
    if (tutorialSpeechTimeout) {
        clearTimeout(tutorialSpeechTimeout);
        tutorialSpeechTimeout = null;
    }
    if (tutorialAutoAvanceTimeout) {
        clearTimeout(tutorialAutoAvanceTimeout);
        tutorialAutoAvanceTimeout = null;
    }
    if (window._tutorialAudioEl) {
        try {
            window._tutorialAudioEl.onended = null;
            window._tutorialAudioEl.onerror = null;
            window._tutorialAudioEl.pause();
            window._tutorialAudioEl.currentTime = 0;
            window._tutorialAudioEl.src = "";
        } catch (e) {}
    }
    if (window.speechSynthesis) {
        try {
            window.speechSynthesis.cancel();
        } catch (e) {}
    }
}
window.detenerAudioTutorial = detenerAudioTutorial;

function toggleAudioTutorial() {
    window.tutorialAudioMuteado = !window.tutorialAudioMuteado;
    const btn = document.getElementById('btn-tour-audio-toggle');
    if (window.tutorialAudioMuteado) {
        detenerAudioTutorial();
        if (btn) {
            if (typeof window._actualizarBotonAudioTour === 'function') {
                window._actualizarBotonAudioTour(btn);
            } else {
                const txt = (typeof getTourText === 'function') ? getTourText("tour-btn-voz-mute", "Voz") : "Voz";
                btn.innerHTML = `<svg class="lira-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg><span id="tour-btn-voz-texto" data-i18n="tour-btn-voz">${txt}</span>`;
                btn.title = (typeof getTourText === 'function') ? getTourText("tour-btn-voz-mute-title", "Voz del tutorial silenciada (haz clic para activar)") : "Voz del tutorial silenciada (haz clic para activar)";
            }
        }
    } else {
        if (btn) {
            if (typeof window._actualizarBotonAudioTour === 'function') {
                window._actualizarBotonAudioTour(btn);
            } else {
                const txt = (typeof getTourText === 'function') ? getTourText("tour-btn-voz-on", "Voz") : "Voz";
                btn.innerHTML = `<svg class="lira-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg><span id="tour-btn-voz-texto" data-i18n="tour-btn-voz">${txt}</span>`;
                btn.title = (typeof getTourText === 'function') ? getTourText("tour-btn-voz-on-title", "Voz del tutorial activa (haz clic para silenciar)") : "Voz del tutorial activa (haz clic para silenciar)";
            }
        }
        if (window.tutorialActivo) {
            const paso = PASOS_TOUR_GUI[window.tutorialPasoActual];
            if (paso) {
                const instruccion = typeof paso.getInstruccion === 'function' ? paso.getInstruccion() : paso.instruccion;
                const locucion = typeof paso.getLocucion === 'function' ? paso.getLocucion() : (paso.locucion || instruccion);
                const autoAvanzarEfectivo = typeof paso.autoAvanzarTrasLectura === 'function'
                    ? paso.autoAvanzarTrasLectura()
                    : Boolean(paso.autoAvanzarTrasLectura);
                narrarPasoTutorial(locucion, autoAvanzarEfectivo);
            }
        }
    }
}
window.toggleAudioTutorial = toggleAudioTutorial;

function repetirAudioTutorial() {
    if (!window.tutorialActivo) return;
    const paso = PASOS_TOUR_GUI[window.tutorialPasoActual];
    if (!paso) return;
    if (window.tutorialAudioMuteado) {
        window.tutorialAudioMuteado = false;
        const btn = document.getElementById('btn-tour-audio-toggle');
        if (btn) {
            if (typeof window._actualizarBotonAudioTour === 'function') {
                window._actualizarBotonAudioTour(btn);
            } else {
                const txt = (typeof getTourText === 'function') ? getTourText("tour-btn-voz-on", "Voz") : "Voz";
                btn.innerHTML = `<svg class="lira-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg><span id="tour-btn-voz-texto" data-i18n="tour-btn-voz">${txt}</span>`;
                btn.title = (typeof getTourText === 'function') ? getTourText("tour-btn-voz-on-title", "Voz del tutorial activa (haz clic para silenciar)") : "Voz del tutorial activa (haz clic para silenciar)";
            }
        }
    }
    const instruccion = typeof paso.getInstruccion === 'function' ? paso.getInstruccion() : paso.instruccion;
    const locucion = typeof paso.getLocucion === 'function' ? paso.getLocucion() : (paso.locucion || instruccion);
    const autoAvanzarEfectivo = typeof paso.autoAvanzarTrasLectura === 'function'
        ? paso.autoAvanzarTrasLectura()
        : Boolean(paso.autoAvanzarTrasLectura);
    narrarPasoTutorial(locucion, autoAvanzarEfectivo);
}
window.repetirAudioTutorial = repetirAudioTutorial;

async function narrarPasoTutorial(textoHTML, autoAvanzar = false) {
    detenerAudioTutorial();
    if (!window.tutorialActivo || window.tutorialAudioMuteado) return;

    const tokenLocal = ++tutorialSpeechToken;
    const pasoActual = window.tutorialPasoActual;

    // Limpiar texto para lectura hablada fluida
    let textoPlano = (textoHTML || "")
        .replace(/<[^>]*>/g, ' ')
        .replace(/['"«“]?\s*✕\s*['"»”]?/g, ' tache ')
        .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/[👉✨💡📋📚🧠⚙️🎧🔊🎉🎙️✅🎯➔◀✕•]/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, ' y ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();

    if (!textoPlano) return;

    const langIso = (typeof detectarIdiomaTutorialActivo === 'function')
        ? detectarIdiomaTutorialActivo()
        : 'es';

    const langTagMap = {
        es: 'es-ES',
        en: 'en-US',
        pt: 'pt-BR',
        fr: 'fr-FR',
        de: 'de-DE',
        it: 'it-IT',
        zh: 'zh-CN',
        ru: 'ru-RU',
        ja: 'ja-JP',
        ko: 'ko-KR',
        ar: 'ar-SA',
        hi: 'hi-IN',
        bn: 'bn-IN'
    };
    const targetLang = langTagMap[langIso] || `${langIso}-${langIso.toUpperCase()}`;

    // Si el paso se auto-avanza al terminar la narración, programar salvaguarda de tiempo
    if (autoAvanzar) {
        const palabras = textoPlano.split(/\s+/).length;
        const duracionEstimadaMs = Math.max(6000, Math.min(35000, Math.round((palabras / 2.2) * 1000) + 1800));
        tutorialAutoAvanceTimeout = setTimeout(() => {
            if (tokenLocal !== tutorialSpeechToken || !window.tutorialActivo) return;
            if (window.tutorialPasoActual !== pasoActual) return;
            window.avanzarPasoTutorial();
        }, duracionEstimadaMs);
    }

    tutorialSpeechTimeout = setTimeout(async () => {
        if (tokenLocal !== tutorialSpeechToken || !window.tutorialActivo || window.tutorialAudioMuteado) return;

        const avanzarSiAuto = () => {
            if (tokenLocal !== tutorialSpeechToken || !window.tutorialActivo) return;
            if (window.tutorialPasoActual !== pasoActual) return;

            if (autoAvanzar) {
                if (tutorialAutoAvanceTimeout) {
                    clearTimeout(tutorialAutoAvanceTimeout);
                    tutorialAutoAvanceTimeout = null;
                }
                tutorialAutoAvanceTimeout = setTimeout(() => {
                    if (tokenLocal !== tutorialSpeechToken || !window.tutorialActivo) return;
                    if (window.tutorialPasoActual !== pasoActual) return;
                    window.avanzarPasoTutorial();
                }, 700);
            }
        };

        const voces = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
        const vozLocal = (voces && voces.length > 0)
            ? voces.find(v => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(langIso))
            : null;

        if (!vozLocal && window._tutorialAudioEl && typeof eel !== 'undefined' && typeof eel.sintetizar_audio_tutorial === 'function') {
            const edgeVoiceMap = {
                zh: 'zh-CN-XiaoxiaoNeural',
                hi: 'hi-IN-SwaraNeural',
                ar: 'ar-SA-ZariyahNeural',
                bn: 'bn-IN-TanishaaNeural',
                ru: 'ru-RU-SvetlanaNeural',
                en: 'en-US-JennyNeural',
                fr: 'fr-FR-DeniseNeural',
                de: 'de-DE-KatjaNeural',
                pt: 'pt-BR-FranciscaNeural',
                it: 'it-IT-ElsaNeural',
                ja: 'ja-JP-NanamiNeural',
                ko: 'ko-KR-SunHiNeural',
                es: 'es-MX-DaliaNeural'
            };
            const vozEdge = edgeVoiceMap[langIso] || 'en-US-JennyNeural';
            try {
                if (tokenLocal !== tutorialSpeechToken || !window.tutorialActivo || window.tutorialAudioMuteado) return;
                const res = await eel.sintetizar_audio_tutorial(textoPlano, vozEdge, langIso)();
                if (tokenLocal !== tutorialSpeechToken || !window.tutorialActivo || window.tutorialAudioMuteado) return;
                if (res && res.ok && res.audio_b64) {
                    const audio = window._tutorialAudioEl;
                    audio.onended = null;
                    audio.onerror = null;
                    audio.pause();
                    audio.currentTime = 0;
                    audio.src = `data:${res.mime || 'audio/mpeg'};base64,${res.audio_b64}`;
                    audio.onended = avanzarSiAuto;
                    audio.onerror = () => { if (tokenLocal === tutorialSpeechToken) avanzarSiAuto(); };
                    await audio.play();
                    return;
                }
            } catch (e) {
                if (e && e.name === 'AbortError') return;
                console.warn("⚠️ [TUTORIAL] Fallback Edge-TTS falló, usando speechSynthesis:", e);
            }
        }

        if (tokenLocal !== tutorialSpeechToken || !window.tutorialActivo || window.tutorialAudioMuteado) return;
        if (!window.speechSynthesis) return;

        try {
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }
            if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
                window.speechSynthesis.cancel();
            }
            const utterance = new SpeechSynthesisUtterance(textoPlano);
            utterance.lang = targetLang;
            utterance.rate = 1.05;

            if (vozLocal) utterance.voice = vozLocal;

            utterance.onend = avanzarSiAuto;

            utterance.onerror = (e) => {
                if (tokenLocal !== tutorialSpeechToken) return;
            };

            // Mantener referencia global para evitar que el recolector de basura (GC) de Chromium anule el evento onend en locuciones largas
            window._tutorialActiveUtterance = utterance;
            window.speechSynthesis.speak(utterance);

            // Salvaguarda contra congelamiento de Web Speech API en Chromium tras cancel() rápidos:
            // si tras 380ms el motor sigue sin arrancar, re-crear una instancia limpia de SpeechSynthesisUtterance
            setTimeout(() => {
                if (tokenLocal !== tutorialSpeechToken || !window.tutorialActivo || window.tutorialAudioMuteado) return;
                try {
                    if (window.speechSynthesis.paused) {
                        window.speechSynthesis.resume();
                    }
                    if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
                        window.speechSynthesis.cancel();
                        const retryUtterance = new SpeechSynthesisUtterance(textoPlano);
                        retryUtterance.lang = targetLang;
                        retryUtterance.rate = 1.05;
                        if (utterance.voice) retryUtterance.voice = utterance.voice;
                        retryUtterance.onend = avanzarSiAuto;
                        window._tutorialActiveUtterance = retryUtterance;
                        window.speechSynthesis.speak(retryUtterance);
                    }
                } catch (e) {}
            }, 380);
        } catch (err) {
            console.warn("⚠️ [TUTORIAL] Error al reproducir síntesis del paso:", err);
        }
    }, 160);
}

// ---------------------------------------------------------------------------
// Atajo "Añadir límite" configurado por el usuario (misAtajos.add_limit)

window.narrarPasoTutorial = narrarPasoTutorial;

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('lira:idioma-cambiado', (ev) => {
        const lang = (ev?.detail?.idioma || 'es').toLowerCase().trim().slice(0, 2);
        if (typeof eel !== 'undefined' && typeof eel.limpiar_cache_audio_tutorial === 'function') {
            eel.limpiar_cache_audio_tutorial(lang)();
        }
    });
}
