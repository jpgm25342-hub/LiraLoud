function _leerFlagsMascaraParentesis() {
    return {
        saltarUrls: document.getElementById('chk-urls')?.checked,
        saltarParen: document.getElementById('chk-paren')?.checked,
        saltarCorch: document.getElementById('chk-corch')?.checked,
        saltarLlaves: document.getElementById('chk-llaves')?.checked,
        saltarBarras: document.getElementById('chk-barras')?.checked,
        saltarSup: document.getElementById('chk-superindices')?.checked ?? document.getElementById('chk-referencias')?.checked ?? true,
        saltarSub: document.getElementById('chk-subindices')?.checked ?? false
    };
}

function _abrirBloquesEnTexto(niveles, txtRaw, flags) {
    if (flags.saltarParen) niveles.paren += (txtRaw.match(/\(/g) || []).length;
    if (flags.saltarCorch) niveles.corch += (txtRaw.match(/\[/g) || []).length;
    if (flags.saltarLlaves) niveles.llaves += (txtRaw.match(/\{/g) || []).length;
}

function _cerrarBloquesEnTexto(niveles, txtRaw, flags) {
    if (flags.saltarParen) niveles.paren = Math.max(0, niveles.paren - (txtRaw.match(/\)/g) || []).length);
    if (flags.saltarCorch) niveles.corch = Math.max(0, niveles.corch - (txtRaw.match(/\]/g) || []).length);
    if (flags.saltarLlaves) niveles.llaves = Math.max(0, niveles.llaves - (txtRaw.match(/\}/g) || []).length);
}

function _limpiarPalabraMascaraAudio(txtRaw, flags) {
    let pAudio = txtRaw;
    if (flags.saltarSup) {
        pAudio = pAudio.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, '').replace(/\[\d{1,3}\]/g, '');
    }
    if (flags.saltarSub) {
        pAudio = pAudio.replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, '');
    }
    if (flags.saltarBarras) {
        pAudio = pAudio.split('/').join(' ').split('\\').join(' ');
    }
    return pAudio;
}

