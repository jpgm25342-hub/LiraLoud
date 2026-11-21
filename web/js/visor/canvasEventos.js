window.isDraggingSubrayador = false;
window.startIndexSubrayado = -1;
window.currentIndexSubrayado = -1;
window.handleJustClicked = false;
window.creandoZonaExcluida = false;
window.zonaExcluidaTemp = null;
window.puntoInicioZona = null;

canvas.addEventListener('mousedown', (e) => {
    // Alt + Clic izquierdo: Iniciar dibujo de Zona Excluida (Caja Negra)
    if (e.altKey && e.button === 0 && datosPagina) {
        let rect = canvas.getBoundingClientRect(); 
        let x = (e.clientX - rect.left) * (canvas.width / rect.width); 
        let y = (e.clientY - rect.top) * (canvas.height / rect.height); 
        let z = datosPagina.factor_zoom;
        window.creandoZonaExcluida = true;
        window.puntoInicioZona = { x: x / z, y: y / z };
        window.zonaExcluidaTemp = { x0: x / z, y0: y / z, x1: x / z, y1: y / z };
        arrastre = { tipo: null, index: -1 };
        e.preventDefault();
        e.stopPropagation();
        return;
    }

    // Comprobar interacción con zonas excluidas existentes (eliminar, redimensionar o mover)
    if (Array.isArray(zonasExcluidas) && e.button === 0 && datosPagina) {
        let rect = canvas.getBoundingClientRect(); 
        let x = (e.clientX - rect.left) * (canvas.width / rect.width); 
        let y = (e.clientY - rect.top) * (canvas.height / rect.height); 
        let z = datosPagina.factor_zoom;
        let inter = obtenerInteraccionZonaExcluida(x, y, z);
        if (inter) {
            if (inter.tipo === 'delete') {
                zonasExcluidas.splice(inter.index, 1);
                window.zonaExcluidaHoverIndex = -1;
                window.hoverTacheZonaExcluida = -1;
                guardarEstadoPaginaActual();
                if (typeof window.mostrarToast === 'function') {
                    window.mostrarToast("Zona excluida eliminada", "borrar");
                } else if (typeof mostrarToastLira === 'function') {
                    mostrarToastLira("Zona excluida eliminada", "borrar");
                }
                cargarPagina(paginaActual);
                e.preventDefault();
                e.stopPropagation();
                return;
            } else if (inter.tipo === 'resize' || inter.tipo === 'move') {
                window.arrastreZonaExcluida = {
                    index: inter.index,
                    tipo: inter.tipo,
                    handle: inter.handle,
                    origBox: [...zonasExcluidas[inter.index]],
                    startX: x / z,
                    startY: y / z
                };
                arrastre = { tipo: null, index: -1 };
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }
    }

    if (window.modoSubrayadorActivo) {
        if (e.button === 0) { // Clic izquierdo
            window.isDraggingSubrayador = true;
            if (palabraHover) {
                window.startIndexSubrayado = datosPagina.palabras.indexOf(palabraHover);
                window.currentIndexSubrayado = window.startIndexSubrayado;
            } else {
                window.startIndexSubrayado = -1;
                window.currentIndexSubrayado = -1;
            }
            if (typeof iniciarTrazoSubrayado === 'function') iniciarTrazoSubrayado();
            if (typeof procesarPalabraSubrayado === 'function') procesarPalabraSubrayado();
            return;
        } else if (e.button === 2) { // Clic derecho (Borrado puntual)
            let rect = canvas.getBoundingClientRect(); 
            let x = (e.clientX - rect.left) * (canvas.width / rect.width); 
            let y = (e.clientY - rect.top) * (canvas.height / rect.height); 
            let z = datosPagina.factor_zoom;
            if (typeof borrarSubrayadoPuntual === 'function') borrarSubrayadoPuntual(x / z, y / z);
            return;
        }
    } else if (window.modoBorradorActivo) {
        if (e.button === 0 || e.button === 2) {
            let rect = canvas.getBoundingClientRect(); 
            let x = (e.clientX - rect.left) * (canvas.width / rect.width); 
            let y = (e.clientY - rect.top) * (canvas.height / rect.height); 
            let z = datosPagina.factor_zoom;
            if (typeof borrarSubrayadoPuntual === 'function') borrarSubrayadoPuntual(x / z, y / z);
            return;
        }
    }
    if (!datosPagina) return; 
    let rect = canvas.getBoundingClientRect(); 
    let x = (e.clientX - rect.left) * (canvas.width / rect.width); 
    let y = (e.clientY - rect.top) * (canvas.height / rect.height); 
    let z = datosPagina.factor_zoom;
    const vis = obtenerLimitesVisiblesRecorte();

    // 1. Manijas y líneas de columnas verticales (V)
    for (let i = 0; i < cortesV.length; i++) {
        let cv = cortesV[i];
        let cvX = (typeof cv === 'object' && cv !== null ? cv.x : Number(cv)) * z;
        let y0_vis = Math.max(vis.minY, (typeof cv === 'object' && cv !== null && cv.yMin !== undefined ? cv.yMin : 0) * z);
        let y1_vis = Math.min(vis.maxY, (typeof cv === 'object' && cv !== null && cv.yMax !== undefined ? cv.yMax : datosPagina.alto_pagina_pdf) * z);

        if (Math.abs(x - cvX) < 18) {
            // Clic en extremo superior (para mover yMin hacia arriba o abajo)
            if (Math.abs(y - y0_vis) < 16) {
                arrastre = { tipo: 'V_TOP', index: i };
                window.handleJustClicked = true;
                setTimeout(() => { window.handleJustClicked = false; }, 150);
                return;
            }
            // Clic en extremo inferior (para mover yMax hacia arriba o abajo)
            if (Math.abs(y - y1_vis) < 16) {
                arrastre = { tipo: 'V_BOTTOM', index: i };
                window.handleJustClicked = true;
                setTimeout(() => { window.handleJustClicked = false; }, 150);
                return;
            }
            // Clic sobre el cuerpo de la línea (para moverla horizontalmente)
            if (y >= y0_vis - 5 && y <= y1_vis + 5) {
                arrastre = { tipo: 'V', index: i };
                window.handleJustClicked = true;
                setTimeout(() => { window.handleJustClicked = false; }, 150);
                return;
            }
        }
    }

    // 2. Manijas y líneas de límites horizontales (H)
    let sortedV = [0, ...cortesV.map(c => (typeof c === 'object' && c !== null ? c.x : Number(c))).sort((a, b) => a - b), datosPagina.ancho_pagina_pdf]; 
    let numCols = cortesV.length > 0 ? cortesV.length + 1 : 1; 
    for (let i = 0; i < numCols; i++) { 
        let key = i.toString(); 
        let limits = limitesH[key]; 
        if (!limits) continue; 
        let xMin = sortedV[i] * z; 
        let xMax = sortedV[i + 1] * z; 
        let xMinVisual = Math.max(xMin, vis.minX);
        let xMaxVisual = Math.min(xMax, vis.maxX);
        if (xMaxVisual <= xMinVisual) continue;

        let yTopReal = limits[0] * z; 
        let yBottomReal = limits[1] * z; 
        let yTopVisual = Math.max(vis.minY, yTopReal);
        let yBottomVisual = Math.min(vis.maxY, yBottomReal);

        let handleTopY = Math.max(vis.minY, Math.min(vis.maxY - 20, yTopVisual - 10));
        let handleBotY = Math.min(vis.maxY - 20, Math.max(vis.minY, yBottomVisual - 10));

        // Permite presionar y arrastrar en la manija o a lo largo de toda la línea superior
        if (x >= xMinVisual - 10 && x <= xMaxVisual + 10 && (Math.abs(y - yTopVisual) < 18 || Math.abs(y - (handleTopY + 10)) < 22)) { 
            arrastre = { tipo: 'H', colKey: key, cual: 0 }; 
            window.handleJustClicked = true;
            setTimeout(() => { window.handleJustClicked = false; }, 150);
            return; 
        } 
        // Permite presionar y arrastrar en la manija o a lo largo de toda la línea inferior
        if (x >= xMinVisual - 10 && x <= xMaxVisual + 10 && (Math.abs(y - yBottomVisual) < 18 || Math.abs(y - (handleBotY + 10)) < 22)) { 
            arrastre = { tipo: 'H', colKey: key, cual: 1 }; 
            window.handleJustClicked = true;
            setTimeout(() => { window.handleJustClicked = false; }, 150);
            return; 
        } 
    }
});
canvas.addEventListener('mousemove', (e) => {
    if (!datosPagina) return; 
    let rect = canvas.getBoundingClientRect(); 
    let x = (e.clientX - rect.left) * (canvas.width / rect.width); 
    let y = (e.clientY - rect.top) * (canvas.height / rect.height); 
    let z = datosPagina.factor_zoom;
    const vis = obtenerLimitesVisiblesRecorte();

    // Si estamos dibujando una zona excluida con Alt
    if (window.creandoZonaExcluida && window.puntoInicioZona) {
        const visor = document.getElementById('visor-container');
        if (visor) {
            const vRect = visor.getBoundingClientRect();
            if (e.clientY > vRect.bottom - 45) {
                visor.scrollTop += 16;
            } else if (e.clientY < vRect.top + 45) {
                visor.scrollTop -= 16;
            }
        }
        let curPdfX = Math.max(0, Math.min(datosPagina.ancho_pagina_pdf, x / z));
        let curPdfY = Math.max(0, Math.min(datosPagina.alto_pagina_pdf, y / z));
        window.zonaExcluidaTemp = {
            x0: window.puntoInicioZona.x,
            y0: window.puntoInicioZona.y,
            x1: curPdfX,
            y1: curPdfY
        };
        dibujar();
        return;
    }

    // Si estamos redimensionando o moviendo una zona excluida existente
    if (window.arrastreZonaExcluida) {
        let info = window.arrastreZonaExcluida;
        let curPdfX = x / z;
        let curPdfY = y / z;
        let dx = curPdfX - info.startX;
        let dy = curPdfY - info.startY;
        let [origX0, origY0, origX1, origY1] = info.origBox;
        let minX = Math.min(origX0, origX1);
        let maxX = Math.max(origX0, origX1);
        let minY = Math.min(origY0, origY1);
        let maxY = Math.max(origY0, origY1);
        let maxPdfW = datosPagina.ancho_pagina_pdf;
        let maxPdfH = datosPagina.alto_pagina_pdf;

        let newBox = [minX, minY, maxX, maxY];

        if (info.tipo === 'move') {
            let bw = maxX - minX;
            let bh = maxY - minY;
            let nx = Math.max(0, Math.min(maxPdfW - bw, minX + dx));
            let ny = Math.max(0, Math.min(maxPdfH - bh, minY + dy));
            newBox = [nx, ny, nx + bw, ny + bh];
        } else if (info.tipo === 'resize') {
            let h = info.handle;
            let nx0 = minX, ny0 = minY, nx1 = maxX, ny1 = maxY;
            if (h.includes('w')) nx0 = Math.max(0, Math.min(maxX - 8, minX + dx));
            if (h.includes('e')) nx1 = Math.max(minX + 8, Math.min(maxPdfW, maxX + dx));
            if (h.includes('n')) ny0 = Math.max(0, Math.min(maxY - 8, minY + dy));
            if (h.includes('s')) ny1 = Math.max(minY + 8, Math.min(maxPdfH, maxY + dy));
            newBox = [nx0, ny0, nx1, ny1];
        }

        zonasExcluidas[info.index] = newBox;
        dibujar();
        return;
    }

    if (arrastre.tipo === 'V') { 
        let minX_pdf = (vis.minX + 20) / z;
        let maxX_pdf = (vis.maxX - 20) / z;
        let valX = Math.max(minX_pdf, Math.min(maxX_pdf, x / z));
        let cur = cortesV[arrastre.index];
        if (typeof cur === 'object' && cur !== null) {
            cur.x = valX;
        } else {
            cortesV[arrastre.index] = { x: valX, yMin: 0, yMax: datosPagina.alto_pagina_pdf };
        }
        dibujar(); 
        return; 
    } 
    if (arrastre.tipo === 'V_TOP') {
        let cur = cortesV[arrastre.index];
        if (typeof cur !== 'object' || cur === null) {
            cur = { x: Number(cur), yMin: 0, yMax: datosPagina.alto_pagina_pdf };
            cortesV[arrastre.index] = cur;
        }
        let valY = Math.max(0, Math.min(cur.yMax - 20, y / z));
        cur.yMin = valY;
        dibujar();
        return;
    }
    if (arrastre.tipo === 'V_BOTTOM') {
        let cur = cortesV[arrastre.index];
        if (typeof cur !== 'object' || cur === null) {
            cur = { x: Number(cur), yMin: 0, yMax: datosPagina.alto_pagina_pdf };
            cortesV[arrastre.index] = cur;
        }
        let valY = Math.max(cur.yMin + 20, Math.min(datosPagina.alto_pagina_pdf, y / z));
        cur.yMax = valY;
        dibujar();
        return;
    } 
    if (arrastre.tipo === 'H') { 
        let maxPdfH = datosPagina.alto_pagina_pdf;
        let targetKeys = e.shiftKey ? Object.keys(limitesH || {}) : [arrastre.colKey];
        if (targetKeys.length === 0) targetKeys = [arrastre.colKey];
        for (let k of targetKeys) {
            if (!limitesH[k]) continue;
            if (arrastre.cual === 0) {
                if (y <= vis.minY + 15) {
                    limitesH[k][0] = 0;
                } else {
                    let val = y / z;
                    let maxVal = (limitesH[k][1] || maxPdfH) - 15;
                    limitesH[k][0] = Math.max(0, Math.min(maxVal, val));
                }
            } else {
                if (y >= vis.maxY - 15) {
                    limitesH[k][1] = maxPdfH;
                } else {
                    let val = y / z;
                    let minVal = (limitesH[k][0] || 0) + 15;
                    limitesH[k][1] = Math.max(minVal, Math.min(maxPdfH, val));
                }
            }
        }
        dibujar(); 
        return; 
    }

    // Feedback de cursor sobre manijas y líneas
    let hoveredHandle = false;
    if (!arrastre.tipo && !window.modoSubrayadorActivo && !window.modoBorradorActivo) {
        // Manijas y líneas verticales
        for (let i = 0; i < cortesV.length; i++) {
            let cv = cortesV[i];
            let cvX = (typeof cv === 'object' && cv !== null ? cv.x : Number(cv)) * z;
            let y0_vis = Math.max(vis.minY, (typeof cv === 'object' && cv !== null && cv.yMin !== undefined ? cv.yMin : 0) * z);
            let y1_vis = Math.min(vis.maxY, (typeof cv === 'object' && cv !== null && cv.yMax !== undefined ? cv.yMax : datosPagina.alto_pagina_pdf) * z);

            if (Math.abs(x - cvX) < 18) {
                if (Math.abs(y - y0_vis) < 16 || Math.abs(y - y1_vis) < 16) {
                    canvas.style.cursor = 'row-resize';
                    hoveredHandle = true;
                    break;
                }
                if (y >= y0_vis - 5 && y <= y1_vis + 5) {
                    canvas.style.cursor = 'col-resize';
                    hoveredHandle = true;
                    break;
                }
            }
        }
        // Manijas y líneas horizontales
        if (!hoveredHandle) {
            // Helper para normalizar cortesV (número plano u objeto con rango vertical)
        const obtenerObjCorteV = (cv) => {
            if (typeof cv === 'object' && cv !== null) {
                return {
                    x: cv.x,
                    yMin: cv.yMin !== undefined ? cv.yMin : 0,
                    yMax: cv.yMax !== undefined ? cv.yMax : datosPagina.alto_pagina_pdf
                };
            }
            return { x: Number(cv), yMin: 0, yMax: datosPagina.alto_pagina_pdf };
        };

        let sortedV = [0, ...cortesV.map(c => (typeof c === 'object' && c !== null ? c.x : Number(c))).sort((a, b) => a - b), datosPagina.ancho_pagina_pdf];

            let numCols = cortesV.length > 0 ? cortesV.length + 1 : 1;
            for (let i = 0; i < numCols; i++) {
                let key = i.toString();
                let limits = limitesH[key];
                if (!limits) continue;
                let xMin = sortedV[i] * z;
                let xMax = sortedV[i + 1] * z;
                let xMinVisual = Math.max(xMin, vis.minX);
                let xMaxVisual = Math.min(xMax, vis.maxX);
                if (xMaxVisual <= xMinVisual) continue;

                let yTopReal = limits[0] * z;
                let yBottomReal = limits[1] * z;
                let yTopVisual = Math.max(vis.minY, yTopReal);
                let yBottomVisual = Math.min(vis.maxY, yBottomReal);

                let handleTopY = Math.max(vis.minY, Math.min(vis.maxY - 20, yTopVisual - 10));
                let handleBotY = Math.min(vis.maxY - 20, Math.max(vis.minY, yBottomVisual - 10));

                if (x >= xMinVisual - 10 && x <= xMaxVisual + 10 && (Math.abs(y - yTopVisual) < 18 || Math.abs(y - (handleTopY + 10)) < 22)) {
                    canvas.style.cursor = 'row-resize';
                    hoveredHandle = true;
                    break;
                }
                if (x >= xMinVisual - 10 && x <= xMaxVisual + 10 && (Math.abs(y - yBottomVisual) < 18 || Math.abs(y - (handleBotY + 10)) < 22)) {
                    canvas.style.cursor = 'row-resize';
                    hoveredHandle = true;
                    break;
                }
            }
        }
    }

    // Comprobar interacción con zonas excluidas (botón ✕, manijas de redimensión o interior)
    let interaccionZona = null;
    if (Array.isArray(zonasExcluidas) && datosPagina && !arrastre.tipo) {
        interaccionZona = obtenerInteraccionZonaExcluida(x, y, z);
    }

    let nuevoHoverRecuadro = interaccionZona ? interaccionZona.index : -1;
    let nuevoHoverTache = (interaccionZona && interaccionZona.tipo === 'delete') ? interaccionZona.index : -1;
    let huboCambioHoverZona = (window.zonaExcluidaHoverIndex !== nuevoHoverRecuadro || window.hoverTacheZonaExcluida !== nuevoHoverTache);
    if (huboCambioHoverZona) {
        window.zonaExcluidaHoverIndex = nuevoHoverRecuadro;
        window.hoverTacheZonaExcluida = nuevoHoverTache;
    }

    let mejor = null; 
    if (!hoveredHandle && !interaccionZona) {
        let distMin = 9999; 
        for (let p of datosPagina.palabras) { 
            let bx0 = p.bbox[0] * z, by0 = p.bbox[1] * z, bx1 = p.bbox[2] * z, by1 = p.bbox[3] * z; 
            let cx = (bx0 + bx1) / 2; let cy = (by0 + by1) / 2; 
            let dist = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2)); 
            if (dist < 50 && x >= bx0 && x <= bx1 && y >= by0 && y <= by1) { 
                if (dist < distMin) { distMin = dist; mejor = p; } 
            } 
        }
    }

    if (e.altKey && !window.modoCuadroTextoActivo) {
        canvas.style.cursor = 'crosshair';
    } else if (interaccionZona && !window.modoCuadroTextoActivo) {
        canvas.style.cursor = interaccionZona.cursor;
    } else if (!hoveredHandle && !window.modoCuadroTextoActivo) {
        if (window.modoSubrayadorActivo || window.modoBorradorActivo) {
            if (typeof window.actualizarCursorSubrayador === 'function') {
                window.actualizarCursorSubrayador();
            }
        } else {
            canvas.style.cursor = mejor ? 'pointer' : 'default';
        }
    }

    if (mejor !== palabraHover || huboCambioHoverZona) { 
        palabraHover = mejor; 
        dibujar(); 
        if (window.isDraggingSubrayador && typeof procesarPalabraSubrayado === 'function') {
            if (palabraHover) {
                window.currentIndexSubrayado = datosPagina.palabras.indexOf(palabraHover);
            }
            procesarPalabraSubrayado();
        }
    }
});

