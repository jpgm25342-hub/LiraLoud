/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

/**
 * ==========================================================================
 * LIRALOUD - MÓDULO FRONTEND DE INTELIGENCIA ARTIFICIAL (LiraAI / RAG)
 * ==========================================================================
 */

const PROVEEDORES_CLOUD = {
    gemini: {
        nombre: 'Google Gemini',
        cardTitulo: '🌐 Conexión Google Gemini',
        linkKey: 'https://aistudio.google.com/app/apikey',
        linkTexto: '🔑 Obtener Gemini API Key gratis ↗',
        placeholder: 'Pega tu clave AIzaSy... aquí',
        modelos: [
            { id: 'gemini-1.5-flash', nombre: 'Gemini 1.5 Flash (Ultrarrápido, Recomendado)' },
            { id: 'gemini-2.0-flash', nombre: 'Gemini 2.0 Flash (Última generación)' },
            { id: 'gemini-1.5-pro', nombre: 'Gemini 1.5 Pro (Máximo razonamiento)' }
        ],
        defaultModelo: 'gemini-1.5-flash'
    },
    groq: {
        nombre: 'Groq Cloud',
        cardTitulo: '⚡ Conexión Groq Cloud (Ultra Rápido)',
        linkKey: 'https://console.groq.com/keys',
        linkTexto: '🔑 Obtener Groq API Key gratis ↗',
        placeholder: 'Pega tu clave gsk_... aquí',
        modelos: [
            { id: 'llama-3.3-70b-versatile', nombre: 'Llama 3.3 70B Versatile (Recomendado)' },
            { id: 'llama-3.1-8b-instant', nombre: 'Llama 3.1 8B Instant (Ultra veloz)' },
            { id: 'deepseek-r1-distill-llama-70b', nombre: 'DeepSeek R1 Distill Llama 70B' },
            { id: 'mixtral-8x7b-32768', nombre: 'Mixtral 8x7B (Contexto 32k)' }
        ],
        defaultModelo: 'llama-3.3-70b-versatile'
    },
    openrouter: {
        nombre: 'OpenRouter',
        cardTitulo: '🌐 Conexión OpenRouter (Modelos Gratis & Premium)',
        linkKey: 'https://openrouter.ai/keys',
        linkTexto: '🔑 Obtener OpenRouter API Key ↗',
        placeholder: 'Pega tu clave sk-or-... aquí',
        modelos: [
            { id: 'meta-llama/llama-3.3-70b-instruct:free', nombre: 'Llama 3.3 70B Instruct (Gratis :free)' },
            { id: 'deepseek/deepseek-r1:free', nombre: 'DeepSeek R1 (Gratis :free)' },
            { id: 'google/gemini-2.0-flash-exp:free', nombre: 'Gemini 2.0 Flash (Gratis :free)' },
            { id: 'qwen/qwen-2.5-72b-instruct:free', nombre: 'Qwen 2.5 72B Instruct (Gratis :free)' },
            { id: 'meta-llama/llama-3.1-8b-instruct:free', nombre: 'Llama 3.1 8B Instruct (Gratis :free)' },
            { id: 'mistralai/mistral-7b-instruct:free', nombre: 'Mistral 7B Instruct (Gratis :free)' }
        ],
        defaultModelo: 'meta-llama/llama-3.3-70b-instruct:free'
    },
    openai: {
        nombre: 'OpenAI ChatGPT',
        cardTitulo: '🤖 Conexión OpenAI (ChatGPT)',
        linkKey: 'https://platform.openai.com/api-keys',
        linkTexto: '🔑 Obtener OpenAI API Key ↗',
        placeholder: 'Pega tu clave sk-... aquí',
        modelos: [
            { id: 'gpt-4o-mini', nombre: 'GPT-4o Mini (Rápido y económico)' },
            { id: 'gpt-4o', nombre: 'GPT-4o (Modelo insignia)' },
            { id: 'gpt-3.5-turbo', nombre: 'GPT-3.5 Turbo' }
        ],
        defaultModelo: 'gpt-4o-mini'
    },
    deepseek: {
        nombre: 'DeepSeek Oficial',
        cardTitulo: '🐋 Conexión DeepSeek API',
        linkKey: 'https://platform.deepseek.com/api_keys',
        linkTexto: '🔑 Obtener DeepSeek API Key ↗',
        placeholder: 'Pega tu clave sk-... aquí',
        modelos: [
            { id: 'deepseek-chat', nombre: 'DeepSeek-V3 (deepseek-chat)' },
            { id: 'deepseek-reasoner', nombre: 'DeepSeek-R1 (Razonamiento profundo)' }
        ],
        defaultModelo: 'deepseek-chat'
    }
};

let configProveedores = {
    proveedorActivo: 'ollama', // 'ollama' | 'gemini' | 'groq' | 'openrouter' | 'openai' | 'deepseek'
    keys: {
        gemini: '',
        groq: '',
        openrouter: '',
        openai: '',
        deepseek: ''
    },
    modelos: {
        gemini: 'gemini-1.5-flash',
        groq: 'llama-3.3-70b-versatile',
        openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
        openai: 'gpt-4o-mini',
        deepseek: 'deepseek-chat'
    }
};

let estadoIA = {
    ollamaOnline: false,
    modelosChat: [],
    modelosEmbed: [],
    modeloChatSeleccionado: 'llama3.2',
    modeloEmbedSeleccionado: 'nomic-embed-text',
    documentoIndexado: false,
    totalChunks: 0,
    enProceso: false
};

let modoSalidaIA = 'trazabilidad';

// Exponer en window para sincronización global entre módulos
window.configProveedores = configProveedores;
window.estadoIA = estadoIA;
window.modoSalidaIA = modoSalidaIA;

function cambiarModoSalidaIA(nuevoModo) {
    modoSalidaIA = (nuevoModo === 'prosa') ? 'prosa' : 'trazabilidad';
    window.modoSalidaIA = modoSalidaIA;
    const selects = document.querySelectorAll('.sel-ia-modo-salida, #sel-ia-modo-salida, #sel-ia-modo-salida-config');
    selects.forEach(s => {
        if (s && s.value !== modoSalidaIA) {
            s.value = modoSalidaIA;
        }
    });
}
window.cambiarModoSalidaIA = cambiarModoSalidaIA;

// --- GESTIÓN DE PROVEEDORES DE IA (MODO HÍBRIDO) ---
function cambiarProveedorIA(proveedor) {
    if (!proveedor) proveedor = 'ollama';

    // 1. Preservar estado actual del proveedor anterior antes de cambiar
    const prevProv = configProveedores.proveedorActivo;
    if (prevProv && prevProv !== 'ollama') {
        const currentKey = document.getElementById('txt-ia-api-key')?.value;
        const currentModel = document.getElementById('sel-ia-modelo-cloud')?.value;
        if (currentKey && currentKey.trim()) {
            configProveedores.keys[prevProv] = currentKey.trim();
        }
        if (currentModel && currentModel !== '__custom_model_prompt__') {
            configProveedores.modelos[prevProv] = currentModel.trim();
        }
    }

    configProveedores.proveedorActivo = proveedor;

    const cardLocal = document.getElementById('ia-card-local-ollama');
    const cardCloud = document.getElementById('ia-card-cloud-config');
    const selProveedor = document.getElementById('sel-ia-proveedor');
    const cardTitle = document.getElementById('ia-cloud-card-title');
    const btnObtenerKey = document.getElementById('btn-ia-obtener-key');
    const txtApiKey = document.getElementById('txt-ia-api-key');
    const selModeloCloud = document.getElementById('sel-ia-modelo-cloud');
    const testStatus = document.getElementById('ia-cloud-test-status');
    const lblInfo = document.getElementById('lbl-info-modelos-cloud');

    if (selProveedor && selProveedor.value !== proveedor) {
        selProveedor.value = proveedor;
    }
    if (testStatus) testStatus.innerHTML = '';
    if (lblInfo) lblInfo.innerHTML = '';

    if (proveedor === 'ollama') {
        if (cardLocal) cardLocal.style.display = 'block';
        if (cardCloud) cardCloud.style.display = 'none';
        actualizarBadgeEstadoIA('ollama');
        if (typeof eel !== 'undefined' && eel.rag_configurar_proveedor) {
            eel.rag_configurar_proveedor('ollama', '', '')();
        }
    } else {
        if (cardLocal) cardLocal.style.display = 'none';
        if (cardCloud) cardCloud.style.display = 'block';

        const info = PROVEEDORES_CLOUD[proveedor];
        if (info) {
            if (cardTitle) cardTitle.innerText = info.cardTitulo;
            if (btnObtenerKey) {
                btnObtenerKey.innerText = info.linkTexto;
                btnObtenerKey.title = `Abrir consola oficial de ${info.nombre}`;
            }
            if (txtApiKey) {
                txtApiKey.placeholder = info.placeholder;
                txtApiKey.value = configProveedores.keys[proveedor] || '';
            }
            if (selModeloCloud) {
                selModeloCloud.innerHTML = '';
                const modeloGuardado = configProveedores.modelos[proveedor] || info.defaultModelo;
                let matchFound = false;

                const listaModelos = [...(info.modelos || [])];
                if (modeloGuardado && !listaModelos.some(m => m.id === modeloGuardado)) {
                    listaModelos.unshift({
                        id: modeloGuardado,
                        nombre: `${modeloGuardado} (Guardado / Personalizado)`
                    });
                }

                listaModelos.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.text = m.nombre || m.id;
                    if (m.id === modeloGuardado) {
                        opt.selected = true;
                        matchFound = true;
                    }
                    selModeloCloud.appendChild(opt);
                });

                // Opción para ingresar manualmente cualquier modelo
                const optCustom = document.createElement('option');
                optCustom.value = '__custom_model_prompt__';
                optCustom.text = '✍️ Escribir otro modelo...';
                selModeloCloud.appendChild(optCustom);

                if (matchFound) {
                    selModeloCloud.value = modeloGuardado;
                }
            }
            actualizarBadgeEstadoIA(proveedor);

            const activeKey = configProveedores.keys[proveedor] || '';
            const activeModel = configProveedores.modelos[proveedor] || info.defaultModelo;
            if (typeof eel !== 'undefined' && eel.rag_configurar_proveedor) {
                eel.rag_configurar_proveedor(proveedor, activeKey, activeModel)();
            }

            // Consultar modelos actualizados en vivo si hay API Key configurada
            refrescarModelosProveedorActual(false);
        }
    }

    if (typeof guardarTodosAjustes === 'function') {
        guardarTodosAjustes(false);
    }
    if (typeof actualizarGaugeTokensUI === 'function') {
        actualizarGaugeTokensUI(true);
    }
}

async function refrescarModelosProveedorActual(notificarUsuario = false) {
    const prov = configProveedores.proveedorActivo;
    if (!prov || prov === 'ollama') return;

    const btnRefresh = document.getElementById('btn-refrescar-modelos-cloud');
    const selModeloCloud = document.getElementById('sel-ia-modelo-cloud');
    const lblInfo = document.getElementById('lbl-info-modelos-cloud');
    const key = configProveedores.keys[prov] || '';

    if (btnRefresh) btnRefresh.innerText = '⏳ Cargando...';
    if (lblInfo) lblInfo.innerHTML = `<span style="color:#747d8c;">Consultando modelos activos de ${PROVEEDORES_CLOUD[prov]?.nombre || prov}...</span>`;

    try {
        if (typeof eel !== 'undefined' && eel.rag_obtener_modelos_proveedor) {
            const res = await eel.rag_obtener_modelos_proveedor(prov, key)();
            if (res && Array.isArray(res.modelos) && res.modelos.length > 0) {
                if (selModeloCloud) {
                    const modeloGuardado = configProveedores.modelos[prov] || PROVEEDORES_CLOUD[prov]?.defaultModelo;
                    selModeloCloud.innerHTML = '';
                    let matchFound = false;

                    const lista = [...res.modelos];
                    if (modeloGuardado && !lista.some(m => m.id === modeloGuardado)) {
                        lista.unshift({
                            id: modeloGuardado,
                            nombre: `${modeloGuardado} (Guardado / Personalizado)`
                        });
                    }

                    lista.forEach(m => {
                        const opt = document.createElement('option');
                        opt.value = m.id;
                        opt.text = m.nombre || m.id;
                        if (m.id === modeloGuardado) {
                            opt.selected = true;
                            matchFound = true;
                        }
                        selModeloCloud.appendChild(opt);
                    });

                    const optCustom = document.createElement('option');
                    optCustom.value = '__custom_model_prompt__';
                    optCustom.text = '✍️ Escribir otro modelo...';
                    selModeloCloud.appendChild(optCustom);

                    if (matchFound) {
                        selModeloCloud.value = modeloGuardado;
                    } else if (lista.length > 0) {
                        selModeloCloud.value = lista[0].id;
                        configProveedores.modelos[prov] = lista[0].id;
                    }
                }

                if (lblInfo) {
                    if (res.origen === 'live') {
                        lblInfo.innerHTML = `<span style="color:#27ae60; font-weight:600;">🟢 ${res.modelos.length} modelos actualizados en vivo</span>`;
                    } else if (res.origen === 'fallback_sin_key') {
                        lblInfo.innerHTML = `<span style="color:#e67e22;">ℹ️ Ingresa tu clave para listar los modelos en vivo.</span>`;
                    } else {
                        lblInfo.innerHTML = `<span style="color:#747d8c;">ℹ️ Modelos estándar recomendados.</span>`;
                    }
                }

                if (notificarUsuario) {
                    if (res.origen === 'live') {
                        mostrarToastLira(`✅ Modelos de ${PROVEEDORES_CLOUD[prov]?.nombre || prov} actualizados.`);
                    } else if (res.error) {
                        mostrarToastLira(`⚠️ Usando lista base (${res.error})`);
                    }
                }
                return;
            }
        }
    } catch (e) {
        console.warn("⚠️ [LiraAI] Error consultando modelos en tiempo real:", e);
        if (lblInfo) lblInfo.innerHTML = `<span style="color:#e74c3c;">⚠️ Error consultando lista en vivo.</span>`;
    } finally {
        if (btnRefresh) btnRefresh.innerText = '🔄 Actualizar lista';
    }
}

