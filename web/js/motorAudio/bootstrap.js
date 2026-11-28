function _leerDomCheck(id, defecto) {
    const el = document.getElementById(id);
    return el ? el.checked : defecto;
}

function _leerDomValor(id, defecto) {
    const el = document.getElementById(id);
    return (el && el.value) ? el.value : defecto;
}

function _leerDomInt(id, defecto) {
    const el = document.getElementById(id);
    const val = el ? parseInt(el.value, 10) : NaN;
    return isNaN(val) ? defecto : val;
}

function _leerDomFloat(id, defecto) {
    const el = document.getElementById(id);
    const val = el ? parseFloat(el.value) : NaN;
    return isNaN(val) ? defecto : val;
}

function _leerDomCheckAlterno(idPrimario, idSecundario, defecto) {
    const el1 = document.getElementById(idPrimario);
    if (el1) return el1.checked;
    const el2 = document.getElementById(idSecundario);
    return el2 ? el2.checked : defecto;
}

function _leerDomValorAlterno(idPrimario, idSecundario, defecto) {
    const v1 = _leerDomValor(idPrimario, '');
    if (v1) return v1;
    return _leerDomValor(idSecundario, defecto);
}

function _sincronizarCampoCloudIA(mapaDestino, mapaGlobal, proveedorActivo, valor) {
    if (!valor) return;
    mapaDestino[proveedorActivo] = valor;
    if (mapaGlobal) mapaGlobal[proveedorActivo] = valor;
}

function _sincronizarYGuardarApiKeysIA() {
    const cfg = (typeof configProveedores !== 'undefined' && configProveedores) ? configProveedores : null;
    const proveedorActivo = cfg?.proveedorActivo || _leerDomValor('sel-ia-proveedor', 'ollama');
    const cloudKeys = cfg?.keys ? { ...cfg.keys } : {};
    const cloudModelos = cfg?.modelos ? { ...cfg.modelos } : {};

    if (proveedorActivo && proveedorActivo !== 'ollama') {
        _sincronizarCampoCloudIA(cloudKeys, cfg?.keys, proveedorActivo, _leerDomValor('txt-ia-api-key', '').trim());
        const modeloVal = _leerDomValor('sel-ia-modelo-cloud', '').trim();
        if (modeloVal !== '__custom_model_prompt__') {
            _sincronizarCampoCloudIA(cloudModelos, cfg?.modelos, proveedorActivo, modeloVal);
        }
    }

    if (typeof eel !== 'undefined' && typeof eel.guardar_api_keys_json === 'function') {
        eel.guardar_api_keys_json({ proveedorActivo, keys: cloudKeys, modelos: cloudModelos })();
    }
    return { proveedorActivo, cloudKeys, cloudModelos };
}

