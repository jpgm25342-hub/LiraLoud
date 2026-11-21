/* LiraLoud
 * Módulo de Edición In-Place para PDFs (Estilo Acrobat Reader)
 */

window.modoEditorTextoActivo = false;
let bloquesEditor = [];
let dragInfo = null;

// Resize handler para recalcular overlays al cambiar tamaño de ventana
let editorResizeHandler = null;

function toggleModoEditorTexto(activo) {
    console.log('[Editor] toggleModo activo=', activo);
    console.log('[Editor] rutaPDFActual=', typeof rutaPDFActual !== 'undefined' ? rutaPDFActual : 'NO DEFINIDA');
    console.log('[Editor] paginaActual=', typeof paginaActual !== 'undefined' ? paginaActual : 'NO DEFINIDA');
    window.modoEditorTextoActivo = activo;
    const btn = document.getElementById('btn-text-editor');
    const btnZen = document.getElementById('btn-edit-pdf');
    const btnGroup = document.getElementById('group-text-editor');
    const capa = document.getElementById('lira-pdf-text-editor-layer');
    
    if (btnGroup) btnGroup.classList.toggle('active', activo);
    if (btn) {
        btn.classList.toggle('activo', activo);
        btn.classList.toggle('active', activo);
    }
    if (btnZen) {
        btnZen.classList.toggle('activo', activo);
    }

    // Actualizar estilo subrayado activo en botones de Modo Zen (Ctrl+U)
    document.querySelectorAll('.zen-item-editor-texto').forEach(el => {
        el.classList.toggle('tool-active-underline', activo);
    });

    if (activo) {
        if (capa) capa.classList.add('activo');
        
        // Desactivar otros modos
        if (typeof toggleModoBorrador === 'function' && window.modoBorradorActivo) toggleModoBorrador(false);
        if (typeof toggleModoSubrayador === 'function' && window.modoSubrayadorActivo) toggleModoSubrayador(false);
        if (typeof activarModoCuadroTexto === 'function' && window.modoCuadroTextoActivo) activarModoCuadroTexto(false);
        if (typeof toggleCapturaCorte === 'function' && window.capturandoCorte) toggleCapturaCorte(false);
        const chkLimites = document.getElementById('chk-dibujar-limites');
        if (chkLimites && chkLimites.checked) {
            chkLimites.checked = false;
            if (typeof toggleDibujoLimites === 'function') toggleDibujoLimites(false);
        }

        renderizarBloquesEditor();

        // Registrar handler de resize para recalcular posiciones
        if (!editorResizeHandler) {
            editorResizeHandler = () => {
                if (window.modoEditorTextoActivo) {
                    renderizarBloquesEditor();
                }
            };
            window.addEventListener('resize', editorResizeHandler);
        }
    } else {
        if (capa) {
            capa.classList.remove('activo');
            capa.innerHTML = '';
        }
        cerrarEditorTexto();

        // Limpiar handler de resize
        if (editorResizeHandler) {
            window.removeEventListener('resize', editorResizeHandler);
            editorResizeHandler = null;
        }
    }
}

