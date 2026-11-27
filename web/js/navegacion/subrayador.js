// ==========================================
// SUBRAYADOR Y BORRADOR EN LIRALOUD
// ==========================================
window.modoSubrayadorActivo = false;
window.modoBorradorActivo = false;
window.colorSubrayadorActual = '#FFFF00'; // Amarillo por defecto

function obtenerCursorSubrayador() {
    const hex = (window.colorSubrayadorActual || '#FFFF00').replace('#', '');
    return 'url("data:image/svg+xml;utf8,<svg width=\'24\' height=\'24\' viewBox=\'0 0 512 512\' xmlns=\'http://www.w3.org/2000/svg\'><path fill=\'%23888\' d=\'M451.4692,125.4041,380.5656,54.5016a13.1093,13.1093,0,0,0-17.7457-.7327L164.9985,221.3722,284.6018,340.9744l167.6-197.8225A13.11,13.11,0,0,0,451.4692,125.4041Z\'></path><rect fill=\'%23bbb\' height=\'172.7608\' transform=\'translate(-166.0416 227.6148) rotate(-45)\' width=\'41.0143\' x=\'171.2274\' y=\'227.8569\'></rect><path fill=\'%23999\' d=\'M94.5521,363.7306,142.2413,411.42c18.5232-11.008,40.65-15.58,63.1619-17.3911l-93.46-93.46C110.1316,323.08,105.56,345.2073,94.5521,363.7306Z\'></path><path fill=\'%23' + hex + '\' d=\'M58.6143,403.6279a6.5743,6.5743,0,0,0-1.2732,7.5013l22.3748,46.4866a6.5746,6.5746,0,0,0,10.5723,1.7965l31.4111-31.4111L77.9706,384.2726Z\'></path></svg>") 0 24, auto';
}

function obtenerCursorBorrador() {
    return 'url("data:image/svg+xml;utf8,<svg width=\'24\' height=\'24\' viewBox=\'0 0 512 512\' xmlns=\'http://www.w3.org/2000/svg\'><rect x=\'75.264\' y=\'277.317\' transform=\'matrix(0.7071 -0.7071 0.7071 0.7071 -229.5849 204.8263)\' fill=\'%23ebe9e5\' width=\'114.382\' height=\'204.46\'></rect><path fill=\'%23d6d6d6\' d=\'M281.767,297.776l164.291-164.29l-67.544-67.544l-227.84,227.84l67.544,67.544l40.44-40.44 c3.19-3.19,8.362-3.191,11.553-0.002l11.555-11.555C278.576,306.138,278.577,300.966,281.767,297.776z\'></path><path fill=\'%23a0a7ac\' d=\'M293.321,309.331c-1.595,1.595-3.686,2.393-5.777,2.393s-4.182-0.797-5.777-2.393 c-0.001-0.002-11.556,11.553-11.556,11.553c3.193,3.192,3.193,8.365,0.002,11.556l-40.44,40.44l34.663,34.664l227.84-227.84 l-34.664-34.663L293.321,309.331z\'></path><rect x=\'74.609\' y=\'126.462\' transform=\'matrix(0.7071 -0.7071 0.7071 0.7071 -37.7149 210.8935)\' fill=\'%23a0a7ac\' width=\'322.208\' height=\'49.021\'></rect><path fill=\'%236b6b6b\' d=\'M509.607,173.926L338.073,2.393C336.542,0.861,334.463,0,332.297,0c-2.167,0-4.245,0.861-5.777,2.393 L87.126,241.787c-3.191,3.191-3.191,8.364,0,11.554l1.926,1.926L2.393,341.926c-3.191,3.191-3.191,8.364,0,11.554l156.127,156.127 c1.595,1.595,3.686,2.393,5.777,2.393c2.09,0,4.182-0.797,5.777-2.393l86.659-86.659l1.926,1.926 c1.595,1.595,3.686,2.393,5.777,2.393s4.182-0.797,5.777-2.393L509.607,185.48c1.533-1.532,2.393-3.61,2.393-5.777 C512,177.537,511.139,175.458,509.607,173.926z M264.436,407.543l-34.663-34.664l40.44-40.44c3.191-3.191,3.191-8.364,0-11.554 c-3.193-3.191-8.364-3.19-11.554,0l-40.44,40.44l-67.544-67.544l227.84-227.84l67.544,67.544l-164.292,164.29 c-3.191,3.19-3.191,8.362-0.001,11.553c1.597,1.597,3.688,2.394,5.779,2.394s4.182-0.797,5.777-2.393l164.291-164.29l34.664,34.663 L264.436,407.543z M366.96,54.387l-227.84,227.84l-34.663-34.663l227.84-227.84L366.96,54.387z M245.178,411.394l-80.881,80.881 L19.725,347.702l80.881-80.881L245.178,411.394z\'></path></svg>") 0 24, auto';
}