function _construirConfigAjustesLectura(iaCtx) {
    const elIdiomaUi = document.querySelector('input[name="radio-idioma"]:checked');
    const elSidebar = document.getElementById('sidebar-izquierda');
    const precargaHojas = Math.max(0, Math.min(5, _leerDomInt('num-precarga-hojas', 2)));
    const tutorialLS = typeof localStorage !== 'undefined' && localStorage.getItem('liraloud_tutorial_completado') === 'true';

    return {
        "velocidad": velocidadLectura,
        "tono": pitchLectura,
        "pausa": pausaPunto,
        "volumen": volumenPorcentaje,
        "idioma": document.getElementById('busqueda-idioma-live')?.value,
        "color": _leerDomValor('color-resaltado', "#ffff00"),
        "padKaraoke": _leerDomInt('rng-pad-karaoke', 2),
        "colorGuia": _leerDomValor('color-guia-oracion', "#00b4ff"),
        "padGuia": _leerDomInt('rng-pad-guia', 2),
        "llenado": _leerDomCheck('chk-llenado-fluido', false),
        "recortePDF": _leerDomInt('rng-recorte-pdf', 0),
        "zoomPDF": _leerDomInt('rng-zoom-pdf', 100),
        "margenPDF": _leerDomInt('rng-margen-pdf', 20),
        "seguirTexto": _leerDomCheck('chk-seguimiento', true),
        "omitirParen": _leerDomCheck('chk-paren', true),
        "omitirCorch": _leerDomCheck('chk-corch', true),
        "omitirLlaves": _leerDomCheck('chk-llaves', true),
        "omitirUrls": _leerDomCheck('chk-urls', true),
        "omitirReferencias": _leerDomCheck('chk-superindices', true),
        "omitirSuperindices": _leerDomCheck('chk-superindices', true),
        "omitirSubindices": _leerDomCheck('chk-subindices', false),
        "usarBloquesNativos": _leerDomCheck('chk-usar-bloques', true),
        "modo_subrayador": Boolean(window.modoSubrayadorActivo),
        "modo_borrador": Boolean(window.modoBorradorActivo),
        "modo_editor_texto": Boolean(window.modoEditorTextoActivo),
        "modo_mover_elementos": Boolean(window.modoMoverElementosActivo),
        "color_subrayador": typeof colorSubrayadorActual !== 'undefined' ? colorSubrayadorActual : "#FFFF00",
        "sensibilidadSalto": _leerDomFloat('rng-sensibilidad-salto', 0.5),
        "detectarSangria": _leerDomCheck('chk-detectar-sangria', true),
        "modo_privacidad": _leerDomCheck('chk-modo-privacidad', false),
        "alto_rendimiento": _leerDomCheck('chk-alto-rendimiento', false),
        "tema_oscuro": _leerDomCheck('btn-tema-config', false),
        "buffer_extendido": _leerDomCheck('chk-buffer-extendido', false),
        "teatro_activo": _leerDomCheck('chk-teatro-global', false),
        "precargaRAM": _leerDomCheck('chk-precarga-ram', false),
        "precarga_hojas": precargaHojas,
        "ollama_auto_inicio": _leerDomCheck('chk-ollama-auto-inicio', false),
        "ollama_auto_solicitud": _leerDomCheck('chk-ollama-auto-solicitud', false),
        "obra_actual": obraActualTeatro,
        "mostrarKofi": _leerDomCheck('chk-kofi', true),
        "solo_lectura": Boolean(window.modoSoloLecturaActivo),
        "auto_avance": _leerDomCheck('chk-auto-avance', true),
        "idioma_ui": elIdiomaUi ? elIdiomaUi.value : 'en',
        "pausa_sistema": _leerDomCheck('chk-pausa-sistema', false),
        "ducking_volumen": _leerDomCheck('chk-ducking-volumen', false),
        "ducking_nivel": _leerDomInt('rng-ducking-nivel', 20),
        "kokoro_blend_voza": _leerDomValor('sel-kokoro-blend-voza', "ef_dora"),
        "kokoro_blend_vozb": _leerDomValor('sel-kokoro-blend-vozb', "af_bella"),
        "kokoro_blend_vozc": _leerDomValor('sel-kokoro-blend-vozc', "ninguna"),
        "kokoro_blend_ratio": _leerDomInt('rng-kokoro-blend-ratio', 70),
        "kokoro_blend_pesoc": _leerDomInt('rng-kokoro-blend-pesoc', 0),
        "kokoro_blend_acento": _leerDomValor('sel-kokoro-blend-acento', "es-419"),
        "kokoro_blend_eq": _leerDomValor('sel-kokoro-blend-eq', "estudio"),
        "perfil_eq_piper": _leerDomValor('sel-eq-piper-perfil', "estudio"),
        "eq_piper_graves": _leerDomFloat('rng-eq-piper-graves', 0),
        "eq_piper_medios": _leerDomFloat('rng-eq-piper-medios', 0),
        "eq_piper_agudos": _leerDomFloat('rng-eq-piper-agudos', 0),
        "eq_piper_corte": _leerDomFloat('rng-eq-piper-corte', 8000),
        "kokoro_blend_expresividad": _leerDomFloat('sel-kokoro-blend-expresividad', 1.0),
        "kokoro_blend_cadencia": _leerDomFloat('sel-kokoro-blend-cadencia', 1.0),
        "modo_zen": _leerDomCheck('chk-modo-zen', true),
        "etiquetas_zen": _leerDomCheck('chk-etiquetas-zen', true),
        "unir_solo_lectura_zen": _leerDomCheck('chk-unir-solo-lectura-zen', false),
        "ocr_alta_precision": Boolean(window.ocrAltaPrecisionActivo),
        "ocr_idioma": window.ocrIdiomaActual || "latin",
        "hide_filtros": _leerDomCheck('chk-hide-filtros', false),
        "hide_dicc": _leerDomCheck('chk-hide-dicc', false),
        "hide_teatro": _leerDomCheck('chk-hide-teatro', false),
        "hide_mp3": _leerDomCheck('chk-hide-mp3', false),
        "traduccion_activa": _leerDomCheckAlterno('chk-traduccion-activa', 'zen-chk-traduccion-activa', false),
        "traduccion_origen": _leerDomValorAlterno('sel-traduccion-origen', 'zen-sel-traduccion-origen', 'auto'),
        "traduccion_destino": _leerDomValorAlterno('sel-traduccion-destino', 'zen-sel-traduccion-destino', 'es'),
        "traduccion_motor": _leerDomValor('sel-traduccion-motor', 'online'),
        "traduccion_modo": _leerDomValorAlterno('sel-traduccion-modo', 'zen-sel-traduccion-modo', 'solo_traduccion'),
        "sub_lineheight": _leerDomInt('rng-sub-lineheight', 13),
        "sub_wordgap": _leerDomInt('rng-sub-wordgap', 4),
        "ia_modelo_chat": _leerDomValor('ia-select-modelo-chat', typeof estadoIA !== 'undefined' ? estadoIA.modeloChatSeleccionado : 'gemma4:12b'),
        "ia_modelo_embed": _leerDomValor('ia-select-modelo-embed', typeof estadoIA !== 'undefined' ? estadoIA.modeloEmbedSeleccionado : 'nomic-embed-text'),
        "ia_leer_bloque_clic": _leerDomCheck('chk-ia-leer-bloque', true),
        "ia_modo_salida": _leerDomValorAlterno('sel-ia-modo-salida', 'sel-ia-modo-salida-config', typeof modoSalidaIA !== 'undefined' ? modoSalidaIA : 'trazabilidad'),
        "ia_proveedor_activo": iaCtx.proveedorActivo,
        "ia_cloud_keys": iaCtx.cloudKeys,
        "ia_cloud_modelos": iaCtx.cloudModelos,
        "ia_fuente_pdf": _leerDomCheck('chk-ia-fuente-pdf', true),
        "ia_fuente_subrayados": _leerDomCheck('chk-ia-fuente-subrayados', false),
        "ia_fuente_notas": _leerDomCheck('chk-ia-fuente-notas', false),
        "ia_sub_alcance": _leerDomValor('sel-ia-sub-alcance', "libro_actual"),
        "ia_notas_alcance": _leerDomValor('sel-ia-notas-alcance', "libro_actual"),
        "ia_sub_amarillo": _leerDomCheck('chk-ia-sub-amarillo', true),
        "ia_sub_verde": _leerDomCheck('chk-ia-sub-verde', true),
        "ia_sub_cian": _leerDomCheck('chk-ia-sub-cian', true),
        "ia_sub_magenta": _leerDomCheck('chk-ia-sub-magenta', true),
        "ia_sub_dorado": _leerDomCheck('chk-ia-sub-dorado', true),
        "ia_sub_rojo": _leerDomCheck('chk-ia-sub-rojo', true),
        "ia_sub_paginas": _leerDomValor('txt-ia-sub-paginas', ""),
        "ia_notas_paginas": _leerDomValor('txt-ia-notas-paginas', ""),
        "notas_filtro_modo": window.filtroNotasModo || "pagina_actual",
        "notas_filtro_clasif": window.filtroNotasClasificacion || "TODAS",
        "sidebar_colapsado": elSidebar ? elSidebar.classList.contains('colapsado') : false,
        "auto_ocr": (typeof window.autoOCRActivo !== 'undefined') ? window.autoOCRActivo : _leerDomCheck('chk-auto-ocr', true),
        "auto_layout": (typeof window.autoLayoutActivo !== 'undefined') ? window.autoLayoutActivo : _leerDomCheck('chk-auto-layout', false),
        "tutorial_completado": (window.tutorialCompletado === true) || tutorialLS
    };
}

async function _recargarRamFavoritosConOverlay() {
    const pantalla = document.getElementById('pantalla-carga');
    const hud = document.getElementById('txt-paso-carga');
    if (pantalla) {
        pantalla.style.display = 'flex';
        setTimeout(() => { pantalla.style.opacity = '1'; }, 10);
    }
    if (hud) hud.innerText = "Inyectando modelos en RAM...";
    if (typeof cerrarConfiguracion === 'function') cerrarConfiguracion();

    try {
        await eel.gestionar_ram_favoritos(vocesFavoritas)();
        await new Promise(resolve => setTimeout(resolve, 3500));
    } catch (err) {
        console.error("🔥 Error en la inyección dinámica de RAM:", err);
    } finally {
        if (pantalla) {
            pantalla.style.opacity = '0';
            setTimeout(() => { pantalla.style.display = 'none'; }, 500);
        }
    }
}

