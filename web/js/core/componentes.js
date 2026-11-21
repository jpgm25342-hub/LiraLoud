/**
 * Cargador síncrono de fragmentos HTML para mantener index.html y modales modulares.
 * Soporta componentes anidados (ej. tabs dentro de configuracion-avanzada.html).
 */
(function cargarComponentesHTML() {
    let iter = 0;
    while (iter < 5) {
        const placeholders = document.querySelectorAll('[data-componente]');
        if (!placeholders.length) break;
        let cargoAlguno = false;
        placeholders.forEach(el => {
            const ruta = el.getAttribute('data-componente');
            if (!ruta) return;
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', ruta, false);
                xhr.send(null);
                if (xhr.status >= 200 && xhr.status < 300) {
                    el.outerHTML = xhr.responseText;
                    cargoAlguno = true;
                }
            } catch (e) {
                console.error(`Error cargando componente ${ruta}:`, e);
            }
        });
        if (!cargoAlguno) break;
        iter++;
    }
    if (typeof applyTranslations === 'function') {
        try { applyTranslations(); } catch (e) {}
    }
})();