async function renderizarBloquesEditor() {
    console.log('[Editor] Iniciando renderizarBloquesEditor');
    if (typeof rutaPDFActual === 'undefined' || !rutaPDFActual) { console.error('[Editor] Abortado: rutaPDFActual es inválida'); return; }
    const capa = document.getElementById('lira-pdf-text-editor-layer');
    if (!capa) return;
    capa.innerHTML = '';

    try {
        console.log('[Editor] Pidiendo bloques a python...');
        let res = await eel.obtener_bloques_texto_pagina(rutaPDFActual, paginaActual)();
        console.log('[Editor] Respuesta bloques:', res);
        if (res && res.success && res.bloques) {
            bloquesEditor = res.bloques;
            bloquesEditor.forEach(b => {
                let r = calcRectCanvas(b.bbox);
                console.log('[Editor] Rect calculado para span:', r);
                let div = document.createElement('div');
                div.className = 'bbox-overlay';
                // Usar área de clic ampliada para facilitar selección de textos pequeños
                div.style.left = r.clickX + 'px';
                div.style.top = r.clickY + 'px';
                div.style.width = r.clickW + 'px';
                div.style.height = r.clickH + 'px';
                // Guardar rect visual preciso para el editor
                div.dataset.visualX = r.x;
                div.dataset.visualY = r.y;
                div.dataset.visualW = r.w;
                div.dataset.visualH = r.h;

                
                div.onclick = (e) => {
                    e.stopPropagation();
                    // Reconstruir rect visual preciso para el editor
                    const rectVisual = {
                        x: parseFloat(div.dataset.visualX),
                        y: parseFloat(div.dataset.visualY),
                        w: parseFloat(div.dataset.visualW),
                        h: parseFloat(div.dataset.visualH)
                    };
                    abrirEditorTexto(b, rectVisual);
                };
                
                capa.appendChild(div);
            });
        }
    } catch(e) {
        console.error("Error al obtener bloques para edición:", e);
    }
}

function calcRectCanvas(bboxPdf) {
    if (!memoriaLayout[paginaActual.toString()]) return {x:0, y:0, w:0, h:0};

    const wrapper = document.getElementById('pdf-crop-wrapper');
    const canvas = document.getElementById('lienzo-pdf');
    const container = document.getElementById('visor-container');

    if (!wrapper || !canvas || !container) return {x:0, y:0, w:0, h:0};

    const sc = (memoriaLayout[paginaActual.toString()].escala || 1.0) * (typeof nivelZoomPDF !== 'undefined' ? nivelZoomPDF : 1.0);

    const wrapperLeft = wrapper.offsetLeft;
    const wrapperTop = wrapper.offsetTop;
    const canvasLeft = canvas.offsetLeft;
    const canvasTop = canvas.offsetTop;

    const x0 = bboxPdf[0] * sc;
    const y0 = bboxPdf[1] * sc;
    const x1 = bboxPdf[2] * sc;
    const y1 = bboxPdf[3] * sc;

    const w = Math.max(x1 - x0, 1);
    const h = Math.max(y1 - y0, 1);

    const visual = {
        x: wrapperLeft + canvasLeft + x0,
        y: wrapperTop + canvasTop + y0,
        w: w,
        h: h
    };

    const CLICK_MIN = 24;
    const clickW = Math.max(w, CLICK_MIN);
    const clickH = Math.max(h, CLICK_MIN);
    const clickX = visual.x + (w - clickW) / 2;
    const clickY = visual.y + (h - clickH) / 2;

    return {
        ...visual,
        clickX: clickX,
        clickY: clickY,
        clickW: clickW,
        clickH: clickH
    };
}

function pdfRectFromCanvas(rectVisual) {
    if (!memoriaLayout[paginaActual.toString()]) return [0,0,0,0];

    const wrapper = document.getElementById('pdf-crop-wrapper');
    const canvas = document.getElementById('lienzo-pdf');
    const container = document.getElementById('visor-container');

    if (!wrapper || !canvas || !container) return [0,0,0,0];

    const sc = (memoriaLayout[paginaActual.toString()].escala || 1.0) * (typeof nivelZoomPDF !== 'undefined' ? nivelZoomPDF : 1.0);

    const containerRect = container.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const canvasLeft = parseFloat(canvas.style.left) || 0;
    const canvasTop = parseFloat(canvas.style.top) || 0;

    const wrapperLeft = wrapperRect.left - containerRect.left;
    const wrapperTop = wrapperRect.top - containerRect.top;

    const x0 = (rectVisual.x - wrapperLeft - canvasLeft) / sc;
    const y0 = (rectVisual.y - wrapperTop - canvasTop) / sc;
    const x1 = (rectVisual.x + rectVisual.w - wrapperLeft - canvasLeft) / sc;
    const y1 = (rectVisual.y + rectVisual.h - wrapperTop - canvasTop) / sc;

    return [x0, y0, x1, y1];
}