window.actualizarCursorSubrayador = function() {
    const canvas = document.getElementById('lienzo-pdf');
    if (!canvas) return;
    if (window.modoSubrayadorActivo) {
        canvas.style.cursor = obtenerCursorSubrayador();
    } else if (window.modoBorradorActivo) {
        canvas.style.cursor = obtenerCursorBorrador();
    } else {
        canvas.style.cursor = 'default';
    }
};

function toggleModoSubrayador(activo) {
    if (typeof activo !== 'boolean') activo = !window.modoSubrayadorActivo;
    window.modoSubrayadorActivo = activo;
    const btnGroup = document.getElementById('group-highlight');
    if(btnGroup) btnGroup.classList.toggle('active', activo);
    
    // Actualizar estilo subrayado activo en botones de Modo Zen
    document.querySelectorAll('.zen-item-subrayador').forEach(el => {
        el.classList.toggle('tool-active-underline', activo);
    });
    
    if (activo) {
        // Si activamos el subrayador, desactivamos el borrador, el editor, el cuadro de texto y mover elementos automáticamente
        toggleModoBorrador(false);
        if (typeof toggleModoEditorTexto === 'function' && window.modoEditorTextoActivo) {
            toggleModoEditorTexto(false);
        }
        if (typeof activarModoCuadroTexto === 'function' && window.modoCuadroTextoActivo) {
            activarModoCuadroTexto(false);
        }
        if (typeof toggleModoRecorteExtraccion === 'function' && window.modoRecorteActivo) {
            toggleModoRecorteExtraccion(false);
        }
        if (typeof toggleModoMoverElementos === 'function' && window.modoMoverElementosActivo) {
            toggleModoMoverElementos(false);
        }
        window.actualizarCursorSubrayador();
    } else {
        restaurarCursorCanvas();
    }
    if (typeof window.actualizarEstadoInteractivoCapaSoloLectura === 'function') {
        window.actualizarEstadoInteractivoCapaSoloLectura();
    }
}

function toggleModoBorrador(activo) {
    if (typeof activo !== 'boolean') activo = !window.modoBorradorActivo;
    window.modoBorradorActivo = activo;
    const btnGroup = document.getElementById('group-erase');
    if(btnGroup) btnGroup.classList.toggle('active', activo);

    // Actualizar estilo subrayado activo en botones de Modo Zen
    document.querySelectorAll('.zen-item-borrador').forEach(el => {
        el.classList.toggle('tool-active-underline', activo);
    });

    if (activo) {
        // Si activamos el borrador, desactivamos el subrayador, el editor, el cuadro de texto y mover elementos automáticamente
        toggleModoSubrayador(false);
        if (typeof toggleModoEditorTexto === 'function' && window.modoEditorTextoActivo) {
            toggleModoEditorTexto(false);
        }
        if (typeof activarModoCuadroTexto === 'function' && window.modoCuadroTextoActivo) {
            activarModoCuadroTexto(false);
        }
        if (typeof toggleModoRecorteExtraccion === 'function' && window.modoRecorteActivo) {
            toggleModoRecorteExtraccion(false);
        }
        if (typeof toggleModoMoverElementos === 'function' && window.modoMoverElementosActivo) {
            toggleModoMoverElementos(false);
        }
        window.actualizarCursorSubrayador();
    } else {
        restaurarCursorCanvas();
    }
    if (typeof window.actualizarEstadoInteractivoCapaSoloLectura === 'function') {
        window.actualizarEstadoInteractivoCapaSoloLectura();
    }
}

