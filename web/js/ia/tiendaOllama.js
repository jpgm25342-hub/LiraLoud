function cerrarTiendaOllama() {
    const modal = document.getElementById('modal-tienda-ollama');
    if (modal) modal.style.display = 'none';
}
window.cerrarTiendaOllama = cerrarTiendaOllama;

function _vincularBackdropTiendaOllama() {
    const modal = document.getElementById('modal-tienda-ollama');
    if (modal && !modal.dataset.backdropBound) {
        modal.dataset.backdropBound = 'true';
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cerrarTiendaOllama();
        });
    }
}

async function abrirTiendaOllama() {
    const modal = document.getElementById('modal-tienda-ollama');
    const hwBox = document.getElementById('tienda-ollama-hw');
    if (!modal || !hwBox) return;

    _vincularBackdropTiendaOllama();
    modal.style.display = 'flex';
    hwBox.textContent = "Verificando Ollama y RAM...";

    let info = { ram_gb: 8, recomendado: "qwen2.5:3b", instalados: [], ollama_activo: false };
    if (typeof eel !== 'undefined' && typeof eel.obtener_info_hardware_ollama === 'function') {
        try { info = await eel.obtener_info_hardware_ollama()(); } catch (e) {}
    }
    if (!info.ollama_activo && typeof eel !== 'undefined' && typeof eel.iniciar_ollama_local === 'function') {
        try {
            const initRes = await eel.iniciar_ollama_local()();
            if (initRes && initRes.exito) {
                info = await eel.obtener_info_hardware_ollama()();
            } else if (initRes && !initRes.instalado) {
                const iconoWarn = (typeof window.obtenerIconoDialogoSVG === 'function')
                    ? window.obtenerIconoDialogoSVG('advertencia', 'lira-inline-svg')
                    : '';
                const msgSeguro = (typeof window.escapeHtml === 'function')
                    ? window.escapeHtml(initRes.mensaje)
                    : String(initRes.mensaje ?? '');
                hwBox.innerHTML = `<span class="tienda-hw-alerta">${iconoWarn} <b>${msgSeguro}</b></span>`;
                await cargarCatalogoHF();
                return;
            }
        } catch (e) {}
    }
    _ollamaInstaladosCache = info.instalados || [];

    const svgCpu = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/></svg>';
    const svgStar = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#f39c12" stroke-width="2" style="vertical-align:-2px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    const svgBox = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>';

    const vramTxt = (info.vram_gb && info.vram_gb > 0) ? ` &nbsp;|&nbsp; <b>VRAM:</b> ${info.vram_gb} GB` : '';
    window._ollamaHardwareInfo = info;
    const btnConsultar = `<button type="button" id="btn-consultar-modelos-hw" onclick="toggleRecomendacionHardwareOllama()" title="Consultar qué modelos soporta tu equipo" style="display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:6px; border:1px solid #6366f1; background:rgba(99,102,241,0.1); color:#4f46e5; font-size:11.5px; font-weight:700; cursor:pointer;"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>Escoge modelos</span></button>`;
    hwBox.innerHTML = info.ollama_activo
        ? `${svgCpu} <b>RAM:</b> ${info.ram_gb} GB${vramTxt} &nbsp;|&nbsp; ${svgStar} ${btnConsultar} &nbsp;|&nbsp; ${svgBox} <b>Instalados:</b> ${_ollamaInstaladosCache.length}`
        : `<b>Ollama no detectado en localhost:11434.</b> Descarga Ollama desde ollama.com para acceder a los modelos locales. &nbsp; ${btnConsultar}`;

    const recomPanel = document.getElementById('tienda-ollama-recom-panel');
    if (recomPanel) recomPanel.style.display = 'none';

    await cargarCatalogoHF();
}

