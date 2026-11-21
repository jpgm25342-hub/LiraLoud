function hexToRGBA(hex, alpha) {
    let r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function dibujar() {
    if (!datosPagina) return;

    const ejecutarRenderizadoCanvas = (img) => {
        // 1. CONFIGURACIÓN DEL LIENZO Y ZOOM
        canvas.width = datosPagina.ancho_img;
        canvas.height = datosPagina.alto_img;
        canvas.style.width = (datosPagina.ancho_img * nivelZoomPDF) + "px";
        canvas.style.height = (datosPagina.alto_img * nivelZoomPDF) + "px";

        // El zoom se aplica vía nivelZoomPDF (controlado por aplicarZoomDinamico)
        // Re-aplicamos recorte DESPUÉS de que el canvas tiene su tamaño final
        const recorteActual = parseInt(document.getElementById('rng-recorte-pdf')?.value || 0);
        if (recorteActual > 0 && typeof aplicarRecorteDinamico === 'function') {
            // Ejecutar en el siguiente frame para que el canvas tenga sus dimensiones CSS actualizadas
            requestAnimationFrame(() => aplicarRecorteDinamico(recorteActual));
        } else {
            // Sin recorte: aseguramos que el wrapper ocupe el tamaño natural del canvas
            const wrapper = document.getElementById('pdf-crop-wrapper');
            if (wrapper) { wrapper.style.width = ''; wrapper.style.height = ''; }
            canvas.style.position = '';
            canvas.style.left = '';
            canvas.style.top = '';
        }

        ctx.drawImage(img, 0, 0);
        let z = datosPagina.factor_zoom;

        // --- 2. CAPTURA DE PARÁMETROS DINÁMICOS DEL MODAL ---
        const colorGuia = document.getElementById('color-guia-oracion')?.value || "#00b4ff";
        const padGuia = parseInt(document.getElementById('rng-pad-guia')?.value || 2);

        const colorKaraoke = document.getElementById('color-resaltado')?.value || "#ffff00";
        const padKaraoke = parseInt(document.getElementById('rng-pad-karaoke')?.value || 2);
        const modoLlenado = document.getElementById('chk-llenado-fluido')?.checked;

        // Actualizar etiquetas de texto en el modal
        if (document.getElementById('val-pad-guia')) document.getElementById('val-pad-guia').innerText = padGuia + "px";
        if (document.getElementById('val-pad-karaoke')) document.getElementById('val-pad-karaoke').innerText = padKaraoke + "px";

        // Ajuste predeterminado para que el "0" sea más ajustado y no solape renglones
        const offsetV = 2.5; // Reduce arriba y abajo
        const offsetH = 1; // Reduce a los lados

        // 3. RENDERIZADO DE LA GUÍA (Oración Punto a Punto)
        if (oracionActiva) {
            ctx.fillStyle = hexToRGBA(colorGuia, 0.15); // Fondo sutil
            ctx.strokeStyle = hexToRGBA(colorGuia, 0.30); // Borde guía
            ctx.lineWidth = 1;

            let rectsADibujar = (oracionActiva.rects || []).filter(r => !(r[0] === 0 && r[1] === 0 && r[2] === 0 && r[3] === 0));

            // Si los rects están vacíos o eran dummy, generarlos desde sus palabras
            if (rectsADibujar.length === 0 && oracionActiva.palabras && oracionActiva.palabras.length > 0) {
                rectsADibujar = oracionActiva.palabras.map(p => p.bbox).filter(Boolean);
            }

            for (let r of rectsADibujar) {
                // Aplicamos Padding Independiente y el ajuste por defecto
                let x = (r[0] * z) - padGuia + offsetH;
                let y = (r[1] * z) - padGuia + offsetV;
                let w = ((r[2] - r[0]) * z) + (padGuia * 2) - (offsetH * 2);
                let h = ((r[3] - r[1]) * z) + (padGuia * 2) - (offsetV * 2);

                ctx.fillRect(x, y, w, h);
                ctx.strokeRect(x, y, w, h);
            }
        }

        // 4. RENDERIZADO DEL KARAOKE (Palabra Activa)
        if (window.palabraKaraoke && window.palabraKaraoke.bbox) {
            let k = window.palabraKaraoke.bbox;
            const pAudio = (window.partituraActual && window.ultimoIdxAudio !== -1)
                ? window.partituraActual[window.ultimoIdxAudio] : null;

            const sub_i = (pAudio && typeof pAudio.sub_i === 'number') ? pAudio.sub_i : 0;
            const sub_t = (pAudio && typeof pAudio.sub_t === 'number' && pAudio.sub_t > 0) ? pAudio.sub_t : 1;
            const progreso = window.progresoFraccional || 0;

            // Dimensiones base con su propio Padding y ajuste (soporta sub-región proporcional CJK)
            const cjkSlice = window.palabraKaraoke._cjkSlice;
            const kStartX = cjkSlice ? (k[0] + (k[2] - k[0]) * cjkSlice.startFrac) : k[0];
            const kEndX = cjkSlice ? (k[0] + (k[2] - k[0]) * cjkSlice.endFrac) : k[2];
            let x0 = (kStartX * z) - padKaraoke + offsetH;
            let y0 = (k[1] * z) - padKaraoke + offsetV;
            let anchoTotal = ((kEndX - kStartX) * z) + (padKaraoke * 2) - (offsetH * 2);
            let altoTotal = ((k[3] - k[1]) * z) + (padKaraoke * 2) - (offsetV * 2);

            // Lógica de Llenado vs Brinco
            let anchoActual = modoLlenado
                ? (sub_i * (anchoTotal / sub_t)) + ((anchoTotal / sub_t) * progreso)
                : anchoTotal;

            // Dibujar Resaltado
            ctx.fillStyle = hexToRGBA(colorKaraoke, 0.75);
            ctx.fillRect(x0, y0, anchoActual, altoTotal);

            // Borde técnico de enfoque (Foco de Posner)
            if (modoLlenado) {
                ctx.strokeStyle = hexToRGBA(colorKaraoke, 1.0);
                ctx.lineWidth = 2;
                ctx.strokeRect(x0, y0, anchoActual, altoTotal);
            }
        }

        // 5. HOVER (Amarillo translúcido de sistema)
        if (palabraHover) {
            let b = palabraHover.bbox;
            ctx.fillStyle = "rgba(255, 200, 0, 0.30)";
            ctx.fillRect(b[0] * z, b[1] * z, (b[2] - b[0]) * z, (b[3] - b[1]) * z);
        }
        // Dentro de dibujar(), justo después del Punto 5 (Hover)
        aplicarResaltadoBuscador(ctx, z);
        // 6. Líneas y límites
        const vis = obtenerLimitesVisiblesRecorte();
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

        // Guía del tutorial: banda verde que indica dónde soltar la línea vertical
        if (window.tutorialActivo && window.tutorialGuiaCorteV) {
            const g = window.tutorialGuiaCorteV;
            const gx0 = g.min * z, gx1 = g.max * z;
            ctx.save();
            ctx.fillStyle = "rgba(34, 197, 94, 0.22)";
            ctx.fillRect(gx0, vis.minY, gx1 - gx0, vis.maxY - vis.minY);
            ctx.strokeStyle = "rgba(22, 163, 74, 0.95)";
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.strokeRect(gx0, vis.minY, gx1 - gx0, vis.maxY - vis.minY);
            ctx.setLineDash([]);
            ctx.font = "bold 14px system-ui, sans-serif";
            const tw = ctx.measureText(g.texto).width + 16;
            const tx = g.centro * z - tw / 2;
            const ty = Math.max(vis.minY, 0) + 90;
            ctx.fillStyle = "#16a34a";
            ctx.fillRect(tx, ty, tw, 26);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(g.texto, tx + 8, ty + 18);
            ctx.restore();
        }
        // Guía del tutorial: banda verde horizontal que indica hasta dónde bajar el límite superior
        if (window.tutorialActivo && window.tutorialGuiaLimiteH) {
            const gh = window.tutorialGuiaLimiteH;
            const gy0 = gh.min * z, gy1 = gh.max * z;
            const gxMin = (gh.xMin !== undefined ? gh.xMin * z : vis.minX);
            const gxMax = (gh.xMax !== undefined ? gh.xMax * z : vis.maxX);
            ctx.save();
            ctx.fillStyle = "rgba(34, 197, 94, 0.22)";
            ctx.fillRect(gxMin, gy0, gxMax - gxMin, gy1 - gy0);
            ctx.strokeStyle = "rgba(22, 163, 74, 0.95)";
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.strokeRect(gxMin, gy0, gxMax - gxMin, gy1 - gy0);
            ctx.setLineDash([]);
            ctx.font = "bold 13px system-ui, sans-serif";
            const tw = ctx.measureText(gh.texto).width + 16;
            const tx = (gxMin + gxMax) / 2 - tw / 2;
            const ty = (gy0 + gy1) / 2 - 12;
            ctx.fillStyle = "#16a34a";
            ctx.fillRect(tx, ty, tw, 24);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(gh.texto, tx + 8, ty + 16);
            ctx.restore();
        }
        // Guía del tutorial: recuadro verde objetivo para Alt + Clic (Zona de exclusión)
        if (window.tutorialActivo && window.tutorialGuiaZonaExcluida) {
            const gz = window.tutorialGuiaZonaExcluida;
            const gx0 = gz.x0 * z, gy0 = gz.y0 * z;
            const gw = (gz.x1 - gz.x0) * z, gh = (gz.y1 - gz.y0) * z;
            ctx.save();
            ctx.fillStyle = "rgba(34, 197, 94, 0.20)";
            ctx.fillRect(gx0, gy0, gw, gh);
            ctx.strokeStyle = "rgba(22, 163, 74, 0.95)";
            ctx.lineWidth = 2.5;
            ctx.setLineDash([8, 5]);
            ctx.strokeRect(gx0, gy0, gw, gh);
            ctx.setLineDash([]);
            if (gz.texto) {
                ctx.font = "bold 12px system-ui, sans-serif";
                const tw = ctx.measureText(gz.texto).width + 14;
                const tx = gx0 + gw / 2 - tw / 2;
                const ty = gy0 - 26;
                ctx.fillStyle = "#16a34a";
                ctx.fillRect(tx, ty, tw, 22);
                ctx.fillStyle = "#ffffff";
                ctx.fillText(gz.texto, tx + 7, ty + 15);
            }
            ctx.restore();
        }
        for (let i = 0; i < cortesV.length; i++) {
            let objCV = obtenerObjCorteV(cortesV[i]);
            let x = objCV.x * z;
            let y0_vis = Math.max(vis.minY, objCV.yMin * z);
            let y1_vis = Math.min(vis.maxY, objCV.yMax * z);

            // Dibujar la línea roja segmentada
            dibujarLinea(x, y0_vis, x, y1_vis, "rgba(255,0,0,0.75)", true);

            // Manija superior (para arrastrar altura yMin)
            ctx.fillStyle = "red";
            ctx.fillRect(x - 9, y0_vis, 18, 14);

            // Manija central (para mover la línea horizontalmente x)
            let y_mid = (y0_vis + y1_vis) / 2;
            ctx.fillRect(x - 8, y_mid - 8, 16, 16);

            // Manija inferior (para arrastrar altura yMax)
            ctx.fillRect(x - 9, y1_vis - 14, 18, 14);
        }
        let numCols = cortesV.length > 0 ? cortesV.length + 1 : 1;
        for (let i = 0; i < numCols; i++) {
            let key = i.toString();
            if (limitesH[key]) {
                let xMin = sortedV[i] * z;
                let xMax = sortedV[i + 1] * z;
                let xMinVisual = Math.max(xMin, vis.minX);
                let xMaxVisual = Math.min(xMax, vis.maxX);
                if (xMaxVisual <= xMinVisual) continue;

                let yTopReal = limitesH[key][0] * z;
                let yBottomReal = limitesH[key][1] * z;

                let yTopVisual = Math.max(vis.minY, yTopReal);
                let yBottomVisual = Math.min(vis.maxY, yBottomReal);

                ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                if (yTopReal > 0) {
                    let hTop = Math.max(0, yTopReal - vis.minY);
                    if (hTop > 0) ctx.fillRect(xMinVisual, vis.minY, xMaxVisual - xMinVisual, hTop);
                }
                if (yBottomReal < datosPagina.alto_pagina_pdf * z) {
                    let hBot = Math.max(0, vis.maxY - yBottomReal);
                    if (hBot > 0) ctx.fillRect(xMinVisual, yBottomReal, xMaxVisual - xMinVisual, hBot);
                }

                dibujarLinea(xMinVisual, yTopVisual, xMaxVisual, yTopVisual, "#00ccff", false);
                dibujarLinea(xMinVisual, yBottomVisual, xMaxVisual, yBottomVisual, "#00ccff", false);

                let handleTopY = Math.max(vis.minY, Math.min(vis.maxY - 20, yTopVisual - 10));
                let handleBotY = Math.min(vis.maxY - 20, Math.max(vis.minY, yBottomVisual - 10));

                ctx.fillStyle = "#00ccff";
                ctx.fillRect(xMinVisual, handleTopY, 40, 20);
                ctx.fillRect(xMaxVisual - 40, handleBotY, 40, 20);
            }
        }

        // 7. Zonas Excluidas (Omisión estética de lectura con rayado diagonal)
        if (Array.isArray(zonasExcluidas) && zonasExcluidas.length > 0) {
            for (let i = 0; i < zonasExcluidas.length; i++) {
                let zBox = zonasExcluidas[i];
                if (!zBox || zBox.length < 4) continue;
                let bx0 = Math.min(zBox[0], zBox[2]) * z;
                let by0 = Math.min(zBox[1], zBox[3]) * z;
                let bw = Math.abs(zBox[2] - zBox[0]) * z;
                let bh = Math.abs(zBox[3] - zBox[1]) * z;

                dibujarRecuadroExclusion(ctx, bx0, by0, bw, bh, false, i);
            }
        }

        // Previsualización estética en tiempo real al arrastrar con Alt
        if (window.zonaExcluidaTemp) {
            let bx0 = Math.min(window.zonaExcluidaTemp.x0, window.zonaExcluidaTemp.x1) * z;
            let by0 = Math.min(window.zonaExcluidaTemp.y0, window.zonaExcluidaTemp.y1) * z;
            let bw = Math.abs(window.zonaExcluidaTemp.x1 - window.zonaExcluidaTemp.x0) * z;
            let bh = Math.abs(window.zonaExcluidaTemp.y1 - window.zonaExcluidaTemp.y0) * z;

            dibujarRecuadroExclusion(ctx, bx0, by0, bw, bh, true, -1);
        }
    };

    // CACHÉ DE BITMAP: Evita instanciar new Image() y re-decodificar el Base64 JPEG en cada cuadro de karaoke (60fps) o movimiento de mouse
    if (window.imagenCacheadaCanvas && window.imagenCacheadaSrc === datosPagina.imagen) {
        ejecutarRenderizadoCanvas(window.imagenCacheadaCanvas);
    } else {
        let img = new Image();
        img.onload = () => {
            window.imagenCacheadaCanvas = img;
            window.imagenCacheadaSrc = datosPagina.imagen;
            ejecutarRenderizadoCanvas(img);
        };
        img.src = datosPagina.imagen;
    }
}

