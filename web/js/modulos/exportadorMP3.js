function cargarVocesSistemaMp3() {
    let selIdioma = document.getElementById('modal-filtro-idioma');
    if (!selIdioma) return;

    let valorPrevio = selIdioma.value;
    selIdioma.innerHTML = "";

    // --- LISTA MAESTRA DEFINITIVA (Autónimos desde estado.js) ---
    if (typeof window.poblarSelectIdiomas === 'function') {
        window.poblarSelectIdiomas(selIdioma);
    }

    if (valorPrevio) selIdioma.value = valorPrevio;
    else selIdioma.value = 'es';

    filtrarVocesPorIdiomaMp3();
}

function filtrarVocesPorIdiomaMp3() {
    let elFiltro = document.getElementById('modal-filtro-idioma');
    let langFilter = elFiltro ? elFiltro.value : 'es';

    let selVoz = document.getElementById('modal-voz');
    if (!selVoz) return;
    selVoz.innerHTML = "";

    let safeVocesPython = (typeof vocesPython !== 'undefined' && vocesPython) ? vocesPython : [];
    let safeVocesSistema = (typeof vocesSistema !== 'undefined' && vocesSistema) ? vocesSistema : [];

    let todasLasVoces = [];

    // 1. Procesar Piper
    safeVocesPython.forEach(v => {
        if (v.tipo === 'nube' || (!v.id.startsWith('Local-') && !v.id.endsWith('.onnx'))) {
            if (window.modoPrivacidadEstricta) return;
            const idLower = v.id.toLowerCase();
            if (!langFilter || idLower.includes('-' + langFilter + '-') || idLower.startsWith(langFilter.toLowerCase())) {
                todasLasVoces.push({ id: v.id, nombre: v.nombre, origen: 'nube' });
            }
            return;
        }
        let idFinal = v.id.startsWith("Local-") ? v.id : "Local-" + v.id;
        let nombreArchivo = idFinal.replace("Local-", "");

        if (!langFilter || nombreArchivo.startsWith(langFilter)) {
            todasLasVoces.push({ id: idFinal, nombre: v.nombre, origen: 'piper' });
        }
    });

    // 2. Procesar Navegador
    safeVocesSistema.forEach(v => {
        if (window.modoPrivacidadEstricta) {
            const nombreLower = (v.name || '').toLowerCase();
            if (nombreLower.includes('online') || nombreLower.includes('natural')) return;
        }
        if (!langFilter || v.lang.startsWith(langFilter)) {
            todasLasVoces.push({ id: v.name, nombre: v.name, origen: 'navegador' });
        }
    });

    // 3. Renderizado exclusivo para el select del MP3
    todasLasVoces.forEach(voz => {
        let opt = document.createElement('option');
        opt.value = voz.id;
        opt.innerText = voz.nombre;
        opt.setAttribute('data-origen', voz.origen);
        if (voz.origen === 'piper') {
            opt.style.color = "#d35400";
            opt.style.fontWeight = "bold";
        }
        selVoz.appendChild(opt);
    });

    if (selVoz.options.length > 0) {
        selVoz.selectedIndex = 0;
        const inpVozMp3 = document.getElementById('busqueda-voz-mp3');
        if (inpVozMp3) inpVozMp3.value = selVoz.options[0].text;
    }
}

// --- CONTROLADORES INDEPENDIENTES TIPO WINDOWS SEARCH STYLE PARA MP3 ---
function abrirComboMp3(tipo) {
    const el = document.getElementById(tipo === 'idioma' ? 'modal-filtro-idioma' : 'modal-voz');
    if (el) {
        Array.from(el.options).forEach(opt => opt.style.display = "block");
        el.style.display = 'block';
    }
}

function filtrarComboMp3(tipo) {
    const query = document.getElementById(`busqueda-${tipo}-mp3`).value.toLowerCase();
    const sel = document.getElementById(tipo === 'idioma' ? 'modal-filtro-idioma' : 'modal-voz');
    if (!sel) return;

    sel.style.display = 'block';

    Array.from(sel.options).forEach(opt => {
        opt.style.display = opt.text.toLowerCase().includes(query) ? "block" : "none";
    });
}

function seleccionarComboMp3(tipo) {
    const sel = document.getElementById(tipo === 'idioma' ? 'modal-filtro-idioma' : 'modal-voz');
    const inp = document.getElementById(`busqueda-${tipo}-mp3`);

    if (sel && sel.selectedIndex !== -1) {
        const valorNuevo = sel.options[sel.selectedIndex].text;
        inp.value = valorNuevo;
        sel.style.display = 'none';

        if (tipo === 'idioma') {
            filtrarVocesPorIdiomaMp3();
            document.getElementById('busqueda-voz-mp3').value = ""; // Obliga a elegir nueva voz
        }
    }
}

