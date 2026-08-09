/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// 7. AJUSTES DE LECTURA Y UI (SINCRONIZADOS)
// ==========================================

// ============================================================
// LLENADO DEL SELECTOR DE MP3 (HÍBRIDO: PIPER + EDGE)
// ============================================================
async function llenarTodosLosSelectores() {
    try {
        console.log("📡 [JS] Solicitando unificación de catálogo...");

        // 1. Forzamos la carga de voces del navegador
        let vocesDelNavegador = synth.getVoices();
        
        // 2. Mapeamos solo el nombre para no saturar el canal de datos
        const datosParaPython = vocesDelNavegador.map(v => ({ name: v.name }));

        // 3. Handshake con el backend enviando el catálogo vivo
        const catalogoHibrido = await eel.obtener_todas_las_voces_descarga(datosParaPython)();
        
        const selModal = document.getElementById('modal-voz'); 
        if (!selModal) return;

        selModal.innerHTML = ""; // Limpieza técnica
        
        catalogoHibrido.forEach(v => {
            let opt = document.createElement('option');
            opt.value = v.id;
            opt.innerText = v.nombre;
            
            // Estética para tu Red Ejecutiva: Diferenciamos lo local [cite: 2025-11-25]
            if (v.tipo === "local") {
                opt.style.color = "#d35400"; // Naranja Piper
                opt.style.fontWeight = "bold";
            }
            selModal.appendChild(opt);
        });

        console.log("✅ [JS] Catálogo MP3 actualizado.");
    } catch (e) {
        console.error("🔥 Error en Handshake de voces:", e);
    }
}




async function cambiarVozLive() { 
    // 1. SILENCIO FÍSICO INMEDIATO
    detenerLectura(false); 
    if (window.activeAudioSources) {
        window.activeAudioSources.forEach(s => { try { s.stop(); } catch(e){} });
        window.activeAudioSources = [];
    }
	if (synth) synth.cancel();
    // 2. ACTUALIZAR IDENTIDAD VOCAL (Ancla de Oro)
    let sel = document.getElementById('selector-voz-live');
    if (sel && sel.selectedIndex >= 0) {
        // Fijamos la intención para que las siguientes oraciones la respeten
        vozPredeterminada = sel.value; 
        
        // 💾 PERSISTENCIA AUTOMÁTICA: Guardamos en el JSON inmediatamente
        await eel.guardar_voz_default(vozPredeterminada)(); 
        console.log("💾 Voz Maestra sincronizada en JSON:", vozPredeterminada);
        
        // Sincronía visual del buscador inteligente
        const inpBuscador = document.getElementById('busqueda-voz-live');
        if (inpBuscador) inpBuscador.value = vozPredeterminada;
    }

    // 3. RE-FILTRADO POR SNAPSHOT (Materia Prima)
    // Limpiamos la caché para que no queden rastros de la voz pasada
    await eel.limpiar_pasteleria()(); 
    let dictActual = obtenerDiccionarioConsolidado();
    let nuevasOraciones = await eel.reaplicar_filtros_desde_snapshot(dictActual)();
    
    if (nuevasOraciones) {
        datosPagina.oraciones = nuevasOraciones;
        window.vozActivaSnapshot = vozPredeterminada;
    }

    // 4. REANUDAR CON LA NUEVA IDENTIDAD
    if (leyendo && indiceOracion !== -1) {
        // 🎯 GUILLOTINA: Incrementamos la sesión para que CUALQUIER 
        // proceso de audio anterior (Edge o Piper) se ignore al instante.
        currentReadingSession += 10;
        window.currentReadingSession = currentReadingSession;
        
       if (window.timerReanudacionVoz) clearTimeout(window.timerReanudacionVoz);

        console.log("⚔️ Estableciendo sesión única: " + window.currentReadingSession);

        // Guardamos el timer en una global para poder cancelarlo si entra otra orden rápida
        window.timerReanudacionVoz = setTimeout(() => {
            // Solo si seguimos en modo "leyendo", disparamos la secuencia
            if (leyendo) {
                console.log("▶️ Disparo único de secuencia ejecutado.");
                reproducirSecuencia(indiceOracion);
            }
        }, 150);
    }
	// 5. ACTUALIZACIÓN FINAL DE INTERFAZ
    actualizarBotonEstrella();
}


function sincronizarSlider(tipo) {
    const slider = document.getElementById(`rng-${tipo}`);
    const input = document.getElementById(`num-${tipo}`);
    
    if (slider && input) {
        // 1. Sincronía visual inmediata entre slider y número
        input.value = slider.value;
        
        // 2. Actualización de variables de estado en RAM
        const valor = parseFloat(slider.value);
        if (tipo === 'velocidad') velocidadLectura = valor;
        if (tipo === 'tono') pitchLectura = valor;
        if (tipo === 'pausa') pausaPunto = parseInt(valor);
        
        // 3. CAMBIO CLAVE: Ya no llamamos a actualizarFiltrosSnapshot() aquí.
        // Esto evita que el JSON se sobrescriba con datos incompletos 
        // mientras solo estamos pre-visualizando el cambio.
        console.log(`🎚️ Ajuste temporal: ${tipo} fijado en ${valor}`);
    }
}


function sincronizarInput(tipo) {
    let slider = document.getElementById(`rng-${tipo}`);
    let input = document.getElementById(`num-${tipo}`);
    let val = parseFloat(input.value);
    
    // Límites de seguridad
    if (val < parseFloat(input.min)) val = parseFloat(input.min);
    if (val > parseFloat(input.max)) val = parseFloat(input.max);
    
    input.value = val;
    slider.value = val;

    if (tipo === 'velocidad') velocidadLectura = val;
    if (tipo === 'tono') pitchLectura = val;
    if (tipo === 'pausa') pausaPunto = val;
    
    actualizarFiltrosSnapshot();
}

function aplicarMargenDinamico(valor) {
    let visor = document.getElementById('visor-container');
    if (visor) {
        visor.style.paddingLeft = valor + "px";
        visor.style.paddingRight = valor + "px";
        const spanVal = document.getElementById('val-margen-pdf');
        if (spanVal) spanVal.innerText = valor + "px";
    }
}

