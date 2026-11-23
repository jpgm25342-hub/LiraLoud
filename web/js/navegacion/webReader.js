/* LiraLoud
 * Copyright 2026 Jose Pablo Gonzalez Macias
 * Licensed under the Apache License, Version 2.0
 */

// ==========================================
// LIRA LANZADOR — Controlador JS
// Gestiona el Estado Cero (pantalla bienvenida)
// y el Estado Activo (modal flotante desde navbar)
// ==========================================

// ─── HELPERS INTERNOS ───────────────────────────────────────

function _destruirBienvenida() {
    const bienvenida = document.getElementById('lira-bienvenida');
    if (bienvenida) {
        bienvenida.style.transition = 'opacity 0.25s ease';
        bienvenida.style.opacity = '0';
        setTimeout(() => {
            bienvenida.style.display = 'none';
        }, 260);
    }
}

function _mostrarBienvenida() {
    const bienvenida = document.getElementById('lira-bienvenida');
    if (bienvenida) {
        bienvenida.style.display = 'flex';
        void bienvenida.offsetWidth; // Forzar reflujo de layout
        bienvenida.style.transition = 'opacity 0.25s ease';
        bienvenida.style.opacity = '1';
    }
}

// ─── API PUBLICA: MODAL LANZADOR ────────────────────────────

function abrirLanzador() {
    const overlay = document.getElementById('lira-lanzador-overlay');
    if (!overlay) return;
    mostrarVistaGrid();
    overlay.classList.add('activo');
    // Cerrar con Escape
    document.addEventListener('keydown', _cerrarConEscape, { once: true });
}

function cerrarLanzador() {
    const overlay = document.getElementById('lira-lanzador-overlay');
    if (overlay) overlay.classList.remove('activo');
    document.removeEventListener('keydown', _cerrarConEscape);
    // Limpiar campos
    const urlInput = document.getElementById('lira-url-input');
    if (urlInput) urlInput.value = '';
    const textoInput = document.getElementById('lira-texto-input');
    if (textoInput) textoInput.value = '';
    _setEstado('lira-url-estado', '');
    _setEstado('lira-texto-estado', '');

    // Si no hay ningún documento abierto y cerramos el modal, mostrar el menú habitual
    if (typeof rutaPDFActual === 'undefined' || !rutaPDFActual) {
        _mostrarBienvenida();
    }
}

function _cerrarConEscape(e) {
    if (e.key === 'Escape') cerrarLanzador();
}

// Cerrar si se hace clic en el overlay (fuera del modal)
document.addEventListener('click', (e) => {
    const overlay = document.getElementById('lira-lanzador-overlay');
    if (e.target === overlay) cerrarLanzador();
});

// ─── NAVEGACION INTERNA DEL MODAL ───────────────────────────

function mostrarVistaGrid() {
    document.getElementById('lanzador-vista-grid')?.style.setProperty('display', 'block');
    document.getElementById('lira-url-submodal')?.classList.remove('activo');
    document.getElementById('lira-texto-submodal')?.classList.remove('activo');
}

function _mostrarSubmodal(id) {
    document.getElementById('lanzador-vista-grid')?.style.setProperty('display', 'none');
    document.getElementById(id)?.classList.add('activo');
}

// ─── HELPERS DE ESTADO ──────────────────────────────────────

function _setEstado(idEstado, msg, esError = false, icono = null) {
    const el = document.getElementById(idEstado);
    if (!el) return;
    if (!msg) {
        el.innerHTML = '';
        el.classList.toggle('error', false);
        return;
    }
    const esc = (typeof window.escapeHtml === 'function')
        ? window.escapeHtml
        : (s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    if (icono && typeof window.obtenerIconoDialogoSVG === 'function') {
        el.innerHTML = `<span class="lanzador-estado-row">${window.obtenerIconoDialogoSVG(icono, 'lanzador-estado-svg')}<span>${esc(msg)}</span></span>`;
    } else {
        el.textContent = msg;
    }
    el.classList.toggle('error', esError);
}

function _setBotonesBloqueados(ids, bloqueado) {
    ids.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = bloqueado;
    });
}

// ─── OPCION 1: ABRIR PDF LOCAL ───────────────────────────────

async function lanzarAbrirPDF() {
    detenerLectura();
    if (typeof rutaPDFActual !== 'undefined' && rutaPDFActual) guardarEstadoPaginaActual();
    
    // Abrir el selector de archivos; si el usuario cancela, abrirBuscador se encarga de mantener el menú
    const exito = await abrirBuscador();
    if (exito) {
        _destruirBienvenida();
        cerrarLanzador();
    }
}

// ─── OPCION 2: PEGAR URL ─────────────────────────────────────

function lanzarAbrirURL() {
    // Asegurar que el overlay del lanzador está abierto (funciona desde
    // la pantalla de bienvenida Y desde el modal activo)
    const overlay = document.getElementById('lira-lanzador-overlay');
    if (overlay && !overlay.classList.contains('activo')) {
        overlay.classList.add('activo');
        document.addEventListener('keydown', _cerrarConEscape, { once: true });
    }
    _mostrarSubmodal('lira-url-submodal');
    setTimeout(() => document.getElementById('lira-url-input')?.focus(), 80);
}

