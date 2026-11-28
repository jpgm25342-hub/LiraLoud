// MODO PRIVACIDAD ESTRICTA (100% OFFLINE)
// ==========================================
window.modoPrivacidadEstricta = false;

function _aplicarRestriccionesOfflineUI() {
    const selMotorTrad = document.getElementById('sel-traduccion-motor');
    if (selMotorTrad && (selMotorTrad.value === 'online' || selMotorTrad.value === 'hibrido')) {
        selMotorTrad.value = 'offline';
    }

    const chkPretrad = document.getElementById('chk-pretraducir-paginas');
    if (chkPretrad && chkPretrad.checked) {
        chkPretrad.checked = false;
    }
    if (typeof actualizarVisibilidadPrecargaHojas === 'function') {
        actualizarVisibilidadPrecargaHojas();
    }

    const selIaProv = document.getElementById('sel-ia-proveedor');
    if (selIaProv && selIaProv.value !== 'ollama') {
        selIaProv.value = 'ollama';
        if (typeof configProveedores !== 'undefined') {
            configProveedores.proveedorActivo = 'ollama';
        }
    }
}

function _esVozNubeOOnlinePrivacidad(valVoz) {
    if (!valVoz) return true;
    if (valVoz.includes('online') || valVoz.includes('natural')) return true;
    return !valVoz.startsWith('local-') && !valVoz.endsWith('.onnx') && !valVoz.includes('kokoro');
}

function _esOpcionLocalSeguraPrivacidad(opt) {
    const vLower = (opt.value || '').toLowerCase();
    const nLower = (opt.text || '').toLowerCase();
    if (vLower.includes('online') || nLower.includes('online')) return false;
    if (vLower.includes('natural') || nLower.includes('natural')) return false;
    return vLower.startsWith('local-') || vLower.includes('kokoro') || vLower.endsWith('.onnx');
}

function _conmutarVozLiveALocalSegura() {
    const selVozLive = document.getElementById('selector-voz-live');
    if (!selVozLive || selVozLive.options.length === 0) return;

    const valVoz = (selVozLive.value || '').toLowerCase();
    if (!_esVozNubeOOnlinePrivacidad(valVoz)) return;

    const optLocal = Array.from(selVozLive.options).find(_esOpcionLocalSeguraPrivacidad) || selVozLive.options[0];
    if (!optLocal || !optLocal.value) return;

    selVozLive.value = optLocal.value;
    const inpBuscador = document.getElementById('busqueda-voz-live');
    if (inpBuscador) {
        inpBuscador.value = optLocal.text ? optLocal.text.replace(/^⭐\s*/, "") : optLocal.value;
    }
    if (typeof vozIntencionUsuario !== 'undefined') vozIntencionUsuario = optLocal.value;
    if (typeof vozPredeterminada !== 'undefined') vozPredeterminada = optLocal.value;

    console.log(`🛡️ [PRIVACIDAD] Conmutando voz en vivo a local segura: ${optLocal.value}`);
    if (typeof cambiarVozLive === 'function') cambiarVozLive();
}

function toggleModoPrivacidad(activo) {
    window.modoPrivacidadEstricta = !!activo;
    console.log(`🛡️ [PRIVACIDAD] Modo 100% Offline: ${window.modoPrivacidadEstricta ? 'ACTIVADO' : 'DESACTIVADO'}`);

    if (window.modoPrivacidadEstricta) {
        _aplicarRestriccionesOfflineUI();
    }

    if (typeof eel !== 'undefined' && eel.establecer_modo_privacidad) {
        try {
            eel.establecer_modo_privacidad(window.modoPrivacidadEstricta)();
        } catch (e) {
            console.warn("⚠️ No se pudo enviar estado de privacidad a Python:", e);
        }
    }

    if (typeof actualizarListaVocesUI === 'function') {
        actualizarListaVocesUI();
    }

    if (window.modoPrivacidadEstricta) {
        _conmutarVozLiveALocalSegura();
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
