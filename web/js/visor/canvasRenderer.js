function hexToRGBA(hex, alpha) {
    let r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function _configurarDimensionesYRecorteCanvas() {
    canvas.width = datosPagina.ancho_img;
    canvas.height = datosPagina.alto_img;
    canvas.style.width = (datosPagina.ancho_img * nivelZoomPDF) + "px";
    canvas.style.height = (datosPagina.alto_img * nivelZoomPDF) + "px";

    const recorteActual = parseInt(document.getElementById('rng-recorte-pdf')?.value || 0);
    if (recorteActual > 0 && typeof aplicarRecorteDinamico === 'function') {
        requestAnimationFrame(() => aplicarRecorteDinamico(recorteActual));
        return;
    }
    const wrapper = document.getElementById('pdf-crop-wrapper');
    if (wrapper) { wrapper.style.width = ''; wrapper.style.height = ''; }
    canvas.style.position = '';
    canvas.style.left = '';
    canvas.style.top = '';
}

function _dibujarGuiaOracionCanvas(z, colorGuia, padGuia, offsetH, offsetV) {
    if (window.modoSoloLecturaActivo || !oracionActiva) return;
    ctx.fillStyle = hexToRGBA(colorGuia, 0.15);
    ctx.strokeStyle = hexToRGBA(colorGuia, 0.30);
    ctx.lineWidth = 1;

    let rectsADibujar = (oracionActiva.rects || []).filter(r => !(r[0] === 0 && r[1] === 0 && r[2] === 0 && r[3] === 0));
    if (rectsADibujar.length === 0 && oracionActiva.palabras?.length > 0) {
        rectsADibujar = oracionActiva.palabras.map(p => p.bbox).filter(Boolean);
    }
    for (const r of rectsADibujar) {
        const x = (r[0] * z) - padGuia + offsetH;
        const y = (r[1] * z) - padGuia + offsetV;
        const w = ((r[2] - r[0]) * z) + (padGuia * 2) - (offsetH * 2);
        const h = ((r[3] - r[1]) * z) + (padGuia * 2) - (offsetV * 2);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
    }
}

function _obtenerProgresoKaraoke() {
    const pAudio = (window.partituraActual && window.ultimoIdxAudio !== -1)
        ? window.partituraActual[window.ultimoIdxAudio] : null;
    const sub_i = (pAudio && typeof pAudio.sub_i === 'number') ? pAudio.sub_i : 0;
    const sub_t = (pAudio && typeof pAudio.sub_t === 'number' && pAudio.sub_t > 0) ? pAudio.sub_t : 1;
    return { sub_i, sub_t, progreso: window.progresoFraccional || 0 };
}

function _dibujarKaraokeCanvas(z, colorKaraoke, padKaraoke, modoLlenado, offsetH, offsetV) {
    if (window.modoSoloLecturaActivo || !window.palabraKaraoke?.bbox) return;
    const k = window.palabraKaraoke.bbox;
    const { sub_i, sub_t, progreso } = _obtenerProgresoKaraoke();

    const cjkSlice = window.palabraKaraoke._cjkSlice;
    const kStartX = cjkSlice ? (k[0] + (k[2] - k[0]) * cjkSlice.startFrac) : k[0];
    const kEndX = cjkSlice ? (k[0] + (k[2] - k[0]) * cjkSlice.endFrac) : k[2];
    const x0 = (kStartX * z) - padKaraoke + offsetH;
    const y0 = (k[1] * z) - padKaraoke + offsetV;
    const anchoTotal = ((kEndX - kStartX) * z) + (padKaraoke * 2) - (offsetH * 2);
    const altoTotal = ((k[3] - k[1]) * z) + (padKaraoke * 2) - (offsetV * 2);

    const anchoActual = modoLlenado
        ? (sub_i * (anchoTotal / sub_t)) + ((anchoTotal / sub_t) * progreso)
        : anchoTotal;

    ctx.fillStyle = hexToRGBA(colorKaraoke, 0.75);
    ctx.fillRect(x0, y0, anchoActual, altoTotal);
    if (modoLlenado) {
        ctx.strokeStyle = hexToRGBA(colorKaraoke, 1.0);
        ctx.lineWidth = 2;
        ctx.strokeRect(x0, y0, anchoActual, altoTotal);
    }
}

function _dibujarCajaGuiaTutorial(x, y, w, h, texto, opts = {}) {
    ctx.save();
    ctx.fillStyle = opts.fill || "rgba(34, 197, 94, 0.22)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(22, 163, 74, 0.95)";
    ctx.lineWidth = opts.lineWidth || 2;
    ctx.setLineDash(opts.dash || [8, 6]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    if (texto) {
        ctx.font = opts.font || "bold 13px system-ui, sans-serif";
        const pad = opts.pad || 16;
        const tw = ctx.measureText(texto).width + pad;
        const pillH = opts.pillH || 24;
        const tx = (opts.labelX !== undefined) ? opts.labelX - tw / 2 : (x + w / 2 - tw / 2);
        const ty = (opts.labelY !== undefined) ? opts.labelY : (y + h / 2 - pillH / 2);
        ctx.fillStyle = "#16a34a";
        ctx.fillRect(tx, ty, tw, pillH);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(texto, tx + pad / 2, ty + pillH - 8);
    }
    ctx.restore();
}

function _dibujarGuiasTutorialCanvas(z, vis) {
    if (!window.tutorialActivo) return;
    if (window.tutorialGuiaCorteV) {
        const g = window.tutorialGuiaCorteV;
        _dibujarCajaGuiaTutorial(g.min * z, vis.minY, (g.max - g.min) * z, vis.maxY - vis.minY, g.texto, {
            font: "bold 14px system-ui, sans-serif", pillH: 26, labelX: g.centro * z, labelY: Math.max(vis.minY, 0) + 90
        });
    }
    if (window.tutorialGuiaLimiteH) {
        const gh = window.tutorialGuiaLimiteH;
        const gxMin = gh.xMin !== undefined ? gh.xMin * z : vis.minX;
        const gxMax = gh.xMax !== undefined ? gh.xMax * z : vis.maxX;
        _dibujarCajaGuiaTutorial(gxMin, gh.min * z, gxMax - gxMin, (gh.max - gh.min) * z, gh.texto);
    }
    if (window.tutorialGuiaZonaExcluida) {
        const gz = window.tutorialGuiaZonaExcluida;
        _dibujarCajaGuiaTutorial(gz.x0 * z, gz.y0 * z, (gz.x1 - gz.x0) * z, (gz.y1 - gz.y0) * z, gz.texto, {
            fill: "rgba(34, 197, 94, 0.20)", lineWidth: 2.5, dash: [8, 5],
            font: "bold 12px system-ui, sans-serif", pad: 14, pillH: 22, labelY: gz.y0 * z - 26
        });
    }
}

function _normalizarObjCorteV(cv) {
    if (typeof cv === 'object' && cv !== null) {
        return { x: cv.x, yMin: cv.yMin !== undefined ? cv.yMin : 0, yMax: cv.yMax !== undefined ? cv.yMax : datosPagina.alto_pagina_pdf };
    }
    return { x: Number(cv), yMin: 0, yMax: datosPagina.alto_pagina_pdf };
}

function _esCorteVSeleccionado(i) {
    if (window.corteVSeleccionado === i) return true;
    return typeof arrastre !== 'undefined' && Boolean(arrastre) && arrastre.index === i
        && (arrastre.tipo === 'V' || arrastre.tipo === 'V_TOP' || arrastre.tipo === 'V_BOTTOM');
}

function _dibujarCortesVerticalesCanvas(z, vis) {
    for (let i = 0; i < cortesV.length; i++) {
        const objCV = _normalizarObjCorteV(cortesV[i]);
        const x = objCV.x * z;
        const y0_vis = Math.max(vis.minY, objCV.yMin * z);
        const y1_vis = Math.min(vis.maxY, objCV.yMax * z);
        const estaSeleccionado = _esCorteVSeleccionado(i);

        dibujarLinea(x, y0_vis, x, y1_vis, estaSeleccionado ? "rgba(255,40,40,0.95)" : "rgba(255,0,0,0.75)", true);

        const y_mid = (y0_vis + y1_vis) / 2;
        ctx.fillStyle = estaSeleccionado ? "#ff1f1f" : "red";
        ctx.fillRect(x - 9, y0_vis, 18, 14);
        ctx.fillRect(x - 8, y_mid - 8, 16, 16);
        ctx.fillRect(x - 9, y1_vis - 14, 18, 14);

        if (estaSeleccionado) {
            ctx.save();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.strokeRect(x - 9, y0_vis, 18, 14);
            ctx.strokeRect(x - 8, y_mid - 8, 16, 16);
            ctx.strokeRect(x - 9, y1_vis - 14, 18, 14);
            ctx.restore();
        }
    }
}

function _dibujarLimitesHorizontalesCanvas(z, vis, sortedV) {
    const numCols = cortesV.length > 0 ? cortesV.length + 1 : 1;
    for (let i = 0; i < numCols; i++) {
        const lim = limitesH[i.toString()];
        if (!lim) continue;
        const xMinVisual = Math.max(sortedV[i] * z, vis.minX);
        const xMaxVisual = Math.min(sortedV[i + 1] * z, vis.maxX);
        if (xMaxVisual <= xMinVisual) continue;

        const yTopReal = lim[0] * z;
        const yBottomReal = lim[1] * z;
        const yTopVisual = Math.max(vis.minY, yTopReal);
        const yBottomVisual = Math.min(vis.maxY, yBottomReal);

        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        const hTop = yTopReal > 0 ? Math.max(0, yTopReal - vis.minY) : 0;
        if (hTop > 0) ctx.fillRect(xMinVisual, vis.minY, xMaxVisual - xMinVisual, hTop);
        const hBot = yBottomReal < datosPagina.alto_pagina_pdf * z ? Math.max(0, vis.maxY - yBottomReal) : 0;
        if (hBot > 0) ctx.fillRect(xMinVisual, yBottomReal, xMaxVisual - xMinVisual, hBot);

        dibujarLinea(xMinVisual, yTopVisual, xMaxVisual, yTopVisual, "#00ccff", false);
        dibujarLinea(xMinVisual, yBottomVisual, xMaxVisual, yBottomVisual, "#00ccff", false);

        const handleTopY = Math.max(vis.minY, Math.min(vis.maxY - 20, yTopVisual - 10));
        const handleBotY = Math.min(vis.maxY - 20, Math.max(vis.minY, yBottomVisual - 10));
        ctx.fillStyle = "#00ccff";
        ctx.fillRect(xMinVisual, handleTopY, 40, 20);
        ctx.fillRect(xMaxVisual - 40, handleBotY, 40, 20);
    }
}

function _dibujarZonasExcluidasCanvas(z) {
    if (Array.isArray(zonasExcluidas)) {
        for (let i = 0; i < zonasExcluidas.length; i++) {
            const zBox = zonasExcluidas[i];
            if (!zBox || zBox.length < 4) continue;
            dibujarRecuadroExclusion(
                ctx, Math.min(zBox[0], zBox[2]) * z, Math.min(zBox[1], zBox[3]) * z,
                Math.abs(zBox[2] - zBox[0]) * z, Math.abs(zBox[3] - zBox[1]) * z, false, i
            );
        }
    }
    if (window.zonaExcluidaTemp) {
        const tmp = window.zonaExcluidaTemp;
        dibujarRecuadroExclusion(
            ctx, Math.min(tmp.x0, tmp.x1) * z, Math.min(tmp.y0, tmp.y1) * z,
            Math.abs(tmp.x1 - tmp.x0) * z, Math.abs(tmp.y1 - tmp.y0) * z, true, -1
        );
    }
}

function _renderizarEscenaCanvas(img) {
    _configurarDimensionesYRecorteCanvas();
    ctx.drawImage(img, 0, 0);
    const z = datosPagina.factor_zoom;

    const colorGuia = document.getElementById('color-guia-oracion')?.value || "#00b4ff";
    const padGuia = parseInt(document.getElementById('rng-pad-guia')?.value || 2);
    const colorKaraoke = document.getElementById('color-resaltado')?.value || "#ffff00";
    const padKaraoke = parseInt(document.getElementById('rng-pad-karaoke')?.value || 2);
    const modoLlenado = document.getElementById('chk-llenado-fluido')?.checked;

    const lblGuia = document.getElementById('val-pad-guia');
    if (lblGuia) lblGuia.innerText = padGuia + "px";
    const lblKar = document.getElementById('val-pad-karaoke');
    if (lblKar) lblKar.innerText = padKaraoke + "px";

    _dibujarGuiaOracionCanvas(z, colorGuia, padGuia, 1, 2.5);
    _dibujarKaraokeCanvas(z, colorKaraoke, padKaraoke, modoLlenado, 1, 2.5);

    if (palabraHover && (!window.modoSoloLecturaActivo || window.modoSubrayadorActivo)) {
        const b = palabraHover.bbox;
        ctx.fillStyle = "rgba(255, 200, 0, 0.30)";
        ctx.fillRect(b[0] * z, b[1] * z, (b[2] - b[0]) * z, (b[3] - b[1]) * z);
    }
    aplicarResaltadoBuscador(ctx, z);

    if (window.modoSoloLecturaActivo) return;
    if (typeof window.limpiarCapaTextoSoloLectura === 'function') window.limpiarCapaTextoSoloLectura();

    const vis = obtenerLimitesVisiblesRecorte();
    const sortedV = [0, ...cortesV.map(c => _normalizarObjCorteV(c).x).sort((a, b) => a - b), datosPagina.ancho_pagina_pdf];
    _dibujarGuiasTutorialCanvas(z, vis);
    _dibujarCortesVerticalesCanvas(z, vis);
    _dibujarLimitesHorizontalesCanvas(z, vis, sortedV);
    _dibujarZonasExcluidasCanvas(z);
}

function dibujar() {
    if (!datosPagina) return;
    if (window.imagenCacheadaCanvas && window.imagenCacheadaSrc === datosPagina.imagen) {
        _renderizarEscenaCanvas(window.imagenCacheadaCanvas);
        return;
    }
    const img = new Image();
    img.onload = () => {
        window.imagenCacheadaCanvas = img;
        window.imagenCacheadaSrc = datosPagina.imagen;
        _renderizarEscenaCanvas(img);
    };
    img.src = datosPagina.imagen;
}