async function aplicarCambiosLectura() {
    try {
        console.log("🔍 [AUDITORÍA] Iniciando recolección de datos para guardado masivo...");

        // --- 1. CAPTURA DE DATOS DESDE LA INTERFAZ ---
        // Audio (Velocidad, Tono, Pausa, Volumen)
        velocidadLectura = parseFloat(document.getElementById('rng-velocidad')?.value || 1.0);
        pitchLectura = parseFloat(document.getElementById('rng-tono')?.value || 1.0);
        pausaPunto = parseInt(document.getElementById('rng-pausa')?.value || 300);
        
        // El volumen suele estar en un input específico, asegúrate de que el ID coincida con tu HTML
        volumenPorcentaje = parseInt(document.getElementById('rng-volumen-master')?.value || 
                                     document.getElementById('num-volumen-master')?.value || 100);

        // Estilo (Colores y Paddings independientes)
        const colorK = document.getElementById('color-resaltado')?.value || "#ffff00";
        const padK = parseInt(document.getElementById('rng-pad-karaoke')?.value || 2);
        const colorG = document.getElementById('color-guia-oracion')?.value || "#00b4ff";
        const padG = parseInt(document.getElementById('rng-pad-guia')?.value || 2);
        const llenado = document.getElementById('chk-llenado-fluido')?.checked || false;
		const mostrarKofi = document.getElementById('chk-kofi')?.checked ?? true;
		const btnKofi = document.getElementById('btn-kofi-global');
		if (btnKofi) {
    btnKofi.style.display = mostrarKofi ? 'flex' : 'none';
}
        
        // Comportamiento (Márgenes, Scroll y Filtros de Símbolos)
        const margV = parseInt(document.getElementById('rng-margen-pdf')?.value || 20);
        const seguir = document.getElementById('chk-seguir-texto')?.checked ?? true;
        const omitP = document.getElementById('chk-paren')?.checked ?? true;
        const omitC = document.getElementById('chk-corch')?.checked ?? true;
        const omitL = document.getElementById('chk-llaves')?.checked ?? true;
        const omitU = document.getElementById('chk-urls')?.checked ?? true;

        // --- 2. PARADA FÍSICA Y LIMPIEZA DE SESIÓN ---
        detenerLectura(false); 
        if (window.activeAudioSources) {
            window.activeAudioSources.forEach(s => { try { s.stop(); } catch(e){} });
            window.activeAudioSources = [];
			if (synth) synth.cancel();
        }
		

        // Sincronía de sesión para evitar traslapes de audio
        currentReadingSession += 10;
        window.currentReadingSession = currentReadingSession;
        window.seguirTextoActivo = seguir; 

        // Limpiar caché de Python para que regenere audio con nuevos filtros/velocidad
        await eel.limpiar_pasteleria()();

        // --- 3. ACTUALIZACIÓN POR SNAPSHOT (Solo si hay un PDF abierto) ---
        if (typeof datosPagina !== 'undefined' && datosPagina && datosPagina.oraciones) {
            let dictActual = dbDiccionario[seccionActual]?.terms || {};
            const filtrosActuales = {
                'chk-urls': omitU, 'chk-paren': omitP, 'chk-corch': omitC, 'chk-llaves': omitL
            };
            
            console.log("📤 [JS -> PY] Enviando Snapshot con filtros reales:", filtrosActuales);
            let nuevasOraciones = await eel.reaplicar_filtros_desde_snapshot(dictActual, filtrosActuales)();
            
            if (nuevasOraciones) {
                datosPagina.oraciones = nuevasOraciones;
                console.log("⚡ Snapshot y Filtros aplicados con éxito.");
            }
        }

        // --- 4. PERSISTENCIA TOTAL (Empaquetado JSON) ---
        const packAjustes = {
            "velocidad": velocidadLectura,
            "tono": pitchLectura,
            "pausa": pausaPunto,
            "volumen": volumenPorcentaje,
            "color": colorK,
            "padKaraoke": padK,
            "colorGuia": colorG,
            "padGuia": padG,
            "llenado": llenado,
            "margenPDF": margV,
            "seguirTexto": seguir,
            "omitirParen": omitP,
            "omitirCorch": omitC,
            "omitirLlaves": omitL,
            "omitirUrls": omitU
        };

        // Guardado en ajustes_lectura.json
        await eel.guardar_ajustes_lectura(packAjustes)();

        // --- 5. REANUDAR Y CERRAR ---
        if (typeof aplicarMargenDinamico === 'function') {
            aplicarMargenDinamico(margV);
        }
        
        dibujar(); // Aplica colores y paddings nuevos al lienzo

if (leyendo && indiceOracion !== -1) {
            // 1. Limpiamos cualquier timer de reanudación previo para evitar duplicados
            if (window.timerReanudacionFiltros) clearTimeout(window.timerReanudacionFiltros);

            // 2. Aplicamos el "Valle de Silencio" de 150ms
            window.timerReanudacionFiltros = setTimeout(() => {
                if (leyendo) {
                    console.log("▶️ Reanudación tras cambio de filtros (Fase Sincronizada)");
                    window.palabraKaraoke = null;
                    dibujar();
                    reproducirSecuencia(indiceOracion);
                }
            }, 150); // <--- Antibiótico contra la repetición
        } else {
            window.palabraKaraoke = null;
            dibujar();
        }

    } catch (e) {
        console.error("🔥 Error en el Hot Swap del Snapshot:", e);
    }
}

function cambiarValorInput(idSlider, delta) {
    let tipo = idSlider.split('-')[1]; 
    let input = document.getElementById(`num-${tipo}`);
    let slider = document.getElementById(`rng-${tipo}`);
    
    let valActual = parseFloat(input.value);
    let nuevoVal = valActual + delta;
    nuevoVal = Math.round(nuevoVal * 10) / 10;

    let min = parseFloat(input.min);
    let max = parseFloat(input.max);

    if (nuevoVal >= min && nuevoVal <= max) {
        input.value = nuevoVal;
        slider.value = nuevoVal;
        aplicarCambiosLectura();
    }
}

// Función antigua para mantener compatibilidad
function actConfig() { aplicarCambiosLectura(); }

// DICCIONARIO - FUNCIONES
function abrirDiccionario() {
    detenerLectura();
    
    // 🛡️ Lógica de exclusión mutua universal
    if (typeof cerrarOtrasFuncionesPrincipales === 'function') {
        cerrarOtrasFuncionesPrincipales('diccionario');
    }

    document.getElementById('modal-diccionario').style.display = 'flex';
    
    // 🎯 DISPARADOR DE ORIENTACIÓN (El Punto de Restauración)
    // Si no hay sección activa, tomamos la primera llave del JSON (usualmente GENERAL)
    if (!seccionActual && dbDiccionario) {
        seccionActual = Object.keys(dbDiccionario)[0];
    }

    // Ordenamos el dibujo inmediato de la interfaz
    renderizarSidebar();  // Dibuja las pestañas arriba
    renderizarTerminos(); // Dibuja la lista de abreviaturas 
    
    console.log(`📘 Diccionario abierto en bloque: ${seccionActual}`);
}
function cerrarDiccionario() { document.getElementById('modal-diccionario').style.display = 'none'; modoEdicionDiccionario = false; cargarPagina(paginaActual); }
function obtenerDiccionarioConsolidado() { 
    let consolidado = {}; 
    for(let sec in dbDiccionario) { 
        if(dbDiccionario[sec].active) { 
            let terminos = dbDiccionario[sec].terms;
            for (let sigla in terminos) {
                // SOLO AGREGAMOS SI EL SWITCH 'on' ES TRUE
                if (terminos[sigla].on) {
                    consolidado[sigla] = terminos[sigla].val;
                }
            }
        } 
    } 
    return consolidado; 
}
// --- MENÚ CONTEXTUAL Y RENOMBRADO DE PESTAÑAS (SECCIONES) ---
let seccionSeleccionadaParaMenu = null;

