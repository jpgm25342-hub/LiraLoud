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

function actualizarListaVocesUI() {
    console.log("🔧 [DEBUG] Iniciando actualizarListaVocesUI...");

    try {
        let sel = document.getElementById('selector-voz-live');
        if (!sel) {
            console.error("❌ [ERROR CRÍTICO] No encuentro el elemento 'selector-voz-live' en el HTML.");
            return;
        }

        let valorActual = sel.value || (typeof vozPredeterminada !== 'undefined' ? vozPredeterminada : ""); 
        
        // --- PROTECCIÓN DE VARIABLES (Evita el crash si son null/undefined) ---
        // Si vocesPython no existe aún, usamos un array vacío []
        let safeVocesPython = (typeof vocesPython !== 'undefined' && vocesPython) ? vocesPython : [];
        let safeVocesSistema = (typeof vocesSistema !== 'undefined' && vocesSistema) ? vocesSistema : [];
        let safeVocesFavoritas = (typeof vocesFavoritas !== 'undefined' && vocesFavoritas) ? vocesFavoritas : [];

        console.log(`📊 [DATOS] Python: ${safeVocesPython.length}, Sistema: ${safeVocesSistema.length}, Favs: ${safeVocesFavoritas.length}`);

        let todasLasVoces = [];

        // 1. FILTRO DE IDIOMA
        let elFiltro = document.getElementById('filtro-idioma');
        let langFilter = elFiltro ? elFiltro.value : 'es';

        // 2A. PROCESAR PIPER (voces locales con prefijo Local-)
        const modoPrivacidadActivo = window.modoPrivacidadEstricta === true || document.getElementById('chk-modo-privacidad')?.checked === true;

        safeVocesPython.forEach(v => {
            // Si es voz de nube (Edge), la procesamos separada
            if (v.tipo === 'nube' || (!v.id.startsWith('Local-') && !v.id.endsWith('.onnx'))) {
                // En modo privacidad estricta (100% offline), no incluimos voces Edge/nube
                if (modoPrivacidadActivo) return;

                // Voz Edge/Nube: el ID ya es el ShortName (ej: es-SV-RodrigoNeural)
                const idLower = v.id.toLowerCase();
                if (!langFilter || idLower.includes('-' + langFilter + '-') || idLower.startsWith(langFilter.toLowerCase())) {
                    todasLasVoces.push({ id: v.id, nombre: v.nombre, origen: 'nube' });
                }
                return;
            }
            // Voz Piper local
            let idFinal = v.id.startsWith("Local-") ? v.id : "Local-" + v.id;
            let nombreArchivo = idFinal.replace("Local-", "");
            
            // Filtro seguro
            if (!langFilter || nombreArchivo.startsWith(langFilter)) {
                todasLasVoces.push({ id: idFinal, nombre: v.nombre, origen: 'piper' });
            }
        });

        // 3. PROCESAR NAVEGADOR
        safeVocesSistema.forEach(v => {
            // En modo privacidad estricta, descartar voces online del navegador (ej: "Microsoft ... Online (Natural)")
            if (modoPrivacidadActivo) {
                const nombreLower = (v.name || '').toLowerCase();
                if (nombreLower.includes('online') || nombreLower.includes('natural')) {
                    return;
                }
            }

            if (!langFilter || v.lang.startsWith(langFilter)) {
                todasLasVoces.push({ id: v.name, nombre: v.name, origen: 'navegador' });
            }
        });

        // 4. RENDERIZADO
        sel.innerHTML = ""; 

        // A) Favoritos
        safeVocesFavoritas.forEach(favId => {
            let voz = todasLasVoces.find(v => v.id === favId);
            if (voz) {
                let opt = document.createElement('option');
                opt.value = voz.id;
                let textoLimpio = voz.nombre.replace(/^⭐\s*/, ""); 
                opt.innerText = "⭐ " + textoLimpio;
                opt.style.fontWeight = "bold";
                opt.style.color = "#d35400"; 
                opt.setAttribute('data-origen', voz.origen);
                sel.appendChild(opt);
            }
        });

        // Separador
        if (safeVocesFavoritas.length > 0 && todasLasVoces.length > safeVocesFavoritas.length) {
            let sep = document.createElement('option');
            sep.disabled = true; sep.innerText = "──────────";
            sel.appendChild(sep);
        }

        // B) Resto
        todasLasVoces.forEach(voz => {
            if (!safeVocesFavoritas.includes(voz.id)) {
                let opt = document.createElement('option');
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

        // 5. RESTAURAR SELECCIÓN
        let existe = [...sel.options].some(o => o.value === valorActual);
        if (modoPrivacidadActivo) {
            const vLower = (valorActual || '').toLowerCase();
            const esOnline = vLower.includes('online') || vLower.includes('natural') || (!vLower.startsWith('local-') && !vLower.endsWith('.onnx') && !vLower.includes('kokoro'));
            if (esOnline) {
                existe = false; // Forzar cambio en modo privacidad
            }
        }

        if (existe) {
            sel.value = valorActual;
            if (typeof vozIntencionUsuario !== 'undefined') vozIntencionUsuario = valorActual;
        } else if (sel.options.length > 0 && !sel.options[0].disabled) {
            sel.selectedIndex = 0;
            const nuevaVozSegura = sel.options[0].value;
            if (typeof vozIntencionUsuario !== 'undefined') vozIntencionUsuario = nuevaVozSegura;
            if (typeof vozPredeterminada !== 'undefined') vozPredeterminada = nuevaVozSegura;
            const inpBuscador = document.getElementById('busqueda-voz-live');
            if (inpBuscador && sel.options[0].text) {
                inpBuscador.value = sel.options[0].text.replace(/^⭐\s*/, "");
            }
        }

        // 6. SINCRONIZAR MODAL MP3 (modal-voz)
        let selModal = document.getElementById('modal-voz');
        if (selModal) {
            let valorModal = selModal.value;
            selModal.innerHTML = sel.innerHTML;
            let existeModal = [...selModal.options].some(o => o.value === valorModal);
            if (existeModal) {
                selModal.value = valorModal;
            } else if (existe) {
                selModal.value = valorActual;
            } else if (selModal.options.length > 0 && !selModal.options[0].disabled) {
                selModal.selectedIndex = 0;
            }
        }
        
        // Llamadas seguras a funciones auxiliares
        if (typeof actualizarBotonEstrella === 'function') actualizarBotonEstrella();

        console.log("✅ [DEBUG] Selector actualizado correctamente.");

    } catch (e) {
        console.error("🔥 [CRASH] Error dentro de actualizarListaVocesUI:", e);
        console.error(e.stack); // Muestra dónde falló exactamente
    }
}

function actualizarBotonEstrella() {
    let sel = document.getElementById('selector-voz-live');
    let btn = document.getElementById('btn-pin-voz');
    if (sel.selectedIndex === -1) return;
    if (vocesFavoritas.includes(sel.value)) { btn.innerText = "★"; btn.style.color = "#f1c40f"; } 
    else { btn.innerText = "☆"; btn.style.color = "#ccc"; }
}

// Al cambiar el selector, ejecutamos toda la lógica de cambio de voz
document.getElementById('selector-voz-live').addEventListener('change', cambiarVozLive);

function _vozCoincideConIdioma(vozId, langIso) {
    if (!vozId || !langIso) return false;
    const norm = vozId.toLowerCase().replace(/^(edge-|local-)/, '');
    return norm.startsWith(langIso + '-') || norm.startsWith(langIso + '_');
}

function sincronizarVozConIdiomaUI(langOverride = null) {
    const langRaw = (langOverride || (typeof currentLanguage !== 'undefined' ? currentLanguage : '') || 'es')
        .toLowerCase().trim().slice(0, 2);
    if (!langRaw) return false;

    const elFiltro = document.getElementById('filtro-idioma');
    const elModalFiltro = document.getElementById('modal-filtro-idioma');
    const inpBusquedaIdioma = document.getElementById('busqueda-idioma-live');

    if (elFiltro) {
        const optFiltro = [...elFiltro.options].find(o => (o.value || '').toLowerCase().slice(0, 2) === langRaw);
        const targetVal = optFiltro ? optFiltro.value : '';
        if (elFiltro.value !== targetVal) {
            elFiltro.value = targetVal;
        }
        if (elModalFiltro) elModalFiltro.value = targetVal;
        if (inpBusquedaIdioma) {
            inpBusquedaIdioma.value = optFiltro ? (optFiltro.text || '').trim() : '';
        }
        if (typeof actualizarListaVocesUI === 'function') actualizarListaVocesUI();
    }

    const sel = document.getElementById('selector-voz-live');
    if (!sel) return false;

    const yaCoincide = _vozCoincideConIdioma(sel.value, langRaw);
    const modoPrivacidadActivo = window.modoPrivacidadEstricta === true
        || document.getElementById('chk-modo-privacidad')?.checked === true;
    const esVozLocalZh = langRaw === 'zh' && (sel.value || '').toLowerCase().startsWith('local-');

    if (!yaCoincide || (esVozLocalZh && !modoPrivacidadActivo)) {
        const opcionesIdioma = [...sel.options].filter(o => !o.disabled && _vozCoincideConIdioma(o.value, langRaw));
        const matchEdge = !modoPrivacidadActivo
            ? opcionesIdioma.find(o => {
                const vl = (o.value || '').toLowerCase();
                return !vl.startsWith('local-') && !vl.endsWith('.onnx');
            })
            : null;
        const matchOpt = matchEdge || opcionesIdioma[0];
        if (!matchOpt) return false;

        sel.value = matchOpt.value;
        if (typeof vozIntencionUsuario !== 'undefined') vozIntencionUsuario = matchOpt.value;
        if (typeof vozPredeterminada !== 'undefined') vozPredeterminada = matchOpt.value;
        const selModal = document.getElementById('modal-voz');
        if (selModal && [...selModal.options].some(o => o.value === matchOpt.value)) {
            selModal.value = matchOpt.value;
        }
        if (typeof cambiarVozLive === 'function') cambiarVozLive();
    }

    const inpBusquedaVoz = document.getElementById('busqueda-voz-live');
    if (inpBusquedaVoz && sel.selectedIndex >= 0 && sel.options[sel.selectedIndex]) {
        inpBusquedaVoz.value = (sel.options[sel.selectedIndex].text || '').replace(/^⭐\s*/, '').trim();
    }
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
