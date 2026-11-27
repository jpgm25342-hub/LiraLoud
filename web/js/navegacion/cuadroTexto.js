/* LiraLoud
 * Módulo de Cajas de Texto Flotantes (Estilo Edge)
 */

window.modoCuadroTextoActivo = false;
window.cuadroTextoActivoUI = null;

function activarModoCuadroTexto(activo) {
    if (typeof activo === 'undefined') {
        window.modoCuadroTextoActivo = !window.modoCuadroTextoActivo;
    } else {
        window.modoCuadroTextoActivo = activo;
    }
    
    const btnGroup = document.getElementById('group-text-box');
    if (btnGroup) btnGroup.classList.toggle('active', window.modoCuadroTextoActivo);
    
    const btn = document.getElementById('btn-text-box');
    if (btn) {
        btn.classList.toggle('activo', window.modoCuadroTextoActivo);
        btn.classList.toggle('active', window.modoCuadroTextoActivo);
    }
    
    // Actualizar estilo subrayado activo en botones de Modo Zen (Ctrl+U)
    document.querySelectorAll('.zen-item-cuadro-texto').forEach(el => {
        el.classList.toggle('tool-active-underline', window.modoCuadroTextoActivo);
    });
    
    const container = document.getElementById('visor-container');
    const canvas = document.getElementById('lienzo-pdf');
    const canvasWrapper = document.getElementById('pdf-crop-wrapper') || container;
    const cursorSvg = 'url("data:image/svg+xml;utf8,<svg width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'><path fill-rule=\'evenodd\' clip-rule=\'evenodd\' d=\'M8.25 9C8.25 8.58579 8.58579 8.25 9 8.25H15C15.4142 8.25 15.75 8.58579 15.75 9C15.75 9.41421 15.4142 9.75 15 9.75H12.75V15C12.75 15.4142 12.4142 15.75 12 15.75C11.5858 15.75 11.25 15.4142 11.25 15V9.75H9C8.58579 9.75 8.25 9.41421 8.25 9Z\' fill=\'%232980b9\'></path><path fill-rule=\'evenodd\' clip-rule=\'evenodd\' d=\'M5.85986 3.26307C5.56645 2.5232 4.84432 2 4 2C2.89543 2 2 2.89543 2 4C2 4.84433 2.5232 5.56645 3.26307 5.85986C3.25449 5.90526 3.25 5.9521 3.25 6L3.25 18C3.25 18.0479 3.25449 18.0947 3.26307 18.1401C2.5232 18.4335 2 19.1557 2 20C2 21.1046 2.89543 22 4 22C4.84433 22 5.56645 21.4768 5.85986 20.7369C5.90526 20.7455 5.9521 20.75 6 20.75H18C18.0479 20.75 18.0947 20.7455 18.1401 20.7369C18.4335 21.4768 19.1557 22 20 22C21.1046 22 22 21.1046 22 20C22 19.1557 21.4768 18.4335 20.7369 18.1401C20.7455 18.0947 20.75 18.0479 20.75 18L20.75 6C20.75 5.9521 20.7455 5.90526 20.7369 5.85986C21.4768 5.56645 22 4.84433 22 4C22 2.89543 21.1046 2 20 2C19.1557 2 18.4335 2.5232 18.1401 3.26307C18.0947 3.25449 18.0479 3.25 18 3.25H6C5.9521 3.25 5.90526 3.25449 5.85986 3.26307ZM4.73693 5.85986C4.74551 5.90526 4.75 5.9521 4.75 6L4.75 18C4.75 18.0479 4.74551 18.0947 4.73693 18.1401C5.24875 18.3431 5.65689 18.7512 5.85986 19.2631C5.90526 19.2545 5.9521 19.25 6 19.25H18C18.0479 19.25 18.0947 19.2545 18.1401 19.2631C18.3431 18.7512 18.7512 18.3431 19.2631 18.1401C19.2545 18.0947 19.25 18.0479 19.25 18V6C19.25 5.9521 19.2545 5.90526 19.2631 5.85986C18.7512 5.65689 18.3431 5.24875 18.1401 4.73693C18.0947 4.74551 18.0479 4.75 18 4.75H6C5.9521 4.75 5.90526 4.74551 5.85986 4.73693C5.65689 5.24875 5.24875 5.65689 4.73693 5.85986Z\' fill=\'%232980b9\'></path></svg>") 12 12, crosshair';
    
    if (window.modoCuadroTextoActivo) {
        if (container) {
            container.classList.add('modo-cuadro-texto-activo');
            container.style.cursor = cursorSvg;
        }
        if (canvas) canvas.style.cursor = cursorSvg;
        
        // Desactivar otros modos
        if (typeof toggleModoEditorTexto === 'function' && window.modoEditorTextoActivo) toggleModoEditorTexto(false);
        if (typeof toggleModoBorrador === 'function' && window.modoBorradorActivo) toggleModoBorrador(false);
        if (typeof toggleModoSubrayador === 'function' && window.modoSubrayadorActivo) toggleModoSubrayador(false);
        if (typeof toggleModoRecorteExtraccion === 'function' && window.modoRecorteActivo) toggleModoRecorteExtraccion(false);
        if (typeof toggleModoMoverElementos === 'function' && window.modoMoverElementosActivo) toggleModoMoverElementos(false);
        if (typeof toggleCapturaCorte === 'function' && window.capturandoCorte) toggleCapturaCorte(false);
        const chkLimites = document.getElementById('chk-dibujar-limites');
        if (chkLimites && chkLimites.checked) {
            chkLimites.checked = false;
            if (typeof toggleDibujoLimites === 'function') toggleDibujoLimites(false);
        }
        
        if (canvasWrapper) {
            canvasWrapper.addEventListener('mousedown', iniciarCreacionCuadroTexto);
        }
    } else {
        if (container) {
            container.classList.remove('modo-cuadro-texto-activo');
            container.style.cursor = '';
        }
        if (canvas) {
            canvas.style.cursor = '';
        }
        if (canvasWrapper) {
            canvasWrapper.removeEventListener('mousedown', iniciarCreacionCuadroTexto);
        }
    }
    
    window.textoEditandoActivo = window.modoCuadroTextoActivo;
    if (typeof window.actualizarEstadoInteractivoCapaSoloLectura === 'function') {
        window.actualizarEstadoInteractivoCapaSoloLectura();
    }

    // Save to config
    if (typeof guardarTodosAjustes === 'function') guardarTodosAjustes();
}

