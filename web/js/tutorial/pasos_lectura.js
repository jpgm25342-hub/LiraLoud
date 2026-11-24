/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// ============================================================================
// TUTORIAL — PASOS DE LECTURA (FASES 1–4)
// ============================================================================

const PASOS_LECTURA = [
    // ------------------------------------------------------------------------
    // FASE 1: LANZADOR E IDIOMA
    // ------------------------------------------------------------------------
    {
        id: "paso_1_lanzador",
        getTargets: () => {
            const overlayLanzador = document.getElementById('lira-lanzador-overlay');
            const lanzadorAbierto = overlayLanzador && overlayLanzador.classList.contains('activo');
            if (lanzadorAbierto) {
                const cardModalPdf = document.getElementById('modal-lanzador-card-pdf') 
                    || document.querySelector('#lira-lanzador-overlay .lanzador-card:first-child');
                return cardModalPdf ? [cardModalPdf] : [];
            }

            const targets = [];
            const bienvenida = document.getElementById('lira-bienvenida');
            const bienvenidaVisible = bienvenida && bienvenida.style.display !== 'none' && document.body.contains(bienvenida);

            const cardPdf = document.getElementById('card-bienvenida-pdf') 
                || document.querySelector('#lira-bienvenida .lanzador-card:first-child');
            if (bienvenidaVisible && cardPdf) {
                targets.push(cardPdf);
            }

            const btnPdf = document.getElementById('btn-pdf');
            if (btnPdf) {
                targets.push(btnPdf);
            }
            return targets;
        },
        posicion: "adaptable-paso-1",
        getTitulo: () => getTourText("tour-paso1-titulo", "Paso 1: Abrir un Documento"),
        getInstruccion: () => getTourText("tour-paso1-instruccion", "¡Bienvenido al tutorial de LiraLoud! El primer paso es aprender a abrir un documento. Actualmente LiraLoud cuenta con soporte para archivos <b>PDF</b>, <b>DOC</b> y <b>DOCX</b>.<br><br>Para abrir tu documento, haz clic en la tarjeta resaltada <b>'Abrir PDF'</b> o en el botón <b>'PDF'</b> de tu barra."),
        getDetalleExtra: () => getTourText("tour-paso1-detalle", "La tarea se completará automáticamente en cuanto selecciones y cargues tu archivo."),
        botonDemoExtra: {
            getTexto: () => getTourText("tour-paso1-btn-demo", "¿No tienes un archivo ahora? Cargar libro de prueba"),
            accion: () => {
                if (typeof window.cargarDocumentoEjemploTutorial === 'function') {
                    window.cargarDocumentoEjemploTutorial();
                }
            }
        },
        accionCondicional: (siguiente) => {
            // Sincronizar de inmediato el foco actual
            sincronizarSpotlightPaso1();

            const rutaInicial = (typeof rutaPDFActual !== 'undefined') ? rutaPDFActual : null;
            let checkDocInterval = null;

            // Observador para alternar el brillo cuando el modal lanzador se abre o se cierra
            const overlayLanzador = document.getElementById('lira-lanzador-overlay');
            if (overlayLanzador && !observerLanzadorPaso1) {
                observerLanzadorPaso1 = new MutationObserver(() => {
                    sincronizarSpotlightPaso1();
                });
                observerLanzadorPaso1.observe(overlayLanzador, { attributes: true, attributeFilter: ['class', 'style'] });
            }

            // También reaccionar de inmediato al clic en el botón PDF de la barra
            const btnPdf = document.getElementById('btn-pdf');
            const onBtnPdfClick = () => setTimeout(sincronizarSpotlightPaso1, 40);
            if (btnPdf) btnPdf.addEventListener('click', onBtnPdfClick);

            const avanzar = () => {
                if (checkDocInterval) clearInterval(checkDocInterval);
                if (observerLanzadorPaso1) {
                    observerLanzadorPaso1.disconnect();
                    observerLanzadorPaso1 = null;
                }
                if (btnPdf) btnPdf.removeEventListener('click', onBtnPdfClick);
                window.removeEventListener('lira:documento-cargado', handlerDoc);
                quitarResaltadoTour();
                setTimeout(() => siguiente(), 300);
            };

            const handlerDoc = (e) => {
                console.log("📘 [TUTORIAL] Documento cargado detectado con éxito:", e?.detail?.ruta);
                avanzar();
            };

            window.addEventListener('lira:documento-cargado', handlerDoc);

            // Monitorear continuamente si rutaPDFActual se establece o cambia tras abrir el PDF
            checkDocInterval = setInterval(() => {
                if (typeof rutaPDFActual !== 'undefined' && rutaPDFActual && rutaPDFActual !== rutaInicial) {
                    console.log("📘 [TUTORIAL] rutaPDFActual actualizada a:", rutaPDFActual);
                    avanzar();
                }
            }, 300);

            window.cargarDocumentoEjemploTutorial = () => {
                if (checkDocInterval) clearInterval(checkDocInterval);
                if (observerLanzadorPaso1) {
                    observerLanzadorPaso1.disconnect();
                    observerLanzadorPaso1 = null;
                }
                if (btnPdf) btnPdf.removeEventListener('click', onBtnPdfClick);
                window.removeEventListener('lira:documento-cargado', handlerDoc);
                if (typeof _destruirBienvenida === 'function') _destruirBienvenida();
                if (typeof cerrarLanzador === 'function') cerrarLanzador();
                cargarTextoDemoEnVisor();
                quitarResaltadoTour();
                setTimeout(() => siguiente(), 300);
            };
        }
    },
    {
        id: "paso_2_idioma_y_voz",
        posicion: "adaptable-paso-2",
        getTitulo: () => getTourText("tour-paso2-titulo", "🌐 Paso 2: Idioma y Calibración de Voz"),
        getTargets: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                if (subEtapaPaso2 === 0) {
                    const btnZenVoz = document.getElementById('btn-zen-voz');
                    return btnZenVoz ? [btnZenVoz] : [];
                } else if (subEtapaPaso2 === 1) {
                    const inpIdioma = document.getElementById('busqueda-idioma-live');
                    return inpIdioma ? [inpIdioma] : [];
                } else if (subEtapaPaso2 === 2) {
                    const inpVoz = document.getElementById('busqueda-voz-live');
                    return inpVoz ? [inpVoz] : [];
                } else {
                    const velCont = document.getElementById('zen-velocidad-container');
                    const pVoz = document.getElementById('zen-panel-voz');
                    return velCont ? [velCont] : (pVoz ? [pVoz] : []);
                }
            } else {
                if (subEtapaPaso2 <= 1) {
                    const inpIdioma = document.getElementById('busqueda-idioma-live');
                    return inpIdioma ? [inpIdioma] : [];
                } else if (subEtapaPaso2 === 2) {
                    const inpVoz = document.getElementById('busqueda-voz-live');
                    return inpVoz ? [inpVoz] : [];
                } else {
                    const velInput = document.getElementById('rng-velocidad');
                    const velCont = velInput ? velInput.closest('.box-columnas') : null;
                    return velCont ? [velCont] : (velInput ? [velInput] : []);
                }
            }
        },
        getInstruccion: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                if (subEtapaPaso2 === 0) {
                    return getTourText("tour-paso2-zen-abrir", "¡Buen trabajo! Es momento de que escojas la voz que desees utilizar. Presiona el <b>botón de voz</b> en tu barra flotante para desplegar el panel de voz.");
                } else if (subEtapaPaso2 === 1) {
                    return getTourText("tour-paso2-idioma", "Lo que se encuentra señalado es el <b>filtro de idioma</b>; con él podrás filtrar las voces que correspondan al idioma que quieres escuchar. Haz clic en el botón y escoge el idioma de tu elección.");
                } else if (subEtapaPaso2 === 2) {
                    return getTourText("tour-paso2-voz", "En el apartado de selección de voz puedes escoger la voz que deseas escuchar en tu lectura. LiraLoud cuenta con modelos que requieren internet, identificados con el símbolo del globo terráqueo (🌐), y modelos locales con el símbolo de una computadora (💻). Como los modelos locales se ejecutan directamente en tu equipo, su velocidad para generar el audio dependerá de la potencia de tu computadora. Dentro de estos, los que tienen el símbolo de la flauta (🪈) son los más rápidos, aunque primero debes descargarlos desde el apartado de avanzados, en la opción de añadir más voces. Por otro lado, las voces con el símbolo de corazón (❤️) o de bolsillo (👝) ya vienen instaladas, pero al ser más pesadas pueden tardar varios segundos en generar cada oración según la capacidad de tu equipo.");
                } else {
                    return getTourText("tour-paso2-zen-avanzado", "A continuación puedes ajustar la <b>velocidad de lectura</b>, y en <b>'Avanzados'</b> puedes calibrar la duración de las pausas y el tono de la voz.");
                }
            } else {
                if (subEtapaPaso2 <= 1) {
                    return getTourText("tour-paso2-idioma", "¡Buen trabajo! Es momento de que escojas la voz que desees utilizar.<br><br>Lo que se encuentra señalado es el <b>filtro de idioma</b>; con él podrás filtrar las voces que correspondan al idioma que quieres escuchar. Haz clic en el botón y escoge el idioma de tu elección.");
                } else if (subEtapaPaso2 === 2) {
                    return getTourText("tour-paso2-voz", "En el apartado de selección de voz puedes escoger la voz que deseas escuchar en tu lectura. LiraLoud cuenta con modelos que requieren internet, identificados con el símbolo del globo terráqueo (🌐), y modelos locales con el símbolo de una computadora (💻). Como los modelos locales se ejecutan directamente en tu equipo, su velocidad para generar el audio dependerá de la potencia de tu computadora. Dentro de estos, los que tienen el símbolo de la flauta (🪈) son los más rápidos, aunque primero debes descargarlos desde el apartado de avanzados, en la opción de añadir más voces. Por otro lado, las voces con el símbolo de corazón (❤️) o de bolsillo (👝) ya vienen instaladas, pero al ser más pesadas pueden tardar varios segundos en generar cada oración según la capacidad de tu equipo.");
                } else {
                    return getTourText("tour-paso2-normal-velocidad", "A continuación puedes ajustar la <b>velocidad de lectura</b>, y en <b>'Avanzados'</b> puedes calibrar la duración de las pausas y el tono de la voz.");
                }
            }
        },
        getDetalleExtra: () => {
            if (subEtapaPaso2 >= 3) {
                const txtCont = getTourText("tour-paso2-contador-10s", "⏱️ Avanzando al Paso 3 en {s}s... (o pulsa 'Siguiente ➔')").replace("{s}", "10");
                return `<div id="tour-contador-10s" style="font-weight:bold; color:#38bdf8;">${txtCont}</div>`;
            }
            if (subEtapaPaso2 === 2) {
                return getTourText("tour-paso2-det-voces", "• 🌐 <b>Voces Online (Globo):</b> Requieren internet; gran entonación y variedad de acentos.<br>• 💻 <b>Voces Offline (Locales):</b> Sin internet (🪈 <b>Flauta:</b> ultra rápidas en Avanzados · ❤️ <b>Corazón</b> y 👝 <b>Bolsillo:</b> ya instaladas, más pesadas).");
            }
            if (subEtapaPaso2 === 1) {
                return getTourText("tour-paso2-det-idioma", "💡 El catálogo de voces se actualizará en tiempo real mostrando solo las opciones del idioma elegido.");
            }
            return getTourText("tour-paso2-det-inicial", "💡 Configura la voz perfecta para tu lectura antes de comenzar a escuchar.");
        },
        accionCondicional: (siguiente) => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');

            // En modo normal no hay panel que abrir, arrancar directamente en selección de idioma
            if (!esMinimalista && subEtapaPaso2 === 0) {
                subEtapaPaso2 = 1;
            }

            const transicionarSubEtapa = (nueva) => {
                if (window.tutorialPasoActual !== 1) return;
                subEtapaPaso2 = nueva;
                renderizarPasoTour();
            };

            if (esMinimalista && subEtapaPaso2 === 0) {
                const btnZenVoz = document.getElementById('btn-zen-voz');
                if (btnZenVoz) {
                    targetCondicionalActivo = btnZenVoz;
                    listenerCondicionalActivo = () => {
                        setTimeout(() => transicionarSubEtapa(1), 300);
                    };
                    btnZenVoz.addEventListener('click', listenerCondicionalActivo, { once: true });
                }
            } else if (subEtapaPaso2 === 1) {
                // ETAPA: FILTRO DE IDIOMA (aparece vacío para elegir en 1 solo clic sin recliquear)
                const selectIdioma = document.getElementById('filtro-idioma');
                const inputIdioma = document.getElementById('busqueda-idioma-live');

                if (selectIdioma && selectIdioma.value) {
                    window._tourPrevIdiomaVal = selectIdioma.value;
                }
                if (inputIdioma && inputIdioma.value) {
                    window._tourPrevIdiomaTxt = inputIdioma.value;
                }
                if (inputIdioma) {
                    inputIdioma.value = "";
                }
                if (selectIdioma) {
                    selectIdioma.selectedIndex = -1;
                }

                let yaAvanzoIdioma = false;
                const avanzarAVoz = () => {
                    if (yaAvanzoIdioma || window.tutorialPasoActual !== 1 || subEtapaPaso2 !== 1) return;
                    if (selectIdioma && selectIdioma.selectedIndex < 0 && (!inputIdioma || !inputIdioma.value.trim())) return;
                    yaAvanzoIdioma = true;
                    window.removeEventListener('lira:combo-live-seleccionado', onComboIdiomaSel);
                    if (selectIdioma && selectIdioma.selectedIndex >= 0 && inputIdioma) {
                        const opt = selectIdioma.options[selectIdioma.selectedIndex];
                        if (opt && !inputIdioma.value) inputIdioma.value = opt.text;
                    }
                    setTimeout(() => {
                        if (window.tutorialPasoActual === 1 && subEtapaPaso2 === 1) transicionarSubEtapa(2);
                    }, 220);
                };

                const onComboIdiomaSel = (ev) => {
                    if (ev?.detail?.tipo === 'idioma') avanzarAVoz();
                };
                window.addEventListener('lira:combo-live-seleccionado', onComboIdiomaSel);

                // Si selecciona un idioma por change o click en la lista
                if (selectIdioma) {
                    targetCondicionalActivo = selectIdioma;
                    listenerCondicionalActivo = avanzarAVoz;
                    selectIdioma.addEventListener('change', avanzarAVoz);
                    selectIdioma.addEventListener('click', avanzarAVoz);
                }

                if (inputIdioma) {
                    inputIdioma.addEventListener('click', () => {
                        if (typeof abrirComboLive === 'function') abrirComboLive('idioma');
                    });
                }

            } else if (subEtapaPaso2 === 2) {
                // ETAPA: SELECCIÓN DE VOZ (aparece vacío para elegir en 1 solo clic sin recliquear)
                const selectVoz = document.getElementById('selector-voz-live');
                const inputVoz = document.getElementById('busqueda-voz-live');

                if (selectVoz && selectVoz.value) {
                    window._tourPrevVozVal = selectVoz.value;
                }
                if (inputVoz && inputVoz.value) {
                    window._tourPrevVozTxt = inputVoz.value;
                }
                if (inputVoz) {
                    inputVoz.value = "";
                }
                if (selectVoz) {
                    selectVoz.selectedIndex = -1;
                }

                let yaAvanzoVoz = false;
                const avanzarAVelocidad = () => {
                    if (yaAvanzoVoz || window.tutorialPasoActual !== 1 || subEtapaPaso2 !== 2) return;
                    if (selectVoz && selectVoz.selectedIndex < 0 && (!inputVoz || !inputVoz.value.trim())) return;
                    yaAvanzoVoz = true;
                    window.removeEventListener('lira:combo-live-seleccionado', onComboVozSel);
                    if (selectVoz && selectVoz.selectedIndex >= 0 && inputVoz) {
                        const opt = selectVoz.options[selectVoz.selectedIndex];
                        if (opt && !inputVoz.value) inputVoz.value = opt.text;
                    }
                    setTimeout(() => {
                        if (window.tutorialPasoActual === 1 && subEtapaPaso2 === 2) transicionarSubEtapa(3);
                    }, 220);
                };

                const onComboVozSel = (ev) => {
                    if (ev?.detail?.tipo === 'voz') avanzarAVelocidad();
                };
                window.addEventListener('lira:combo-live-seleccionado', onComboVozSel);

                // Si selecciona una voz por change o click en la lista
                if (selectVoz) {
                    targetCondicionalActivo = selectVoz;
                    listenerCondicionalActivo = avanzarAVelocidad;
                    selectVoz.addEventListener('change', avanzarAVelocidad);
                    selectVoz.addEventListener('click', avanzarAVelocidad);
                }

                if (inputVoz) {
                    inputVoz.addEventListener('click', () => {
                        if (typeof abrirComboLive === 'function') abrirComboLive('voz');
                    });
                }
            } else if (subEtapaPaso2 === 3) {
                // Cuenta regresiva de 10 segundos
                let segundos = 10;
                if (intervalPaso2) clearInterval(intervalPaso2);

                intervalPaso2 = setInterval(() => {
                    if (!window.tutorialActivo || window.tutorialPasoActual !== 1) {
                        clearInterval(intervalPaso2);
                        intervalPaso2 = null;
                        return;
                    }
                    segundos--;
                    const el = document.getElementById('tour-contador-10s');
                    if (el) {
                        el.innerText = getTourText("tour-paso2-contador-10s", "⏱️ Avanzando al Paso 3 en {s}s... (o pulsa 'Siguiente ➔')").replace("{s}", segundos);
                    }
                    if (segundos <= 0) {
                        clearInterval(intervalPaso2);
                        intervalPaso2 = null;
                        const pVoz = document.getElementById('zen-panel-voz');
                        if (pVoz) {
                            pVoz.classList.remove('zen-active');
                            pVoz.style.display = 'none';
                        }
                        siguiente();
                    }
                }, 1000);
            }
        }
    },
    {
        id: "paso_3_leer_y_pausar",
        targetSelector: "#visor-container",
        getTargets: () => {
            if (subEtapaPaso3 === 2) {
                const esMinimalista = document.body.classList.contains('modo-minimalista');
                if (esMinimalista) {
                    const pMenu = document.getElementById('zen-panel-menu');
                    const menuAbierto = pMenu && (pMenu.classList.contains('zen-active') || pMenu.style.display === 'block');
                    if (!menuAbierto) {
                        const btnZenMenu = document.getElementById('btn-zen-menu');
                        return btnZenMenu ? [btnZenMenu] : [];
                    }
                    const detFiltros = document.getElementById('zen-details-filtros');
                    if (detFiltros && !detFiltros.open) {
                        const sumFiltros = detFiltros.querySelector('summary');
                        return sumFiltros ? [sumFiltros] : [detFiltros];
                    }
                    const popup = detFiltros ? detFiltros.querySelector('.zen-dropdown-popup') : null;
                    const cont = document.getElementById('zen-filtros-container');
                    return (popup || cont) ? [popup || cont] : [];
                }
                const filaFiltros = document.querySelector('.fila-filtros');
                return filaFiltros ? [filaFiltros] : [];
            }
            const visor = document.getElementById('visor-container');
            return visor ? [visor] : [];
        },
        posicion: "adaptable-paso-1",
        sinSpotlightAnim: () => subEtapaPaso3 < 2,
        autoAvanzarTrasLectura: () => {
            if (subEtapaPaso3 !== 2) return false;
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (!esMinimalista) return true;
            return Boolean(document.getElementById('zen-details-filtros')?.open);
        },
        getTitulo: () => {
            if (subEtapaPaso3 === 2) {
                return getTourText("tour-paso3-sub3-titulo", "🔎 Paso 3.3: Filtros y Comportamiento de Lectura");
            }
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = CALIBRACION_POR_IDIOMA[langIso] || CALIBRACION_POR_IDIOMA.es;
            return subEtapaPaso3 === 1
                ? getTourText("tour-paso3-sub2-titulo", "🎯 Paso 3.2: Leer desde un Punto Fijo")
                : getTourText("tour-paso3-titulo", "📖 Paso 3.1: Lectura Punto a Punto");
        },
        getInstruccion: () => {
            if (subEtapaPaso3 === 2) {
                const esMinimalista = document.body.classList.contains('modo-minimalista');
                if (esMinimalista) {
                    const pMenu = document.getElementById('zen-panel-menu');
                    const menuAbierto = pMenu && (pMenu.classList.contains('zen-active') || pMenu.style.display === 'block');
                    if (!menuAbierto) {
                        return getTourText("tour-paso3-filtros-zen-menu", "Antes de continuar, veamos los <b>Filtros de Lectura</b> (enlaces, paréntesis y superíndices). Haz clic en el <b>Menú (☰)</b> iluminado en azul.");
                    }
                    const detFiltros = document.getElementById('zen-details-filtros');
                    if (detFiltros && !detFiltros.open) {
                        return getTourText("tour-paso3-filtros-zen-abrir", "Ahora haz clic en el icono de <b>Filtros</b> iluminado en azul.");
                    }
                }
                return getTourText("tour-paso3-filtros-inst", "Las primeras casillas marcadas arriba (<b>No Links</b>, <b>No paréntesis (...)</b>, <b>No corchetes [...]</b>, etc.) sirven para omitir esos elementos durante la lectura.<br><br>Las dos casillas inferiores controlan cómo avanza la lectura: <b>Auto-avance</b> (pasa de página automáticamente al terminar) y <b>Seguir texto</b> (desplaza la vista siguiendo las palabras).");
            }
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = CALIBRACION_POR_IDIOMA[langIso] || CALIBRACION_POR_IDIOMA.es;
            return subEtapaPaso3 === 1
                ? cfg.instruccionSalto
                : getTourText("tour-paso3-sub1-instruccion", "Para comprobar la lectura, puedes leer de punto a punto utilizando el <b>clic izquierdo</b> de tu ratón. Haz clic izquierdo sobre el texto para probar la función.");
        },
        getDetalleExtra: () => {
            if (subEtapaPaso3 === 2) {
                return getTourText("tour-paso3-filtros-det", "💡 <i>Marca lo que quieras que la voz omita (por ejemplo, citas entre paréntesis o notas al pie) y pulsa <b>'Siguiente ➔'</b> cuando estés listo.</i>");
            }
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = CALIBRACION_POR_IDIOMA[langIso] || CALIBRACION_POR_IDIOMA.es;
            return subEtapaPaso3 === 1
                ? cfg.saltoExito
                : getTourText("tour-paso3-sub1-detalle", "💡 <i>Al hacer clic izquierdo en cualquier palabra, LiraLoud activa la guía de lectura punto a punto y sincroniza el karaoke en tiempo real.</i>");
        },
        accionCondicional: (siguiente) => {
            if (subEtapaPaso3 === 2) {
                removerMouseHintPaso3();
                document.body.classList.remove('tour-paso-lectura');
                const btnSig = (document.getElementById('btn-tour-next') || document.getElementById('tour-btn-siguiente'));
                if (btnSig) {
                    btnSig.style.opacity = '1';
                    btnSig.style.pointerEvents = 'auto';
                }
                const esMinimalista = document.body.classList.contains('modo-minimalista');
                if (esMinimalista) {
                    document.body.classList.add('tour-activo-zen-menu');
                    const pMenu = document.getElementById('zen-panel-menu');
                    const menuAbierto = pMenu && (pMenu.classList.contains('zen-active') || pMenu.style.display === 'block');
                    if (!menuAbierto) {
                        const btnZenMenu = document.getElementById('btn-zen-menu');
                        if (btnZenMenu) {
                            targetCondicionalActivo = btnZenMenu;
                            listenerCondicionalActivo = () => setTimeout(() => renderizarPasoTour(), 180);
                            btnZenMenu.addEventListener('click', listenerCondicionalActivo, { once: true });
                        }
                    } else {
                        const detFiltros = document.getElementById('zen-details-filtros');
                        if (detFiltros && !detFiltros.open) {
                            const onToggleFiltros = () => {
                                if (detFiltros.open) {
                                    detFiltros.removeEventListener('toggle', onToggleFiltros);
                                    setTimeout(() => renderizarPasoTour(), 100);
                                }
                            };
                            detFiltros.addEventListener('toggle', onToggleFiltros);
                        }
                    }
                }
                return;
            }
            // Siempre cargamos la hoja de calibración en el idioma activo
            cargarTextoDemoEnVisor();

            // Despejar oscurecimiento sobre el visor
            document.body.classList.add('tour-paso-lectura');

            const langIso = detectarIdiomaTutorialActivo();
            const cfg = CALIBRACION_POR_IDIOMA[langIso] || CALIBRACION_POR_IDIOMA.es;

            // NO reiniciar subEtapaPaso3 si ya estábamos en 1 o 2 (garantizar que se mantiene en 3.2)
            if (subEtapaPaso3 !== 1 && subEtapaPaso3 !== 2) {
                subEtapaPaso3 = 0;
            }
            let lecturaActivaDetectada = false;
            let yaAvanzado = false;
            let tiempoLecturaSub0 = 0;
            let tiempoLecturaSub1 = 0;
            let saltoClickLeerPulsado = false;
            let saltoLecturaIniciada = false;

            window.tutorialBloquearEspacio = false;

            const onResizeMouseHint = () => {
                if (!window.tutorialActivo || !PASOS_TOUR_GUI[window.tutorialPasoActual] || PASOS_TOUR_GUI[window.tutorialPasoActual].id !== 'paso_3_leer_y_pausar') {
                    removerMouseHintPaso3();
                    return;
                }
                const isReading = (typeof leyendo !== 'undefined' && leyendo) ||
                                  (typeof isPlayingPiper !== 'undefined' && isPlayingPiper) ||
                                  (typeof window.palabraKaraoke !== 'undefined' && window.palabraKaraoke !== null);
                if (isReading) {
                    removerMouseHintPaso3();
                    return;
                }
                if (subEtapaPaso3 === 0 && !lecturaActivaDetectada) {
                    posicionarMouseHintPaso3(cfg.palabraInicio, cfg.badgeInicio, 'izquierdo');
                } else if (subEtapaPaso3 === 1 && !saltoClickLeerPulsado) {
                    const menuCtx = document.getElementById('menu-contextual');
                    const menuAbierto = menuCtx && menuCtx.style.display === 'block';
                    if (!menuAbierto) {
                        posicionarMouseHintPaso3(cfg.palabraSalto, cfg.badgeSalto, 'derecho');
                    }
                }
            };

            listenerResizePaso3 = onResizeMouseHint;
            window.addEventListener('resize', listenerResizePaso3);

            if (timeoutMouseHintPaso3) clearTimeout(timeoutMouseHintPaso3);
            timeoutMouseHintPaso3 = setTimeoutTutorial(() => {
                if (subEtapaPaso3 === 1) {
                    const btnSig = (document.getElementById('btn-tour-next') || document.getElementById('tour-btn-siguiente'));
                    if (btnSig) {
                        btnSig.style.opacity = '0.35';
                        btnSig.style.pointerEvents = 'none';
                    }
                    const menuCtx = document.getElementById('menu-contextual');
                    const menuAbierto = menuCtx && menuCtx.style.display === 'block';
                    if (!menuAbierto && !saltoClickLeerPulsado) {
                        posicionarMouseHintPaso3(cfg.palabraSalto, cfg.badgeSalto, 'derecho');
                    }
                } else {
                    onResizeMouseHint();
                }
            }, 180);

            const removerSpotlightLeer = () => {
                const btnLeer = document.getElementById('opcion-leer');
                if (btnLeer) btnLeer.classList.remove('tour-spotlight-active');
            };

            const onUserInteractionWhileReading = () => {
                const isReading = (typeof leyendo !== 'undefined' && leyendo) ||
                                  (typeof isPlayingPiper !== 'undefined' && isPlayingPiper) ||
                                  (typeof window.palabraKaraoke !== 'undefined' && window.palabraKaraoke !== null);
                if (isReading) {
                    removerMouseHintPaso3();
                }
            };
            listenerMouseMovePaso3 = onUserInteractionWhileReading;
            document.addEventListener('mousemove', listenerMouseMovePaso3, { passive: true });

            const avanzarPasoSeguro = () => {
                if (yaAvanzado) return;
                yaAvanzado = true;
                window.tutorialBloquearEspacio = false;
                if (intervalPaso3) { clearInterval(intervalPaso3); intervalPaso3 = null; }
                if (timer5sPaso3) { clearInterval(timer5sPaso3); timer5sPaso3 = null; }
                removerMouseHintPaso3();
                removerSpotlightLeer();
                document.body.classList.remove('tour-paso-lectura');
                window.removeEventListener('resize', onResizeMouseHint);
                document.removeEventListener('contextmenu', onContextMenuPaso3);
                document.removeEventListener('click', onDocClickPaso3, true);
                document.removeEventListener('mousemove', onUserInteractionWhileReading);
                const canvasEl = document.getElementById('lienzo-pdf');
                if (canvasEl) canvasEl.removeEventListener('click', onCanvasClickSub0);

                if (typeof window.currentReadingSession === 'undefined') window.currentReadingSession = 0;
                window.currentReadingSession++;
                if (typeof detenerLectura === 'function') detenerLectura(true);
                if (typeof leyendo !== 'undefined') leyendo = false;
                if (typeof isPlayingPiper !== 'undefined') isPlayingPiper = false;
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                window.palabraKaraoke = null;

                const btnSig = (document.getElementById('btn-tour-next') || document.getElementById('tour-btn-siguiente'));
                if (btnSig) {
                    btnSig.style.opacity = '1';
                    btnSig.style.pointerEvents = 'auto';
                }

                siguiente();
            };

            const activarSaltoExitoso = () => {
                saltoClickLeerPulsado = true;
                window.tutorialBloquearEspacio = false;
                removerMouseHintPaso3();
                removerSpotlightLeer();

                // Desbloquear botón Siguiente por si el usuario desea avanzar
                const btnSig = (document.getElementById('btn-tour-next') || document.getElementById('tour-btn-siguiente'));
                if (btnSig) {
                    btnSig.style.opacity = '1';
                    btnSig.style.pointerEvents = 'auto';
                }

                const bodyEl = document.getElementById('tour-card-body');
                if (bodyEl) {
                    const speechBubble = bodyEl.querySelector('.tutorial-speech-bubble');
                    if (speechBubble) {
                        speechBubble.innerHTML = cfg.saltoExito;
                    }
                }
            };

            const pasarASubEtapaSalto = () => {
                if (subEtapaPaso3 !== 0) return;
                subEtapaPaso3 = 1;
                saltoClickLeerPulsado = false;
                saltoLecturaIniciada = false;

                // Reset de tokens de sesión para invalidar cualquier cola vieja
                if (typeof window.currentReadingSession === 'undefined') window.currentReadingSession = 0;
                window.currentReadingSession++;
                window.tutorialBloquearEspacio = true; // Bloquea reanudaciones espurias por teclado

                // DETENCIÓN TOTAL Y DEFINITIVA DE LA LECTURA PREVIA
                if (typeof detenerLectura === 'function') detenerLectura(true);
                if (typeof leyendo !== 'undefined') leyendo = false;
                if (typeof isPlayingPiper !== 'undefined') isPlayingPiper = false;
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                window.palabraKaraoke = null;

                // Bloquear el avance con "Siguiente" para obligar a realizar el clic derecho en el punto fijo
                const btnSig = (document.getElementById('btn-tour-next') || document.getElementById('tour-btn-siguiente'));
                if (btnSig) {
                    btnSig.style.opacity = '0.35';
                    btnSig.style.pointerEvents = 'none';
                }

                // Actualizar la tarjeta al Paso 3.2
                const titleEl = document.getElementById('tour-card-title');
                if (titleEl) {
                    const titSub2 = getTourText("tour-paso3-sub2-titulo", "Paso 3.2: Leer desde un Punto Fijo");
                    if (typeof window._renderizarTituloTour === 'function') {
                        window._renderizarTituloTour(titleEl, titSub2, 'objetivo');
                    } else {
                        titleEl.innerText = titSub2;
                    }
                }

                const bodyEl = document.getElementById('tour-card-body');
                if (bodyEl) {
                    const instDiv = bodyEl.children[0];
                    if (instDiv) {
                        instDiv.innerHTML = cfg.instruccionSalto;
                    }
                    const speechBubble = bodyEl.querySelector('.tutorial-speech-bubble');
                    if (speechBubble) {
                        speechBubble.innerHTML = cfg.saltoExito;
                    }
                }

                // Posicionar el ratón apuntando a la palabra objetivo con CLIC DERECHO
                if (timeoutMouseHintPaso3) clearTimeout(timeoutMouseHintPaso3);
                timeoutMouseHintPaso3 = setTimeoutTutorial(() => {
                    posicionarMouseHintPaso3(cfg.palabraSalto, cfg.badgeSalto, 'derecho');
                }, 120);

                // Narrar por voz las instrucciones del Paso 3.2
                narrarPasoTutorial(cfg.instruccionSalto);
            };

            const finalizarLecturaPaso3YAvanzar = () => {
                if (yaAvanzado) return;
                yaAvanzado = true;
                subEtapaPaso3 = 2;
                if (intervalPaso3) { clearInterval(intervalPaso3); intervalPaso3 = null; }
                window.tutorialBloquearEspacio = false;
                removerMouseHintPaso3();
                removerSpotlightLeer();

                // Asegurar detención total del audio
                if (typeof window.currentReadingSession === 'undefined') window.currentReadingSession = 0;
                window.currentReadingSession++;
                if (typeof detenerLectura === 'function') detenerLectura(true);
                if (typeof leyendo !== 'undefined') leyendo = false;
                if (typeof isPlayingPiper !== 'undefined') isPlayingPiper = false;
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                window.palabraKaraoke = null;

                // Restaurar y habilitar botón siguiente
                const btnSig = (document.getElementById('btn-tour-next') || document.getElementById('tour-btn-siguiente'));
                if (btnSig) {
                    btnSig.style.opacity = '1';
                    btnSig.style.pointerEvents = 'auto';
                }

                const bodyEl = document.getElementById('tour-card-body');
                if (bodyEl) {
                    const speechBubble = bodyEl.querySelector('.tutorial-speech-bubble');
                    if (speechBubble) {
                        speechBubble.innerHTML = getTourText(
                            "tour-paso3-fin-lectura",
                            "🎉 <b>¡Lectura completada!</b> Ahora revisemos los Filtros de lectura..."
                        );
                    }
                }

                // Pasar a subEtapa 2 (Filtros) en lugar de saltar directo al Paso 4
                setTimeout(() => {
                    if (window.tutorialActivo && window.tutorialPasoActual === 2) {
                        yaAvanzado = false;
                        document.removeEventListener('contextmenu', onContextMenuPaso3);
                        document.removeEventListener('click', onDocClickPaso3, true);
                        document.removeEventListener('mousemove', onUserInteractionWhileReading);
                        window.removeEventListener('resize', onResizeMouseHint);
                        renderizarPasoTour();
                    }
                }, 700);
            };

            // Escuchar clic en canvas para ocultar ratón solo si hizo clic sobre una palabra válida en Paso 3.1
            const onCanvasClickSub0 = (e) => {
                if (subEtapaPaso3 !== 0) return;
                const canvas = document.getElementById('lienzo-pdf');
                if (!canvas || !datosPagina || !datosPagina.palabras) return;
                const r = canvas.getBoundingClientRect();
                const pdfX = (e.clientX - r.left) * ((datosPagina.ancho_pagina_pdf || 800) / r.width);
                const pdfY = (e.clientY - r.top) * ((datosPagina.alto_pagina_pdf || 1100) / r.height);
                const sobrePalabra = datosPagina.palabras.some(p => p.bbox && pdfX >= (p.bbox[0] - 8) && pdfX <= (p.bbox[2] + 8) && pdfY >= (p.bbox[1] - 8) && pdfY <= (p.bbox[3] + 8));
                if (!sobrePalabra) return;

                removerMouseHintPaso3();
                if (!lecturaActivaDetectada) {
                    lecturaActivaDetectada = true;
                    const bodyEl = document.getElementById('tour-card-body');
                    if (bodyEl) {
                        const speechBubble = bodyEl.querySelector('.tutorial-speech-bubble');
                        if (speechBubble) {
                            speechBubble.innerHTML = `<span style="color:#38bdf8; font-weight:bold;">🎙️ ¡Excelente!</span> ${getTourText("tour-paso3-escuchando", "Escuchando la lectura punto a punto con karaoke sincronizado...")}`;
                        }
                    }
                }
            };
            const canvasEl = document.getElementById('lienzo-pdf');
            if (canvasEl) {
                canvasEl.addEventListener('click', onCanvasClickSub0);
            }

            const isReproduciendoActual = () => {
                return (typeof leyendo !== 'undefined' && leyendo) ||
                       (typeof isPlayingPiper !== 'undefined' && isPlayingPiper) ||
                       (typeof window.palabraKaraoke !== 'undefined' && window.palabraKaraoke !== null);
            };

            // Escuchar clic derecho para abrir menú y resaltar 'Leer' con recuadro azul
            const onContextMenuPaso3 = () => {
                if (subEtapaPaso3 === 1 && !saltoClickLeerPulsado) {
                    setTimeoutTutorial(() => {
                        const menuCtx = document.getElementById('menu-contextual');
                        const menuAbierto = menuCtx && menuCtx.style.display === 'block';
                        if (menuAbierto) {
                            removerMouseHintPaso3(); // Solo se quita si el menú realmente abrió sobre una palabra
                            const btnLeer = document.getElementById('opcion-leer');
                            if (btnLeer) {
                                btnLeer.classList.add('tour-spotlight-active');
                            }
                        } else {
                            // Si dio clic derecho fuera de texto, NO retroceder a 3.1 jamás: se mantiene en 3.2
                            removerSpotlightLeer();
                            posicionarMouseHintPaso3(cfg.palabraSalto, cfg.badgeSalto, 'derecho');
                        }
                    }, 40);
                }
            };
            listenerContextMenuPaso3 = onContextMenuPaso3;
            document.addEventListener('contextmenu', listenerContextMenuPaso3);

            // Escuchar clics en el documento durante el Paso 3
            const onDocClickPaso3 = (e) => {
                if (subEtapaPaso3 === 1) {
                    if (saltoClickLeerPulsado) {
                        // Ya se pulsó "Leer", no volver a mostrar el ratón jamás
                        return;
                    }

                    const targetLeer = e.target.closest('#opcion-leer');
                    if (targetLeer) {
                        // ¡CLIC VÁLIDO EN 'LEER'!
                        activarSaltoExitoso();
                        return;
                    }

                    // Si el usuario hace clic fuera del menú contextual:
                    const menuCtx = document.getElementById('menu-contextual');
                    const menuEstabaAbierto = menuCtx && menuCtx.style.display === 'block';
                    if (menuEstabaAbierto && !menuCtx.contains(e.target)) {
                        menuCtx.style.display = 'none';
                    }

                    // Evitar que el clic en el lienzo dispare la lectura punto a punto de 3.1
                    const canvasEl = document.getElementById('lienzo-pdf');
                    if (canvasEl && (canvasEl === e.target || canvasEl.contains(e.target))) {
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                    }

                    // Mantenernos firmemente en 3.2 sin regresar jamás a 3.1
                    removerSpotlightLeer();
                    setTimeoutTutorial(() => {
                        const menuCtxNow = document.getElementById('menu-contextual');
                        const ahoraAbierto = menuCtxNow && menuCtxNow.style.display === 'block';
                        if (!ahoraAbierto && !saltoClickLeerPulsado) {
                            posicionarMouseHintPaso3(cfg.palabraSalto, cfg.badgeSalto, 'derecho');
                        }
                    }, 50);
                }
            };
            listenerDocClickPaso3 = onDocClickPaso3;
            document.addEventListener('click', listenerDocClickPaso3, true);

            // Sensor de reproducción
            if (intervalPaso3) clearInterval(intervalPaso3);
            const thisIntervalPaso3 = setInterval(() => {
                if (!window.tutorialActivo || !PASOS_TOUR_GUI[window.tutorialPasoActual] || PASOS_TOUR_GUI[window.tutorialPasoActual].id !== 'paso_3_leer_y_pausar') {
                    clearInterval(thisIntervalPaso3);
                    if (intervalPaso3 === thisIntervalPaso3) intervalPaso3 = null;
                    removerMouseHintPaso3();
                    return;
                }
                const isReproduciendo = isReproduciendoActual();

                if (isReproduciendo) {
                    removerMouseHintPaso3();
                }

                if (subEtapaPaso3 === 0) {
                    // Sub-etapa 0: Primera lectura (Punto a punto con clic izquierdo)
                    if (isReproduciendo) {
                        if (!lecturaActivaDetectada) {
                            lecturaActivaDetectada = true;
                            removerMouseHintPaso3();
                            const bodyEl = document.getElementById('tour-card-body');
                            if (bodyEl) {
                                const speechBubble = bodyEl.querySelector('.tutorial-speech-bubble');
                                if (speechBubble) {
                                    speechBubble.innerHTML = `<span style="color:#38bdf8; font-weight:bold;">🎙️ ¡Excelente!</span> ${getTourText("tour-paso3-escuchando", "Escuchando la lectura punto a punto con karaoke sincronizado...")}`;
                                }
                            }
                        }
                        tiempoLecturaSub0 += 100;
                        // Límite de seguridad generoso (25s) por si no se detectara el fin natural
                        if (tiempoLecturaSub0 >= 25000) {
                            pasarASubEtapaSalto();
                        }
                    } else if (lecturaActivaDetectada) {
                        // ¡La lectura terminó completamente de reproducirse hasta el final y quedó en silencio!
                        pasarASubEtapaSalto();
                    }
                } else if (subEtapaPaso3 === 1) {
                    // Sub-etapa 1: "Leer desde aquí" OBLIGATORIO (Clic derecho + Leer)
                    // En 3.2 la única forma de que suene audio es 'Leer aquí': si hay audio, el clic ya ocurrió
                    if (isReproduciendo && !saltoClickLeerPulsado) {
                        activarSaltoExitoso();
                    }
                    if (saltoClickLeerPulsado) {
                        if (isReproduciendo) {
                            saltoLecturaIniciada = true;
                            tiempoLecturaSub1 += 100;
                            if (tiempoLecturaSub1 >= 25000) {
                                finalizarLecturaPaso3YAvanzar();
                            }
                        } else if (saltoLecturaIniciada) {
                            // ¡La lectura desde el punto fijo terminó completamente y quedó en silencio!
                            finalizarLecturaPaso3YAvanzar();
                        }
                    } else if (!isReproduciendo) {
                        // Control dinámico de estabilidad: Menú contextual vs Ratón indicador
                        const menuCtx = document.getElementById('menu-contextual');
                        const menuAbierto = menuCtx && menuCtx.style.display === 'block';
                        if (menuAbierto) {
                            removerMouseHintPaso3();
                            const btnLeer = document.getElementById('opcion-leer');
                            if (btnLeer && !btnLeer.classList.contains('tour-spotlight-active')) {
                                btnLeer.classList.add('tour-spotlight-active');
                            }
                        } else {
                            removerSpotlightLeer();
                            if (!document.getElementById('tour-mouse-hint')) {
                                posicionarMouseHintPaso3(cfg.palabraSalto, cfg.badgeSalto, 'derecho');
                            }
                        }
                    }
                }
            }, 100);
            intervalPaso3 = thisIntervalPaso3;

            const visor = document.getElementById('visor-container') || document.getElementById('lienzo-pdf');
            if (visor) {
                targetCondicionalActivo = visor;
            }
        }
    },

    // ------------------------------------------------------------------------
    // FASE 2: LÍMITES Y EXCLUSIÓN DE TEXTO (PASO 4)
    // ------------------------------------------------------------------------
    {
        id: "paso_4a_limites_columnas",
        getTargets: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (subEtapaPaso4a === 0) {
                if (esMinimalista) {
                    if (subEtapaZenLimites === 0) {
                        const btnZenMenu = document.getElementById('btn-zen-menu');
                        return btnZenMenu ? [btnZenMenu] : [];
                    } else if (subEtapaZenLimites === 1) {
                        const pMenu = document.getElementById('zen-panel-menu');
                        if (pMenu && pMenu.style.display !== 'block') {
                            pMenu.style.display = 'block';
                            pMenu.classList.add('zen-active');
                        }
                        const summaryLimites = document.getElementById('btn-zen-summary-limites') ||
                                               document.querySelector('#zen-details-limites summary') ||
                                               document.getElementById('zen-details-limites');
                        return summaryLimites ? [summaryLimites] : [];
                    } else {
                        const dLim = document.getElementById('zen-details-limites');
                        if (dLim) dLim.open = true;
                        const btnZenPlus = document.getElementById('btn-agregar-corte-v') ||
                                           document.querySelector('#zen-limites-container button:first-of-type') ||
                                           document.querySelector('#box-limites-toolbar button:first-of-type');
                        return btnZenPlus ? [btnZenPlus] : [];
                    }
                }
                const btn = document.getElementById('btn-agregar-corte-v') ||
                            document.querySelector('#box-limites-toolbar button:first-of-type') ||
                            document.getElementById('box-limites-toolbar');
                return btn ? [btn] : [];
            }
            const visor = document.getElementById('visor-container') || document.getElementById('lienzo-pdf');
            return visor ? [visor] : [];
        },
        posicion: "adaptable-paso-1",
        sinSpotlightAnim: () => subEtapaPaso4a > 0,
        getTitulo: () => {
            if (subEtapaPaso4a === 1) return getTourText("tour-paso4a-sub2-titulo", "↔️ Paso 4.1: Ajustar Corte entre Columna 1 y 2");
            if (subEtapaPaso4a === 2) return aplicarAtajoEnTexto(getTourText("tour-paso4a-sub3-titulo", "⌨️ Paso 4.1: Atajo de Teclado (Ctrl + Espacio)"));
            if (subEtapaPaso4a === 3) return getTourText("tour-paso4a-sub4-titulo", "↔️ Paso 4.1: Ajustar Corte entre Columna 2 y 3");
            if (subEtapaPaso4a === 4) return getTourText("tour-paso4a-sub5-titulo", "🔎 Paso 4.1: Comprueba el Orden de Lectura");
            return getTourText("tour-paso4a-titulo", "📐 Paso 4.1: Límites en Columnas (Cortes Verticales)");
        },
        getInstruccion: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (subEtapaPaso4a === 0) {
                if (esMinimalista) {
                    if (subEtapaZenLimites === 0) {
                        return getTourText("tour-paso4a-zen-menu", "Cuando un PDF tiene <b>varias columnas</b>, LiraLoud intenta detectarlas automáticamente; sin embargo, si necesitas ajustar o modificar esos límites manualmente para evitar que se mezclen los renglones, puedes usar los <b>Límites de Columnas</b>.<br><br>👉 Haz clic en el botón de <b>Menú</b> (☰) en tu barra flotante para desplegar las herramientas.");
                    } else if (subEtapaZenLimites === 1) {
                        return getTourText("tour-paso4a-zen-details", "👉 Ahora haz clic en el icono de <b>Límites</b> para abrir las opciones de columnas.");
                    } else {
                        return getTourText("tour-paso4a-zen-plus", "👉 Por último, haz clic en el botón <b>'+'</b> de Límites para añadir tu primer corte vertical.");
                    }
                }
                return getTourText("tour-paso4a-sub1", "Cuando un PDF tiene <b>varias columnas</b>, LiraLoud intenta detectarlas automáticamente; pero si necesitas ajustar o modificar esos límites manualmente para evitar que se mezclen los renglones, puedes usar los <b>Límites de Columnas</b>.<br><br>👉 Haz clic en el botón <b>'+'</b> de Límites para añadir tu primer corte vertical.");
            }
            if (subEtapaPaso4a === 1) return getTourText("tour-paso4a-sub2", "Para acomodar los cortes verticales, mantén presionado el clic sobre la línea roja y <b>arrástrala hacia la izquierda</b>, entre la <b>Columna 1</b> y la <b>Columna 2</b>.");
            if (subEtapaPaso4a === 2) return aplicarAtajoEnTexto(getTourText("tour-paso4a-sub3", "Ahora aprovecha los comandos para establecer los límites: pulsa <b>Ctrl + Espacio</b> en tu teclado para añadir el corte para la <b>tercera columna</b>."));
            if (subEtapaPaso4a === 3) return getTourText("tour-paso4a-sub4", "Arrastra la nueva línea roja para colocarla entre la <b>Columna 2</b> y la <b>Columna 3</b>.");
            if (subEtapaPaso4a === 4) return getTourText("tour-paso4a-sub5", "¡Bien! Es hora de corroborar que realizaste correctamente los cortes. Haz clic en cualquier palabra de la <b>Columna 1</b> y comprueba que la lectura avanza <b>columna por columna</b> y no salta al siguiente párrafo de la fila contigua.");
            return getTourText("tour-paso4a-sub1", "Hemos completado la sección de lectura. Ahora veamos cómo interactuar con documentos que cuentan con varias columnas. Para evitar que se solape la lectura, es necesario establecer los límites de cada columna.<br><br>👉 Haz clic en el botón <b>'+'</b> de Límites para añadir tu primer corte vertical.");
        },
        getDetalleExtra: () => {
            if (subEtapaPaso4a === 1) return getTourText("tour-paso4a-sub2-det", "💡 <i>Coloca la línea en el espacio divisorio blanco entre ambas columnas (alrededor de 275px).</i>");
            if (subEtapaPaso4a === 2) return getTourText("tour-paso4a-sub3-det", "💡 <i>¡Los atajos te permiten añadir límites de inmediato sin mover el cursor a la barra!</i>");
            if (subEtapaPaso4a === 3) return getTourText("tour-paso4a-sub4-det", "💡 <i>Colócala en el espacio blanco divisorio (alrededor de 525px).</i>");
            if (subEtapaPaso4a === 4) return getTourText("tour-paso4a-sub5-det", "💡 <i>Al terminar la Columna 1, la voz debe continuar arriba en la Columna 2 y luego en la 3, sin mezclar renglones contiguos.</i>");
            return getTourText("tour-paso4a-detalle", "• <b>Líneas Rojas (Cortes Verticales):</b> Permiten leer cada columna de arriba a abajo en orden natural.<br>💡 <i>Puedes mover cualquier línea manteniendo el clic presionado y arrastrando.</i>");
        },
        accionCondicional: (siguiente) => {
            // Solo reiniciar demo y cortes al entrar al paso; en re-renders de sub-etapas se conservan las líneas rojas
            if (subEtapaPaso4a === 0) {
                cargarDemoPaso4Limites('columnas');
            }

            // Zona objetivo visible sobre el lienzo (banda verde) según la sub-etapa
            if (subEtapaPaso4a === 1) {
                window.tutorialGuiaCorteV = { min: 245, max: 305, centro: 275, texto: '⬇ Suelta la línea aquí' };
            } else if (subEtapaPaso4a === 3) {
                window.tutorialGuiaCorteV = { min: 490, max: 560, centro: 525, texto: '⬇ Suelta la línea aquí' };
            } else {
                window.tutorialGuiaCorteV = null;
            }
            if (typeof dibujar === 'function') dibujar();
            window.scrollTo({ top: 0, behavior: 'smooth' });

            const esMinimalista = document.body.classList.contains('modo-minimalista');

            if (subEtapaPaso4a === 0) {
                document.body.classList.remove('tour-paso-lectura');
            } else {
                document.body.classList.add('tour-paso-lectura');
            }

            const onPrimerCorte = () => {
                if (subEtapaPaso4a === 0) {
                    if (esMinimalista) {
                        const dLim = document.getElementById('zen-details-limites');
                        if (dLim) dLim.open = false;
                        if (typeof toggleZenMenu === 'function') toggleZenMenu(true);
                        document.body.classList.remove('tour-activo-zen-menu');
                    }
                    cortesV = [390];
                    inicializarLimitesH();
                    dibujar();
                    document.body.classList.add('tour-paso-lectura');
                    subEtapaPaso4a = 1;
                    renderizarPasoTour();
                    setTimeout(() => {
                        posicionarMouseHintEnCoordenadas(390, 220, getTourText("tour-paso4a-badge-arrastrar-izq", "↔️ Arrastra hacia la izquierda"), "izquierdo");
                    }, 120);
                }
            };

            const getCorteVX = (c) => (typeof c === 'object' && c !== null ? Number(c.x) : Number(c));

            const onSegundoCorte = () => {
                if (subEtapaPaso4a === 2) {
                    removerKeyboardHint();
                    const x0Val = cortesV.length > 0 ? getCorteVX(cortesV[0]) : NaN;
                    const primerX = (!isNaN(x0Val) && x0Val < 380) ? cortesV[0] : 275;
                    cortesV = [primerX, 420];
                    inicializarLimitesH();
                    dibujar();
                    document.body.classList.add('tour-paso-lectura');
                    subEtapaPaso4a = 3;
                    renderizarPasoTour();
                    setTimeout(() => {
                        posicionarMouseHintEnCoordenadas(420, 220, getTourText("tour-paso4a-badge-arrastrar-der", "↔️ Arrastra hacia la derecha"), "izquierdo");
                    }, 120);
                }
            };

            if (esMinimalista && subEtapaPaso4a === 0) {
                document.body.classList.add('tour-activo-zen-menu');
                if (subEtapaZenLimites === 0) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    if (btnZenMenu) {
                        targetCondicionalActivo = btnZenMenu;
                        listenerCondicionalActivo = () => {
                            setTimeout(() => {
                                subEtapaZenLimites = 1;
                                renderizarPasoTour();
                            }, 180);
                        };
                        btnZenMenu.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                } else if (subEtapaZenLimites === 1) {
                    const summaryLim = document.getElementById('btn-zen-summary-limites') || document.querySelector('#zen-details-limites summary');
                    const detailsLim = document.getElementById('zen-details-limites');
                    if (summaryLim) {
                        targetCondicionalActivo = summaryLim;
                        listenerCondicionalActivo = () => {
                            setTimeout(() => {
                                subEtapaZenLimites = 2;
                                renderizarPasoTour();
                            }, 180);
                        };
                        summaryLim.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                    if (detailsLim) {
                        detailsLim.addEventListener('toggle', () => {
                            if (detailsLim.open && subEtapaZenLimites === 1) {
                                subEtapaZenLimites = 2;
                                renderizarPasoTour();
                            }
                        }, { once: true });
                    }
                } else if (subEtapaZenLimites === 2) {
                    const btnZenPlus = document.getElementById('btn-agregar-corte-v') || document.querySelector('#zen-limites-container button:first-of-type');
                    if (btnZenPlus) {
                        targetCondicionalActivo = btnZenPlus;
                        listenerCondicionalActivo = () => {
                            onPrimerCorte();
                        };
                        btnZenPlus.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                }
            } else if (!esMinimalista && subEtapaPaso4a === 0) {
                const btnMas = document.getElementById('btn-agregar-corte-v') || document.querySelector('#box-limites-toolbar button:first-of-type');
                if (btnMas) {
                    targetCondicionalActivo = btnMas;
                    listenerCondicionalActivo = () => {
                        onPrimerCorte();
                    };
                    btnMas.addEventListener('click', listenerCondicionalActivo, { once: true });
                }
            }

            listenerKeydownPaso4 = (e) => {
                // Usa EXACTAMENTE el atajo configurado por el usuario para "Añadir límite"
                const isAtajoCorte = comboDesdeEvento(e) === obtenerAtajoAgregarLimite();
                if (isAtajoCorte) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (subEtapaPaso4a === 0) onPrimerCorte();
                    else if (subEtapaPaso4a === 2) onSegundoCorte();
                }
            };
            document.addEventListener('keydown', listenerKeydownPaso4, true);

            if (subEtapaPaso4a === 1) {
                setTimeout(() => {
                    const x0 = cortesV.length > 0 ? getCorteVX(cortesV[0]) : 390;
                    posicionarMouseHintEnCoordenadas(!isNaN(x0) ? x0 : 390, 220, getTourText("tour-paso4a-badge-arrastrar-izq", "↔️ Arrastra hacia la izquierda"), "izquierdo");
                }, 120);
            } else if (subEtapaPaso4a === 2) {
                setTimeout(() => {
                    posicionarKeyboardHint(390, 220, getTourText("tour-paso4a-badge-teclado", "⌨️ Pulsa el atajo (o clic aquí)"), () => onSegundoCorte());
                }, 120);
            } else if (subEtapaPaso4a === 3) {
                setTimeout(() => {
                    const x1 = cortesV.length > 1 ? getCorteVX(cortesV[1]) : 420;
                    posicionarMouseHintEnCoordenadas(!isNaN(x1) ? x1 : 420, 220, getTourText("tour-paso4a-badge-arrastrar-der", "↔️ Arrastra hacia la derecha"), "izquierdo");
                }, 120);
            } else if (subEtapaPaso4a === 4) {
                const primeraPalCol1 = (datosPagina && datosPagina.oraciones && datosPagina.oraciones[0] && datosPagina.oraciones[0].palabras && datosPagina.oraciones[0].palabras[0])
                    ? datosPagina.oraciones[0].palabras[0]
                    : null;
                const hintX = primeraPalCol1 ? Math.round((primeraPalCol1.bbox[0] + primeraPalCol1.bbox[2]) / 2) : 65;
                const hintY = primeraPalCol1 ? primeraPalCol1.bbox[1] : 114;
                setTimeout(() => {
                    posicionarMouseHintEnCoordenadas(hintX, hintY, getTourText("tour-paso4a-badge-leer-col1", "🖱️ Clic aquí para leer"), "izquierdo");
                }, 120);
            }

            let exitoAvanzado4a = false;
            let lecturaIniciada4a = false;
            let verificacionTerminada4a = false;
            if (intervalPaso4) clearInterval(intervalPaso4);
            intervalPaso4 = setInterval(() => {
                if (window.tutorialPasoActual !== 3) {
                    if (intervalPaso4) { clearInterval(intervalPaso4); intervalPaso4 = null; }
                    removerMouseHintPaso3();
                    removerKeyboardHint();
                    return;
                }

                if (subEtapaPaso4a === 4) {
                    const leyendoAhora = (typeof leyendo !== 'undefined' && leyendo) ||
                                         (typeof isPlayingPiper !== 'undefined' && isPlayingPiper) ||
                                         (typeof window.palabraKaraoke !== 'undefined' && window.palabraKaraoke !== null);
                    if (leyendoAhora) {
                        if (!lecturaIniciada4a) {
                            lecturaIniciada4a = true;
                            removerMouseHintPaso3();
                        }
                    } else if (lecturaIniciada4a && !verificacionTerminada4a) {
                        verificacionTerminada4a = true;
                        if (intervalPaso4) { clearInterval(intervalPaso4); intervalPaso4 = null; }
                        const bodyEl = document.getElementById('tour-card-body');
                        if (bodyEl) {
                            const bubble = bodyEl.querySelector('.tutorial-speech-bubble');
                            if (bubble) bubble.innerHTML = getTourText("tour-paso4a-verificado", "✅ <b>¡Comprobado!</b> La lectura fue de columna en columna. Avanzando a los límites horizontales...");
                        }
                        setTimeout(() => {
                            if (window.tutorialActivo && window.tutorialPasoActual === 3) {
                                siguiente();
                            }
                        }, 1200);
                    }
                    return;
                }

                if (subEtapaPaso4a === 1) {
                    const x0 = cortesV.length > 0 ? getCorteVX(cortesV[0]) : NaN;
                    if (!isNaN(x0) && x0 >= 240 && x0 <= 310) {
                        removerMouseHintPaso3();
                        subEtapaPaso4a = 2;
                        renderizarPasoTour();
                        posicionarKeyboardHint(390, 220, getTourText("tour-paso4a-badge-teclado", "⌨️ Pulsa el atajo (o clic aquí)"), () => onSegundoCorte());
                        const bodyEl = document.getElementById('tour-card-body');
                        if (bodyEl) {
                            const bubble = bodyEl.querySelector('.tutorial-speech-bubble');
                            if (bubble) bubble.innerHTML = `🎉 <b>¡Columna 1 delimitada!</b> Ahora pulsa <b>${atajoLegibleAgregarLimite()}</b> para añadir la tercera columna.`;
                        }
                    }
                } else if (subEtapaPaso4a === 3) {
                    const tieneSegundoEnPosicion = cortesV.some(c => {
                        const cx = getCorteVX(c);
                        return !isNaN(cx) && cx >= 490 && cx <= 560;
                    });
                    if (tieneSegundoEnPosicion && !exitoAvanzado4a) {
                        exitoAvanzado4a = true;
                        removerMouseHintPaso3();
                        removerKeyboardHint();
                        // Quitar la guía verde para no confundir con las siguientes instrucciones
                        window.tutorialGuiaCorteV = null;
                        if (typeof dibujar === 'function') dibujar();
                        if (intervalPaso4) { clearInterval(intervalPaso4); intervalPaso4 = null; }
                        const bodyEl = document.getElementById('tour-card-body');
                        if (bodyEl) {
                            const bubble = bodyEl.querySelector('.tutorial-speech-bubble');
                            if (bubble) bubble.innerHTML = getTourText("tour-paso4a-exito2", "🎉 <b>¡Excelente maquetación de 3 columnas!</b><br><br><i>Ahora comprobemos que la lectura va de columna en columna...</i>");
                        }
                        const btnSig = (document.getElementById('btn-tour-next') || document.getElementById('tour-btn-siguiente'));
                        if (btnSig) {
                            btnSig.style.opacity = '1';
                            btnSig.style.pointerEvents = 'auto';
                        }
                        setTimeout(() => {
                            if (window.tutorialActivo && window.tutorialPasoActual === 3) {
                                subEtapaPaso4a = 4;
                                renderizarPasoTour();
                            }
                        }, 1400);
                    }
                }
            }, 180);
        }
    },
    {
        id: "paso_4b_limites_horizontales",
        getTargets: () => {
            const visor = document.getElementById('visor-container') || document.getElementById('lienzo-pdf');
            return visor ? [visor] : [];
        },
        posicion: "adaptable-paso-1",
        sinSpotlightAnim: true,
        getTitulo: () => getTourText("tour-paso4b-titulo", "↕️ Paso 4.2: Límites Horizontales (Omitir Encabezados)"),
        getInstruccion: () => getTourText("tour-paso4b-instruccion", "Ahora pasemos a los cortes horizontales, muy útiles cuando tenemos encabezados o pies de página repetitivos que no queremos leer.<br><br>👉 Mantén presionado <b>Shift + Clic izquierdo</b> mientras desplazas la línea azul superior debajo del encabezado, y luego sube la línea azul inferior por encima del pie de página."),
        getDetalleExtra: () => getTourText("tour-paso4b-detalle", "💡 <i>Con <b>Shift + arrastrar</b> desplazas toda la fila de límites horizontales al mismo tiempo.</i>"),
        accionCondicional: (siguiente) => {
            cargarDemoPaso4Limites('horizontales');
            window.tutorialGuiaCorteV = null;
            window.tutorialGuiaLimiteH = { min: 58, max: 82, centro: 70, texto: '⬇ Baja las líneas azules hasta aquí (Shift + arrastrar)' };
            if (typeof dibujar === 'function') dibujar();
            document.body.classList.add('tour-paso-lectura');

            setTimeout(() => {
                posicionarMouseHintEnCoordenadas(390, 12, getTourText("tour-paso4b-badge-arrastrar-abajo", "↕️ Shift + Arrastra hacia abajo"), "izquierdo");
            }, 120);

            let yaCompletado4b = false;
            if (intervalPaso4) clearInterval(intervalPaso4);
            intervalPaso4 = setInterval(() => {
                if (window.tutorialPasoActual !== 4) {
                    if (intervalPaso4) { clearInterval(intervalPaso4); intervalPaso4 = null; }
                    window.tutorialGuiaLimiteH = null;
                    removerMouseHintPaso3();
                    return;
                }
                if (yaCompletado4b) return;

                const topLimit0 = limitesH && limitesH["0"] ? limitesH["0"][0] : 0;
                const topLimit1 = limitesH && limitesH["1"] ? limitesH["1"][0] : 0;
                const topLimit2 = limitesH && limitesH["2"] ? limitesH["2"][0] : 0;

                if (topLimit0 >= 58 && topLimit1 >= 58 && topLimit2 >= 58) {
                    yaCompletado4b = true;
                    window.tutorialGuiaLimiteH = null;
                    if (typeof dibujar === 'function') dibujar();
                    removerMouseHintPaso3();
                    if (intervalPaso4) { clearInterval(intervalPaso4); intervalPaso4 = null; }
                    const bodyEl = document.getElementById('tour-card-body');
                    if (bodyEl) {
                        const bubble = bodyEl.querySelector('.tutorial-speech-bubble');
                        if (bubble) bubble.innerHTML = getTourText("tour-paso4b-exito", "🎉 <b>¡Límites horizontales colocados con éxito!</b> El encabezado ya no se leerá. Avanzando al paso de exclusión con Alt + Clic...");
                    }
                    const btnSig = (document.getElementById('btn-tour-next') || document.getElementById('tour-btn-siguiente'));
                    if (btnSig) {
                        btnSig.style.opacity = '1';
                        btnSig.style.pointerEvents = 'auto';
                    }
                    setTimeout(() => {
                        if (window.tutorialActivo && window.tutorialPasoActual === 4) {
                            siguiente();
                        }
                    }, 1200);
                }
            }, 180);
        }
    },
    {
        id: "paso_4c_excluir_texto",
        targetSelector: "#visor-container",
        posicion: "adaptable-paso-1",
        sinSpotlightAnim: true,
        getTitulo: () => getTourText("tour-paso4c-titulo", "🚫 Paso 4.3: Excluir Texto con Alt + Clic (Censura)"),
        getInstruccion: () => getTourText("tour-paso4c-instruccion", "¡Buen trabajo! Ahora excluyamos texto que no queramos que pase por el lector.<br><br>👉 Mantén presionada la tecla <b>Alt</b> y arrastra el clic izquierdo sobre ese anuncio para crear una zona de exclusión."),
        getDetalleExtra: () => getTourText("tour-paso4c-detalle", "💡 <i>Aparecerá un recuadro rayado que la voz omitirá por completo durante la lectura.</i>"),
        accionCondicional: (siguiente) => {
            cargarDemoPaso4Limites('excluir');
            window.tutorialGuiaCorteV = null;
            window.tutorialGuiaLimiteH = null;
            window.tutorialGuiaZonaExcluida = { x0: 536, y0: 428, x1: 762, y1: 527, texto: '⬇ Alt + Clic y arrastra aquí' };
            if (typeof dibujar === 'function') dibujar();
            document.body.classList.add('tour-paso-lectura');

            setTimeout(() => {
                posicionarMouseHintEnCoordenadas(545, 435, getTourText("tour-paso4c-badge-excluir", "Alt + Clic y arrastra"), "izquierdo");
            }, 120);

            let yaCompletado4c = false;
            if (intervalPaso4) clearInterval(intervalPaso4);
            intervalPaso4 = setInterval(() => {
                if (window.tutorialPasoActual !== 5) {
                    if (intervalPaso4) { clearInterval(intervalPaso4); intervalPaso4 = null; }
                    window.tutorialGuiaZonaExcluida = null;
                    removerMouseHintPaso3();
                    return;
                }
                if (yaCompletado4c) return;

                if (Array.isArray(zonasExcluidas) && zonasExcluidas.length > 0) {
                    // Verificar que el recuadro creado cubra razonablemente la zona del anuncio (538, 430, 760, 525)
                    const cubreAnuncio = zonasExcluidas.some(z => {
                        if (!z || z.length < 4) return false;
                        const zx0 = Math.min(z[0], z[2]), zx1 = Math.max(z[0], z[2]);
                        const zy0 = Math.min(z[1], z[3]), zy1 = Math.max(z[1], z[3]);
                        // Intersección con el centro del anuncio (x: 560..730, y: 445..510)
                        const overlapX = Math.max(0, Math.min(zx1, 760) - Math.max(zx0, 538));
                        const overlapY = Math.max(0, Math.min(zy1, 525) - Math.max(zy0, 430));
                        return overlapX >= 90 && overlapY >= 40;
                    });
                    if (cubreAnuncio) {
                        yaCompletado4c = true;
                        window.tutorialGuiaZonaExcluida = null;
                        if (typeof dibujar === 'function') dibujar();
                        removerMouseHintPaso3();
                        if (intervalPaso4) { clearInterval(intervalPaso4); intervalPaso4 = null; }
                        const bodyEl = document.getElementById('tour-card-body');
                        if (bodyEl) {
                            const bubble = bodyEl.querySelector('.tutorial-speech-bubble');
                            if (bubble) bubble.innerHTML = getTourText("tour-paso4c-exito", "🎉 <b>¡Excelente! Has creado una zona de exclusión sobre el anuncio.</b> Avanzando al Paso 5 (Abreviaturas)...");
                        }
                        const btnSig = (document.getElementById('btn-tour-next') || document.getElementById('tour-btn-siguiente'));
                        if (btnSig) {
                            btnSig.style.opacity = '1';
                            btnSig.style.pointerEvents = 'auto';
                        }
                        setTimeout(() => {
                            if (window.tutorialActivo && window.tutorialPasoActual === 5) {
                                siguiente();
                            }
                        }, 1200);
                    }
                }
            }, 200);
        }
    },

    // ------------------------------------------------------------------------
    // FASE 3: DICCIONARIO Y ABREVIATURAS (PASO 5)
    // ------------------------------------------------------------------------
    {
        id: "paso_6_abrir_abreviaturas",
        getTargets: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                if (subEtapaZenDicc === 0) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    return btnZenMenu ? [btnZenMenu] : [];
                } else {
                    const pMenu = document.getElementById('zen-panel-menu');
                    if (pMenu && pMenu.style.display !== 'block') {
                        pMenu.style.display = 'block';
                        pMenu.classList.add('zen-active');
                    }
                    const btnZenDicc = document.getElementById('btn-zen-dicc') ||
                                       document.querySelector('#zen-panel-menu button[onclick*="abrirDiccionario"]');
                    return btnZenDicc ? [btnZenDicc] : [];
                }
            }
            const btn = document.getElementById('btn-dicc');
            return btn ? [btn] : [];
        },
        posicion: "adaptable-paso-1",
        getTitulo: () => getTourText("tour-paso5-titulo", "📖 Paso 5: Abrir Gestor de Abreviaturas"),
        getInstruccion: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                if (subEtapaZenDicc === 0) {
                    return getTourText("tour-paso5-zen-menu", "¡Bien hecho! Ahora pasemos al Gestor de Abreviaturas. Esta herramienta nos permite hacer que la voz pronuncie el significado completo de cualquier sigla sin modificar tu archivo original.<br><br>👉 Haz clic en el <b>Menú Principal (☰)</b> iluminado en azul.");
                } else {
                    return getTourText("tour-paso5-zen-dicc", "Haz clic en el botón de <b>'Abreviaturas'</b> iluminado en azul.");
                }
            }
            return getTourText("tour-paso5-instruccion", "¡Bien hecho! Ahora pasemos al Gestor de Abreviaturas. Esta herramienta nos permite hacer que la voz pronuncie el significado completo de cualquier sigla sin modificar tu archivo original.<br><br>👉 Haz clic en el botón de <b>'Abreviaturas'</b> iluminado en azul para abrirlo.");
        },
        getDetalleExtra: () => getTourText("tour-paso5-detalle", "Enseña a la voz cómo pronunciar siglas y abreviaturas sin alterar tu archivo PDF original. 💡 <i>Nota: la pestaña <b>'Este Libro'</b> con el icono del <b>reloj (⏱️)</b> guarda reglas exclusivas para el PDF actual.</i>"),
        accionCondicional: (siguiente) => {
            cargarDemoAbreviaturas();
            // Preparar el diccionario y limpiar los inputs desde este paso (antes de que se abra el modal)
            asegurarEstadoDiccionarioTutorial(false, true);
            const inpSigla = document.getElementById('input-sigla');
            const inpSignificado = document.getElementById('input-significado');
            if (inpSigla) inpSigla.value = "";
            if (inpSignificado) inpSignificado.value = "";

            const esMinimalista = document.body.classList.contains('modo-minimalista');

            if (esMinimalista) {
                document.body.classList.add('tour-activo-zen-menu');
                if (subEtapaZenDicc === 0) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    if (btnZenMenu) {
                        targetCondicionalActivo = btnZenMenu;
                        listenerCondicionalActivo = () => {
                            setTimeout(() => {
                                subEtapaZenDicc = 1;
                                renderizarPasoTour();
                            }, 180);
                        };
                        btnZenMenu.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                } else {
                    const btnZenDicc = document.getElementById('btn-zen-dicc') ||
                                       document.querySelector('#zen-panel-menu button[onclick*="abrirDiccionario"]');
                    if (btnZenDicc) {
                        targetCondicionalActivo = btnZenDicc;
                        listenerCondicionalActivo = () => {
                            document.body.classList.remove('tour-activo-zen-menu');
                            setTimeout(() => siguiente(), 60);
                        };
                        btnZenDicc.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                }
            } else {
                const btn = document.getElementById('btn-dicc');
                if (btn) {
                    targetCondicionalActivo = btn;
                    listenerCondicionalActivo = () => {
                        setTimeout(() => siguiente(), 60);
                    };
                    btn.addEventListener('click', listenerCondicionalActivo, { once: true });
                }
            }
        }
    },
    {
        id: "paso_7a_campo_sigla",
        getTargets: () => {
            const inp = document.getElementById('input-sigla');
            const panel = document.getElementById('panel-diccionario');
            return inp ? [inp] : (panel ? [panel] : []);
        },
        posicion: "right-panel",
        getTitulo: () => getTourText("tour-paso5-1-titulo", "📝 Paso 5.1: Capturar o Escribir la Sigla"),
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
            return getTourText("tour-paso5-1-instruccion", `Con el diccionario abierto se activa el <b>Modo Captura</b>: haz clic directamente sobre la sigla <code>${cfg.siglaEjemplo}</code> en el documento para capturarla automáticamente, o escríbela en el campo <b>'Sigla'</b>.`, cfg);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
            return getTourText("tour-paso5-1-detalle", `💡 <i>Nota cómo <b>${cfg.siglaExtra}</b> (${cfg.significadoExtra}) ya está registrada en tu lista. Captura o escribe <b>${cfg.siglaEjemplo}</b> para pasar automáticamente al siguiente paso.</i>`, cfg);
        },
        botonDemoExtra: {
            getTexto: () => {
                const langIso = detectarIdiomaTutorialActivo();
                const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
                return getTourText("tour-paso5-1-btn-auto", `⚡ Capturar "${cfg.siglaEjemplo}" automáticamente`, cfg);
            },
            accion: () => {
                const langIso = detectarIdiomaTutorialActivo();
                const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
                const inp = document.getElementById('input-sigla');
                if (inp) {
                    inp.value = cfg.siglaEjemplo;
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        },
        accionCondicional: (siguiente) => {
            cargarDemoAbreviaturas();
            document.body.classList.add('tour-paso-lectura');
            const modalDicc = document.getElementById('modal-diccionario');
            if (modalDicc && modalDicc.style.display !== 'flex') {
                if (typeof abrirDiccionario === 'function') abrirDiccionario();
                else modalDicc.style.display = 'flex';
            }

            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;

            // Pre-registrar la primera sigla (ej. OMS / WHO) como ejemplo activo y eliminar la sigla de prueba (ej. ONU / UN) si existía previamente
            asegurarEstadoDiccionarioTutorial(false, true);

            const inpSigla = document.getElementById('input-sigla');
            const inpSignificado = document.getElementById('input-significado');
            const valPrevio = (inpSigla?.value || '').trim().replace(/[.,;:]/g, '').toLowerCase();
            const yaTieneSigla = (valPrevio === cfg.siglaEjemplo.toLowerCase()) ||
                                 (cfg.siglaExtra && valPrevio === cfg.siglaExtra.toLowerCase());
            if (!yaTieneSigla) {
                if (inpSigla) inpSigla.value = "";
                if (inpSignificado) inpSignificado.value = "";
            }

            // Posicionar ratón animado sobre la palabra objetivo (ej. ONU / UN) en el lienzo
            const posicionarHintSigla = () => {
                if (!datosPagina || !datosPagina.palabras) return;
                const targetW = datosPagina.palabras.find(p =>
                    p.texto.replace(/[.,;:]/g, '').toLowerCase() === cfg.siglaEjemplo.toLowerCase()
                ) || datosPagina.palabras[3] || datosPagina.palabras[0];
                if (targetW && targetW.bbox) {
                    const midX = (targetW.bbox[0] + targetW.bbox[2]) / 2;
                    const topY = targetW.bbox[1];
                    posicionarMouseHintEnCoordenadas(
                        midX,
                        topY,
                        getTourText("tour-paso5-1-badge-mouse", `🖱️ Clic en '${cfg.siglaEjemplo}' para capturar`, cfg),
                        'izquierdo'
                    );
                }
            };
            setTimeoutTutorial(posicionarHintSigla, 100);

            let completado = false;
            if (intervalPaso5) clearInterval(intervalPaso5);
            intervalPaso5 = setInterval(() => {
                if (!window.tutorialActivo || PASOS_TOUR_GUI[window.tutorialPasoActual]?.id !== 'paso_7a_campo_sigla') {
                    clearInterval(intervalPaso5);
                    intervalPaso5 = null;
                    return;
                }
                const val = (document.getElementById('input-sigla')?.value || '').trim();
                const limpia = val.replace(/[.,;:]/g, '').toLowerCase();
                if (!completado && (limpia === cfg.siglaEjemplo.toLowerCase() || (cfg.siglaExtra && limpia === cfg.siglaExtra.toLowerCase()))) {
                    completado = true;
                    clearInterval(intervalPaso5);
                    intervalPaso5 = null;
                    removerMouseHintPaso3();
                    setTimeout(() => siguiente(), 120);
                }
            }, 80);
        }
    },
    {
        id: "paso_7b_campo_significado",
        getTargets: () => {
            if (subEtapaPaso7c === 0) {
                const inp = document.getElementById('input-significado');
                const btnGuardar = document.querySelector('.btn-guardar-termino');
                if (inp && btnGuardar) return [inp, btnGuardar];
                return btnGuardar ? [btnGuardar] : (inp ? [inp] : []);
            } else {
                const btnCerrar = document.querySelector('#modal-diccionario .btn-cerrar-x');
                return btnCerrar ? [btnCerrar] : [];
            }
        },
        posicion: "right-panel",
        getTitulo: () => {
            if (subEtapaPaso7c === 0) {
                return getTourText("tour-paso5-2-titulo", "🗣️ Paso 5.2: Significado Completo y Guardar");
            }
            return getTourText("tour-paso5-3-titulo-b", "✅ ¡Abreviatura Registrada! Ahora Cierra el Panel");
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
            if (subEtapaPaso7c === 0) {
                return getTourText("tour-paso5-2-instruccion", `Ahora escribe su significado completo, <code>'${cfg.significadoEjemplo}'</code>, en el campo resaltado y pulsa el botón <b>'Agregar'</b> (<b>'Guardar'</b>) para guardarla.`, cfg);
            }
            return getTourText("tour-paso5-3-instruccion-b", `¡Listo! <code>${cfg.siglaEjemplo}</code> ha quedado registrada.<br><br>👉 Ahora haz clic en la <b>'✕'</b> (iluminada en azul) para cerrar el panel y escuchar la conversión.`, cfg);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
            if (subEtapaPaso7c === 0) {
                return getTourText("tour-paso5-2-detalle", "💡 <i>Puedes editar el texto si quieres, o darle directamente a <b>Guardar</b>. Al guardar, se registrará con su ortografía exacta.</i>");
            }
            return `<div style="line-height:1.45;">
                <b>🔄 Vista Previa de Conversión en Vivo:</b><br>
                📄 <b>En PDF:</b> <i>"${cfg.texto}"</i><br>
                🔊 <b>La voz leerá:</b> <span style="color:#38bdf8; font-weight:600;">"${cfg.textoExpandido}"</span>
            </div>`;
        },
        accionCondicional: (siguiente) => {
            removerMouseHintPaso3();
            document.body.classList.add('tour-paso-lectura');
            const modalDicc = document.getElementById('modal-diccionario');
            if (subEtapaPaso7c === 0 && modalDicc && modalDicc.style.display !== 'flex') {
                if (typeof abrirDiccionario === 'function') abrirDiccionario();
                else modalDicc.style.display = 'flex';
            }

            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;

            if (subEtapaPaso7c === 0) {
                // Antes de comenzar el paso 5.2, asegurar que la abreviatura no esté ya en la lista para evitar errores al guardar
                asegurarEstadoDiccionarioTutorial(false, true);

                // Pre-llenar automáticamente la sigla y el significado exacto con acentos sin borrar si ya coincide
                const inpSigla = document.getElementById('input-sigla');
                const inpSignificado = document.getElementById('input-significado');
                if (inpSigla && inpSigla.value !== cfg.siglaEjemplo) {
                    inpSigla.value = cfg.siglaEjemplo;
                }
                if (inpSignificado && inpSignificado.value !== cfg.significadoEjemplo) {
                    inpSignificado.value = cfg.significadoEjemplo;
                }

                const btnGuardar = document.querySelector('.btn-guardar-termino');
                if (btnGuardar) {
                    targetCondicionalActivo = btnGuardar;
                    listenerCondicionalActivo = () => {
                        // Normalizar inputs justo antes de que agregarTermino() los lea, evitando doble renderizado
                        if (inpSigla) inpSigla.value = cfg.siglaEjemplo;
                        if (inpSignificado) inpSignificado.value = cfg.significadoEjemplo;
                        setTimeout(() => {
                            asegurarEstadoDiccionarioTutorial(true, false);
                            subEtapaPaso7c = 1;
                            renderizarPasoTour();
                        }, 150);
                    };
                    btnGuardar.addEventListener('click', listenerCondicionalActivo, { once: true });
                }
            } else {
                // Garantizar que si estamos en la subetapa de cierre, la abreviatura esté registrada y activa
                asegurarEstadoDiccionarioTutorial(true, false);
                const btnCerrar = document.querySelector('#modal-diccionario .btn-cerrar-x');
                let yaAvanzo = false;
                const avanzarPaso = () => {
                    if (yaAvanzo) return;
                    yaAvanzo = true;
                    asegurarEstadoDiccionarioTutorial(true, false);
                    const mDicc = document.getElementById('modal-diccionario');
                    if (mDicc) mDicc.style.display = 'none';
                    setTimeout(() => siguiente(), 100);
                };
                if (btnCerrar) {
                    targetCondicionalActivo = btnCerrar;
                    listenerCondicionalActivo = avanzarPaso;
                    btnCerrar.addEventListener('click', listenerCondicionalActivo, { once: true });
                }
                if (modalDicc && modalDicc.style.display === 'none') {
                    avanzarPaso();
                } else if (modalDicc) {
                    const onOverlayClick = (e) => {
                        if (e.target === modalDicc) {
                            setTimeout(avanzarPaso, 50);
                        }
                    };
                    modalDicc.addEventListener('click', onOverlayClick, { once: true });
                }
            }
        }
    },
    {
        id: "paso_8_leer_abreviatura",
        targetSelector: "#visor-container",
        posicion: "top-right",
        sinSpotlightAnim: true,
        getTitulo: () => getTourText("tour-paso5-3-titulo", "🔊 Paso 5.3: Comprobar Conversión en la Lectura"),
        getInstruccion: () => {
            return getTourText("tour-paso5-3-instruccion", "¡Listo! Haz clic izquierdo sobre el documento para escuchar cómo LiraLoud pronuncia el significado completo de las siglas registradas.");
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
            return `<div style="line-height:1.45;">
                📄 <b>Texto en PDF:</b> <i>"${cfg.texto}"</i><br>
                🔊 <b>Voz expandida:</b> <span style="color:#38bdf8; font-weight:600;">"${cfg.textoExpandido}"</span>
            </div>`;
        },
        accionCondicional: (siguiente) => {
            const modalDicc = document.getElementById('modal-diccionario');
            if (modalDicc) modalDicc.style.display = 'none';
            document.body.classList.add('tour-paso-lectura');

            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;

            // Asegurar que ambas siglas del ejemplo estén exactamente activas en dbDiccionario y guardadas en Python
            asegurarEstadoDiccionarioTutorial(true, false);

            // Cargar la página demo de abreviaturas y mapear de inmediato las palabras para Karaoke
            cargarDemoAbreviaturas();
            configurarOracionDemoAbreviaturas(true);

            setTimeoutTutorial(() => {
                configurarOracionDemoAbreviaturas(true);

                // Posicionar ratón animado en la primera palabra del documento
                if (datosPagina && datosPagina.palabras && datosPagina.palabras[0]) {
                    const firstW = datosPagina.palabras[0];
                    const midX = (firstW.bbox[0] + firstW.bbox[2]) / 2;
                    const topY = firstW.bbox[1];
                    posicionarMouseHintEnCoordenadas(
                        midX,
                        topY,
                        getTourText("tour-paso5-4-badge-mouse", "🖱️ Clic aquí para escuchar la conversión"),
                        'izquierdo'
                    );
                }
            }, 60);

            let empezoLectura = false;
            let ticksLeyendo = 0;
            let ticksSilencio = 0;
            let completado = false;

            const isReproduciendo = () => {
                return (typeof leyendo !== 'undefined' && leyendo) ||
                       (typeof isPlayingPiper !== 'undefined' && isPlayingPiper) ||
                       (typeof window.palabraKaraoke !== 'undefined' && window.palabraKaraoke !== null);
            };

            if (intervalPaso5) clearInterval(intervalPaso5);
            intervalPaso5 = setInterval(() => {
                if (!window.tutorialActivo || PASOS_TOUR_GUI[window.tutorialPasoActual]?.id !== 'paso_8_leer_abreviatura') {
                    clearInterval(intervalPaso5);
                    intervalPaso5 = null;
                    return;
                }

                // Blindaje: si algo sobrescribió datosPagina.oraciones mientras esperábamos el clic, restaurar al instante
                if (!isReproduciendo() && (!datosPagina || !datosPagina.oraciones || !datosPagina.oraciones[0])) {
                    cargarDemoAbreviaturas();
                    configurarOracionDemoAbreviaturas(true);
                }

                if (isReproduciendo()) {
                    if (!empezoLectura) {
                        empezoLectura = true;
                        removerMouseHintPaso3();
                        const bodyEl = document.getElementById('tour-card-body');
                        if (bodyEl) {
                            const speechBubble = bodyEl.querySelector('.tutorial-speech-bubble');
                            if (speechBubble) {
                                speechBubble.innerHTML = `<span style="color:#38bdf8; font-weight:bold;">🎙️ ¡Escuchando conversión en vivo!</span><br>📄 <b>En PDF:</b> <i>"${cfg.texto}"</i><br>🔊 <b>Voz:</b> <i>"${cfg.textoExpandido}"</i>`;
                            }
                        }
                    }
                    ticksLeyendo++;
                    ticksSilencio = 0;
                } else if (empezoLectura && ticksLeyendo >= 3) {
                    ticksSilencio++;
                    if (ticksSilencio >= 3 && !completado) {
                        completado = true;
                        clearInterval(intervalPaso5);
                        intervalPaso5 = null;
                        removerMouseHintPaso3();
                        setTimeout(() => siguiente(), 500);
                    }
                }
            }, 200);
        }
    },
    {
        id: "paso_8b_desactivar_abreviatura",
        getTargets: () => {
            if (subEtapaPaso8b === 0) {
                const esMinimalista = document.body.classList.contains('modo-minimalista');
                if (esMinimalista) {
                    if (subEtapaZenDicc === 0) {
                        const btnZenMenu = document.getElementById('btn-zen-menu');
                        return btnZenMenu ? [btnZenMenu] : [];
                    } else {
                        const btnZenDicc = document.getElementById('btn-zen-dicc') ||
                                           document.querySelector('#zen-panel-menu button[onclick*="abrirDiccionario"]');
                        return btnZenDicc ? [btnZenDicc] : [];
                    }
                }
                const btn = document.getElementById('btn-dicc');
                return btn ? [btn] : [];
            } else if (subEtapaPaso8b === 1) {
                const langIso = detectarIdiomaTutorialActivo();
                const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
                const filas = Array.from(document.querySelectorAll('#tabla-terminos .fila-termino'));
                const filaTarget = filas.find(f => {
                    const s = f.querySelector('.col-sigla')?.textContent?.trim() || '';
                    return s.toLowerCase() === cfg.siglaEjemplo.toLowerCase();
                }) || filas[0];
                const chk = filaTarget ? filaTarget.querySelector('.switch-individual') : null;
                if (chk && filaTarget) return [chk, filaTarget];
                return chk ? [chk] : (filaTarget ? [filaTarget] : []);
            } else {
                const btnCerrar = document.querySelector('#modal-diccionario .btn-cerrar-x');
                return btnCerrar ? [btnCerrar] : [];
            }
        },
        posicion: "right-panel",
        getTitulo: () => {
            if (subEtapaPaso8b === 0) {
                return getTourText("tour-paso5-4-titulo-a", "🔕 Paso 5.4: Abrir Diccionario para Desactivar");
            }
            if (subEtapaPaso8b === 1) {
                return getTourText("tour-paso5-4-titulo-b", "🔕 Paso 5.4: Desactivar Abreviatura sin Borrarla");
            }
            return getTourText("tour-paso5-4-titulo-c", "✅ ¡Abreviatura Pausada! Cierra el Panel");
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
            if (subEtapaPaso8b === 0) {
                const esMinimalista = document.body.classList.contains('modo-minimalista');
                if (esMinimalista) {
                    if (subEtapaZenDicc === 0) {
                        return getTourText("tour-paso5-5-instruccion-zen0", `Si en algún documento prefieres que una sigla se lea tal como está escrita sin borrarla de tu lista, abre el <b>Menú (☰)</b>.`);
                    }
                    return getTourText("tour-paso5-5-instruccion-zen1", `Ahora pulsa en <b>'Abreviaturas'</b>.`);
                }
                return getTourText("tour-paso5-5-instruccion-a", `Si en algún documento prefieres que una sigla se lea tal como está escrita sin borrarla de tu lista, abre de nuevo <b>'Abreviaturas'</b>.`);
            }
            if (subEtapaPaso8b === 1) {
                return getTourText("tour-paso5-5-instruccion-b", `Desmarca la casilla que dice <code>${cfg.siglaEjemplo}</code>.`, cfg);
            }
            return getTourText("tour-paso5-5-instruccion-c", `¡Listo! Haz clic en la <b>'✕'</b> (iluminada en azul) para cerrar y comprobar el cambio.`);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
            if (subEtapaPaso8b === 2) {
                const textoParcial = cfg.texto
                    .replace(new RegExp(`\\b${cfg.siglaExtra}\\b`, 'g'), cfg.significadoExtra);
                return `<div style="line-height:1.45;">
                    <b>🔄 Nuevo Estado de Conversión:</b><br>
                    ✅ <b>${cfg.siglaExtra}:</b> Activa (se leerá <i>"${cfg.significadoExtra}"</i>)<br>
                    ⏸️ <b>${cfg.siglaEjemplo}:</b> Desactivada (se leerá literal <i>"${cfg.siglaEjemplo}"</i>)<br>
                    🔊 <b>La voz leerá:</b> <span style="color:#38bdf8; font-weight:600;">"${textoParcial}"</span>
                </div>`;
            }
            return getTourText("tour-paso5-5-detalle", "💡 <i>Puedes activar o desactivar palabras individuales o bloques enteros con un clic según el libro que estés leyendo.</i>");
        },
        accionCondicional: (siguiente) => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
            const modalDicc = document.getElementById('modal-diccionario');

            if (subEtapaPaso8b === 0) {
                if (modalDicc && modalDicc.style.display === 'flex') {
                    subEtapaPaso8b = 1;
                    renderizarPasoTour();
                    return;
                }
                const esMinimalista = document.body.classList.contains('modo-minimalista');
                if (esMinimalista) {
                    const panelMenu = document.getElementById('zen-panel-menu');
                    if (subEtapaZenDicc === 1 && panelMenu) {
                        panelMenu.classList.add('zen-active');
                        panelMenu.style.display = 'flex';
                        document.body.classList.add('tour-activo-zen-menu');
                    } else {
                        document.body.classList.remove('tour-activo-zen-menu');
                    }

                    if (subEtapaZenDicc === 0) {
                        const btnZenMenu = document.getElementById('btn-zen-menu');
                        if (btnZenMenu) {
                            targetCondicionalActivo = btnZenMenu;
                            listenerCondicionalActivo = () => {
                                setTimeout(() => {
                                    subEtapaZenDicc = 1;
                                    renderizarPasoTour();
                                }, 180);
                            };
                            btnZenMenu.addEventListener('click', listenerCondicionalActivo, { once: true });
                        }
                    } else {
                        const btnZenDicc = document.getElementById('btn-zen-dicc') ||
                                           document.querySelector('#zen-panel-menu button[onclick*="abrirDiccionario"]');
                        if (btnZenDicc) {
                            targetCondicionalActivo = btnZenDicc;
                            listenerCondicionalActivo = () => {
                                document.body.classList.remove('tour-activo-zen-menu');
                                setTimeout(() => {
                                    subEtapaPaso8b = 1;
                                    renderizarPasoTour();
                                }, 300);
                            };
                            btnZenDicc.addEventListener('click', listenerCondicionalActivo, { once: true });
                        }
                    }
                } else {
                    const btn = document.getElementById('btn-dicc');
                    if (btn) {
                        targetCondicionalActivo = btn;
                        listenerCondicionalActivo = () => {
                            setTimeout(() => {
                                subEtapaPaso8b = 1;
                                renderizarPasoTour();
                            }, 300);
                        };
                        btn.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                }
            } else if (subEtapaPaso8b === 1) {
                if (modalDicc && modalDicc.style.display !== 'flex') {
                    if (typeof abrirDiccionario === 'function') abrirDiccionario();
                    else modalDicc.style.display = 'flex';
                }
                // Asegurar que la abreviatura de prueba esté inicialmente presente y marcada para que el usuario la desactive
                asegurarEstadoDiccionarioTutorial(true, false);

                // Re-aplicar el resaltado azul (.tour-spotlight-active) a la checkbox y fila tras renderizarTerminos()
                const filas = Array.from(document.querySelectorAll('#tabla-terminos .fila-termino'));
                const filaTarget = filas.find(f => {
                    const s = f.querySelector('.col-sigla')?.textContent?.trim() || '';
                    return s.toLowerCase() === cfg.siglaEjemplo.toLowerCase();
                }) || filas[0];
                const chk = filaTarget ? filaTarget.querySelector('.switch-individual') : null;
                if (filaTarget) {
                    filaTarget.classList.add('tour-spotlight-active');
                    if (chk) chk.classList.add('tour-spotlight-active');
                }

                let completado = false;
                const confirmarDesactivacionYAvanzar = () => {
                    if (completado) return;
                    completado = true;
                    if (intervalPaso5) {
                        clearInterval(intervalPaso5);
                        intervalPaso5 = null;
                    }
                    // Forzar estado OFF exacto y quitar resaltado del switch inmediatamente para que se vea apagado (gris)
                    if (chk) {
                        chk.checked = false;
                        chk.classList.remove('tour-spotlight-active');
                    }
                    if (filaTarget) {
                        filaTarget.classList.remove('tour-spotlight-active');
                        filaTarget.style.opacity = '0.5';
                    }
                    asegurarEstadoDiccionarioTutorial(false, false);
                    setTimeout(() => {
                        subEtapaPaso8b = 2;
                        renderizarPasoTour();
                    }, 120);
                };

                if (chk) {
                    targetCondicionalActivo = chk;
                    listenerCondicionalActivo = () => {
                        confirmarDesactivacionYAvanzar();
                    };
                    chk.addEventListener('change', listenerCondicionalActivo, { once: true });
                }

                // Si el usuario cierra directamente el diccionario con la '✕' sin haber desmarcado la casilla, la máquina la desactiva automáticamente
                const btnCerrarDirecto = document.querySelector('#modal-diccionario .btn-cerrar-x');
                if (btnCerrarDirecto) {
                    btnCerrarDirecto.addEventListener('click', () => {
                        if (!completado && subEtapaPaso8b === 1 && window.tutorialActivo && PASOS_TOUR_GUI[window.tutorialPasoActual]?.id === 'paso_8b_desactivar_abreviatura') {
                            completado = true;
                            if (intervalPaso5) {
                                clearInterval(intervalPaso5);
                                intervalPaso5 = null;
                            }
                            asegurarEstadoDiccionarioTutorial(false, false);
                            setTimeout(() => siguiente(), 250);
                        }
                    }, { once: true });
                }

                if (intervalPaso5) clearInterval(intervalPaso5);
                intervalPaso5 = setInterval(() => {
                    if (!window.tutorialActivo || PASOS_TOUR_GUI[window.tutorialPasoActual]?.id !== 'paso_8b_desactivar_abreviatura' || subEtapaPaso8b !== 1) {
                        clearInterval(intervalPaso5);
                        intervalPaso5 = null;
                        return;
                    }
                    const chkActual = Array.from(document.querySelectorAll('#tabla-terminos .fila-termino')).find(f => {
                        const s = f.querySelector('.col-sigla')?.textContent?.trim() || '';
                        return s.toLowerCase() === cfg.siglaEjemplo.toLowerCase();
                    })?.querySelector('.switch-individual');
                    const termObj = dbDiccionario?.[seccionActual]?.terms?.[cfg.siglaEjemplo];
                    if (!completado && ((chkActual && !chkActual.checked) || (termObj && termObj.on === false))) {
                        confirmarDesactivacionYAvanzar();
                    }
                }, 100);
            } else {
                // La máquina asegura automáticamente que la abreviatura esté desactivada en esta etapa
                asegurarEstadoDiccionarioTutorial(false, false);
                const btnCerrar = document.querySelector('#modal-diccionario .btn-cerrar-x');
                let yaAvanzo = false;
                const avanzarPaso = () => {
                    if (yaAvanzo) return;
                    yaAvanzo = true;
                    asegurarEstadoDiccionarioTutorial(false, false);
                    const mDicc = document.getElementById('modal-diccionario');
                    if (mDicc) mDicc.style.display = 'none';
                    setTimeout(() => siguiente(), 100);
                };
                if (btnCerrar) {
                    targetCondicionalActivo = btnCerrar;
                    listenerCondicionalActivo = avanzarPaso;
                    btnCerrar.addEventListener('click', listenerCondicionalActivo, { once: true });
                }
                if (modalDicc && modalDicc.style.display === 'none') {
                    avanzarPaso();
                } else if (modalDicc) {
                    const onOverlayClick = (e) => {
                        if (e.target === modalDicc) {
                            setTimeout(avanzarPaso, 50);
                        }
                    };
                    modalDicc.addEventListener('click', onOverlayClick, { once: true });
                }
            }
        }
    },
    {
        id: "paso_8c_comprobar_desactivado",
        targetSelector: "#visor-container",
        posicion: "top-right",
        sinSpotlightAnim: true,
        getTitulo: () => getTourText("tour-paso5-5-titulo", "🔊 Paso 5.5: Comprobar Lectura con Abreviatura Desactivada"),
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
            return getTourText("tour-paso5-5-instruccion", `Haz clic en el texto una vez más para comprobar que <code>${cfg.siglaEjemplo}</code> vuelve a leerse como sigla, mientras que <code>${cfg.siglaExtra}</code> sigue pronunciándose completa.`, cfg);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;
            const textoParcial = cfg.texto.replace(new RegExp(`\\b${cfg.siglaExtra}\\b`, 'g'), cfg.significadoExtra);
            return `<div style="line-height:1.45;">
                📄 <b>En PDF:</b> <i>"${cfg.texto}"</i><br>
                🔊 <b>Voz ahora:</b> <span style="color:#38bdf8; font-weight:600;">"${textoParcial}"</span>
            </div>`;
        },
        accionCondicional: (siguiente) => {
            const modalDicc = document.getElementById('modal-diccionario');
            if (modalDicc) modalDicc.style.display = 'none';
            document.body.classList.add('tour-paso-lectura');

            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_ABREVIATURAS_POR_IDIOMA[langIso] || DEMO_ABREVIATURAS_POR_IDIOMA.es;

            // La máquina asegura automáticamente en dbDiccionario que siglaExtra está ON y siglaEjemplo está OFF
            asegurarEstadoDiccionarioTutorial(false, false);

            cargarDemoAbreviaturas();
            configurarOracionDemoAbreviaturas(false);

            setTimeoutTutorial(() => {
                configurarOracionDemoAbreviaturas(false);

                // Posicionar ratón animado en la primera palabra del documento
                if (datosPagina && datosPagina.palabras && datosPagina.palabras[0]) {
                    const firstW = datosPagina.palabras[0];
                    const midX = (firstW.bbox[0] + firstW.bbox[2]) / 2;
                    const topY = firstW.bbox[1];
                    posicionarMouseHintEnCoordenadas(
                        midX,
                        topY,
                        getTourText("tour-paso5-6-badge-mouse", "🖱️ Clic aquí para comprobar sin la abreviatura"),
                        'izquierdo'
                    );
                }
            }, 60);

            let empezoLectura = false;
            let ticksLeyendo = 0;
            let ticksSilencio = 0;
            let completado = false;

            const isReproduciendo = () => {
                return (typeof leyendo !== 'undefined' && leyendo) ||
                       (typeof isPlayingPiper !== 'undefined' && isPlayingPiper) ||
                       (typeof window.palabraKaraoke !== 'undefined' && window.palabraKaraoke !== null);
            };

            if (intervalPaso5) clearInterval(intervalPaso5);
            intervalPaso5 = setInterval(() => {
                if (!window.tutorialActivo || PASOS_TOUR_GUI[window.tutorialPasoActual]?.id !== 'paso_8c_comprobar_desactivado') {
                    clearInterval(intervalPaso5);
                    intervalPaso5 = null;
                    return;
                }

                // Blindaje: si algo sobrescribió datosPagina.oraciones mientras esperábamos el clic, restaurar al instante
                if (!isReproduciendo() && (!datosPagina || !datosPagina.oraciones || !datosPagina.oraciones[0])) {
                    cargarDemoAbreviaturas();
                    configurarOracionDemoAbreviaturas(false);
                }

                if (isReproduciendo()) {
                    if (!empezoLectura) {
                        empezoLectura = true;
                        removerMouseHintPaso3();
                        const bodyEl = document.getElementById('tour-card-body');
                        if (bodyEl) {
                            const speechBubble = bodyEl.querySelector('.tutorial-speech-bubble');
                            if (speechBubble) {
                                speechBubble.innerHTML = `<span style="color:#38bdf8; font-weight:bold;">🎙️ ¡Comprobando lectura!</span><br>✅ <b>${cfg.siglaExtra}</b> ➔ <i>"${cfg.significadoExtra}"</i><br>⏸️ <b>${cfg.siglaEjemplo}</b> ➔ se lee tal cual: <i>"${cfg.siglaEjemplo}"</i>`;
                            }
                        }
                    }
                    ticksLeyendo++;
                    ticksSilencio = 0;
                } else if (empezoLectura && ticksLeyendo >= 3) {
                    ticksSilencio++;
                    if (ticksSilencio >= 3 && !completado) {
                        completado = true;
                        clearInterval(intervalPaso5);
                        intervalPaso5 = null;
                        removerMouseHintPaso3();
                        setTimeout(() => siguiente(), 500);
                    }
                }
            }, 200);
        }
    },

    // ------------------------------------------------------------------------
    // FASE 4: MODO TEATRO (PASO 6)
    // ------------------------------------------------------------------------
    {
        id: "paso_9a_abrir_teatro",
        getTargets: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                if (subEtapaZenTeatro === 0) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    return btnZenMenu ? [btnZenMenu] : [];
                } else {
                    const pMenu = document.getElementById('zen-panel-menu');
                    if (pMenu && pMenu.style.display !== 'block') {
                        pMenu.style.display = 'block';
                        pMenu.classList.add('zen-active');
                    }
                    const btnZenTeatro = document.getElementById('btn-zen-teatro') ||
                                         document.querySelector('#zen-panel-menu button[onclick*="abrirTeatro"]');
                    return btnZenTeatro ? [btnZenTeatro] : [];
                }
            }
            const btn = document.getElementById('btn-teatro');
            return btn ? [btn] : [];
        },
        posicion: "adaptable-paso-1",
        getTitulo: () => getTourText("tour-paso6-titulo", "🎭 Paso 6: Abrir Modo Teatro"),
        getInstruccion: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                if (subEtapaZenTeatro === 0) {
                    return getTourText("tour-paso6-zen-menu", "¡Excelente! Ahora conozcamos el Modo Teatro, ideal para asignar distintas voces a los personajes de una obra o novela.<br><br>👉 Haz clic en el <b>Menú Principal (☰)</b>.");
                } else {
                    return getTourText("tour-paso6-zen-teatro", "Haz clic en el botón <b>'Teatro'</b> iluminado en azul.");
                }
            }
            return getTourText("tour-paso6-instruccion", "¡Excelente! Ahora conozcamos el Modo Teatro, ideal para asignar distintas voces a los personajes de una obra o novela.<br><br>👉 Haz clic en el botón <b>'Teatro'</b> iluminado en azul.");
        },
        getDetalleExtra: () => getTourText("tour-paso6-detalle", "Permite asignar una voz diferente a cada personaje de un cuento, novela o guión teatral para que LiraLoud alterne las voces automáticamente."),
        accionCondicional: (siguiente) => {
            // Pantalla oscura durante el paso de abrir el menú y el botón de Modo Teatro
            document.body.classList.remove('tour-paso-lectura');
            document.body.classList.remove('tour-teatro-abierto');

            cargarDemoTeatro();
            asegurarEstadoTeatroTutorial(false, true);
            const inpPersonaje = document.getElementById('input-personaje');
            if (inpPersonaje) inpPersonaje.value = "";

            const esMinimalista = document.body.classList.contains('modo-minimalista');

            if (esMinimalista) {
                document.body.classList.add('tour-activo-zen-menu');
                if (subEtapaZenTeatro === 0) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    if (btnZenMenu) {
                        targetCondicionalActivo = btnZenMenu;
                        listenerCondicionalActivo = () => {
                            setTimeout(() => {
                                subEtapaZenTeatro = 1;
                                renderizarPasoTour();
                            }, 180);
                        };
                        btnZenMenu.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                } else {
                    const btnZenTeatro = document.getElementById('btn-zen-teatro') ||
                                         document.querySelector('#zen-panel-menu button[onclick*="abrirTeatro"]');
                    if (btnZenTeatro) {
                        targetCondicionalActivo = btnZenTeatro;
                        listenerCondicionalActivo = () => {
                            document.body.classList.remove('tour-activo-zen-menu');
                            setTimeout(() => siguiente(), 60);
                        };
                        btnZenTeatro.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                }
            } else {
                const btn = document.getElementById('btn-teatro');
                if (btn) {
                    targetCondicionalActivo = btn;
                    listenerCondicionalActivo = () => {
                        setTimeout(() => siguiente(), 60);
                    };
                    btn.addEventListener('click', listenerCondicionalActivo, { once: true });
                }
            }
        }
    },
    {
        id: "paso_9b_explicar_dos_puntos",
        getTargets: () => {
            const inp = document.getElementById('input-personaje');
            const panel = document.getElementById('panel-teatro');
            return inp ? [inp] : (panel ? [panel] : []);
        },
        posicion: "right-panel",
        getTitulo: () => getTourText("tour-paso6-1-titulo", "🎯 Paso 6.1: Capturar Personaje en Pantalla"),
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TEATRO_POR_IDIOMA[langIso] || DEMO_TEATRO_POR_IDIOMA.es;
            return getTourText("tour-paso6-1-instruccion", `El Modo Teatro te permite cambiar la voz conforme lees para que LiraLoud detecte automáticamente un cambio de voz cuando un nombre va seguido de dos puntos (<code>:</code>). Para escoger el cambio de voces, haz clic sobre <code>${cfg.actorEjemplo}</code> en el documento para capturarlo.`, cfg);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TEATRO_POR_IDIOMA[langIso] || DEMO_TEATRO_POR_IDIOMA.es;
            return getTourText("tour-paso6-1-detalle", `💡 <i>Nota cómo <b>${cfg.actorPreRegistrado}</b> ya está registrado en tu elenco. LiraLoud usa los dos puntos (<code>:</code>) como disparador para cambiar de voz automáticamente.</i>`, cfg);
        },
        botonDemoExtra: {
            getTexto: () => {
                const langIso = detectarIdiomaTutorialActivo();
                const cfg = DEMO_TEATRO_POR_IDIOMA[langIso] || DEMO_TEATRO_POR_IDIOMA.es;
                return getTourText("tour-paso6-1-btn-auto", `⚡ Capturar "${cfg.actorEjemplo}" automáticamente`, cfg);
            },
            accion: () => {
                const langIso = detectarIdiomaTutorialActivo();
                const cfg = DEMO_TEATRO_POR_IDIOMA[langIso] || DEMO_TEATRO_POR_IDIOMA.es;
                const inp = document.getElementById('input-personaje');
                if (inp) {
                    inp.value = cfg.actorEjemplo;
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        },
        accionCondicional: (siguiente) => {
            cargarDemoTeatro();
            // Al pedirle al usuario que pique en la pantalla al personaje, el texto se vuelve claro y el panel de teatro permanece nítido sin opacarse
            document.body.classList.add('tour-paso-lectura');
            document.body.classList.add('tour-teatro-abierto');

            const modalTeatro = document.getElementById('modal-teatro');
            if (modalTeatro && modalTeatro.style.display !== 'flex') {
                if (typeof abrirTeatro === 'function') abrirTeatro();
                else modalTeatro.style.display = 'flex';
            }

            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TEATRO_POR_IDIOMA[langIso] || DEMO_TEATRO_POR_IDIOMA.es;

            // Pre-registrar al Narrador y eliminar a Elena si existía de una prueba previa
            asegurarEstadoTeatroTutorial(false, true);

            const inpPersonaje = document.getElementById('input-personaje');
            const valPrevio = (inpPersonaje?.value || '').trim().replace(/[:.,;]/g, '').toLowerCase();
            const yaTienePersonaje = (valPrevio === cfg.actorEjemploSinDosPuntos.toLowerCase());
            if (!yaTienePersonaje && inpPersonaje) {
                inpPersonaje.value = "";
            }

            // Posicionar el ratón animado apuntando al personaje en el lienzo PDF
            const posicionarHintPersonaje = () => {
                if (!datosPagina || !datosPagina.palabras) return;
                const targetW = datosPagina.palabras.find(p =>
                    p.texto.replace(/[:.,;]/g, '').toLowerCase() === cfg.actorEjemploSinDosPuntos.toLowerCase()
                ) || datosPagina.palabras[0];
                if (targetW && targetW.bbox) {
                    const midX = (targetW.bbox[0] + targetW.bbox[2]) / 2;
                    const topY = targetW.bbox[1];
                    posicionarMouseHintEnCoordenadas(
                        midX,
                        topY,
                        getTourText("tour-paso6-1-badge-mouse", `🖱️ Clic en '${cfg.actorEjemplo}' para capturar`, cfg),
                        'izquierdo'
                    );
                }
            };
            setTimeoutTutorial(posicionarHintPersonaje, 100);

            let completado = false;
            if (intervalPaso6) clearInterval(intervalPaso6);
            intervalPaso6 = setInterval(() => {
                if (!window.tutorialActivo || PASOS_TOUR_GUI[window.tutorialPasoActual]?.id !== 'paso_9b_explicar_dos_puntos') {
                    clearInterval(intervalPaso6);
                    intervalPaso6 = null;
                    return;
                }
                const val = (document.getElementById('input-personaje')?.value || '').trim();
                const limpio = val.replace(/[:.,;]/g, '').toLowerCase();
                if (!completado && limpio === cfg.actorEjemploSinDosPuntos.toLowerCase()) {
                    completado = true;
                    clearInterval(intervalPaso6);
                    intervalPaso6 = null;
                    removerMouseHintPaso3();
                    setTimeout(() => siguiente(), 120);
                }
            }, 80);
        }
    },
    {
        id: "paso_9c_asignar_voz_teatro",
        getTargets: () => {
            if (subEtapaPaso9c === 0) {
                const selVoz = document.getElementById('select-voz-teatro');
                const btnGuardar = document.querySelector('.btn-guardar-actor');
                if (selVoz && btnGuardar) return [selVoz, btnGuardar];
                return btnGuardar ? [btnGuardar] : (selVoz ? [selVoz] : []);
            } else {
                const chkGlobal = document.getElementById('chk-teatro-global');
                const btnCerrar = document.querySelector('#modal-teatro .btn-cerrar-x');
                const btnListo = document.querySelector('.btn-listo-teatro');
                const targets = [];
                if (chkGlobal) targets.push(chkGlobal);
                if (btnListo) targets.push(btnListo);
                if (btnCerrar) targets.push(btnCerrar);
                return targets;
            }
        },
        posicion: "right-panel",
        getTitulo: () => {
            if (subEtapaPaso9c === 0) {
                return getTourText("tour-paso6-2-titulo", "🎙️ Paso 6.2: Elegir Voz y Guardar Personaje");
            }
            return getTourText("tour-paso6-2-titulo-b", "✅ ¡Personaje Guardado! Cierra el Panel");
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TEATRO_POR_IDIOMA[langIso] || DEMO_TEATRO_POR_IDIOMA.es;
            if (subEtapaPaso9c === 0) {
                return getTourText("tour-paso6-2-instruccion", `Elige una voz diferente para <code>${cfg.actorEjemploSinDosPuntos}</code> en el selector y pulsa <b>'Agregar'</b> (<b>'Guardar Personaje'</b>) para integrarlo al elenco.`, cfg);
            }
            return getTourText("tour-paso6-2-instruccion-b", `¡Listo! Ahora haz clic en <b>'Listo'</b> o en la <b>'✕'</b> para ir a la prueba final.`);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TEATRO_POR_IDIOMA[langIso] || DEMO_TEATRO_POR_IDIOMA.es;
            if (subEtapaPaso9c === 0) {
                return getTourText("tour-paso6-2-detalle", "💡 <i>Al pulsar 'Guardar Personaje', LiraLoud vincula ese nombre terminado en dos puntos (:) con la voz elegida.</i>");
            }
            return `<div style="line-height:1.45;">
                <b>🎭 Elenco Activo Listo:</b><br>
                🗣️ <b>${cfg.actorPreRegistrado}</b> ➔ Voz 1 (Narración)<br>
                🗣️ <b>${cfg.actorEjemplo}</b> ➔ Voz 2 (Personaje)<br>
                ✨ <i>LiraLoud ocultará el nombre en el audio y cambiará de actor automáticamente.</i>
            </div>`;
        },
        accionCondicional: (siguiente) => {
            removerMouseHintPaso3();
            document.body.classList.add('tour-paso-lectura');
            document.body.classList.add('tour-teatro-abierto');

            const modalTeatro = document.getElementById('modal-teatro');
            if (subEtapaPaso9c === 0 && modalTeatro && modalTeatro.style.display !== 'flex') {
                if (typeof abrirTeatro === 'function') abrirTeatro();
                else modalTeatro.style.display = 'flex';
            }

            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TEATRO_POR_IDIOMA[langIso] || DEMO_TEATRO_POR_IDIOMA.es;
            const { vozNarrador, vozPersonaje } = obtenerParVocesTeatroTutorial(langIso);

            if (subEtapaPaso9c === 0) {
                asegurarEstadoTeatroTutorial(false, true);

                const inpPersonaje = document.getElementById('input-personaje');
                if (inpPersonaje && inpPersonaje.value !== cfg.actorEjemplo) {
                    inpPersonaje.value = cfg.actorEjemplo;
                }

                const selVoz = document.getElementById('select-voz-teatro');
                if (selVoz && vozPersonaje) {
                    selVoz.value = vozPersonaje;
                }

                const btnGuardar = document.querySelector('.btn-guardar-actor');
                if (btnGuardar) {
                    targetCondicionalActivo = btnGuardar;
                    listenerCondicionalActivo = () => {
                        if (inpPersonaje) inpPersonaje.value = cfg.actorEjemplo;
                        setTimeout(() => {
                            asegurarEstadoTeatroTutorial(true, false);
                            subEtapaPaso9c = 1;
                            renderizarPasoTour();
                        }, 150);
                    };
                    btnGuardar.addEventListener('click', listenerCondicionalActivo, { once: true });
                }

                // Si el usuario cierra directamente el modal en subEtapa 0, la máquina guarda el personaje automáticamente
                const btnCerrarDirecto = document.querySelector('#modal-teatro .btn-cerrar-x');
                const btnListoDirecto = document.querySelector('.btn-listo-teatro');
                const onCerrarDirecto = () => {
                    if (subEtapaPaso9c === 0 && window.tutorialActivo && PASOS_TOUR_GUI[window.tutorialPasoActual]?.id === 'paso_9c_asignar_voz_teatro') {
                        asegurarEstadoTeatroTutorial(true, false);
                        const mTeatro = document.getElementById('modal-teatro');
                        if (mTeatro) mTeatro.style.display = 'none';
                        setTimeout(() => siguiente(), 150);
                    }
                };
                if (btnCerrarDirecto) btnCerrarDirecto.addEventListener('click', onCerrarDirecto, { once: true });
                if (btnListoDirecto) btnListoDirecto.addEventListener('click', onCerrarDirecto, { once: true });
            } else {
                asegurarEstadoTeatroTutorial(true, false);
                const btnListo = document.querySelector('.btn-listo-teatro');
                const btnCerrar = document.querySelector('#modal-teatro .btn-cerrar-x');
                let yaCerrado = false;
                const avanzar = () => {
                    if (yaCerrado) return;
                    yaCerrado = true;
                    asegurarEstadoTeatroTutorial(true, false);
                    const mTeatro = document.getElementById('modal-teatro');
                    if (mTeatro) mTeatro.style.display = 'none';
                    setTimeout(() => siguiente(), 100);
                };
                if (btnListo) {
                    targetCondicionalActivo = btnListo;
                    listenerCondicionalActivo = avanzar;
                    btnListo.addEventListener('click', listenerCondicionalActivo, { once: true });
                }
                if (btnCerrar) {
                    btnCerrar.addEventListener('click', avanzar, { once: true });
                }
                if (modalTeatro && modalTeatro.style.display === 'none') {
                    avanzar();
                } else if (modalTeatro) {
                    const onOverlayClick = (e) => {
                        if (e.target === modalTeatro) {
                            setTimeout(avanzar, 50);
                        }
                    };
                    modalTeatro.addEventListener('click', onOverlayClick, { once: true });
                }
            }
        }
    },
    {
        id: "paso_9d_probar_teatro",
        targetSelector: "#visor-container",
        posicion: "top-right",
        sinSpotlightAnim: true,
        getTitulo: () => getTourText("tour-paso6-3-titulo", "🔊 Paso 6.3: Prueba Final en Modo Teatro"),
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TEATRO_POR_IDIOMA[langIso] || DEMO_TEATRO_POR_IDIOMA.es;
            return getTourText("tour-paso6-3-instruccion", `Ahora haz clic en el primer diálogo del documento y escucha cómo LiraLoud alterna automáticamente las voces entre el Narrador y <code>${cfg.actorEjemploSinDosPuntos}</code>.`, cfg);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TEATRO_POR_IDIOMA[langIso] || DEMO_TEATRO_POR_IDIOMA.es;
            return `<div style="line-height:1.45;">
                🎬 <b>Línea 1 (${cfg.actorPreRegistrado}):</b> <i>"${cfg.lineas[0].replace(/^[^:]+:\s*/, '')}"</i><br>
                🎭 <b>Línea 2 (${cfg.actorEjemplo}):</b> <span style="color:#38bdf8; font-weight:600;">"${cfg.lineas[1].replace(/^[^:]+:\s*/, '')}"</span>
            </div>`;
        },
        accionCondicional: (siguiente) => {
            const modalTeatro = document.getElementById('modal-teatro');
            if (modalTeatro) modalTeatro.style.display = 'none';
            document.body.classList.remove('tour-teatro-abierto');
            document.body.classList.add('tour-paso-lectura');

            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TEATRO_POR_IDIOMA[langIso] || DEMO_TEATRO_POR_IDIOMA.es;

            // La máquina garantiza que los dos actores y chk-teatro-global estén activos
            asegurarEstadoTeatroTutorial(true, false);
            cargarDemoTeatro();

            setTimeoutTutorial(() => {
                cargarDemoTeatro();
                if (datosPagina && datosPagina.palabras && datosPagina.palabras[0]) {
                    // Apuntar a la primera palabra hablada después de "Narrador:" o al inicio de la primera línea
                    const firstW = datosPagina.palabras[1] || datosPagina.palabras[0];
                    const midX = (firstW.bbox[0] + firstW.bbox[2]) / 2;
                    const topY = firstW.bbox[1];
                    posicionarMouseHintEnCoordenadas(
                        midX,
                        topY,
                        getTourText("tour-paso6-3-badge-mouse", "🖱️ Clic aquí para probar las voces del elenco"),
                        'izquierdo'
                    );
                }
            }, 60);

            let empezoLectura = false;
            let vioSegundaOracion = false;
            let ticksLeyendo = 0;
            let ticksSilencio = 0;
            let completado = false;

            const isReproduciendo = () => {
                return (typeof leyendo !== 'undefined' && leyendo) ||
                       (typeof isPlayingPiper !== 'undefined' && isPlayingPiper) ||
                       (typeof window.palabraKaraoke !== 'undefined' && window.palabraKaraoke !== null);
            };

            if (intervalPaso6) clearInterval(intervalPaso6);
            intervalPaso6 = setInterval(() => {
                if (!window.tutorialActivo || PASOS_TOUR_GUI[window.tutorialPasoActual]?.id !== 'paso_9d_probar_teatro') {
                    clearInterval(intervalPaso6);
                    intervalPaso6 = null;
                    return;
                }

                if (!isReproduciendo() && (!datosPagina || !datosPagina.oraciones || !datosPagina.oraciones[0])) {
                    cargarDemoTeatro();
                }

                if (isReproduciendo()) {
                    if (!empezoLectura) {
                        empezoLectura = true;
                        removerMouseHintPaso3();
                    }
                    if (typeof indiceOracion !== 'undefined' && indiceOracion >= 1) {
                        vioSegundaOracion = true;
                    }
                    const bodyEl = document.getElementById('tour-card-body');
                    if (bodyEl) {
                        const speechBubble = bodyEl.querySelector('.tutorial-speech-bubble');
                        if (speechBubble) {
                            const actorActual = (typeof indiceOracion !== 'undefined' && indiceOracion >= 1) ? cfg.actorEjemplo : cfg.actorPreRegistrado;
                            speechBubble.innerHTML = `<span style="color:#38bdf8; font-weight:bold;">🎭 ¡Modo Teatro en acción!</span><br>🎙️ <b>Hablando ahora:</b> <code>${actorActual}</code><br>✨ <i>Nota cómo el cambio de voz ocurre automáticamente al detectar los dos puntos (:).</i>`;
                        }
                    }
                    ticksLeyendo++;
                    ticksSilencio = 0;
                } else if (empezoLectura && ticksLeyendo >= 4) {
                    ticksSilencio++;
                    // Esperamos un margen cómodo por si está en la transición entre la oración 0 y la oración 1
                    const umbralSilencio = vioSegundaOracion ? 3 : 6;
                    if (ticksSilencio >= umbralSilencio && !completado) {
                        completado = true;
                        clearInterval(intervalPaso6);
                        intervalPaso6 = null;
                        removerMouseHintPaso3();
                        setTimeout(() => siguiente(), 500);
                    }
                }
            }, 200);
        }
    }
];
window.PASOS_LECTURA = PASOS_LECTURA;
