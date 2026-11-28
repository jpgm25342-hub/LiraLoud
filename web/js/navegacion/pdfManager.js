/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// ==========================================
// 3. NAVEGACIÓN, MEMORIA Y GESTIÓN DE PÁGINAS
// ==========================================

async function abrirBuscador() {
    detenerLectura();
    if (rutaPDFActual) guardarEstadoPaginaActual();

    let ruta = await eel.seleccionar_archivo()();
    if (ruta && typeof ruta === 'string') {
        if (typeof _destruirBienvenida === 'function') _destruirBienvenida();
        if (typeof cerrarLanzador === 'function') cerrarLanzador();
        await abrirDocumentoDesdeRuta(ruta);
        return true;
    } else {
        // Si el usuario cancela la selección y no hay ningún documento abierto en el visor,
        // mantener o restaurar el menú habitual (pantalla de bienvenida o lanzador)
        if (!rutaPDFActual) {
            const bienvenida = document.getElementById('lira-bienvenida');
            if (bienvenida && typeof _mostrarBienvenida === 'function') {
                _mostrarBienvenida();
            } else if (typeof abrirLanzador === 'function') {
                abrirLanzador();
            }
        }
        return false;
    }
}

/**
 * Carga un documento PDF desde una ruta ya conocida (local o temporal).
 * Usado por abrirBuscador() y por webReader.js para cargar PDFs generados.
 * @param {string} ruta - Ruta absoluta al archivo PDF
 * @param {boolean} esTemporal - Si true, no se guarda en la biblioteca de recientes
 */
async function abrirDocumentoDesdeRuta(ruta, esTemporal = false, esCaptura = false, opciones = {}) {
    window.tipoDocumento = opciones?.tipoDocumento || (esCaptura ? 'captura' : 'pdf');

    // Limpiar resaltados de chunks / búsqueda y editor al cambiar de PDF
    if (typeof window.limpiarResaltadoBusqueda === 'function') {
        window.limpiarResaltadoBusqueda(false);
    } else {
        window.resaltadoBusqueda = null;
        window.resaltadoBBox = null;
    }
    if (window._liraSnippetsMap) window._liraSnippetsMap = {};
    if (typeof cerrarEditorTexto === 'function') cerrarEditorTexto();
    const capaEditor = document.getElementById('lira-pdf-text-editor-layer');
    if (capaEditor) capaEditor.innerHTML = '';
    if (typeof window.limpiarEstadoMoverElementos === 'function') window.limpiarEstadoMoverElementos();

    // 1. Cargar el documento en la memoria de Python (fitz.open)
    if (typeof eel.cargar_documento === 'function') {
        const cargadoOk = await eel.cargar_documento(ruta, window.tipoDocumento)();
        if (!cargadoOk) {
            console.error("[PDF] Error cargando documento en Python:", ruta);
            if (typeof liraAlert === 'function') liraAlert("No se pudo cargar el documento.", 'error');
            return;
        }
    }

    rutaPDFActual = ruta;
    paginaActual = 0;
    datosPagina = null;
    if (typeof oracionActiva !== 'undefined') oracionActiva = null;
    memoriaLayout = {};
    cortesV = [];
    limitesH = {};
    zonasExcluidas = [];
    const _wrapperCrop = document.getElementById('pdf-crop-wrapper');
    if (_wrapperCrop) {
        _wrapperCrop.style.width = '';
        _wrapperCrop.style.height = '';
    }
    const _canvasCrop = document.getElementById('lienzo-pdf');
    if (_canvasCrop) {
        _canvasCrop.style.left = '';
        _canvasCrop.style.top = '';
    }
    if (typeof window.reiniciarLibroTeatro === 'function') {
        window.reiniciarLibroTeatro(ruta);
    }

    if (!esTemporal) {
        let progreso = await eel.cargar_progreso_libro(rutaPDFActual)();
        if (progreso) {
            paginaActual = progreso.ultima_pagina || 0;
            memoriaLayout = progreso.layouts || {};

            let clave = paginaActual.toString();
            if (memoriaLayout[clave]) {
                cortesV = memoriaLayout[clave].cortesV || [];
                limitesH = memoriaLayout[clave].limitesH || {};
                zonasExcluidas = memoriaLayout[clave].zonasExcluidas || [];
            }
            if (progreso.segmentacion) {
                const seg = progreso.segmentacion;
                let chkBloques = document.getElementById('chk-usar-bloques');
                if (chkBloques) chkBloques.checked = seg.usarBloquesNativos;

                let rngSalto = document.getElementById('rng-sensibilidad-salto');
                if (rngSalto) rngSalto.value = seg.sensibilidadSalto;
                let rngSaltoMain = document.getElementById('rng-sensibilidad-salto-main');
                if (rngSaltoMain) rngSaltoMain.value = seg.sensibilidadSalto;
                let lblSalto = document.getElementById('lbl-sensibilidad');
                if (lblSalto) lblSalto.innerText = seg.sensibilidadSalto;
                let lblSaltoMain = document.getElementById('lbl-sensibilidad-main');
                if (lblSaltoMain) lblSaltoMain.innerText = seg.sensibilidadSalto;

                let chkSangria = document.getElementById('chk-detectar-sangria');
                if (chkSangria) chkSangria.checked = seg.detectarSangria;
                let chkSangriaMain = document.getElementById('chk-detectar-sangria-main');
                if (chkSangriaMain) chkSangriaMain.checked = seg.detectarSangria;

                if (typeof toggleOpcionesSegmentacion === 'function') toggleOpcionesSegmentacion();
                if (typeof guardarTodosAjustes === 'function') guardarTodosAjustes(false);
            }
        }
    }

    if (vozPredeterminada) {
        let sel = document.getElementById('selector-voz-live');
        let existe = [...sel.options].some(o => o.value === vozPredeterminada);
        if (existe) {
            sel.value = vozPredeterminada;
        }
    }

    if (typeof cargarHistorialChatDocumento === 'function') {
        cargarHistorialChatDocumento();
    }

    // --- DETECCIÓN DE DOCUMENTO ESCANEADO (OCR) ---
    if (window.tipoDocumento !== 'texto_escrito' && typeof eel !== 'undefined' && typeof eel.detectar_si_documento_es_escaneado === 'function') {
        try {
            let docInfo = await eel.detectar_si_documento_es_escaneado()();
            if (docInfo) {
                if (docInfo.total_paginas && docInfo.total_paginas > 0) {
                    totalPaginas = docInfo.total_paginas;
                    const totEl = document.getElementById('total-paginas-texto');
                    if (totEl) totEl.innerText = `/ ${totalPaginas}`;
                }
                if (docInfo.es_escaneado && !docInfo.completamente_cacheado) {
                    if (esCaptura) {
                        // Es una captura de pantalla: mostrar vista rápida de inmediato y ejecutar OCR de esa página.
                        cargarPagina(paginaActual);
                        return;
                    }

                    let pref = localStorage.getItem('lira_preferencia_ocr');
                    if (pref === 'batch') {
                        iniciarBatchOCR(0, totalPaginas || null);
                        return;
                    } else if (pref === 'demanda' || pref === 'ignorar') {
                        cargarPagina(paginaActual);
                        return;
                    } else {
                        abrirModalOCRDecision();
                        return;
                    }
                }
            }
        } catch (e) {
            console.warn("[PDF] Error comprobando si es documento escaneado:", e);
        }
    }

    cargarPagina(paginaActual);
}


