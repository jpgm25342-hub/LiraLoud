// -------------------------------------------------------------
// FUNCIONES DE DUCKING UI
// -------------------------------------------------------------
window.sincronizarDuckingNivel = function (valor) {
    let numVal = parseInt(valor) || 0;

    // Sincronizar slider principal
    let rngPrincipal = document.getElementById('rng-ducking-nivel');
    let lblPrincipal = document.getElementById('lbl-ducking-nivel');
    if (rngPrincipal) rngPrincipal.value = numVal;
    if (lblPrincipal) lblPrincipal.innerText = numVal + '%';

    // Sincronizar slider flotante
    let rngFlotante = document.getElementById('rng-ducking-flotante');
    let lblFlotante = document.getElementById('lbl-ducking-flotante-nivel');
    if (rngFlotante) rngFlotante.value = numVal;
    if (lblFlotante) lblFlotante.innerText = numVal + '%';

    // Actualizar icono dinámico de ondas de audio
    actualizarIconoDuckingDinamico(numVal);

    let chkDucking = document.getElementById('chk-ducking-volumen');
    let isActive = chkDucking ? chkDucking.checked : false;

    // Actualizar en tiempo real el audio del sistema
    if (typeof eel !== 'undefined' && eel.set_persistent_duck) {
        eel.set_persistent_duck(isActive, numVal)();
    }

    // Guardar cambios
    if (typeof guardarTodosAjustes === 'function') guardarTodosAjustes(false);
};

function actualizarIconoDuckingDinamico(val) {
    const oBaja = document.getElementById('ducking-onda-baja');
    const oMedia = document.getElementById('ducking-onda-media');
    const oAlta = document.getElementById('ducking-onda-alta');
    const oMute = document.getElementById('ducking-icono-mute');
    const contenedor = document.getElementById('contenedor-icono-ducking-flotante');

    if (!oBaja || !oMedia || !oAlta || !oMute) return;

    if (val === 0) {
        // En 0% sale silenciado (X Mute)
        oMute.style.display = 'block';
        oBaja.style.display = 'none';
        oMedia.style.display = 'none';
        oAlta.style.display = 'none';
        if (contenedor) contenedor.style.color = '#e74c3c';
    } else {
        oMute.style.display = 'none';
        if (contenedor) contenedor.style.color = '#7f8c8d';

        // La onda crece según el porcentaje de volumen
        oBaja.style.display = val > 0 ? 'block' : 'none';
        oMedia.style.display = val > 33 ? 'block' : 'none';
        oAlta.style.display = val > 66 ? 'block' : 'none';
    }
}
window.actualizarIconoDuckingDinamico = actualizarIconoDuckingDinamico;

window.aplicarVisibilidadDucking = function () {
    let panelFlotante = document.getElementById('panel-ducking-flotante');
    let chkDucking = document.getElementById('chk-ducking-volumen');
    let rngPrincipal = document.getElementById('rng-ducking-nivel');
    let valor = rngPrincipal ? rngPrincipal.value : 20;

    if (panelFlotante && chkDucking) {
        if (chkDucking.checked) {
            panelFlotante.style.display = 'flex';
            actualizarIconoDuckingDinamico(parseInt(valor) || 0);
        } else {
            panelFlotante.style.display = 'none';
        }
    }

    // Aplicar o quitar el ducking permanente en python
    let isActive = chkDucking ? chkDucking.checked : false;
    if (typeof eel !== 'undefined' && eel.set_persistent_duck) {
        eel.set_persistent_duck(isActive, valor)();
    }
};

