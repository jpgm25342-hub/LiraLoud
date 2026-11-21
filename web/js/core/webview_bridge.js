/* LiraLoud
 * Puente Nativo de Alta Velocidad para pywebview (Reemplazo de eel.js)
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

(function () {
    const _exposedFunctions = {};
    let _puenteListo = false;
    const _colaEspera = [];

    // Detectar si pywebview ya inyectó su API o esperar al evento 'pywebviewready'
    function verificarDisponibilidadApi() {
        if (window.pywebview && window.pywebview.api) {
            _puenteListo = true;
            while (_colaEspera.length > 0) {
                const resolver = _colaEspera.shift();
                resolver(window.pywebview.api);
            }
            return true;
        }
        return false;
    }

    if (!verificarDisponibilidadApi()) {
        window.addEventListener('pywebviewready', () => {
            console.log("🚀 [PYWEBVIEW BRIDGE] Canal nativo C++/WebView2 enlazado (<1ms).");
            verificarDisponibilidadApi();
        });
    }

    function obtenerApiAsync() {
        if (verificarDisponibilidadApi()) {
            return Promise.resolve(window.pywebview.api);
        }
        return new Promise((resolve) => {
            _colaEspera.push(resolve);
        });
    }

    // Objeto base con propiedades de compatibilidad heredadas
    const baseEel = {
        _exposed_functions: _exposedFunctions,
        _websocket: { readyState: 1 }, // WebSocket.OPEN simulado para código legado
        expose: function (fn, name) {
            if (typeof fn === 'function') {
                const fnName = name || fn.name;
                if (fnName) {
                    _exposedFunctions[fnName] = fn;
                    window[fnName] = fn;
                }
            }
        },
        set_host: function () {}
    };

    // Proxy inteligente: intercepta cualquier llamada eel.mi_funcion(arg1, arg2) con o sin ()()
    window.eel = new Proxy(baseEel, {
        get: function (target, prop) {
            if (prop in target) {
                return target[prop];
            }
            if (typeof prop !== 'string' || prop.startsWith('_')) {
                return undefined;
            }

            // Invocador unificado:
            // Soporta:
            // 1. eel.funcion(arg1, arg2)          -> Se dispara automáticamente sin esperar ()()
            // 2. eel.funcion(arg1, arg2)()        -> Sintaxis de doble llamada heredada de Eel
            // 3. eel.funcion(arg1, arg2)(callback) -> Con callback
            // 4. await eel.funcion(arg1, arg2)()   -> Esperando la promesa
            return function (...args) {
                let resolverPromesa;
                let rechazarPromesa;
                const promesa = new Promise((resolve, reject) => {
                    resolverPromesa = resolve;
                    rechazarPromesa = reject;
                });

                let callbackRegistrado = null;
                let fueInvocadoSegundoNivel = false;

                function ejecutarLlamadaPython() {
                    obtenerApiAsync().then((api) => {
                        if (typeof api[prop] !== 'function') {
                            console.warn(`⚠️ [PYWEBVIEW BRIDGE] La función '${prop}' no existe en el backend Python.`);
                            resolverPromesa(undefined);
                            if (typeof callbackRegistrado === 'function') callbackRegistrado(undefined);
                            return;
                        }
                        return Promise.resolve(api[prop](...args)).then((resultado) => {
                            resolverPromesa(resultado);
                            if (typeof callbackRegistrado === 'function') {
                                callbackRegistrado(resultado);
                            }
                        });
                    }).catch((err) => {
                        console.error(`🔥 [PYWEBVIEW BRIDGE] Error ejecutando '${prop}':`, err);
                        rechazarPromesa(err);
                    });
                }

                // Invocador retornado
                function invocadorSegundoNivel(callback) {
                    fueInvocadoSegundoNivel = true;
                    if (typeof callback === 'function') {
                        callbackRegistrado = callback;
                    }
                    return promesa;
                }

                // Hacemos que el invocador también sea Thenable (Promise-like) por si alguien hace `await eel.fn(args)` directo
                invocadorSegundoNivel.then = function (onFulfilled, onRejected) {
                    return promesa.then(onFulfilled, onRejected);
                };
                invocadorSegundoNivel.catch = function (onRejected) {
                    return promesa.catch(onRejected);
                };
                invocadorSegundoNivel.finally = function (onFinally) {
                    return promesa.finally(onFinally);
                };

                // Si en el microtask actual no se llamó ()(), disparamos automáticamente
                queueMicrotask(() => {
                    ejecutarLlamadaPython();
                });

                return invocadorSegundoNivel;
            };
        }
    });
})();

