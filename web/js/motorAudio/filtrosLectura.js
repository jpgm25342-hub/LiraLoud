function aplicarMascaraParentesis(listaOriginalPalabras) {
    let listaFiltrada = [];
    let textoParaAudio = "";
    let nivelParen = 0;
    let nivelCorch = 0;
    let nivelLlaves = 0;

    const saltarUrls = document.getElementById('chk-urls')?.checked;
    const saltarParen = document.getElementById('chk-paren')?.checked;
    const saltarCorch = document.getElementById('chk-corch')?.checked;
    const saltarLlaves = document.getElementById('chk-llaves')?.checked;
    const saltarBarras = document.getElementById('chk-barras')?.checked;

    if (!listaOriginalPalabras) return { listaVisual: [], textoClean: "" };

    for (let i = 0; i < listaOriginalPalabras.length; i++) {
        let p = listaOriginalPalabras[i];
        let txtRaw = p.texto.trim();
        if (!txtRaw) continue;

        // 1. APERTURA DE BLOQUES (Soporta anidamiento seguro sin romper niveles)
        if (saltarParen) nivelParen += (txtRaw.match(/\(/g) || []).length;
        if (saltarCorch) nivelCorch += (txtRaw.match(/\[/g) || []).length;
        if (saltarLlaves) nivelLlaves += (txtRaw.match(/\{/g) || []).length;

        const ignorarBloque = (nivelParen > 0) || (nivelCorch > 0) || (nivelLlaves > 0);
        let esLink = saltarUrls && (txtRaw.toLowerCase().includes("http") || txtRaw.toLowerCase().includes("www"));

        // 2. PROCESAMIENTO (Detección de Voz y Silencios del Usuario)
        if (!ignorarBloque && !esLink) {
            let p_audio = txtRaw;

            // A) Filtro Manual de Barras (UI)
            if (saltarBarras) {
                p_audio = p_audio.split('/').join(' ').split('\\').join(' ');
            }

            // B) Validación de Contenido Real
            const tieneContenido = /[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(p_audio);
            const esDecimalProtegido = p_audio.includes("punto");

            if (tieneContenido || esDecimalProtegido) {
                listaFiltrada.push(p);
                textoParaAudio += p_audio + " ";
            } else {
                p.yaLeida = true;
            }
        } else {
            p.yaLeida = true;
        }

        // 3. CIERRE DE BLOQUES (Decremento protegido contra negativos)
        if (saltarParen) nivelParen = Math.max(0, nivelParen - (txtRaw.match(/\)/g) || []).length);
        if (saltarCorch) nivelCorch = Math.max(0, nivelCorch - (txtRaw.match(/\]/g) || []).length);
        if (saltarLlaves) nivelLlaves = Math.max(0, nivelLlaves - (txtRaw.match(/\}/g) || []).length);
    } // <--- Cierre del FOR
    return { listaVisual: listaFiltrada, textoClean: textoParaAudio.trim() };
} // <--- Cierre de la FUNCIÓN

function obtenerEstadosFiltros() {
    return {
        'chk-urls': document.getElementById('chk-urls').checked,
        'chk-paren': document.getElementById('chk-paren').checked,
        'chk-corch': document.getElementById('chk-corch').checked,
        'chk-llaves': document.getElementById('chk-llaves').checked
    };
}


/**
 * SISTEMA DE NAVEGACIÓN DE PESTAÑAS (Configuración)
 */
function cambiarTabConfig(event, tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    const panel = document.getElementById(tabId);
    if (panel) panel.style.display = 'block';
    event.currentTarget.classList.add('active');

    if (tabId === 'tab-karaoke') {
        if (typeof cargarYRenderizarMezclasKokoroUI === 'function') cargarYRenderizarMezclasKokoroUI();
        if (typeof cargarYRenderizarClonesPocketUI === 'function') cargarYRenderizarClonesPocketUI();
    }
}

/**
 * CONTROL DE GANANCIA MAESTRO
 */
function sincronizarVolumen(val) {
    volumenPorcentaje = parseInt(val);
    if (isNaN(volumenPorcentaje)) volumenPorcentaje = 100;

    // 1. Actualizar UI
    document.getElementById('rng-volumen-master').value = volumenPorcentaje;
    document.getElementById('num-volumen-master').value = volumenPorcentaje;

    // 2. Calcular Ganancia (0.0 a 1.0)
    const gananciaReal = volumenPorcentaje / 100;

    // 3. Aplicar al motor de audio
    if (gainNode && audioCtx) {
        // Suavizado para evitar 'pops'
        gainNode.gain.setTargetAtTime(gananciaReal, audioCtx.currentTime, 0.02);
    }
}

/**
 * CIERRE UNIVERSAL (Tecla Escape)
 * Cierra diccionarios o configuraciones abiertas.
 */
function cerrarModalesAbiertos() {

    // 0. Prioridad: Modo Teatro (Añadido)
    const modalTeatro = document.getElementById('modal-teatro');
    if (modalTeatro && modalTeatro.style.display === 'flex') {
        cerrarTeatro();
        console.log("🎭 Modo Teatro cerrado vía ESC");
        return true;
    }
    // 1. Prioridad: Diccionario
    const modalDicc = document.getElementById('modal-diccionario');
    if (modalDicc && modalDicc.style.display === 'flex') {
        cerrarDiccionario();
        console.log("📘 Diccionario cerrado vía ESC");
        return true; // Retornamos true para indicar que ya hicimos una acción
    }

    // 2. Prioridad: Configuración Avanzada
    const modalConfig = document.getElementById('modalConfig');
    if (modalConfig && modalConfig.style.display === 'flex') {
        cerrarConfiguracion();
        console.log("⚙️ Configuración cerrada vía ESC");
        return true;
    }

    // 3. Prioridad: Modal de Descarga MP3
    const modalDescarga = document.getElementById('modal-descarga');
    if (modalDescarga && modalDescarga.style.display === 'flex') {
        cerrarModalDescarga();
        console.log("⬇️ Descarga cerrada vía ESC");
        return true;
    }

    // 4. Prioridad: Asistente LiraAI
    const modalIA = document.getElementById('modal-ia');
    if (modalIA && modalIA.style.display === 'flex') {
        if (typeof cerrarModalIA === 'function') cerrarModalIA();
        console.log("✨ LiraAI cerrado vía ESC");
        return true;
    }

    // 5. Prioridad: Notas (Panel Rápido o Gestor General)
    const panelNotaRapida = document.getElementById('panel-nota-rapida');
    if (panelNotaRapida && panelNotaRapida.style.display === 'flex') {
        if (typeof cerrarPanelNotaRapida === 'function') cerrarPanelNotaRapida();
        return true;
    }
    const modalNotas = document.getElementById('modal-notas');
    if (modalNotas && modalNotas.style.display === 'flex') {
        if (typeof cerrarModalNotas === 'function') cerrarModalNotas();
        return true;
    }

    return false;
}

/**
 * ACTUALIZAR FILTROS SNAPSHOT (V3 Final)
 * Sincroniza Diccionario, Botones de Filtro, Tono y Pausa en tiempo real.
 * Realiza un Hot Swap de audio sin recargar el PDF visualmente.
 */

async function actualizarFiltrosSnapshot(resegmentar = false) {
    try {
        // 1. CORTAR EL BUCLE GRÁFICO (Game Loop)
        if (window.requestID_Karaoke) {
            cancelAnimationFrame(window.requestID_Karaoke);
            window.requestID_Karaoke = null;
        }

        // 2. DETENCIÓN AGRESIVA (Anti-Eco para Edge/Navegador)
        // Forzamos el estado de lectura a false antes de llamar a detenerLectura
        leyendo = false;

        if (window.speechSynthesis) {
            window.speechSynthesis.pause();  // Bloqueo físico del flujo
            window.speechSynthesis.cancel(); // Vaciado de la cola de Windows/Edge
        }

        // 3. LIMPIEZA DE COLAS LOCALES (Piper)
        detenerLectura(false); // Detiene timers y procesos de streaming

        // --- GUILLOTINA LÓGICA ---
        // Incrementamos la sesión para invalidar cualquier callback (onend/onerror) 
        // de la voz que estaba sonando justo antes del clic.
        currentReadingSession += 10;
        window.currentReadingSession = currentReadingSession;

        if (window.activeAudioSources) {
            window.activeAudioSources.forEach(s => { try { s.stop(); } catch (e) { } });
            window.activeAudioSources = [];
        }

        // 4. LIMPIAR COLA DE PROCESAMIENTO (Caché de Python)
        await eel.limpiar_pasteleria()();

        // 5. RE-FILTRADO DESDE EL SNAPSHOT (Operación Silenciosa)
        if (!window.tutorialActivo && typeof datosPagina !== 'undefined' && datosPagina) {
            let dictActual = obtenerDiccionarioConsolidado();

            // Python lee los filtros autónomamente desde ajustes_lectura.json
            let nuevasOraciones = await eel.reaplicar_filtros_desde_snapshot(dictActual, null, resegmentar)();

            if (nuevasOraciones) {
                datosPagina.oraciones = nuevasOraciones;
                window.vozActivaSnapshot = vozPredeterminada;

                console.log("✅ Snapshot actualizado. Lectura detenida para aplicar nuevos filtros.");
            }
        }

        // 6. RESET VISUAL (Estado de Reposo)
        window.palabraKaraoke = null;
        dibujar();

    } catch (e) {
        console.error("🔥 Error en el Hot Swap del Snapshot:", e);
    }
}
