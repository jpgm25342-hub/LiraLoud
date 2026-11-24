function _detectarMotorVozTeatro(vozId) {
    const v = String(vozId || '');
    if (!v) return 'edge';
    if (v.startsWith('Local-kokoro-') || v.includes('kokoro')) return 'kokoro';
    if (v.startsWith('Local-pocket-') || v.includes('pocket')) return 'pocket';
    if (v.startsWith('Local-') || v.endsWith('.onnx')) return 'piper';
    if (v.includes('Neural') || v.includes('Online')) return 'edge';
    return 'navegador';
}

function _normalizarNombreTeatro(txt) {
    return String(txt || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

window.reiniciarLibroTeatro = function (rutaDoc = "") {
    window.libroTeatro = {
        rutaDoc: rutaDoc || (typeof rutaPDFActual !== 'undefined' ? rutaPDFActual : ''),
        obra: window.obraActualTeatro || null,
        intervenciones: [],
        personajes: {}
    };
};

window.sincronizarVocesLibroTeatro = function () {
    if (!window.libroTeatro) return;
    const obra = window.obraActualTeatro;
    const reparto = (obra && dbTeatro && dbTeatro[obra] && dbTeatro[obra].actors) ? dbTeatro[obra].actors : {};
    const personajes = window.libroTeatro.personajes || {};

    for (const [nombre, info] of Object.entries(reparto)) {
        const clave = nombre.replace(/:\s*$/, '').trim() + ':';
        const motor = _detectarMotorVozTeatro(info.voz);
        personajes[clave] = {
            personaje: clave,
            voz: info.voz,
            motor,
            on: info.on !== false,
            parametrosVoz: {
                velocidad: typeof velocidadLectura !== 'undefined' ? velocidadLectura : 1.0,
                pitch: typeof pitchLectura !== 'undefined' ? pitchLectura : 1.0
            }
        };
    }

    window.libroTeatro.obra = obra || null;
    for (const item of window.libroTeatro.intervenciones) {
        const pInfo = personajes[item.personaje];
        if (pInfo && pInfo.on !== false && pInfo.voz) {
            item.voz = pInfo.voz;
            item.motor = pInfo.motor;
            item.parametrosVoz = { ...pInfo.parametrosVoz };
        }
    }
};

window.compilarLibroTeatroPagina = function (numPagina, oracionesPag = null) {
    const ruta = (typeof rutaPDFActual !== 'undefined' ? rutaPDFActual : '') || '';
    if (!window.libroTeatro || window.libroTeatro.rutaDoc !== ruta) {
        window.reiniciarLibroTeatro(ruta);
    }
    const listaOrac = Array.isArray(oracionesPag)
        ? oracionesPag
        : ((typeof datosPagina !== 'undefined' && datosPagina && Array.isArray(datosPagina.oraciones)) ? datosPagina.oraciones : []);
    if (!listaOrac.length) return window.libroTeatro;

    const obra = window.obraActualTeatro;
    const reparto = (obra && dbTeatro && dbTeatro[obra] && dbTeatro[obra].actors) ? dbTeatro[obra].actors : {};
    const vozDefault = (typeof vozPredeterminada !== 'undefined' && vozPredeterminada)
        ? vozPredeterminada
        : (document.getElementById('selector-voz-live')?.value || '');

    // Eliminar entradas previas de esta página para evitar duplicados
    window.libroTeatro.intervenciones = window.libroTeatro.intervenciones.filter(x => x.pagina !== numPagina);

    let personajeActual = 'Narrador:';
    const nuevas = [];
    for (let idx = 0; idx < listaOrac.length; idx++) {
        const txt = String(listaOrac[idx]?.texto || '').trim();
        if (!txt) continue;

        let personajeDetectado = null;
        let textoLimpio = txt;
        const mPrefijo = txt.match(/^\s*([A-ZÁÉÍÓÚÑa-záéíóúñ0-9_\s]{1,28}:)\s*(.*)$/);
        if (mPrefijo) {
            const cand = mPrefijo[1].trim();
            const candNorm = _normalizarNombreTeatro(cand.replace(':', ''));
            for (const actorKey of Object.keys(reparto)) {
                const actorNorm = _normalizarNombreTeatro(actorKey.replace(':', ''));
                if (actorNorm === candNorm || candNorm.endsWith(' ' + actorNorm)) {
                    personajeDetectado = actorKey.endsWith(':') ? actorKey : (actorKey + ':');
                    textoLimpio = (mPrefijo[2] || '').trim() || txt;
                    break;
                }
            }
            if (!personajeDetectado && cand.length <= 24) {
                personajeDetectado = cand;
            }
        }

        if (personajeDetectado) {
            personajeActual = personajeDetectado;
        }
        const actorCfg = reparto[personajeActual] || reparto[personajeActual.replace(':', '')];
        const vozAsignada = (actorCfg && actorCfg.on !== false && actorCfg.voz) ? actorCfg.voz : vozDefault;
        const motorAsignado = _detectarMotorVozTeatro(vozAsignada);
        const params = {
            velocidad: typeof velocidadLectura !== 'undefined' ? velocidadLectura : 1.0,
            pitch: typeof pitchLectura !== 'undefined' ? pitchLectura : 1.0
        };

        if (!window.libroTeatro.personajes[personajeActual]) {
            window.libroTeatro.personajes[personajeActual] = {
                personaje: personajeActual,
                voz: vozAsignada,
                motor: motorAsignado,
                on: actorCfg ? (actorCfg.on !== false) : true,
                parametrosVoz: { ...params }
            };
        }

        nuevas.push({
            id: `p${numPagina}_o${idx}`,
            pagina: numPagina,
            indiceOracion: idx,
            personaje: personajeActual,
            texto: textoLimpio,
            motor: motorAsignado,
            voz: vozAsignada,
            parametrosVoz: params
        });
    }

    window.libroTeatro.intervenciones.push(...nuevas);
    window.libroTeatro.intervenciones.sort((a, b) => (a.pagina - b.pagina) || (a.indiceOracion - b.indiceOracion));
    window.sincronizarVocesLibroTeatro();
    return window.libroTeatro;
};

window.obtenerIntervencionesLibroTeatro = function (pagIni = null, pagFin = null) {
    if (!window.libroTeatro || !Array.isArray(window.libroTeatro.intervenciones)) return [];
    return window.libroTeatro.intervenciones.filter(item => {
        if (pagIni !== null && item.pagina < pagIni) return false;
        if (pagFin !== null && item.pagina > pagFin) return false;
        return true;
    });
};

window.reproducirDesdeLibroTeatro = async function (numPagina, indiceOrac = 0) {
    if (typeof paginaActual !== 'undefined' && paginaActual !== numPagina && typeof cargarPagina === 'function') {
        await cargarPagina(numPagina);
    }
    if (typeof datosPagina !== 'undefined' && datosPagina && Array.isArray(datosPagina.oraciones)) {
        window.compilarLibroTeatroPagina(numPagina, datosPagina.oraciones);
    }
    if (typeof reproducirSecuencia === 'function') {
        leyendo = true;
        reproducirSecuencia(indiceOrac);
    }
};

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
        if (typeof window.sincronizarVocesLibroTeatro === 'function') window.sincronizarVocesLibroTeatro();

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
        if (typeof window.sincronizarVocesLibroTeatro === 'function') window.sincronizarVocesLibroTeatro();
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
            ? `<svg width="14" height="14" style="vertical-align:-2px; margin-right:5px;"><title>Personajes y reglas exclusivas de este PDF</title><use href="assets/icons.svg#icon-clock"></use></svg>`
            : (typeof window.obtenerIconoDialogoSVG === 'function' ? window.obtenerIconoDialogoSVG('teatro', 'lira-inline-svg') + ' ' : '');

        const tituloObra = obra === "Este Libro" ? "Reglas exclusivas de este PDF" : obra;

        div.innerHTML = `
            <span onclick="seleccionarObraTeatro('${obra}')" style="flex:1; cursor:pointer;" title="${tituloObra}">
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
    if (typeof window.sincronizarVocesLibroTeatro === 'function') window.sincronizarVocesLibroTeatro();
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

function sincronizarIndicadorTeatroZen() {
    const chk = document.getElementById('chk-teatro-global');
    const activo = Boolean(chk && chk.checked);
    document.body.classList.toggle('teatro-activo', activo);

    const btnAviso = document.getElementById('btn-zen-teatro-aviso');
    const btnSolo = document.getElementById('btn-solo-lectura');
    if (btnAviso && btnSolo && document.body.classList.contains('modo-minimalista') && activo) {
        const rectSolo = btnSolo.getBoundingClientRect();
        if (rectSolo.width > 0) {
            btnAviso.style.left = `${Math.round(rectSolo.right + 8)}px`;
        }
    }
}

function mostrarAvisoModoTeatro() {
    const existente = document.getElementById('modal-aviso-teatro-zen');
    if (existente) {
        existente.remove();
        return;
    }

    const esc = (typeof window.escapeHtml === 'function')
        ? window.escapeHtml
        : (s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    const txtTitulo = (typeof window.t === 'function') ? window.t('ttl-teatro-activo-aviso', 'Modo Teatro activo') : 'Modo Teatro activo';
    const txtMsg = (typeof window.t === 'function')
        ? window.t('msg-teatro-activo-aviso', 'Tienes el modo teatro activo. Puede que para lecturas que no busquen cambiar de voces te dé problemas; apaga el modo teatro si no lo estás utilizando.')
        : 'Tienes el modo teatro activo. Puede que para lecturas que no busquen cambiar de voces te dé problemas; apaga el modo teatro si no lo estás utilizando.';
    const txtApagar = (typeof window.t === 'function') ? window.t('btn-apagar-teatro', 'Apagar Modo Teatro') : 'Apagar Modo Teatro';
    const txtEntendido = (typeof window.t === 'function') ? window.t('btn-entendido', 'Entendido') : 'Entendido';

    const btnAviso = document.getElementById('btn-zen-teatro-aviso');
    const r = btnAviso ? btnAviso.getBoundingClientRect() : null;
    const topPos = r && r.bottom > 0 ? Math.round(r.bottom + 8) : 68;
    const leftPos = r && r.left > 0 ? Math.max(16, Math.round(r.left - 40)) : 25;

    const overlay = document.createElement('div');
    overlay.id = 'modal-aviso-teatro-zen';
    overlay.className = 'teatro-aviso-popover-backdrop';
    overlay.innerHTML = `
        <div class="teatro-aviso-popup-card" role="dialog" aria-modal="false" style="top:${topPos}px; left:${leftPos}px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <div style="display:flex; align-items:center; gap:6px; color:#8e44ad; font-weight:700; font-size:13.5px;">
                    <svg viewBox="0 -64 640 640" width="16" height="16" fill="currentColor" aria-hidden="true">
                        <path d="M206.86 245.15c-35.88 10.45-59.95 41.2-57.53 74.1 11.4-12.72 28.81-23.7 49.9-30.92l7.63-43.18zM95.81 295L64.08 115.49c-.29-1.62.28-2.62.24-2.65 57.76-32.06 123.12-49.01 189.01-49.01 1.61 0 3.23.17 4.85.19 13.95-13.47 31.73-22.83 51.59-26 18.89-3.02 38.05-4.55 57.18-5.32-9.99-13.95-24.48-24.23-41.77-27C301.27 1.89 277.24 0 253.32 0 176.66 0 101.02 19.42 33.2 57.06 9.03 70.48-3.92 98.48 1.05 126.58l31.73 179.51c14.23 80.52 136.33 142.08 204.45 142.08 3.59 0 6.75-.46 10.01-.8-13.52-17.08-28.94-40.48-39.5-67.58-47.61-12.98-106.06-51.62-111.93-84.79zm97.55-137.46c-.73-4.12-2.23-7.87-4.07-11.4-8.25 8.91-20.67 15.75-35.32 18.32-14.65 2.58-28.67.4-39.48-5.17-.52 3.94-.64 7.98.09 12.1 3.84 21.7 24.58 36.19 46.34 32.37 21.75-3.82 36.28-24.52 32.44-46.22zM606.8 120.9c-88.98-49.38-191.43-67.41-291.98-51.35-27.31 4.36-49.08 26.26-54.04 54.36l-31.73 179.51c-15.39 87.05 95.28 196.27 158.31 207.35 63.03 11.09 204.47-53.79 219.86-140.84l31.73-179.51c4.97-28.11-7.98-56.11-32.15-69.52zm-273.24 96.8c3.84-21.7 24.58-36.19 46.34-32.36 21.76 3.83 36.28 24.52 32.45 46.22-.73 4.12-2.23 7.87-4.07 11.4-8.25-8.91-20.67-15.75-35.32-18.32-14.65-2.58-28.67-.4-39.48 5.17-.53-3.95-.65-7.99.08-12.11zm70.47 198.76c-55.68-9.79-93.52-59.27-89.04-112.9 20.6 25.54 56.21 46.17 99.49 53.78 43.28 7.61 83.82.37 111.93-16.6-14.18 51.94-66.71 85.51-122.38 75.72zm130.3-151.34c-8.25-8.91-20.68-15.75-35.33-18.32-14.65-2.58-28.67-.4-39.48 5.17-.52-3.94-.64-7.98.09-12.1 3.84-21.7 24.58-36.19 46.34-32.37 21.75 3.83 36.28 24.52 32.45 46.22-.73 4.13-2.23 7.88-4.07 11.4z"/>
                    </svg>
                    <span>${esc(txtTitulo)}</span>
                </div>
                <button type="button" id="btn-cerrar-aviso-teatro-x" class="btn-cerrar-x" style="font-size:13px; padding:2px 6px;">✕</button>
            </div>
            <p style="margin:0; font-size:12.5px; line-height:1.45;">${esc(txtMsg)}</p>
            <div style="display:flex; justify-content:flex-end; gap:6px;">
                <button type="button" id="btn-aviso-apagar-teatro" class="btn-principal" style="background:#e74c3c; font-size:12px; padding:5px 10px;">${esc(txtApagar)}</button>
                <button type="button" id="btn-aviso-entendido-teatro" class="btn-principal" style="background:#3498db; font-size:12px; padding:5px 10px;">${esc(txtEntendido)}</button>
            </div>
        </div>
    `;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);

    const btnCerrarX = document.getElementById('btn-cerrar-aviso-teatro-x');
    const btnEntendido = document.getElementById('btn-aviso-entendido-teatro');
    const btnApagar = document.getElementById('btn-aviso-apagar-teatro');
    if (btnCerrarX) btnCerrarX.addEventListener('click', () => overlay.remove());
    if (btnEntendido) btnEntendido.addEventListener('click', () => overlay.remove());
    if (btnApagar) {
        btnApagar.addEventListener('click', () => {
            const c = document.getElementById('chk-teatro-global');
            if (c) {
                c.checked = false;
                c.dispatchEvent(new Event('change', { bubbles: true }));
            }
            sincronizarIndicadorTeatroZen();
            if (typeof guardarTodosAjustes === 'function') guardarTodosAjustes();
            overlay.remove();
        });
    }
}

window.sincronizarIndicadorTeatroZen = sincronizarIndicadorTeatroZen;
window.mostrarAvisoModoTeatro = mostrarAvisoModoTeatro;

document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'chk-teatro-global') {
        sincronizarIndicadorTeatroZen();
    }
});
document.addEventListener('DOMContentLoaded', sincronizarIndicadorTeatroZen);
window.addEventListener('resize', sincronizarIndicadorTeatroZen);
window.addEventListener('lira:idioma-cambiado', () => setTimeout(sincronizarIndicadorTeatroZen, 60));
setTimeout(sincronizarIndicadorTeatroZen, 600);