function abrirEditorTexto(bloquePdf, rectVisual) {
    cerrarEditorTexto();
    const capa = document.getElementById('lira-pdf-text-editor-layer');
    if (!capa) return;

    let editor = document.createElement('div');
    editor.id = 'lira-editor-popup';
    editor.className = 'editor-wrapper';
    
    const containerRect = document.getElementById('visor-container').getBoundingClientRect();
    let left = Math.min(rectVisual.x, containerRect.width - 600);
    let top = Math.max(10, rectVisual.y - 36); 
    let w = Math.max(600, rectVisual.w + 20);
    let h = Math.max(200, rectVisual.h + 60);

    editor.style.left = left + 'px';
    editor.style.top = top + 'px';
    editor.style.width = w + 'px';
    editor.style.height = h + 'px';
    editor.style.maxWidth = (containerRect.width - 20) + 'px';
    editor.style.maxHeight = (containerRect.height - 20) + 'px';

    let hasUnsavedChanges = false;
    const originalText = bloquePdf.texto;

    let barra = document.createElement('div');
    barra.className = 'barra-superior';
    
    let handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.title = "Arrastrar para mover";

    let toolbar = document.createElement('div');
    toolbar.className = 'editor-toolbar';
    toolbar.style.display = 'flex';
    toolbar.style.gap = '4px';
    toolbar.style.flexWrap = 'wrap';
    toolbar.style.padding = '4px 6px';
    toolbar.style.background = '#21262d';
    toolbar.style.borderBottom = '1px solid #30363d';
    toolbar.style.flexShrink = '0';

    let selFuente = document.createElement('select');
    selFuente.className = 'editor-font-family';
    selFuente.title = "Familia de fuente";
    ['helv', 'tiro', 'cour', 'symb', 'zadb', 'zb', 'zi'].forEach(f => {
        let opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f === 'helv' ? 'Helvetica' : f === 'tiro' ? 'Times' : f === 'cour' ? 'Courier' : f === 'symb' ? 'Symbol' : f === 'zadb' ? 'ZapfDingbats' : f.toUpperCase();
        if (f === bloquePdf.fuente) opt.selected = true;
        selFuente.appendChild(opt);
    });

    let inpTamano = document.createElement('input');
    inpTamano.type = 'number';
    inpTamano.className = 'editor-font-size';
    inpTamano.value = bloquePdf.tamano.toFixed(1);
    inpTamano.min = '4';
    inpTamano.max = '72';
    inpTamano.step = '0.5';
    inpTamano.style.width = '55px';
    inpTamano.title = "Tamaño";

    let inpColor = document.createElement('input');
    inpColor.type = 'color';
    inpColor.className = 'editor-font-color';
    inpColor.value = rgbPdfToHex(bloquePdf.color);
    inpColor.title = "Color de fuente";

    let btnColorApply = document.createElement('button');
    btnColorApply.type = 'button';
    btnColorApply.className = 'editor-format-btn color-apply';
    btnColorApply.innerHTML = 'A';
    btnColorApply.title = "Aplicar color a selección (Ctrl+Shift+C)";
    btnColorApply.style.fontSize = '10px';
    btnColorApply.style.width = '28px';
    btnColorApply.style.height = '24px';
    btnColorApply.style.background = inpColor.value;
    btnColorApply.style.border = '1px solid #3d444d';
    btnColorApply.style.color = '#e6edf3';

    let btnBold = createFormatBtn('B', 'bold', 'Negrita (Ctrl+B)', bloquePdf.flags & 16);
    let btnItalic = createFormatBtn('I', 'italic', 'Cursiva (Ctrl+I)', bloquePdf.flags & 2);
    let btnUnderline = createFormatBtn('U', 'underline', 'Subrayado (Ctrl+U)', false);

    let btnG = document.createElement('button');
    btnG.className = 'btn-guardar';
    btnG.innerText = 'Guardar';
    btnG.style.marginLeft = 'auto';

    let btnCancel = document.createElement('button');
    btnCancel.className = 'btn-cancelar';
    btnCancel.innerText = 'Cancelar';
    btnCancel.style.marginLeft = '4px';
    btnCancel.style.background = '#da3633';
    btnCancel.style.border = '1px solid #f85149';
    btnCancel.style.color = 'white';
    btnCancel.style.borderRadius = '4px';
    btnCancel.style.padding = '2px 10px';
    btnCancel.style.fontSize = '11px';
    btnCancel.style.fontWeight = '600';
    btnCancel.style.cursor = 'pointer';
    btnCancel.style.display = 'none';

    toolbar.appendChild(selFuente);
    toolbar.appendChild(inpTamano);
    toolbar.appendChild(inpColor);
    toolbar.appendChild(btnColorApply);
    toolbar.appendChild(btnBold);
    toolbar.appendChild(btnItalic);
    toolbar.appendChild(btnUnderline);

    barra.appendChild(handle);
    barra.appendChild(toolbar);
    barra.appendChild(btnG);
    barra.appendChild(btnCancel);

    let editorArea = document.createElement('div');
    editorArea.id = 'editor-contenteditable';
    editorArea.className = 'editor-contenteditable';
    editorArea.contentEditable = 'true';
    editorArea.spellcheck = false;
    editorArea.style.flex = '1';
    editorArea.style.padding = '10px';
    editorArea.style.fontFamily = getFontFamilyName(selFuente.value);
    editorArea.style.fontSize = (bloquePdf.tamano || 12) + 'px';
    editorArea.style.lineHeight = '1.5';
    editorArea.style.color = inpColor.value;
    editorArea.style.background = 'var(--editor-bg, #161b22)';
    editorArea.style.overflow = 'auto';
    editorArea.style.outline = 'none';
    editorArea.style.whiteSpace = 'pre-wrap';
    editorArea.style.wordBreak = 'break-word';
    editorArea.innerText = bloquePdf.texto;
    editorArea.dataset.fontFamily = selFuente.value;
    editorArea.dataset.fontSize = inpTamano.value;
    editorArea.dataset.fontColor = inpColor.value;

    function updateEditorTheme() {
        const isDark = document.body.classList.contains('ui-dark-mode');
        if (isDark) {
            editorArea.style.background = '#161b22';
            editorArea.style.color = editorArea.style.color || '#f0f6fc';
        } else {
            editorArea.style.background = '#ffffff';
            editorArea.style.color = editorArea.style.color || '#1f2937';
        }
    }
    const themeObserver = new MutationObserver(updateEditorTheme);
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    updateEditorTheme();

    let tooltip = document.createElement('div');
    tooltip.className = 'editor-tooltip';
    tooltip.innerText = `Fuente: ${selFuente.options[selFuente.selectedIndex].text} | Tamaño: ${inpTamano.value} | Color: ${inpColor.value}`;

    function updateEditorStyles() {
        editorArea.style.fontFamily = getFontFamilyName(selFuente.value);
        editorArea.style.fontSize = inpTamano.value + 'px';
        editorArea.style.color = inpColor.value;
        editorArea.dataset.fontFamily = selFuente.value;
        editorArea.dataset.fontSize = inpTamano.value;
        editorArea.dataset.fontColor = inpColor.value;
    }

    selFuente.addEventListener('change', () => { updateEditorStyles(); updateTooltip(); });
    inpTamano.addEventListener('input', () => { updateEditorStyles(); updateTooltip(); });
    inpColor.addEventListener('input', () => { updateEditorStyles(); updateTooltip(); });

    function applyFormat(cmd, btn) {
        const sel = window.getSelection();
        if (!sel.rangeCount || sel.isCollapsed) return;
        btn.classList.toggle('activo');
        document.execCommand(cmd, false, null);
        updateTooltip();
    }

    function applyColorToSelection(color) {
        const sel = window.getSelection();
        if (!sel.rangeCount || sel.isCollapsed) return false;
        document.execCommand('foreColor', false, color);
        return true;
    }

    btnBold.addEventListener('click', () => applyFormat('bold', btnBold));
    btnItalic.addEventListener('click', () => applyFormat('italic', btnItalic));
    btnUnderline.addEventListener('click', () => applyFormat('underline', btnUnderline));

    btnColorApply.addEventListener('click', () => {
        const color = inpColor.value;
        if (applyColorToSelection(color)) {
            btnColorApply.style.background = color;
            btnColorApply.classList.add('activo');
            setTimeout(() => btnColorApply.classList.remove('activo'), 200);
            updateTooltip();
        }
    });

    inpColor.addEventListener('input', () => {
        const color = inpColor.value;
        btnColorApply.style.background = color;
        const hadSelection = applyColorToSelection(color);
        if (!hadSelection) {
            updateEditorStyles();
        }
        updateTooltip();
    });

    editorArea.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'b') { e.preventDefault(); btnBold.click(); }
            if (e.key === 'i') { e.preventDefault(); btnItalic.click(); }
            if (e.key === 'u') { e.preventDefault(); btnUnderline.click(); }
            if (e.key === 's') { e.preventDefault(); btnG.click(); }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); btnG.click(); }
        }
        if (e.key === 'Escape') {
            if (hasUnsavedChanges) { btnCancel.click(); } else { cerrarEditorTexto(); }
        }
    });

    editorArea.addEventListener('input', () => {
        hasUnsavedChanges = editorArea.innerText !== originalText;
        btnG.innerText = hasUnsavedChanges ? 'Guardar cambios' : 'Guardar';
        btnG.style.background = hasUnsavedChanges ? '#238636' : '';
        btnCancel.style.display = hasUnsavedChanges ? 'inline-block' : 'none';
    });

    function updateTooltip() {
        tooltip.innerText = `Fuente: ${selFuente.options[selFuente.selectedIndex].text} | Tamaño: ${inpTamano.value} | Color: ${inpColor.value} | ${btnBold.classList.contains('activo')?'B ':''}${btnItalic.classList.contains('activo')?'I ':''}${btnUnderline.classList.contains('activo')?'U ':''}`;
    }

    // --- GUARDAR ---
    btnG.onclick = async (e) => {
        e.stopPropagation();
        const ew = parseFloat(editor.style.width);
        const eh = parseFloat(editor.style.height);
        const el = parseFloat(editor.style.left);
        const et = parseFloat(editor.style.top) + 32;

        let rectNewVisual = { x: el, y: et, w: ew, h: eh - 32 };
        let rectPdf = pdfRectFromCanvas(rectNewVisual);

        let flags = 0;
        if (btnBold.classList.contains('activo')) flags |= 16;
        if (btnItalic.classList.contains('activo')) flags |= 2;

        const datosEnvio = {
            id: bloquePdf.id,
            bbox: rectPdf,
            bbox_original: bloquePdf.bbox,
            texto: editorArea.innerText,
            fuente: selFuente.value,
            flags: flags,
            tamano: parseFloat(inpTamano.value),
            color: hexToRgbPdf(inpColor.value)
        };

        btnG.innerText = '...';
        btnG.disabled = true;
        btnCancel.disabled = true;

        try {
            let r = await eel.editar_texto_pdf(rutaPDFActual, paginaActual, datosEnvio)();
            if (r.success) {
                hasUnsavedChanges = false;
                cerrarEditorTexto();
                if (typeof cargarPagina === 'function') {
                    await cargarPagina(paginaActual);
                }
                await renderizarBloquesEditor();
            } else {
                console.error("Error de edición:", r.error);
                if (typeof liraAlert === 'function') await liraAlert("Error guardando cambios.", "⚠️");
                btnG.innerText = 'Guardar';
                btnG.disabled = false;
                btnCancel.disabled = false;
            }
        } catch(err) {
            console.error(err);
            btnG.innerText = 'Guardar';
            btnG.disabled = false;
            btnCancel.disabled = false;
        }
    };

    // --- CANCELAR ---
    btnCancel.onclick = async (e) => {
        e.stopPropagation();
        if (hasUnsavedChanges) {
            if (await liraConfirm('Hay cambios sin guardar. ¿Descartar y cerrar?', '⚠️')) {
                cerrarEditorTexto();
            }
        } else {
            cerrarEditorTexto();
        }
    };

    // --- CLIC DERECHO FUERA PARA CERRAR ---
    editor.addEventListener('contextmenu', async (e) => {
        if (editor.contains(e.target)) return;
        e.preventDefault();
        if (hasUnsavedChanges) {
            if (typeof liraAlert === 'function') await liraAlert('Hay cambios sin guardar. Usa "Guardar" o "Cancelar".', 'ℹ️');
        } else {
            cerrarEditorTexto();
        }
    });

    editor.appendChild(barra);
    editor.appendChild(editorArea);
    editor.appendChild(tooltip);
    capa.appendChild(editor);

    // Focus al editor y cursor al final
    setTimeout(() => {
        editorArea.focus();
        const range = document.createRange();
        range.selectNodeContents(editorArea);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }, 50);

    // Draggable
    handle.onmousedown = (e) => {
        e.preventDefault();
        dragInfo = {
            el: editor,
            startX: e.clientX,
            startY: e.clientY,
            startLeft: parseFloat(editor.style.left) || 0,
            startTop: parseFloat(editor.style.top) || 0
        };
        document.addEventListener('mousemove', dragMouse);
        document.addEventListener('mouseup', dropMouse);
    };
}

