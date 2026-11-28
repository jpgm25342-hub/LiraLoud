/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

/**
 * ==========================================================================
 * LIRALOUD - MÓDULO DE CUADERNO DE NOTAS Y APUNTES (OBSIDIAN / MARKDOWN / IA)
 * ==========================================================================
 */

window.notasLista = [];
window.notaSeleccionadaActual = null;
window.filtroNotasModo = 'pagina_actual'; // 'pagina_actual' | 'todo_libro' | 'global'
window.filtroNotasClasificacion = 'TODAS';
window.filtroNotasBusqueda = '';
window.rutaNotasBaseActual = '';

// ==========================================================================
// 1. PANEL FLOTANTE COMPACTO: CREAR NOTA RÁPIDA (SIN TAPAR EL VISOR)
// ==========================================================================

function togglePanelNotaRapida() {
    const panel = document.getElementById('panel-nota-rapida');
    if (!panel) return;
    if (panel.style.display === 'flex') {
        cerrarPanelNotaRapida();
    } else {
        abrirPanelNotaRapida();
    }
}

function abrirPanelNotaRapida() {
    // Cerrar el modal grande si estuviera abierto
    cerrarModalNotas();
    
    const panel = document.getElementById('panel-nota-rapida');
    if (!panel) return;
    
    const pagActual = (typeof paginaActual !== 'undefined' && paginaActual) ? paginaActual : 1;
    const libroActual = obtenerNombreLibroActivo();
    
    // Actualizar encabezados
    const lblPag = document.getElementById('nota-rapida-lbl-pag');
    if (lblPag) lblPag.innerText = `Pág. ${pagActual}`;
    
    const inpPag = document.getElementById('nota-rapida-pagina');
    if (inpPag) inpPag.value = pagActual;
    
    const inpTitulo = document.getElementById('nota-rapida-titulo-input');
    if (inpTitulo) {
        inpTitulo.value = `Nota - Pág. ${pagActual}`;
    }
    
    const editor = document.getElementById('nota-rapida-editor-content');
    if (editor) {
        editor.innerHTML = '';
    }
    
    panel.style.display = 'flex';
    
    // Poblar clasificaciones en el datalist
    actualizarDatalistClasificaciones();
    
    setTimeout(() => {
        if (editor) editor.focus();
    }, 100);
}

function cerrarPanelNotaRapida() {
    const panel = document.getElementById('panel-nota-rapida');
    if (panel) panel.style.display = 'none';
}

function _leerCamposNotaDOM(ids, libroFallback) {
    const inpTitulo = document.getElementById(ids.titulo);
    const editor = document.getElementById(ids.editor);
    if (!inpTitulo || !editor) return null;
    const inpClasif = document.getElementById(ids.clasif);
    const inpPag = document.getElementById(ids.pagina);
    const pagVal = parseInt(inpPag?.value || 1, 10) || 1;
    return {
        titulo: inpTitulo.value.trim() || ("Nota Pág " + pagVal),
        clasificacion: (inpClasif?.value.trim()) || "General",
        pagina: pagVal,
        libro: libroFallback || obtenerNombreLibroActivo(),
        contenido: editor.innerHTML.trim()
    };
}

async function _persistirNotaEnBackend(notaData, cfgUI) {
    const btnSave = cfgUI.btnSave;
    try {
        if (btnSave) btnSave.innerText = "⏳ Guardando...";
        const res = await eel.notas_guardar(notaData, window.rutaNotasPersonalizada || "")();
        if (res && res.exito) {
            if (typeof cfgUI.onExito === 'function') cfgUI.onExito(res);
            if (btnSave) {
                btnSave.innerText = "✅ Guardada";
                setTimeout(() => {
                    if (btnSave) btnSave.innerText = cfgUI.textoNormal;
                    if (typeof cfgUI.despuesFeedback === 'function') cfgUI.despuesFeedback();
                }, cfgUI.delayMs);
            }
            if (cfgUI.esperarRecarga) await cargarNotasDesdeBackend();
            else cargarNotasDesdeBackend();
        } else {
            await liraAlert("Error al guardar nota: " + (res?.error || "Error desconocido"), "advertencia");
            if (btnSave) btnSave.innerText = cfgUI.textoNormal;
        }
    } catch (e) {
        console.error(cfgUI.logError, e);
        if (btnSave) btnSave.innerText = cfgUI.textoNormal;
    }
}

