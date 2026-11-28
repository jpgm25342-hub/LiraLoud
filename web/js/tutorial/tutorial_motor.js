/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// ============================================================================
// TUTORIAL — MOTOR DE NAVEGACIÓN, SPOTLIGHT Y PERSISTENCIA
// ============================================================================

if (typeof window.tutorialCompletado === 'undefined') {
    window.tutorialCompletado = false;
}
window.tutorialActivo = false;
window.tutorialPasoActual = 0;
let listenerCondicionalActivo = null;
let listenerMouseDownActivo = null;
let targetCondicionalActivo = null;
let observerLanzadorPaso1 = null;
let subEtapaPaso2 = 0;
let subEtapaPaso3 = 0;
let subEtapaPaso4a = 0;
let subEtapaZenLimites = 0;
let subEtapaZenDicc = 0;
let subEtapaPaso7c = 0;
let subEtapaPaso8b = 0;
let subEtapaZenTeatro = 0;
let subEtapaPaso9c = 0;
let subEtapaZenIA = 0;
let subEtapaZenTraductor = 0;
let subEtapaZenNotaRapida = 0;
let subEtapaZenCuaderno = 0;
let subEtapaZenOCR = 0;
let subEtapaZenDescarga = 0;
let subEtapaEdicionAzul = 0;
let subEtapaEdicionRosa = 0;
let subEtapaEdicionRecorte = 0;
let subEtapaEdicionGestor = 0;
let intervalPaso2 = null;
let intervalPaso3 = null;
let timer5sPaso3 = null;
let intervalPaso4 = null;
let intervalPaso5 = null;
let intervalPaso6 = null;
let intervalPasoTraductor = null;
let timeoutMouseHintPaso3 = null;
let _ultimoHintMouse = null;
let _ultimoHintKbd = null;
let _timerResizeTour = null;
let timeoutSubEtapaPaso3 = null;
let listenerResizePaso3 = null;
let listenerMouseMovePaso3 = null;
let listenerContextMenuPaso3 = null;
let listenerDocClickPaso3 = null;
let listenerKeydownPaso4 = null;

let timeoutsTutorial = [];
function setTimeoutTutorial(fn, ms) {
    const id = setTimeout(() => {
        timeoutsTutorial = timeoutsTutorial.filter(t => t !== id);
        fn();
    }, ms);
    timeoutsTutorial.push(id);
    return id;
}
function limpiarTimeoutsTutorial() {
    timeoutsTutorial.forEach(id => clearTimeout(id));
    timeoutsTutorial = [];
}

// ---------------------------------------------------------------------------
// GESTIÓN DE AUDIO Y SÍNTESIS NARRADA DEL TUTORIAL (CON TOKENS DE CANCELACIÓN)

function _esModoMinimalistaTour() {
    return document.body.classList.contains('modo-minimalista');
}

function _setDetailsOpenTour(id, abierto) {
    const el = document.getElementById(id);
    if (el) el.open = abierto;
}

function _ocultarPanelZenTour(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('zen-active');
    el.style.display = 'none';
}

function _cerrarModalDescargaTour() {
    if (typeof cerrarModalDescarga === 'function') cerrarModalDescarga();
    const modalDescarga = document.getElementById('modal-descarga');
    if (modalDescarga) modalDescarga.style.display = 'none';
}

function _cerrarMenuOcrTour() {
    _setDetailsOpenTour('zen-details-ocr', false);
    const ocrDropdown = document.getElementById('dropdown-ocr-menu');
    if (ocrDropdown) ocrDropdown.classList.remove('show');
}

function _desactivarTraduccionYSubtitulosTour() {
    if (typeof configurarTraduccionTutorial === 'function') configurarTraduccionTutorial(false);
    if (typeof window.limpiarSubtitulosTraduccion === 'function') window.limpiarSubtitulosTraduccion();
}

function _obtenerElementosSpotlightPaso1() {
    return {
        btnPdf: document.getElementById('btn-pdf'),
        cardModalPdf: document.getElementById('modal-lanzador-card-pdf')
            || document.querySelector('#lira-lanzador-overlay .lanzador-card:first-child'),
        cardBienvenidaPdf: document.getElementById('card-bienvenida-pdf')
            || document.querySelector('#lira-bienvenida .lanzador-card:first-child')
    };
}

function sincronizarSpotlightPaso1() {
    const overlay = document.getElementById('tour-guia-overlay');
    const tourVisible = overlay && overlay.style.display !== 'none';
    if (!window.tutorialActivo || !tourVisible || window.tutorialPasoActual !== 0) {
        quitarResaltadoTour();
        return;
    }

    const overlayLanzador = document.getElementById('lira-lanzador-overlay');
    const lanzadorAbierto = Boolean(overlayLanzador && overlayLanzador.classList.contains('activo'));
    const bienvenida = document.getElementById('lira-bienvenida');
    const bienvenidaVisible = Boolean(bienvenida && bienvenida.style.display !== 'none' && document.body.contains(bienvenida));

    const { btnPdf, cardModalPdf, cardBienvenidaPdf } = _obtenerElementosSpotlightPaso1();
    [btnPdf, cardModalPdf, cardBienvenidaPdf].forEach(el => el?.classList.remove('tour-spotlight-active'));

    if (lanzadorAbierto) {
        cardModalPdf?.classList.add('tour-spotlight-active');
        document.body.classList.remove('tour-activo-lanzador');
    } else if (bienvenidaVisible) {
        cardBienvenidaPdf?.classList.add('tour-spotlight-active');
        btnPdf?.classList.add('tour-spotlight-active');
        document.body.classList.add('tour-activo-lanzador');
    } else {
        btnPdf?.classList.add('tour-spotlight-active');
        document.body.classList.remove('tour-activo-lanzador');
    }
}

function asegurarModalConfigAbiertoEnTab(tabId) {
    const modal = document.getElementById('modalConfig');
    if (modal && modal.style.display !== 'flex') {
        if (typeof abrirConfiguracion === 'function') {
            abrirConfiguracion();
        } else {
            modal.style.display = 'flex';
        }
    }
    document.body.classList.add('tour-config-abierto');
    if (tabId) {
        document.querySelectorAll('#modalConfig .tab-content').forEach(t => {
            t.style.display = 'none';
            t.classList.remove('active');
        });
        document.querySelectorAll('#modalConfig .tab-btn').forEach(b => b.classList.remove('active'));
        const panel = document.getElementById(tabId);
        if (panel) {
            panel.style.display = 'block';
            panel.classList.add('active');
        }
        const btn = document.querySelector(`#modalConfig button[onclick*="'${tabId}'"]`);
        if (btn) btn.classList.add('active');
    }
}

// ============================================================================
// SELECTOR DE IDIOMA INICIAL (PRE-TUTORIAL — SOLO PRIMERA APERTURA)
// ============================================================================

const _IDIOMAS_DISPONIBLES_TOUR = [
    { code: 'es', label: 'Español (América Latina)' },
    { code: 'en', label: 'English (United States)' },
    { code: 'fr', label: 'Français (France)' },
    { code: 'de', label: 'Deutsch (Deutschland)' },
    { code: 'pt', label: 'Português (Brasil)' },
    { code: 'zh', label: '中文 (China)' },
    { code: 'ru', label: 'Русский (Россия)' },
    { code: 'ar', label: 'العربية (Arabic)' },
    { code: 'hi', label: 'हिन्दी (Hindi)' },
    { code: 'bn', label: 'বাংলা (Bengali)' }
];

function _obtenerListaIdiomasSelectorInicial() {
    const radiosMenu = Array.from(document.querySelectorAll('#tab-idioma input[name="radio-idioma"]'));
    if (radiosMenu.length === 0) return _IDIOMAS_DISPONIBLES_TOUR;
    return radiosMenu.map(r => ({
        code: r.value,
        label: (r.parentElement ? r.parentElement.textContent : r.value).trim()
    }));
}

function _inyectarEstilosSelectorIdiomaInicial() {
    if (document.getElementById('lira-idioma-inicial-styles')) return;
    const st = document.createElement('style');
    st.id = 'lira-idioma-inicial-styles';
    st.textContent = `
        #lira-modal-idioma-inicial {
            position: fixed; inset: 0; z-index: 98000; display: flex;
            align-items: center; justify-content: center;
            background: rgba(15, 23, 42, 0.62); backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px); animation: liraFadeInIdioma 0.22s ease-out;
        }
        @keyframes liraFadeInIdioma {
            from { opacity: 0; transform: scale(0.97); }
            to { opacity: 1; transform: scale(1); }
        }
        .lira-idioma-card {
            width: 500px; max-width: calc(100vw - 32px); background: #ffffff; color: #1e293b;
            border-radius: 14px; border: 1px solid #e2e8f0; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
            padding: 24px; display: flex; flex-direction: column; gap: 16px;
        }
        .lira-idioma-header { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; }
        .lira-idioma-icon { width: 40px; height: 40px; border-radius: 10px; background: #f1f5f9; color: #334155; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .lira-idioma-title { margin: 0; font-size: 17px; font-weight: 700; color: #0f172a; }
        .lira-idioma-desc { margin: 3px 0 0 0; font-size: 12px; color: #64748b; line-height: 1.4; }
        .lira-idioma-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 310px; overflow-y: auto; padding-right: 2px; }
        .lira-idioma-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; color: #1e293b; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.16s ease; user-select: none; }
        .lira-idioma-item:hover { background: #f1f5f9; border-color: #94a3b8; }
        .lira-idioma-item.activo { background: #eff6ff; border-color: #3b82f6; color: #1d4ed8; box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.25); }
        .lira-idioma-radio-dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #94a3b8; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .lira-idioma-item.activo .lira-idioma-radio-dot { border-color: #2563eb; }
        .lira-idioma-item.activo .lira-idioma-radio-dot::after { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #2563eb; }
        .lira-idioma-footer { display: flex; justify-content: flex-end; padding-top: 8px; border-top: 1px solid #e2e8f0; }
        .lira-idioma-btn-continuar { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 22px; border-radius: 8px; border: 1px solid transparent; background: #2563eb; color: #ffffff; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.18s ease; }
        .lira-idioma-btn-continuar:hover { background: #1d4ed8; transform: translateY(-1px); }
        body.ui-dark-mode .lira-idioma-card { background: #161b22; color: #e6edf3; border-color: #30363d; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7); }
        body.ui-dark-mode .lira-idioma-header, body.ui-dark-mode .lira-idioma-footer { border-color: #30363d; }
        body.ui-dark-mode .lira-idioma-icon { background: #21262d; color: #e6edf3; border: 1px solid #30363d; }
        body.ui-dark-mode .lira-idioma-title { color: #f0f6fc; }
        body.ui-dark-mode .lira-idioma-desc { color: #8b949e; }
        body.ui-dark-mode .lira-idioma-item { background: #0d1117; border-color: #30363d; color: #c9d1d9; }
        body.ui-dark-mode .lira-idioma-item:hover { background: #21262d; border-color: #484f58; color: #f0f6fc; }
        body.ui-dark-mode .lira-idioma-item.activo { background: #21262d; border-color: #58a6ff; color: #ffffff; box-shadow: 0 0 0 1px rgba(88, 166, 255, 0.3); }
        body.ui-dark-mode .lira-idioma-item.activo .lira-idioma-radio-dot { border-color: #58a6ff; }
        body.ui-dark-mode .lira-idioma-item.activo .lira-idioma-radio-dot::after { background: #58a6ff; }
        body.ui-dark-mode .lira-idioma-btn-continuar { background: #21262d; color: #f0f6fc; border-color: #484f58; }
        body.ui-dark-mode .lira-idioma-btn-continuar:hover { background: #30363d; border-color: #8b949e; color: #ffffff; }
    `;
    document.head.appendChild(st);
}

