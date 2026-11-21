/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// ============================================================================
// TUTORIAL — PASOS DE HERRAMIENTAS (FASES 5–6)
// ============================================================================

const PASOS_HERRAMIENTAS = [
    // ------------------------------------------------------------------------
    // FASE 5: ASISTENTE LIRA AI (TOUR INFORMATIVO GUIADO)
    // ------------------------------------------------------------------------
    {
        id: "paso_10a_abrir_ia",
        getTargets: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                if (subEtapaZenIA === 0) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    return btnZenMenu ? [btnZenMenu] : [];
                } else {
                    const btnZenIA = document.getElementById('btn-zen-ia') ||
                                     document.querySelector('#zen-panel-menu button[onclick*="abrirModalIA"]');
                    return btnZenIA ? [btnZenIA] : [];
                }
            } else {
                const btn = document.getElementById('btn-ia');
                return btn ? [btn] : [];
            }
        },
        posicion: "adaptable-paso-1",
        getTitulo: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista && subEtapaZenIA === 0) {
                return getTourText("tour-paso7-1-titulo-zen", "✨ Paso 7.1: Abrir Menú de Herramientas");
            }
            return getTourText("tour-paso7-1-titulo", "✨ Paso 7.1: Abrir Lira AI");
        },
        getInstruccion: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                if (subEtapaZenIA === 0) {
                    return getTourText("tour-paso7-1-inst-zen-menu", "Pasemos a Lira AI, tu asistente de inteligencia artificial integrado. Haz clic en el <b>Menú Principal (☰)</b>.");
                } else {
                    return getTourText("tour-paso7-1-inst-zen-ia", "Ahora haz clic en el botón de <b>'Lira AI'</b> remarcado en azul para abrirlo.");
                }
            }
            return getTourText("tour-paso7-1-inst-normal", "Pasemos a Lira AI, tu asistente de inteligencia artificial integrado. Haz clic en el botón de <b>'Lira AI'</b> remarcado en azul para abrirlo.");
        },
        getDetalleExtra: () => getTourText("tour-paso7-1-detalle", "💡 <i>Lira AI te permite consultar dudas, resumir conceptos y analizar el texto con citas exactas o modelos locales sin internet.</i>"),
        accionCondicional: (siguiente) => {
            // Durante la apertura de IA la pantalla permanece opacada hasta ver el panel abierto
            document.body.classList.remove('tour-paso-lectura');
            document.body.classList.remove('tour-ia-abierto');

            const modalTeatro = document.getElementById('modal-teatro');
            if (modalTeatro) modalTeatro.style.display = 'none';
            const modalDicc = document.getElementById('modal-diccionario');
            if (modalDicc) modalDicc.style.display = 'none';

            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                const panelMenu = document.getElementById('zen-panel-menu');
                if (subEtapaZenIA === 1 && panelMenu) {
                    panelMenu.classList.add('zen-active');
                    panelMenu.style.display = 'flex';
                    document.body.classList.add('tour-activo-zen-menu');
                } else {
                    document.body.classList.remove('tour-activo-zen-menu');
                }

                if (subEtapaZenIA === 0) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    if (btnZenMenu) {
                        targetCondicionalActivo = btnZenMenu;
                        listenerCondicionalActivo = () => {
                            setTimeout(() => {
                                subEtapaZenIA = 1;
                                renderizarPasoTour();
                            }, 180);
                        };
                        btnZenMenu.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                } else {
                    const btnZenIA = document.getElementById('btn-zen-ia') ||
                                     document.querySelector('#zen-panel-menu button[onclick*="abrirModalIA"]');
                    if (btnZenIA) {
                        targetCondicionalActivo = btnZenIA;
                        listenerCondicionalActivo = () => {
                            document.body.classList.remove('tour-activo-zen-menu');
                            if (typeof abrirModalIA === 'function') abrirModalIA();
                            setTimeout(() => siguiente(), 200);
                        };
                        btnZenIA.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                }
            } else {
                const btn = document.getElementById('btn-ia');
                if (btn) {
                    targetCondicionalActivo = btn;
                    listenerCondicionalActivo = () => {
                        if (typeof abrirModalIA === 'function') abrirModalIA();
                        setTimeout(() => siguiente(), 200);
                    };
                    btn.addEventListener('click', listenerCondicionalActivo, { once: true });
                }
            }
        }
    },
    {
        id: "paso_10b_chat_ia",
        getTargets: () => {
            const tab = document.getElementById('btn-tab-chat');
            const selModo = document.getElementById('sel-ia-modo-salida');
            const inputChat = document.getElementById('ia-chat-input');
            const targets = [];
            if (tab) targets.push(tab);
            if (selModo) targets.push(selModo);
            if (inputChat) targets.push(inputChat);
            return targets;
        },
        posicion: "right-panel",
        autoAvanzarTrasLectura: true,
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_IA_POR_IDIOMA[langIso] || DEMO_IA_POR_IDIOMA.es;
            return getTourText("tour-paso7-2-titulo", cfg.chatTitulo);
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_IA_POR_IDIOMA[langIso] || DEMO_IA_POR_IDIOMA.es;
            return getTourText("tour-paso7-2-instruccion", cfg.chatInstruccion);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_IA_POR_IDIOMA[langIso] || DEMO_IA_POR_IDIOMA.es;
            return getTourText("tour-paso7-2-detalle", cfg.chatDetalle);
        },
        accionCondicional: (siguiente) => {
            document.body.classList.add('tour-ia-abierto');
            const modalIA = document.getElementById('modal-ia');
            if (modalIA && modalIA.style.display !== 'flex') {
                if (typeof abrirModalIA === 'function') abrirModalIA();
                else modalIA.style.display = 'flex';
            }
            if (typeof cambiarTabIA === 'function') cambiarTabIA('chat');
        }
    },
    {
        id: "paso_10c_solicitudes_ia",
        getTargets: () => {
            const tab = document.getElementById('btn-tab-solicitudes');
            const grid = document.querySelector('.ia-grid-solicitudes');
            const targets = [];
            if (tab) targets.push(tab);
            if (grid) targets.push(grid);
            return targets;
        },
        posicion: "right-panel",
        autoAvanzarTrasLectura: true,
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_IA_POR_IDIOMA[langIso] || DEMO_IA_POR_IDIOMA.es;
            return getTourText("tour-paso7-3-titulo", cfg.solicitudesTitulo);
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_IA_POR_IDIOMA[langIso] || DEMO_IA_POR_IDIOMA.es;
            return getTourText("tour-paso7-3-instruccion", cfg.solicitudesInstruccion);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_IA_POR_IDIOMA[langIso] || DEMO_IA_POR_IDIOMA.es;
            return getTourText("tour-paso7-3-detalle", cfg.solicitudesDetalle);
        },
        accionCondicional: (siguiente) => {
            document.body.classList.add('tour-ia-abierto');
            const modalIA = document.getElementById('modal-ia');
            if (modalIA && modalIA.style.display !== 'flex') {
                if (typeof abrirModalIA === 'function') abrirModalIA();
                else modalIA.style.display = 'flex';
            }
            if (typeof cambiarTabIA === 'function') cambiarTabIA('solicitudes');
        }
    },
    {
        id: "paso_10d_fuentes_ia",
        getTargets: () => {
            const tab = document.getElementById('btn-tab-fuentes');
            const chkPdf = document.getElementById('chk-ia-fuente-pdf');
            const chkSub = document.getElementById('chk-ia-fuente-subrayados');
            const chkNotas = document.getElementById('chk-ia-fuente-notas');
            const targets = [];
            if (tab) targets.push(tab);
            if (chkPdf) targets.push(chkPdf);
            if (chkSub) targets.push(chkSub);
            if (chkNotas) targets.push(chkNotas);
            return targets;
        },
        posicion: "right-panel",
        autoAvanzarTrasLectura: true,
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_IA_POR_IDIOMA[langIso] || DEMO_IA_POR_IDIOMA.es;
            return getTourText("tour-paso7-4-titulo", cfg.fuentesTitulo);
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_IA_POR_IDIOMA[langIso] || DEMO_IA_POR_IDIOMA.es;
            return getTourText("tour-paso7-4-instruccion", cfg.fuentesInstruccion);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_IA_POR_IDIOMA[langIso] || DEMO_IA_POR_IDIOMA.es;
            return getTourText("tour-paso7-4-detalle", cfg.fuentesDetalle);
        },
        accionCondicional: (siguiente) => {
            document.body.classList.add('tour-ia-abierto');
            const modalIA = document.getElementById('modal-ia');
            if (modalIA && modalIA.style.display !== 'flex') {
                if (typeof abrirModalIA === 'function') abrirModalIA();
                else modalIA.style.display = 'flex';
            }
            if (typeof cambiarTabIA === 'function') cambiarTabIA('fuentes');
        }
    },
    {
        id: "paso_10e_modelos_ia",
        getTargets: () => {
            const tab = document.getElementById('btn-tab-config');
            const selProv = document.getElementById('sel-ia-proveedor');
            const btnCerrar = document.querySelector('.btn-cerrar-ia');
            const targets = [];
            if (tab) targets.push(tab);
            if (selProv) targets.push(selProv);
            if (btnCerrar) targets.push(btnCerrar);
            return targets;
        },
        posicion: "right-panel",
        autoAvanzarTrasLectura: false,
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_IA_POR_IDIOMA[langIso] || DEMO_IA_POR_IDIOMA.es;
            return getTourText("tour-paso7-5-titulo", cfg.modelosTitulo);
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_IA_POR_IDIOMA[langIso] || DEMO_IA_POR_IDIOMA.es;
            return getTourText("tour-paso7-5-instruccion", cfg.modelosInstruccion);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_IA_POR_IDIOMA[langIso] || DEMO_IA_POR_IDIOMA.es;
            return getTourText("tour-paso7-5-detalle", cfg.modelosDetalle);
        },
        accionCondicional: (siguiente) => {
            document.body.classList.add('tour-ia-abierto');
            const modalIA = document.getElementById('modal-ia');
            if (modalIA && modalIA.style.display !== 'flex') {
                if (typeof abrirModalIA === 'function') abrirModalIA();
                else modalIA.style.display = 'flex';
            }
            if (typeof cambiarTabIA === 'function') cambiarTabIA('config');

            const btnCerrar = document.querySelector('.btn-cerrar-ia');
            let yaAvanzo = false;
            const avanzarPaso = () => {
                if (yaAvanzo) return;
                yaAvanzo = true;
                if (typeof cerrarModalIA === 'function') cerrarModalIA();
                else if (modalIA) modalIA.style.display = 'none';
                document.body.classList.remove('tour-ia-abierto');
                setTimeout(() => siguiente(), 100);
            };

            if (btnCerrar) {
                targetCondicionalActivo = btnCerrar;
                listenerCondicionalActivo = avanzarPaso;
                btnCerrar.addEventListener('click', listenerCondicionalActivo, { once: true });
            }
            if (modalIA && modalIA.style.display === 'none') {
                avanzarPaso();
            } else if (modalIA) {
                const onOverlayClick = (e) => {
                    if (e.target === modalIA) {
                        setTimeout(avanzarPaso, 50);
                    }
                };
                modalIA.addEventListener('click', onOverlayClick, { once: true });
            }
        }
    },

    // ------------------------------------------------------------------------
    // FASE 8: TRADUCTOR EN TIEMPO REAL
    // ------------------------------------------------------------------------
    {
        id: "paso_10f_abrir_traductor",
        getTargets: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                if (subEtapaZenTraductor === 0) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    return btnZenMenu ? [btnZenMenu] : [];
                } else {
                    const detZen = document.getElementById('zen-details-traduccion');
                    const sumZen = detZen ? detZen.querySelector('summary') : null;
                    return sumZen ? [sumZen] : (detZen ? [detZen] : []);
                }
            } else {
                const detMain = document.getElementById('details-traduccion-main');
                const sumMain = detMain ? detMain.querySelector('summary') : null;
                return sumMain ? [sumMain] : (detMain ? [detMain] : []);
            }
        },
        posicion: "adaptable-paso-1",
        getTitulo: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            if (esMinimalista && subEtapaZenTraductor === 0) {
                return getTourText("tour-traductor-titulo-zen-menu", "✨ Paso 8.1: Abrir Menú Zen");
            }
            return getTourText("tour-traductor-titulo", cfg.tituloPaso1);
        },
        getInstruccion: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            if (esMinimalista) {
                if (subEtapaZenTraductor === 0) {
                    return getTourText("tour-traductor-inst-zen-menu", cfg.instPaso1ZenMenu);
                } else {
                    return getTourText("tour-traductor-inst-zen-trad", cfg.instPaso1ZenTrad);
                }
            }
            return getTourText("tour-traductor-inst-normal", cfg.instPaso1Normal);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return cfg.detallePaso1;
        },
        accionCondicional: (siguiente) => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;

            let completado = false;
            const finalizarPaso = () => {
                if (completado) return;
                completado = true;
                const detMain = document.getElementById('details-traduccion-main');
                if (detMain) detMain.open = true;
                const detZen = document.getElementById('zen-details-traduccion');
                if (detZen) detZen.open = true;
                document.body.classList.add('tour-traductor-abierto');
                configurarTraduccionTutorial(true, cfg.origen, cfg.destino, 'solo_traduccion');
                setTimeout(() => siguiente(), 150);
            };

            if (esMinimalista && subEtapaZenTraductor === 0) {
                document.body.classList.add('tour-activo-zen-menu');
                const btnZenMenu = document.getElementById('btn-zen-menu');
                if (btnZenMenu) {
                    targetCondicionalActivo = btnZenMenu;
                    listenerCondicionalActivo = () => {
                        setTimeout(() => {
                            subEtapaZenTraductor = 1;
                            renderizarPasoTour();
                        }, 180);
                    };
                    btnZenMenu.addEventListener('click', listenerCondicionalActivo, { once: true });
                }
            } else if (esMinimalista && subEtapaZenTraductor === 1) {
                document.body.classList.remove('tour-activo-zen-menu');
                const detZen = document.getElementById('zen-details-traduccion');
                const sumZen = detZen ? detZen.querySelector('summary') : null;
                if (sumZen) {
                    targetCondicionalActivo = sumZen;
                    listenerCondicionalActivo = () => {
                        setTimeout(() => {
                            if (detZen) detZen.open = true;
                            finalizarPaso();
                        }, 150);
                    };
                    sumZen.addEventListener('click', listenerCondicionalActivo, { once: true });
                } else {
                    finalizarPaso();
                }
            } else {
                const detMain = document.getElementById('details-traduccion-main');
                const sumMain = detMain ? detMain.querySelector('summary') : null;
                if (sumMain) {
                    targetCondicionalActivo = sumMain;
                    listenerCondicionalActivo = () => {
                        setTimeout(() => {
                            if (detMain) detMain.open = true;
                            finalizarPaso();
                        }, 150);
                    };
                    sumMain.addEventListener('click', listenerCondicionalActivo, { once: true });
                } else {
                    finalizarPaso();
                }
            }
        }
    },
    {
        id: "paso_10g_trad_activar",
        getTargets: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                const el = document.getElementById('zen-chk-traduccion-activa');
                return el ? [el.closest('div') || el] : [];
            } else {
                const el = document.getElementById('main-chk-traduccion-activa');
                return el ? [el.closest('div') || el] : [];
            }
        },
        posicion: "adaptable-paso-1",
        autoAvanzarTrasLectura: true,
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return getTourText("tour-traductor-activar-titulo", cfg.tituloActivar);
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return getTourText("tour-traductor-activar-inst", cfg.instActivar);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return cfg.detalleActivar;
        },
        accionCondicional: (siguiente) => {
            document.body.classList.add('tour-traductor-abierto');
            const detMain = document.getElementById('details-traduccion-main');
            if (detMain) detMain.open = true;
            const detZen = document.getElementById('zen-details-traduccion');
            if (detZen) detZen.open = true;
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            configurarTraduccionTutorial(true, cfg.origen, cfg.destino, 'solo_traduccion');
        }
    },
    {
        id: "paso_10h_trad_origen",
        getTargets: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                const el = document.getElementById('zen-sel-traduccion-origen');
                return el ? [el.closest('div') || el] : [];
            } else {
                const el = document.getElementById('main-sel-traduccion-origen');
                return el ? [el.closest('div') || el] : [];
            }
        },
        posicion: "adaptable-paso-1",
        autoAvanzarTrasLectura: true,
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return getTourText("tour-traductor-origen-titulo", cfg.tituloOrigen);
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return getTourText("tour-traductor-origen-inst", cfg.instOrigen);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return cfg.detalleOrigen;
        },
        accionCondicional: (siguiente) => {
            document.body.classList.add('tour-traductor-abierto');
            const detMain = document.getElementById('details-traduccion-main');
            if (detMain) detMain.open = true;
            const detZen = document.getElementById('zen-details-traduccion');
            if (detZen) detZen.open = true;
        }
    },
    {
        id: "paso_10i_trad_destino",
        getTargets: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                const el = document.getElementById('zen-sel-traduccion-destino');
                return el ? [el.closest('div') || el] : [];
            } else {
                const el = document.getElementById('main-sel-traduccion-destino');
                return el ? [el.closest('div') || el] : [];
            }
        },
        posicion: "adaptable-paso-1",
        autoAvanzarTrasLectura: true,
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return getTourText("tour-traductor-destino-titulo", cfg.tituloDestino);
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return getTourText("tour-traductor-destino-inst", cfg.instDestino);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return cfg.detalleDestino;
        },
        accionCondicional: (siguiente) => {
            document.body.classList.add('tour-traductor-abierto');
            const detMain = document.getElementById('details-traduccion-main');
            if (detMain) detMain.open = true;
            const detZen = document.getElementById('zen-details-traduccion');
            if (detZen) detZen.open = true;
        }
    },
    {
        id: "paso_10j_trad_modos",
        getTargets: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                const el = document.getElementById('zen-sel-traduccion-modo');
                return el ? [el.closest('div') || el] : [];
            } else {
                const el = document.getElementById('main-sel-traduccion-modo');
                return el ? [el.closest('div') || el] : [];
            }
        },
        posicion: "adaptable-paso-1",
        autoAvanzarTrasLectura: true,
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return getTourText("tour-traductor-modos-titulo", cfg.tituloModos);
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return getTourText("tour-traductor-modos-inst", cfg.instModos);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return cfg.detalleModos;
        },
        accionCondicional: (siguiente) => {
            document.body.classList.add('tour-traductor-abierto');
            const detMain = document.getElementById('details-traduccion-main');
            if (detMain) detMain.open = true;
            const detZen = document.getElementById('zen-details-traduccion');
            if (detZen) detZen.open = true;
        }
    },
    {
        id: "paso_10k_probar_traductor",
        targetSelector: "#visor-container",
        posicion: "top-right",
        sinSpotlightAnim: true,
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return getTourText("tour-traductor-demo-titulo", cfg.tituloPaso2);
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return getTourText("tour-traductor-demo-instruccion", cfg.instPaso2);
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;
            return `<div style="line-height:1.45;">
                <div style="margin-bottom:8px;">${cfg.detallePaso2}</div>
                <button id="btn-tour-probar-traduccion" class="btn-tour-accion" style="margin-top:6px; width:100%; background:linear-gradient(135deg, #0284c7, #2563eb); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                    ${cfg.btnDemo}
                </button>
            </div>`;
        },
        accionCondicional: (siguiente) => {
            document.body.classList.remove('tour-traductor-abierto');
            const detMain = document.getElementById('details-traduccion-main');
            if (detMain) detMain.open = false;
            const detZen = document.getElementById('zen-details-traduccion');
            if (detZen) detZen.open = false;
            const pMenu = document.getElementById('zen-panel-menu');
            if (pMenu && !window.tutorialActivo) {
                pMenu.classList.remove('zen-active');
                pMenu.style.display = 'none';
            }
            document.body.classList.remove('tour-ia-abierto');
            document.body.classList.add('tour-paso-lectura');

            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_TRADUCCION_POR_IDIOMA[langIso] || DEMO_TRADUCCION_POR_IDIOMA.es;

            cargarDemoTraduccion();

            setTimeoutTutorial(() => {
                cargarDemoTraduccion();
                if (datosPagina && datosPagina.palabras && datosPagina.palabras[0]) {
                    const firstW = datosPagina.palabras[0];
                    const midX = (firstW.bbox[0] + firstW.bbox[2]) / 2;
                    const topY = firstW.bbox[1];
                    posicionarMouseHintEnCoordenadas(
                        midX,
                        topY,
                        cfg.badgeMouse,
                        'izquierdo'
                    );
                }
            }, 60);

            const btnProbar = document.getElementById('btn-tour-probar-traduccion');
            if (btnProbar) {
                btnProbar.onclick = () => {
                    detenerAudioTutorial();
                    removerMouseHintPaso3();
                    if (typeof reproducirSecuencia === 'function') {
                        reproducirSecuencia(0);
                    }
                };
            }

            let empezoLectura = false;
            let ticksLeyendo = 0;
            let ticksSilencio = 0;
            let completado = false;

            const isReproduciendo = () => {
                return (typeof leyendo !== 'undefined' && leyendo) ||
                       (typeof isPlayingPiper !== 'undefined' && isPlayingPiper) ||
                       (typeof window.palabraKaraoke !== 'undefined' && window.palabraKaraoke !== null);
            };

            const avanzarATrabajo9 = () => {
                configurarTraduccionTutorial(false);
                if (typeof window.limpiarSubtitulosTraduccion === 'function') {
                    window.limpiarSubtitulosTraduccion();
                }
                siguiente();
            };

            const finalizarDemoTraduccion = () => {
                if (completado) return;
                completado = true;
                if (intervalPasoTraductor) {
                    clearInterval(intervalPasoTraductor);
                    intervalPasoTraductor = null;
                }
                removerMouseHintPaso3();
                const bodyEl = document.getElementById('tour-card-body');
                if (bodyEl) {
                    const speechBubble = bodyEl.querySelector('.tutorial-speech-bubble');
                    if (speechBubble) {
                        speechBubble.innerHTML = `<div>${cfg.exito}</div>
                        <button id="btn-tour-trad-continuar" class="btn-tour-accion" style="margin-top:10px; width:100%; background:linear-gradient(135deg, #10b981, #059669); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:600; cursor:pointer;">
                            Continuar a Extracción y Apuntes ➔
                        </button>`;
                        const btnCont = document.getElementById('btn-tour-trad-continuar');
                        if (btnCont) {
                            btnCont.onclick = avanzarATrabajo9;
                        }
                    }
                }
                const btnSig = (document.getElementById('btn-tour-next') || document.getElementById('tour-btn-siguiente'));
                if (btnSig) {
                    btnSig.style.opacity = '1';
                    btnSig.style.pointerEvents = 'auto';
                }
                setTimeoutTutorial(() => {
                    if (window.tutorialActivo && PASOS_TOUR_GUI[window.tutorialPasoActual]?.id === 'paso_10k_probar_traductor') {
                        avanzarATrabajo9();
                    }
                }, 700);
            };

            if (intervalPasoTraductor) clearInterval(intervalPasoTraductor);
            intervalPasoTraductor = setInterval(() => {
                if (!window.tutorialActivo || PASOS_TOUR_GUI[window.tutorialPasoActual]?.id !== 'paso_10k_probar_traductor') {
                    clearInterval(intervalPasoTraductor);
                    intervalPasoTraductor = null;
                    return;
                }

                if (!isReproduciendo() && (!datosPagina || !datosPagina.oraciones || !datosPagina.oraciones[0])) {
                    cargarDemoTraduccion();
                }

                if (isReproduciendo()) {
                    if (!empezoLectura) {
                        empezoLectura = true;
                        detenerAudioTutorial();
                        removerMouseHintPaso3();
                    }
                    const bodyEl = document.getElementById('tour-card-body');
                    if (bodyEl) {
                        const speechBubble = bodyEl.querySelector('.tutorial-speech-bubble');
                        if (speechBubble) {
                            speechBubble.innerHTML = `<span style="color:#38bdf8; font-weight:bold;">🌐 ¡Traduciendo y Leyendo en Vivo!</span><br>📄 <b>Original:</b> <i>"${cfg.textoDoc}"</i><br>🔊 <b>Traducción:</b> <span style="color:#22c55e; font-weight:bold;">"${cfg.textoTraducido}"</span>`;
                        }
                    }
                    ticksLeyendo++;
                    ticksSilencio = 0;
                } else if (empezoLectura && ticksLeyendo >= 4) {
                    ticksSilencio++;
                    if (ticksSilencio >= 4 && !completado) {
                        finalizarDemoTraduccion();
                    }
                }
            }, 200);
        }
    },

    // ------------------------------------------------------------------------
    // FASE 5.5: EXTRACCIÓN (SUBRAYADOS Y RECORTES), GESTOR Y CUADERNO DE NOTAS
    // ------------------------------------------------------------------------
    {
        id: "paso_10l_subrayar_azul",
        targetSelector: "#btn-zen-summary-edicion, #group-highlight, #btn-highlight",
        getTargets: () => {
            const targets = [];
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                const edDetails = document.getElementById('zen-details-edicion-bar');
                const edSummary = document.getElementById('btn-zen-summary-edicion');
                if (subEtapaEdicionAzul === 0 && !edDetails?.open) {
                    if (edSummary) targets.push(edSummary);
                } else if (subEtapaEdicionAzul <= 1) {
                    const cianSwatch = document.querySelector('.zen-color-swatch[data-color="#00FFFF"]');
                    if (cianSwatch) targets.push(cianSwatch);
                    else if (edSummary) targets.push(edSummary);
                }
            } else {
                const gh = document.getElementById('group-highlight');
                const bh = document.getElementById('btn-highlight');
                const cBtn = document.getElementById('color-dropdown-btn');
                if (subEtapaEdicionAzul === 0) {
                    if (cBtn) targets.push(cBtn);
                    else if (gh) targets.push(gh);
                } else if (subEtapaEdicionAzul === 1) {
                    const cianSwatch = document.querySelector('.color-option[data-color="#00FFFF"]');
                    if (cianSwatch) targets.push(cianSwatch);
                    else if (bh) targets.push(bh);
                }
            }
            return targets;
        },
        posicion: "adaptable-paso-1",
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return cfg.tituloSubrayadoAzul;
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            if (langIso === 'es') {
                if (subEtapaEdicionAzul === 0) {
                    return "¡Muy bien! Ahora veamos las herramientas de estudio. Vamos a marcar el texto de color azul; para eso, abre el botón de <b>'Herramientas de Edición'</b> iluminado en azul.";
                }
                if (subEtapaEdicionAzul === 1) {
                    return "Ahora selecciona el color <b>Azul</b> en la paleta.";
                }
                return "Ahora arrastra el cursor sobre la primera oración para subrayarla.";
            }
            return cfg.instSubrayadoAzul;
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return `<div style="line-height:1.45;">
                <div style="margin-bottom:8px;">${cfg.detalleSubrayadoAzul}</div>
                <button id="btn-tour-subrayar-azul" class="btn-tour-accion" style="margin-top:6px; width:100%; background:linear-gradient(135deg, #0284c7, #06b6d4); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                    ${cfg.btnSubrayarAzul}
                </button>
            </div>`;
        },
        accionCondicional: (siguiente) => {
            document.body.classList.remove('tour-traductor-abierto');
            document.body.classList.remove('tour-ia-abierto');
            document.body.classList.add('tour-paso-lectura');

            activarMocksTutorialExtraccion();
            demoSubrayadoAzulHecho = false;
            demoSubrayadoRosaHecho = false;
            window.demoSubrayadosTutorial = [];
            window.demoCapturasTutorial = [];

            cargarDemoExtraccion(false, false);

            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            const detZen = document.getElementById('zen-details-edicion-bar');

            if (esMinimalista && detZen?.open && subEtapaEdicionAzul === 0) {
                subEtapaEdicionAzul = 1;
            }

            if (subEtapaEdicionAzul === 0) {
                const paletteBtn = esMinimalista
                    ? (document.getElementById('btn-zen-summary-edicion') || document.querySelector('#zen-details-edicion-bar summary'))
                    : (document.getElementById('color-dropdown-btn') || document.getElementById('group-highlight'));
                if (paletteBtn) {
                    posicionarMouseHintEnElemento(paletteBtn, "🖱️ Abre las Herramientas de Edición");
                }
                if (esMinimalista) {
                    const avanzarEdicionAzul = () => {
                        if (subEtapaEdicionAzul !== 0) return;
                        if (detZen) detZen.removeEventListener('toggle', onToggle);
                        if (paletteBtn) paletteBtn.removeEventListener('click', onClickSummary);
                        setTimeout(() => {
                            if (subEtapaEdicionAzul !== 0) return;
                            if (detZen) detZen.open = true;
                            subEtapaEdicionAzul = 1;
                            renderizarPasoTour();
                        }, 80);
                    };
                    const onToggle = () => {
                        if (detZen && detZen.open) avanzarEdicionAzul();
                    };
                    const onClickSummary = () => avanzarEdicionAzul();
                    if (detZen) detZen.addEventListener('toggle', onToggle);
                    if (paletteBtn) paletteBtn.addEventListener('click', onClickSummary, { once: true });
                } else {
                    const cBtn = document.getElementById('color-dropdown-btn') || document.getElementById('group-highlight');
                    if (cBtn) {
                        targetCondicionalActivo = cBtn;
                        listenerCondicionalActivo = () => {
                            setTimeout(() => {
                                subEtapaEdicionAzul = 1;
                                renderizarPasoTour();
                            }, 120);
                        };
                        cBtn.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                }
            } else if (subEtapaEdicionAzul === 1) {
                if (esMinimalista && detZen && !detZen.open) detZen.open = true;
                const cianSwatch = esMinimalista
                    ? document.querySelector('.zen-color-swatch[data-color="#00FFFF"]')
                    : document.querySelector('.color-option[data-color="#00FFFF"]');
                if (cianSwatch) {
                    cianSwatch.classList.add('tour-spotlight-active');
                    posicionarMouseHintEnElemento(cianSwatch, "🖱️ Selecciona el color Azul");
                    cianSwatch.addEventListener('click', () => {
                        if (subEtapaEdicionAzul < 2) {
                            subEtapaEdicionAzul = 2;
                            renderizarPasoTour();
                        }
                    }, { once: true });
                }
            } else {
                quitarResaltadoTour();
                if (datosPagina && datosPagina.oraciones && datosPagina.oraciones[0]) {
                    const or1 = datosPagina.oraciones[0];
                    const midX = (or1.rects[0][0] + or1.rects[0][2]) / 2;
                    const topY = or1.rects[0][1];
                    posicionarMouseHintEnCoordenadas(midX, topY, cfg.badgeMouseAzul, 'izquierdo');
                }
            }

            // Escuchar cuando el usuario elija el color azul en la paleta
            window.onColorSubrayadorCambiado = (colorHex) => {
                if (colorHex === '#00FFFF' && subEtapaEdicionAzul < 2) {
                    subEtapaEdicionAzul = 2;
                    renderizarPasoTour();
                }
            };

            // Escuchar el arrastre real completado con mouseup sobre la oración
            window.onTrazoSubrayadoTutorial = (fullText, colorHex, coordList) => {
                removerMouseHintPaso3();
                simularSubrayadoDemo('azul', siguiente);
            };

            const btnAzul = document.getElementById('btn-tour-subrayar-azul');
            if (btnAzul) {
                btnAzul.onclick = () => {
                    removerMouseHintPaso3();
                    simularSubrayadoDemo('azul', siguiente);
                };
            }
        }
    },
    {
        id: "paso_10m_subrayar_rosa",
        targetSelector: "#btn-zen-summary-edicion, #color-dropdown-btn, #group-highlight",
        getTargets: () => {
            const targets = [];
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                const edDetails = document.getElementById('zen-details-edicion-bar');
                const edSummary = document.getElementById('btn-zen-summary-edicion');
                if (subEtapaEdicionRosa === 0 && !edDetails?.open) {
                    if (edSummary) targets.push(edSummary);
                } else if (subEtapaEdicionRosa <= 1) {
                    const rosaSwatch = document.querySelector('.zen-color-swatch[data-color="#FF00FF"]');
                    if (rosaSwatch) targets.push(rosaSwatch);
                    else if (edSummary) targets.push(edSummary);
                }
            } else {
                const cBtn = document.getElementById('color-dropdown-btn');
                const gh = document.getElementById('group-highlight');
                if (subEtapaEdicionRosa === 0) {
                    if (cBtn) targets.push(cBtn);
                    else if (gh) targets.push(gh);
                } else if (subEtapaEdicionRosa === 1) {
                    const rosaSwatch = document.querySelector('.color-option[data-color="#FF00FF"]');
                    if (rosaSwatch) targets.push(rosaSwatch);
                    else if (cBtn) targets.push(cBtn);
                }
            }
            return targets;
        },
        posicion: "adaptable-paso-1",
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return cfg.tituloSubrayadoRosa;
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            if (langIso === 'es') {
                if (subEtapaEdicionRosa === 0) {
                    return "Ahora marquemos con el color rosa. Abre de nuevo las <b>'Herramientas de Edición'</b> iluminadas en azul.";
                }
                if (subEtapaEdicionRosa === 1) {
                    return "Selecciona el color <b>Rosa</b> en la paleta.";
                }
                return "Ahora subraya la segunda oración del documento.";
            }
            return cfg.instSubrayadoRosa;
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return `<div style="line-height:1.45;">
                <div style="margin-bottom:8px;">${cfg.detalleSubrayadoRosa}</div>
                <button id="btn-tour-subrayar-rosa" class="btn-tour-accion" style="margin-top:6px; width:100%; background:linear-gradient(135deg, #ec4899, #d946ef); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                    ${cfg.btnSubrayarRosa}
                </button>
            </div>`;
        },
        accionCondicional: (siguiente) => {
            document.body.classList.add('tour-paso-lectura');
            cargarDemoExtraccion(true, false);

            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            const detZen = document.getElementById('zen-details-edicion-bar');

            if (esMinimalista && detZen?.open && subEtapaEdicionRosa === 0) {
                subEtapaEdicionRosa = 1;
            }

            if (subEtapaEdicionRosa === 0) {
                const paletteBtn = esMinimalista
                    ? (document.getElementById('btn-zen-summary-edicion') || document.querySelector('#zen-details-edicion-bar summary'))
                    : (document.getElementById('color-dropdown-btn') || document.getElementById('group-highlight'));
                if (paletteBtn) {
                    posicionarMouseHintEnElemento(paletteBtn, "🖱️ Abre las Herramientas de Edición");
                }
                if (esMinimalista) {
                    const avanzarEdicionRosa = () => {
                        if (subEtapaEdicionRosa !== 0) return;
                        if (detZen) detZen.removeEventListener('toggle', onToggle);
                        if (paletteBtn) paletteBtn.removeEventListener('click', onClickSummary);
                        setTimeout(() => {
                            if (subEtapaEdicionRosa !== 0) return;
                            if (detZen) detZen.open = true;
                            subEtapaEdicionRosa = 1;
                            renderizarPasoTour();
                        }, 80);
                    };
                    const onToggle = () => {
                        if (detZen && detZen.open) avanzarEdicionRosa();
                    };
                    const onClickSummary = () => avanzarEdicionRosa();
                    if (detZen) detZen.addEventListener('toggle', onToggle);
                    if (paletteBtn) paletteBtn.addEventListener('click', onClickSummary, { once: true });
                } else {
                    const cBtn = document.getElementById('color-dropdown-btn') || document.getElementById('group-highlight');
                    if (cBtn) {
                        targetCondicionalActivo = cBtn;
                        listenerCondicionalActivo = () => {
                            setTimeout(() => {
                                subEtapaEdicionRosa = 1;
                                renderizarPasoTour();
                            }, 120);
                        };
                        cBtn.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                }
            } else if (subEtapaEdicionRosa === 1) {
                if (esMinimalista && detZen && !detZen.open) detZen.open = true;
                const rosaSwatch = esMinimalista
                    ? document.querySelector('.zen-color-swatch[data-color="#FF00FF"]')
                    : document.querySelector('.color-option[data-color="#FF00FF"]');
                if (rosaSwatch) {
                    rosaSwatch.classList.add('tour-spotlight-active');
                    posicionarMouseHintEnElemento(rosaSwatch, "🖱️ Selecciona el color Rosa");
                    rosaSwatch.addEventListener('click', () => {
                        if (subEtapaEdicionRosa < 2) {
                            subEtapaEdicionRosa = 2;
                            renderizarPasoTour();
                        }
                    }, { once: true });
                }
            } else {
                quitarResaltadoTour();
                if (datosPagina && datosPagina.oraciones && datosPagina.oraciones[1]) {
                    const or2 = datosPagina.oraciones[1];
                    const midX = (or2.rects[0][0] + or2.rects[0][2]) / 2;
                    const topY = or2.rects[0][1];
                    posicionarMouseHintEnCoordenadas(midX, topY, cfg.badgeMouseRosa, 'izquierdo');
                }
            }

            // Escuchar cuando el usuario elija Rosa en la paleta
            window.onColorSubrayadorCambiado = (colorHex) => {
                if (colorHex === '#FF00FF' && subEtapaEdicionRosa < 2) {
                    subEtapaEdicionRosa = 2;
                    renderizarPasoTour();
                }
            };

            // Escuchar el arrastre real completado con mouseup sobre la oración 2
            window.onTrazoSubrayadoTutorial = (fullText, colorHex, coordList) => {
                removerMouseHintPaso3();
                simularSubrayadoDemo('rosa', siguiente);
            };

            const btnRosa = document.getElementById('btn-tour-subrayar-rosa');
            if (btnRosa) {
                btnRosa.onclick = () => {
                    removerMouseHintPaso3();
                    simularSubrayadoDemo('rosa', siguiente);
                };
            }
        }
    },
    {
        id: "paso_10n_capturar_recorte",
        targetSelector: "#btn-crop-extract-zen, #btn-crop-extract, #btn-zen-summary-edicion",
        getTargets: () => {
            const targets = [];
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                const edDetails = document.getElementById('zen-details-edicion-bar');
                const edSummary = document.getElementById('btn-zen-summary-edicion');
                if (subEtapaEdicionRecorte === 0 && !edDetails?.open) {
                    if (edSummary) targets.push(edSummary);
                } else if (subEtapaEdicionRecorte <= 1) {
                    const cropZen = document.getElementById('btn-crop-extract-zen');
                    if (cropZen) targets.push(cropZen);
                    else if (edSummary) targets.push(edSummary);
                }
            } else {
                if (subEtapaEdicionRecorte <= 1) {
                    const crop = document.getElementById('btn-crop-extract');
                    if (crop) targets.push(crop);
                }
            }
            return targets;
        },
        posicion: "adaptable-paso-1",
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return cfg.tituloRecorte;
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (langIso === 'es') {
                if (esMinimalista && subEtapaEdicionRecorte === 0) {
                    return "Además de texto, puedes guardar diagramas o imágenes. Abre las <b>'Herramientas de Edición'</b> iluminadas en azul.";
                }
                if (subEtapaEdicionRecorte <= 1) {
                    return esMinimalista
                        ? "Ahora haz clic en <b>'Capturar Recorte'</b> iluminado en azul."
                        : "Además de texto, puedes guardar diagramas o imágenes. Haz clic en <b>'Capturar Recorte'</b> iluminado en azul.";
                }
                return "Ahora arrastra un recuadro sobre el diagrama inferior para capturarlo.";
            }
            return cfg.instRecorte;
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return `<div style="line-height:1.45;">
                <div style="margin-bottom:8px;">${cfg.detalleRecorte}</div>
                <button id="btn-tour-hacer-recorte" class="btn-tour-accion" style="margin-top:6px; width:100%; background:linear-gradient(135deg, #0284c7, #2563eb); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                    ${cfg.btnRecortar}
                </button>
            </div>`;
        },
        accionCondicional: (siguiente) => {
            document.body.classList.add('tour-paso-lectura');
            cargarDemoExtraccion(true, true);
            if (window.modoSubrayadorActivo && typeof toggleModoSubrayador === 'function') {
                toggleModoSubrayador(false);
            }

            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            const detZen = document.getElementById('zen-details-edicion-bar');

            if (!esMinimalista && subEtapaEdicionRecorte === 0) {
                subEtapaEdicionRecorte = 1;
            } else if (esMinimalista && detZen?.open && subEtapaEdicionRecorte === 0) {
                subEtapaEdicionRecorte = 1;
            }

            if (subEtapaEdicionRecorte === 0 && esMinimalista) {
                const edSummary = document.getElementById('btn-zen-summary-edicion') || document.querySelector('#zen-details-edicion-bar summary');
                if (edSummary) {
                    posicionarMouseHintEnElemento(edSummary, "🖱️ Abre las Herramientas de Edición");
                }
                const avanzarEdicionRecorte = () => {
                    if (subEtapaEdicionRecorte !== 0) return;
                    if (detZen) detZen.removeEventListener('toggle', onToggle);
                    if (edSummary) edSummary.removeEventListener('click', onClickSummary);
                    setTimeout(() => {
                        if (subEtapaEdicionRecorte !== 0) return;
                        if (detZen) detZen.open = true;
                        subEtapaEdicionRecorte = 1;
                        renderizarPasoTour();
                    }, 80);
                };
                const onToggle = () => {
                    if (detZen && detZen.open) avanzarEdicionRecorte();
                };
                const onClickSummary = () => avanzarEdicionRecorte();
                if (detZen) detZen.addEventListener('toggle', onToggle);
                if (edSummary) edSummary.addEventListener('click', onClickSummary, { once: true });
            } else if (subEtapaEdicionRecorte === 1) {
                if (esMinimalista && detZen && !detZen.open) detZen.open = true;
                const btnTool = esMinimalista
                    ? document.getElementById('btn-crop-extract-zen')
                    : document.getElementById('btn-crop-extract');
                if (btnTool) {
                    btnTool.classList.add('tour-spotlight-active');
                    posicionarMouseHintEnElemento(btnTool, "🖱️ Haz clic en Capturar Recorte");
                    btnTool.onclick = (e) => {
                        e.stopPropagation();
                        if (typeof toggleModoRecorteExtraccion === 'function' && !window.modoRecorteActivo) {
                            toggleModoRecorteExtraccion();
                        }
                        if (detZen) detZen.open = false;
                        subEtapaEdicionRecorte = 2;
                        renderizarPasoTour();
                    };
                }
            } else {
                quitarResaltadoTour();
                if (!window.modoRecorteActivo && typeof toggleModoRecorteExtraccion === 'function') {
                    toggleModoRecorteExtraccion();
                }
                setTimeoutTutorial(() => {
                    cargarDemoExtraccion(true, true);
                    posicionarMouseHintEnCoordenadas(400, 310, cfg.badgeMouseRecorte, 'izquierdo');
                }, 80);
            }

            window.onRecorteVisualTutorial = (dataUrl) => {
                simularCapturaDemo(siguiente, dataUrl);
            };

            const btnRecortar = document.getElementById('btn-tour-hacer-recorte');
            if (btnRecortar) {
                btnRecortar.onclick = () => {
                    simularCapturaDemo(siguiente);
                };
            }
        }
    },
    {
        id: "paso_10o_abrir_gestor",
        targetSelector: "#btn-gestor-extraccion, #btn-gestor-extraccion-zen, #btn-zen-summary-edicion",
        getTargets: () => {
            const targets = [];
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                const edDetails = document.getElementById('zen-details-edicion-bar');
                const edSummary = document.getElementById('btn-zen-summary-edicion');
                if (subEtapaEdicionGestor === 0 && !edDetails?.open) {
                    if (edSummary) targets.push(edSummary);
                } else {
                    const gestorZen = document.getElementById('btn-gestor-extraccion-zen');
                    if (gestorZen) targets.push(gestorZen);
                    else if (edSummary) targets.push(edSummary);
                }
            } else {
                const gestorNormal = document.getElementById('btn-gestor-extraccion');
                if (gestorNormal) targets.push(gestorNormal);
            }
            return targets;
        },
        posicion: "adaptable-paso-1",
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista && subEtapaEdicionGestor === 0 && langIso === 'es') {
                return "📂 Paso 9.4: Herramientas de Edición (Gestor)";
            }
            return cfg.tituloAbrirGestor;
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (langIso === 'es') {
                if (esMinimalista && subEtapaEdicionGestor === 0) {
                    return "Para ver todo lo que hemos recopilado, abre las <b>'Herramientas de Edición'</b> iluminadas en azul.";
                }
                return "Ahora haz clic en el <b>'Gestor de Extracción'</b> iluminado en azul para abrir tu panel de recopilación.";
            }
            return cfg.instAbrirGestor;
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return `<div style="line-height:1.45;">
                <div style="margin-bottom:8px;">${cfg.detalleAbrirGestor}</div>
                <button id="btn-tour-abrir-gestor" class="btn-tour-accion" style="margin-top:6px; width:100%; background:linear-gradient(135deg, #0284c7, #2563eb); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                    ${cfg.btnAbrirGestor}
                </button>
            </div>`;
        },
        accionCondicional: (siguiente) => {
            if (window.modoRecorteActivo && typeof toggleModoRecorteExtraccion === 'function') {
                toggleModoRecorteExtraccion();
            }
            removerMouseHintPaso3();

            const esMinimalista = document.body.classList.contains('modo-minimalista');
            const detZen = document.getElementById('zen-details-edicion-bar');

            if (!esMinimalista && subEtapaEdicionGestor === 0) {
                subEtapaEdicionGestor = 1;
            } else if (esMinimalista && detZen?.open && subEtapaEdicionGestor === 0) {
                subEtapaEdicionGestor = 1;
            }

            if (esMinimalista && subEtapaEdicionGestor === 0) {
                const edSummary = document.getElementById('btn-zen-summary-edicion') || document.querySelector('#zen-details-edicion-bar summary');
                if (edSummary) {
                    posicionarMouseHintEnElemento(edSummary, "🖱️ Abre las Herramientas de Edición");
                    targetCondicionalActivo = edSummary;
                    listenerCondicionalActivo = () => {
                        setTimeout(() => {
                            if (detZen) detZen.open = true;
                            subEtapaEdicionGestor = 1;
                            renderizarPasoTour();
                        }, 120);
                    };
                    edSummary.addEventListener('click', listenerCondicionalActivo, { once: true });
                }
                if (detZen) {
                    const onToggle = () => {
                        if (detZen.open && subEtapaEdicionGestor === 0) {
                            detZen.removeEventListener('toggle', onToggle);
                            subEtapaEdicionGestor = 1;
                            renderizarPasoTour();
                        }
                    };
                    detZen.addEventListener('toggle', onToggle);
                }
            } else if (esMinimalista && subEtapaEdicionGestor === 1) {
                if (detZen && !detZen.open) {
                    detZen.open = true;
                }
                const gestorZen = document.getElementById('btn-gestor-extraccion-zen');
                if (gestorZen) {
                    gestorZen.classList.add('tour-spotlight-active');
                    posicionarMouseHintEnElemento(gestorZen, "🖱️ Haz clic en Gestor de Extracción");
                }
            } else if (!esMinimalista) {
                const gestorNormal = document.getElementById('btn-gestor-extraccion');
                if (gestorNormal) {
                    posicionarMouseHintEnElemento(gestorNormal, "🖱️ Haz clic en Gestor de Extracción");
                }
            }

            let avanzado = false;
            let intervalCheckGestor = null;
            const abrirYContinuar = () => {
                if (avanzado) return;
                avanzado = true;
                if (intervalCheckGestor) {
                    clearInterval(intervalCheckGestor);
                    intervalCheckGestor = null;
                }
                removerMouseHintPaso3();
                if (detZen) detZen.open = false;
                siguiente();
            };

            const btnTourAbrir = document.getElementById('btn-tour-abrir-gestor');
            if (btnTourAbrir) {
                btnTourAbrir.onclick = () => {
                    if (typeof mostrarPanelSubrayados === 'function') {
                        mostrarPanelSubrayados();
                    }
                    abrirYContinuar();
                };
            }

            // Escuchar clics en ambos botones del gestor (normal y Zen)
            ['btn-gestor-extraccion', 'btn-gestor-extraccion-zen'].forEach(btnId => {
                const b = document.getElementById(btnId);
                if (b) {
                    b.addEventListener('click', () => {
                        setTimeout(abrirYContinuar, 80);
                    }, { once: true });
                }
            });

            // Interceptar llamada directa a mostrarPanelSubrayados para detección garantizada
            const origMostrarPanel = window.mostrarPanelSubrayados;
            window.mostrarPanelSubrayados = function(...args) {
                if (typeof origMostrarPanel === 'function') {
                    origMostrarPanel.apply(this, args);
                }
                setTimeout(abrirYContinuar, 80);
            };

            // Detección reactiva continua en caso de que se abra manualmente por atajo o clic
            intervalCheckGestor = setInterval(() => {
                const modal = document.getElementById('modal-subrayados');
                const panel = document.getElementById('panel-subrayados');
                const estaAbierto = (modal && (modal.style.display === 'block' || window.getComputedStyle(modal).display === 'block')) ||
                                    (panel && (panel.style.right === '0px' || parseInt(window.getComputedStyle(panel).right) >= 0));
                if (estaAbierto) {
                    abrirYContinuar();
                }
            }, 100);
        }
    },
    {
        id: "paso_10p_explorar_gestor",
        targetSelector: "#panel-subrayados",
        posicion: "right-panel",
        sinSpotlightAnim: true,
        autoAvanzarTrasLectura: true,
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return cfg.tituloGestor;
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return cfg.instGestor;
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return `<div style="line-height:1.45;">
                <div style="margin-bottom:10px;">${cfg.detalleGestor}</div>
                <button id="btn-tour-gestor-siguiente" class="btn-tour-accion" style="margin-top:6px; width:100%; background:linear-gradient(135deg, #0284c7, #2563eb); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                    ${cfg.btnGestorSiguiente}
                </button>
            </div>`;
        },
        accionCondicional: (siguiente) => {
            document.body.classList.remove('tour-paso-lectura');
            document.body.classList.add('tour-gestor-abierto');
            if (typeof mostrarPanelSubrayados === 'function') {
                mostrarPanelSubrayados();
            }

            const refrescarTarjetasDemo = () => {
                const cont = document.getElementById('extracted-texts');
                if (cont) {
                    cont.innerHTML = '';
                    if (window.demoCapturasTutorial && window.demoCapturasTutorial.length > 0 && typeof renderizarTarjetaCaptura === 'function') {
                        window.demoCapturasTutorial.forEach(c => renderizarTarjetaCaptura(c, cont));
                    }
                    if (window.demoSubrayadosTutorial && typeof appendExtractedText === 'function') {
                        [...window.demoSubrayadosTutorial].reverse().forEach(s => appendExtractedText(s.texto, s.color, s.id, s.pagina));
                    }
                }
                if (typeof actualizarContadoresExtraccion === 'function') {
                    actualizarContadoresExtraccion((window.demoSubrayadosTutorial || []).length, (window.demoCapturasTutorial || []).length);
                }
            };

            refrescarTarjetasDemo();
            setTimeoutTutorial(refrescarTarjetasDemo, 120);

            const btnSig = document.getElementById('btn-tour-gestor-siguiente');
            if (btnSig) {
                btnSig.onclick = () => {
                    detenerAudioTutorial();
                    siguiente();
                };
            }
        }
    },
    {
        id: "paso_10q_nota_rapida",
        getTargets: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                if (subEtapaZenNotaRapida === 0) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    return btnZenMenu ? [btnZenMenu] : [];
                } else {
                    const btnZenNota = document.getElementById('btn-zen-crear-nota');
                    return btnZenNota ? [btnZenNota] : [];
                }
            } else {
                const btn = document.getElementById('btn-crear-nota');
                return btn ? [btn] : [];
            }
        },
        posicion: "top-left",
        sinSpotlightAnim: () => {
            const panelRapido = document.getElementById('panel-nota-rapida');
            return Boolean(panelRapido && (panelRapido.style.display === 'flex' || window.getComputedStyle(panelRapido).display === 'flex'));
        },
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista && subEtapaZenNotaRapida === 0) {
                return (langIso === 'es') ? "📝 Paso 9.6: Menú Principal o Alt + N" : cfg.tituloNotaRapida;
            }
            return cfg.tituloNotaRapida;
        },
        getInstruccion: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                if (subEtapaZenNotaRapida === 0) {
                    return "Para tomar apuntes al vuelo, tus notas quedarán vinculadas a la página actual. Abre el <b>Menú Principal (☰)</b> (iluminado en azul) o pulsa directamente <kbd style='background:#1e293b; padding:2px 6px; border-radius:4px; border:1px solid #0284c7; color:#38bdf8; font-weight:bold;'>Alt + N</kbd>.";
                } else {
                    return "Ahora haz clic en <b>'Nota Rápida'</b> iluminado en azul.";
                }
            }
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return cfg.instNotaRapida;
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return `<div style="line-height:1.45;">
                <div style="margin-bottom:8px;">${cfg.detalleNotaRapida}</div>
                <div style="background:rgba(2, 132, 199, 0.12); border:1px solid #0284c7; border-radius:6px; padding:7px 10px; font-size:12px; margin-bottom:10px; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:16px;">⌨️</span>
                    <span>${getTourText("tour-paso9-6-atajo", "Atajo global: <b style=\"color:#38bdf8;\">Alt + N</b> abre o cierra tu Nota Rápida estés donde estés.")}</span>
                </div>
                <button id="btn-tour-abrir-nota-rapida" class="btn-tour-accion" style="margin-top:4px; width:100%; background:linear-gradient(135deg, #0284c7, #2563eb); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                    ${cfg.btnAbrirNotaRapida}
                </button>
            </div>`;
        },
        accionCondicional: (siguiente) => {
            document.body.classList.remove('tour-gestor-abierto');
            if (typeof cerrarPanelSubrayados === 'function') {
                cerrarPanelSubrayados();
            }

            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            const panel = document.getElementById('panel-nota-rapida');

            let panelEstuvoAbierto = false;
            let yaAvanzo = false;
            let intervalCheck = null;
            let observer = null;

            const origAbrir = window.abrirPanelNotaRapida;
            const origToggle = window.togglePanelNotaRapida;
            const origCerrar = window.cerrarPanelNotaRapida;

            const limpiar = () => {
                if (intervalCheck) {
                    clearInterval(intervalCheck);
                    intervalCheck = null;
                }
                if (observer) {
                    observer.disconnect();
                    observer = null;
                }
                window.removeEventListener('keydown', onKey);
                window.abrirPanelNotaRapida = origAbrir;
                window.togglePanelNotaRapida = origToggle;
                window.cerrarPanelNotaRapida = origCerrar;
            };

            const avanzarAlSiguiente = () => {
                if (yaAvanzo) return;
                yaAvanzo = true;
                limpiar();
                detenerAudioTutorial();
                document.body.classList.remove('tour-nota-rapida-abierta');
                document.body.classList.remove('tour-activo-zen-menu');
                siguiente();
            };

            const onPanelAbierto = () => {
                if (panelEstuvoAbierto) return;
                panelEstuvoAbierto = true;

                document.body.classList.remove('tour-activo-zen-menu');
                const pMenu = document.getElementById('zen-panel-menu');
                if (pMenu) {
                    pMenu.classList.remove('zen-active');
                    pMenu.style.display = 'none';
                }
                document.body.classList.add('tour-nota-rapida-abierta');

                // Asegurar que el editor tenga el contenido demo explicativo
                const editor = document.getElementById('nota-rapida-editor-content');
                if (editor) {
                    editor.innerHTML = cfg.demoNotaContenido;
                }

                // Quitar spotlight a botones del menú y enfocar la X de cerrar del panel
                quitarResaltadoTour();
                const btnCerrarPanel = panel?.querySelector('.notas-btn-close');
                if (btnCerrarPanel) {
                    btnCerrarPanel.classList.add('tour-spotlight-active');
                }

                // Actualizar la tarjeta del tour para instruir el cierre o continuación
                const titleEl = document.getElementById('tour-card-title');
                if (titleEl) {
                    const tit96 = getTourText("tour-paso9-6-abierta-titulo", "Paso 9.6: Nota Rápida (Abierta)");
                    if (typeof window._renderizarTituloTour === 'function') {
                        window._renderizarTituloTour(titleEl, tit96, 'archivo');
                    } else {
                        titleEl.textContent = tit96;
                    }
                }
                const bodyEl = document.getElementById('tour-card-body');
                if (bodyEl) {
                    const instDiv = bodyEl.children[0];
                    if (instDiv) {
                        instDiv.innerHTML = getTourText("tour-paso9-6-abierta-inst", "<b>¡Nota Rápida abierta!</b> Observa cómo queda vinculada automáticamente a la <b>Página 1</b> de tu documento.<br><br>Ahora <b>ciérrala</b> (pulsando <kbd style='background:#1e293b; padding:2px 6px; border-radius:4px; border:1px solid #0284c7; color:#38bdf8; font-weight:bold;'>Alt + N</kbd> o en la <b>X</b>) para continuar hacia el Cuaderno.");
                    }
                    const bubble = bodyEl.querySelector('.tutorial-speech-bubble');
                    if (bubble) {
                        bubble.innerHTML = `<div style="line-height:1.45;">
                            <div style="margin-bottom:8px;">${getTourText("tour-paso9-6-abierta-tip", "<i>Las notas rápidas te permiten escribir ideas al instante sin interrumpir tu lectura ni tapar el texto.</i>")}</div>
                            <button id="btn-tour-continuar-rapida" class="btn-tour-accion" style="margin-top:6px; width:100%; background:linear-gradient(135deg, #10b981, #059669); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                                ${getTourText("tour-paso9-6-btn-continuar", "Siguiente: Cuaderno de Notas")}
                            </button>
                        </div>`;
                        const btnCont = document.getElementById('btn-tour-continuar-rapida');
                        if (btnCont) {
                            btnCont.onclick = () => {
                                if (typeof cerrarPanelNotaRapida === 'function') cerrarPanelNotaRapida();
                                avanzarAlSiguiente();
                            };
                        }
                    }

                    // Narrar por voz la explicación y la indicación de cierre
                    const textoLocucion = `${instDiv?.innerText || ''}. ${bubble?.innerText || ''}`;
                    narrarPasoTutorial(textoLocucion, false);
                }
            };

            const estaAbierto = () => {
                if (!panel) return false;
                return panel.style.display === 'flex' || window.getComputedStyle(panel).display === 'flex';
            };

            // 1. Observer de mutaciones en el panel
            if (panel && window.MutationObserver) {
                observer = new MutationObserver(() => {
                    const ab = estaAbierto();
                    if (ab && !panelEstuvoAbierto) {
                        onPanelAbierto();
                    } else if (!ab && panelEstuvoAbierto) {
                        avanzarAlSiguiente();
                    }
                });
                observer.observe(panel, { attributes: true, attributeFilter: ['style', 'class'] });
            }

            // 2. Interceptar llamadas a funciones de apertura y cierre
            window.abrirPanelNotaRapida = function(...args) {
                if (typeof origAbrir === 'function') origAbrir.apply(this, args);
                onPanelAbierto();
            };
            window.togglePanelNotaRapida = function(...args) {
                if (typeof origToggle === 'function') origToggle.apply(this, args);
                if (estaAbierto()) onPanelAbierto();
                else if (panelEstuvoAbierto) avanzarAlSiguiente();
            };
            window.cerrarPanelNotaRapida = function(...args) {
                if (typeof origCerrar === 'function') origCerrar.apply(this, args);
                if (panelEstuvoAbierto) avanzarAlSiguiente();
            };

            // 3. Atajos de teclado: Alt+N o Esc
            const onKey = (e) => {
                if (e.altKey && (e.key === 'n' || e.key === 'N')) {
                    setTimeout(() => {
                        if (estaAbierto()) onPanelAbierto();
                        else if (panelEstuvoAbierto) avanzarAlSiguiente();
                    }, 50);
                } else if (e.key === 'Escape' && panelEstuvoAbierto) {
                    setTimeout(avanzarAlSiguiente, 50);
                }
            };
            window.addEventListener('keydown', onKey);

            // 4. Clic en botón "Abrir" del tour
            const btnTourAbrir = document.getElementById('btn-tour-abrir-nota-rapida');
            if (btnTourAbrir) {
                btnTourAbrir.onclick = () => {
                    if (typeof abrirPanelNotaRapida === 'function') abrirPanelNotaRapida();
                    onPanelAbierto();
                };
            }

            // 5. Clics en la UI (Modo Zen y Modo Normal)
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                const panelMenu = document.getElementById('zen-panel-menu');
                if (subEtapaZenNotaRapida === 1 && panelMenu) {
                    panelMenu.classList.add('zen-active');
                    panelMenu.style.display = 'flex';
                    document.body.classList.add('tour-activo-zen-menu');
                } else if (subEtapaZenNotaRapida === 0) {
                    document.body.classList.remove('tour-activo-zen-menu');
                }

                if (subEtapaZenNotaRapida === 0) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    if (btnZenMenu) {
                        targetCondicionalActivo = btnZenMenu;
                        listenerCondicionalActivo = () => {
                            setTimeout(() => {
                                subEtapaZenNotaRapida = 1;
                                renderizarPasoTour();
                            }, 180);
                        };
                        btnZenMenu.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                } else {
                    const btnZenNota = document.getElementById('btn-zen-crear-nota');
                    if (btnZenNota) {
                        targetCondicionalActivo = btnZenNota;
                        listenerCondicionalActivo = () => {
                            setTimeout(onPanelAbierto, 60);
                        };
                        btnZenNota.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                }
            } else {
                const b = document.getElementById('btn-crear-nota');
                if (b) {
                    b.addEventListener('click', () => {
                        setTimeout(onPanelAbierto, 60);
                    }, { once: true });
                }
            }

            // 6. Clic en el botón "✕" del panel de nota rápida o "📖 Cuaderno"
            if (panel) {
                const btnCerrar = panel.querySelector('.notas-btn-close');
                if (btnCerrar) {
                    btnCerrar.addEventListener('click', () => {
                        if (panelEstuvoAbierto) setTimeout(avanzarAlSiguiente, 50);
                    });
                }
                const btnCuaderno = panel.querySelector('#btn-nota-rapida-cuaderno') || panel.querySelector('button[onclick*="toggleModalNotas"]');
                if (btnCuaderno) {
                    btnCuaderno.addEventListener('click', () => {
                        avanzarAlSiguiente();
                    });
                }
            }

            // 7. Polling de respaldo continuo (cada 60ms)
            intervalCheck = setInterval(() => {
                const ab = estaAbierto();
                if (ab && !panelEstuvoAbierto) {
                    onPanelAbierto();
                } else if (!ab && panelEstuvoAbierto) {
                    avanzarAlSiguiente();
                }
            }, 60);

            // 8. Comprobación inicial si ya estaba abierto
            if (estaAbierto()) {
                onPanelAbierto();
            }
        }
    },
    {
        id: "paso_10r_cuaderno_apuntes",
        getTargets: () => {
            const modalNotas = document.getElementById('modal-notas');
            const modalAbierto = modalNotas && (modalNotas.style.display === 'flex' || modalNotas.style.display === 'block');
            if (modalAbierto) {
                const btnCerrar = modalNotas.querySelector('.notas-btn-close');
                return btnCerrar ? [btnCerrar] : [modalNotas];
            }

            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                if (subEtapaZenCuaderno === 0) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    return btnZenMenu ? [btnZenMenu] : [];
                } else {
                    const btnZenCuaderno = document.getElementById('btn-zen-gestor-notas');
                    return btnZenCuaderno ? [btnZenCuaderno] : [];
                }
            } else {
                const btn = document.getElementById('btn-gestor-notas');
                return btn ? [btn] : [];
            }
        },
        posicion: () => {
            const modalNotas = document.getElementById('modal-notas');
            const modalAbierto = modalNotas && (modalNotas.style.display === 'flex' || modalNotas.style.display === 'block');
            return modalAbierto ? "bottom-center" : "top-left";
        },
        sinSpotlightAnim: () => {
            const modalNotas = document.getElementById('modal-notas');
            return Boolean(modalNotas && (modalNotas.style.display === 'flex' || modalNotas.style.display === 'block'));
        },
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            const modalNotas = document.getElementById('modal-notas');
            const modalAbierto = modalNotas && (modalNotas.style.display === 'flex' || modalNotas.style.display === 'block');
            if (modalAbierto) {
                return cfg.tituloCuaderno;
            }
            if (esMinimalista && subEtapaZenCuaderno === 0) {
                return (langIso === 'es') ? "📖 Paso 9.7: Menú Principal o Tecla N" : cfg.tituloCuaderno;
            }
            return cfg.tituloCuaderno;
        },
        getInstruccion: () => {
            const modalNotas = document.getElementById('modal-notas');
            const modalAbierto = modalNotas && (modalNotas.style.display === 'flex' || modalNotas.style.display === 'block');
            if (modalAbierto) {
                return "✨ <b>¡Cuaderno de Notas abierto!</b> Aquí puedes ver y organizar <b>todos los apuntes globales</b> que has hecho en tu documento PDF.<br><br>👉 Ahora <b>ciérralo</b> (pulsando la tecla <kbd style='background:#1e293b; padding:2px 6px; border-radius:4px; border:1px solid #0284c7; color:#38bdf8; font-weight:bold;'>N</kbd> o en la <b>✕</b>) para continuar hacia el Reconocimiento OCR.";
            }
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                if (subEtapaZenCuaderno === 0) {
                    return "Y para revisar todos los apuntes que has hecho en el PDF, abre el <b>Menú Principal (☰)</b> (iluminado en azul) o pulsa directamente la tecla <kbd style='background:#1e293b; padding:2px 6px; border-radius:4px; border:1px solid #0284c7; color:#38bdf8; font-weight:bold;'>N</kbd>.";
                } else {
                    return "Ahora haz clic en <b>'Cuaderno de Notas'</b> iluminado en azul.";
                }
            }
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return cfg.instCuaderno;
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return `<div style="line-height:1.45;">
                <div style="margin-bottom:8px;">${cfg.detalleCuaderno}</div>
                <div style="background:rgba(2, 132, 199, 0.12); border:1px solid #0284c7; border-radius:6px; padding:7px 10px; font-size:12px; margin-bottom:10px; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:16px;">⌨️</span>
                    <span>${getTourText("tour-paso9-7-atajo", "Atajo global: La tecla <b style=\"color:#38bdf8;\">N</b> abre o cierra tu Cuaderno con todos los apuntes del libro.")}</span>
                </div>
                <button id="btn-tour-abrir-cuaderno" class="btn-tour-accion" style="margin-top:4px; width:100%; background:linear-gradient(135deg, #0284c7, #2563eb); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                    ${getTourText("tour-paso9-7-btn-abrir", "📖 Abrir Cuaderno (N)")}
                </button>
            </div>`;
        },
        accionCondicional: (siguiente) => {
            document.body.classList.remove('tour-nota-rapida-abierta');
            if (typeof cerrarPanelNotaRapida === 'function') {
                cerrarPanelNotaRapida();
            }

            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            const modal = document.getElementById('modal-notas');

            let modalEstuvoAbierto = false;
            let yaAvanzo = false;
            let intervalCheck = null;
            let observer = null;

            const origAbrir = window.abrirModalNotas;
            const origToggle = window.toggleModalNotas;
            const origCerrar = window.cerrarModalNotas;

            const limpiar = () => {
                if (intervalCheck) {
                    clearInterval(intervalCheck);
                    intervalCheck = null;
                }
                if (observer) {
                    observer.disconnect();
                    observer = null;
                }
                window.removeEventListener('keydown', onKey);
                window.abrirModalNotas = origAbrir;
                window.toggleModalNotas = origToggle;
                window.cerrarModalNotas = origCerrar;
            };

            const avanzarAlSiguiente = () => {
                if (yaAvanzo) return;
                yaAvanzo = true;
                limpiar();
                detenerAudioTutorial();
                document.body.classList.remove('tour-notas-abierto');
                document.body.classList.remove('tour-activo-zen-menu');
                if (typeof cerrarModalNotas === 'function') {
                    cerrarModalNotas();
                }
                siguiente();
            };

            const onModalAbierto = () => {
                if (modalEstuvoAbierto) return;
                modalEstuvoAbierto = true;

                document.body.classList.remove('tour-activo-zen-menu');
                const pMenu = document.getElementById('zen-panel-menu');
                if (pMenu) {
                    pMenu.classList.remove('zen-active');
                    pMenu.style.display = 'none';
                }
                document.body.classList.add('tour-notas-abierto');

                // Asegurar inyección de nota demostrativa
                const demoNota = {
                    id: "demo_nota_tutorial_1",
                    titulo: cfg.demoNotaTitulo,
                    contenido: cfg.demoNotaContenido,
                    clasificacion: "Estudio & IA",
                    pagina: 1,
                    fecha_modificacion: new Date().toISOString().replace('T', ' ').substring(0, 19),
                    ruta_absoluta: "demo_nota_tutorial_1.md"
                };
                window.notasLista = [demoNota];
                if (typeof renderizarListaNotas === 'function') renderizarListaNotas();
                if (typeof seleccionarNota === 'function') seleccionarNota(demoNota);

                // Quitar spotlight a botones del menú y enfocar la X de cerrar del modal
                quitarResaltadoTour();
                const btnCerrarModal = modal?.querySelector('.notas-btn-close');
                if (btnCerrarModal) {
                    btnCerrarModal.classList.add('tour-spotlight-active');
                }

                // Posicionar la tarjeta del tour abajo centrada sobre el modal
                const card = document.getElementById('tour-guia-card');
                if (card) {
                    card.style.top = 'auto';
                    card.style.bottom = '28px';
                    card.style.left = '50%';
                    card.style.right = 'auto';
                    card.style.transform = 'translateX(-50%)';
                }

                // Actualizar la tarjeta del tour
                const titleEl = document.getElementById('tour-card-title');
                if (titleEl) {
                    const tit97 = getTourText("tour-paso9-7-abierto-titulo", "Paso 9.7: Cuaderno de Notas y Apuntes (Abierto)");
                    if (typeof window._renderizarTituloTour === 'function') {
                        window._renderizarTituloTour(titleEl, tit97, 'archivo');
                    } else {
                        titleEl.textContent = tit97;
                    }
                }
                const bodyEl = document.getElementById('tour-card-body');
                if (bodyEl) {
                    const instDiv = bodyEl.children[0];
                    if (instDiv) {
                        instDiv.innerHTML = getTourText("tour-paso9-7-abierto-inst", "<b>¡Cuaderno de Notas abierto!</b> Aquí puedes ver y organizar <b>todos los apuntes globales</b> que has hecho en tu documento PDF.<br><br>Ahora <b>ciérralo</b> (pulsando la tecla <kbd style='background:#1e293b; padding:2px 6px; border-radius:4px; border:1px solid #0284c7; color:#38bdf8; font-weight:bold;'>N</kbd> o en la <b>X</b>) para continuar hacia el Reconocimiento OCR.");
                    }
                    const bubble = bodyEl.querySelector('.tutorial-speech-bubble');
                    if (bubble) {
                        bubble.innerHTML = `<div style="line-height:1.45;">
                            <div style="margin-bottom:8px;">${getTourText("tour-paso9-7-abierto-tip", "<b>Diferencia clave:</b> Mientras la <i>Nota Rápida</i> guarda anotaciones por página, el <i>Cuaderno</i> reúne todos los apuntes del libro en formato Markdown, con búsqueda y soporte IA.")}</div>
                            <button id="btn-tour-continuar-cuaderno" class="btn-tour-accion" style="margin-top:6px; width:100%; background:linear-gradient(135deg, #10b981, #059669); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                                ${getTourText("tour-paso9-7-btn-continuar", "Siguiente: Reconocimiento OCR")}
                            </button>
                        </div>`;
                        const btnCont = document.getElementById('btn-tour-continuar-cuaderno');
                        if (btnCont) {
                            btnCont.onclick = () => {
                                if (typeof cerrarModalNotas === 'function') cerrarModalNotas();
                                avanzarAlSiguiente();
                            };
                        }
                    }

                    // Narrar por voz la explicación y la indicación de cierre del Cuaderno
                    const textoLocucion = `${instDiv?.innerText || ''}. ${bubble?.innerText || ''}`;
                    narrarPasoTutorial(textoLocucion, false);
                }
            };

            const estaAbierto = () => {
                if (!modal) return false;
                return modal.style.display === 'flex' || modal.style.display === 'block' || window.getComputedStyle(modal).display === 'flex';
            };

            // 1. Observer de mutaciones en el modal
            if (modal && window.MutationObserver) {
                observer = new MutationObserver(() => {
                    const ab = estaAbierto();
                    if (ab && !modalEstuvoAbierto) {
                        onModalAbierto();
                    } else if (!ab && modalEstuvoAbierto) {
                        avanzarAlSiguiente();
                    }
                });
                observer.observe(modal, { attributes: true, attributeFilter: ['style', 'class'] });
            }

            // 2. Interceptar llamadas a funciones de apertura y cierre
            window.abrirModalNotas = function(...args) {
                if (typeof origAbrir === 'function') origAbrir.apply(this, args);
                onModalAbierto();
            };
            window.toggleModalNotas = function(...args) {
                if (typeof origToggle === 'function') origToggle.apply(this, args);
                if (estaAbierto()) onModalAbierto();
                else if (modalEstuvoAbierto) avanzarAlSiguiente();
            };
            window.cerrarModalNotas = function(...args) {
                if (typeof origCerrar === 'function') origCerrar.apply(this, args);
                if (modalEstuvoAbierto) avanzarAlSiguiente();
            };

            // 3. Atajos de teclado: tecla N o Esc
            const onKey = (e) => {
                const tag = (e.target?.tagName || '').toLowerCase();
                if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
                if (!e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'n' || e.key === 'N')) {
                    setTimeout(() => {
                        if (estaAbierto()) onModalAbierto();
                        else if (modalEstuvoAbierto) avanzarAlSiguiente();
                    }, 50);
                } else if (e.key === 'Escape' && modalEstuvoAbierto) {
                    setTimeout(avanzarAlSiguiente, 50);
                }
            };
            window.addEventListener('keydown', onKey);

            // 4. Clic en botón "Abrir Cuaderno" del tour
            const btnTourAbrir = document.getElementById('btn-tour-abrir-cuaderno');
            if (btnTourAbrir) {
                btnTourAbrir.onclick = () => {
                    if (typeof abrirModalNotas === 'function') abrirModalNotas();
                    onModalAbierto();
                };
            }

            // 5. Clics en la UI (Modo Zen y Modo Normal)
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                const panelMenu = document.getElementById('zen-panel-menu');
                if (subEtapaZenCuaderno === 1 && panelMenu) {
                    panelMenu.classList.add('zen-active');
                    panelMenu.style.display = 'flex';
                    document.body.classList.add('tour-activo-zen-menu');
                } else if (subEtapaZenCuaderno === 0) {
                    document.body.classList.remove('tour-activo-zen-menu');
                }

                if (subEtapaZenCuaderno === 0) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    if (btnZenMenu) {
                        targetCondicionalActivo = btnZenMenu;
                        listenerCondicionalActivo = () => {
                            setTimeout(() => {
                                subEtapaZenCuaderno = 1;
                                renderizarPasoTour();
                            }, 180);
                        };
                        btnZenMenu.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                } else {
                    const btnZenCuaderno = document.getElementById('btn-zen-gestor-notas');
                    if (btnZenCuaderno) {
                        targetCondicionalActivo = btnZenCuaderno;
                        listenerCondicionalActivo = () => {
                            setTimeout(onModalAbierto, 60);
                        };
                        btnZenCuaderno.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                }
            } else {
                const b = document.getElementById('btn-gestor-notas');
                if (b) {
                    b.addEventListener('click', () => {
                        setTimeout(onModalAbierto, 60);
                    }, { once: true });
                }
            }

            // 6. Clic en el botón "✕" del modal de notas o en el fondo oscuro
            if (modal) {
                const btnCerrar = modal.querySelector('.notas-btn-close');
                if (btnCerrar) {
                    btnCerrar.addEventListener('click', () => {
                        if (modalEstuvoAbierto) setTimeout(avanzarAlSiguiente, 50);
                    });
                }
                modal.addEventListener('click', (e) => {
                    if (e.target === modal && modalEstuvoAbierto) {
                        setTimeout(avanzarAlSiguiente, 50);
                    }
                });
            }

            // 7. Polling de respaldo continuo (cada 60ms)
            intervalCheck = setInterval(() => {
                const ab = estaAbierto();
                if (ab && !modalEstuvoAbierto) {
                    onModalAbierto();
                } else if (!ab && modalEstuvoAbierto) {
                    avanzarAlSiguiente();
                }
            }, 60);

            // 8. Comprobación inicial si ya estaba abierto
            if (estaAbierto()) {
                onModalAbierto();
            }
        }
    },

    // ------------------------------------------------------------------------
    // FASE 5.6: RECONOCIMIENTO RAPIDOCR (AUTO-OCR) Y DESCARGA DE AUDIO MP3
    // ------------------------------------------------------------------------
    {
        id: "paso_10s_reconocimiento_ocr",
        getTargets: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                if (subEtapaZenOCR === 0) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    return btnZenMenu ? [btnZenMenu] : [];
                } else if (subEtapaZenOCR === 1) {
                    const summaryOcr = document.getElementById('btn-zen-summary-ocr') || document.querySelector('#zen-details-ocr summary');
                    return summaryOcr ? [summaryOcr] : [];
                } else {
                    const targets = [];
                    const detailsOcr = document.getElementById('zen-details-ocr');
                    if (detailsOcr) {
                        detailsOcr.querySelectorAll('button').forEach(b => targets.push(b));
                    }
                    return targets;
                }
            } else {
                const targets = [];
                if (subEtapaZenOCR <= 1) {
                    const btnOcr = document.getElementById('btn-menu-ocr');
                    if (btnOcr) targets.push(btnOcr);
                } else {
                    const menuOcr = document.getElementById('dropdown-ocr-menu');
                    if (menuOcr) {
                        menuOcr.querySelectorAll('button').forEach(b => targets.push(b));
                    }
                }
                return targets;
            }
        },
        posicion: "adaptable-paso-1",
        autoAvanzarTrasLectura: () => subEtapaZenOCR === 2,
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista && subEtapaZenOCR === 0) {
                return (langIso === 'es') ? "🔍 Paso 9.8: Menú Principal (Opciones OCR)" : cfg.tituloOCR;
            }
            return cfg.tituloOCR;
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (langIso === 'es') {
                if (esMinimalista && subEtapaZenOCR === 0) {
                    return "El reconocimiento OCR permite convertir las páginas que sean imágenes para que se transformen en texto legible. Para verlo, haz clic en el <b>Menú Principal (☰)</b> iluminado en azul.";
                }
                if (subEtapaZenOCR === 1 || (!esMinimalista && subEtapaZenOCR === 0)) {
                    return esMinimalista
                        ? "Ahora haz clic en el apartado de <b>'OCR'</b> iluminado en azul para desplegar sus funciones."
                        : "El reconocimiento OCR permite convertir las páginas que sean imágenes para que se transformen en texto legible. Haz clic en el botón de <b>'OCR'</b> iluminado en azul para desplegar sus funciones.";
                }
                return cfg.instOCR;
            }
            return cfg.instOCR;
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return `<div style="line-height:1.45;">
                <div style="background:rgba(2, 132, 199, 0.08); border:1px solid #0284c7; border-radius:8px; padding:9px 12px; font-size:12px; margin-bottom:10px;">
                    <div style="font-weight:bold; color:#0284c7; margin-bottom:4px;">⚡ ¿Cómo funciona el Auto-OCR?</div>
                    <div>Si abres un documento con páginas escaneadas o imágenes sin texto, LiraLoud activa <b>RapidOCR</b> automáticamente en segundo plano para que puedas leerlas con voz sin configurar nada.</div>
                </div>
                <div style="font-size:12px; margin-bottom:10px;">
                    • <b>Forzar OCR:</b> Reconoce la página actual si el texto no fue detectado al inicio.<br>
                    • <b>Rango / Todo:</b> Escanea paquetes de páginas o el libro completo en lote.
                </div>
                <button id="btn-tour-ocr-siguiente" class="btn-tour-accion" style="width:100%; background:linear-gradient(135deg, #0284c7, #2563eb); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                    ${cfg.btnOCRSiguiente}
                </button>
            </div>`;
        },
        accionCondicional: (siguiente) => {
            removerMouseHintPaso3();
            const esMinimalista = document.body.classList.contains('modo-minimalista');

            const btnSiguiente = document.getElementById('btn-tour-ocr-siguiente');
            if (btnSiguiente) {
                btnSiguiente.onclick = () => {
                    const detOcr = document.getElementById('zen-details-ocr');
                    if (detOcr) detOcr.open = false;
                    const ocrDropdown = document.getElementById('dropdown-ocr-menu');
                    if (ocrDropdown) ocrDropdown.classList.remove('show');
                    // Mantener abierto el menú Zen para que el Paso 9.9 señale directamente "Descargar Audio"
                    subEtapaZenDescarga = 1;
                    detenerAudioTutorial();
                    siguiente();
                };
            }

            if (esMinimalista) {
                const panelMenu = document.getElementById('zen-panel-menu');
                if (subEtapaZenOCR >= 1 && panelMenu) {
                    panelMenu.classList.add('zen-active');
                    panelMenu.style.display = 'flex';
                    document.body.classList.add('tour-activo-zen-menu');
                } else if (subEtapaZenOCR === 0) {
                    document.body.classList.remove('tour-activo-zen-menu');
                }

                if (subEtapaZenOCR === 0) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    if (btnZenMenu) {
                        targetCondicionalActivo = btnZenMenu;
                        listenerCondicionalActivo = () => {
                            setTimeout(() => {
                                subEtapaZenOCR = 1;
                                renderizarPasoTour();
                            }, 180);
                        };
                        btnZenMenu.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                } else if (subEtapaZenOCR === 1) {
                    const detailsOcr = document.getElementById('zen-details-ocr');
                    const summaryOcr = document.getElementById('btn-zen-summary-ocr') || document.querySelector('#zen-details-ocr summary');
                    if (detailsOcr?.open) {
                        subEtapaZenOCR = 2;
                        renderizarPasoTour();
                        return;
                    }
                    if (summaryOcr && detailsOcr) {
                        targetCondicionalActivo = summaryOcr;
                        listenerCondicionalActivo = () => {
                            setTimeout(() => {
                                detailsOcr.open = true;
                                subEtapaZenOCR = 2;
                                renderizarPasoTour();
                            }, 120);
                        };
                        summaryOcr.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                } else {
                    const detailsOcr = document.getElementById('zen-details-ocr');
                    if (detailsOcr && !detailsOcr.open) {
                        detailsOcr.open = true;
                    }
                }
            } else {
                const btnOcr = document.getElementById('btn-menu-ocr');
                const menuOcr = document.getElementById('dropdown-ocr-menu');
                if (subEtapaZenOCR <= 1) {
                    if (btnOcr) {
                        targetCondicionalActivo = btnOcr;
                        listenerCondicionalActivo = () => {
                            setTimeout(() => {
                                if (menuOcr) menuOcr.classList.add('show');
                                subEtapaZenOCR = 2;
                                renderizarPasoTour();
                            }, 120);
                        };
                        btnOcr.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                } else if (subEtapaZenOCR === 2) {
                    if (menuOcr) menuOcr.classList.add('show');
                }
            }
        }
    },
    {
        id: "paso_10t_descargar_audio",
        getTargets: () => {
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            if (esMinimalista) {
                const panelMenu = document.getElementById('zen-panel-menu');
                const menuAbierto = panelMenu && (panelMenu.classList.contains('zen-active') || panelMenu.style.display === 'flex' || panelMenu.style.display === 'block');
                if (subEtapaZenDescarga === 0 && !menuAbierto) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    return btnZenMenu ? [btnZenMenu] : [];
                } else {
                    const btnZenMp3 = document.getElementById('btn-zen-descarga-mp3');
                    return btnZenMp3 ? [btnZenMp3] : [];
                }
            } else {
                const btnMp3 = document.getElementById('btn-abrir-descarga');
                return btnMp3 ? [btnMp3] : [];
            }
        },
        posicion: "adaptable-paso-1",
        autoAvanzarTrasLectura: () => {
            if (!document.body.classList.contains('modo-minimalista')) return true;
            const panelMenu = document.getElementById('zen-panel-menu');
            const menuAbierto = panelMenu && (panelMenu.classList.contains('zen-active') || panelMenu.style.display === 'flex' || panelMenu.style.display === 'block');
            return subEtapaZenDescarga === 1 || Boolean(menuAbierto);
        },
        getTitulo: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            const panelMenu = document.getElementById('zen-panel-menu');
            const menuAbierto = panelMenu && (panelMenu.classList.contains('zen-active') || panelMenu.style.display === 'flex' || panelMenu.style.display === 'block');
            if (esMinimalista && subEtapaZenDescarga === 0 && !menuAbierto) {
                return (langIso === 'es') ? "🎙️ Paso 9.9: Menú Principal (Descargar Audio)" : cfg.tituloDescarga;
            }
            return cfg.tituloDescarga;
        },
        getInstruccion: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            const panelMenu = document.getElementById('zen-panel-menu');
            const menuAbierto = panelMenu && (panelMenu.classList.contains('zen-active') || panelMenu.style.display === 'flex' || panelMenu.style.display === 'block');
            if (esMinimalista && subEtapaZenDescarga === 0 && !menuAbierto) {
                return "Y si deseas escuchar tu lectura en otro dispositivo, abre el <b>Menú Principal (☰)</b> iluminado en azul para localizar el botón de descarga.";
            }
            return cfg.instDescarga;
        },
        getDetalleExtra: () => {
            const langIso = detectarIdiomaTutorialActivo();
            const cfg = DEMO_EXTRACCION_POR_IDIOMA[langIso] || DEMO_EXTRACCION_POR_IDIOMA.es;
            return `<div style="line-height:1.45;">
                <div style="background:rgba(2, 132, 199, 0.08); border:1px solid #0284c7; border-radius:8px; padding:9px 12px; font-size:12px; margin-bottom:10px;">
                    <div style="font-weight:bold; color:#0284c7; margin-bottom:4px;">🎧 Estudia sin conexión y sin pantallas</div>
                    <div>Puedes generar archivos <b>MP3</b> o <b>WAV</b> de una página, un rango seleccionado o el libro completo, conservando exactamente la voz de estudio, velocidad y pausas elegidas.</div>
                </div>
                <button id="btn-tour-descarga-probar" class="btn-tour-accion" style="width:100%; margin-bottom:8px; background:linear-gradient(135deg, #0284c7, #06b6d4); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                    🎙️ Previsualizar Ventana de Exportación
                </button>
                <button id="btn-tour-descarga-siguiente" class="btn-tour-accion" style="width:100%; background:linear-gradient(135deg, #10b981, #059669); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                    ${cfg.btnDescargaContinuar}
                </button>
            </div>`;
        },
        accionCondicional: (siguiente) => {
            removerMouseHintPaso3();
            const esMinimalista = document.body.classList.contains('modo-minimalista');
            const detOcr = document.getElementById('zen-details-ocr');
            if (detOcr) detOcr.open = false;

            // Aprovechar que el menú sigue abierto desde el paso de OCR en modo minimalista
            if (esMinimalista) {
                const panelMenu = document.getElementById('zen-panel-menu');
                if (panelMenu) {
                    subEtapaZenDescarga = 1;
                    panelMenu.classList.add('zen-active');
                    panelMenu.style.display = 'flex';
                    document.body.classList.add('tour-activo-zen-menu');
                    const btnZenMp3 = document.getElementById('btn-zen-descarga-mp3');
                    if (btnZenMp3) btnZenMp3.classList.add('tour-spotlight-active');
                }
            }

            const cerrarYContinuar = () => {
                if (typeof cerrarModalDescarga === 'function') {
                    cerrarModalDescarga();
                }
                const modal = document.getElementById('modal-descarga');
                if (modal) modal.style.display = 'none';
                const pMenu = document.getElementById('zen-panel-menu');
                if (pMenu) {
                    pMenu.classList.remove('zen-active');
                    pMenu.style.display = 'none';
                }
                document.body.classList.remove('tour-activo-zen-menu');
                detenerAudioTutorial();
                siguiente();
            };

            const btnSiguiente = document.getElementById('btn-tour-descarga-siguiente');
            if (btnSiguiente) {
                btnSiguiente.onclick = cerrarYContinuar;
            }

            const btnProbar = document.getElementById('btn-tour-descarga-probar');
            if (btnProbar) {
                btnProbar.onclick = () => {
                    if (typeof abrirModalDescarga === 'function') {
                        abrirModalDescarga();
                    }
                };
            }

            if (esMinimalista) {
                if (subEtapaZenDescarga === 0) {
                    const btnZenMenu = document.getElementById('btn-zen-menu');
                    if (btnZenMenu) {
                        targetCondicionalActivo = btnZenMenu;
                        listenerCondicionalActivo = () => {
                            setTimeout(() => {
                                subEtapaZenDescarga = 1;
                                renderizarPasoTour();
                            }, 180);
                        };
                        btnZenMenu.addEventListener('click', listenerCondicionalActivo, { once: true });
                    }
                } else {
                    const btnZenMp3 = document.getElementById('btn-zen-descarga-mp3');
                    if (btnZenMp3) {
                        btnZenMp3.addEventListener('click', () => {
                            setTimeout(() => {
                                if (typeof abrirModalDescarga === 'function') abrirModalDescarga();
                            }, 80);
                        });
                    }
                }
            } else {
                const btnMp3 = document.getElementById('btn-abrir-descarga');
                if (btnMp3) {
                    btnMp3.addEventListener('click', () => {
                        setTimeout(() => {
                            if (typeof abrirModalDescarga === 'function') abrirModalDescarga();
                        }, 80);
                    });
                }
            }
        }
    },

    // ------------------------------------------------------------------------
    // FASE 6: CONFIGURACIÓN AVANZADA (PESTAÑA POR PESTAÑA) Y FINALIZACIÓN
    // ------------------------------------------------------------------------
    {
        id: "paso_11a_abrir_config",
        targetSelector: "#btn-config",
        posicion: "adaptable-paso-1",
        getTitulo: () => getTourText("tour-paso10-1-titulo", "⚙️ Paso 10.1: Abrir Configuración Avanzada"),
        getInstruccion: () => getTourText("tour-paso10-1-inst", "Para terminar, haz clic en el botón de <b>'Configuración Avanzada' (⚙️)</b> iluminado en azul."),
        getDetalleExtra: () => getTourText("tour-paso10-1-det", "💡 Aquí encontrarás los apartados de <b>Teclado</b>, <b>Audio</b>, <b>Estilo</b>, <b>Rendimiento</b> e <b>Idioma</b>."),
        accionCondicional: (siguiente) => {
            document.body.classList.remove('tour-config-abierto');
            const modalCfg = document.getElementById('modalConfig');
            if (modalCfg && modalCfg.style.display === 'flex') {
                modalCfg.style.display = 'none';
            }
            const panelIA = document.getElementById('ia-panel-lateral');
            if (panelIA) panelIA.style.display = 'none';

            const btn = document.getElementById('btn-config');
            if (btn) {
                targetCondicionalActivo = btn;
                listenerCondicionalActivo = () => {
                    setTimeout(() => siguiente(), 350);
                };
                btn.addEventListener('click', listenerCondicionalActivo, { once: true });
            }
        }
    },
    {
        id: "paso_11b_tab_teclado",
        getTargets: () => {
            asegurarModalConfigAbiertoEnTab('tab-atajos');
            const btnTab = document.querySelector("#modalConfig button[onclick*='tab-atajos']");
            return btnTab ? [btnTab] : [];
        },
        posicion: "right-panel",
        autoAvanzarTrasLectura: true,
        getTitulo: () => getTourText("tour-paso10-2-titulo", "⌨️ Paso 10.2: Pestaña de Teclado (Atajos)"),
        getInstruccion: () => getTourText("tour-paso10-2-inst", "En el apartado de <b>'Teclado'</b> encontrarás todos los atajos de la aplicación y podrás cambiarlos si lo deseas."),
        getDetalleExtra: () => getTourText("tour-paso10-2-det", "💡 Haz clic sobre cualquier tecla asignada para personalizarla o restablecer el mapeo original."),
        accionCondicional: (siguiente) => {
            asegurarModalConfigAbiertoEnTab('tab-atajos');
            const btnAudio = document.querySelector("#modalConfig button[onclick*='tab-karaoke']");
            if (btnAudio) {
                targetCondicionalActivo = btnAudio;
                listenerCondicionalActivo = () => {
                    setTimeout(() => siguiente(), 250);
                };
                btnAudio.addEventListener('click', listenerCondicionalActivo, { once: true });
            }
        }
    },
    {
        id: "paso_11c_tab_audio",
        getTargets: () => {
            asegurarModalConfigAbiertoEnTab('tab-karaoke');
            const btnTab = document.querySelector("#modalConfig button[onclick*='tab-karaoke']");
            return btnTab ? [btnTab] : [];
        },
        posicion: "right-panel",
        autoAvanzarTrasLectura: true,
        getTitulo: () => getTourText("tour-paso10-3-titulo", "🔊 Paso 10.3: Pestaña de Audio, Ducking y Segmentación"),
        getInstruccion: () => getTourText("tour-paso10-3-inst", "En el apartado de <b>'Audio'</b> encontrarás las opciones de volúmenes, la función <b>Audio Ducking</b> (que permite pausar o controlar la multimedia de fondo) y la <b>Segmentación</b> (que permite determinar cómo la herramienta reconoce los saltos de párrafo y sangría, muy útil cuando el interlineado se confunde con un salto de párrafo)."),
        getDetalleExtra: () => getTourText("tour-paso10-3-det", `<div style="line-height:1.45;">
            • <b>🎚️ Volúmenes:</b> Ajusta la ganancia de lectura.<br>
            • <b>🎧 Audio Ducking:</b> Controla Spotify, YouTube o música de fondo.<br>
            • <b>✂️ Segmentación:</b> Calibra la detección de saltos de párrafo y sangría.
        </div>`),
        accionCondicional: (siguiente) => {
            asegurarModalConfigAbiertoEnTab('tab-karaoke');
            const btnEstilo = document.querySelector("#modalConfig button[onclick*='tab-estilo']");
            if (btnEstilo) {
                targetCondicionalActivo = btnEstilo;
                listenerCondicionalActivo = () => {
                    setTimeout(() => siguiente(), 250);
                };
                btnEstilo.addEventListener('click', listenerCondicionalActivo, { once: true });
            }
        }
    },
    {
        id: "paso_11d_tab_estilo",
        getTargets: () => {
            asegurarModalConfigAbiertoEnTab('tab-estilo');
            const btnTab = document.querySelector("#modalConfig button[onclick*='tab-estilo']");
            return btnTab ? [btnTab] : [];
        },
        posicion: "right-panel",
        autoAvanzarTrasLectura: true,
        getTitulo: () => getTourText("tour-paso10-4-titulo", "🎨 Paso 10.4: Pestaña de Estilo y Diseño"),
        getInstruccion: () => getTourText("tour-paso10-4-inst", "En el apartado de <b>'Estilo'</b> puedes modificar el diseño del lector e incluso personalizar los colores del Karaoke o los botones que aparecen dentro del lector."),
        getDetalleExtra: () => getTourText("tour-paso10-4-det", "💡 Alterna entre el Modo Minimalista o Clásico y activa o desactiva el Modo Noche."),
        accionCondicional: (siguiente) => {
            asegurarModalConfigAbiertoEnTab('tab-estilo');
            const btnRendimiento = document.querySelector("#modalConfig button[onclick*='tab-rendimiento']");
            if (btnRendimiento) {
                targetCondicionalActivo = btnRendimiento;
                listenerCondicionalActivo = () => {
                    setTimeout(() => siguiente(), 250);
                };
                btnRendimiento.addEventListener('click', listenerCondicionalActivo, { once: true });
            }
        }
    },
    {
        id: "paso_11e_tab_rendimiento",
        getTargets: () => {
            asegurarModalConfigAbiertoEnTab('tab-rendimiento');
            const btnTab = document.querySelector("#modalConfig button[onclick*='tab-rendimiento']");
            return btnTab ? [btnTab] : [];
        },
        posicion: "right-panel",
        autoAvanzarTrasLectura: true,
        getTitulo: () => getTourText("tour-paso10-5-titulo", "⚡ Paso 10.5: Pestaña de Rendimiento"),
        getInstruccion: () => getTourText("tour-paso10-5-inst", "En el apartado de <b>'Rendimiento'</b> podrás jugar con los ajustes para mejorar la velocidad de lectura y la experiencia; considera que algunas de estas funciones pueden ser pesadas para tu equipo."),
        getDetalleExtra: () => getTourText("tour-paso10-5-det", "⚠️ Aquí puedes gestionar la precarga en RAM, hilos de CPU y motores de IA u OCR."),
        accionCondicional: (siguiente) => {
            asegurarModalConfigAbiertoEnTab('tab-rendimiento');
            const btnIdioma = document.getElementById('tab-idioma-btn') || document.querySelector("#modalConfig button[onclick*='tab-idioma']");
            if (btnIdioma) {
                targetCondicionalActivo = btnIdioma;
                listenerCondicionalActivo = () => {
                    setTimeout(() => siguiente(), 250);
                };
                btnIdioma.addEventListener('click', listenerCondicionalActivo, { once: true });
            }
        }
    },
    {
        id: "paso_11f_tab_idioma",
        getTargets: () => {
            asegurarModalConfigAbiertoEnTab('tab-idioma');
            const btnTab = document.getElementById('tab-idioma-btn') || document.querySelector("#modalConfig button[onclick*='tab-idioma']");
            return btnTab ? [btnTab] : [];
        },
        posicion: "right-panel",
        autoAvanzarTrasLectura: true,
        getTitulo: () => getTourText("tour-paso10-6-titulo", "🌐 Paso 10.6: Pestaña de Idioma"),
        getInstruccion: () => getTourText("tour-paso10-6-inst", "Y en el apartado de <b>'Idioma'</b> podrás seleccionar el idioma de la interfaz."),
        getDetalleExtra: () => getTourText("tour-paso10-6-det", "💡 Puedes cambiar el idioma de la aplicación en cualquier momento con un solo clic."),
        accionCondicional: (siguiente) => {
            asegurarModalConfigAbiertoEnTab('tab-idioma');
        }
    },
    {
        id: "paso_12_final",
        targetSelector: "body",
        sinSpotlightAnim: true,
        posicion: "center",
        getTitulo: () => getTourText("tour-paso12-final-titulo", "🎉 ¡Tour Completado!"),
        getInstruccion: () => getTourText("tour-paso12-final-inst", "¡Felicidades, has completado el tutorial de LiraLoud! Al pulsar en <b>'Finalizar Tour'</b>, la aplicación se reiniciará limpiamente para que comiences a disfrutar de tus lecturas."),
        getDetalleExtra: () => getTourText("tour-paso12-final-det", "🔄 Todo el entorno de demostración se limpiará automáticamente al finalizar."),
        accionCondicional: (siguiente) => {
            document.body.classList.remove('tour-config-abierto');
            const modalCfg = document.getElementById('modalConfig');
            if (modalCfg) modalCfg.style.display = 'none';
        }
    }
];

const PASOS_TOUR_GUI = [...PASOS_LECTURA, ...PASOS_HERRAMIENTAS];
window.PASOS_HERRAMIENTAS = PASOS_HERRAMIENTAS;
window.PASOS_TOUR_GUI = PASOS_TOUR_GUI;
