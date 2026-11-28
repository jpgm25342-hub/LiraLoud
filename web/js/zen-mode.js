/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// js/zen-mode.js

function _obtenerContenedorCercano(inputId, selector) {
    const el = document.getElementById(inputId);
    return el ? el.closest(selector) : null;
}

function _activarLayoutModoZen() {
    document.body.classList.add('modo-minimalista');

    const filaFiltros = document.querySelector('.fila-filtros');
    if (filaFiltros) {
        document.getElementById('zen-filtros-container').appendChild(filaFiltros);
        filaFiltros.style.flexDirection = 'column';
        filaFiltros.style.display = 'flex';
    }

    const boxColumnas = document.querySelector('.fila-top .box-columnas');
    if (boxColumnas) {
        document.getElementById('zen-limites-container').appendChild(boxColumnas);
    }

    const zenVozContainer = document.getElementById('zen-voz-select-container');
    if (zenVozContainer) {
        const comboIdioma = _obtenerContenedorCercano('busqueda-idioma-live', '.combo-contenedor');
        if (comboIdioma) {
            zenVozContainer.appendChild(comboIdioma);
            comboIdioma.style.width = '100%';
            comboIdioma.style.marginBottom = '5px';
        }
        const comboVoz = _obtenerContenedorCercano('busqueda-voz-live', '.combo-contenedor');
        if (comboVoz) {
            zenVozContainer.appendChild(comboVoz);
            comboVoz.style.width = '100%';
        }
    }

    const slidersZen = [
        ['rng-velocidad', 'zen-velocidad-container'],
        ['rng-pausa', 'zen-pausa-container'],
        ['rng-tono', 'zen-tono-container']
    ];
    slidersZen.forEach(([inputId, targetId]) => {
        const cont = _obtenerContenedorCercano(inputId, '.box-columnas');
        if (!cont) return;
        document.getElementById(targetId).appendChild(cont);
        cont.style.width = '100%';
        cont.style.justifyContent = 'space-between';
    });
}

function _restaurarControlesVozDesdeZen() {
    const filaAjustes = document.querySelector('.fila-ajustes');
    const filaControles = document.querySelector('.fila-controles');
    if (!filaAjustes || !filaControles) return;

    const comboIdioma = _obtenerContenedorCercano('busqueda-idioma-live', '.combo-contenedor');
    if (comboIdioma) {
        comboIdioma.style.width = '140px';
        comboIdioma.style.marginBottom = '0';
        filaAjustes.insertBefore(comboIdioma, filaControles);
    }

    const comboVoz = _obtenerContenedorCercano('busqueda-voz-live', '.combo-contenedor');
    if (comboVoz) {
        comboVoz.style.width = '250px';
        filaAjustes.insertBefore(comboVoz, filaControles);
    }

    ['rng-velocidad', 'rng-tono', 'rng-pausa'].forEach(inputId => {
        const cont = _obtenerContenedorCercano(inputId, '.box-columnas');
        if (!cont) return;
        cont.style.width = 'auto';
        cont.style.justifyContent = 'center';
        filaAjustes.insertBefore(cont, filaControles);
    });
}

function _restaurarLayoutModoNormal() {
    document.body.classList.remove('modo-minimalista');

    const filaFiltros = document.querySelector('.fila-filtros');
    const bannerContainer = document.getElementById('banner-container');
    if (filaFiltros && bannerContainer) {
        filaFiltros.style.flexDirection = 'row';
        bannerContainer.appendChild(filaFiltros);
    }

    const limitesCont = document.getElementById('zen-limites-container');
    const boxColumnas = limitesCont ? limitesCont.querySelector('.box-columnas') : null;
    const filaTop = document.querySelector('.fila-top');
    const paginacion = document.querySelector('.paginacion-container');
    if (boxColumnas && filaTop && paginacion) {
        filaTop.insertBefore(boxColumnas, paginacion.nextSibling);
    }

    _restaurarControlesVozDesdeZen();

    ['zen-panel-voz', 'zen-panel-menu'].forEach(id => {
        const panel = document.getElementById(id);
        if (!panel) return;
        panel.classList.remove('zen-active');
        panel.style.display = 'none';
    });
}

function toggleModoZen(isActive) {
    if (isActive) {
        _activarLayoutModoZen();
    } else {
        _restaurarLayoutModoNormal();
    }
}