function setSubrayadoColor(colorHex, activar = true) {
    console.log("Color elegido:", colorHex);
    window.colorSubrayadorActual = colorHex;
    
    // Actualizar todos los iconos SVG de la interfaz (tanto en la barra como en Modo Zen)
    document.querySelectorAll('.dynamic-ink').forEach(el => {
        el.setAttribute('fill', colorHex);
    });
    
    // Ocultar la paleta si estaba abierta
    const palette = document.getElementById('color-palette');
    if (palette) palette.style.display = 'none';
    
    // Si el subrayador está activo, actualizamos el cursor para reflejar el nuevo color
    if (window.modoSubrayadorActivo) {
        window.actualizarCursorSubrayador();
    } else if (activar) {
        // Activar el subrayador al elegir un color
        toggleModoSubrayador(true);
    }

    if (typeof window.actualizarEstadoInteractivoCapaSoloLectura === 'function') {
        window.actualizarEstadoInteractivoCapaSoloLectura();
    }
    
    if (activar && typeof guardarTodosAjustes === 'function') {
        guardarTodosAjustes(false);
    }
    
    if (typeof window.onColorSubrayadorCambiado === 'function') {
        window.onColorSubrayadorCambiado(colorHex);
    }
}

function restaurarCursorCanvas() {
    if (!window.modoSubrayadorActivo && !window.modoBorradorActivo) {
        const canvas = document.getElementById('lienzo-pdf');
        if (canvas) canvas.style.cursor = 'default';
    } else {
        window.actualizarCursorSubrayador();
    }
}

let palabrasEnTrazo = [];

function iniciarTrazoSubrayado() {
    palabrasEnTrazo = [];
}

function procesarPalabraSubrayado() {
    if (window.startIndexSubrayado === -1 || window.currentIndexSubrayado === -1 || !datosPagina) return;
    
    let minIdx = Math.min(window.startIndexSubrayado, window.currentIndexSubrayado);
    let maxIdx = Math.max(window.startIndexSubrayado, window.currentIndexSubrayado);
    
    // Extraer el nuevo rango elástico
    palabrasEnTrazo = datosPagina.palabras.slice(minIdx, maxIdx + 1);
    
    // Limpiar visuales anteriores y redibujar el nuevo rango
    document.querySelectorAll('.subrayado-visual').forEach(el => el.remove());
    palabrasEnTrazo.forEach(palabra => {
        dibujarSubrayadoVisual(palabra.bbox[0], palabra.bbox[1], palabra.bbox[2], palabra.bbox[3], window.colorSubrayadorActual);
    });
}

async function refrescarLienzoSinRecarga() {
    if (typeof eel !== 'undefined' && typeof eel.obtener_vista_rapida_pagina === 'function' && typeof paginaActual !== 'undefined') {
        try {
            let vistaRapida = await eel.obtener_vista_rapida_pagina(paginaActual)();
            if (vistaRapida && vistaRapida.imagen) {
                // Actualizar la imagen base de la página para que dibujar() mantenga el resaltado permanentemente
                if (typeof datosPagina !== 'undefined' && datosPagina) {
                    datosPagina.imagen = vistaRapida.imagen;
                }
                if (typeof dibujar === 'function') {
                    dibujar();
                }
            }
        } catch(e) {
            console.warn("[Subrayador] No se pudo refrescar vista rápida:", e);
        }
    }
}

