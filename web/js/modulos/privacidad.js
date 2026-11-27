// MODO PRIVACIDAD ESTRICTA (100% OFFLINE)
// ==========================================
window.modoPrivacidadEstricta = false;

function toggleModoPrivacidad(activo) {
    window.modoPrivacidadEstricta = !!activo;
    console.log(`🛡️ [PRIVACIDAD] Modo 100% Offline: ${window.modoPrivacidadEstricta ? 'ACTIVADO' : 'DESACTIVADO'}`);

    if (window.modoPrivacidadEstricta) {
        // 1. Forzar motor de traducción a offline si estaba en online o híbrido
        const selMotorTrad = document.getElementById('sel-traduccion-motor');
        if (selMotorTrad && (selMotorTrad.value === 'online' || selMotorTrad.value === 'hibrido')) {
            selMotorTrad.value = 'offline';
        }

        // 2. Apagar pre-traducción en red si estuviese activa
        const chkPretrad = document.getElementById('chk-pretraducir-paginas');
        if (chkPretrad && chkPretrad.checked) {
            chkPretrad.checked = false;
        }
        if (typeof actualizarVisibilidadPrecargaHojas === 'function') {
            actualizarVisibilidadPrecargaHojas();
        }

        // 3. Forzar proveedor de IA a Ollama (local) si estaba en cloud
        const selIaProv = document.getElementById('sel-ia-proveedor');
        if (selIaProv && selIaProv.value !== 'ollama') {
            selIaProv.value = 'ollama';
            if (typeof configProveedores !== 'undefined') {
                configProveedores.proveedorActivo = 'ollama';
            }
        }
    }

    // Informar a Python para aplicar el cerrojo de red
    if (typeof eel !== 'undefined' && eel.establecer_modo_privacidad) {
        try {
            eel.establecer_modo_privacidad(window.modoPrivacidadEstricta)();
        } catch (e) {
            console.warn("⚠️ No se pudo enviar estado de privacidad a Python:", e);
        }
    }

    // Refrescar selector de voces para ocultar/mostrar Edge
    if (typeof actualizarListaVocesUI === 'function') {
        actualizarListaVocesUI();
    }

    if (window.modoPrivacidadEstricta) {
        // 4. Si la voz actual es de nube o online del navegador, conmutar a la primera voz local del filtro de idioma
        const selVozLive = document.getElementById('selector-voz-live');
        if (selVozLive) {
            const valVoz = (selVozLive.value || '').toLowerCase();
            const esVozNube = !valVoz || (
                valVoz.includes('online') ||
                valVoz.includes('natural') ||
                (!valVoz.startsWith('local-') && !valVoz.endsWith('.onnx') && !valVoz.includes('kokoro'))
            );
            if (esVozNube && selVozLive.options.length > 0) {
                // Tomar la primera opción disponible del selector (que ya tiene aplicado el filtro de idioma y solo tiene voces locales)
                const optLocal = Array.from(selVozLive.options).find(o => {
                    const vLower = (o.value || '').toLowerCase();
                    const nLower = (o.text || '').toLowerCase();
                    return !vLower.includes('online') && !nLower.includes('online') && !vLower.includes('natural') && !nLower.includes('natural') &&
                           (vLower.startsWith('local-') || vLower.includes('kokoro') || vLower.endsWith('.onnx'));
                }) || selVozLive.options[0];

                if (optLocal && optLocal.value) {
                    selVozLive.value = optLocal.value;
                    const inpBuscador = document.getElementById('busqueda-voz-live');
                    if (inpBuscador) {
                        inpBuscador.value = optLocal.text ? optLocal.text.replace(/^⭐\s*/, "") : optLocal.value;
                    }
                    if (typeof vozIntencionUsuario !== 'undefined') {
                        vozIntencionUsuario = optLocal.value;
                    }
                    if (typeof vozPredeterminada !== 'undefined') {
                        vozPredeterminada = optLocal.value;
                    }
                    console.log(`🛡️ [PRIVACIDAD] Conmutando voz en vivo a local segura: ${optLocal.value}`);
                    if (typeof cambiarVozLive === 'function') {
                        cambiarVozLive();
                    }
                }
            }
        }
    }
}
window.toggleModoPrivacidad = toggleModoPrivacidad;

// Notificación visual de bloqueo por modo privacidad
function notificarBloqueoPrivacidad(accion) {
    const textoMsg = `Actualmente te encuentras usando el modo privacidad. Desactiva el modo en Ajustes > Avanzado para utilizar funciones en línea (${accion}).`;
    if (typeof mostrarToastLira === 'function') {
        mostrarToastLira(textoMsg, 'advertencia');
    } else if (typeof liraAlert === 'function') {
        liraAlert(textoMsg, 'advertencia');
    }
}

window.notificarBloqueoPrivacidad = notificarBloqueoPrivacidad;