async function guardarNotaRapida() {
    const campos = _leerCamposNotaDOM({
        titulo: 'nota-rapida-titulo-input',
        clasif: 'nota-rapida-clasif-input',
        pagina: 'nota-rapida-pagina',
        editor: 'nota-rapida-editor-content'
    });
    if (!campos) return;
    if (!campos.contenido && !campos.titulo) {
        await liraAlert("Escribe contenido o un título para tu nota.", "archivo");
        return;
    }
    const notaData = { ...campos, fecha_creacion: null, ruta_absoluta: null };
    await _persistirNotaEnBackend(notaData, {
        btnSave: document.getElementById('btn-guardar-nota-rapida'),
        textoNormal: "Guardar",
        delayMs: 700,
        esperarRecarga: false,
        logError: '[Notas] Error al guardar nota rápida:',
        despuesFeedback: cerrarPanelNotaRapida
    });
}

async function enviarNotaRapidaAIA() {
    const inpTitulo = document.getElementById('nota-rapida-titulo-input');
    const inpClasif = document.getElementById('nota-rapida-clasif-input');
    const inpPag = document.getElementById('nota-rapida-pagina');
    const editor = document.getElementById('nota-rapida-editor-content');
    
    const titulo = inpTitulo?.value.trim() || 'Nota';
    const clasif = inpClasif?.value.trim() || 'General';
    const pag = inpPag?.value || '1';
    const textoNota = (editor?.innerText || editor?.textContent || '').trim();
    
    if (!textoNota) {
        await liraAlert("La nota actual está vacía. Escribe contenido antes de enviarla a la IA.", "info");
        return;
    }
    
    const promptParaIA = `[NOTA de Apuntes - ${titulo} | Pág. ${pag} | Área: ${clasif}]\n\n${textoNota}\n\nPregunta / Instrucción: Por favor analiza, resume y explica los puntos clave de este apunte.`;
    
    cerrarPanelNotaRapida();
    if (typeof abrirModalIA === 'function') {
        abrirModalIA();
        setTimeout(() => {
            const inputChat = document.getElementById('ia-chat-input');
            if (inputChat) {
                inputChat.value = promptParaIA;
                inputChat.focus();
            }
        }, 150);
    }
}


// ==========================================================================
// 2. MODAL GENERAL: GESTOR DE TODAS LAS NOTAS (3 COLUMNAS)
// ==========================================================================

function toggleModalNotas() {
    const modal = document.getElementById('modal-notas');
    if (!modal) return;
    if (modal.style.display === 'flex') {
        cerrarModalNotas();
    } else {
        abrirModalNotas();
    }
}

function abrirModalNotas() {
    cerrarPanelNotaRapida();
    if (typeof cerrarOtrasFuncionesPrincipales === 'function') {
        cerrarOtrasFuncionesPrincipales('notas');
    }
    const modal = document.getElementById('modal-notas');
    if (!modal) return;
    modal.style.display = 'flex';
    
    const libroActual = obtenerNombreLibroActivo();
    const badgeLibro = document.getElementById('notas-header-libro-badge');
    if (badgeLibro) {
        const svgBadge = libroActual
            ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
            : '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
        badgeLibro.innerHTML = `${svgBadge}<span>${libroActual || 'Todas las notas'}</span>`;
    }
    
    cargarNotasDesdeBackend();
}

function cerrarModalNotas() {
    const modal = document.getElementById('modal-notas');
    if (modal) modal.style.display = 'none';
    if (typeof guardarTodosAjustes === 'function') {
        guardarTodosAjustes(false);
    }
}

function obtenerNombreLibroActivo() {
    if (typeof rutaPDFActual !== 'undefined' && rutaPDFActual) {
        const nombreConExt = rutaPDFActual.split('\\').pop().split('/').pop();
        if (nombreConExt && nombreConExt !== "Sin archivo") {
            return nombreConExt.replace(/\.[^/.]+$/, "").trim();
        }
    }
    if (typeof nombreArchivoActual !== 'undefined' && nombreArchivoActual) {
        return nombreArchivoActual.replace(/\.[^/.]+$/, "").trim();
    }
    const lblTitulo = document.getElementById('nombre-pdf') || document.getElementById('titulo-pdf');
    if (lblTitulo && lblTitulo.innerText && lblTitulo.innerText !== "Sin archivo" && lblTitulo.innerText !== "LiraLoud") {
        return lblTitulo.innerText.replace(/\.[^/.]+$/, "").trim();
    }
    return "General";
}

// --- CARGA Y SINCRONIZACIÓN CON BACKEND ---
function _resolverFiltrosListadoNotas() {
    const libroActual = obtenerNombreLibroActivo();
    const pagActual = (typeof paginaActual !== 'undefined' && paginaActual) ? paginaActual : 1;
    if (window.filtroNotasModo === 'pagina_actual') return { filtroLibro: libroActual, filtroPag: pagActual };
    if (window.filtroNotasModo === 'todo_libro') return { filtroLibro: libroActual, filtroPag: null };
    return { filtroLibro: null, filtroPag: null };
}

