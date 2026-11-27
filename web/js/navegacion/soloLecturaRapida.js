/* LiraLoud
 * Modo Solo Lectura / Sin Voz: Visor PDF ligero estilo Edge
 * - Carga vista rápida + palabras nativas manteniendo datosPagina, memoriaLayout y dibujar() 100% sincronizados.
 * - Habilita selección de texto (Ctrl+C), buscador PDF, zoom, subrayador, borrador, cuadros de texto y editor PDF.
 */

window.limpiarCapaTextoSoloLectura = function () {
    const capa = document.getElementById('lira-solo-lectura-text-layer');
    if (capa) capa.remove();
};

window.actualizarEstadoInteractivoCapaSoloLectura = function () {
    const capa = document.getElementById('lira-solo-lectura-text-layer');
    if (!capa) return;
    if (!window.modoSoloLecturaActivo) {
        capa.remove();
        return;
    }
    const herramientaActiva = Boolean(
        window.modoSubrayadorActivo ||
        window.modoBorradorActivo ||
        window.modoEditorTextoActivo ||
        window.modoCuadroTextoActivo ||
        window.modoMoverElementosActivo
    );
    capa.style.display = herramientaActiva ? 'none' : 'block';
    capa.style.pointerEvents = herramientaActiva ? 'none' : 'auto';
    capa.style.userSelect = herramientaActiva ? 'none' : 'text';
    capa.style.webkitUserSelect = herramientaActiva ? 'none' : 'text';
    capa.style.cursor = herramientaActiva ? 'inherit' : 'text';
    if (typeof window.actualizarCursorSubrayador === 'function' && (window.modoSubrayadorActivo || window.modoBorradorActivo)) {
        window.actualizarCursorSubrayador();
    }
};

window.mostrarOverlayCargaAudio = function (mostrar) {
    let overlay = document.getElementById('lira-overlay-carga-audio');
    if (!mostrar) {
        if (overlay) overlay.remove();
        return;
    }
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'lira-overlay-carga-audio';
        overlay.style.cssText = [
            'position: fixed',
            'inset: 0',
            'z-index: 94000',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            'background: rgba(15, 23, 42, 0.35)',
            'backdrop-filter: blur(6px)',
            '-webkit-backdrop-filter: blur(6px)',
            'color: #f8fafc',
            'font-size: 14px',
            'font-weight: 600',
            'pointer-events: all'
        ].join(';');
        overlay.innerHTML = '<div style="padding:12px 20px; border-radius:12px; background:rgba(15,23,42,0.82); border:1px solid rgba(148,163,184,0.3); box-shadow:0 8px 24px rgba(0,0,0,0.3);">Preparando modo lectura con audio...</div>';
        document.body.appendChild(overlay);
    }
};