async function guardarTodosAjustes(forceRamReload = false) {
    if (!ajustesInicialesCargados) {
        console.log("⏳ [PERSISTENCIA] Ignorado: El sistema aún está arrancando.");
        return;
    }
    try {
        const iaCtx = _sincronizarYGuardarApiKeysIA();
        const config = _construirConfigAjustesLectura(iaCtx);

        console.log("💾 [PERSISTENCIA] Grabando paquete completo:", config);
        await eel.guardar_ajustes_lectura(config)();

        if (config.precargaRAM && vocesFavoritas && vocesFavoritas.length > 0 && forceRamReload) {
            await _recargarRamFavoritosConOverlay();
        }
    } catch (e) {
        console.error("🔥 Fallo en persistencia:", e);
    }
}

/**
 * RESTAURACIÓN POR BLOQUES (Dialéctica de Control)
 */

// BLOQUE A: Estilo y Visualización
async function restablecerEstiloBase() {
    if (!await liraConfirm("¿Restablecer solo Colores, Márgenes y Resaltado?", 'estilo')) return;
    const ajustes = await eel.cargar_ajustes_lectura()();
    const nuevosAjustes = {
        ...ajustes,
        "color": "#ffff00", "padKaraoke": 2, "colorGuia": "#00b4ff",
        "padGuia": 2, "llenado": false, "margenPDF": 20, "recortePDF": 0, "zoomPDF": 100
    };
    await eel.guardar_ajustes_lectura(nuevosAjustes)();
    location.reload();
}

// BLOQUE B: Motor de Audio
async function restablecerAudioBase() {
    if (!await liraConfirm("¿Restablecer solo Velocidad, Tono y Pausas?", 'audio')) return;
    const ajustes = await eel.cargar_ajustes_lectura()();
    const nuevosAjustes = {
        ...ajustes,
        "velocidad": 1.0, "tono": 1.0, "pausa": 300, "volumen": 100
    };
    await eel.guardar_ajustes_lectura(nuevosAjustes)();
    location.reload();
}

// BLOQUE C: Atajos de Teclado (Usa el archivo atajos.json)
async function restablecerAtajosBase() {
    if (!await liraConfirm("¿Restablecer todos los Atajos de Teclado a los de fábrica?", 'teclado')) return;
    const defaults = {
        "play_pause": " ", "add_limit": "control+ ", "add_abbr": "control+i",
        "speed_up": "arrowup", "speed_down": "arrowdown", "prev_page": "arrowleft",
        "next_page": "arrowright", "open_pdf": "control+o", "prev_sentence": "a",
        "next_sentence": "d", "cycle_voice": "v", "toggle_dicc": "tab"
    };
    await eel.guardar_atajos_en_python(defaults)();
    location.reload();
}

// ==================================================================
// SECCIÓN 16: MOTOR DE EXPORTACIÓN MP3 
// ==================================================================

// --- 1. GESTIÓN DE COMBO BOXES INTELIGENTES (Windows Search Style) ---
// ==========================================
// 5.2. GESTIÓN DE VOCES ESPECÍFICA PARA MP3
// (Clon independiente del motor primordial)
// ==========================================


// --- 2. MONITOR VISUAL DE PÁGINAS (Vista Previa Windows) ---


// --- 1. GESTIÓN DE MEMORIA Y FILTROS LIVE ---
function logCarga(mensaje) {
    console.log("🛠️ [Telemetría] " + mensaje);
    const el = document.getElementById('txt-paso-carga');
    if (el) el.innerText = " " + mensaje;
}


