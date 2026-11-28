// =============================================================
// FUNCIONES DE CONTROL DE TRADUCCIÓN HÍBRIDA & SUBTÍTULOS
// =============================================================
window.toggleMenuTraduccion = function (activo) {
    const panel = document.getElementById('panel-ajustes-traduccion');
    if (panel) panel.style.display = activo ? 'block' : 'none';
};

window.abrirConfiguracionTraduccion = function () {
    // Abrir la ventana modal de configuración avanzada
    if (typeof abrirConfiguracion === 'function') {
        abrirConfiguracion();
    }

    // Esperar a que se abra y hacer scroll hasta la sección de Traducción
    setTimeout(() => {
        const panel = document.getElementById('panel-ajustes-traduccion');
        if (panel) {
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Efecto visual para destacar la sección
            const originalShadow = panel.style.boxShadow;
            panel.style.boxShadow = '0 0 15px rgba(230, 126, 34, 0.8)';
            setTimeout(() => {
                panel.style.boxShadow = originalShadow;
            }, 1500);
        }
    }, 300);
};

window.actualizarVisibilidadBtnTraduccion = function () {
    const btn = document.getElementById('btn-traduccion');
    const chk = document.getElementById('chk-traduccion-activa');
    if (btn && chk) {
        if (chk.checked) {
            btn.style.background = '#e67e22'; // Naranja activo
            btn.style.color = 'white';
        } else {
            btn.style.background = ''; // Vuelve al estilo CSS secundario normal
            btn.style.color = '';
        }
    }
};

window.subtituloPalabrasActuales = [];
window.ultimoIdxSubtituloKaraoke = -1;

window.mostrarSubtituloTraduccion = function (texto, origen = 'AUTO', destino = 'ES') {
    const flotante = document.getElementById('subtitulo-traduccion-flotante');
    const txtCuerpo = document.getElementById('subtitulo-texto-traducido');
    const tagIdiomas = document.getElementById('subtitulo-idiomas-tag');
    if (!flotante || !txtCuerpo) return;

    window.ultimoIdxSubtituloKaraoke = -1;
    window.subtituloPalabrasActuales = [];

    const textoStr = String(texto || '').trim();
    if (!textoStr) {
        txtCuerpo.innerText = '...';
        return;
    }

    const fragmentos = textoStr.split(/\s+/).filter(w => w.length > 0);
    txtCuerpo.innerHTML = '';

    fragmentos.forEach((palabra, idx) => {
        const span = document.createElement('span');
        span.className = 'sub-palabra';
        span.id = `sub-palabra-${idx}`;
        span.dataset.idx = idx;
        span.innerText = palabra;
        txtCuerpo.appendChild(span);
        window.subtituloPalabrasActuales.push(span);
    });

    if (tagIdiomas) tagIdiomas.innerText = `${(origen || 'AUTO').toUpperCase()} ➔ ${(destino || 'ES').toUpperCase()}`;
    flotante.style.display = 'block';

    // Aplicar el espaciado configurado por el usuario
    if (typeof aplicarSubtituloEspaciado === 'function') aplicarSubtituloEspaciado();
};

function _calcularIndiceSubtituloObjetivo(tiempoAudioActual, pAudio, pIdx, totalSubPalabras) {
    if (window.partituraActual && window.partituraActual.length > 0) {
        if (window.subtituloEsAudioDirecto && pAudio && pAudio.vIdx !== undefined) {
            return Math.min(totalSubPalabras - 1, Math.max(0, pAudio.vIdx));
        }
        const ultimaRebanada = window.partituraActual[window.partituraActual.length - 1];
        const durTotal = (ultimaRebanada && ultimaRebanada.e > 0) ? ultimaRebanada.e : 1.0;
        const progresoRel = Math.max(0, Math.min(1, tiempoAudioActual / durTotal));
        return Math.min(totalSubPalabras - 1, Math.floor(progresoRel * totalSubPalabras));
    }
    return (pIdx !== -1) ? Math.min(totalSubPalabras - 1, pIdx) : -1;
}

function _pintarClasesSubtituloKaraoke(palabras, targetIdx) {
    for (let i = 0; i < palabras.length; i++) {
        const el = palabras[i];
        if (!el) continue;
        let claseEsperada = 'sub-palabra';
        if (i < targetIdx) claseEsperada = 'sub-palabra sub-leida';
        else if (i === targetIdx) claseEsperada = 'sub-palabra sub-activa';
        if (el.className !== claseEsperada) el.className = claseEsperada;
    }
}

window.actualizarKaraokeSubtitulos = function (tiempoAudioActual, pAudio, pIdx) {
    const flotante = document.getElementById('subtitulo-traduccion-flotante');
    const palabras = window.subtituloPalabrasActuales;
    if (!flotante || flotante.style.display === 'none' || !palabras || palabras.length === 0) {
        return;
    }

    const targetIdx = _calcularIndiceSubtituloObjetivo(tiempoAudioActual, pAudio, pIdx, palabras.length);
    if (targetIdx === window.ultimoIdxSubtituloKaraoke) return;

    window.ultimoIdxSubtituloKaraoke = targetIdx;
    _pintarClasesSubtituloKaraoke(palabras, targetIdx);
};

window.cerrarSubtituloTraduccion = function () {
    const flotante = document.getElementById('subtitulo-traduccion-flotante');
    if (flotante) flotante.style.display = 'none';
    window.subtituloPalabrasActuales = [];
    window.ultimoIdxSubtituloKaraoke = -1;
};

window.limpiarSubtitulosTraduccion = function () {
    cerrarSubtituloTraduccion();
};

window.aplicarSubtituloEspaciado = function () {
    const lineHeightRaw = parseInt(document.getElementById('rng-sub-lineheight')?.value ?? 12);
    const wordGapRaw = parseInt(document.getElementById('rng-sub-wordgap')?.value ?? 2);
    const lineHeight = (lineHeightRaw / 10).toFixed(1);   // 10→1.0, 12→1.2, 20→2.0
    const wordGap = wordGapRaw + 'px';

    // Actualizar etiquetas
    const lblLH = document.getElementById('val-sub-lineheight');
    if (lblLH) lblLH.innerText = lineHeight;
    const lblWG = document.getElementById('val-sub-wordgap');
    if (lblWG) lblWG.innerText = wordGap;

    // Aplicar al contenedor de subtítulos
    const cuerpo = document.getElementById('subtitulo-texto-traducido');
    if (cuerpo) {
        cuerpo.style.lineHeight = lineHeight;
        cuerpo.style.gap = `0px ${wordGap}`;
    }
};

window.dispararPretraduccionEntorno = function () {
    const pretraducirActivo = document.getElementById('chk-pretraducir-paginas')?.checked ?? true;
    const tradActiva = document.getElementById('chk-traduccion-activa')?.checked ?? false;
    if (pretraducirActivo && tradActiva && typeof paginaActual !== 'undefined' && typeof eel !== 'undefined' && typeof eel.pretraducir_bloque_paginas === 'function') {
        const origen = document.getElementById('sel-traduccion-origen')?.value || 'auto';
        const destino = document.getElementById('sel-traduccion-destino')?.value || 'es';
        const motor = document.getElementById('sel-traduccion-motor')?.value || 'online';
        eel.pretraducir_bloque_paginas(paginaActual, origen, destino, motor, true)();
    }
};
