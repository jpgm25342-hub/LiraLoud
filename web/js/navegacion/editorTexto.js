/* LiraLoud
 * Módulo de Edición In-Place para PDFs (Estilo Acrobat Reader)
 */

window.modoEditorTextoActivo = false;
window.catalogoFuentesEditor = [];
let bloquesEditor = [];
let dragInfo = null;
let editorSelectionChangeHandler = null;

// Resize handler para recalcular overlays al cambiar tamaño de ventana
let editorResizeHandler = null;

function normalizarClaveFamiliaJS(nombre) {
    return String(nombre || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function limpiarNombreFuenteJS(nombreRaw) {
    if (!nombreRaw) return 'Helvetica';
    let s = String(nombreRaw).trim().replace(/^[A-Z]{6}\+/, '');
    const mapBase = {
        helv: 'Helvetica',
        hebo: 'Helvetica',
        heit: 'Helvetica',
        hebi: 'Helvetica',
        tiro: 'Times New Roman',
        tibo: 'Times New Roman',
        tiit: 'Times New Roman',
        tibi: 'Times New Roman',
        cour: 'Courier New',
        cobo: 'Courier New',
        coit: 'Courier New',
        cobi: 'Courier New',
        symb: 'Symbol',
        zadb: 'ZapfDingbats'
    };
    if (mapBase[s.toLowerCase()]) return mapBase[s.toLowerCase()];
    s = s.replace(/[-,](BoldItalic|BoldOblique|Bold|Italic|Oblique|Regular|Roman|MediumItalic|Medium|SemiBoldItalic|SemiBold|LightItalic|Light|ExtraBold|Black|PSMT|MT)$/i, '');
    s = s.replace(/(PSMT|MT)$/i, '');
    s = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return s || 'Helvetica';
}

async function cargarCatalogoFuentesEditor(forzar = false) {
    if (!forzar && Array.isArray(window.catalogoFuentesEditor) && window.catalogoFuentesEditor.length > 0) {
        return window.catalogoFuentesEditor;
    }
    if (typeof eel !== 'undefined' && typeof eel.listar_fuentes_editor === 'function') {
        try {
            const res = await eel.listar_fuentes_editor()();
            if (res && res.success && Array.isArray(res.fuentes)) {
                window.catalogoFuentesEditor = res.fuentes;
                return window.catalogoFuentesEditor;
            }
        } catch (err) {
            console.warn('[Editor] Aviso al listar fuentes del backend:', err);
        }
    }
    if (!Array.isArray(window.catalogoFuentesEditor) || window.catalogoFuentesEditor.length === 0) {
        window.catalogoFuentesEditor = [
            { familia: 'Arial', clave: 'arial', instalada: true, descargable: false },
            { familia: 'Helvetica', clave: 'helvetica', instalada: true, descargable: false },
            { familia: 'Times New Roman', clave: 'timesnewroman', instalada: true, descargable: false },
            { familia: 'Courier New', clave: 'couriernew', instalada: true, descargable: false },
            { familia: 'Georgia', clave: 'georgia', instalada: true, descargable: false },
            { familia: 'Verdana', clave: 'verdana', instalada: true, descargable: false }
        ];
    }
    return window.catalogoFuentesEditor;
}

function buscarInfoFuenteCatalogo(nombreFamilia) {
    const clave = normalizarClaveFamiliaJS(nombreFamilia);
    if (!clave) return null;
    const lista = Array.isArray(window.catalogoFuentesEditor) ? window.catalogoFuentesEditor : [];
    return lista.find(f => (f.clave === clave) || (normalizarClaveFamiliaJS(f.familia) === clave)) || null;
}

function calcularLuminanciaHex(hexColor) {
    const rgb = hexToRgb255(hexColor);
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

function hexToRgb255(hex) {
    if (!hex || typeof hex !== 'string') return [0, 0, 0];
    let clean = hex.trim().replace(/^#/, '');
    if (clean.length === 3) {
        clean = clean.split('').map(c => c + c).join('');
    }
    if (clean.length !== 6) return [0, 0, 0];
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return [
        Number.isFinite(r) ? r : 0,
        Number.isFinite(g) ? g : 0,
        Number.isFinite(b) ? b : 0
    ];
}

function normalizarColorHex(colorVal) {
    if (!colorVal) return '#000000';
    if (typeof colorVal === 'string') {
        const s = colorVal.trim();
        if (s.startsWith('#')) {
            if (s.length === 4) {
                return '#' + s.slice(1).split('').map(c => c + c).join('').toLowerCase();
            }
            return s.slice(0, 7).toLowerCase();
        }
        const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (m) {
            const r = Math.max(0, Math.min(255, parseInt(m[1], 10))).toString(16).padStart(2, '0');
            const g = Math.max(0, Math.min(255, parseInt(m[2], 10))).toString(16).padStart(2, '0');
            const b = Math.max(0, Math.min(255, parseInt(m[3], 10))).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
    }
    return rgbPdfToHex(colorVal).toLowerCase();
}

function actualizarContrasteBotonColor(btnColorApply, hexColor) {
    if (!btnColorApply) return;
    const hex = normalizarColorHex(hexColor);
    const lum = calcularLuminanciaHex(hex);
    btnColorApply.style.background = hex;
    if (lum > 165) {
        btnColorApply.style.color = '#0f172a';
        btnColorApply.style.borderColor = '#64748b';
        btnColorApply.style.textShadow = 'none';
    } else {
        btnColorApply.style.color = '#f8fafc';
        btnColorApply.style.borderColor = '#3d444d';
        btnColorApply.style.textShadow = '0 1px 1px rgba(0,0,0,0.45)';
    }
}

function actualizarContrasteEditor(editorArea, colorFallback = '#000000') {
    if (!editorArea) return;
    const spans = Array.from(editorArea.querySelectorAll('.editor-rich-span'));
    const colores = [];
    spans.forEach(sp => {
        if ((sp.textContent || '').replace(/\u200B/g, '').trim().length > 0) {
            colores.push(normalizarColorHex(sp.dataset.color || sp.style.color || colorFallback));
        }
    });
    if (colores.length === 0) {
        colores.push(normalizarColorHex(editorArea.dataset.fontColor || colorFallback));
    }

    const luminancias = colores.map(c => calcularLuminanciaHex(c));
    const tieneMuyClaro = luminancias.some(l => l > 180);
    const tieneMuyOscuro = luminancias.some(l => l < 80);
    const todosClaros = luminancias.every(l => l > 165);

    if (tieneMuyClaro && tieneMuyOscuro) {
        editorArea.style.background = '#64748b';
        editorArea.style.caretColor = '#f8fafc';
    } else if (todosClaros) {
        editorArea.style.background = '#1e293b';
        editorArea.style.caretColor = '#38bdf8';
    } else {
        editorArea.style.background = '#ffffff';
        editorArea.style.caretColor = '#0f172a';
    }
}

const _MODOS_A_DESACTIVAR_EDITOR = [
    ['modoBorradorActivo', () => typeof toggleModoBorrador === 'function' && toggleModoBorrador(false)],
    ['modoSubrayadorActivo', () => typeof toggleModoSubrayador === 'function' && toggleModoSubrayador(false)],
    ['modoCuadroTextoActivo', () => typeof activarModoCuadroTexto === 'function' && activarModoCuadroTexto(false)],
    ['modoRecorteActivo', () => typeof toggleModoRecorteExtraccion === 'function' && toggleModoRecorteExtraccion(false)],
    ['modoMoverElementosActivo', () => typeof toggleModoMoverElementos === 'function' && toggleModoMoverElementos(false)],
    ['capturandoCorte', () => typeof toggleCapturaCorte === 'function' && toggleCapturaCorte(false)]
];

function _desactivarOtrosModosEditor() {
    _MODOS_A_DESACTIVAR_EDITOR.forEach(([flag, fn]) => {
        if (window[flag]) fn();
    });
    const chkLimites = document.getElementById('chk-dibujar-limites');
    if (chkLimites && chkLimites.checked) {
        chkLimites.checked = false;
        if (typeof toggleDibujoLimites === 'function') toggleDibujoLimites(false);
    }
}

function _actualizarBotonesUIEditorTexto(activo) {
    const btnGroup = document.getElementById('group-text-editor');
    if (btnGroup) btnGroup.classList.toggle('active', activo);
    const btn = document.getElementById('btn-text-editor');
    if (btn) {
        btn.classList.toggle('activo', activo);
        btn.classList.toggle('active', activo);
    }
    const btnZen = document.getElementById('btn-edit-pdf');
    if (btnZen) btnZen.classList.toggle('activo', activo);
    document.querySelectorAll('.zen-item-editor-texto').forEach(el => {
        el.classList.toggle('tool-active-underline', activo);
    });
    if (typeof window.actualizarEstadoInteractivoCapaSoloLectura === 'function') {
        window.actualizarEstadoInteractivoCapaSoloLectura();
    }
}

function toggleModoEditorTexto(activo) {
    console.log('[Editor] toggleModo activo=', activo);
    console.log('[Editor] rutaPDFActual=', typeof rutaPDFActual !== 'undefined' ? rutaPDFActual : 'NO DEFINIDA');
    console.log('[Editor] paginaActual=', typeof paginaActual !== 'undefined' ? paginaActual : 'NO DEFINIDA');
    window.modoEditorTextoActivo = activo;
    const capa = document.getElementById('lira-pdf-text-editor-layer');
    _actualizarBotonesUIEditorTexto(activo);

    if (activo) {
        if (capa) capa.classList.add('activo');
        _desactivarOtrosModosEditor();
        cargarCatalogoFuentesEditor(false);
        renderizarBloquesEditor();

        if (!editorResizeHandler) {
            editorResizeHandler = () => {
                if (window.modoEditorTextoActivo) {
                    cargarCatalogoFuentesEditor(false);
                    renderizarBloquesEditor();
                }
            };
            window.addEventListener('resize', editorResizeHandler);
        }
    } else {
        if (capa) {
            capa.classList.remove('activo');
            capa.innerHTML = '';
        }
        cerrarEditorTexto();
        if (editorResizeHandler) {
            window.removeEventListener('resize', editorResizeHandler);
            editorResizeHandler = null;
        }
    }
}

async function renderizarBloquesEditor() {
    console.log('[Editor] Iniciando renderizarBloquesEditor');
    if (typeof rutaPDFActual === 'undefined' || !rutaPDFActual) { console.error('[Editor] Abortado: rutaPDFActual es inválida'); return; }
    const capa = document.getElementById('lira-pdf-text-editor-layer');
    if (!capa) return;
    capa.innerHTML = '';

    try {
        console.log('[Editor] Pidiendo bloques a python...');
        let res = await eel.obtener_bloques_texto_pagina(rutaPDFActual, paginaActual)();
        console.log('[Editor] Respuesta bloques:', res);
        if (res && res.success && res.bloques) {
            bloquesEditor = res.bloques;
            bloquesEditor.forEach(b => {
                let r = calcRectCanvas(b.bbox);
                console.log('[Editor] Rect calculado para span:', r);
                let div = document.createElement('div');
                div.className = 'bbox-overlay';
                // Usar área de clic ampliada para facilitar selección de textos pequeños
                div.style.left = r.clickX + 'px';
                div.style.top = r.clickY + 'px';
                div.style.width = r.clickW + 'px';
                div.style.height = r.clickH + 'px';
                // Guardar rect visual preciso para el editor
                div.dataset.visualX = r.x;
                div.dataset.visualY = r.y;
                div.dataset.visualW = r.w;
                div.dataset.visualH = r.h;

                
                div.onclick = (e) => {
                    e.stopPropagation();
                    // Reconstruir rect visual preciso para el editor
                    const rectVisual = {
                        x: parseFloat(div.dataset.visualX),
                        y: parseFloat(div.dataset.visualY),
                        w: parseFloat(div.dataset.visualW),
                        h: parseFloat(div.dataset.visualH)
                    };
                    abrirEditorTexto(b, rectVisual);
                };
                
                capa.appendChild(div);
            });
        }
    } catch(e) {
        console.error("Error al obtener bloques para edición:", e);
    }
}

function _obtenerContextoProyeccionEditor() {
    const memPag = (typeof memoriaLayout !== 'undefined' && memoriaLayout) ? memoriaLayout[paginaActual.toString()] : null;
    const baseEscala = memPag?.escala || (typeof datosPagina !== 'undefined' && datosPagina?.factor_zoom) || 0;
    if (!baseEscala) return null;

    const wrapper = document.getElementById('pdf-crop-wrapper');
    const canvas = document.getElementById('lienzo-pdf');
    const container = document.getElementById('visor-container');
    if (!wrapper || !canvas || !container) return null;

    const sc = baseEscala * (typeof nivelZoomPDF !== 'undefined' ? nivelZoomPDF : 1.0);
    return { wrapper, canvas, container, sc };
}

function calcRectCanvas(bboxPdf) {
    const ctx = _obtenerContextoProyeccionEditor();
    if (!ctx) return { x: 0, y: 0, w: 0, h: 0 };

    const { wrapper, canvas, sc } = ctx;
    const x0 = bboxPdf[0] * sc;
    const y0 = bboxPdf[1] * sc;
    const w = Math.max(bboxPdf[2] * sc - x0, 1);
    const h = Math.max(bboxPdf[3] * sc - y0, 1);

    const visual = {
        x: wrapper.offsetLeft + canvas.offsetLeft + x0,
        y: wrapper.offsetTop + canvas.offsetTop + y0,
        w,
        h
    };

    const CLICK_MIN = 24;
    const clickW = Math.max(w, CLICK_MIN);
    const clickH = Math.max(h, CLICK_MIN);
    return {
        ...visual,
        clickX: visual.x + (w - clickW) / 2,
        clickY: visual.y + (h - clickH) / 2,
        clickW,
        clickH
    };
}

function pdfRectFromCanvas(rectVisual) {
    const ctx = _obtenerContextoProyeccionEditor();
    if (!ctx) return [0, 0, 0, 0];

    const { wrapper, canvas, container, sc } = ctx;
    const containerRect = container.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const canvasLeft = (typeof canvas.offsetLeft === 'number') ? canvas.offsetLeft : (parseFloat(canvas.style.left) || 0);
    const canvasTop = (typeof canvas.offsetTop === 'number') ? canvas.offsetTop : (parseFloat(canvas.style.top) || 0);

    const wrapperLeft = wrapperRect.left - containerRect.left + (container.scrollLeft || 0) - (container.clientLeft || 0);
    const wrapperTop = wrapperRect.top - containerRect.top + (container.scrollTop || 0) - (container.clientTop || 0);

    return [
        (rectVisual.x - wrapperLeft - canvasLeft) / sc,
        (rectVisual.y - wrapperTop - canvasTop) / sc,
        (rectVisual.x + rectVisual.w - wrapperLeft - canvasLeft) / sc,
        (rectVisual.y + rectVisual.h - wrapperTop - canvasTop) / sc
    ];
}

function poblarSelectFuentesEditor(selFuente, familiasExtra = [], seleccionActual = '') {
    if (!selFuente) return '';
    const catalogo = Array.isArray(window.catalogoFuentesEditor) ? window.catalogoFuentesEditor : [];
    const clavesCatalogo = new Set(catalogo.map(f => f.clave || normalizarClaveFamiliaJS(f.familia)));

    const extrasUnicas = [];
    const clavesExtras = new Set();
    familiasExtra.forEach(fam => {
        const limpia = limpiarNombreFuenteJS(fam);
        const clave = normalizarClaveFamiliaJS(limpia);
        if (limpia && clave && !clavesCatalogo.has(clave) && !clavesExtras.has(clave)) {
            clavesExtras.add(clave);
            extrasUnicas.push(limpia);
        }
    });

    selFuente.innerHTML = '';

    if (extrasUnicas.length > 0) {
        const grpPdf = document.createElement('optgroup');
        grpPdf.label = 'Detectadas en PDF';
        extrasUnicas.forEach(fam => {
            const opt = document.createElement('option');
            opt.value = fam;
            opt.textContent = `${fam} (En PDF)`;
            grpPdf.appendChild(opt);
        });
        selFuente.appendChild(grpPdf);
    }

    const instaladas = catalogo.filter(f => f.instalada);
    if (instaladas.length > 0) {
        const grpInst = document.createElement('optgroup');
        grpInst.label = 'Instaladas (Sistema / Local)';
        instaladas.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.familia;
            opt.textContent = f.familia;
            grpInst.appendChild(opt);
        });
        selFuente.appendChild(grpInst);
    }

    const descargables = catalogo.filter(f => !f.instalada && f.descargable);
    if (descargables.length > 0) {
        const grpDesc = document.createElement('optgroup');
        grpDesc.label = 'Descargables (Catálogo)';
        descargables.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.familia;
            opt.textContent = `⬇ ${f.familia}`;
            grpDesc.appendChild(opt);
        });
        selFuente.appendChild(grpDesc);
    }

    return seleccionarFamiliaEnSelect(selFuente, seleccionActual);
}

function seleccionarFamiliaEnSelect(selFuente, nombreFamilia) {
    if (!selFuente) return 'Helvetica';
    const limpia = limpiarNombreFuenteJS(nombreFamilia || 'Helvetica');
    const claveBuscada = normalizarClaveFamiliaJS(limpia);
    const opciones = Array.from(selFuente.options);

    let match = opciones.find(o => o.value === limpia)
        || opciones.find(o => normalizarClaveFamiliaJS(o.value) === claveBuscada);

    if (!match && limpia) {
        let grpPdf = selFuente.querySelector('optgroup[label="Detectadas en PDF"]');
        if (!grpPdf) {
            grpPdf = document.createElement('optgroup');
            grpPdf.label = 'Detectadas en PDF';
            selFuente.insertBefore(grpPdf, selFuente.firstChild);
        }
        const opt = document.createElement('option');
        opt.value = limpia;
        opt.textContent = `${limpia} (En PDF)`;
        grpPdf.appendChild(opt);
        match = opt;
    }

    if (match) {
        selFuente.value = match.value;
        return match.value;
    }
    return selFuente.value || 'Helvetica';
}

function aplicarEstilosSpanDOM(span) {
    const fam = span.dataset.fuente || 'Helvetica';
    const tam = Math.max(4, parseFloat(span.dataset.tamano) || 12);
    const col = normalizarColorHex(span.dataset.color || '#000000');
    const neg = span.dataset.negrita === '1';
    const cur = span.dataset.cursiva === '1';
    const sub = span.dataset.subrayado === '1';

    span.style.fontFamily = getFontFamilyName(fam);
    span.style.fontSize = `${tam}px`;
    span.style.color = col;
    span.style.fontWeight = neg ? '700' : '400';
    span.style.fontStyle = cur ? 'italic' : 'normal';
    span.style.textDecoration = sub ? 'underline' : 'none';
}

function _aplicarMetaASpanDOM(span, meta) {
    span.dataset.fuente = limpiarNombreFuenteJS(meta.fuente_limpia || meta.fuente || 'Helvetica');
    span.dataset.tamano = String(Number(meta.tamano || 12));
    span.dataset.color = normalizarColorHex(meta.color || '#000000');
    span.dataset.negrita = meta.negrita ? '1' : '0';
    span.dataset.cursiva = meta.cursiva ? '1' : '0';
    span.dataset.subrayado = meta.subrayado ? '1' : '0';
    aplicarEstilosSpanDOM(span);
}

function crearSpanDOM(meta) {
    const span = document.createElement('span');
    span.className = 'editor-rich-span';
    span.textContent = meta.texto ?? '';
    _aplicarMetaASpanDOM(span, meta);
    return span;
}

function leerMetaDeSpanDOM(el, fallback) {
    if (!el || !el.dataset) return { ...fallback };
    return {
        fuente: limpiarNombreFuenteJS(el.dataset.fuente || fallback.fuente || 'Helvetica'),
        tamano: parseFloat(el.dataset.tamano) || fallback.tamano || 12,
        color: normalizarColorHex(el.dataset.color || el.style?.color || fallback.color || '#000000'),
        negrita: el.dataset.negrita !== undefined ? el.dataset.negrita === '1' : Boolean(fallback.negrita),
        cursiva: el.dataset.cursiva !== undefined ? el.dataset.cursiva === '1' : Boolean(fallback.cursiva),
        subrayado: el.dataset.subrayado !== undefined ? el.dataset.subrayado === '1' : Boolean(fallback.subrayado)
    };
}

function mismoEstiloSegmento(a, b) {
    return normalizarClaveFamiliaJS(a.fuente) === normalizarClaveFamiliaJS(b.fuente)
        && Math.abs(Number(a.tamano) - Number(b.tamano)) < 0.05
        && normalizarColorHex(a.color) === normalizarColorHex(b.color)
        && Boolean(a.negrita) === Boolean(b.negrita)
        && Boolean(a.cursiva) === Boolean(b.cursiva)
        && Boolean(a.subrayado) === Boolean(b.subrayado);
}

function fusionarSegmentosContiguos(segmentos) {
    const res = [];
    segmentos.forEach(seg => {
        if (!seg || seg.texto === undefined || seg.texto === null || seg.texto === '') return;
        const limpio = {
            texto: String(seg.texto),
            fuente: limpiarNombreFuenteJS(seg.fuente || 'Helvetica'),
            tamano: Number(seg.tamano || 12),
            color: normalizarColorHex(seg.color || '#000000'),
            negrita: Boolean(seg.negrita),
            cursiva: Boolean(seg.cursiva),
            subrayado: Boolean(seg.subrayado)
        };
        if (res.length > 0 && mismoEstiloSegmento(res[res.length - 1], limpio)) {
            res[res.length - 1].texto += limpio.texto;
        } else {
            res.push(limpio);
        }
    });
    return res;
}

function _heredarMetaElementoEditor(nodo, tag, metaActual) {
    if (nodo.classList && nodo.classList.contains('editor-rich-span')) {
        return leerMetaDeSpanDOM(nodo, metaActual);
    }
    const nuevoMeta = { ...metaActual };
    if (tag === 'B' || tag === 'STRONG') nuevoMeta.negrita = true;
    if (tag === 'I' || tag === 'EM') nuevoMeta.cursiva = true;
    if (tag === 'U') nuevoMeta.subrayado = true;
    if (nodo.style && nodo.style.color) nuevoMeta.color = normalizarColorHex(nodo.style.color);
    return nuevoMeta;
}

function _recorrerNodoSegmentosEditor(nodo, metaActual, editorArea, raw) {
    if (!nodo) return;
    if (nodo.nodeType === Node.TEXT_NODE) {
        const txt = (nodo.nodeValue || '').replace(/\u200B/g, '');
        if (txt.length > 0) raw.push({ ...metaActual, texto: txt });
        return;
    }
    if (nodo.nodeType !== Node.ELEMENT_NODE) return;

    const tag = nodo.tagName.toUpperCase();
    if (tag === 'BR') {
        raw.push({ ...metaActual, texto: '\n' });
        return;
    }

    const nuevoMeta = _heredarMetaElementoEditor(nodo, tag, metaActual);
    if ((tag === 'DIV' || tag === 'P') && nodo !== editorArea && raw.length > 0) {
        if (!raw[raw.length - 1].texto.endsWith('\n')) {
            raw.push({ ...nuevoMeta, texto: '\n' });
        }
    }

    Array.from(nodo.childNodes).forEach(h => _recorrerNodoSegmentosEditor(h, nuevoMeta, editorArea, raw));
}

function extraerSegmentosPlanos(editorArea, fallbackMeta) {
    const raw = [];
    _recorrerNodoSegmentosEditor(editorArea, fallbackMeta, editorArea, raw);
    return fusionarSegmentosContiguos(raw);
}

function renderizarSegmentosEnEditor(editorArea, segmentos, fallbackMeta) {
    editorArea.innerHTML = '';
    const lista = (Array.isArray(segmentos) && segmentos.length > 0)
        ? fusionarSegmentosContiguos(segmentos)
        : [{ ...fallbackMeta, texto: '' }];

    lista.forEach(seg => {
        editorArea.appendChild(crearSpanDOM(seg));
    });
}

function obtenerOffsetsSeleccionEnEditor(editorArea, range) {
    if (!editorArea || !range) return null;
    if (!editorArea.contains(range.commonAncestorContainer)) return null;

    let start = 0;
    let end = 0;
    try {
        const rStart = document.createRange();
        rStart.selectNodeContents(editorArea);
        rStart.setEnd(range.startContainer, range.startOffset);
        start = rStart.toString().replace(/\u200B/g, '').length;

        const rEnd = document.createRange();
        rEnd.selectNodeContents(editorArea);
        rEnd.setEnd(range.endContainer, range.endOffset);
        end = rEnd.toString().replace(/\u200B/g, '').length;
    } catch (e) {
        return null;
    }
    if (end < start) {
        const tmp = start;
        start = end;
        end = tmp;
    }
    return { start, end };
}

function _resolverLimitesTextoPorOffsets(editorArea, startOffset, endOffset) {
    const walker = document.createTreeWalker(editorArea, NodeFilter.SHOW_TEXT, null);
    let nodo;
    let acumulado = 0;
    let startNode = null;
    let startLocal = 0;
    let endNode = null;
    let endLocal = 0;
    let ultimoTextNode = null;

    while ((nodo = walker.nextNode())) {
        ultimoTextNode = nodo;
        const len = (nodo.nodeValue || '').length;
        if (!startNode && startOffset <= acumulado + len) {
            startNode = nodo;
            startLocal = Math.max(0, startOffset - acumulado);
        }
        if (!endNode && endOffset <= acumulado + len) {
            endNode = nodo;
            endLocal = Math.max(0, endOffset - acumulado);
            break;
        }
        acumulado += len;
    }

    const fallbackLen = ultimoTextNode ? (ultimoTextNode.nodeValue || '').length : 0;
    return {
        startNode: startNode || ultimoTextNode,
        startLocal: startNode ? startLocal : fallbackLen,
        endNode: endNode || ultimoTextNode,
        endLocal: endNode ? endLocal : fallbackLen
    };
}

function restaurarSeleccionPorOffsets(editorArea, startOffset, endOffset) {
    if (!editorArea) return null;
    const { startNode, startLocal, endNode, endLocal } = _resolverLimitesTextoPorOffsets(editorArea, startOffset, endOffset);

    const range = document.createRange();
    if (startNode && endNode) {
        range.setStart(startNode, startLocal);
        range.setEnd(endNode, endLocal);
    } else {
        range.selectNodeContents(editorArea);
        range.collapse(false);
    }

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return range.cloneRange();
}

function _normalizarSpanInicialEditor(sp, bloquePdf, defaults) {
    return {
        texto: sp.texto ?? '',
        fuente: limpiarNombreFuenteJS(sp.fuente_limpia || sp.fuente || defaults.familiaInicial),
        tamano: Number(sp.tamano || defaults.tamanoInicial),
        color: normalizarColorHex(rgbPdfToHex(sp.color || bloquePdf.color)),
        negrita: sp.negrita !== undefined ? Boolean(sp.negrita) : defaults.negritaInicial,
        cursiva: sp.cursiva !== undefined ? Boolean(sp.cursiva) : defaults.cursivaInicial,
        subrayado: Boolean(sp.subrayado)
    };
}

function _construirSpansInicialesEditor(bloquePdf) {
    const familiaInicial = limpiarNombreFuenteJS(bloquePdf.fuente_limpia || bloquePdf.fuente || 'Helvetica');
    const tamanoInicial = Number(bloquePdf.tamano || 12);
    const colorInicial = normalizarColorHex(rgbPdfToHex(bloquePdf.color));
    const negritaInicial = Boolean((bloquePdf.flags || 0) & 16);
    const cursivaInicial = Boolean((bloquePdf.flags || 0) & 2);
    const defaults = { familiaInicial, tamanoInicial, negritaInicial, cursivaInicial };

    const spansIniciales = (Array.isArray(bloquePdf.spans) && bloquePdf.spans.length > 0)
        ? bloquePdf.spans.map(sp => _normalizarSpanInicialEditor(sp, bloquePdf, defaults))
        : [{
            texto: bloquePdf.texto ?? '',
            fuente: familiaInicial,
            tamano: tamanoInicial,
            color: colorInicial,
            negrita: negritaInicial,
            cursiva: cursivaInicial,
            subrayado: false
        }];

    return { familiaInicial, tamanoInicial, colorInicial, spansIniciales };
}

function _esSpanRicoEditor(nodo) {
    return Boolean(nodo && nodo.classList && nodo.classList.contains('editor-rich-span'));
}

function _obtenerSpanActivoDesdeRangoEditor(editorArea, range) {
    if (!range) return editorArea.querySelector('.editor-rich-span');
    let nodo = range.startContainer;
    if (nodo && nodo.nodeType === Node.TEXT_NODE) {
        const prev = nodo.previousSibling;
        nodo = (range.startOffset === 0 && _esSpanRicoEditor(prev)) ? prev : nodo.parentElement;
    }
    const sp = nodo && nodo.closest ? nodo.closest('.editor-rich-span') : null;
    if (sp && editorArea.contains(sp)) return sp;

    if (nodo === editorArea && editorArea.childNodes.length > 0) {
        const idx = Math.min(Math.max(0, range.startOffset - 1), editorArea.childNodes.length - 1);
        const cand = editorArea.childNodes[idx];
        if (_esSpanRicoEditor(cand)) return cand;
    }
    return editorArea.querySelector('.editor-rich-span');
}

function _dividirSegmentosPorSeleccion(segmentos, start, end) {
    const partidos = [];
    let pos = 0;
    segmentos.forEach(seg => {
        const len = seg.texto.length;
        const segStart = pos;
        const segEnd = pos + len;
        pos = segEnd;

        if (segEnd <= start || segStart >= end) {
            partidos.push({ ...seg, enSeleccion: false });
            return;
        }
        const cut0 = Math.max(0, start - segStart);
        const cut1 = Math.min(len, end - segStart);
        if (cut0 > 0) partidos.push({ ...seg, texto: seg.texto.slice(0, cut0), enSeleccion: false });
        if (cut1 > cut0) partidos.push({ ...seg, texto: seg.texto.slice(cut0, cut1), enSeleccion: true });
        if (cut1 < len) partidos.push({ ...seg, texto: seg.texto.slice(cut1), enSeleccion: false });
    });
    return partidos;
}

function _crearDOMPopupEditorTexto(rectVisual, metaInicial) {
    const { familiaInicial, tamanoInicial, colorInicial, spansIniciales } = metaInicial;
    const primero = spansIniciales[0] || {};
    const containerRect = document.getElementById('visor-container').getBoundingClientRect();

    const editor = document.createElement('div');
    editor.id = 'lira-editor-popup';
    editor.className = 'editor-wrapper';
    Object.assign(editor.style, {
        left: Math.min(rectVisual.x, containerRect.width - 620) + 'px',
        top: Math.max(10, rectVisual.y - 36) + 'px',
        width: Math.max(620, rectVisual.w + 24) + 'px',
        height: Math.max(200, rectVisual.h + 64) + 'px',
        maxWidth: (containerRect.width - 20) + 'px',
        maxHeight: (containerRect.height - 20) + 'px'
    });

    const barra = document.createElement('div');
    barra.className = 'barra-superior';

    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.title = 'Arrastrar para mover';

    const toolbar = document.createElement('div');
    toolbar.className = 'editor-toolbar';
    Object.assign(toolbar.style, {
        display: 'flex', gap: '4px', flexWrap: 'wrap', padding: '4px 6px',
        background: '#21262d', borderBottom: '1px solid #30363d', flexShrink: '0'
    });

    const selFuente = document.createElement('select');
    selFuente.className = 'editor-font-family';
    selFuente.title = 'Familia tipográfica';
    selFuente.style.maxWidth = '175px';

    const btnDescargarFuente = document.createElement('button');
    btnDescargarFuente.type = 'button';
    btnDescargarFuente.className = 'editor-font-download-btn';
    btnDescargarFuente.title = 'Descargar e instalar esta familia tipográfica';
    btnDescargarFuente.innerHTML = '⬇ Instalar';
    btnDescargarFuente.onmousedown = (e) => e.preventDefault();

    const familiasEnBloque = [familiaInicial, ...spansIniciales.map(s => s.fuente)];
    poblarSelectFuentesEditor(selFuente, familiasEnBloque, primero.fuente || familiaInicial);

    const inpTamano = document.createElement('input');
    inpTamano.type = 'number';
    inpTamano.className = 'editor-font-size';
    inpTamano.value = Number(primero.tamano || tamanoInicial).toFixed(1);
    inpTamano.min = '4';
    inpTamano.max = '72';
    inpTamano.step = '0.5';
    inpTamano.style.width = '55px';
    inpTamano.title = 'Tamaño (pt)';

    const inpColor = document.createElement('input');
    inpColor.type = 'color';
    inpColor.className = 'editor-font-color';
    inpColor.value = primero.color || colorInicial;
    inpColor.title = 'Color de fuente';

    const btnColorApply = document.createElement('button');
    btnColorApply.type = 'button';
    btnColorApply.className = 'editor-format-btn color-apply';
    btnColorApply.innerHTML = 'A';
    btnColorApply.title = 'Aplicar color a selección o span activo';
    Object.assign(btnColorApply.style, {
        fontSize: '11px', fontWeight: '700', width: '28px', height: '24px', borderRadius: '3px', cursor: 'pointer'
    });
    btnColorApply.onmousedown = (e) => e.preventDefault();
    actualizarContrasteBotonColor(btnColorApply, inpColor.value);

    const btnBold = createFormatBtn('B', 'bold', 'Negrita (Ctrl+B)', Boolean(primero.negrita));
    const btnItalic = createFormatBtn('I', 'italic', 'Cursiva (Ctrl+I)', Boolean(primero.cursiva));
    const btnUnderline = createFormatBtn('U', 'underline', 'Subrayado (Ctrl+U)', Boolean(primero.subrayado));
    [btnBold, btnItalic, btnUnderline].forEach(b => { b.onmousedown = (e) => e.preventDefault(); });

    const btnG = document.createElement('button');
    btnG.className = 'btn-guardar';
    btnG.innerText = 'Guardar';
    btnG.style.marginLeft = 'auto';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn-cancelar';
    btnCancel.innerText = 'Cancelar';
    Object.assign(btnCancel.style, {
        marginLeft: '4px', background: '#da3633', border: '1px solid #f85149', color: 'white',
        borderRadius: '4px', padding: '2px 10px', fontSize: '11px', fontWeight: '600',
        cursor: 'pointer', display: 'none'
    });

    [selFuente, btnDescargarFuente, inpTamano, inpColor, btnColorApply, btnBold, btnItalic, btnUnderline]
        .forEach(el => toolbar.appendChild(el));
    [handle, toolbar, btnG, btnCancel].forEach(el => barra.appendChild(el));

    const editorArea = document.createElement('div');
    editorArea.id = 'editor-contenteditable';
    editorArea.className = 'editor-contenteditable';
    editorArea.contentEditable = 'true';
    editorArea.spellcheck = false;
    Object.assign(editorArea.style, {
        flex: '1', padding: '10px', lineHeight: '1.5', overflow: 'auto',
        outline: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
    });
    editorArea.dataset.fontFamily = selFuente.value;
    editorArea.dataset.fontSize = inpTamano.value;
    editorArea.dataset.fontColor = inpColor.value;

    const tooltip = document.createElement('div');
    tooltip.className = 'editor-tooltip';

    editor.appendChild(barra);
    editor.appendChild(editorArea);
    editor.appendChild(tooltip);

    return {
        editor, handle, selFuente, btnDescargarFuente, inpTamano, inpColor, btnColorApply,
        btnBold, btnItalic, btnUnderline, btnG, btnCancel, editorArea, tooltip, familiasEnBloque
    };
}

function _actualizarBotonDescargaFuenteEditor(ctx) {
    const info = buscarInfoFuenteCatalogo(ctx.selFuente.value);
    if (info && !info.instalada && info.descargable) {
        ctx.btnDescargarFuente.style.display = 'inline-flex';
        ctx.btnDescargarFuente.disabled = false;
        ctx.btnDescargarFuente.innerHTML = `⬇ Instalar ${info.familia}`;
    } else {
        ctx.btnDescargarFuente.style.display = 'none';
    }
}

function _actualizarTooltipEditor(ctx, metaOverride = null) {
    const m = metaOverride || ctx.estiloDefaultActual();
    const famLimpia = limpiarNombreFuenteJS(m.fuente || ctx.selFuente.value || ctx.familiaInicial);
    const info = buscarInfoFuenteCatalogo(famLimpia);
    const estadoFuente = (info && !info.instalada) ? ' (Descargable)' : '';
    const flagsTxt = [m.negrita ? 'B' : '', m.cursiva ? 'I' : '', m.subrayado ? 'U' : ''].filter(Boolean).join(' ');
    const sufFlags = flagsTxt ? ` | ${flagsTxt}` : '';
    ctx.tooltip.innerText = `Fuente: ${famLimpia}${estadoFuente} | Tamaño: ${Number(m.tamano).toFixed(1)}pt | Color: ${normalizarColorHex(m.color).toUpperCase()}${sufFlags}`;
}

async function _descargarFuenteDesdeEditor(ctx) {
    const fam = limpiarNombreFuenteJS(ctx.selFuente.value);
    if (!fam || typeof eel === 'undefined' || typeof eel.descargar_fuente_editor !== 'function') return;

    ctx.btnDescargarFuente.disabled = true;
    ctx.btnDescargarFuente.innerHTML = '⏳ Descargando...';
    try {
        const res = await eel.descargar_fuente_editor(fam)();
        if (res && res.success) {
            await cargarCatalogoFuentesEditor(true);
            const spansActuales = extraerSegmentosPlanos(ctx.editorArea, ctx.estiloDefaultActual());
            const fams = [fam, ...ctx.familiasEnBloque, ...spansActuales.map(s => s.fuente)];
            poblarSelectFuentesEditor(ctx.selFuente, fams, res.familia || fam);
            _actualizarBotonDescargaFuenteEditor(ctx);
            _actualizarTooltipEditor(ctx);
            if (typeof mostrarToastLira === 'function') {
                mostrarToastLira(`Tipografía "${res.familia || fam}" instalada.`);
            }
        } else {
            const msg = (res && res.error) ? res.error : 'No se pudo descargar la tipografía.';
            if (typeof liraAlert === 'function') await liraAlert(msg, 'advertencia');
            _actualizarBotonDescargaFuenteEditor(ctx);
        }
    } catch (err) {
        console.error('[Editor] Error descargando fuente:', err);
        _actualizarBotonDescargaFuenteEditor(ctx);
    }
}

function _obtenerRangoValidoEditor(ctx) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0);
        if (ctx.editorArea.contains(r.commonAncestorContainer)) {
            ctx.ultimoRangoSeleccion = r.cloneRange();
            return ctx.ultimoRangoSeleccion;
        }
    }
    if (ctx.ultimoRangoSeleccion && ctx.editorArea.contains(ctx.ultimoRangoSeleccion.commonAncestorContainer)) {
        return ctx.ultimoRangoSeleccion;
    }
    return null;
}