function _seleccionarNotaTrasCarga() {
    if (window.notasLista.length === 0) { crearNuevaNota(); return; }
    const rutaAct = window.notaSeleccionadaActual?.ruta_absoluta;
    const existe = rutaAct ? window.notasLista.find(n => n.ruta_absoluta === rutaAct) : null;
    seleccionarNota(existe || window.notasLista[0]);
}

async function cargarNotasDesdeBackend() {
    try {
        if (typeof eel === 'undefined' || !eel.notas_listar) return;
        const { filtroLibro, filtroPag } = _resolverFiltrosListadoNotas();
        const res = await eel.notas_listar(
            window.rutaNotasPersonalizada || "",
            filtroLibro,
            filtroPag,
            window.filtroNotasClasificacion,
            window.filtroNotasBusqueda
        )();
        if (!res?.exito) return;

        window.notasLista = res.notas || [];
        window.rutaNotasBaseActual = res.ruta_base || "";
        const lblRuta = document.getElementById('notas-ruta-carpeta-lbl');
        if (lblRuta) lblRuta.innerText = window.rutaNotasBaseActual;

        renderizarSidebarFiltros();
        renderizarListaNotas();
        _seleccionarNotaTrasCarga();
    } catch (e) {
        console.error('[Notas] Error al cargar notas desde backend:', e);
    }
}

async function actualizarDatalistClasificaciones() {
    try {
        if (typeof eel === 'undefined' || !eel.notas_obtener_clasificaciones_y_libros) return;
        const res = await eel.notas_obtener_clasificaciones_y_libros(window.rutaNotasPersonalizada || "")();
        let clasifs = (res && res.exito) ? res.clasificaciones : [];
        if (!clasifs.includes('General')) clasifs.unshift('General');
        
        ['dl-clasificaciones', 'dl-clasificaciones-rapida'].forEach(dlId => {
            const dl = document.getElementById(dlId);
            if (dl) {
                dl.innerHTML = '';
                clasifs.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c;
                    dl.appendChild(opt);
                });
            }
        });
    } catch(e) { }
}

// --- RENDERIZADO DE SIDEBAR Y CLASIFICACIONES ---
async function renderizarSidebarFiltros() {
    document.querySelectorAll('.notas-scope-btn').forEach(btn => {
        const modo = btn.getAttribute('data-modo');
        btn.classList.toggle('activo', modo === window.filtroNotasModo);
    });
    
    const container = document.getElementById('notas-clasif-lista');
    if (!container) return;
    
    try {
        const res = await eel.notas_obtener_clasificaciones_y_libros(window.rutaNotasPersonalizada || "")();
        let clasifs = (res && res.exito) ? res.clasificaciones : [];
        if (!clasifs.includes('General')) clasifs.unshift('General');
        
        const svgAllAreas = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
        const svgTag = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
        container.innerHTML = `
            <button class="notas-clasif-item ${window.filtroNotasClasificacion === 'TODAS' ? 'activo' : ''}" onclick="filtrarNotasPorClasificacion('TODAS')">
                <span style="display:inline-flex; align-items:center; gap:6px;">${svgAllAreas}<span>Todas las áreas</span></span>
                <span class="notas-badge">${window.notasLista.length}</span>
            </button>
        `;
        
        clasifs.forEach(c => {
            const count = window.notasLista.filter(n => (n.clasificacion || 'General').toLowerCase() === c.toLowerCase()).length;
            const btn = document.createElement('button');
            btn.className = `notas-clasif-item ${window.filtroNotasClasificacion.toLowerCase() === c.toLowerCase() ? 'activo' : ''}`;
            btn.onclick = () => filtrarNotasPorClasificacion(c);
            btn.innerHTML = `
                <span style="display:inline-flex; align-items:center; gap:6px;">${svgTag}<span>${c}</span></span>
                <span class="notas-badge">${count}</span>
            `;
            container.appendChild(btn);
        });
        
        actualizarDatalistClasificaciones();
    } catch(e) {
        console.error('[Notas] Error al renderizar clasificaciones:', e);
    }
}

