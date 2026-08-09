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
        rutaPDFActual = ruta;
        paginaActual = 0;
        memoriaLayout = {};
        cortesV = [];
        limitesH = {};

        let progreso = await eel.cargar_progreso_libro(rutaPDFActual)();
        if (progreso) {
            paginaActual = progreso.ultima_pagina || 0;
            memoriaLayout = progreso.layouts || {};

            let clave = paginaActual.toString();
            if (memoriaLayout[clave]) {
                cortesV = memoriaLayout[clave].cortesV || [];
                limitesH = memoriaLayout[clave].limitesH || {};
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
                if (docInfo && docInfo.es_escaneado && !docInfo.completamente_cacheado) {
                    let pref = localStorage.getItem('lira_preferencia_ocr');
                    if (pref === 'batch') {
                        iniciarBatchOCR();
                        return;
                    } else if (pref === 'demanda') {
                        cargarPagina(paginaActual);
                        return;
                    } else {
                        abrirModalOCRDecision();
                        return;
                    }
                }
            } catch (e) {
                console.warn("⚠️ Error comprobando si es documento escaneado:", e);
            }
        }

        cargarPagina(paginaActual);
    }
}

function guardarEstadoPaginaActual() {
    if (!rutaPDFActual || !datosPagina) return;
    memoriaLayout[paginaActual.toString()] = {
        cortesV: [...cortesV],
        limitesH: JSON.parse(JSON.stringify(limitesH))
    };
    let segmentacion = {
        usarBloquesNativos: document.getElementById('chk-usar-bloques')?.checked ?? true,
        sensibilidadSalto: parseFloat(document.getElementById('rng-sensibilidad-salto-main')?.value || 0.5),
        detectarSangria: document.getElementById('chk-detectar-sangria-main')?.checked ?? true
    };
    eel.guardar_progreso_libro(rutaPDFActual, paginaActual, memoriaLayout, segmentacion);
}

async function cargarPagina(num) {
    detenerLectura();
    if (datosPagina) guardarEstadoPaginaActual();

    indiceOracion = -1; // Tarea: Reseteamos siempre el índice al cambiar de hoja

    paginaActual = num;
    let clave = num.toString();

    let tieneMemoriaCortes = memoriaLayout[clave] && memoriaLayout[clave].cortesV.length > 0;

    if (tieneMemoriaCortes) {
        cortesV = [...memoriaLayout[clave].cortesV];
    } else {
        cortesV = [];
        let bestEven = null;
        let minEvenDist = Infinity;
        let bestOdd = null;
        let minOddDist = Infinity;

        let savedPages = Object.keys(memoriaLayout).map(Number).filter(n => {
            let l = memoriaLayout[n.toString()];
            return l && (l.cortesV.length > 0) && (n !== num);
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
        if (target !== null) {
            cortesV = [...memoriaLayout[target.toString()].cortesV];
        }
    }

    if (memoriaLayout[clave] && Object.keys(memoriaLayout[clave].limitesH).length > 0) {
        limitesH = JSON.parse(JSON.stringify(memoriaLayout[clave].limitesH));
    } else {
        limitesH = {};
    }

    // Activar HUD láser solo si la página tarda un instante (e.g. OCR)
    let hudTimer = setTimeout(() => {
        mostrarHUDScannerOCR("🔍 Reconociendo texto con RapidOCR...");
    }, 150);

    let dictActivo = obtenerDiccionarioConsolidado();
    let data = null;
    try {
        data = await eel.obtener_pagina_data(num, cortesV.length > 0 ? cortesV : null, limitesH, dictActivo)();
    } finally {
        clearTimeout(hudTimer);
        ocultarHUDScannerOCR();
    }

    if (!data) return;

    datosPagina = data;
    totalPaginas = data.total_paginas;

    if (!memoriaLayout[clave] || Object.keys(limitesH).length === 0) {
        inicializarLimitesH();
        guardarEstadoPaginaActual();
    }

    document.getElementById('input-pagina-actual').value = num + 1;
    document.getElementById('total-paginas-texto').innerText = `/ ${totalPaginas}`;

    canvas.width = data.ancho_img;
    canvas.height = data.alto_img;
    dibujar();

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
            eel.pre_renderizar_bloque_paginas(paginasAProcesar, vozAPre, velocidadLectura, dictActivo, tradConfig)();
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
}

function irAPaginaDirecta() {
    let valor = parseInt(document.getElementById('input-pagina-actual').value);
    if (valor >= 1 && valor <= totalPaginas) { 
        cargarPagina(valor - 1); 
    } else { 
        document.getElementById('input-pagina-actual').value = paginaActual + 1; 
    }
}

function cambiarPagina(delta) {
    const modoPotenciado = document.getElementById('chk-alto-rendimiento')?.checked;
    const bufferExtendido = document.getElementById('chk-buffer-extendido')?.checked;

    // 🛡️ ESCUDO FÍSICO DINÁMICO
    if (modoPotenciado && bloqueoCambioPagina) {
        console.warn("⏳ Sincronizando ráfaga de audio. Por favor espere...");
        return;
    }

    let nuevaPag = paginaActual + delta;
    if (nuevaPag >= 0 && nuevaPag < totalPaginas) {

        if (modoPotenciado) {
            bloqueoCambioPagina = true;

            const tiempoEspera = bufferExtendido ? 3000 : 1000;

            const btns = document.querySelectorAll('.btn-nav');
            btns.forEach(b => {
                b.style.opacity = "0.3";
                b.style.cursor = "wait";
            });

            setTimeout(() => {
                bloqueoCambioPagina = false;
                btns.forEach(b => {
                    b.style.opacity = "1";
                    b.style.cursor = "pointer";
                });
                console.log("🟢 Buffer listo. Sistema liberado.");
            }, tiempoEspera);
        }

        cargarPagina(nuevaPag);
    }
}

function agregarCorteV() {
    if (!datosPagina) return;
    cortesV.push((datosPagina.ancho_pagina_pdf / 2) + (cortesV.length * 20));
    inicializarLimitesH();
    cargarPagina(paginaActual);
}

function quitarCorteV() {
    if (cortesV.length > 0) {
        cortesV.pop();
        inicializarLimitesH();
        cargarPagina(paginaActual);
    }
}

function limpiarCortesV() {
    cortesV = [];
    inicializarLimitesH();
    cargarPagina(paginaActual);
}

function inicializarLimitesH() {
    limitesH = {};
    if (!datosPagina) return;
    let numCols = cortesV.length > 0 ? cortesV.length + 1 : 1;
    for (let i = 0; i < numCols; i++) {
        limitesH[i.toString()] = [0, datosPagina.alto_pagina_pdf];
    }
}

// ==========================================
// 4. FUNCIONES DE ESCÁNER LÁSER HUD Y MODALES OCR
// ==========================================

function mostrarHUDScannerOCR(texto = "🔍 Reconociendo texto con RapidOCR...") {
    const overlay = document.getElementById('ocr-scanner-overlay');
    const txt = document.getElementById('ocr-hud-texto');
    if (txt) txt.innerText = texto;
    if (overlay) {
        overlay.style.display = 'block';
        overlay.style.opacity = '1';
    }
}

function ocultarHUDScannerOCR() {
    const overlay = document.getElementById('ocr-scanner-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            if (overlay && overlay.style.opacity === '0') {
                overlay.style.display = 'none';
            }
        }, 300);
    }
}