function _sincronizarBarraConCursorEditor(ctx) {
    if (ctx.sincronizandoToolbar) return;
    const r = _obtenerRangoValidoEditor(ctx);
    if (!r) return;
    const sp = _obtenerSpanActivoDesdeRangoEditor(ctx.editorArea, r);
    if (!sp) return;

    ctx.sincronizandoToolbar = true;
    try {
        const meta = leerMetaDeSpanDOM(sp, ctx.estiloDefaultActual());
        seleccionarFamiliaEnSelect(ctx.selFuente, meta.fuente);
        _actualizarBotonDescargaFuenteEditor(ctx);
        if (document.activeElement !== ctx.inpTamano) {
            ctx.inpTamano.value = Number(meta.tamano).toFixed(1);
        }
        ctx.inpColor.value = meta.color;
        actualizarContrasteBotonColor(ctx.btnColorApply, meta.color);
        ctx.btnBold.classList.toggle('activo', Boolean(meta.negrita));
        ctx.btnItalic.classList.toggle('activo', Boolean(meta.cursiva));
        ctx.btnUnderline.classList.toggle('activo', Boolean(meta.subrayado));
        ctx.editorArea.dataset.fontFamily = meta.fuente;
        ctx.editorArea.dataset.fontSize = String(meta.tamano);
        ctx.editorArea.dataset.fontColor = meta.color;
        _actualizarTooltipEditor(ctx, meta);
    } finally {
        ctx.sincronizandoToolbar = false;
    }
}