// --- RENDERIZADO DE TARJETAS DE NOTAS ---
function renderizarListaNotas() {
    const container = document.getElementById('notas-cards-container');
    if (!container) return;
    container.innerHTML = '';
    
    if (window.notasLista.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #94a3b8; padding: 30px 10px; font-size: 13px;">
                <p style="display:inline-flex; align-items:center; gap:6px; justify-content:center;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><span>No hay notas con este filtro.</span></p>
                <button class="notas-btn-crear" onclick="crearNuevaNota()" style="margin: 10px auto;">+ Crear Primera Nota</button>
            </div>
        `;
        return;
    }
    
    const svgTagCard = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
    window.notasLista.forEach(n => {
        const card = document.createElement('div');
        const esActiva = window.notaSeleccionadaActual && window.notaSeleccionadaActual.ruta_absoluta === n.ruta_absoluta;
        card.className = `nota-card ${esActiva ? 'activa' : ''}`;
        card.onclick = () => seleccionarNota(n);
        
        const snippetLimpio = (n.contenido || "").replace(/<[^>]*>?/gm, '').substring(0, 80);
        
        card.innerHTML = `
            <div class="nota-card-header">
                <div class="nota-card-titulo">${n.titulo || 'Sin título'}</div>
                <span class="nota-pill">Pág. ${n.pagina || 1}</span>
            </div>
            <div class="nota-card-snippet">${snippetLimpio || 'Nota vacía...'}</div>
            <div class="nota-card-meta">
                <span style="display:inline-flex; align-items:center; gap:4px;">${svgTagCard}<span>${n.clasificacion || 'General'}</span></span>
                <span>${(n.fecha_modificacion || '').split(' ')[0]}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

// --- SELECCIÓN Y EDICIÓN DE NOTAS ---
function seleccionarNota(nota) {
    window.notaSeleccionadaActual = nota;
    
    const inpTitulo = document.getElementById('nota-editor-titulo');
    const inpClasif = document.getElementById('nota-editor-clasif');
    const inpPag = document.getElementById('nota-editor-pagina');
    const inpLibro = document.getElementById('nota-editor-libro');
    const contentDiv = document.getElementById('nota-editor-content');
    
    if (inpTitulo) inpTitulo.value = nota.titulo || '';
    if (inpClasif) inpClasif.value = nota.clasificacion || 'General';
    if (inpPag) inpPag.value = nota.pagina || 1;
    if (inpLibro) inpLibro.innerText = nota.libro || obtenerNombreLibroActivo();
    if (contentDiv) contentDiv.innerHTML = nota.contenido || '';
    
    document.querySelectorAll('.nota-card').forEach(c => {
        c.classList.toggle('activa', c.querySelector('.nota-card-titulo')?.innerText === nota.titulo);
    });
}

function crearNuevaNota() {
    const libroActual = obtenerNombreLibroActivo();
    const pagActual = (typeof paginaActual !== 'undefined' && paginaActual) ? paginaActual : 1;
    const clasifActual = (window.filtroNotasClasificacion && window.filtroNotasClasificacion !== 'TODAS') ? window.filtroNotasClasificacion : 'General';
    
    const nueva = {
        id: "Nueva Nota",
        titulo: "Nota - Pág. " + pagActual,
        libro: libroActual,
        pagina: pagActual,
        clasificacion: clasifActual,
        contenido: "",
        fecha_creacion: "",
        fecha_modificacion: "",
        ruta_absoluta: null
    };
    
    seleccionarNota(nueva);
    const inpTitulo = document.getElementById('nota-editor-titulo');
    if (inpTitulo) {
        inpTitulo.focus();
        inpTitulo.select();
    }
}

async function guardarNotaActual() {
    const campos = _leerCamposNotaDOM({
        titulo: 'nota-editor-titulo',
        clasif: 'nota-editor-clasif',
        pagina: 'nota-editor-pagina',
        editor: 'nota-editor-content'
    }, window.notaSeleccionadaActual?.libro);
    if (!campos) return;

    const notaData = {
        ...campos,
        fecha_creacion: window.notaSeleccionadaActual?.fecha_creacion || null,
        ruta_absoluta: window.notaSeleccionadaActual?.ruta_absoluta || null
    };
    await _persistirNotaEnBackend(notaData, {
        btnSave: document.querySelector('.notas-editor-footer .notas-btn-save'),
        textoNormal: "Guardar Nota",
        delayMs: 900,
        esperarRecarga: true,
        logError: '[Notas] Error al guardar nota:',
        onExito: (res) => {
            notaData.ruta_absoluta = res.ruta_absoluta;
            notaData.fecha_modificacion = res.fecha_modificacion;
            window.notaSeleccionadaActual = notaData;
        }
    });
}

async function eliminarNotaActual() {
    if (!window.notaSeleccionadaActual || !window.notaSeleccionadaActual.ruta_absoluta) {
        crearNuevaNota();
        return;
    }
    
    if (!await liraConfirm(`¿Deseas eliminar permanentemente la nota "${window.notaSeleccionadaActual.titulo}"?`, 'borrar')) {
        return;
    }
    
    try {
        const res = await eel.notas_eliminar(window.notaSeleccionadaActual.ruta_absoluta, window.rutaNotasPersonalizada || "")();
        if (res && res.exito) {
            window.notaSeleccionadaActual = null;
            await cargarNotasDesdeBackend();
        } else {
            await liraAlert("Error al eliminar nota: " + (res?.error || "No se pudo eliminar"), "advertencia");
        }
    } catch(e) {
        console.error('[Notas] Error al eliminar nota:', e);
    }
}

// --- FILTRADO Y BÚSQUEDA ---
function filtrarNotasPorModo(modo) {
    window.filtroNotasModo = modo;
    cargarNotasDesdeBackend();
}

function filtrarNotasPorClasificacion(clasif) {
    window.filtroNotasClasificacion = clasif;
    cargarNotasDesdeBackend();
}

let timerBusquedaNotas = null;
function onBuscarNotasInput(valor) {
    if (timerBusquedaNotas) clearTimeout(timerBusquedaNotas);
    timerBusquedaNotas = setTimeout(() => {
        window.filtroNotasBusqueda = valor;
        cargarNotasDesdeBackend();
    }, 250);
}

window._ultimaSeleccionNotas = window._ultimaSeleccionNotas || {};

function _obtenerBloqueEnEditor(editor, node) {
    const BLOQUES = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'LI']);
    let cur = node;
    while (cur && cur !== editor) {
        if (cur.nodeType === 1 && BLOQUES.has(cur.tagName)) {
            return cur;
        }
        cur = cur.parentNode;
    }
    return null;
}