let ocrBatchEnCurso = false;

function abrirModalOCRDecision() {
    const modal = document.getElementById('modal-ocr-decision');
    if (modal) modal.style.display = 'flex';
}

function cerrarModalOCRDecision() {
    const modal = document.getElementById('modal-ocr-decision');
    if (modal) modal.style.display = 'none';
}

async function seleccionarOpcionOCR(modo) {
    const chkRecordar = document.getElementById('chk-ocr-recordar-decision');
    if (chkRecordar && chkRecordar.checked) {
        localStorage.setItem('lira_preferencia_ocr', modo);
    }
    cerrarModalOCRDecision();

    if (modo === 'batch') {
        iniciarBatchOCR();
    } else {
        cargarPagina(paginaActual);
    }
}

async function iniciarBatchOCR() {
    ocrBatchEnCurso = true;
    const modalProgreso = document.getElementById('modal-ocr-progreso');
    if (modalProgreso) modalProgreso.style.display = 'flex';
    
    const fill = document.getElementById('barra-ocr-progreso-fill');
    if (fill) fill.style.width = '0%';
    const cont = document.getElementById('ocr-progreso-contador');
    if (cont) cont.innerText = `Página 1 de ${totalPaginas || 1}`;
    const pct = document.getElementById('ocr-progreso-porcentaje');
    if (pct) pct.innerText = '0%';
    const estado = document.getElementById('ocr-progreso-texto-estado');
    if (estado) estado.innerText = 'Iniciando RapidOCR para todas las páginas...';

    try {
        await eel.ejecutar_batch_ocr(0)();
    } catch (e) {
        console.error("Error iniciando Batch OCR:", e);
        cerrarModalOCRProgreso();
        cargarPagina(paginaActual);
    }
}

function cancelarBatchOCRYLeer() {
    if (typeof eel !== 'undefined' && typeof eel.cancelar_batch_ocr === 'function') {
        eel.cancelar_batch_ocr()();
    }
    cerrarModalOCRProgreso();
    cargarPagina(paginaActual);
}

function cerrarModalOCRProgreso() {
    ocrBatchEnCurso = false;
    const modalProgreso = document.getElementById('modal-ocr-progreso');
    if (modalProgreso) modalProgreso.style.display = 'none';
}

