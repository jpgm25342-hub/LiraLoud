import time
import threading
from concurrent.futures import ThreadPoolExecutor

from backend.core.webview_bridge import eel
from backend.core.estado_global import estado_app
from backend.ia.traductor import traductor_global, IDIOMAS_SOPORTADOS
from backend.documento.gestor_documento_rpc import obtener_solo_texto_pagina_ligera


# ==========================================
# BÚSQUEDA AVANZADA Y TRADUCCIÓN
# ==========================================
@eel.expose
def buscar_texto_avanzado(query):
    from backend.documento.buscador_pdf import buscar_texto_en_doc
    return buscar_texto_en_doc(estado_app.doc, query)


@eel.expose
def pretraducir_bloque_paginas(
    num_pagina_central,
    origen="auto",
    destino="es",
    motor="online",
    incluir_adyacentes=True,
):
    """Pre-traduce en segundo plano las oraciones de la página actual y adyacentes."""
    if not estado_app.doc:
        return

    estado_app.abortar_pretraduccion = True

    def worker_traduccion():
        time.sleep(0.08)
        estado_app.abortar_pretraduccion = False

        doc = estado_app.doc
        if not doc:
            return
        total = len(doc)
        if num_pagina_central < 0 or num_pagina_central >= total:
            return

        orden = [num_pagina_central]
        if incluir_adyacentes:
            if num_pagina_central + 1 < total:
                orden.append(num_pagina_central + 1)
            if num_pagina_central - 1 >= 0:
                orden.append(num_pagina_central - 1)

        print(
            f"🌐 [PRE-TRADUCCIÓN NITRO] Procesando bloque en orden: {orden} ({origen} ➔ {destino}, motor: {motor})"
        )

        for p_num in orden:
            if estado_app.abortar_pretraduccion:
                print("🛑 [PRE-TRADUCCIÓN] Cancelada por cambio de página.")
                return

            frases = obtener_solo_texto_pagina_ligera(p_num, None)
            frases_a_traducir = []

            for frase in frases:
                if not frase or not isinstance(frase, str) or not frase.strip():
                    continue
                txt_limpio = frase.strip()
                key = traductor_global._generar_key(txt_limpio, origen, destino)
                cached_val = traductor_global.cache.get(key)
                if not cached_val or not traductor_global._es_traduccion_valida(
                    txt_limpio, cached_val, origen, destino
                ):
                    frases_a_traducir.append(txt_limpio)

            if frases_a_traducir:

                def _traducir_tarea(txt):
                    if estado_app.abortar_pretraduccion:
                        return
                    try:
                        traductor_global.traducir(txt, origen, destino, motor)
                    except Exception as err:
                        print(f"⚠️ [PRE-TRADUCCIÓN] Error en frase: {err}")

                with ThreadPoolExecutor(max_workers=4) as pool:
                    futures = [pool.submit(_traducir_tarea, t) for t in frases_a_traducir]
                    for f in futures:
                        if estado_app.abortar_pretraduccion:
                            pool.shutdown(wait=False, cancel_futures=True)
                            return
                        try:
                            f.result()
                        except Exception:
                            pass

            traductor_global._guardar_cache()
            print(f"✨ [PRE-TRADUCCIÓN] Hoja {p_num} traducida y lista.")

        print(f"✅ [PRE-TRADUCCIÓN] Bloque completo de páginas {orden} 100% listo.")

    estado_app.hilo_pretraduccion_actual = threading.Thread(
        target=worker_traduccion, daemon=True
    )
    estado_app.hilo_pretraduccion_actual.start()


@eel.expose
def traducir_texto_backend(texto, origen="auto", destino="es", motor="hibrido"):
    print(f"🌐 [TRADUCTOR ENTRADA] ({origen} -> {destino} | {motor}): '{texto[:60]}...'")
    res = traductor_global.traducir(texto, origen, destino, motor)
    print(
        f"🌐 [TRADUCTOR SALIDA] ({res.get('motor_usado', motor)}): '{res.get('traducido', '')[:60]}...'"
    )
    return {
        "texto_traducido": res.get("traducido", texto),
        "traducido": res.get("traducido", texto),
        "origen_detectado": res.get("origen", origen),
        "destino": res.get("destino", destino),
        "motor_usado": res.get("motor_usado", motor),
        "exito": res.get("exito", False),
    }


@eel.expose
def obtener_catalogo_idiomas_traduccion():
    return IDIOMAS_SOPORTADOS


@eel.expose
def limpiar_cache_traducciones():
    """Limpia la memoria RAM y el archivo de disco de la caché de traducciones."""
    return traductor_global.limpiar_cache()