function tieneLimitesHActivos(limH, altoPag) {
    if (!limH || typeof limH !== 'object') return false;
    let keys = Object.keys(limH);
    if (keys.length === 0) return false;
    for (let k of keys) {
        let pair = limH[k];
        if (Array.isArray(pair) && pair.length === 2) {
            let [yMin, yMax] = pair;
            if (yMin > 5) return true;
            if (altoPag && altoPag > 0 && (altoPag - yMax) > 5) return true;
        }
    }
    return false;
}
window.tieneLimitesHActivos = tieneLimitesHActivos;

function guardarEstadoPaginaActual() {
    if (!rutaPDFActual || !datosPagina || window.modoSoloLecturaActivo || datosPagina._esSoloLectura) return;
    let pagKey = paginaActual.toString();
    let prevManual = memoriaLayout[pagKey]?.limitesHManual;
    let tieneCortesActivos = tieneLimitesHActivos(limitesH, datosPagina.alto_pagina_pdf);

    memoriaLayout[pagKey] = {
        ...(memoriaLayout[pagKey] || {}),
        cortesV: [...cortesV],
        limitesH: JSON.parse(JSON.stringify(limitesH)),
        zonasExcluidas: JSON.parse(JSON.stringify(zonasExcluidas)),
        width: datosPagina.ancho_pagina_pdf,
        height: datosPagina.alto_pagina_pdf,
        escala: datosPagina.factor_zoom,
        canvasWidth: datosPagina.ancho_img,
        canvasHeight: datosPagina.alto_img,
        limitesHManual: (prevManual !== undefined) ? prevManual : tieneCortesActivos
    };
    let segmentacion = {
        usarBloquesNativos: document.getElementById('chk-usar-bloques')?.checked ?? true,
        sensibilidadSalto: parseFloat(document.getElementById('rng-sensibilidad-salto-main')?.value || 0.5),
        detectarSangria: document.getElementById('chk-detectar-sangria-main')?.checked ?? true
    };
    eel.guardar_progreso_libro(rutaPDFActual, paginaActual, memoriaLayout, segmentacion);
}

let tokenCargaActual = 0;

function bloquearControlesNavegacion(bloqueado) {
    bloqueoCambioPagina = bloqueado;
    const selectores = '.btn-nav, #btn-prev, #btn-next, .zen-btn-nav, #btn-pagina-ant, #btn-pagina-sig, #input-pagina-actual';
    const btns = document.querySelectorAll(selectores);
    btns.forEach(b => {
        if (bloqueado) {
            b.classList.add('nav-bloqueado-cargando');
            b.style.pointerEvents = 'none';
            b.style.opacity = '0.5';
        } else {
            b.classList.remove('nav-bloqueado-cargando');
            b.style.pointerEvents = '';
            b.style.opacity = '';
        }
    });
}

