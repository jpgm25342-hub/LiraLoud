// ==========================================
// BUSCADOR DE TEXTO EN PDF Y RESALTADO
// ==========================================

function _extraerRectPrincipalBusqueda(coords) {
    if (!coords) return null;
    if (Array.isArray(coords)) {
        return Array.isArray(coords[0]) ? coords[0] : (coords.length >= 4 ? coords : null);
    }
    if (Array.isArray(coords.rects) && coords.rects.length > 0) {
        return coords.rects[0];
    }
    return null;
}

function _ejecutarScrollVisorARect(rect, intentos) {
    const visor = document.getElementById('visor-container');
    const canvas = document.getElementById('lienzo-pdf');
    if (!visor || !canvas || canvas.offsetHeight === 0) {
        if (intentos > 0) setTimeout(() => _ejecutarScrollVisorARect(rect, intentos - 1), 80);
        return;
    }
    const altoPdf = (typeof datosPagina !== 'undefined' && datosPagina?.alto_pagina_pdf) || canvas.offsetHeight;
    const anchoPdf = (typeof datosPagina !== 'undefined' && datosPagina?.ancho_pagina_pdf) || canvas.offsetWidth;
    const scaleY = canvas.offsetHeight / altoPdf;
    const scaleX = canvas.offsetWidth / anchoPdf;
    const targetTop = Math.max(0, canvas.offsetTop + (rect[1] * scaleY) - (visor.clientHeight * 0.35));
    const targetLeft = Math.max(0, canvas.offsetLeft + (rect[0] * scaleX) - (visor.clientWidth * 0.35));
    visor.scrollTo({ top: targetTop, left: targetLeft, behavior: 'smooth' });
}

function _scrollAResultadoBusqueda(coords) {
    const rect = _extraerRectPrincipalBusqueda(coords);
    if (!rect || rect.length < 4) return;
    setTimeout(() => _ejecutarScrollVisorARect(rect, 6), 120);
}

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
    const esc = (typeof window.escapeHtml === 'function')
        ? window.escapeHtml
        : (s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    const rawBuscando = (typeof window.t === 'function') ? window.t('msg-buscando-doc', 'Buscando en el documento...') : 'Buscando en el documento...';
    const txtBuscando = (typeof window.limpiarTextoEmoji === 'function') ? window.limpiarTextoEmoji(rawBuscando).texto : rawBuscando;
    const svgBuscando = (typeof window.obtenerIconoDialogoSVG === 'function')
        ? window.obtenerIconoDialogoSVG('buscar', 'buscador-estado-icon')
        : '<svg class="lira-svg-icon buscador-estado-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    contenedor.innerHTML = `<div class="buscador-estado-msg">${svgBuscando}<span>${esc(txtBuscando)}</span></div>`;

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
            contenedor.innerHTML = `<div class="buscador-estado-msg buscador-estado-vacio">${esc(txtSinCoincidencias)}</div>`;
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
            div.className = 'buscador-resultado-item';

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
                _scrollAResultadoBusqueda(res.coords);
            };

            const lblPagina = (typeof window.t === 'function') ? window.t('lbl-pagina-num', 'Página {num}', { num: res.pagina }) : `Página ${res.pagina}`;
            div.innerHTML = `
                <div class="buscador-resultado-pag">${esc(lblPagina)}</div>
                <div class="buscador-resultado-frase">"${esc(res.frase)}"</div>
            `;
            contenedor.appendChild(div);
        });
    } catch (error) {
        console.error("Error en búsqueda:", error);
        const txtErrBusqueda = (typeof window.t === 'function') ? window.t('msg-error-busqueda', 'Error en el motor de búsqueda.') : 'Error en el motor de búsqueda.';
        contenedor.innerHTML = `<div class="buscador-estado-msg buscador-estado-error">${esc(txtErrBusqueda)}</div>`;
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
    _scrollAResultadoBusqueda(res.coords);
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
    const dlgOverlay = document.getElementById('lira-dialog-overlay');
    if (dlgOverlay && dlgOverlay.classList.contains('activo')) return;

    if (e.ctrlKey && e.key === 'f') {
        e.preventDefault(); // Evita que el navegador use su propio buscador
        const panel = document.getElementById('panel-busqueda');
        if (!panel) return;
        const abrir = (panel.style.display === 'none' || getComputedStyle(panel).display === 'none');
        panel.style.display = abrir ? 'block' : 'none';
        if (abrir) document.getElementById('input-busqueda-pdf')?.focus();
    } else if (e.key === 'Escape') {
        const panel = document.getElementById('panel-busqueda');
        if (panel && panel.style.display !== 'none' && getComputedStyle(panel).display !== 'none') {
            e.preventDefault();
            cerrarBuscadorPDF();
        }
    }
});
