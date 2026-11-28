/* LiraLoud
 * Puente Nativo de Alta Velocidad para pywebview (Reemplazo de eel.js)
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

(function () {
    const _exposedFunctions = {};
    let _puenteListo = false;
    const _colaEspera = [];

    const _wrappedCallbackMaps = new WeakSet();

    function _envolverMapaCallbacks(mapa) {
        if (!mapa || typeof mapa !== 'object' || _wrappedCallbackMaps.has(mapa)) {
            return mapa;
        }
        const proxyMapa = new Proxy(mapa, {
            get(target, prop) {
                if (typeof prop === 'symbol') return Reflect.get(target, prop);
                const val = target[prop];
                if (typeof val === 'function') return val;
                if (val === undefined) {
                    return function () {};
                }
                return val;
            },
            set(target, prop, value) {
                target[prop] = value;
                return true;
            }
        });
        _wrappedCallbackMaps.add(proxyMapa);
        return proxyMapa;
    }

    function _crearProxyReturnValuesRoot(actual) {
        return new Proxy(actual, {
            get(target, fnName) {
                if (typeof fnName === 'symbol') return Reflect.get(target, fnName);
                const entry = target[fnName];
                if (entry && typeof entry === 'object') return _envolverMapaCallbacks(entry);
                if (entry === undefined) return _envolverMapaCallbacks({});
                return entry;
            },
            set(target, fnName, val) {
                target[fnName] = (val && typeof val === 'object') ? _envolverMapaCallbacks(val) : val;
                return true;
            }
        });
    }

    function _protegerReturnValuesCallbacks() {
        if (!window.pywebview || typeof window.pywebview !== 'object') return;
        const actual = window.pywebview._returnValuesCallbacks;
        if (!actual || typeof actual !== 'object' || _wrappedCallbackMaps.has(actual)) return;

        for (const k of Object.keys(actual)) {
            if (actual[k] && typeof actual[k] === 'object') {
                actual[k] = _envolverMapaCallbacks(actual[k]);
            }
        }

        const proxyRoot = _crearProxyReturnValuesRoot(actual);
        _wrappedCallbackMaps.add(proxyRoot);
        window.pywebview._returnValuesCallbacks = proxyRoot;
    }

    // Detectar si pywebview ya inyectó su API o esperar al evento 'pywebviewready'
    function verificarDisponibilidadApi() {
        _protegerReturnValuesCallbacks();
        if (window.pywebview && window.pywebview.api && Object.keys(window.pywebview.api).length > 0) {
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
    } else {
        window.addEventListener('pywebviewready', () => {
            _protegerReturnValuesCallbacks();
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

