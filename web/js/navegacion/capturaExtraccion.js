/* LiraLoud
 * Módulo de Captura de Recortes y Diagramas para el Gestor de Extracción
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

window.modoRecorteActivo = false;
window.recorteDataTemp = null;
window.tabExtraccionActual = 'todas'; // 'todas' | 'textos' | 'capturas'

/**
 * Activa o desactiva la herramienta de selección rectangular sobre el visor.
 */
function toggleModoRecorteExtraccion(forzarEstado) {
    if (typeof forzarEstado === 'boolean') {
        window.modoRecorteActivo = forzarEstado;
    } else {
        window.modoRecorteActivo = !window.modoRecorteActivo;
    }

    const btnGroup = document.getElementById('group-crop-extract');
    if (btnGroup) btnGroup.classList.toggle('active', window.modoRecorteActivo);

    const btn = document.getElementById('btn-crop-extract');
    if (btn) {
        btn.classList.toggle('activo', window.modoRecorteActivo);
        btn.classList.toggle('active', window.modoRecorteActivo);
    }

    document.querySelectorAll('.zen-item-recorte').forEach(el => {
        el.classList.toggle('tool-active-underline', window.modoRecorteActivo);
    });

    const visorContainer = document.getElementById('visor-container');
    const canvas = document.getElementById('lienzo-pdf');

    if (window.modoRecorteActivo) {
        // Desactivar otros modos de edición incompatibles
        if (typeof toggleModoSubrayador === 'function' && window.modoSubrayadorActivo) toggleModoSubrayador(false);
        if (typeof toggleModoBorrador === 'function' && window.modoBorradorActivo) toggleModoBorrador(false);
        if (typeof toggleModoEditorTexto === 'function' && window.modoEditorTextoActivo) toggleModoEditorTexto(false);
        if (typeof activarModoCuadroTexto === 'function' && window.modoCuadroTextoActivo) activarModoCuadroTexto(false);

        if (visorContainer) visorContainer.style.cursor = 'crosshair';
        if (canvas) canvas.style.cursor = 'crosshair';

        iniciarCapaSeleccionRecorte();
    } else {
        if (visorContainer) visorContainer.style.cursor = '';
        if (canvas) canvas.style.cursor = '';
        removerCapaSeleccionRecorte();
    }
}

/**
 * Crea la capa transparente de selección para capturar el área dibujada por el usuario.
 */