canvas.addEventListener('mouseleave', () => {
    let necesitaRedibujar = false;
    if (window.zonaExcluidaHoverIndex !== -1 || window.hoverTacheZonaExcluida !== -1) {
        window.zonaExcluidaHoverIndex = -1;
        window.hoverTacheZonaExcluida = -1;
        necesitaRedibujar = true;
    }
    const menuCtx = document.getElementById('menu-contextual');
    const menuAbierto = menuCtx && menuCtx.style.display === 'block';
    if (!menuAbierto && palabraHover !== null) {
        palabraHover = null;
        necesitaRedibujar = true;
    }
    if (necesitaRedibujar) {
        dibujar();
    }
});
window.addEventListener('mouseup', () => {
    // Si se estaba redimensionando o moviendo una zona excluida existente
    if (window.arrastreZonaExcluida) {
        let idx = window.arrastreZonaExcluida.index;
        window.arrastreZonaExcluida = null;
        if (zonasExcluidas && zonasExcluidas[idx]) {
            let [x0, y0, x1, y1] = zonasExcluidas[idx];
            let xMin = Math.round(Math.min(x0, x1));
            let xMax = Math.round(Math.max(x0, x1));
            let yMin = Math.round(Math.min(y0, y1));
            let yMax = Math.round(Math.max(y0, y1));
            if (xMax - xMin > 8 && yMax - yMin > 8) {
                zonasExcluidas[idx] = [xMin, yMin, xMax, yMax];
            }
            if (window.tutorialActivo) {
                dibujar();
                return;
            }
            guardarEstadoPaginaActual();
            cargarPagina(paginaActual);
        }
        return;
    }

    if (window.creandoZonaExcluida) {
        window.creandoZonaExcluida = false;
        if (window.zonaExcluidaTemp) {
            let xMin = Math.min(window.zonaExcluidaTemp.x0, window.zonaExcluidaTemp.x1);
            let xMax = Math.max(window.zonaExcluidaTemp.x0, window.zonaExcluidaTemp.x1);
            let yMin = Math.min(window.zonaExcluidaTemp.y0, window.zonaExcluidaTemp.y1);
            let yMax = Math.max(window.zonaExcluidaTemp.y0, window.zonaExcluidaTemp.y1);

            let w = xMax - xMin;
            let h = yMax - yMin;

            if (w > 8 && h > 8) {
                if (!Array.isArray(zonasExcluidas)) zonasExcluidas = [];
                zonasExcluidas.push([
                    Math.round(xMin),
                    Math.round(yMin),
                    Math.round(xMax),
                    Math.round(yMax)
                ]);
                if (window.tutorialActivo) {
                    window.zonaExcluidaTemp = null;
                    window.puntoInicioZona = null;
                    dibujar();
                    return;
                }
                guardarEstadoPaginaActual();
                if (typeof window.mostrarToast === 'function') {
                    window.mostrarToast("Zona excluida creada (texto omitido de lectura)", "prohibido");
                } else if (typeof mostrarToastLira === 'function') {
                    mostrarToastLira("Zona excluida creada (texto omitido de lectura)", "prohibido");
                }
                cargarPagina(paginaActual);
            }
        }
        window.zonaExcluidaTemp = null;
        window.puntoInicioZona = null;
        dibujar();
        return;
    }
    if (window.isDraggingSubrayador) {
        window.isDraggingSubrayador = false;
        if (typeof finalizarTrazoSubrayado === 'function') finalizarTrazoSubrayado();
    }
    if (window.isRightClickErasing) {
        window.isRightClickErasing = false;
        if (typeof finalizarTrazoBorrado === 'function') finalizarTrazoBorrado();
    }
    if (arrastre && arrastre.tipo) {
        let tipoArrastre = arrastre.tipo;
        arrastre = { tipo: null, index: -1 };
        if (tipoArrastre === 'H') {
            let pagKey = paginaActual.toString();
            if (!memoriaLayout[pagKey]) {
                memoriaLayout[pagKey] = {};
            }
            memoriaLayout[pagKey].limitesHManual = true;
        } else if (tipoArrastre === 'V' || tipoArrastre === 'V_TOP' || tipoArrastre === 'V_BOTTOM') {
            let pagKey = paginaActual.toString();
            if (!memoriaLayout[pagKey]) {
                memoriaLayout[pagKey] = {};
            }
            memoriaLayout[pagKey].configuradaManualmente = true;
        }
        if (window.tutorialActivo) {
            dibujar();
            return;
        }
        guardarEstadoPaginaActual(); // Guardar al soltar
        if (typeof cargarPagina === 'function') {
            cargarPagina(paginaActual);
        }
    }
});