// Helper: obtener nombre de familia legible para CSS
function getFontFamilyName(key) {
    const map = { 
        helv: 'Helvetica, Arial, sans-serif', 
        tiro: '"Times New Roman", Times, serif', 
        cour: '"Courier New", Courier, monospace', 
        symb: 'Symbol', 
        zadb: 'ZapfDingbats', 
        zb: 'ZapfDingbats', 
        zi: 'ZapfDingbats' 
    };
    return map[key] || 'Helvetica, Arial, sans-serif';
}

// Helpers para botones de formato
function createFormatBtn(text, className, title, active) {
    let btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `editor-format-btn ${className}` + (active ? ' activo' : '');
    btn.innerText = text;
    btn.title = title;
    btn.style.fontWeight = className === 'bold' ? 'bold' : 'normal';
    btn.style.fontStyle = className === 'italic' ? 'italic' : 'normal';
    btn.style.textDecoration = className === 'underline' ? 'underline' : 'none';
    btn.style.width = '28px';
    btn.style.height = '24px';
    btn.style.fontSize = '11px';
    btn.style.padding = '0';
    btn.style.background = '#2d333b';
    btn.style.border = '1px solid #3d444d';
    btn.style.borderRadius = '3px';
    btn.style.color = '#e6edf3';
    btn.style.cursor = 'pointer';
    return btn;
}