function _actualizarTextosModalIdiomaInicial(overlay) {
    const tFn = (typeof window.t === 'function') ? window.t : ((k, fb) => fb);
    const limpiarEmoji = (txt) => String(txt || '').replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+/u, '').trim();
    const elTitulo = overlay.querySelector('#lira-idioma-inicial-titulo');
    const elDesc = overlay.querySelector('#lira-idioma-inicial-desc');
    const elBtnTxt = overlay.querySelector('#lira-idioma-btn-texto');
    if (elTitulo) elTitulo.textContent = limpiarEmoji(tFn('lbl-idioma-titulo', 'Idioma de la Interfaz')) || 'Idioma de la Interfaz';
    if (elDesc) elDesc.textContent = tFn('lbl-idioma-desc', 'Selecciona el idioma con el que deseas utilizar la aplicación.');
    if (elBtnTxt) elBtnTxt.textContent = tFn('btn-listo', 'Listo');
}

function _aplicarIdiomaEnSelectorInicial(overlay, code) {
    const radio = document.querySelector(`input[name="radio-idioma"][value="${code}"]`);
    if (radio) radio.checked = true;
    if (typeof toggleIdiomaDrop === 'function') toggleIdiomaDrop(code);
    if (typeof window.sincronizarVozConIdiomaUI === 'function') window.sincronizarVozConIdiomaUI(code);
    overlay.querySelectorAll('.lira-idioma-item').forEach(btn => {
        btn.classList.toggle('activo', btn.dataset.lang === code);
    });
    _actualizarTextosModalIdiomaInicial(overlay);
}

