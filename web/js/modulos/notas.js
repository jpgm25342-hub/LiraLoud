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

async function guardarNotaRapida() {
    const inpTitulo = document.getElementById('nota-rapida-titulo-input');
    const inpClasif = document.getElementById('nota-rapida-clasif-input');
    const inpPag = document.getElementById('nota-rapida-pagina');
    const editor = document.getElementById('nota-rapida-editor-content');
    const btnSave = document.getElementById('btn-guardar-nota-rapida');
    
    if (!inpTitulo || !editor) return;
    
    const titulo = inpTitulo.value.trim() || ("Nota Pág " + (inpPag?.value || 1));
    const clasificacion = (inpClasif?.value.trim()) || "General";
    const pagina = parseInt(inpPag?.value || 1) || 1;
    const libro = obtenerNombreLibroActivo();
    const contenido = editor.innerHTML.trim();
    
    if (!contenido && !titulo) {
        await liraAlert("Escribe contenido o un título para tu nota.", "📝");
        return;
    }
    
    const notaData = {
        titulo: titulo,
        clasificacion: clasificacion,
        pagina: pagina,
        libro: libro,
        contenido: contenido,
        fecha_creacion: null,
        ruta_absoluta: null
    };
    
    try {
        if (btnSave) btnSave.innerText = "⏳ Guardando...";
        const res = await eel.notas_guardar(notaData, window.rutaNotasPersonalizada || "")();
        if (res && res.exito) {
            if (btnSave) {
                btnSave.innerText = "✅ Guardada";
                setTimeout(() => {
                    if (btnSave) btnSave.innerText = "Guardar";
                    cerrarPanelNotaRapida();
                }, 700);
            }
            // Refrescar lista si el gestor general se abre después
            cargarNotasDesdeBackend();
        } else {
            await liraAlert("Error al guardar nota: " + (res?.error || "Error desconocido"), "⚠️");
            if (btnSave) btnSave.innerText = "Guardar";
        }
    } catch(e) {
        console.error('[Notas] Error al guardar nota rápida:', e);
        if (btnSave) btnSave.innerText = "Guardar";
    }
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
        await liraAlert("La nota actual está vacía. Escribe contenido antes de enviarla a la IA.", "ℹ️");
        return;
    }
    
    const promptParaIA = `[NOTA de Apuntes - ${titulo} | Pág. ${pag} | Área: ${clasif}]\n\n${textoNota}\n\nPregunta / Instrucción: Por favor analiza, resume y explica los puntos clave de este apunte.`;
    
    cerrarPanelNotaRapida();
    if (typeof abrirModalIA === 'function') {
        abrirModalIA();
        setTimeout(() => {
            const inputChat = document.getElementById('ia-input-chat');
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
    if (badgeLibro) badgeLibro.innerText = libroActual ? `📖 ${libroActual}` : '🌐 Todas las notas';
    
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
async function cargarNotasDesdeBackend() {
    try {
        if (typeof eel === 'undefined' || !eel.notas_listar) return;
        
        const libroActual = obtenerNombreLibroActivo();
        const pagActual = (typeof paginaActual !== 'undefined' && paginaActual) ? paginaActual : 1;
        
        let filtroLibro = null;
        let filtroPag = null;
        
        if (window.filtroNotasModo === 'pagina_actual') {
            filtroLibro = libroActual;
            filtroPag = pagActual;
        } else if (window.filtroNotasModo === 'todo_libro') {
            filtroLibro = libroActual;
            filtroPag = null;
        } else {
            filtroLibro = null;
            filtroPag = null;
        }
        
        const res = await eel.notas_listar(
            window.rutaNotasPersonalizada || "",
            filtroLibro,
            filtroPag,
            window.filtroNotasClasificacion,
            window.filtroNotasBusqueda
        )();
        
        if (res && res.exito) {
            window.notasLista = res.notas || [];
            window.rutaNotasBaseActual = res.ruta_base || "";
            
            const lblRuta = document.getElementById('notas-ruta-carpeta-lbl');
            if (lblRuta) lblRuta.innerText = window.rutaNotasBaseActual;
            
            renderizarSidebarFiltros();
            renderizarListaNotas();
            
            if (window.notasLista.length > 0) {
                const existe = window.notasLista.find(n => window.notaSeleccionadaActual && n.ruta_absoluta === window.notaSeleccionadaActual.ruta_absoluta);
                if (existe) {
                    seleccionarNota(existe);
                } else {
                    seleccionarNota(window.notasLista[0]);
                }
            } else {
                crearNuevaNota();
            }
        }
    } catch(e) {
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
        
        container.innerHTML = `
            <button class="notas-clasif-item ${window.filtroNotasClasificacion === 'TODAS' ? 'activo' : ''}" onclick="filtrarNotasPorClasificacion('TODAS')">
                <span>📁 Todas las áreas</span>
                <span class="notas-badge">${window.notasLista.length}</span>
            </button>
        `;
        
        clasifs.forEach(c => {
            const count = window.notasLista.filter(n => (n.clasificacion || 'General').toLowerCase() === c.toLowerCase()).length;
            const btn = document.createElement('button');
            btn.className = `notas-clasif-item ${window.filtroNotasClasificacion.toLowerCase() === c.toLowerCase() ? 'activo' : ''}`;
            btn.onclick = () => filtrarNotasPorClasificacion(c);
            btn.innerHTML = `
                <span>🏷️ ${c}</span>
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
                <p>📝 No hay notas con este filtro.</p>
                <button class="notas-btn-crear" onclick="crearNuevaNota()" style="margin: 10px auto;">+ Crear Primera Nota</button>
            </div>
        `;
        return;
    }
    
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
                <span>🏷️ ${n.clasificacion || 'General'}</span>
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
    const inpTitulo = document.getElementById('nota-editor-titulo');
    const inpClasif = document.getElementById('nota-editor-clasif');
    const inpPag = document.getElementById('nota-editor-pagina');
    const contentDiv = document.getElementById('nota-editor-content');
    
    if (!inpTitulo || !contentDiv) return;
    
    const titulo = inpTitulo.value.trim() || ("Nota Pág " + (inpPag?.value || 1));
    const clasificacion = (inpClasif?.value.trim()) || "General";
    const pagina = parseInt(inpPag?.value || 1) || 1;
    const libro = (window.notaSeleccionadaActual && window.notaSeleccionadaActual.libro) ? window.notaSeleccionadaActual.libro : obtenerNombreLibroActivo();
    const contenido = contentDiv.innerHTML.trim();
    
    const notaData = {
        titulo: titulo,
        clasificacion: clasificacion,
        pagina: pagina,
        libro: libro,
        contenido: contenido,
        fecha_creacion: window.notaSeleccionadaActual ? window.notaSeleccionadaActual.fecha_creacion : null,
        ruta_absoluta: window.notaSeleccionadaActual ? window.notaSeleccionadaActual.ruta_absoluta : null
    };
    
    const btnSave = document.querySelector('.notas-editor-footer .notas-btn-save');

    try {
        if (btnSave) btnSave.innerText = "⏳ Guardando...";
        const res = await eel.notas_guardar(notaData, window.rutaNotasPersonalizada || "")();
        if (res && res.exito) {
            notaData.ruta_absoluta = res.ruta_absoluta;
            notaData.fecha_modificacion = res.fecha_modificacion;
            window.notaSeleccionadaActual = notaData;
            if (btnSave) {
                btnSave.innerText = "✅ Guardada";
                setTimeout(() => {
                    if (btnSave) btnSave.innerText = "Guardar Nota";
                }, 900);
            }
            await cargarNotasDesdeBackend();
        } else {
            await liraAlert("Error al guardar nota: " + (res?.error || "Error desconocido"), "⚠️");
            if (btnSave) btnSave.innerText = "Guardar Nota";
        }
    } catch(e) {
        console.error('[Notas] Error al guardar nota:', e);
        if (btnSave) btnSave.innerText = "Guardar Nota";
    }
}

async function eliminarNotaActual() {
    if (!window.notaSeleccionadaActual || !window.notaSeleccionadaActual.ruta_absoluta) {
        crearNuevaNota();
        return;
    }
    
    if (!await liraConfirm(`¿Deseas eliminar permanentemente la nota "${window.notaSeleccionadaActual.titulo}"?`, '🗑️')) {
        return;
    }
    
    try {
        const res = await eel.notas_eliminar(window.notaSeleccionadaActual.ruta_absoluta, window.rutaNotasPersonalizada || "")();
        if (res && res.exito) {
            window.notaSeleccionadaActual = null;
            await cargarNotasDesdeBackend();
        } else {
            await liraAlert("Error al eliminar nota: " + (res?.error || "No se pudo eliminar"), "⚠️");
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

// --- FORMATEO EN EDITOR ENRIQUECIDO Y ESTADOS ACTIVOS ---
function aplicarFormatoNota(comando, valor = null, targetEditorId = 'nota-editor-content') {
    const editor = document.getElementById(targetEditorId);
    if (!editor) return;
    editor.focus();
    
    if (comando === 'highlight') {
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
}

// Enlazar listeners para detectar cursor y selección
document.addEventListener('selectionchange', () => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.id === 'nota-editor-content' || activeEl.id === 'nota-rapida-editor-content')) {
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

async function ejecutarAccionIANota(accion, editorId, tituloInputId) {
    // Cerrar popups de IA
    document.querySelectorAll('.menu-ia-nota-popup').forEach(m => m.style.display = 'none');

    const editor = document.getElementById(editorId);
    const inpTitulo = document.getElementById(tituloInputId);
    const esRapida = editorId === 'nota-rapida-editor-content';
    const btnIA = document.getElementById(esRapida ? 'btn-ia-nota-rapida' : 'btn-ia-nota-general');
    
    const titulo = inpTitulo?.value.trim() || 'Nota';
    const textoNota = (editor?.innerText || editor?.textContent || '').trim();

    if (!textoNota) {
        await liraAlert("La nota está vacía. Escribe o dicta contenido para que la IA pueda trabajar sobre ella.", "ℹ️");
        return;
    }

    let instruccion = "";
    if (accion === 'mejorar') {
        instruccion = "Mejora la redacción y claridad de este apunte, haciéndolo fluido, profesional y bien estructurado con viñetas limpias sin omitir ningún concepto clave.";
    } else if (accion === 'ortografia') {
        instruccion = "Corrige minuciosamente todas las faltas de ortografía, acentuación, puntuación y concordancia gramatical de este apunte. Devuelve únicamente el texto corregido.";
    } else if (accion === 'expandir') {
        instruccion = "Explica a fondo y complementa los conceptos clave de este apunte con definiciones claras y ejemplos didácticos para facilitar el estudio.";
    } else if (accion === 'custom') {
        const peticion = await liraPrompt("¿Qué deseas que la IA haga sobre esta nota?", "Resume los puntos principales", "✍️");
        if (!peticion || !peticion.trim()) return;
        instruccion = peticion.trim();
    }

    const textoBotonOriginal = btnIA ? btnIA.innerHTML : "✨ IA";
    if (btnIA) {
        btnIA.innerHTML = `⏳ Procesando...`;
        btnIA.disabled = true;
    }

    try {
        let textoGenerado = null;

        if (typeof eel !== 'undefined' && eel.notas_procesar_con_ia) {
            const res = await eel.notas_procesar_con_ia(textoNota, instruccion, accion)();
            if (res && res.exito && res.resultado) {
                textoGenerado = res.resultado;
            } else if (res && res.error) {
                console.warn("[Notas IA] Error al procesar con IA:", res.error);
                await liraAlert("Error de IA: " + res.error, "⚠️");
            }
        }

        if (textoGenerado) {
            const htmlResultado = formatearMarkdownParaNotaHTML(textoGenerado);
            
            if (accion === 'mejorar' || accion === 'ortografia') {
                // Reemplazar el texto in-situ directamente
                editor.innerHTML = htmlResultado;
            } else if (accion === 'expandir') {
                // Insertar al final con título
                editor.innerHTML = editor.innerHTML + `<br><hr><h3>💡 Explicación de Conceptos</h3>` + htmlResultado;
            } else {
                // Petición personalizada: anexar resultado
                editor.innerHTML = editor.innerHTML + `<br><hr>` + htmlResultado;
            }

            // Sincronizar nota seleccionada si está en el gestor general
            if (!esRapida && window.notaSeleccionadaActual) {
                window.notaSeleccionadaActual.contenido = editor.innerHTML;
            }

            if (btnIA) btnIA.innerHTML = `✅ ¡Listo!`;
            setTimeout(() => {
                if (btnIA) {
                    btnIA.innerHTML = textoBotonOriginal;
                    btnIA.disabled = false;
                }
            }, 1200);
        } else {
            await liraAlert("No se pudo procesar la nota con la IA. Asegúrate de tener Ollama activo o una API Key configurada en Ajustes > Inteligencia Artificial.", "🤖");
            if (btnIA) {
                btnIA.innerHTML = textoBotonOriginal;
                btnIA.disabled = false;
            }
        }
    } catch(e) {
        console.error('[Notas IA] Error al procesar nota con IA:', e);
        await liraAlert("Error al procesar con IA: " + e.message, "❌");
        if (btnIA) {
            btnIA.innerHTML = textoBotonOriginal;
            btnIA.disabled = false;
        }
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
        await liraAlert("Tu navegador o sistema no tiene habilitado el reconocimiento de voz Web Speech.", "🎤");
        return;
    }

    if (reconociendoVozActivo) {
        detenerDictadoVoz();
        return;
    }

    iniciarDictadoVoz(editorId, btnId);
}

function iniciarDictadoVoz(editorId, btnId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
        if (recognitionInstancia) {
            try { recognitionInstancia.stop(); } catch(e){}
        }

        recognitionInstancia = new SpeechRecognition();
        recognitionInstancia.continuous = true;
        recognitionInstancia.interimResults = false;

        // Determinar idioma (por defecto español latinoamericano/españa)
        let langCode = 'es-ES';
        if (typeof idiomaActual !== 'undefined' && idiomaActual) {
            langCode = idiomaActual.startsWith('en') ? 'en-US' : 'es-ES';
        }
        recognitionInstancia.lang = langCode;

        editorDictadoActualId = editorId;
        btnDictadoActualId = btnId;

        const btn = document.getElementById(btnId);
        const editor = document.getElementById(editorId);

        recognitionInstancia.onstart = () => {
            reconociendoVozActivo = true;
            if (btn) {
                btn.classList.add('grabando');
                btn.title = "🎙️ Escuchando... Clic para detener";
                const spanTxt = btn.querySelector('.btn-mic-txt');
                if (spanTxt) spanTxt.innerText = "Detener";
            }
        };

        recognitionInstancia.onresult = (event) => {
            const current = event.resultIndex;
            const transcript = event.results[current][0].transcript.trim();
            if (transcript) {
                insertarTextoEnEditor(editorId, transcript);
            }
        };

        recognitionInstancia.onerror = async (event) => {
            console.warn('[Dictado] Error de reconocimiento:', event.error);
            if (event.error === 'not-allowed') {
                await liraAlert("Permiso de micrófono denegado. Permite el acceso al micrófono para usar el dictado.", "🎙️");
            }
            detenerDictadoVoz();
        };

        recognitionInstancia.onend = () => {
            if (reconociendoVozActivo) {
                // Si se corta por pausa breve del usuario, reiniciar automáticamente
                try {
                    recognitionInstancia.start();
                } catch(e) {
                    detenerDictadoVoz();
                }
            } else {
                detenerDictadoVoz();
            }
        };

        recognitionInstancia.start();
    } catch(e) {
        console.error('[Dictado] Error al iniciar reconocimiento:', e);
        detenerDictadoVoz();
    }
}

function detenerDictadoVoz() {
    reconociendoVozActivo = false;
    if (recognitionInstancia) {
        try { recognitionInstancia.stop(); } catch(e){}
        recognitionInstancia = null;
    }

    if (btnDictadoActualId) {
        const btn = document.getElementById(btnDictadoActualId);
        if (btn) {
            btn.classList.remove('grabando');
            btn.title = "Dictar con Micrófono";
            const spanTxt = btn.querySelector('.btn-mic-txt');
            if (spanTxt) spanTxt.innerText = "Dictar";
        }
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