function actualizarBadgeEstadoIA(proveedor) {
    const badgeDot = document.getElementById('ia-status-dot');
    const badgeTexto = document.getElementById('ia-status-texto');
    if (!badgeDot || !badgeTexto) return;

    if (proveedor === 'ollama') {
        badgeDot.style.background = '';
        if (estadoIA.ollamaOnline) {
            badgeDot.className = 'ia-status-dot';
            badgeTexto.innerText = 'Local (Ollama)';
        } else {
            badgeDot.className = 'ia-status-dot offline';
            badgeTexto.innerText = 'Local Desconectado';
        }
    } else if (proveedor === 'gemini') {
        badgeDot.className = 'ia-status-dot';
        badgeDot.style.background = '#4285F4';
        badgeTexto.innerText = 'Google Gemini (Nube)';
    } else if (proveedor === 'groq') {
        badgeDot.className = 'ia-status-dot';
        badgeDot.style.background = '#F55036';
        badgeTexto.innerText = 'Groq Cloud (Nube)';
    } else if (proveedor === 'openrouter') {
        badgeDot.className = 'ia-status-dot';
        badgeDot.style.background = '#6366F1';
        badgeTexto.innerText = 'OpenRouter (Nube)';
    } else if (proveedor === 'openai') {
        badgeDot.className = 'ia-status-dot';
        badgeDot.style.background = '#10A37F';
        badgeTexto.innerText = 'OpenAI (Nube)';
    } else if (proveedor === 'deepseek') {
        badgeDot.className = 'ia-status-dot';
        badgeDot.style.background = '#4D6BFE';
        badgeTexto.innerText = 'DeepSeek (Nube)';
    }
}

let timeoutDebounceKey = null;
function actualizarApiKeyProveedorActual(val) {
    const prov = configProveedores.proveedorActivo;
    if (prov && prov !== 'ollama') {
        configProveedores.keys[prov] = (val || '').trim();
        const mod = configProveedores.modelos[prov] || '';
        if (typeof eel !== 'undefined' && eel.rag_configurar_proveedor) {
            eel.rag_configurar_proveedor(prov, configProveedores.keys[prov], mod)();
        }

        // Guardar inmediatamente la API Key en el JSON de ajustes en disco
        if (typeof guardarTodosAjustes === 'function') {
            guardarTodosAjustes(false);
        }

        // Si el usuario pega o escribe una clave, consultar la lista viva de modelos y sincronizar tokens
        clearTimeout(timeoutDebounceKey);
        timeoutDebounceKey = setTimeout(() => {
            if (configProveedores.keys[prov].length > 10) {
                refrescarModelosProveedorActual(false);
                actualizarGaugeTokensUI(true);
            }
        }, 1200);
    }
}

async function actualizarModeloCloudActual(val) {
    const prov = configProveedores.proveedorActivo;
    if (!prov || prov === 'ollama') return;

    if (val === '__custom_model_prompt__') {
        const modeloActual = configProveedores.modelos[prov] || '';
        const sugerencia = prov === 'gemini' ? 'gemini-2.0-flash' : (prov === 'deepseek' ? 'deepseek-reasoner' : (prov === 'groq' ? 'llama-3.3-70b-versatile' : ''));
        const nuevoModelo = await liraPrompt(`Ingresa el nombre/ID exacto del modelo para ${PROVEEDORES_CLOUD[prov]?.nombre || prov}:\n(Ej: gemini-2.0-flash, deepseek-reasoner, llama-3.3-70b-versatile, etc.)`, modeloActual || sugerencia, '🤖');
        
        const sel = document.getElementById('sel-ia-modelo-cloud');
        if (nuevoModelo && nuevoModelo.trim()) {
            const modTrim = nuevoModelo.trim();
            configProveedores.modelos[prov] = modTrim;
            
            if (sel) {
                let existe = Array.from(sel.options).find(o => o.value === modTrim);
                if (!existe) {
                    const opt = document.createElement('option');
                    opt.value = modTrim;
                    opt.text = `${modTrim} (Personalizado)`;
                    sel.insertBefore(opt, sel.firstChild);
                }
                sel.value = modTrim;
            }
        } else {
            if (sel) sel.value = configProveedores.modelos[prov] || PROVEEDORES_CLOUD[prov]?.defaultModelo;
            return;
        }
    } else {
        configProveedores.modelos[prov] = (val || '').trim();
    }

    const key = configProveedores.keys[prov] || '';
    const activeMod = configProveedores.modelos[prov] || '';
    if (typeof eel !== 'undefined' && eel.rag_configurar_proveedor) {
        eel.rag_configurar_proveedor(prov, key, activeMod)();
    }
    if (typeof guardarTodosAjustes === 'function') {
        guardarTodosAjustes(false);
    }
    if (typeof actualizarGaugeTokensUI === 'function') {
        actualizarGaugeTokensUI(false);
    }
}

function abrirConsolaProveedorActual() {
    const prov = configProveedores.proveedorActivo;
    const info = PROVEEDORES_CLOUD[prov];
    if (info && info.linkKey) {
        if (typeof eel !== 'undefined' && eel.abrir_enlace_externo) {
            eel.abrir_enlace_externo(info.linkKey)();
        } else {
            window.open(info.linkKey, '_blank');
        }
    }
}

function toggleVisibilidadApiKey() {
    const txt = document.getElementById('txt-ia-api-key');
    if (txt) {
        txt.type = (txt.type === 'password') ? 'text' : 'password';
    }
}

async function probarConexionCloudIA() {
    const prov = configProveedores.proveedorActivo;
    if (prov === 'ollama') return;

    const btnTest = document.getElementById('btn-ia-test-cloud');
    const testStatus = document.getElementById('ia-cloud-test-status');
    const key = configProveedores.keys[prov] || '';
    const modelo = configProveedores.modelos[prov] || '';

    if (!key) {
        if (testStatus) {
            testStatus.innerHTML = `<span style="color:#e74c3c; font-weight:600;">⚠️ Por favor ingresa primero la API Key de ${PROVEEDORES_CLOUD[prov]?.nombre || prov}.</span>`;
        }
        return;
    }

    if (btnTest) {
        btnTest.disabled = true;
        btnTest.innerText = '⏳ Verificando conexión...';
    }
    if (testStatus) {
        testStatus.innerHTML = `<span style="color:#747d8c;">📡 Conectando con servidor de ${PROVEEDORES_CLOUD[prov]?.nombre || prov}...</span>`;
    }

    try {
        if (typeof eel !== 'undefined' && eel.rag_verificar_conexion_cloud) {
            const res = await eel.rag_verificar_conexion_cloud(prov, key, modelo)();
            if (res && res.exito) {
                if (testStatus) {
                    testStatus.innerHTML = `<span style="color:#27ae60; font-weight:600;">✅ ${res.mensaje || '¡Conexión exitosa!'}</span>`;
                }
                mostrarToastLira(`✅ Conexión exitosa con ${PROVEEDORES_CLOUD[prov]?.nombre || prov}`);
                refrescarModelosProveedorActual(false);
                actualizarGaugeTokensUI(true);
            } else {
                if (testStatus) {
                    testStatus.innerHTML = `<span style="color:#e74c3c; font-weight:600;">❌ Error: ${res?.error || 'No se pudo conectar'}</span>`;
                }
                actualizarGaugeTokensUI(true);
            }
        }
    } catch (e) {
        if (testStatus) {
            testStatus.innerHTML = `<span style="color:#e74c3c; font-weight:600;">❌ Error de comunicación: ${e.message || e}</span>`;
        }
        actualizarGaugeTokensUI(true);
    } finally {
        if (btnTest) {
            btnTest.disabled = false;
            btnTest.innerText = '⚡ Probar Conexión con Proveedor';
        }
    }
}

// --- APERTURA Y CIERRE DEL PANEL ---
function abrirModalIA() {
    if (typeof cerrarOtrasFuncionesPrincipales === 'function') {
        cerrarOtrasFuncionesPrincipales('ia');
    }
    const modal = document.getElementById('modal-ia');
    if (!modal) return;
    modal.style.display = 'flex';
    if (typeof cambiarProveedorIA === 'function') {
        cambiarProveedorIA(configProveedores.proveedorActivo);
    }
    verificarEstadoIA();
    cargarHistorialChatDocumento();
    actualizarGaugeTokensUI(true);
}

function cerrarModalIA() {
    const modal = document.getElementById('modal-ia');
    if (modal) modal.style.display = 'none';
    if (window.liraAIAudioState && window.liraAIAudioState.activo) {
        window.liraDetenerLectura();
    }
    if (typeof window.limpiarResaltadoBusqueda === 'function') {
        window.limpiarResaltadoBusqueda(true);
    }
    if (typeof guardarTodosAjustes === 'function') {
        guardarTodosAjustes(false);
    }
}

// --- MONITOR Y GRÁFICO CIRCULAR DE TOKENS EN TIEMPO REAL ---
async function actualizarGaugeTokensUI(forzarSyncAPI = false) {
    try {
        if (typeof eel === 'undefined') return;
        const prov = configProveedores.proveedorActivo || 'ollama';
        const key = configProveedores.keys[prov] || '';
        
        let stats = null;
        if (forzarSyncAPI && eel.rag_sincronizar_tokens_api) {
            stats = await eel.rag_sincronizar_tokens_api(prov, key)();
        }
        if (!stats && eel.rag_obtener_estadisticas_tokens) {
            stats = await eel.rag_obtener_estadisticas_tokens(prov)();
        }
        if (!stats) return;

        const circum = 2 * Math.PI * 48; // r=48 -> 301.59
        const pct = Math.max(0, Math.min(100, parseFloat(stats.porcentaje_restante ?? 100)));
        const offset = circum - (pct / 100.0) * circum;

        const bar = document.getElementById('ia-token-gauge-bar');
        const txtPct = document.getElementById('ia-gauge-percent');
        const txtRest = document.getElementById('ia-stat-tokens-restantes');
        const txtSesion = document.getElementById('ia-stat-tokens-sesion');
        const txtUltimo = document.getElementById('ia-stat-tokens-ultimo');
        const badgeProv = document.getElementById('ia-token-badge-text');
        const miniTxt = document.getElementById('ia-mini-tokens-texto');
        const miniDot = document.querySelector('#ia-chat-mini-tokens .ia-mini-dot');
        const txtDetalle = document.getElementById('ia-stat-tokens-detalle');

        if (bar) {
            bar.style.strokeDasharray = `${circum.toFixed(1)}`;
            bar.style.strokeDashoffset = `${offset.toFixed(1)}`;
            
            let color = '#2ed573'; // Verde (>50%)
            if (pct <= 20) color = '#ff4757'; // Rojo (<20%)
            else if (pct <= 50) color = '#ffa502'; // Ámbar (20-50%)
            else if (pct <= 80) color = '#1e90ff'; // Azul
            bar.style.stroke = color;
            if (miniDot) miniDot.style.background = color;
        }

        if (txtPct) txtPct.innerText = `${pct.toFixed(pct < 100 && pct > 0 ? 1 : 0)}%`;
        if (miniTxt) miniTxt.innerText = `Tokens: ${pct.toFixed(0)}%`;

        const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : (n || '0'));
        const restantes = fmt(stats.tokens_restantes);
        const limite = fmt(stats.limite_tokens);
        const sesion = fmt(stats.tokens_usados_sesion);
        const pPrompt = fmt(stats.ultimo_prompt_tokens);
        const pComp = fmt(stats.ultimo_completion_tokens);

        if (txtRest) txtRest.innerText = `${restantes} / ${limite}`;
        if (txtSesion) txtSesion.innerText = `${sesion} tokens`;
        if (txtUltimo) txtUltimo.innerText = `${pPrompt} in + ${pComp} out`;

        const nomProv = PROVEEDORES_CLOUD[prov]?.nombre || (prov === 'ollama' ? 'Local Ollama' : prov.toUpperCase());
        const modeloActual = (prov === 'ollama') ? (estadoIA.modeloChatSeleccionado || 'Ollama') : (configProveedores.modelos[prov] || '');
        if (badgeProv) badgeProv.innerText = `Motor: ${nomProv} (${modeloActual})`;

        if (txtDetalle) {
            txtDetalle.innerText = stats.detalle_api || 'Información de cuota sincronizada';
            txtDetalle.title = stats.detalle_api || '';
        }
    } catch (err) {
        console.warn("⚠️ [LiraAI] Error actualizando gauge de tokens:", err);
    }
}
window.actualizarGaugeTokensUI = actualizarGaugeTokensUI;

