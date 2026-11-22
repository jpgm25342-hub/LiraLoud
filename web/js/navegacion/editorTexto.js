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

function toggleModoEditorTexto(activo) {
    console.log('[Editor] toggleModo activo=', activo);
    console.log('[Editor] rutaPDFActual=', typeof rutaPDFActual !== 'undefined' ? rutaPDFActual : 'NO DEFINIDA');
    console.log('[Editor] paginaActual=', typeof paginaActual !== 'undefined' ? paginaActual : 'NO DEFINIDA');
    window.modoEditorTextoActivo = activo;
    const btn = document.getElementById('btn-text-editor');
    const btnZen = document.getElementById('btn-edit-pdf');
    const btnGroup = document.getElementById('group-text-editor');
    const capa = document.getElementById('lira-pdf-text-editor-layer');
    
    if (btnGroup) btnGroup.classList.toggle('active', activo);
    if (btn) {
        btn.classList.toggle('activo', activo);
        btn.classList.toggle('active', activo);
    }
    if (btnZen) {
        btnZen.classList.toggle('activo', activo);
    }

    // Actualizar estilo subrayado activo en botones de Modo Zen (Ctrl+U)
    document.querySelectorAll('.zen-item-editor-texto').forEach(el => {
        el.classList.toggle('tool-active-underline', activo);
    });
    if (typeof window.actualizarEstadoInteractivoCapaSoloLectura === 'function') {
        window.actualizarEstadoInteractivoCapaSoloLectura();
    }

    if (activo) {
        if (capa) capa.classList.add('activo');
        
        // Desactivar otros modos
        if (typeof toggleModoBorrador === 'function' && window.modoBorradorActivo) toggleModoBorrador(false);
        if (typeof toggleModoSubrayador === 'function' && window.modoSubrayadorActivo) toggleModoSubrayador(false);
        if (typeof activarModoCuadroTexto === 'function' && window.modoCuadroTextoActivo) activarModoCuadroTexto(false);
        if (typeof toggleCapturaCorte === 'function' && window.capturandoCorte) toggleCapturaCorte(false);
        const chkLimites = document.getElementById('chk-dibujar-limites');
        if (chkLimites && chkLimites.checked) {
            chkLimites.checked = false;
            if (typeof toggleDibujoLimites === 'function') toggleDibujoLimites(false);
        }

        cargarCatalogoFuentesEditor(false);
        renderizarBloquesEditor();

        // Registrar handler de resize para recalcular posiciones
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

        // Limpiar handler de resize
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

function calcRectCanvas(bboxPdf) {
    const memPag = (typeof memoriaLayout !== 'undefined' && memoriaLayout) ? memoriaLayout[paginaActual.toString()] : null;
    const baseEscala = memPag?.escala || (typeof datosPagina !== 'undefined' && datosPagina?.factor_zoom) || 0;
    if (!baseEscala) return {x:0, y:0, w:0, h:0};

    const wrapper = document.getElementById('pdf-crop-wrapper');
    const canvas = document.getElementById('lienzo-pdf');
    const container = document.getElementById('visor-container');

    if (!wrapper || !canvas || !container) return {x:0, y:0, w:0, h:0};

    const sc = baseEscala * (typeof nivelZoomPDF !== 'undefined' ? nivelZoomPDF : 1.0);

    const wrapperLeft = wrapper.offsetLeft;
    const wrapperTop = wrapper.offsetTop;
    const canvasLeft = canvas.offsetLeft;
    const canvasTop = canvas.offsetTop;

    const x0 = bboxPdf[0] * sc;
    const y0 = bboxPdf[1] * sc;
    const x1 = bboxPdf[2] * sc;
    const y1 = bboxPdf[3] * sc;

    const w = Math.max(x1 - x0, 1);
    const h = Math.max(y1 - y0, 1);

    const visual = {
        x: wrapperLeft + canvasLeft + x0,
        y: wrapperTop + canvasTop + y0,
        w: w,
        h: h
    };

    const CLICK_MIN = 24;
    const clickW = Math.max(w, CLICK_MIN);
    const clickH = Math.max(h, CLICK_MIN);
    const clickX = visual.x + (w - clickW) / 2;
    const clickY = visual.y + (h - clickH) / 2;

    return {
        ...visual,
        clickX: clickX,
        clickY: clickY,
        clickW: clickW,
        clickH: clickH
    };
}

function pdfRectFromCanvas(rectVisual) {
    const memPag = (typeof memoriaLayout !== 'undefined' && memoriaLayout) ? memoriaLayout[paginaActual.toString()] : null;
    const baseEscala = memPag?.escala || (typeof datosPagina !== 'undefined' && datosPagina?.factor_zoom) || 0;
    if (!baseEscala) return [0,0,0,0];

    const wrapper = document.getElementById('pdf-crop-wrapper');
    const canvas = document.getElementById('lienzo-pdf');
    const container = document.getElementById('visor-container');

    if (!wrapper || !canvas || !container) return [0,0,0,0];

    const sc = baseEscala * (typeof nivelZoomPDF !== 'undefined' ? nivelZoomPDF : 1.0);

    const containerRect = container.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const canvasLeft = parseFloat(canvas.style.left) || 0;
    const canvasTop = parseFloat(canvas.style.top) || 0;

    const wrapperLeft = wrapperRect.left - containerRect.left;
    const wrapperTop = wrapperRect.top - containerRect.top;

    const x0 = (rectVisual.x - wrapperLeft - canvasLeft) / sc;
    const y0 = (rectVisual.y - wrapperTop - canvasTop) / sc;
    const x1 = (rectVisual.x + rectVisual.w - wrapperLeft - canvasLeft) / sc;
    const y1 = (rectVisual.y + rectVisual.h - wrapperTop - canvasTop) / sc;

    return [x0, y0, x1, y1];
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

function crearSpanDOM(meta) {
    const span = document.createElement('span');
    span.className = 'editor-rich-span';
    span.dataset.fuente = limpiarNombreFuenteJS(meta.fuente_limpia || meta.fuente || 'Helvetica');
    span.dataset.tamano = String(Number(meta.tamano || 12));
    span.dataset.color = normalizarColorHex(meta.color || '#000000');
    span.dataset.negrita = meta.negrita ? '1' : '0';
    span.dataset.cursiva = meta.cursiva ? '1' : '0';
    span.dataset.subrayado = meta.subrayado ? '1' : '0';
    span.textContent = meta.texto ?? '';
    aplicarEstilosSpanDOM(span);
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

function extraerSegmentosPlanos(editorArea, fallbackMeta) {
    const raw = [];

    function recorrer(nodo, metaActual, esPrimerHijoBloque = false) {
        if (!nodo) return;
        if (nodo.nodeType === Node.TEXT_NODE) {
            const txt = (nodo.nodeValue || '').replace(/\u200B/g, '');
            if (txt.length > 0) {
                raw.push({ ...metaActual, texto: txt });
            }
            return;
        }
        if (nodo.nodeType !== Node.ELEMENT_NODE) return;

        const tag = nodo.tagName.toUpperCase();
        if (tag === 'BR') {
            raw.push({ ...metaActual, texto: '\n' });
            return;
        }

        let nuevoMeta = { ...metaActual };
        if (nodo.classList && nodo.classList.contains('editor-rich-span')) {
            nuevoMeta = leerMetaDeSpanDOM(nodo, metaActual);
        } else {
            if (tag === 'B' || tag === 'STRONG') nuevoMeta.negrita = true;
            if (tag === 'I' || tag === 'EM') nuevoMeta.cursiva = true;
            if (tag === 'U') nuevoMeta.subrayado = true;
            if (nodo.style && nodo.style.color) nuevoMeta.color = normalizarColorHex(nodo.style.color);
        }

        if ((tag === 'DIV' || tag === 'P') && nodo !== editorArea && raw.length > 0) {
            const ultimoTxt = raw[raw.length - 1].texto;
            if (!ultimoTxt.endsWith('\n')) {
                raw.push({ ...nuevoMeta, texto: '\n' });
            }
        }

        const hijos = Array.from(nodo.childNodes);
        hijos.forEach((h, idx) => recorrer(h, nuevoMeta, idx === 0));
    }

    recorrer(editorArea, fallbackMeta);
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

function restaurarSeleccionPorOffsets(editorArea, startOffset, endOffset) {
    if (!editorArea) return null;
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

    if (!startNode && ultimoTextNode) {
        startNode = ultimoTextNode;
        startLocal = (ultimoTextNode.nodeValue || '').length;
    }
    if (!endNode && ultimoTextNode) {
        endNode = ultimoTextNode;
        endLocal = (ultimoTextNode.nodeValue || '').length;
    }

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

function abrirEditorTexto(bloquePdf, rectVisual) {
    cerrarEditorTexto();
    const capa = document.getElementById('lira-pdf-text-editor-layer');
    if (!capa) return;

    let editor = document.createElement('div');
    editor.id = 'lira-editor-popup';
    editor.className = 'editor-wrapper';

    const containerRect = document.getElementById('visor-container').getBoundingClientRect();
    let left = Math.min(rectVisual.x, containerRect.width - 620);
    let top = Math.max(10, rectVisual.y - 36);
    let w = Math.max(620, rectVisual.w + 24);
    let h = Math.max(200, rectVisual.h + 64);

    editor.style.left = left + 'px';
    editor.style.top = top + 'px';
    editor.style.width = w + 'px';
    editor.style.height = h + 'px';
    editor.style.maxWidth = (containerRect.width - 20) + 'px';
    editor.style.maxHeight = (containerRect.height - 20) + 'px';

    let hasUnsavedChanges = false;
    let sincronizandoToolbar = false;
    let ultimoRangoSeleccion = null;

    const familiaInicial = limpiarNombreFuenteJS(bloquePdf.fuente_limpia || bloquePdf.fuente || 'Helvetica');
    const tamanoInicial = Number(bloquePdf.tamano || 12);
    const colorInicial = normalizarColorHex(rgbPdfToHex(bloquePdf.color));
    const negritaInicial = Boolean((bloquePdf.flags || 0) & 16);
    const cursivaInicial = Boolean((bloquePdf.flags || 0) & 2);

    const spansIniciales = (Array.isArray(bloquePdf.spans) && bloquePdf.spans.length > 0)
        ? bloquePdf.spans.map(sp => ({
            texto: sp.texto ?? '',
            fuente: limpiarNombreFuenteJS(sp.fuente_limpia || sp.fuente || familiaInicial),
            tamano: Number(sp.tamano || tamanoInicial),
            color: normalizarColorHex(rgbPdfToHex(sp.color || bloquePdf.color)),
            negrita: sp.negrita !== undefined ? Boolean(sp.negrita) : negritaInicial,
            cursiva: sp.cursiva !== undefined ? Boolean(sp.cursiva) : cursivaInicial,
            subrayado: Boolean(sp.subrayado)
        }))
        : [{
            texto: bloquePdf.texto ?? '',
            fuente: familiaInicial,
            tamano: tamanoInicial,
            color: colorInicial,
            negrita: negritaInicial,
            cursiva: cursivaInicial,
            subrayado: false
        }];

    const serializacionInicial = JSON.stringify(fusionarSegmentosContiguos(spansIniciales));

    let barra = document.createElement('div');
    barra.className = 'barra-superior';

    let handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.title = 'Arrastrar para mover';

    let toolbar = document.createElement('div');
    toolbar.className = 'editor-toolbar';
    toolbar.style.display = 'flex';
    toolbar.style.gap = '4px';
    toolbar.style.flexWrap = 'wrap';
    toolbar.style.padding = '4px 6px';
    toolbar.style.background = '#21262d';
    toolbar.style.borderBottom = '1px solid #30363d';
    toolbar.style.flexShrink = '0';

    let selFuente = document.createElement('select');
    selFuente.className = 'editor-font-family';
    selFuente.title = 'Familia tipográfica';
    selFuente.style.maxWidth = '175px';

    let btnDescargarFuente = document.createElement('button');
    btnDescargarFuente.type = 'button';
    btnDescargarFuente.className = 'editor-font-download-btn';
    btnDescargarFuente.title = 'Descargar e instalar esta familia tipográfica';
    btnDescargarFuente.innerHTML = '⬇ Instalar';
    btnDescargarFuente.onmousedown = (e) => e.preventDefault();

    const familiasEnBloque = [familiaInicial, ...spansIniciales.map(s => s.fuente)];
    poblarSelectFuentesEditor(selFuente, familiasEnBloque, spansIniciales[0]?.fuente || familiaInicial);

    let inpTamano = document.createElement('input');
    inpTamano.type = 'number';
    inpTamano.className = 'editor-font-size';
    inpTamano.value = Number(spansIniciales[0]?.tamano || tamanoInicial).toFixed(1);
    inpTamano.min = '4';
    inpTamano.max = '72';
    inpTamano.step = '0.5';
    inpTamano.style.width = '55px';
    inpTamano.title = 'Tamaño (pt)';

    let inpColor = document.createElement('input');
    inpColor.type = 'color';
    inpColor.className = 'editor-font-color';
    inpColor.value = spansIniciales[0]?.color || colorInicial;
    inpColor.title = 'Color de fuente';

    let btnColorApply = document.createElement('button');
    btnColorApply.type = 'button';
    btnColorApply.className = 'editor-format-btn color-apply';
    btnColorApply.innerHTML = 'A';
    btnColorApply.title = 'Aplicar color a selección o span activo';
    btnColorApply.style.fontSize = '11px';
    btnColorApply.style.fontWeight = '700';
    btnColorApply.style.width = '28px';
    btnColorApply.style.height = '24px';
    btnColorApply.style.borderRadius = '3px';
    btnColorApply.style.cursor = 'pointer';
    btnColorApply.onmousedown = (e) => e.preventDefault();
    actualizarContrasteBotonColor(btnColorApply, inpColor.value);

    let btnBold = createFormatBtn('B', 'bold', 'Negrita (Ctrl+B)', Boolean(spansIniciales[0]?.negrita));
    let btnItalic = createFormatBtn('I', 'italic', 'Cursiva (Ctrl+I)', Boolean(spansIniciales[0]?.cursiva));
    let btnUnderline = createFormatBtn('U', 'underline', 'Subrayado (Ctrl+U)', Boolean(spansIniciales[0]?.subrayado));
    btnBold.onmousedown = (e) => e.preventDefault();
    btnItalic.onmousedown = (e) => e.preventDefault();
    btnUnderline.onmousedown = (e) => e.preventDefault();

    let btnG = document.createElement('button');
    btnG.className = 'btn-guardar';
    btnG.innerText = 'Guardar';
    btnG.style.marginLeft = 'auto';

    let btnCancel = document.createElement('button');
    btnCancel.className = 'btn-cancelar';
    btnCancel.innerText = 'Cancelar';
    btnCancel.style.marginLeft = '4px';
    btnCancel.style.background = '#da3633';
    btnCancel.style.border = '1px solid #f85149';
    btnCancel.style.color = 'white';
    btnCancel.style.borderRadius = '4px';
    btnCancel.style.padding = '2px 10px';
    btnCancel.style.fontSize = '11px';
    btnCancel.style.fontWeight = '600';
    btnCancel.style.cursor = 'pointer';
    btnCancel.style.display = 'none';

    toolbar.appendChild(selFuente);
    toolbar.appendChild(btnDescargarFuente);
    toolbar.appendChild(inpTamano);
    toolbar.appendChild(inpColor);
    toolbar.appendChild(btnColorApply);
    toolbar.appendChild(btnBold);
    toolbar.appendChild(btnItalic);
    toolbar.appendChild(btnUnderline);

    barra.appendChild(handle);
    barra.appendChild(toolbar);
    barra.appendChild(btnG);
    barra.appendChild(btnCancel);

    let editorArea = document.createElement('div');
    editorArea.id = 'editor-contenteditable';
    editorArea.className = 'editor-contenteditable';
    editorArea.contentEditable = 'true';
    editorArea.spellcheck = false;
    editorArea.style.flex = '1';
    editorArea.style.padding = '10px';
    editorArea.style.lineHeight = '1.5';
    editorArea.style.overflow = 'auto';
    editorArea.style.outline = 'none';
    editorArea.style.whiteSpace = 'pre-wrap';
    editorArea.style.wordBreak = 'break-word';
    editorArea.dataset.fontFamily = selFuente.value;
    editorArea.dataset.fontSize = inpTamano.value;
    editorArea.dataset.fontColor = inpColor.value;

    const estiloDefaultActual = () => ({
        fuente: limpiarNombreFuenteJS(selFuente.value || familiaInicial),
        tamano: Math.max(4, parseFloat(inpTamano.value) || tamanoInicial),
        color: normalizarColorHex(inpColor.value || colorInicial),
        negrita: btnBold.classList.contains('activo'),
        cursiva: btnItalic.classList.contains('activo'),
        subrayado: btnUnderline.classList.contains('activo')
    });

    renderizarSegmentosEnEditor(editorArea, spansIniciales, estiloDefaultActual());
    actualizarContrasteEditor(editorArea, inpColor.value);

    let tooltip = document.createElement('div');
    tooltip.className = 'editor-tooltip';

    function actualizarBotonDescargaFuente() {
        const famActual = selFuente.value;
        const info = buscarInfoFuenteCatalogo(famActual);
        if (info && !info.instalada && info.descargable) {
            btnDescargarFuente.style.display = 'inline-flex';
            btnDescargarFuente.disabled = false;
            btnDescargarFuente.innerHTML = `⬇ Instalar ${info.familia}`;
        } else {
            btnDescargarFuente.style.display = 'none';
        }
    }

    function updateTooltip(metaOverride = null) {
        const m = metaOverride || estiloDefaultActual();
        const famLimpia = limpiarNombreFuenteJS(m.fuente || selFuente.value || familiaInicial);
        const info = buscarInfoFuenteCatalogo(famLimpia);
        const estadoFuente = info
            ? (info.instalada ? '' : ' (Descargable)')
            : (bloquePdf.fuente_disponible ? '' : '');
        const flagsTxt = [
            m.negrita ? 'B' : '',
            m.cursiva ? 'I' : '',
            m.subrayado ? 'U' : ''
        ].filter(Boolean).join(' ');
        const sufFlags = flagsTxt ? ` | ${flagsTxt}` : '';
        tooltip.innerText = `Fuente: ${famLimpia}${estadoFuente} | Tamaño: ${Number(m.tamano).toFixed(1)}pt | Color: ${normalizarColorHex(m.color).toUpperCase()}${sufFlags}`;
    }

    // Cargar catálogo real desde Python y actualizar select sin perder la selección actual
    cargarCatalogoFuentesEditor(false).then(() => {
        const actual = selFuente.value || spansIniciales[0]?.fuente || familiaInicial;
        poblarSelectFuentesEditor(selFuente, familiasEnBloque, actual);
        actualizarBotonDescargaFuente();
        updateTooltip();
    });

    btnDescargarFuente.onclick = async (e) => {
        e.stopPropagation();
        const fam = limpiarNombreFuenteJS(selFuente.value);
        if (!fam || typeof eel === 'undefined' || typeof eel.descargar_fuente_editor !== 'function') return;

        btnDescargarFuente.disabled = true;
        btnDescargarFuente.innerHTML = '⏳ Descargando...';
        try {
            const res = await eel.descargar_fuente_editor(fam)();
            if (res && res.success) {
                await cargarCatalogoFuentesEditor(true);
                const spansActuales = extraerSegmentosPlanos(editorArea, estiloDefaultActual());
                const fams = [fam, ...familiasEnBloque, ...spansActuales.map(s => s.fuente)];
                poblarSelectFuentesEditor(selFuente, fams, res.familia || fam);
                actualizarBotonDescargaFuente();
                updateTooltip();
                if (typeof mostrarToastLira === 'function') {
                    mostrarToastLira(`Tipografía "${res.familia || fam}" instalada.`);
                }
            } else {
                const msg = (res && res.error) ? res.error : 'No se pudo descargar la tipografía.';
                if (typeof liraAlert === 'function') await liraAlert(msg, 'advertencia');
                actualizarBotonDescargaFuente();
            }
        } catch (err) {
            console.error('[Editor] Error descargando fuente:', err);
            actualizarBotonDescargaFuente();
        }
    };

    function evaluarCambiosPendientes() {
        const actualSerial = JSON.stringify(extraerSegmentosPlanos(editorArea, estiloDefaultActual()));
        hasUnsavedChanges = actualSerial !== serializacionInicial;
        btnG.innerText = hasUnsavedChanges ? 'Guardar cambios' : 'Guardar';
        btnG.style.background = hasUnsavedChanges ? '#238636' : '';
        btnCancel.style.display = hasUnsavedChanges ? 'inline-block' : 'none';
    }

    function obtenerRangoValido() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const r = sel.getRangeAt(0);
            if (editorArea.contains(r.commonAncestorContainer)) {
                ultimoRangoSeleccion = r.cloneRange();
                return ultimoRangoSeleccion;
            }
        }
        if (ultimoRangoSeleccion && editorArea.contains(ultimoRangoSeleccion.commonAncestorContainer)) {
            return ultimoRangoSeleccion;
        }
        return null;
    }

    function obtenerSpanActivoDesdeRango(range) {
        if (!range) return editorArea.querySelector('.editor-rich-span');
        let nodo = range.startContainer;
        if (nodo && nodo.nodeType === Node.TEXT_NODE) {
            if (range.startOffset === 0 && nodo.previousSibling && nodo.previousSibling.classList?.contains('editor-rich-span')) {
                nodo = nodo.previousSibling;
            } else {
                nodo = nodo.parentElement;
            }
        }
        if (nodo && nodo.closest) {
            const sp = nodo.closest('.editor-rich-span');
            if (sp && editorArea.contains(sp)) return sp;
        }
        if (nodo === editorArea && editorArea.childNodes.length > 0) {
            const idx = Math.min(Math.max(0, range.startOffset - 1), editorArea.childNodes.length - 1);
            const cand = editorArea.childNodes[idx];
            if (cand && cand.classList?.contains('editor-rich-span')) return cand;
        }
        return editorArea.querySelector('.editor-rich-span');
    }

    function sincronizarBarraConCursor() {
        if (sincronizandoToolbar) return;
        const r = obtenerRangoValido();
        if (!r) return;
        const sp = obtenerSpanActivoDesdeRango(r);
        if (!sp) return;

        sincronizandoToolbar = true;
        try {
            const meta = leerMetaDeSpanDOM(sp, estiloDefaultActual());
            seleccionarFamiliaEnSelect(selFuente, meta.fuente);
            actualizarBotonDescargaFuente();
            if (document.activeElement !== inpTamano) {
                inpTamano.value = Number(meta.tamano).toFixed(1);
            }
            inpColor.value = meta.color;
            actualizarContrasteBotonColor(btnColorApply, meta.color);
            btnBold.classList.toggle('activo', Boolean(meta.negrita));
            btnItalic.classList.toggle('activo', Boolean(meta.cursiva));
            btnUnderline.classList.toggle('activo', Boolean(meta.subrayado));
            editorArea.dataset.fontFamily = meta.fuente;
            editorArea.dataset.fontSize = String(meta.tamano);
            editorArea.dataset.fontColor = meta.color;
            updateTooltip(meta);
        } finally {
            sincronizandoToolbar = false;
        }
    }

    function aplicarCambioDeEstilo(mutadorFn) {
        const range = obtenerRangoValido();
        const fallback = estiloDefaultActual();
        const offsets = range ? obtenerOffsetsSeleccionEnEditor(editorArea, range) : null;
        const segmentos = extraerSegmentosPlanos(editorArea, fallback);

        if (offsets && offsets.end > offsets.start && segmentos.length > 0) {
            // 1. Subdividir únicamente en las fronteras [start, end] de la selección
            const partidos = [];
            let pos = 0;
            segmentos.forEach(seg => {
                const len = seg.texto.length;
                const segStart = pos;
                const segEnd = pos + len;
                pos = segEnd;

                if (segEnd <= offsets.start || segStart >= offsets.end) {
                    partidos.push({ ...seg, enSeleccion: false });
                    return;
                }

                const cut0 = Math.max(0, offsets.start - segStart);
                const cut1 = Math.min(len, offsets.end - segStart);

                if (cut0 > 0) {
                    partidos.push({ ...seg, texto: seg.texto.slice(0, cut0), enSeleccion: false });
                }
                if (cut1 > cut0) {
                    partidos.push({ ...seg, texto: seg.texto.slice(cut0, cut1), enSeleccion: true });
                }
                if (cut1 < len) {
                    partidos.push({ ...seg, texto: seg.texto.slice(cut1), enSeleccion: false });
                }
            });

            const seleccionados = partidos.filter(p => p.enSeleccion);
            const cambios = mutadorFn(seleccionados);
            const actualizados = partidos.map(p => p.enSeleccion ? { ...p, ...cambios } : p);

            renderizarSegmentosEnEditor(editorArea, actualizados, { ...fallback, ...cambios });
            editorArea.focus();
            ultimoRangoSeleccion = restaurarSeleccionPorOffsets(editorArea, offsets.start, offsets.end);
        } else {
            // 2. Sin selección (solo cursor): aplicar al span activo bajo el cursor (o crear span base si está vacío)
            const spActivo = obtenerSpanActivoDesdeRango(range);
            if (spActivo) {
                const metaActual = leerMetaDeSpanDOM(spActivo, fallback);
                const cambios = mutadorFn([metaActual]);
                const nuevoMeta = { ...metaActual, ...cambios };
                spActivo.dataset.fuente = limpiarNombreFuenteJS(nuevoMeta.fuente);
                spActivo.dataset.tamano = String(Number(nuevoMeta.tamano));
                spActivo.dataset.color = normalizarColorHex(nuevoMeta.color);
                spActivo.dataset.negrita = nuevoMeta.negrita ? '1' : '0';
                spActivo.dataset.cursiva = nuevoMeta.cursiva ? '1' : '0';
                spActivo.dataset.subrayado = nuevoMeta.subrayado ? '1' : '0';
                aplicarEstilosSpanDOM(spActivo);
                if (offsets) {
                    editorArea.focus();
                    ultimoRangoSeleccion = restaurarSeleccionPorOffsets(editorArea, offsets.start, offsets.start);
                }
            } else {
                const cambios = mutadorFn([fallback]);
                const nuevoMeta = { ...fallback, ...cambios, texto: '' };
                renderizarSegmentosEnEditor(editorArea, [nuevoMeta], nuevoMeta);
            }
        }

        actualizarContrasteEditor(editorArea, inpColor.value);
        sincronizarBarraConCursor();
        evaluarCambiosPendientes();
    }

    selFuente.addEventListener('change', () => {
        if (sincronizandoToolbar) return;
        const nuevaFam = limpiarNombreFuenteJS(selFuente.value);
        actualizarBotonDescargaFuente();
        aplicarCambioDeEstilo(() => ({ fuente: nuevaFam }));
    });

    inpTamano.addEventListener('change', () => {
        if (sincronizandoToolbar) return;
        const nuevoTam = Math.max(4, Math.min(72, parseFloat(inpTamano.value) || tamanoInicial));
        inpTamano.value = nuevoTam.toFixed(1);
        aplicarCambioDeEstilo(() => ({ tamano: nuevoTam }));
    });

    inpColor.addEventListener('input', () => {
        if (sincronizandoToolbar) return;
        const nuevoColor = normalizarColorHex(inpColor.value);
        actualizarContrasteBotonColor(btnColorApply, nuevoColor);
        aplicarCambioDeEstilo(() => ({ color: nuevoColor }));
    });

    btnColorApply.addEventListener('click', () => {
        const nuevoColor = normalizarColorHex(inpColor.value);
        actualizarContrasteBotonColor(btnColorApply, nuevoColor);
        aplicarCambioDeEstilo(() => ({ color: nuevoColor }));
        btnColorApply.classList.add('activo');
        setTimeout(() => btnColorApply.classList.remove('activo'), 200);
    });

    btnBold.addEventListener('click', () => {
        aplicarCambioDeEstilo(lista => {
            const todosActivos = lista.length > 0 && lista.every(s => Boolean(s.negrita));
            return { negrita: !todosActivos };
        });
    });

    btnItalic.addEventListener('click', () => {
        aplicarCambioDeEstilo(lista => {
            const todosActivos = lista.length > 0 && lista.every(s => Boolean(s.cursiva));
            return { cursiva: !todosActivos };
        });
    });

    btnUnderline.addEventListener('click', () => {
        aplicarCambioDeEstilo(lista => {
            const todosActivos = lista.length > 0 && lista.every(s => Boolean(s.subrayado));
            return { subrayado: !todosActivos };
        });
    });

    editorSelectionChangeHandler = () => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const r = sel.getRangeAt(0);
        if (editorArea.contains(r.commonAncestorContainer)) {
            ultimoRangoSeleccion = r.cloneRange();
            sincronizarBarraConCursor();
        }
    };
    document.addEventListener('selectionchange', editorSelectionChangeHandler);

    editorArea.addEventListener('keyup', sincronizarBarraConCursor);
    editorArea.addEventListener('mouseup', sincronizarBarraConCursor);

    editorArea.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            const k = e.key.toLowerCase();
            if (k === 'b') { e.preventDefault(); btnBold.click(); }
            if (k === 'i') { e.preventDefault(); btnItalic.click(); }
            if (k === 'u') { e.preventDefault(); btnUnderline.click(); }
            if (k === 's') { e.preventDefault(); btnG.click(); }
            if (e.key === 'Enter') { e.preventDefault(); btnG.click(); }
        }
        if (e.key === 'Escape') {
            if (hasUnsavedChanges) { btnCancel.click(); } else { cerrarEditorTexto(); }
        }
    });

    editorArea.addEventListener('input', () => {
        // Si el usuario escribió texto suelto fuera de un .editor-rich-span, envolverlo conservando cursor
        const tieneTextoSuelto = Array.from(editorArea.childNodes).some(
            n => n.nodeType === Node.TEXT_NODE && (n.nodeValue || '').length > 0
        );
        if (tieneTextoSuelto || editorArea.querySelectorAll('.editor-rich-span').length === 0) {
            const r = obtenerRangoValido();
            const off = r ? obtenerOffsetsSeleccionEnEditor(editorArea, r) : null;
            const segs = extraerSegmentosPlanos(editorArea, estiloDefaultActual());
            renderizarSegmentosEnEditor(editorArea, segs, estiloDefaultActual());
            if (off) {
                ultimoRangoSeleccion = restaurarSeleccionPorOffsets(editorArea, off.start, off.end);
            }
        }
        actualizarContrasteEditor(editorArea, inpColor.value);
        evaluarCambiosPendientes();
    });

    updateTooltip(spansIniciales[0]);

    // --- GUARDAR ---
    btnG.onclick = async (e) => {
        e.stopPropagation();
        const ew = parseFloat(editor.style.width);
        const eh = parseFloat(editor.style.height);
        const el = parseFloat(editor.style.left);
        const et = parseFloat(editor.style.top) + 32;

        let rectNewVisual = { x: el, y: et, w: ew, h: eh - 32 };
        let rectPdf = pdfRectFromCanvas(rectNewVisual);

        const fallback = estiloDefaultActual();
        const segmentosFinales = extraerSegmentosPlanos(editorArea, fallback);
        const spansSerializados = segmentosFinales.map(seg => ({
            texto: seg.texto,
            fuente: seg.fuente,
            fuente_limpia: seg.fuente,
            tamano: Number(seg.tamano) || fallback.tamano,
            color: normalizarColorHex(seg.color),
            negrita: Boolean(seg.negrita),
            cursiva: Boolean(seg.cursiva),
            subrayado: Boolean(seg.subrayado)
        }));
        const textoPlano = spansSerializados.map(s => s.texto).join('');

        const spanDom = spansSerializados.find(s => s.texto.trim().length > 0) || fallback;
        let flags = 0;
        if (spanDom.negrita) flags |= 16;
        if (spanDom.cursiva) flags |= 2;

        const datosEnvio = {
            id: bloquePdf.id,
            bbox: rectPdf,
            bbox_original: bloquePdf.bbox,
            texto: textoPlano,
            fuente: spanDom.fuente || selFuente.value,
            flags: flags,
            tamano: Number(spanDom.tamano) || parseFloat(inpTamano.value) || 12,
            color: hexToRgbPdf(spanDom.color || inpColor.value),
            spans: spansSerializados
        };

        btnG.innerText = '...';
        btnG.disabled = true;
        btnCancel.disabled = true;

        try {
            let r = await eel.editar_texto_pdf(rutaPDFActual, paginaActual, datosEnvio)();
            if (r.success) {
                hasUnsavedChanges = false;
                cerrarEditorTexto();
                if (typeof cargarPagina === 'function') {
                    await cargarPagina(paginaActual);
                }
                await renderizarBloquesEditor();
            } else {
                console.error("Error de edición:", r.error);
                if (typeof liraAlert === 'function') await liraAlert("Error guardando cambios.", "advertencia");
                btnG.innerText = 'Guardar';
                btnG.disabled = false;
                btnCancel.disabled = false;
            }
        } catch(err) {
            console.error(err);
            btnG.innerText = 'Guardar';
            btnG.disabled = false;
            btnCancel.disabled = false;
        }
    };

    // --- CANCELAR ---
    btnCancel.onclick = async (e) => {
        e.stopPropagation();
        if (hasUnsavedChanges) {
            if (await liraConfirm('Hay cambios sin guardar. ¿Descartar y cerrar?', 'advertencia')) {
                cerrarEditorTexto();
            }
        } else {
            cerrarEditorTexto();
        }
    };

    // --- CLIC DERECHO FUERA PARA CERRAR ---
    editor.addEventListener('contextmenu', async (e) => {
        if (editor.contains(e.target)) return;
        e.preventDefault();
        if (hasUnsavedChanges) {
            if (typeof liraAlert === 'function') await liraAlert('Hay cambios sin guardar. Usa "Guardar" o "Cancelar".', 'info');
        } else {
            cerrarEditorTexto();
        }
    });

    editor.appendChild(barra);
    editor.appendChild(editorArea);
    editor.appendChild(tooltip);
    capa.appendChild(editor);

    // Focus al editor y cursor al final
    setTimeout(() => {
        editorArea.focus();
        const range = document.createRange();
        range.selectNodeContents(editorArea);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        ultimoRangoSeleccion = range.cloneRange();
        sincronizarBarraConCursor();
    }, 50);

    // Draggable
    handle.onmousedown = (e) => {
        e.preventDefault();
        dragInfo = {
            el: editor,
            startX: e.clientX,
            startY: e.clientY,
            startLeft: parseFloat(editor.style.left) || 0,
            startTop: parseFloat(editor.style.top) || 0
        };
        document.addEventListener('mousemove', dragMouse);
        document.addEventListener('mouseup', dropMouse);
    };
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