function _colocarCursorEnElemento(el, alFinal = true) {
    const sel = window.getSelection();
    if (!sel || !el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(!alFinal);
    sel.removeAllRanges();
    sel.addRange(range);
}

const _BLOQUES_SEPARADORES_INLINE = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'UL', 'OL', 'BLOCKQUOTE']);

function _esCorteLineaInline(node) {
    return !node || node.nodeName === 'BR' || (node.nodeType === 1 && _BLOQUES_SEPARADORES_INLINE.has(node.tagName));
}

function _restaurarSeleccionGuardadaNota(editor) {
    const sel = window.getSelection();
    if ((!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) && window._ultimaSeleccionNotas[editor.id]) {
        sel.removeAllRanges();
        sel.addRange(window._ultimaSeleccionNotas[editor.id].cloneRange());
    }
    return sel;
}

function _envolverLineaInlineEnTag(editor, anchor, targetTag) {
    let nodoBase = anchor;
    while (nodoBase && nodoBase.parentNode !== editor) nodoBase = nodoBase.parentNode;

    const nuevo = document.createElement(targetTag);
    if (!nodoBase || nodoBase.parentNode !== editor) {
        nuevo.innerHTML = '<br>';
        editor.appendChild(nuevo);
        return nuevo;
    }

    const inlineNodes = [nodoBase];
    let prev = nodoBase.previousSibling;
    while (!_esCorteLineaInline(prev)) { inlineNodes.unshift(prev); prev = prev.previousSibling; }
    let next = nodoBase.nextSibling;
    while (!_esCorteLineaInline(next)) { inlineNodes.push(next); next = next.nextSibling; }

    editor.insertBefore(nuevo, inlineNodes[0]);
    for (const n of inlineNodes) nuevo.appendChild(n);
    if (next && next.nodeName === 'BR') next.remove();
    return nuevo;
}

function _aplicarToggleEncabezado(editor, tagRaw) {
    const targetTag = String(tagRaw || 'H1').replace(/[<>]/g, '').toUpperCase();
    if (!['H1', 'H2', 'H3'].includes(targetTag)) return;

    const sel = _restaurarSeleccionGuardadaNota(editor);
    const estaVacio = !editor.childNodes.length
        || editor.innerHTML === '<br>'
        || (editor.textContent.trim() === '' && !editor.querySelector('h1,h2,h3,p,div'));
    if (estaVacio) {
        editor.innerHTML = '';
        const nuevo = document.createElement(targetTag);
        nuevo.innerHTML = '<br>';
        editor.appendChild(nuevo);
        _colocarCursorEnElemento(nuevo, false);
        return;
    }

    const anchor = (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) ? sel.anchorNode : editor.firstChild;
    const bloque = _obtenerBloqueEnEditor(editor, anchor);
    if (bloque) {
        const nuevo = document.createElement(bloque.tagName === targetTag ? 'P' : targetTag);
        nuevo.innerHTML = bloque.innerHTML || '<br>';
        bloque.parentNode.replaceChild(nuevo, bloque);
        _colocarCursorEnElemento(nuevo, true);
        return;
    }

    _colocarCursorEnElemento(_envolverLineaInlineEnTag(editor, anchor, targetTag), true);
}