function finalizarTrazoSubrayado() {
    console.log("[Subrayador] finalizarTrazoSubrayado llamado, palabras capturadas:", palabrasEnTrazo.length);
    if (palabrasEnTrazo.length === 0) return;
    
    if (window.tutorialActivo && typeof window.onTrazoSubrayadoTutorial === 'function') {
        let fullText = palabrasEnTrazo.map(p => p.texto).join(" ");
        let coordList = palabrasEnTrazo.map(p => ({x0: p.bbox[0], y0: p.bbox[1], x1: p.bbox[2], y1: p.bbox[3]}));
        window.onTrazoSubrayadoTutorial(fullText, window.colorSubrayadorActual, coordList);
        document.querySelectorAll('.subrayado-visual').forEach(el => el.remove());
        palabrasEnTrazo = [];
        return;
    }
    
    if (typeof paginaActual !== 'undefined' && rutaPDFActual) {
        // Ordenar palabras por orden de lectura (arriba hacia abajo, izquierda a derecha)
        palabrasEnTrazo.sort((a, b) => {
            const deltaY = a.bbox[1] - b.bbox[1];
            // Si la diferencia en Y es mayor a 5 píxeles, consideramos que están en distintas líneas
            if (Math.abs(deltaY) > 5) {
                return deltaY;
            }
            // Si están en la misma línea, ordenar por X (izquierda a derecha)
            return a.bbox[0] - b.bbox[0];
        });

        let coordList = palabrasEnTrazo.map(p => ({x0: p.bbox[0], y0: p.bbox[1], x1: p.bbox[2], y1: p.bbox[3]}));
        let fullText = palabrasEnTrazo.map(p => p.texto).join(" ");
        let uniqueId = "rag_" + Date.now();
        
        console.log(`[Subrayador] Enviando lote de ${coordList.length} palabras al backend...`, coordList);
        eel.agregar_subrayados_lote(rutaPDFActual, paginaActual, coordList, window.colorSubrayadorActual, uniqueId, fullText)(function(res) {
            if (res.success) {
                console.log("[Subrayador] Lote de subrayados guardado en PDF.");
                appendExtractedText(fullText, window.colorSubrayadorActual, uniqueId, paginaActual);
                
                // Limpiar trazos visuales
                document.querySelectorAll('.subrayado-visual').forEach(el => el.remove());
                
                // Refrescar el canvas de inmediato (<50ms) sin recargar toda la página ni bloquear
                refrescarLienzoSinRecarga();
            } else {
                console.error("[Subrayador] Error al subrayar:", res.error);
                document.querySelectorAll('.subrayado-visual').forEach(el => el.remove());
            }
        });
    }
    palabrasEnTrazo = [];
}

// Eliminar el trazado de borrado, ahora es puntual
function borrarSubrayadoPuntual(x, y) {
    if (typeof paginaActual !== 'undefined' && rutaPDFActual) {
        console.log(`[Subrayador] Intentando borrar en punto (${x}, ${y})`);
        eel.eliminar_subrayado_punto(rutaPDFActual, paginaActual, x, y)(function(res) {
            if (res.success && res.id_borrado) {
                console.log(`[Subrayador] Subrayado borrado (ID: ${res.id_borrado})`);
                const card = document.getElementById(res.id_borrado);
                if (card) {
                    card.remove();
                }
                // Refrescar el canvas de inmediato (<50ms) para mostrar que el resaltado se borró
                refrescarLienzoSinRecarga();
            } else {
                console.log("No se intersectó ningún subrayado en ese punto.");
            }
        });
    }
}