function mostrarMenuContextualTab(e, nombreSec) {
    seccionSeleccionadaParaMenu = nombreSec;
    const menu = document.getElementById('menu-contextual-tab');
    if (!menu) return;
    
    menu.style.display = 'block';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
}

function ocultarMenuContextualTab() {
    const menu = document.getElementById('menu-contextual-tab');
    if (menu) menu.style.display = 'none';
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('menu-contextual-tab');
    if (menu && menu.style.display === 'block' && !menu.contains(e.target)) {
        ocultarMenuContextualTab();
    }
});

function abrirRenombrarSeccionActual() {
    ocultarMenuContextualTab();
    if (!seccionSeleccionadaParaMenu) return;
    const nombreViejo = seccionSeleccionadaParaMenu;
    const nuevoNombre = prompt(`Cambiar nombre del bloque "${nombreViejo}":`, nombreViejo);
    if (nuevoNombre && nuevoNombre.trim() && nuevoNombre.trim() !== nombreViejo) {
        renombrarSeccion(nombreViejo, nuevoNombre.trim());
    }
}
window.abrirRenombrarSeccionActual = abrirRenombrarSeccionActual;

function eliminarSeccionDesdeMenu() {
    ocultarMenuContextualTab();
    if (seccionSeleccionadaParaMenu) {
        eliminarSeccion(seccionSeleccionadaParaMenu);
    }
}
window.eliminarSeccionDesdeMenu = eliminarSeccionDesdeMenu;

async function renombrarSeccion(nombreViejo, nombreNuevo) {
    if (!nombreNuevo || nombreNuevo.trim() === "" || nombreNuevo === nombreViejo) return;
    nombreNuevo = nombreNuevo.trim();
    
    if (dbDiccionario[nombreNuevo]) {
        alert(`Ya existe un bloque con el nombre "${nombreNuevo}".`);
        return;
    }
    
    // Reconstruir el objeto conservando el orden exacto de las secciones
    let nuevoDiccionario = {};
    for (let sec in dbDiccionario) {
        if (sec === nombreViejo) {
            nuevoDiccionario[nombreNuevo] = dbDiccionario[nombreViejo];
        } else {
            nuevoDiccionario[sec] = dbDiccionario[sec];
        }
    }
    dbDiccionario = nuevoDiccionario;
    
    if (seccionActual === nombreViejo) {
        seccionActual = nombreNuevo;
    }
    
    await eel.guardar_diccionario(dbDiccionario)();
    renderizarSidebar();
    renderizarTerminos();
    
    if (typeof actualizarFiltrosSnapshot === 'function') {
        await actualizarFiltrosSnapshot();
    }
    console.log(`✅ Bloque renombrado de "${nombreViejo}" a "${nombreNuevo}".`);
}
window.renombrarSeccion = renombrarSeccion;

// CAMBIO INSTANTÁNEO DE PESTAÑA (CERO RETRASO)
function cambiarPestañaDiccionario(nombreSec) {
    if (seccionActual === nombreSec) return;
    seccionActual = nombreSec;

    // Actualización ultra-rápida de clases visuales en el DOM existente
    const tabs = document.querySelectorAll('#lista-secciones .tab-item');
    tabs.forEach(tab => {
        if (tab.dataset.nombre === nombreSec) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Renderizado instantáneo de términos
    renderizarTerminos();
}
window.cambiarPestañaDiccionario = cambiarPestañaDiccionario;

function renderizarSidebar() {
    let lista = document.getElementById('lista-secciones'); 
    if (!lista) return;
    lista.innerHTML = "";
    
    const fragment = document.createDocumentFragment();

    for (let nombreSec in dbDiccionario) {
        let div = document.createElement('div'); 
        div.className = `tab-item ${seccionActual === nombreSec ? 'active' : ''}`;
        div.draggable = true;
        div.dataset.nombre = nombreSec;
        
        div.addEventListener('dragstart', () => div.classList.add('dragging-tab'));
        div.addEventListener('dragend', () => {
            div.classList.remove('dragging-tab');
            guardarOrdenSecciones();
        });

        // Cambio instantáneo al hacer clic en cualquier parte de la pestaña
        div.addEventListener('click', (e) => {
            if (e.target.closest('.tab-acciones')) return; // Evitar disparar si se hace clic en checkbox o eliminar
            cambiarPestañaDiccionario(nombreSec);
        });

        // Menú contextual con clic derecho para Renombrar / Eliminar
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            mostrarMenuContextualTab(e, nombreSec);
        });

        // Doble clic directo para renombrar
        div.addEventListener('dblclick', (e) => {
            if (e.target.closest('.tab-acciones')) return;
            e.preventDefault();
            e.stopPropagation();
            const nuevoNombre = prompt(`Cambiar nombre del bloque "${nombreSec}":`, nombreSec);
            if (nuevoNombre && nuevoNombre.trim() && nuevoNombre.trim() !== nombreSec) {
                renombrarSeccion(nombreSec, nuevoNombre.trim());
            }
        });

        div.innerHTML = `
            <span class="tab-nombre-texto" style="flex:1;" title="Clic derecho o doble clic para cambiar nombre">
                ${nombreSec}
            </span>
            <div class="tab-acciones">
                <input type="checkbox" ${dbDiccionario[nombreSec].active ? 'checked' : ''} 
                       onchange="toggleSeccion('${nombreSec}', this.checked); event.stopPropagation();"
                       style="cursor:pointer;" title="Activar/desactivar bloque">
                
                <span onclick="eliminarSeccion('${nombreSec}'); event.stopPropagation();" 
                      class="btn-cerrar-bloque" title="Eliminar bloque">✕</span>
            </div>
        `; 
        fragment.appendChild(div);
    }
    lista.appendChild(fragment);
    
    // Habilitar Reordenamiento Visual de Pestañas
    if (!lista.dataset.dragEnabled) {
        lista.dataset.dragEnabled = "true";
        lista.addEventListener('dragover', e => {
            e.preventDefault();
            const draggingTab = document.querySelector('.dragging-tab');
            if (!draggingTab) return;

            const tabs = [...lista.querySelectorAll('.tab-item:not(.dragging-tab)')];
            const afterElement = tabs.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = e.clientY - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;

            if (afterElement == null) {
                lista.appendChild(draggingTab);
            } else {
                lista.insertBefore(draggingTab, afterElement);
            }
        });
    }
}