function _aplicarCambioDeEstiloEditor(ctx, mutadorFn) {
    const range = _obtenerRangoValidoEditor(ctx);
    const fallback = ctx.estiloDefaultActual();
    const offsets = range ? obtenerOffsetsSeleccionEnEditor(ctx.editorArea, range) : null;
    const segmentos = extraerSegmentosPlanos(ctx.editorArea, fallback);

    if (offsets && offsets.end > offsets.start && segmentos.length > 0) {
        const partidos = _dividirSegmentosPorSeleccion(segmentos, offsets.start, offsets.end);
        const cambios = mutadorFn(partidos.filter(p => p.enSeleccion));
        const actualizados = partidos.map(p => p.enSeleccion ? { ...p, ...cambios } : p);
        renderizarSegmentosEnEditor(ctx.editorArea, actualizados, { ...fallback, ...cambios });
        ctx.editorArea.focus();
        ctx.ultimoRangoSeleccion = restaurarSeleccionPorOffsets(ctx.editorArea, offsets.start, offsets.end);
    } else {
        const spActivo = _obtenerSpanActivoDesdeRangoEditor(ctx.editorArea, range);
        if (spActivo) {
            const metaActual = leerMetaDeSpanDOM(spActivo, fallback);
            _aplicarMetaASpanDOM(spActivo, { ...metaActual, ...mutadorFn([metaActual]) });
            if (offsets) {
                ctx.editorArea.focus();
                ctx.ultimoRangoSeleccion = restaurarSeleccionPorOffsets(ctx.editorArea, offsets.start, offsets.start);
            }
        } else {
            const nuevoMeta = { ...fallback, ...mutadorFn([fallback]), texto: '' };
            renderizarSegmentosEnEditor(ctx.editorArea, [nuevoMeta], nuevoMeta);
        }
    }

    actualizarContrasteEditor(ctx.editorArea, ctx.inpColor.value);
    _sincronizarBarraConCursorEditor(ctx);
    ctx.evaluarCambiosPendientes();
}