function toggleZenVoz() {
    const dEdicionBar = document.getElementById('zen-details-edicion-bar');
    if (dEdicionBar) dEdicionBar.open = false;

    const pMenu = document.getElementById('zen-panel-menu');
    if (pMenu) {
        pMenu.classList.remove('zen-active');
        pMenu.style.display = 'none';
    }

    const pVoz = document.getElementById('zen-panel-voz');
    if (pVoz) {
        if(pVoz.style.display === 'none') {
            pVoz.style.display = 'block';
            pVoz.classList.add('zen-active');
        } else {
            pVoz.style.display = 'none';
            pVoz.classList.remove('zen-active');
        }
    }
}

function toggleZenMenu(forceClose = false) {
    const dEdicionBar = document.getElementById('zen-details-edicion-bar');
    if (dEdicionBar) dEdicionBar.open = false;

    const pVoz = document.getElementById('zen-panel-voz');
    if (pVoz) {
        pVoz.classList.remove('zen-active');
        pVoz.style.display = 'none';
    }

    const pMenu = document.getElementById('zen-panel-menu');
    if (!pMenu) return;

    if (forceClose || pMenu.style.display === 'block') {
        pMenu.querySelectorAll('details[open]').forEach(d => d.open = false);
        pMenu.style.display = 'none';
        pMenu.classList.remove('zen-active');
    } else {
        pMenu.style.display = 'block';
        pMenu.classList.add('zen-active');
    }
}

// Sincronización entre Modo Zen y Configuración General
function sincronizarTraduccionDesdeZen(checked) {
    if (typeof safeCheck === 'function') {
        safeCheck('chk-traduccion-activa', checked);
        // Despachar evento para asegurar que todo escuche el cambio
        const chk = document.getElementById('chk-traduccion-activa');
        if (chk) chk.dispatchEvent(new Event('change'));
    }
    if (typeof actualizarVisibilidadBtnTraduccion === 'function') {
        actualizarVisibilidadBtnTraduccion();
    }
}

function sincronizarSelectTraduccion(tipo, valor) {
    if (typeof safeUI !== 'function') return;
    if (tipo === 'origen') {
        safeUI('sel-traduccion-origen', valor);
    } else if (tipo === 'destino') {
        safeUI('sel-traduccion-destino', valor);
    } else if (tipo === 'modo') {
        safeUI('sel-traduccion-modo', valor);
    }
}

// --- EXCLUSIVIDAD MUTUA UNIVERSAL DE LAS 8 FUNCIONES PRINCIPALES ---
function _cerrarModalSiVisible(modalId, nombreFnCerrar) {
    const el = document.getElementById(modalId);
    if (!el) return;
    if (el.style.display !== 'flex' && el.style.display !== 'block') return;
    const fn = nombreFnCerrar ? window[nombreFnCerrar] : null;
    if (typeof fn === 'function') fn();
    else el.style.display = 'none';
}

function _cerrarDetailsSiAbierto(detailsId) {
    const el = document.getElementById(detailsId);
    if (el && el.open) el.open = false;
}

const _REGLAS_CIERRE_ZEN = [
    { claves: ['mp3'], modales: [['modal-descarga', null]] },
    { claves: ['teatro'], modales: [['modal-teatro', 'cerrarTeatro']] },
    { claves: ['diccionario'], modales: [['modal-diccionario', 'cerrarDiccionario']] },
    { claves: ['ocr'], details: ['zen-details-ocr'] },
    { claves: ['traduccion'], details: ['zen-details-traduccion'], modales: [['modal-traduccion', 'cerrarModalTraduccion']] },
    { claves: ['ia'], modales: [['modal-ia', 'cerrarModalIA']] },
    { claves: ['filtros'], details: ['zen-details-filtros'] },
    { claves: ['limites'], details: ['zen-details-limites'] },
    { claves: ['notas', 'nota_rapida'], modales: [['modal-notas', 'cerrarModalNotas'], ['panel-nota-rapida', 'cerrarPanelNotaRapida']] },
];

// 1. Guardar MP3 | 2. Modo Teatro | 3. Diccionario | 4. OCR
// 5. Traducción   | 6. LiraAI     | 7. Filtros     | 8. Límites
function cerrarOtrasFuncionesPrincipales(excepto = '') {
    _REGLAS_CIERRE_ZEN.forEach(regla => {
        if (regla.claves.includes(excepto)) return;
        if (regla.details) regla.details.forEach(_cerrarDetailsSiAbierto);
        if (regla.modales) regla.modales.forEach(([id, fn]) => _cerrarModalSiVisible(id, fn));
    });
}
window.cerrarOtrasFuncionesPrincipales = cerrarOtrasFuncionesPrincipales;

