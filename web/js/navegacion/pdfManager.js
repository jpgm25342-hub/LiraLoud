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
async function abrirDocumentoDesdeRuta(ruta, esTemporal = false, esCaptura = false) {
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

    // 1. Cargar el documento en la memoria de Python (fitz.open)
    if (typeof eel.cargar_documento === 'function') {
        const cargadoOk = await eel.cargar_documento(ruta)();
        if (!cargadoOk) {
            console.error("❌ Error cargando documento en Python:", ruta);
            if (typeof liraAlert === 'function') liraAlert("No se pudo cargar el documento.");
            return;
        }
    }

    rutaPDFActual = ruta;
    paginaActual = 0;
    memoriaLayout = {};
    cortesV = [];
    limitesH = {};
    zonasExcluidas = [];

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
    if (typeof eel !== 'undefined' && typeof eel.detectar_si_documento_es_escaneado === 'function') {
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
                        // Es una captura de pantalla, saltar pregunta y aplicar OCR directamente.
                        iniciarBatchOCR(0, totalPaginas || null);
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
            console.warn("⚠️ Error comprobando si es documento escaneado:", e);
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
    if (!rutaPDFActual || !datosPagina) return;
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

async function cargarPagina(num) {
    detenerLectura();
    if (window._preservarResaltadoEnSalto && window.resaltadoPagina === num) {
        window._preservarResaltadoEnSalto = false;
    } else if (typeof window.limpiarResaltadoBusqueda === 'function') {
        window.limpiarResaltadoBusqueda(false);
    }
    if (datosPagina) guardarEstadoPaginaActual();

    // Incrementar token de transacción para invalidar peticiones anteriores en vuelo
    const miToken = ++tokenCargaActual;
    bloquearControlesNavegacion(true);

    // Guardar si el editor estaba activo
    const editorEstabaActivo = window.modoEditorTextoActivo === true;

    // Limpiar editor de texto si está activo al cambiar de página
    if (typeof cerrarEditorTexto === 'function') cerrarEditorTexto();
    const capaEditor = document.getElementById('lira-pdf-text-editor-layer');
    if (capaEditor) capaEditor.innerHTML = '';

    indiceOracion = -1; // Reset de índice

    paginaActual = num;
    try {
        let clave = num.toString();

        let yaFueConfigurada = memoriaLayout[clave] !== undefined && 
            (memoriaLayout[clave].configuradaManualmente === true || memoriaLayout[clave].limitesHManual === true);

        // Si Auto-Layout IA está activo, lanzarlo en segundo plano para no frenar el render de la página
        let yaAutoDetectado = memoriaLayout[clave] && memoriaLayout[clave]._autoDetectado === true;
        if (window.autoLayoutActivo && !yaFueConfigurada && !yaAutoDetectado && typeof eel !== 'undefined' && typeof eel.autodetectar_layout_pagina === 'function') {
            eel.autodetectar_layout_pagina(num)().then(layoutIA => {
                if (paginaActual !== num) return;
                if (layoutIA && layoutIA.exito) {
                    cortesV = Array.isArray(layoutIA.cortesV) ? [...layoutIA.cortesV] : [];
                    if (layoutIA.limitesH && typeof layoutIA.limitesH === 'object') {
                        limitesH = JSON.parse(JSON.stringify(layoutIA.limitesH));
                    }
                    zonasExcluidas = (Array.isArray(layoutIA.zonasExcluidas) && layoutIA.zonasExcluidas.length > 0)
                        ? JSON.parse(JSON.stringify(layoutIA.zonasExcluidas))
                        : [];
                    memoriaLayout[clave] = {
                        ...(memoriaLayout[clave] || {}),
                        cortesV: [...cortesV],
                        limitesH: JSON.parse(JSON.stringify(limitesH)),
                        zonasExcluidas: JSON.parse(JSON.stringify(zonasExcluidas)),
                        _autoDetectado: true
                    };
                    // Animación suave de aparición (fade-in) sin recargar toda la página
                    if (typeof dibujar === 'function') {
                        const _tInicioAnim = performance.now();
                        const _duracionAnim = 200;
                        const _animarCortes = (ahora) => {
                            if (paginaActual !== num) return;
                            const progreso = Math.min(1, (ahora - _tInicioAnim) / _duracionAnim);
                            window._alphaLayoutIA = progreso;
                            dibujar();
                            if (progreso < 1) {
                                requestAnimationFrame(_animarCortes);
                            } else {
                                delete window._alphaLayoutIA;
                            }
                        };
                        requestAnimationFrame(_animarCortes);
                    }
                    // Re-segmentar texto silenciosamente en segundo plano sin tocar la imagen
                    if (typeof eel.obtener_pagina_data === 'function') {
                        eel.obtener_pagina_data(num, cortesV, limitesH, null, false, false, false, zonasExcluidas)().then(resData => {
                            if (paginaActual === num && resData && resData.oraciones) {
                                oraciones = resData.oraciones;
                                if (typeof dibujar === 'function') dibujar();
                            }
                        }).catch(() => {});
                    }
                }
            }).catch(errLayout => {
                console.warn("⚠️ No se pudo auto-detectar layout en navegación:", errLayout);
            });
        }

        // Precarga en segundo plano de las siguientes N hojas configuradas (por defecto 2)
        const _nPrecarga = (typeof window.precargaHojas === 'number') ? window.precargaHojas : 2;
        if (window.autoLayoutActivo && _nPrecarga > 0 && typeof eel !== 'undefined' && typeof eel.autodetectar_layout_pagina === 'function') {
            (async () => {
                for (let offset = 1; offset <= _nPrecarga; offset++) {
                    if (paginaActual !== num) break;
                    const sigPag = num + offset;
                    if (typeof totalPaginas !== 'undefined' && sigPag >= totalPaginas) break;
                    const sigClave = sigPag.toString();
                    if (memoriaLayout[sigClave] && (memoriaLayout[sigClave]._autoDetectado || memoriaLayout[sigClave].configuradaManualmente)) continue;
                    try {
                        const resPre = await eel.autodetectar_layout_pagina(sigPag)();
                        if (resPre && resPre.exito) {
                            memoriaLayout[sigClave] = {
                                ...(memoriaLayout[sigClave] || {}),
                                cortesV: Array.isArray(resPre.cortesV) ? [...resPre.cortesV] : [],
                                limitesH: (resPre.limitesH && typeof resPre.limitesH === 'object') ? JSON.parse(JSON.stringify(resPre.limitesH)) : {},
                                zonasExcluidas: (Array.isArray(resPre.zonasExcluidas) && resPre.zonasExcluidas.length > 0) ? JSON.parse(JSON.stringify(resPre.zonasExcluidas)) : [],
                                _autoDetectado: true
                            };
                        }
                    } catch (e) { /* silencioso */ }
                }
            })();
        }

        if (yaFueConfigurada) {
            cortesV = [...memoriaLayout[clave].cortesV];
        } else {
            cortesV = [];
            let bestEven = null;
            let minEvenDist = Infinity;
            let bestOdd = null;
            let minOddDist = Infinity;

            let savedPages = Object.keys(memoriaLayout).map(Number).filter(n => {
                let l = memoriaLayout[n.toString()];
                return l && Array.isArray(l.cortesV) && (l.cortesV.length > 0) && (n !== num);
            });

            for (let p of savedPages) {
                let dist = Math.abs(num - p);
                if (dist % 2 === 0) {
                    if (dist < minEvenDist || (dist === minEvenDist && p < num)) {
                        minEvenDist = dist;
                        bestEven = p;
                    }
                } else {
                    if (dist < minOddDist || (dist === minOddDist && p < num)) {
                        minOddDist = dist;
                        bestOdd = p;
                    }
                }
            }

            let target = (bestEven !== null) ? bestEven : bestOdd;
            if (target !== null && memoriaLayout[target.toString()] && Array.isArray(memoriaLayout[target.toString()].cortesV)) {
                cortesV = [...memoriaLayout[target.toString()].cortesV];
            }
        }

        // -------------------------------------------------------------
        // Resolución de memoria para límites horizontales (Azul)
        // -------------------------------------------------------------
        let layoutActual = memoriaLayout[clave];
        let yaTieneLimitesHPropios = layoutActual && (
            layoutActual.limitesHManual ||
            (layoutActual.limitesH && tieneLimitesHActivos(layoutActual.limitesH, layoutActual.height))
        );

        if (yaTieneLimitesHPropios && layoutActual.limitesH && Object.keys(layoutActual.limitesH).length > 0) {
            limitesH = JSON.parse(JSON.stringify(layoutActual.limitesH));
        } else if (num === 0) {
            // La primera página (portada/cubierta) tiene un diseño único y NO debe heredar
            // los límites horizontales (encabezados/pies de página) de las páginas interiores.
            limitesH = (layoutActual && layoutActual.limitesH) ? JSON.parse(JSON.stringify(layoutActual.limitesH)) : {};
        } else {
            limitesH = {};
            let bestEvenH = null;
            let minEvenDistH = Infinity;
            let bestOddH = null;
            let minOddDistH = Infinity;

            let savedPagesH = Object.keys(memoriaLayout).map(Number).filter(n => {
                let l = memoriaLayout[n.toString()];
                return l && l.limitesH && tieneLimitesHActivos(l.limitesH, l.height) && (n !== num);
            });

            for (let p of savedPagesH) {
                let dist = Math.abs(num - p);
                if (dist % 2 === 0) {
                    if (dist < minEvenDistH || (dist === minEvenDistH && p < num)) {
                        minEvenDistH = dist;
                        bestEvenH = p;
                    }
                } else {
                    if (dist < minOddDistH || (dist === minOddDistH && p < num)) {
                        minOddDistH = dist;
                        bestOddH = p;
                    }
                }
            }

            let targetH = (bestEvenH !== null) ? bestEvenH : bestOddH;
            if (targetH !== null && memoriaLayout[targetH.toString()] && memoriaLayout[targetH.toString()].limitesH) {
                let sourceLayout = memoriaLayout[targetH.toString()];
                let sourceH = sourceLayout.limitesH;
                let sourceAlto = sourceLayout.height || (datosPagina ? datosPagina.alto_pagina_pdf : 0);
                let curAlto = (layoutActual && layoutActual.height) || (datosPagina ? datosPagina.alto_pagina_pdf : sourceAlto);

                let numCols = cortesV.length > 0 ? cortesV.length + 1 : 1;
                for (let i = 0; i < numCols; i++) {
                    let colKey = i.toString();
                    let sourceCol = sourceH[colKey] || sourceH["0"];
                    if (sourceCol && Array.isArray(sourceCol) && sourceCol.length === 2) {
                        let topCut = sourceCol[0];
                        let bottomMargin = (sourceAlto > 0) ? Math.max(0, sourceAlto - sourceCol[1]) : 0;
                        let bottomCut = (curAlto > 0) ? Math.max(topCut + 15, curAlto - bottomMargin) : sourceCol[1];
                        limitesH[colKey] = [topCut, bottomCut];
                    }
                }
            }
        }

        if (memoriaLayout[clave] && Array.isArray(memoriaLayout[clave].zonasExcluidas)) {
            zonasExcluidas = JSON.parse(JSON.stringify(memoriaLayout[clave].zonasExcluidas));
        } else {
            zonasExcluidas = [];
        }

        // Actualizar indicador de página de inmediato en la UI
        const inputPag = document.getElementById('input-pagina-actual');
        if (inputPag) inputPag.value = num + 1;

        // 1. VISTA RÁPIDA INMEDIATA: Renderizar la nueva hoja en el canvas de inmediato
        let imagenVistaRapidaCargada = null;
        if (typeof eel !== 'undefined' && typeof eel.obtener_vista_rapida_pagina === 'function') {
            try {
                let vistaRapida = await eel.obtener_vista_rapida_pagina(num)();
                // Si vino otra carga mientras se obtenía la vista previa, descartar
                if (miToken !== tokenCargaActual) return;

                if (vistaRapida && vistaRapida.imagen) {
                    imagenVistaRapidaCargada = vistaRapida.imagen;
                    if (canvas.width !== vistaRapida.ancho_img) canvas.width = vistaRapida.ancho_img;
                    if (canvas.height !== vistaRapida.alto_img) canvas.height = vistaRapida.alto_img;
                    canvas.style.width = (vistaRapida.ancho_img * nivelZoomPDF) + "px";
                    canvas.style.height = (vistaRapida.alto_img * nivelZoomPDF) + "px";
                    let imgRapida = new Image();
                    imgRapida.onload = () => {
                        if (miToken === tokenCargaActual) {
                            window.imagenCacheadaCanvas = imgRapida;
                            window.imagenCacheadaSrc = vistaRapida.imagen;
                            ctx.drawImage(imgRapida, 0, 0);
                        }
                    };
                    imgRapida.src = vistaRapida.imagen;
                }
            } catch (e) {
                console.warn("⚠️ No se pudo cargar vista previa rápida:", e);
            }
        }

        // 2. EXTRACCIÓN COMPLETA (Oraciones, palabras y RapidOCR si aplica)
        let dictActivo = obtenerDiccionarioConsolidado();
        let data = null;
        let recorteActual = parseInt(document.getElementById('rng-recorte-pdf')?.value || 0);
        const yaTenemosImagen = Boolean(imagenVistaRapidaCargada);
        try {
            data = await eel.obtener_pagina_data(
                num,
                cortesV.length > 0 ? cortesV : null,
                limitesH,
                dictActivo,
                false,
                window.autoOCRActivo,
                zonasExcluidas,
                recorteActual,
                !yaTenemosImagen // incluir_imagen: False si vista rápida ya la transfirió
            )();
        } finally {
            ocultarHUDScannerOCR();
        }

        // Si una petición más nueva superó a esta, descartar datos obsoletos
        if (miToken !== tokenCargaActual || !data) return;

        // Si no se incluyó imagen en la respuesta completa, reutilizar la de vista rápida
        if (!data.imagen && imagenVistaRapidaCargada) {
            data.imagen = imagenVistaRapidaCargada;
        }

        datosPagina = data;
        totalPaginas = data.total_paginas;

        let numCols = cortesV.length > 0 ? cortesV.length + 1 : 1;
        for (let i = 0; i < numCols; i++) {
            let colKey = i.toString();
            if (!limitesH[colKey] || !Array.isArray(limitesH[colKey])) {
                limitesH[colKey] = [0, data.alto_pagina_pdf];
            } else {
                let yMin = Math.max(0, Math.min(data.alto_pagina_pdf - 15, limitesH[colKey][0]));
                let yMax = Math.max(yMin + 15, Math.min(data.alto_pagina_pdf, limitesH[colKey][1]));
                limitesH[colKey] = [yMin, yMax];
            }
        }

        // Guardar info de layout para el editor de texto (cálculo de rects en canvas) y persistencia
        memoriaLayout[clave] = {
            ...(memoriaLayout[clave] || {}),
            width: data.ancho_pagina_pdf,
            height: data.alto_pagina_pdf,
            escala: data.factor_zoom,
            canvasWidth: data.ancho_img,
            canvasHeight: data.alto_img,
            cortesV: [...cortesV],
            limitesH: JSON.parse(JSON.stringify(limitesH)),
            limitesHManual: yaTieneLimitesHPropios || false
        };

        guardarEstadoPaginaActual();

        document.getElementById('input-pagina-actual').value = num + 1;
        document.getElementById('total-paginas-texto').innerText = `/ ${totalPaginas}`;

        // Solo redimensionar si cambiaron las dimensiones para no blanquear el lienzo
        if (canvas.width !== data.ancho_img) canvas.width = data.ancho_img;
        if (canvas.height !== data.alto_img) canvas.height = data.alto_img;
        dibujar();

        // Si el editor de texto estaba activo, volver a renderizar los bloques
        if (editorEstabaActivo && typeof renderizarBloquesEditor === 'function') {
            renderizarBloquesEditor();
        }

        // Lookahead OCR: Pre-cachear en segundo plano la siguiente página
        if (num < totalPaginas - 1 && typeof eel !== 'undefined' && typeof eel.pre_cache_ocr_pagina === 'function') {
            eel.pre_cache_ocr_pagina(num + 1)();
        }

        // --- BLOQUE DE RENDIMIENTO POTENCIADO (BUFFER EXTENDIDO) ---
        const modoPotenciado = document.getElementById('chk-alto-rendimiento')?.checked;
        const bufferExtendido = document.getElementById('chk-buffer-extendido')?.checked;

        if (modoPotenciado && data.oraciones) {
            if (window.timerRendimiento) clearTimeout(window.timerRendimiento);

            window.timerRendimiento = setTimeout(() => {
                let paginasAProcesar = [num];
                if (bufferExtendido) {
                    if (num > 0) paginasAProcesar.push(num - 1);
                    if (num < totalPaginas - 1) paginasAProcesar.push(num + 1);
                }

                let vozAPre = window.vozActivaSnapshot || (document.getElementById('selector-voz-live')?.value) || vozPredeterminada || "";

                let tradActiva = document.getElementById('chk-traduccion-activa')?.checked ?? false;
                let tradConfig = null;
                if (tradActiva) {
                    tradConfig = {
                        activa: true,
                        origen: document.getElementById('sel-traduccion-origen')?.value || 'auto',
                        destino: document.getElementById('sel-traduccion-destino')?.value || 'es',
                        motor: document.getElementById('sel-traduccion-motor')?.value || 'online',
                        modo: document.getElementById('sel-traduccion-modo')?.value || 'subtitulos'
                    };
                }

                console.log("🧬 Rendimiento: Estable en página. Iniciando ráfaga con voz:", vozAPre, "Trad:", tradConfig);
                if (typeof eel !== 'undefined' && typeof eel.pre_renderizar_bloque_paginas === 'function') {
                    eel.pre_renderizar_bloque_paginas(paginasAProcesar, vozAPre, velocidadLectura, dictActivo, tradConfig)();
                }
            }, 250);
        }

        // --- BLOQUE DE PRE-TRADUCCIÓN EN FONDO ---
        const pretraducirActivo = document.getElementById('chk-pretraducir-paginas')?.checked ?? true;
        const tradActiva = document.getElementById('chk-traduccion-activa')?.checked ?? false;
        if (pretraducirActivo && tradActiva && typeof eel !== 'undefined' && typeof eel.pretraducir_bloque_paginas === 'function') {
            const origen = document.getElementById('sel-traduccion-origen')?.value || 'auto';
            const destino = document.getElementById('sel-traduccion-destino')?.value || 'es';
            const motor = document.getElementById('sel-traduccion-motor')?.value || 'online';
            eel.pretraducir_bloque_paginas(num, origen, destino, motor, true)();
        }
    } catch (err) {
        console.error("❌ Error en cargarPagina:", err);
    } finally {
        if (miToken === tokenCargaActual) {
            ocultarHUDScannerOCR();
            bloquearControlesNavegacion(false);
            if (window.autoContinuarLectura) {
                window.autoContinuarLectura = false;
                setTimeout(() => {
                    if (typeof iniciarLectura === 'function') {
                        iniciarLectura();
                    }
                }, 100);
            }
        }
    }
}

function irAPaginaDirecta() {
    if (bloqueoCambioPagina) {
        console.warn("⏳ La página actual se está procesando. Por favor espera...");
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
    // 🛡️ ESCUDO FÍSICO UNIVERSAL: Evita carreras y cascadas de peticiones
    if (bloqueoCambioPagina) {
        console.warn("⏳ La página actual se está procesando. Por favor espera...");
        return;
    }

    let nuevaPag = paginaActual + delta;
    if (nuevaPag >= 0 && nuevaPag < totalPaginas) {
        cargarPagina(nuevaPag);
    }
}

function agregarCorteV() {
    if (!datosPagina) return;
    cortesV.push({
        x: (datosPagina.ancho_pagina_pdf / 2) + (cortesV.length * 20),
        yMin: 0,
        yMax: datosPagina.alto_pagina_pdf
    });
    let pagKey = paginaActual.toString();
    if (!memoriaLayout[pagKey]) memoriaLayout[pagKey] = {};
    memoriaLayout[pagKey].configuradaManualmente = true;
    inicializarLimitesH();
    if (window.tutorialActivo) {
        if (typeof dibujar === 'function') dibujar();
        return;
    }
    guardarEstadoPaginaActual();
    cargarPagina(paginaActual);
}

function quitarCorteV() {
    if (cortesV.length > 0) {
        cortesV.pop();
        let pagKey = paginaActual.toString();
        if (!memoriaLayout[pagKey]) memoriaLayout[pagKey] = {};
        memoriaLayout[pagKey].configuradaManualmente = true;
        inicializarLimitesH();
        if (window.tutorialActivo) {
            if (typeof dibujar === 'function') dibujar();
            return;
        }
        guardarEstadoPaginaActual();
        cargarPagina(paginaActual);
    }
}

function limpiarCortesV() {
    cortesV = [];
    let pagKey = paginaActual.toString();
    if (!memoriaLayout[pagKey]) memoriaLayout[pagKey] = {};
    memoriaLayout[pagKey].configuradaManualmente = true;
    inicializarLimitesH();
    if (window.tutorialActivo) {
        if (typeof dibujar === 'function') dibujar();
        return;
    }
    guardarEstadoPaginaActual();
    cargarPagina(paginaActual);
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
        mostrarToastLira("↕️ Límites horizontales restablecidos");
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
        mostrarToastLira("Zonas de exclusión eliminadas");
    }
}
window.limpiarZonasExcluidas = limpiarZonasExcluidas;

async function autoDetectarLayoutActual() {
    if (!datosPagina || !rutaPDFActual) {
        if (typeof mostrarToastLira === 'function') {
            mostrarToastLira("Abre un documento para auto-detectar el diseño");
        }
        return;
    }

    const btnAuto = document.getElementById('btn-auto-layout');
    if (btnAuto) {
        btnAuto.classList.add('rotando-icono');
        btnAuto.disabled = true;
    }

    if (typeof mostrarToastLira === 'function') {
        mostrarToastLira("Analizando diseño y columnas con IA...");
    }

    try {
        let res = await eel.autodetectar_layout_pagina(paginaActual)();
        if (res && res.exito) {
            // Aplicar columnas verticales
            cortesV = Array.isArray(res.cortesV) ? [...res.cortesV] : [];

            // Aplicar límites horizontales
            if (res.limitesH && typeof res.limitesH === 'object') {
                limitesH = JSON.parse(JSON.stringify(res.limitesH));
            }

            // Aplicar zonas excluidas si las detectó
            if (Array.isArray(res.zonasExcluidas) && res.zonasExcluidas.length > 0) {
                zonasExcluidas = JSON.parse(JSON.stringify(res.zonasExcluidas));
            }

            guardarEstadoPaginaActual();
            await cargarPagina(paginaActual);

            let msg = "Diseño detectado: ";
            if (cortesV.length > 0) {
                msg += `${cortesV.length + 1} columnas`;
            } else {
                msg += "1 columna";
            }
            if (zonasExcluidas.length > 0) {
                msg += ` (${zonasExcluidas.length} zonas excluidas)`;
            }

            if (typeof mostrarToastLira === 'function') {
                mostrarToastLira(msg);
            }
        } else {
            if (typeof mostrarToastLira === 'function') {
                mostrarToastLira("No se pudo detectar el diseño: " + (res?.error || "Error desconocido"));
            }
        }
    } catch (err) {
        console.error("Error auto-detectando layout:", err);
        if (typeof mostrarToastLira === 'function') {
            mostrarToastLira("Error en auto-detección de diseño");
        }
    } finally {
        if (btnAuto) {
            btnAuto.classList.remove('rotando-icono');
            btnAuto.disabled = false;
        }
    }
}
window.autoDetectarLayoutActual = autoDetectarLayoutActual;
