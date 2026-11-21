/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// 2. INICIALIZACIÓN (CORREGIDO)
// ==========================================
async function forzarCargaPiper() {
    return new Promise((resolve) => {
        let intentos = 0;
        
        const intentarConexion = async () => {
            if (vocesPython && vocesPython.length > 0) return resolve(); 

            intentos++;
            console.log(`📡 Buscando motor Piper (Intento ${intentos}/10)...`);

            try {
                // Tarea 6: Sincronizar catálogo asíncrono
                // Esperar a que la lista no sea undefined y además tenga voces (incluyendo las de Edge que no empiezan con Local-)
                let voces = await eel.obtener_voces_disponibles()();
                
                if (voces && voces.length > 0) {
                    const tieneEdge = voces.some(v => !v.id.startsWith("Local-"));
                    if (tieneEdge || intentos >= 15) { // Esperar a Edge o forzar después de ~10 seg
                        vocesPython = voces;
                        try {
                            llenarTodosLosSelectores();
                            actualizarListaVocesUI();
                        } catch(e) { console.warn("Ajuste visual menor ignorado."); }
                        
                        console.log("✅ Motor de voces enlazado (Edge + Piper).");
                        return resolve(); // 🔓 ÉXITO
                    }
                }
            } catch (e) {
                // Falla silenciosa esperada
            }

            // 🛡️ GUILLOTINA: Máximo 20 intentos (~12 segundos)
            if (intentos >= 20) {
                console.error("⚠️ Timeout absoluto. Liberando interfaz para Edge TTS.");
                return resolve();
            }

            setTimeout(intentarConexion, 600);
        };
        intentarConexion();
    });
}




/**
 * LÓGICA DE DESPLAZAMIENTO DINÁMICO (Drag & Drop Interactivo)
 * Hace que los elementos se aparten al pasar el mouse por encima.
 */
const habilitarReordenamientoVisual = () => {
    const contenedor = document.getElementById('tabla-terminos');
    
    if (!contenedor) return;

    contenedor.addEventListener('dragover', e => {
        e.preventDefault(); // Permite el aterrizaje
        const draggingItem = document.querySelector('.dragging');
        if (!draggingItem) return;

        // Buscamos el elemento que está debajo del cursor
        const afterElement = getDragAfterElement(contenedor, e.clientY);
        
        if (afterElement == null) {
            // Si no hay nada debajo, lo mandamos al final
            contenedor.appendChild(draggingItem);
        } else {
            // ¡MAGIA VISUAL! Insertamos ANTES del elemento detectado,
            // lo que hace que el otro "salte" hacia abajo automáticamente.
            contenedor.insertBefore(draggingItem, afterElement);
        }
    });
};

/**
 * Función de cálculo de proximidad (El "radar" de posición)
 */
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.fila-termino:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        // Buscamos el elemento más cercano donde el offset sea negativo (estamos encima)
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}
/**
 * GUARDAR ORDEN TRAS DESLIZAMIENTO (Versión Optimizada con Debounce)
 * Evita escrituras masivas en el disco mientras el usuario organiza.
 */
async function guardarOrdenTrasDeslizamiento() {
    // Si mueves otra abreviatura antes de que pasen 500ms, reiniciamos el reloj
    if (timeoutGuardadoOrden) clearTimeout(timeoutGuardadoOrden);

    timeoutGuardadoOrden = setTimeout(async () => {
        console.log("💾 Consolidando nuevo orden en base de datos...");
        
        let nuevoOrdenTerms = {};
        const filas = document.querySelectorAll('.fila-termino');
        
        filas.forEach(f => {
            // Extraemos la sigla para reconstruir el objeto en el orden visual actual
            const siglaEl = f.querySelector('.col-sigla');
            if (siglaEl) {
                const sigla = siglaEl.innerText;
                nuevoOrdenTerms[sigla] = dbDiccionario[seccionActual].terms[sigla];
            }
        });

        // 1. Actualizamos la RAM
        dbDiccionario[seccionActual].terms = nuevoOrdenTerms;
        
        // 2. Guardamos físicamente en el JSON vía Python
        await eel.guardar_diccionario(dbDiccionario)();
        
        console.log("✅ Orden sincronizado correctamente.");
    }, 500); // 500ms es el tiempo ideal para que tu Red Ejecutiva termine el movimiento
}

// Ejecutar la habilitación
habilitarReordenamientoVisual();
window.addEventListener('beforeunload', () => { if (rutaPDFActual) guardarEstadoPaginaActual(); });

//''''''''''''''''''''
// PANTALLA DE CARGA
//''''''''''''''''''''

// PYTON A JS
eel.expose(actualizar_log_carga);
function actualizar_log_carga(mensaje) {
    const hud = document.getElementById('txt-paso-carga');
    if (hud) {
        // Limpiamos clases anteriores
        hud.className = ''; 
        
        // Lógica de inferencia de estado
        if (mensaje.includes("Error") || mensaje.includes("❌")) {
            hud.classList.add('log-error');
        } else if (mensaje.includes("¡Todos") || mensaje.includes("éxito")) {
            hud.classList.add('log-exito');
        } else if (mensaje.includes("Cargando")) {
            hud.classList.add('log-cargando');
        } else {
            hud.classList.add('log-info');
        }
        
        hud.innerText = "" + mensaje;
    }
}

// --- SISTEMA DE BLOQUEO VISUAL REACTIVO ---
function invocarPantallaCarga(mensaje) {
    const pantalla = document.getElementById('pantalla-carga');
    const hud = document.getElementById('txt-paso-carga');
    if (pantalla) {
        pantalla.style.display = 'flex';
        // Usamos setTimeout para permitir que el DOM renderice el display:flex antes de animar la opacidad
        setTimeout(() => pantalla.style.opacity = '1', 10);
    }
    if (hud) hud.innerText = "" + mensaje;
}

function retirarPantallaCarga() {
    console.log("🪓 Ejecutando guillotina final...");
    const pantalla = document.getElementById('pantalla-carga');
    
    if (pantalla) {
        pantalla.style.transition = "opacity 0.5s ease-out";
        pantalla.style.opacity = '0';
        
        setTimeout(() => {
            pantalla.style.display = 'none';
            if (pantalla.parentNode) {
                pantalla.parentNode.removeChild(pantalla);
                console.log("✅ Pantalla de carga eliminada.");
                
                // 👇 La pantalla de bienvenida (#lira-bienvenida) ya está visible en el DOM.
                // El usuario elige la acción desde el grid 2×2. No se abre ningún buscador automáticamente.
                console.log("🏠 [INIT] Pantalla de bienvenida activa.");
            }
        }, 500);
    }
}

// Ejecutar inmediatamente al cargar el script
// ==========================================
