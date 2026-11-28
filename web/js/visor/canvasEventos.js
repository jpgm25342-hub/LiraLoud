window.isDraggingSubrayador = false;
window.startIndexSubrayado = -1;
window.currentIndexSubrayado = -1;
window.handleJustClicked = false;
window.creandoZonaExcluida = false;
window.zonaExcluidaTemp = null;
window.puntoInicioZona = null;
window.corteVSeleccionado = -1;

function _obtenerCoordsCanvasEvento(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const z = datosPagina.factor_zoom;
    return { x, y, z, pdfX: x / z, pdfY: y / z };
}

function _notificarToastCanvas(msg, icono) {
    if (typeof window.mostrarToast === 'function') {
        window.mostrarToast(msg, icono);
    } else if (typeof mostrarToastLira === 'function') {
        mostrarToastLira(msg, icono);
    }
}

function _eliminarZonaExcluidaEnIndice(index) {
    zonasExcluidas.splice(index, 1);
    window.zonaExcluidaHoverIndex = -1;
    window.hoverTacheZonaExcluida = -1;
    guardarEstadoPaginaActual();
    _notificarToastCanvas("Zona excluida eliminada", "borrar");
    cargarPagina(paginaActual);
}

function _asegurarObjCorteV(index) {
    let cur = cortesV[index];
    if (typeof cur !== 'object' || cur === null) {
        cur = { x: Number(cur), yMin: 0, yMax: datosPagina.alto_pagina_pdf };
        cortesV[index] = cur;
    }
    return cur;
}

function _marcarHandleRecienPulsada() {
    window.handleJustClicked = true;
    setTimeout(() => { window.handleJustClicked = false; }, 150);
}

function _detectarHitCorteV(x, y, z, vis) {
    for (let i = 0; i < cortesV.length; i++) {
        const cv = cortesV[i];
        const esObj = typeof cv === 'object' && cv !== null;
        const cvX = (esObj ? cv.x : Number(cv)) * z;
        const y0Vis = Math.max(vis.minY, (esObj && cv.yMin !== undefined ? cv.yMin : 0) * z);
        const y1Vis = Math.min(vis.maxY, (esObj && cv.yMax !== undefined ? cv.yMax : datosPagina.alto_pagina_pdf) * z);
        if (Math.abs(x - cvX) >= 18) continue;
        if (Math.abs(y - y0Vis) < 16) return { tipo: 'V_TOP', index: i, cursor: 'row-resize' };
        if (Math.abs(y - y1Vis) < 16) return { tipo: 'V_BOTTOM', index: i, cursor: 'row-resize' };
        if (y >= y0Vis - 5 && y <= y1Vis + 5) return { tipo: 'V', index: i, cursor: 'col-resize' };
    }
    return null;
}

function _detectarHitLimiteH(x, y, z, vis) {
    const sortedV = [
        0,
        ...cortesV.map(c => (typeof c === 'object' && c !== null ? c.x : Number(c))).sort((a, b) => a - b),
        datosPagina.ancho_pagina_pdf
    ];
    const numCols = cortesV.length > 0 ? cortesV.length + 1 : 1;
    for (let i = 0; i < numCols; i++) {
        const key = i.toString();
        const limits = limitesH[key];
        if (!limits) continue;
        const xMinVis = Math.max(sortedV[i] * z, vis.minX);
        const xMaxVis = Math.min(sortedV[i + 1] * z, vis.maxX);
        if (xMaxVis <= xMinVis || x < xMinVis - 10 || x > xMaxVis + 10) continue;

        const yTopVis = Math.max(vis.minY, limits[0] * z);
        const yBotVis = Math.min(vis.maxY, limits[1] * z);
        const handleTopY = Math.max(vis.minY, Math.min(vis.maxY - 20, yTopVis - 10));
        const handleBotY = Math.min(vis.maxY - 20, Math.max(vis.minY, yBotVis - 10));

        if (Math.abs(y - yTopVis) < 18 || Math.abs(y - (handleTopY + 10)) < 22) {
            return { tipo: 'H', colKey: key, cual: 0 };
        }
        if (Math.abs(y - yBotVis) < 18 || Math.abs(y - (handleBotY + 10)) < 22) {
            return { tipo: 'H', colKey: key, cual: 1 };
        }
    }
    return null;
}

function _buscarIndiceZonaExcluidaEnPunto(pdfX, pdfY) {
    if (!Array.isArray(zonasExcluidas)) return -1;
    for (let i = zonasExcluidas.length - 1; i >= 0; i--) {
        const zBox = zonasExcluidas[i];
        if (!zBox || zBox.length < 4) continue;
        const x0 = Math.min(zBox[0], zBox[2]), x1 = Math.max(zBox[0], zBox[2]);
        const y0 = Math.min(zBox[1], zBox[3]), y1 = Math.max(zBox[1], zBox[3]);
        if (pdfX >= x0 && pdfX <= x1 && pdfY >= y0 && pdfY <= y1) return i;
    }
    return -1;
}