// Convertir color PDF (array [r,g,b] 0-1 o entero 0xRRGGBB) a hex
function rgbPdfToHex(pdfColor) {
    if (!pdfColor) return '#000000';
    if (typeof pdfColor === 'number') {
        const hex = (pdfColor & 0xFFFFFF).toString(16).padStart(6, '0');
        return '#' + hex;
    }
    if (Array.isArray(pdfColor)) {
        const r = Math.round(pdfColor[0] * 255).toString(16).padStart(2, '0');
        const g = Math.round(pdfColor[1] * 255).toString(16).padStart(2, '0');
        const b = Math.round(pdfColor[2] * 255).toString(16).padStart(2, '0');
        return '#' + r + g + b;
    }
    return '#000000';
}

// Convertir hex a array RGB PDF [r, g, b] (0 a 1)
function hexToRgbPdf(hex) {
    if (!hex) return [0, 0, 0];
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return [r, g, b];
}

function dragMouse(e) {
    if (!dragInfo) return;
    const dx = e.clientX - dragInfo.startX;
    const dy = e.clientY - dragInfo.startY;
    dragInfo.el.style.left = (dragInfo.startLeft + dx) + 'px';
    dragInfo.el.style.top = (dragInfo.startTop + dy) + 'px';
}

function dropMouse(e) {
    dragInfo = null;
    document.removeEventListener('mousemove', dragMouse);
    document.removeEventListener('mouseup', dropMouse);
}