function iniciarCreacionCuadroTexto(e) {
    if (!window.modoCuadroTextoActivo) return;
    if (e.target.closest('.caja-texto-flotante') || e.target.closest('#toolbar-formato-texto')) return;
    
    console.log('[CuadroTexto] Iniciando creación de cuadro en:', e.clientX, e.clientY);
    
    const container = document.getElementById('visor-container');
    const rect = container.getBoundingClientRect();
    
    // Corregir para tener en cuenta el scroll
    let x = e.clientX - rect.left + container.scrollLeft;
    let y = e.clientY - rect.top + container.scrollTop;
    
    console.log('[CuadroTexto] Coordenadas calculadas relativas al contenedor:', x, y);
    
    crearCajaTextoFlotante(x, y);
}

function crearCajaTextoFlotante(x, y) {
    const div = document.createElement('div');
    div.className = 'caja-texto-flotante caja-texto-activa';
    div.contentEditable = "true";
    div.style.position = 'absolute';
    div.style.left = x + 'px';
    div.style.top = y + 'px';
    
    const selColor = document.getElementById('fmt-color');
    const selFuente = document.getElementById('fmt-fuente');
    const selTamano = document.getElementById('fmt-tamano');
    
    const esModoOscuro = document.body.classList.contains('ui-dark-mode');
    div.style.color = (selColor && selColor.value ? selColor.value : (esModoOscuro ? '#ffffff' : '#000000'));
    div.style.fontFamily = (selFuente ? selFuente.value : 'Arial, sans-serif');
    div.style.fontSize = ((selTamano ? selTamano.value : '16') + 'px');
    
    const container = document.getElementById('visor-container');
    container.appendChild(div);
    
    setTimeout(() => {
        div.focus();
        window.textoEditandoActivo = true;
    }, 10);
    seleccionarCuadroTexto(div);
    
    // Eventos de arrastre y edición
    let isDragging = false;
    let offsetX, offsetY;
    
    div.addEventListener('mousedown', function(e) {
        e.stopPropagation(); // Evitar que el clic en una caja existente cree otra
        
        const rect = div.getBoundingClientRect();
        const BORDER_MARGIN = 8;
        const borderClick = e.clientX < rect.left + BORDER_MARGIN || 
                            e.clientX > rect.right - BORDER_MARGIN || 
                            e.clientY < rect.top + BORDER_MARGIN || 
                            e.clientY > rect.bottom - BORDER_MARGIN;
        
        if (borderClick) {
            isDragging = true;
            offsetX = e.clientX - div.offsetLeft;
            offsetY = e.clientY - div.offsetTop;
            div.style.cursor = 'move';
            e.preventDefault(); // Solo prevenir foco/cursor si realmente se arrastra desde el borde
        } else {
            div.style.cursor = 'text';
        }
        seleccionarCuadroTexto(div);
    });
    
    document.addEventListener('mousemove', function(e) {
        if (isDragging) {
            div.style.left = (e.clientX - offsetX) + 'px';
            div.style.top = (e.clientY - offsetY) + 'px';
            posicionarToolbar(div);
        }
    });
    
    document.addEventListener('mouseup', function(e) {
        if (isDragging) {
            isDragging = false;
            div.style.cursor = 'text';
        }
    });
    
    div.addEventListener('focus', function() {
        window.textoEditandoActivo = true;
        seleccionarCuadroTexto(div);
    });

    div.addEventListener('blur', function() {
        window.textoEditandoActivo = false;
    });
    
    div.addEventListener('input', function() {
        posicionarToolbar(div);
    });
}