function _construirPayloadGuardarEditor(ctx) {
    const rectNewVisual = {
        x: parseFloat(ctx.editor.style.left),
        y: parseFloat(ctx.editor.style.top) + 32,
        w: parseFloat(ctx.editor.style.width),
        h: parseFloat(ctx.editor.style.height) - 32
    };
    const fallback = ctx.estiloDefaultActual();
    const spansSerializados = extraerSegmentosPlanos(ctx.editorArea, fallback).map(seg => ({
        texto: seg.texto,
        fuente: seg.fuente,
        fuente_limpia: seg.fuente,
        tamano: Number(seg.tamano) || fallback.tamano,
        color: normalizarColorHex(seg.color),
        negrita: Boolean(seg.negrita),
        cursiva: Boolean(seg.cursiva),
        subrayado: Boolean(seg.subrayado)
    }));
    const spanDom = spansSerializados.find(s => s.texto.trim().length > 0) || fallback;
    const flags = (spanDom.negrita ? 16 : 0) | (spanDom.cursiva ? 2 : 0);

    return {
        id: ctx.bloquePdf.id,
        bbox: pdfRectFromCanvas(rectNewVisual),
        bbox_original: ctx.bloquePdf.bbox,
        texto: spansSerializados.map(s => s.texto).join(''),
        fuente: spanDom.fuente || ctx.selFuente.value,
        flags,
        tamano: Number(spanDom.tamano) || parseFloat(ctx.inpTamano.value) || 12,
        color: hexToRgbPdf(spanDom.color || ctx.inpColor.value),
        spans: spansSerializados
    };
}