// --- CARGAR Y RESTAURAR HISTORIAL DE CHAT POR DOCUMENTO ---
async function cargarHistorialChatDocumento(docIdParam = null) {
    const lblDoc = document.getElementById('ia-chat-doc-nombre');
    const historial = document.getElementById('ia-chat-historial');
    if (!historial) return;

    let nombreDoc = docIdParam;
    if (!nombreDoc && typeof rutaPDFActual !== 'undefined' && rutaPDFActual) {
        nombreDoc = rutaPDFActual.split('\\').pop().split('/').pop();
    }
    if (!nombreDoc || nombreDoc.trim() === '') {
        nombreDoc = "Documento actual";
    }

    if (lblDoc) {
        lblDoc.innerText = `📄 ${nombreDoc}`;
        lblDoc.title = nombreDoc;
    }

    try {
        if (typeof eel !== 'undefined' && eel.rag_obtener_historial_chat) {
            console.log(`🤖 [LiraAI] Solicitando historial para documento: ${nombreDoc}`);
            const res = await eel.rag_obtener_historial_chat(nombreDoc)();
            console.log(`🤖 [LiraAI] Respuesta historial:`, res);
            if (res && res.exito && Array.isArray(res.historial) && res.historial.length > 0) {
                historial.innerHTML = '';
                for (const msg of res.historial) {
                    if (msg.role === 'user') {
                        agregarMensajeUsuarioChat(msg.texto);
                    } else {
                        agregarMensajeAIChat(msg.texto, msg.fuentes || []);
                    }
                }
                return;
            }
        }
    } catch (e) {
        console.warn("⚠️ [LiraAI] No se pudo cargar historial de chat:", e);
    }

    // Si no hay historial previo, mostrar saludo inicial
    mostrarSaludoInicialChat(nombreDoc);
}

function mostrarSaludoInicialChat(nombreDoc = "este documento") {
    const historial = document.getElementById('ia-chat-historial');
    if (!historial) return;
    const svgAvatarIA = `<div class="ia-avatar"><svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" class="ia-avatar-svg" aria-hidden="true" role="img"><path fill="#FFAC33" d="M34.347 16.893l-8.899-3.294l-3.323-10.891a1 1 0 0 0-1.912 0l-3.322 10.891l-8.9 3.294a1 1 0 0 0 0 1.876l8.895 3.293l3.324 11.223a1 1 0 0 0 1.918-.001l3.324-11.223l8.896-3.293a.998.998 0 0 0-.001-1.875z"></path><path fill="#FFCC4D" d="M14.347 27.894l-2.314-.856l-.9-3.3a.998.998 0 0 0-1.929-.001l-.9 3.3l-2.313.856a1 1 0 0 0 0 1.876l2.301.853l.907 3.622a1 1 0 0 0 1.94-.001l.907-3.622l2.301-.853a.997.997 0 0 0 0-1.874zM10.009 6.231l-2.364-.875l-.876-2.365a.999.999 0 0 0-1.876 0l-.875 2.365l-2.365.875a1 1 0 0 0 0 1.876l2.365.875l.875 2.365a1 1 0 0 0 1.876 0l.875-2.365l2.365-.875a1 1 0 0 0 0-1.876z"></path></svg></div>`;
    historial.innerHTML = `
        <div class="ia-mensaje ai">
            ${svgAvatarIA}
            <div class="ia-burbuja">
                <p>¡Hola! Soy <b>LiraAI</b>, tu asistente offline para este documento.</p>
                <p>Puedo responder preguntas específicas, analizar datos o resumir conceptos basados en el contenido de este PDF.</p>
            </div>
        </div>
    `;
}

async function reiniciarChatIA() {
    let nombreDoc = (typeof rutaPDFActual !== 'undefined' && rutaPDFActual) ? rutaPDFActual.split('\\').pop().split('/').pop() : "documento_actual";
    try {
        if (typeof eel !== 'undefined' && eel.rag_limpiar_historial_chat) {
            await eel.rag_limpiar_historial_chat(nombreDoc)();
        }
    } catch (e) {
        console.warn("⚠️ [LiraAI] Error limpiando historial en backend:", e);
    }

    mostrarSaludoInicialChat(nombreDoc);
    mostrarToastLira("🔄 Conversación reiniciada para este documento.");
}

// --- GESTIÓN DE PESTAÑAS (TABS) ---
function cambiarTabIA(tabId) {
    document.querySelectorAll('.tab-ia-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.ia-tab-panel').forEach(panel => panel.classList.remove('active'));

    const btnActivo = document.getElementById(`btn-tab-${tabId}`);
    const panelActivo = document.getElementById(`ia-tab-${tabId}`);

    if (btnActivo) btnActivo.classList.add('active');
    if (panelActivo) panelActivo.classList.add('active');
    actualizarGaugeTokensUI(false);
}

// --- VERIFICACIÓN DE ESTADO DE OLLAMA Y MODELOS ---
async function verificarEstadoIA() {
    const txtOllamaStatus = document.getElementById('ia-config-ollama-status');

    try {
        if (typeof eel !== 'undefined' && eel.rag_verificar_estado) {
            const res = await eel.rag_verificar_estado()();
            if (res && (res.ollama_online || res.ollama_activo)) {
                estadoIA.ollamaOnline = true;
                estadoIA.modelosChat = res.modelos_instalados || res.modelos_disponibles || [];

                actualizarBadgeEstadoIA(configProveedores.proveedorActivo);

                if (txtOllamaStatus) {
                    const cantModelos = estadoIA.modelosChat.length;
                    txtOllamaStatus.innerHTML = `<span style="color:#27ae60; font-weight:bold;">🟢 Conectado</span> (Puerto 11434, ${cantModelos} modelo${cantModelos === 1 ? '' : 's'})`;
                }

                poblarSelectoresModelos(estadoIA.modelosChat);
            } else {
                marcarIAOffline(res?.error || 'Servidor Ollama no disponible');
            }
        } else {
            marcarIAOffline('Reinicio de LiraLoud necesario para sincronizar Eel');
        }
    } catch (e) {
        console.warn("⚠️ [LiraAI] Error verificando estado de IA:", e);
        marcarIAOffline('Error de conexión con el backend');
    }
}

function marcarIAOffline(errorMsg) {
    estadoIA.ollamaOnline = false;
    const txtOllamaStatus = document.getElementById('ia-config-ollama-status');

    actualizarBadgeEstadoIA(configProveedores.proveedorActivo);

    if (txtOllamaStatus) {
        txtOllamaStatus.innerHTML = `<span style="color:#e74c3c; font-weight:bold;">🔴 Desconectado</span> <br><small style="color:#7f8c8d;">${errorMsg}</small>`;
    }
}

function poblarSelectoresModelos(modelos) {
    const selectChat = document.getElementById('ia-select-modelo-chat');
    if (!selectChat) return;

    selectChat.innerHTML = '';
    if (!modelos || modelos.length === 0) {
        const opt = document.createElement('option');
        opt.value = 'llama3.2';
        opt.text = 'llama3.2 (No detectado aún)';
        selectChat.appendChild(opt);
        return;
    }

    // Si el modelo actual no está en la lista, seleccionar el primero disponible
    if (!modelos.includes(estadoIA.modeloChatSeleccionado)) {
        estadoIA.modeloChatSeleccionado = modelos[0];
        if (typeof eel !== 'undefined' && eel.rag_cambiar_modelos) {
            eel.rag_cambiar_modelos(modelos[0], null)();
        }
    }

    selectChat.onchange = async function () {
        estadoIA.modeloChatSeleccionado = this.value;
        if (typeof eel !== 'undefined' && eel.rag_cambiar_modelos) {
            try {
                await eel.rag_cambiar_modelos(this.value, null)();
                console.log(`🤖 [LiraAI] Modelo cambiado a: ${this.value}`);
            } catch (e) {
                console.warn("⚠️ [LiraAI] Error cambiando modelo:", e);
            }
        }
    };

    modelos.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.text = m;
        opt.selected = (m === estadoIA.modeloChatSeleccionado);
        selectChat.appendChild(opt);
    });
}

// --- INDEXAR DOCUMENTO ACTUAL EN CHROMADB ---
async function indexarDocumentoActual() {
    return indexarDocumentoActualIA();
}