function _manejarMouseDownZonaExcluida(e, coords) {
    if (e.altKey && e.button === 0) {
        window.creandoZonaExcluida = true;
        window.puntoInicioZona = { x: coords.pdfX, y: coords.pdfY };
        window.zonaExcluidaTemp = { x0: coords.pdfX, y0: coords.pdfY, x1: coords.pdfX, y1: coords.pdfY };
        arrastre = { tipo: null, index: -1 };
        e.preventDefault();
        e.stopPropagation();
        return true;
    }
    if (!Array.isArray(zonasExcluidas) || e.button !== 0) return false;
    const inter = obtenerInteraccionZonaExcluida(coords.x, coords.y, coords.z);
    if (!inter) return false;

    if (inter.tipo === 'delete') {
        _eliminarZonaExcluidaEnIndice(inter.index);
    } else if (inter.tipo === 'resize' || inter.tipo === 'move') {
        window.arrastreZonaExcluida = {
            index: inter.index,
            tipo: inter.tipo,
            handle: inter.handle,
            origBox: [...zonasExcluidas[inter.index]],
            startX: coords.pdfX,
            startY: coords.pdfY
        };
        arrastre = { tipo: null, index: -1 };
    } else {
        return false;
    }
    e.preventDefault();
    e.stopPropagation();
    return true;
}

function _manejarMouseDownSubrayadorOBorrador(e, coords) {
    if (window.modoSubrayadorActivo) {
        if (e.button === 0) {
            window.isDraggingSubrayador = true;
            window.startIndexSubrayado = palabraHover ? datosPagina.palabras.indexOf(palabraHover) : -1;
            window.currentIndexSubrayado = window.startIndexSubrayado;
            if (typeof iniciarTrazoSubrayado === 'function') iniciarTrazoSubrayado();
            if (typeof procesarPalabraSubrayado === 'function') procesarPalabraSubrayado();
            return true;
        }
        if (e.button === 2) {
            if (typeof borrarSubrayadoPuntual === 'function') borrarSubrayadoPuntual(coords.pdfX, coords.pdfY);
            return true;
        }
        return false;
    }
    if (window.modoBorradorActivo && (e.button === 0 || e.button === 2)) {
        if (typeof borrarSubrayadoPuntual === 'function') borrarSubrayadoPuntual(coords.pdfX, coords.pdfY);
        return true;
    }
    return false;
}

