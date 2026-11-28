window.zonaExcluidaHoverIndex = -1;
window.hoverTacheZonaExcluida = -1;

const _ESTILOS_ZONA_EXCLUSION = {
    temp: {
        fondo: "rgba(30, 41, 59, 0.22)",
        rayado: "rgba(51, 65, 85, 0.60)",
        rayadoAncho: 1.3,
        borde: "rgba(15, 23, 42, 0.95)",
        bordeAncho: 1.5,
        dash: [6, 4],
        sombra: null
    },
    hover: {
        fondo: "rgba(15, 23, 42, 0.28)",
        rayado: "rgba(51, 65, 85, 0.70)",
        rayadoAncho: 1.6,
        borde: "rgba(15, 23, 42, 1.0)",
        bordeAncho: 2.0,
        dash: [7, 3],
        sombra: { color: "rgba(15, 23, 42, 0.40)", blur: 5 }
    },
    normal: {
        fondo: "rgba(15, 23, 42, 0.16)",
        rayado: "rgba(71, 85, 105, 0.45)",
        rayadoAncho: 1.3,
        borde: "rgba(15, 23, 42, 0.85)",
        bordeAncho: 1.5,
        dash: [6, 4],
        sombra: null
    }
};

function _dibujarFondoYRayadoExclusion(ctx, bx0, by0, bw, bh, estilo) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx0, by0, bw, bh);
    ctx.clip();

    ctx.fillStyle = estilo.fondo;
    ctx.fillRect(bx0, by0, bw, bh);

    ctx.strokeStyle = estilo.rayado;
    ctx.lineWidth = estilo.rayadoAncho;
    ctx.setLineDash([]);

    const paso = 12;
    for (let lx = bx0 - bh; lx < bx0 + bw + paso; lx += paso) {
        ctx.beginPath();
        ctx.moveTo(lx, by0 + bh);
        ctx.lineTo(lx + bh, by0);
        ctx.stroke();
    }
    ctx.restore();
}

function _dibujarBordeExclusion(ctx, bx0, by0, bw, bh, estilo) {
    ctx.save();
    if (estilo.sombra) {
        ctx.shadowColor = estilo.sombra.color;
        ctx.shadowBlur = estilo.sombra.blur;
    }
    ctx.strokeStyle = estilo.borde;
    ctx.lineWidth = estilo.bordeAncho;
    ctx.setLineDash(estilo.dash);
    ctx.strokeRect(bx0 + 0.5, by0 + 0.5, bw, bh);
    ctx.restore();
}

function _dibujarManijasExclusion(ctx, bx0, by0, bw, bh, esHoverRecuadro) {
    const hSize = esHoverRecuadro ? 6.5 : 5.5;
    const half = hSize / 2;
    const puntos = [
        [bx0, by0], [bx0 + bw / 2, by0], [bx0 + bw, by0], [bx0 + bw, by0 + bh / 2],
        [bx0 + bw, by0 + bh], [bx0 + bw / 2, by0 + bh], [bx0, by0 + bh], [bx0, by0 + bh / 2]
    ];

    ctx.save();
    if (esHoverRecuadro) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
        ctx.shadowBlur = 3;
    }
    ctx.fillStyle = esHoverRecuadro ? "#ffffff" : "#f8fafc";
    ctx.strokeStyle = esHoverRecuadro ? "rgba(15, 23, 42, 0.95)" : "rgba(15, 23, 42, 0.75)";
    ctx.lineWidth = esHoverRecuadro ? 1.3 : 1.1;
    for (const [hx, hy] of puntos) {
        ctx.fillRect(hx - half, hy - half, hSize, hSize);
        ctx.strokeRect(hx - half, hy - half, hSize, hSize);
    }
    ctx.restore();
}