async function indexarDocumentoActualIA() {
    const btn = document.getElementById('btn-ia-indexar');
    const txtProgreso = document.getElementById('ia-index-progreso-texto') || document.getElementById('ia-txt-progreso-index');
    const barProgreso = document.getElementById('ia-index-progreso') || document.getElementById('ia-progress-bar');
    const contProgreso = document.getElementById('ia-progress-container');

    if (!btn) return;

    btn.disabled = true;
    btn.innerHTML = `<span class="ia-spinner"></span> Indexando documento en ChromaDB...`;
    if (contProgreso) contProgreso.style.display = 'block';
    if (barProgreso) barProgreso.style.width = '30%';
    if (txtProgreso) txtProgreso.innerText = 'Extrayendo texto, oraciones y calculando embeddings...';

    try {
        if (typeof eel !== 'undefined' && eel.rag_indexar_documento_actual) {
            const dictActivo = (typeof diccionario_usuario !== 'undefined') ? diccionario_usuario : {};
            const res = await eel.rag_indexar_documento_actual(dictActivo)();

            if (res && res.exito) {
                estadoIA.documentoIndexado = true;
                estadoIA.totalChunks = res.total_chunks || 0;

                if (barProgreso) barProgreso.style.width = '100%';
                if (txtProgreso) {
                    txtProgreso.innerHTML = `✅ <b>Indexado con éxito:</b> ${res.total_chunks} fragmentos estructurados (${res.total_paginas || 1} páginas).`;
                }

                // Notificar en el chat
                agregarMensajeAIChat(`He indexado el documento actual (**${res.doc_id || 'PDF'}**) con **${res.total_chunks} fragmentos semánticos** y memoria completa. ¡Ahora puedes hacerme cualquier consulta clínica, metodológica o pedirme resúmenes detallados!`);
            } else {
                if (txtProgreso) {
                    txtProgreso.innerHTML = `❌ <span style="color:#e74c3c;">Error al indexar: ${res?.error || 'Desconocido'}</span>`;
                }
            }
        }
    } catch (e) {
        console.error("❌ [LiraAI] Error indexando documento:", e);
        if (txtProgreso) {
            txtProgreso.innerHTML = `❌ <span style="color:#e74c3c;">Excepción: ${e.message}</span>`;
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = `📥 Indexar / Re-indexar Documento Actual`;
    }
}

// ==========================================================================
// 📚 MÓDULO DE GESTIÓN Y EXTRACCIÓN DE FUENTES (PDF, SUBRAYADOS, APUNTES)
// ==========================================================================

function toggleOpcionesSubrayadosUI(mostrar) {
    const box = document.getElementById('ia-sub-opciones-subrayados');
    if (box) box.style.display = mostrar ? 'block' : 'none';
}

function toggleOpcionesNotasUI(mostrar) {
    const box = document.getElementById('ia-sub-opciones-notas');
    if (box) box.style.display = mostrar ? 'block' : 'none';
}

function seleccionarTodosColoresSubrayados(seleccionar = true) {
    ['chk-ia-sub-amarillo', 'chk-ia-sub-verde', 'chk-ia-sub-cian', 'chk-ia-sub-magenta', 'chk-ia-sub-dorado', 'chk-ia-sub-rojo'].forEach(id => {
        const chk = document.getElementById(id);
        if (chk) chk.checked = seleccionar;
    });
    actualizarEstadoFuentesUI();
    if (typeof guardarTodosAjustes === 'function') guardarTodosAjustes(false);
}

function parsearRangoPaginas(strRango) {
    if (!strRango || !strRango.trim()) return null;
    const paginas = new Set();
    const partes = strRango.split(/[,;\s]+/);
    for (const p of partes) {
        if (!p) continue;
        if (p.includes('-')) {
            const [ini, fin] = p.split('-').map(n => parseInt(n.trim()));
            if (!isNaN(ini) && !isNaN(fin)) {
                for (let i = Math.min(ini, fin); i <= Math.max(ini, fin); i++) {
                    paginas.add(i);
                }
            }
        } else {
            const num = parseInt(p.trim());
            if (!isNaN(num)) paginas.add(num);
        }
    }
    return paginas.size > 0 ? paginas : null;
}

function clasificarColorHex(hex) {
    if (!hex) return 'amarillo';
    hex = hex.toLowerCase().trim();
    if (hex === '#ffff00' || hex === '#ffff33' || hex === '#ffeaa7' || hex === '#ffd32a') return 'amarillo';
    if (hex === '#00ff00' || hex === '#55efc4' || hex === '#2ed573' || hex === '#27ae60') return 'verde';
    if (hex === '#00ffff' || hex === '#74b9ff' || hex === '#1e90ff' || hex === '#0984e3' || hex === '#00ced1') return 'cian';
    if (hex === '#ff00ff' || hex === '#fd79a8' || hex === '#e84393' || hex === '#ff69b4') return 'magenta';
    if (hex === '#f1c40f' || hex === '#f39c12' || hex === '#e67e22' || hex === '#d4ac0d') return 'dorado';
    if (hex === '#e74c3c' || hex === '#ff0000' || hex === '#ff7675' || hex === '#ff4757' || hex === '#c0392b') return 'rojo';

    if (hex.startsWith('#') && hex.length === 7) {
        const r = parseInt(hex.substring(1, 3), 16);
        const g = parseInt(hex.substring(3, 5), 16);
        const b = parseInt(hex.substring(5, 7), 16);

        // Paleta oficial de 6 colores de marcatextos de LiraLoud
        const paleta = [
            { name: 'amarillo', r: 255, g: 255, b: 0 },
            { name: 'verde',    r: 0,   g: 255, b: 0 },
            { name: 'cian',     r: 0,   g: 255, b: 255 },
            { name: 'magenta',  r: 255, g: 0,   b: 255 },
            { name: 'dorado',   r: 241, g: 196, b: 15 },
            { name: 'rojo',     r: 231, g: 76,  b: 60 }
        ];

        let minD = Infinity;
        let mejor = 'amarillo';
        for (const p of paleta) {
            const d = (r - p.r) ** 2 + (g - p.g) ** 2 + (b - p.b) ** 2;
            if (d < minD) {
                minD = d;
                mejor = p.name;
            }
        }
        return mejor;
    }
    return 'amarillo';
}

function obtenerConfigFuentesIA() {
    const pdfActivo = document.getElementById('chk-ia-fuente-pdf')?.checked ?? true;
    const subrayadosActivo = document.getElementById('chk-ia-fuente-subrayados')?.checked ?? false;
    const notasActivo = document.getElementById('chk-ia-fuente-notas')?.checked ?? false;

    // Alcance (Solo este libro vs Todos los libros)
    const subAlcance = document.getElementById('sel-ia-sub-alcance')?.value || 'libro_actual';
    const notasAlcance = document.getElementById('sel-ia-notas-alcance')?.value || 'libro_actual';

    // Los 6 colores de marcatextos
    const colores = {
        amarillo: document.getElementById('chk-ia-sub-amarillo')?.checked ?? true,
        verde: document.getElementById('chk-ia-sub-verde')?.checked ?? true,
        cian: document.getElementById('chk-ia-sub-cian')?.checked ?? true,
        magenta: document.getElementById('chk-ia-sub-magenta')?.checked ?? true,
        dorado: document.getElementById('chk-ia-sub-dorado')?.checked ?? true,
        rojo: document.getElementById('chk-ia-sub-rojo')?.checked ?? true
    };

    const paginasSubrayados = parsearRangoPaginas(document.getElementById('txt-ia-sub-paginas')?.value || '');
    const paginasNotas = parsearRangoPaginas(document.getElementById('txt-ia-notas-paginas')?.value || '');
    const clasifNotas = (document.getElementById('txt-ia-notas-clasif')?.value || '').trim();

    return {
        pdf: pdfActivo,
        subrayados: subrayadosActivo,
        notas: notasActivo,
        subAlcance,
        notasAlcance,
        coloresSubrayados: colores,
        paginasSubrayados,
        paginasNotas,
        clasifNotas
    };
}

function actualizarEstadoFuentesUI() {
    const config = obtenerConfigFuentesIA();
    const bannerTexto = document.getElementById('ia-fuentes-resumen-texto');
    const badgeChat = document.getElementById('ia-badge-fuentes-activas');

    const partes = [];
    if (config.pdf) partes.push("PDF");
    if (config.subrayados) {
        const alc = config.subAlcance === 'todos_libros' ? ' (Todos libros)' : '';
        partes.push(`Subrayados${alc}`);
    }
    if (config.notas) {
        const alc = config.notasAlcance === 'todos_libros' ? ' (Todos libros)' : '';
        partes.push(`Apuntes${alc}`);
    }

    let textoResumen = partes.length > 0 ? partes.join(" + ") : "Ninguna (Se usará PDF)";
    if (!config.pdf && (config.subrayados || config.notas)) {
        textoResumen += " (Sin PDF)";
    }

    if (bannerTexto) bannerTexto.innerText = textoResumen;
    if (badgeChat) {
        badgeChat.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:2px;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> Fuentes: ${textoResumen}`;
        badgeChat.style.background = !config.pdf ? '#fef3c7' : '#e0e7ff';
        badgeChat.style.color = !config.pdf ? '#92400e' : '#3730a3';
        badgeChat.style.borderColor = !config.pdf ? '#fde68a' : '#c7d2fe';
    }
}

async function construirContextoFuentesParaIA() {
    const config = obtenerConfigFuentesIA();
    let bloquesContexto = [];
    const ignorarPdf = (!config.pdf) && (config.subrayados || config.notas);

    // 1. Extraer Subrayados si está activo
    if (config.subrayados && typeof eel !== 'undefined') {
        try {
            let resSubs = null;
            if (config.subAlcance === 'todos_libros' && eel.obtener_todos_subrayados_biblioteca) {
                resSubs = await eel.obtener_todos_subrayados_biblioteca()();
            } else if (eel.obtener_todos_subrayados && typeof rutaPDFActual !== 'undefined' && rutaPDFActual) {
                resSubs = await eel.obtener_todos_subrayados(rutaPDFActual)();
            }

            if (resSubs && resSubs.success && Array.isArray(resSubs.subrayados)) {
                let listaFiltrada = resSubs.subrayados;

                // Filtrar por página si se especificó rango (solo aplica si es un libro específico o por número de página global)
                if (config.paginasSubrayados) {
                    listaFiltrada = listaFiltrada.filter(s => config.paginasSubrayados.has((s.pagina ?? 0) + 1));
                }

                // Filtrar por color de la paleta
                listaFiltrada = listaFiltrada.filter(s => {
                    const tipoColor = clasificarColorHex(s.color);
                    return config.coloresSubrayados[tipoColor] !== false;
                });

                if (listaFiltrada.length > 0) {
                    const textoSubs = listaFiltrada.map((s, idx) => {
                        const pagNum = (s.pagina ?? 0) + 1;
                        const infoLibro = s.libro ? ` | Libro: ${s.libro}` : '';
                        return `[Subrayado ${idx + 1}${infoLibro} | Pág. ${pagNum}]: "${s.texto}"`;
                    }).join("\n\n");
                    const etiquetaAlcance = config.subAlcance === 'todos_libros' ? 'TODOS LOS LIBROS' : 'ESTE LIBRO';
                    bloquesContexto.push(`=== 🖍️ TEXTOS SUBRAYADOS POR EL USUARIO (${etiquetaAlcance}: ${listaFiltrada.length} resaltados) ===\n${textoSubs}`);
                }
            }
        } catch (e) {
            console.warn("⚠️ [LiraAI Fuentes] Error obteniendo subrayados:", e);
        }
    }

    // 2. Extraer Apuntes y Notas si está activo
    if (config.notas && typeof eel !== 'undefined' && eel.notas_listar) {
        try {
            const libroFiltro = config.notasAlcance === 'todos_libros' ? null : (typeof obtenerNombreLibroActivo === 'function' ? obtenerNombreLibroActivo() : null);
            const resNotas = await eel.notas_listar(window.rutaNotasPersonalizada || "", libroFiltro)();
            if (resNotas && resNotas.exito && Array.isArray(resNotas.notas)) {
                let listaNotas = resNotas.notas;

                // Filtrar por página si se especificó rango
                if (config.paginasNotas) {
                    listaNotas = listaNotas.filter(n => config.paginasNotas.has(parseInt(n.pagina || 1)));
                }

                // Filtrar por clasificación si se especificó
                if (config.clasifNotas && config.clasifNotas !== "Todas" && config.clasifNotas !== "TODAS") {
                    const qClasif = config.clasifNotas.toLowerCase().trim();
                    listaNotas = listaNotas.filter(n => (n.clasificacion || '').toLowerCase().includes(qClasif));
                }

                if (listaNotas.length > 0) {
                    const textoNotas = listaNotas.map((n, idx) => {
                        const pagNum = n.pagina || 1;
                        const titulo = n.titulo || `Nota ${idx + 1}`;
                        const area = n.clasificacion ? ` | Área: ${n.clasificacion}` : '';
                        const infoLibro = n.libro ? ` | Libro: ${n.libro}` : '';
                        return `--- NOTA: "${titulo}" (Pág. ${pagNum}${infoLibro}${area}) ---\n${n.contenido || ''}`;
                    }).join("\n\n");
                    const etiquetaAlcance = config.notasAlcance === 'todos_libros' ? 'TODOS LOS LIBROS' : 'ESTE LIBRO';
                    bloquesContexto.push(`=== 📝 APUNTES Y NOTAS DEL USUARIO (${etiquetaAlcance}: ${listaNotas.length} notas) ===\n${textoNotas}`);
                }
            }
        } catch (e) {
            console.warn("⚠️ [LiraAI Fuentes] Error obteniendo notas:", e);
        }
    }

    const textoContextoFinal = bloquesContexto.join("\n\n");
    return {
        contextoExtra: textoContextoFinal,
        ignorarPdf: ignorarPdf
    };
}

// --- CHAT CON EL DOCUMENTO ---
async function enviarMensajeChatIA(preguntaDirecta = null) {
    const input = document.getElementById('ia-chat-input');
    const btnEnviar = document.getElementById('btn-ia-chat-enviar');
    const pregunta = (preguntaDirecta || (input ? input.value : '')).trim();

    if (!pregunta || estadoIA.enProceso) return;

    if (input && !preguntaDirecta) {
        input.value = '';
        autoAjustarTextarea(input);
    }

    // 1. Renderizar mensaje del usuario
    agregarMensajeUsuarioChat(pregunta);

    // 2. Renderizar burbuja de "Pensando..."
    const loadingId = 'ia-loading-' + Date.now();
    agregarMensajeLoadingChat(loadingId);

    estadoIA.enProceso = true;
    if (btnEnviar) btnEnviar.disabled = true;

    try {
        if (typeof eel !== 'undefined' && eel.rag_preguntar) {
            let docId = (typeof rutaPDFActual !== 'undefined' && rutaPDFActual) ? rutaPDFActual.split('\\').pop().split('/').pop() : null;
            const modoActual = window.modoSalidaIA || document.getElementById('sel-ia-modo-salida')?.value || 'trazabilidad';
            
            // Construir fuentes seleccionadas por el usuario
            const fuentesCtx = await construirContextoFuentesParaIA();
            const res = await eel.rag_preguntar(pregunta, docId, 10, modoActual, fuentesCtx.contextoExtra, fuentesCtx.ignorarPdf)();
            removerMensajeChat(loadingId);

            if (res && res.exito) {
                agregarMensajeAIChat(res.respuesta, res.fuentes);
            } else {
                agregarMensajeAIChat(`⚠️ **Nota de LiraAI:** ${res?.error || 'No se pudo generar respuesta.'}`);
            }
        } else {
            removerMensajeChat(loadingId);
            agregarMensajeAIChat("⚠️ El backend de LiraAI no está conectado a Eel.");
        }
    } catch (e) {
        removerMensajeChat(loadingId);
        agregarMensajeAIChat(`❌ **Error en la consulta:** ${e.message}`);
    } finally {
        estadoIA.enProceso = false;
        if (btnEnviar) btnEnviar.disabled = false;
        if (typeof actualizarGaugeTokensUI === 'function') {
            actualizarGaugeTokensUI(false);
        }
    }
}

function agregarMensajeUsuarioChat(texto) {
    const historial = document.getElementById('ia-chat-historial');
    if (!historial) return;

    const div = document.createElement('div');
    div.className = 'ia-mensaje user';
    div.innerHTML = `
        <div class="ia-avatar">👤</div>
        <div class="ia-burbuja"><p>${escaparHTML(texto)}</p></div>
    `;
    historial.appendChild(div);
    historial.scrollTop = historial.scrollHeight;
}

function agregarMensajeAIChat(textoMarkdown, fuentes = []) {
    const historial = document.getElementById('ia-chat-historial');
    if (!historial) return;

    const msgId = 'ia-msg-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
    window._liraTextosMap = window._liraTextosMap || {};
    window._liraTextosMap[msgId] = textoMarkdown;

    const div = document.createElement('div');
    div.className = 'ia-mensaje ai';
    div.id = msgId;

    let fuentesHTML = '';
    if (fuentes && fuentes.length > 0) {
        const fuentesItems = fuentes.map((f, i) => {
            const numPag = f.pagina || f.pagina_inicio || 1;
            const tagPag = f.pags_tag || `Pág. ${numPag}`;
            const snipKey = _registrarSnippetCitaIA(f.texto_puro || f.texto || '');
            const relev = Math.max(0, Math.round((1 - (f.distancia || 0)) * 100));

            return `
            <div class="ia-fuente-item">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-weight:700; color:#4338ca;">📑 [Fragmento ${i + 1} | ${tagPag}]</span>
                    <span style="font-size:10px; color:#747d8c; font-weight:600;">Relevancia: ${relev}%</span>
                </div>
                <div style="color:#2f3542; font-size:11.5px; line-height:1.4; margin-bottom:6px;">
                    ${escaparHTML(f.texto || '')}
                </div>
                <button class="ia-btn-ir-fuente" onclick="liraNavegarYResaltarFuente(${numPag}, '${snipKey}')">
                    🎯 Saltar a ${tagPag} y resaltar en PDF
                </button>
            </div>
            `;
        }).join('');

        fuentesHTML = `
            <div class="ia-fuentes-box">
                <button class="ia-fuentes-toggle" onclick="toggleFuentesIA('${msgId}-fuentes')">
                    🔍 <span>Ver ${fuentes.length} fuentes consultadas (con acceso directo a páginas)</span> ▼
                </button>
                <div id="${msgId}-fuentes" class="ia-fuentes-lista" style="display:none;">
                    ${fuentesItems}
                </div>
            </div>
        `;
    }

    const svgAvatarIA = `<div class="ia-avatar"><svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" class="ia-avatar-svg" aria-hidden="true" role="img"><path fill="#FFAC33" d="M34.347 16.893l-8.899-3.294l-3.323-10.891a1 1 0 0 0-1.912 0l-3.322 10.891l-8.9 3.294a1 1 0 0 0 0 1.876l8.895 3.293l3.324 11.223a1 1 0 0 0 1.918-.001l3.324-11.223l8.896-3.293a.998.998 0 0 0-.001-1.875z"></path><path fill="#FFCC4D" d="M14.347 27.894l-2.314-.856l-.9-3.3a.998.998 0 0 0-1.929-.001l-.9 3.3l-2.313.856a1 1 0 0 0 0 1.876l2.301.853l.907 3.622a1 1 0 0 0 1.94-.001l.907-3.622l2.301-.853a.997.997 0 0 0 0-1.874zM10.009 6.231l-2.364-.875l-.876-2.365a.999.999 0 0 0-1.876 0l-.875 2.365l-2.365.875a1 1 0 0 0 0 1.876l2.365.875l.875 2.365a1 1 0 0 0 1.876 0l.875-2.365l2.365-.875a1 1 0 0 0 0-1.876z"></path></svg></div>`;

    div.innerHTML = `
        ${svgAvatarIA}
        <div class="ia-burbuja">
            <div>${formatearMarkdown(textoMarkdown, fuentes)}</div>
            ${fuentesHTML}
            <div class="ia-msg-acciones">
                <button class="ia-btn-accion-msg" id="btn-escuchar-${msgId}" onclick="liraToggleLecturaMensaje('${msgId}')" title="Escuchar respuesta con la voz activa">
                    <span class="ia-btn-icon">🔊</span> <span class="ia-btn-texto">Escuchar</span>
                </button>
                <button class="ia-btn-accion-msg" onclick="liraCopiarTextoMensaje('${msgId}')" title="Copiar texto al portapapeles">
                    <span class="ia-btn-icon">📋</span> <span>Copiar</span>
                </button>
                <button class="ia-btn-accion-msg" onclick="liraImportarMensajeANotas('${msgId}')" title="Guardar respuesta como nota del documento">
                    <span class="ia-btn-icon"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></span> <span>A Notas</span>
                </button>
            </div>
        </div>
    `;

    historial.appendChild(div);
    historial.scrollTop = historial.scrollHeight;
}

function agregarMensajeLoadingChat(id) {
    const historial = document.getElementById('ia-chat-historial');
    if (!historial) return;

    const div = document.createElement('div');
    div.className = 'ia-mensaje ai';
    div.id = id;
    const svgAvatarIA = `<div class="ia-avatar"><svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" class="ia-avatar-svg" aria-hidden="true" role="img"><path fill="#FFAC33" d="M34.347 16.893l-8.899-3.294l-3.323-10.891a1 1 0 0 0-1.912 0l-3.322 10.891l-8.9 3.294a1 1 0 0 0 0 1.876l8.895 3.293l3.324 11.223a1 1 0 0 0 1.918-.001l3.324-11.223l8.896-3.293a.998.998 0 0 0-.001-1.875z"></path><path fill="#FFCC4D" d="M14.347 27.894l-2.314-.856l-.9-3.3a.998.998 0 0 0-1.929-.001l-.9 3.3l-2.313.856a1 1 0 0 0 0 1.876l2.301.853l.907 3.622a1 1 0 0 0 1.94-.001l.907-3.622l2.301-.853a.997.997 0 0 0 0-1.874zM10.009 6.231l-2.364-.875l-.876-2.365a.999.999 0 0 0-1.876 0l-.875 2.365l-2.365.875a1 1 0 0 0 0 1.876l2.365.875l.875 2.365a1 1 0 0 0 1.876 0l.875-2.365l2.365-.875a1 1 0 0 0 0-1.876z"></path></svg></div>`;
    div.innerHTML = `
        ${svgAvatarIA}
        <div class="ia-burbuja" style="display:flex; align-items:center; gap:8px;">
            <span class="ia-spinner" style="border-top-color:#6c5ce7; border-color:rgba(108,92,231,0.2);"></span>
            <span style="color:#747d8c; font-style:italic;">Analizando documento y generando respuesta exhaustiva...</span>
        </div>
    `;
    historial.appendChild(div);
    historial.scrollTop = historial.scrollHeight;
}

function removerMensajeChat(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function toggleFuentesIA(id) {
    const lista = document.getElementById(id);
    if (lista) {
        lista.style.display = (lista.style.display === 'none') ? 'flex' : 'none';
    }
}

function _registrarSnippetCitaIA(texto) {
    window._liraSnippetsMap = window._liraSnippetsMap || {};
    window._liraSnippetSeq = (window._liraSnippetSeq || 0) + 1;
    const key = 'lira_snip_' + window._liraSnippetSeq;
    window._liraSnippetsMap[key] = String(texto || '');
    return key;
}

// --- NAVEGACIÓN Y RESALTADO INTERACTIVO DE FUENTES EN EL PDF ---
window.liraNavegarYResaltarFuente = async function (pagina, textoSnippet, btnEl = null) {
    if (!pagina || isNaN(pagina)) {
        console.warn("⚠️ [LiraAI] Página inválida:", pagina);
        return;
    }
    const numPag = parseInt(pagina);
    const pagObjetivo = numPag - 1;
    const docObjetivo = (typeof rutaPDFActual !== 'undefined') ? rutaPDFActual : '';
    let snippetReal = (textoSnippet && window._liraSnippetsMap && Object.prototype.hasOwnProperty.call(window._liraSnippetsMap, textoSnippet))
        ? window._liraSnippetsMap[textoSnippet]
        : (textoSnippet || '');
    if (!snippetReal && btnEl && typeof btnEl.closest === 'function') {
        const blk = btnEl.closest('li, p, div');
        if (blk && blk.innerText) {
            snippetReal = blk.innerText;
        }
    }

    console.log(`🎯 [LiraAI] Navegando a página ${numPag} y resaltando fragmento...`);

    // 1. Mostrar feedback visual inmediato (Toast)
    mostrarToastLira(`🎯 Saltando a Página ${numPag} del PDF...`);

    // 2. Si no estamos en esa página, cambiar (cargarPagina limpia resaltados previos)
    if (typeof paginaActual !== 'undefined' && paginaActual !== pagObjetivo) {
        if (typeof cargarPagina === 'function') {
            await cargarPagina(pagObjetivo);
        } else {
            const inputPag = document.getElementById('input-pagina-actual');
            if (inputPag) inputPag.value = numPag;
            if (typeof irAPaginaDirecta === 'function') irAPaginaDirecta();
        }
        // Breve pausa para asegurar sincronización del canvas
        await new Promise(r => setTimeout(r, 120));
    } else if (typeof window.limpiarResaltadoBusqueda === 'function') {
        // Limpiar resaltado previo antes de pintar el nuevo en la misma página
        window.limpiarResaltadoBusqueda(true);
    }

    // 3. Obtener coordenadas exactas de las líneas del chunk desde PyMuPDF
    try {
        if (typeof eel !== 'undefined' && eel.rag_buscar_coordenadas_fuente) {
            const res = await eel.rag_buscar_coordenadas_fuente(numPag, snippetReal)();

            // Evitar dibujar si el usuario ya cambió de página, cerró LiraAI o abrió otro PDF durante la consulta
            const modalIA = document.getElementById('modal-ia');
            const iaCerrado = modalIA && modalIA.style.display === 'none';
            if (iaCerrado || (typeof paginaActual !== 'undefined' && paginaActual !== pagObjetivo) || (typeof rutaPDFActual !== 'undefined' && rutaPDFActual !== docObjetivo)) {
                return;
            }

            console.log("🔍 [LiraAI] Coordenadas recibidas:", res);
            if (res && res.exito && (res.rects || res.coords)) {
                const rectsToUse = res.rects || [res.coords];
                window.resaltadoBusqueda = rectsToUse;
                window.resaltadoBBox = res.bbox || null;
                window.resaltadoPagina = pagObjetivo;
                if (typeof resaltadoBusqueda !== 'undefined') {
                    resaltadoBusqueda = rectsToUse;
                }

                // Redibujar el canvas inmediatamente
                if (typeof dibujar === 'function') {
                    dibujar();
                }

                // 4. Auto-Scroll suave del visor PDF hacia la posición resaltada
                setTimeout(() => {
                    if ((typeof paginaActual !== 'undefined' && paginaActual !== pagObjetivo)) return;
                    const factorZoom = (typeof datosPagina !== 'undefined' && datosPagina?.factor_zoom) ? datosPagina.factor_zoom : 1.0;
                    const cssZoom = (typeof nivelZoomPDF === 'number') ? nivelZoomPDF : 1.0;
                    const targetY = res.bbox ? res.bbox[1] : (res.rects ? res.rects[0][1] : res.coords[1]);
                    const yPos = targetY * factorZoom * cssZoom;
                    const visor = document.getElementById('visor-container') || document.querySelector('.contenedor-visor') || document.getElementById('contenedor-canvas');
                    if (visor) {
                        visor.scrollTo({ top: Math.max(0, yPos - 120), behavior: 'smooth' });
                    }
                }, 100);
            } else {
                console.warn("⚠️ [LiraAI] No se encontraron rects:", res);
            }
        }
    } catch (err) {
        console.warn("⚠️ [LiraAI] No se pudieron obtener coordenadas del fragmento:", err);
    }
};

function mostrarToastLira(mensaje) {
    let toast = document.getElementById('ia-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'ia-toast';
        document.body.appendChild(toast);
    }
    toast.innerText = mensaje;
    toast.classList.add('visible');

    if (window._iaToastTimer) clearTimeout(window._iaToastTimer);
    window._iaToastTimer = setTimeout(() => {
        toast.classList.remove('visible');
    }, 2800);
}

// --- SOLICITUDES RÁPIDAS (PROMPTS TEMPLATE) ---
async function ejecutarSolicitudIA(tipo, promptCustom = null) {
    const box = document.getElementById('ia-resultado-box');
    const titulo = document.getElementById('ia-resultado-titulo');
    const cuerpoResultado = document.getElementById('ia-resultado-cuerpo');

    if (!box || !cuerpoResultado) return;

    box.style.display = 'flex';
    const titulos = {
        'academico': '🎓 Síntesis Académica y Metodológica',
        'resumen': '📝 Resumen Estructurado',
        'conclusiones': '🎯 Conclusiones y Hallazgos Estadísticos',
        'conceptos': '💡 Glosario y Abreviaturas',
        'flashcards': '❓ Flashcards y Preguntas de Estudio',
        'personalizado': '✍️ Análisis Personalizado'
    };
    if (titulo) titulo.innerText = titulos[tipo] || 'Resultado de la Solicitud';

    cuerpoResultado.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; color: #7f8c8d; padding: 15px 0;">
            <span class="ia-spinner"></span>
            <span>Generando análisis exhaustivo con IA...</span>
        </div>
    `;

    try {
        if (typeof eel !== 'undefined' && eel.rag_ejecutar_solicitud) {
            const modoActual = window.modoSalidaIA || document.getElementById('sel-ia-modo-salida')?.value || 'trazabilidad';
            const fuentesCtx = await construirContextoFuentesParaIA();
            const res = await eel.rag_ejecutar_solicitud(tipo, null, promptCustom, modoActual, fuentesCtx.contextoExtra, fuentesCtx.ignorarPdf)();
            if (res && res.exito) {
                const txt = res.respuesta || res.resumen || '';
                cuerpoResultado.innerHTML = formatearMarkdown(txt, res.fuentes || []);
                cuerpoResultado.setAttribute('data-texto-plano', txt);
            } else {
                cuerpoResultado.innerHTML = `⚠️ <span style="color:#e74c3c;"><b>Error:</b> ${res?.error || 'No se pudo generar el resultado.'}</span>`;
            }
        }
    } catch (e) {
        console.error("❌ [LiraAI] Error ejecutando solicitud:", e);
        cuerpoResultado.innerHTML = `❌ <span style="color:#e74c3c;">Excepción: ${e.message}</span>`;
    } finally {
        if (typeof actualizarGaugeTokensUI === 'function') {
            actualizarGaugeTokensUI(false);
        }
    }
}

function ejecutarSolicitudPersonalizada() {
    const input = document.getElementById('ia-input-solicitud-custom');
    if (!input || !input.value.trim()) return;
    ejecutarSolicitudIA('personalizado', input.value.trim());
}

// ==========================================================================
// 🔊 MOTOR DE LECTURA SECUENCIAL POR BLOQUES DE LIRAAI (CON KARAOKE 60 FPS)
// ==========================================================================

window.liraAIAudioState = {
    activo: false,
    sesionLocal: 0,
    contenedorPrincipal: null,
    btnId: null,
    bloques: [],              // [{ el, textoLimpio, oraciones, spans }]
    idxBloque: 0,
    idxOracion: 0,
    cursorPalabraEnBloque: 0,
    spansFraseActual: [],
    ultimoIdxPalabraFrase: -1,
    esSoloSeleccion: false
};

// 1. Limpieza estructural de markdown (los filtros fonéticos y médicos los aplica el motor central)
function extraerTextoLimpioParaLectura(textoMarkdown) {
    if (!textoMarkdown) return "";
    let t = String(textoMarkdown);

    // Quitar citas interactivas de Lira: [Pág. 3], [Página 1-2], [Fragmento 2], [Ref. 1]
    t = t.replace(/\[(?:P&aacute;g\.|P&aacute;gina|P&aacute;gs\.|P&Aacute;G\.|P&Aacute;GINA|P&Aacute;GS\.|Pag\.|Pagina|Pags\.|Pág\.|Página|Págs\.|Fragmento|Sección|Secci&oacute;n|Ref\.)\s*[\d\-,\s]+\]/gi, '');

    // Quitar bloques de código
    t = t.replace(/```[\s\S]*?```/g, '');

    // Quitar sintaxis markdown básica (encabezados, negritas, cursivas, código inline, tachados)
    t = t.replace(/^#{1,6}\s+/gm, '');
    t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
    t = t.replace(/\*([^*]+)\*/g, '$1');
    t = t.replace(/`([^`]+)`/g, '$1');
    t = t.replace(/~~([^~]+)~~/g, '$1');

    // Quitar viñetas al inicio de línea
    t = t.replace(/^\s*[-*+]\s+/gm, '');

    // Quitar etiquetas HTML residuales
    t = t.replace(/<[^>]*>/g, '');

    // Normalizar espacios y saltos de línea
    t = t.replace(/\r\n|\r/g, '\n');
    t = t.replace(/[ \t]+/g, ' ').trim();

    return t;
}

// 2. Segmentación en oraciones naturales reutilizable
function segmentarTextoEnOracionesIA(textoLimpio) {
    if (!textoLimpio) return [];
    let fragmentos = [];
    const lineas = textoLimpio.split(/\n+/);

    for (let linea of lineas) {
        let l = linea.trim();
        if (!l) continue;
        const matches = l.match(/[^.!?:]+[.!?:]+(?=\s|$)|[^.!?:]+$/g);
        if (matches) {
            for (let m of matches) {
                let mTrim = m.trim();
                if (mTrim.length > 0) fragmentos.push(mTrim);
            }
        } else {
            fragmentos.push(l);
        }
    }
    return fragmentos.filter(s => s.length > 1);
}

// 3. Envolver palabras del DOM en spans interactivos para Karaoke sin romper el HTML
function envolverPalabrasKaraokeIA(elementoContenedor) {
    if (!elementoContenedor) return [];

    // Guardamos el HTML original para restaurar al terminar
    if (!elementoContenedor.getAttribute('data-k-orig-html')) {
        elementoContenedor.setAttribute('data-k-orig-html', elementoContenedor.innerHTML);
    }

    let palabraGlobalIdx = 0;
    let listaSpans = [];

    function recorrerNodos(nodo) {
        if (nodo.nodeType === Node.TEXT_NODE) {
            const texto = nodo.textContent;
            if (!texto.trim()) return;

            // Tokenizar por espacios en blanco manteniendo la puntuación
            const tokens = texto.split(/(\s+)/);
            const fragmento = document.createDocumentFragment();

            for (let token of tokens) {
                if (!token) continue;
                if (/^\s+$/.test(token)) {
                    fragmento.appendChild(document.createTextNode(token));
                } else {
                    const span = document.createElement('span');
                    span.className = 'ia-k-palabra';
                    span.textContent = token;
                    span.setAttribute('data-k-idx', palabraGlobalIdx);
                    listaSpans.push({
                        el: span,
                        texto: token.toLowerCase().replace(/[^\wáéíóúñü]/gi, ''),
                        globalIdx: palabraGlobalIdx
                    });
                    palabraGlobalIdx++;
                    fragmento.appendChild(span);
                }
            }
            nodo.parentNode.replaceChild(fragmento, nodo);
        } else if (nodo.nodeType === Node.ELEMENT_NODE) {
            // Ignorar botones de acciones de mensajes o listas de fuentes
            if (nodo.classList.contains('ia-msg-acciones') || nodo.classList.contains('ia-fuentes-box') || nodo.tagName === 'BUTTON' || nodo.tagName === 'SVG') {
                return;
            }
            const hijos = Array.from(nodo.childNodes);
            for (let hijo of hijos) {
                recorrerNodos(hijo);
            }
        }
    }

    recorrerNodos(elementoContenedor);
    return listaSpans;
}

// 4. Extractor de bloques legibles individuales dentro de un contenedor
function extraerBloquesLegiblesIA(contenedor) {
    let nodos = Array.from(contenedor.querySelectorAll('.ia-bloque-texto, p, li, h1, h2, h3, h4, blockquote'))
        .filter(el => {
            if (el.closest('.ia-msg-acciones, .ia-fuentes-box, button')) return false;
            const parent = el.parentElement?.closest('.ia-bloque-texto, p, li, h1, h2, h3, h4, blockquote');
            if (parent && contenedor.contains(parent)) return false;
            return el.innerText.trim().length > 0;
        });

    if (nodos.length === 0) {
        nodos = [contenedor];
    }

    return nodos.map(el => {
        const textoLimpio = extraerTextoLimpioParaLectura(el.innerText);
        const oraciones = segmentarTextoEnOracionesIA(textoLimpio);
        const spans = Array.from(el.querySelectorAll('.ia-k-palabra')).map(span => ({
            el: span,
            texto: (span.textContent || '').toLowerCase().replace(/[^\wáéíóúñü]/gi, '')
        }));
        return {
            el: el,
            textoLimpio: textoLimpio,
            oraciones: oraciones,
            spans: spans
        };
    }).filter(b => b.oraciones.length > 0);
}

// 5. Iniciar o alternar lectura fluida por bloques (igual que en el visor de PDF)
window.liraIniciarLecturaSecuencial = function (contenedorPrincipal, bloqueInicialEl = null, btnId = null, soloTextoSeleccion = null) {
    if (!contenedorPrincipal) return;

    // Si ya estamos reproduciendo este mismo botón o contenedor y no se solicitó saltar a un bloque nuevo
    if (window.liraAIAudioState.activo && window.liraAIAudioState.contenedorPrincipal === contenedorPrincipal && !bloqueInicialEl) {
        window.liraDetenerLectura();
        return;
    }

    // Detener cualquier lectura previa limpiamente
    if (window.liraAIAudioState.activo) {
        window.liraDetenerLectura();
    }

    // Caso A: Modo Lectura de Selección Específica
    if (soloTextoSeleccion && soloTextoSeleccion.trim().length > 1) {
        const textoLimpio = extraerTextoLimpioParaLectura(soloTextoSeleccion);
        const oraciones = segmentarTextoEnOracionesIA(textoLimpio);
        if (oraciones.length === 0) {
            mostrarToastLira("⚠️ No se detectaron oraciones para leer.");
            return;
        }

        const spansTotales = envolverPalabrasKaraokeIA(contenedorPrincipal);
        contenedorPrincipal.classList.add('ia-lectura-activa');

        let spansAjustados = spansTotales;
        const primeraPalabraSel = textoLimpio.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^\wáéíóúñü]/gi, '') || "";
        const matchIdx = spansTotales.findIndex(s => s.texto && s.texto.includes(primeraPalabraSel));
        if (matchIdx !== -1) {
            spansAjustados = spansTotales.slice(matchIdx);
        }

        window.liraAIAudioState.sesionLocal = Date.now();
        const sesionId = window.liraAIAudioState.sesionLocal;
        window.liraAIAudioState.activo = true;
        window.liraAIAudioState.contenedorPrincipal = contenedorPrincipal;
        window.liraAIAudioState.btnId = btnId;
        window.liraAIAudioState.bloques = [{
            el: contenedorPrincipal,
            textoLimpio: textoLimpio,
            oraciones: oraciones,
            spans: spansAjustados
        }];
        window.liraAIAudioState.idxBloque = 0;
        window.liraAIAudioState.idxOracion = 0;
        window.liraAIAudioState.cursorPalabraEnBloque = 0;
        window.liraAIAudioState.esSoloSeleccion = true;

        actualizarBotonLecturaIA(btnId, true);
        mostrarToastLira(`🔊 Leyendo selección (${oraciones.length} frases)...`);
        reproducirPasoIA(sesionId);
        return;
    }

    // Caso B: Lectura Fluida Secuencial de Bloques
    envolverPalabrasKaraokeIA(contenedorPrincipal);
    contenedorPrincipal.classList.add('ia-lectura-activa');

    const listaBloques = extraerBloquesLegiblesIA(contenedorPrincipal);
    if (listaBloques.length === 0) {
        mostrarToastLira("⚠️ No hay contenido legible en esta respuesta.");
        window.liraDetenerLectura();
        return;
    }

    // Encontrar índice del bloque inicial si se hizo clic en uno
    let idxInicial = 0;
    if (bloqueInicialEl) {
        const found = listaBloques.findIndex(b => b.el === bloqueInicialEl || b.el.contains(bloqueInicialEl) || bloqueInicialEl.contains(b.el));
        if (found !== -1) idxInicial = found;
    }

    window.liraAIAudioState.sesionLocal = Date.now();
    const sesionId = window.liraAIAudioState.sesionLocal;
    window.liraAIAudioState.activo = true;
    window.liraAIAudioState.contenedorPrincipal = contenedorPrincipal;
    window.liraAIAudioState.btnId = btnId;
    window.liraAIAudioState.bloques = listaBloques;
    window.liraAIAudioState.idxBloque = idxInicial;
    window.liraAIAudioState.idxOracion = 0;
    window.liraAIAudioState.cursorPalabraEnBloque = 0;
    window.liraAIAudioState.esSoloSeleccion = false;

    actualizarBotonLecturaIA(btnId, true);
    const totalBloquesRestantes = listaBloques.length - idxInicial;
    mostrarToastLira(`🔊 Lectura fluida (${totalBloquesRestantes} ${totalBloquesRestantes === 1 ? 'bloque' : 'bloques'})...`);

    reproducirPasoIA(sesionId);
};

// Alias compatible
window.liraToggleLectura = function (textoBruto, btnId, esSeleccion = false, contenedorTarget = null) {
    if (contenedorTarget) {
        window.liraIniciarLecturaSecuencial(contenedorTarget, null, btnId, esSeleccion ? textoBruto : null);
    }
};

// 6. Bucle secuencial paso a paso (un bloque sigue a otro de manera fluida y continua)
function reproducirPasoIA(sesionId) {
    if (!window.liraAIAudioState.activo || window.liraAIAudioState.sesionLocal !== sesionId) {
        return;
    }

    const state = window.liraAIAudioState;

    // ¿Se terminaron todos los bloques de la respuesta?
    if (state.idxBloque >= state.bloques.length) {
        mostrarToastLira("✅ Lectura de respuesta completada.");
        window.liraDetenerLectura();
        return;
    }

    const bloqueActual = state.bloques[state.idxBloque];

    // Si estamos en la primera oración del bloque, actualizar resaltado de bloque y auto-scroll
    if (state.idxOracion === 0) {
        document.querySelectorAll('.ia-bloque-reproduciendo').forEach(el => el.classList.remove('ia-bloque-reproduciendo'));
        if (bloqueActual.el && bloqueActual.el !== state.contenedorPrincipal) {
            bloqueActual.el.classList.add('ia-bloque-reproduciendo');
            try {
                bloqueActual.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch (e) { }
        }
        state.cursorPalabraEnBloque = 0;
    }

    // ¿Se terminaron las oraciones de este bloque específico?
    if (state.idxOracion >= bloqueActual.oraciones.length) {
        if (bloqueActual.el) bloqueActual.el.classList.remove('ia-bloque-reproduciendo');
        state.idxBloque++;
        state.idxOracion = 0;
        state.cursorPalabraEnBloque = 0;

        setTimeout(() => {
            if (window.liraAIAudioState.activo && window.liraAIAudioState.sesionLocal === sesionId) {
                reproducirPasoIA(sesionId);
            }
        }, 130); // Pausa natural entre párrafos/bloques
        return;
    }

    const frase = bloqueActual.oraciones[state.idxOracion];
    state.idxOracion++;

    // Preparar lote de spans para el Karaoke de esta frase
    if (bloqueActual.spans && bloqueActual.spans.length > 0) {
        const palabrasFrase = frase.trim().split(/\s+/).filter(w => w.length > 0);
        const cantPalabras = palabrasFrase.length;
        const inicio = state.cursorPalabraEnBloque;
        const fin = Math.min(bloqueActual.spans.length, inicio + cantPalabras);

        state.spansFraseActual = bloqueActual.spans.slice(inicio, fin);
        state.cursorPalabraEnBloque = fin;
        state.ultimoIdxPalabraFrase = -1;

        state.spansFraseActual.forEach(s => {
            if (s.el) s.el.className = 'ia-k-palabra';
        });
    } else {
        state.spansFraseActual = [];
    }

    if (typeof hablarTexto === 'function') {
        hablarTexto(frase, () => {
            // Callback al terminar la frase actual
            if (state.spansFraseActual) {
                state.spansFraseActual.forEach(s => {
                    if (s.el) s.el.className = 'ia-k-palabra ia-k-palabra-leida';
                });
            }

            setTimeout(() => {
                if (window.liraAIAudioState.activo && window.liraAIAudioState.sesionLocal === sesionId) {
                    reproducirPasoIA(sesionId);
                }
            }, 60); // Pausa natural entre oraciones
        });
    } else {
        console.warn("⚠️ [LiraAI] hablarTexto no está disponible.");
        window.liraDetenerLectura();
    }
}

// 7. Actualizador de Karaoke a 60 FPS (invocado desde loopKaraokeAltaPrecision de motorPiper.js)
window.actualizarKaraokeIA = function (tiempoAudioActual, pAudio, pIdx) {
    if (!window.liraAIAudioState.activo || !window.liraAIAudioState.spansFraseActual || window.liraAIAudioState.spansFraseActual.length === 0) {
        return;
    }

    const totalPalabras = window.liraAIAudioState.spansFraseActual.length;
    let targetIdx = -1;

    if (window.partituraActual && window.partituraActual.length > 0) {
        if (pAudio && pAudio.vIdx !== undefined) {
            targetIdx = Math.min(totalPalabras - 1, Math.max(0, pAudio.vIdx));
        } else if (pIdx !== -1) {
            targetIdx = Math.min(totalPalabras - 1, pIdx);
        } else {
            const ultima = window.partituraActual[window.partituraActual.length - 1];
            const durTotal = (ultima && ultima.e > 0) ? ultima.e : 1.0;
            const progresoRel = Math.max(0, Math.min(1, tiempoAudioActual / durTotal));
            targetIdx = Math.min(totalPalabras - 1, Math.floor(progresoRel * totalPalabras));
        }
    } else if (pIdx !== -1) {
        targetIdx = Math.min(totalPalabras - 1, pIdx);
    }

    if (targetIdx === window.liraAIAudioState.ultimoIdxPalabraFrase) {
        return;
    }
    window.liraAIAudioState.ultimoIdxPalabraFrase = targetIdx;

    for (let i = 0; i < totalPalabras; i++) {
        const item = window.liraAIAudioState.spansFraseActual[i];
        if (!item || !item.el) continue;

        if (i < targetIdx) {
            if (item.el.className !== 'ia-k-palabra ia-k-palabra-leida') {
                item.el.className = 'ia-k-palabra ia-k-palabra-leida';
            }
        } else if (i === targetIdx) {
            if (item.el.className !== 'ia-k-palabra ia-k-palabra-activa') {
                item.el.className = 'ia-k-palabra ia-k-palabra-activa';
                // Auto-scroll suave para mantener la palabra activa a la vista
                try {
                    item.el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                } catch (e) { }
            }
        } else {
            if (item.el.className !== 'ia-k-palabra') {
                item.el.className = 'ia-k-palabra';
            }
        }
    }
};

// 8. Detener lectura de LiraAI y restaurar DOM limpio
window.liraDetenerLectura = function () {
    const btnId = window.liraAIAudioState.btnId;
    const contenedor = window.liraAIAudioState.contenedorPrincipal;

    // Restaurar HTML original del contenedor para no dejar residuos de spans
    if (contenedor) {
        const origHtml = contenedor.getAttribute('data-k-orig-html');
        if (origHtml) {
            contenedor.innerHTML = origHtml;
            contenedor.removeAttribute('data-k-orig-html');
        }
        contenedor.classList.remove('ia-lectura-activa');
    }

    document.querySelectorAll('.ia-bloque-reproduciendo').forEach(el => {
        el.classList.remove('ia-bloque-reproduciendo');
    });

    window.liraAIAudioState.activo = false;
    window.liraAIAudioState.sesionLocal = 0;
    window.liraAIAudioState.contenedorPrincipal = null;
    window.liraAIAudioState.btnId = null;
    window.liraAIAudioState.bloques = [];
    window.liraAIAudioState.idxBloque = 0;
    window.liraAIAudioState.idxOracion = 0;
    window.liraAIAudioState.cursorPalabraEnBloque = 0;
    window.liraAIAudioState.spansFraseActual = [];
    window.liraAIAudioState.ultimoIdxPalabraFrase = -1;
    window.liraAIAudioState.esSoloSeleccion = false;

    if (btnId) {
        actualizarBotonLecturaIA(btnId, false);
    }

    document.querySelectorAll('.ia-btn-reading').forEach(b => {
        b.classList.remove('ia-btn-reading');
        const icon = b.querySelector('.ia-btn-icon');
        const txt = b.querySelector('.ia-btn-texto');
        if (icon) icon.innerText = '🔊';
        if (txt) txt.innerText = 'Escuchar';
        if (!icon && !txt) b.innerText = '🔊 Escuchar';
    });

    if (typeof detenerLectura === 'function') {
        detenerLectura(true);
    }
};

// 9. Helpers de UI para botones de audio
function actualizarBotonLecturaIA(btnId, isPlaying) {
    if (!btnId) return;
    const btn = document.getElementById(btnId);
    if (!btn) return;

    if (isPlaying) {
        btn.classList.add('ia-btn-reading');
        const icon = btn.querySelector('.ia-btn-icon');
        const txt = btn.querySelector('.ia-btn-texto');
        if (icon) icon.innerText = '⏹️';
        if (txt) txt.innerText = 'Detener';
        if (!icon && !txt) btn.innerText = '⏹️ Detener';
    } else {
        btn.classList.remove('ia-btn-reading');
        const icon = btn.querySelector('.ia-btn-icon');
        const txt = btn.querySelector('.ia-btn-texto');
        if (icon) icon.innerText = '🔊';
        if (txt) txt.innerText = 'Escuchar';
        if (!icon && !txt) btn.innerText = '🔊 Escuchar';
    }
}

// Buffer de última selección de texto del usuario en el panel de IA
window._liraUltimaSeleccion = { texto: "", time: 0 };
document.addEventListener('selectionchange', () => {
    try {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
            const txt = sel.toString().trim();
            if (txt.length > 1) {
                window._liraUltimaSeleccion = {
                    texto: txt,
                    time: Date.now()
                };
            }
        }
    } catch (e) { }
});

// 10. Handlers de acciones para mensajes de Chat (con lectura secuencial y soporte de selección)
window.liraToggleLecturaMensaje = function (msgId) {
    const btnId = `btn-escuchar-${msgId}`;
    const msgDiv = document.getElementById(msgId);
    const cuerpo = msgDiv ? msgDiv.querySelector('.ia-burbuja') : null;
    if (!cuerpo) return;

    // Detectar si el usuario seleccionó un fragmento específico de texto
    let sel = (window.getSelection ? window.getSelection().toString() : '').trim();
    if (!sel && window._liraUltimaSeleccion && (Date.now() - window._liraUltimaSeleccion.time < 2500)) {
        sel = window._liraUltimaSeleccion.texto;
    }

    window.liraIniciarLecturaSecuencial(cuerpo, null, btnId, (sel && sel.length > 1) ? sel : null);
};

window.liraCopiarTextoMensaje = function (msgId) {
    let txtACopiar = (window._liraTextosMap && window._liraTextosMap[msgId]) ? window._liraTextosMap[msgId] : null;
    if (!txtACopiar) {
        const msgDiv = document.getElementById(msgId);
        const cuerpo = msgDiv ? msgDiv.querySelector('.ia-burbuja') : null;
        if (cuerpo) txtACopiar = cuerpo.innerText;
    }
    if (!txtACopiar) return;
    navigator.clipboard.writeText(txtACopiar).then(() => {
        mostrarToastLira("📋 Respuesta copiada al portapapeles.");
    }).catch(() => {
        liraAlert("No se pudo copiar automáticamente.", '⚠️');
    });
};

// 11. Handlers de acciones para resultado de Solicitudes Rápidas (con lectura secuencial y selección)
function copiarResultadoIA() {
    const cuerpo = document.getElementById('ia-resultado-cuerpo');
    if (!cuerpo) return;
    const texto = cuerpo.getAttribute('data-texto-plano') || cuerpo.innerText;
    navigator.clipboard.writeText(texto).then(() => {
        mostrarToastLira("📋 Copiado al portapapeles con éxito.");
    }).catch(() => {
        liraAlert("No se pudo copiar automáticamente.", '⚠️');
    });
}

function escucharResultadoIA() {
    const btnId = 'btn-ia-escuchar-solicitud';
    const cuerpo = document.getElementById('ia-resultado-cuerpo');
    if (!cuerpo) return;

    let sel = (window.getSelection ? window.getSelection().toString() : '').trim();
    if (!sel && window._liraUltimaSeleccion && (Date.now() - window._liraUltimaSeleccion.time < 2500)) {
        sel = window._liraUltimaSeleccion.texto;
    }

    window.liraIniciarLecturaSecuencial(cuerpo, null, btnId, (sel && sel.length > 1) ? sel : null);
}

// --- UTILIDADES ---
function autoAjustarTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
}

function manejarKeydownChat(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        enviarMensajeChatIA();
    }
}

function escaparHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function (m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

function escaparAttr(str) {
    if (!str) return '';
    return str.replace(/['"\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatearMarkdown(texto, fuentes = []) {
    if (!texto) return '';
    let html = escaparHTML(texto);

    // Mapa de fragmentos por página para enlazar botones de citas con el texto completo del chunk
    const fuentesPorPagina = {};
    const fuentesPorIdx = {};
    if (Array.isArray(fuentes)) {
        fuentes.forEach((f, i) => {
            const pIni = parseInt(f.pagina_inicio || f.pagina || 1);
            const pFin = parseInt(f.pagina_fin || pIni);
            const snip = (f.texto_puro || f.texto || '').replace(/\s+/g, ' ').trim();
            for (let p = pIni; p <= pFin; p++) {
                if (!fuentesPorPagina[p]) fuentesPorPagina[p] = [];
                if (snip) fuentesPorPagina[p].push(snip);
            }
            fuentesPorIdx[i + 1] = { pagina: pIni, texto: snip };
        });
    }

    // Encabezados Markdown
    html = html.replace(/^### (.*$)/gim, '<h4 class="ia-bloque-texto" title="🖱️ Clic para escuchar este encabezado" style="color:#2c3e50; margin:14px 0 6px 0; font-size:14px; font-weight:700; border-bottom:1px solid #dfe4ea; padding-bottom:3px;">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 class="ia-bloque-texto" title="🖱️ Clic para escuchar este encabezado" style="color:#2c3e50; margin:16px 0 8px 0; font-size:15px; font-weight:700;">$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2 class="ia-bloque-texto" title="🖱️ Clic para escuchar este título" style="color:#2c3e50; margin:18px 0 10px 0; font-size:16px; font-weight:800;">$1</h2>');

    // Negritas y cursivas
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Citas de Páginas Interactivas: soporta [Pág. X], [Págs. X-Y] y listas múltiples como [Pág. 5, 16] o [Pág. 2, 9-13]
    html = html.replace(/\[(?:P&aacute;g\.|P&aacute;gina|P&aacute;gs\.|P&Aacute;G\.|P&Aacute;GINA|P&Aacute;GS\.|Pag\.|Pagina|Pags\.|Pág\.|Página|Págs\.)\s*([0-9,\s\-]+)\]/gi, (match, listaRaw) => {
        const partes = String(listaRaw).split(',').map(s => s.trim()).filter(Boolean);
        if (!partes.length) return match;
        return partes.map(parte => {
            const mRango = parte.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
            if (!mRango) return parte;
            const p1 = mRango[1];
            const p2 = mRango[2];
            const pag = parseInt(p1);
            const label = p2 ? `📄 Págs. ${p1}-${p2}` : `📄 Pág. ${p1}`;
            const textosPag = fuentesPorPagina[pag];
            const snipKey = (textosPag && textosPag.length) ? _registrarSnippetCitaIA(textosPag.join('\n')) : '';
            return `<button class="ia-cite-badge" onclick="liraNavegarYResaltarFuente(${pag}, '${snipKey}', this)" title="Saltar a página ${p1} y resaltar fragmento en el PDF">${label}</button>`;
        }).join(' ');
    });

    // Citas de Fragmentos: [Fragmento X] o [Fragmento X | Pág. Y]
    html = html.replace(/\[(?:Fragmento|Secci&oacute;n|Sección)\s*(\d+)(?:\s*\|\s*[^\]]*)?\]/gi, (match, p1) => {
        const idx = parseInt(p1);
        const fData = fuentesPorIdx[idx];
        if (fData) {
            const snipKey = _registrarSnippetCitaIA(fData.texto);
            return `<button class="ia-cite-badge" onclick="liraNavegarYResaltarFuente(${fData.pagina}, '${snipKey}', this)" title="Saltar a fragmento ${idx} en Pág. ${fData.pagina}">📑 Ref. ${idx} (Pág. ${fData.pagina})</button>`;
        }
        return `<span style="display:inline-flex; align-items:center; background:#eef2ff; color:#4338ca; border-radius:4px; padding:0 5px; font-size:11px; font-weight:600;">[Ref. ${p1}]</span>`;
    });

    // Viñetas
    html = html.replace(/^\s*[\-\*]\s+(.*)$/gm, '<li class="ia-bloque-texto" title="🖱️ Clic para escuchar este punto" style="margin-bottom:4px; margin-left: 15px;">$1</li>');

    // Párrafos
    const parrafos = html.split(/\n\n+/);
    const htmlFormateado = parrafos.map(p => {
        let pTrim = p.trim();
        if (!pTrim) return '';
        if (pTrim.startsWith('<h') || pTrim.startsWith('<li') || pTrim.startsWith('<div')) {
            return pTrim.replace(/\n/g, '<br>');
        }
        return `<p class="ia-bloque-texto" title="🖱️ Clic para escuchar este párrafo">${pTrim.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    return `<div style="line-height:1.6; font-size:13.5px; color:#2c3e50;">${htmlFormateado}</div>`;
}

// 12. Delegación global de eventos para "Lectura interactiva al hacer clic en bloque"
document.addEventListener('click', (e) => {
    // 1. Verificar si la opción está activa
    const chk = document.getElementById('chk-ia-leer-bloque');
    if (chk && !chk.checked) return;

    // 2. Si el clic fue en un elemento interactivo (botones, enlaces, citas [Pág. X], inputs, etc.), no intervenir
    if (e.target.closest('button, a, .ia-cite-badge, .ia-btn-accion-msg, .ia-fuentes-toggle, input, textarea, select, svg')) {
        return;
    }

    // 3. Si el usuario está realizando una selección con el ratón (más de 2 letras seleccionadas), priorizar selección
    const sel = (window.getSelection ? window.getSelection().toString() : '').trim();
    if (sel && sel.length > 2) {
        return;
    }

    // 4. Buscar si el clic ocurrió dentro de un bloque legible en Chat o Solicitudes
    const bloque = e.target.closest('.ia-bloque-texto, .ia-burbuja p, .ia-burbuja li, .ia-burbuja h1, .ia-burbuja h2, .ia-burbuja h3, .ia-burbuja h4, .ia-burbuja blockquote, #ia-resultado-cuerpo p, #ia-resultado-cuerpo li, #ia-resultado-cuerpo h1, #ia-resultado-cuerpo h2, #ia-resultado-cuerpo h3, #ia-resultado-cuerpo h4, #ia-resultado-cuerpo blockquote');
    if (!bloque) return;

    // Identificar el contenedor principal de la respuesta (la burbuja del mensaje o el cuerpo de resultados)
    const contenedorPrincipal = bloque.closest('.ia-burbuja') || bloque.closest('#ia-resultado-cuerpo');
    if (!contenedorPrincipal) return;

    // Identificar el ID del botón principal asociado si existe
    const msgDiv = bloque.closest('.ia-mensaje');
    const btnId = msgDiv ? `btn-escuchar-${msgDiv.id}` : (bloque.closest('#ia-resultado-cuerpo') ? 'btn-ia-escuchar-solicitud' : null);

    // Si ya estamos reproduciendo activamente en este mismo contenedor:
    if (window.liraAIAudioState.activo && window.liraAIAudioState.contenedorPrincipal === contenedorPrincipal && Array.isArray(window.liraAIAudioState.bloques) && window.liraAIAudioState.bloques.length > 0) {
        const idxTarget = window.liraAIAudioState.bloques.findIndex(b => b.el === bloque || b.el.contains(bloque) || bloque.contains(b.el));

        // Caso 1: Clic en el bloque que está sonando actualmente -> Detener/Pausar
        if (idxTarget === window.liraAIAudioState.idxBloque) {
            window.liraDetenerLectura();
            return;
        }

        // Caso 2: Clic en otro bloque -> Saltar inmediatamente a ese bloque y continuar fluidamente
        if (idxTarget !== -1) {
            if (typeof detenerLectura === 'function') {
                detenerLectura(false); // Detiene el audio de Piper sin restaurar DOM
            }
            window.liraAIAudioState.sesionLocal = Date.now();
            const sesionId = window.liraAIAudioState.sesionLocal;
            window.liraAIAudioState.idxBloque = idxTarget;
            window.liraAIAudioState.idxOracion = 0;
            window.liraAIAudioState.cursorPalabraEnBloque = 0;
            mostrarToastLira(`⏩ Continuando desde bloque ${idxTarget + 1}...`);
            reproducirPasoIA(sesionId);
            return;
        }
    }

    // Si no estábamos reproduciendo o el clic fue en otra respuesta/mensaje:
    window.liraIniciarLecturaSecuencial(contenedorPrincipal, bloque, btnId, null);
});

// Exportar globalmente
window.configProveedores = configProveedores;
window.estadoIA = estadoIA;
window.cambiarProveedorIA = cambiarProveedorIA;
window.actualizarApiKeyProveedorActual = actualizarApiKeyProveedorActual;
window.actualizarModeloCloudActual = actualizarModeloCloudActual;
window.cargarHistorialChatDocumento = cargarHistorialChatDocumento;
window.reiniciarChatIA = reiniciarChatIA;
window.abrirModalIA = abrirModalIA;
window.cerrarModalIA = cerrarModalIA;
window.cambiarTabIA = cambiarTabIA;
window.enviarMensajeChatIA = enviarMensajeChatIA;

// Sincronizar ajustes iniciales de IA cargados desde el JSON en disco
async function sincronizarAjustesInicialesIA() {
    try {
        if (typeof eel !== 'undefined' && eel.cargar_ajustes_lectura) {
            const ajustes = await eel.cargar_ajustes_lectura()();
            if (ajustes) {
                if (ajustes.ia_proveedor_activo) configProveedores.proveedorActivo = ajustes.ia_proveedor_activo;
                if (ajustes.ia_cloud_keys && typeof ajustes.ia_cloud_keys === 'object') {
                    configProveedores.keys = Object.assign({}, configProveedores.keys, ajustes.ia_cloud_keys);
                }
                if (ajustes.ia_cloud_modelos && typeof ajustes.ia_cloud_modelos === 'object') {
                    configProveedores.modelos = Object.assign({}, configProveedores.modelos, ajustes.ia_cloud_modelos);
                }
                if (ajustes.ia_modelo_chat) estadoIA.modeloChatSeleccionado = ajustes.ia_modelo_chat;
                if (ajustes.ia_modelo_embed) estadoIA.modeloEmbedSeleccionado = ajustes.ia_modelo_embed;

                const prov = configProveedores.proveedorActivo || 'ollama';
                const key = configProveedores.keys[prov] || '';
                const mod = configProveedores.modelos[prov] || '';
                if (eel.rag_configurar_proveedor) {
                    eel.rag_configurar_proveedor(prov, key, mod)();
                }
                if (typeof cambiarProveedorIA === 'function') {
                    cambiarProveedorIA(prov);
                }
                if (typeof actualizarGaugeTokensUI === 'function') {
                    actualizarGaugeTokensUI(true);
                }
            }
        }
    } catch (err) {
        console.warn("⚠️ [LiraAI] Error sincronizando ajustes iniciales de IA:", err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sincronizarAjustesInicialesIA);
} else {
    sincronizarAjustesInicialesIA();
}





// --- TIENDA DE MODELOS OLLAMA (HUGGING FACE GGUF EN VIVO) ---
let _ollamaInstaladosCache = [];

function actualizarVisibilidadAccionesOllama() {
    const sel = document.getElementById('sel-ia-proveedor');
    const box = document.getElementById('ollama-acciones-locales');
    if (box && sel) {
        box.style.display = (sel.value === 'ollama') ? 'flex' : 'none';
    }
}
document.addEventListener('DOMContentLoaded', () => {
    const sel = document.getElementById('sel-ia-proveedor');
    if (sel) {
        sel.addEventListener('change', actualizarVisibilidadAccionesOllama);
        actualizarVisibilidadAccionesOllama();
    }
});

async function conectarOIniciarOllama() {
    const btn = document.getElementById('btn-conectar-ollama');
    if (btn) { btn.disabled = true; btn.textContent = 'Conectando...'; }
    try {
        if (typeof eel !== 'undefined' && typeof eel.iniciar_ollama_local === 'function') {
            const res = await eel.iniciar_ollama_local()();
            if (!res.instalado) {
                if (typeof liraAlert === 'function') {
                    liraAlert('Ollama no instalado', res.mensaje || 'Descarga Ollama desde ollama.com para usar modelos locales.', '⚠️');
                } else if (typeof mostrarToastLira === 'function') {
                    mostrarToastLira(res.mensaje);
                }
                return;
            }
            if (typeof mostrarToastLira === 'function' && res.mensaje) mostrarToastLira(res.mensaje);
        }
        if (typeof verificarEstadoIA === 'function') await verificarEstadoIA();
    } catch (e) {
        if (typeof mostrarToastLira === 'function') mostrarToastLira('Error al conectar con Ollama');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Conectar / Iniciar Ollama'; }
    }
}

async function iniciarOllamaDesdeUI() {
    const btn = document.getElementById('btn-iniciar-ollama');
    if (btn) { btn.disabled = true; btn.textContent = 'Iniciando...'; }
    try {
        const res = await eel.iniciar_ollama_local()();
        if (typeof mostrarToastLira === 'function') mostrarToastLira(res.mensaje || 'Listo');
        if (!res.instalado && typeof liraAlert === 'function') {
            liraAlert('Ollama no detectado', res.mensaje, '⚠️');
        }
    } catch (e) {
        if (typeof mostrarToastLira === 'function') mostrarToastLira('Error al iniciar Ollama');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '▶ Iniciar Ollama'; }
    }
}

