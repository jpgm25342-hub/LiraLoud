/* LiraLoud
 * Módulo "Mover elementos" para manipular imágenes y cuadros de texto (FreeText) sobre el PDF
 */

window.modoMoverElementosActivo = false;
window.rotacionLibreActiva = false;

(function () {
    const LAYER_ID = 'lira-mover-elementos-layer';
    const BADGE_ID = 'lira-mover-angulo-badge';
    const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    const MIN_PX = 8;

    let elementosPaginaActual = [];
    let elementoSeleccionadoId = null;
    let pendienteSeleccion = null; // { tipo, xref, bbox }
    let operacionActiva = null;
    let rotacionLibreTarget = null; // { el, boxEl, badgeEl, arrastrando, cx, cy, startPointerAngle, currentDeg }
    let cargaToken = 0;
    let mutacionEnCurso = false;
    let listenersInicializados = false;
    let hookDibujarInstalado = false;

    function setEstadoManipulacion(activo) {
        if (activo) {
            document.body.classList.add('manipulando-elemento');
            const pop = document.getElementById('popover-estilo-figura');
            if (pop) pop.classList.add('manipulando-figura');
        } else {
            document.body.classList.remove('manipulando-elemento');
            const pop = document.getElementById('popover-estilo-figura');
            if (pop) pop.classList.remove('manipulando-figura');
        }
    }

    const {
        clamp,
        obtenerPaginaIdx,
        obtenerRutaPdf,
        proyectarPdfACanvas,
        proyectarCanvasAPdf,
        obtenerLimitesPaginaCanvas
    } = window.LiraPdfEditorUtils;

    function obtenerElementoPorId(id) {
        if (!id) return null;
        return elementosPaginaActual.find((el) => el && el.id === id) || null;
    }

    function asegurarCapaMoverElementos() {
        const container = document.getElementById('visor-container');
        if (!container) return null;
        let layer = document.getElementById(LAYER_ID);
        if (!layer) {
            layer = document.createElement('div');
            layer.id = LAYER_ID;
            container.appendChild(layer);
        }
        return layer;
    }

    function ajustarDimensionesCapa(layer) {
        if (!layer) return;
        const container = document.getElementById('visor-container');
        const wrapper = document.getElementById('pdf-crop-wrapper');
        if (!container) return;
        const targetW = wrapper ? Math.max(container.clientWidth, wrapper.offsetLeft + wrapper.offsetWidth + 20) : container.clientWidth;
        const targetH = wrapper ? Math.max(container.clientHeight, wrapper.offsetTop + wrapper.offsetHeight + 20) : container.clientHeight;
        layer.style.width = targetW + 'px';
        layer.style.height = targetH + 'px';
    }

    function actualizarBotonesUI(activo) {
        const btnGroup = document.getElementById('group-mover-elementos');
        if (btnGroup) btnGroup.classList.toggle('active', activo);

        const btn = document.getElementById('btn-mover-elementos');
        if (btn) {
            btn.classList.toggle('activo', activo);
            btn.classList.toggle('active', activo);
            btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
        }

        const btnZen = document.getElementById('btn-mover-elementos-zen');
        if (btnZen) {
            btnZen.setAttribute('aria-pressed', activo ? 'true' : 'false');
        }

        document.querySelectorAll('.zen-item-mover-elementos').forEach((el) => {
            el.classList.toggle('tool-active-underline', activo);
        });
    }

    function desactivarOtrosModos() {
        const modosExcluyentes = [
            ['modoEditorTextoActivo', 'toggleModoEditorTexto'],
            ['modoCuadroTextoActivo', 'activarModoCuadroTexto'],
            ['modoFigurasActivo', 'toggleModoFiguras'],
            ['modoSubrayadorActivo', 'toggleModoSubrayador'],
            ['modoBorradorActivo', 'toggleModoBorrador'],
            ['modoRecorteActivo', 'toggleModoRecorteExtraccion'],
            ['capturandoCorte', 'toggleCapturaCorte']
        ];
        modosExcluyentes.forEach(([flag, fn]) => {
            if (window[flag] && typeof window[fn] === 'function') window[fn](false);
        });
        const chkLimites = document.getElementById('chk-dibujar-limites');
        if (chkLimites && chkLimites.checked) {
            chkLimites.checked = false;
            if (typeof toggleDibujoLimites === 'function') toggleDibujoLimites(false);
        }
        const detailsLimites = document.getElementById('zen-details-limites');
        if (detailsLimites && detailsLimites.open) detailsLimites.open = false;
        if (typeof arrastre !== 'undefined' && arrastre) {
            arrastre = { tipo: null, index: -1, colKey: null, cual: null };
        }
        window.creandoZonaExcluida = false;
        window.arrastreZonaExcluida = null;
    }

    function _esNodoEditableMover(node) {
        if (!node || !node.tagName) return false;
        const tag = node.tagName.toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (node.isContentEditable) return true;
        if (typeof node.getAttribute === 'function' && node.getAttribute('contenteditable') === 'true') return true;
        return typeof node.closest === 'function' && Boolean(node.closest('[contenteditable="true"]'));
    }

    function esContextoEditableConFoco(e) {
        if (window.textoEditandoActivo || document.getElementById('lira-editor-popup')) return true;
        if (document.getElementById('lira-dialog-overlay')?.classList.contains('activo')) return true;
        return [document.activeElement, e?.target].some(_esNodoEditableMover);
    }

    function mostrarAvisoToast(msg, tipo = 'info') {
        if (typeof mostrarNotificacionToast === 'function') {
            mostrarNotificacionToast(msg, tipo);
        } else if (typeof mostrarToastLira === 'function') {
            mostrarToastLira(msg, tipo);
        }
    }

    function limpiarCapaMoverElementos() {
        if (typeof window.cerrarMenuContextualElementos === 'function') {
            window.cerrarMenuContextualElementos();
        }
        finalizarRotacionLibre(false);
        operacionActiva = null;
        const layer = document.getElementById(LAYER_ID);
        if (layer) {
            layer.innerHTML = '';
        }
    }

    function limpiarEstadoMoverElementos() {
        limpiarCapaMoverElementos();
        elementosPaginaActual = [];
        elementoSeleccionadoId = null;
        pendienteSeleccion = null;
        cargaToken++;
    }

    function seleccionarElementoMover(id) {
        elementoSeleccionadoId = id || null;
        const layer = document.getElementById(LAYER_ID);
        if (!layer) return;
        layer.querySelectorAll('.mover-el-box').forEach((box) => {
            const esSel = Boolean(elementoSeleccionadoId && box.dataset.elId === elementoSeleccionadoId);
            box.classList.toggle('seleccionado', esSel);
            box.querySelectorAll('.mover-handle').forEach((h) => h.remove());
            if (esSel) {
                const el = obtenerElementoPorId(box.dataset.elId);
                if (el) agregarHandlesACaja(box, el);
            }
        });
    }

    function _iniciarOperacionCajaMover(modo, el, box, e, fallbackRect, handle = null) {
        const origRect = {
            x: parseFloat(box.style.left) || fallbackRect.x || 0,
            y: parseFloat(box.style.top) || fallbackRect.y || 0,
            w: parseFloat(box.style.width) || fallbackRect.w || box.offsetWidth || MIN_PX,
            h: parseFloat(box.style.height) || fallbackRect.h || box.offsetHeight || MIN_PX
        };
        operacionActiva = {
            modo,
            handle,
            el,
            boxEl: box,
            startClientX: e.clientX,
            startClientY: e.clientY,
            origRect,
            currentRect: { ...origRect },
            bounds: obtenerLimitesPaginaCanvas()
        };
        box.classList.add('manipulando');
        setEstadoManipulacion(true);
    }

    function agregarHandlesACaja(box, el) {
        HANDLES.forEach((dir) => {
            const handle = document.createElement('div');
            handle.className = 'mover-handle';
            handle.dataset.dir = dir;
            handle.addEventListener('mousedown', (e) => {
                if (e.button !== 0 || window.rotacionLibreActiva || mutacionEnCurso) return;
                e.preventDefault();
                e.stopPropagation();
                if (typeof window.cerrarMenuContextualElementos === 'function') window.cerrarMenuContextualElementos();
                _iniciarOperacionCajaMover('resize', el, box, e, {}, dir);
            });
            box.appendChild(handle);
        });
    }

    function aplicarRectACaja(box, rect) {
        box.style.left = rect.x.toFixed(2) + 'px';
        box.style.top = rect.y.toFixed(2) + 'px';
        box.style.width = rect.w.toFixed(2) + 'px';
        box.style.height = rect.h.toFixed(2) + 'px';
    }

    function calcularRectRedimensionado(op, clientX, clientY, shiftKey) {
        return window.LiraPdfEditorUtils.calcularRectRedimensionado(op, clientX, clientY, shiftKey, MIN_PX);
    }

    function _esTipoElementoMoverValido(el) {
        return Boolean(el && ['imagen', 'freetext', 'figura'].includes(el.tipo));
    }

    function _vincularEventosCajaElemento(box, el, rectInicial) {
        box.addEventListener('dblclick', (e) => {
            if (el.tipo !== 'figura' || typeof window.abrirPopoverEstiloFigura !== 'function') return;
            e.preventDefault();
            e.stopPropagation();
            window.abrirPopoverEstiloFigura(el, box);
        });

        box.addEventListener('mousedown', (e) => {
            if (e.button !== 0 || mutacionEnCurso || e.target?.classList.contains('mover-handle')) return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.cerrarMenuContextualElementos === 'function') window.cerrarMenuContextualElementos();

            if (window.rotacionLibreActiva && rotacionLibreTarget) {
                if (rotacionLibreTarget.el.id === el.id) iniciarArrastreRotacion(e);
                return;
            }
            seleccionarElementoMover(el.id);
            _iniciarOperacionCajaMover('move', el, box, e, rectInicial);
        });

        box.addEventListener('contextmenu', (e) => {
            if (!window.modoMoverElementosActivo || mutacionEnCurso) return;
            e.preventDefault();
            e.stopPropagation();
            if (window.rotacionLibreActiva) finalizarRotacionLibre(false);
            seleccionarElementoMover(el.id);
            if (typeof window.abrirMenuContextualElemento === 'function') {
                window.abrirMenuContextualElemento(el, e.clientX, e.clientY);
            }
        });
    }

    function renderizarElementosDesdeCache() {
        if (!window.modoMoverElementosActivo) return;
        const layer = asegurarCapaMoverElementos();
        if (!layer) return;

        layer.classList.add('activo');
        ajustarDimensionesCapa(layer);
        layer.innerHTML = '';

        elementosPaginaActual.forEach((el) => {
            if (!_esTipoElementoMoverValido(el) || !Array.isArray(el.bbox) || el.bbox.length < 4) return;
            const r = proyectarPdfACanvas(el.bbox);
            const box = document.createElement('div');
            box.className = 'mover-el-box';
            box.dataset.elId = el.id;
            box.dataset.tipo = el.tipo;
            aplicarRectACaja(box, r);

            if (elementoSeleccionadoId === el.id) {
                box.classList.add('seleccionado');
                agregarHandlesACaja(box, el);
            }
            _vincularEventosCajaElemento(box, el, r);
            layer.appendChild(box);
        });
    }

    function reproyectarElementosMover() {
        if (!window.modoMoverElementosActivo || operacionActiva || window.rotacionLibreActiva) return;
        const layer = document.getElementById(LAYER_ID);
        if (!layer) return;
        ajustarDimensionesCapa(layer);

        layer.querySelectorAll('.mover-el-box').forEach((box) => {
            const el = obtenerElementoPorId(box.dataset.elId);
            if (!el || !Array.isArray(el.bbox) || el.bbox.length < 4) return;
            const r = proyectarPdfACanvas(el.bbox);
            aplicarRectACaja(box, r);
        });
    }

    function resolverSeleccionPendiente() {
        if (!pendienteSeleccion) {
            if (elementoSeleccionadoId && !obtenerElementoPorId(elementoSeleccionadoId)) {
                elementoSeleccionadoId = null;
            }
            return;
        }
        const cand = elementosPaginaActual.filter((e) => e && e.tipo === pendienteSeleccion.tipo);
        let mejor = null;
        let mejorDist = Infinity;

        cand.forEach((e) => {
            if (!Array.isArray(e.bbox) || e.bbox.length < 4) return;
            const pb = pendienteSeleccion.bbox;
            const dist = Array.isArray(pb) && pb.length >= 4
                ? (Math.abs(e.bbox[0] - pb[0]) + Math.abs(e.bbox[1] - pb[1]) + Math.abs(e.bbox[2] - pb[2]) + Math.abs(e.bbox[3] - pb[3]))
                : 999999;
            const bonusXref = (pendienteSeleccion.xref && e.xref === pendienteSeleccion.xref) ? -0.5 : 0;
            if (dist + bonusXref < mejorDist) {
                mejorDist = dist + bonusXref;
                mejor = e;
            }
        });

        elementoSeleccionadoId = mejor ? mejor.id : null;
        pendienteSeleccion = null;
    }

    async function cargarYRenderizarElementosMover() {
        if (!window.modoMoverElementosActivo) return;
        const ruta = obtenerRutaPdf();
        if (!ruta || typeof datosPagina === 'undefined' || !datosPagina) {
            limpiarCapaMoverElementos();
            return;
        }
        if (typeof eel === 'undefined' || typeof eel.obtener_elementos_pagina !== 'function') return;

        const miToken = ++cargaToken;
        try {
            const res = await eel.obtener_elementos_pagina(ruta, obtenerPaginaIdx())();
            if (miToken !== cargaToken || !window.modoMoverElementosActivo) return;

            if (res?.success && Array.isArray(res.elementos)) {
                elementosPaginaActual = res.elementos.filter(_esTipoElementoMoverValido);
                resolverSeleccionPendiente();
            } else {
                elementosPaginaActual = [];
                elementoSeleccionadoId = null;
            }
            renderizarElementosDesdeCache();
        } catch (err) {
            console.error('[MoverElementos] Error obteniendo elementos de página:', err);
        }
    }

    async function recargarPaginaTrasMutacion(pagIdx) {
        if (typeof cargarPagina === 'function') {
            await cargarPagina(pagIdx);
        }
        if (window.modoMoverElementosActivo) {
            await cargarYRenderizarElementosMover();
        }
    }

    async function _procesarRespuestaMutacionElementoPdf(cfg, res, pagIdx) {
        if (!res || res.cancelado) return;
        if (res.success) {
            if (cfg.limpiarSeleccion) {
                elementoSeleccionadoId = null;
                pendienteSeleccion = null;
            } else {
                pendienteSeleccion = cfg.construirSeleccion(res);
            }
            await recargarPaginaTrasMutacion(pagIdx);
            return;
        }
        mostrarAvisoToast(res.error || cfg.msgError, 'error');
        if (cfg.redibujarEnError) renderizarElementosDesdeCache();
    }

    async function _ejecutarMutacionElementoPdf(cfg) {
        if (!cfg.el || mutacionEnCurso) return;
        if (cfg.soloImagen && cfg.el.tipo !== 'imagen') return;
        if (typeof eel === 'undefined' || typeof eel[cfg.rpcName] !== 'function') return;

        mutacionEnCurso = true;
        const pagIdx = obtenerPaginaIdx();
        try {
            const res = await cfg.invocar(obtenerRutaPdf(), pagIdx);
            await _procesarRespuestaMutacionElementoPdf(cfg, res, pagIdx);
        } catch (err) {
            console.error(cfg.logError, err);
            if (cfg.redibujarEnError) renderizarElementosDesdeCache();
        } finally {
            mutacionEnCurso = false;
        }
    }

    async function ejecutarMoverElemento(el, nuevoBbox) {
        return _ejecutarMutacionElementoPdf({
            el,
            rpcName: 'mover_elemento_pdf',
            invocar: (ruta, pagIdx) => eel.mover_elemento_pdf(ruta, pagIdx, el, nuevoBbox)(),
            construirSeleccion: (res) => ({ tipo: el.tipo, xref: res.xref || el.xref, bbox: res.bbox || nuevoBbox }),
            msgError: 'No se pudo mover el elemento.',
            logError: '[MoverElementos] Error moviendo elemento:',
            redibujarEnError: true
        });
    }

    async function ejecutarRedimensionarElemento(el, nuevoBbox) {
        return _ejecutarMutacionElementoPdf({
            el,
            rpcName: 'redimensionar_elemento_pdf',
            invocar: (ruta, pagIdx) => eel.redimensionar_elemento_pdf(ruta, pagIdx, el, nuevoBbox)(),
            construirSeleccion: (res) => ({ tipo: el.tipo, xref: res.xref || el.xref, bbox: res.bbox || nuevoBbox }),
            msgError: 'No se pudo redimensionar el elemento.',
            logError: '[MoverElementos] Error redimensionando elemento:',
            redibujarEnError: true
        });
    }

    async function reemplazarImagenElementoMover(el) {
        return _ejecutarMutacionElementoPdf({
            el,
            soloImagen: true,
            rpcName: 'reemplazar_imagen_pdf',
            invocar: async (ruta, pagIdx) => {
                let rutaImg = null;
                if (typeof eel.seleccionar_imagen_reemplazo === 'function') {
                    rutaImg = await eel.seleccionar_imagen_reemplazo()();
                    if (!rutaImg) return { cancelado: true };
                }
                return eel.reemplazar_imagen_pdf(ruta, pagIdx, el, rutaImg)();
            },
            construirSeleccion: (res) => ({ tipo: 'imagen', xref: res.xref || el.xref, bbox: res.bbox || el.bbox }),
            msgError: 'No se pudo reemplazar la imagen.',
            logError: '[MoverElementos] Error reemplazando imagen:'
        });
    }

    async function rotarImagenElementoMover(el, anguloGrados) {
        return _ejecutarMutacionElementoPdf({
            el,
            soloImagen: true,
            rpcName: 'rotar_imagen_pdf',
            invocar: (ruta, pagIdx) => eel.rotar_imagen_pdf(ruta, pagIdx, el, anguloGrados)(),
            construirSeleccion: (res) => ({ tipo: 'imagen', xref: res.xref || el.xref, bbox: res.bbox || el.bbox }),
            msgError: 'No se pudo rotar la imagen.',
            logError: '[MoverElementos] Error rotando imagen:',
            redibujarEnError: true
        });
    }

    async function eliminarElementoMover(el) {
        return _ejecutarMutacionElementoPdf({
            el,
            rpcName: 'eliminar_elemento_pdf',
            invocar: (ruta, pagIdx) => eel.eliminar_elemento_pdf(ruta, pagIdx, el)(),
            limpiarSeleccion: true,
            msgError: 'No se pudo eliminar el elemento.',
            logError: '[MoverElementos] Error eliminando elemento:'
        });
    }

    async function cambiarCapaElementoMover(el, accion) {
        return _ejecutarMutacionElementoPdf({
            el,
            rpcName: 'cambiar_capa_elemento_rpc',
            invocar: (ruta, pagIdx) => eel.cambiar_capa_elemento_rpc(ruta, pagIdx, el, accion)(),
            construirSeleccion: (res) => ({ tipo: res.tipo || el.tipo, xref: res.xref || el.xref, bbox: res.bbox || el.bbox }),
            msgError: 'No se pudo cambiar la capa del elemento.',
            logError: '[MoverElementos] Error cambiando capa:'
        });
    }

    function seleccionarElementoPendienteMover(sel) {
        pendienteSeleccion = sel || null;
    }

    async function ejecutarDeshacerMoverElementos() {
        if (!window.modoMoverElementosActivo || mutacionEnCurso) return;
        if (typeof eel === 'undefined' || typeof eel.deshacer_edicion_pdf !== 'function') return;

        mutacionEnCurso = true;
        try {
            if (typeof window.cerrarMenuContextualElementos === 'function') {
                window.cerrarMenuContextualElementos();
            }
            finalizarRotacionLibre(false);

            const res = await eel.deshacer_edicion_pdf(obtenerRutaPdf() || null)();
            if (res && res.success) {
                elementoSeleccionadoId = null;
                pendienteSeleccion = null;
                const pagDestino = (typeof res.pagina_idx === 'number' && res.pagina_idx >= 0)
                    ? res.pagina_idx
                    : obtenerPaginaIdx();
                await recargarPaginaTrasMutacion(pagDestino);
            } else if (res && res.error) {
                mostrarAvisoToast(res.error, 'info');
            }
        } catch (err) {
            console.error('[MoverElementos] Error al deshacer:', err);
        } finally {
            mutacionEnCurso = false;
        }
    }

    // --- ROTACIÓN LIBRE INTERACTIVA ---
    function actualizarBadgeAngulo(deg, clientX, clientY) {
        let badge = document.getElementById(BADGE_ID);
        if (!badge) {
            badge = document.createElement('div');
            badge.id = BADGE_ID;
            badge.className = 'mover-angulo-badge';
            document.body.appendChild(badge);
        }
        const angEntero = Math.round(deg);
        badge.textContent = `${angEntero}°`;

        let left = clientX + 16;
        let top = clientY - 28;
        if (typeof clientX !== 'number' || typeof clientY !== 'number') {
            const box = rotacionLibreTarget?.boxEl;
            if (box) {
                const br = box.getBoundingClientRect();
                left = br.left + br.width / 2 - 20;
                top = Math.max(10, br.top - 32);
            } else {
                left = 20;
                top = 20;
            }
        }
        badge.style.left = clamp(left, 8, window.innerWidth - 70) + 'px';
        badge.style.top = clamp(top, 8, window.innerHeight - 36) + 'px';
    }

    function removerBadgeAngulo() {
        const badge = document.getElementById(BADGE_ID);
        if (badge) badge.remove();
    }

    function iniciarArrastreRotacion(e) {
        if (!rotacionLibreTarget || !rotacionLibreTarget.boxEl) return;
        const rect = rotacionLibreTarget.boxEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        rotacionLibreTarget.arrastrando = true;
        rotacionLibreTarget.cx = cx;
        rotacionLibreTarget.cy = cy;
        rotacionLibreTarget.startPointerAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
        rotacionLibreTarget.currentDeg = 0;
        rotacionLibreTarget.boxEl.classList.add('manipulando');
        setEstadoManipulacion(true);
        actualizarBadgeAngulo(0, e.clientX, e.clientY);
    }

    function iniciarRotacionLibreElemento(el) {
        if (!el || el.tipo !== 'imagen' || !window.modoMoverElementosActivo) return;
        finalizarRotacionLibre(false);

        seleccionarElementoMover(el.id);
        const layer = document.getElementById(LAYER_ID);
        const visor = document.getElementById('visor-container');
        const boxEl = layer ? layer.querySelector(`.mover-el-box[data-el-id="${CSS.escape(el.id)}"]`) : null;
        if (!layer || !boxEl) return;

        window.rotacionLibreActiva = true;
        layer.classList.add('mover-rotacion-libre-activa');
        if (visor) visor.classList.add('mover-rotacion-libre-activa');

        rotacionLibreTarget = {
            el: el,
            boxEl: boxEl,
            arrastrando: false,
            cx: 0,
            cy: 0,
            startPointerAngle: 0,
            currentDeg: 0
        };
        actualizarBadgeAngulo(0);
    }

    function finalizarRotacionLibre(confirmar) {
        const target = rotacionLibreTarget;
        const layer = document.getElementById(LAYER_ID);
        const visor = document.getElementById('visor-container');

        window.rotacionLibreActiva = false;
        rotacionLibreTarget = null;
        if (layer) layer.classList.remove('mover-rotacion-libre-activa');
        if (visor) visor.classList.remove('mover-rotacion-libre-activa');
        removerBadgeAngulo();

        if (!target) {
            setEstadoManipulacion(false);
            return;
        }
        if (target.boxEl) {
            target.boxEl.classList.remove('manipulando');
            setEstadoManipulacion(false);
            if (!confirmar) {
                target.boxEl.style.transform = '';
            }
        }

        if (confirmar && Math.abs(target.currentDeg) >= 0.5) {
            rotarImagenElementoMover(target.el, target.currentDeg);
        } else if (target.boxEl) {
            target.boxEl.style.transform = '';
        }
    }

    function _onLayerMouseDownMover(e, layer) {
        if (!window.modoMoverElementosActivo) return;
        if (window.rotacionLibreActiva && rotacionLibreTarget) {
            if (e.button === 0) {
                e.preventDefault();
                e.stopPropagation();
                iniciarArrastreRotacion(e);
            }
            return;
        }
        if (e.target === layer) {
            if (typeof window.cerrarMenuContextualElementos === 'function') {
                window.cerrarMenuContextualElementos();
            }
            seleccionarElementoMover(null);
        }
    }

    function _actualizarRotacionLibreEnMove(e) {
        const t = rotacionLibreTarget;
        const curAngle = Math.atan2(e.clientY - t.cy, e.clientX - t.cx) * (180 / Math.PI);
        let delta = curAngle - t.startPointerAngle;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        if (e.shiftKey) delta = Math.round(delta / 15) * 15;
        t.currentDeg = Math.round(delta * 10) / 10;
        if (t.boxEl) t.boxEl.style.transform = `rotate(${t.currentDeg}deg)`;
        actualizarBadgeAngulo(t.currentDeg, e.clientX, e.clientY);
    }

    function _onDocMouseMoveMover(e) {
        if (window.rotacionLibreActiva && rotacionLibreTarget && rotacionLibreTarget.arrastrando) {
            _actualizarRotacionLibreEnMove(e);
            return;
        }
        if (!operacionActiva) return;
        const op = operacionActiva;
        if (op.modo === 'move') {
            const dx = e.clientX - op.startClientX;
            const dy = e.clientY - op.startClientY;
            const newX = clamp(op.origRect.x + dx, op.bounds.minX, Math.max(op.bounds.minX, op.bounds.maxX - op.origRect.w));
            const newY = clamp(op.origRect.y + dy, op.bounds.minY, Math.max(op.bounds.minY, op.bounds.maxY - op.origRect.h));
            op.currentRect = { x: newX, y: newY, w: op.origRect.w, h: op.origRect.h };
            aplicarRectACaja(op.boxEl, op.currentRect);
        } else if (op.modo === 'resize') {
            op.currentRect = calcularRectRedimensionado(op, e.clientX, e.clientY, e.shiftKey);
            aplicarRectACaja(op.boxEl, op.currentRect);
        }
    }

    function _onDocMouseUpMover() {
        if (window.rotacionLibreActiva && rotacionLibreTarget && rotacionLibreTarget.arrastrando) {
            finalizarRotacionLibre(true);
            return;
        }
        if (!operacionActiva) return;
        const op = operacionActiva;
        operacionActiva = null;
        if (op.boxEl) op.boxEl.classList.remove('manipulando');
        setEstadoManipulacion(false);

        const deltaMax = Math.max(
            Math.abs(op.currentRect.x - op.origRect.x),
            Math.abs(op.currentRect.y - op.origRect.y),
            Math.abs(op.currentRect.w - op.origRect.w),
            Math.abs(op.currentRect.h - op.origRect.h)
        );
        if (deltaMax <= 1.0) return;

        const nuevoBbox = proyectarCanvasAPdf(op.currentRect);
        if (op.modo === 'move') {
            ejecutarMoverElemento(op.el, nuevoBbox);
        } else if (op.modo === 'resize') {
            ejecutarRedimensionarElemento(op.el, nuevoBbox);
        }
    }

    function _manejarEscapeMover(e) {
        if (window.rotacionLibreActiva) {
            e.preventDefault();
            e.stopPropagation();
            finalizarRotacionLibre(false);
            return;
        }
        if (typeof window.cerrarMenuContextualElementos === 'function') {
            window.cerrarMenuContextualElementos();
        }
        seleccionarElementoMover(null);
    }

    function _onDocKeyDownMover(e) {
        if (!window.modoMoverElementosActivo || esContextoEditableConFoco(e)) return;

        if (e.key === 'Escape') {
            _manejarEscapeMover(e);
            return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            const elSel = obtenerElementoPorId(elementoSeleccionadoId);
            if (!elSel) return;
            e.preventDefault();
            e.stopPropagation();
            eliminarElementoMover(elSel);
            return;
        }

        const esUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
        if (esUndo && e.key && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            e.stopPropagation();
            ejecutarDeshacerMoverElementos();
        }
    }

    function registrarListenersGlobales() {
        if (listenersInicializados) return;
        listenersInicializados = true;

        const layer = asegurarCapaMoverElementos();
        if (layer) {
            layer.addEventListener('mousedown', (e) => _onLayerMouseDownMover(e, layer));
        }
        document.addEventListener('mousemove', _onDocMouseMoveMover);
        document.addEventListener('mouseup', _onDocMouseUpMover);
        document.addEventListener('keydown', _onDocKeyDownMover);
        window.addEventListener('resize', () => {
            if (window.modoMoverElementosActivo) reproyectarElementosMover();
        });
    }

    function instalarHookDibujar() {
        if (hookDibujarInstalado) return;
        if (typeof window.dibujar === 'function' && !window.dibujar._liraMoverWrapped) {
            const originalDibujar = window.dibujar;
            window.dibujar = function (...args) {
                const res = originalDibujar.apply(this, args);
                if (window.modoMoverElementosActivo) {
                    requestAnimationFrame(() => reproyectarElementosMover());
                }
                return res;
            };
            window.dibujar._liraMoverWrapped = true;
            hookDibujarInstalado = true;
        }
    }

    function toggleModoMoverElementos(activo) {
        const nuevoEstado = (typeof activo === 'boolean') ? activo : !window.modoMoverElementosActivo;
        window.modoMoverElementosActivo = nuevoEstado;

        actualizarBotonesUI(nuevoEstado);

        if (typeof window.actualizarEstadoInteractivoCapaSoloLectura === 'function') {
            window.actualizarEstadoInteractivoCapaSoloLectura();
        }

        if (nuevoEstado) {
            desactivarOtrosModos();
            registrarListenersGlobales();
            instalarHookDibujar();

            const layer = asegurarCapaMoverElementos();
            if (layer) {
                layer.classList.add('activo');
                ajustarDimensionesCapa(layer);
            }

            if (obtenerRutaPdf() && typeof datosPagina !== 'undefined' && datosPagina) {
                cargarYRenderizarElementosMover();
            }
        } else {
            limpiarEstadoMoverElementos();
            const layer = document.getElementById(LAYER_ID);
            if (layer) {
                layer.classList.remove('activo');
                layer.style.width = '';
                layer.style.height = '';
            }
        }
    }

    window.toggleModoMoverElementos = toggleModoMoverElementos;
    window.cargarYRenderizarElementosMover = cargarYRenderizarElementosMover;
    window.reproyectarElementosMover = reproyectarElementosMover;
    window.limpiarCapaMoverElementos = limpiarCapaMoverElementos;
    window.limpiarEstadoMoverElementos = limpiarEstadoMoverElementos;
    window.reemplazarImagenElementoMover = reemplazarImagenElementoMover;
    window.rotarImagenElementoMover = rotarImagenElementoMover;
    window.eliminarElementoMover = eliminarElementoMover;
    window.cambiarCapaElementoMover = cambiarCapaElementoMover;
    window.seleccionarElementoPendienteMover = seleccionarElementoPendienteMover;
    window.iniciarRotacionLibreElemento = iniciarRotacionLibreElemento;
    window.ejecutarDeshacerMoverElementos = ejecutarDeshacerMoverElementos;
})();