function _dibujarBotonEliminarExclusion(ctx, bx0, by0, bw, esHoverTache) {
    const btnRadio = esHoverTache ? 9.5 : 8.0;
    const btnCenterX = bx0 + bw - 11;
    const btnCenterY = by0 + 11;

    ctx.save();
    ctx.shadowColor = esHoverTache ? "rgba(239, 68, 68, 0.55)" : "rgba(0, 0, 0, 0.40)";
    ctx.shadowBlur = esHoverTache ? 8 : 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = esHoverTache ? "rgba(225, 29, 72, 0.96)" : "rgba(15, 23, 42, 0.92)";
    ctx.beginPath();
    ctx.arc(btnCenterX, btnCenterY, btnRadio, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = esHoverTache ? "rgba(255, 255, 255, 0.90)" : "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = esHoverTache ? 1.2 : 1.0;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = esHoverTache ? "#ffffff" : "rgba(226, 232, 240, 0.92)";
    ctx.lineWidth = esHoverTache ? 1.8 : 1.5;
    ctx.lineCap = "round";
    const arm = esHoverTache ? 3.5 : 2.8;
    ctx.beginPath();
    ctx.moveTo(btnCenterX - arm, btnCenterY - arm);
    ctx.lineTo(btnCenterX + arm, btnCenterY + arm);
    ctx.moveTo(btnCenterX + arm, btnCenterY - arm);
    ctx.lineTo(btnCenterX - arm, btnCenterY + arm);
    ctx.stroke();
    ctx.restore();
}

// Renderizado estético de zona de exclusión: velo translúcido, rayitas grises diagonales a 45°, borde intermitente y hover
function dibujarRecuadroExclusion(ctx, bx0, by0, bw, bh, esTemp = false, indiceZona = -1) {
    if (bw <= 0 || bh <= 0) return;

    const esHoverRecuadro = (!esTemp && window.zonaExcluidaHoverIndex === indiceZona);
    const esHoverTache = (!esTemp && window.hoverTacheZonaExcluida === indiceZona);
    const estilo = esTemp ? _ESTILOS_ZONA_EXCLUSION.temp : (esHoverRecuadro ? _ESTILOS_ZONA_EXCLUSION.hover : _ESTILOS_ZONA_EXCLUSION.normal);

    _dibujarFondoYRayadoExclusion(ctx, bx0, by0, bw, bh, estilo);
    _dibujarBordeExclusion(ctx, bx0, by0, bw, bh, estilo);

    if (!esTemp && bw >= 16 && bh >= 16) {
        _dibujarManijasExclusion(ctx, bx0, by0, bw, bh, esHoverRecuadro);
    }
    if (!esTemp && bw >= 24 && bh >= 18) {
        _dibujarBotonEliminarExclusion(ctx, bx0, by0, bw, esHoverTache);
    }
}
window.dibujarRecuadroExclusion = dibujarRecuadroExclusion;

window.arrastreZonaExcluida = null;

function _detectarHandleResizeZona(xCanvas, yCanvas, bx0, by0, bx1, by1, tol) {
    const cercaIzq = Math.abs(xCanvas - bx0) <= tol;
    const cercaDer = Math.abs(xCanvas - bx1) <= tol;
    const cercaArr = Math.abs(yCanvas - by0) <= tol;
    const cercaAba = Math.abs(yCanvas - by1) <= tol;
    const enX = xCanvas >= bx0 - tol && xCanvas <= bx1 + tol;
    const enY = yCanvas >= by0 - tol && yCanvas <= by1 + tol;

    const reglas = [
        [cercaIzq && cercaArr, 'nw', 'nwse-resize'],
        [cercaDer && cercaArr, 'ne', 'nesw-resize'],
        [cercaDer && cercaAba, 'se', 'nwse-resize'],
        [cercaIzq && cercaAba, 'sw', 'nesw-resize'],
        [cercaArr && enX, 'n', 'ns-resize'],
        [cercaAba && enX, 's', 'ns-resize'],
        [cercaIzq && enY, 'w', 'ew-resize'],
        [cercaDer && enY, 'e', 'ew-resize']
    ];
    for (const [cond, handle, cursor] of reglas) {
        if (cond) return { tipo: 'resize', handle, cursor };
    }
    return null;
}

function _evaluarInteraccionZonaIndividual(i, xCanvas, yCanvas, zBox, z, tol) {
    const bx0 = Math.min(zBox[0], zBox[2]) * z;
    const by0 = Math.min(zBox[1], zBox[3]) * z;
    const bx1 = Math.max(zBox[0], zBox[2]) * z;
    const by1 = Math.max(zBox[1], zBox[3]) * z;
    const bw = bx1 - bx0;
    const bh = by1 - by0;

    const distBtn = Math.hypot(xCanvas - (bx1 - 11), yCanvas - (by0 + 11));
    if (bw >= 24 && bh >= 18 && distBtn <= 13) {
        return { index: i, tipo: 'delete', cursor: 'pointer' };
    }

    const resize = _detectarHandleResizeZona(xCanvas, yCanvas, bx0, by0, bx1, by1, tol);
    if (resize) return { index: i, ...resize };

    if (xCanvas > bx0 + tol && xCanvas < bx1 - tol && yCanvas > by0 + tol && yCanvas < by1 - tol) {
        return { index: i, tipo: 'move', handle: 'move', cursor: 'move' };
    }
    return null;
}

function obtenerInteraccionZonaExcluida(xCanvas, yCanvas, z) {
    if (!Array.isArray(zonasExcluidas) || !datosPagina) return null;
    const tol = 8;
    for (let i = zonasExcluidas.length - 1; i >= 0; i--) {
        const zBox = zonasExcluidas[i];
        if (!zBox || zBox.length < 4) continue;
        const interaccion = _evaluarInteraccionZonaIndividual(i, xCanvas, yCanvas, zBox, z, tol);
        if (interaccion) return interaccion;
    }
    return null;
}
window.obtenerInteraccionZonaExcluida = obtenerInteraccionZonaExcluida;

function dibujarLinea(x1, y1, x2, y2, color, punteada) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = 3; if (punteada) ctx.setLineDash([10, 5]); else ctx.setLineDash([]); ctx.stroke(); ctx.setLineDash([]); }