// --- FORMATEO EN EDITOR ENRIQUECIDO Y ESTADOS ACTIVOS ---
function aplicarFormatoNota(comando, valor = null, targetEditorId = 'nota-editor-content') {
    const editor = document.getElementById(targetEditorId);
    if (!editor) return;
    editor.focus();

    if (comando === 'heading') {
        _aplicarToggleEncabezado(editor, valor);
    } else if (comando === 'highlight') {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const parent = sel.anchorNode?.parentElement;
            const tieneFondo = parent && (parent.style.backgroundColor || parent.tagName === 'MARK');
            if (tieneFondo) {
                document.execCommand('hiliteColor', false, 'transparent');
            } else {
                document.execCommand('hiliteColor', false, valor || '#fff3cd');
            }
        } else {
            document.execCommand('hiliteColor', false, valor || '#fff3cd');
        }
    } else {
        document.execCommand(comando, false, valor);
    }

    setTimeout(() => {
        actualizarEstadosFormato(targetEditorId);
    }, 15);
}

function actualizarEstadosFormato(targetEditorId = 'nota-editor-content') {
    const editor = document.getElementById(targetEditorId);
    const esRapida = targetEditorId === 'nota-rapida-editor-content';
    const sufijo = esRapida ? '-rapida' : '-general';

    const esBold = document.queryCommandState('bold');
    const esItalic = document.queryCommandState('italic');
    const esUnderline = document.queryCommandState('underline');
    const esStrike = document.queryCommandState('strikeThrough');

    const btnBold = document.getElementById(`btn-fmt-bold${sufijo}`);
    const btnItalic = document.getElementById(`btn-fmt-italic${sufijo}`);
    const btnUnderline = document.getElementById(`btn-fmt-underline${sufijo}`);
    const btnStrike = document.getElementById(`btn-fmt-strike${sufijo}`);

    if (btnBold) btnBold.classList.toggle('activo', !!esBold);
    if (btnItalic) btnItalic.classList.toggle('activo', !!esItalic);
    if (btnUnderline) btnUnderline.classList.toggle('activo', !!esUnderline);
    if (btnStrike) btnStrike.classList.toggle('activo', !!esStrike);

    const sel = window.getSelection();
    const bloque = (editor && sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode))
        ? _obtenerBloqueEnEditor(editor, sel.anchorNode)
        : null;
    const tagActual = bloque ? bloque.tagName : '';
    ['H1', 'H2', 'H3'].forEach(h => {
        const btnH = document.getElementById(`btn-fmt-${h.toLowerCase()}${sufijo}`);
        if (btnH) btnH.classList.toggle('activo', tagActual === h);
    });
}

// Enlazar listeners para detectar cursor y selección
document.addEventListener('selectionchange', () => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.id === 'nota-editor-content' || activeEl.id === 'nota-rapida-editor-content')) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && activeEl.contains(sel.anchorNode)) {
            window._ultimaSeleccionNotas[activeEl.id] = sel.getRangeAt(0).cloneRange();
        }
        actualizarEstadosFormato(activeEl.id);
    }
});

// --- MENÚ CONTEXTUAL DE IA PARA NOTAS ---
function toggleMenuIANota(tipo = 'rapida') {
    const menu = document.getElementById(`menu-ia-nota-${tipo}`);
    if (!menu) return;
    const estaAbierto = menu.style.display === 'flex';
    
    // Cerrar otros menús
    document.querySelectorAll('.menu-ia-nota-popup').forEach(m => m.style.display = 'none');
    
    if (!estaAbierto) {
        menu.style.display = 'flex';
    }
}

// Cerrar menús de IA al hacer clic fuera
document.addEventListener('click', (e) => {
    if (!e.target.closest('.notas-btn-ia') && !e.target.closest('.menu-ia-nota-popup')) {
        document.querySelectorAll('.menu-ia-nota-popup').forEach(m => m.style.display = 'none');
    }
});

function formatearMarkdownParaNotaHTML(textoMD) {
    if (!textoMD) return "";
    let html = textoMD
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Encabezados
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Negrita, Cursiva, Subrayado, Tachado
    html = html.replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>');
    html = html.replace(/\*(.*?)\*/gim, '<i>$1</i>');
    html = html.replace(/__(.*?)__/gim, '<u>$1</u>');
    html = html.replace(/~~(.*?)~~/gim, '<s>$1</s>');

    // Listas con viñetas
    html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/gim, '');

    // Saltos de línea
    html = html.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');

    return html;
}