async function _guardarCambiosEditorTexto(ctx) {
    const datosEnvio = _construirPayloadGuardarEditor(ctx);
    const restaurarBotones = () => {
        ctx.btnG.innerText = 'Guardar';
        ctx.btnG.disabled = false;
        ctx.btnCancel.disabled = false;
    };

    ctx.btnG.innerText = '...';
    ctx.btnG.disabled = true;
    ctx.btnCancel.disabled = true;

    try {
        const r = await eel.editar_texto_pdf(rutaPDFActual, paginaActual, datosEnvio)();
        if (r.success) {
            ctx.hasUnsavedChanges = false;
            cerrarEditorTexto();
            if (typeof cargarPagina === 'function') await cargarPagina(paginaActual);
            await renderizarBloquesEditor();
        } else {
            console.error("Error de edición:", r.error);
            if (typeof liraAlert === 'function') await liraAlert("Error guardando cambios.", "advertencia");
            restaurarBotones();
        }
    } catch (err) {
        console.error(err);
        restaurarBotones();
    }
}

function _vincularEventosBarraEditor(ctx) {
    ctx.btnDescargarFuente.onclick = (e) => {
        e.stopPropagation();
        _descargarFuenteDesdeEditor(ctx);
    };

    ctx.selFuente.addEventListener('change', () => {
        if (ctx.sincronizandoToolbar) return;
        const nuevaFam = limpiarNombreFuenteJS(ctx.selFuente.value);
        _actualizarBotonDescargaFuenteEditor(ctx);
        _aplicarCambioDeEstiloEditor(ctx, () => ({ fuente: nuevaFam }));
    });

    ctx.inpTamano.addEventListener('change', () => {
        if (ctx.sincronizandoToolbar) return;
        const nuevoTam = Math.max(4, Math.min(72, parseFloat(ctx.inpTamano.value) || ctx.tamanoInicial));
        ctx.inpTamano.value = nuevoTam.toFixed(1);
        _aplicarCambioDeEstiloEditor(ctx, () => ({ tamano: nuevoTam }));
    });

    const aplicarColor = () => {
        const nuevoColor = normalizarColorHex(ctx.inpColor.value);
        actualizarContrasteBotonColor(ctx.btnColorApply, nuevoColor);
        _aplicarCambioDeEstiloEditor(ctx, () => ({ color: nuevoColor }));
    };

    ctx.inpColor.addEventListener('input', () => {
        if (!ctx.sincronizandoToolbar) aplicarColor();
    });
    ctx.btnColorApply.addEventListener('click', () => {
        aplicarColor();
        ctx.btnColorApply.classList.add('activo');
        setTimeout(() => ctx.btnColorApply.classList.remove('activo'), 200);
    });

    [
        [ctx.btnBold, 'negrita'],
        [ctx.btnItalic, 'cursiva'],
        [ctx.btnUnderline, 'subrayado']
    ].forEach(([btn, prop]) => {
        btn.addEventListener('click', () => {
            _aplicarCambioDeEstiloEditor(ctx, (lista) => ({
                [prop]: !(lista.length > 0 && lista.every(s => Boolean(s[prop])))
            }));
        });
    });
}

