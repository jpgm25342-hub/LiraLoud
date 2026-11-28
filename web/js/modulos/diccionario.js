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

    // 📖 Inyectar pestaña dinámica "Este Libro" desde libros_reglas.json
    if (typeof eel !== 'undefined' && typeof eel.cargar_reglas_libro === 'function') {
        eel.cargar_reglas_libro()().then(reglas => {
            if (dbDiccionario) {
                const dicLibro = (reglas && reglas.diccionario) ? reglas.diccionario : {};
                dbDiccionario["Este Libro"] = (dicLibro.terms && typeof dicLibro.terms === 'object')
                    ? dicLibro
                    : { active: true, terms: dicLibro };
                renderizarSidebar();
                renderizarTerminos();
            }
        }).catch(() => { });
    }

    // Ordenamos el dibujo inmediato de la interfaz
    renderizarSidebar();  // Dibuja las pestañas arriba
    renderizarTerminos(); // Dibuja la lista de abreviaturas 

    console.log(`📘 Diccionario abierto en bloque: ${seccionActual}`);
}
function cerrarDiccionario() {
    if (dbDiccionario && dbDiccionario["Este Libro"] && typeof eel !== 'undefined' && typeof eel.guardar_reglas_libro === 'function') {
        eel.guardar_reglas_libro(null, 'diccionario', dbDiccionario["Este Libro"])().catch(() => { });
    }
    document.getElementById('modal-diccionario').style.display = 'none';
    modoEdicionDiccionario = false;
    if (window.tutorialActivo) {
        if (typeof dibujar === 'function') dibujar();
        return;
    }
    // Optimización: Si hay un documento abierto, aplicar cambios de diccionario vía Snapshot
    // sin re-renderizar todo el PDF (evita 60-120 ms de congelamiento y parpadeo de pantalla)
    if (typeof datosPagina !== 'undefined' && datosPagina && typeof actualizarFiltrosSnapshot === 'function') {
        actualizarFiltrosSnapshot(false);
    } else if (typeof cargarPagina === 'function' && typeof paginaActual !== 'undefined') {
        cargarPagina(paginaActual);
    }
}
function obtenerDiccionarioConsolidado() {
    let consolidado = {};
    for (let sec in dbDiccionario) {
        if (dbDiccionario[sec].active) {
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
    const menuTab = document.getElementById('menu-contextual-tab');
    if (menuTab && menuTab.style.display === 'block' && !menuTab.contains(e.target)) {
        ocultarMenuContextualTab();
    }
    const menuCtx = document.getElementById('menu-contextual');
    if (menuCtx && menuCtx.style.display === 'block' && !menuCtx.contains(e.target)) {
        menuCtx.style.display = 'none';
    }
});

async function abrirRenombrarSeccionActual() {
    ocultarMenuContextualTab();
    if (!seccionSeleccionadaParaMenu) return;
    const nombreViejo = seccionSeleccionadaParaMenu;
    const nuevoNombre = await liraPrompt(`Cambiar nombre del bloque "${nombreViejo}":`, nombreViejo, 'etiqueta');
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
        await liraAlert(`Ya existe un bloque con el nombre "${nombreNuevo}".`, 'advertencia');
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

    await guardarDiccionarioSinEsteLibro();
    renderizarSidebar();
    renderizarTerminos();

    if (typeof actualizarFiltrosSnapshot === 'function') {
        await actualizarFiltrosSnapshot();
    }
    console.log(`✅ Bloque renombrado de "${nombreViejo}" a "${nombreNuevo}".`);
}
window.renombrarSeccion = renombrarSeccion;

async function guardarDiccionarioSinEsteLibro() {
    if (!dbDiccionario) return;
    if (dbDiccionario["Este Libro"] && typeof eel !== 'undefined' && typeof eel.guardar_reglas_libro === 'function') {
        await eel.guardar_reglas_libro(null, 'diccionario', dbDiccionario["Este Libro"])();
    }
    const copiaGlobal = { ...dbDiccionario };
    delete copiaGlobal["Este Libro"];
    await eel.guardar_diccionario(copiaGlobal)();
}

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

function _crearTabSeccionDiccionario(nombreSec) {
    const div = document.createElement('div');
    div.className = `tab-item ${seccionActual === nombreSec ? 'active' : ''}`;
    div.draggable = true;
    div.dataset.nombre = nombreSec;

    div.addEventListener('dragstart', () => div.classList.add('dragging-tab'));
    div.addEventListener('dragend', () => {
        div.classList.remove('dragging-tab');
        guardarOrdenSecciones();
    });
    div.addEventListener('click', (e) => {
        if (e.target.closest('.tab-acciones')) return;
        cambiarPestañaDiccionario(nombreSec);
    });
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        mostrarMenuContextualTab(e, nombreSec);
    });
    div.addEventListener('dblclick', async (e) => {
        if (e.target.closest('.tab-acciones')) return;
        e.preventDefault();
        e.stopPropagation();
        const nuevoNombre = await liraPrompt(`Cambiar nombre del bloque "${nombreSec}":`, nombreSec, 'etiqueta');
        if (nuevoNombre && nuevoNombre.trim() && nuevoNombre.trim() !== nombreSec) {
            renombrarSeccion(nombreSec, nuevoNombre.trim());
        }
    });

    const esEsteLibro = nombreSec === "Este Libro";
    const iconoReloj = esEsteLibro
        ? `<svg width="14" height="14" style="vertical-align:-2px; margin-right:5px;"><title>Abreviaturas y reglas exclusivas de este PDF</title><use href="assets/icons.svg#icon-clock"></use></svg>`
        : '';
    const tituloTab = esEsteLibro
        ? "Reglas exclusivas de este PDF (clic derecho o doble clic para cambiar nombre)"
        : "Clic derecho o doble clic para cambiar nombre";

    div.innerHTML = `
        <span class="tab-nombre-texto" style="flex:1;" title="${tituloTab}">
            ${iconoReloj}${nombreSec}
        </span>
        <div class="tab-acciones">
            <input type="checkbox" ${dbDiccionario[nombreSec].active ? 'checked' : ''} 
                   onchange="toggleSeccion('${nombreSec}', this.checked); event.stopPropagation();"
                   style="cursor:pointer;" title="Activar/desactivar bloque">
            
            <span onclick="eliminarSeccion('${nombreSec}'); event.stopPropagation();" 
                  class="btn-cerrar-bloque" title="Eliminar bloque">✕</span>
        </div>
    `;
    return div;
}

