/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// js/zen-mode.js

function toggleModoZen(isActive) {
    if (isActive) {
        document.body.classList.add('modo-minimalista');
        
        // 1. Mover checkboxes de filtros al panel zen-menu
        const filaFiltros = document.querySelector('.fila-filtros');
        if (filaFiltros) {
            document.getElementById('zen-filtros-container').appendChild(filaFiltros);
            filaFiltros.style.flexDirection = 'column';
            filaFiltros.style.display = 'flex';
        }
        
        // 2. Mover botones de limites al panel zen-menu
        // El de límites es el primero que está en la fila superior (dentro de fila-top)
        const boxColumnas = document.querySelector('.fila-top .box-columnas');
        if (boxColumnas) {
            document.getElementById('zen-limites-container').appendChild(boxColumnas);
        }
        
        // 3. Mover los contenedores originales de Idioma y Voz al zen-panel-voz
        const btnIdioma = document.getElementById('busqueda-idioma-live');
        const comboIdioma = btnIdioma ? btnIdioma.closest('.combo-contenedor') : null;
        const btnVoz = document.getElementById('busqueda-voz-live');
        const comboVoz = btnVoz ? btnVoz.closest('.combo-contenedor') : null;
        
        const zenVozContainer = document.getElementById('zen-voz-select-container');
        if (zenVozContainer) {
            if (comboIdioma) {
                zenVozContainer.appendChild(comboIdioma);
                comboIdioma.style.width = '100%';
                comboIdioma.style.marginBottom = '5px';
            }
            if (comboVoz) {
                zenVozContainer.appendChild(comboVoz);
                comboVoz.style.width = '100%';
            }
        }
        
        // 4. Mover sliders originales al zen-panel-voz
        const velInput = document.getElementById('rng-velocidad');
        const velContainer = velInput ? velInput.closest('.box-columnas') : null;
        if (velContainer) {
            document.getElementById('zen-velocidad-container').appendChild(velContainer);
            velContainer.style.width = '100%';
            velContainer.style.justifyContent = 'space-between';
        }
        
        const pausaInput = document.getElementById('rng-pausa');
        const pausaContainer = pausaInput ? pausaInput.closest('.box-columnas') : null;
        if (pausaContainer) {
            document.getElementById('zen-pausa-container').appendChild(pausaContainer);
            pausaContainer.style.width = '100%';
            pausaContainer.style.justifyContent = 'space-between';
        }
        
        const tonoInput = document.getElementById('rng-tono');
        const tonoContainer = tonoInput ? tonoInput.closest('.box-columnas') : null;
        if (tonoContainer) {
            document.getElementById('zen-tono-container').appendChild(tonoContainer);
            tonoContainer.style.width = '100%';
            tonoContainer.style.justifyContent = 'space-between';
        }

    } else {
        document.body.classList.remove('modo-minimalista');
        
        // 1. Devolver filtros a su posición original
        const filaFiltros = document.querySelector('.fila-filtros');
        const bannerContainer = document.getElementById('banner-container');
        if (filaFiltros && bannerContainer) {
            filaFiltros.style.flexDirection = 'row'; 
            bannerContainer.appendChild(filaFiltros);
        }
        
        // 2. Devolver límites a su posicion original (dentro de fila-top, despues de paginacion-container)
        // Ojo, document.getElementById('zen-limites-container').querySelector('.box-columnas')
        const limitesCont = document.getElementById('zen-limites-container');
        const boxColumnas = limitesCont ? limitesCont.querySelector('.box-columnas') : null;
        const filaTop = document.querySelector('.fila-top');
        const paginacion = document.querySelector('.paginacion-container');
        if (boxColumnas && filaTop && paginacion) {
            filaTop.insertBefore(boxColumnas, paginacion.nextSibling);
        }
        
        // 3. Devolver componentes de voz a fila-ajustes
        const filaAjustes = document.querySelector('.fila-ajustes');
        const filaControles = document.querySelector('.fila-controles');
        if (filaAjustes && filaControles) {
            const btnIdioma = document.getElementById('busqueda-idioma-live');
            const comboIdioma = btnIdioma ? btnIdioma.closest('.combo-contenedor') : null;
            if (comboIdioma) {
                comboIdioma.style.width = '140px';
                comboIdioma.style.marginBottom = '0';
                filaAjustes.insertBefore(comboIdioma, filaControles);
            }
            
            const btnVoz = document.getElementById('busqueda-voz-live');
            const comboVoz = btnVoz ? btnVoz.closest('.combo-contenedor') : null;
            if (comboVoz) {
                comboVoz.style.width = '250px';
                filaAjustes.insertBefore(comboVoz, filaControles);
            }
            
            const velInput = document.getElementById('rng-velocidad');
            const velContainer = velInput ? velInput.closest('.box-columnas') : null;
            if (velContainer) {
                velContainer.style.width = 'auto';
                velContainer.style.justifyContent = 'center';
                filaAjustes.insertBefore(velContainer, filaControles);
            }
            
            const tonoInput = document.getElementById('rng-tono');
            const tonoContainer = tonoInput ? tonoInput.closest('.box-columnas') : null;
            if (tonoContainer) {
                tonoContainer.style.width = 'auto';
                tonoContainer.style.justifyContent = 'center';
                filaAjustes.insertBefore(tonoContainer, filaControles);
            }
            
            const pausaInput = document.getElementById('rng-pausa');
            const pausaContainer = pausaInput ? pausaInput.closest('.box-columnas') : null;
            if (pausaContainer) {
                pausaContainer.style.width = 'auto';
                pausaContainer.style.justifyContent = 'center';
                filaAjustes.insertBefore(pausaContainer, filaControles);
            }
        }
        
        // 4. Ocultar paneles zen
        const pVoz = document.getElementById('zen-panel-voz');
        if(pVoz) {
            pVoz.classList.remove('zen-active');
            pVoz.style.display = 'none';
        }
        const pMenu = document.getElementById('zen-panel-menu');
        if(pMenu) {
            pMenu.classList.remove('zen-active');
            pMenu.style.display = 'none';
        }
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
// 1. Guardar MP3 | 2. Modo Teatro | 3. Diccionario | 4. OCR
// 5. Traducción   | 6. LiraAI     | 7. Filtros     | 8. Límites
function cerrarOtrasFuncionesPrincipales(excepto = '') {
    // 1. Guardar MP3
    if (excepto !== 'mp3') {
        const modalDescarga = document.getElementById('modal-descarga');
        if (modalDescarga && (modalDescarga.style.display === 'flex' || modalDescarga.style.display === 'block')) {
            modalDescarga.style.display = 'none';
        }
    }

    // 2. Modo Teatro
    if (excepto !== 'teatro') {
        const modalTeatro = document.getElementById('modal-teatro');
        if (modalTeatro && (modalTeatro.style.display === 'flex' || modalTeatro.style.display === 'block')) {
            if (typeof cerrarTeatro === 'function') {
                cerrarTeatro();
            } else {
                modalTeatro.style.display = 'none';
            }
        }
    }

    // 3. Diccionario / Abreviaturas
    if (excepto !== 'diccionario') {
        const modalDicc = document.getElementById('modal-diccionario');
        if (modalDicc && (modalDicc.style.display === 'flex' || modalDicc.style.display === 'block')) {
            if (typeof cerrarDiccionario === 'function') {
                cerrarDiccionario();
            } else {
                modalDicc.style.display = 'none';
            }
        }
    }

    // 4. OCR
    if (excepto !== 'ocr') {
        const dOCR = document.getElementById('zen-details-ocr');
        if (dOCR && dOCR.open) dOCR.open = false;
    }

    // 5. Traducción
    if (excepto !== 'traduccion') {
        const dTrad = document.getElementById('zen-details-traduccion');
        if (dTrad && dTrad.open) dTrad.open = false;
        const modalTrad = document.getElementById('modal-traduccion');
        if (modalTrad && (modalTrad.style.display === 'flex' || modalTrad.style.display === 'block')) {
            if (typeof cerrarModalTraduccion === 'function') cerrarModalTraduccion();
            else modalTrad.style.display = 'none';
        }
    }

    // 6. LiraAI
    if (excepto !== 'ia') {
        const modalIA = document.getElementById('modal-ia');
        if (modalIA && (modalIA.style.display === 'flex' || modalIA.style.display === 'block')) {
            if (typeof cerrarModalIA === 'function') {
                cerrarModalIA();
            } else {
                modalIA.style.display = 'none';
            }
        }
    }

    // 7. Filtros
    if (excepto !== 'filtros') {
        const dFilt = document.getElementById('zen-details-filtros');
        if (dFilt && dFilt.open) dFilt.open = false;
    }

    // 8. Límites
    if (excepto !== 'limites') {
        const dLim = document.getElementById('zen-details-limites');
        if (dLim && dLim.open) dLim.open = false;
    }

    // 9. Cuaderno de Notas y Nota Rápida
    if (excepto !== 'notas' && excepto !== 'nota_rapida') {
        const modalNotas = document.getElementById('modal-notas');
        if (modalNotas && (modalNotas.style.display === 'flex' || modalNotas.style.display === 'block')) {
            if (typeof cerrarModalNotas === 'function') {
                cerrarModalNotas();
            } else {
                modalNotas.style.display = 'none';
            }
        }
        const panelNotaRapida = document.getElementById('panel-nota-rapida');
        if (panelNotaRapida && (panelNotaRapida.style.display === 'flex' || panelNotaRapida.style.display === 'block')) {
            if (typeof cerrarPanelNotaRapida === 'function') {
                cerrarPanelNotaRapida();
            } else {
                panelNotaRapida.style.display = 'none';
            }
        }
    }
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


