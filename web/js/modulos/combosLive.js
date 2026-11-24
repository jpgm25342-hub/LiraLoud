function guardarPreferenciaIdioma(nombre) {
    localStorage.setItem('idioma_preferido_lira', nombre);
}

async function filtrarVocesPorIdiomaLive() {
    const inputStr = document.getElementById('busqueda-idioma-live').value.toLowerCase().trim();

    // Sincronizar también el select #filtro-idioma si el texto coincide con una opción
    const selFiltro = document.getElementById('filtro-idioma');
    if (selFiltro && selFiltro.options.length > 0 && inputStr) {
        const optMatch = Array.from(selFiltro.options).find(
            o => o.text.toLowerCase() === inputStr
                || o.value.toLowerCase() === inputStr
                || (o.dataset?.aliases && o.dataset.aliases.split(/\s+/).includes(inputStr))
        );
        if (optMatch) selFiltro.value = optMatch.value;
    }

    // Mapeo de autónimos, español e inglés para evitar listas vacías
    const mapa = {
        "español": "es", "espanol": "es", "spanish": "es", "mexico": "es-mx",
        "inglés": "en", "ingles": "en", "english": "en",
        "francés": "fr", "frances": "fr", "français": "fr", "french": "fr",
        "alemán": "de", "aleman": "de", "deutsch": "de", "german": "de",
        "italiano": "it", "italian": "it",
        "portugués": "pt", "portugues": "pt", "português": "pt", "portuguese": "pt",
        "japonés": "ja", "japones": "ja", "日本語": "ja", "japanese": "ja",
        "chino": "zh", "中文": "zh", "chinese": "zh",
        "coreano": "ko", "한국어": "ko", "korean": "ko",
        "ruso": "ru", "русский": "ru", "russian": "ru",
        "árabe": "ar", "arabe": "ar", "العربية": "ar", "arabic": "ar",
        "hindi": "hi", "हिन्दी": "hi",
        "bengalí": "bn", "bengali": "bn", "বাংলা": "bn"
    };
    const codigo = mapa[inputStr] || (selFiltro ? selFiltro.value : inputStr);

    const selVoz = document.getElementById('selector-voz-live');
    if (!selVoz) return;

    // Sincronizamos con el motor de voces actual
    const voces = synth.getVoices();
    selVoz.innerHTML = "";

    voces.forEach(v => {
        if (v.lang.toLowerCase().startsWith(codigo) || v.name.toLowerCase().includes(codigo)) {
            let opt = document.createElement('option');
            opt.value = v.name;
            opt.innerText = "[Edge] " + v.name;
            selVoz.appendChild(opt);
        }
    });
    // Si hay voces Piper cargadas, las añadimos también con su filtro
    actualizarListaVocesUI();
}

// --- 2. CONTROLADORES DE INTERFAZ REACTIVA ---
function abrirComboLive(tipo) {
    const sel = document.getElementById(tipo === 'idioma' ? 'filtro-idioma' : 'selector-voz-live');
    Array.from(sel.options).forEach(opt => opt.style.display = "block");
    sel.style.display = 'block';
}

function filtrarComboLive(tipo) {
    const query = document.getElementById(`busqueda-${tipo}-live`).value.toLowerCase();
    const sel = document.getElementById(tipo === 'idioma' ? 'filtro-idioma' : 'selector-voz-live');
    if (!sel) return;
    sel.style.display = 'block';

    let visibles = [];
    Array.from(sel.options).forEach(opt => {
        const aliases = (opt.dataset?.aliases || '').toLowerCase();
        const coincide = !opt.disabled && (
            opt.text.toLowerCase().includes(query)
            || opt.value.toLowerCase() === query
            || aliases.includes(query)
        );
        opt.style.display = coincide ? "block" : "none";
        if (coincide) visibles.push(opt);
    });

    if (visibles.length === 1) {
        sel.value = visibles[0].value;
    }

    if (tipo === 'idioma') filtrarVocesPorIdiomaLive();
}

function seleccionarComboLive(tipo) {
    const sel = document.getElementById(tipo === 'idioma' ? 'filtro-idioma' : 'selector-voz-live');
    const inp = document.getElementById(`busqueda-${tipo}-live`);

    if (sel && sel.selectedIndex !== -1) {
        const opt = sel.options[sel.selectedIndex];
        if (opt.disabled) return;
        const valorNuevo = opt.text;

        sel.style.display = 'none';
        const yaTeniaMismoTexto = (inp.value === valorNuevo);
        inp.value = valorNuevo;

        if (!yaTeniaMismoTexto) {
            if (tipo === 'idioma') {
                sel.value = opt.value;
                filtrarVocesPorIdiomaLive();
                guardarTodosAjustes();
            } else {
                cambiarVozLive();
            }
        }
        window.dispatchEvent(new CustomEvent('lira:combo-live-seleccionado', {
            detail: { tipo, valor: opt.value, texto: valorNuevo }
        }));
    }
}

// --- SENSOR DE CIERRE INTELIGENTE (HUD + MODAL) ---
document.addEventListener('mousedown', (e) => {
    // 1. Identificamos los elementos que deben cerrarse
    const combos = [
        { sel: 'filtro-idioma', inp: 'busqueda-idioma-live' },
        { sel: 'selector-voz-live', inp: 'busqueda-voz-live' },
        { sel: 'modal-filtro-idioma', inp: 'busqueda-idioma-mp3' },
        { sel: 'modal-voz', inp: 'busqueda-voz-mp3' },
        { sel: 'select-idioma-teatro', inp: 'busqueda-idioma-teatro' },
        { sel: 'select-voz-teatro', inp: 'busqueda-voz-teatro' }
    ];

    combos.forEach(combo => {
        const elSel = document.getElementById(combo.sel);
        const elInp = document.getElementById(combo.inp);

        if (elSel && elSel.style.display === 'block') {
            // REGLA: Si el clic NO fue en el input, NI en el select, NI en una opción interna
            if (!e.target.closest(`#${combo.sel}`) &&
                !e.target.closest(`#${combo.inp}`) &&
                !e.target.closest('option')) {

                elSel.style.display = 'none';
                console.log(`🙈 Ocultando lista: ${combo.sel}`);
            }
        }
    });
});


// --- HERRAMIENTA DE INGENIERÍA: TELEMETRÍA VISUAL ---