function _manejarKeydownAreaEditor(e, ctx) {
    if (e.ctrlKey || e.metaKey) {
        const mapa = { b: ctx.btnBold, i: ctx.btnItalic, u: ctx.btnUnderline, s: ctx.btnG };
        const targetBtn = mapa[e.key.toLowerCase()] || (e.key === 'Enter' ? ctx.btnG : null);
        if (targetBtn) {
            e.preventDefault();
            targetBtn.click();
        }
    }
    if (e.key === 'Escape') {
        if (ctx.hasUnsavedChanges) ctx.btnCancel.click();
        else cerrarEditorTexto();
    }
}

function _manejarInputAreaEditor(ctx) {
    const tieneTextoSuelto = Array.from(ctx.editorArea.childNodes).some(
        n => n.nodeType === Node.TEXT_NODE && (n.nodeValue || '').length > 0
    );
    if (tieneTextoSuelto || ctx.editorArea.querySelectorAll('.editor-rich-span').length === 0) {
        const r = _obtenerRangoValidoEditor(ctx);
        const off = r ? obtenerOffsetsSeleccionEnEditor(ctx.editorArea, r) : null;
        const segs = extraerSegmentosPlanos(ctx.editorArea, ctx.estiloDefaultActual());
        renderizarSegmentosEnEditor(ctx.editorArea, segs, ctx.estiloDefaultActual());
        if (off) ctx.ultimoRangoSeleccion = restaurarSeleccionPorOffsets(ctx.editorArea, off.start, off.end);
    }
    actualizarContrasteEditor(ctx.editorArea, ctx.inpColor.value);
    ctx.evaluarCambiosPendientes();
}