function actualizarUIControlesCorteMp3() {
    const modo = document.getElementById('mp3-corte-modo')?.value || 'unico';
    const pagWrap = document.getElementById('mp3-corte-pag-wrap');
    const minWrap = document.getElementById('mp3-corte-min-wrap');
    if (pagWrap) pagWrap.style.display = modo === 'pagina' ? 'inline-flex' : 'none';
    if (minWrap) minWrap.style.display = modo === 'duracion' ? 'inline-flex' : 'none';
}

function actualizarUIControlesTraduccionMp3() {
    const activo = document.getElementById('chk-traduccion-export')?.checked ?? false;
    const wrap = document.getElementById('mp3-trad-wrap');
    if (wrap) wrap.style.display = activo ? 'flex' : 'none';
}

function inicializarOpcionesTraduccionMp3() {
    const chkExport = document.getElementById('chk-traduccion-export');
    const chkGlobal = document.getElementById('chk-traduccion-activa');
    if (chkExport && chkGlobal) {
        chkExport.checked = !!chkGlobal.checked;
    }

    const selDest = document.getElementById('mp3-trad-destino');
    const selGlobalDest = document.getElementById('sel-traduccion-destino');
    if (selDest && selDest.options.length === 0) {
        if (typeof window.poblarSelectIdiomas === 'function') {
            window.poblarSelectIdiomas(selDest);
        } else if (selGlobalDest) {
            selDest.innerHTML = selGlobalDest.innerHTML;
        }
    }
    if (selDest && selGlobalDest && selGlobalDest.value) {
        selDest.value = selGlobalDest.value;
    }

    const selModo = document.getElementById('mp3-trad-modo');
    const selGlobalModo = document.getElementById('sel-traduccion-modo');
    if (selModo && selGlobalModo) {
        selModo.value = selGlobalModo.value === 'aprendizaje' ? 'aprendizaje' : 'solo_traduccion';
    }

    actualizarUIControlesTraduccionMp3();
}

function cambiarTabModalDescarga(modo = 'mp3') {
    const tabMp3 = document.getElementById('tab-btn-export-mp3');
    const tabPdf = document.getElementById('tab-btn-export-pdf');
    const contentMp3 = document.getElementById('tab-content-export-mp3');
    const contentPdf = document.getElementById('tab-content-export-pdf');

    const esPdf = (modo === 'pdf');
    if (tabMp3) tabMp3.classList.toggle('active', !esPdf);
    if (tabPdf) tabPdf.classList.toggle('active', esPdf);
    if (contentMp3) contentMp3.style.display = esPdf ? 'none' : 'block';
    if (contentPdf) contentPdf.style.display = esPdf ? 'block' : 'none';

    if (esPdf) {
        const inpIni = document.getElementById('pdf-export-pag-ini');
        const inpFin = document.getElementById('pdf-export-pag-fin');
        const maxP = (typeof totalPaginas === 'number' && totalPaginas > 0) ? totalPaginas : 1;
        if (inpIni && (!inpIni.value || parseInt(inpIni.value, 10) < 1)) inpIni.value = 1;
        if (inpFin && (!inpFin.value || parseInt(inpFin.value, 10) < 1 || parseInt(inpFin.value, 10) > maxP)) inpFin.value = maxP;
        actualizarUIControlesCortePdfExport();
        previsualizarPaginaPdfExport('ini');
        previsualizarPaginaPdfExport('fin');
    }
}

function actualizarUIControlesCortePdfExport() {
    const modo = document.getElementById('pdf-corte-modo')?.value || 'unico';
    const pagWrap = document.getElementById('pdf-corte-pag-wrap');
    if (pagWrap) pagWrap.style.display = modo === 'pagina' ? 'inline-flex' : 'none';
}

function aplicarTodoRangoPdfExport() {
    const maxP = (typeof totalPaginas === 'number' && totalPaginas > 0) ? totalPaginas : 1;
    const inpIni = document.getElementById('pdf-export-pag-ini');
    const inpFin = document.getElementById('pdf-export-pag-fin');
    if (inpIni) inpIni.value = 1;
    if (inpFin) inpFin.value = maxP;
    previsualizarPaginaPdfExport('ini');
    previsualizarPaginaPdfExport('fin');
}