window.sincronizarCapaTextoSoloLectura = function () {
    if (!window.modoSoloLecturaActivo || typeof datosPagina === 'undefined' || !datosPagina) {
        window.limpiarCapaTextoSoloLectura();
        return;
    }
    const wrapper = document.getElementById('pdf-crop-wrapper');
    const canvas = document.getElementById('lienzo-pdf');
    if (!wrapper || !canvas) return;

    const palabras = Array.isArray(datosPagina.palabras) ? datosPagina.palabras : [];
    window.limpiarCapaTextoSoloLectura();
    if (palabras.length === 0) return;

    const zoomUI = (typeof nivelZoomPDF === 'number' && nivelZoomPDF > 0) ? nivelZoomPDF : 1.0;
    const escala = (datosPagina.factor_zoom || 1.5) * zoomUI;
    const herramientaActiva = Boolean(
        window.modoSubrayadorActivo ||
        window.modoBorradorActivo ||
        window.modoEditorTextoActivo ||
        window.modoCuadroTextoActivo ||
        window.modoMoverElementosActivo
    );

    const capa = document.createElement('div');
    capa.id = 'lira-solo-lectura-text-layer';
    capa.style.cssText = [
        'position: absolute',
        `left: ${canvas.offsetLeft || 0}px`,
        `top: ${canvas.offsetTop || 0}px`,
        `width: ${(datosPagina.ancho_img * zoomUI).toFixed(1)}px`,
        `height: ${(datosPagina.alto_img * zoomUI).toFixed(1)}px`,
        'z-index: 6',
        'overflow: hidden',
        `display: ${herramientaActiva ? 'none' : 'block'}`,
        `user-select: ${herramientaActiva ? 'none' : 'text'}`,
        `-webkit-user-select: ${herramientaActiva ? 'none' : 'text'}`,
        `pointer-events: ${herramientaActiva ? 'none' : 'auto'}`,
        `cursor: ${herramientaActiva ? 'inherit' : 'text'}`
    ].join(';');

    const frag = document.createDocumentFragment();
    for (let i = 0; i < palabras.length; i++) {
        const p = palabras[i];
        if (!p || !Array.isArray(p.bbox) || p.bbox.length < 4) continue;
        const x0 = p.bbox[0] * escala;
        const y0 = p.bbox[1] * escala;
        const x1 = p.bbox[2] * escala;
        const y1 = p.bbox[3] * escala;
        const h = Math.max(8, y1 - y0);
        const span = document.createElement('span');
        span.textContent = (p.texto || '') + ' ';
        span.style.cssText = [
            'position: absolute',
            `left: ${x0.toFixed(1)}px`,
            `top: ${y0.toFixed(1)}px`,
            `width: ${Math.max(4, x1 - x0).toFixed(1)}px`,
            `height: ${h.toFixed(1)}px`,
            `font-size: ${(h * 0.85).toFixed(1)}px`,
            `line-height: ${h.toFixed(1)}px`,
            'color: transparent',
            'white-space: pre'
        ].join(';');
        frag.appendChild(span);
    }
    capa.appendChild(frag);
    wrapper.appendChild(capa);
};

