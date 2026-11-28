/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// 5. GESTIÓN DE VOCES
// ==========================================

function cargarVocesSistema() {
    // 1. Verificación de Priors: Esperar a que el motor de síntesis esté listo
    vocesSistema = synth.getVoices();
    if (vocesSistema.length === 0) { 
        setTimeout(cargarVocesSistema, 500); 
        return; 
    }

    // 2. Preparación del Suelo Aristotélico (Selectores)
    let selIdioma = document.getElementById('filtro-idioma');
    let selModal = document.getElementById('modal-filtro-idioma');
    if (!selIdioma) return;

    let valorPrevio = selIdioma.value; 
    selIdioma.innerHTML = ""; // Limpieza nuclear de siglas anteriores

    // --- LISTA MAESTRA DEFINITIVA (Autónimos desde estado.js) ---
    if (typeof window.poblarSelectIdiomas === 'function') {
        window.poblarSelectIdiomas(selIdioma);
    }

    // 4. Restauración de Homeostasis
    if (valorPrevio) selIdioma.value = valorPrevio;

    // Sincronía espejo con el modal de descarga
    if (selModal) selModal.innerHTML = selIdioma.innerHTML;

    // Ejecutar filtro para actualizar la lista de voces según el idioma seleccionado
    if (typeof filtrarVocesPorIdioma === "function") filtrarVocesPorIdioma();
}

function filtrarVocesPorIdioma() {
    let lang = document.getElementById('filtro-idioma').value;
    let selVoz = document.getElementById('selector-voz-live'); selVoz.innerHTML = "";
    let filtradas = vocesSistema.filter(v => v.lang.startsWith(lang));
    if(filtradas.length === 0) filtradas = vocesSistema;
    filtradas.forEach((v, index) => { 
        let opt = document.createElement('option'); 
        opt.value = v.name; opt.setAttribute('data-name', v.name); opt.innerText = v.name; 
        selVoz.appendChild(opt); 
    });
    actualizarListaVocesUI();
}

async function togglePinVoz() {
    let sel = document.getElementById('selector-voz-live');
    let vozId = sel.value; if (!vozId) return;
    let index = vocesFavoritas.indexOf(vozId);
    if (index === -1) vocesFavoritas.push(vozId); else vocesFavoritas.splice(index, 1);
    
    // Feedback visual inmediato sin esperar al backend
    actualizarListaVocesUI(); 
    let btn = document.getElementById('btn-pin-voz');
    if (btn) {
        btn.style.transition = "transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
        btn.style.transform = "scale(1.5)"; 
        setTimeout(() => btn.style.transform = "scale(1)", 200);
    }

    // Persistencia en segundo plano
    eel.gestionar_ram_favoritos(vocesFavoritas)();
    await eel.guardar_lista_favoritos(vocesFavoritas)();
}

async function fijarVozPredeterminada() {
    let sel = document.getElementById('selector-voz-live');
    let vozId = sel.value; if (!vozId) return;
    if (vozPredeterminada === vozId) vozPredeterminada = ""; else vozPredeterminada = vozId;
    await eel.guardar_voz_default(vozPredeterminada)();
    actualizarBotonCorazon();
    let btn = document.getElementById('btn-default-voz');
    btn.style.transform = "scale(1.5)"; setTimeout(()=>btn.style.transform="scale(1)", 200);
}

function esModoPrivacidadEstrictaActivo() {
    return window.modoPrivacidadEstricta === true || document.getElementById('chk-modo-privacidad')?.checked === true;
}

function esVozOnlineRestringida(vozId) {
    const vLower = String(vozId || '').toLowerCase();
    return vLower.includes('online')
        || vLower.includes('natural')
        || (!vLower.startsWith('local-') && !vLower.endsWith('.onnx') && !vLower.includes('kokoro'));
}