function _clonarLayoutIA(layoutIA) {
    return {
        cortesV: Array.isArray(layoutIA.cortesV) ? [...layoutIA.cortesV] : [],
        limitesH: (layoutIA.limitesH && typeof layoutIA.limitesH === 'object')
            ? JSON.parse(JSON.stringify(layoutIA.limitesH))
            : {},
        zonasExcluidas: (Array.isArray(layoutIA.zonasExcluidas) && layoutIA.zonasExcluidas.length > 0)
            ? JSON.parse(JSON.stringify(layoutIA.zonasExcluidas))
            : [],
    };
}

function _buscarPaginaReferenciaParidad(num, filtroFn) {
    let bestEven = null, minEvenDist = Infinity;
    let bestOdd = null, minOddDist = Infinity;
    const savedPages = Object.keys(memoriaLayout).map(Number).filter(n => n !== num && filtroFn(memoriaLayout[n.toString()]));

    for (const p of savedPages) {
        const dist = Math.abs(num - p);
        if (dist % 2 === 0) {
            if (dist < minEvenDist || (dist === minEvenDist && p < num)) { minEvenDist = dist; bestEven = p; }
        } else if (dist < minOddDist || (dist === minOddDist && p < num)) {
            minOddDist = dist; bestOdd = p;
        }
    }
    return bestEven !== null ? bestEven : bestOdd;
}

function _animarFadeInLayout(miToken) {
    if (typeof dibujar !== 'function') return;
    const tInicio = performance.now();
    const step = (ahora) => {
        if (miToken !== tokenCargaActual) return;
        const prog = Math.min(1, (ahora - tInicio) / 180);
        window._alphaLayoutIA = prog;
        dibujar();
        if (prog < 1) requestAnimationFrame(step);
        else delete window._alphaLayoutIA;
    };
    requestAnimationFrame(step);
}

function _aplicarImagenVistaRapida(vistaRapida, miToken, ctxCarga) {
    const imgRapida = new Image();
    imgRapida.onload = () => {
        if (miToken !== tokenCargaActual) return;
        if (canvas.width !== vistaRapida.ancho_img) canvas.width = vistaRapida.ancho_img;
        if (canvas.height !== vistaRapida.alto_img) canvas.height = vistaRapida.alto_img;
        canvas.style.width = (vistaRapida.ancho_img * nivelZoomPDF) + "px";
        canvas.style.height = (vistaRapida.alto_img * nivelZoomPDF) + "px";
        window.imagenCacheadaCanvas = imgRapida;
        window.imagenCacheadaSrc = vistaRapida.imagen;
        ctxCarga.imagenNuevaLista = true;
        canvas.classList.remove('canvas-sin-imagen');
        if (ctxCarga.layoutPendiente) {
            cortesV = ctxCarga.layoutPendiente.cortesV;
            limitesH = ctxCarga.layoutPendiente.limitesH;
            zonasExcluidas = ctxCarga.layoutPendiente.zonasExcluidas;
            ctxCarga.layoutPendiente = null;
            canvas.classList.remove('canvas-procesando-layout');
        } else if (ctxCarga.esperaAutoLayout) {
            canvas.classList.add('canvas-procesando-layout');
        }
        ctx.drawImage(imgRapida, 0, 0);
        if (typeof dibujar === 'function') dibujar();
    };
    imgRapida.src = vistaRapida.imagen;
}

function _iniciarVistaRapidaPagina(num, miToken, ctxCarga) {
    if (typeof eel === 'undefined' || typeof eel.obtener_vista_rapida_pagina !== 'function') {
        return Promise.resolve(null);
    }
    return eel.obtener_vista_rapida_pagina(num)().then(vistaRapida => {
        if (miToken !== tokenCargaActual) return null;
        if (vistaRapida?.imagen) {
            ctxCarga.imagenVistaRapida = vistaRapida.imagen;
            _aplicarImagenVistaRapida(vistaRapida, miToken, ctxCarga);
        }
        return vistaRapida;
    }).catch(e => {
        console.warn("[PDF] No se pudo cargar vista previa rápida:", e);
        return null;
    });
}

function _iniciarLayoutIAPagina(num, clave, miToken, ctxCarga) {
    if (!ctxCarga.esperaAutoLayout || typeof eel === 'undefined' || typeof eel.autodetectar_layout_pagina !== 'function') {
        return Promise.resolve(null);
    }
    return eel.autodetectar_layout_pagina(num)().then(layoutIA => {
        if (miToken !== tokenCargaActual || !layoutIA?.exito) return layoutIA || null;
        const clon = _clonarLayoutIA(layoutIA);
        memoriaLayout[clave] = { ...(memoriaLayout[clave] || {}), ..._clonarLayoutIA(layoutIA), _autoDetectado: true };
        if (ctxCarga.imagenNuevaLista) {
            cortesV = clon.cortesV;
            limitesH = clon.limitesH;
            zonasExcluidas = clon.zonasExcluidas;
            canvas.classList.remove('canvas-procesando-layout');
            if (layoutIA.desde_cache) { if (typeof dibujar === 'function') dibujar(); }
            else _animarFadeInLayout(miToken);
        } else {
            ctxCarga.layoutPendiente = clon;
        }
        return layoutIA;
    }).catch(errLayout => {
        console.warn("[PDF] No se pudo auto-detectar layout en navegación:", errLayout);
        return null;
    });
}