async function previsualizarPaginaPdfExport(tipo) {
    const suf = (tipo === 'fin') ? 'fin' : 'ini';
    const input = document.getElementById(`pdf-export-pag-${suf}`);
    if (!input) return;

    const num = parseInt(input.value, 10) - 1;
    if (isNaN(num) || num < 0 || (typeof totalPaginas === 'number' && totalPaginas > 0 && num >= totalPaginas)) return;

    try {
        const data = (typeof eel !== 'undefined' && typeof eel.obtener_vista_rapida_pagina === 'function')
            ? await eel.obtener_vista_rapida_pagina(num)()
            : await eel.obtener_pagina_data(num, null, null, null)();

        if (data && data.imagen) {
            const imgPreview = document.getElementById(`img-preview-pdf-${suf}`);
            const txtPreview = document.getElementById(`txt-preview-pdf-${suf}`);
            if (imgPreview) {
                imgPreview.src = data.imagen;
                imgPreview.style.display = 'block';
            }
            if (txtPreview) txtPreview.style.display = 'none';
        }
    } catch (e) {
        console.error("Error en vista previa PDF export:", e);
    }
}

async function iniciarExportacionPdfConfigurado() {
    const txtEstado = document.getElementById('txt-estado-export-pdf');
    const btnGuardar = document.getElementById('btn-iniciar-export-pdf');
    try {
        const ini = parseInt(document.getElementById('pdf-export-pag-ini')?.value || '1', 10);
        const fin = parseInt(document.getElementById('pdf-export-pag-fin')?.value || '1', 10);
        const maxPags = (typeof totalPaginas === 'number' && totalPaginas > 0) ? totalPaginas : fin;

        if (!ini || !fin || ini < 1 || fin < ini || fin > maxPags) {
            const msgErr = (typeof window.t === 'function')
                ? window.t('msg-pdf-rango-invalido', 'Por favor verifica el rango de páginas antes de guardar el PDF.')
                : 'Por favor verifica el rango de páginas antes de guardar el PDF.';
            await liraAlert(msgErr, 'advertencia');
            return;
        }

        const opciones = {
            pag_ini: ini,
            pag_fin: fin,
            incluir_subrayados: document.getElementById('pdf-chk-subrayados')?.checked ?? true,
            aplanar_anotaciones: document.getElementById('pdf-chk-aplanar')?.checked ?? false,
            optimizar_peso: document.getElementById('pdf-chk-optimizar')?.checked ?? true,
            corte_modo: document.getElementById('pdf-corte-modo')?.value || 'unico',
            corte_paginas: Math.max(1, parseInt(document.getElementById('pdf-corte-paginas')?.value || '1', 10) || 1)
        };

        if (btnGuardar) btnGuardar.disabled = true;
        if (txtEstado) {
            txtEstado.innerText = (typeof window.t === 'function')
                ? window.t('msg-pdf-exportando', 'Preparando documento PDF...')
                : 'Preparando documento PDF...';
            txtEstado.style.color = '#d35400';
        }

        const res = await eel.exportar_pdf_configurado(opciones)();
        if (btnGuardar) btnGuardar.disabled = false;

        if (res && res.cancelado) {
            if (txtEstado) txtEstado.innerText = '';
            return;
        }

        if (res && res.ok) {
            if (txtEstado) {
                txtEstado.innerText = res.mensaje || 'PDF guardado con éxito.';
                txtEstado.style.color = '#27ae60';
            }
            await liraAlert(res.mensaje || 'PDF guardado con éxito.', 'exito');
            cerrarModalDescarga();
        } else {
            const err = (res && res.error) || 'No se pudo guardar el PDF.';
            if (txtEstado) {
                txtEstado.innerText = err;
                txtEstado.style.color = '#e74c3c';
            }
            await liraAlert(err, 'error');
        }
    } catch (e) {
        if (btnGuardar) btnGuardar.disabled = false;
        if (txtEstado) txtEstado.innerText = '';
        await liraAlert('Error al exportar PDF: ' + e, 'error');
    }
}

