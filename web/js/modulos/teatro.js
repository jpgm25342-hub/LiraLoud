// --- FUNCIONES DE CONTROL DE MODAL TEATRO ---
async function abrirTeatro() {
    detenerLectura();

    // 🛡️ LÓGICA DE EXCLUSIÓN MUTUA UNIVERSAL
    if (typeof cerrarOtrasFuncionesPrincipales === 'function') {
        cerrarOtrasFuncionesPrincipales('teatro');
    }

    try {
        const reglas = await eel.cargar_reglas_libro()();
        if (typeof dbTeatro === 'object' && dbTeatro !== null) {
            dbTeatro["Este Libro"] = reglas?.teatro || { actors: {}, active: true };
        }
    } catch (e) {
        console.warn("No se pudieron cargar las reglas de teatro del libro:", e);
    }

    const modal = document.getElementById('modal-teatro');
    if (modal) {
        modal.style.display = 'flex';
        cargarIdiomasTeatro();
        renderizarSidebarTeatro();
        renderizarActores();
    }
}

function cerrarTeatro() {
    const modal = document.getElementById('modal-teatro');
    if (modal) modal.style.display = 'none';
    if (typeof dbTeatro === 'object' && dbTeatro !== null && dbTeatro["Este Libro"]) {
        eel.guardar_reglas_libro(null, 'teatro', dbTeatro["Este Libro"])();
    }
    // Persistencia: Guardar el estado al salir
    if (typeof guardarAjustesTeatro === "function") guardarAjustesTeatro();
}


function cargarIdiomasTeatro() {
    let selIdioma = document.getElementById('select-idioma-teatro');
    if (!selIdioma) return;

    let valorPrevio = selIdioma.value;
    selIdioma.innerHTML = "";

    const add = (iso, nombre) => {
        let opt = document.createElement('option');
        opt.value = iso;
        opt.innerText = nombre;
        selIdioma.appendChild(opt);
    };

    // --- LISTA MAESTRA DEFINITIVA (Idéntica al primordial) ---
    if (typeof poblarSelectIdiomas === 'function') poblarSelectIdiomas(selIdioma);
    if (valorPrevio) selIdioma.value = valorPrevio;
    else selIdioma.value = 'es'; // Por defecto español para teatro

    filtrarVocesTeatroClon();
}

function filtrarVocesTeatroClon() {
    let elFiltro = document.getElementById('select-idioma-teatro');
    let langFilter = elFiltro ? elFiltro.value : 'es';

    let selVoz = document.getElementById('select-voz-teatro');
    if (!selVoz) return;
    selVoz.innerHTML = "";

    let safeVocesPython = (typeof vocesPython !== 'undefined' && vocesPython) ? vocesPython : [];
    let safeVocesSistema = (typeof vocesSistema !== 'undefined' && vocesSistema) ? vocesSistema : [];

    let todasLasVoces = [];

    // 1. Procesar Piper y Nube (igual al primordial)
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

    // 3. Renderizado en el select del Teatro
    todasLasVoces.forEach(voz => {
        let opt = document.createElement('option');
        opt.value = voz.id;
        opt.innerText = voz.nombre;
        opt.setAttribute('data-origen', voz.origen);
        if (voz.origen === 'piper') {
            opt.style.color = "#2980b9";
            opt.style.fontWeight = "500";
        }
        selVoz.appendChild(opt);
    });

    if (selVoz.options.length > 0) {
        selVoz.selectedIndex = 0;
        const inpVozTeatro = document.getElementById('busqueda-voz-teatro');
        if (inpVozTeatro) inpVozTeatro.value = selVoz.options[0].text;
    }
}

// --- CONTROLADORES TIPO WINDOWS SEARCH STYLE PARA EL TEATRO ---
function abrirComboTeatro(tipo) {
    const el = document.getElementById(tipo === 'idioma' ? 'select-idioma-teatro' : 'select-voz-teatro');
    if (el) {
        Array.from(el.options).forEach(opt => opt.style.display = "block");
        el.style.display = 'block';
    }
}

