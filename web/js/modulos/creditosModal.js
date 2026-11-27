// ==========================================
// MODAL IN-APP DE CRÉDITOS Y AVISO LEGAL
// Lee web/CREDITS.txt dinámicamente (fuente única de verdad)
// ==========================================

let _creditosHtmlCache = null;

function _escaparHtmlCreditos(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _enlazarUrlsCreditos(lineaEscapada) {
    return lineaEscapada.replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="creditos-link">$1</a>'
    );
}

function _formatearCreditosTxtAHtml(textoPlano) {
    const lineas = textoPlano.replace(/\r\n/g, '\n').split('\n');
    const bloques = [];

    for (let i = 0; i < lineas.length; i++) {
        const raw = lineas[i];
        const trim = raw.trim();

        // Ignorar separadores decorativos === y ---
        if (!trim || /^[=-]{5,}$/.test(trim)) continue;

        const esc = _escaparHtmlCreditos(trim);

        // Título principal o copyright final
        if (/^LIRALOUD\b/i.test(trim) || /^Copyright\s+\(C\)/i.test(trim)) {
            bloques.push(`<div class="creditos-banner">${esc}</div>`);
            continue;
        }

        // Encabezados numerados: "1. DEVELOPMENT..."
        if (/^\d+\.\s+[A-Z0-9\s&/()-]+$/.test(trim)) {
            bloques.push(`<h4 class="creditos-h4">${esc}</h4>`);
            continue;
        }

        // Subcategorías: "--- Desktop Interface & Core Runtime ---"
        const subMatch = trim.match(/^---\s*(.+?)\s*---$/);
        if (subMatch) {
            bloques.push(`<h5 class="creditos-h5">${_escaparHtmlCreditos(subMatch[1])}</h5>`);
            continue;
        }

        // Viñetas ("- ..." o "* ...")
        if (/^[-*]\s+/.test(trim)) {
            const contenido = _enlazarUrlsCreditos(_escaparHtmlCreditos(trim.replace(/^[-*]\s+/, '')));
            bloques.push(`<div class="creditos-item">${contenido}</div>`);
            continue;
        }

        // Sub-líneas indentadas (License:, Project:, URLs de íconos)
        if (/^\s{2,}/.test(raw)) {
            const contenido = _enlazarUrlsCreditos(esc);
            bloques.push(`<div class="creditos-subitem">${contenido}</div>`);
            continue;
        }

        // Párrafo normal
        bloques.push(`<p class="creditos-p">${_enlazarUrlsCreditos(esc)}</p>`);
    }

    return bloques.join('');
}

async function abrirModalCreditos() {
    const modal = document.getElementById('modal-creditos');
    const cuerpo = document.getElementById('creditos-contenido');
    if (!modal || !cuerpo) {
        if (typeof abrirLegalExterno === 'function') abrirLegalExterno('CREDITS.txt', true);
        return;
    }

    modal.style.display = 'flex';
    cuerpo.scrollTop = 0;

    if (_creditosHtmlCache) {
        cuerpo.innerHTML = _creditosHtmlCache;
        return;
    }

    cuerpo.innerHTML = '<div class="modal-creditos-loading">Cargando créditos...</div>';
    try {
        const resp = await fetch('CREDITS.txt', { cache: 'no-store' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const txt = await resp.text();
        _creditosHtmlCache = _formatearCreditosTxtAHtml(txt);
        cuerpo.innerHTML = _creditosHtmlCache;
    } catch (err) {
        console.warn('⚠️ [CreditosModal] No se pudo cargar CREDITS.txt:', err);
        cuerpo.innerHTML = '<p class="creditos-p">No se pudo cargar CREDITS.txt dentro de la ventana. Usa el botón "Abrir CREDITS.txt" abajo.</p>';
    }
}

function cerrarModalCreditos() {
    const modal = document.getElementById('modal-creditos');
    if (modal) modal.style.display = 'none';
}

window.abrirModalCreditos = abrirModalCreditos;
window.cerrarModalCreditos = cerrarModalCreditos;