function iniciarCapaSeleccionRecorte() {
    removerCapaSeleccionRecorte();

    const visorContainer = document.getElementById('visor-container');
    if (!visorContainer) return;

    const overlay = document.createElement('div');
    overlay.id = 'capa-recorte-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.zIndex = '99998';
    overlay.style.cursor = 'crosshair';
    overlay.style.userSelect = 'none';
    overlay.style.background = 'rgba(0, 0, 0, 0.05)';

    // Indicador flotante superior
    const banner = document.createElement('div');
    banner.style.position = 'fixed';
    banner.style.top = '70px';
    banner.style.left = '50%';
    banner.style.transform = 'translateX(-50%)';
    banner.style.background = '#2c3e50';
    banner.style.color = '#ffffff';
    banner.style.padding = '8px 18px';
    banner.style.borderRadius = '20px';
    banner.style.fontSize = '12px';
    banner.style.fontWeight = '600';
    banner.style.boxShadow = '0 4px 15px rgba(0,0,0,0.25)';
    banner.style.pointerEvents = 'none';
    banner.style.display = 'flex';
    banner.style.alignItems = 'center';
    banner.style.gap = '8px';
    banner.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> <span>Arrastra un recuadro sobre el contenido que deseas guardar</span> <span style="opacity:0.7; font-size:11px;">(Esc para cancelar)</span>`;
    overlay.appendChild(banner);

    let startX = 0, startY = 0;
    let isDrawing = false;
    let selectionBox = null;

    overlay.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Solo clic izquierdo
        isDrawing = true;
        startX = e.clientX;
        startY = e.clientY;

        selectionBox = document.createElement('div');
        selectionBox.id = 'caja-seleccion-recorte';
        selectionBox.style.position = 'fixed';
        selectionBox.style.border = '2px dashed #2980b9';
        selectionBox.style.background = 'rgba(41, 128, 185, 0.25)';
        selectionBox.style.borderRadius = '4px';
        selectionBox.style.pointerEvents = 'none';
        selectionBox.style.zIndex = '99999';
        selectionBox.style.boxShadow = '0 0 10px rgba(41, 128, 185, 0.4)';
        overlay.appendChild(selectionBox);
    });

    overlay.addEventListener('mousemove', (e) => {
        if (!isDrawing || !selectionBox) return;
        const currentX = e.clientX;
        const currentY = e.clientY;

        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        selectionBox.style.left = left + 'px';
        selectionBox.style.top = top + 'px';
        selectionBox.style.width = width + 'px';
        selectionBox.style.height = height + 'px';
    });

    overlay.addEventListener('mouseup', (e) => {
        if (!isDrawing) return;
        isDrawing = false;

        const endX = e.clientX;
        const endY = e.clientY;

        const boxLeft = Math.min(startX, endX);
        const boxTop = Math.min(startY, endY);
        const boxRight = Math.max(startX, endX);
        const boxBottom = Math.max(startY, endY);

        removerCapaSeleccionRecorte();
        toggleModoRecorteExtraccion(false);

        // Procesar recorte respecto al lienzo del PDF
        procesarRecorteVisual(boxLeft, boxTop, boxRight, boxBottom);
    });

    // Cancelar con tecla Escape durante el trazado
    const onKeyDownEsc = (e) => {
        if (e.key === 'Escape') {
            removerCapaSeleccionRecorte();
            toggleModoRecorteExtraccion(false);
        }
    };
    window.recorteKeyEscListener = onKeyDownEsc;
    window.addEventListener('keydown', onKeyDownEsc);

    document.body.appendChild(overlay);
}

function removerCapaSeleccionRecorte() {
    const overlay = document.getElementById('capa-recorte-overlay');
    if (overlay) overlay.remove();
    if (window.recorteKeyEscListener) {
        window.removeEventListener('keydown', window.recorteKeyEscListener);
        window.recorteKeyEscListener = null;
    }
}

/**
 * Corta los píxeles seleccionados directamente de la imagen original del documento
 * (excluyendo líneas divisorias de columnas, límites, karaoke, guías u otros accesorios del canvas).
 */
async function procesarRecorteVisual(boxLeft, boxTop, boxRight, boxBottom) {
    const canvas = document.getElementById('lienzo-pdf');
    if (!canvas) {
        if (typeof liraAlert === 'function') liraAlert("No se encontró el lienzo del documento.");
        return;
    }

    const canvasRect = canvas.getBoundingClientRect();

    // Calcular intersección del recuadro trazado con el canvas del PDF
    const intersectLeft = Math.max(boxLeft, canvasRect.left);
    const intersectTop = Math.max(boxTop, canvasRect.top);
    const intersectRight = Math.min(boxRight, canvasRect.right);
    const intersectBottom = Math.min(boxBottom, canvasRect.bottom);

    const intersectWidth = intersectRight - intersectLeft;
    const intersectHeight = intersectBottom - intersectTop;

    // Validación de tamaño mínimo (al menos 15x15 px)
    if (intersectWidth < 15 || intersectHeight < 15) {
        return; // Fue un clic accidental o muy pequeño
    }

    // Escalar las coordenadas relativas al tamaño real del canvas (considera zoom y alta resolución)
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;

    const sx = (intersectLeft - canvasRect.left) * scaleX;
    const sy = (intersectTop - canvasRect.top) * scaleY;
    const sWidth = intersectWidth * scaleX;
    const sHeight = intersectHeight * scaleY;

    // Priorizar la imagen limpia y original del documento (datosPagina.imagen)
    // Esto garantiza que accesorios como líneas rojas de columnas, límites o resaltados no salgan en la captura.
    let fuenteGrafica = canvas;
    if (typeof datosPagina !== 'undefined' && datosPagina && datosPagina.imagen) {
        try {
            fuenteGrafica = await new Promise((resolve) => {
                const imgLimpia = new Image();
                imgLimpia.onload = () => resolve(imgLimpia);
                imgLimpia.onerror = () => resolve(canvas); // En caso de fallo, fallback seguro al canvas
                imgLimpia.src = datosPagina.imagen;
                if (imgLimpia.complete) resolve(imgLimpia);
            });
        } catch (err) {
            fuenteGrafica = canvas;
        }
    }

    // Dibujar en canvas auxiliar fuera de pantalla
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = sWidth;
    cropCanvas.height = sHeight;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(fuenteGrafica, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

    const dataUrl = cropCanvas.toDataURL('image/png');

    if (window.tutorialActivo && typeof window.onRecorteVisualTutorial === 'function') {
        window.onRecorteVisualTutorial(dataUrl);
        return;
    }

    window.recorteDataTemp = {
        dataUrl: dataUrl,
        pagina: typeof paginaActual !== 'undefined' ? paginaActual : 0,
        ruta: typeof rutaPDFActual !== 'undefined' ? rutaPDFActual : ""
    };

    abrirModalGuardarCaptura(dataUrl, window.recorteDataTemp.pagina);
}

let listenerModalGuardarTeclado = null;

/**
 * Abre el modal estilizado para asignar nombre/motivo a la captura antes de guardar.
 */
function abrirModalGuardarCaptura(dataUrl, paginaIdx) {
    const modal = document.getElementById('modal-guardar-captura');
    const previewImg = document.getElementById('preview-recorte-img');
    const inputTitulo = document.getElementById('input-titulo-captura');
    const lblPagina = document.getElementById('lbl-captura-pagina');
    const btnGuardar = document.getElementById('btn-confirmar-captura');

    if (!modal || !previewImg || !inputTitulo) return;

    previewImg.src = dataUrl;
    if (lblPagina) lblPagina.innerText = `Página ${paginaIdx + 1}`;
    inputTitulo.value = '';
    if (btnGuardar) {
        btnGuardar.disabled = false;
        btnGuardar.innerText = "Guardar Captura";
    }

    modal.style.display = 'flex';

    if (listenerModalGuardarTeclado) {
        window.removeEventListener('keydown', listenerModalGuardarTeclado, true);
    }
    listenerModalGuardarTeclado = (e) => {
        if (modal.style.display !== 'flex') return;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cerrarModalGuardarCaptura();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            confirmarGuardarCaptura();
        }
    };
    window.addEventListener('keydown', listenerModalGuardarTeclado, true);

    setTimeout(() => {
        inputTitulo.focus();
    }, 100);
}

function cerrarModalGuardarCaptura() {
    const modal = document.getElementById('modal-guardar-captura');
    if (modal) modal.style.display = 'none';
    if (listenerModalGuardarTeclado) {
        window.removeEventListener('keydown', listenerModalGuardarTeclado, true);
        listenerModalGuardarTeclado = null;
    }
    window.recorteDataTemp = null;
}

/**
 * Confirma el guardado enviando la imagen y metadatos a Python.
 */
async function confirmarGuardarCaptura() {
    if (!window.recorteDataTemp) {
        cerrarModalGuardarCaptura();
        return;
    }

    const inputTitulo = document.getElementById('input-titulo-captura');
    const btnGuardar = document.getElementById('btn-confirmar-captura');
    let titulo = inputTitulo ? inputTitulo.value.trim() : "";
    if (!titulo) {
        titulo = `Captura Pág. ${window.recorteDataTemp.pagina + 1}`;
    }

    const { ruta, pagina, dataUrl } = window.recorteDataTemp;

    // Verificar si el backend ya tiene cargada la función (requiere reinicio si la app estaba abierta)
    if (typeof eel === 'undefined' || typeof eel.guardar_captura_extraccion !== 'function') {
        cerrarModalGuardarCaptura();
        const msgAviso = "Para guardar capturas en el disco, por favor reinicia la aplicación una vez para que Python cargue el nuevo módulo de extracciones.";
        if (typeof liraAlert === 'function') {
            await liraAlert(msgAviso, 'advertencia');
        }
        return;
    }

    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.innerText = "Guardando...";
    }

    try {
        const res = await eel.guardar_captura_extraccion(ruta, pagina, titulo, dataUrl)();
        cerrarModalGuardarCaptura();

        if (res && res.success) {
            mostrarNotificacionToast("¡Captura guardada en el Gestor de Extracción!", 'exito');
            
            // Si el panel de extracción está abierto, actualizarlo en vivo
            const modalExt = document.getElementById('modal-subrayados');
            if (modalExt && modalExt.style.display !== 'none') {
                if (typeof cargarExtraccionesCompletas === 'function') {
                    cargarExtraccionesCompletas();
                }
            }
        } else {
            console.error("Error guardando captura en backend:", res?.error);
            if (typeof liraAlert === 'function') {
                liraAlert("No se pudo guardar la captura: " + (res?.error || "Error desconocido"), 'error');
            }
        }
    } catch (e) {
        console.error("Excepción al guardar captura:", e);
        cerrarModalGuardarCaptura();
        if (typeof liraAlert === 'function') {
            liraAlert("Error de conexión al guardar: " + e.message, 'error');
        }
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.innerText = "Guardar Captura";
        }
    }
}

/**
 * Carga unificada en el Gestor de Extracción: Subrayados de texto + Capturas visuales.
 */
async function cargarExtraccionesCompletas() {
    const container = document.getElementById('extracted-texts');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align:center; padding:30px 10px; color:#95a5a6; font-size:12px;">
            <div style="display:inline-block; width:22px; height:22px; border:3px solid #3498db; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
            <div style="margin-top:8px;">Cargando extracciones del libro...</div>
        </div>
    `;

    try {
        const ruta = typeof rutaPDFActual !== 'undefined' ? rutaPDFActual : "";
        let subrayados = [];
        let capturas = [];

        // 1. Obtener subrayados de texto
        if (typeof eel !== 'undefined' && typeof eel.obtener_todos_subrayados === 'function' && ruta) {
            try {
                const resSubs = await eel.obtener_todos_subrayados(ruta)();
                if (resSubs && resSubs.success && Array.isArray(resSubs.subrayados)) {
                    subrayados = resSubs.subrayados;
                }
            } catch (errSubs) {
                console.warn("Error cargando subrayados:", errSubs);
            }
        }

        // 2. Obtener capturas visuales
        if (typeof eel !== 'undefined' && typeof eel.obtener_capturas_libro === 'function') {
            try {
                const resCaps = await eel.obtener_capturas_libro(ruta)();
                if (resCaps && resCaps.success && Array.isArray(resCaps.capturas)) {
                    capturas = resCaps.capturas;
                }
            } catch (errCaps) {
                console.warn("Error cargando capturas visuales:", errCaps);
            }
        }

        // Inyectar datos en vivo del tutorial si está activo
        if (window.tutorialActivo) {
            // Eliminar versiones previas de demos que puedan estar en disco con imagen vacía
            capturas = capturas.filter(c => !String(c.id).startsWith('cap_demo_'));
            subrayados = subrayados.filter(s => !String(s.id).startsWith('sub_demo_'));

            if (window.demoCapturasTutorial && window.demoCapturasTutorial.length > 0) {
                window.demoCapturasTutorial.forEach(dc => {
                    if (!dc.data_url || !String(dc.data_url).startsWith('data:image')) {
                        if (typeof window.generarMiniaturaDiagramaDemo === 'function') {
                            dc.data_url = window.generarMiniaturaDiagramaDemo();
                            dc.img_src = dc.data_url;
                        }
                    }
                    capturas.unshift(dc);
                });
            }
            if (window.demoSubrayadosTutorial && window.demoSubrayadosTutorial.length > 0) {
                window.demoSubrayadosTutorial.forEach(ds => {
                    subrayados.unshift(ds);
                });
            }
        }

        // Actualizar contadores de las pestañas
        actualizarContadoresExtraccion(subrayados.length, capturas.length);

        container.innerHTML = '';

        if (subrayados.length === 0 && capturas.length === 0) {
            const iconoVacio = (typeof obtenerIconoDialogoSVG === 'function')
                ? obtenerIconoDialogoSVG('archivo')
                : '<svg class="lira-svg-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
            container.innerHTML = `
                <div class="extraccion-empty-state">
                    <div class="extraccion-empty-icon">${iconoVacio}</div>
                    <div class="extraccion-empty-title">No hay extracciones en este libro</div>
                    <div class="extraccion-empty-sub">Resalta textos con el subrayador o usa la herramienta de recorte (Alt+C) para guardar diagramas y algoritmos.</div>
                </div>
            `;
            return;
        }

        // Renderizar capturas visuales (más recientes primero)
        [...capturas].reverse().forEach(c => {
            renderizarTarjetaCaptura(c, container);
        });

        // Renderizar subrayados de texto
        [...subrayados].reverse().forEach(s => {
            if (typeof appendExtractedText === 'function') {
                appendExtractedText(s.texto, s.color, s.id, s.pagina);
            }
        });

        // Aplicar filtro de pestaña activo
        filtrarPorPestanaExtraccion(window.tabExtraccionActual);

    } catch (e) {
        console.error("Error en cargarExtraccionesCompletas:", e);
        container.innerHTML = `<div style="color:#e74c3c; font-size:11px; padding:15px;">Error al cargar extracciones: ${e.message}</div>`;
    }
}

