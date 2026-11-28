function _vincularBackdropTiendaVoces() {
    // La tienda de voces solo debe cerrarse mediante el botón de tache (×) para evitar cierres accidentales al hacer clic fuera.
}

function _iconoTiendaSVG(clave) {
    return (typeof window.obtenerIconoDialogoSVG === 'function')
        ? window.obtenerIconoDialogoSVG(clave, 'lira-inline-svg')
        : '';
}

function _txtTienda(clave, fallback) {
    return (typeof window.t === 'function') ? window.t(clave, fallback) : fallback;
}

window.abrirTiendaVoces = function () {
    const modal = document.getElementById('modal-tienda-voces');
    if (modal) modal.style.display = 'flex';
    _vincularBackdropTiendaVoces();
    if (typeof cargarEstadoTokenHF === 'function') cargarEstadoTokenHF();
    if (typeof cargarTiendaVoces === 'function') cargarTiendaVoces();
};

document.addEventListener('DOMContentLoaded', _vincularBackdropTiendaVoces);

window.cerrarTiendaVoces = function () {
    const modal = document.getElementById('modal-tienda-voces');
    if (modal) modal.style.display = 'none';
};

window._tabTiendaActual = 'buscar';
window.cambiarTabTienda = function (tab, btn) {
    window._tabTiendaActual = (tab === 'descargadas') ? 'descargadas' : 'buscar';
    const header = btn?.parentElement || document.querySelector('#modal-tienda-voces .tabs-config-header');
    if (header) {
        header.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
    }
    if (typeof filtrarTiendaVoces === 'function') filtrarTiendaVoces();
};