// Callbacks expuestos a Python Eel para progreso de OCR por lotes
if (typeof eel !== 'undefined') {
    eel.expose(actualizar_progreso_ocr_batch);
    function actualizar_progreso_ocr_batch(actual, total, porcentaje) {
        const fill = document.getElementById('barra-ocr-progreso-fill');
        const cont = document.getElementById('ocr-progreso-contador');
        const pct = document.getElementById('ocr-progreso-porcentaje');
        const estado = document.getElementById('ocr-progreso-texto-estado');
        if (fill) fill.style.width = `${porcentaje}%`;
        if (cont) cont.innerText = `Página ${actual} de ${total}`;
        if (pct) pct.innerText = `${porcentaje}%`;
        if (estado) estado.innerText = `Reconociendo página ${actual} de ${total}...`;
    }

    eel.expose(finalizar_batch_ocr);
    function finalizar_batch_ocr(completado) {
        cerrarModalOCRProgreso();
        if (typeof mostrarToastLira === 'function') {
            mostrarToastLira(completado ? "✅ Reconocimiento OCR de todo el documento completado" : "⏹️ Procesamiento OCR pausado.");
        }
        cargarPagina(paginaActual);
    }
}

// ==========================================
// CONTROL DEL MENÚ DESPLEGABLE DE OCR
// ==========================================
function toggleMenuOCR(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('dropdown-ocr-menu');
    const flecha = document.getElementById('flecha-dropdown-ocr');
    if (!menu) return;
    
    const estaActivo = menu.classList.contains('activo');
    if (estaActivo) {
        menu.classList.remove('activo');
        if (flecha) flecha.style.transform = 'rotate(0deg)';
    } else {
        menu.classList.add('activo');
        if (flecha) flecha.style.transform = 'rotate(180deg)';
    }
}

function cerrarMenuOCR() {
    const menu = document.getElementById('dropdown-ocr-menu');
    const flecha = document.getElementById('flecha-dropdown-ocr');
    if (menu) menu.classList.remove('activo');
    if (flecha) flecha.style.transform = 'rotate(0deg)';
}

// Cerrar el menú al hacer clic en cualquier otra parte del documento
document.addEventListener('click', (e) => {
    const container = document.getElementById('dropdown-ocr-container');
    if (container && !container.contains(e.target)) {
        cerrarMenuOCR();
    }
});

function ejecutarOpcionOCRMenu(tipo) {
    cerrarMenuOCR();
    if (tipo === 'forzar') {
        forzarOCRPaginaActual();
    } else if (tipo === 'todo') {
        if (!rutaPDFActual) {
            if (typeof mostrarToastLira === 'function') {
                mostrarToastLira("⚠️ No hay ningún documento abierto");
            }
            return;
        }
        iniciarBatchOCR();
    }
}

async function forzarOCRPaginaActual() {
    if (!rutaPDFActual) {
        if (typeof mostrarToastLira === 'function') {
            mostrarToastLira("⚠️ No hay ningún documento abierto");
        }
        return;
    }

    const btnOcr = document.getElementById('btn-menu-ocr') || document.getElementById('btn-forzar-ocr');
    if (btnOcr) {
        btnOcr.disabled = true;
        btnOcr.style.opacity = '0.5';
    }

    mostrarHUDScannerOCR("🔍 Forzando re-análisis con RapidOCR...");

    if (typeof mostrarToastLira === 'function') {
        mostrarToastLira("🔍 Ejecutando RapidOCR en página actual...");
    }

    try {
        let dictActivo = typeof obtenerDiccionarioConsolidado === 'function' ? obtenerDiccionarioConsolidado() : null;
        let res = await eel.forzar_ocr_pagina_actual(paginaActual, cortesV.length > 0 ? cortesV : null, limitesH, dictActivo)();
        if (res && res.exito && res.data) {
            datosPagina = res.data;
            totalPaginas = res.data.total_paginas;
            indiceOracion = -1;
            
            canvas.width = res.data.ancho_img;
            canvas.height = res.data.alto_img;
            if (typeof dibujar === 'function') {
                dibujar();
            }
            if (typeof mostrarToastLira === 'function') {
                const totalPalabras = res.data.palabras?.length || 0;
                mostrarToastLira(`✅ OCR completado: ${totalPalabras} palabras reconocidas`);
            }
        } else {
            if (typeof mostrarToastLira === 'function') {
                mostrarToastLira("❌ " + (res?.error || "No se pudo procesar OCR"));
            }
        }
    } catch (e) {
        console.error("Error forzando OCR:", e);
        if (typeof mostrarToastLira === 'function') {
            mostrarToastLira("❌ Error en OCR: " + e.message);
        }
    } finally {
        ocultarHUDScannerOCR();
        if (btnOcr) {
            btnOcr.disabled = false;
            btnOcr.style.opacity = '1';
        }
    }
}
