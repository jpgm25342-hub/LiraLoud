/* LiraLoud
 * Módulo "Añadir figuras" (Rectángulo, Círculo, Óvalo y Flecha) para el editor PDF
 */

window.modoFigurasActivo = false;
window.tipoFiguraSeleccionada = 'rect'; // 'rect' | 'circle' | 'arrow'
window.colorBordeFigura = '#e74c3c';
window.colorRellenoFigura = 'none'; // 'none' o hex '#RRGGBB'
window.grosorBordeFigura = 2;

(function () {
    const TOOLBAR_ID = 'toolbar-figuras-pdf';
    const PREVIEW_ID = 'figura-preview-overlay';
    const POPOVER_ID = 'popover-estilo-figura';
    const MARCO_TEMPORAL_ID = 'figura-recien-creada-box';
    const MIN_PX = 10;
    const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

    let dibujoActivo = null; // { startX, startY, currentX, currentY, tipo }
    let listenersInicializados = false;
    let figuraEditandoActual = null; // Elemento actual en el popover
    let figuraRecienCreada = null; // Figura activa recién creada
    let hookDibujarInstalado = false;

    const {
        clamp,
        txt,
        obtenerPaginaIdx,
        obtenerRutaPdf,
        proyectarPdfACanvas,
        proyectarCanvasAPdf,
        obtenerLimitesPaginaCanvas
    } = window.LiraPdfEditorUtils;

    function esContextoEditable(e) {
        const el = document.activeElement || (e && e.target);
        if (!el) return false;
        const tag = el.tagName ? el.tagName.toUpperCase() : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (el.isContentEditable) return true;
        if (typeof window.textoEditandoActivo !== 'undefined' && window.textoEditandoActivo) return true;
        return false;
    }

    function calcularRectRedimensionado(op, clientX, clientY, shiftKey) {
        return window.LiraPdfEditorUtils.calcularRectRedimensionado(op, clientX, clientY, shiftKey, MIN_PX);
    }

    function proyectarPuntoCanvasAPdf(pxCanvas, pyCanvas) {
        const wrapper = document.getElementById('pdf-crop-wrapper');
        const canvas = document.getElementById('lienzo-pdf');
        const memPag = (typeof memoriaLayout !== 'undefined' && memoriaLayout) ? memoriaLayout[obtenerPaginaIdx().toString()] : null;
        const baseEscala = memPag?.escala || (typeof datosPagina !== 'undefined' && datosPagina?.factor_zoom) || 1.5;
        const sc = baseEscala * (typeof nivelZoomPDF !== 'undefined' ? nivelZoomPDF : 1.0);
        const originX = (wrapper?.offsetLeft || 0) + (canvas?.offsetLeft || 0);
        const originY = (wrapper?.offsetTop || 0) + (canvas?.offsetTop || 0);
        return [
            (pxCanvas - originX) / sc,
            (pyCanvas - originY) / sc
        ];
    }

    function desactivarOtrosModos() {
        if (typeof toggleModoEditorTexto === 'function' && window.modoEditorTextoActivo) {
            toggleModoEditorTexto(false);
        }
        if (typeof activarModoCuadroTexto === 'function' && window.modoCuadroTextoActivo) {
            activarModoCuadroTexto(false);
        }
        if (typeof toggleModoMoverElementos === 'function' && window.modoMoverElementosActivo) {
            toggleModoMoverElementos(false);
        }
        if (typeof toggleModoSubrayador === 'function' && window.modoSubrayadorActivo) {
            toggleModoSubrayador(false);
        }
        if (typeof toggleModoBorrador === 'function' && window.modoBorradorActivo) {
            toggleModoBorrador(false);
        }
        if (typeof toggleModoRecorteExtraccion === 'function' && window.modoRecorteActivo) {
            toggleModoRecorteExtraccion(false);
        }
        if (typeof toggleCapturaCorte === 'function' && window.capturandoCorte) {
            toggleCapturaCorte(false);
        }
        const chkLimites = document.getElementById('chk-dibujar-limites');
        if (chkLimites && chkLimites.checked) {
            chkLimites.checked = false;
            if (typeof toggleDibujoLimites === 'function') toggleDibujoLimites(false);
        }
    }

    function actualizarBotonesUI(activo) {
        const btnGroup = document.getElementById('group-anadir-figura');
        if (btnGroup) btnGroup.classList.toggle('active', activo);

        const btn = document.getElementById('btn-anadir-figura');
        if (btn) {
            btn.classList.toggle('activo', activo);
            btn.classList.toggle('active', activo);
            btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
        }

        const btnZen = document.getElementById('btn-anadir-figura-zen');
        if (btnZen) {
            btnZen.setAttribute('aria-pressed', activo ? 'true' : 'false');
        }

        document.querySelectorAll('.zen-item-anadir-figura').forEach((el) => {
            el.classList.toggle('tool-active-underline', activo);
        });
    }

    function actualizarVisibilidadRellenoToolbar(tb) {
        if (!tb) return;
        const itemRelleno = tb.querySelector('#toolbar-item-relleno');
        const sepRelleno = tb.querySelector('#toolbar-sep-relleno');
        const esArrow = window.tipoFiguraSeleccionada === 'arrow';
        if (itemRelleno) itemRelleno.style.display = esArrow ? 'none' : 'flex';
        if (sepRelleno) sepRelleno.style.display = esArrow ? 'none' : 'block';
    }

    function limpiarSeleccionFiguraRecienCreada() {
        const box = document.getElementById(MARCO_TEMPORAL_ID);
        if (box) box.remove();
        cerrarPopoverEstiloFigura();
        figuraRecienCreada = null;
    }

    function reposicionarMarcoFiguraRecienCreada() {
        if (!figuraRecienCreada || !Array.isArray(figuraRecienCreada.bbox)) return;
        const box = document.getElementById(MARCO_TEMPORAL_ID);
        if (!box) return;
        const r = proyectarPdfACanvas(figuraRecienCreada.bbox);
        box.style.left = r.x.toFixed(2) + 'px';
        box.style.top = r.y.toFixed(2) + 'px';
        box.style.width = r.w.toFixed(2) + 'px';
        box.style.height = r.h.toFixed(2) + 'px';
    }

    function instalarHookDibujar() {
        if (hookDibujarInstalado) return;
        if (typeof window.dibujar === 'function' && !window.dibujar._liraFigurasWrapped) {
            const orig = window.dibujar;
            window.dibujar = function (...args) {
                const res = orig.apply(this, args);
                if (window.modoFigurasActivo && figuraRecienCreada) {
                    requestAnimationFrame(() => reposicionarMarcoFiguraRecienCreada());
                }
                return res;
            };
            window.dibujar._liraFigurasWrapped = true;
            hookDibujarInstalado = true;
        }
    }

    function mostrarMarcoFiguraRecienCreada(figura) {
        limpiarSeleccionFiguraRecienCreada();
        if (!figura || !Array.isArray(figura.bbox)) return;
        figuraRecienCreada = figura;

        const container = document.getElementById('visor-container');
        if (!container) return;

        const r = proyectarPdfACanvas(figura.bbox);
        const box = document.createElement('div');
        box.id = MARCO_TEMPORAL_ID;
        box.className = 'mover-el-box seleccionado';
        box.dataset.tipo = 'figura';
        box.style.left = r.x.toFixed(2) + 'px';
        box.style.top = r.y.toFixed(2) + 'px';
        box.style.width = r.w.toFixed(2) + 'px';
        box.style.height = r.h.toFixed(2) + 'px';

        // 8 handles de redimensionado
        HANDLES.forEach((dir) => {
            const handle = document.createElement('div');
            handle.className = 'mover-handle';
            handle.dataset.dir = dir;

            handle.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();

                const origRect = {
                    x: parseFloat(box.style.left) || 0,
                    y: parseFloat(box.style.top) || 0,
                    w: parseFloat(box.style.width) || box.offsetWidth || MIN_PX,
                    h: parseFloat(box.style.height) || box.offsetHeight || MIN_PX
                };
                const op = {
                    handle: dir,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    origRect: origRect,
                    currentRect: { ...origRect },
                    bounds: obtenerLimitesPaginaCanvas()
                };

                box.classList.add('manipulando');
                const pop = document.getElementById(POPOVER_ID);
                if (pop) pop.classList.add('manipulando-figura');

                function onMouseMove(ev) {
                    op.currentRect = calcularRectRedimensionado(op, ev.clientX, ev.clientY, ev.shiftKey);
                    box.style.left = op.currentRect.x.toFixed(2) + 'px';
                    box.style.top = op.currentRect.y.toFixed(2) + 'px';
                    box.style.width = op.currentRect.w.toFixed(2) + 'px';
                    box.style.height = op.currentRect.h.toFixed(2) + 'px';
                }

                async function onMouseUp() {
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);

                    box.classList.remove('manipulando');
                    if (pop) pop.classList.remove('manipulando-figura');

                    const deltaMax = Math.max(
                        Math.abs(op.currentRect.x - op.origRect.x),
                        Math.abs(op.currentRect.y - op.origRect.y),
                        Math.abs(op.currentRect.w - op.origRect.w),
                        Math.abs(op.currentRect.h - op.origRect.h)
                    );
                    if (deltaMax <= 1.0) return;

                    const ruta = obtenerRutaPdf();
                    const pagIdx = obtenerPaginaIdx();
                    if (!ruta || typeof eel === 'undefined' || typeof eel.redimensionar_elemento_pdf !== 'function') return;

                    const nuevoBbox = proyectarCanvasAPdf(op.currentRect);
                    try {
                        const res = await eel.redimensionar_elemento_pdf(ruta, pagIdx, figuraRecienCreada, nuevoBbox)();
                        if (res && res.success) {
                            if (res.bbox) figuraRecienCreada.bbox = res.bbox;
                            if (res.xref) figuraRecienCreada.xref = res.xref;
                            if (res.vertices) figuraRecienCreada.vertices = res.vertices;
                            if (typeof cargarPagina === 'function') {
                                await cargarPagina(pagIdx);
                            }
                            reposicionarMarcoFiguraRecienCreada();
                            abrirPopoverEstiloFigura(figuraRecienCreada, box);
                        }
                    } catch (err) {
                        console.error('[FigurasPdf] Error al redimensionar figura:', err);
                    }
                }

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            });

            box.appendChild(handle);
        });

        // Arrastre desde el interior de la caja para mover
        box.addEventListener('mousedown', (e) => {
            if (e.button !== 0 || e.target.classList.contains('mover-handle')) return;
            e.preventDefault();
            e.stopPropagation();

            const origRect = {
                x: parseFloat(box.style.left) || 0,
                y: parseFloat(box.style.top) || 0,
                w: parseFloat(box.style.width) || box.offsetWidth || MIN_PX,
                h: parseFloat(box.style.height) || box.offsetHeight || MIN_PX
            };
            const op = {
                startClientX: e.clientX,
                startClientY: e.clientY,
                origRect: origRect,
                currentRect: { ...origRect },
                bounds: obtenerLimitesPaginaCanvas()
            };

            box.classList.add('manipulando');
            const pop = document.getElementById(POPOVER_ID);
            if (pop) pop.classList.add('manipulando-figura');

            function onMouseMove(ev) {
                const dx = ev.clientX - op.startClientX;
                const dy = ev.clientY - op.startClientY;
                const newX = clamp(op.origRect.x + dx, op.bounds.minX, op.bounds.maxX - op.origRect.w);
                const newY = clamp(op.origRect.y + dy, op.bounds.minY, op.bounds.maxY - op.origRect.h);
                op.currentRect.x = newX;
                op.currentRect.y = newY;
                box.style.left = newX.toFixed(2) + 'px';
                box.style.top = newY.toFixed(2) + 'px';
            }

            async function onMouseUp() {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);

                box.classList.remove('manipulando');
                if (pop) pop.classList.remove('manipulando-figura');

                const delta = Math.hypot(op.currentRect.x - op.origRect.x, op.currentRect.y - op.origRect.y);
                if (delta <= 1.0) return;

                const ruta = obtenerRutaPdf();
                const pagIdx = obtenerPaginaIdx();
                if (!ruta || typeof eel === 'undefined' || typeof eel.mover_elemento_pdf !== 'function') return;

                const nuevoBbox = proyectarCanvasAPdf(op.currentRect);
                try {
                    const res = await eel.mover_elemento_pdf(ruta, pagIdx, figuraRecienCreada, nuevoBbox)();
                    if (res && res.success) {
                        if (res.bbox) figuraRecienCreada.bbox = res.bbox;
                        if (res.xref) figuraRecienCreada.xref = res.xref;
                        if (res.vertices) figuraRecienCreada.vertices = res.vertices;
                        if (typeof cargarPagina === 'function') {
                            await cargarPagina(pagIdx);
                        }
                        reposicionarMarcoFiguraRecienCreada();
                        abrirPopoverEstiloFigura(figuraRecienCreada, box);
                    }
                } catch (err) {
                    console.error('[FigurasPdf] Error al mover figura:', err);
                }
            }

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        container.appendChild(box);
        abrirPopoverEstiloFigura(figuraRecienCreada, box);
    }

    function obtenerOCrearToolbar() {
        let tb = document.getElementById(TOOLBAR_ID);
        if (tb) return tb;

        tb = document.createElement('div');
        tb.id = TOOLBAR_ID;
        tb.className = 'toolbar-figuras-flotante';
        tb.innerHTML = `
            <div class="toolbar-figuras-grupo">
                <button type="button" class="btn-figura-tipo ${window.tipoFiguraSeleccionada === 'rect' ? 'activo' : ''}" data-tipo="rect" title="${txt('ttl-figura-rect', 'Rectángulo')}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                </button>
                <button type="button" class="btn-figura-tipo ${window.tipoFiguraSeleccionada === 'circle' ? 'activo' : ''}" data-tipo="circle" title="${txt('ttl-figura-circulo', 'Círculo / Óvalo')}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>
                </button>
                <button type="button" class="btn-figura-tipo ${window.tipoFiguraSeleccionada === 'arrow' ? 'activo' : ''}" data-tipo="arrow" title="${txt('ttl-figura-flecha', 'Flecha')}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
                <button type="button" class="btn-figura-tipo ${window.tipoFiguraSeleccionada === 'crop_img' ? 'activo' : ''}" data-tipo="crop_img" title="${txt('ttl-figura-recortar-zona', 'Recortar diagrama/zona como imagen (Shift: duplicar)')}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3.2 2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/></svg>
                </button>
                <button type="button" id="btn-figura-agregar-imagen" class="btn-figura-tipo" title="${txt('ttl-figura-imagen', 'Agregar imagen')}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                </button>
            </div>
            <div class="toolbar-figuras-separador"></div>
            <div class="toolbar-figuras-item" title="${txt('ttl-figura-color-borde', 'Color')}">
                <label for="input-color-borde-fig">${txt('lbl-figura-borde', 'Borde')}</label>
                <input type="color" id="input-color-borde-fig" value="${window.colorBordeFigura}">
            </div>
            <div class="toolbar-figuras-separador" id="toolbar-sep-relleno"></div>
            <div class="toolbar-figuras-item" id="toolbar-item-relleno" title="${txt('ttl-figura-color-relleno', 'Color de relleno')}">
                <label for="input-color-relleno-fig">${txt('lbl-figura-relleno', 'Relleno')}</label>
                <input type="color" id="input-color-relleno-fig" value="${window.colorRellenoFigura === 'none' ? '#ffffff' : window.colorRellenoFigura}">
                <button type="button" id="btn-toggle-sin-relleno" class="btn-sin-relleno ${window.colorRellenoFigura === 'none' ? 'activo' : ''}" title="${txt('ttl-figura-transparente', 'Sin relleno / Transparente')}">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                </button>
            </div>
            <div class="toolbar-figuras-separador"></div>
            <div class="toolbar-figuras-item" title="${txt('ttl-figura-grosor', 'Grosor de borde')}">
                <label for="select-grosor-fig">${txt('lbl-figura-grosor', 'Grosor')}</label>
                <select id="select-grosor-fig">
                    <option value="1">1 pt</option>
                    <option value="2" selected>2 pt</option>
                    <option value="3">3 pt</option>
                    <option value="4">4 pt</option>
                    <option value="6">6 pt</option>
                    <option value="8">8 pt</option>
                </select>
            </div>
            <button type="button" class="btn-cerrar-toolbar-fig" title="${txt('ttl-cerrar', 'Cerrar')}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        `;

        // Eventos toolbar
        tb.querySelectorAll('.btn-figura-tipo[data-tipo]').forEach((b) => {
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                tb.querySelectorAll('.btn-figura-tipo[data-tipo]').forEach((x) => x.classList.remove('activo'));
                b.classList.add('activo');
                window.tipoFiguraSeleccionada = b.dataset.tipo;
                actualizarVisibilidadRellenoToolbar(tb);
            });
        });

        const btnAgregarImg = tb.querySelector('#btn-figura-agregar-imagen');
        if (btnAgregarImg) {
            btnAgregarImg.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (typeof eel === 'undefined' || typeof eel.insertar_imagen_pdf_rpc !== 'function') return;
                const rutaPdf = obtenerRutaPdf();
                if (!rutaPdf) return;
                const pagIdx = obtenerPaginaIdx();
                btnAgregarImg.disabled = true;
                try {
                    const res = await eel.insertar_imagen_pdf_rpc(rutaPdf, pagIdx, null, null)();
                    if (res && res.cancelado) return;
                    if (res && res.success) {
                        toggleModoFiguras(false);
                        if (typeof window.seleccionarElementoPendienteMover === 'function') {
                            window.seleccionarElementoPendienteMover({
                                tipo: 'imagen',
                                xref: res.xref,
                                bbox: res.bbox
                            });
                        }
                        if (typeof cargarPagina === 'function') {
                            await cargarPagina(pagIdx);
                        }
                        if (typeof toggleModoMoverElementos === 'function') {
                            toggleModoMoverElementos(true);
                        }
                    } else if (res && res.error) {
                        mostrarAvisoToast(res.error, 'error');
                    }
                } catch (err) {
                    console.error('[FigurasPdf] Error insertando imagen:', err);
                } finally {
                    btnAgregarImg.disabled = false;
                }
            });
        }

        const inputBorde = tb.querySelector('#input-color-borde-fig');
        if (inputBorde) {
            inputBorde.addEventListener('input', (e) => {
                window.colorBordeFigura = e.target.value;
            });
        }

        const inputRelleno = tb.querySelector('#input-color-relleno-fig');
        const btnSinRelleno = tb.querySelector('#btn-toggle-sin-relleno');
        if (inputRelleno && btnSinRelleno) {
            inputRelleno.addEventListener('input', (e) => {
                window.colorRellenoFigura = e.target.value;
                btnSinRelleno.classList.remove('activo');
            });

            btnSinRelleno.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.colorRellenoFigura === 'none') {
                    window.colorRellenoFigura = inputRelleno.value || '#3498db';
                    btnSinRelleno.classList.remove('activo');
                } else {
                    window.colorRellenoFigura = 'none';
                    btnSinRelleno.classList.add('activo');
                }
            });
        }

        const selGrosor = tb.querySelector('#select-grosor-fig');
        if (selGrosor) {
            selGrosor.value = String(window.grosorBordeFigura);
            selGrosor.addEventListener('change', (e) => {
                window.grosorBordeFigura = parseFloat(e.target.value) || 2;
            });
        }

        const btnCerrar = tb.querySelector('.btn-cerrar-toolbar-fig');
        if (btnCerrar) {
            btnCerrar.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleModoFiguras(false);
            });
        }

        document.body.appendChild(tb);
        actualizarVisibilidadRellenoToolbar(tb);
        return tb;
    }

    function mostrarToolbar(mostrar) {
        const tb = obtenerOCrearToolbar();
        if (mostrar) {
            actualizarVisibilidadRellenoToolbar(tb);
            tb.style.display = 'flex';
            posicionarToolbarFiguras();
        } else {
            tb.style.display = 'none';
        }
    }

    function posicionarToolbarFiguras() {
        const tb = document.getElementById(TOOLBAR_ID);
        if (!tb || tb.style.display === 'none') return;
        let topOffset = 54;
        const banner = document.getElementById('banner-container');
        if (banner) {
            const rect = banner.getBoundingClientRect();
            if (rect && rect.bottom > 0) {
                topOffset = Math.round(rect.bottom + 8);
            }
        }
        tb.style.top = `${topOffset}px`;
    }

    function toggleModoFiguras(activo) {
        if (typeof activo === 'undefined') {
            window.modoFigurasActivo = !window.modoFigurasActivo;
        } else {
            window.modoFigurasActivo = Boolean(activo);
        }

        actualizarBotonesUI(window.modoFigurasActivo);
        const container = document.getElementById('visor-container');
        const canvas = document.getElementById('lienzo-pdf');

        if (window.modoFigurasActivo) {
            desactivarOtrosModos();
            mostrarToolbar(true);
            limpiarSeleccionFiguraRecienCreada();
            if (container) container.classList.add('modo-figuras-activo');
            if (canvas) canvas.style.cursor = 'crosshair';
            registrarListenersDibujo();
            instalarHookDibujar();
        } else {
            mostrarToolbar(false);
            limpiarSeleccionFiguraRecienCreada();
            if (container) container.classList.remove('modo-figuras-activo');
            if (canvas) canvas.style.cursor = '';
            removerPreview();
            dibujoActivo = null;
        }
    }

    function asegurarPreview() {
        let prev = document.getElementById(PREVIEW_ID);
        if (!prev) {
            prev = document.createElement('div');
            prev.id = PREVIEW_ID;
            prev.className = 'figura-preview-overlay';
            const container = document.getElementById('visor-container');
            if (container) container.appendChild(prev);
        }
        return prev;
    }

    function removerPreview() {
        const prev = document.getElementById(PREVIEW_ID);
        if (prev) prev.remove();
    }

    function actualizarPreview(startX, startY, currentX, currentY, tipo, shiftKey) {
        const prev = asegurarPreview();

        if (tipo === 'arrow') {
            let finalX = currentX;
            let finalY = currentY;

            if (shiftKey) {
                const dx = currentX - startX;
                const dy = currentY - startY;
                const angle = Math.atan2(dy, dx);
                const dist = Math.hypot(dx, dy);
                const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
                finalX = startX + dist * Math.cos(snap);
                finalY = startY + dist * Math.sin(snap);
            }

            prev.style.border = 'none';
            prev.style.backgroundColor = 'transparent';
            prev.style.borderRadius = '0';
            prev.style.left = '0px';
            prev.style.top = '0px';
            prev.style.width = '100%';
            prev.style.height = '100%';
            prev.style.display = 'block';

            const markerId = 'arrow-marker-preview-live';
            prev.innerHTML = `
                <svg style="width:100%;height:100%;overflow:visible;pointer-events:none;">
                    <defs>
                        <marker id="${markerId}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="${window.colorBordeFigura}"/>
                        </marker>
                    </defs>
                    <line x1="${startX}" y1="${startY}" x2="${finalX}" y2="${finalY}" stroke="${window.colorBordeFigura}" stroke-width="${window.grosorBordeFigura}" marker-end="url(#${markerId})" stroke-linecap="round"/>
                </svg>
            `;
            return { startX, startY, currentX: finalX, currentY: finalY };
        }

        prev.innerHTML = '';
        let w = currentX - startX;
        let h = currentY - startY;

        if (shiftKey && tipo !== 'crop_img') {
            const lado = Math.max(Math.abs(w), Math.abs(h));
            w = (w >= 0 ? 1 : -1) * lado;
            h = (h >= 0 ? 1 : -1) * lado;
        }

        const left = w >= 0 ? startX : startX + w;
        const top = h >= 0 ? startY : startY + h;
        const width = Math.abs(w);
        const height = Math.abs(h);

        prev.style.left = left + 'px';
        prev.style.top = top + 'px';
        prev.style.width = width + 'px';
        prev.style.height = height + 'px';
        if (tipo === 'crop_img') {
            prev.style.border = '2px dashed #2563eb';
            prev.style.backgroundColor = 'rgba(37, 99, 235, 0.12)';
            prev.style.borderRadius = '2px';
        } else {
            prev.style.border = `${window.grosorBordeFigura}px solid ${window.colorBordeFigura}`;
            prev.style.backgroundColor = window.colorRellenoFigura === 'none' ? 'transparent' : window.colorRellenoFigura;
            prev.style.borderRadius = tipo === 'circle' ? '50%' : '2px';
        }
        prev.style.display = 'block';

        return { x: left, y: top, w: width, h: height };
    }

    function registrarListenersDibujo() {
        if (listenersInicializados) return;
        listenersInicializados = true;

        const container = document.getElementById('visor-container');
        if (!container) return;

        container.addEventListener('mousedown', (e) => {
            if (!window.modoFigurasActivo || e.button !== 0) return;
            if (e.target.closest('#' + TOOLBAR_ID) || e.target.closest('#' + POPOVER_ID) || e.target.closest('#' + MARCO_TEMPORAL_ID)) {
                return;
            }

            // Si hay una figura recién creada activa, fijarla al hacer clic fuera
            if (figuraRecienCreada) {
                limpiarSeleccionFiguraRecienCreada();
            } else {
                cerrarPopoverEstiloFigura();
            }

            const rectContainer = container.getBoundingClientRect();
            const startX = e.clientX - rectContainer.left + container.scrollLeft;
            const startY = e.clientY - rectContainer.top + container.scrollTop;

            dibujoActivo = {
                startX: startX,
                startY: startY,
                currentX: startX,
                currentY: startY,
                tipo: window.tipoFiguraSeleccionada
            };

            actualizarPreview(startX, startY, startX, startY, dibujoActivo.tipo, e.shiftKey);
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!window.modoFigurasActivo || !dibujoActivo) return;
            const containerEl = document.getElementById('visor-container');
            if (!containerEl) return;

            const rectContainer = containerEl.getBoundingClientRect();
            dibujoActivo.currentX = e.clientX - rectContainer.left + containerEl.scrollLeft;
            dibujoActivo.currentY = e.clientY - rectContainer.top + containerEl.scrollTop;

            actualizarPreview(
                dibujoActivo.startX,
                dibujoActivo.startY,
                dibujoActivo.currentX,
                dibujoActivo.currentY,
                dibujoActivo.tipo,
                e.shiftKey
            );
        });

        window.addEventListener('mouseup', async (e) => {
            if (!window.modoFigurasActivo || !dibujoActivo) return;
            const finalDibujo = dibujoActivo;
            dibujoActivo = null;

            const containerEl = document.getElementById('visor-container');
            if (!containerEl) {
                removerPreview();
                return;
            }

            const pagIdx = obtenerPaginaIdx();
            const ruta = obtenerRutaPdf();

            if (!ruta || typeof eel === 'undefined' || typeof eel.crear_figura_pdf_rpc !== 'function') {
                removerPreview();
                return;
            }

            if (finalDibujo.tipo === 'arrow') {
                let curX = finalDibujo.currentX;
                let curY = finalDibujo.currentY;

                if (e.shiftKey) {
                    const dx = curX - finalDibujo.startX;
                    const dy = curY - finalDibujo.startY;
                    const angle = Math.atan2(dy, dx);
                    const dist = Math.hypot(dx, dy);
                    const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
                    curX = finalDibujo.startX + dist * Math.cos(snap);
                    curY = finalDibujo.startY + dist * Math.sin(snap);
                }

                const dist = Math.hypot(curX - finalDibujo.startX, curY - finalDibujo.startY);
                removerPreview();

                // Longitud euclidiana mínima de 8px para flechas
                if (dist < 8) return;

                const p1Pdf = proyectarPuntoCanvasAPdf(finalDibujo.startX, finalDibujo.startY);
                const p2Pdf = proyectarPuntoCanvasAPdf(curX, curY);

                try {
                    const res = await eel.crear_figura_pdf_rpc(
                        ruta,
                        pagIdx,
                        p1Pdf[0],
                        p1Pdf[1],
                        p2Pdf[0],
                        p2Pdf[1],
                        'arrow',
                        window.colorBordeFigura,
                        window.colorBordeFigura,
                        window.grosorBordeFigura,
                        1.0
                    )();

                    if (res && res.success) {
                        if (typeof cargarPagina === 'function') {
                            await cargarPagina(pagIdx);
                        }
                        const figuraCreada = {
                            id: `figura-${res.xref}`,
                            tipo: 'figura',
                            tipo_figura: 'arrow',
                            xref: res.xref,
                            bbox: res.bbox,
                            vertices: res.vertices,
                            color_borde: res.color_borde || window.colorBordeFigura,
                            color_relleno: res.color_borde || window.colorBordeFigura,
                            grosor: res.grosor || window.grosorBordeFigura
                        };
                        mostrarMarcoFiguraRecienCreada(figuraCreada);
                    }
                } catch (err) {
                    console.error('[FigurasPdf] Error al crear flecha:', err);
                }
                return;
            }

            if (finalDibujo.tipo === 'crop_img') {
                const w = finalDibujo.currentX - finalDibujo.startX;
                const h = finalDibujo.currentY - finalDibujo.startY;
                const left = w >= 0 ? finalDibujo.startX : finalDibujo.startX + w;
                const top = h >= 0 ? finalDibujo.startY : finalDibujo.startY + h;
                const width = Math.abs(w);
                const height = Math.abs(h);
                removerPreview();
                if (width < 10 || height < 10) return;
                if (typeof eel.recortar_zona_como_imagen_rpc !== 'function') return;

                const p1Pdf = proyectarPuntoCanvasAPdf(left, top);
                const p2Pdf = proyectarPuntoCanvasAPdf(left + width, top + height);
                try {
                    const res = await eel.recortar_zona_como_imagen_rpc(
                        ruta,
                        pagIdx,
                        p1Pdf[0],
                        p1Pdf[1],
                        p2Pdf[0],
                        p2Pdf[1],
                        Boolean(e.shiftKey)
                    )();
                    if (res && res.success) {
                        toggleModoFiguras(false);
                        if (typeof window.seleccionarElementoPendienteMover === 'function') {
                            window.seleccionarElementoPendienteMover({
                                tipo: 'imagen',
                                xref: res.xref,
                                bbox: res.bbox
                            });
                        }
                        if (typeof cargarPagina === 'function') {
                            await cargarPagina(pagIdx);
                        }
                        if (typeof toggleModoMoverElementos === 'function') {
                            toggleModoMoverElementos(true);
                        }
                    } else if (res && res.error) {
                        mostrarAvisoToast(res.error, 'error');
                    }
                } catch (err) {
                    console.error('[FigurasPdf] Error recortando zona como imagen:', err);
                }
                return;
            }

            // Rectángulo y círculo
            const rawW = finalDibujo.currentX - finalDibujo.startX;
            const rawH = finalDibujo.currentY - finalDibujo.startY;
            let w = Math.abs(rawW);
            let h = Math.abs(rawH);

            if (e.shiftKey) {
                const lado = Math.max(w, h);
                w = lado;
                h = lado;
            }

            const left = rawW >= 0 ? finalDibujo.startX : finalDibujo.startX - w;
            const top = rawH >= 0 ? finalDibujo.startY : finalDibujo.startY - h;

            removerPreview();

            // Mínimo 6x6 px para evitar clics accidentales en rectángulos y círculos
            if (w < 6 || h < 6) return;

            const rectPdf = proyectarCanvasAPdf({ x: left, y: top, w: w, h: h });

            try {
                const rellenoParam = window.colorRellenoFigura === 'none' ? null : window.colorRellenoFigura;
                const res = await eel.crear_figura_pdf_rpc(
                    ruta,
                    pagIdx,
                    rectPdf[0],
                    rectPdf[1],
                    rectPdf[2],
                    rectPdf[3],
                    finalDibujo.tipo,
                    window.colorBordeFigura,
                    rellenoParam,
                    window.grosorBordeFigura,
                    1.0
                )();

                if (res && res.success) {
                    if (typeof cargarPagina === 'function') {
                        await cargarPagina(pagIdx);
                    }
                    const figuraCreada = {
                        id: `figura-${res.xref}`,
                        tipo: 'figura',
                        tipo_figura: res.tipo_figura || finalDibujo.tipo,
                        xref: res.xref,
                        bbox: res.bbox,
                        color_borde: res.color_borde || window.colorBordeFigura,
                        color_relleno: res.color_relleno || rellenoParam,
                        grosor: res.grosor || window.grosorBordeFigura
                    };
                    mostrarMarcoFiguraRecienCreada(figuraCreada);
                } else {
                    console.error('[FigurasPdf] Error al crear figura:', res?.error);
                }
            } catch (err) {
                console.error('[FigurasPdf] Excepción al crear figura:', err);
            }
        });
    }

    // ==========================================
    // POPOVER DE ESTILO DE FIGURA (EDICIÓN RÁPIDA)
    // ==========================================
    function obtenerOCrearPopoverEstilo() {
        let p = document.getElementById(POPOVER_ID);
        if (p) return p;

        p = document.createElement('div');
        p.id = POPOVER_ID;
        p.className = 'popover-estilo-figura';
        p.innerHTML = `
            <div class="popover-fig-header">
                <span class="popover-fig-titulo" id="popover-fig-tipo-titulo">${txt('lbl-estilo-figura', 'Estilo de Figura')}</span>
                <button type="button" class="btn-cerrar-popover-fig" title="${txt('ttl-cerrar', 'Cerrar')}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="popover-fig-body">
                <div class="popover-fig-fila">
                    <label id="pop-label-borde">${txt('lbl-figura-borde', 'Color de borde')}</label>
                    <input type="color" id="pop-color-borde-fig" value="#000000">
                </div>
                <div class="popover-fig-fila" id="pop-fila-relleno">
                    <label>${txt('lbl-figura-relleno', 'Color de relleno')}</label>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <input type="color" id="pop-color-relleno-fig" value="#ffffff">
                        <button type="button" id="pop-btn-sin-relleno" class="btn-sin-relleno" title="${txt('ttl-figura-transparente', 'Sin relleno / Transparente')}">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                        </button>
                    </div>
                </div>
                <div class="popover-fig-fila">
                    <label>${txt('lbl-figura-grosor', 'Grosor de borde')}</label>
                    <select id="pop-select-grosor-fig">
                        <option value="1">1 pt</option>
                        <option value="2">2 pt</option>
                        <option value="3">3 pt</option>
                        <option value="4">4 pt</option>
                        <option value="6">6 pt</option>
                        <option value="8">8 pt</option>
                    </select>
                </div>
            </div>
            <div class="popover-fig-footer">
                <button type="button" id="pop-btn-eliminar-fig" class="btn-popover-peligro" title="${txt('ctx-mover-eliminar', 'Eliminar')}">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    <span>${txt('ctx-mover-eliminar', 'Eliminar')}</span>
                </button>
                <button type="button" id="pop-btn-aplicar-fig" class="btn-popover-primario">
                    ${txt('btn-aplicar', 'Listo')}
                </button>
            </div>
        `;

        document.body.appendChild(p);

        // Arrastrar popover desde el encabezado
        const header = p.querySelector('.popover-fig-header');
        if (header) {
            header.addEventListener('mousedown', (e) => {
                if (e.target.closest('.btn-cerrar-popover-fig') || e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                p.classList.add('arrastrando');
                const startX = e.clientX;
                const startY = e.clientY;
                const initialLeft = p.offsetLeft;
                const initialTop = p.offsetTop;

                function onMouseMove(ev) {
                    p.style.transform = 'none';
                    const dx = ev.clientX - startX;
                    const dy = ev.clientY - startY;
                    p.style.left = Math.round(initialLeft + dx) + 'px';
                    p.style.top = Math.round(initialTop + dy) + 'px';
                }

                function onMouseUp() {
                    p.classList.remove('arrastrando');
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                }

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            });
        }

        // Listeners del popover
        p.querySelector('.btn-cerrar-popover-fig').addEventListener('click', cerrarPopoverEstiloFigura);
        p.querySelector('#pop-btn-aplicar-fig').addEventListener('click', cerrarPopoverEstiloFigura);

        p.querySelector('#pop-color-borde-fig').addEventListener('change', (e) => {
            aplicarCambioEstiloFigura({ color_borde: e.target.value });
        });

        const popInputRelleno = p.querySelector('#pop-color-relleno-fig');
        const popBtnSinRelleno = p.querySelector('#pop-btn-sin-relleno');

        popInputRelleno.addEventListener('change', (e) => {
            popBtnSinRelleno.classList.remove('activo');
            aplicarCambioEstiloFigura({ color_relleno: e.target.value });
        });

        popBtnSinRelleno.addEventListener('click', () => {
            const esTransparente = popBtnSinRelleno.classList.toggle('activo');
            if (esTransparente) {
                aplicarCambioEstiloFigura({ color_relleno: 'none' });
            } else {
                aplicarCambioEstiloFigura({ color_relleno: popInputRelleno.value || '#3498db' });
            }
        });

        p.querySelector('#pop-select-grosor-fig').addEventListener('change', (e) => {
            aplicarCambioEstiloFigura({ grosor: parseFloat(e.target.value) || 2 });
        });

        p.querySelector('#pop-btn-eliminar-fig').addEventListener('click', async () => {
            if (figuraEditandoActual) {
                const el = figuraEditandoActual;
                limpiarSeleccionFiguraRecienCreada();
                const ruta = obtenerRutaPdf();
                const pagIdx = obtenerPaginaIdx();
                if (ruta && typeof eel !== 'undefined' && typeof eel.eliminar_elemento_pdf === 'function') {
                    try {
                        const res = await eel.eliminar_elemento_pdf(ruta, pagIdx, el)();
                        if (res && res.success && typeof cargarPagina === 'function') {
                            await cargarPagina(pagIdx);
                        }
                    } catch (err) {
                        console.error('[FigurasPdf] Error al eliminar figura:', err);
                    }
                } else if (typeof window.eliminarElementoMover === 'function') {
                    window.eliminarElementoMover(el);
                }
            }
        });

        return p;
    }

    async function aplicarCambioEstiloFigura(cambios) {
        if (!figuraEditandoActual) return;
        const ruta = obtenerRutaPdf();
        const pagIdx = obtenerPaginaIdx();
        if (!ruta || typeof eel === 'undefined' || typeof eel.editar_figura_pdf_rpc !== 'function') return;

        const p = obtenerOCrearPopoverEstilo();
        const colorBorde = cambios.color_borde !== undefined ? cambios.color_borde : p.querySelector('#pop-color-borde-fig').value;
        const esArrow = figuraEditandoActual.tipo_figura === 'arrow';

        let colorRelleno;
        if (esArrow) {
            colorRelleno = colorBorde;
        } else {
            colorRelleno = cambios.color_relleno !== undefined ? cambios.color_relleno : (
                p.querySelector('#pop-btn-sin-relleno').classList.contains('activo') ? 'none' : p.querySelector('#pop-color-relleno-fig').value
            );
        }
        const grosor = cambios.grosor !== undefined ? cambios.grosor : parseFloat(p.querySelector('#pop-select-grosor-fig').value) || 2;

        const rellenoParam = colorRelleno;

        try {
            const res = await eel.editar_figura_pdf_rpc(
                ruta,
                pagIdx,
                figuraEditandoActual,
                colorBorde,
                rellenoParam,
                grosor
            )();

            if (res && res.success) {
                figuraEditandoActual.color_borde = res.color_borde || colorBorde;
                figuraEditandoActual.color_relleno = res.color_relleno || (rellenoParam === 'none' ? null : rellenoParam);
                figuraEditandoActual.grosor = res.grosor || grosor;
                if (res.xref) figuraEditandoActual.xref = res.xref;
                if (res.bbox) figuraEditandoActual.bbox = res.bbox;

                if (figuraRecienCreada) {
                    figuraRecienCreada.color_borde = figuraEditandoActual.color_borde;
                    figuraRecienCreada.color_relleno = figuraEditandoActual.color_relleno;
                    figuraRecienCreada.grosor = figuraEditandoActual.grosor;
                    if (res.xref) figuraRecienCreada.xref = res.xref;
                    if (res.bbox) figuraRecienCreada.bbox = res.bbox;
                }

                if (typeof cargarPagina === 'function') {
                    await cargarPagina(pagIdx);
                }
                reposicionarMarcoFiguraRecienCreada();
            }
        } catch (err) {
            console.error('[FigurasPdf] Error actualizando figura:', err);
        }
    }

    function proyectarBboxPdfAPantalla(bboxPdf) {
        if (!Array.isArray(bboxPdf) || bboxPdf.length < 4) return null;
        const canvas = document.getElementById('lienzo-pdf');
        if (!canvas) return null;
        const memPag = (typeof memoriaLayout !== 'undefined' && memoriaLayout) ? memoriaLayout[obtenerPaginaIdx().toString()] : null;
        const baseEscala = memPag?.escala || (typeof datosPagina !== 'undefined' && datosPagina?.factor_zoom) || 1.5;
        const sc = baseEscala * (typeof nivelZoomPDF !== 'undefined' ? nivelZoomPDF : 1.0);
        const cRect = canvas.getBoundingClientRect();
        return {
            left: cRect.left + bboxPdf[0] * sc,
            top: cRect.top + bboxPdf[1] * sc,
            right: cRect.left + bboxPdf[2] * sc,
            bottom: cRect.top + bboxPdf[3] * sc
        };
    }

    function abrirPopoverEstiloFigura(elemento, anchorEl) {
        if (!elemento || elemento.tipo !== 'figura') return;
        figuraEditandoActual = elemento;

        const p = obtenerOCrearPopoverEstilo();
        const titulo = p.querySelector('#popover-fig-tipo-titulo');
        const filaRelleno = p.querySelector('#pop-fila-relleno');
        const labelBorde = p.querySelector('#pop-label-borde');

        const esArrow = elemento.tipo_figura === 'arrow';

        if (titulo) {
            let tipoNom;
            if (esArrow) {
                tipoNom = txt('ttl-figura-flecha', 'Flecha');
            } else if (elemento.tipo_figura === 'circle') {
                tipoNom = txt('ttl-figura-circulo', 'Círculo / Óvalo');
            } else {
                tipoNom = txt('ttl-figura-rect', 'Rectángulo');
            }
            titulo.textContent = `${txt('lbl-estilo-figura', 'Estilo:')} ${tipoNom}`;
        }

        if (labelBorde) {
            labelBorde.textContent = esArrow ? txt('ttl-figura-color-flecha', 'Color de flecha') : txt('lbl-figura-borde', 'Color de borde');
        }

        if (filaRelleno) {
            filaRelleno.style.display = esArrow ? 'none' : 'flex';
        }

        const inputBorde = p.querySelector('#pop-color-borde-fig');
        if (inputBorde) inputBorde.value = elemento.color_borde || '#000000';

        const inputRelleno = p.querySelector('#pop-color-relleno-fig');
        const btnSinRelleno = p.querySelector('#pop-btn-sin-relleno');
        if (inputRelleno && btnSinRelleno) {
            if (!elemento.color_relleno || elemento.color_relleno === 'none') {
                btnSinRelleno.classList.add('activo');
            } else {
                btnSinRelleno.classList.remove('activo');
                inputRelleno.value = elemento.color_relleno;
            }
        }

        const selGrosor = p.querySelector('#pop-select-grosor-fig');
        if (selGrosor) {
            const gVal = Math.round(elemento.grosor || 2);
            selGrosor.value = String(gVal);
            if (!selGrosor.value) selGrosor.value = '2';
        }

        // Posicionar popover
        p.style.display = 'block';

        let targetRect = null;
        if (anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
            targetRect = anchorEl.getBoundingClientRect();
        } else if (document.getElementById(MARCO_TEMPORAL_ID)) {
            targetRect = document.getElementById(MARCO_TEMPORAL_ID).getBoundingClientRect();
        } else if (Array.isArray(elemento.bbox)) {
            const boxEl = document.querySelector(`.mover-el-box[data-el-id="${elemento.id}"]`);
            if (boxEl) {
                targetRect = boxEl.getBoundingClientRect();
            } else {
                targetRect = proyectarBboxPdfAPantalla(elemento.bbox);
            }
        }

        if (targetRect) {
            const popW = p.offsetWidth || 230;
            const popH = p.offsetHeight || 220;
            let left = targetRect.right + 12;
            let top = targetRect.top;

            if (left + popW > window.innerWidth - 12) {
                left = Math.max(12, targetRect.left - popW - 12);
            }
            if (top + popH > window.innerHeight - 12) {
                top = Math.max(12, window.innerHeight - popH - 12);
            }

            p.style.transform = 'none';
            p.style.left = Math.round(left) + 'px';
            p.style.top = Math.round(top) + 'px';
        } else {
            p.style.left = '50%';
            p.style.top = '100px';
            p.style.transform = 'translateX(-50%)';
        }
    }

    function cerrarPopoverEstiloFigura() {
        const p = document.getElementById(POPOVER_ID);
        if (p) {
            p.style.display = 'none';
            p.classList.remove('arrastrando');
        }
        figuraEditandoActual = null;
    }

    // Atajos de teclado en modo figuras (Escape, Delete, Backspace, Ctrl+Z)
    document.addEventListener('keydown', (e) => {
        if (!window.modoFigurasActivo) return;

        // Escape: limpiar selección temporal y cerrar popover
        if (e.key === 'Escape') {
            limpiarSeleccionFiguraRecienCreada();
            return;
        }

        // Delete / Backspace: eliminar figura recién creada activa (sin foco en inputs)
        if ((e.key === 'Delete' || e.key === 'Backspace') && figuraRecienCreada) {
            if (esContextoEditable(e)) return;
            e.preventDefault();
            const el = figuraRecienCreada;
            limpiarSeleccionFiguraRecienCreada();
            const ruta = obtenerRutaPdf();
            const pagIdx = obtenerPaginaIdx();
            if (ruta && typeof eel !== 'undefined' && typeof eel.eliminar_elemento_pdf === 'function') {
                eel.eliminar_elemento_pdf(ruta, pagIdx, el)().then(async (res) => {
                    if (res && res.success && typeof cargarPagina === 'function') {
                        await cargarPagina(pagIdx);
                    }
                }).catch((err) => {
                    console.error('[FigurasPdf] Error al eliminar figura con Delete:', err);
                });
            }
            return;
        }

        // Ctrl + Z: Deshacer dentro del Modo Figuras
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            if (window.modoMoverElementosActivo) return;
            if (esContextoEditable(e)) return;

            e.preventDefault();
            limpiarSeleccionFiguraRecienCreada();
            const ruta = obtenerRutaPdf();
            const pagIdx = obtenerPaginaIdx();
            if (ruta && typeof eel !== 'undefined' && typeof eel.deshacer_edicion_pdf === 'function') {
                eel.deshacer_edicion_pdf(ruta)().then(async (res) => {
                    if (res && res.success && typeof cargarPagina === 'function') {
                        await cargarPagina(pagIdx);
                    }
                }).catch((err) => {
                    console.error('[FigurasPdf] Error al deshacer en modo figuras:', err);
                });
            }
            return;
        }
    });

    window.addEventListener('resize', () => {
        posicionarToolbarFiguras();
        reposicionarMarcoFiguraRecienCreada();
    });
    try {
        const observerZen = new MutationObserver(() => {
            if (window.modoFigurasActivo) {
                setTimeout(posicionarToolbarFiguras, 50);
            }
        });
        observerZen.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (_) {}

    window.toggleModoFiguras = toggleModoFiguras;
    window.abrirPopoverEstiloFigura = abrirPopoverEstiloFigura;
    window.cerrarPopoverEstiloFigura = cerrarPopoverEstiloFigura;
    window.limpiarSeleccionFiguraRecienCreada = limpiarSeleccionFiguraRecienCreada;
    window.reposicionarMarcoFiguraRecienCreada = reposicionarMarcoFiguraRecienCreada;
    window.posicionarToolbarFiguras = posicionarToolbarFiguras;
})();
