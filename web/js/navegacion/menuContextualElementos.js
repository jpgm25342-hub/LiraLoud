/* LiraLoud
 * Menú contextual para manipulación de elementos PDF (Imágenes y Cuadros de Texto FreeText)
 */

(function () {
    const MENU_ID = 'menu-contextual-elementos';
    const SUBMENU_ID = 'submenu-rotar-elementos';

    const ICONOS = {
        reemplazar: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
        rotar: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>`,
        chevron: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`,
        estilo: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18v-9h9"/></svg>`,
        capas: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
        rotarLibre: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a8 8 0 1 1-1.9-8.5"/><polyline points="19 3 19 8 14 8"/></svg>`,
        eliminar: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`
    };

    let listenersGlobalesRegistrados = false;
    let elementoContextualActual = null;

    function txt(key, fallback) {
        if (typeof window.t === 'function') {
            return window.t(key, fallback);
        }
        return fallback;
    }

    function obtenerOCrearMenu() {
        let menu = document.getElementById(MENU_ID);
        if (!menu) {
            menu = document.createElement('div');
            menu.id = MENU_ID;
            menu.className = 'menu-contextual-custom';
            menu.setAttribute('role', 'menu');
            menu.addEventListener('contextmenu', (e) => e.preventDefault());
            document.body.appendChild(menu);
        }
        registrarListenersGlobales();
        return menu;
    }

    function registrarListenersGlobales() {
        if (listenersGlobalesRegistrados) return;
        listenersGlobalesRegistrados = true;

        document.addEventListener('mousedown', (e) => {
            const menu = document.getElementById(MENU_ID);
            if (!menu || menu.style.display === 'none' || !menu.style.display) return;
            if (!menu.contains(e.target)) {
                cerrarMenuContextualElementos();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                cerrarMenuContextualElementos();
            }
        });

        document.addEventListener('scroll', () => {
            cerrarMenuContextualElementos();
        }, true);

        window.addEventListener('resize', cerrarMenuContextualElementos);
        window.addEventListener('blur', cerrarMenuContextualElementos);
    }

    function posicionarSubmenu(rowRotar, submenu) {
        if (!rowRotar || !submenu) return;
        submenu.classList.remove('flip-left');
        submenu.style.top = '-4px';

        const rowRect = rowRotar.getBoundingClientRect();
        const subW = submenu.offsetWidth || 170;
        const subH = submenu.offsetHeight || 180;

        if (rowRect.right + subW > window.innerWidth - 8) {
            submenu.classList.add('flip-left');
        }
        const overflowBottom = rowRect.top + subH - (window.innerHeight - 8);
        if (overflowBottom > 0) {
            submenu.style.top = Math.max(-rowRect.top + 8, -4 - overflowBottom) + 'px';
        }
    }

    function construirItem(labelHtml, extraClass, onClick) {
        const div = document.createElement('div');
        div.className = 'item-menu' + (extraClass ? ' ' + extraClass : '');
        div.setAttribute('role', 'menuitem');
        div.innerHTML = labelHtml;
        div.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof onClick === 'function') onClick(e);
        });
        return div;
    }

    function construirSubmenu(submenuId, accionName, iconoHtml, titulo, subItems) {
        const row = document.createElement('div');
        row.className = 'item-menu ctx-has-submenu';
        row.setAttribute('role', 'menuitem');
        row.setAttribute('aria-haspopup', 'true');
        row.dataset.accion = accionName;
        row.innerHTML = `<span class="ctx-item-label">${iconoHtml}<span>${titulo}</span></span>${ICONOS.chevron}`;

        const submenu = document.createElement('div');
        submenu.id = submenuId;
        submenu.className = 'ctx-submenu-flotante';
        submenu.setAttribute('role', 'menu');
        subItems.forEach((it) => submenu.appendChild(it));

        row.appendChild(submenu);
        row.addEventListener('mouseenter', () => {
            row.classList.add('abierto');
            posicionarSubmenu(row, submenu);
        });
        row.addEventListener('mouseleave', () => {
            row.classList.remove('abierto');
        });
        row.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            row.classList.toggle('abierto');
            if (row.classList.contains('abierto')) {
                posicionarSubmenu(row, submenu);
            }
        });
        return row;
    }

    function abrirMenuContextualElemento(elemento, clientX, clientY) {
        if (!elemento) return;
        const tipo = elemento.tipo;
        if (tipo !== 'imagen' && tipo !== 'freetext' && tipo !== 'figura') return;

        elementoContextualActual = elemento;
        const menu = obtenerOCrearMenu();
        menu.innerHTML = '';

        if (tipo === 'figura') {
            const itemEstilo = construirItem(
                `<span class="ctx-item-label">${ICONOS.estilo}<span>${txt('ctx-figura-estilo', 'Cambiar estilo y color')}</span></span>`,
                '',
                () => {
                    cerrarMenuContextualElementos();
                    if (typeof window.abrirPopoverEstiloFigura === 'function') {
                        window.abrirPopoverEstiloFigura(elemento);
                    }
                }
            );
            itemEstilo.dataset.accion = 'estilo';
            menu.appendChild(itemEstilo);
        }

        if (tipo === 'imagen') {
            // 1. Reemplazar imagen
            const itemReemplazar = construirItem(
                `<span class="ctx-item-label">${ICONOS.reemplazar}<span>${txt('ctx-mover-reemplazar', 'Reemplazar imagen')}</span></span>`,
                '',
                () => {
                    cerrarMenuContextualElementos();
                    if (typeof window.reemplazarImagenElementoMover === 'function') {
                        window.reemplazarImagenElementoMover(elemento);
                    }
                }
            );
            itemReemplazar.dataset.accion = 'reemplazar';
            menu.appendChild(itemReemplazar);

            // 2. Rotar (submenú)
            const angulos = [
                { key: 'ctx-mover-rotar-90', label: '90° derecha', deg: 90 },
                { key: 'ctx-mover-rotar-neg90', label: '-90° izquierda', deg: -90 },
                { key: 'ctx-mover-rotar-180', label: '180°', deg: 180 },
                { key: 'ctx-mover-rotar-270', label: '270°', deg: 270 }
            ];

            const subItemsRotar = angulos.map((op) => {
                const subItem = construirItem(
                    `<span class="ctx-item-label"><span>${txt(op.key, op.label)}</span></span>`,
                    '',
                    () => {
                        cerrarMenuContextualElementos();
                        if (typeof window.rotarImagenElementoMover === 'function') {
                            window.rotarImagenElementoMover(elemento, op.deg);
                        }
                    }
                );
                subItem.dataset.angulo = String(op.deg);
                return subItem;
            });

            const itemRotarLibre = construirItem(
                `<span class="ctx-item-label">${ICONOS.rotarLibre}<span>${txt('ctx-mover-rotar-libre', 'Rotación libre')}</span></span>`,
                'borde-top',
                () => {
                    cerrarMenuContextualElementos();
                    if (typeof window.iniciarRotacionLibreElemento === 'function') {
                        window.iniciarRotacionLibreElemento(elemento);
                    }
                }
            );
            itemRotarLibre.dataset.accion = 'rotar-libre';
            subItemsRotar.push(itemRotarLibre);

            menu.appendChild(
                construirSubmenu(SUBMENU_ID, 'rotar', ICONOS.rotar, txt('ctx-mover-rotar', 'Rotar'), subItemsRotar)
            );
        }

        // 2b. Capas (debajo de Rotar; aplica a imagen, figura y cuadro de texto)
        const opcionesCapas = [
            { accion: 'frente', key: 'ctx-capa-frente', label: 'Traer al frente' },
            { accion: 'subir', key: 'ctx-capa-subir', label: 'Subir una capa' },
            { accion: 'bajar', key: 'ctx-capa-bajar', label: 'Bajar una capa' },
            { accion: 'fondo', key: 'ctx-capa-fondo', label: 'Enviar al fondo' }
        ];
        const subItemsCapas = opcionesCapas.map((op) => {
            const subItem = construirItem(
                `<span class="ctx-item-label"><span>${txt(op.key, op.label)}</span></span>`,
                '',
                () => {
                    cerrarMenuContextualElementos();
                    if (typeof window.cambiarCapaElementoMover === 'function') {
                        window.cambiarCapaElementoMover(elemento, op.accion);
                    }
                }
            );
            subItem.dataset.capa = op.accion;
            return subItem;
        });
        menu.appendChild(
            construirSubmenu('submenu-capas-elementos', 'capas', ICONOS.capas, txt('ctx-mover-capas', 'Capas'), subItemsCapas)
        );

        // 3. Eliminar (para imagen, freetext y figura)
        const itemEliminar = construirItem(
            `<span class="ctx-item-label">${ICONOS.eliminar}<span>${txt('ctx-mover-eliminar', 'Eliminar')}</span></span>`,
            'borde-top ctx-item-peligro',
            () => {
                cerrarMenuContextualElementos();
                if (typeof window.eliminarElementoMover === 'function') {
                    window.eliminarElementoMover(elemento);
                }
            }
        );
        itemEliminar.dataset.accion = 'eliminar';
        menu.appendChild(itemEliminar);

        menu.style.display = 'block';
        menu.style.left = '0px';
        menu.style.top = '0px';

        const menuW = menu.offsetWidth || 195;
        const menuH = menu.offsetHeight || 120;
        const left = Math.max(8, Math.min(window.innerWidth - menuW - 8, clientX));
        const top = Math.max(8, Math.min(window.innerHeight - menuH - 8, clientY));

        menu.style.left = Math.round(left) + 'px';
        menu.style.top = Math.round(top) + 'px';
    }

    function cerrarMenuContextualElementos() {
        const menu = document.getElementById(MENU_ID);
        if (menu) {
            menu.style.display = 'none';
            menu.querySelectorAll('.ctx-has-submenu.abierto').forEach((el) => {
                el.classList.remove('abierto');
            });
        }
        elementoContextualActual = null;
    }

    window.abrirMenuContextualElemento = abrirMenuContextualElemento;
    window.cerrarMenuContextualElementos = cerrarMenuContextualElementos;
    window.obtenerElementoContextualActual = () => elementoContextualActual;
})();