function seleccionarCuadroTexto(div) {
    if (window.cuadroTextoActivoUI && window.cuadroTextoActivoUI !== div) {
        window.cuadroTextoActivoUI.classList.remove('caja-texto-activa');
    }
    
    window.cuadroTextoActivoUI = div;
    div.classList.add('caja-texto-activa');
    
    const toolbar = document.getElementById('toolbar-formato-texto');
    if (toolbar) {
        toolbar.classList.remove('oculto');
        
        const isBold = div.style.fontWeight === 'bold' || div.style.fontWeight > 600;
        const isItalic = div.style.fontStyle === 'italic';
        const isUnderline = div.style.textDecoration && div.style.textDecoration.includes('underline');
        
        const btnBold = document.getElementById('btn-fmt-bold');
        const btnItalic = document.getElementById('btn-fmt-italic');
        const btnUnderline = document.getElementById('btn-fmt-underline');
        
        if (btnBold) btnBold.classList.toggle('activo', isBold);
        if (btnItalic) btnItalic.classList.toggle('activo', isItalic);
        if (btnUnderline) btnUnderline.classList.toggle('activo', isUnderline);
        
        posicionarToolbar(div);
    }
}

function posicionarToolbar(div) {
    const toolbar = document.getElementById('toolbar-formato-texto');
    if (!toolbar || toolbar.classList.contains('oculto') || !div) return;

    const divRect = div.getBoundingClientRect();
    const tbWidth = toolbar.offsetWidth || 320;
    const tbHeight = toolbar.offsetHeight || 38;

    // Evitar colisión con la barra flotante superior (Modo Zen / barra superior)
    let minTop = 10;
    const barraFlotante = document.querySelector('.zen-pill, #zen-pill, #barra-superior');
    if (barraFlotante) {
        const bRect = barraFlotante.getBoundingClientRect();
        if (bRect.height > 0 && bRect.bottom > 0 && bRect.bottom < window.innerHeight * 0.4) {
            minTop = Math.max(minTop, Math.round(bRect.bottom + 8));
        }
    }

    // Preferir ligeramente arriba del cuadro; si no cabe sin taparse, colocar debajo
    let top = divRect.top - tbHeight - 10;
    if (top < minTop) {
        top = divRect.bottom + 10;
    }
    top = Math.max(10, Math.min(window.innerHeight - tbHeight - 10, top));

    let left = divRect.left;
    left = Math.max(10, Math.min(window.innerWidth - tbWidth - 10, left));

    toolbar.style.top = Math.round(top) + 'px';
    toolbar.style.left = Math.round(left) + 'px';
}

window.toggleFmtBold = function() {
    if (!window.cuadroTextoActivoUI) return;
    const isBold = window.cuadroTextoActivoUI.style.fontWeight === 'bold' || window.cuadroTextoActivoUI.style.fontWeight > 600;
    const nuevoBold = !isBold;
    window.cuadroTextoActivoUI.style.fontWeight = nuevoBold ? 'bold' : 'normal';
    const btn = document.getElementById('btn-fmt-bold');
    if (btn) btn.classList.toggle('activo', nuevoBold);
}

window.toggleFmtItalic = function() {
    if (!window.cuadroTextoActivoUI) return;
    const isItalic = window.cuadroTextoActivoUI.style.fontStyle === 'italic';
    const nuevoItalic = !isItalic;
    window.cuadroTextoActivoUI.style.fontStyle = nuevoItalic ? 'italic' : 'normal';
    const btn = document.getElementById('btn-fmt-italic');
    if (btn) btn.classList.toggle('activo', nuevoItalic);
}