window.onload = async () => {
    // 🎨 BARRERA DE RENDERIZADO (First Paint Yield)
    // Obligamos al motor de Chromium a pintar el DOM (la pantalla azul)
    // ANTES de iniciar el bombardeo asíncrono con Python.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 120)); // 120ms de respiro para la GPU

    // 🛡️ CENTINELA (Watchdog Timer Independiente)
    // Si ocurre un deadlock absoluto en las promesas iniciales, fuerza la apertura a los 8 segundos.
    const seguroDeVida = setTimeout(() => {
        const pantalla = document.getElementById('pantalla-carga');
        if (pantalla && pantalla.style.display !== 'none') {
            logCarga("⚠️ Centinela: Deadlock detectado. Forzando apertura de UI.");
            pantalla.style.opacity = '0';
            setTimeout(() => {
                pantalla.style.display = 'none';
            }, 500);
        }
    }, 8000);

    try {
        // 🛑 FASE 0: Lectura prioritaria y aislada de tutorial_estado.json
        if (typeof eel !== 'undefined' && typeof eel.cargar_estado_tutorial === 'function') {
            try {
                const estTut = await eel.cargar_estado_tutorial()();
                window.tutorialCompletado = Boolean(estTut && estTut.completado === true);
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('liraloud_tutorial_completado', window.tutorialCompletado ? 'true' : 'false');
                }
            } catch (eTut) {
                window.tutorialCompletado = false;
            }
        }

        logCarga("Preparando modales de interfaz...");
        document.getElementById('modal-descarga').style.display = 'none';
        document.getElementById('modalConfig').style.display = 'none';
        document.getElementById('modal-diccionario').style.display = 'none';

        logCarga("Cargando voces del navegador...");
        cargarVocesSistema();
        if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = cargarVocesSistema;

        // 🛑 FASE 1: Sincronización del catálogo base de voces Piper
        await forzarCargaPiper();

        // FASE 2: Preferencias de Voz del Usuario
        logCarga("Pidiendo voz predeterminada a Python...");
        vozPredeterminada = await eel.cargar_voz_default()();

        logCarga("Pidiendo lista de favoritos a Python...");
        vocesFavoritas = await eel.cargar_lista_favoritos()();

        const inpVozLive = document.getElementById('busqueda-voz-live');
        if (inpVozLive) inpVozLive.value = vozPredeterminada;
        actualizarListaVocesUI();

        const selIdiomaMain = document.getElementById('filtro-idioma');
        const selIdiomaModal = document.getElementById('modal-filtro-idioma');
        if (selIdiomaMain && selIdiomaModal) selIdiomaModal.innerHTML = selIdiomaMain.innerHTML;

        // FASE 3: Estructuras de Diccionario y Abreviaturas
        logCarga("Cargando Abreviaturas (abreviaturas.json)...");
        dbDiccionario = await eel.cargar_diccionario()();
        if (dbDiccionario && Object.keys(dbDiccionario).length > 0) {
            let huboCambios = false;
            for (let sec in dbDiccionario) {
                let terms = dbDiccionario[sec].terms;
                for (let key in terms) {
                    if (typeof terms[key] === 'string') {
                        terms[key] = { val: terms[key], on: true };
                        huboCambios = true;
                    }
                }
            }
            if (huboCambios) await eel.guardar_diccionario(dbDiccionario)();
        }

        // FASE 4: Reparto de Actores y Teatro Clínico
        logCarga("Cargando Reparto de Actores (teatro.json)...");
        try {
            dbTeatro = await eel.cargar_diccionario_teatro()();
            if (!dbTeatro || Object.keys(dbTeatro).length === 0) {
                dbTeatro = { "Cuento KJFñÑGDOLAP": { active: true, actors: {} } };
            }
            obraActualTeatro = Object.keys(dbTeatro)[0];
        } catch (e) {
            dbTeatro = { "Cuento General": { active: true, actors: {} } };
            obraActualTeatro = "Cuento General";
        }

        if (!dbDiccionario || Object.keys(dbDiccionario).length === 0) {
            dbDiccionario = { "General": { active: true, terms: {} } };
            seccionActual = "General";
        } else {
            seccionActual = Object.keys(dbDiccionario)[0];
        }

        // FASE 5: Mapeo de Atajos del Sistema
        logCarga("Cargando Atajos (atajos.json)...");
        misAtajos = await eel.cargar_atajos_desde_python()();
        aplicarAtajosAlNavegador();

        // FASE 6: Configuración General y Variables Dinámicas
        logCarga("Cargando Ajustes de Lectura...");
        const ajustes = await eel.cargar_ajustes_lectura()();
        velocidadLectura = ajustes?.velocidad ?? 1.0;
        pitchLectura = ajustes?.tono ?? 1.0;
        pausaPunto = ajustes?.pausa ?? 300;
        volumenPorcentaje = ajustes?.volumen ?? 100;
        window.seguirTextoActivo = ajustes?.seguirTexto ?? true;
        if (ajustes.obra_actual && dbTeatro[ajustes.obra_actual]) {
            obraActualTeatro = ajustes.obra_actual;
        }

        const idiomaGuardado = ajustes.idioma || "Español";
        const inpLive = document.getElementById('busqueda-idioma-live');
        const inpMp3 = document.getElementById('busqueda-idioma-mp3');
        if (inpLive) inpLive.value = idiomaGuardado;
        if (inpMp3) inpMp3.value = idiomaGuardado;

        setTimeout(() => {
            // Sincronizar selectores ocultos para que el filtro interno (actualizarListaVocesUI) funcione correctamente
            const sincronizarCombo = (id, texto) => {
                let select = document.getElementById(id);
                if (select && select.options.length > 0) {
                    let opt = Array.from(select.options).find(o => o.text === texto);
                    if (opt) select.value = opt.value;
                }
            };
            sincronizarCombo('filtro-idioma', idiomaGuardado);
            sincronizarCombo('modal-filtro-idioma', idiomaGuardado);

            if (typeof filtrarVocesPorIdiomaLive === 'function') {
                filtrarVocesPorIdiomaLive();
                if (vozPredeterminada) {
                    const selVoz = document.getElementById('selector-voz-live');
                    if (selVoz) {
                        const existeVoz = [...selVoz.options].some(o => o.value === vozPredeterminada);
                        if (existeVoz) {
                            selVoz.value = vozPredeterminada;
                            const inpVozLive = document.getElementById('busqueda-voz-live');
                            if (inpVozLive) inpVozLive.value = vozPredeterminada;
                        }
                    }
                }
            }
        }, 1300);

        // FASE 7: Acoplamiento de Componentes en el DOM
        logCarga("Aplicando ajustes a la interfaz visual...");
        window.safeUI = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        window.safeCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

        safeUI('rng-velocidad', velocidadLectura); safeUI('num-velocidad', velocidadLectura);
        safeUI('rng-tono', pitchLectura); safeUI('num-tono', pitchLectura);
        safeUI('rng-pausa', pausaPunto); safeUI('num-pausa', pausaPunto);
        safeUI('color-resaltado', ajustes?.color || "#ffff00");
        safeUI('rng-pad-karaoke', ajustes?.padKaraoke ?? 2);
        safeUI('color-guia-oracion', ajustes?.colorGuia || "#00b4ff");
        safeUI('rng-pad-guia', ajustes?.padGuia ?? 2);

        // Restaurar Recorte de Bordes
        const recorteGuardado = ajustes?.recortePDF ?? 0;
        safeUI('rng-recorte-pdf', recorteGuardado);
        if (typeof aplicarRecorteDinamico === 'function') aplicarRecorteDinamico(recorteGuardado);

        // Restaurar Zoom
        const zoomGuardado = ajustes?.zoomPDF ?? 100;
        safeUI('rng-zoom-pdf', zoomGuardado);
        if (typeof aplicarZoomDinamico === 'function') aplicarZoomDinamico(zoomGuardado);

        // Restaurar Márgenes Laterales
        const margenGuardado = ajustes?.margenPDF ?? 20;
        safeUI('rng-margen-pdf', margenGuardado);
        if (typeof aplicarMargenDinamico === 'function') aplicarMargenDinamico(margenGuardado);

        safeCheck('chk-llenado-fluido', ajustes?.llenado ?? false);
        safeCheck('chk-seguir-texto', window.seguirTextoActivo);
        safeCheck('chk-paren', ajustes?.omitirParen ?? true);
        safeCheck('chk-corch', ajustes?.omitirCorch ?? true);
        safeCheck('chk-llaves', ajustes?.omitirLlaves ?? true);
        safeCheck('chk-urls', ajustes?.omitirUrls ?? true);
        safeCheck('chk-superindices', ajustes?.omitirSuperindices ?? ajustes?.omitirReferencias ?? true);
        safeCheck('chk-subindices', ajustes?.omitirSubindices ?? false);
        safeCheck('chk-usar-bloques', ajustes?.usarBloquesNativos ?? true);

        const rngSalto = document.getElementById('rng-sensibilidad-salto');
        if (rngSalto) {
            rngSalto.value = ajustes?.sensibilidadSalto ?? 0.5;
            document.getElementById('lbl-sensibilidad').innerText = rngSalto.value;
        }

        // Restaurar color del Subrayador primero (sin activarlo)
        if (ajustes?.color_subrayador && typeof setSubrayadoColor === 'function') {
            setSubrayadoColor(ajustes.color_subrayador, false);
        }

        // Restaurar estado del Subrayador
        const opcSubrayador = ajustes?.modo_subrayador ?? false;
        safeCheck('chk-modo-subrayar', opcSubrayador);
        if (typeof toggleModoSubrayador === 'function') toggleModoSubrayador(opcSubrayador);

        const opcBorrador = ajustes?.modo_borrador ?? false;
        safeCheck('chk-modo-borrador', opcBorrador);
        if (typeof toggleModoBorrador === 'function') toggleModoBorrador(opcBorrador);

        const opcEditor = ajustes?.modo_editor_texto ?? false;
        if (typeof toggleModoEditorTexto === 'function') toggleModoEditorTexto(opcEditor);

        const opcMoverElementos = ajustes?.modo_mover_elementos ?? false;
        if (typeof toggleModoMoverElementos === 'function') toggleModoMoverElementos(opcMoverElementos);

        safeCheck('chk-detectar-sangria', ajustes?.detectarSangria ?? true);
        safeCheck('chk-detectar-sangria-main', ajustes?.detectarSangria ?? true);
        const rngSaltoMain = document.getElementById('rng-sensibilidad-salto-main');
        if (rngSaltoMain) {
            rngSaltoMain.value = ajustes?.sensibilidadSalto ?? 0.5;
            document.getElementById('lbl-sensibilidad-main').innerText = rngSaltoMain.value;
        }

        const zenHabilitado = ajustes?.modo_zen ?? true;
        safeCheck('chk-modo-zen', zenHabilitado);
        if (typeof toggleModoZen === 'function') {
            toggleModoZen(zenHabilitado);
        }

        const etiquetasZenHabilitadas = ajustes?.etiquetas_zen ?? true;
        safeCheck('chk-etiquetas-zen', etiquetasZenHabilitadas);
        if (typeof toggleEtiquetasZen === 'function') {
            toggleEtiquetasZen(etiquetasZenHabilitadas);
        }

        const unirSoloLecturaZen = ajustes?.unir_solo_lectura_zen ?? false;
        safeCheck('chk-unir-solo-lectura-zen', unirSoloLecturaZen);
        if (typeof toggleUnirSoloLecturaZen === 'function') {
            toggleUnirSoloLecturaZen(unirSoloLecturaZen);
        }

        const ocrAltaPrecision = ajustes?.ocr_alta_precision ?? false;
        if (typeof toggleOcrAltaPrecision === 'function') {
            toggleOcrAltaPrecision(ocrAltaPrecision, false);
        }

        const ocrIdioma = ajustes?.ocr_idioma || 'latin';
        if (typeof cambiarIdiomaOCR === 'function') {
            cambiarIdiomaOCR(ocrIdioma, false);
        }

        const sidebarColapsado = ajustes?.sidebar_colapsado ?? false;
        if (typeof toggleSidebarIzquierda === 'function') {
            toggleSidebarIzquierda(sidebarColapsado);
        }

        try { toggleOpcionesSegmentacion(); } catch (e) { }

        safeCheck('chk-alto-rendimiento', ajustes?.alto_rendimiento ?? false);
        const modoPrivacidad = ajustes?.modo_privacidad ?? false;
        safeCheck('chk-modo-privacidad', modoPrivacidad);
        if (typeof toggleModoPrivacidad === 'function') {
            toggleModoPrivacidad(modoPrivacidad);
        }
        safeCheck('chk-buffer-extendido', ajustes?.buffer_extendido ?? false);
        safeCheck('chk-teatro-global', ajustes?.teatro_activo ?? false);
        if (typeof sincronizarIndicadorTeatroZen === 'function') sincronizarIndicadorTeatroZen();
        safeCheck('chk-auto-avance', ajustes?.auto_avance ?? true);
        safeCheck('chk-pausa-sistema', ajustes?.pausa_sistema ?? false);
        safeCheck('chk-ducking-volumen', ajustes?.ducking_volumen ?? false);
        safeUI('rng-ducking-nivel', ajustes?.ducking_nivel ?? 20);
        const lblNivel = document.getElementById('lbl-ducking-nivel');
        if (lblNivel) lblNivel.innerText = (ajustes?.ducking_nivel ?? 20) + '%';

        // 🧪 Restaurar Laboratorio de Mezclas Kokoro
        safeUI('sel-kokoro-blend-voza', ajustes?.kokoro_blend_voza ?? 'ef_dora');
        safeUI('sel-kokoro-blend-vozb', ajustes?.kokoro_blend_vozb ?? 'af_bella');
        safeUI('sel-kokoro-blend-vozc', ajustes?.kokoro_blend_vozc ?? 'ninguna');
        safeUI('rng-kokoro-blend-ratio', ajustes?.kokoro_blend_ratio ?? 70);
        safeUI('rng-kokoro-blend-pesoc', ajustes?.kokoro_blend_pesoc ?? 0);
        safeUI('sel-kokoro-blend-acento', ajustes?.kokoro_blend_acento ?? 'es-419');
        safeUI('sel-kokoro-blend-eq', ajustes?.kokoro_blend_eq ?? 'estudio');
        const eqPiperPerfil = ajustes?.perfil_eq_piper ?? 'estudio';
        safeUI('sel-eq-piper-perfil', eqPiperPerfil);
        window.perfilEqPiperActivo = eqPiperPerfil;

        const eqGraves = ajustes?.eq_piper_graves ?? 0;
        const eqMedios = ajustes?.eq_piper_medios ?? 0;
        const eqAgudos = ajustes?.eq_piper_agudos ?? 0;
        const eqCorte = ajustes?.eq_piper_corte ?? 8000;
        safeUI('rng-eq-piper-graves', eqGraves);
        safeUI('rng-eq-piper-medios', eqMedios);
        safeUI('rng-eq-piper-agudos', eqAgudos);
        safeUI('rng-eq-piper-corte', eqCorte);
        const lblGraves = document.getElementById('lbl-eq-piper-graves-val');
        if (lblGraves) lblGraves.textContent = (eqGraves > 0 ? '+' : '') + eqGraves + ' dB';
        const lblMedios = document.getElementById('lbl-eq-piper-medios-val');
        if (lblMedios) lblMedios.textContent = (eqMedios > 0 ? '+' : '') + eqMedios + ' dB';
        const lblAgudos = document.getElementById('lbl-eq-piper-agudos-val');
        if (lblAgudos) lblAgudos.textContent = (eqAgudos > 0 ? '+' : '') + eqAgudos + ' dB';
        const lblCorte = document.getElementById('lbl-eq-piper-corte-val');
        if (lblCorte) lblCorte.textContent = eqCorte + ' Hz';
        if (typeof actualizarVisibilidadEqPiperPersonalizado === 'function') {
            actualizarVisibilidadEqPiperPersonalizado();
        }
        safeUI('sel-kokoro-blend-expresividad', ajustes?.kokoro_blend_expresividad ?? 1.0);
        safeUI('sel-kokoro-blend-cadencia', ajustes?.kokoro_blend_cadencia ?? 1.0);
        if (typeof actualizarEtiquetasBlendKokoro === 'function') {
            actualizarEtiquetasBlendKokoro();
        }
        if (typeof cargarYRenderizarMezclasKokoroUI === 'function') {
            cargarYRenderizarMezclasKokoroUI();
        }
        if (typeof cargarYRenderizarClonesPocketUI === 'function') {
            cargarYRenderizarClonesPocketUI();
        }

        const autoOcrActivo = ajustes?.auto_ocr ?? true;
        safeCheck('chk-auto-ocr', autoOcrActivo);
        if (typeof toggleAutoOCR === 'function') {
            toggleAutoOCR(autoOcrActivo);
        }

        const autoLayoutActivo = ajustes?.auto_layout ?? true;
        safeCheck('chk-auto-layout', autoLayoutActivo);
        if (typeof toggleAutoLayout === 'function') {
            toggleAutoLayout(autoLayoutActivo);
        }

        safeCheck('btn-tema-config', ajustes?.tema_oscuro ?? false);
        if (ajustes?.tema_oscuro && typeof toggleDarkMode === 'function') {
            toggleDarkMode(true, false);
        }

        const idiomaUiGuardado = ajustes?.idioma_ui || 'en';
        const radioIdioma = document.querySelector(`input[name="radio-idioma"][value="${idiomaUiGuardado}"]`);
        if (radioIdioma) {
            radioIdioma.checked = true;
            if (typeof toggleIdiomaDrop === 'function') toggleIdiomaDrop(idiomaUiGuardado);
        }

        // Aplicar visibilidad inicial de Ko-fi
        const mostrarKofiActivo = ajustes?.mostrarKofi ?? true;
        safeCheck('chk-kofi', mostrarKofiActivo);
        if (typeof toggleBotonKofi === 'function') {
            toggleBotonKofi(mostrarKofiActivo);
        }
        if (typeof toggleModoSoloLectura === 'function') {
            toggleModoSoloLectura(ajustes?.solo_lectura ?? false, true);
        }

        const hideFiltros = ajustes?.hide_filtros ?? false;
        safeCheck('chk-hide-filtros', hideFiltros);
        if (typeof toggleVisibilidadElemento === 'function') {
            toggleVisibilidadElemento('.fila-filtros', hideFiltros);
        }

        const hideDicc = ajustes?.hide_dicc ?? false;
        safeCheck('chk-hide-dicc', hideDicc);
        if (typeof toggleVisibilidadElemento === 'function') {
            toggleVisibilidadElemento('#btn-dicc', hideDicc);
        }

        const hideTeatro = ajustes?.hide_teatro ?? false;
        safeCheck('chk-hide-teatro', hideTeatro);
        if (typeof toggleVisibilidadElemento === 'function') {
            toggleVisibilidadElemento('#btn-teatro', hideTeatro);
        }

        const hideMp3 = ajustes?.hide_mp3 ?? false;
        safeCheck('chk-hide-mp3', hideMp3);
        if (typeof toggleVisibilidadElemento === 'function') {
            toggleVisibilidadElemento('#btn-abrir-descarga', hideMp3);
        }

        // Sincronizar ducking al cargar
        if (document.getElementById('rng-ducking-flotante')) {
            document.getElementById('rng-ducking-flotante').value = (ajustes?.ducking_nivel ?? 20);
            document.getElementById('lbl-ducking-flotante-nivel').innerText = (ajustes?.ducking_nivel ?? 20) + '%';
        }
        if (typeof aplicarVisibilidadDucking === 'function') aplicarVisibilidadDucking();

        // Sincronizar estado de Traducción
        const tradActiva = ajustes?.traduccion_activa ?? false;
        safeCheck('chk-traduccion-activa', tradActiva);
        safeCheck('zen-chk-traduccion-activa', tradActiva);
        const tradOrigen = ajustes?.traduccion_origen ?? 'auto';
        const tradDestino = ajustes?.traduccion_destino ?? 'es';
        const tradModo = ajustes?.traduccion_modo ?? 'solo_traduccion';
        safeUI('sel-traduccion-origen', tradOrigen);
        safeUI('zen-sel-traduccion-origen', tradOrigen);
        safeUI('sel-traduccion-destino', tradDestino);
        safeUI('zen-sel-traduccion-destino', tradDestino);
        safeUI('sel-traduccion-motor', ajustes?.traduccion_motor ?? 'online');
        safeUI('sel-traduccion-modo', tradModo);
        safeUI('zen-sel-traduccion-modo', tradModo);
        safeCheck('chk-pretraducir-paginas', ajustes?.pretraducir_paginas ?? true);
        if (typeof actualizarVisibilidadPrecargaHojas === 'function') {
            actualizarVisibilidadPrecargaHojas();
        }

        if (typeof toggleMenuTraduccion === 'function') {
            toggleMenuTraduccion(tradActiva);
        }
        if (typeof actualizarVisibilidadBtnTraduccion === 'function') {
            actualizarVisibilidadBtnTraduccion();
        }

        // Subtítulos: Interlineado y Separación de palabras
        const subLineHeight = ajustes?.sub_lineheight ?? 12;
        const subWordGap = ajustes?.sub_wordgap ?? 2;
        safeUI('rng-sub-lineheight', subLineHeight);
        safeUI('rng-sub-wordgap', subWordGap);
        const lblLH = document.getElementById('val-sub-lineheight');
        if (lblLH) lblLH.innerText = (subLineHeight / 10).toFixed(1);
        const lblWG = document.getElementById('val-sub-wordgap');
        if (lblWG) lblWG.innerText = subWordGap + 'px';
        if (typeof aplicarSubtituloEspaciado === 'function') aplicarSubtituloEspaciado();

        // Restaurar estado del Cuaderno de Notas
        window.rutaNotasPersonalizada = ajustes?.ruta_carpeta_notas || "";
        window.filtroNotasModo = ajustes?.notas_filtro_modo || "pagina_actual";
        window.filtroNotasClasificacion = ajustes?.notas_filtro_clasif || "TODAS";

        ajustesInicialesCargados = true;

        // Control del nuevo interruptor de rendimiento
        const precargarVocesRAM = ajustes?.precargaRAM ?? false;
        safeCheck('chk-precarga-ram', precargarVocesRAM);
        window.precargaHojas = ajustes?.precarga_hojas ?? 2;
        safeUI('num-precarga-hojas', window.precargaHojas);
        const ollamaAutoInicio = ajustes?.ollama_auto_inicio ?? false;
        const ollamaAutoSolicitud = ajustes?.ollama_auto_solicitud ?? false;
        safeCheck('chk-ollama-auto-inicio', ollamaAutoInicio);
        safeCheck('chk-ollama-auto-solicitud', ollamaAutoSolicitud);
        window.ollamaAutoSolicitud = ollamaAutoSolicitud;
        if (ollamaAutoInicio && typeof eel !== 'undefined' && typeof eel.iniciar_ollama_local === 'function') {
            eel.iniciar_ollama_local()().catch(() => { });
        }

        // Restaurar estado de modelos de LiraAI y opciones de lectura
        if (typeof estadoIA !== 'undefined') {
            if (ajustes?.ia_modelo_chat) estadoIA.modeloChatSeleccionado = ajustes.ia_modelo_chat;
            if (ajustes?.ia_modelo_embed) estadoIA.modeloEmbedSeleccionado = ajustes.ia_modelo_embed;
        }
        if (typeof configProveedores !== 'undefined') {
            if (ajustes?.ia_proveedor_activo) configProveedores.proveedorActivo = ajustes.ia_proveedor_activo;
            if (ajustes?.ia_cloud_keys && typeof ajustes.ia_cloud_keys === 'object') {
                configProveedores.keys = Object.assign({}, configProveedores.keys, ajustes.ia_cloud_keys);
            }
            if (ajustes?.ia_cloud_modelos && typeof ajustes.ia_cloud_modelos === 'object') {
                configProveedores.modelos = Object.assign({}, configProveedores.modelos, ajustes.ia_cloud_modelos);
            }
            // Priorizar api_keys.json dedicado si existe
            if (typeof eel !== 'undefined' && typeof eel.cargar_api_keys_json === 'function') {
                try {
                    const apiData = await eel.cargar_api_keys_json()();
                    if (apiData && typeof apiData === 'object') {
                        if (apiData.proveedorActivo) configProveedores.proveedorActivo = apiData.proveedorActivo;
                        if (apiData.keys && typeof apiData.keys === 'object') {
                            configProveedores.keys = Object.assign({}, configProveedores.keys, apiData.keys);
                        }
                        if (apiData.modelos && typeof apiData.modelos === 'object') {
                            configProveedores.modelos = Object.assign({}, configProveedores.modelos, apiData.modelos);
                        }
                    }
                } catch (eApi) { /* silencioso */ }
            }
        }
        if (typeof cambiarProveedorIA === 'function') {
            cambiarProveedorIA(ajustes?.ia_proveedor_activo || 'ollama');
        }
        const iaLeerBloque = ajustes?.ia_leer_bloque_clic ?? true;
        safeCheck('chk-ia-leer-bloque', iaLeerBloque);
        safeCheck('chk-ia-leer-bloque-config', iaLeerBloque);

        const modoSalidaRestaurado = ajustes?.ia_modo_salida || 'trazabilidad';
        safeUI('sel-ia-modo-salida', modoSalidaRestaurado);
        safeUI('sel-ia-modo-salida-config', modoSalidaRestaurado);
        if (typeof cambiarModoSalidaIA === 'function') {
            cambiarModoSalidaIA(modoSalidaRestaurado);
        }

        // Restaurar estado de la pestaña Fuentes de LiraAI
        const fuentePdf = ajustes?.ia_fuente_pdf ?? true;
        const fuenteSubs = ajustes?.ia_fuente_subrayados ?? false;
        const fuenteNotas = ajustes?.ia_fuente_notas ?? false;
        safeCheck('chk-ia-fuente-pdf', fuentePdf);
        safeCheck('chk-ia-fuente-subrayados', fuenteSubs);
        safeCheck('chk-ia-fuente-notas', fuenteNotas);
        safeUI('sel-ia-sub-alcance', ajustes?.ia_sub_alcance || "libro_actual");
        safeUI('sel-ia-notas-alcance', ajustes?.ia_notas_alcance || "libro_actual");
        safeCheck('chk-ia-sub-amarillo', ajustes?.ia_sub_amarillo ?? true);
        safeCheck('chk-ia-sub-verde', ajustes?.ia_sub_verde ?? true);
        safeCheck('chk-ia-sub-cian', ajustes?.ia_sub_cian ?? true);
        safeCheck('chk-ia-sub-magenta', ajustes?.ia_sub_magenta ?? true);
        safeCheck('chk-ia-sub-dorado', ajustes?.ia_sub_dorado ?? true);
        safeCheck('chk-ia-sub-rojo', ajustes?.ia_sub_rojo ?? true);
        safeUI('txt-ia-sub-paginas', ajustes?.ia_sub_paginas || "");
        safeUI('txt-ia-notas-paginas', ajustes?.ia_notas_paginas || "");
        safeUI('txt-ia-notas-clasif', ajustes?.ia_notas_clasif || "");

        if (typeof toggleOpcionesSubrayadosUI === 'function') toggleOpcionesSubrayadosUI(fuenteSubs);
        if (typeof toggleOpcionesNotasUI === 'function') toggleOpcionesNotasUI(fuenteNotas);
        if (typeof actualizarEstadoFuentesUI === 'function') actualizarEstadoFuentesUI();

        sincronizarVolumen(volumenPorcentaje);
        // (Recorte y Zoom se restauran más abajo via safeUI + aplicarRecorteDinamico/aplicarZoomDinamico)

        // Modo Tutorial y Calibración Inicial (controlado exclusivamente por tutorial_estado.json cargado en Fase 0)
        // En la primera apertura de LiraLoud, primero muestra el selector de idioma y solo inicia el tutorial tras elegir idioma.
        if (!window.tutorialCompletado) {
            setTimeout(() => {
                if (!window.tutorialCompletado) {
                    if (typeof window.mostrarSelectorIdiomaInicial === 'function') {
                        window.mostrarSelectorIdiomaInicial();
                    } else if (typeof abrirTutorial === 'function') {
                        abrirTutorial(0, { auto: true });
                    }
                }
            }, 1200);
        }

        let boxTexto = document.getElementById('texto-lectura');
        boxTexto.style.fontSize = tamanoLetraActual + "px";

        // Listeners estructurales para Zoom táctil/rueda
        boxTexto.addEventListener('wheel', function (e) {
            if (e.ctrlKey) {
                e.preventDefault();
                tamanoLetraActual += (e.deltaY < 0 ? 2 : -2);
                if (tamanoLetraActual < 10) tamanoLetraActual = 10;
                if (tamanoLetraActual > 60) tamanoLetraActual = 60;
                boxTexto.style.fontSize = tamanoLetraActual + "px";
            }
        }, { passive: false });

        let visorContainer = document.getElementById('visor-container');
        visorContainer.addEventListener('wheel', function (e) {
            if (e.ctrlKey) {
                e.preventDefault();
                const nuevoZoomPct = Math.max(50, Math.min(250, Math.round((nivelZoomPDF * 100) + (e.deltaY < 0 ? 10 : -10))));
                if (typeof aplicarZoomDinamico === 'function') {
                    aplicarZoomDinamico(nuevoZoomPct);
                } else {
                    nivelZoomPDF = nuevoZoomPct / 100;
                    if (datosPagina) {
                        canvas.style.width = (datosPagina.ancho_img * nivelZoomPDF) + "px";
                        canvas.style.height = (datosPagina.alto_img * nivelZoomPDF) + "px";
                    }
                }
                if (typeof window.sincronizarCapaTextoSoloLectura === 'function') {
                    window.sincronizarCapaTextoSoloLectura();
                }
            } else if (e.altKey) {
                e.preventDefault();
                visorContainer.scrollLeft += e.deltaY;
            }
        }, { passive: false });

        // 🧠 FASE 8: Calentamiento Síncrono de RAM 
        if (precargarVocesRAM && vocesFavoritas && vocesFavoritas.length > 0) {

            // 🛡️ REINSERCIÓN VISUAL ABSOLUTA: 
            // Invocamos la pantalla manualmente. Esto anula cualquier 'display: none' accidental de fases previas.
            invocarPantallaCarga("Calentando RAM con modelos acústicos...");
            logCarga("Calentando RAM con modelos acústicos...");

            console.log(`[⏱️ ${performance.now().toFixed(0)}ms] 🚀 Enviando orden a Python: gestionar_ram_favoritos`);

            clearTimeout(seguroDeVida);

            try {
                await eel.gestionar_ram_favoritos(vocesFavoritas)();
                console.log(`[⏱️ ${performance.now().toFixed(0)}ms] 🟢 Python devolvió el control a JavaScript.`);
            } catch (e) {
                console.error(`[⏱️ ${performance.now().toFixed(0)}ms] ❌ Falla en la promesa de Eel:`, e);
            }

            console.log(`[⏱️ ${performance.now().toFixed(0)}ms] ⏳ Aplicando retención visual forzada (3500ms)...`);
            await new Promise(resolve => setTimeout(resolve, 3500));
            console.log(`[⏱️ ${performance.now().toFixed(0)}ms] ⏰ Retención visual terminada.`);
        } else {
            console.log(`[⏱️ ${performance.now().toFixed(0)}ms] ⏭️ Fase 8 omitida. Precarga apagada o sin favoritos.`);
        }

        logCarga("¡Arranque exitoso! Liberando interfaz...");

    } catch (error) {
        logCarga("❌ Error crítico: " + error.message);
        console.error("🔥 Error detectado en flujo de arranque:", error);
    } finally {
        console.log(`[⏱️ ${performance.now().toFixed(0)}ms] 🪓 Ejecutando guillotina final (retirarPantallaCarga).`);
        clearTimeout(seguroDeVida);
        retirarPantallaCarga();

        // Abrir archivo pasado por línea de comandos ("Abrir con..." / doble clic en PDF)
        if (typeof eel !== 'undefined' && typeof eel.obtener_archivo_inicial === 'function') {
            try {
                const rutaInicial = await eel.obtener_archivo_inicial()();
                if (rutaInicial && typeof rutaInicial === 'string') {
                    if (typeof _destruirBienvenida === 'function') _destruirBienvenida();
                    if (typeof cerrarLanzador === 'function') cerrarLanzador();
                    if (typeof abrirDocumentoDesdeRuta === 'function') {
                        await abrirDocumentoDesdeRuta(rutaInicial, false);
                    }
                }
            } catch (eInitFile) {
                console.warn("⚠️ No se pudo abrir el archivo inicial:", eInitFile);
            }
        }
    }
}; // Fin del window.onload


