// ==========================================
// BUSCADOR DE TEXTO EN PDF Y RESALTADO
// ==========================================

function cerrarBuscadorPDF() {
    document.getElementById('panel-busqueda').style.display = 'none';
    window.busquedaResultadosPorPagina = null;
    limpiarResaltadoBusqueda(true);
}

const _inpBusqPdf = document.getElementById('input-busqueda-pdf');
if (_inpBusqPdf) {
    _inpBusqPdf.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') ejecutarBusquedaPDF();
    });
}

async function ejecutarBusquedaPDF() {
    const query = document.getElementById('input-busqueda-pdf').value.trim();
    if (query.length < 3) return;

    const contenedor = document.getElementById('resultados-busqueda');
    const txtBuscando = (typeof window.t === 'function') ? window.t('msg-buscando-doc', '🔍 Buscando en el documento...') : '🔍 Buscando en el documento...';
    contenedor.innerHTML = `<div style='font-size:11px; color:#7f8c8d; text-align:center; padding:10px;'>${txtBuscando}</div>`;

    try {
        const resultados = await eel.buscar_texto_avanzado(query)();
        contenedor.innerHTML = "";

        if (!resultados || resultados.length === 0) {
            window.busquedaResultadosPorPagina = null;
            window._busquedaListaGlobal = [];
            window._busquedaIdxActual = -1;
            const cnt = document.getElementById('busqueda-contador');
            if (cnt) cnt.textContent = '0/0';
            if (typeof dibujar === 'function') dibujar();
            const txtSinCoincidencias = (typeof window.t === 'function') ? window.t('msg-sin-coincidencias', 'Sin coincidencias.') : 'Sin coincidencias.';
            contenedor.innerHTML = `<div style='font-size:11px; color:#c0392b; text-align:center; padding:10px;'>${txtSinCoincidencias}</div>`;
            return;
        }

        window._busquedaListaGlobal = resultados;
        window._busquedaIdxActual = 0;
        const cnt = document.getElementById('busqueda-contador');
        if (cnt) cnt.textContent = `1/${resultados.length}`;

        window.busquedaResultadosPorPagina = {};
        resultados.forEach(res => {
            const pIdx = parseInt(res.pagina) - 1;
            if (!window.busquedaResultadosPorPagina[pIdx]) {
                window.busquedaResultadosPorPagina[pIdx] = [];
            }
            if (res.coords) {
                window.busquedaResultadosPorPagina[pIdx].push(res.coords);
            }
        });
        if (typeof dibujar === 'function') dibujar();

        resultados.forEach((res, idxRes) => {
            const div = document.createElement('div');
            div.style = "padding:10px; border-bottom:1px solid #eee; cursor:pointer; transition:background 0.2s; border-left: 3px solid transparent;";

            div.onmouseover = () => {
                div.style.background = "#f1f2f6";
                div.style.borderLeftColor = "#2980b9";
            };
            div.onmouseout = () => {
                div.style.background = "white";
                div.style.borderLeftColor = "transparent";
            };

            div.onclick = () => {
                window._busquedaIdxActual = idxRes;
                const cntEl = document.getElementById('busqueda-contador');
                if (cntEl) cntEl.textContent = `${idxRes + 1}/${resultados.length}`;

                resaltadoBusqueda = res.coords;
                window.resaltadoBusqueda = res.coords;
                window.resaltadoBBox = null;
                window.resaltadoPagina = parseInt(res.pagina) - 1;
                window._preservarResaltadoEnSalto = true;

                document.getElementById('input-pagina-actual').value = res.pagina;
                irAPaginaDirecta();
            };

            const lblPagina = (typeof window.t === 'function') ? window.t('lbl-pagina-num', 'Página {num}', { num: res.pagina }) : `Página ${res.pagina}`;
            div.innerHTML = `
                <div style="font-weight:bold; color:#2980b9; font-size:11px; margin-bottom:3px;">${lblPagina}</div>
                <div style="font-size:10px; color:#2d3436; line-height:1.3; font-style:italic;">"${res.frase}"</div>
            `;
            contenedor.appendChild(div);
        });
    } catch (error) {
        console.error("Error en búsqueda:", error);
        const txtErrBusqueda = (typeof window.t === 'function') ? window.t('msg-error-busqueda', 'Error en el motor de búsqueda.') : 'Error en el motor de búsqueda.';
        contenedor.innerHTML = `<div style='color:red; font-size:10px;'>${txtErrBusqueda}</div>`;
    }
}