function _resolverCortesVDesdeMemoria(num, clave, yaConfigurado, usarAutoLayout) {
    if (yaConfigurado) {
        return Array.isArray(memoriaLayout[clave]?.cortesV) ? [...memoriaLayout[clave].cortesV] : [];
    }
    if (usarAutoLayout) return [];
    const target = _buscarPaginaReferenciaParidad(num, l => l && Array.isArray(l.cortesV) && l.cortesV.length > 0);
    return (target !== null && Array.isArray(memoriaLayout[target.toString()]?.cortesV))
        ? [...memoriaLayout[target.toString()].cortesV]
        : [];
}

function _calcularColumnaHeredada(sourceCol, sourceAlto, curAlto) {
    if (!Array.isArray(sourceCol) || sourceCol.length !== 2) return null;
    const topCut = sourceCol[0];
    const bottomMargin = sourceAlto > 0 ? Math.max(0, sourceAlto - sourceCol[1]) : 0;
    const bottomCut = curAlto > 0 ? Math.max(topCut + 15, curAlto - bottomMargin) : sourceCol[1];
    return [topCut, bottomCut];
}

function _heredarLimitesHDesdeReferencia(num, layoutActual) {
    const targetH = _buscarPaginaReferenciaParidad(num, l => l?.limitesH && tieneLimitesHActivos(l.limitesH, l.height));
    const sourceLayout = targetH !== null ? memoriaLayout[targetH.toString()] : null;
    if (!sourceLayout?.limitesH) return {};

    const sourceH = sourceLayout.limitesH;
    const sourceAlto = sourceLayout.height || datosPagina?.alto_pagina_pdf || 0;
    const curAlto = layoutActual?.height || datosPagina?.alto_pagina_pdf || sourceAlto;
    const numCols = cortesV.length > 0 ? cortesV.length + 1 : 1;
    const res = {};
    for (let i = 0; i < numCols; i++) {
        const colKey = i.toString();
        const calc = _calcularColumnaHeredada(sourceH[colKey] || sourceH["0"], sourceAlto, curAlto);
        if (calc) res[colKey] = calc;
    }
    return res;
}

function _resolverLimitesHDesdeMemoria(num, clave, usarAutoLayout) {
    const layoutActual = memoriaLayout[clave];
    const yaTienePropios = layoutActual && (
        layoutActual.limitesHManual || layoutActual._autoDetectado ||
        (layoutActual.limitesH && tieneLimitesHActivos(layoutActual.limitesH, layoutActual.height))
    );
    if (yaTienePropios && layoutActual.limitesH && Object.keys(layoutActual.limitesH).length > 0) {
        return JSON.parse(JSON.stringify(layoutActual.limitesH));
    }
    if (num === 0 || usarAutoLayout) {
        return layoutActual?.limitesH ? JSON.parse(JSON.stringify(layoutActual.limitesH)) : {};
    }
    return _heredarLimitesHDesdeReferencia(num, layoutActual);
}

function _resolverLayoutEfectivoPagina(num, clave, layoutIA, ctxCarga) {
    if (ctxCarga.esTextoEscrito) {
        cortesV = []; limitesH = {}; zonasExcluidas = [];
        return;
    }
    if (layoutIA?.exito) {
        const clon = _clonarLayoutIA(layoutIA);
        cortesV = clon.cortesV;
        limitesH = clon.limitesH;
        zonasExcluidas = clon.zonasExcluidas;
        memoriaLayout[clave] = { ...(memoriaLayout[clave] || {}), ..._clonarLayoutIA(layoutIA), _autoDetectado: true };
        return;
    }
    cortesV = _resolverCortesVDesdeMemoria(num, clave, ctxCarga.yaConfigurado, ctxCarga.usarAutoLayout);
    limitesH = _resolverLimitesHDesdeMemoria(num, clave, ctxCarga.usarAutoLayout);
    zonasExcluidas = Array.isArray(memoriaLayout[clave]?.zonasExcluidas)
        ? JSON.parse(JSON.stringify(memoriaLayout[clave].zonasExcluidas))
        : [];
}

function _normalizarLimitesHConAltoPagina(altoPagina) {
    const numCols = cortesV.length > 0 ? cortesV.length + 1 : 1;
    for (let i = 0; i < numCols; i++) {
        const colKey = i.toString();
        if (!Array.isArray(limitesH[colKey])) {
            limitesH[colKey] = [0, altoPagina];
        } else {
            const yMin = Math.max(0, Math.min(altoPagina - 15, limitesH[colKey][0]));
            const yMax = Math.max(yMin + 15, Math.min(altoPagina, limitesH[colKey][1]));
            limitesH[colKey] = [yMin, yMax];
        }
    }
}