function dibujarSubrayadoVisual(x0, y0, x1, y1, color) {
    console.log(`[Subrayador] dibujarSubrayadoVisual llamado con coord: ${x0},${y0} -> ${x1},${y1} color: ${color}`);

    // Ajustar a la escala del canvas
    let z = (typeof datosPagina !== 'undefined' && datosPagina && datosPagina.factor_zoom) ? datosPagina.factor_zoom : 1.0;
    
    let domScaleX = 1.0;
    let domScaleY = 1.0;
    
    const canvas = document.getElementById('lienzo-pdf');
    const wrapper = document.getElementById('pdf-crop-wrapper');
    const container = document.getElementById('visor-container');
    
    if (!canvas || !wrapper || !container) {
        console.log("[Subrayador] Elementos no encontrados para subrayado");
        return;
    }
    
    // Usar offsetLeft/offsetTop (relativos al offsetParent = visor-container)
    // wrapper.offsetParent = visor-container (position: relative)
    // canvas.offsetParent = wrapper (position: relative)
    const wrapperLeft = wrapper.offsetLeft;
    const wrapperTop = wrapper.offsetTop;
    const canvasLeft = canvas.offsetLeft;
    const canvasTop = canvas.offsetTop;
    
    // Escala visual (CSS) vs lógica
    if (canvas.width > 0) {
        domScaleX = canvas.clientWidth / canvas.width;
        domScaleY = canvas.clientHeight / canvas.height;
    }

    // Posición final relativa a visor-container (donde se appenda el overlay)
    const finalLeft = wrapperLeft + canvasLeft + (x0 * z * domScaleX);
    const finalTop = wrapperTop + canvasTop + (y0 * z * domScaleY);
    const finalWidth = ((x1 - x0) * z * domScaleX);
    const finalHeight = ((y1 - y0) * z * domScaleY);

    const overlay = document.createElement('div');
    overlay.className = 'subrayado-visual';
    overlay.style.position = 'absolute';
    overlay.style.backgroundColor = color;
    overlay.style.opacity = '0.4';
    overlay.style.pointerEvents = 'none';
    overlay.style.left = finalLeft + 'px';
    overlay.style.top = finalTop + 'px';
    overlay.style.width = finalWidth + 'px';
    overlay.style.height = finalHeight + 'px';

    if (container) {
        container.appendChild(overlay);
        console.log("[Subrayador] overlay añadido al DOM");
    } else {
        console.log("[Subrayador] NO SE ENCONTRÓ visor-container");
    }
}

function appendExtractedText(text, colorHex, id, pageNum) {
    const container = document.getElementById('extracted-texts');
    if (!container) return;
    const card = document.createElement('div');
    card.id = id;
    card.className = 'text-card';
    card.style.borderColor = colorHex;
    card.style.cursor = 'pointer';
    card.title = "Clic para ir a la página";
    
    // Contenedor de texto
    const textDiv = document.createElement('div');
    textDiv.innerText = text;
    textDiv.style.display = '-webkit-box';
    textDiv.style.webkitBoxOrient = 'vertical';
    textDiv.style.webkitLineClamp = '3';
    textDiv.style.overflow = 'hidden';
    textDiv.style.transition = 'all 0.3s ease';
    
    // Navegar al hacer clic en cualquier parte de la tarjeta
    card.onclick = () => {
        if (typeof cargarPagina === 'function' && pageNum !== undefined) {
            cargarPagina(pageNum);
            cerrarPanelSubrayados();
        }
    };
    
    // Botón para expandir/contraer
    const expandBtn = document.createElement('button');
    expandBtn.className = 'text-card-expand-btn';
    expandBtn.innerHTML = '&#9660;';
    expandBtn.title = "Expandir/Contraer";
    expandBtn.onclick = (e) => {
        e.stopPropagation();
        if (textDiv.style.webkitLineClamp === '3') {
            textDiv.style.webkitLineClamp = 'unset';
            expandBtn.innerHTML = '&#9650;';
        } else {
            textDiv.style.webkitLineClamp = '3';
            expandBtn.innerHTML = '&#9660;';
        }
    };
    
    // Contenedor de metadata (Página + Botón copiar)
    const metaDiv = document.createElement('div');
    metaDiv.className = 'text-card-meta';

    const pageSpan = document.createElement('span');
    pageSpan.innerText = pageNum !== undefined ? `Página ${pageNum + 1}` : '';
    // Guardar dataset para los filtros
    card.dataset.page = pageNum !== undefined ? (pageNum + 1).toString() : '';
    card.dataset.color = colorHex.toUpperCase();

    // Contenedor interno para botón expandir y copiar
    const actionDiv = document.createElement('div');
    actionDiv.className = 'text-card-actions';
    actionDiv.appendChild(expandBtn);
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'text-card-copy-btn';
    copyBtn.innerText = 'Copiar';
    copyBtn.onclick = (e) => {
        e.stopPropagation(); // Evitar click en la tarjeta
        navigator.clipboard.writeText(text).then(() => {
            copyBtn.innerText = '¡Copiado!';
            setTimeout(() => { copyBtn.innerText = 'Copiar'; }, 2000);
        });
    };

    metaDiv.appendChild(pageSpan);
    actionDiv.appendChild(copyBtn);
    metaDiv.appendChild(actionDiv);

    card.appendChild(textDiv);
    card.appendChild(metaDiv);

    container.prepend(card);
}