function toggleRecomendacionHardwareOllama() {
    const panel = document.getElementById('tienda-ollama-recom-panel');
    if (!panel) return;
    if (panel.style.display === 'block') {
        panel.style.display = 'none';
        return;
    }
    const info = window._ollamaHardwareInfo || {};
    const esp = info.especificacion || {};
    const q4 = Array.isArray(esp.rango_parametros_q4) ? esp.rango_parametros_q4 : [2, 4];
    const gpuTxt = info.gpu_nombre ? `<div style="font-size:11px; opacity:0.8; margin-bottom:6px;">GPU detectada: <b>${info.gpu_nombre}</b> (${info.vram_gb || 0} GB VRAM) · RAM: <b>${info.ram_gb || 8} GB</b> · Núcleos físicos: <b>${info.nucleos_fisicos || 4}</b></div>` : '';
    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <strong style="font-size:12.5px;">Recomendación según tu equipo</strong>
            <button type="button" onclick="toggleRecomendacionHardwareOllama()" style="background:none; border:none; cursor:pointer; font-size:15px; line-height:1; color:inherit;">&times;</button>
        </div>
        ${gpuTxt}
        <ul style="margin:0 0 8px 16px; padding:0;">
            <li><b>Modo recomendado:</b> ${esp.modo || 'Híbrido'}</li>
            <li><b>Peso máximo del archivo:</b> ~${esp.peso_max_gb || 4.0} GB</li>
            <li><b>Opción equilibrada (Recomendada):</b> Modelos de <b>${q4[0]}B a ${q4[1]}B</b> parámetros en <code>Q4_K_M</code></li>
            <li><b>Opción máxima precisión:</b> Modelos de hasta <b>${esp.params_q8_max || 3}B</b> parámetros en <code>Q8_0</code></li>
            <li><b>Hilos sugeridos (num_thread):</b> ${esp.num_thread || info.nucleos_fisicos || 4}</li>
        </ul>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" onclick="aplicarFiltroCuantizacionHF('Q4_K_M')" style="padding:4px 10px; border-radius:6px; border:1px solid #6366f1; background:#6366f1; color:#fff; font-size:11px; font-weight:600; cursor:pointer;">Buscar Q4_K_M</button>
            <button type="button" onclick="aplicarFiltroCuantizacionHF('Q8_0')" style="padding:4px 10px; border-radius:6px; border:1px solid #64748b; background:transparent; color:inherit; font-size:11px; font-weight:600; cursor:pointer;">Buscar Q8_0</button>
        </div>
    `;
    panel.style.display = 'block';
}
window.toggleRecomendacionHardwareOllama = toggleRecomendacionHardwareOllama;

function aplicarFiltroCuantizacionHF(qTag) {
    const inp = document.getElementById('txt-hf-buscar');
    if (inp) {
        inp.value = qTag;
        if (typeof cargarCatalogoHF === 'function') cargarCatalogoHF();
    }
}
window.aplicarFiltroCuantizacionHF = aplicarFiltroCuantizacionHF;

async function cargarCatalogoHF() {
    const lista = document.getElementById('tienda-ollama-lista');
    const query = document.getElementById('txt-hf-buscar')?.value || '';
    if (!lista) return;

    lista.innerHTML = '<div style="font-size:12px; color:#636e72; padding:12px; text-align:center;">Consultando Hugging Face API...</div>';
    let res = { exito: false, modelos: [] };
    if (typeof eel !== 'undefined' && typeof eel.buscar_modelos_hf_gguf === 'function') {
        try { res = await eel.buscar_modelos_hf_gguf(query, 15)(); } catch (e) {}
    }

    if (!res.exito || !res.modelos.length) {
        lista.innerHTML = `<div style="font-size:12px; color:#d63031; padding:12px;">No se pudieron cargar modelos de Hugging Face${res.error ? ': ' + res.error : ''}.</div>`;
        return;
    }

    lista.innerHTML = res.modelos.map(m => {
        const yaInstalado = _ollamaInstaladosCache.some(x => x.includes(m.id));
        const safeId = m.hf_tag.replace(/[^a-zA-Z0-9]/g, '_');
        const tipo = (m.pipeline === 'feature-extraction') ? 'embed' : 'chat';
        const estadoAct = (window._ollamaEstadoDescarga || {})[m.hf_tag];
        const enCurso = (estadoAct === 'descargando' || estadoAct === 'pausado');
        const estaPausado = (estadoAct === 'pausado');
        const pctGuardado = (window._ollamaUltimoPct || {})[m.hf_tag] || 0;
        return `
        <div style="border:1px solid #dfe6e9; border-radius:8px; padding:10px; display:flex; justify-content:space-between; align-items:center; gap:10px; background:#fff;">
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; font-size:12.5px; word-break:break-all;">${m.id}</div>
                <div style="font-size:11px; color:#636e72; margin-top:3px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="display:inline-flex; align-items:center; gap:3px;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>${m.peso || 'N/D'}</span>
                    <span>•</span>
                    <span style="display:inline-flex; align-items:center; gap:3px;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>${Number(m.downloads).toLocaleString()} descargas</span>
                    <span>•</span>
                    <span style="display:inline-flex; align-items:center; gap:3px;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#e84393" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>${Number(m.likes).toLocaleString()}</span>
                </div>
                <div id="ollama-prog-${safeId}" style="font-size:11px; color:#0984e3; margin-top:4px; display:${enCurso ? 'block' : 'none'};">${enCurso ? (estaPausado ? `Pausado (${pctGuardado}%)` : `Descargando (${pctGuardado}%)`) : ''}</div>
            </div>
            <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                <div id="ollama-card-ctrl-${safeId}" style="display:${enCurso ? 'flex' : 'none'}; align-items:center; gap:4px;">
                    ${_renderBotonesControlOllama(m.hf_tag, estaPausado, 'card-' + safeId)}
                </div>
                <button type="button" id="btn-ollama-${safeId}" onclick="instalarModeloOllama('${m.hf_tag}', '${tipo}')"
                    ${enCurso ? 'disabled' : ''}
                    style="padding:6px 10px; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; background:${yaInstalado ? '#0984e3' : '#6c5ce7'}; color:#fff; white-space:nowrap;">
                    ${enCurso ? (estaPausado ? 'Pausado' : 'Descargando...') : (yaInstalado ? 'Usar modelo' : 'Instalar y Usar')}
                </button>
            </div>
        </div>`;
    }).join('');
}

const _SVG_OLLAMA_PAUSA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;min-width:16px;min-height:16px;flex-shrink:0;pointer-events:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
const _SVG_OLLAMA_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;min-width:16px;min-height:16px;flex-shrink:0;pointer-events:none;"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
const _SVG_OLLAMA_CANCEL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;min-width:16px;min-height:16px;flex-shrink:0;pointer-events:none;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

function _renderBotonesControlOllama(nombre, estaPausado, idPrefijo) {
    const fnPausa = estaPausado ? `reanudarDescargaOllama('${nombre}')` : `pausarDescargaOllama('${nombre}')`;
    return `
        <button type="button" id="btn-ollama-${idPrefijo}-pausa" title="${estaPausado ? 'Reanudar descarga' : 'Pausar descarga'}"
            onclick="${fnPausa}"
            style="width:30px; min-width:30px; height:30px; padding:0 !important; display:inline-flex; align-items:center; justify-content:center; border:none; border-radius:6px; cursor:pointer; background:#f39c12; color:#fff; flex-shrink:0;">
            ${estaPausado ? _SVG_OLLAMA_PLAY : _SVG_OLLAMA_PAUSA}
        </button>
        <button type="button" id="btn-ollama-${idPrefijo}-cancelar" title="Cancelar descarga"
            onclick="cancelarDescargaOllama('${nombre}')"
            style="width:30px; min-width:30px; height:30px; padding:0 !important; display:inline-flex; align-items:center; justify-content:center; border:none; border-radius:6px; cursor:pointer; background:#d63031; color:#fff; flex-shrink:0;">
            ${_SVG_OLLAMA_CANCEL}
        </button>`;
}

function asignarModeloOllamaActivo(nombre, tipo) {
    if (typeof estadoIA !== 'undefined') {
        if (tipo === 'embed') {
            estadoIA.modeloEmbedSeleccionado = nombre;
        } else {
            estadoIA.modeloChatSeleccionado = nombre;
        }
    }
    if (typeof configProveedores !== 'undefined') {
        configProveedores.proveedorActivo = 'ollama';
    }
    if (typeof guardarTodosAjustes === 'function') guardarTodosAjustes(false);
    if (typeof mostrarToastLira === 'function') mostrarToastLira(`Modelo activo: ${nombre}`, 'exito');
}

async function instalarModeloOllama(nombre, tipo) {
    const safeId = nombre.replace(/[^a-zA-Z0-9]/g, '_');
    const prog = document.getElementById(`ollama-prog-${safeId}`);
    const btn = document.getElementById(`btn-ollama-${safeId}`);
    if (btn && btn.textContent.trim() === 'Usar modelo') {
        asignarModeloOllamaActivo(nombre, tipo);
        return;
    }
    window._ollamaEstadoDescarga = window._ollamaEstadoDescarga || {};
    window._ollamaUltimoPct = window._ollamaUltimoPct || {};
    window._ollamaTipoPendiente = window._ollamaTipoPendiente || {};
    window._ollamaEstadoDescarga[nombre] = 'descargando';
    const pctPrev = window._ollamaUltimoPct[nombre] || 0;
    window._ollamaTipoPendiente[nombre] = tipo;

    if (prog) { prog.style.display = 'block'; prog.style.color = '#0984e3'; prog.textContent = pctPrev > 0 ? `Reanudando (${pctPrev}%)...` : 'Iniciando descarga...'; }
    if (btn) { btn.disabled = true; btn.textContent = 'Descargando...'; }
    _actualizarControlesTarjetaTienda(nombre, true, false);
    renderizarPanelDescargasOllama(nombre, pctPrev, pctPrev > 0 ? 'Reanudando...' : 'Iniciando descarga...', false, false);

    if (typeof eel !== 'undefined' && typeof eel.descargar_modelo_ollama === 'function') {
        await eel.descargar_modelo_ollama(nombre)();
    }
}

function _actualizarControlesTarjetaTienda(nombre, mostrar, estaPausado) {
    const safeId = nombre.replace(/[^a-zA-Z0-9]/g, '_');
    const ctrl = document.getElementById(`ollama-card-ctrl-${safeId}`);
    if (!ctrl) return;
    ctrl.style.display = mostrar ? 'flex' : 'none';
    if (mostrar && (ctrl.dataset.pausado !== String(estaPausado) || !ctrl.innerHTML.trim())) {
        ctrl.dataset.pausado = String(estaPausado);
        ctrl.innerHTML = _renderBotonesControlOllama(nombre, estaPausado, 'card-' + safeId);
    }
}

function renderizarPanelDescargasOllama(nombre, pct, estado, completado, esError) {
    const panel = document.getElementById('ollama-descargas-panel');
    if (!panel) return;

    window._ollamaDescargasActivas = window._ollamaDescargasActivas || {};
    if (nombre) {
        if (completado || (esError && estado === 'Cancelado')) {
            delete window._ollamaDescargasActivas[nombre];
        } else {
            window._ollamaDescargasActivas[nombre] = {
                pct: Number(pct) || 0,
                estado: String(estado || 'Descargando...'),
                pausado: estado === 'Pausado',
                esError: Boolean(esError)
            };
        }
    }

    const claves = Object.keys(window._ollamaDescargasActivas);
    if (claves.length === 0) {
        panel.innerHTML = 'No hay modelos con descarga pendiente';
        panel.dataset.modelosActivos = '';
        return;
    }

    // Reconstruir filas solo si cambió la lista de modelos o su estado pausado
    const firma = claves.map(k => `${k}:${window._ollamaDescargasActivas[k].pausado}`).join('|');
    if (panel.dataset.modelosActivos !== firma) {
        panel.dataset.modelosActivos = firma;
        panel.innerHTML = `<div style="display:flex; flex-direction:column; gap:8px;">` + claves.map(mod => {
            const safeId = mod.replace(/[^a-zA-Z0-9]/g, '_');
            const infoM = window._ollamaDescargasActivas[mod];
            return `
                <div id="ollama-panel-row-${safeId}" style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding-bottom:6px; border-bottom:1px solid rgba(148,163,184,0.2);">
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:600; color:inherit; word-break:break-all; font-size:11.5px;">${mod}</div>
                        <div id="ollama-panel-status-${safeId}" style="font-size:11px; color:${infoM.esError ? '#d63031' : '#0984e3'}; margin-top:2px;"></div>
                    </div>
                    <div style="display:flex; gap:6px; flex-shrink:0;">
                        ${_renderBotonesControlOllama(mod, infoM.pausado, 'panel-' + safeId)}
                    </div>
                </div>`;
        }).join('') + `</div>`;
    }

    claves.forEach(mod => {
        const safeId = mod.replace(/[^a-zA-Z0-9]/g, '_');
        const infoM = window._ollamaDescargasActivas[mod];
        const stEl = document.getElementById(`ollama-panel-status-${safeId}`);
        if (stEl) {
            stEl.style.color = infoM.esError ? '#d63031' : (infoM.pausado ? '#e67e22' : '#0984e3');
            stEl.textContent = infoM.esError ? infoM.estado : `${infoM.estado} (${infoM.pct}%)`;
        }
    });
}

async function pausarDescargaOllama(nombre) {
    window._ollamaEstadoDescarga = window._ollamaEstadoDescarga || {};
    window._ollamaUltimoPct = window._ollamaUltimoPct || {};
    window._ollamaEstadoDescarga[nombre] = 'pausado';
    const pct = window._ollamaUltimoPct[nombre] || 0;

    renderizarPanelDescargasOllama(nombre, pct, 'Pausado', false, false);
    const safeId = nombre.replace(/[^a-zA-Z0-9]/g, '_');
    const prog = document.getElementById(`ollama-prog-${safeId}`);
    const btn = document.getElementById(`btn-ollama-${safeId}`);
    if (prog) { prog.style.display = 'block'; prog.style.color = '#e67e22'; prog.textContent = `Pausado (${pct}%)`; }
    if (btn) { btn.disabled = true; btn.textContent = 'Pausado'; }
    _actualizarControlesTarjetaTienda(nombre, true, true);

    if (typeof eel !== 'undefined' && typeof eel.pausar_descarga_ollama === 'function') {
        await eel.pausar_descarga_ollama(nombre)();
    }
}

async function reanudarDescargaOllama(nombre) {
    const tipo = (window._ollamaTipoPendiente && window._ollamaTipoPendiente[nombre]) || 'chat';
    await instalarModeloOllama(nombre, tipo);
}

async function cancelarDescargaOllama(nombre) {
    window._ollamaEstadoDescarga = window._ollamaEstadoDescarga || {};
    window._ollamaUltimoPct = window._ollamaUltimoPct || {};
    window._ollamaEstadoDescarga[nombre] = 'cancelado';
    window._ollamaUltimoPct[nombre] = 0;

    renderizarPanelDescargasOllama(nombre, 0, 'Cancelado', false, true);
    const safeId = nombre.replace(/[^a-zA-Z0-9]/g, '_');
    const prog = document.getElementById(`ollama-prog-${safeId}`);
    const btn = document.getElementById(`btn-ollama-${safeId}`);
    if (prog) { prog.style.display = 'block'; prog.style.color = '#d63031'; prog.textContent = 'Cancelado'; }
    if (btn) { btn.disabled = false; btn.textContent = 'Instalar y Usar'; }
    _actualizarControlesTarjetaTienda(nombre, false, false);

    if (typeof eel !== 'undefined' && typeof eel.cancelar_descarga_ollama === 'function') {
        await eel.cancelar_descarga_ollama(nombre)();
    }
}

if (typeof eel !== 'undefined' && typeof eel.expose === 'function') {
    eel.expose(actualizarProgresoOllama);
}
function actualizarProgresoOllama(nombre, pct, estado, completado, esError) {
    window._ollamaEstadoDescarga = window._ollamaEstadoDescarga || {};
    window._ollamaUltimoPct = window._ollamaUltimoPct || {};
    const estadoLocal = window._ollamaEstadoDescarga[nombre];

    // Descartar eventos rezagados que venían en vuelo si el usuario ya pausó o canceló
    if (estadoLocal === 'cancelado' && !(esError && estado === 'Cancelado')) {
        return;
    }
    if (estadoLocal === 'pausado' && estado !== 'Pausado' && !esError) {
        return;
    }

    if (!completado && !esError && estado !== 'Pausado') {
        window._ollamaUltimoPct[nombre] = pct;
    }
    if (completado) {
        delete window._ollamaEstadoDescarga[nombre];
        delete window._ollamaUltimoPct[nombre];
    } else if (esError && estado === 'Cancelado') {
        window._ollamaUltimoPct[nombre] = 0;
    }

    renderizarPanelDescargasOllama(nombre, pct, estado, completado, esError);
    const safeId = nombre.replace(/[^a-zA-Z0-9]/g, '_');
    const prog = document.getElementById(`ollama-prog-${safeId}`);
    const btn = document.getElementById(`btn-ollama-${safeId}`);
    if (prog) {
        prog.style.display = 'block';
        prog.style.color = esError ? '#d63031' : (estado === 'Pausado' ? '#e67e22' : '#0984e3');
        prog.textContent = esError ? estado : `${estado} (${pct}%)`;
    }
    if (completado) {
        _actualizarControlesTarjetaTienda(nombre, false, false);
        if (btn) { btn.disabled = false; btn.textContent = 'Usar modelo'; btn.style.background = '#0984e3'; }
        const tipo = (window._ollamaTipoPendiente && window._ollamaTipoPendiente[nombre]) || 'chat';
        asignarModeloOllamaActivo(nombre, tipo);
    } else if (estado === 'Pausado') {
        _actualizarControlesTarjetaTienda(nombre, true, true);
        if (btn) { btn.disabled = true; btn.textContent = 'Pausado'; }
    } else if (esError) {
        _actualizarControlesTarjetaTienda(nombre, false, false);
        if (btn) {
            btn.disabled = false;
            btn.textContent = (estado === 'Cancelado') ? 'Instalar y Usar' : 'Reintentar';
        }
    } else {
        _actualizarControlesTarjetaTienda(nombre, true, false);
    }
}


// --- GESTOR DE PROMPTS PERSONALIZADOS ---
let _promptsPersonalizadosCache = [];
let _promptEditandoIdx = -1;

async function cargarPromptsPersonalizados() {
    if (typeof eel !== 'undefined' && typeof eel.cargar_prompts_personalizados === 'function') {
        try {
            const lista = await eel.cargar_prompts_personalizados()();
            _promptsPersonalizadosCache = Array.isArray(lista) ? lista : [];
        } catch (e) {
            _promptsPersonalizadosCache = [];
        }
    }
    renderizarPromptsPersonalizados();
}

function renderizarPromptsPersonalizados() {
    const cont = document.getElementById('ia-lista-prompts-guardados');
    if (!cont) return;
    if (!_promptsPersonalizadosCache.length) {
        cont.innerHTML = '<div style="font-size:11.5px; color:#7f8c8d; text-align:center; padding:6px;">No tienes prompts guardados aún.</div>';
        return;
    }
    const svgPlay = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="2.5" style="display:block;pointer-events:none;"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    const svgEdit = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="2" style="display:block;pointer-events:none;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
    const svgDel = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="2" style="display:block;pointer-events:none;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

    cont.innerHTML = _promptsPersonalizadosCache.map((p, idx) => `
        <div class="ia-prompt-saved-card" style="background:#fff; border:1px solid #dfe6e9; border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div style="flex:1; min-width:0;">
                <div class="ia-prompt-saved-title" style="font-weight:700; font-size:12px; color:#2c3e50; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.titulo || 'Prompt sin título'}</div>
                <div class="ia-prompt-saved-desc" style="font-size:11px; color:#636e72; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.prompt || ''}</div>
            </div>
            <div style="display:flex; gap:4px; flex-shrink:0;">
                <button type="button" title="Ejecutar este prompt" onclick="ejecutarPromptGuardado(${idx})"
                    style="width:28px; min-width:28px; height:28px; padding:0 !important; display:inline-flex; align-items:center; justify-content:center; border:none; border-radius:6px; cursor:pointer; background:#6c5ce7;">
                    ${svgPlay}
                </button>
                <button type="button" title="Editar prompt" onclick="editarPromptGuardado(${idx})"
                    style="width:28px; min-width:28px; height:28px; padding:0 !important; display:inline-flex; align-items:center; justify-content:center; border:none; border-radius:6px; cursor:pointer; background:#0984e3;">
                    ${svgEdit}
                </button>
                <button type="button" title="Eliminar prompt" onclick="eliminarPromptGuardado(${idx})"
                    style="width:28px; min-width:28px; height:28px; padding:0 !important; display:inline-flex; align-items:center; justify-content:center; border:none; border-radius:6px; cursor:pointer; background:#d63031;">
                    ${svgDel}
                </button>
            </div>
        </div>
    `).join('');
}

async function guardarPromptPersonalizado() {
    const titEl = document.getElementById('ia-prompt-titulo');
    const txtEl = document.getElementById('ia-input-solicitud-custom');
    const titulo = (titEl?.value || '').trim();
    const prompt = (txtEl?.value || '').trim();
    if (!prompt) {
        if (typeof mostrarToastLira === 'function') mostrarToastLira('Escribe el texto del prompt antes de guardar.');
        return;
    }
    const item = { titulo: titulo || `Prompt ${_promptsPersonalizadosCache.length + 1}`, prompt };
    if (_promptEditandoIdx >= 0 && _promptEditandoIdx < _promptsPersonalizadosCache.length) {
        _promptsPersonalizadosCache[_promptEditandoIdx] = item;
        _promptEditandoIdx = -1;
    } else {
        _promptsPersonalizadosCache.unshift(item);
    }
    if (typeof eel !== 'undefined' && typeof eel.guardar_prompts_personalizados === 'function') {
        await eel.guardar_prompts_personalizados(_promptsPersonalizadosCache)();
    }
    if (titEl) titEl.value = '';
    if (txtEl) txtEl.value = '';
    renderizarPromptsPersonalizados();
    if (typeof mostrarToastLira === 'function') mostrarToastLira('Prompt guardado.');
}

function ejecutarPromptGuardado(idx) {
    const item = _promptsPersonalizadosCache[idx];
    if (!item) return;
    const txtEl = document.getElementById('ia-input-solicitud-custom');
    if (txtEl) txtEl.value = item.prompt;
    if (typeof ejecutarSolicitudPersonalizada === 'function') {
        ejecutarSolicitudPersonalizada();
    }
}

function editarPromptGuardado(idx) {
    const item = _promptsPersonalizadosCache[idx];
    if (!item) return;
    _promptEditandoIdx = idx;
    const titEl = document.getElementById('ia-prompt-titulo');
    const txtEl = document.getElementById('ia-input-solicitud-custom');
    if (titEl) titEl.value = item.titulo || '';
    if (txtEl) { txtEl.value = item.prompt || ''; txtEl.focus(); }
}

async function eliminarPromptGuardado(idx) {
    _promptsPersonalizadosCache.splice(idx, 1);
    if (_promptEditandoIdx === idx) _promptEditandoIdx = -1;
    if (typeof eel !== 'undefined' && typeof eel.guardar_prompts_personalizados === 'function') {
        await eel.guardar_prompts_personalizados(_promptsPersonalizadosCache)();
    }
    renderizarPromptsPersonalizados();
}

document.addEventListener('DOMContentLoaded', () => {
    _vincularBackdropTiendaOllama();
    setTimeout(cargarPromptsPersonalizados, 800);
});

if (typeof eel !== 'undefined' && typeof eel.expose === 'function') {
    eel.expose(recibirStreamIA);
}
function recibirStreamIA(destino, textoParcial) {
    if (!textoParcial) return;
    if (destino === 'solicitud') {
        const cuerpo = document.getElementById('ia-resultado-cuerpo');
        if (cuerpo) {
            cuerpo.innerHTML = formatearMarkdown(textoParcial, []);
        }
    } else if (destino === 'chat') {
        const historial = document.getElementById('ia-chat-historial');
        if (historial) {
            const burbujas = historial.querySelectorAll('.ia-mensaje.ai .ia-burbuja');
            const ultima = burbujas.length ? burbujas[burbujas.length - 1] : null;
            if (ultima && !ultima.querySelector('.ia-msg-acciones')) {
                ultima.style.display = 'block';
                ultima.innerHTML = formatearMarkdown(textoParcial, []);
                historial.scrollTop = historial.scrollHeight;
            }
        }
    }
}

async function _guardarRespuestaIAEnNotas(tituloSugerido, contenidoHtmlOPlano) {
    if (!contenidoHtmlOPlano || !String(contenidoHtmlOPlano).trim()) {
        if (typeof mostrarToastLira === 'function') mostrarToastLira('No hay contenido para guardar en notas.');
        return;
    }
    const pag = (typeof paginaActual === 'number' ? paginaActual + 1 : 1);
    const libro = (typeof obtenerNombreLibroActivo === 'function')
        ? obtenerNombreLibroActivo()
        : ((typeof rutaPDFActual === 'string' && rutaPDFActual) ? rutaPDFActual.split(/[\\/]/).pop() : 'General');
    const notaData = {
        titulo: tituloSugerido || `Análisis LiraAI - Pág. ${pag}`,
        clasificacion: 'LiraAI',
        pagina: pag,
        libro: libro,
        contenido: String(contenidoHtmlOPlano).trim().replace(/\n/g, '<br>'),
        fecha_creacion: null,
        ruta_absoluta: null
    };
    if (typeof eel !== 'undefined' && typeof eel.notas_guardar === 'function') {
        try {
            const res = await eel.notas_guardar(notaData, window.rutaNotasPersonalizada || '')();
            if (res && res.exito) {
                if (typeof cargarNotasDesdeBackend === 'function') cargarNotasDesdeBackend();
                if (typeof mostrarToastLira === 'function') mostrarToastLira('Respuesta importada a tus Notas', 'exito');
            } else {
                if (typeof mostrarToastLira === 'function') mostrarToastLira('Error al guardar en notas', 'advertencia');
            }
        } catch (e) {
            if (typeof mostrarToastLira === 'function') mostrarToastLira('Error al guardar en notas', 'advertencia');
        }
    }
}

async function importarResultadoIAANotas() {
    const cuerpo = document.getElementById('ia-resultado-cuerpo');
    const tituloEl = document.getElementById('ia-resultado-titulo');
    const texto = cuerpo?.getAttribute('data-texto-plano') || cuerpo?.innerText || '';
    const tit = (tituloEl?.innerText || 'Análisis LiraAI').replace(/^[^\wÁÉÍÓÚáéíóúñÑ]+/, '').trim();
    await _guardarRespuestaIAEnNotas(tit, texto);
}

async function liraImportarMensajeANotas(msgId) {
    const texto = (window._liraTextosMap && window._liraTextosMap[msgId])
        ? window._liraTextosMap[msgId]
        : (document.getElementById(msgId)?.querySelector('.ia-burbuja')?.innerText || '');
    const pag = (typeof paginaActual === 'number' ? paginaActual + 1 : 1);
    await _guardarRespuestaIAEnNotas(`Respuesta LiraAI - Pág. ${pag}`, texto);
}