function cerrarEditorTexto() {
    const editor = document.getElementById('lira-editor-popup');
    if (editor) editor.remove();
}

// Atajo global: Esc para cerrar editor si no hay cambios
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window.modoEditorTextoActivo) {
        const editor = document.getElementById('lira-editor-popup');
        if (editor) {
            const btnCancel = editor.querySelector('.btn-cancelar');
            if (btnCancel && btnCancel.style.display !== 'none') {
                btnCancel.click();
            } else {
                cerrarEditorTexto();
            }
        } else {
            toggleModoEditorTexto(false);
        }
    }
});

// ==========================================
// MODO CUADRO DE TEXTO (Añadir nuevo texto)
// ==========================================

let modoCuadroTextoActivo = false;

function toggleModoCuadroTexto(activo) {
    modoCuadroTextoActivo = activo;
    const btn = document.getElementById('btn-add-text-box');
    const capa = document.getElementById('lira-pdf-text-editor-layer');
    
    if (btn) btn.classList.toggle('activo', activo);
    
    if (activo) {
        if (capa) capa.classList.add('activo');
        document.getElementById('visor-container').style.cursor = 'crosshair';
        
        // Desactivar modo editor si estaba activo
        if (window.modoEditorTextoActivo) {
            toggleModoEditorTexto(false);
        }
        
        // Listener para crear cuadro al hacer click en el PDF
        const canvas = document.getElementById('lienzo-pdf');
        if (canvas) {
            canvas.addEventListener('click', crearCuadroTextoEnClick);
        }
    } else {
        if (capa) {
            capa.classList.remove('activo');
            capa.innerHTML = '';
        }
        document.getElementById('visor-container').style.cursor = '';
        const canvas = document.getElementById('lienzo-pdf');
        if (canvas) {
            canvas.removeEventListener('click', crearCuadroTextoEnClick);
        }
    }
}

