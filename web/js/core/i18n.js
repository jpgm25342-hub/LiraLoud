/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// 7. INTERNACIONALIZACIÓN (i18n)
// ==========================================
window.LIRA_I18N = window.LIRA_I18N || {};
let currentLanguage = 'es';
const translations = window.LIRA_I18N;

function _getDicts() {
    return window.LIRA_I18N || translations;
}

function _resolveValue(key) {
    if (!key) return undefined;
    const dicts = _getDicts();
    const dict = dicts[currentLanguage] || dicts.es || {};
    const val = dict[key];
    if (val !== undefined && val !== null && val !== '') return val;
    const fallbackEs = dicts.es && dicts.es[key];
    return fallbackEs !== undefined && fallbackEs !== null && fallbackEs !== '' ? fallbackEs : undefined;
}

function _backupSpanishDefaultsFromDOM(root = document) {
    const dicts = _getDicts();
    if (!dicts.es) dicts.es = {};
    const dictEs = dicts.es;
    const saveAttr = (key, val) => {
        if (key && val && (dictEs[key] === undefined || dictEs[key] === '')) dictEs[key] = val;
    };
    root.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key && (dictEs[key] === undefined || dictEs[key] === '') && el.querySelector(':scope > svg') === null) {
            dictEs[key] = el.innerHTML.trim();
        }
    });
    root.querySelectorAll('[data-i18n-placeholder], [data-i18n-ph]').forEach(el => {
        saveAttr(el.getAttribute('data-i18n-placeholder') || el.getAttribute('data-i18n-ph'), el.getAttribute('placeholder'));
    });
    root.querySelectorAll('[data-i18n-title]').forEach(el => saveAttr(el.getAttribute('data-i18n-title'), el.getAttribute('title')));
    root.querySelectorAll('[data-i18n-aria-label]').forEach(el => saveAttr(el.getAttribute('data-i18n-aria-label'), el.getAttribute('aria-label')));
}

function t(key, fallbackOrParams, params) {
    if (!key) return '';
    const isObj = fallbackOrParams !== null && typeof fallbackOrParams === 'object';
    const fallback = typeof fallbackOrParams === 'string' ? fallbackOrParams : undefined;
    const vars = isObj ? fallbackOrParams : params;

    const dicts = _getDicts();
    const lang = currentLanguage || 'es';
    let raw = (dicts[lang] || {})[key];
    if (raw === undefined || raw === null || raw === '') raw = (dicts.es || {})[key];
    if (raw === undefined || raw === null || raw === '') raw = (dicts.en || {})[key];
    if (raw === undefined || raw === null || raw === '') raw = fallback !== undefined ? fallback : key;

    let result = String(raw);
    if (vars && typeof vars === 'object') {
        result = result.replace(/\{(\w+)\}/g, (match, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : match));
    }
    return result;
}

function toggleIdiomaDrop(nuevoIdioma) {
    const dicts = _getDicts();
    if (!nuevoIdioma || !dicts[nuevoIdioma]) return;
    currentLanguage = nuevoIdioma;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('liraloud_idioma_ui', nuevoIdioma); } catch (e) {}
    applyTranslations();
    if (typeof guardarTodosAjustes === 'function') guardarTodosAjustes();
}

function toggleIdioma() {
    toggleIdiomaDrop(currentLanguage === 'es' ? 'en' : 'es');
}

function applyTranslations(root = document) {
    _backupSpanishDefaultsFromDOM(root);
    if (root === document && document.documentElement) document.documentElement.lang = currentLanguage;

    [['opcion-leer', 'menu-leer'], ['opcion-copiar', 'menu-copiar'], ['opcion-buscar', 'menu-buscar']].forEach(([id, key]) => {
        const el = document.getElementById(id), val = _resolveValue(key);
        if (el && val) el.innerText = val;
    });

    const carga = document.querySelector('#pantalla-carga h2');
    const cargaVal = _resolveValue('carga-titulo');
    if (carga && cargaVal) carga.innerText = cargaVal;

    root.querySelectorAll('[data-i18n]').forEach(el => {
        const val = _resolveValue(el.getAttribute('data-i18n'));
        if (!val) return;
        if (el.querySelector(':scope > svg') !== null && !val.includes('<svg')) {
            let updated = false;
            for (let i = el.childNodes.length - 1; i >= 0; i--) {
                const node = el.childNodes[i];
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
                    node.textContent = ' ' + val.replace(/<[^>]*>/g, '').trim();
                    updated = true;
                    break;
                }
            }
            if (!updated) {
                const span = document.createElement('span');
                span.innerHTML = val;
                el.appendChild(span);
            }
        } else {
            el.innerHTML = val;
        }
    });

    const applyAttr = (sel, attr, fallbackAttr) => {
        root.querySelectorAll(sel).forEach(el => {
            const key = el.getAttribute(attr) || (fallbackAttr && el.getAttribute(fallbackAttr));
            const val = _resolveValue(key);
            if (val) el.setAttribute(attr.replace('data-i18n-', ''), val);
        });
    };
    applyAttr('[data-i18n-placeholder], [data-i18n-ph]', 'data-i18n-placeholder', 'data-i18n-ph');
    applyAttr('[data-i18n-title]', 'data-i18n-title');
    applyAttr('[data-i18n-aria-label]', 'data-i18n-aria-label');

    if (root === document) {
        if (typeof renderizarAtajos === 'function') renderizarAtajos();
        window.dispatchEvent(new CustomEvent('lira:idioma-cambiado', { detail: { idioma: currentLanguage } }));
    }
}

function translateDynamicText(key, fallback, params) {
    return t(key, fallback, params);
}

window.t = t;
window.liraI18n = t;
window.translateDynamicText = translateDynamicText;
window.toggleIdioma = toggleIdioma;
window.toggleIdiomaDrop = toggleIdiomaDrop;
window.applyTranslations = applyTranslations;
window.getCurrentLanguage = () => currentLanguage;