function aplicarFiltrosSubrayados() {
    const colorFilter = document.getElementById('filter-color') ? document.getElementById('filter-color').value.toUpperCase() : '';
    const pageFilter = document.getElementById('filter-page') ? document.getElementById('filter-page').value : '';
    const tabActiva = window.tabExtraccionActual || 'todas';
    
    const cards = document.querySelectorAll('#extracted-texts .text-card');
    cards.forEach(card => {
        const esCaptura = card.classList.contains('capture-card') || card.dataset.tipo === 'captura';
        const matchTab = (tabActiva === 'todas') || (tabActiva === 'capturas' && esCaptura) || (tabActiva === 'textos' && !esCaptura);
        const matchColor = colorFilter === '' || esCaptura || card.dataset.color === colorFilter;
        const matchPage = pageFilter === '' || card.dataset.page === pageFilter;
        
        if (matchTab && matchColor && matchPage) {
            card.style.display = esCaptura ? 'flex' : 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

function limpiarFiltrosSubrayados() {
    if (document.getElementById('filter-color')) document.getElementById('filter-color').value = '';
    if (document.getElementById('filter-page')) document.getElementById('filter-page').value = '';
    aplicarFiltrosSubrayados();
}

function mostrarPanelSubrayados() {
    console.log("Abriendo panel del Gestor de Extracción...");
    const modal = document.getElementById('modal-subrayados');
    const panel = document.getElementById('panel-subrayados');
    if (modal && panel) {
        modal.style.display = 'block';
        // Forzar reflow para animación
        void modal.offsetWidth; 
        panel.style.right = '0px';
        
        // Carga unificada de subrayados y capturas visuales
        if (typeof cargarExtraccionesCompletas === 'function') {
            cargarExtraccionesCompletas();
        } else if (typeof rutaPDFActual !== 'undefined' && rutaPDFActual) {
            eel.obtener_todos_subrayados(rutaPDFActual)(function(res) {
                if (res && res.success) {
                    const container = document.getElementById('extracted-texts');
                    if (container) {
                        container.innerHTML = '';
                        res.subrayados.reverse().forEach(s => {
                            appendExtractedText(s.texto, s.color, s.id, s.pagina);
                        });
                    }
                }
            });
        }
    }
}

function cerrarPanelSubrayados() {
    const modal = document.getElementById('modal-subrayados');
    const panel = document.getElementById('panel-subrayados');
    if (modal && panel) {
        panel.style.right = '-350px';
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

// Ocultar paleta de colores al hacer clic fuera
document.addEventListener('click', function(e) {
    const palette = document.getElementById('color-palette');
    const btn = document.getElementById('color-dropdown-btn');
    if (palette && btn) {
        if (!palette.contains(e.target) && !btn.contains(e.target)) {
            palette.style.display = 'none';
        }
    }
});
