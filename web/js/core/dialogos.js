/* ==========================================================================
   LIRA DIALOG & TOAST — Sistema unificado de iconos SVG, diálogos y toasts
   ========================================================================== */

(function () {
    'use strict';

    function crearSVG(cuerpo, extraClass) {
        const clsLimpia = String(extraClass || '')
            .replace(/[^a-zA-Z0-9_\-\s]/g, '')
            .trim();
        const clsAttr = clsLimpia ? `lira-svg-icon ${clsLimpia}` : 'lira-svg-icon';
        return `<svg class="${clsAttr}" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cuerpo}</svg>`;
    }

    const CUERPOS_SVG = {
        info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
        advertencia: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
        error: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
        exito: '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 15.5 9.5"/>',
        pregunta: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
        borrar: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
        guardar: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
        audio: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
        mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
        archivo: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
        teclado: '<rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><line x1="6" y1="8" x2="6.01" y2="8"/><line x1="10" y1="8" x2="10.01" y2="8"/><line x1="14" y1="8" x2="14.01" y2="8"/><line x1="18" y1="8" x2="18.01" y2="8"/><line x1="6" y1="12" x2="6.01" y2="12"/><line x1="10" y1="12" x2="10.01" y2="12"/><line x1="14" y1="12" x2="14.01" y2="12"/><line x1="18" y1="12" x2="18.01" y2="12"/><line x1="7" y1="16" x2="17" y2="16"/>',
        diccionario: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
        etiqueta: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
        teatro: '<path d="M2 5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v4.5a4.5 4.5 0 0 1-9 0V5z"/><path d="M4.5 10a2 2 0 0 0 4 0"/><line x1="5" y1="6.5" x2="5.01" y2="6.5"/><line x1="8" y1="6.5" x2="8.01" y2="6.5"/><path d="M13 8.5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2V13a4.5 4.5 0 0 1-9 0V8.5z"/><path d="M15.5 14.5a2 2 0 0 1 4 0"/><line x1="16" y1="10" x2="16.01" y2="10"/><line x1="19" y1="10" x2="19.01" y2="10"/>',
        ia: '<path d="M12 3l1.91 5.09L19 10l-5.09 1.91L12 17l-1.91-5.09L5 10l5.09-1.91L12 3z"/><path d="M19 16l.85 2.15L22 19l-2.15.85L19 22l-.85-2.15L16 19l2.15-.85L19 16z"/>',
        traduccion: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
        estilo: '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
        buscar: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
        portapapeles: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
        reiniciar: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
        objetivo: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
        detener: '<circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6"/>',
        reloj: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
        editar: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
        graduacion: '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
        descarga: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
        reproducir: '<polygon points="6 4 20 12 6 20 6 4"/>',
        pausar: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
        rayo: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
        imagen: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
        prohibido: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
        idea: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>',
        cursor: '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/>',
        configuracion: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
    };

    const ALIAS_CLAVES = {
        info: 'info',
        informacion: 'info',
        advertencia: 'advertencia',
        warning: 'advertencia',
        error: 'error',
        danger: 'error',
        peligro: 'error',
        exito: 'exito',
        success: 'exito',
        ok: 'exito',
        pregunta: 'pregunta',
        question: 'pregunta',
        borrar: 'borrar',
        delete: 'borrar',
        eliminar: 'borrar',
        trash: 'borrar',
        guardar: 'guardar',
        save: 'guardar',
        audio: 'audio',
        voz: 'audio',
        voice: 'audio',
        speaker: 'audio',
        volumen: 'audio',
        mic: 'mic',
        microfono: 'mic',
        microphone: 'mic',
        archivo: 'archivo',
        pdf: 'archivo',
        file: 'archivo',
        nota: 'archivo',
        note: 'archivo',
        carpeta: 'archivo',
        folder: 'archivo',
        libro: 'archivo',
        book: 'archivo',
        teclado: 'teclado',
        keyboard: 'teclado',
        diccionario: 'diccionario',
        dictionary: 'diccionario',
        etiqueta: 'etiqueta',
        tag: 'etiqueta',
        teatro: 'teatro',
        theater: 'teatro',
        ia: 'ia',
        ai: 'ia',
        sparkles: 'ia',
        traduccion: 'traduccion',
        translate: 'traduccion',
        globe: 'traduccion',
        idioma: 'traduccion',
        estilo: 'estilo',
        style: 'estilo',
        palette: 'estilo',
        buscar: 'buscar',
        search: 'buscar',
        portapapeles: 'portapapeles',
        clipboard: 'portapapeles',
        reiniciar: 'reiniciar',
        reset: 'reiniciar',
        refresh: 'reiniciar',
        objetivo: 'objetivo',
        target: 'objetivo',
        detener: 'detener',
        stop: 'detener',
        reloj: 'reloj',
        clock: 'reloj',
        tiempo: 'reloj',
        editar: 'editar',
        edit: 'editar',
        graduacion: 'graduacion',
        graduation: 'graduacion',
        tutorial: 'graduacion',
        descarga: 'descarga',
        download: 'descarga',
        reproducir: 'reproducir',
        play: 'reproducir',
        pausar: 'pausar',
        pause: 'pausar',
        rayo: 'rayo',
        bolt: 'rayo',
        rapido: 'rayo',
        imagen: 'imagen',
        image: 'imagen',
        prohibido: 'prohibido',
        ban: 'prohibido',
        idea: 'idea',
        lightbulb: 'idea',
        consejo: 'idea',
        cursor: 'cursor',
        mouse: 'cursor',
        clic: 'cursor',
        configuracion: 'configuracion',
        settings: 'configuracion'
    };

    const MAPA_EMOJI_UNICODE = {
        '\u2139': 'info',
        '\u{1F44B}': 'info',
        '\u26A0': 'advertencia',
        '\u274C': 'error',
        '\u{1F525}': 'error',
        '\u2705': 'exito',
        '\u2753': 'pregunta',
        '\u{1F5D1}': 'borrar',
        '\u{1F4BE}': 'guardar',
        '\u{1F50A}': 'audio',
        '\u{1F5E3}': 'audio',
        '\u{1F3A4}': 'mic',
        '\u{1F399}': 'mic',
        '\u{1F4C4}': 'archivo',
        '\u{1F4DD}': 'archivo',
        '\u{1F4C2}': 'archivo',
        '\u{1F4C1}': 'archivo',
        '\u{1F4D6}': 'archivo',
        '\u{1F4DC}': 'archivo',
        '\u2328': 'teclado',
        '\u{1F4DA}': 'diccionario',
        '\u{1F524}': 'diccionario',
        '\u{1F3F7}': 'etiqueta',
        '\u{1F3AD}': 'teatro',
        '\u{1F916}': 'ia',
        '\u2728': 'ia',
        '\u{1F9E0}': 'ia',
        '\u{1F9E9}': 'ia',
        '\u{1F310}': 'traduccion',
        '\u{1F30D}': 'traduccion',
        '\u{1F3A8}': 'estilo',
        '\u{1F50D}': 'buscar',
        '\u{1F50E}': 'buscar',
        '\u{1F52C}': 'buscar',
        '\u{1F4CB}': 'portapapeles',
        '\u{1F504}': 'reiniciar',
        '\u2195': 'reiniciar',
        '\u{1F3AF}': 'objetivo',
        '\u{1F4CC}': 'objetivo',
        '\u23F9': 'detener',
        '\u23F1': 'reloj',
        '\u23F3': 'reloj',
        '\u270D': 'editar',
        '\u270F': 'editar',
        '\u{1F393}': 'graduacion',
        '\u2B07': 'descarga',
        '\u25B6': 'reproducir',
        '\u23E9': 'reproducir',
        '\u23F8': 'pausar',
        '\u26A1': 'rayo',
        '\u{1F407}': 'rayo',
        '\u{1F5BC}': 'imagen',
        '\u{1F6AB}': 'prohibido',
        '\u{1F4A1}': 'idea',
        '\u{1F5B1}': 'cursor',
        '\u2699': 'configuracion'
    };

    const REGEX_EMOJI_INICIAL = /^\s*([\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2300-\u23FF\u2B00-\u2BFF\u2139\u2195]\uFE0F?(?:\u200D[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2300-\u23FF\u2B00-\u2BFF]\uFE0F?)*)\s*/u;

    const CLAVES_DESTRUCTIVAS = new Set(['borrar', 'error', 'prohibido']);

    const ICONOS_DIALOGO_SVG = {};
    Object.keys(CUERPOS_SVG).forEach((clave) => {
        ICONOS_DIALOGO_SVG[clave] = crearSVG(CUERPOS_SVG[clave]);
    });
    Object.keys(ALIAS_CLAVES).forEach((alias) => {
        const canonica = ALIAS_CLAVES[alias];
        if (ICONOS_DIALOGO_SVG[canonica] && !ICONOS_DIALOGO_SVG[alias]) {
            ICONOS_DIALOGO_SVG[alias] = ICONOS_DIALOGO_SVG[canonica];
        }
    });

    function normalizarEmoji(texto) {
        return String(texto || '').replace(/\uFE0F/g, '').trim();
    }

    function resolverClaveIcono(iconoOClave, fallback = 'info') {
        if (typeof iconoOClave !== 'string' || !iconoOClave.trim()) {
            return fallback;
        }
        const raw = iconoOClave.trim();
        const lower = raw.toLowerCase();
        if (ALIAS_CLAVES[lower]) {
            return ALIAS_CLAVES[lower];
        }
        const sinVS = normalizarEmoji(raw);
        if (MAPA_EMOJI_UNICODE[sinVS]) {
            return MAPA_EMOJI_UNICODE[sinVS];
        }
        return fallback;
    }

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Detecta un emoji Unicode inicial en mensajes (p. ej. respuestas del backend),
     * extrae su clave SVG equivalente y devuelve el texto limpio sin el emoji inicial.
     * @param {string} texto
     * @returns {{ texto: string, clave: string|null }}
     */
    function limpiarTextoEmoji(texto) {
        const raw = String(texto ?? '');
        const match = raw.match(REGEX_EMOJI_INICIAL);
        if (!match) {
            return { texto: raw, clave: null };
        }
        const clave = resolverClaveIcono(match[1], null);
        const textoLimpio = raw.slice(match[0].length);
        return { texto: textoLimpio, clave };
    }

    /**
     * Devuelve el SVG inline correspondiente a una clave semántica o emoji legado.
     * @param {string} [iconoOClave='info']
     * @param {string} [extraClass='']
     * @returns {string}
     */
    function obtenerIconoDialogoSVG(iconoOClave = 'info', extraClass = '') {
        const clave = resolverClaveIcono(iconoOClave, 'info');
        const cuerpo = CUERPOS_SVG[clave] || CUERPOS_SVG.info;
        return crearSVG(cuerpo, extraClass);
    }

    function obtenerOverlayDialogo() {
        let overlay = document.getElementById('lira-dialog-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'lira-dialog-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'lira-dialog-msg');
            document.body.appendChild(overlay);
        }
        if (typeof overlay._liraCleanup === 'function') {
            overlay._liraCleanup();
        }
        return overlay;
    }

    function traducir(clave, fallback) {
        return (typeof window.t === 'function') ? window.t(clave, fallback) : fallback;
    }

    function crearIconoElemento(clave, claseBase) {
        const cont = document.createElement('div');
        cont.className = `${claseBase} lira-icon-${clave}`;
        cont.innerHTML = obtenerIconoDialogoSVG(clave);
        return cont;
    }

    function restaurarFoco(elementoPrevio) {
        if (
            elementoPrevio &&
            typeof elementoPrevio.focus === 'function' &&
            document.contains(elementoPrevio)
        ) {
            try {
                elementoPrevio.focus({ preventScroll: true });
            } catch (_) {
                // Ignorar si el elemento ya no es enfocable
            }
        }
    }

    /**
     * Muestra un diálogo modal de alerta personalizado.
     * Acepta `(msg, icono)` y soporta legado de 3 argumentos `(titulo, msg, icono)`.
     * @param {string} msg - Mensaje a mostrar.
     * @param {string} [icono='info'] - Clave SVG o emoji legado.
     * @param {string} [iconoTercerArg] - Soporte opcional para llamadas de 3 argumentos.
     * @returns {Promise<void>}
     */
    window.liraAlert = function (msg, icono, iconoTercerArg) {
        return new Promise((resolve) => {
            const overlay = obtenerOverlayDialogo();
            const previousActiveElement = document.activeElement;

            let mensajeCrudo = msg;
            let iconoSolicitado = icono;
            if (typeof iconoTercerArg !== 'undefined') {
                const titulo = String(msg ?? '').trim();
                const cuerpo = String(icono ?? '').trim();
                mensajeCrudo = (titulo && cuerpo) ? `${titulo}\n\n${cuerpo}` : (titulo || cuerpo);
                iconoSolicitado = iconoTercerArg;
            }

            const { texto, clave: claveDetectada } = limpiarTextoEmoji(mensajeCrudo);
            const clave = resolverClaveIcono(iconoSolicitado || claveDetectada || 'info', 'info');
            const txtAceptar = traducir('btn-aceptar', 'Aceptar');

            const box = document.createElement('div');
            box.className = 'lira-dialog-box';

            const iconEl = crearIconoElemento(clave, 'lira-dialog-icon');

            const msgEl = document.createElement('div');
            msgEl.className = 'lira-dialog-msg';
            msgEl.id = 'lira-dialog-msg';
            msgEl.textContent = texto;

            const btnsEl = document.createElement('div');
            btnsEl.className = 'lira-dialog-btns';

            const btnOk = document.createElement('button');
            btnOk.type = 'button';
            btnOk.className = CLAVES_DESTRUCTIVAS.has(clave)
                ? 'lira-dialog-btn lira-dialog-btn-ok lira-dialog-btn-danger'
                : 'lira-dialog-btn lira-dialog-btn-ok';
            btnOk.id = 'lira-dlg-ok';
            btnOk.textContent = txtAceptar;

            btnsEl.appendChild(btnOk);
            box.appendChild(iconEl);
            box.appendChild(msgEl);
            box.appendChild(btnsEl);

            overlay.replaceChildren(box);
            overlay.classList.add('activo');

            let cerrado = false;
            const limpiar = () => {
                if (cerrado) return;
                cerrado = true;
                document.removeEventListener('keydown', onKey, { capture: true });
                overlay.removeEventListener('click', onBackdropClick);
                overlay.classList.remove('activo');
                overlay.replaceChildren();
                if (overlay._liraCleanup === cancelarPorReemplazo) {
                    overlay._liraCleanup = null;
                }
            };

            const close = () => {
                if (cerrado) return;
                limpiar();
                restaurarFoco(previousActiveElement);
                resolve();
            };

            const cancelarPorReemplazo = () => {
                limpiar();
                resolve();
            };

            const onKey = (e) => {
                if (e.key === 'Escape' || e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    close();
                }
            };

            const onBackdropClick = (e) => {
                if (e.target === overlay) {
                    close();
                }
            };

            overlay._liraCleanup = cancelarPorReemplazo;
            btnOk.addEventListener('click', close, { once: true });
            overlay.addEventListener('click', onBackdropClick);
            document.addEventListener('keydown', onKey, { capture: true });
            setTimeout(() => {
                if (!cerrado && document.contains(btnOk)) btnOk.focus();
            }, 30);
        });
    };

    /**
     * Muestra un diálogo modal de confirmación personalizado.
     * @param {string} msg - Mensaje a mostrar.
     * @param {string} [icono='pregunta'] - Clave SVG o emoji legado.
     * @returns {Promise<boolean>} true si confirmó, false si canceló.
     */
    window.liraConfirm = function (msg, icono) {
        return new Promise((resolve) => {
            const overlay = obtenerOverlayDialogo();
            const previousActiveElement = document.activeElement;

            const { texto, clave: claveDetectada } = limpiarTextoEmoji(msg);
            const clave = resolverClaveIcono(icono || claveDetectada || 'pregunta', 'pregunta');
            const txtCancelar = traducir('btn-cancelar', 'Cancelar');
            const txtContinuar = traducir('btn-si-continuar', 'Sí, continuar');

            const box = document.createElement('div');
            box.className = 'lira-dialog-box';

            const iconEl = crearIconoElemento(clave, 'lira-dialog-icon');

            const msgEl = document.createElement('div');
            msgEl.className = 'lira-dialog-msg';
            msgEl.id = 'lira-dialog-msg';
            msgEl.textContent = texto;

            const btnsEl = document.createElement('div');
            btnsEl.className = 'lira-dialog-btns';

            const btnCancel = document.createElement('button');
            btnCancel.type = 'button';
            btnCancel.className = 'lira-dialog-btn lira-dialog-btn-cancel';
            btnCancel.id = 'lira-dlg-cancel';
            btnCancel.textContent = txtCancelar;

            const btnOk = document.createElement('button');
            btnOk.type = 'button';
            btnOk.className = CLAVES_DESTRUCTIVAS.has(clave)
                ? 'lira-dialog-btn lira-dialog-btn-ok lira-dialog-btn-danger'
                : 'lira-dialog-btn lira-dialog-btn-ok';
            btnOk.id = 'lira-dlg-ok';
            btnOk.textContent = txtContinuar;

            btnsEl.appendChild(btnCancel);
            btnsEl.appendChild(btnOk);
            box.appendChild(iconEl);
            box.appendChild(msgEl);
            box.appendChild(btnsEl);

            overlay.replaceChildren(box);
            overlay.classList.add('activo');

            let cerrado = false;
            const limpiar = () => {
                if (cerrado) return;
                cerrado = true;
                document.removeEventListener('keydown', onKey, { capture: true });
                overlay.removeEventListener('click', onBackdropClick);
                overlay.classList.remove('activo');
                overlay.replaceChildren();
                if (overlay._liraCleanup === cancelarPorReemplazo) {
                    overlay._liraCleanup = null;
                }
            };

            const close = (result) => {
                if (cerrado) return;
                limpiar();
                restaurarFoco(previousActiveElement);
                resolve(Boolean(result));
            };

            const cancelarPorReemplazo = () => {
                limpiar();
                resolve(false);
            };

            const onKey = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    close(false);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    close(document.activeElement !== btnCancel);
                }
            };

            const onBackdropClick = (e) => {
                if (e.target === overlay) {
                    close(false);
                }
            };

            overlay._liraCleanup = cancelarPorReemplazo;
            btnOk.addEventListener('click', () => close(true), { once: true });
            btnCancel.addEventListener('click', () => close(false), { once: true });
            overlay.addEventListener('click', onBackdropClick);
            document.addEventListener('keydown', onKey, { capture: true });
            setTimeout(() => {
                if (!cerrado && document.contains(btnOk)) btnOk.focus();
            }, 30);
        });
    };

    /**
     * Muestra un diálogo modal de entrada de texto personalizado.
     * @param {string} msg - Mensaje a mostrar.
     * @param {string} [valorPorDefecto=''] - Valor inicial en el campo de texto.
     * @param {string} [icono='editar'] - Clave SVG o emoji legado.
     * @returns {Promise<string|null>} Texto ingresado o null si canceló.
     */
    window.liraPrompt = function (msg, valorPorDefecto = '', icono) {
        return new Promise((resolve) => {
            const overlay = obtenerOverlayDialogo();
            const previousActiveElement = document.activeElement;

            const { texto, clave: claveDetectada } = limpiarTextoEmoji(msg);
            const clave = resolverClaveIcono(icono || claveDetectada || 'editar', 'editar');
            const txtCancelar = traducir('btn-cancelar', 'Cancelar');
            const txtAceptar = traducir('btn-aceptar', 'Aceptar');

            const box = document.createElement('div');
            box.className = 'lira-dialog-box';

            const iconEl = crearIconoElemento(clave, 'lira-dialog-icon');

            const msgEl = document.createElement('div');
            msgEl.className = 'lira-dialog-msg';
            msgEl.id = 'lira-dialog-msg';
            msgEl.textContent = texto;

            const inputWrap = document.createElement('div');
            inputWrap.className = 'lira-dialog-input-wrap';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'lira-dialog-input';
            input.id = 'lira-dlg-input';
            input.value = String(valorPorDefecto ?? '');

            inputWrap.appendChild(input);

            const btnsEl = document.createElement('div');
            btnsEl.className = 'lira-dialog-btns';

            const btnCancel = document.createElement('button');
            btnCancel.type = 'button';
            btnCancel.className = 'lira-dialog-btn lira-dialog-btn-cancel';
            btnCancel.id = 'lira-dlg-cancel';
            btnCancel.textContent = txtCancelar;

            const btnOk = document.createElement('button');
            btnOk.type = 'button';
            btnOk.className = 'lira-dialog-btn lira-dialog-btn-ok';
            btnOk.id = 'lira-dlg-ok';
            btnOk.textContent = txtAceptar;

            btnsEl.appendChild(btnCancel);
            btnsEl.appendChild(btnOk);
            box.appendChild(iconEl);
            box.appendChild(msgEl);
            box.appendChild(inputWrap);
            box.appendChild(btnsEl);

            overlay.replaceChildren(box);
            overlay.classList.add('activo');

            let cerrado = false;
            const limpiar = () => {
                if (cerrado) return;
                cerrado = true;
                document.removeEventListener('keydown', onKey, { capture: true });
                overlay.removeEventListener('click', onBackdropClick);
                overlay.classList.remove('activo');
                overlay.replaceChildren();
                if (overlay._liraCleanup === cancelarPorReemplazo) {
                    overlay._liraCleanup = null;
                }
            };

            const close = (result) => {
                if (cerrado) return;
                limpiar();
                restaurarFoco(previousActiveElement);
                resolve(result);
            };

            const cancelarPorReemplazo = () => {
                limpiar();
                resolve(null);
            };

            const onKey = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (document.activeElement === btnCancel) {
                        close(null);
                    } else {
                        close(input.value);
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    close(null);
                }
            };

            const onBackdropClick = (e) => {
                if (e.target === overlay) {
                    close(null);
                }
            };

            overlay._liraCleanup = cancelarPorReemplazo;
            btnOk.addEventListener('click', () => close(input.value), { once: true });
            btnCancel.addEventListener('click', () => close(null), { once: true });
            overlay.addEventListener('click', onBackdropClick);
            document.addEventListener('keydown', onKey, { capture: true });
            setTimeout(() => {
                if (!cerrado && document.contains(input)) {
                    input.focus();
                    input.select();
                }
            }, 40);
        });
    };

    /**
     * Muestra una notificación toast unificada con icono SVG inline.
     * @param {string} mensaje - Texto del toast (si trae emoji inicial y se omite icono, se auto-mapea y limpia).
     * @param {string} [icono='info'] - Clave SVG o emoji legado.
     * @param {number} [duracionMs=2800] - Duración visible en milisegundos.
     */
    function mostrarToast(mensaje, icono, duracionMs = 2800) {
        let toast = document.getElementById('ia-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'ia-toast';
            document.body.appendChild(toast);
        }
        toast.classList.add('lira-toast');
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');

        const { texto, clave: claveDetectada } = limpiarTextoEmoji(mensaje);
        const clave = resolverClaveIcono(icono || claveDetectada || 'info', 'info');
        const duracion = (typeof duracionMs === 'number' && duracionMs > 0) ? duracionMs : 2800;

        const iconSpan = document.createElement('span');
        iconSpan.className = `lira-toast-icon lira-icon-${clave}`;
        iconSpan.innerHTML = obtenerIconoDialogoSVG(clave);

        const msgSpan = document.createElement('span');
        msgSpan.className = 'lira-toast-msg';
        msgSpan.textContent = texto;

        toast.replaceChildren(iconSpan, msgSpan);
        toast.dataset.tipo = clave;
        toast.classList.add('visible');

        if (window._iaToastTimer) clearTimeout(window._iaToastTimer);
        window._iaToastTimer = setTimeout(() => {
            toast.classList.remove('visible');
        }, duracion);
    }

    window.ICONOS_DIALOGO_SVG = ICONOS_DIALOGO_SVG;
    window.obtenerIconoDialogoSVG = obtenerIconoDialogoSVG;
    window.limpiarTextoEmoji = limpiarTextoEmoji;
    window.escapeHtml = window.escapeHtml || escapeHtml;
    window.mostrarToast = mostrarToast;
    if (typeof window.mostrarToastLira !== 'function') {
        window.mostrarToastLira = mostrarToast;
    }
})();
