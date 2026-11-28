/* LiraLoud
 * Utilidades compartidas de geometría y proyección Canvas <-> PDF para los módulos de edición.
 */

(function () {
    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function txt(key, fallback) {
        if (typeof window.t === 'function') {
            return window.t(key, fallback);
        }
        return fallback;
    }

    function obtenerPaginaIdx() {
        return (typeof paginaActual === 'number' && Number.isFinite(paginaActual)) ? paginaActual : 0;
    }

    function obtenerRutaPdf() {
        return (typeof rutaPDFActual === 'string' && rutaPDFActual) ? rutaPDFActual : '';
    }

    function _obtenerContextoProyeccion() {
        const wrapper = document.getElementById('pdf-crop-wrapper');
        const canvas = document.getElementById('lienzo-pdf');
        const memPag = (typeof memoriaLayout !== 'undefined' && memoriaLayout) ? memoriaLayout[obtenerPaginaIdx().toString()] : null;
        const baseEscala = memPag?.escala || (typeof datosPagina !== 'undefined' && datosPagina?.factor_zoom) || 1.5;
        const sc = baseEscala * (typeof nivelZoomPDF !== 'undefined' ? nivelZoomPDF : 1.0);
        const originX = (wrapper?.offsetLeft || 0) + (canvas?.offsetLeft || 0);
        const originY = (wrapper?.offsetTop || 0) + (canvas?.offsetTop || 0);
        return { wrapper, canvas, memPag, baseEscala, sc, originX, originY };
    }

    function proyectarPdfACanvas(bboxPdf) {
        if (typeof calcRectCanvas === 'function') {
            return calcRectCanvas(bboxPdf);
        }
        const { sc, originX, originY } = _obtenerContextoProyeccion();
        return {
            x: originX + bboxPdf[0] * sc,
            y: originY + bboxPdf[1] * sc,
            w: Math.max((bboxPdf[2] - bboxPdf[0]) * sc, 1),
            h: Math.max((bboxPdf[3] - bboxPdf[1]) * sc, 1)
        };
    }

    function proyectarCanvasAPdf(rectVisual) {
        if (typeof pdfRectFromCanvas === 'function') {
            return pdfRectFromCanvas(rectVisual);
        }
        const { sc, originX, originY } = _obtenerContextoProyeccion();
        return [
            (rectVisual.x - originX) / sc,
            (rectVisual.y - originY) / sc,
            (rectVisual.x + rectVisual.w - originX) / sc,
            (rectVisual.y + rectVisual.h - originY) / sc
        ];
    }

    function obtenerLimitesPaginaCanvas() {
        const { canvas, memPag, baseEscala, sc, originX, originY } = _obtenerContextoProyeccion();
        const anchoPdf = memPag?.width || (typeof datosPagina !== 'undefined' && datosPagina?.ancho_pagina_pdf) || ((canvas?.width || 600) / baseEscala);
        const altoPdf = memPag?.height || (typeof datosPagina !== 'undefined' && datosPagina?.alto_pagina_pdf) || ((canvas?.height || 800) / baseEscala);
        return {
            minX: originX,
            minY: originY,
            maxX: originX + anchoPdf * sc,
            maxY: originY + altoPdf * sc
        };
    }

    function _ajustarDimensionesProporcionales(newW, newH, aspect, maxAvailW, maxAvailH, minPx) {
        if (newW > maxAvailW) {
            newW = maxAvailW;
            newH = newW / aspect;
        }
        if (newH > maxAvailH) {
            newH = maxAvailH;
            newW = newH * aspect;
        }
        if (newW < minPx) {
            newW = minPx;
            newH = Math.max(minPx, newW / aspect);
        }
        if (newH < minPx) {
            newH = minPx;
            newW = Math.max(minPx, newH * aspect);
        }
        return { newW, newH };
    }

    function _calcularRectProporcional(o, b, dir, dx, dy, minPx) {
        const aspect = o.w / Math.max(1, o.h);
        const esOeste = dir.includes('w');
        const esNorte = dir.includes('n');
        const anchorX = esOeste ? (o.x + o.w) : o.x;
        const anchorY = esNorte ? (o.y + o.h) : o.y;

        const rawW = esOeste ? (o.w - dx) : (o.w + dx);
        const rawH = esNorte ? (o.h - dy) : (o.h + dy);
        const maxAvailW = esOeste ? (anchorX - b.minX) : (b.maxX - anchorX);
        const maxAvailH = esNorte ? (anchorY - b.minY) : (b.maxY - anchorY);

        const scale = Math.max(
            Math.max(minPx, rawW) / Math.max(1, o.w),
            Math.max(minPx, rawH) / Math.max(1, o.h)
        );
        const { newW, newH } = _ajustarDimensionesProporcionales(
            o.w * scale, (o.w * scale) / aspect, aspect, maxAvailW, maxAvailH, minPx
        );

        const x0 = esOeste ? (anchorX - newW) : anchorX;
        const x1 = esOeste ? anchorX : (anchorX + newW);
        const y0 = esNorte ? (anchorY - newH) : anchorY;
        const y1 = esNorte ? anchorY : (anchorY + newH);
        return { x0, y0, x1, y1 };
    }

    function _calcularRectLibre(o, b, dir, dx, dy, minPx) {
        let x0 = o.x;
        let y0 = o.y;
        let x1 = o.x + o.w;
        let y1 = o.y + o.h;

        if (dir.includes('w')) x0 = clamp(o.x + dx, b.minX, x1 - minPx);
        if (dir.includes('e')) x1 = clamp(o.x + o.w + dx, x0 + minPx, b.maxX);
        if (dir.includes('n')) y0 = clamp(o.y + dy, b.minY, y1 - minPx);
        if (dir.includes('s')) y1 = clamp(o.y + o.h + dy, y0 + minPx, b.maxY);
        return { x0, y0, x1, y1 };
    }

    function calcularRectRedimensionado(op, clientX, clientY, shiftKey, minPx = 8) {
        const dx = clientX - op.startClientX;
        const dy = clientY - op.startClientY;
        const esEsquina = ['nw', 'ne', 'sw', 'se'].includes(op.handle);

        const { x0, y0, x1, y1 } = (shiftKey && esEsquina)
            ? _calcularRectProporcional(op.origRect, op.bounds, op.handle, dx, dy, minPx)
            : _calcularRectLibre(op.origRect, op.bounds, op.handle, dx, dy, minPx);

        return {
            x: x0,
            y: y0,
            w: Math.max(minPx, x1 - x0),
            h: Math.max(minPx, y1 - y0)
        };
    }

    window.LiraPdfEditorUtils = {
        clamp,
        txt,
        obtenerPaginaIdx,
        obtenerRutaPdf,
        proyectarPdfACanvas,
        proyectarCanvasAPdf,
        obtenerLimitesPaginaCanvas,
        calcularRectRedimensionado
    };
})();
