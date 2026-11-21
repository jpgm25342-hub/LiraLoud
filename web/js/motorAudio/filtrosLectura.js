function aplicarMascaraParentesis(listaOriginalPalabras) {
    let listaFiltrada = [];
    let textoParaAudio = "";
    let nivelParen = 0;
    let nivelCorch = 0;
    let nivelLlaves = 0;

    const saltarUrls = document.getElementById('chk-urls')?.checked;
    const saltarParen = document.getElementById('chk-paren')?.checked;
    const saltarCorch = document.getElementById('chk-corch')?.checked;
    const saltarLlaves = document.getElementById('chk-llaves')?.checked;
    const saltarBarras = document.getElementById('chk-barras')?.checked;
    const saltarSup = document.getElementById('chk-superindices')?.checked ?? document.getElementById('chk-referencias')?.checked ?? true;
    const saltarSub = document.getElementById('chk-subindices')?.checked ?? false;

    if (!listaOriginalPalabras) return { listaVisual: [], textoClean: "" };

    for (let i = 0; i < listaOriginalPalabras.length; i++) {
        let p = listaOriginalPalabras[i];
        let txtRaw = p.texto.trim();
        if (!txtRaw) continue;

        // 1. APERTURA DE BLOQUES (Soporta anidamiento seguro sin romper niveles)
        if (saltarParen) nivelParen += (txtRaw.match(/\(/g) || []).length;
        if (saltarCorch) nivelCorch += (txtRaw.match(/\[/g) || []).length;
        if (saltarLlaves) nivelLlaves += (txtRaw.match(/\{/g) || []).length;

        const ignorarBloque = (nivelParen > 0) || (nivelCorch > 0) || (nivelLlaves > 0);
        let esLink = saltarUrls && /https?:\/\/\S+|www\.\S+|\b\w+\.(?:com|org|net|edu|gov|mx)\b/i.test(txtRaw);

        // 2. PROCESAMIENTO (Detección de Voz y Silencios del Usuario)
        if (!ignorarBloque && !esLink) {
            let p_audio = txtRaw;

            if (saltarSup) {
                p_audio = p_audio.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, '').replace(/\[\d{1,3}\]/g, '');
            }
            if (saltarSub) {
                p_audio = p_audio.replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, '');
            }

            // A) Filtro Manual de Barras (UI)
            if (saltarBarras) {
                p_audio = p_audio.split('/').join(' ').split('\\').join(' ');
            }

            // B) Validación de Contenido Real
            const tieneContenido = /[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(p_audio);
            const esDecimalProtegido = p_audio.includes("punto");

            if (tieneContenido || esDecimalProtegido) {
                listaFiltrada.push(p);
                textoParaAudio += p_audio + " ";
            } else {
                p.yaLeida = true;
            }
        } else {
            p.yaLeida = true;
        }

        // 3. CIERRE DE BLOQUES (Decremento protegido contra negativos)
        if (saltarParen) nivelParen = Math.max(0, nivelParen - (txtRaw.match(/\)/g) || []).length);
        if (saltarCorch) nivelCorch = Math.max(0, nivelCorch - (txtRaw.match(/\]/g) || []).length);
        if (saltarLlaves) nivelLlaves = Math.max(0, nivelLlaves - (txtRaw.match(/\}/g) || []).length);
    } // <--- Cierre del FOR
    return { listaVisual: listaFiltrada, textoClean: textoParaAudio.trim() };
} // <--- Cierre de la FUNCIÓN

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
function cerrarModalesAbiertos() {
    // Si hay un diálogo modal de LiraDialog abierto, no cerrar paneles subyacentes
    const dlgOverlay = document.getElementById('lira-dialog-overlay');
    if (dlgOverlay && dlgOverlay.classList.contains('activo')) {
        return true;
    }

    const estaVisible = (el) => Boolean(el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none');

    // Lightbox / Captura (prioridad más alta)
    const modalVerCaptura = document.getElementById('modal-ver-captura');
    if (estaVisible(modalVerCaptura)) {
        if (typeof cerrarModalVerCaptura === 'function') cerrarModalVerCaptura();
        return true;
    }

    const modalGuardarCaptura = document.getElementById('modal-guardar-captura');
    if (estaVisible(modalGuardarCaptura)) {
        if (typeof cerrarModalGuardarCaptura === 'function') cerrarModalGuardarCaptura();
        return true;
    }

    // Modales OCR
    const modalOcrRango = document.getElementById('modal-ocr-rango');
    if (estaVisible(modalOcrRango)) {
        if (typeof cerrarModalRangoOCR === 'function') cerrarModalRangoOCR();
        return true;
    }

    const modalOcrDecision = document.getElementById('modal-ocr-decision');
    if (estaVisible(modalOcrDecision)) {
        if (typeof cerrarModalOCRDecision === 'function') cerrarModalOCRDecision();
        return true;
    }

    const modalOcrProgreso = document.getElementById('modal-ocr-progreso');
    if (estaVisible(modalOcrProgreso)) {
        if (typeof cancelarBatchOCRYLeer === 'function') cancelarBatchOCRYLeer();
        return true;
    }

    // Tiendas (Ollama y Voces)
    const modalTiendaOllama = document.getElementById('modal-tienda-ollama');
    if (estaVisible(modalTiendaOllama)) {
        if (typeof cerrarTiendaOllama === 'function') cerrarTiendaOllama();
        else modalTiendaOllama.style.display = 'none';
        return true;
    }

    const modalTiendaVoces = document.getElementById('modal-tienda-voces');
    if (estaVisible(modalTiendaVoces)) {
        if (typeof cerrarTiendaVoces === 'function') cerrarTiendaVoces();
        else modalTiendaVoces.style.display = 'none';
        return true;
    }

    // Panel de Subrayados / Extracción y Buscador PDF
    const modalSubrayados = document.getElementById('modal-subrayados');
    if (estaVisible(modalSubrayados)) {
        if (typeof cerrarPanelSubrayados === 'function') cerrarPanelSubrayados();
        return true;
    }

    const panelBusqueda = document.getElementById('panel-busqueda');
    if (estaVisible(panelBusqueda)) {
        if (typeof cerrarBuscadorPDF === 'function') cerrarBuscadorPDF();
        return true;
    }

    // 0. Prioridad: Modo Teatro (Añadido)
    const modalTeatro = document.getElementById('modal-teatro');
    if (modalTeatro && modalTeatro.style.display === 'flex') {
        cerrarTeatro();
        console.log("[UI] Modo Teatro cerrado vía ESC");
        return true;
    }
    // 1. Prioridad: Diccionario
    const modalDicc = document.getElementById('modal-diccionario');
    if (modalDicc && modalDicc.style.display === 'flex') {
        cerrarDiccionario();
        console.log("[UI] Diccionario cerrado vía ESC");
        return true; // Retornamos true para indicar que ya hicimos una acción
    }

    // 2. Prioridad: Configuración Avanzada
    const modalConfig = document.getElementById('modalConfig');
    if (modalConfig && modalConfig.style.display === 'flex') {
        cerrarConfiguracion();
        console.log("[UI] Configuración cerrada vía ESC");
        return true;
    }

    // 3. Prioridad: Modal de Descarga MP3
    const modalDescarga = document.getElementById('modal-descarga');
    if (modalDescarga && modalDescarga.style.display === 'flex') {
        cerrarModalDescarga();
        console.log("[UI] Descarga cerrada vía ESC");
        return true;
    }

    // 4. Prioridad: Asistente LiraAI
    const modalIA = document.getElementById('modal-ia');
    if (modalIA && modalIA.style.display === 'flex') {
        if (typeof cerrarModalIA === 'function') cerrarModalIA();
        console.log("[UI] LiraAI cerrado vía ESC");
        return true;
    }

    // 5. Prioridad: Notas (Panel Rápido o Gestor General)
    const panelNotaRapida = document.getElementById('panel-nota-rapida');
    if (panelNotaRapida && panelNotaRapida.style.display === 'flex') {
        if (typeof cerrarPanelNotaRapida === 'function') cerrarPanelNotaRapida();
        return true;
    }
    const modalNotas = document.getElementById('modal-notas');
    if (modalNotas && modalNotas.style.display === 'flex') {
        if (typeof cerrarModalNotas === 'function') cerrarModalNotas();
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