function abrirModalDescarga(tabInicial = 'mp3') {
    // Lógica de exclusión mutua universal
    if (typeof cerrarOtrasFuncionesPrincipales === 'function') {
        cerrarOtrasFuncionesPrincipales('mp3');
    }

    const modal = document.getElementById('modal-descarga');
    if (modal) {
        modal.style.display = 'flex';

        const inpIni = document.getElementById('modal-pag-ini');
        const inpFin = document.getElementById('modal-pag-fin');
        const pdfIni = document.getElementById('pdf-export-pag-ini');
        const pdfFin = document.getElementById('pdf-export-pag-fin');
        const maxP = (typeof totalPaginas === 'number' && totalPaginas > 0) ? totalPaginas : 1;
        if (inpIni && (!inpIni.value || parseInt(inpIni.value, 10) < 1)) inpIni.value = 1;
        if (inpFin && (!inpFin.value || parseInt(inpFin.value, 10) < 1 || parseInt(inpFin.value, 10) > maxP)) inpFin.value = maxP;
        if (pdfIni) pdfIni.value = 1;
        if (pdfFin) pdfFin.value = maxP;

        cambiarTabModalDescarga(tabInicial === 'pdf' ? 'pdf' : 'mp3');
        actualizarUIControlesCorteMp3();
        inicializarOpcionesTraduccionMp3();
        previsualizarPagina('ini');
        previsualizarPagina('fin');

        // Blindaje contra el error de 'aviso-columnas'
        const aviso = document.getElementById('aviso-columnas');
        if (aviso) {
            aviso.style.display = (cortesV && cortesV.length > 0) ? 'block' : 'none';
        }
    } else {
        console.error("Error: No se encontró el elemento 'modal-descarga' en el HTML.");
    }
}

async function cerrarModalDescarga() {
    console.log("[EXPORTACIÓN] Cerrando modal y cancelando exportación si está activa...");

    // 1. Ocultamos el modal inmediatamente
    const modal = document.getElementById('modal-descarga');
    if (modal) {
        modal.style.display = 'none';
        modal.style.pointerEvents = 'auto';
    }
    const barra = document.getElementById('barra-contenedor');
    if (barra) barra.style.display = 'none';

    // 2. Ejecutamos la orden de cancelación en Python
    if (typeof eel !== 'undefined' && eel.cancelar_exportacion_mp3) {
        try {
            await eel.cancelar_exportacion_mp3()();
        } catch (e) {
            console.warn("Aviso al cancelar:", e);
        }
    }

    // 3. Restauramos estado de los botones
    const btnCancelar = document.getElementById('btn-cancelar-exportacion');
    const btnGenerar = document.getElementById('btn-iniciar-descarga');
    if (btnCancelar) {
        btnCancelar.style.display = 'block';
        btnCancelar.innerText = (typeof window.t === 'function') ? window.t('btn-cancelar', 'Cancelar') : "Cancelar";
    }
    if (btnGenerar) btnGenerar.style.display = 'block';
    const txtEstado = document.getElementById('txt-estado-descarga');
    if (txtEstado) txtEstado.innerText = "";
}

function actModalVel() {
    document.getElementById('modal-val-vel').innerText = document.getElementById('modal-rng-vel').value + "x";
}