window.mostrarSelectorIdiomaInicial = function () {
    if (window.tutorialCompletado || window.tutorialActivo) return;
    if (document.getElementById('lira-modal-idioma-inicial')) return;

    const listaIdiomas = _obtenerListaIdiomasSelectorInicial();
    let idiomaSeleccionado = (typeof currentLanguage !== 'undefined' && currentLanguage)
        ? currentLanguage
        : (document.querySelector('input[name="radio-idioma"]:checked')?.value || 'es');

    _inyectarEstilosSelectorIdiomaInicial();

    const overlay = document.createElement('div');
    overlay.id = 'lira-modal-idioma-inicial';
    overlay.innerHTML = `
        <div class="lira-idioma-card" role="dialog" aria-modal="true">
            <div class="lira-idioma-header">
                <div class="lira-idioma-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="2" y1="12" x2="22" y2="12"></line>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                    </svg>
                </div>
                <div>
                    <h3 id="lira-idioma-inicial-titulo" class="lira-idioma-title">Idioma de la Interfaz</h3>
                    <p id="lira-idioma-inicial-desc" class="lira-idioma-desc">Selecciona el idioma con el que deseas utilizar la aplicación.</p>
                </div>
            </div>
            <div id="lira-idioma-inicial-grid" class="lira-idioma-grid"></div>
            <div class="lira-idioma-footer">
                <button type="button" id="lira-idioma-btn-confirmar" class="lira-idioma-btn-continuar">
                    <span id="lira-idioma-btn-texto">Listo</span>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const grid = overlay.querySelector('#lira-idioma-inicial-grid');
    listaIdiomas.forEach(item => {
        const btn = document.createElement('div');
        btn.className = 'lira-idioma-item' + (item.code === idiomaSeleccionado ? ' activo' : '');
        btn.dataset.lang = item.code;
        btn.innerHTML = `<span class="lira-idioma-radio-dot"></span><span>${item.label}</span>`;
        btn.addEventListener('click', () => {
            idiomaSeleccionado = item.code;
            _aplicarIdiomaEnSelectorInicial(overlay, item.code);
        });
        grid.appendChild(btn);
    });

    _actualizarTextosModalIdiomaInicial(overlay);

    const btnConfirmar = overlay.querySelector('#lira-idioma-btn-confirmar');
    if (btnConfirmar) {
        btnConfirmar.addEventListener('click', () => {
            _aplicarIdiomaEnSelectorInicial(overlay, idiomaSeleccionado);
            overlay.remove();
            window.abrirTutorial(0, { auto: true, desdeSelectorIdioma: true });
        });
    }
};

// ============================================================================
// FUNCIONES DE CONTROL DEL TOUR
// ============================================================================

window.abrirTutorial = function (pasoInicial = 0, { auto = false, desdeSelectorIdioma = false } = {}) {
    if (auto && window.tutorialCompletado) return;
    if (auto && !desdeSelectorIdioma) {
        window.mostrarSelectorIdiomaInicial();
        return;
    }
    const overlay = document.getElementById('tour-guia-overlay');
    const card = document.getElementById('tour-card');
    if (!overlay) return;

    window.tutorialActivo = true;
    document.body.classList.add('tour-guia-activo');
    // Pausar temporalmente Solo Lectura durante el tutorial para que la lectura y el resaltado karaoke funcionen
    window._soloLecturaPrevioTutorial = !!window.modoSoloLecturaActivo;
    if (window.modoSoloLecturaActivo) {
        if (typeof toggleModoSoloLectura === 'function') {
            toggleModoSoloLectura(false, true);
        } else {
            window.modoSoloLecturaActivo = false;
        }
    }
    window.tutorialPasoActual = Math.max(0, Math.min(pasoInicial, PASOS_TOUR_GUI.length - 1));
    overlay.style.display = 'block';
    if (card) card.style.display = 'block';

    renderizarPasoTour();
};

function _cerrarPanelesYModalesAlSalirTutorial() {
    document.body.classList.remove('tour-guia-activo', 'tour-traductor-abierto', 'tour-gestor-abierto', 'tour-notas-abierto', 'tour-activo-zen-menu', 'tour-config-abierto');
    _setDetailsOpenTour('zen-details-edicion-bar', false);
    _cerrarMenuOcrTour();
    _cerrarModalDescargaTour();
    const modalCfg = document.getElementById('modalConfig');
    if (modalCfg) modalCfg.style.display = 'none';
    if (typeof cerrarPanelSubrayados === 'function') cerrarPanelSubrayados();
    if (typeof cerrarModalNotas === 'function') cerrarModalNotas();
    if (typeof cerrarPanelNotaRapida === 'function') cerrarPanelNotaRapida();
    desactivarMocksTutorialExtraccion();
    try {
        const chkTeatro = document.getElementById('chk-teatro-global');
        if (chkTeatro && chkTeatro.checked) {
            chkTeatro.checked = false;
            if (typeof toggleModoTeatroGlobal === 'function') toggleModoTeatroGlobal(false);
        }
        window.modoTeatroActivo = false;
    } catch (eTeatro) {}
    _desactivarTraduccionYSubtitulosTour();
    const overlay = document.getElementById('tour-guia-overlay');
    const card = document.getElementById('tour-card');
    if (overlay) overlay.style.display = 'none';
    if (card) card.style.display = 'none';
}

async function _limpiarDiccionarioDemoTutorial(langIso) {
    const cfgAbrev = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
    if (typeof dbDiccionario === 'undefined' || !dbDiccionario) return;
    const objetivos = [cfgAbrev.siglaEjemplo, cfgAbrev.siglaExtra].filter(Boolean).map(s => s.toLowerCase());
    for (const sec in dbDiccionario) {
        const termsObj = dbDiccionario[sec]?.terms;
        if (!termsObj) continue;
        Object.keys(termsObj).forEach(k => {
            if (objetivos.includes(k.toLowerCase())) delete termsObj[k];
        });
    }
    if (typeof eel !== 'undefined' && typeof eel.guardar_diccionario === 'function') {
        await eel.guardar_diccionario(dbDiccionario)();
    }
}

async function _limpiarTeatroDemoTutorial(langIso) {
    const cfgTeatro = DEMO_TEATRO_POR_IDIOMA[langIso] || DEMO_TEATRO_POR_IDIOMA.es;
    if (typeof dbTeatro === 'undefined' || !dbTeatro) return;
    const norm = (s) => String(s || '').replace(/[:.,;]/g, '').trim().toLowerCase();
    const preNorm = norm(cfgTeatro.actorPreRegistrado);
    const ejNorm = norm(cfgTeatro.actorEjemplo);
    for (const obra in dbTeatro) {
        const actorsObj = dbTeatro[obra]?.actors;
        if (!actorsObj) continue;
        Object.keys(actorsObj).forEach(k => {
            const kNorm = norm(k);
            if (kNorm === preNorm || kNorm === ejNorm) delete actorsObj[k];
        });
    }
    if (typeof eel !== 'undefined' && typeof eel.guardar_diccionario_teatro === 'function') {
        await eel.guardar_diccionario_teatro(dbTeatro)();
    }
}

async function _persistirCierreTutorialCompletado() {
    if (typeof window.sincronizarVozConIdiomaUI === 'function') {
        window.sincronizarVozConIdiomaUI(typeof currentLanguage !== 'undefined' ? currentLanguage : 'es');
    }
    window.tutorialCompletado = true;
    try { localStorage.setItem('liraloud_tutorial_completado', 'true'); } catch (e) {}

    if (typeof eel !== 'undefined' && typeof eel.guardar_estado_tutorial === 'function') {
        try { await eel.guardar_estado_tutorial(true)(); }
        catch (err) { console.warn("⚠️ No se pudo guardar tutorial_estado.json:", err); }
    }

    if (window._soloLecturaPrevioTutorial) {
        if (typeof toggleModoSoloLectura === 'function') toggleModoSoloLectura(true, true);
        else window.modoSoloLecturaActivo = true;
        window._soloLecturaPrevioTutorial = false;
    }

    if (typeof guardarTodosAjustes === 'function') {
        try { await guardarTodosAjustes(false); }
        catch (err) { console.warn("⚠️ No se pudo ejecutar guardarTodosAjustes:", err); }
    }
}

window.cerrarTutorial = async function (completado = true) {
    detenerAudioTutorial();
    window.tutorialActivo = false;
    _cerrarPanelesYModalesAlSalirTutorial();
    limpiarListenersCondicionales();
    quitarResaltadoTour();

    try {
        const langIso = detectarIdiomaTutorialActivo();
        await _limpiarDiccionarioDemoTutorial(langIso);
        await _limpiarTeatroDemoTutorial(langIso);
    } catch (e) {
        console.warn("⚠️ Error limpiando datos de prueba del tutorial:", e);
    }

    if (completado) {
        await _persistirCierreTutorialCompletado();
    }

    setTimeout(() => { window.location.reload(); }, 120);
};

window.saltarTutorial = async function () {
    detenerAudioTutorial();
    if (typeof liraConfirm === 'function') {
        const confirmar = await liraConfirm(getTourText("tour-msg-confirmar-salir", "¿Deseas salir del tour guiado? Podrás volver a consultarlo en cualquier momento desde Configuración."), "graduacion");
        if (!confirmar) return;
    }
    await window.cerrarTutorial(true);
};

function _restaurarSelectorSiVacio(selId, inpId, prevVal, prevTxt) {
    const sel = document.getElementById(selId);
    const inp = document.getElementById(inpId);
    if (sel && sel.selectedIndex < 0 && prevVal) sel.value = prevVal;
    if (inp && !inp.value && prevTxt) inp.value = prevTxt;
}

function _avanzarPaso1Y2Tour() {
    if (window.tutorialPasoActual === 1 && subEtapaPaso2 < 3) {
        if (subEtapaPaso2 === 1) _restaurarSelectorSiVacio('filtro-idioma', 'busqueda-idioma-live', window._tourPrevIdiomaVal, window._tourPrevIdiomaTxt);
        else if (subEtapaPaso2 === 2) _restaurarSelectorSiVacio('selector-voz-live', 'busqueda-voz-live', window._tourPrevVozVal, window._tourPrevVozTxt);
        subEtapaPaso2++;
        return true;
    }
    if (window.tutorialPasoActual === 1) _ocultarPanelZenTour('zen-panel-voz');
    if (window.tutorialPasoActual === 2 && subEtapaPaso3 === 0) { subEtapaPaso3 = 1; return true; }
    if (window.tutorialPasoActual === 2 && subEtapaPaso3 === 2) {
        _setDetailsOpenTour('zen-details-filtros', false);
        _ocultarPanelZenTour('zen-panel-menu');
        document.body.classList.remove('tour-activo-zen-menu');
    }
    return false;
}

function _avanzarPasoPorIndiceTour() {
    if (_avanzarPaso1Y2Tour()) return true;
    if (window.tutorialPasoActual === 3) {
        if (_esModoMinimalistaTour() && subEtapaPaso4a === 0 && subEtapaZenLimites < 2) { subEtapaZenLimites++; return true; }
        if (subEtapaPaso4a < 4) { subEtapaPaso4a++; return true; }
    }
    if (window.tutorialPasoActual === 6 && _esModoMinimalistaTour() && subEtapaZenDicc < 1) {
        subEtapaZenDicc++;
        return true;
    }
    return false;
}

function _avanzarPaso8bDesactivarAbrev() {
    if (subEtapaPaso8b === 0) {
        if (_esModoMinimalistaTour() && subEtapaZenDicc < 1) {
            subEtapaZenDicc = 1;
            return true;
        }
        const modalDicc = document.getElementById('modal-diccionario');
        if (modalDicc && modalDicc.style.display !== 'flex') {
            if (typeof abrirDiccionario === 'function') abrirDiccionario();
            else modalDicc.style.display = 'flex';
        }
        subEtapaPaso8b = 1;
        return true;
    }
    if (subEtapaPaso8b === 1) {
        asegurarEstadoDiccionarioTutorial(false, false);
        subEtapaPaso8b = 2;
        return true;
    }
    asegurarEstadoDiccionarioTutorial(false, false);
    const modalDicc = document.getElementById('modal-diccionario');
    if (modalDicc) modalDicc.style.display = 'none';
    return false;
}

function _avanzarPasoDiccionarioYTeatro(pasoId) {
    if (pasoId === 'paso_7b_campo_significado') {
        asegurarEstadoDiccionarioTutorial(true, false);
        if (subEtapaPaso7c === 0) { subEtapaPaso7c = 1; return true; }
        const modalDicc = document.getElementById('modal-diccionario');
        if (modalDicc) modalDicc.style.display = 'none';
    } else if (pasoId === 'paso_8b_desactivar_abreviatura') {
        return _avanzarPaso8bDesactivarAbrev();
    } else if (pasoId === 'paso_9a_abrir_teatro') {
        if (_esModoMinimalistaTour() && subEtapaZenTeatro < 1) { subEtapaZenTeatro = 1; return true; }
    } else if (pasoId === 'paso_9c_asignar_voz_teatro') {
        asegurarEstadoTeatroTutorial(true, false);
        if (subEtapaPaso9c === 0) { subEtapaPaso9c = 1; return true; }
        const modalTeatro = document.getElementById('modal-teatro');
        if (modalTeatro) modalTeatro.style.display = 'none';
    }
    return false;
}

function _avanzarPasoIAYTraductor(pasoId) {
    if (pasoId === 'paso_10a_abrir_ia') {
        if (_esModoMinimalistaTour() && subEtapaZenIA < 1) { subEtapaZenIA = 1; return true; }
    } else if (pasoId === 'paso_10e_modelos_ia') {
        if (typeof cerrarModalIA === 'function') cerrarModalIA();
        else {
            const modalIA = document.getElementById('modal-ia');
            if (modalIA) modalIA.style.display = 'none';
        }
        document.body.classList.remove('tour-ia-abierto');
    } else if (pasoId === 'paso_10f_abrir_traductor') {
        if (_esModoMinimalistaTour() && subEtapaZenTraductor < 1) { subEtapaZenTraductor = 1; return true; }
        _setDetailsOpenTour('details-traduccion-main', true);
        _setDetailsOpenTour('zen-details-traduccion', true);
        document.body.classList.add('tour-traductor-abierto');
    } else if (pasoId === 'paso_10j_trad_modos') {
        _setDetailsOpenTour('details-traduccion-main', false);
        _setDetailsOpenTour('zen-details-traduccion', false);
        document.body.classList.remove('tour-traductor-abierto');
    } else if (pasoId === 'paso_10k_probar_traductor') {
        _desactivarTraduccionYSubtitulosTour();
    }
    return false;
}

function _avanzarSubrayadoDemoTour(subActual, setSub, hexColor, demoHecho, nombreColor) {
    if (subActual === 0) {
        setSub(1);
        _setDetailsOpenTour('zen-details-edicion-bar', true);
        return true;
    }
    if (subActual === 1) {
        setSub(2);
        if (typeof setSubrayadoColor === 'function') setSubrayadoColor(hexColor);
        _setDetailsOpenTour('zen-details-edicion-bar', false);
        return true;
    }
    if (!demoHecho) simularSubrayadoDemo(nombreColor);
    _setDetailsOpenTour('zen-details-edicion-bar', false);
    return false;
}

function _avanzarPaso10nRecorte() {
    if (_esModoMinimalistaTour() && subEtapaEdicionRecorte === 0) {
        subEtapaEdicionRecorte = 1;
        _setDetailsOpenTour('zen-details-edicion-bar', true);
        return true;
    }
    if (subEtapaEdicionRecorte <= 1) {
        subEtapaEdicionRecorte = 2;
        _setDetailsOpenTour('zen-details-edicion-bar', false);
        if (typeof toggleModoRecorteExtraccion === 'function' && !window.modoRecorteActivo) toggleModoRecorteExtraccion();
        return true;
    }
    if (!demoCapturaHecha) simularCapturaDemo();
    if (window.modoRecorteActivo && typeof toggleModoRecorteExtraccion === 'function') toggleModoRecorteExtraccion(false);
    _setDetailsOpenTour('zen-details-edicion-bar', false);
    return false;
}

function _avanzarPasoRecorteYGestor(pasoId) {
    if (pasoId === 'paso_10n_capturar_recorte') return _avanzarPaso10nRecorte();
    if (pasoId === 'paso_10o_abrir_gestor') {
        const detZen = document.getElementById('zen-details-edicion-bar');
        if (_esModoMinimalistaTour() && subEtapaEdicionGestor < 1 && !detZen?.open) {
            subEtapaEdicionGestor = 1;
            _setDetailsOpenTour('zen-details-edicion-bar', true);
            return true;
        }
        _setDetailsOpenTour('zen-details-edicion-bar', false);
    } else if (pasoId === 'paso_10p_explorar_gestor') {
        document.body.classList.remove('tour-gestor-abierto');
        if (typeof cerrarPanelSubrayados === 'function') cerrarPanelSubrayados();
    }
    return false;
}

function _esPanelNotaAbiertoTour(id, aceptarBlock = false) {
    const el = document.getElementById(id);
    if (!el) return false;
    if (el.style.display === 'flex') return true;
    if (aceptarBlock) return el.style.display === 'block';
    return window.getComputedStyle(el).display === 'flex';
}

function _avanzarPasoNotasTour(pasoId) {
    if (pasoId === 'paso_10q_nota_rapida') {
        if (_esModoMinimalistaTour() && subEtapaZenNotaRapida < 1 && !_esPanelNotaAbiertoTour('panel-nota-rapida', false)) {
            subEtapaZenNotaRapida = 1;
            return true;
        }
        document.body.classList.remove('tour-nota-rapida-abierta', 'tour-activo-zen-menu');
        if (typeof cerrarPanelNotaRapida === 'function') cerrarPanelNotaRapida();
    } else if (pasoId === 'paso_10r_cuaderno_apuntes') {
        if (_esModoMinimalistaTour() && subEtapaZenCuaderno < 1 && !_esPanelNotaAbiertoTour('modal-notas', true)) {
            subEtapaZenCuaderno = 1;
            return true;
        }
        document.body.classList.remove('tour-notas-abierto', 'tour-activo-zen-menu');
        if (typeof cerrarModalNotas === 'function') cerrarModalNotas();
    }
    return false;
}

function _avanzarPasoOCRYDescargaTour(pasoId) {
    if (pasoId === 'paso_10s_reconocimiento_ocr') {
        if (subEtapaZenOCR < 2) {
            subEtapaZenOCR = _esModoMinimalistaTour() ? (subEtapaZenOCR + 1) : 2;
            return true;
        }
        _cerrarMenuOcrTour();
    } else if (pasoId === 'paso_10t_descargar_audio') {
        const pm = document.getElementById('zen-panel-menu');
        const abierto = pm && (pm.classList.contains('zen-active') || pm.style.display === 'flex' || pm.style.display === 'block');
        if (_esModoMinimalistaTour() && subEtapaZenDescarga < 1 && !abierto) { subEtapaZenDescarga = 1; return true; }
        document.body.classList.remove('tour-activo-zen-menu');
        _ocultarPanelZenTour('zen-panel-menu');
        _cerrarModalDescargaTour();
    }
    return false;
}

function _avanzarPasoNotasOCRYDescarga(pasoId) {
    return _avanzarPasoNotasTour(pasoId) || _avanzarPasoOCRYDescargaTour(pasoId);
}

function _avanzarPasoPorIdTour(pasoId) {
    if (pasoId === 'paso_10l_subrayar_azul') {
        return _avanzarSubrayadoDemoTour(subEtapaEdicionAzul, v => { subEtapaEdicionAzul = v; }, '#00FFFF', demoSubrayadoAzulHecho, 'azul');
    }
    if (pasoId === 'paso_10m_subrayar_rosa') {
        return _avanzarSubrayadoDemoTour(subEtapaEdicionRosa, v => { subEtapaEdicionRosa = v; }, '#FF00FF', demoSubrayadoRosaHecho, 'rosa');
    }
    return _avanzarPasoDiccionarioYTeatro(pasoId)
        || _avanzarPasoIAYTraductor(pasoId)
        || _avanzarPasoRecorteYGestor(pasoId)
        || _avanzarPasoNotasOCRYDescarga(pasoId);
}

window.avanzarPasoTutorial = function () {
    detenerAudioTutorial();
    const pasoIdActual = PASOS_TOUR_GUI[window.tutorialPasoActual]?.id;
    if (_avanzarPasoPorIndiceTour() || _avanzarPasoPorIdTour(pasoIdActual)) {
        renderizarPasoTour();
        return;
    }

    limpiarListenersCondicionales();
    subEtapaPaso3 = 0;
    if (window.tutorialPasoActual < PASOS_TOUR_GUI.length - 1) {
        window.tutorialPasoActual++;
        if (PASOS_TOUR_GUI[window.tutorialPasoActual]?.id === 'paso_10t_descargar_audio' && _esModoMinimalistaTour()) {
            subEtapaZenDescarga = 1;
            const pMenu = document.getElementById('zen-panel-menu');
            if (pMenu) {
                pMenu.classList.add('zen-active');
                pMenu.style.display = 'flex';
            }
            document.body.classList.add('tour-activo-zen-menu');
        }
        renderizarPasoTour();
    } else {
        window.cerrarTutorial(true);
    }
};

function _retrocederPaso3Y6Tour() {
    if (window.tutorialPasoActual === 3) {
        if (_esModoMinimalistaTour() && subEtapaPaso4a === 0 && subEtapaZenLimites > 0) { subEtapaZenLimites--; return true; }
        if (subEtapaPaso4a > 0) { subEtapaPaso4a--; return true; }
    }
    if (window.tutorialPasoActual === 6 && _esModoMinimalistaTour() && subEtapaZenDicc > 0) { subEtapaZenDicc--; return true; }
    return false;
}

function _retrocederPasoPorIndiceTour() {
    if (window.tutorialPasoActual === 1 && subEtapaPaso2 > 0 && (_esModoMinimalistaTour() || subEtapaPaso2 > 1)) {
        subEtapaPaso2--;
        return true;
    }
    if (window.tutorialPasoActual === 2 && subEtapaPaso3 > 0) { subEtapaPaso3--; return true; }
    return _retrocederPaso3Y6Tour();
}

function _retrocederPasoTeatroIAYDescarga(pasoId) {
    if (pasoId === 'paso_9a_abrir_teatro' && _esModoMinimalistaTour() && subEtapaZenTeatro > 0) { subEtapaZenTeatro--; return true; }
    if (pasoId === 'paso_9c_asignar_voz_teatro' && subEtapaPaso9c > 0) { subEtapaPaso9c--; return true; }
    if (pasoId === 'paso_10a_abrir_ia' && _esModoMinimalistaTour() && subEtapaZenIA > 0) { subEtapaZenIA--; return true; }
    if (pasoId === 'paso_11a_abrir_config') {
        if (typeof cerrarModalDescarga === 'function') cerrarModalDescarga();
    } else if (pasoId === 'paso_10t_descargar_audio') {
        if (_esModoMinimalistaTour() && subEtapaZenDescarga > 0) { subEtapaZenDescarga--; return true; }
        _cerrarModalDescargaTour();
    }
    return false;
}

function _retrocederPaso10rY10qNotas(pasoId) {
    if (pasoId === 'paso_10r_cuaderno_apuntes') {
        if (_esModoMinimalistaTour() && subEtapaZenCuaderno > 0) { subEtapaZenCuaderno--; return true; }
        document.body.classList.remove('tour-notas-abierto', 'tour-activo-zen-menu');
        if (typeof cerrarModalNotas === 'function') cerrarModalNotas();
        document.body.classList.add('tour-nota-rapida-abierta');
        if (typeof abrirPanelNotaRapida === 'function') abrirPanelNotaRapida();
    } else if (pasoId === 'paso_10q_nota_rapida') {
        if (_esModoMinimalistaTour() && subEtapaZenNotaRapida > 0) { subEtapaZenNotaRapida--; return true; }
        document.body.classList.remove('tour-nota-rapida-abierta', 'tour-activo-zen-menu');
        if (typeof cerrarPanelNotaRapida === 'function') cerrarPanelNotaRapida();
        document.body.classList.add('tour-gestor-abierto');
        if (typeof mostrarPanelSubrayados === 'function') mostrarPanelSubrayados();
    }
    return false;
}

function _retrocederPasoOCRYNotas(pasoId) {
    if (pasoId === 'paso_10s_reconocimiento_ocr') {
        if (_esModoMinimalistaTour() && subEtapaZenOCR > 0) { subEtapaZenOCR--; return true; }
        _cerrarMenuOcrTour();
        document.body.classList.add('tour-notas-abierto');
        if (typeof abrirModalNotas === 'function') abrirModalNotas();
        return false;
    }
    return _retrocederPaso10rY10qNotas(pasoId);
}

function _retrocederPasoEdicionYTraductor(pasoId) {
    if (pasoId === 'paso_10p_explorar_gestor') {
        document.body.classList.remove('tour-gestor-abierto');
        if (typeof cerrarPanelSubrayados === 'function') cerrarPanelSubrayados();
        if (_esModoMinimalistaTour()) _setDetailsOpenTour('zen-details-edicion-bar', true);
    } else if (pasoId === 'paso_10o_abrir_gestor' && _esModoMinimalistaTour() && subEtapaEdicionGestor > 0) {
        subEtapaEdicionGestor = 0;
        _setDetailsOpenTour('zen-details-edicion-bar', false);
        return true;
    } else if (pasoId === 'paso_10l_subrayar_azul') {
        _setDetailsOpenTour('zen-details-edicion-bar', false);
    } else if (pasoId === 'paso_10k_probar_traductor') {
        _setDetailsOpenTour('details-traduccion-main', true);
        _setDetailsOpenTour('zen-details-traduccion', true);
        document.body.classList.add('tour-traductor-abierto');
    } else if (pasoId === 'paso_10g_trad_activar') {
        document.body.classList.remove('tour-traductor-abierto');
    } else if (pasoId === 'paso_10f_abrir_traductor' && _esModoMinimalistaTour() && subEtapaZenTraductor > 0) {
        subEtapaZenTraductor--;
        return true;
    }
    return false;
}

window.retrocederPasoTutorial = function () {
    detenerAudioTutorial();
    const pasoIdRetro = PASOS_TOUR_GUI[window.tutorialPasoActual]?.id;
    if (_retrocederPasoPorIndiceTour()
        || _retrocederPasoTeatroIAYDescarga(pasoIdRetro)
        || _retrocederPasoOCRYNotas(pasoIdRetro)
        || _retrocederPasoEdicionYTraductor(pasoIdRetro)) {
        renderizarPasoTour();
        return;
    }
    limpiarListenersCondicionales();
    if (window.tutorialPasoActual > 0) {
        window.tutorialPasoActual--;
        renderizarPasoTour();
    }
};

function _limpiarTimersEIntervalosTutorial() {
    if (observerLanzadorPaso1) { observerLanzadorPaso1.disconnect(); observerLanzadorPaso1 = null; }
    [intervalPaso2, intervalPaso3, timer5sPaso3, intervalPaso4, intervalPaso5, intervalPaso6, intervalPasoTraductor]
        .forEach(id => { if (id) clearInterval(id); });
    intervalPaso2 = intervalPaso3 = timer5sPaso3 = intervalPaso4 = intervalPaso5 = intervalPaso6 = intervalPasoTraductor = null;
    if (timeoutMouseHintPaso3) { clearTimeout(timeoutMouseHintPaso3); timeoutMouseHintPaso3 = null; }
    if (timeoutSubEtapaPaso3) { clearTimeout(timeoutSubEtapaPaso3); timeoutSubEtapaPaso3 = null; }
}

function _limpiarListenersPaso3Y4Tutorial() {
    if (listenerResizePaso3) { window.removeEventListener('resize', listenerResizePaso3); listenerResizePaso3 = null; }
    if (listenerMouseMovePaso3) { document.removeEventListener('mousemove', listenerMouseMovePaso3); listenerMouseMovePaso3 = null; }
    if (listenerContextMenuPaso3) { document.removeEventListener('contextmenu', listenerContextMenuPaso3); listenerContextMenuPaso3 = null; }
    if (listenerDocClickPaso3) { document.removeEventListener('click', listenerDocClickPaso3, true); listenerDocClickPaso3 = null; }
    if (listenerKeydownPaso4) { document.removeEventListener('keydown', listenerKeydownPaso4, true); listenerKeydownPaso4 = null; }
    window.removeEventListener('resize', posicionarMouseHintPaso3);
}

function _desvincularListenerCondicionalActivo() {
    if (listenerMouseDownActivo) {
        document.removeEventListener('mousedown', listenerMouseDownActivo);
        listenerMouseDownActivo = null;
    }
    if (targetCondicionalActivo && listenerCondicionalActivo) {
        targetCondicionalActivo.removeEventListener('click', listenerCondicionalActivo);
        targetCondicionalActivo.removeEventListener('change', listenerCondicionalActivo);
        targetCondicionalActivo.removeEventListener('input', listenerCondicionalActivo);
    }
    targetCondicionalActivo = null;
    listenerCondicionalActivo = null;
}

function _resetearSubEtapasTutorial() {
    subEtapaPaso2 = 0;
    if (window.tutorialPasoActual !== 2) subEtapaPaso3 = 0;
    subEtapaPaso4a = 0;
    subEtapaZenLimites = 0;
    subEtapaZenDicc = 0;
    subEtapaZenTeatro = 0;
    subEtapaZenIA = 0;
    subEtapaZenNotaRapida = 0;
    subEtapaZenCuaderno = 0;
    subEtapaZenOCR = 0;
    subEtapaZenDescarga = 0;
    subEtapaEdicionAzul = 0;
    subEtapaEdicionRosa = 0;
    subEtapaEdicionRecorte = 0;
    subEtapaEdicionGestor = 0;
    subEtapaPaso7c = 0;
    subEtapaPaso8b = 0;
    subEtapaPaso9c = 0;
}

const _PASOS_EDICION_TOUR = new Set(['paso_10l_subrayar_azul', 'paso_10m_subrayar_rosa', 'paso_10n_capturar_recorte', 'paso_10o_abrir_gestor']);
const _PASOS_CONFIG_TOUR = new Set(['paso_11b_tab_teclado', 'paso_11c_tab_audio', 'paso_11d_tab_estilo', 'paso_11e_tab_rendimiento', 'paso_11f_tab_idioma']);

function _cerrarPanelesNotasYGestorAjenos(pasoActualId) {
    if (pasoActualId !== 'paso_10p_explorar_gestor') {
        document.body.classList.remove('tour-gestor-abierto');
        if (typeof cerrarPanelSubrayados === 'function') cerrarPanelSubrayados();
    }
    if (pasoActualId !== 'paso_10q_nota_rapida') {
        document.body.classList.remove('tour-nota-rapida-abierta', 'tour-activo-zen-menu');
        if (typeof cerrarPanelNotaRapida === 'function') cerrarPanelNotaRapida();
    }
    if (pasoActualId !== 'paso_10r_cuaderno_apuntes') {
        document.body.classList.remove('tour-notas-abierto');
        if (typeof cerrarModalNotas === 'function') cerrarModalNotas();
    }
}

function _cerrarPanelesAjenosAlPasoTutorial(pasoActualId) {
    const estaEnTraductor = Boolean(pasoActualId && (pasoActualId.includes("trad") || pasoActualId === "paso_10k_probar_traductor"));
    if (!estaEnTraductor) {
        document.body.classList.remove('tour-traductor-abierto');
        subEtapaZenTraductor = 0;
        _desactivarTraduccionYSubtitulosTour();
    }
    _cerrarPanelesNotasYGestorAjenos(pasoActualId);
    if (pasoActualId !== 'paso_10s_reconocimiento_ocr') _cerrarMenuOcrTour();
    if (pasoActualId !== 'paso_10t_descargar_audio') _cerrarModalDescargaTour();
    if (!_PASOS_EDICION_TOUR.has(pasoActualId)) _setDetailsOpenTour('zen-details-edicion-bar', false);
    if (!_PASOS_CONFIG_TOUR.has(pasoActualId)) {
        document.body.classList.remove('tour-config-abierto');
        const modalCfg = document.getElementById('modalConfig');
        if (modalCfg) modalCfg.style.display = 'none';
    }
}

function limpiarListenersCondicionales() {
    detenerAudioTutorial();
    limpiarTimeoutsTutorial();
    _limpiarTimersEIntervalosTutorial();
    _limpiarListenersPaso3Y4Tutorial();
    removerMouseHintPaso3();
    removerKeyboardHint();
    window.tutorialGuiaCorteV = null;
    window.tutorialGuiaLimiteH = null;
    window.tutorialGuiaZonaExcluida = null;
    document.getElementById('opcion-leer')?.classList.remove('tour-spotlight-active');
    const btnSig = document.getElementById('btn-tour-next') || document.getElementById('tour-btn-siguiente');
    if (btnSig) {
        btnSig.style.opacity = '1';
        btnSig.style.pointerEvents = 'auto';
    }
    window.tutorialBloquearEspacio = false;
    document.body.classList.remove('tour-paso-lectura', 'tour-activo-zen-menu', 'tour-diccionario-abierto', 'tour-teatro-abierto', 'tour-ia-abierto');
    _resetearSubEtapasTutorial();
    _cerrarPanelesAjenosAlPasoTutorial(PASOS_TOUR_GUI[window.tutorialPasoActual]?.id);
    window.onTrazoSubrayadoTutorial = null;
    window.onColorSubrayadorCambiado = null;
    window.onRecorteVisualTutorial = null;
    if (!window.tutorialActivo) _ocultarPanelZenTour('zen-panel-menu');
    _desvincularListenerCondicionalActivo();
}

// ============================================================================
// RENDERIZADO Y POSICIONAMIENTO INTELIGENTE DEL SPOTLIGHT GUI
// ============================================================================

function _limpiarEmojisTourHtml(textoHtml) {
    let s = String(textoHtml ?? '');
    // Eliminar parentesis que solo contienen emojis/simbolos (ej. (⚡), (⚙️), (☰))
    s = s.replace(/\s*\(\s*[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2300-\u23FF\u2B00-\u2BFF\u2139\u2195\u25B6\u25C0\u2630\u2714\u2715\u2794\uFE0F\u200D]+\s*\)/gu, '');
    // Reemplazar referencias textuales al boton '✕' por 'X'
    s = s.replace(/(['"‘“「『]?)\u2715(['"’”」』]?)/g, '$1X$2');
    // Eliminar flechas/checks finales y cualquier emoji residual
    s = s.replace(/\s*[\u2794\u2714]\s*/g, '');
    s = s.replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2300-\u23FF\u2B00-\u2BFF\u2139\u2195\u25B6\u25C0\u2630\uFE0F\u200D]+/gu, '');
    s = s.replace(/(<br\s*\/?>)\s+/gi, '$1').replace(/<b>\s+/gi, '<b>').replace(/ {2,}/g, ' ').trim();
    return s;
}

function _claveIconoPasoTour(pasoId) {
    const id = String(pasoId || '');
    if (id.includes('lanzador')) return 'archivo';
    if (id.includes('idioma_y_voz')) return 'audio';
    if (id.includes('leer')) return 'reproducir';
    if (id.includes('limite') || id.includes('corte') || id.includes('exclusion')) return 'objetivo';
    if (id.includes('diccionario') || id.includes('abreviatura')) return 'diccionario';
    if (id.includes('teatro')) return 'teatro';
    if (id.includes('ia')) return 'ia';
    if (id.includes('traduc')) return 'traduccion';
    if (id.includes('subray') || id.includes('nota') || id.includes('cuaderno')) return 'editar';
    if (id.includes('captura') || id.includes('recorte')) return 'imagen';
    if (id.includes('ocr')) return 'buscar';
    if (id.includes('descarga')) return 'descarga';
    if (id.includes('config')) return 'configuracion';
    return 'graduacion';
}

function _renderizarTituloTour(titleEl, tituloRaw, defaultClave = 'graduacion') {
    if (!titleEl) return;
    const raw = String(tituloRaw || '');
    const resEmoji = (typeof window.limpiarTextoEmoji === 'function')
        ? window.limpiarTextoEmoji(raw)
        : { clave: null, texto: raw };
    const clave = resEmoji.clave || defaultClave;
    const textoLimpio = _limpiarEmojisTourHtml(resEmoji.texto || raw);
    const esc = (typeof window.escapeHtml === 'function')
        ? window.escapeHtml
        : (s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
    let svgHtml = (typeof window.obtenerIconoDialogoSVG === 'function')
        ? window.obtenerIconoDialogoSVG(clave, 'lira-svg-icon')
        : '';
    if (svgHtml) {
        svgHtml = svgHtml.replace(/width="22"\s+height="22"/, 'width="18" height="18"');
    } else {
        svgHtml = '<svg class="lira-svg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.91 5.09L19 10l-5.09 1.91L12 17l-1.91-5.09L5 10l5.09-1.91L12 3z"></path></svg>';
    }
    titleEl.innerHTML = `${svgHtml}<span id="tour-card-title-texto">${esc(textoLimpio)}</span>`;
}
window._renderizarTituloTour = _renderizarTituloTour;

function _actualizarBotonAudioTour(btnAudio) {
    if (!btnAudio) return;
    const muteado = Boolean(window.tutorialAudioMuteado);
    const txtRaw = muteado
        ? getTourText("tour-btn-voz-mute", "Voz")
        : getTourText("tour-btn-voz-on", "Voz");
    const txtLimpio = _limpiarEmojisTourHtml(txtRaw) || 'Voz';
    const esc = (typeof window.escapeHtml === 'function')
        ? window.escapeHtml
        : (s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
    const svgIcon = muteado
        ? '<svg class="lira-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>'
        : '<svg class="lira-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
    btnAudio.innerHTML = `${svgIcon}<span id="tour-btn-voz-texto" data-i18n="tour-btn-voz">${esc(txtLimpio)}</span>`;
    btnAudio.title = muteado
        ? _limpiarEmojisTourHtml(getTourText("tour-btn-voz-mute-title", "Voz del tutorial silenciada (haz clic para activar)"))
        : _limpiarEmojisTourHtml(getTourText("tour-btn-voz-on-title", "Voz del tutorial activa (haz clic para silenciar)"));
}
window._actualizarBotonAudioTour = _actualizarBotonAudioTour;

function _escaparHtmlTour(s) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _sincronizarSubEtapasEdicionEnRender(pasoId) {
    const esMinimalista = _esModoMinimalistaTour();
    const detZenAbierto = Boolean(document.getElementById('zen-details-edicion-bar')?.open);
    if (pasoId === 'paso_10l_subrayar_azul' && esMinimalista && detZenAbierto && subEtapaEdicionAzul === 0) {
        subEtapaEdicionAzul = 1;
    } else if (pasoId === 'paso_10m_subrayar_rosa' && esMinimalista && detZenAbierto && subEtapaEdicionRosa === 0) {
        subEtapaEdicionRosa = 1;
    } else if (pasoId === 'paso_10n_capturar_recorte' && subEtapaEdicionRecorte === 0 && (!esMinimalista || detZenAbierto)) {
        subEtapaEdicionRecorte = 1;
    } else if (pasoId === 'paso_10o_abrir_gestor' && subEtapaEdicionGestor === 0 && (!esMinimalista || detZenAbierto)) {
        subEtapaEdicionGestor = 1;
    }
}

function _renderizarCuerpoPasoTour(bodyEl, paso, instruccion, detalleExtra) {
    if (!bodyEl) return;
    let demoBtnHtml = '';
    if (paso.botonDemoExtra) {
        const txtDemoRaw = typeof paso.botonDemoExtra.getTexto === 'function' ? paso.botonDemoExtra.getTexto() : paso.botonDemoExtra.texto;
        const txtDemo = _limpiarEmojisTourHtml(txtDemoRaw);
        const demoSvg = '<svg class="lira-svg-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';
        demoBtnHtml = `
            <div style="margin-top:12px; text-align:center;">
                <button id="btn-tour-demo-action" class="tour-btn tour-btn-demo" style="width:100%; justify-content:center; padding:7px 14px; font-size:0.83rem;">
                    ${demoSvg}<span>${_escaparHtmlTour(txtDemo)}</span>
                </button>
            </div>
        `;
    }

    bodyEl.innerHTML = `
        <div style="font-size:0.9rem; color:#ffffff; line-height:1.45; margin-bottom:8px;">
            ${instruccion}
        </div>
        ${detalleExtra ? `
            <div class="tutorial-speech-bubble" style="font-size:0.84rem; margin:8px 0 0 0;">
                ${detalleExtra}
            </div>
        ` : ''}
        ${demoBtnHtml}
    `;

    if (paso.botonDemoExtra) {
        const btnDemo = document.getElementById('btn-tour-demo-action');
        if (btnDemo && typeof paso.botonDemoExtra.accion === 'function') {
            btnDemo.onclick = paso.botonDemoExtra.accion;
        }
    }
}

function _renderizarBotonesNavPasoTour(btnPrev, btnNext) {
    if (btnPrev) btnPrev.style.display = window.tutorialPasoActual === 0 ? 'none' : 'inline-flex';
    if (!btnNext) return;
    const esUltimoPaso = window.tutorialPasoActual === PASOS_TOUR_GUI.length - 1;
    const txtNext = _limpiarEmojisTourHtml(
        esUltimoPaso ? getTourText("tour-btn-finalizar", "Finalizar") : getTourText("tour-btn-siguiente", "Siguiente")
    );
    const nextSvg = esUltimoPaso
        ? '<svg class="lira-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : '<svg class="lira-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    btnNext.innerHTML = `<span id="btn-tour-next-texto" data-i18n="${esUltimoPaso ? 'tour-btn-finalizar' : 'btn-tut-siguiente'}">${_escaparHtmlTour(txtNext)}</span>${nextSvg}`;
}

function _resolverTargetYAplicarSpotlightTour(paso) {
    quitarResaltadoTour();
    let targets = [];
    if (typeof paso.getTargets === 'function') targets = paso.getTargets();
    else if (paso.targetSelector) targets = Array.from(document.querySelectorAll(paso.targetSelector));

    let targetEl = targets.find(t => t && (t.offsetParent !== null || t.getBoundingClientRect().width > 0)) || targets[0];
    if (!targetEl || (targetEl.offsetParent === null && targetEl.getBoundingClientRect().width === 0)) {
        targetEl = document.getElementById('banner-container') || document.body;
    }

    const evitarSpotlight = typeof paso.sinSpotlightAnim === 'function' ? paso.sinSpotlightAnim() : Boolean(paso.sinSpotlightAnim);
    if (!evitarSpotlight) {
        targets.forEach(el => {
            if (el && el !== document.body && el.id !== 'visor-container' && el.id !== 'lienzo-pdf') {
                el.classList.add('tour-spotlight-active');
            }
        });
    }
    if (paso.id === "paso_1_lanzador") document.body.classList.add('tour-activo-lanzador');
    return targetEl;
}

function _montarAccionCondicionalPasoTour(paso) {
    _desvincularListenerCondicionalActivo();
    if (typeof paso.accionCondicional !== 'function') return;

    window.tutorialRenderToken = (window.tutorialRenderToken || 0) + 1;
    const tokenRender = window.tutorialRenderToken;
    const pasoRender = window.tutorialPasoActual;
    let yaAvanzoRender = false;
    paso.accionCondicional(() => {
        if (yaAvanzoRender) return;
        if (tokenRender !== window.tutorialRenderToken || pasoRender !== window.tutorialPasoActual) return;
        yaAvanzoRender = true;
        window.avanzarPasoTutorial();
    });
}

function renderizarPasoTour() {
    const paso = PASOS_TOUR_GUI[window.tutorialPasoActual];
    if (!paso) return;
    if (paso.id !== 'paso_3_leer_y_pausar') removerMouseHintPaso3();

    _sincronizarSubEtapasEdicionEnRender(paso.id);

    const badge = document.getElementById('tour-step-badge');
    if (badge) {
        badge.innerText = getTourText("tour-progreso-paso", "Paso {actual} de {total}")
            .replace("{actual}", window.tutorialPasoActual + 1)
            .replace("{total}", PASOS_TOUR_GUI.length);
    }

    const titulo = typeof paso.getTitulo === 'function' ? paso.getTitulo() : paso.titulo;
    const instruccion = _limpiarEmojisTourHtml(typeof paso.getInstruccion === 'function' ? paso.getInstruccion() : paso.instruccion);
    const detalleExtraRaw = typeof paso.getDetalleExtra === 'function' ? paso.getDetalleExtra() : paso.detalleExtra;
    const detalleExtra = detalleExtraRaw ? _limpiarEmojisTourHtml(detalleExtraRaw) : '';

    _renderizarTituloTour(document.getElementById('tour-card-title'), titulo, _claveIconoPasoTour(paso.id));
    _renderizarCuerpoPasoTour(document.getElementById('tour-card-body'), paso, instruccion, detalleExtra);
    _renderizarBotonesNavPasoTour(document.getElementById('btn-tour-prev'), document.getElementById('btn-tour-next'));

    const btnAudio = document.getElementById('btn-tour-audio-toggle');
    if (btnAudio) _actualizarBotonAudioTour(btnAudio);

    const bienvenidaEl = document.getElementById('lira-bienvenida');
    if (paso.id === "paso_1_lanzador") {
        if (bienvenidaEl) bienvenidaEl.style.display = 'flex';
    } else if (bienvenidaEl && bienvenidaEl.style.display !== 'none') {
        bienvenidaEl.style.display = 'none';
    }

    const targetEl = _resolverTargetYAplicarSpotlightTour(paso);
    _posicionarCardTour(document.getElementById('tour-card'), paso, targetEl);
    _montarAccionCondicionalPasoTour(paso);

    const textoParaNarrar = typeof paso.getLocucion === 'function' ? paso.getLocucion() : (paso.locucion || instruccion || "");
    const autoAvanzarEfectivo = typeof paso.autoAvanzarTrasLectura === 'function'
        ? paso.autoAvanzarTrasLectura()
        : Boolean(paso.autoAvanzarTrasLectura);
    narrarPasoTutorial(textoParaNarrar, autoAvanzarEfectivo);
}

function _posicionarCardTour(card, paso, targetEl) {
    if (!card || !paso) return;
    const rect = (targetEl || document.body).getBoundingClientRect();
    const cardWidth = Math.min(420, Math.max(280, window.innerWidth - 24));
    const cardHeight = card.offsetHeight || 260;

    let top = 80;
    let left = 40;
    card.style.right = "auto";
    card.style.bottom = "auto";

    const posEfectiva = typeof paso.posicion === 'function' ? paso.posicion() : paso.posicion;

    if (posEfectiva === "top-left" || (paso.id === "paso_3_leer_y_pausar" && typeof subEtapaPaso3 !== 'undefined' && subEtapaPaso3 === 2) || paso.id === "paso_10q_nota_rapida" || (paso.id === "paso_10r_cuaderno_apuntes" && (!document.getElementById('modal-notas') || (document.getElementById('modal-notas').style.display !== 'flex' && document.getElementById('modal-notas').style.display !== 'block')))) {
        card.style.bottom = "auto";
        card.style.transform = "none";
        if (window.innerWidth >= 760) {
            card.style.right = "auto";
            card.style.left = "28px";
            card.style.top = "90px";
        } else {
            card.style.left = "12px";
            card.style.right = "12px";
            card.style.top = "auto";
            card.style.bottom = "16px";
        }
    } else if (posEfectiva === "adaptable-paso-1" || posEfectiva === "adaptable-paso-2" || paso.id === "paso_10a_abrir_ia") {
        card.style.bottom = "auto";
        card.style.transform = "none";

        const pMenu = document.getElementById('zen-panel-menu');
        const pMenuRect = (pMenu && (pMenu.classList.contains('zen-active') || pMenu.style.display === 'flex' || pMenu.style.display === 'block')) ? pMenu.getBoundingClientRect() : null;

        if (window.innerWidth >= 1050) {
            card.style.left = "auto";
            card.style.right = "28px";
            card.style.top = "90px";
        } else if (window.innerWidth >= 760 && pMenuRect && (window.innerWidth - pMenuRect.right) >= 440) {
            card.style.left = `${Math.round(pMenuRect.right + 20)}px`;
            card.style.right = "auto";
            card.style.top = "85px";
        } else if (window.innerWidth >= 720 && !pMenuRect) {
            card.style.left = "auto";
            card.style.right = "16px";
            card.style.top = "85px";
        } else {
            card.style.left = "12px";
            card.style.right = "12px";
            card.style.top = "auto";
            card.style.bottom = "16px";
        }
    } else if (posEfectiva === "bottom-center" || paso.posicion === "bottom-center") {
        card.style.top = "auto";
        card.style.bottom = "28px";
        card.style.left = "50%";
        card.style.transform = "translateX(-50%)";
    } else if (paso.posicion === "center" || targetEl === document.body) {
        card.style.bottom = "auto";
        card.style.top = "50%";
        card.style.left = "50%";
        card.style.transform = "translate(-50%, -50%)";
    } else if (paso.posicion === "below-offset") {
        card.style.bottom = "auto";
        top = Math.min(window.innerHeight - cardHeight - 16, rect.bottom + 15);
        left = Math.max(16, Math.min(window.innerWidth - cardWidth - 25, rect.left + 80));
        card.style.transform = "none";
        card.style.top = `${top}px`;
        card.style.left = `${left}px`;
    } else if (paso.posicion === "right-panel") {
        const esPasoDiccionario = paso.id && (paso.id.startsWith("paso_7") || paso.id === "paso_8b_desactivar_abreviatura");
        const esPasoTeatroModal = paso.id && (paso.id === "paso_9b_explicar_dos_puntos" || paso.id === "paso_9c_asignar_voz_teatro");
        const esPasoIAModal = paso.id && (paso.id === 'paso_10b_chat_ia' || paso.id === 'paso_10c_solicitudes_ia' || paso.id === 'paso_10d_fuentes_ia' || paso.id === 'paso_10e_modelos_ia');
        const esPasoGestorModal = paso.id === "paso_10p_explorar_gestor";
        const esPasoConfigModal = paso.id && (paso.id === "paso_11b_tab_teclado" || paso.id === "paso_11c_tab_audio" || paso.id === "paso_11d_tab_estilo" || paso.id === "paso_11e_tab_rendimiento" || paso.id === "paso_11f_tab_idioma");
        if (esPasoDiccionario || esPasoTeatroModal || esPasoIAModal || esPasoGestorModal || esPasoConfigModal) {
            if (esPasoDiccionario) {
                document.body.classList.add('tour-diccionario-abierto');
                document.body.classList.remove('tour-teatro-abierto', 'tour-ia-abierto', 'tour-gestor-abierto', 'tour-config-abierto');
            } else if (esPasoTeatroModal) {
                document.body.classList.add('tour-teatro-abierto');
                document.body.classList.remove('tour-diccionario-abierto', 'tour-ia-abierto', 'tour-gestor-abierto', 'tour-config-abierto');
            } else if (esPasoGestorModal) {
                document.body.classList.add('tour-gestor-abierto');
                document.body.classList.remove('tour-diccionario-abierto', 'tour-teatro-abierto', 'tour-ia-abierto', 'tour-config-abierto');
            } else if (esPasoConfigModal) {
                document.body.classList.add('tour-config-abierto');
                document.body.classList.remove('tour-diccionario-abierto', 'tour-teatro-abierto', 'tour-ia-abierto', 'tour-gestor-abierto');
            } else {
                document.body.classList.add('tour-ia-abierto');
                document.body.classList.remove('tour-diccionario-abierto', 'tour-teatro-abierto', 'tour-gestor-abierto', 'tour-config-abierto');
            }
            card.style.bottom = "auto";
            card.style.transform = "none";
            if (window.innerWidth >= 720) {
                card.style.right = "auto";
                card.style.left = "24px";
                if (esPasoConfigModal) {
                    const modalBox = document.querySelector('#modalConfig .modal-content');
                    const mRect = modalBox ? modalBox.getBoundingClientRect() : null;
                    top = mRect && mRect.top > 0
                        ? Math.max(80, Math.min(window.innerHeight - cardHeight - 24, Math.round(mRect.top + 20)))
                        : Math.max(120, Math.min(window.innerHeight - cardHeight - 24, Math.round(window.innerHeight * 0.25)));
                } else {
                    top = Math.max(250, Math.min(window.innerHeight - cardHeight - 24, Math.round(window.innerHeight * 0.36)));
                }
                card.style.top = `${top}px`;
            } else {
                card.style.left = "12px";
                card.style.right = "12px";
                card.style.top = "auto";
                card.style.bottom = "16px";
            }
        } else {
            document.body.classList.remove('tour-diccionario-abierto');
            document.body.classList.remove('tour-teatro-abierto');
            document.body.classList.remove('tour-ia-abierto');
            document.body.classList.remove('tour-gestor-abierto');
            document.body.classList.remove('tour-config-abierto');
            const panelContenedor = targetEl.closest('#panel-diccionario, #panel-teatro, #panel-ia') || targetEl;
            const pRect = panelContenedor.getBoundingClientRect();
            card.style.bottom = "auto";
            card.style.right = "auto";
            top = Math.max(20, Math.min(window.innerHeight - cardHeight - 20, pRect.top));
            left = Math.min(window.innerWidth - cardWidth - 20, pRect.right + 20);
            if (left + cardWidth > window.innerWidth - 10) {
                left = Math.max(10, pRect.left - cardWidth - 20);
            }
            card.style.transform = "none";
            card.style.top = `${top}px`;
            card.style.left = `${left}px`;
        }
    } else if (paso.posicion === "left-panel") {
        card.style.bottom = "auto";
        top = Math.max(30, Math.min(window.innerHeight - cardHeight - 20, rect.top));
        left = Math.max(16, rect.left - cardWidth - 25);
        card.style.transform = "none";
        card.style.top = `${top}px`;
        card.style.left = `${left}px`;
    } else if (paso.posicion === "top-right") {
        card.style.bottom = "auto";
        top = 70;
        left = Math.max(16, window.innerWidth - cardWidth - 30);
        card.style.transform = "none";
        card.style.top = `${top}px`;
        card.style.left = `${left}px`;
    } else if (paso.posicion === "above-right") {
        card.style.bottom = "auto";
        top = Math.max(16, rect.top - cardHeight - 15);
        left = Math.max(16, Math.min(rect.right + 10, window.innerWidth - cardWidth - 20));
        card.style.transform = "none";
        card.style.top = `${top}px`;
        card.style.left = `${left}px`;
    } else if (paso.posicion === "below-left") {
        card.style.bottom = "auto";
        top = Math.min(window.innerHeight - cardHeight - 16, rect.bottom + 15);
        left = Math.max(16, Math.min(rect.left, window.innerWidth - cardWidth - 20));
        card.style.transform = "none";
        card.style.top = `${top}px`;
        card.style.left = `${left}px`;
    } else {
        card.style.bottom = "auto";
        top = rect.bottom + 12;
        left = Math.max(16, Math.min(rect.left, window.innerWidth - cardWidth - 20));
        if (top + cardHeight > window.innerHeight - 20) {
            top = Math.max(16, rect.top - cardHeight - 12);
        }
        card.style.transform = "none";
        card.style.top = `${top}px`;
        card.style.left = `${left}px`;
    }
}

function posicionarMouseHintEnElemento(el, textoBadge = null, tipoClick = 'izquierdo') {
    if (!el || !window.tutorialActivo) return;
    _ultimoHintMouse = { tipo: 'elemento', el, textoBadge, tipoClick };
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;

    let hint = document.getElementById('tour-mouse-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'tour-mouse-hint';
        hint.innerHTML = `
            <div class="tour-mouse-box">
                <div class="tour-mouse-icon">
                    <div class="tour-click-ripple"></div>
                    <div class="tour-mouse-left-btn"></div>
                    <div class="tour-mouse-right-btn"></div>
                    <div class="tour-mouse-divider"></div>
                    <div class="tour-mouse-wheel"></div>
                    <div class="tour-mouse-arrow-down"></div>
                </div>
                <div class="tour-mouse-badge">
                    <span id="tour-mouse-badge-text"></span>
                </div>
            </div>
        `;
        document.body.appendChild(hint);
    }
    const mouseIcon = hint.querySelector('.tour-mouse-icon');
    if (mouseIcon) {
        mouseIcon.classList.remove('click-izquierdo', 'click-derecho');
        mouseIcon.classList.add(tipoClick === 'derecho' ? 'click-derecho' : 'click-izquierdo');
    }
    const badgeTxtEl = document.getElementById('tour-mouse-badge-text');
    if (badgeTxtEl) {
        _renderizarTourHintBadge(badgeTxtEl, textoBadge || "Haz clic aquí", 'cursor');
    }
    const screenX = r.left + r.width / 2;
    const screenY = r.bottom + 8;
    hint.style.left = `${Math.max(10, Math.round(screenX - 14))}px`;
    hint.style.top = `${Math.max(10, Math.round(screenY))}px`;
    hint.style.display = 'block';
}

function posicionarMouseHintEnCoordenadas(pdfX, pdfY, textoBadge = null, tipoClick = 'izquierdo') {
    // PRE-CHECK 1: Si el tour no está activo o el menú contextual está abierto, nunca mostrar
    if (!window.tutorialActivo) {
        removerMouseHintPaso3();
        return;
    }
    _ultimoHintMouse = { tipo: 'coordenadas', pdfX, pdfY, textoBadge, tipoClick };
    const menuCtx = document.getElementById('menu-contextual');
    if (menuCtx && menuCtx.style.display === 'block') {
        removerMouseHintPaso3();
        return;
    }

    // PRE-CHECK 2: Validar que el paso actual del tutorial admita ratón animado
    const pasoActual = PASOS_TOUR_GUI[window.tutorialPasoActual];
    if (!pasoActual) {
        removerMouseHintPaso3();
        return;
    }

    const pasosPermitidos = ['paso_3_leer_y_pausar', 'paso_4a_limites_columnas', 'paso_4b_limites_horizontales', 'paso_4c_excluir_texto', 'paso_7a_campo_sigla', 'paso_8_leer_abreviatura', 'paso_8c_comprobar_desactivado', 'paso_9b_explicar_dos_puntos', 'paso_9d_probar_teatro', 'paso_10k_probar_traductor', 'paso_10l_subrayar_azul', 'paso_10m_subrayar_rosa', 'paso_10n_capturar_recorte', 'paso_10o_abrir_gestor'];
    if (!pasosPermitidos.includes(pasoActual.id)) {
        removerMouseHintPaso3();
        return;
    }

    // En paso_4a solo se muestra cuando ya se añadió el primer corte y se debe arrastrar (subEtapa 1 o 3)
    if (pasoActual.id === 'paso_4a_limites_columnas' && (subEtapaPaso4a === 0 || subEtapaPaso4a === 2)) {
        removerMouseHintPaso3();
        return;
    }

    // Si la lectura del documento está activa en cualquier momento, nunca mostrar el ratón
    const isReading = (typeof leyendo !== 'undefined' && leyendo) ||
        (typeof isPlayingPiper !== 'undefined' && isPlayingPiper) ||
        (typeof window.palabraKaraoke !== 'undefined' && window.palabraKaraoke !== null);
    if (isReading) {
        removerMouseHintPaso3();
        return;
    }

    let hint = document.getElementById('tour-mouse-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'tour-mouse-hint';
        hint.innerHTML = `
            <div class="tour-mouse-box">
                <div class="tour-mouse-icon">
                    <div class="tour-click-ripple"></div>
                    <div class="tour-mouse-left-btn"></div>
                    <div class="tour-mouse-right-btn"></div>
                    <div class="tour-mouse-divider"></div>
                    <div class="tour-mouse-wheel"></div>
                    <div class="tour-mouse-arrow-down"></div>
                </div>
                <div class="tour-mouse-badge">
                    <span id="tour-mouse-badge-text"></span>
                </div>
            </div>
        `;
        document.body.appendChild(hint);
    }

    const mouseIcon = hint.querySelector('.tour-mouse-icon');
    if (mouseIcon) {
        mouseIcon.classList.remove('click-izquierdo', 'click-derecho');
        if (tipoClick === 'derecho') {
            mouseIcon.classList.add('click-derecho');
        } else {
            mouseIcon.classList.add('click-izquierdo');
        }
    }

    const badgeTxtEl = document.getElementById('tour-mouse-badge-text');
    if (badgeTxtEl) {
        const textoMouse = textoBadge || (tipoClick === 'derecho'
            ? getTourText("tour-paso3-badge-mouse-salto", "Clic derecho para leer")
            : getTourText("tour-paso3-badge-mouse", "Clic izquierdo para leer"));
        _renderizarTourHintBadge(badgeTxtEl, textoMouse, 'cursor');
    }

    const canvas = document.getElementById('lienzo-pdf');
    if (!canvas || !datosPagina) return;

    const canvasRect = canvas.getBoundingClientRect();
    const anchoPag = datosPagina.ancho_pagina_pdf || 800;
    const altoPag = datosPagina.alto_pagina_pdf || 1100;
    const scaleX = canvasRect.width / anchoPag;
    const scaleY = canvasRect.height / altoPag;

    const screenX = canvasRect.left + (pdfX * scaleX);
    const screenY = canvasRect.top + (pdfY * scaleY);

    // Centrar el icono del ratón (de 28px de ancho) exactamente sobre screenX
    hint.style.left = `${Math.max(10, Math.round(screenX - 14))}px`;
    hint.style.top = `${Math.max(10, Math.round(screenY - 56))}px`;
    hint.style.display = 'block';
}

function posicionarMouseHintPaso3(palabraBuscar = 'interactivo', textoBadge = null, tipoClick = 'izquierdo') {
    // PRE-CHECK CRÍTICO: Si el tour no está activo o ya no estamos en un paso permitido, NUNCA MOSTRAR
    const pasoActualId = PASOS_TOUR_GUI[window.tutorialPasoActual]?.id;
    if (!window.tutorialActivo || !pasoActualId || (pasoActualId !== 'paso_3_leer_y_pausar' && pasoActualId !== 'paso_10k_probar_traductor' && pasoActualId !== 'paso_10l_subrayar_azul' && pasoActualId !== 'paso_10m_subrayar_rosa' && pasoActualId !== 'paso_10n_capturar_recorte')) {
        removerMouseHintPaso3();
        return;
    }
    const menuCtx = document.getElementById('menu-contextual');
    if (menuCtx && menuCtx.style.display === 'block') {
        removerMouseHintPaso3();
        return;
    }

    if (!datosPagina || !datosPagina.palabras || datosPagina.palabras.length === 0) return;

    // Buscar la palabra objetivo limpiando signos de puntuación (incluyendo tokens CJK multi-carácter)
    const limpiar = (s) => String(s || '').toLowerCase().replace(/[¡!.,;。！？।]/g, '');
    const palabraLimpia = limpiar(palabraBuscar);
    let targetWord = datosPagina.palabras.find(p => limpiar(p.texto).includes(palabraLimpia));
    if (!targetWord && palabraLimpia.length > 1) {
        for (let i = 0; i < datosPagina.palabras.length; i++) {
            let acc = '';
            for (let j = i; j < Math.min(datosPagina.palabras.length, i + 4); j++) {
                acc += limpiar(datosPagina.palabras[j].texto);
                if (acc.includes(palabraLimpia)) {
                    targetWord = datosPagina.palabras[i];
                    break;
                }
            }
            if (targetWord) break;
        }
    }
    targetWord = targetWord || datosPagina.palabras[0];
    if (!targetWord || !targetWord.bbox) return;

    const wordMidX = (targetWord.bbox[0] + targetWord.bbox[2]) / 2;
    const wordTopY = targetWord.bbox[1];

    posicionarMouseHintEnCoordenadas(wordMidX, wordTopY, textoBadge, tipoClick);
}

function posicionarKeyboardHint(pdfX = 390, pdfY = 220, textoBadge = null, onClickCallback = null) {
    if (!window.tutorialActivo) {
        removerKeyboardHint();
        return;
    }
    _ultimoHintKbd = { pdfX, pdfY, textoBadge, onClickCallback };

    const keysHtml = teclasDelAtajo()
        .map(k => `<span class="tour-kbd-btn">${k}</span>`)
        .join('<span class="tour-kbd-plus">+</span>');

    let kbdHint = document.getElementById('tour-keyboard-hint');
    if (!kbdHint) {
        kbdHint = document.createElement('div');
        kbdHint.id = 'tour-keyboard-hint';
        kbdHint.innerHTML = `
            <div class="tour-keyboard-box">
                <div class="tour-keycaps-row">${keysHtml}</div>
                <div class="tour-keyboard-badge">
                    <span id="tour-keyboard-badge-text"></span>
                </div>
            </div>
        `;
        document.body.appendChild(kbdHint);
    } else {
        const row = kbdHint.querySelector('.tour-keycaps-row');
        if (row) row.innerHTML = keysHtml;
    }

    const badgeTxt = document.getElementById('tour-keyboard-badge-text');
    if (badgeTxt) {
        _renderizarTourHintBadge(badgeTxt, textoBadge || `${atajoLegibleAgregarLimite()} (o clic aquí)`, 'teclado');
    }

    if (typeof onClickCallback === 'function') {
        kbdHint.onclick = (e) => {
            e.stopPropagation();
            onClickCallback();
        };
    } else {
        kbdHint.onclick = null;
    }

    const canvas = document.getElementById('lienzo-pdf');
    if (canvas && datosPagina) {
        const canvasRect = canvas.getBoundingClientRect();
        const anchoPag = datosPagina.ancho_pagina_pdf || 800;
        const altoPag = datosPagina.alto_pagina_pdf || 1100;
        const scaleX = canvasRect.width / anchoPag;
        const scaleY = canvasRect.height / altoPag;

        const screenX = canvasRect.left + (pdfX * scaleX);
        const screenY = canvasRect.top + (pdfY * scaleY);

        kbdHint.style.left = `${Math.max(15, Math.round(screenX - 160))}px`;
        kbdHint.style.top = `${Math.max(15, Math.round(screenY - 55))}px`;
    } else {
        kbdHint.style.left = '50%';
        kbdHint.style.top = '30%';
        kbdHint.style.transform = 'translate(-50%, -50%)';
    }
    kbdHint.style.display = 'block';
}

function _renderizarTourHintBadge(el, textoRaw, claveIcono) {
    if (!el) return;
    const limpio = (typeof window.limpiarTextoEmoji === 'function')
        ? window.limpiarTextoEmoji(textoRaw).texto
        : String(textoRaw || '');
    const svg = (typeof window.obtenerIconoDialogoSVG === 'function')
        ? window.obtenerIconoDialogoSVG(claveIcono, 'lira-inline-svg')
        : '';
    if (svg) {
        const textoSeguro = (typeof window.escapeHtml === 'function')
            ? window.escapeHtml(limpio)
            : limpio.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        el.innerHTML = `${svg} <span>${textoSeguro}</span>`;
        el.style.display = 'inline-flex';
        el.style.alignItems = 'center';
        el.style.gap = '6px';
    } else {
        el.textContent = limpio;
    }
}

function removerKeyboardHint() {
    _ultimoHintKbd = null;
    document.querySelectorAll('#tour-keyboard-hint, .tour-keyboard-box').forEach(el => el.remove());
}

function removerMouseHintPaso3() {
    _ultimoHintMouse = null;
    document.querySelectorAll('#tour-mouse-hint, .tour-mouse-box').forEach(el => el.remove());
}

function _reposicionarTutorialEnResize() {
    if (!window.tutorialActivo) return;
    const paso = PASOS_TOUR_GUI[window.tutorialPasoActual];
    const card = document.getElementById('tour-card');
    if (paso && card) {
        let targets = [];
        if (typeof paso.getTargets === 'function') {
            targets = paso.getTargets().filter(Boolean);
        } else if (paso.targetSelector) {
            const el = document.querySelector(paso.targetSelector);
            if (el) targets = [el];
        }
        const targetEl = targets[0] || document.body;
        _posicionarCardTour(card, paso, targetEl);
    }
    if (_ultimoHintMouse && document.getElementById('tour-mouse-hint')) {
        const m = _ultimoHintMouse;
        if (m.tipo === 'elemento' && m.el && document.body.contains(m.el)) {
            posicionarMouseHintEnElemento(m.el, m.textoBadge, m.tipoClick);
        } else if (m.tipo === 'coordenadas') {
            posicionarMouseHintEnCoordenadas(m.pdfX, m.pdfY, m.textoBadge, m.tipoClick);
        }
    }
    if (_ultimoHintKbd && document.getElementById('tour-keyboard-hint')) {
        const k = _ultimoHintKbd;
        posicionarKeyboardHint(k.pdfX, k.pdfY, k.textoBadge, k.onClickCallback);
    }
}

window.addEventListener('resize', () => {
    if (!window.tutorialActivo) return;
    if (_timerResizeTour) clearTimeout(_timerResizeTour);
    _timerResizeTour = setTimeout(_reposicionarTutorialEnResize, 75);
});

function quitarResaltadoTour() {
    document.querySelectorAll('.tour-spotlight-active').forEach(el => {
        el.classList.remove('tour-spotlight-active');
    });
    document.body.classList.remove('tour-activo-lanzador');
    document.body.classList.remove('tour-activo-zen-voz');
    document.body.classList.remove('tour-activo-zen-menu');
    document.body.classList.remove('tour-paso-lectura');
    document.body.classList.remove('tour-diccionario-abierto');
    document.body.classList.remove('tour-teatro-abierto');
    document.body.classList.remove('tour-ia-abierto');
    removerMouseHintPaso3();
    removerKeyboardHint();
    const cardModal = document.getElementById('modal-lanzador-card-pdf');
    if (cardModal) cardModal.classList.remove('tour-spotlight-active');
}

window.finalizarTutorial = window.cerrarTutorial;
window.setTimeoutTutorial = setTimeoutTutorial;
window.limpiarTimeoutsTutorial = limpiarTimeoutsTutorial;
window.sincronizarSpotlightPaso1 = sincronizarSpotlightPaso1;
window.asegurarModalConfigAbiertoEnTab = asegurarModalConfigAbiertoEnTab;
window.limpiarListenersCondicionales = limpiarListenersCondicionales;
window.renderizarPasoTour = renderizarPasoTour;
window.posicionarMouseHintEnElemento = posicionarMouseHintEnElemento;
window.posicionarMouseHintEnCoordenadas = posicionarMouseHintEnCoordenadas;
window.posicionarMouseHintPaso3 = posicionarMouseHintPaso3;
window.posicionarKeyboardHint = posicionarKeyboardHint;
window.removerKeyboardHint = removerKeyboardHint;
window.removerMouseHintPaso3 = removerMouseHintPaso3;
window.quitarResaltadoTour = quitarResaltadoTour;