function _clasificarVozPython(v, langFilter, langLower, modoPrivacidadActivo) {
    const esNube = v.tipo === 'nube' || (!v.id.startsWith('Local-') && !v.id.endsWith('.onnx'));
    if (esNube) {
        if (modoPrivacidadActivo) return null;
        const idLower = v.id.toLowerCase();
        const coincide = !langFilter || idLower.includes('-' + langLower + '-') || idLower.startsWith(langLower);
        return coincide ? { id: v.id, nombre: v.nombre, origen: 'nube' } : null;
    }
    const idFinal = v.id.startsWith("Local-") ? v.id : "Local-" + v.id;
    const nombreArchivo = idFinal.replace("Local-", "");
    return (!langFilter || nombreArchivo.startsWith(langFilter))
        ? { id: idFinal, nombre: v.nombre, origen: 'piper' }
        : null;
}

function _clasificarVozSistema(v, langFilter, modoPrivacidadActivo) {
    if (modoPrivacidadActivo) {
        const nombreLower = (v.name || '').toLowerCase();
        if (nombreLower.includes('online') || nombreLower.includes('natural')) return null;
    }
    return (!langFilter || (v.lang || '').startsWith(langFilter))
        ? { id: v.name, nombre: v.name, origen: 'navegador' }
        : null;
}

function recolectarVocesDisponibles(langFilter = 'es') {
    const safeVocesPython = (typeof vocesPython !== 'undefined' && vocesPython) ? vocesPython : [];
    const safeVocesSistema = (typeof vocesSistema !== 'undefined' && vocesSistema) ? vocesSistema : [];
    const modoPrivacidadActivo = esModoPrivacidadEstrictaActivo();
    const langLower = String(langFilter || '').toLowerCase();
    const todasLasVoces = [];

    for (const v of safeVocesPython) {
        const entrada = _clasificarVozPython(v, langFilter, langLower, modoPrivacidadActivo);
        if (entrada) todasLasVoces.push(entrada);
    }
    for (const v of safeVocesSistema) {
        const entrada = _clasificarVozSistema(v, langFilter, modoPrivacidadActivo);
        if (entrada) todasLasVoces.push(entrada);
    }
    return todasLasVoces;
}

function poblarSelectVocesSimples(selVoz, todasLasVoces, { piperColor = '#2980b9', piperWeight = '500', inputBusquedaId = null } = {}) {
    if (!selVoz) return;
    selVoz.innerHTML = "";
    todasLasVoces.forEach(voz => {
        const opt = document.createElement('option');
        opt.value = voz.id;
        opt.innerText = voz.nombre;
        opt.setAttribute('data-origen', voz.origen);
        if (voz.origen === 'piper') {
            opt.style.color = piperColor;
            opt.style.fontWeight = piperWeight;
        }
        selVoz.appendChild(opt);
    });
    if (selVoz.options.length > 0) {
        selVoz.selectedIndex = 0;
        if (inputBusquedaId) {
            const inp = document.getElementById(inputBusquedaId);
            if (inp) inp.value = selVoz.options[0].text;
        }
    }
}

window.esModoPrivacidadEstrictaActivo = esModoPrivacidadEstrictaActivo;
window.esVozOnlineRestringida = esVozOnlineRestringida;
window.recolectarVocesDisponibles = recolectarVocesDisponibles;
window.poblarSelectVocesSimples = poblarSelectVocesSimples;

function _renderizarOpcionesVocesConFavoritos(sel, todasLasVoces, safeVocesFavoritas) {
    sel.innerHTML = "";

    safeVocesFavoritas.forEach(favId => {
        const voz = todasLasVoces.find(v => v.id === favId);
        if (voz) {
            const opt = document.createElement('option');
            opt.value = voz.id;
            opt.innerText = "⭐ " + voz.nombre.replace(/^⭐\s*/, "");
            opt.style.fontWeight = "bold";
            opt.style.color = "#d35400";
            opt.setAttribute('data-origen', voz.origen);
            sel.appendChild(opt);
        }
    });

    if (safeVocesFavoritas.length > 0 && todasLasVoces.length > safeVocesFavoritas.length) {
        const sep = document.createElement('option');
        sep.disabled = true;
        sep.innerText = "──────────";
        sel.appendChild(sep);
    }

    todasLasVoces.forEach(voz => {
        if (!safeVocesFavoritas.includes(voz.id)) {
            const opt = document.createElement('option');
            opt.value = voz.id;
            opt.innerText = voz.nombre;
            opt.setAttribute('data-origen', voz.origen);
            if (voz.origen === 'piper') {
                opt.style.color = "#2980b9";
                opt.style.fontWeight = "500";
            }
            sel.appendChild(opt);
        }
    });
}