function aplicarMascaraParentesis(listaOriginalPalabras) {
    if (!listaOriginalPalabras) return { listaVisual: [], textoClean: "" };

    const flags = _leerFlagsMascaraParentesis();
    const niveles = { paren: 0, corch: 0, llaves: 0 };
    const listaFiltrada = [];
    let textoParaAudio = "";

    for (let i = 0; i < listaOriginalPalabras.length; i++) {
        const p = listaOriginalPalabras[i];
        const txtRaw = p.texto.trim();
        if (!txtRaw) continue;

        _abrirBloquesEnTexto(niveles, txtRaw, flags);
        const ignorarBloque = (niveles.paren > 0) || (niveles.corch > 0) || (niveles.llaves > 0);
        const esLink = flags.saltarUrls && /https?:\/\/\S+|www\.\S+|\b\w+\.(?:com|org|net|edu|gov|mx)\b/i.test(txtRaw);

        if (!ignorarBloque && !esLink) {
            const pAudio = _limpiarPalabraMascaraAudio(txtRaw, flags);
            const tieneContenido = /[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(pAudio);
            if (tieneContenido || pAudio.includes("punto")) {
                listaFiltrada.push(p);
                textoParaAudio += pAudio + " ";
            } else {
                p.yaLeida = true;
            }
        } else {
            p.yaLeida = true;
        }

        _cerrarBloquesEnTexto(niveles, txtRaw, flags);
    }
    return { listaVisual: listaFiltrada, textoClean: textoParaAudio.trim() };
}

function obtenerEstadosFiltros() {
    return {
        'chk-urls': document.getElementById('chk-urls')?.checked ?? false,
        'chk-paren': document.getElementById('chk-paren')?.checked ?? false,
        'chk-corch': document.getElementById('chk-corch')?.checked ?? false,
        'chk-llaves': document.getElementById('chk-llaves')?.checked ?? false,
        'chk-superindices': document.getElementById('chk-superindices')?.checked ?? true,
        'chk-subindices': document.getElementById('chk-subindices')?.checked ?? false
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

    if (tabId === 'tab-karaoke') {
        if (typeof cargarYRenderizarMezclasKokoroUI === 'function') cargarYRenderizarMezclasKokoroUI();
        if (typeof cargarYRenderizarClonesPocketUI === 'function') cargarYRenderizarClonesPocketUI();
    }
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
const _MODALES_CIERRE_ESC = [
    { id: 'modal-creditos', fn: 'cerrarModalCreditos', modo: 'visible' },
    { id: 'modal-ver-captura', fn: 'cerrarModalVerCaptura', modo: 'visible' },
    { id: 'modal-guardar-captura', fn: 'cerrarModalGuardarCaptura', modo: 'visible' },
    { id: 'modal-ocr-rango', fn: 'cerrarModalRangoOCR', modo: 'visible' },
    { id: 'modal-ocr-decision', fn: 'cerrarModalOCRDecision', modo: 'visible' },
    { id: 'modal-ocr-progreso', fn: 'cancelarBatchOCRYLeer', modo: 'visible' },
    { id: 'modal-tienda-ollama', fn: 'cerrarTiendaOllama', modo: 'visible', fallbackOcultar: true },
    { id: 'modal-tienda-voces', fn: 'cerrarTiendaVoces', modo: 'visible', fallbackOcultar: true },
    { id: 'modal-subrayados', fn: 'cerrarPanelSubrayados', modo: 'visible' },
    { id: 'panel-busqueda', fn: 'cerrarBuscadorPDF', modo: 'visible' },
    { id: 'modal-teatro', fn: 'cerrarTeatro', modo: 'flex', log: '[UI] Modo Teatro cerrado vía ESC' },
    { id: 'modal-diccionario', fn: 'cerrarDiccionario', modo: 'flex', log: '[UI] Diccionario cerrado vía ESC' },
    { id: 'modalConfig', fn: 'cerrarConfiguracion', modo: 'flex', log: '[UI] Configuración cerrada vía ESC' },
    { id: 'modal-descarga', fn: 'cerrarModalDescarga', modo: 'flex', log: '[UI] Descarga cerrada vía ESC' },
    { id: 'modal-ia', fn: 'cerrarModalIA', modo: 'flex', log: '[UI] LiraAI cerrado vía ESC' },
    { id: 'panel-nota-rapida', fn: 'cerrarPanelNotaRapida', modo: 'flex' },
    { id: 'modal-notas', fn: 'cerrarModalNotas', modo: 'flex' }
];

function _modalAbiertoParaEsc(el, modo) {
    if (!el) return false;
    if (modo === 'flex') return el.style.display === 'flex';
    return el.style.display !== 'none' && getComputedStyle(el).display !== 'none';
}

function cerrarModalesAbiertos() {
    const dlgOverlay = document.getElementById('lira-dialog-overlay');
    if (dlgOverlay && dlgOverlay.classList.contains('activo')) return true;

    for (const regla of _MODALES_CIERRE_ESC) {
        const el = document.getElementById(regla.id);
        if (!_modalAbiertoParaEsc(el, regla.modo)) continue;

        const fnCerrar = window[regla.fn];
        if (typeof fnCerrar === 'function') fnCerrar();
        else if (regla.fallbackOcultar) el.style.display = 'none';
        if (regla.log) console.log(regla.log);
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
        if (!window.tutorialActivo && typeof datosPagina !== 'undefined' && datosPagina) {
            let dictActual = obtenerDiccionarioConsolidado();

            // Python lee los filtros autónomamente desde ajustes_lectura.json
            let nuevasOraciones = await eel.reaplicar_filtros_desde_snapshot(dictActual, null, resegmentar)();

            if (nuevasOraciones) {
                datosPagina.oraciones = nuevasOraciones;
                window.vozActivaSnapshot = vozPredeterminada;

                console.log("[Filtros] Snapshot actualizado. Lectura detenida para aplicar nuevos filtros.");
            }
        }

        // 6. RESET VISUAL (Estado de Reposo)
        window.palabraKaraoke = null;
        dibujar();

    } catch (e) {
        console.error("[Filtros] Error en el Hot Swap del Snapshot:", e);
    }
}

function _sincronizarIconosYTextosModales() {
    if (typeof window.obtenerIconoDialogoSVG === 'function') {
        const mapaCtx = [
            ['opcion-leer', 'audio'],
            ['opcion-copiar', 'portapapeles'],
            ['opcion-buscar', 'buscar']
        ];
        mapaCtx.forEach(([id, clave]) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (!el.querySelector('svg')) {
                const txtCrudo = el.textContent || '';
                const txt = (typeof window.limpiarTextoEmoji === 'function')
                    ? window.limpiarTextoEmoji(txtCrudo).texto
                    : txtCrudo.trim();
                const esc = (typeof window.escapeHtml === 'function')
                    ? window.escapeHtml
                    : (s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
                el.innerHTML = `${window.obtenerIconoDialogoSVG(clave)}<span>${esc(txt)}</span>`;
            }
        });
    }

    if (typeof window.limpiarTextoEmoji === 'function') {
        const selectores = [
            '#panel-busqueda [data-i18n="buscador-titulo"]',
            '#modal-ver-captura [data-i18n="cap-btn-copiar-img"]',
            '#modal-subrayados [data-i18n="ext-tab-subrayados"]',
            '#modal-ocr-progreso [data-i18n="ocr-prog-tiempo-calc"]',
            '#modal-ocr-progreso [data-i18n="ocr-prog-cancelar"]',
            '#menu-contextual-tab [data-i18n="ctx-renombrar-seccion"]',
            '#ocr-hud-texto',
            '#btn-tour-audio-toggle',
            '#tour-card-title'
        ];
        selectores.forEach((sel) => {
            const el = document.querySelector(sel);
            if (!el) return;
            for (const node of Array.from(el.childNodes)) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                    const res = window.limpiarTextoEmoji(node.textContent);
                    if (res.clave) node.textContent = res.texto;
                }
            }
            const innerSpan = el.querySelector('span[data-i18n]');
            if (innerSpan && innerSpan.textContent) {
                const res = window.limpiarTextoEmoji(innerSpan.textContent);
                if (res.clave) innerSpan.textContent = res.texto;
            }
        });
    }
}

window.addEventListener('lira:idioma-cambiado', _sincronizarIconosYTextosModales);
window.addEventListener('load', _sincronizarIconosYTextosModales);
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(_sincronizarIconosYTextosModales, 0);
});