function _construirLayoutsBloquePreRender(paginasAProcesar, esTextoEscrito) {
    const layoutsPorPagina = {};
    if (esTextoEscrito) return layoutsPorPagina;
    for (const pIdx of paginasAProcesar) {
        const lPag = memoriaLayout[pIdx.toString()];
        if (!lPag) continue;
        layoutsPorPagina[pIdx.toString()] = {
            cortesV: Array.isArray(lPag.cortesV) ? lPag.cortesV : [],
            limitesH: (lPag.limitesH && typeof lPag.limitesH === 'object') ? lPag.limitesH : {},
            zonasExcluidas: Array.isArray(lPag.zonasExcluidas) ? lPag.zonasExcluidas : [],
        };
    }
    return layoutsPorPagina;
}

function _obtenerConfigTraduccionPreRender() {
    if (!(document.getElementById('chk-traduccion-activa')?.checked ?? false)) return null;
    return {
        activa: true,
        origen: document.getElementById('sel-traduccion-origen')?.value || 'auto',
        destino: document.getElementById('sel-traduccion-destino')?.value || 'es',
        motor: document.getElementById('sel-traduccion-motor')?.value || 'online',
        modo: document.getElementById('sel-traduccion-modo')?.value || 'subtitulos',
    };
}

function _programarBloquePreRender(num, esTextoEscrito, usarAutoLayout, dictActivo, bufferExtendido) {
    if (window.timerRendimiento) clearTimeout(window.timerRendimiento);
    window.timerRendimiento = setTimeout(() => {
        const paginasAProcesar = [num];
        if (bufferExtendido && num > 0) paginasAProcesar.push(num - 1);
        if (bufferExtendido && num < totalPaginas - 1) paginasAProcesar.push(num + 1);
        const layoutsPorPagina = _construirLayoutsBloquePreRender(paginasAProcesar, esTextoEscrito);
        const vozAPre = window.vozActivaSnapshot || document.getElementById('selector-voz-live')?.value || vozPredeterminada || "";
        const tradConfig = _obtenerConfigTraduccionPreRender();
        if (typeof eel !== 'undefined' && typeof eel.pre_renderizar_bloque_paginas === 'function') {
            eel.pre_renderizar_bloque_paginas(paginasAProcesar, vozAPre, velocidadLectura, dictActivo, tradConfig, layoutsPorPagina, usarAutoLayout)();
        }
    }, 250);
}

function _programarPreRenderizadoYPreTraduccion(num, data, esTextoEscrito, usarAutoLayout, dictActivo) {
    const modoPotenciado = document.getElementById('chk-alto-rendimiento')?.checked;
    const bufferExtendido = document.getElementById('chk-buffer-extendido')?.checked;
    if (modoPotenciado && data.oraciones) {
        _programarBloquePreRender(num, esTextoEscrito, usarAutoLayout, dictActivo, bufferExtendido);
    }

    const pretraducirActivo = document.getElementById('chk-pretraducir-paginas')?.checked ?? true;
    const tradActiva = document.getElementById('chk-traduccion-activa')?.checked ?? false;
    if (pretraducirActivo && tradActiva && typeof eel !== 'undefined' && typeof eel.pretraducir_bloque_paginas === 'function') {
        eel.pretraducir_bloque_paginas(
            num,
            document.getElementById('sel-traduccion-origen')?.value || 'auto',
            document.getElementById('sel-traduccion-destino')?.value || 'es',
            document.getElementById('sel-traduccion-motor')?.value || 'online',
            true
        )();
    }
}

function _finalizarCargaPagina(miToken, resolverCargaPagina) {
    if (typeof resolverCargaPagina === 'function') resolverCargaPagina();
    if (miToken !== tokenCargaActual) return;
    if (typeof canvas !== 'undefined' && canvas) canvas.classList.remove('canvas-procesando-layout');
    ocultarHUDScannerOCR();
    bloquearControlesNavegacion(false);
    if (window.autoContinuarLectura) {
        window.autoContinuarLectura = false;
        setTimeout(() => { if (typeof iniciarLectura === 'function') iniciarLectura(); }, 100);
    }
}

function _prepararTransicionPagina(num) {
    detenerLectura();
    if (window._preservarResaltadoEnSalto && window.resaltadoPagina === num) {
        window._preservarResaltadoEnSalto = false;
    } else if (typeof window.limpiarResaltadoBusqueda === 'function') {
        window.limpiarResaltadoBusqueda(false);
    }
    if (datosPagina) guardarEstadoPaginaActual();

    bloquearControlesNavegacion(true);
    const estadoHerramientas = {
        editorEstabaActivo: window.modoEditorTextoActivo === true,
        moverEstabaActivo: window.modoMoverElementosActivo === true,
    };
    if (typeof cerrarEditorTexto === 'function') cerrarEditorTexto();
    const capaEditor = document.getElementById('lira-pdf-text-editor-layer');
    if (capaEditor) capaEditor.innerHTML = '';
    if (typeof window.limpiarCapaMoverElementos === 'function') window.limpiarCapaMoverElementos();

    indiceOracion = -1;
    window.corteVSeleccionado = -1;
    paginaActual = num;
    const inputPag = document.getElementById('input-pagina-actual');
    if (inputPag) inputPag.value = num + 1;
    return estadoHerramientas;
}