function _vincularAccionesVentanaEditor(ctx) {
    ctx.btnG.onclick = (e) => {
        e.stopPropagation();
        _guardarCambiosEditorTexto(ctx);
    };

    ctx.btnCancel.onclick = async (e) => {
        e.stopPropagation();
        if (!ctx.hasUnsavedChanges || await liraConfirm('Hay cambios sin guardar. ¿Descartar y cerrar?', 'advertencia')) {
            cerrarEditorTexto();
        }
    };

    ctx.editor.addEventListener('contextmenu', async (e) => {
        if (ctx.editor.contains(e.target)) return;
        e.preventDefault();
        if (ctx.hasUnsavedChanges) {
            if (typeof liraAlert === 'function') await liraAlert('Hay cambios sin guardar. Usa "Guardar" o "Cancelar".', 'info');
        } else {
            cerrarEditorTexto();
        }
    });

    ctx.handle.onmousedown = (e) => {
        e.preventDefault();
        dragInfo = {
            el: ctx.editor,
            startX: e.clientX,
            startY: e.clientY,
            startLeft: parseFloat(ctx.editor.style.left) || 0,
            startTop: parseFloat(ctx.editor.style.top) || 0
        };
        document.addEventListener('mousemove', dragMouse);
        document.addEventListener('mouseup', dropMouse);
    };
}

function _vincularEventosAreaEditor(ctx) {
    editorSelectionChangeHandler = () => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const r = sel.getRangeAt(0);
        if (ctx.editorArea.contains(r.commonAncestorContainer)) {
            ctx.ultimoRangoSeleccion = r.cloneRange();
            _sincronizarBarraConCursorEditor(ctx);
        }
    };
    document.addEventListener('selectionchange', editorSelectionChangeHandler);

    ctx.editorArea.addEventListener('keyup', () => _sincronizarBarraConCursorEditor(ctx));
    ctx.editorArea.addEventListener('mouseup', () => _sincronizarBarraConCursorEditor(ctx));
    ctx.editorArea.addEventListener('keydown', (e) => _manejarKeydownAreaEditor(e, ctx));
    ctx.editorArea.addEventListener('input', () => _manejarInputAreaEditor(ctx));
    _vincularAccionesVentanaEditor(ctx);
}

function abrirEditorTexto(bloquePdf, rectVisual) {
    cerrarEditorTexto();
    const capa = document.getElementById('lira-pdf-text-editor-layer');
    if (!capa) return;

    const metaInicial = _construirSpansInicialesEditor(bloquePdf);
    const serializacionInicial = JSON.stringify(fusionarSegmentosContiguos(metaInicial.spansIniciales));
    const dom = _crearDOMPopupEditorTexto(rectVisual, metaInicial);

    const ctx = {
        ...metaInicial,
        ...dom,
        bloquePdf,
        hasUnsavedChanges: false,
        sincronizandoToolbar: false,
        ultimoRangoSeleccion: null
    };

    ctx.estiloDefaultActual = () => ({
        fuente: limpiarNombreFuenteJS(ctx.selFuente.value || ctx.familiaInicial),
        tamano: Math.max(4, parseFloat(ctx.inpTamano.value) || ctx.tamanoInicial),
        color: normalizarColorHex(ctx.inpColor.value || ctx.colorInicial),
        negrita: ctx.btnBold.classList.contains('activo'),
        cursiva: ctx.btnItalic.classList.contains('activo'),
        subrayado: ctx.btnUnderline.classList.contains('activo')
    });

    ctx.evaluarCambiosPendientes = () => {
        const actualSerial = JSON.stringify(extraerSegmentosPlanos(ctx.editorArea, ctx.estiloDefaultActual()));
        ctx.hasUnsavedChanges = actualSerial !== serializacionInicial;
        ctx.btnG.innerText = ctx.hasUnsavedChanges ? 'Guardar cambios' : 'Guardar';
        ctx.btnG.style.background = ctx.hasUnsavedChanges ? '#238636' : '';
        ctx.btnCancel.style.display = ctx.hasUnsavedChanges ? 'inline-block' : 'none';
    };

    renderizarSegmentosEnEditor(ctx.editorArea, ctx.spansIniciales, ctx.estiloDefaultActual());
    actualizarContrasteEditor(ctx.editorArea, ctx.inpColor.value);

    cargarCatalogoFuentesEditor(false).then(() => {
        const actual = ctx.selFuente.value || ctx.spansIniciales[0]?.fuente || ctx.familiaInicial;
        poblarSelectFuentesEditor(ctx.selFuente, ctx.familiasEnBloque, actual);
        _actualizarBotonDescargaFuenteEditor(ctx);
        _actualizarTooltipEditor(ctx);
    });

    _vincularEventosBarraEditor(ctx);
    _vincularEventosAreaEditor(ctx);
    _actualizarTooltipEditor(ctx, ctx.spansIniciales[0]);
    capa.appendChild(ctx.editor);

    setTimeout(() => {
        ctx.editorArea.focus();
        const range = document.createRange();
        range.selectNodeContents(ctx.editorArea);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        ctx.ultimoRangoSeleccion = range.cloneRange();
        _sincronizarBarraConCursorEditor(ctx);
    }, 50);
}

