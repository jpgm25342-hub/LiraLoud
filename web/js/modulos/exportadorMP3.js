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

function abrirModalDescarga() {
    // Lógica de exclusión mutua universal
    if (typeof cerrarOtrasFuncionesPrincipales === 'function') {
        cerrarOtrasFuncionesPrincipales('mp3');
    }

    const modal = document.getElementById('modal-descarga');
    if (modal) {
        modal.style.display = 'flex';

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
        const ini = parseInt(document.getElementById('modal-pag-ini').value);
        const fin = parseInt(document.getElementById('modal-pag-fin').value);
        const voz = document.getElementById('modal-voz').value || document.getElementById('selector-voz-live').value;
        const vel = parseFloat(document.getElementById('modal-rng-vel').value);

        if (!ini || !fin || !voz) {
            const msgConfig = (typeof window.t === 'function') ? window.t('msg-mp3-config-pags', 'Por favor configure las páginas y la voz antes de exportar.') : "Por favor configure las páginas y la voz antes de exportar.";
            await liraAlert(msgConfig, 'advertencia');
            return;
        }

        const chkTeatroExport = document.getElementById('chk-teatro-export');
        const usarTeatro = chkTeatroExport && chkTeatroExport.checked;
        const obraMP3 = window.obraActualTeatro || "General";

        const chkAbbr = document.getElementById('mp3-chk-abbr')?.checked ?? true;
        const dictActivo = chkAbbr ? (window.dbDiccionario || null) : {};

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
            ini, fin, voz, vel, null, null, dictActivo, usarTeatro, obraMP3
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
    const input = document.getElementById(`modal-pag-${tipo}`);
    if (!input) return;

    const num = parseInt(input.value) - 1;
    // Validación Bayesiana: Evitamos pedir páginas inexistentes [cite: 2025-12-26]
    if (num < 0 || num >= totalPaginas) return;

    console.log(`[MONITOR] Solicitando miniatura de página ${num + 1}...`);

    try {
        // Solicitamos a Python solo la materia prima (imagen) sin oraciones para ganar velocidad
        const data = await eel.obtener_pagina_data(num, null, null, null)();

        if (data && data.imagen) {
            const imgPreview = document.getElementById('img-preview-mp3');
            const txtPreview = document.getElementById('txt-preview-mp3');

            // Forzamos el refresco de la imagen
            imgPreview.src = data.imagen;
            imgPreview.style.display = 'block';
            if (txtPreview) txtPreview.style.display = 'none';
        }
    } catch (e) {
        console.error("Error en el Monitor Visual:", e);
    }
}