function _restaurarHerramientasYLookaheadOCR(num, estadoHerramientas, esTextoEscrito) {
    if (estadoHerramientas.editorEstabaActivo && typeof renderizarBloquesEditor === 'function') renderizarBloquesEditor();
    if ((estadoHerramientas.moverEstabaActivo || window.modoMoverElementosActivo) && typeof window.cargarYRenderizarElementosMover === 'function') {
        window.cargarYRenderizarElementosMover();
    }
    if (!esTextoEscrito && num < totalPaginas - 1 && typeof eel !== 'undefined' && typeof eel.pre_cache_ocr_pagina === 'function') {
        eel.pre_cache_ocr_pagina(num + 1)();
    }
}

function _aplicarDatosPaginaRenderizados(num, clave, data, estadoHerramientas, esTextoEscrito) {
    datosPagina = data;
    totalPaginas = data.total_paginas;
    _normalizarLimitesHConAltoPagina(data.alto_pagina_pdf);

    memoriaLayout[clave] = {
        ...(memoriaLayout[clave] || {}),
        width: data.ancho_pagina_pdf,
        height: data.alto_pagina_pdf,
        escala: data.factor_zoom,
        canvasWidth: data.ancho_img,
        canvasHeight: data.alto_img,
        cortesV: [...cortesV],
        limitesH: JSON.parse(JSON.stringify(limitesH)),
        limitesHManual: memoriaLayout[clave]?.limitesHManual || false,
    };

    guardarEstadoPaginaActual();
    if (typeof window.compilarLibroTeatroPagina === 'function' && data?.oraciones) {
        window.compilarLibroTeatroPagina(num, data.oraciones);
    }

    document.getElementById('input-pagina-actual').value = num + 1;
    document.getElementById('total-paginas-texto').innerText = `/ ${totalPaginas}`;
    if (canvas.width !== data.ancho_img) canvas.width = data.ancho_img;
    if (canvas.height !== data.alto_img) canvas.height = data.alto_img;
    dibujar();
    _restaurarHerramientasYLookaheadOCR(num, estadoHerramientas, esTextoEscrito);
}

function _crearContextoCargaPagina(clave) {
    const esTextoEscrito = (window.tipoDocumento === 'texto_escrito');
    const esCapturaDoc = (window.tipoDocumento === 'captura');
    const usarAutoLayout = Boolean(window.autoLayoutActivo && !esTextoEscrito && !esCapturaDoc);
    const mem = memoriaLayout[clave];
    const yaConfigurado = !esTextoEscrito && Boolean(mem && (mem.configuradaManualmente || mem.limitesHManual || mem._autoDetectado));
    return {
        esTextoEscrito, esCapturaDoc, usarAutoLayout, yaConfigurado,
        esperaAutoLayout: usarAutoLayout && !yaConfigurado,
        imagenVistaRapida: null, imagenNuevaLista: false, layoutPendiente: null,
    };
}

async function _solicitarDatosPaginaBackend(num, dictActivo, ctxCarga) {
    const recorteActual = parseInt(document.getElementById('rng-recorte-pdf')?.value || 0);
    const autoOcrFlag = ctxCarga.esTextoEscrito ? false : (ctxCarga.esCapturaDoc ? true : window.autoOCRActivo);
    try {
        return await eel.obtener_pagina_data(
            num, cortesV.length > 0 ? cortesV : null, limitesH, dictActivo, false,
            autoOcrFlag, zonasExcluidas, recorteActual, !ctxCarga.imagenVistaRapida
        )();
    } finally {
        ocultarHUDScannerOCR();
    }
}

async function _intentarCargaSoloLectura(num) {
    if (!window.modoSoloLecturaActivo || typeof window.cargarPaginaSoloLecturaRapida !== 'function') return false;
    paginaActual = num;
    const inpPag = document.getElementById('input-pagina-actual');
    if (inpPag) inpPag.value = num + 1;
    return Boolean(await window.cargarPaginaSoloLecturaRapida(num));
}