async function iniciarDescargaFinal() {
    try {
        const ini = parseInt(document.getElementById('modal-pag-ini').value, 10);
        const fin = parseInt(document.getElementById('modal-pag-fin').value, 10);
        const voz = document.getElementById('modal-voz').value || document.getElementById('selector-voz-live').value;
        const vel = parseFloat(document.getElementById('modal-rng-vel').value);
        const maxPags = (typeof totalPaginas === 'number' && totalPaginas > 0) ? totalPaginas : fin;

        if (!ini || !fin || !voz || ini < 1 || fin < ini || fin > maxPags) {
            const msgConfig = (typeof window.t === 'function') ? window.t('msg-mp3-config-pags', 'Por favor configure las páginas y la voz antes de exportar.') : "Por favor configure las páginas y la voz antes de exportar.";
            await liraAlert(msgConfig, 'advertencia');
            return;
        }

        const chkTeatroExport = document.getElementById('chk-teatro-export');
        const usarTeatro = chkTeatroExport && chkTeatroExport.checked;
        const obraMP3 = window.obraActualTeatro || "General";

        const chkAbbr = document.getElementById('mp3-chk-abbr')?.checked ?? true;
        const dictActivo = chkAbbr ? (window.dbDiccionario || null) : {};
        const usarLimites = document.getElementById('mp3-chk-limits')?.checked ?? true;
        const corteModo = document.getElementById('mp3-corte-modo')?.value || 'unico';
        const corteMinutos = Math.max(1, parseInt(document.getElementById('mp3-corte-minutos')?.value || '15', 10) || 15);
        const cortePaginas = Math.max(1, parseInt(document.getElementById('mp3-corte-paginas')?.value || '1', 10) || 1);
        const empaquetarZip = document.getElementById('mp3-chk-zip')?.checked ?? true;

        if (usarTeatro && typeof window.compilarLibroTeatroPagina === 'function' && typeof datosPagina !== 'undefined' && datosPagina?.oraciones) {
            window.compilarLibroTeatroPagina(paginaActual, datosPagina.oraciones);
        }
        const libroTeatroRango = (usarTeatro && typeof window.obtenerIntervencionesLibroTeatro === 'function')
            ? window.obtenerIntervencionesLibroTeatro(ini - 1, fin - 1)
            : [];

        const tradActiva = document.getElementById('chk-traduccion-export')?.checked ?? false;
        const tradOrigen = document.getElementById('sel-traduccion-origen')?.value || 'auto';
        const tradDestino = document.getElementById('mp3-trad-destino')?.value || document.getElementById('sel-traduccion-destino')?.value || 'es';
        const tradMotor = document.getElementById('sel-traduccion-motor')?.value || 'hibrido';
        const tradModo = document.getElementById('mp3-trad-modo')?.value || 'solo_traduccion';

        const opcionesExport = {
            corte_modo: corteModo,
            corte_minutos: corteMinutos,
            corte_paginas: cortePaginas,
            empaquetar_zip: empaquetarZip,
            usar_limites: usarLimites,
            libro_teatro: libroTeatroRango,
            traduccion_activa: tradActiva,
            traduccion_origen: tradOrigen,
            traduccion_destino: tradDestino,
            traduccion_motor: tradMotor,
            traduccion_modo: tradModo
        };

        const btnCancelar = document.getElementById('btn-cancelar-exportacion');
        const btnGenerar = document.getElementById('btn-iniciar-descarga');

        if (btnGenerar) btnGenerar.style.display = 'none';
        if (btnCancelar) {
            btnCancelar.style.display = 'block';
            btnCancelar.innerText = (typeof window.t === 'function') ? window.t('btn-detener-exportacion', 'Detener exportación') : "Detener exportación";
        }

        const txtEstado = document.getElementById('txt-estado-descarga');
        if (txtEstado) {
            txtEstado.innerText = (typeof window.t === 'function') ? window.t('msg-mp3-generando', 'Generando audio de estudio...') : "Generando audio de estudio...";
            txtEstado.style.color = "#d35400";
        }
        const barra = document.getElementById('barra-contenedor');
        if (barra) barra.style.display = "block";

        // Llamada al backend
        eel.descargar_audio_dedicado(
            ini, fin, voz, vel, null, null, dictActivo, usarTeatro, obraMP3, opcionesExport
        )(function (res) {
            if (txtEstado) {
                txtEstado.innerText = res;
                txtEstado.style.color = (typeof res === 'string' && res.includes("\u274C")) ? "#e74c3c" : "#27ae60";
            }

            setTimeout(() => {
                if (typeof res === 'string' && res.trim()) {
                    liraAlert(res, res.includes('\u274C') ? 'error' : 'exito');
                }
                cerrarModalDescarga();
            }, 600);
        });

    } catch (e) {
        console.error("Error crítico en exportación:", e);
        await liraAlert("Error al iniciar exportación: " + e, 'error');
        const btnCancelar = document.getElementById('btn-cancelar-exportacion');
        const btnGenerar = document.getElementById('btn-iniciar-descarga');
        if (btnCancelar) {
            btnCancelar.style.display = 'block';
            btnCancelar.innerText = "Cancelar";
        }
        if (btnGenerar) btnGenerar.style.display = 'block';
    }
}

async function previsualizarPagina(tipo) {
    const suf = (tipo === 'fin') ? 'fin' : 'ini';
    const input = document.getElementById(`modal-pag-${suf}`);
    if (!input) return;

    const num = parseInt(input.value, 10) - 1;
    if (isNaN(num) || num < 0 || (typeof totalPaginas === 'number' && totalPaginas > 0 && num >= totalPaginas)) return;

    try {
        const data = (typeof eel !== 'undefined' && typeof eel.obtener_vista_rapida_pagina === 'function')
            ? await eel.obtener_vista_rapida_pagina(num)()
            : await eel.obtener_pagina_data(num, null, null, null)();

        if (data && data.imagen) {
            const imgPreview = document.getElementById(`img-preview-mp3-${suf}`);
            const txtPreview = document.getElementById(`txt-preview-mp3-${suf}`);
            if (imgPreview) {
                imgPreview.src = data.imagen;
                imgPreview.style.display = 'block';
            }
            if (txtPreview) txtPreview.style.display = 'none';
        }
    } catch (e) {
        console.error("Error en el Monitor Visual:", e);
    }
}