let timeoutGuardadoSecciones = null;
async function guardarOrdenSecciones() {
    if (timeoutGuardadoSecciones) clearTimeout(timeoutGuardadoSecciones);
    timeoutGuardadoSecciones = setTimeout(async () => {
        let nuevoOrden = {};
        const tabs = document.querySelectorAll('#lista-secciones .tab-item');
        tabs.forEach(tab => {
            const nombre = tab.dataset.nombre;
            if (nombre && dbDiccionario[nombre]) {
                nuevoOrden[nombre] = dbDiccionario[nombre];
            }
        });
        dbDiccionario = nuevoOrden;
        await eel.guardar_diccionario(dbDiccionario)();
        console.log("✅ Orden de pestañas sincronizado.");
    }, 500);
}
window.toggleSeccion = async (nombre, estado) => { dbDiccionario[nombre].active = estado; await eel.guardar_diccionario(dbDiccionario)(); };
async function crearSeccion() { let input = document.getElementById('input-nueva-seccion'); let nombre = input.value.trim(); if(nombre && !dbDiccionario[nombre]) { dbDiccionario[nombre] = { active: true, terms: {} }; await eel.guardar_diccionario(dbDiccionario)(); seccionActual = nombre; input.value = ""; renderizarSidebar(); renderizarTerminos(); } }

