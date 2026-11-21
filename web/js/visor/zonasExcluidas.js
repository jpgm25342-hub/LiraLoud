window.zonaExcluidaHoverIndex = -1;
window.hoverTacheZonaExcluida = -1;

// Renderizado estético de zona de exclusión: velo translúcido, rayitas grises diagonales a 45°, borde intermitente y hover
function dibujarRecuadroExclusion(ctx, bx0, by0, bw, bh, esTemp = false, indiceZona = -1) {
    if (bw <= 0 || bh <= 0) return;

    let esHoverRecuadro = (!esTemp && window.zonaExcluidaHoverIndex === indiceZona);
    let esHoverTache = (!esTemp && window.hoverTacheZonaExcluida === indiceZona);

    ctx.save();

    // 1. Recorte para que el rayado diagonal quede exactamente dentro del recuadro
    ctx.beginPath();
    ctx.rect(bx0, by0, bw, bh);
    ctx.clip();

    // 2. Fondo translúcido sutil (más marcado en hover del recuadro)
    if (esTemp) {
        ctx.fillStyle = "rgba(30, 41, 59, 0.22)";
    } else if (esHoverRecuadro) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.28)";
    } else {
        ctx.fillStyle = "rgba(15, 23, 42, 0.16)";
    }
    ctx.fillRect(bx0, by0, bw, bh);

    // 3. Relleno de rayitas grises en diagonal dejando espacios (45 grados)
    if (esTemp) {
        ctx.strokeStyle = "rgba(51, 65, 85, 0.60)";
        ctx.lineWidth = 1.3;
    } else if (esHoverRecuadro) {
        ctx.strokeStyle = "rgba(51, 65, 85, 0.70)";
        ctx.lineWidth = 1.6;
    } else {
        ctx.strokeStyle = "rgba(71, 85, 105, 0.45)";
        ctx.lineWidth = 1.3;
    }
    ctx.setLineDash([]);

    let paso = 12; // Espacio entre rayitas diagonales
    let inicioX = bx0 - bh;
    let finX = bx0 + bw + paso;
    for (let lx = inicioX; lx < finX; lx += paso) {
        ctx.beginPath();
        ctx.moveTo(lx, by0 + bh);
        ctx.lineTo(lx + bh, by0);
        ctx.stroke();
    }
    ctx.restore();

    // 4. Borde exterior con líneas intermitentes estilo ------ (gris negruzco / carbón oscuro)
    ctx.save();
    if (esTemp) {
        ctx.strokeStyle = "rgba(15, 23, 42, 0.95)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]); // Estilo ------
    } else if (esHoverRecuadro) {
        ctx.shadowColor = "rgba(15, 23, 42, 0.40)";
        ctx.shadowBlur = 5;
        ctx.strokeStyle = "rgba(15, 23, 42, 1.0)";
        ctx.lineWidth = 2.0;
        ctx.setLineDash([7, 3]);
    } else {
        ctx.strokeStyle = "rgba(15, 23, 42, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]); // Estilo ------
    }
    ctx.strokeRect(bx0 + 0.5, by0 + 0.5, bw, bh);
    ctx.restore();

    // 5. Manijas visuales de redimensionamiento (8 puntos de anclaje)
    if (!esTemp && bw >= 16 && bh >= 16) {
        let hSize = esHoverRecuadro ? 6.5 : 5.5;
        let half = hSize / 2;
        let puntos = [
            [bx0, by0],                  // NO
            [bx0 + bw / 2, by0],         // N
            [bx0 + bw, by0],             // NE
            [bx0 + bw, by0 + bh / 2],    // E
            [bx0 + bw, by0 + bh],        // SE
            [bx0 + bw / 2, by0 + bh],    // S
            [bx0, by0 + bh],             // SO
            [bx0, by0 + bh / 2]          // O
        ];

        ctx.save();
        if (esHoverRecuadro) {
            ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
            ctx.shadowBlur = 3;
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "rgba(15, 23, 42, 0.95)";
            ctx.lineWidth = 1.3;
        } else {
            ctx.fillStyle = "#f8fafc";
            ctx.strokeStyle = "rgba(15, 23, 42, 0.75)";
            ctx.lineWidth = 1.1;
        }
        for (let [hx, hy] of puntos) {
            ctx.fillRect(hx - half, hy - half, hSize, hSize);
            ctx.strokeRect(hx - half, hy - half, hSize, hSize);
        }
        ctx.restore();
    }

    // 6. Botón [✕] moderno, circular e integrado armónicamente con la estética del recuadro negro
    if (!esTemp && bw >= 24 && bh >= 18) {
        let btnRadio = esHoverTache ? 9.5 : 8.0;
        let btnCenterX = bx0 + bw - 11;
        let btnCenterY = by0 + 11;

        ctx.save();

        if (esHoverTache) {
            // Sombra y resplandor al posar el cursor sobre la tache
            ctx.shadowColor = "rgba(239, 68, 68, 0.55)";
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;
            // Fondo rojo carmín moderno
            ctx.fillStyle = "rgba(225, 29, 72, 0.96)";
        } else {
            // Sombra sutil de elevación
            ctx.shadowColor = "rgba(0, 0, 0, 0.40)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;
            // Fondo carbón oscuro acorde al diseño del recuadro
            ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
        }

        // Círculo base de la tache
        ctx.beginPath();
        ctx.arc(btnCenterX, btnCenterY, btnRadio, 0, Math.PI * 2);
        ctx.fill();

        // Borde circular integrado
        ctx.strokeStyle = esHoverTache ? "rgba(255, 255, 255, 0.90)" : "rgba(255, 255, 255, 0.28)";
        ctx.lineWidth = esHoverTache ? 1.2 : 1.0;
        ctx.stroke();

        ctx.restore();

        // Icono '✕' trazado vectorialmente con esquinas redondeadas
        ctx.save();
        ctx.strokeStyle = esHoverTache ? "#ffffff" : "rgba(226, 232, 240, 0.92)";
        ctx.lineWidth = esHoverTache ? 1.8 : 1.5;
        ctx.lineCap = "round";

        let arm = esHoverTache ? 3.5 : 2.8; // Longitud de los brazos de la cruz
        ctx.beginPath();
        ctx.moveTo(btnCenterX - arm, btnCenterY - arm);
        ctx.lineTo(btnCenterX + arm, btnCenterY + arm);
        ctx.moveTo(btnCenterX + arm, btnCenterY - arm);
        ctx.lineTo(btnCenterX - arm, btnCenterY + arm);
        ctx.stroke();

        ctx.restore();
    }
}
window.dibujarRecuadroExclusion = dibujarRecuadroExclusion;