function filtrarComboTeatro(tipo) {
    const query = document.getElementById(`busqueda-${tipo}-teatro`).value.toLowerCase();
    const sel = document.getElementById(tipo === 'idioma' ? 'select-idioma-teatro' : 'select-voz-teatro');
    if (!sel) return;

    sel.style.display = 'block';

    Array.from(sel.options).forEach(opt => {
        opt.style.display = opt.text.toLowerCase().includes(query) ? "block" : "none";
    });
}

function seleccionarComboTeatro(tipo) {
    const sel = document.getElementById(tipo === 'idioma' ? 'select-idioma-teatro' : 'select-voz-teatro');
    const inp = document.getElementById(`busqueda-${tipo}-teatro`);

    if (sel && sel.selectedIndex !== -1) {
        const valorNuevo = sel.options[sel.selectedIndex].text;
        inp.value = valorNuevo;
        sel.style.display = 'none';

        if (tipo === 'idioma') {
            filtrarVocesTeatroClon(); // Refresca las voces del teatro según el idioma seleccionado
            document.getElementById('busqueda-voz-teatro').value = ""; // Limpia la caja para obligar a elegir
        }
    }
}

function filtrarVocesTeatro() {
    if (!document.getElementById('busqueda-idioma-teatro')) { if (typeof filtrarVocesTeatroClon === 'function') filtrarVocesTeatroClon(); return; }
    // 1. Leemos la caja de texto en lugar del select oculto
    const inputTexto = document.getElementById('busqueda-idioma-teatro').value.toLowerCase().trim();
    const selVoz = document.getElementById('select-voz-teatro');
    const selectorMaestro = document.getElementById('modal-voz');

    if (!selVoz || !selectorMaestro) return;

    // 2. Mapeo para traducir texto humano a código
    const mapaIdiomas = { "español": "es", "ingles": "en", "inglés": "en", "mexico": "es-mx" };
    const lang = mapaIdiomas[inputTexto] || inputTexto;

    selVoz.innerHTML = "";

    Array.from(selectorMaestro.options).forEach(opt => {
        let idVoz = opt.value;
        let nombreVoz = opt.text.toLowerCase();

        // Bloqueo de voces de Windows
        if (idVoz.includes(" ") && !idVoz.startsWith("Local-")) return;

        let coincide = false;
        let idLower = idVoz.toLowerCase();

        if (lang === 'es' && (idLower.includes('-es-') || idLower.includes('_es') || idLower.includes('es-') || nombreVoz.includes('spanish') || nombreVoz.includes('español'))) coincide = true;
        else if (lang === 'en' && (idLower.includes('-en-') || idLower.includes('_en') || nombreVoz.includes('english'))) coincide = true;
        else if (idLower.includes(lang) || nombreVoz.includes(lang)) coincide = true;

        if (coincide) {
            let nuevaOpt = document.createElement('option');
            nuevaOpt.value = idVoz;
            nuevaOpt.innerText = opt.text;
            selVoz.appendChild(nuevaOpt);
        }
    });
}