async function cargarPagina(num) {
    if (typeof rutaPDFActual !== 'string' || !rutaPDFActual) return;
    if (await _intentarCargaSoloLectura(num)) return;

    const estadoHerramientas = _prepararTransicionPagina(num);
    const miToken = ++tokenCargaActual;
    let resolverCargaPagina = null;
    window._promesaCargaPaginaActual = new Promise(resolve => { resolverCargaPagina = resolve; });

    try {
        const clave = num.toString();
        const ctxCarga = _crearContextoCargaPagina(clave);
        const [, layoutIA] = await Promise.all([
            _iniciarVistaRapidaPagina(num, miToken, ctxCarga),
            _iniciarLayoutIAPagina(num, clave, miToken, ctxCarga),
        ]);
        if (miToken !== tokenCargaActual) return;

        _resolverLayoutEfectivoPagina(num, clave, layoutIA, ctxCarga);
        if (ctxCarga.usarAutoLayout && typeof eel !== 'undefined' && typeof eel.iniciar_lookahead_layout === 'function') {
            eel.iniciar_lookahead_layout(num, totalPaginas, true)();
        }

        const dictActivo = obtenerDiccionarioConsolidado();
        const data = await _solicitarDatosPaginaBackend(num, dictActivo, ctxCarga);
        if (miToken !== tokenCargaActual || !data) return;

        if (!data.imagen && ctxCarga.imagenVistaRapida) data.imagen = ctxCarga.imagenVistaRapida;
        _aplicarDatosPaginaRenderizados(num, clave, data, estadoHerramientas, ctxCarga.esTextoEscrito);
        _programarPreRenderizadoYPreTraduccion(num, data, ctxCarga.esTextoEscrito, ctxCarga.usarAutoLayout, dictActivo);
    } catch (err) {
        console.error("[PDF] Error en cargarPagina:", err);
    } finally {
        _finalizarCargaPagina(miToken, resolverCargaPagina);
    }
}

function irAPaginaDirecta() {
    if (bloqueoCambioPagina) {
        console.warn("[PDF] La página actual se está procesando. Por favor espera...");
        return;
    }
    let valor = parseInt(document.getElementById('input-pagina-actual').value);
    if (valor >= 1 && valor <= totalPaginas) {
        cargarPagina(valor - 1);
    } else {
        document.getElementById('input-pagina-actual').value = paginaActual + 1;
    }
}

function cambiarPagina(delta) {
    // Escudo físico universal: evita carreras y cascadas de peticiones
    if (bloqueoCambioPagina) {
        console.warn("[PDF] La página actual se está procesando. Por favor espera...");
        return;
    }

    let nuevaPag = paginaActual + delta;
    if (nuevaPag >= 0 && nuevaPag < totalPaginas) {
        cargarPagina(nuevaPag);
    }
}

function _aplicarResultadoRecalculoLayout(num, data, imagenPrevia) {
    if (!data.imagen && imagenPrevia) data.imagen = imagenPrevia;
    datosPagina = data;
    guardarEstadoPaginaActual();
    if (typeof window.compilarLibroTeatroPagina === 'function' && data?.oraciones) {
        window.compilarLibroTeatroPagina(num, data.oraciones);
    }
    if (typeof dibujar === 'function') dibujar();
}

async function recalcularLayoutPaginaActual() {
    if (!datosPagina) return;
    if (typeof dibujar === 'function') dibujar();

    const pagKey = paginaActual.toString();
    memoriaLayout[pagKey] = memoriaLayout[pagKey] || {};
    memoriaLayout[pagKey].cortesV = [...cortesV];
    memoriaLayout[pagKey].limitesH = JSON.parse(JSON.stringify(limitesH));
    guardarEstadoPaginaActual();

    if (window.tutorialActivo || window.modoSoloLecturaActivo) return;
    if (typeof eel === 'undefined' || typeof eel.obtener_pagina_data !== 'function') return;

    const miToken = ++tokenCargaActual;
    const num = paginaActual;
    const imagenPrevia = datosPagina.imagen;
    const esTextoEscrito = (window.tipoDocumento === 'texto_escrito');
    const recorteActual = parseInt(document.getElementById('rng-recorte-pdf')?.value || 0);

    try {
        const data = await eel.obtener_pagina_data(
            num, cortesV.length > 0 ? cortesV : null, limitesH, obtenerDiccionarioConsolidado(),
            false, esTextoEscrito ? false : window.autoOCRActivo, zonasExcluidas, recorteActual, false
        )();
        if (miToken === tokenCargaActual && data) _aplicarResultadoRecalculoLayout(num, data, imagenPrevia);
    } catch (e) {
        console.warn('[PDF] Error recalculando layout de página actual:', e);
    }
}
window.recalcularLayoutPaginaActual = recalcularLayoutPaginaActual;

function _aplicarMutacionCortesV() {
    if (window.modoMoverElementosActivo && typeof toggleModoMoverElementos === 'function') {
        toggleModoMoverElementos(false);
    }
    let pagKey = paginaActual.toString();
    if (!memoriaLayout[pagKey]) memoriaLayout[pagKey] = {};
    memoriaLayout[pagKey].configuradaManualmente = true;
    inicializarLimitesH();
    recalcularLayoutPaginaActual();
}

function agregarCorteV() {
    if (!datosPagina) return;
    cortesV.push({
        x: (datosPagina.ancho_pagina_pdf / 2) + (cortesV.length * 20),
        yMin: 0,
        yMax: datosPagina.alto_pagina_pdf
    });
    window.corteVSeleccionado = cortesV.length - 1;
    _aplicarMutacionCortesV();
}

function eliminarCorteVPorIndice(index) {
    if (typeof index !== 'number' || index < 0 || index >= cortesV.length) return false;
    cortesV.splice(index, 1);
    window.corteVSeleccionado = -1;
    _aplicarMutacionCortesV();
    return true;
}
window.eliminarCorteVPorIndice = eliminarCorteVPorIndice;