const _INSTRUCCIONES_IA_NOTA = {
    mejorar: "Mejora la redacción y claridad de este apunte, haciéndolo fluido, profesional y bien estructurado con viñetas limpias sin omitir ningún concepto clave.",
    ortografia: "Corrige minuciosamente todas las faltas de ortografía, acentuación, puntuación y concordancia gramatical de este apunte. Devuelve únicamente el texto corregido.",
    expandir: "Explica a fondo y complementa los conceptos clave de este apunte con definiciones claras y ejemplos didácticos para facilitar el estudio."
};

const _HTML_BOTON_IA_NOTA_DEFAULT = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2zm7 12l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3zM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15z"/></svg><span>IA</span>';

async function _resolverInstruccionIANota(accion) {
    if (accion === 'custom') {
        const peticion = await liraPrompt("¿Qué deseas que la IA haga sobre esta nota?", "Resume los puntos principales", "editar");
        return (peticion && peticion.trim()) ? peticion.trim() : null;
    }
    return _INSTRUCCIONES_IA_NOTA[accion] || "";
}

function _restaurarBtnIANota(btnIA, textoOriginal) {
    if (!btnIA) return;
    btnIA.innerHTML = textoOriginal;
    btnIA.disabled = false;
}

async function _invocarIANotaBackend(textoNota, instruccion, accion) {
    if (typeof eel === 'undefined' || !eel.notas_procesar_con_ia) return null;
    const res = await eel.notas_procesar_con_ia(textoNota, instruccion, accion)();
    if (res && res.exito && res.resultado) return res.resultado;
    if (res && res.error) {
        console.warn("[Notas IA] Error al procesar con IA:", res.error);
        await liraAlert("Error de IA: " + res.error, "advertencia");
    }
    return null;
}

function _aplicarResultadoIANotaEnEditor(editor, accion, htmlResultado, esRapida) {
    if (accion === 'mejorar' || accion === 'ortografia') {
        editor.innerHTML = htmlResultado;
    } else if (accion === 'expandir') {
        editor.innerHTML = editor.innerHTML + `<br><hr><h3>💡 Explicación de Conceptos</h3>` + htmlResultado;
    } else {
        editor.innerHTML = editor.innerHTML + `<br><hr>` + htmlResultado;
    }
    if (!esRapida && window.notaSeleccionadaActual) {
        window.notaSeleccionadaActual.contenido = editor.innerHTML;
    }
}

async function ejecutarAccionIANota(accion, editorId, tituloInputId) {
    document.querySelectorAll('.menu-ia-nota-popup').forEach(m => m.style.display = 'none');

    const editor = document.getElementById(editorId);
    const esRapida = editorId === 'nota-rapida-editor-content';
    const btnIA = document.getElementById(esRapida ? 'btn-ia-nota-rapida' : 'btn-ia-nota-general');
    const textoNota = (editor?.innerText || editor?.textContent || '').trim();

    if (!textoNota) {
        await liraAlert("La nota está vacía. Escribe o dicta contenido para que la IA pueda trabajar sobre ella.", "info");
        return;
    }

    const instruccion = await _resolverInstruccionIANota(accion);
    if (instruccion === null) return;

    const textoBotonOriginal = btnIA ? btnIA.innerHTML : _HTML_BOTON_IA_NOTA_DEFAULT;
    if (btnIA) {
        btnIA.innerHTML = `⏳ Procesando...`;
        btnIA.disabled = true;
    }

    try {
        const textoGenerado = await _invocarIANotaBackend(textoNota, instruccion, accion);
        if (textoGenerado) {
            _aplicarResultadoIANotaEnEditor(editor, accion, formatearMarkdownParaNotaHTML(textoGenerado), esRapida);
            if (btnIA) btnIA.innerHTML = `✅ ¡Listo!`;
            setTimeout(() => _restaurarBtnIANota(btnIA, textoBotonOriginal), 1200);
        } else {
            await liraAlert("No se pudo procesar la nota con la IA. Asegúrate de tener Ollama activo o una API Key configurada en Ajustes > Inteligencia Artificial.", "ia");
            _restaurarBtnIANota(btnIA, textoBotonOriginal);
        }
    } catch (e) {
        console.error('[Notas IA] Error al procesar nota con IA:', e);
        await liraAlert("Error al procesar con IA: " + e.message, "error");
        _restaurarBtnIANota(btnIA, textoBotonOriginal);
    }
}



// --- CONFIGURACIÓN DE CARPETA OBSIDIAN / LOCAL ---
async function cambiarCarpetaNotasDialogo() {
    try {
        const res = await eel.notas_seleccionar_carpeta_dialogo(window.rutaNotasPersonalizada || "")();
        if (res && res.exito && res.ruta) {
            window.rutaNotasPersonalizada = res.ruta;
            if (typeof guardarTodosAjustes === 'function') {
                guardarTodosAjustes(false);
            }
            await cargarNotasDesdeBackend();
        }
    } catch(e) {
        console.error('[Notas] Error al cambiar carpeta de notas:', e);
    }
}