// Exclusividad y cierre mutuo de funciones en Funciones Principales (Modo Zen)
function inicializarExclusividadZen() {
    const pMenu = document.getElementById('zen-panel-menu');
    if (!pMenu) return;

    const detailsList = pMenu.querySelectorAll('details');
    detailsList.forEach(detail => {
        detail.addEventListener('toggle', function () {
            if (this.open) {
                const tipo = this.id.replace('zen-details-', '');
                if (tipo === 'limites' && window.modoMoverElementosActivo && typeof window.toggleModoMoverElementos === 'function') {
                    window.toggleModoMoverElementos(false);
                }
                cerrarOtrasFuncionesPrincipales(tipo);
            }
        });
    });

    // Al hacer clic en un botón de acción simple (MP3, Teatro, Abreviaturas, IA, Notas), cerrar las demás funciones
    const btnMP3 = pMenu.querySelector('button[onclick*="abrirModalDescarga"]');
    if (btnMP3) {
        btnMP3.addEventListener('click', function () {
            cerrarOtrasFuncionesPrincipales('mp3');
        });
    }

    const btnTeatro = pMenu.querySelector('button[onclick*="iniciarTeatro"]');
    if (btnTeatro) {
        btnTeatro.addEventListener('click', function () {
            cerrarOtrasFuncionesPrincipales('teatro');
        });
    }

    const btnDicc = pMenu.querySelector('button[onclick*="toggleDiccionario"]');
    if (btnDicc) {
        btnDicc.addEventListener('click', function () {
            cerrarOtrasFuncionesPrincipales('diccionario');
        });
    }

    const btnIA = pMenu.querySelector('button[onclick*="abrirModalIA"]');
    if (btnIA) {
        btnIA.addEventListener('click', function () {
            cerrarOtrasFuncionesPrincipales('ia');
        });
    }

    const btnNotas = pMenu.querySelector('button[onclick*="toggleModalNotas"]');
    if (btnNotas) {
        btnNotas.addEventListener('click', function () {
            cerrarOtrasFuncionesPrincipales('notas');
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarExclusividadZen);
} else {
    inicializarExclusividadZen();
}

// Cerrar paneles Zen al hacer clic fuera de ellos
document.addEventListener('click', function(event) {
    if (!document.body.classList.contains('modo-minimalista')) return;

    const dEdicionBar = document.getElementById('zen-details-edicion-bar');
    if (dEdicionBar && dEdicionBar.open && !dEdicionBar.contains(event.target)) {
        dEdicionBar.open = false;
    }

    const pVoz = document.getElementById('zen-panel-voz');
    const pMenu = document.getElementById('zen-panel-menu');
    const btnVoz = document.getElementById('btn-zen-voz');
    const btnMenu = document.getElementById('btn-zen-menu');

    // Cerrar panel de voz si el clic no es en él ni en su botón
    if (pVoz && pVoz.style.display === 'block') {
        if (!pVoz.contains(event.target) && (!btnVoz || !btnVoz.contains(event.target))) {
            const detallesAbiertos = pVoz.querySelectorAll('details[open]');
            if (detallesAbiertos.length > 0) {
                detallesAbiertos.forEach(d => d.open = false);
            } else {
                pVoz.style.display = 'none';
                pVoz.classList.remove('zen-active');
            }
        }
    }

    // Cerrar panel de menú si el clic no es en él ni en su botón
    if (pMenu && pMenu.style.display === 'block') {
        if (!pMenu.contains(event.target) && (!btnMenu || !btnMenu.contains(event.target))) {
            const detallesAbiertos = pMenu.querySelectorAll('details[open]');
            if (detallesAbiertos.length > 0) {
                detallesAbiertos.forEach(d => d.open = false);
            } else {
                pMenu.style.display = 'none';
                pMenu.classList.remove('zen-active');
            }
        } else if (pMenu.contains(event.target)) {
            // Clic dentro del menú: si no se hizo clic dentro del desplegable abierto ni en su summary, cerrarlo
            const openDetails = pMenu.querySelectorAll('details[open]');
            openDetails.forEach(d => {
                if (!d.contains(event.target)) {
                    d.open = false;
                }
            });
        }
    }
});

function toggleEtiquetasZen(mostrar) {
    const pMenu = document.getElementById('zen-panel-menu');
    if (pMenu) {
        if (mostrar) {
            pMenu.classList.remove('zen-sin-etiquetas');
        } else {
            pMenu.classList.add('zen-sin-etiquetas');
        }
    }
}

function toggleUnirSoloLecturaZen(unir) {
    document.body.classList.toggle('zen-unir-solo-lectura', !!unir);
    if (typeof sincronizarIndicadorTeatroZen === 'function') {
        sincronizarIndicadorTeatroZen();
    }
}
window.toggleUnirSoloLecturaZen = toggleUnirSoloLecturaZen;