// Listeners de alta eficiencia (Solo guardan al soltar el control)
const controles = [
    'color-resaltado', 'rng-pad-karaoke', 'color-guia-oracion',
    'rng-pad-guia', 'rng-recorte-pdf', 'rng-zoom-pdf', 'chk-llenado-fluido',
    'chk-seguimiento', 'chk-paren', 'chk-corch', 'chk-llaves', 'chk-urls',
    'rng-velocidad', 'num-velocidad', 'rng-tono', 'num-tono',
    'rng-pausa', 'num-pausa', 'rng-volumen-master', 'num-volumen-master', 'chk-teatro-global'
];

controles.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', () => {
            if (id.includes('velocidad')) sincronizarInput('velocidad');
            else if (id.includes('tono')) sincronizarInput('tono');
            else if (id.includes('pausa')) sincronizarInput('pausa');
            else if (id.includes('volumen')) sincronizarVolumen(el.value);
            // rng-recorte-pdf y rng-zoom-pdf ya se aplican en tiempo real via oninput en el HTML

            // ❌ ELIMINAMOS EL LLAMADO A actualizarFiltrosSnapshot() AQUÍ.
            // Dejamos que el checkbox en el HTML lo haga solo una vez.

            // 2. Solo guardamos el estado para que Python esté actualizado
            guardarTodosAjustes();
            dibujar();
        });
    }
});

