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

    // 3. Control Ejecutivo: Función de Inserción Manual
    const add = (iso, nombre) => {
        let opt = document.createElement('option');
        opt.value = iso;
        opt.innerText = nombre;
        selIdioma.appendChild(opt);
    };

    // --- LISTA MAESTRA DEFINITIVA ---
    add('af', 'Afrikáans'); add('sq', 'Albanés'); add('de', 'Alemán'); add('am', 'Amhárico');
    add('ar', 'Árabe'); add('az', 'Azerbaiyano'); add('bn', 'Bengalí'); add('my', 'Birmano');
    add('bs', 'Bosnio'); add('bg', 'Búlgaro'); add('kn', 'Canarés'); add('ca', 'Catalán');
    add('cs', 'Checo'); add('zh', 'Chino'); add('si', 'Cingalés'); add('ko', 'Coreano');
    add('hr', 'Croata'); add('da', 'Danés'); add('sk', 'Eslovaco'); add('sl', 'Esloveno');
    add('es', 'Español'); add('et', 'Estonio'); add('fi', 'Finlandés'); add('fr', 'Francés');
    add('cy', 'Galés'); add('gl', 'Gallego'); add('ka', 'Georgiano'); add('el', 'Griego');
    add('gu', 'Guyaratí'); add('he', 'Hebreo'); add('hi', 'Hindi'); add('nl', 'Holandés');
    add('hu', 'Húngaro'); add('id', 'Indonesio'); add('en', 'Inglés'); add('iu', 'Inuktitut');
    add('ga', 'Irlandés'); add('is', 'Islandés'); add('it', 'Italiano'); add('ja', 'Japonés');
    add('jv', 'Javanés'); add('km', 'Jemer'); add('kk', 'Kazajo'); add('lo', 'Lao');
    add('lv', 'Letón'); add('lt', 'Lituano'); add('mk', 'Macedonio'); add('ml', 'Malayalam');
    add('ms', 'Malayo'); add('mt', 'Maltés'); add('mr', 'Maratí'); add('mn', 'Mongol');
    add('ne', 'Nepalí'); add('nb', 'Noruego'); add('ps', 'Pastún'); add('fa', 'Persa');
    add('pl', 'Polaco'); add('pt', 'Portugués'); add('ro', 'Rumano'); add('ru', 'Ruso');
    add('sr', 'Serbio'); add('so', 'Somalí'); add('sw', 'Suajili'); add('sv', 'Sueco');
    add('th', 'Tailandés'); add('ta', 'Tamil'); add('te', 'Telugu'); add('tr', 'Turco');
    add('uk', 'Ucraniano'); add('ur', 'Urdu'); add('uz', 'Uzbeko'); add('vi', 'Vietnamita');
    add('zu', 'Zulú');

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
        safeVocesPython.forEach(v => {
            // Si es voz de nube (Edge), la procesamos separada
            if (v.tipo === 'nube' || (!v.id.startsWith('Local-') && !v.id.endsWith('.onnx'))) {
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
                let textoLimpio = voz.nombre.replace("⭐ ", "").replace("⚡ ", ""); 
                let prefijo = voz.origen === 'piper' ? "⚡ " : "";
                opt.innerText = "⭐ " + prefijo + textoLimpio;
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
        if (existe) {
            sel.value = valorActual;
            if (typeof vozIntencionUsuario !== 'undefined') vozIntencionUsuario = valorActual;
        } else if (sel.options.length > 0 && !sel.options[0].disabled) {
            sel.selectedIndex = 0;
            if (typeof vozIntencionUsuario !== 'undefined') vozIntencionUsuario = sel.options[0].value;
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

// ==========================================