function navegarBusquedaPDF(delta) {
    const lista = window._busquedaListaGlobal;
    if (!Array.isArray(lista) || lista.length === 0) return;
    let idx = (typeof window._busquedaIdxActual === 'number') ? window._busquedaIdxActual + delta : 0;
    if (idx < 0) idx = lista.length - 1;
    if (idx >= lista.length) idx = 0;
    window._busquedaIdxActual = idx;

    const cnt = document.getElementById('busqueda-contador');
    if (cnt) cnt.textContent = `${idx + 1}/${lista.length}`;

    const res = lista[idx];
    if (!res) return;
    resaltadoBusqueda = res.coords;
    window.resaltadoBusqueda = res.coords;
    window.resaltadoBBox = null;
    window.resaltadoPagina = parseInt(res.pagina) - 1;
    window._preservarResaltadoEnSalto = true;
    const inpPag = document.getElementById('input-pagina-actual');
    if (inpPag) inpPag.value = res.pagina;
    if (typeof irAPaginaDirecta === 'function') irAPaginaDirecta();
}

function limpiarResaltadoBusqueda(redibujar = false) {
    window.resaltadoBusqueda = null;
    window.resaltadoBBox = null;
    window.resaltadoPagina = null;
    window._preservarResaltadoEnSalto = false;
    if (typeof resaltadoBusqueda !== 'undefined') {
        resaltadoBusqueda = null;
    }
    if (redibujar && typeof dibujar === 'function') {
        dibujar();
    }
}
window.limpiarResaltadoBusqueda = limpiarResaltadoBusqueda;

function aplicarResaltadoBuscador(ctx, factorZoom) {
    const pagIdxActual = (typeof paginaActual === 'number') ? paginaActual : 0;
    const todasEnPag = (window.busquedaResultadosPorPagina && window.busquedaResultadosPorPagina[pagIdxActual])
        ? window.busquedaResultadosPorPagina[pagIdxActual]
        : null;
    if (todasEnPag && todasEnPag.length > 0) {
        ctx.save();
        ctx.fillStyle = "rgba(255, 213, 0, 0.35)";
        ctx.strokeStyle = "rgba(243, 156, 18, 0.75)";
        ctx.lineWidth = 1;
        for (let r of todasEnPag) {
            const [x0, y0, x1, y1] = r;
            ctx.fillRect((x0 * factorZoom) - 2, (y0 * factorZoom) - 1.5, Math.max(8, ((x1 - x0) * factorZoom) + 4), Math.max(8, ((y1 - y0) * factorZoom) + 3));
        }
        ctx.restore();
    }

    if (typeof window.resaltadoPagina === 'number' && typeof paginaActual === 'number' && window.resaltadoPagina !== paginaActual) {
        return;
    }
    const fuente = window.resaltadoBusqueda || (typeof resaltadoBusqueda !== 'undefined' ? resaltadoBusqueda : null);
    if (!fuente) return;

    ctx.save();

    let rects = [];
    if (Array.isArray(fuente)) {
        if (fuente.length > 0 && Array.isArray(fuente[0])) {
            rects = fuente;
        } else if (fuente.length >= 4 && typeof fuente[0] === 'number') {
            rects = [fuente];
        }
    } else if (fuente && typeof fuente === 'object' && fuente.rects) {
        rects = fuente.rects;
    }

    if (!rects || rects.length === 0) {
        ctx.restore();
        return;
    }

    ctx.fillStyle = "rgba(108, 92, 231, 0.28)";
    ctx.strokeStyle = "rgba(95, 39, 205, 0.85)";
    ctx.lineWidth = 1.5;

    const padH = 2.0;
    const padV = 1.5;
    for (let r of rects) {
        const [x0, y0, x1, y1] = r;
        const rectX = (x0 * factorZoom) - padH;
        const rectY = (y0 * factorZoom) - padV;
        const rectW = Math.max(8, ((x1 - x0) * factorZoom) + (padH * 2));
        const rectH = Math.max(8, ((y1 - y0) * factorZoom) + (padV * 2));

        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(rectX, rectY, rectW, rectH, 3);
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.fillRect(rectX, rectY, rectW, rectH);
            ctx.strokeRect(rectX, rectY, rectW, rectH);
        }
    }

    const bbox = window.resaltadoBBox || (fuente && fuente.bbox ? fuente.bbox : null);
    if (bbox && Array.isArray(bbox) && bbox.length >= 4) {
        const [bx0, by0, bx1, by1] = bbox;
        ctx.fillStyle = "#6c5ce7";
        const barX = Math.max(0, (bx0 * factorZoom) - 8);
        const barY = by0 * factorZoom;
        const barH = Math.max(16, (by1 - by0) * factorZoom);
        ctx.fillRect(barX, barY, 4, barH);
    }

    ctx.restore();
}



// --- MOTOR DE BÚSQUEDA (Ctrl + F) ---

document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.key === 'f') {
        e.preventDefault(); // Evita que el navegador use su propio buscador
        const panel = document.getElementById('panel-busqueda');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        if (panel.style.display === 'block') document.getElementById('input-busqueda-pdf').focus();
    }
});