function renderizarActores() {
    if (!obraActualTeatro || !dbTeatro[obraActualTeatro]) {
        const tabla = document.getElementById('tabla-actores');
        if (tabla) {
            tabla.innerHTML = "<div style='color:#7f8c8d; font-size:11px; text-align:center; padding:20px;'>Crea o selecciona una obra para asignar actores.</div>";
        }
        return;
    }

    const contenedor = document.getElementById('tabla-actores');
    if (!contenedor) return;
    contenedor.innerHTML = "";

    const actores = dbTeatro[obraActualTeatro].actors;

    // 1. FUNCIONES AUXILIARES FUERA DEL BUCLE (Aquí estaba el error original)
    function habilitarDragTeatro(cont) {
        cont.addEventListener('dragover', e => {
            e.preventDefault();
            const draggingItem = document.querySelector('.dragging');
            if (!draggingItem || !draggingItem.classList.contains('fila-actor')) return;

            const afterElement = getDragAfterElement(cont, e.clientY);
            if (afterElement == null) {
                cont.appendChild(draggingItem);
            } else {
                cont.insertBefore(draggingItem, afterElement);
            }
        });
    }

    async function guardarOrdenTeatro() {
        let nuevoOrdenActors = {};
        const filas = document.querySelectorAll('.fila-actor');

        filas.forEach(f => {
            const personaje = f.dataset.personaje;
            if (personaje && dbTeatro[obraActualTeatro].actors[personaje]) {
                nuevoOrdenActors[personaje] = dbTeatro[obraActualTeatro].actors[personaje];
            }
        });

        dbTeatro[obraActualTeatro].actors = nuevoOrdenActors;
        await eel.guardar_diccionario_teatro(dbTeatro)();
        console.log("🎭 Elenco reordenado y sincronizado.");
    }

    // 2. BUCLE PARA CREAR CADA FILA DE ACTOR
    for (let personaje in actores) {
        const data = actores[personaje];
        const fila = document.createElement('div');
        fila.className = "fila-termino fila-actor";
        fila.draggable = true;
        fila.dataset.personaje = personaje;

        const iconoRayo = (typeof window.obtenerIconoDialogoSVG === 'function')
            ? window.obtenerIconoDialogoSVG('rayo', 'lira-inline-svg')
            : '';

        fila.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                <input type="checkbox" class="switch-individual" ${data.on ? 'checked' : ''} 
                       onchange="toggleActorIndividual('${personaje}', this.checked)">
                <div style="display:flex; flex-direction:column; cursor:pointer; flex:1; min-width:0;" onclick="prepararEdicionActor('${personaje}')">
                    <span style="font-weight:700; color:#2c3e50;">${personaje}</span>
                    <span class="badge-voz-actor">${iconoRayo}${data.voz.replace("Local-", "")}</span>
                </div>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
                <span class="btn-editar-term" onclick="prepararEdicionActor('${personaje}')" title="Editar">
                    <svg class="svg-icon" viewBox="0 0 16 16" fill="currentColor" style="width:14px; height:14px;">
                        <path d="M8.29289 3.70711L1 11V15H5L12.2929 7.70711L8.29289 3.70711Z"/>
                        <path d="M9.70711 2.29289L13.7071 6.29289L15.1716 4.82843C15.702 4.29799 16 3.57857 16 2.82843C16 1.26633 14.7337 0 13.1716 0C12.4214 0 11.702 0.297995 11.1716 0.828428L9.70711 2.29289Z"/>
                    </svg>
                </span>
                <span onclick="borrarActor('${personaje}')" class="btn-borrar-term" title="Eliminar">✕</span>
            </div>
        `;

        fila.addEventListener('dragstart', () => fila.classList.add('dragging'));
        fila.addEventListener('dragend', () => {
            fila.classList.remove('dragging');
            guardarOrdenTeatro();
        });

        contenedor.appendChild(fila);
    }

    // 3. ACTIVAR DRAG & DROP AL FINAL
    habilitarDragTeatro(contenedor);
}


async function agregarActor() {
    if (!obraActualTeatro) { await liraAlert("Selecciona o crea una obra primero.", 'advertencia'); return; }

    const inPersonaje = document.getElementById('input-personaje');
    const selVoz = document.getElementById('select-voz-teatro');

    let nombre = inPersonaje.value.trim();
    // Forzamos que termine en ":" si el usuario lo olvida para la coherencia del Regex
    if (nombre && !nombre.endsWith(":")) nombre += ":";

    if (nombre) {
        // 1. Inyección en el Modelo (dbTeatro)
        dbTeatro[obraActualTeatro].actors[nombre] = {
            voz: selVoz.value,
            on: true
        };

        // 2. Persistencia en disco vía Python
        await eel.guardar_diccionario_teatro(dbTeatro)();

        // 3. Limpieza y Feedback
        inPersonaje.value = "";
        renderizarActores();
        inPersonaje.focus();

        console.log(`🎭 Actor asignado: ${nombre} con voz ${selVoz.value}`);
    }
}

// --- FUNCIONES DE PERSISTENCIA Y ESTADO ---
window.toggleActorIndividual = async (personaje, estado) => {
    if (dbTeatro[obraActualTeatro] && dbTeatro[obraActualTeatro].actors[personaje]) {
        dbTeatro[obraActualTeatro].actors[personaje].on = estado;
        await eel.guardar_diccionario_teatro(dbTeatro)();
        renderizarActores();
    }
};

async function eliminarObraTeatro(nombre) {
    if (await liraConfirm(`¿Eliminar la obra "${nombre}"?`, 'borrar')) {
        delete dbTeatro[nombre];
        obraActualTeatro = Object.keys(dbTeatro)[0] || null;
        await eel.guardar_diccionario_teatro(dbTeatro)();
        renderizarSidebarTeatro();
        renderizarActores();
    }
}

async function borrarActor(personaje) {
    if (await liraConfirm(`¿Eliminar al actor ${personaje}?`, 'teatro')) {
        delete dbTeatro[obraActualTeatro].actors[personaje];
        await eel.guardar_diccionario_teatro(dbTeatro)();
        renderizarActores();
    }
}

function prepararEdicionActor(personaje) {
    if (!obraActualTeatro || !dbTeatro[obraActualTeatro]) return;
    const data = dbTeatro[obraActualTeatro].actors[personaje];
    if (!data) return;

    // 🛡️ Blindaje contra elementos nulos en el DOM
    const inpP = document.getElementById('input-personaje');
    if (inpP) inpP.value = personaje;

    const selVoz = document.getElementById('select-voz-teatro');
    if (selVoz) {
        selVoz.value = data.voz;

        // Sincronizar el input de búsqueda de voz si existe
        const inpVozTeatro = document.getElementById('busqueda-voz-teatro');
        if (inpVozTeatro) {
            let opt = Array.from(selVoz.options).find(o => o.value === data.voz);
            if (opt) inpVozTeatro.value = opt.text;
        }
    }
}


function renderizarSidebarTeatro() {
    const lista = document.getElementById('lista-obras-teatro');
    lista.innerHTML = "";

    const obrasOrdenadas = Object.keys(dbTeatro).sort((a, b) => (a === "Este Libro" ? -1 : b === "Este Libro" ? 1 : 0));
    for (let obra of obrasOrdenadas) {
        const div = document.createElement('div');
        div.className = `tab-item tab-teatro ${obraActualTeatro === obra ? 'active' : ''}`;

        const iconoObra = obra === "Este Libro"
            ? `<svg width="14" height="14" style="vertical-align:-2px; margin-right:5px;"><use href="assets/icons.svg#icon-clock"></use></svg>`
            : (typeof window.obtenerIconoDialogoSVG === 'function' ? window.obtenerIconoDialogoSVG('teatro', 'lira-inline-svg') + ' ' : '');

        div.innerHTML = `
            <span onclick="seleccionarObraTeatro('${obra}')" style="flex:1; cursor:pointer;">
                ${iconoObra}${obra}
            </span>
            <span onclick="eliminarObraTeatro('${obra}'); event.stopPropagation();" 
                  class="btn-cerrar-bloque" title="Eliminar obra">✕</span>
        `;
        lista.appendChild(div);
    }
}

function seleccionarObraTeatro(nombre) {
    obraActualTeatro = nombre;
    renderizarSidebarTeatro();
    renderizarActores();
    guardarTodosAjustes(); // 💾 Notificamos a Python el cambio de obra
}

async function crearObraTeatro() {
    const input = document.getElementById('input-nueva-obra');
    const nombre = input.value.trim();
    if (nombre && !dbTeatro[nombre]) {
        dbTeatro[nombre] = { active: true, actors: {} };
        await eel.guardar_diccionario_teatro(dbTeatro)();
        input.value = "";
        seleccionarObraTeatro(nombre);
    }
}