window.arrastreZonaExcluida = null;

function obtenerInteraccionZonaExcluida(xCanvas, yCanvas, z) {
    if (!Array.isArray(zonasExcluidas) || !datosPagina) return null;
    let tol = 8;
    for (let i = zonasExcluidas.length - 1; i >= 0; i--) {
        let zBox = zonasExcluidas[i];
        if (!zBox || zBox.length < 4) continue;
        let bx0 = Math.min(zBox[0], zBox[2]) * z;
        let by0 = Math.min(zBox[1], zBox[3]) * z;
        let bx1 = Math.max(zBox[0], zBox[2]) * z;
        let by1 = Math.max(zBox[1], zBox[3]) * z;
        let bw = bx1 - bx0;
        let bh = by1 - by0;

        // 1. Botón [✕]
        let btnCenterX = bx1 - 11;
        let btnCenterY = by0 + 11;
        let distBtn = Math.sqrt(Math.pow(xCanvas - btnCenterX, 2) + Math.pow(yCanvas - btnCenterY, 2));
        if (bw >= 24 && bh >= 18 && distBtn <= 13) {
            return { index: i, tipo: 'delete', cursor: 'pointer' };
        }

        // 2. Esquinas (prioridad alta)
        let cercaIzq = Math.abs(xCanvas - bx0) <= tol;
        let cercaDer = Math.abs(xCanvas - bx1) <= tol;
        let cercaArr = Math.abs(yCanvas - by0) <= tol;
        let cercaAba = Math.abs(yCanvas - by1) <= tol;
        let enX = xCanvas >= bx0 - tol && xCanvas <= bx1 + tol;
        let enY = yCanvas >= by0 - tol && yCanvas <= by1 + tol;

        if (cercaIzq && cercaArr) return { index: i, tipo: 'resize', handle: 'nw', cursor: 'nwse-resize' };
        if (cercaDer && cercaArr) return { index: i, tipo: 'resize', handle: 'ne', cursor: 'nesw-resize' };
        if (cercaDer && cercaAba) return { index: i, tipo: 'resize', handle: 'se', cursor: 'nwse-resize' };
        if (cercaIzq && cercaAba) return { index: i, tipo: 'resize', handle: 'sw', cursor: 'nesw-resize' };

        // 3. Aristas / Bordes
        if (cercaArr && enX) return { index: i, tipo: 'resize', handle: 'n', cursor: 'ns-resize' };
        if (cercaAba && enX) return { index: i, tipo: 'resize', handle: 's', cursor: 'ns-resize' };
        if (cercaIzq && enY) return { index: i, tipo: 'resize', handle: 'w', cursor: 'ew-resize' };
        if (cercaDer && enY) return { index: i, tipo: 'resize', handle: 'e', cursor: 'ew-resize' };

        // 4. Interior (desplazamiento completo del recuadro)
        if (xCanvas > bx0 + tol && xCanvas < bx1 - tol && yCanvas > by0 + tol && yCanvas < by1 - tol) {
            return { index: i, tipo: 'move', handle: 'move', cursor: 'move' };
        }
    }
    return null;
}
window.obtenerInteraccionZonaExcluida = obtenerInteraccionZonaExcluida;

function dibujarLinea(x1, y1, x2, y2, color, punteada) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = 3; if (punteada) ctx.setLineDash([10, 5]); else ctx.setLineDash([]); ctx.stroke(); ctx.setLineDash([]); }