async function ejecutarImportarURL() {
    const input = document.getElementById('lira-url-input');
    const url = (input?.value || '').trim();

    if (!url) {
        _setEstado('lira-url-estado', 'Escribe o pega una URL primero.', true);
        return;
    }

    console.log('[WebReader] ejecutarImportarURL() -> url:', url);
    const btnEl = document.getElementById('btn-ejecutar-url');
    if (btnEl) btnEl.innerHTML = '<span class="lanzador-spinner"></span> Extrayendo...';
    _setBotonesBloqueados(['btn-ejecutar-url'], true);
    _setEstado('lira-url-estado', 'Conectando con el sitio web...');

    try {
        console.log('[WebReader] Llamando a eel.importar_url_como_pdf (síncrono)...');
        const resultado = await eel.importar_url_como_pdf(url)();
        console.log('[WebReader] Resultado recibido:', JSON.stringify(resultado));

        if (btnEl) btnEl.textContent = 'Leer página';
        _setBotonesBloqueados(['btn-ejecutar-url'], false);

        if (resultado && resultado.ok) {
            _setEstado('lira-url-estado', 'PDF generado. Cargando...', false, 'exito');
            console.log('[WebReader] Abriendo documento desde ruta:', resultado.ruta);
            _destruirBienvenida();
            cerrarLanzador();
            detenerLectura();
            if (typeof rutaPDFActual !== 'undefined' && rutaPDFActual) guardarEstadoPaginaActual();
            await abrirDocumentoDesdeRuta(resultado.ruta, true, false, { tipoDocumento: 'web' });
        } else {
            const msg = (resultado && resultado.error) || 'Error desconocido al procesar la URL.';
            console.error('[WebReader] Error en resultado:', msg);
            _setEstado('lira-url-estado', msg, true, 'error');
        }
    } catch (e) {
        console.error('[WebReader] Error en comunicacion con Python:', e);
        _setEstado('lira-url-estado', 'Error de comunicacion: ' + e, true, 'error');
        if (btnEl) btnEl.textContent = 'Leer página';
        _setBotonesBloqueados(['btn-ejecutar-url'], false);
    }
}

// ─── OPCION 3: TEXTO LIBRE ───────────────────────────────────

function lanzarAbrirTexto() {
    // Asegurar que el overlay del lanzador está abierto
    const overlay = document.getElementById('lira-lanzador-overlay');
    if (overlay && !overlay.classList.contains('activo')) {
        overlay.classList.add('activo');
        document.addEventListener('keydown', _cerrarConEscape, { once: true });
    }
    _mostrarSubmodal('lira-texto-submodal');
    setTimeout(() => document.getElementById('lira-texto-input')?.focus(), 80);
}

async function ejecutarImportarTexto() {
    const input = document.getElementById('lira-texto-input');
    const texto = (input?.value || '').trim();

    if (!texto) {
        _setEstado('lira-texto-estado', 'El campo de texto esta vacio.', true);
        return;
    }

    const btnEl = document.getElementById('btn-ejecutar-texto');
    if (btnEl) btnEl.innerHTML = '<span class="lanzador-spinner"></span> Generando PDF...';
    _setBotonesBloqueados(['btn-ejecutar-texto'], true);
    _setEstado('lira-texto-estado', 'Convirtiendo texto a PDF...');

    try {
        const resultado = await eel.importar_texto_como_pdf(texto)();

        if (resultado && resultado.ok) {
            _setEstado('lira-texto-estado', 'Listo. Cargando...', false, 'exito');
            _destruirBienvenida();
            cerrarLanzador();
            detenerLectura();
            if (typeof rutaPDFActual !== 'undefined' && rutaPDFActual) guardarEstadoPaginaActual();
            await abrirDocumentoDesdeRuta(resultado.ruta, true, false, { tipoDocumento: 'texto_escrito' });
        } else {
            const msg = (resultado && resultado.error) || 'Error generando PDF.';
            _setEstado('lira-texto-estado', msg, true, 'error');
        }
    } catch (e) {
        _setEstado('lira-texto-estado', 'Error: ' + e, true, 'error');
    } finally {
        if (btnEl) btnEl.textContent = 'Leer texto';
        _setBotonesBloqueados(['btn-ejecutar-texto'], false);
    }
}

// ─── OPCION 4: CAPTURA / OCR ─────────────────────────────────

async function lanzarCaptura() {
    const estabaBienvenidaVisible = document.getElementById('lira-bienvenida')?.style.display !== 'none';
    cerrarLanzador();
    
    console.log('[WebReader] Iniciando Modo Captura...');
    try {
        // Llama a Python para minimizar la ventana y abrir la herramienta de recortes
        const resultado = await eel.iniciar_captura_pantalla()();
        
        if (resultado && resultado.ok) {
            console.log('[WebReader] Captura exitosa, abriendo...', resultado.ruta);
            _destruirBienvenida();
            if (typeof rutaPDFActual !== 'undefined' && rutaPDFActual) guardarEstadoPaginaActual();
            // Abre el PDF temporal generado por la captura, indicando esTemporal=true, esCaptura=true
            await abrirDocumentoDesdeRuta(resultado.ruta, true, true);
        } else {
            console.warn('[WebReader] Captura cancelada o con error:', resultado?.error);
            if (typeof rutaPDFActual === 'undefined' || !rutaPDFActual) {
                if (estabaBienvenidaVisible) _mostrarBienvenida();
                else abrirLanzador();
            }
        }
    } catch (e) {
        console.error('[WebReader] Error de comunicación al intentar capturar pantalla:', e);
        if (typeof rutaPDFActual === 'undefined' || !rutaPDFActual) _mostrarBienvenida();
        if (typeof liraAlert === 'function') liraAlert('Error al iniciar la herramienta de captura.', 'error');
    }
}

// ─── INICIALIZACION ──────────────────────────────────────────

// La pantalla de bienvenida se muestra al cargar (el HTML ya la tiene visible).
// init.js la muestra en lugar de llamar a abrirBuscador() automaticamente.
console.log('[WebReader] Lanzador cargado.');