/**
 * Renderiza una tarjeta de captura visual (algoritmo / diagrama / foto) en el panel.
 */
function renderizarTarjetaCaptura(item, container) {
    const card = document.createElement('div');
    card.id = `card_${item.id}`;
    card.className = 'text-card capture-card';
    card.dataset.tipo = 'captura';
    card.dataset.page = (item.pagina !== undefined ? (item.pagina + 1).toString() : '');
    card.dataset.color = '#3498DB';
    card.style.borderColor = '#3498db';
    card.style.borderLeftWidth = '4px';
    card.style.background = '#ffffff';
    card.style.padding = '10px 12px';
    card.style.borderRadius = '6px';
    card.style.boxShadow = '0 2px 5px rgba(0,0,0,0.04)';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '8px';

    // Cabecera de la tarjeta: Título e ícono
    const headerDiv = document.createElement('div');
    headerDiv.style.display = 'flex';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.alignItems = 'flex-start';
    headerDiv.style.gap = '8px';

    const titleSpan = document.createElement('div');
    titleSpan.style.fontWeight = '600';
    titleSpan.style.fontSize = '12px';
    titleSpan.style.color = '#2c3e50';
    titleSpan.style.lineHeight = '1.3';
    const cameraSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px; margin-right:4px; display:inline-block;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`;
    titleSpan.innerHTML = `${cameraSvg}${escapeHtml(item.titulo)}`;

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '&times;';
    deleteBtn.title = 'Eliminar captura';
    deleteBtn.style.background = 'none';
    deleteBtn.style.border = 'none';
    deleteBtn.style.color = '#bdc3c7';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.fontSize = '12px';
    deleteBtn.style.padding = '0 4px';
    deleteBtn.onmouseover = () => deleteBtn.style.color = '#e74c3c';
    deleteBtn.onmouseout = () => deleteBtn.style.color = '#bdc3c7';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        eliminarCaptura(item.id);
    };

    headerDiv.appendChild(titleSpan);
    headerDiv.appendChild(deleteBtn);

    // Contenedor de la miniatura de la imagen
    const imgWrapper = document.createElement('div');
    imgWrapper.style.width = '100%';
    imgWrapper.style.maxHeight = '160px';
    imgWrapper.style.overflow = 'hidden';
    imgWrapper.style.borderRadius = '4px';
    imgWrapper.style.border = '1px solid #ecf0f1';
    imgWrapper.style.cursor = 'zoom-in';
    imgWrapper.style.background = '#f9f9f9';
    imgWrapper.style.display = 'flex';
    imgWrapper.style.justifyContent = 'center';
    imgWrapper.style.alignItems = 'center';

    const img = document.createElement('img');
    const obtenerFallbackPng = () => {
        if (typeof window.generarMiniaturaDiagramaDemo === 'function') {
            return window.generarMiniaturaDiagramaDemo();
        }
        try {
            const c = document.createElement('canvas');
            c.width = 400;
            c.height = 140;
            const ctx = c.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(0, 0, 400, 140);
                ctx.strokeStyle = '#0284c7';
                ctx.lineWidth = 2;
                ctx.strokeRect(1, 1, 398, 138);
                ctx.fillStyle = '#0284c7';
                ctx.font = 'bold 13px system-ui, sans-serif';
                ctx.fillText(item?.titulo || "Diagrama Conceptual: Flujo de Aprendizaje", 18, 26);
                const boxes = ["1. Lectura", "2. Análisis", "3. Retención"];
                boxes.forEach((b, i) => {
                    const bx = 16 + i * 128;
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#cbd5e1';
                    ctx.lineWidth = 1.2;
                    ctx.fillRect(bx, 42, 110, 56);
                    ctx.strokeRect(bx, 42, 110, 56);
                    ctx.fillStyle = '#0f172a';
                    ctx.font = 'bold 11px system-ui, sans-serif';
                    ctx.fillText(b, bx + 16, 75);
                });
                return c.toDataURL('image/png');
            }
        } catch (e) {}
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90" viewBox="0 0 300 90"><rect width="300" height="90" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" rx="6"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="600" fill="#0284c7">Diagrama Conceptual: Flujo de Aprendizaje</text></svg>');
    };

    let srcImagen = (item.data_url && String(item.data_url).startsWith('data:image'))
        ? item.data_url
        : ((item.img_src && String(item.img_src).startsWith('data:image')) ? item.img_src : obtenerFallbackPng());

    img.src = srcImagen;
    img.alt = item.titulo || "Captura";
    img.onerror = () => {
        img.onerror = null;
        img.src = obtenerFallbackPng();
    };
    img.style.maxWidth = '100%';
    img.style.maxHeight = '160px';
    img.style.objectFit = 'contain';
    img.style.display = 'block';

    imgWrapper.onclick = (e) => {
        e.stopPropagation();
        abrirModalVerCaptura(srcImagen, item.titulo, item.pagina);
    };
    imgWrapper.appendChild(img);

    // Pie de la tarjeta: Página de origen + Botones de Copiar / Ir
    const footerDiv = document.createElement('div');
    footerDiv.style.display = 'flex';
    footerDiv.style.justifyContent = 'space-between';
    footerDiv.style.alignItems = 'center';
    footerDiv.style.fontSize = '11px';
    footerDiv.style.color = '#7f8c8d';

    const pageSpan = document.createElement('span');
    pageSpan.innerText = item.pagina !== undefined ? `Pág. ${item.pagina + 1}` : '';
    pageSpan.style.cursor = 'pointer';
    pageSpan.style.textDecoration = 'underline';
    pageSpan.title = 'Ir a esta página';
    pageSpan.onclick = (e) => {
        e.stopPropagation();
        if (typeof cargarPagina === 'function' && item.pagina !== undefined) {
            cargarPagina(item.pagina);
            if (typeof cerrarPanelSubrayados === 'function') cerrarPanelSubrayados();
        }
    };

    const actionDiv = document.createElement('div');
    actionDiv.style.display = 'flex';
    actionDiv.style.gap = '6px';

    const copyBtn = document.createElement('button');
    copyBtn.innerText = 'Copiar';
    copyBtn.title = 'Copiar imagen al portapapeles';
    copyBtn.style.border = '1px solid #dcdde1';
    copyBtn.style.background = '#f5f6fa';
    copyBtn.style.borderRadius = '4px';
    copyBtn.style.padding = '2px 8px';
    copyBtn.style.fontSize = '11px';
    copyBtn.style.cursor = 'pointer';
    copyBtn.onclick = async (e) => {
        e.stopPropagation();
        await copiarImagenPortapapeles(srcImagen);
        copyBtn.innerText = '¡Copiada!';
        setTimeout(() => { copyBtn.innerText = 'Copiar'; }, 2000);
    };

    actionDiv.appendChild(copyBtn);
    footerDiv.appendChild(pageSpan);
    footerDiv.appendChild(actionDiv);

    card.appendChild(headerDiv);
    card.appendChild(imgWrapper);
    card.appendChild(footerDiv);

    container.appendChild(card);
}

/**
 * Elimina una captura con confirmación.
 */
async function eliminarCaptura(idCaptura) {
    const confirmado = (typeof liraConfirm === 'function')
        ? await liraConfirm("¿Deseas eliminar esta captura del Gestor de Extracción?", 'borrar')
        : false;
    if (!confirmado) return;

    try {
        if (typeof eel !== 'undefined' && typeof eel.eliminar_captura_extraccion === 'function') {
            const res = await eel.eliminar_captura_extraccion(idCaptura)();
            if (res && res.success) {
                const card = document.getElementById(`card_${idCaptura}`);
                if (card) card.remove();
                mostrarNotificacionToast("Captura eliminada.", 'borrar');
            }
        }
    } catch (e) {
        console.error("Error al eliminar captura:", e);
    }
}

let listenerModalVerTeclado = null;

/**
 * Abre el visor modal en grande (Lightbox) para inspeccionar la imagen recortada.
 */
function abrirModalVerCaptura(imgSrc, titulo, pagina) {
    const modal = document.getElementById('modal-ver-captura');
    const imgEl = document.getElementById('lightbox-img-captura');
    const titEl = document.getElementById('lightbox-titulo-captura');
    const pagEl = document.getElementById('lightbox-pag-captura');
    const btnCopiar = document.getElementById('lightbox-btn-copiar');

    if (!modal || !imgEl) return;

    imgEl.src = imgSrc || '';
    if (titEl) titEl.innerText = titulo || 'Captura de pantalla';
    if (pagEl) pagEl.innerText = pagina !== undefined ? `Página ${pagina + 1}` : '';

    if (btnCopiar) {
        const setCopiarLabel = (texto) => {
            const spanTxt = btnCopiar.querySelector('#lightbox-btn-copiar-texto') || btnCopiar.querySelector('span');
            if (spanTxt) {
                spanTxt.textContent = texto;
            } else {
                const svg = (typeof obtenerIconoDialogoSVG === 'function') ? obtenerIconoDialogoSVG('portapapeles') : '';
                btnCopiar.innerHTML = `${svg} <span>${escapeHtml(texto)}</span>`;
            }
        };
        setCopiarLabel('Copiar Imagen');
        btnCopiar.onclick = async () => {
            await copiarImagenPortapapeles(imgSrc);
            setCopiarLabel('¡Copiada al portapapeles!');
            setTimeout(() => { setCopiarLabel('Copiar Imagen'); }, 2000);
        };
    }

    modal.style.display = 'flex';

    if (listenerModalVerTeclado) {
        window.removeEventListener('keydown', listenerModalVerTeclado, true);
    }
    listenerModalVerTeclado = (e) => {
        if (modal.style.display !== 'flex') return;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cerrarModalVerCaptura();
        }
    };
    window.addEventListener('keydown', listenerModalVerTeclado, true);
}

function cerrarModalVerCaptura() {
    const modal = document.getElementById('modal-ver-captura');
    if (modal) modal.style.display = 'none';
    if (listenerModalVerTeclado) {
        window.removeEventListener('keydown', listenerModalVerTeclado, true);
        listenerModalVerTeclado = null;
    }
}

/**
 * Copia un DataURL en formato PNG directamente al portapapeles del sistema operativo.
 */
async function copiarImagenPortapapeles(dataUrl) {
    try {
        if (!dataUrl) return;
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([
                new ClipboardItem({ [blob.type]: blob })
            ]);
            mostrarNotificacionToast("¡Imagen copiada al portapapeles!", 'portapapeles');
        } else {
            // Fallback: abrir imagen en pestaña nueva si portapapeles no está disponible
            window.open(dataUrl, '_blank');
        }
    } catch (err) {
        console.warn("Fallo al copiar imagen al portapapeles:", err);
        mostrarNotificacionToast("No se pudo copiar al portapapeles automáticamente.", 'advertencia');
    }
}

/**
 * Gestión de pestañas [ Todas ] [ Subrayados ] [ Capturas ]
 */
function cambiarTabExtraccion(tipoTab) {
    window.tabExtraccionActual = tipoTab;
    document.querySelectorAll('.tab-extraccion').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tipoTab);
    });
    filtrarPorPestanaExtraccion(tipoTab);
}

function filtrarPorPestanaExtraccion(tipoTab) {
    const cards = document.querySelectorAll('#extracted-texts .text-card');
    cards.forEach(card => {
        const esCaptura = card.classList.contains('capture-card') || card.dataset.tipo === 'captura';
        if (tipoTab === 'todas') {
            card.style.display = 'flex';
        } else if (tipoTab === 'textos') {
            card.style.display = esCaptura ? 'none' : 'block';
        } else if (tipoTab === 'capturas') {
            card.style.display = esCaptura ? 'flex' : 'none';
        }
    });

    // Re-aplicar filtro numérico de página si existe
    if (typeof aplicarFiltrosSubrayados === 'function') {
        aplicarFiltrosSubrayados();
    }
}

function actualizarContadoresExtraccion(numTextos, numCapturas) {
    const countTodas = document.getElementById('count-ext-todas');
    const countTextos = document.getElementById('count-ext-textos');
    const countCaps = document.getElementById('count-ext-capturas');

    if (countTodas) countTodas.innerText = `(${numTextos + numCapturas})`;
    if (countTextos) countTextos.innerText = `(${numTextos})`;
    if (countCaps) countCaps.innerText = `(${numCapturas})`;
}

function mostrarNotificacionToast(mensaje, icono) {
    if (typeof window.mostrarToast === 'function') {
        window.mostrarToast(mensaje, icono);
        return;
    }
    if (typeof window.mostrarToastLira === 'function') {
        window.mostrarToastLira(mensaje, icono);
    }
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