function crearCuadroTextoEnClick(e) {
    if (!modoCuadroTextoActivo) return;
    
    const canvas = document.getElementById('lienzo-pdf');
    const wrapper = document.getElementById('pdf-crop-wrapper');
    const container = document.getElementById('visor-container');
    const capa = document.getElementById('lira-pdf-text-editor-layer');
    
    if (!canvas || !wrapper || !container || !capa) return;
    
    // Coordenadas relativas al wrapper
    const wrapperRect = wrapper.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const canvasLeft = canvas.offsetLeft;
    const canvasTop = canvas.offsetTop;
    const wrapperLeft = wrapperRect.left - containerRect.left;
    const wrapperTop = wrapperRect.top - containerRect.top;
    
    // Posición del click en coordenadas del wrapper
    const clickX = e.clientX - containerRect.left - wrapperLeft - canvasLeft;
    const clickY = e.clientY - containerRect.top - wrapperTop - canvasTop;
    
    // Convertir a coordenadas PDF
    const sc = (memoriaLayout[paginaActual.toString()].escala || 1.0) * (typeof nivelZoomPDF !== 'undefined' ? nivelZoomPDF : 1.0);
    const pdfX = clickX / sc;
    const pdfY = clickY / sc;
    
    // Crear cuadro de texto inicial (100x50 puntos PDF)
    const anchoPdf = 100;
    const altoPdf = 50;
    const bbox = [pdfX, pdfY, pdfX + anchoPdf, pdfY + altoPdf];
    
    // Enviar al backend para crear el cuadro
    eel.crear_cuadro_texto_pdf(rutaPDFActual, paginaActual, bbox)()
        .then(res => {
            if (res.success) {
                // Recargar bloques
                renderizarBloquesEditor();
            } else {
                console.error("Error creando cuadro:", res.error);
            }
        });
}