// Helper: obtener nombre de familia legible para CSS
function getFontFamilyName(key) {
    if (!key) return 'Helvetica, Arial, sans-serif';
    const map = {
        helv: 'Helvetica, Arial, sans-serif',
        tiro: '"Times New Roman", Times, serif',
        cour: '"Courier New", Courier, monospace',
        symb: 'Symbol',
        zadb: 'ZapfDingbats',
        zb: 'ZapfDingbats',
        zi: 'ZapfDingbats'
    };
    if (map[key.toLowerCase()]) return map[key.toLowerCase()];
    const limpia = limpiarNombreFuenteJS(key).replace(/"/g, '');
    return `"${limpia}", Helvetica, Arial, sans-serif`;
}

// Helpers para botones de formato
function createFormatBtn(text, className, title, active) {
    let btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `editor-format-btn ${className}` + (active ? ' activo' : '');
    btn.innerText = text;
    btn.title = title;
    btn.style.fontWeight = className === 'bold' ? 'bold' : 'normal';
    btn.style.fontStyle = className === 'italic' ? 'italic' : 'normal';
    btn.style.textDecoration = className === 'underline' ? 'underline' : 'none';
    btn.style.width = '28px';
    btn.style.height = '24px';
    btn.style.fontSize = '11px';
    btn.style.padding = '0';
    btn.style.background = '#2d333b';
    btn.style.border = '1px solid #3d444d';
    btn.style.borderRadius = '3px';
    btn.style.color = '#e6edf3';
    btn.style.cursor = 'pointer';
    return btn;
}

// Convertir color PDF (array [r,g,b] 0-1 o entero 0xRRGGBB) a hex
function rgbPdfToHex(pdfColor) {
    if (!pdfColor) return '#000000';
    if (typeof pdfColor === 'number') {
        const hex = (pdfColor & 0xFFFFFF).toString(16).padStart(6, '0');
        return '#' + hex;
    }
    if (Array.isArray(pdfColor)) {
        const r = Math.round(pdfColor[0] * 255).toString(16).padStart(2, '0');
        const g = Math.round(pdfColor[1] * 255).toString(16).padStart(2, '0');
        const b = Math.round(pdfColor[2] * 255).toString(16).padStart(2, '0');
        return '#' + r + g + b;
    }
    return '#000000';
}

// Convertir hex a array RGB PDF [r, g, b] (0 a 1)
function hexToRgbPdf(hex) {
    if (!hex) return [0, 0, 0];
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return [r, g, b];
}

function dragMouse(e) {
    if (!dragInfo) return;
    const dx = e.clientX - dragInfo.startX;
    const dy = e.clientY - dragInfo.startY;
    dragInfo.el.style.left = (dragInfo.startLeft + dx) + 'px';
    dragInfo.el.style.top = (dragInfo.startTop + dy) + 'px';
}

function dropMouse(e) {
    dragInfo = null;
    document.removeEventListener('mousemove', dragMouse);
    document.removeEventListener('mouseup', dropMouse);
}

function cerrarEditorTexto() {
    if (editorSelectionChangeHandler) {
        document.removeEventListener('selectionchange', editorSelectionChangeHandler);
        editorSelectionChangeHandler = null;
    }
    const editor = document.getElementById('lira-editor-popup');
    if (editor) editor.remove();
}

// Atajo global: Esc para cerrar editor si no hay cambios
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window.modoEditorTextoActivo) {
        const editor = document.getElementById('lira-editor-popup');
        if (editor) {
            const btnCancel = editor.querySelector('.btn-cancelar');
            if (btnCancel && btnCancel.style.display !== 'none') {
                btnCancel.click();
            } else {
                cerrarEditorTexto();
            }
        } else {
            toggleModoEditorTexto(false);
        }
    }
});

// ==========================================
// MODO CUADRO DE TEXTO (Añadir nuevo texto)
// ==========================================

let modoCuadroTextoActivo = false;

function toggleModoCuadroTexto(activo) {
    modoCuadroTextoActivo = activo;
    const btn = document.getElementById('btn-add-text-box');
    const capa = document.getElementById('lira-pdf-text-editor-layer');
    
    if (btn) btn.classList.toggle('activo', activo);
    
    if (activo) {
        if (capa) capa.classList.add('activo');
        document.getElementById('visor-container').style.cursor = 'crosshair';
        
        // Desactivar modo editor si estaba activo
        if (window.modoEditorTextoActivo) {
            toggleModoEditorTexto(false);
        }
        
        // Listener para crear cuadro al hacer click en el PDF
        const canvas = document.getElementById('lienzo-pdf');
        if (canvas) {
            canvas.addEventListener('click', crearCuadroTextoEnClick);
        }
    } else {
        if (capa) {
            capa.classList.remove('activo');
            capa.innerHTML = '';
        }
        document.getElementById('visor-container').style.cursor = '';
        const canvas = document.getElementById('lienzo-pdf');
        if (canvas) {
            canvas.removeEventListener('click', crearCuadroTextoEnClick);
        }
    }
}

function crearCuadroTextoEnClick(e) {
    if (!modoCuadroTextoActivo) return;
    
    const canvas = document.getElementById('lienzo-pdf');
    const wrapper = document.getElementById('pdf-crop-wrapper');
    const container = document.getElementById('visor-container');
    const capa = document.getElementById('lira-pdf-text-editor-layer');
    
    if (!canvas || !wrapper || !container || !capa) return;
    
    // Coordenadas relativas al wrapper
    const wrapperRect = wrapper.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const canvasLeft = canvas.offsetLeft;
    const canvasTop = canvas.offsetTop;
    const wrapperLeft = wrapperRect.left - containerRect.left;
    const wrapperTop = wrapperRect.top - containerRect.top;
    
    // Posición del click en coordenadas del wrapper
    const clickX = e.clientX - containerRect.left - wrapperLeft - canvasLeft;
    const clickY = e.clientY - containerRect.top - wrapperTop - canvasTop;
    
    // Convertir a coordenadas PDF
    const sc = (memoriaLayout[paginaActual.toString()].escala || 1.0) * (typeof nivelZoomPDF !== 'undefined' ? nivelZoomPDF : 1.0);
    const pdfX = clickX / sc;
    const pdfY = clickY / sc;
    
    // Crear cuadro de texto inicial (100x50 puntos PDF)
    const anchoPdf = 100;
    const altoPdf = 50;
    const bbox = [pdfX, pdfY, pdfX + anchoPdf, pdfY + altoPdf];
    
    // Enviar al backend para crear el cuadro
    eel.crear_cuadro_texto_pdf(rutaPDFActual, paginaActual, bbox)()
        .then(res => {
            if (res.success) {
                // Recargar bloques
                cargarCatalogoFuentesEditor(false);
        renderizarBloquesEditor();
            } else {
                console.error("Error creando cuadro:", res.error);
            }
        });
}
