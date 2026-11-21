window.liraAlert = function (msg, emoji = 'ℹ️') {
    return new Promise(resolve => {
        const overlay = document.getElementById('lira-dialog-overlay');
        if (!overlay) { alert(msg); resolve(); return; }

        const msgHtml = String(msg || '').replace(/\n/g, '<br>');
        const txtAceptar = (typeof window.t === 'function') ? window.t('btn-aceptar', 'Aceptar') : 'Aceptar';
        overlay.innerHTML = `
            <div class="lira-dialog-box">
                <div class="lira-dialog-emoji">${emoji}</div>
                <div class="lira-dialog-msg" id="lira-dialog-msg">${msgHtml}</div>
                <div class="lira-dialog-btns">
                    <button class="lira-dialog-btn lira-dialog-btn-ok" id="lira-dlg-ok">${txtAceptar}</button>
                </div>
            </div>`;

        overlay.classList.add('activo');

        const btnOk = overlay.querySelector('#lira-dlg-ok');
        if (btnOk) setTimeout(() => btnOk.focus(), 30);

        const close = () => {
            document.removeEventListener('keydown', onKey);
            overlay.classList.remove('activo');
            resolve();
        };

        const onKey = (e) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
                e.preventDefault();
                close();
            }
        };

        btnOk.addEventListener('click', close, { once: true });
        document.addEventListener('keydown', onKey);
    });
};

/**
 * Muestra un modal de confirmación personalizado (reemplaza confirm()).
 * @param {string} msg - Mensaje a mostrar.
 * @param {string} [emoji='❓'] - Emoji o icono decorativo.
 * @returns {Promise<boolean>} true si el usuario pulsó "Sí", false si canceló.
 */
window.liraConfirm = function (msg, emoji = '❓') {
    return new Promise(resolve => {
        const overlay = document.getElementById('lira-dialog-overlay');
        if (!overlay) { resolve(confirm(msg)); return; }

        const msgHtml = String(msg || '').replace(/\n/g, '<br>');
        const txtCancelar = (typeof window.t === 'function') ? window.t('btn-cancelar', 'Cancelar') : 'Cancelar';
        const txtContinuar = (typeof window.t === 'function') ? window.t('btn-si-continuar', 'Sí, continuar') : 'Sí, continuar';
        overlay.innerHTML = `
            <div class="lira-dialog-box">
                <div class="lira-dialog-emoji">${emoji}</div>
                <div class="lira-dialog-msg" id="lira-dialog-msg">${msgHtml}</div>
                <div class="lira-dialog-btns">
                    <button class="lira-dialog-btn lira-dialog-btn-cancel" id="lira-dlg-cancel">${txtCancelar}</button>
                    <button class="lira-dialog-btn lira-dialog-btn-ok" id="lira-dlg-ok">${txtContinuar}</button>
                </div>
            </div>`;

        overlay.classList.add('activo');

        const btnOk = overlay.querySelector('#lira-dlg-ok');
        const btnCancel = overlay.querySelector('#lira-dlg-cancel');
        if (btnOk) setTimeout(() => btnOk.focus(), 30);

        const close = (result) => {
            document.removeEventListener('keydown', onKey);
            overlay.classList.remove('activo');
            resolve(result);
        };

        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                close(false);
            }
        };

        btnOk.addEventListener('click', () => close(true), { once: true });
        btnCancel.addEventListener('click', () => close(false), { once: true });
        document.addEventListener('keydown', onKey);
    });
};

/**
 * Muestra un modal de entrada de texto personalizado (reemplaza prompt()).
 * @param {string} msg - Mensaje a mostrar.
 * @param {string} [valorPorDefecto=''] - Valor inicial en el campo de texto.
 * @param {string} [emoji='✍️'] - Emoji o icono decorativo.
 * @returns {Promise<string|null>} Texto ingresado o null si canceló.
 */
window.liraPrompt = function (msg, valorPorDefecto = '', emoji = '✍️') {
    return new Promise(resolve => {
        const overlay = document.getElementById('lira-dialog-overlay');
        if (!overlay) { resolve(prompt(msg, valorPorDefecto)); return; }

        const msgHtml = String(msg || '').replace(/\n/g, '<br>');
        const valEscapado = String(valorPorDefecto ?? '').replace(/"/g, '&quot;');
        const txtCancelar = (typeof window.t === 'function') ? window.t('btn-cancelar', 'Cancelar') : 'Cancelar';
        const txtAceptar = (typeof window.t === 'function') ? window.t('btn-aceptar', 'Aceptar') : 'Aceptar';

        overlay.innerHTML = `
            <div class="lira-dialog-box">
                <div class="lira-dialog-emoji">${emoji}</div>
                <div class="lira-dialog-msg" id="lira-dialog-msg">${msgHtml}</div>
                <div style="margin-top: 6px; width: 100%;">
                    <input type="text" class="lira-dialog-input" id="lira-dlg-input" value="${valEscapado}">
                </div>
                <div class="lira-dialog-btns">
                    <button class="lira-dialog-btn lira-dialog-btn-cancel" id="lira-dlg-cancel">${txtCancelar}</button>
                    <button class="lira-dialog-btn lira-dialog-btn-ok" id="lira-dlg-ok">${txtAceptar}</button>
                </div>
            </div>`;

        overlay.classList.add('activo');

        const input = overlay.querySelector('#lira-dlg-input');
        const btnOk = overlay.querySelector('#lira-dlg-ok');
        const btnCancel = overlay.querySelector('#lira-dlg-cancel');

        if (input) {
            setTimeout(() => {
                input.focus();
                input.select();
            }, 40);
        }

        const close = (result) => {
            document.removeEventListener('keydown', onKey);
            overlay.classList.remove('activo');
            resolve(result);
        };

        const onKey = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                close(input ? input.value : '');
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close(null);
            }
        };

        btnOk.addEventListener('click', () => close(input ? input.value : ''), { once: true });
        btnCancel.addEventListener('click', () => close(null), { once: true });
        document.addEventListener('keydown', onKey);
    });
};
