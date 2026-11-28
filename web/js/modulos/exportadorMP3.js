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
    const elFiltro = document.getElementById('modal-filtro-idioma');
    const langFilter = elFiltro ? elFiltro.value : 'es';
    const selVoz = document.getElementById('modal-voz');
    if (!selVoz) return;

    const todasLasVoces = window.recolectarVocesDisponibles(langFilter);
    window.poblarSelectVocesSimples(selVoz, todasLasVoces, {
        piperColor: '#d35400',
        piperWeight: 'bold',
        inputBusquedaId: 'busqueda-voz-mp3',
    });
}

// --- CONTROLADORES INDEPENDIENTES TIPO WINDOWS SEARCH STYLE PARA MP3 ---
function abrirComboMp3(tipo) {
    window.abrirComboSelect(tipo === 'idioma' ? 'modal-filtro-idioma' : 'modal-voz');
}

function filtrarComboMp3(tipo) {
    window.filtrarComboSelect(tipo === 'idioma' ? 'modal-filtro-idioma' : 'modal-voz', `busqueda-${tipo}-mp3`);
}

function seleccionarComboMp3(tipo) {
    const selectId = tipo === 'idioma' ? 'modal-filtro-idioma' : 'modal-voz';
    window.seleccionarComboSelect(selectId, `busqueda-${tipo}-mp3`, () => {
        if (tipo === 'idioma') {
            filtrarVocesPorIdiomaMp3();
            const inpVoz = document.getElementById('busqueda-voz-mp3');
            if (inpVoz) inpVoz.value = "";
        }
    });
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

function _txtExport(clave, fallback) {
    return (typeof window.t === 'function') ? window.t(clave, fallback) : fallback;
}

function _obtenerMaxPaginasExport() {
    return (typeof totalPaginas === 'number' && totalPaginas > 0) ? totalPaginas : 1;
}

function _normalizarRangoPaginasInputs(iniId, finId, forzarTodo = false) {
    const inpIni = document.getElementById(iniId);
    const inpFin = document.getElementById(finId);
    const maxP = _obtenerMaxPaginasExport();
    if (inpIni && (forzarTodo || !inpIni.value || parseInt(inpIni.value, 10) < 1)) inpIni.value = 1;
    if (inpFin && (forzarTodo || !inpFin.value || parseInt(inpFin.value, 10) < 1 || parseInt(inpFin.value, 10) > maxP)) {
        inpFin.value = maxP;
    }
}

function _actualizarBotonesExportMp3(exportando) {
    const btnCancelar = document.getElementById('btn-cancelar-exportacion');
    const btnGenerar = document.getElementById('btn-iniciar-descarga');
    if (btnCancelar) {
        btnCancelar.style.display = 'block';
        btnCancelar.innerText = exportando
            ? _txtExport('btn-detener-exportacion', 'Detener exportación')
            : _txtExport('btn-cancelar', 'Cancelar');
    }
    if (btnGenerar) btnGenerar.style.display = exportando ? 'none' : 'block';
}

function _restaurarBotonesExportMp3() {
    _actualizarBotonesExportMp3(false);
}

function _activarUIProgresoExportMp3() {
    _actualizarBotonesExportMp3(true);
    const txtEstado = document.getElementById('txt-estado-descarga');
    if (txtEstado) {
        txtEstado.innerText = _txtExport('msg-mp3-generando', 'Generando audio de estudio...');
        txtEstado.style.color = '#d35400';
    }
    const barra = document.getElementById('barra-contenedor');
    if (barra) barra.style.display = 'block';
    return txtEstado;
}

function _leerValExport(id, def) {
    const val = document.getElementById(id)?.value;
    return (val !== undefined && val !== null && val !== '') ? val : def;
}

function _leerChkExport(id, def) {
    const el = document.getElementById(id);
    return el ? Boolean(el.checked) : def;
}

function _esRangoPaginasValidoExport(ini, fin) {
    const maxPags = (typeof totalPaginas === 'number' && totalPaginas > 0) ? totalPaginas : fin;
    return Boolean(ini && fin && ini >= 1 && fin >= ini && fin <= maxPags);
}

async function _obtenerImagenPaginaPreview(num) {
    if (typeof eel !== 'undefined' && typeof eel.obtener_vista_rapida_pagina === 'function') {
        return await eel.obtener_vista_rapida_pagina(num)();
    }
    return await eel.obtener_pagina_data(num, null, null, null)();
}

async function _previsualizarPaginaModal(tipo, inputPrefix, imgPrefix, txtPrefix, logErr) {
    const suf = (tipo === 'fin') ? 'fin' : 'ini';
    const input = document.getElementById(`${inputPrefix}-${suf}`);
    if (!input) return;

    const num = parseInt(input.value, 10) - 1;
    const maxP = (typeof totalPaginas === 'number' && totalPaginas > 0) ? totalPaginas : Infinity;
    if (isNaN(num) || num < 0 || num >= maxP) return;

    try {
        const data = await _obtenerImagenPaginaPreview(num);
        if (!data?.imagen) return;
        const imgPreview = document.getElementById(`${imgPrefix}-${suf}`);
        const txtPreview = document.getElementById(`${txtPrefix}-${suf}`);
        if (imgPreview) { imgPreview.src = data.imagen; imgPreview.style.display = 'block'; }
        if (txtPreview) txtPreview.style.display = 'none';
    } catch (e) {
        console.error(logErr, e);
    }
}

function cambiarTabModalDescarga(modo = 'mp3') {
    const esPdf = (modo === 'pdf');
    document.getElementById('tab-btn-export-mp3')?.classList.toggle('active', !esPdf);
    document.getElementById('tab-btn-export-pdf')?.classList.toggle('active', esPdf);
    const contentMp3 = document.getElementById('tab-content-export-mp3');
    const contentPdf = document.getElementById('tab-content-export-pdf');
    if (contentMp3) contentMp3.style.display = esPdf ? 'none' : 'block';
    if (contentPdf) contentPdf.style.display = esPdf ? 'block' : 'none';

    if (esPdf) {
        _normalizarRangoPaginasInputs('pdf-export-pag-ini', 'pdf-export-pag-fin', false);
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
    _normalizarRangoPaginasInputs('pdf-export-pag-ini', 'pdf-export-pag-fin', true);
    previsualizarPaginaPdfExport('ini');
    previsualizarPaginaPdfExport('fin');
}

async function previsualizarPaginaPdfExport(tipo) {
    return _previsualizarPaginaModal(tipo, 'pdf-export-pag', 'img-preview-pdf', 'txt-preview-pdf', 'Error en vista previa PDF export:');
}

function _leerOpcionesExportPdf(ini, fin) {
    return {
        pag_ini: ini,
        pag_fin: fin,
        incluir_subrayados: document.getElementById('pdf-chk-subrayados')?.checked ?? true,
        aplanar_anotaciones: document.getElementById('pdf-chk-aplanar')?.checked ?? false,
        optimizar_peso: document.getElementById('pdf-chk-optimizar')?.checked ?? true,
        corte_modo: document.getElementById('pdf-corte-modo')?.value || 'unico',
        corte_paginas: Math.max(1, parseInt(document.getElementById('pdf-corte-paginas')?.value || '1', 10) || 1)
    };
}

async function _manejarResultadoExportPdf(res, txtEstado) {
    if (res && res.cancelado) {
        if (txtEstado) txtEstado.innerText = '';
        return;
    }
    if (res && res.ok) {
        const msg = res.mensaje || 'PDF guardado con éxito.';
        if (txtEstado) { txtEstado.innerText = msg; txtEstado.style.color = '#27ae60'; }
        await liraAlert(msg, 'exito');
        cerrarModalDescarga();
        return;
    }
    const err = res?.error || 'No se pudo guardar el PDF.';
    if (txtEstado) { txtEstado.innerText = err; txtEstado.style.color = '#e74c3c'; }
    await liraAlert(err, 'error');
}

async function iniciarExportacionPdfConfigurado() {
    const txtEstado = document.getElementById('txt-estado-export-pdf');
    const btnGuardar = document.getElementById('btn-iniciar-export-pdf');
    try {
        const ini = parseInt(_leerValExport('pdf-export-pag-ini', '1'), 10);
        const fin = parseInt(_leerValExport('pdf-export-pag-fin', '1'), 10);
        if (!_esRangoPaginasValidoExport(ini, fin)) {
            await liraAlert(_txtExport('msg-pdf-rango-invalido', 'Por favor verifica el rango de páginas antes de guardar el PDF.'), 'advertencia');
            return;
        }

        if (btnGuardar) btnGuardar.disabled = true;
        if (txtEstado) {
            txtEstado.innerText = _txtExport('msg-pdf-exportando', 'Preparando documento PDF...');
            txtEstado.style.color = '#d35400';
        }
        const res = await eel.exportar_pdf_configurado(_leerOpcionesExportPdf(ini, fin))();
        if (btnGuardar) btnGuardar.disabled = false;
        await _manejarResultadoExportPdf(res, txtEstado);
    } catch (e) {
        if (btnGuardar) btnGuardar.disabled = false;
        if (txtEstado) txtEstado.innerText = '';
        await liraAlert('Error al exportar PDF: ' + e, 'error');
    }
}

function abrirModalDescarga(tabInicial = 'mp3') {
    if (typeof cerrarOtrasFuncionesPrincipales === 'function') cerrarOtrasFuncionesPrincipales('mp3');

    const modal = document.getElementById('modal-descarga');
    if (!modal) { console.error("Error: No se encontró el elemento 'modal-descarga' en el HTML."); return; }

    modal.style.display = 'flex';
    _normalizarRangoPaginasInputs('modal-pag-ini', 'modal-pag-fin', false);
    _normalizarRangoPaginasInputs('pdf-export-pag-ini', 'pdf-export-pag-fin', true);

    cambiarTabModalDescarga(tabInicial === 'pdf' ? 'pdf' : 'mp3');
    actualizarUIControlesCorteMp3();
    inicializarOpcionesTraduccionMp3();
    previsualizarPagina('ini');
    previsualizarPagina('fin');

    const aviso = document.getElementById('aviso-columnas');
    if (aviso) aviso.style.display = (cortesV && cortesV.length > 0) ? 'block' : 'none';
}

async function cerrarModalDescarga() {
    console.log("[EXPORTACIÓN] Cerrando modal y cancelando exportación si está activa...");
    const modal = document.getElementById('modal-descarga');
    if (modal) { modal.style.display = 'none'; modal.style.pointerEvents = 'auto'; }
    const barra = document.getElementById('barra-contenedor');
    if (barra) barra.style.display = 'none';

    if (typeof eel !== 'undefined' && eel.cancelar_exportacion_mp3) {
        try { await eel.cancelar_exportacion_mp3()(); } catch (e) { console.warn("Aviso al cancelar:", e); }
    }
    _restaurarBotonesExportMp3();
    const txtEstado = document.getElementById('txt-estado-descarga');
    if (txtEstado) txtEstado.innerText = "";
}

function actModalVel() {
    document.getElementById('modal-val-vel').innerText = document.getElementById('modal-rng-vel').value + "x";
}

function _obtenerLibroTeatroExport(ini, fin, usarTeatro) {
    if (!usarTeatro) return [];
    if (typeof window.compilarLibroTeatroPagina === 'function' && typeof datosPagina !== 'undefined' && datosPagina?.oraciones) {
        window.compilarLibroTeatroPagina(paginaActual, datosPagina.oraciones);
    }
    return (typeof window.obtenerIntervencionesLibroTeatro === 'function')
        ? window.obtenerIntervencionesLibroTeatro(ini - 1, fin - 1)
        : [];
}

function _recolectarOpcionesExportMp3(ini, fin, usarTeatro) {
    const destDef = _leerValExport('sel-traduccion-destino', 'es');
    return {
        corte_modo: _leerValExport('mp3-corte-modo', 'unico'),
        corte_minutos: Math.max(1, parseInt(_leerValExport('mp3-corte-minutos', '15'), 10) || 15),
        corte_paginas: Math.max(1, parseInt(_leerValExport('mp3-corte-paginas', '1'), 10) || 1),
        empaquetar_zip: _leerChkExport('mp3-chk-zip', true),
        usar_limites: _leerChkExport('mp3-chk-limits', true),
        libro_teatro: _obtenerLibroTeatroExport(ini, fin, usarTeatro),
        traduccion_activa: _leerChkExport('chk-traduccion-export', false),
        traduccion_origen: _leerValExport('sel-traduccion-origen', 'auto'),
        traduccion_destino: _leerValExport('mp3-trad-destino', destDef),
        traduccion_motor: _leerValExport('sel-traduccion-motor', 'hibrido'),
        traduccion_modo: _leerValExport('mp3-trad-modo', 'solo_traduccion')
    };
}

function _manejarFinExportacionMp3(res, txtEstado) {
    const esError = typeof res === 'string' && res.includes("\u274C");
    if (txtEstado) {
        txtEstado.innerText = res;
        txtEstado.style.color = esError ? "#e74c3c" : "#27ae60";
    }
    setTimeout(() => {
        if (typeof res === 'string' && res.trim()) liraAlert(res, esError ? 'error' : 'exito');
        cerrarModalDescarga();
    }, 600);
}

async function iniciarDescargaFinal() {
    try {
        const ini = parseInt(document.getElementById('modal-pag-ini').value, 10);
        const fin = parseInt(document.getElementById('modal-pag-fin').value, 10);
        const voz = document.getElementById('modal-voz').value || document.getElementById('selector-voz-live').value;
        const vel = parseFloat(document.getElementById('modal-rng-vel').value);

        if (!voz || !_esRangoPaginasValidoExport(ini, fin)) {
            await liraAlert(_txtExport('msg-mp3-config-pags', 'Por favor configure las páginas y la voz antes de exportar.'), 'advertencia');
            return;
        }

        const usarTeatro = _leerChkExport('chk-teatro-export', false);
        const obraMP3 = window.obraActualTeatro || "General";
        const dictActivo = _leerChkExport('mp3-chk-abbr', true) ? (window.dbDiccionario || null) : {};
        const opcionesExport = _recolectarOpcionesExportMp3(ini, fin, usarTeatro);
        const txtEstado = _activarUIProgresoExportMp3();

        eel.descargar_audio_dedicado(
            ini, fin, voz, vel, null, null, dictActivo, usarTeatro, obraMP3, opcionesExport
        )((res) => _manejarFinExportacionMp3(res, txtEstado));
    } catch (e) {
        console.error("Error crítico en exportación:", e);
        await liraAlert("Error al iniciar exportación: " + e, 'error');
        _restaurarBotonesExportMp3();
    }
}

async function previsualizarPagina(tipo) {
    return _previsualizarPaginaModal(tipo, 'modal-pag', 'img-preview-mp3', 'txt-preview-mp3', 'Error en el Monitor Visual:');
}