function _habilitarDragReordenarTabsDiccionario(lista) {
    if (lista.dataset.dragEnabled) return;
    lista.dataset.dragEnabled = "true";
    lista.addEventListener('dragover', e => {
        e.preventDefault();
        const draggingTab = document.querySelector('.dragging-tab');
        if (!draggingTab) return;

        const tabs = [...lista.querySelectorAll('.tab-item:not(.dragging-tab)')];
        const afterElement = tabs.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = e.clientY - box.top - box.height / 2;
            return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;

        if (afterElement == null) lista.appendChild(draggingTab);
        else lista.insertBefore(draggingTab, afterElement);
    });
}

function renderizarSidebar() {
    const lista = document.getElementById('lista-secciones');
    if (!lista) return;
    lista.innerHTML = "";

    const fragment = document.createDocumentFragment();
    const seccionesOrdenadas = Object.keys(dbDiccionario).sort((a, b) => (a === "Este Libro" ? -1 : b === "Este Libro" ? 1 : 0));
    for (const nombreSec of seccionesOrdenadas) {
        fragment.appendChild(_crearTabSeccionDiccionario(nombreSec));
    }
    lista.appendChild(fragment);
    _habilitarDragReordenarTabsDiccionario(lista);
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
        await guardarDiccionarioSinEsteLibro();
        console.log("✅ Orden de pestañas sincronizado.");
    }, 500);
}
window.toggleSeccion = async (nombre, estado) => { dbDiccionario[nombre].active = estado; await guardarDiccionarioSinEsteLibro(); };
async function crearSeccion() { let input = document.getElementById('input-nueva-seccion'); let nombre = input.value.trim(); if (nombre && !dbDiccionario[nombre]) { dbDiccionario[nombre] = { active: true, terms: {} }; await guardarDiccionarioSinEsteLibro(); seccionActual = nombre; input.value = ""; renderizarSidebar(); renderizarTerminos(); } }

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
    if (dbDiccionario[seccionActual] && dbDiccionario[seccionActual].terms[sigla]) {
        dbDiccionario[seccionActual].terms[sigla].on = estado;
        await guardarDiccionarioSinEsteLibro();
        renderizarTerminos();

        // RECARGA INVISIBLE: Piper tirará el audio viejo y leerá con el nuevo estado
        await actualizarFiltrosSnapshot();
    }
};

async function agregarTermino() {
    if (!seccionActual) { await liraAlert("Selecciona una sección primero", 'advertencia'); return; }

    let inSigla = document.getElementById('input-sigla');
    let inSig = document.getElementById('input-significado');
    let s = inSigla.value.trim();
    let m = inSig.value.trim();

    if (s) {
        // Verificar si la sigla ya existe en otra pestaña
        let seccionExistente = null;
        for (let sec in dbDiccionario) {
            if (sec !== seccionActual && dbDiccionario[sec]?.terms?.[s]) {
                seccionExistente = sec;
                break;
            }
        }

        if (seccionExistente) {
            if (!await liraConfirm(`Esta abreviatura se encuentra ya registrada en [${seccionExistente}], ¿quiere ingresarlo en este apartado?`, 'advertencia')) {
                return;
            }
        }

        // 1. Persistencia en el Modelo (Si existe, se sobreescribe = Editar)
        dbDiccionario[seccionActual].terms[s] = { val: m, on: true };
        await guardarDiccionarioSinEsteLibro();

        // 2. Limpieza de Interfaz
        inSigla.value = ""; inSig.value = "";
        renderizarTerminos();
        document.getElementById('input-sigla').focus();

        // 3. HOT SWAP: Actualizamos el audio sin recargar PDF
        await actualizarFiltrosSnapshot();
    }
}

async function eliminarSeccion(nombre) {
    if (Object.keys(dbDiccionario).length <= 1) { await liraAlert("Debes tener al menos un bloque.", 'advertencia'); return; }
    if (await liraConfirm(`¿Eliminar el bloque "${nombre}" y todos sus términos?`, 'borrar')) {
        delete dbDiccionario[nombre];
        seccionActual = Object.keys(dbDiccionario)[0];
        await guardarDiccionarioSinEsteLibro();
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

    await guardarDiccionarioSinEsteLibro();
    renderizarTerminos();
    await actualizarFiltrosSnapshot();
}
async function borrarTermino(sigla) { if (await liraConfirm("¿Eliminar este término?", 'borrar')) { delete dbDiccionario[seccionActual].terms[sigla]; await guardarDiccionarioSinEsteLibro(); renderizarTerminos(); } }
function filtrarTerminosUI() { renderizarTerminos(); }
function abrirDiccionarioConPalabra(palabra) { abrirDiccionario(); document.getElementById('input-sigla').value = palabra; document.getElementById('input-significado').focus(); }