canvas.addEventListener('mousedown', (e) => {
    if (!datosPagina) return;
    const coords = _obtenerCoordsCanvasEvento(e);
    if (_manejarMouseDownZonaExcluida(e, coords)) return;
    if (_manejarMouseDownSubrayadorOBorrador(e, coords)) return;

    const vis = obtenerLimitesVisiblesRecorte();
    const hitV = _detectarHitCorteV(coords.x, coords.y, coords.z, vis);
    if (hitV) {
        arrastre = { tipo: hitV.tipo, index: hitV.index };
        window.corteVSeleccionado = hitV.index;
        _marcarHandleRecienPulsada();
        dibujar();
        return;
    }

    if (window.corteVSeleccionado !== -1) {
        window.corteVSeleccionado = -1;
        dibujar();
    }

    const hitH = _detectarHitLimiteH(coords.x, coords.y, coords.z, vis);
    if (hitH) {
        arrastre = hitH;
        _marcarHandleRecienPulsada();
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (!datosPagina) return;
    const { x, y, z } = _obtenerCoordsCanvasEvento(e);
    const vis = obtenerLimitesVisiblesRecorte();

    if (window.creandoZonaExcluida && window.puntoInicioZona) {
        const visor = document.getElementById('visor-container');
        if (visor) {
            const vRect = visor.getBoundingClientRect();
            if (e.clientY > vRect.bottom - 45) visor.scrollTop += 16;
            else if (e.clientY < vRect.top + 45) visor.scrollTop -= 16;
        }
        window.zonaExcluidaTemp = {
            x0: window.puntoInicioZona.x,
            y0: window.puntoInicioZona.y,
            x1: Math.max(0, Math.min(datosPagina.ancho_pagina_pdf, x / z)),
            y1: Math.max(0, Math.min(datosPagina.alto_pagina_pdf, y / z))
        };
        dibujar();
        return;
    }

    if (window.arrastreZonaExcluida) {
        const info = window.arrastreZonaExcluida;
        const dx = (x / z) - info.startX;
        const dy = (y / z) - info.startY;
        const [origX0, origY0, origX1, origY1] = info.origBox;
        const minX = Math.min(origX0, origX1), maxX = Math.max(origX0, origX1);
        const minY = Math.min(origY0, origY1), maxY = Math.max(origY0, origY1);
        const maxPdfW = datosPagina.ancho_pagina_pdf;
        const maxPdfH = datosPagina.alto_pagina_pdf;

        let newBox = [minX, minY, maxX, maxY];
        if (info.tipo === 'move') {
            const bw = maxX - minX, bh = maxY - minY;
            const nx = Math.max(0, Math.min(maxPdfW - bw, minX + dx));
            const ny = Math.max(0, Math.min(maxPdfH - bh, minY + dy));
            newBox = [nx, ny, nx + bw, ny + bh];
        } else if (info.tipo === 'resize') {
            const h = info.handle;
            const nx0 = h.includes('w') ? Math.max(0, Math.min(maxX - 8, minX + dx)) : minX;
            const nx1 = h.includes('e') ? Math.max(minX + 8, Math.min(maxPdfW, maxX + dx)) : maxX;
            const ny0 = h.includes('n') ? Math.max(0, Math.min(maxY - 8, minY + dy)) : minY;
            const ny1 = h.includes('s') ? Math.max(minY + 8, Math.min(maxPdfH, maxY + dy)) : maxY;
            newBox = [nx0, ny0, nx1, ny1];
        }
        zonasExcluidas[info.index] = newBox;
        dibujar();
        return;
    }

    if (arrastre.tipo === 'V') {
        const valX = Math.max((vis.minX + 20) / z, Math.min((vis.maxX - 20) / z, x / z));
        _asegurarObjCorteV(arrastre.index).x = valX;
        dibujar();
        return;
    }
    if (arrastre.tipo === 'V_TOP' || arrastre.tipo === 'V_BOTTOM') {
        const cur = _asegurarObjCorteV(arrastre.index);
        if (arrastre.tipo === 'V_TOP') cur.yMin = Math.max(0, Math.min(cur.yMax - 20, y / z));
        else cur.yMax = Math.max(cur.yMin + 20, Math.min(datosPagina.alto_pagina_pdf, y / z));
        dibujar();
        return;
    }
    if (arrastre.tipo === 'H') {
        const maxPdfH = datosPagina.alto_pagina_pdf;
        let targetKeys = e.shiftKey ? Object.keys(limitesH || {}) : [arrastre.colKey];
        if (targetKeys.length === 0) targetKeys = [arrastre.colKey];
        for (const k of targetKeys) {
            if (!limitesH[k]) continue;
            if (arrastre.cual === 0) {
                limitesH[k][0] = y <= vis.minY + 15 ? 0 : Math.max(0, Math.min((limitesH[k][1] || maxPdfH) - 15, y / z));
            } else {
                limitesH[k][1] = y >= vis.maxY - 15 ? maxPdfH : Math.max((limitesH[k][0] || 0) + 15, Math.min(maxPdfH, y / z));
            }
        }
        dibujar();
        return;
    }

    let hoveredHandle = false;
    if (!arrastre.tipo && !window.modoSubrayadorActivo && !window.modoBorradorActivo) {
        const hitV = _detectarHitCorteV(x, y, z, vis);
        if (hitV) {
            canvas.style.cursor = hitV.cursor;
            hoveredHandle = true;
        } else if (_detectarHitLimiteH(x, y, z, vis)) {
            canvas.style.cursor = 'row-resize';
            hoveredHandle = true;
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
                const idxHover = datosPagina.palabras.indexOf(palabraHover);
                if (window.startIndexSubrayado === -1) {
                    window.startIndexSubrayado = idxHover;
                }
                window.currentIndexSubrayado = idxHover;
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
        if (typeof recalcularLayoutPaginaActual === 'function') {
            recalcularLayoutPaginaActual();
        } else {
            guardarEstadoPaginaActual();
            if (typeof cargarPagina === 'function') cargarPagina(paginaActual);
        }
    }
});

// Soporte de rueda del mouse (wheel) para hacer scroll mientras se marca con Alt
canvas.addEventListener('wheel', (e) => {
    if (window.creandoZonaExcluida && datosPagina && window.zonaExcluidaTemp) {
        const { pdfX, pdfY } = _obtenerCoordsCanvasEvento(e);
        window.zonaExcluidaTemp.x1 = Math.max(0, Math.min(datosPagina.ancho_pagina_pdf, pdfX));
        window.zonaExcluidaTemp.y1 = Math.max(0, Math.min(datosPagina.alto_pagina_pdf, pdfY));
        dibujar();
    }
}, { passive: true });

canvas.addEventListener('contextmenu', (e) => {
    if (datosPagina) {
        const { pdfX, pdfY } = _obtenerCoordsCanvasEvento(e);
        const idxZona = _buscarIndiceZonaExcluidaEnPunto(pdfX, pdfY);
        if (idxZona !== -1) {
            e.preventDefault();
            e.stopPropagation();
            _eliminarZonaExcluidaEnIndice(idxZona);
            return;
        }
    }
    if (window.modoSubrayadorActivo || window.modoBorradorActivo) e.preventDefault();
});

canvas.addEventListener('click', (e) => {
    const menuCtx = document.getElementById('menu-contextual');
    if (menuCtx && menuCtx.style.display === 'block') menuCtx.style.display = 'none';
    if (window.modoSubrayadorActivo || window.modoBorradorActivo) return;
    if (arrastre.tipo || window.handleJustClicked) return;

    if (datosPagina && e) {
        const { pdfX, pdfY } = _obtenerCoordsCanvasEvento(e);
        if (_buscarIndiceZonaExcluidaEnPunto(pdfX, pdfY) !== -1) return;
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

        // --- 2. LÓGICA DE LECTURA (Solo si los paneles están cerrados y NO estamos en Modo Solo Lectura) ---
        else if (!window.modoSoloLecturaActivo) {
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