function renderizarTerminos() {
    if (!seccionActual || !dbDiccionario[seccionActual]) return;
    
    let contenedor = document.getElementById('tabla-terminos');
    if (!contenedor) return;
    contenedor.innerHTML = "";
    
    let terminos = dbDiccionario[seccionActual].terms || {};
    let filtro = (document.getElementById('buscador-terminos')?.value || '').toLowerCase();
    
    // Obtenemos otras secciones disponibles para el movimiento de bloques
    let otrasSecciones = Object.keys(dbDiccionario).filter(s => s !== seccionActual);
    let opcionesMover = otrasSecciones.map(s => `<option value="${s}">${s}</option>`).join('');

    const fragment = document.createDocumentFragment();

    for (let sigla in terminos) {
        let data = terminos[sigla];
        if (data.auto) continue; // 🙈 Ocultar variantes automáticas de la UI
        let significado = data.val;
        let estado = data.on;

        // 1. FILTRO DE BÚSQUEDA
        if (filtro && !sigla.toLowerCase().includes(filtro) && !significado.toLowerCase().includes(filtro)) continue;

        // 2. CREACIÓN DE LA FILA (LIENZO DINÁMICO)
        let fila = document.createElement('div');
        fila.className = "fila-termino";
        fila.draggable = true; // Habilita el desplazamiento visual
        if (!estado) fila.style.opacity = "0.5";

        fila.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                <input type="checkbox" class="switch-individual" ${estado ? 'checked' : ''} 
                       onchange="toggleTerminoIndividual('${sigla}', this.checked)">
                
                <div style="display:flex; flex-direction:column; cursor:pointer; flex:1; min-width:0;" onclick="prepararEdicion('${sigla}')">
                    <span class="col-sigla">${sigla}</span>
                    <span class="col-significado">${significado}</span>
                </div>
            </div>

            <div class="acciones-term" style="display:flex; align-items:center; gap:8px;">
                <span class="btn-editar-term" onclick="prepararEdicion('${sigla}')" 
                      title="Editar">
                    <svg class="svg-icon" viewBox="0 0 16 16" fill="currentColor" style="width:14px; height:14px;">
                        <path d="M8.29289 3.70711L1 11V15H5L12.2929 7.70711L8.29289 3.70711Z"/>
                        <path d="M9.70711 2.29289L13.7071 6.29289L15.1716 4.82843C15.702 4.29799 16 3.57857 16 2.82843C16 1.26633 14.7337 0 13.1716 0C12.4214 0 11.702 0.297995 11.1716 0.828428L9.70711 2.29289Z"/>
                    </svg>
                </span>

                <select class="select-mover" onchange="moverTerminoABloque('${sigla}', this.value)" 
                        title="Mover a otra sección">
                    <option value="" disabled selected>Mover</option>
                    ${opcionesMover}
                </select>

                <span class="btn-borrar-term" onclick="borrarTermino('${sigla}')" 
                      title="Eliminar">✕</span>
            </div>
        `;

        // 3. EVENTOS DE DESLIZAMIENTO (Drag & Drop para reposicionar)
        fila.addEventListener('dragstart', () => fila.classList.add('dragging'));
        fila.addEventListener('dragend', async () => {
            fila.classList.remove('dragging');
            await guardarOrdenTrasDeslizamiento();
        });

        fragment.appendChild(fila);
    }
    contenedor.appendChild(fragment);
}

// Gatillo para el switch individual de abreviatura
window.toggleTerminoIndividual = async (sigla, estado) => {
    if(dbDiccionario[seccionActual] && dbDiccionario[seccionActual].terms[sigla]) {
        dbDiccionario[seccionActual].terms[sigla].on = estado;
        await eel.guardar_diccionario(dbDiccionario)();
        renderizarTerminos();
        
        // RECARGA INVISIBLE: Piper tirará el audio viejo y leerá con el nuevo estado
        await actualizarFiltrosSnapshot(); 
    }
};

async function agregarTermino() { 
    if(!seccionActual) return alert("Selecciona una sección primero"); 
    
    let inSigla = document.getElementById('input-sigla'); 
    let inSig = document.getElementById('input-significado'); 
    let s = inSigla.value.trim(); 
    let m = inSig.value.trim(); 
    
    if(s) { 
        // Verificar si la sigla ya existe en otra pestaña
        let seccionExistente = null;
        for (let sec in dbDiccionario) {
            if (sec !== seccionActual && dbDiccionario[sec].terms[s]) {
                seccionExistente = sec;
                break;
            }
        }
        
        if (seccionExistente) {
            if (!confirm(`Esta abreviatura se encuentra ya registrada en [${seccionExistente}], ¿quiere ingresarlo en este apartado?`)) {
                return;
            }
        }

        // 1. Persistencia en el Modelo (Si existe, se sobreescribe = Editar)
        dbDiccionario[seccionActual].terms[s] = { val: m, on: true };
        await eel.guardar_diccionario(dbDiccionario)(); 
        
        // 2. Limpieza de Interfaz
        inSigla.value = ""; inSig.value = ""; 
        renderizarTerminos(); 
        document.getElementById('input-sigla').focus(); 

        // 3. HOT SWAP: Actualizamos el audio sin recargar PDF
        await actualizarFiltrosSnapshot();
    } 
}

async function eliminarSeccion(nombre) {
    if (Object.keys(dbDiccionario).length <= 1) return alert("Debes tener al menos un bloque.");
    if (confirm(`¿Eliminar el bloque "${nombre}" y todos sus términos?`)) {
        delete dbDiccionario[nombre];
        seccionActual = Object.keys(dbDiccionario)[0];
        await eel.guardar_diccionario(dbDiccionario)();
        renderizarSidebar();
        renderizarTerminos();
        await actualizarFiltrosSnapshot();
    }
}
async function moverTerminoABloque(sigla, destino) {
    if (destino === seccionActual) return;
    
    // Clonamos al destino
    dbDiccionario[destino].terms[sigla] = JSON.parse(JSON.stringify(dbDiccionario[seccionActual].terms[sigla]));
    // Borramos del origen
    delete dbDiccionario[seccionActual].terms[sigla];
    
    await eel.guardar_diccionario(dbDiccionario)();
    renderizarTerminos();
    await actualizarFiltrosSnapshot();
}
async function borrarTermino(sigla) { if(confirm("¿Eliminar?")) { delete dbDiccionario[seccionActual].terms[sigla]; await eel.guardar_diccionario(dbDiccionario)(); renderizarTerminos(); } }
function filtrarTerminosUI() { renderizarTerminos(); }
function abrirDiccionarioConPalabra(palabra) { abrirDiccionario(); document.getElementById('input-sigla').value = palabra; document.getElementById('input-significado').focus(); }
function prepararEdicion(sigla) {
    // 1. Verificamos que la sección exista en nuestra RAM (dbDiccionario)
    if (!seccionActual || !dbDiccionario[seccionActual]) return;
    
    const data = dbDiccionario[seccionActual].terms[sigla];
    if (data) {
        // 2. Llenamos los inputs superiores de tu HTML
        document.getElementById('input-sigla').value = sigla;
        document.getElementById('input-significado').value = data.val;
        
        // 3. Llevamos el foco al significado para editar rápido
        document.getElementById('input-significado').focus();
        
        // 4. Feedback visual en la caja de agregar (opcional)
        const cajaAdd = document.querySelector('.add-termino-box');
        if (cajaAdd) {
            cajaAdd.style.border = "2px solid #f39c12";
            setTimeout(() => cajaAdd.style.border = "1px solid #f1c40f", 1000);
        }
    }
}

// DIBUJO E INTERACCIÓN (Versión Alineación Dinámica V5)
// Herramienta de Ingeniería: Conversor para transparencia dinámica
// Colócala fuera de la función dibujar para que esté disponible globalmente
function hexToRGBA(hex, alpha) {
    let r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function dibujar() {
    if (!datosPagina) return; 
    
    let img = new Image(); 
    img.onload = () => {
        // 1. CONFIGURACIÓN DEL LIENZO Y ZOOM
        canvas.width = datosPagina.ancho_img;
        canvas.height = datosPagina.alto_img;
        canvas.style.width = (datosPagina.ancho_img * nivelZoomPDF) + "px";
        canvas.style.height = (datosPagina.alto_img * nivelZoomPDF) + "px";

        ctx.drawImage(img, 0, 0); 
        let z = datosPagina.factor_zoom;
        
        // --- 2. CAPTURA DE PARÁMETROS DINÁMICOS DEL MODAL ---
        const colorGuia = document.getElementById('color-guia-oracion')?.value || "#00b4ff";
        const padGuia = parseInt(document.getElementById('rng-pad-guia')?.value || 2);
        
        const colorKaraoke = document.getElementById('color-resaltado')?.value || "#ffff00";
        const padKaraoke = parseInt(document.getElementById('rng-pad-karaoke')?.value || 2);
        const modoLlenado = document.getElementById('chk-llenado-fluido')?.checked;

        // Actualizar etiquetas de texto en el modal
        if(document.getElementById('val-pad-guia')) document.getElementById('val-pad-guia').innerText = padGuia + "px";
        if(document.getElementById('val-pad-karaoke')) document.getElementById('val-pad-karaoke').innerText = padKaraoke + "px";

        // 3. RENDERIZADO DE LA GUÍA (Oración Punto a Punto)
        if (oracionActiva && oracionActiva.rects) { 
            ctx.fillStyle = hexToRGBA(colorGuia, 0.15); // Fondo sutil
            ctx.strokeStyle = hexToRGBA(colorGuia, 0.30); // Borde guía
            ctx.lineWidth = 1; 
            
            for (let r of oracionActiva.rects) { 
                // Aplicamos Padding Independiente a la Guía
                let x = (r[0] * z) - padGuia;
                let y = (r[1] * z) - padGuia;
                let w = ((r[2] - r[0]) * z) + (padGuia * 2);
                let h = ((r[3] - r[1]) * z) + (padGuia * 2);
                
                ctx.fillRect(x, y, w, h); 
                ctx.strokeRect(x, y, w, h); 
            } 
        }

        // 4. RENDERIZADO DEL KARAOKE (Palabra Activa)
        if (window.palabraKaraoke && window.palabraKaraoke.bbox) {
            let k = window.palabraKaraoke.bbox; 
            const pAudio = (window.partituraActual && window.ultimoIdxAudio !== -1) 
                           ? window.partituraActual[window.ultimoIdxAudio] : null;

            const sub_i = (pAudio && typeof pAudio.sub_i === 'number') ? pAudio.sub_i : 0;
            const sub_t = (pAudio && typeof pAudio.sub_t === 'number' && pAudio.sub_t > 0) ? pAudio.sub_t : 1;
            const progreso = window.progresoFraccional || 0;

            // Dimensiones base con su propio Padding
            let x0 = (k[0] * z) - padKaraoke;
            let y0 = (k[1] * z) - padKaraoke;
            let anchoTotal = ((k[2] - k[0]) * z) + (padKaraoke * 2);
            let altoTotal = ((k[3] - k[1]) * z) + (padKaraoke * 2);

            // Lógica de Llenado vs Brinco
            let anchoActual = modoLlenado 
                ? (sub_i * (anchoTotal / sub_t)) + ((anchoTotal / sub_t) * progreso)
                : anchoTotal;

            // Dibujar Resaltado
            ctx.fillStyle = hexToRGBA(colorKaraoke, 0.75); 
            ctx.fillRect(x0, y0, anchoActual, altoTotal);

            // Borde técnico de enfoque (Foco de Posner)
            if (modoLlenado) {
                ctx.strokeStyle = hexToRGBA(colorKaraoke, 1.0);
                ctx.lineWidth = 2;
                ctx.strokeRect(x0, y0, anchoActual, altoTotal);
            }
        }

        // 5. HOVER (Amarillo translúcido de sistema)
        if (palabraHover) { 
            let b = palabraHover.bbox; 
            ctx.fillStyle = "rgba(255, 200, 0, 0.30)"; 
            ctx.fillRect(b[0]*z, b[1]*z, (b[2]-b[0])*z, (b[3]-b[1])*z); 
        }
// Dentro de dibujar(), justo después del Punto 5 (Hover)
aplicarResaltadoBuscador(ctx, z);
        // 6. Líneas y límites
        let sortedV = [0, ...[...cortesV].sort((a,b)=>a-b), datosPagina.ancho_pagina_pdf]; 
        for (let cv of cortesV) { 
            let x = cv * z; 
            dibujarLinea(x, 0, x, canvas.height, "rgba(255,0,0,0.6)", true); 
            ctx.fillStyle = "red"; ctx.fillRect(x-10, 0, 20, 20); 
        }
        let numCols = cortesV.length > 0 ? cortesV.length + 1 : 1; 
        for(let i=0; i < numCols; i++) { 
            let key = i.toString(); 
            if(limitesH[key]) { 
                let xMin = sortedV[i] * z; let xMax = sortedV[i+1] * z; 
                let yTop = limitesH[key][0] * z; let yBottom = limitesH[key][1] * z; 
                ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; 
                ctx.fillRect(xMin, 0, xMax - xMin, yTop); 
                ctx.fillRect(xMin, yBottom, xMax - xMin, canvas.height - yBottom); 
                dibujarLinea(xMin, yTop, xMax, yTop, "#00ccff", false); 
                dibujarLinea(xMin, yBottom, xMax, yBottom, "#00ccff", false); 
                ctx.fillStyle = "#00ccff"; 
                ctx.fillRect(xMin, yTop - 10, 40, 20); 
                ctx.fillRect(xMax - 40, yBottom - 10, 40, 20); 
            } 
        }
    }; 
    img.src = datosPagina.imagen;
}


function dibujarLinea(x1, y1, x2, y2, color, punteada) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = 3; if(punteada) ctx.setLineDash([10, 5]); else ctx.setLineDash([]); ctx.stroke(); ctx.setLineDash([]); }
canvas.addEventListener('mousedown', (e) => {
    if (!datosPagina) return; let rect = canvas.getBoundingClientRect(); let x = (e.clientX - rect.left) * (canvas.width / rect.width); let y = (e.clientY - rect.top) * (canvas.height / rect.height); let z = datosPagina.factor_zoom;
    for(let i=0; i<cortesV.length; i++) { if(Math.abs(x - cortesV[i]*z) < 20 && y < 50) { arrastre = { tipo: 'V', index: i }; return; } }
    let sortedV = [0, ...[...cortesV].sort((a,b)=>a-b), datosPagina.ancho_pagina_pdf]; let numCols = cortesV.length > 0 ? cortesV.length + 1 : 1; for(let i=0; i < numCols; i++) { let key = i.toString(); let limits = limitesH[key]; if (!limits) continue; let xMin = sortedV[i] * z; let xMax = sortedV[i+1] * z; let yTop = limits[0] * z; let yBottom = limits[1] * z; if (x >= xMin && x <= xMin + 60 && Math.abs(y - yTop) < 30) { arrastre = { tipo: 'H', colKey: key, cual: 0 }; return; } if (x >= xMax - 60 && x <= xMax && Math.abs(y - yBottom) < 30) { arrastre = { tipo: 'H', colKey: key, cual: 1 }; return; } }
});
canvas.addEventListener('mousemove', (e) => {
    if (!datosPagina) return; let rect = canvas.getBoundingClientRect(); let x = (e.clientX - rect.left) * (canvas.width / rect.width); let y = (e.clientY - rect.top) * (canvas.height / rect.height); let z = datosPagina.factor_zoom;
    if (arrastre.tipo === 'V') { cortesV[arrastre.index] = x / z; dibujar(); return; } if (arrastre.tipo === 'H') { limitesH[arrastre.colKey][arrastre.cual] = y / z; dibujar(); return; }
    let mejor = null; let distMin = 9999; for (let p of datosPagina.palabras) { let bx0 = p.bbox[0]*z, by0 = p.bbox[1]*z, bx1 = p.bbox[2]*z, by1 = p.bbox[3]*z; let cx = (bx0+bx1)/2; let cy = (by0+by1)/2; let dist = Math.sqrt(Math.pow(x-cx, 2) + Math.pow(y-cy, 2)); if(dist < 50 && x >= bx0 && x <= bx1 && y >= by0 && y <= by1) { if (dist < distMin) { distMin = dist; mejor = p; } } }
    if (mejor !== palabraHover) { palabraHover = mejor; dibujar(); }
});
canvas.addEventListener('mouseup', () => { 
    if (arrastre.tipo) { 
        arrastre = { tipo: null, index: -1 }; 
        guardarEstadoPaginaActual(); // Guardar al soltar
        cargarPagina(paginaActual); 
    } 
}); 
canvas.addEventListener('click', () => {
    // Si estamos arrastrando una columna, ignoramos el clic
    if (arrastre.tipo) return;

    if (palabraHover) { 
		// 1. DEFINICIÓN DE ÁMBITO (Evita el ReferenceError)
        const panelDicc = document.getElementById('modal-diccionario'); 
        const modalTeatro = document.getElementById('modal-teatro');
        // 1.1 LÓGICA DEL DICCIONARIO (Si está abierto)
        if(panel.style.display === 'flex') { 
            let inpS = document.getElementById('input-significado'); 
            let inpK = document.getElementById('input-sigla'); 
            if(inpK.value === "") { 
                inpK.value = palabraHover.texto; inpK.focus(); 
            } else { 
                inpS.value = inpS.value ? inpS.value + " " + palabraHover.texto : palabraHover.texto; 
                inpS.focus(); 
			} 
            return; // Bloqueamos lectura si el diccionario está operando
        } 

        // --- 1.2 LÓGICA DE CAPTURA PARA MODO TEATRO (Azulito) ---
        else if (modalTeatro && modalTeatro.style.display === 'flex') {
            let inpP = document.getElementById('input-personaje');
            // Limpieza de grado clínico: eliminamos puntuación y forzamos el marcador "Nombre:"
            let nombreLimpio = palabraHover.texto.replace(/[:.,;]/g, "").trim();
            inpP.value = nombreLimpio + ":"; 
            inpP.focus();
            
            // Retornamos para evitar que dispare la lectura del PDF durante el cásting
            return; 
        }
			else { 
            // 2. LÓGICA DE LECTURA (Aquí estaba el fallo)
            let idx = buscarOracionPorGeometria(palabraHover); 
            if (idx !== -1) { 
                
                // --- ✂️ LA GUILLOTINA (Corte inmediato) ✂️ ---
                // Forzamos la detención de todo lo que esté sonando AHORA MISMO
                
                // A) Matar backend y timer
                if (piperQueueTimer) clearInterval(piperQueueTimer);
                try { eel.detener_streaming_backend()(); } catch(e) {}
                
                // B) Matar navegador
                synth.cancel(); 

                // C) MATAR EL SONIDO FÍSICO (Active Sources)
                // Esto es lo que faltaba en el clic izquierdo:
                if (window.activeAudioSources && window.activeAudioSources.length > 0) {
                    window.activeAudioSources.forEach(src => {
                        try { src.stop(); } catch(e) {} 
                    });
                    window.activeAudioSources = []; // Vaciamos lista
                }

                // D) Invalidar sesión anterior (Anti-Overlap)
                if (typeof currentReadingSession === 'undefined') currentReadingSession = 0;
                currentReadingSession++;
                window.currentReadingSession = currentReadingSession;
                // ----------------------------------------------

                // 3. INICIAR NUEVA SECUENCIA
                leyendo = true; 
                reproducirSecuencia(idx); 
            } 
        } 
    }
});

canvas.addEventListener('click', () => {
    // Si estamos arrastrando una columna, ignoramos el clic para evitar saltos accidentales
    if (arrastre.tipo) return;

    if (palabraHover) { 
        // 1. GESTIÓN DE PANELES (Modales activos)
        let panelDicc = document.getElementById('modal-diccionario'); 
        const modalTeatro = document.getElementById('modal-teatro');

        // --- 1.1 LÓGICA DEL DICCIONARIO DE ABREVIATURAS ---
        if (panelDicc && panelDicc.style.display === 'flex') { 
            let inpS = document.getElementById('input-significado'); 
            let inpK = document.getElementById('input-sigla'); 
            if (inpK.value === "") { 
                inpK.value = palabraHover.texto; 
                inpK.focus(); 
            } else { 
                inpS.value = inpS.value ? inpS.value + " " + palabraHover.texto : palabraHover.texto; 
                inpS.focus(); 
            } 
            return; // Bloqueamos lectura si el diccionario está operando
        } 

        // --- 1.2 LÓGICA DE CAPTURA PARA MODO TEATRO (Azulito) ---
        else if (modalTeatro && modalTeatro.style.display === 'flex') {
            let inpP = document.getElementById('input-personaje');
            // Limpieza de grado clínico: eliminamos puntuación y forzamos el marcador "Nombre:"
            let nombreLimpio = palabraHover.texto.replace(/[:.,;]/g, "").trim();
            inpP.value = nombreLimpio + ":"; 
            inpP.focus();
            
            // Retornamos para evitar que dispare la lectura del PDF durante el cásting
            return; 
        }

        // --- 2. LÓGICA DE LECTURA (Solo si los paneles están cerrados) ---
        else { 
            let idx = buscarOracionPorGeometria(palabraHover); 
            if (idx !== -1) { 
                
                // --- ✂️ LA GUILLOTINA (Corte inmediato de seguridad) ---
                // A) Detener motor Piper y temporizadores
                if (window.piperQueueTimer) clearInterval(window.piperQueueTimer);
                try { eel.detener_streaming_backend()(); } catch(e) {}
                
                // B) Cancelar síntesis del navegador (Sistema)
                if (window.synth) synth.cancel(); 

                // C) MATAR EL SONIDO FÍSICO (Active Sources)
                // Detenemos cada fuente de audio activa para evitar el "eco" o solapamiento
                if (window.activeAudioSources && window.activeAudioSources.length > 0) {
                    window.activeAudioSources.forEach(src => {
                        try { src.stop(); } catch(e) {} 
                    });
                    window.activeAudioSources = []; 
                }

                // D) Invalidar sesión para evitar que chunks viejos se reproduzcan
                if (typeof window.currentReadingSession === 'undefined') window.currentReadingSession = 0;
                window.currentReadingSession++;

                // 3. INICIAR NUEVA SECUENCIA
                leyendo = true; 
                reproducirSecuencia(idx); 
            } 
        } 
    }
});



canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault(); 
    
    // Solo si hay palabra seleccionada y NO estamos arrastrando
    if (palabraHover && !arrastre.tipo) { 
        let menu = document.getElementById('menu-contextual'); 
        menu.style.display = 'block'; 
        menu.style.left = e.pageX + 'px'; 
        menu.style.top = e.pageY + 'px'; 
        
        // --- BOTÓN LEER ---
        let btnLeer = document.getElementById('opcion-leer'); 
        let clonLeer = btnLeer.cloneNode(true); 
        btnLeer.parentNode.replaceChild(clonLeer, btnLeer); 
        
        clonLeer.onclick = (evt) => { 
            // 🛡️ EL ESCUDO: Detiene el evento aquí. No baja al canvas.
            if (evt) {
                evt.stopPropagation();
                evt.stopImmediatePropagation();
            }
            empezarDesdePalabra(palabraHover); 
            menu.style.display = 'none'; 
        }; 
        
        // --- BOTÓN DICCIONARIO ---
        let btnDic = document.getElementById('opcion-agregar-dicc'); 
        let clonDic = btnDic.cloneNode(true); 
        btnDic.parentNode.replaceChild(clonDic, btnDic); 
        
        clonDic.onclick = (evt) => { 
            if (evt) {
                evt.stopPropagation();
                evt.stopImmediatePropagation();
            }
            abrirDiccionarioConPalabra(palabraHover.texto); 
            menu.style.display = 'none'; 
        }; 
    }
});
function buscarOracionPorGeometria(palabra) { for (let i = 0; i < datosPagina.oraciones.length; i++) { let oracion = datosPagina.oraciones[i]; for (let r of oracion.rects) { let px=(palabra.bbox[0]+palabra.bbox[2])/2, py=(palabra.bbox[1]+palabra.bbox[3])/2; if (px>=r[0] && px<=r[2] && py>=r[1] && py<=r[3]) return i; } } return -1; }

// --- FUNCIONES AUXILIARES PARA KARAOKE ---
function obtenerPalabrasDeOracion(oracion) {
    if (!oracion || !datosPagina) return [];
    
    let palabrasEncontradas = [];
    let tol = 5; 

    for (let p of datosPagina.palabras) {
        let px = (p.bbox[0] + p.bbox[2]) / 2;
        let py = (p.bbox[1] + p.bbox[3]) / 2;
        
        for (let r of oracion.rects) {
            if (px >= r[0] - tol && px <= r[2] + tol && 
                py >= r[1] - tol && py <= r[3] + tol) {
                palabrasEncontradas.push(p);
                break; 
            }
        }
    }

    palabrasEncontradas.sort((a, b) => {
        let yA = Math.floor(a.bbox[1] / 10);
        let yB = Math.floor(b.bbox[1] / 10);
        if (yA === yB) return a.bbox[0] - b.bbox[0];
        return yA - yB;
    });

    return palabrasEncontradas;
}

// --- FUNCIÓN DE LECTURA MANUAL (VERSIÓN INTEGRAL V23) ---
function empezarDesdePalabra(palabraObj) {
    let idx = buscarOracionPorGeometria(palabraObj);
    if (idx === -1) return;

    // ============================================================
    // 1. LA GUILLOTINA (Limpieza Profunda y Cambio de Sesión)
    // ============================================================
    if (piperQueueTimer) clearInterval(piperQueueTimer);
    isPlayingPiper = false;
    try { eel.detener_streaming_backend()(); } catch(e) {}
    
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    
    // Matar audios físicos
    if (window.activeAudioSources && window.activeAudioSources.length > 0) {
        window.activeAudioSources.forEach(src => {
            try { src.stop(); } catch(e) {} 
        });
        window.activeAudioSources = []; 
    }

    // --- 🎯 EL ANCLA CRÍTICA: Cambiamos la sesión de inmediato ---
    // Esto invalida cualquier chunk de audio que venga en camino de la frase anterior.
    currentReadingSession++;
    window.currentReadingSession = currentReadingSession;

    leyendo = true;
    indiceOracion = idx;
    oracionActiva = datosPagina.oraciones[idx];

    document.getElementById('texto-lectura').innerText = oracionActiva.texto;
    
    // Reset visual del motor gráfico
    if (window.requestID_Karaoke) cancelAnimationFrame(window.requestID_Karaoke);
    window.ultimoMomentoInicioPiper = 0; 
    window.progresoFraccional = 0;
    dibujar();

    // ============================================================
    // 2. PREPARACIÓN DE DATOS CON FILTRO CLÍNICO
    // ============================================================
    let todasLasPalabras = obtenerPalabrasDeOracion(oracionActiva);
    let indicePalabra = todasLasPalabras.indexOf(palabraObj);
    
    if (indicePalabra === -1) {
        indicePalabra = todasLasPalabras.findIndex(p => 
            p.bbox[0] === palabraObj.bbox[0] && p.bbox[1] === palabraObj.bbox[1]
        );
    }
    if (indicePalabra === -1) indicePalabra = 0;

    let visualesRecortados = todasLasPalabras.slice(indicePalabra);
    const resultadoFiltrado = aplicarMascaraParentesis(visualesRecortados);
    
    let visualesFinales = resultadoFiltrado.listaVisual;
    let fragmentoTexto = resultadoFiltrado.textoClean;

    // Actualizamos la lista global para que el motor de dibujo sepa qué pintar
    window.listaPalabrasActuales = visualesFinales;

    // ============================================================
    // 3. RESETEO DE CONTADORES (Sincronía de Fase Cero)
    // ============================================================
    window.lastProcessedSID = -1; // Obliga a procesarAudioRaw a fijar una nueva ancla
    window.duracionAudioAcumulada = 0;
    window.nextScheduleTime = 0; 
    
    // ============================================================
    // 4. INICIAR LECTURA (respetando el modo de traducción activo)
    // ============================================================
    // Inyectamos el fragmento recortado en la oración activa para que
    // reproducirSecuencia use el texto correcto (desde la palabra clickeada).
    // reproducirSecuencia ya maneja TODO: modo solo_traduccion, aprendizaje,
    // subtítulos y lectura normal.
    if (datosPagina && datosPagina.oraciones && datosPagina.oraciones[idx]) {
        // Guardamos el texto original por si acaso
        const textoOriginalOracion = datosPagina.oraciones[idx].texto;
        const palabrasOriginales   = datosPagina.oraciones[idx].palabras;

        // Sobreescribimos temporalmente con el fragmento recortado
        datosPagina.oraciones[idx].texto   = fragmentoTexto;
        datosPagina.oraciones[idx].palabras = visualesFinales;

        // Lanzamos la secuencia completa (traducción incluida)
        reproducirSecuencia(idx).finally(() => {
            // (No restauramos: la oración se sobreescribirá en el siguiente ciclo
            //  o cuando se vuelva a procesar la página. No genera efectos secundarios.)
        });
    } else {
        // Fallback: si no hay datos de oración, llamamos directo
        hablarTexto(fragmentoTexto, () => {
            if (leyendo) reproducirSecuencia(idx + 1);
        }, visualesFinales, vozPredeterminada);
    }
}


// ==========================================

// --- CONTROL DE AUDIO DE FONDO FLOTANTE ---
function toggleMediaFondoPlayPause() {
    if(typeof eel !== 'undefined' && eel.system_media_play_pause) {
        eel.system_media_play_pause()();
        
        // 1. Optimización visual inmediata (Sin esperar a Python)
        let svg = document.getElementById('icono-fondo-play');
        if (svg) {
            let actual = svg.innerHTML;
            if (actual.includes("M8 5")) {
                svg.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'; // Poner pausa
            } else {
                svg.innerHTML = '<path d="M8 5v14l11-7z"/>'; // Poner play
            }
        }
        
        // 2. Confirmación real poco después
        setTimeout(actualizarIconoMediaFondo, 500);
    }
}

async function actualizarIconoMediaFondo() {
    if(typeof eel !== 'undefined' && eel.system_media_status) {
        try {
            let isPlaying = await eel.system_media_status()();
            let svg = document.getElementById('icono-fondo-play');
            if (svg) {
                if (isPlaying) {
                    svg.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'; // Pause
                } else {
                    svg.innerHTML = '<path d="M8 5v14l11-7z"/>'; // Play
                }
            }
        } catch(e) {}
    }
}

setInterval(actualizarIconoMediaFondo, 2000);

function toggleOpcionesSegmentacion() {
    const usarBloques = document.getElementById('chk-usar-bloques').checked;
    document.getElementById('panel-segmentacion-manual').style.display = usarBloques ? 'none' : 'block';
    const barraMain = document.getElementById('barra-segmentacion-manual-main');
    if(barraMain) barraMain.style.display = usarBloques ? 'none' : 'inline-flex';
    const lblSangria = document.getElementById('lbl-sangria-main');
    if(lblSangria) lblSangria.style.display = usarBloques ? 'none' : 'inline-block';
}

window.limpiarCacheTraduccionFrontend = async function() {
    try {
        if (typeof eel !== 'undefined' && eel.limpiar_cache_traducciones) {
            const ok = await eel.limpiar_cache_traducciones()();
            if (ok) {
                alert("🗑️ Caché de traducción eliminada con éxito (Memoria RAM y Disco).");
            } else {
                alert("⚠️ No se pudo vaciar la caché.");
            }
        } else {
            alert("⚠️ Conexión con el backend no disponible.");
        }
    } catch (e) {
        console.error("Error al limpiar caché:", e);
        alert("🗑️ Solicitud de limpieza completada.");
    }
};