window.cargarPaginaSoloLecturaRapida = async function (num) {
    if (typeof eel === 'undefined' || typeof eel.obtener_vista_rapida_pagina !== 'function') {
        return false;
    }

    if (typeof detenerLectura === 'function') detenerLectura();
    if (window._preservarResaltadoEnSalto && window.resaltadoPagina === num) {
        window._preservarResaltadoEnSalto = false;
    } else if (typeof window.limpiarResaltadoBusqueda === 'function') {
        window.limpiarResaltadoBusqueda(false);
    }

    const editorEstabaActivo = window.modoEditorTextoActivo === true;
    const moverEstabaActivo = window.modoMoverElementosActivo === true;
    if (typeof cerrarEditorTexto === 'function') cerrarEditorTexto();
    const capaEditor = document.getElementById('lira-pdf-text-editor-layer');
    if (capaEditor) capaEditor.innerHTML = '';
    if (typeof window.limpiarCapaMoverElementos === 'function') window.limpiarCapaMoverElementos();

    const miToken = (typeof tokenCargaActual === 'number') ? ++tokenCargaActual : 1;
    if (typeof datosPagina !== 'undefined' && datosPagina && !datosPagina._esSoloLectura && typeof guardarEstadoPaginaActual === 'function') {
        try {
            const flagPrev = window.modoSoloLecturaActivo;
            window.modoSoloLecturaActivo = false;
            guardarEstadoPaginaActual();
            window.modoSoloLecturaActivo = flagPrev;
        } catch (eGuardado) {}
    }

    paginaActual = num;
    indiceOracion = -1;
    palabraHover = null;

    const clave = num.toString();
    const layoutGuardado = (typeof memoriaLayout !== 'undefined' && memoriaLayout) ? memoriaLayout[clave] : null;
    if (layoutGuardado) {
        if (typeof cortesV !== 'undefined') cortesV = Array.isArray(layoutGuardado.cortesV) ? [...layoutGuardado.cortesV] : [];
        if (typeof limitesH !== 'undefined') limitesH = layoutGuardado.limitesH ? JSON.parse(JSON.stringify(layoutGuardado.limitesH)) : {};
        if (typeof zonasExcluidas !== 'undefined') zonasExcluidas = Array.isArray(layoutGuardado.zonasExcluidas) ? JSON.parse(JSON.stringify(layoutGuardado.zonasExcluidas)) : [];
    } else {
        if (typeof cortesV !== 'undefined') cortesV = [];
        if (typeof limitesH !== 'undefined') limitesH = {};
        if (typeof zonasExcluidas !== 'undefined') zonasExcluidas = [];
    }

    const inpPag = document.getElementById('input-pagina-actual');
    if (inpPag) inpPag.value = num + 1;

    const canvas = document.getElementById('lienzo-pdf');
    try {
        let vista = null;
        try {
            vista = await eel.obtener_vista_rapida_pagina(num, true)();
        } catch (errArg) {
            vista = await eel.obtener_vista_rapida_pagina(num)();
        }
        if (typeof tokenCargaActual === 'number' && miToken !== tokenCargaActual) return true;
        if (!vista || !vista.imagen || !canvas) return false;

        let mapaPalabras = [];
        if (Array.isArray(vista.palabras_rapidas)) {
            mapaPalabras = vista.palabras_rapidas.map(w => ({
                texto: w[4],
                bbox: [w[0], w[1], w[2], w[3]]
            }));
        } else if (typeof eel.obtener_pagina_data === 'function') {
            const dFallback = await eel.obtener_pagina_data(num, null, null, null, false, false, null, 0, false)();
            if (dFallback && Array.isArray(dFallback.palabras)) {
                mapaPalabras = dFallback.palabras;
            }
        }

        const factorZoom = (vista.ancho_pagina_pdf && vista.ancho_img)
            ? (vista.ancho_img / vista.ancho_pagina_pdf)
            : 1.5;

        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = vista.imagen;
        });
        if (typeof tokenCargaActual === 'number' && miToken !== tokenCargaActual) return true;

        window.imagenCacheadaCanvas = img;
        window.imagenCacheadaSrc = vista.imagen;

        datosPagina = {
            _esSoloLectura: true,
            imagen: vista.imagen,
            ancho_img: vista.ancho_img || img.width,
            alto_img: vista.alto_img || img.height,
            ancho_pagina_pdf: vista.ancho_pagina_pdf || ((vista.ancho_img || img.width) / factorZoom),
            alto_pagina_pdf: vista.alto_pagina_pdf || ((vista.alto_img || img.height) / factorZoom),
            total_paginas: vista.total_paginas || totalPaginas || 1,
            factor_zoom: factorZoom,
            palabras: mapaPalabras,
            oraciones: []
        };

        if (typeof datosPagina.total_paginas === 'number') {
            totalPaginas = datosPagina.total_paginas;
        }
        const totEl = document.getElementById('total-paginas-texto');
        if (totEl) totEl.innerText = `/ ${totalPaginas}`;

        if (typeof memoriaLayout !== 'undefined' && memoriaLayout && memoriaLayout[clave]) {
            memoriaLayout[clave].width = datosPagina.ancho_pagina_pdf;
            memoriaLayout[clave].height = datosPagina.alto_pagina_pdf;
            memoriaLayout[clave].escala = factorZoom;
            memoriaLayout[clave].canvasWidth = datosPagina.ancho_img;
            memoriaLayout[clave].canvasHeight = datosPagina.alto_img;
        }

        canvas.classList.remove('canvas-sin-imagen');
        canvas.classList.remove('canvas-procesando-layout');

        if (typeof dibujar === 'function') {
            dibujar();
        }
        window.sincronizarCapaTextoSoloLectura();
        if (typeof window.actualizarCursorSubrayador === 'function' && (window.modoSubrayadorActivo || window.modoBorradorActivo)) {
            window.actualizarCursorSubrayador();
        }

        if (editorEstabaActivo && typeof renderizarBloquesEditor === 'function') {
            renderizarBloquesEditor();
        }
        if ((moverEstabaActivo || window.modoMoverElementosActivo) && typeof window.cargarYRenderizarElementosMover === 'function') {
            window.cargarYRenderizarElementosMover();
        }
        return true;
    } catch (e) {
        console.warn('[SoloLecturaRapida] Error cargando vista rápida:', e);
        return false;
    }
};