async function abrirCarpetaNotasExplorador() {
    try {
        await eel.notas_abrir_carpeta_explorador(window.rutaNotasPersonalizada || "")();
    } catch(e) {
        console.error('[Notas] Error al abrir carpeta de notas en explorador:', e);
    }
}

// ==========================================================================
// 3. DICTADO POR VOZ Y TRANSCRIPCIÓN (SPEECH-TO-TEXT)
// ==========================================================================

let recognitionInstancia = null;
let reconociendoVozActivo = false;
let editorDictadoActualId = null;
let btnDictadoActualId = null;

async function toggleDictadoVoz(editorId = 'nota-editor-content', btnId = 'btn-dictar-nota-general') {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        await liraAlert("Tu navegador o sistema no tiene habilitado el reconocimiento de voz Web Speech.", "mic");
        return;
    }

    if (reconociendoVozActivo) {
        detenerDictadoVoz();
        return;
    }

    iniciarDictadoVoz(editorId, btnId);
}

function _actualizarEstadoBtnDictado(btn, grabando) {
    if (!btn) return;
    btn.classList.toggle('grabando', grabando);
    btn.title = grabando ? "🎙️ Escuchando... Clic para detener" : "Dictar con Micrófono";
    const spanTxt = btn.querySelector('.btn-mic-txt');
    if (spanTxt) spanTxt.innerText = grabando ? "Detener" : "Dictar";
}

function _resolverIdiomaDictado() {
    if (typeof idiomaActual !== 'undefined' && idiomaActual && idiomaActual.startsWith('en')) {
        return 'en-US';
    }
    return 'es-ES';
}

function _onEndDictadoVoz() {
    if (!reconociendoVozActivo) {
        detenerDictadoVoz();
        return;
    }
    try {
        recognitionInstancia.start();
    } catch (e) {
        detenerDictadoVoz();
    }
}

function iniciarDictadoVoz(editorId, btnId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
        if (recognitionInstancia) {
            try { recognitionInstancia.stop(); } catch (e) {}
        }

        recognitionInstancia = new SpeechRecognition();
        recognitionInstancia.continuous = true;
        recognitionInstancia.interimResults = false;
        recognitionInstancia.lang = _resolverIdiomaDictado();

        editorDictadoActualId = editorId;
        btnDictadoActualId = btnId;
        const btn = document.getElementById(btnId);

        recognitionInstancia.onstart = () => {
            reconociendoVozActivo = true;
            _actualizarEstadoBtnDictado(btn, true);
        };

        recognitionInstancia.onresult = (event) => {
            const transcript = event.results[event.resultIndex][0].transcript.trim();
            if (transcript) insertarTextoEnEditor(editorId, transcript);
        };

        recognitionInstancia.onerror = async (event) => {
            console.warn('[Dictado] Error de reconocimiento:', event.error);
            if (event.error === 'not-allowed') {
                await liraAlert("Permiso de micrófono denegado. Permite el acceso al micrófono para usar el dictado.", "mic");
            }
            detenerDictadoVoz();
        };

        recognitionInstancia.onend = _onEndDictadoVoz;
        recognitionInstancia.start();
    } catch (e) {
        console.error('[Dictado] Error al iniciar reconocimiento:', e);
        detenerDictadoVoz();
    }
}

function detenerDictadoVoz() {
    reconociendoVozActivo = false;
    if (recognitionInstancia) {
        try { recognitionInstancia.stop(); } catch (e) {}
        recognitionInstancia = null;
    }

    if (btnDictadoActualId) {
        _actualizarEstadoBtnDictado(document.getElementById(btnDictadoActualId), false);
    }
}

function insertarTextoEnEditor(editorId, texto) {
    const editor = document.getElementById(editorId);
    if (!editor) return;
    editor.focus();

    // Formatear mayúscula inicial
    const textoFormateado = texto.charAt(0).toUpperCase() + texto.slice(1);

    // Si el editor ya tiene texto y no termina en espacio/salto de línea, añadir espacio
    const contenidoActual = editor.innerHTML.trim();
    if (contenidoActual === "" || contenidoActual === "<br>") {
        editor.innerHTML = textoFormateado + ". ";
    } else {
        editor.innerHTML = editor.innerHTML + " " + textoFormateado + ". ";
    }

    // Mover scroll al final del editor
    editor.scrollTop = editor.scrollHeight;

    // Disparar sincronización si es el editor general
    if (editorId === 'nota-editor-content' && window.notaSeleccionadaActual) {
        window.notaSeleccionadaActual.contenido = editor.innerHTML;
    }
}