window.toggleFmtUnderline = function() {
    if (!window.cuadroTextoActivoUI) return;
    const isUnderline = window.cuadroTextoActivoUI.style.textDecoration && window.cuadroTextoActivoUI.style.textDecoration.includes('underline');
    const nuevoUnderline = !isUnderline;
    window.cuadroTextoActivoUI.style.textDecoration = nuevoUnderline ? 'underline' : 'none';
    const btn = document.getElementById('btn-fmt-underline');
    if (btn) btn.classList.toggle('activo', nuevoUnderline);
}

window.actualizarAjustesCuadroTexto = function() {};

window.eliminarCuadroTextoActual = function() {
    if (window.cuadroTextoActivoUI) {
        window.cuadroTextoActivoUI.remove();
        window.cuadroTextoActivoUI = null;
        window.textoEditandoActivo = false;
        document.getElementById('toolbar-formato-texto').classList.add('oculto');
    }
}

function rgbToHex(rgb) {
    if (rgb.startsWith('#')) return rgb;
    const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!match) return '#000000';
    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase();
}

window.guardarCuadroTextoActual = async function() {
    if (!window.cuadroTextoActivoUI) return;
    
    const div = window.cuadroTextoActivoUI;
    const texto = div.innerText.trim();
    
    if (!texto) {
        eliminarCuadroTextoActual();
        return;
    }
    
    let color = div.style.color || '#000000';
    if (color.startsWith('rgb')) color = rgbToHex(color);
    
    const tamano = parseInt(div.style.fontSize) || 16;
    const fuente = div.style.fontFamily || 'Arial';
    const isBold = div.style.fontWeight === 'bold' || div.style.fontWeight > 600;
    const isItalic = div.style.fontStyle === 'italic';
    const isUnderline = div.style.textDecoration && div.style.textDecoration.includes('underline');
    
    const rectVisual = {
        x: div.offsetLeft,
        y: div.offsetTop,
        w: div.offsetWidth,
        h: div.offsetHeight
    };
    
    let bboxPdf;
    if (typeof pdfRectFromCanvas === 'function') {
        bboxPdf = pdfRectFromCanvas(rectVisual);
    } else {
        console.error("No se encontró pdfRectFromCanvas. El guardado podría no ser preciso.");
        bboxPdf = [rectVisual.x, rectVisual.y, rectVisual.x + rectVisual.w, rectVisual.y + rectVisual.h];
    }
    
    const configFuente = {
        fuente: fuente.replace(/['"]/g, '').split(',')[0].trim(), // ej: 'Arial, sans-serif' -> 'Arial'
        tamano: tamano,
        color: color,
        negrita: isBold,
        cursiva: isItalic,
        subrayado: isUnderline
    };
    
    document.getElementById('toolbar-formato-texto').classList.add('oculto');
    div.style.border = 'none';
    div.style.background = 'transparent';
    div.contentEditable = "false";
    
    try {
        console.log('[CuadroTexto] Guardando:', bboxPdf, texto, configFuente);
        const res = await eel.agregar_anotacion_freetext(rutaPDFActual, paginaActual, bboxPdf, texto, configFuente)();
        if (res.success) {
            console.log('[CuadroTexto] Guardado exitoso');
            if (typeof forzarRenderizadoPDF === 'function') {
                forzarRenderizadoPDF(paginaActual);
            } else if (typeof cargarPagina === 'function') {
                cargarPagina(paginaActual);
            }
            window.cuadroTextoActivoUI = null;
            window.textoEditandoActivo = false;
            div.remove();
        } else {
            console.error('[CuadroTexto] Error al guardar:', res.error);
            div.style.border = '2px solid red';
            window.cuadroTextoActivoUI = div;
            document.getElementById('toolbar-formato-texto').classList.remove('oculto');
        }
    } catch(e) {
        console.error('[CuadroTexto] Exception al guardar:', e);
    }
}

// Ocultar barra si se hace clic fuera del cuadro activo
document.addEventListener('mousedown', function(e) {
    if (window.cuadroTextoActivoUI && !window.cuadroTextoActivoUI.contains(e.target) && !e.target.closest('#toolbar-formato-texto')) {
        window.cuadroTextoActivoUI.classList.remove('caja-texto-activa');
        document.getElementById('toolbar-formato-texto').classList.add('oculto');
    }
});