// Soporte de rueda del mouse (wheel) para hacer scroll mientras se marca con Alt
canvas.addEventListener('wheel', (e) => {
    if (window.creandoZonaExcluida && datosPagina) {
        let rect = canvas.getBoundingClientRect();
        let z = datosPagina.factor_zoom;
        let curX = (e.clientX - rect.left) * (canvas.width / rect.width);
        let curY = (e.clientY - rect.top) * (canvas.height / rect.height);
        if (window.zonaExcluidaTemp) {
            window.zonaExcluidaTemp.x1 = Math.max(0, Math.min(datosPagina.ancho_pagina_pdf, curX / z));
            window.zonaExcluidaTemp.y1 = Math.max(0, Math.min(datosPagina.alto_pagina_pdf, curY / z));
            dibujar();
        }
    }
}, { passive: true });

canvas.addEventListener('contextmenu', (e) => {
    // Si se hace clic derecho sobre una zona excluida, eliminarla directamente
    if (Array.isArray(zonasExcluidas) && datosPagina) {
        let rect = canvas.getBoundingClientRect(); 
        let x = (e.clientX - rect.left) * (canvas.width / rect.width); 
        let y = (e.clientY - rect.top) * (canvas.height / rect.height); 
        let z = datosPagina.factor_zoom;
        let pdfX = x / z, pdfY = y / z;
        for (let i = zonasExcluidas.length - 1; i >= 0; i--) {
            let zBox = zonasExcluidas[i];
            if (!zBox || zBox.length < 4) continue;
            let x0 = Math.min(zBox[0], zBox[2]), x1 = Math.max(zBox[0], zBox[2]);
            let y0 = Math.min(zBox[1], zBox[3]), y1 = Math.max(zBox[1], zBox[3]);
            if (pdfX >= x0 && pdfX <= x1 && pdfY >= y0 && pdfY <= y1) {
                e.preventDefault();
                e.stopPropagation();
                zonasExcluidas.splice(i, 1);
                window.zonaExcluidaHoverIndex = -1;
                window.hoverTacheZonaExcluida = -1;
                guardarEstadoPaginaActual();
                if (typeof window.mostrarToast === 'function') {
                    window.mostrarToast("Zona excluida eliminada", "borrar");
                } else if (typeof mostrarToastLira === 'function') {
                    mostrarToastLira("Zona excluida eliminada", "borrar");
                }
                cargarPagina(paginaActual);
                return;
            }
        }
    }

    if (window.modoSubrayadorActivo || window.modoBorradorActivo) {
        e.preventDefault();
    }
});
canvas.addEventListener('click', (e) => {
    const menuCtx = document.getElementById('menu-contextual');
    if (menuCtx && menuCtx.style.display === 'block') {
        menuCtx.style.display = 'none';
    }

    // Si estamos en modo subrayador o borrador, ignoramos el clic para no activar lectura
    if (window.modoSubrayadorActivo || window.modoBorradorActivo) return;

    // Si estamos arrastrando una columna o acabamos de pulsar una manija, ignoramos el clic para evitar saltos accidentales
    if (arrastre.tipo || window.handleJustClicked) return;

    // Si el clic cayó dentro de una zona excluida, ignorar lectura
    if (Array.isArray(zonasExcluidas) && datosPagina && e) {
        let rect = canvas.getBoundingClientRect(); 
        let x = (e.clientX - rect.left) * (canvas.width / rect.width); 
        let y = (e.clientY - rect.top) * (canvas.height / rect.height); 
        let z = datosPagina.factor_zoom;
        let pdfX = x / z, pdfY = y / z;
        for (let zBox of zonasExcluidas) {
            if (!zBox || zBox.length < 4) continue;
            let x0 = Math.min(zBox[0], zBox[2]), x1 = Math.max(zBox[0], zBox[2]);
            let y0 = Math.min(zBox[1], zBox[3]), y1 = Math.max(zBox[1], zBox[3]);
            if (pdfX >= x0 && pdfX <= x1 && pdfY >= y0 && pdfY <= y1) {
                return;
            }
        }
    }

    if (palabraHover) {
        // 1. GESTIÓN DE PANELES (Modales activos)
        let panelDicc = document.getElementById('modal-diccionario');
        const modalTeatro = document.getElementById('modal-teatro');
        const modalNotas = document.getElementById('modal-notas');
        const panelNotaRapida = document.getElementById('panel-nota-rapida');

        if ((modalNotas && modalNotas.style.display === 'flex') || (panelNotaRapida && panelNotaRapida.style.display === 'flex')) {
            return; // Bloqueamos lectura si las notas están activas
        }

        // --- 1.1 LÓGICA DEL DICCIONARIO DE ABREVIATURAS ---
        if (panelDicc && panelDicc.style.display === 'flex') {
            let inpS = document.getElementById('input-significado');
            let inpK = document.getElementById('input-sigla');
            if (inpK.value === "") {
                inpK.value = palabraHover.texto;
                inpK.focus();
            } else {
                inpS.value = inpS.value ? inpS.value + " " + palabraHover.texto : palabraHover.texto;
                inpS.focus();
            }
            return; // Bloqueamos lectura si el diccionario está operando
        }

        // --- 1.2 LÓGICA DE CAPTURA PARA MODO TEATRO (Azulito) ---
        else if (modalTeatro && modalTeatro.style.display === 'flex') {
            let inpP = document.getElementById('input-personaje');
            // Limpieza de grado clínico: eliminamos puntuación y forzamos el marcador "Nombre:"
            let nombreLimpio = palabraHover.texto.replace(/[:.,;]/g, "").trim();
            inpP.value = nombreLimpio + ":";
            inpP.focus();

            // Retornamos para evitar que dispare la lectura del PDF durante el cásting
            return;
        }

        // --- 2. LÓGICA DE LECTURA (Solo si los paneles están cerrados) ---
        else {
            let idx = buscarOracionPorGeometria(palabraHover);
            if (idx !== -1) {

                // --- ✂️ LA GUILLOTINA (Corte inmediato de seguridad) ---
                // A) Detener motor Piper y temporizadores
                if (window.piperQueueTimer) clearInterval(window.piperQueueTimer);
                try { eel.detener_streaming_backend()(); } catch (e) { }

                // B) Cancelar síntesis del navegador (Sistema)
                if (window.synth) synth.cancel();

                // C) MATAR EL SONIDO FÍSICO (Active Sources)
                // Detenemos cada fuente de audio activa para evitar el "eco" o solapamiento
                if (window.activeAudioSources && window.activeAudioSources.length > 0) {
                    window.activeAudioSources.forEach(src => {
                        try { src.stop(); } catch (e) { }
                    });
                    window.activeAudioSources = [];
                }

                // D) Invalidar sesión para evitar que chunks viejos se reproduzcan
                if (typeof window.currentReadingSession === 'undefined') window.currentReadingSession = 0;
                window.currentReadingSession++;

                // 3. INICIAR NUEVA SECUENCIA (Restaurando cualquier recorte previo de "Leer desde aquí")
                if (typeof window.restaurarOracionesRecortadas === 'function') {
                    window.restaurarOracionesRecortadas();
                }
                window._oracionRecortadaActivaIdx = -1;
                window.palabraPausada = null;
                leyendo = true;
                reproducirSecuencia(idx);
            }
        }
    }
});



canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();

    // Solo si hay palabra seleccionada y NO estamos arrastrando
    if (palabraHover && !arrastre.tipo) {
        const palabraSeleccionada = { ...palabraHover };
        window.palabraContextual = palabraSeleccionada;

        let menu = document.getElementById('menu-contextual');
        menu.style.display = 'block';
        menu.style.left = e.pageX + 'px';
        menu.style.top = e.pageY + 'px';

        // --- BOTÓN LEER ---
        let btnLeer = document.getElementById('opcion-leer');
        let clonLeer = btnLeer.cloneNode(true);
        btnLeer.parentNode.replaceChild(clonLeer, btnLeer);

        clonLeer.onclick = (evt) => {
            // 🛡️ EL ESCUDO: Detiene el evento aquí. No baja al canvas.
            if (evt) {
                evt.stopPropagation();
                evt.stopImmediatePropagation();
            }
            menu.style.display = 'none';
            const objetivo = palabraSeleccionada || window.palabraContextual || palabraHover;
            if (objetivo) {
                empezarDesdePalabra(objetivo);
            }
        };

        // --- BOTÓN DICCIONARIO ---
        let btnDic = document.getElementById('opcion-agregar-dicc');
        let clonDic = btnDic.cloneNode(true);
        btnDic.parentNode.replaceChild(clonDic, btnDic);

        clonDic.onclick = (evt) => {
            if (evt) {
                evt.stopPropagation();
                evt.stopImmediatePropagation();
            }
            menu.style.display = 'none';
            const objetivo = palabraSeleccionada || window.palabraContextual || palabraHover;
            if (objetivo && objetivo.texto) {
                abrirDiccionarioConPalabra(objetivo.texto);
            }
        };
    }
});

