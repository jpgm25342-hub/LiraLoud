// ==========================================
// 4. FUNCIONES DE ESCÁNER LÁSER HUD Y MODALES OCR
// ==========================================

let timerMensajesOCR = null;
let indiceMensajeOCR = 0;

function obtenerMensajesRotativosOCR() {
    return [
        "Analizando imagen de la página...",
        "Reconociendo caracteres con RapidOCR...",
        "Descifrando maquetación y tipografía...",
        "Detectando orientación y párrafos...",
        "¡Ya casi está listo!...",
        "Alineando cajas de texto y palabras...",
        "Preparando el documento para lectura fluida..."
    ];
}

function mostrarHUDScannerOCR(textoInicial = null, numPagina = null) {
    const overlay = document.getElementById('ocr-scanner-overlay');
    const txt = document.getElementById('ocr-hud-texto');
    const titulo = document.getElementById('ocr-hud-titulo');
    
    if (timerMensajesOCR) {
        clearInterval(timerMensajesOCR);
        timerMensajesOCR = null;
    }

    const pagNum = (numPagina !== null && numPagina !== undefined) ? (numPagina + 1) : (paginaActual + 1);
    if (titulo) {
        titulo.innerText = `Procesando Página ${pagNum}`;
    }

    const mensajes = obtenerMensajesRotativosOCR();
    indiceMensajeOCR = 0;

    if (txt) {
        txt.innerText = textoInicial || mensajes[0];
        txt.style.opacity = '1';
    }
    
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.opacity = '1';
    }

    // Rotar mensajes de forma suave y pausada cada 3 segundos
    timerMensajesOCR = setInterval(() => {
        indiceMensajeOCR = (indiceMensajeOCR + 1) % mensajes.length;
        if (txt) {
            txt.style.opacity = '0';
            setTimeout(() => {
                if (txt && timerMensajesOCR) {
                    txt.innerText = mensajes[indiceMensajeOCR];
                    txt.style.opacity = '1';
                }
            }, 250);
        }
    }, 3000);
}