window._motorTiendaActual = 'piper';
window.cambiarMotorTienda = function (motor, btn) {
    window._motorTiendaActual = motor;
    const header = btn?.parentElement;
    if (header) {
        header.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    if (typeof filtrarTiendaVoces === 'function') filtrarTiendaVoces();
};

const _CATALOGO_TIENDA_FALLBACK = [
    { id: "es_ES-davefx-medium", motor: "piper", nombre: "DaveFX (España - Media)", idioma: "es_ES", peso: "~63 MB", instalada: false },
    { id: "es_ES-sharvard-medium", motor: "piper", nombre: "Sharvard (España - Media)", idioma: "es_ES", peso: "~63 MB", instalada: false },
    { id: "es_ES-carlfm-x_low", motor: "piper", nombre: "CarlFM (España - Ligera)", idioma: "es_ES", peso: "~28 MB", instalada: false },
    { id: "es_MX-ald-medium", motor: "piper", nombre: "Ald (México - Media)", idioma: "es_MX", peso: "~63 MB", instalada: false },
    { id: "es_MX-claude-high", motor: "piper", nombre: "Claude (México - Alta)", idioma: "es_MX", peso: "~110 MB", instalada: false },
    { id: "es_AR-daniela-high", motor: "piper", nombre: "Daniela (Argentina - Alta)", idioma: "es_AR", peso: "~110 MB", instalada: false },
    { id: "en_US-lessac-medium", motor: "piper", nombre: "Lessac (EE.UU. - Media)", idioma: "en_US", peso: "~63 MB", instalada: false },
    { id: "en_US-amy-medium", motor: "piper", nombre: "Amy (EE.UU. - Media)", idioma: "en_US", peso: "~63 MB", instalada: false },
    { id: "en_GB-alba-medium", motor: "piper", nombre: "Alba (Reino Unido - Media)", idioma: "en_GB", peso: "~63 MB", instalada: false }
];

let _catalogoTiendaCache = [..._CATALOGO_TIENDA_FALLBACK];

window.cargarTiendaVoces = async function () {
    filtrarTiendaVoces();
    try {
        if (typeof eel !== 'undefined' && typeof eel.obtener_catalogo_tienda_voces === 'function') {
            const remoto = await eel.obtener_catalogo_tienda_voces()();
            if (Array.isArray(remoto) && remoto.length > 0) {
                _catalogoTiendaCache = remoto;
                filtrarTiendaVoces();
            }
        }
    } catch (e) {
        console.warn("Usando catálogo local de respaldo:", e);
    }
};

const SVG_CANDADO_TIENDA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:12px; height:12px; flex-shrink:0;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
const SVG_ENLACE_HF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px; flex-shrink:0;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;

window.togglePanelTokenHF = function () {
    const panel = document.getElementById('panel-token-hf-tienda');
    if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
};

function _actualizarBadgeYAvisoTokenHF(has, usuario) {
    const badge = document.getElementById('estado-token-hf-tienda');
    const btn = document.getElementById('btn-token-hf-tienda');
    const aviso = document.getElementById('aviso-token-hf-activo');
    const txtAviso = document.getElementById('txt-aviso-token-hf-activo');
    const sufijo = usuario ? ` (@${usuario})` : '';

    if (badge) {
        const txtOk = _txtTienda('lbl-token-hf-configurado', 'Configurado');
        const txtNo = _txtTienda('lbl-token-hf-sin-token', 'Sin token');
        badge.textContent = has ? `${txtOk}${sufijo}` : txtNo;
        badge.classList.toggle('activo', has);
    }
    if (aviso) {
        aviso.style.display = has ? 'flex' : 'none';
        if (has && txtAviso) {
            txtAviso.textContent = `${_txtTienda('lbl-token-hf-sesion-activa', 'Tienes un token de Hugging Face guardado')}${sufijo}`;
        }
    }
    if (btn) btn.classList.toggle('activo', has);
}

window.cargarEstadoTokenHF = async function () {
    try {
        if (typeof eel === 'undefined' || typeof eel.obtener_token_hf_tienda !== 'function') return;
        const info = await eel.obtener_token_hf_tienda()();
        _actualizarBadgeYAvisoTokenHF(!!(info && info.has_token), (info && info.usuario) ? info.usuario : '');
    } catch (e) {}
};

window.guardarTokenHFTienda = async function () {
    const inp = document.getElementById('input-token-hf-tienda');
    const tok = (inp?.value || '').trim();
    if (!tok) return;
    try {
        if (typeof eel !== 'undefined' && typeof eel.guardar_token_hf_tienda === 'function') {
            await eel.guardar_token_hf_tienda(tok)();
            if (inp) inp.value = '';
            await cargarEstadoTokenHF();
        }
    } catch (e) {}
};

window.quitarTokenHFTienda = async function () {
    try {
        if (typeof eel !== 'undefined' && typeof eel.guardar_token_hf_tienda === 'function') {
            await eel.guardar_token_hf_tienda('')();
            const inp = document.getElementById('input-token-hf-tienda');
            if (inp) inp.value = '';
            await cargarEstadoTokenHF();
        }
    } catch (e) {}
};

window.abrirRepoHFTienda = async function (url) {
    if (!url) return;
    try {
        if (typeof eel !== 'undefined' && typeof eel.abrir_url_hf_tienda === 'function') {
            await eel.abrir_url_hf_tienda(url)();
            return;
        }
    } catch (e) {}
    window.open(url, '_blank');
};

window.toggleAyudaTiendaVoces = function () {
    const box = document.getElementById('ayuda-tienda-voces');
    if (box) {
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
    }
};

window._descargasTiendaEstado = window._descargasTiendaEstado || {};

function _construirControlesTarjetaVozTienda(v, textos, enDescarga, pausada, btnAbrirHF) {
    if (v.instalada) {
        return `<button id="btn-del-${v.id}" class="btn-tienda-eliminar" onclick="eliminarVozTiendaUI('${v.motor}', '${v.id}')">${textos.eliminar}</button>`;
    }
    if (enDescarga) {
        const lblPausa = pausada ? `${_iconoTiendaSVG('reproducir')} Reanudar` : `${_iconoTiendaSVG('pausar')} Pausar`;
        return `
            <div style="display:flex; gap:6px; align-items:center;">
                <button id="btn-pause-${v.id}" class="btn-tienda-pausar" onclick="togglePausaDescargaTienda('${v.id}')">${lblPausa}</button>
                <button id="btn-cancel-${v.id}" class="btn-tienda-cancelar" onclick="cancelarDescargaTiendaUI('${v.id}')">✕ Cancelar</button>
            </div>`;
    }
    return `
        <div style="display:flex; gap:6px; align-items:center;">
            ${btnAbrirHF}
            <button id="btn-dl-${v.id}" class="btn-tienda-descargar" onclick="descargarVozTiendaUI('${v.motor}', '${v.id}')">${textos.descargar}</button>
        </div>`;
}

function _renderizarTarjetaVozTienda(v, textos) {
    const dlTxt = typeof v.descargas === 'number'
        ? ` · <span class="tienda-dl-count">${_iconoTiendaSVG('descarga')} ${v.descargas.toLocaleString()}</span>`
        : '';
    const estDl = window._descargasTiendaEstado[v.id];
    const enDescarga = !!estDl && !v.instalada;
    const pct = estDl?.pct || 0;
    const esGatedPendiente = !!v.gated && !v.instalada;
    const badgeGated = esGatedPendiente
        ? `<span class="badge-tienda-gated" title="${textos.permiso}">${SVG_CANDADO_TIENDA}<span>${textos.permiso}</span></span>`
        : '';
    const btnAbrirHF = esGatedPendiente && v.repo_url
        ? `<button type="button" class="btn-tienda-hf-link" title="${textos.abrirHF}" onclick="abrirRepoHFTienda('${v.repo_url}')">${SVG_ENLACE_HF}</button>`
        : '';
    const controlesHtml = _construirControlesTarjetaVozTienda(v, textos, enDescarga, estDl?.estado === 'pausada', btnAbrirHF);

    return `
        <div id="tienda-voz-${v.id}" style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border:1px solid #e2e8f0; border-radius:8px; gap:10px; background:#fff;">
            <div style="flex:1; min-width:0;">
                <div style="font-weight:600; font-size:14px; color:#1e293b;">${v.nombre}${badgeGated}</div>
                <div style="font-size:12px; color:#64748b;">${v.idioma} · <b>${v.peso}</b>${dlTxt}</div>
                <div id="prog-wrap-${v.id}" style="display:${enDescarga ? 'block' : 'none'}; margin-top:6px; background:#e2e8f0; border-radius:4px; height:6px; overflow:hidden;">
                    <div id="prog-bar-${v.id}" style="width:${pct}%; height:100%; background:#22c55e; transition:width 0.15s;"></div>
                </div>
            </div>
            <div>${controlesHtml}</div>
        </div>
    `;
}

window.filtrarTiendaVoces = function () {
    const cont = document.getElementById('lista-tienda-voces');
    if (!cont) return;

    const totalDescargadas = _catalogoTiendaCache.filter(v => !!v.instalada).length;
    const badgeDesc = document.getElementById('badge-tienda-descargadas');
    if (badgeDesc) badgeDesc.textContent = `(${totalDescargadas})`;

    const q = (document.getElementById('buscar-voz-tienda')?.value || '').toLowerCase().trim();
    const filtradas = _catalogoTiendaCache
        .filter(v => (window._tabTiendaActual === 'descargadas' ? !!v.instalada : !v.instalada))
        .filter(v => !q || v.nombre.toLowerCase().includes(q) || (v.idioma || '').toLowerCase().includes(q) || (v.id || '').toLowerCase().includes(q));

    if (filtradas.length === 0) {
        const esDescVacia = window._tabTiendaActual === 'descargadas' && !q;
        const txtNoVoces = _txtTienda(
            esDescVacia ? 'msg-tienda-sin-descargadas' : 'msg-tienda-sin-voces',
            esDescVacia ? 'Aún no tienes voces descargadas en la tienda.' : 'No se encontraron voces con ese filtro.'
        );
        cont.innerHTML = `<div style="padding:12px; color:#64748b;">${txtNoVoces}</div>`;
        return;
    }

    const textos = {
        eliminar: _txtTienda('btn-eliminar', 'Eliminar'),
        descargar: _txtTienda('btn-descargar', 'Descargar'),
        permiso: _txtTienda('lbl-tienda-requiere-permiso', 'Requiere permiso en Hugging Face'),
        abrirHF: _txtTienda('ttl-abrir-hf-repo', 'Abrir página del modelo en Hugging Face')
    };
    cont.innerHTML = filtradas.map(v => _renderizarTarjetaVozTienda(v, textos)).join('');
};

async function recargarCatalogoVocesApp() {
    try {
        if (typeof eel !== 'undefined' && typeof eel.obtener_voces_disponibles === 'function') {
            const nuevasVoces = await eel.obtener_voces_disponibles()();
            if (Array.isArray(nuevasVoces)) {
                window.vocesPython = nuevasVoces;
                if (typeof vocesPython !== 'undefined') vocesPython = nuevasVoces;
                if (typeof llenarTodosLosSelectores === 'function') llenarTodosLosSelectores();
                if (typeof actualizarListaVocesUI === 'function') actualizarListaVocesUI();
            }
        }
    } catch (e) {
        console.warn("Error recargando catálogo de voces en UI:", e);
    }
}

window.togglePausaDescargaTienda = async function (vozId) {
    const est = window._descargasTiendaEstado[vozId];
    if (!est) return;
    const pausar = est.estado !== 'pausada';
    est.estado = pausar ? 'pausada' : 'descargando';
    const btn = document.getElementById(`btn-pause-${vozId}`);
    if (btn) btn.innerHTML = pausar ? `${_iconoTiendaSVG('reproducir')} Reanudar` : `${_iconoTiendaSVG('pausar')} Pausar`;
    try {
        if (typeof eel !== 'undefined') {
            if (pausar && eel.pausar_descarga_voz_tienda) await eel.pausar_descarga_voz_tienda(vozId)();
            else if (!pausar && eel.reanudar_descarga_voz_tienda) await eel.reanudar_descarga_voz_tienda(vozId)();
        }
    } catch (e) {}
};

window.cancelarDescargaTiendaUI = async function (vozId) {
    try {
        if (typeof eel !== 'undefined' && eel.cancelar_descarga_voz_tienda) {
            await eel.cancelar_descarga_voz_tienda(vozId)();
        }
    } catch (e) {}
    delete window._descargasTiendaEstado[vozId];
    filtrarTiendaVoces();
};

window.descargarVozTiendaUI = async function (motor, vozId) {
    window._descargasTiendaEstado[vozId] = { estado: 'descargando', pct: 0 };
    filtrarTiendaVoces();

    try {
        const res = await eel.descargar_voz_tienda(motor, vozId)();
        delete window._descargasTiendaEstado[vozId];
        if (res && res.ok) {
            await recargarCatalogoVocesApp();
            await cargarTiendaVoces();
        } else if (res && res.cancelada) {
            filtrarTiendaVoces();
        } else {
            filtrarTiendaVoces();
            const errStr = String(res?.error || '');
            const es401 = errStr.includes('401') || errStr.includes('403');
            const msgErr = es401
                ? ((typeof window.t === 'function')
                    ? window.t('msg-tienda-error-401', 'Este modelo requiere autorización en Hugging Face. Abre su página en Hugging Face, acepta los términos (o espera aprobación del autor) y configura tu token en el icono de candado de la tienda.')
                    : 'Este modelo requiere autorización en Hugging Face. Abre su página en Hugging Face, acepta los términos (o espera aprobación del autor) y configura tu token en el icono de candado de la tienda.')
                : `Error al descargar: ${errStr || 'Desconocido'}`;
            if (typeof liraAlert === 'function') await liraAlert(msgErr, 'advertencia');
        }
    } catch (e) {
        delete window._descargasTiendaEstado[vozId];
        filtrarTiendaVoces();
    }
};

window.eliminarVozTiendaUI = async function (motor, vozId) {
    const btn = document.getElementById(`btn-del-${vozId}`);
    const card = document.getElementById(`tienda-voz-${vozId}`);
    const textoOriginal = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="tienda-spinner"></span> Eliminando...`;
    }
    if (card) card.classList.add('tienda-voz-eliminando');

    try {
        const [res] = await Promise.all([
            eel.eliminar_voz_tienda(motor, vozId)(),
            new Promise(r => setTimeout(r, 260))
        ]);
        if (res && res.ok) {
            const item = _catalogoTiendaCache.find(v => v.id === vozId);
            if (item) item.instalada = false;

            if (card) {
                card.classList.add('tienda-voz-eliminada');
                await new Promise(r => setTimeout(r, 240));
            }
            filtrarTiendaVoces();
            await recargarCatalogoVocesApp();
            await cargarTiendaVoces();
            return;
        }
    } catch (e) {}

    if (card) card.classList.remove('tienda-voz-eliminando', 'tienda-voz-eliminada');
    if (btn) {
        btn.disabled = false;
        btn.textContent = textoOriginal || ((typeof window.t === 'function') ? window.t('btn-eliminar', 'Eliminar') : 'Eliminar');
    }
};

if (typeof eel !== 'undefined' && typeof eel.expose === 'function') {
    eel.expose(actualizarProgresoVozTienda);
}
function actualizarProgresoVozTienda(vozId, pct) {
    if (window._descargasTiendaEstado[vozId]) {
        window._descargasTiendaEstado[vozId].pct = pct;
    }
    const bar = document.getElementById(`prog-bar-${vozId}`);
    if (bar) bar.style.width = `${pct}%`;
}