document.addEventListener('mousedown', (e) => {
    // Si NO estamos tocando un buscador, una lista .opcion-combo, o una opción interna
    if (!e.target.closest('.opcion-combo') &&
        !e.target.id.includes('busqueda-') &&
        !e.target.closest('option')) {

        const idio = document.getElementById('modal-filtro-idioma');
        const voz = document.getElementById('modal-voz');
        if (idio) idio.style.display = 'none';
        if (voz) voz.style.display = 'none';
    }
});


eel.expose(actualizar_progreso_modal);
function actualizar_progreso_modal(paso, total) {
    const barra = document.getElementById('barra-progreso');
    const texto = document.getElementById('txt-estado-descarga');
    if (!barra || !texto) return;

    // 1. Calculamos el porcentaje real que reporta Python
    const porcentajeReal = (paso / total) * 100;

    // 2. Limpiamos cualquier animación previa para evitar solapamientos
    clearInterval(intervaloMicroAvance);

    // 3. MOTOR DE INTERPOLACIÓN (Micro-avances inventados)
    // Estimamos que una página tarda ~1.8 segundos en procesarse con tu Ryzen 7600
    const duracionEstimadaMs = 1800;
    const fps = 25; // Suavidad visual
    const pasosTotales = (duracionEstimadaMs / 1000) * fps;
    const incrementoPorPaso = (porcentajeReal - progresoVisualActual) / pasosTotales;

    let contadorTicks = 0;

    intervaloMicroAvance = setInterval(() => {
        if (contadorTicks < pasosTotales) {
            // Avanzamos el porcentaje visual poco a poco
            progresoVisualActual += incrementoPorPaso;

            // 🚀 EFECTO VIVO: Un pequeño ruido aleatorio para que se sienta dinámico
            let visualRealista = progresoVisualActual + (Math.random() * 0.15);

            // Umbral de seguridad: No llegar al 100% hasta que Python termine realmente
            if (visualRealista > 99.1 && paso < total) visualRealista = 99.1;

            // Actualizamos la interfaz
            barra.style.width = visualRealista + "%";
            texto.innerText = `Cocinando estudio: ${Math.floor(visualRealista)}% (Pág. ${paso}/${total})`;

            contadorTicks++;
        } else {
            // Sincronización final con el dato real de Python
            progresoVisualActual = porcentajeReal;
            barra.style.width = porcentajeReal + "%";
            clearInterval(intervaloMicroAvance);
        }
    }, 1000 / fps);
}