function _aplicarVozActivaYBuscador(vozId, textoOpt) {
    if (typeof vozIntencionUsuario !== 'undefined') vozIntencionUsuario = vozId;
    if (typeof vozPredeterminada !== 'undefined') vozPredeterminada = vozId;
    const inpBuscador = document.getElementById('busqueda-voz-live');
    if (inpBuscador && textoOpt) {
        inpBuscador.value = textoOpt.replace(/^⭐\s*/, '').trim();
    }
}

function _sincronizarSelectModalConLive(sel, valorActual, existe) {
    const selModal = document.getElementById('modal-voz');
    if (!selModal) return;
    const valorModal = selModal.value;
    selModal.innerHTML = sel.innerHTML;
    const existeModal = [...selModal.options].some(o => o.value === valorModal);
    if (existeModal) selModal.value = valorModal;
    else if (existe) selModal.value = valorActual;
    else if (selModal.options.length > 0 && !selModal.options[0].disabled) selModal.selectedIndex = 0;
}

function _sincronizarSeleccionVozLiveYModal(sel, valorActual, modoPrivacidadActivo) {
    const existe = [...sel.options].some(o => o.value === valorActual)
        && !(modoPrivacidadActivo && esVozOnlineRestringida(valorActual));

    if (existe) {
        sel.value = valorActual;
        if (typeof vozIntencionUsuario !== 'undefined') vozIntencionUsuario = valorActual;
    } else if (sel.options.length > 0 && !sel.options[0].disabled) {
        sel.selectedIndex = 0;
        _aplicarVozActivaYBuscador(sel.options[0].value, sel.options[0].text);
    }

    _sincronizarSelectModalConLive(sel, valorActual, existe);
}

function actualizarListaVocesUI() {
    console.log("🔧 [DEBUG] Iniciando actualizarListaVocesUI...");
    try {
        const sel = document.getElementById('selector-voz-live');
        if (!sel) {
            console.error("❌ [ERROR CRÍTICO] No encuentro el elemento 'selector-voz-live' en el HTML.");
            return;
        }

        const valorActual = sel.value || (typeof vozPredeterminada !== 'undefined' ? vozPredeterminada : "");
        const safeVocesFavoritas = (typeof vocesFavoritas !== 'undefined' && vocesFavoritas) ? vocesFavoritas : [];
        const elFiltro = document.getElementById('filtro-idioma');
        const langFilter = elFiltro ? elFiltro.value : 'es';
        const modoPrivacidadActivo = esModoPrivacidadEstrictaActivo();

        const todasLasVoces = recolectarVocesDisponibles(langFilter);
        _renderizarOpcionesVocesConFavoritos(sel, todasLasVoces, safeVocesFavoritas);
        _sincronizarSeleccionVozLiveYModal(sel, valorActual, modoPrivacidadActivo);

        if (typeof actualizarBotonEstrella === 'function') actualizarBotonEstrella();
        console.log("✅ [DEBUG] Selector actualizado correctamente.");
    } catch (e) {
        console.error("🔥 [CRASH] Error dentro de actualizarListaVocesUI:", e);
        console.error(e.stack);
    }
}

function actualizarBotonEstrella() {
    let sel = document.getElementById('selector-voz-live');
    let btn = document.getElementById('btn-pin-voz');
    if (!sel || !btn || sel.selectedIndex === -1) return;
    if (vocesFavoritas.includes(sel.value)) { btn.innerText = "★"; btn.style.color = "#f1c40f"; } 
    else { btn.innerText = "☆"; btn.style.color = "#ccc"; }
}