function quitarCorteV() {
    if (cortesV.length > 0) {
        eliminarCorteVPorIndice(cortesV.length - 1);
    }
}

function limpiarCortesV() {
    cortesV = [];
    window.corteVSeleccionado = -1;
    _aplicarMutacionCortesV();
}

function inicializarLimitesH() {
    let prevLimits0 = (limitesH && limitesH["0"]) ? [...limitesH["0"]] : null;
    limitesH = {};
    if (!datosPagina) return;
    let numCols = cortesV.length > 0 ? cortesV.length + 1 : 1;
    for (let i = 0; i < numCols; i++) {
        if (prevLimits0) {
            limitesH[i.toString()] = [...prevLimits0];
        } else {
            limitesH[i.toString()] = [0, datosPagina.alto_pagina_pdf];
        }
    }
}

function restablecerLimitesHorizontales() {
    if (!datosPagina) return;
    if (window.modoMoverElementosActivo && typeof toggleModoMoverElementos === 'function') {
        toggleModoMoverElementos(false);
    }
    limitesH = {};
    let numCols = cortesV.length > 0 ? cortesV.length + 1 : 1;
    for (let i = 0; i < numCols; i++) {
        limitesH[i.toString()] = [0, datosPagina.alto_pagina_pdf];
    }
    if (window.tutorialActivo) {
        if (typeof dibujar === 'function') dibujar();
        return;
    }
    let pagKey = paginaActual.toString();
    if (!memoriaLayout[pagKey]) {
        memoriaLayout[pagKey] = {};
    }
    memoriaLayout[pagKey].limitesHManual = true;
    memoriaLayout[pagKey].limitesH = JSON.parse(JSON.stringify(limitesH));
    guardarEstadoPaginaActual();
    cargarPagina(paginaActual);
    if (typeof mostrarToastLira === 'function') {
        mostrarToastLira("Límites horizontales restablecidos", 'reiniciar');
    }
}
window.restablecerLimitesHorizontales = restablecerLimitesHorizontales;

function limpiarZonasExcluidas() {
    if (!datosPagina) return;
    zonasExcluidas = [];
    if (window.tutorialActivo) {
        if (typeof dibujar === 'function') dibujar();
        return;
    }
    guardarEstadoPaginaActual();
    cargarPagina(paginaActual);
    if (typeof mostrarToastLira === 'function') {
        mostrarToastLira("Zonas de exclusión eliminadas", 'borrar');
    }
}
window.limpiarZonasExcluidas = limpiarZonasExcluidas;

function _toastSeguroPdf(msg) {
    if (typeof mostrarToastLira === 'function') mostrarToastLira(msg);
}

async function _aplicarLayoutAutodetectadoManual(res) {
    const clon = _clonarLayoutIA(res);
    cortesV = clon.cortesV;
    if (res.limitesH && typeof res.limitesH === 'object') limitesH = clon.limitesH;
    zonasExcluidas = clon.zonasExcluidas;

    const clave = paginaActual.toString();
    memoriaLayout[clave] = {
        ...(memoriaLayout[clave] || {}),
        cortesV: [...cortesV],
        limitesH: JSON.parse(JSON.stringify(limitesH)),
        zonasExcluidas: JSON.parse(JSON.stringify(zonasExcluidas)),
        _autoDetectado: true,
    };
    guardarEstadoPaginaActual();
    if (typeof dibujar === 'function') dibujar();
    await cargarPagina(paginaActual);

    const colsTxt = cortesV.length > 0 ? `${cortesV.length + 1} columnas` : "1 columna";
    const zonasTxt = zonasExcluidas.length > 0 ? ` (${zonasExcluidas.length} zonas excluidas)` : "";
    _toastSeguroPdf(`Diseño detectado: ${colsTxt}${zonasTxt}`);
}

async function autoDetectarLayoutActual() {
    if (!datosPagina || !rutaPDFActual) { _toastSeguroPdf("Abre un documento para auto-detectar el diseño"); return; }
    if (window.modoMoverElementosActivo && typeof toggleModoMoverElementos === 'function') toggleModoMoverElementos(false);
    if (window.tipoDocumento === 'texto_escrito') { _toastSeguroPdf("El modo texto libre no requiere detección de diseño"); return; }

    const btnAuto = document.getElementById('btn-auto-layout');
    if (btnAuto) { btnAuto.classList.add('rotando-icono'); btnAuto.disabled = true; }
    _toastSeguroPdf("Analizando diseño y columnas con IA...");

    try {
        const res = await eel.autodetectar_layout_pagina(paginaActual)();
        if (res?.exito) await _aplicarLayoutAutodetectadoManual(res);
        else _toastSeguroPdf("No se pudo detectar el diseño: " + (res?.error || "Error desconocido"));
    } catch (err) {
        console.error("Error auto-detectando layout:", err);
        _toastSeguroPdf("Error en auto-detección de diseño");
    } finally {
        if (btnAuto) {
            btnAuto.classList.remove('rotando-icono');
            btnAuto.disabled = false;
        }
    }
}
window.autoDetectarLayoutActual = autoDetectarLayoutActual;