function ocultarHUDScannerOCR() {
    if (timerMensajesOCR) {
        clearInterval(timerMensajesOCR);
        timerMensajesOCR = null;
    }
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

window.autoOCRActivo = true;
window.autoLayoutActivo = true;

function toggleAutoLayoutClic() {
    toggleAutoLayout(!window.autoLayoutActivo);
}

function toggleAutoLayout(activo) {
    if (activo === undefined) activo = !window.autoLayoutActivo;
    window.autoLayoutActivo = !!activo;

    const btnMain = document.getElementById('btn-auto-layout');
    const chk = document.getElementById('chk-auto-layout');

    if (chk && chk.checked !== window.autoLayoutActivo) {
        chk.checked = window.autoLayoutActivo;
    }

    if (btnMain) {
        if (window.autoLayoutActivo) {
            btnMain.classList.add('tool-active-auto-layout');
            btnMain.title = "Auto-Layout IA: ACTIVO al navegar (clic para desactivar o ejecutar)";
        } else {
            btnMain.classList.remove('tool-active-auto-layout');
            btnMain.title = "Auto-Layout IA: Desactivado (clic para auto-detectar o activar)";
        }
    }

    if (typeof guardarTodosAjustes === 'function') {
        guardarTodosAjustes();
    }
}
window.toggleAutoLayout = toggleAutoLayout;
window.toggleAutoLayoutClic = toggleAutoLayoutClic;

function toggleAutoOCRClic() {
    toggleAutoOCR(!window.autoOCRActivo);
}

function toggleAutoOCR(activo) {
    if (activo === undefined) activo = !window.autoOCRActivo;
    window.autoOCRActivo = !!activo;
    
    // Sincronizar estilo subrayado activo en ambos menús (normal y zen)
    const btnMain = document.getElementById('btn-toggle-auto-ocr');
    const btnZen = document.getElementById('zen-btn-toggle-auto-ocr');
    const chk = document.getElementById('chk-auto-ocr');
    
    if (chk && chk.checked !== window.autoOCRActivo) {
        chk.checked = window.autoOCRActivo;
    }
    
    if (btnMain) {
        if (window.autoOCRActivo) btnMain.classList.add('tool-active-underline');
        else btnMain.classList.remove('tool-active-underline');
    }
    if (btnZen) {
        if (window.autoOCRActivo) btnZen.classList.add('tool-active-underline');
        else btnZen.classList.remove('tool-active-underline');
    }
    
    if (typeof guardarAjustes === 'function') {
        guardarAjustes(false);
    }
    // Si el usuario activa Auto-OCR en una página que no tiene palabras digitalizadas, procesar de inmediato
    if (window.autoOCRActivo && rutaPDFActual && datosPagina && (!datosPagina.palabras || datosPagina.palabras.length === 0)) {
        cargarPagina(paginaActual);
    }
}

function ignorarYEntrarAlPDF() {
    const chkRecordar = document.getElementById('chk-ocr-recordar-decision');
    if (chkRecordar && chkRecordar.checked) {
        localStorage.setItem('lira_preferencia_ocr', 'ignorar');
    }
    toggleAutoOCR(false);
    if (typeof guardarAjustes === 'function') {
        guardarAjustes(false);
    }
    cerrarModalOCRDecision();
    cargarPagina(paginaActual);
}

// --- MODAL DE RANGO OCR Y VISTAS PREVIAS DUALES ---
function abrirModalRangoOCR() {
    cerrarModalOCRDecision();
    const modalRango = document.getElementById('modal-ocr-rango');
    if (modalRango) modalRango.style.display = 'flex';

    const inpDesde = document.getElementById('ocr-rango-input-desde');
    const inpHasta = document.getElementById('ocr-rango-input-hasta');

    const maxPags = totalPaginas || 1;
    if (inpDesde) {
        inpDesde.min = 1;
        inpDesde.max = maxPags;
        inpDesde.value = 1;
    }
    if (inpHasta) {
        inpHasta.min = 1;
        inpHasta.max = maxPags;
        inpHasta.value = maxPags;
    }

    actualizarPreviewRangoOCR('desde');
    actualizarPreviewRangoOCR('hasta');
    actualizarResumenRangoOCR();
}

function volverADecisionOCR() {
    const modalRango = document.getElementById('modal-ocr-rango');
    if (modalRango) modalRango.style.display = 'none';
    abrirModalOCRDecision();
}

function cerrarModalRangoOCR() {
    const modalRango = document.getElementById('modal-ocr-rango');
    if (modalRango) modalRango.style.display = 'none';
}

function cambiarPasoRangoOCR(tipo, delta) {
    const input = document.getElementById(`ocr-rango-input-${tipo}`);
    if (!input) return;
    const maxPags = totalPaginas || 1;
    let val = (parseInt(input.value) || 1) + delta;
    val = Math.max(1, Math.min(maxPags, val));
    input.value = val;
    actualizarPreviewRangoOCR(tipo);
    actualizarResumenRangoOCR();
}

let timerDebouncePreview = { desde: null, hasta: null };

async function actualizarPreviewRangoOCR(tipo) {
    const input = document.getElementById(`ocr-rango-input-${tipo}`);
    const img = document.getElementById(`ocr-rango-img-${tipo}`);
    const tag = document.getElementById(`ocr-rango-tag-${tipo}`);
    if (!input || !img) return;

    const maxPags = totalPaginas || 1;
    let num = parseInt(input.value) || 1;
    num = Math.max(1, Math.min(maxPags, num));
    input.value = num;

    if (tag) tag.innerText = `Pág. ${num}`;
    actualizarResumenRangoOCR();

    if (timerDebouncePreview[tipo]) clearTimeout(timerDebouncePreview[tipo]);

    timerDebouncePreview[tipo] = setTimeout(async () => {
        try {
            img.style.opacity = '0.35';
            if (typeof eel !== 'undefined' && typeof eel.obtener_miniatura_pagina === 'function') {
                const b64 = await eel.obtener_miniatura_pagina(num - 1)();
                if (b64) {
                    img.src = b64;
                    img.style.opacity = '1';
                }
            }
        } catch (e) {
            console.warn(`[OCR] Error cargando miniatura rango ${tipo}:`, e);
        } finally {
            img.style.opacity = '1';
        }
    }, 120);
}

function actualizarResumenRangoOCR() {
    const inpDesde = document.getElementById('ocr-rango-input-desde');
    const inpHasta = document.getElementById('ocr-rango-input-hasta');
    const resumen = document.getElementById('ocr-rango-resumen');
    if (!inpDesde || !inpHasta || !resumen) return;

    const maxPags = totalPaginas || 1;
    const d = Math.max(1, Math.min(maxPags, parseInt(inpDesde.value) || 1));
    const h = Math.max(d, Math.min(maxPags, parseInt(inpHasta.value) || d));
    const total = Math.max(1, (h - d + 1));
    resumen.innerText = `Total a procesar: ${total} página${total > 1 ? 's' : ''} (Págs. ${d} a ${h})`;
}

async function iniciarRangoOCRConfirmado() {
    const inpDesde = document.getElementById('ocr-rango-input-desde');
    const inpHasta = document.getElementById('ocr-rango-input-hasta');
    const d = Math.max(1, parseInt(inpDesde?.value) || 1);
    const h = Math.max(d, parseInt(inpHasta?.value) || d);

    cerrarModalRangoOCR();
    iniciarBatchOCR(d - 1, h);
}

async function seleccionarOpcionOCR(modo) {
    const chkRecordar = document.getElementById('chk-ocr-recordar-decision');
    if (chkRecordar && chkRecordar.checked) {
        localStorage.setItem('lira_preferencia_ocr', modo);
    }
    toggleAutoOCR(true);
    if (typeof guardarAjustes === 'function') {
        guardarAjustes(false);
    }
    cerrarModalOCRDecision();

    if (modo === 'batch') {
        iniciarBatchOCR(0, (totalPaginas && totalPaginas > 0) ? totalPaginas : null);
    } else {
        cargarPagina(paginaActual);
    }
}

async function iniciarBatchOCR(inicio = 0, fin = null) {
    ocrBatchEnCurso = true;
    const modalProgreso = document.getElementById('modal-ocr-progreso');
    if (modalProgreso) modalProgreso.style.display = 'flex';
    
    let finVal = (fin && fin > 0) ? fin : (totalPaginas && totalPaginas > 0 ? totalPaginas : null);
    const maxPags = finVal || (totalPaginas && totalPaginas > 0 ? totalPaginas : '...');
    const totalRango = (typeof maxPags === 'number') ? (maxPags - inicio) : '...';

    const fill = document.getElementById('barra-ocr-progreso-fill');
    if (fill) fill.style.width = '0%';
    const cont = document.getElementById('ocr-progreso-contador');
    if (cont) cont.innerText = `Página ${inicio + 1} de ${maxPags}`;
    const pct = document.getElementById('ocr-progreso-porcentaje');
    if (pct) pct.innerText = '0%';
    const estado = document.getElementById('ocr-progreso-texto-estado');
    if (estado) estado.innerText = `Iniciando RapidOCR...`;
    const tiempoEl = document.getElementById('ocr-progreso-tiempo-estimado');
    if (tiempoEl) {
        const iconoReloj = (typeof obtenerIconoDialogoSVG === 'function')
            ? obtenerIconoDialogoSVG('reloj', 'ocr-eta-svg')
            : '';
        tiempoEl.innerHTML = `${iconoReloj}<span id="ocr-progreso-tiempo-texto">Calculando tiempo estimado...</span>`;
    }

    try {
        await eel.ejecutar_batch_ocr(inicio, finVal)();
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

// Callbacks expuestos a Python Eel para notificaciones precisas de escaneo y progreso de OCR
if (typeof eel !== 'undefined') {
    eel.expose(notificar_inicio_ocr_pagina);
    function notificar_inicio_ocr_pagina(num) {
        mostrarHUDScannerOCR(null, num);
    }

    eel.expose(notificar_fin_ocr_pagina);
    function notificar_fin_ocr_pagina(num) {
        ocultarHUDScannerOCR();
    }

    eel.expose(actualizar_progreso_ocr_batch);
    function actualizar_progreso_ocr_batch(actual, total, porcentaje, tiempoEstimado = "") {
        const fill = document.getElementById('barra-ocr-progreso-fill');
        const cont = document.getElementById('ocr-progreso-contador');
        const pct = document.getElementById('ocr-progreso-porcentaje');
        const estado = document.getElementById('ocr-progreso-texto-estado');
        const tiempoEl = document.getElementById('ocr-progreso-tiempo-estimado');
        if (fill) fill.style.width = `${porcentaje}%`;
        if (cont) cont.innerText = `Página ${actual} de ${total}`;
        if (pct) pct.innerText = `${porcentaje}%`;
        if (estado) estado.innerText = `Reconociendo página ${actual} de ${total}...`;
        if (tiempoEl && tiempoEstimado) {
            const iconoReloj = (typeof obtenerIconoDialogoSVG === 'function')
                ? obtenerIconoDialogoSVG('reloj', 'ocr-eta-svg')
                : '';
            const esc = (typeof window.escapeHtml === 'function')
                ? window.escapeHtml
                : (s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
            tiempoEl.innerHTML = `${iconoReloj}<span id="ocr-progreso-tiempo-texto">Tiempo estimado: ${esc(tiempoEstimado)}</span>`;
        }
    }

    eel.expose(finalizar_batch_ocr);
    function finalizar_batch_ocr(completado) {
        cerrarModalOCRProgreso();
        if (typeof mostrarToastLira === 'function') {
            if (completado) {
                mostrarToastLira("Reconocimiento OCR de todo el documento completado", 'exito');
            } else {
                mostrarToastLira("Procesamiento OCR pausado.", 'detener');
            }
        }
        cargarPagina(paginaActual);
    }

    eel.expose(abrir_desde_extension);
    function abrir_desde_extension(ruta) {
        if (!ruta) return false;
        console.log("[EXTENSIÓN] Solicitud recibida para cargar:", ruta);
        setTimeout(async () => {
            try {
                if (typeof detenerLectura === 'function') detenerLectura();
                if (typeof rutaPDFActual !== 'undefined' && rutaPDFActual && typeof guardarEstadoPaginaActual === 'function') {
                    guardarEstadoPaginaActual();
                }
                if (typeof _destruirBienvenida === 'function') _destruirBienvenida();
                if (typeof cerrarLanzador === 'function') cerrarLanzador();
                await abrirDocumentoDesdeRuta(ruta, true);
                if (typeof mostrarToastLira === 'function') {
                    mostrarToastLira("Documento cargado desde el navegador", 'archivo');
                }
            } catch (e) {
                console.error("Error al abrir documento desde extensión:", e);
            }
        }, 20);
        return true;
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
    } else if (tipo === 'rango') {
        if (!rutaPDFActual) {
            if (typeof mostrarToastLira === 'function') {
                mostrarToastLira("No hay ningún documento abierto", 'advertencia');
            }
            return;
        }
        abrirModalRangoOCR();
    } else if (tipo === 'todo') {
        if (!rutaPDFActual) {
            if (typeof mostrarToastLira === 'function') {
                mostrarToastLira("No hay ningún documento abierto", 'advertencia');
            }
            return;
        }
        iniciarBatchOCR(0, totalPaginas);
    }
}

async function forzarOCRPaginaActual() {
    if (!rutaPDFActual) {
        if (typeof mostrarToastLira === 'function') {
            mostrarToastLira("No hay ningún documento abierto", 'advertencia');
        }
        return;
    }

    const btnOcr = document.getElementById('btn-menu-ocr') || document.getElementById('btn-forzar-ocr');
    if (btnOcr) {
        btnOcr.disabled = true;
        btnOcr.style.opacity = '0.5';
    }

    mostrarHUDScannerOCR("Forzando re-análisis con RapidOCR...", paginaActual);

    if (typeof mostrarToastLira === 'function') {
        mostrarToastLira("Ejecutando RapidOCR en página actual...", 'buscar');
    }

    try {
        let dictActivo = typeof obtenerDiccionarioConsolidado === 'function' ? obtenerDiccionarioConsolidado() : null;
        let recorteActual = parseInt(document.getElementById('rng-recorte-pdf')?.value || 0);
        let res = await eel.forzar_ocr_pagina_actual(paginaActual, cortesV.length > 0 ? cortesV : null, limitesH, dictActivo, zonasExcluidas, recorteActual)();
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
                mostrarToastLira(`OCR completado: ${totalPalabras} palabras reconocidas`, 'exito');
            }
        } else {
            if (typeof mostrarToastLira === 'function') {
                mostrarToastLira(res?.error || "No se pudo procesar OCR", 'error');
            }
        }
    } catch (e) {
        console.error("Error forzando OCR:", e);
        if (typeof mostrarToastLira === 'function') {
            mostrarToastLira("Error en OCR: " + e.message, 'error');
        }
    } finally {
        ocultarHUDScannerOCR();
        if (btnOcr) {
            btnOcr.disabled = false;
            btnOcr.style.opacity = '1';
        }
    }
}

document.addEventListener('keydown', function (e) {
    const dlgOverlay = document.getElementById('lira-dialog-overlay');
    if (dlgOverlay && dlgOverlay.classList.contains('activo')) return;

    const modalRango = document.getElementById('modal-ocr-rango');
    if (modalRango && modalRango.style.display === 'flex') {
        if (e.key === 'Escape') {
            e.preventDefault();
            cerrarModalRangoOCR();
            return;
        }
        if (e.key === 'Enter') {
            const tag = document.activeElement?.tagName;
            if (tag !== 'BUTTON') {
                e.preventDefault();
                const btnConfirm = document.getElementById('btn-ocr-rango-confirmar');
                if (btnConfirm) btnConfirm.click();
                else iniciarRangoOCRConfirmado();
                return;
            }
        }
    }

    const modalDecision = document.getElementById('modal-ocr-decision');
    if (modalDecision && modalDecision.style.display === 'flex' && e.key === 'Escape') {
        e.preventDefault();
        cerrarModalOCRDecision();
        return;
    }

    const modalProgreso = document.getElementById('modal-ocr-progreso');
    if (modalProgreso && modalProgreso.style.display === 'flex' && e.key === 'Escape') {
        e.preventDefault();
        cancelarBatchOCRYLeer();
    }
});