// Al cambiar el selector, ejecutamos toda la lógica de cambio de voz
document.getElementById('selector-voz-live')?.addEventListener('change', cambiarVozLive);

function _vozCoincideConIdioma(vozId, langIso) {
    if (!vozId || !langIso) return false;
    const norm = vozId.toLowerCase().replace(/^(edge-|local-)/, '');
    return norm.startsWith(langIso + '-') || norm.startsWith(langIso + '_');
}

function _sincronizarFiltroIdiomaUI(langRaw) {
    const elFiltro = document.getElementById('filtro-idioma');
    if (!elFiltro) return;
    const optFiltro = [...elFiltro.options].find(o => (o.value || '').toLowerCase().slice(0, 2) === langRaw);
    const targetVal = optFiltro ? optFiltro.value : '';
    if (elFiltro.value !== targetVal) elFiltro.value = targetVal;

    const elModalFiltro = document.getElementById('modal-filtro-idioma');
    if (elModalFiltro) elModalFiltro.value = targetVal;
    const inpBusquedaIdioma = document.getElementById('busqueda-idioma-live');
    if (inpBusquedaIdioma) inpBusquedaIdioma.value = optFiltro ? (optFiltro.text || '').trim() : '';

    if (typeof actualizarListaVocesUI === 'function') actualizarListaVocesUI();
}

function _buscarMejorVozParaIdioma(sel, langRaw, modoPrivacidadActivo) {
    const opcionesIdioma = [...sel.options].filter(o => !o.disabled && _vozCoincideConIdioma(o.value, langRaw));
    if (!modoPrivacidadActivo) {
        const matchEdge = opcionesIdioma.find(o => {
            const vl = (o.value || '').toLowerCase();
            return !vl.startsWith('local-') && !vl.endsWith('.onnx');
        });
        if (matchEdge) return matchEdge;
    }
    return opcionesIdioma[0] || null;
}

function _aplicarCambioVozPorIdioma(sel, langRaw, modoPrivacidadActivo) {
    const matchOpt = _buscarMejorVozParaIdioma(sel, langRaw, modoPrivacidadActivo);
    if (!matchOpt) return false;

    sel.value = matchOpt.value;
    _aplicarVozActivaYBuscador(matchOpt.value, matchOpt.text);
    const selModal = document.getElementById('modal-voz');
    if (selModal && [...selModal.options].some(o => o.value === matchOpt.value)) {
        selModal.value = matchOpt.value;
    }
    if (typeof cambiarVozLive === 'function') cambiarVozLive();
    return true;
}

function sincronizarVozConIdiomaUI(langOverride = null) {
    const langRaw = (langOverride || (typeof currentLanguage !== 'undefined' ? currentLanguage : '') || 'es')
        .toLowerCase().trim().slice(0, 2);
    if (!langRaw) return false;

    _sincronizarFiltroIdiomaUI(langRaw);
    const sel = document.getElementById('selector-voz-live');
    if (!sel) return false;

    const modoPrivacidadActivo = esModoPrivacidadEstrictaActivo();
    const esVozLocalZh = langRaw === 'zh' && (sel.value || '').toLowerCase().startsWith('local-');
    if (!_vozCoincideConIdioma(sel.value, langRaw) || (esVozLocalZh && !modoPrivacidadActivo)) {
        if (!_aplicarCambioVozPorIdioma(sel, langRaw, modoPrivacidadActivo)) return false;
    }

    const optSel = sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
    if (optSel) _aplicarVozActivaYBuscador(sel.value, optSel.text);
    return true;
}
window.sincronizarVozConIdiomaUI = sincronizarVozConIdiomaUI;

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('lira:idioma-cambiado', (ev) => {
        const lang = ev?.detail?.idioma;
        if (lang) sincronizarVozConIdiomaUI(lang);
    });
}

// ==========================================
