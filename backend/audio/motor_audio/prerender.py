import time
import threading

from backend.core.webview_bridge import eel
from backend.core.estado_global import estado_app
from backend.core.utils import normalizar_texto
from backend.documento.gestor_documento_rpc import obtener_solo_texto_pagina_ligera
from backend.ia.traductor import traductor_global
from backend.audio.kokoro_engine import es_voz_kokoro
from backend.audio.pocket_engine import es_voz_pocket
from backend.audio.motor_audio.comun import _obtener_onecore
from backend.audio.motor_audio.sintesis import cocinar_ahora_pro


@eel.expose
def pre_renderizar_bloque_paginas(lista_paginas, voz, velocidad, dict_activo, trad_config=None, layouts_por_pagina=None, auto_layout=False):
    # 🛡️ Si la voz es Pocket o Kokoro (modelos pesados), o si es Edge online,
    # no saturar la CPU/red cocinando páginas enteras en ráfaga
    if not voz or es_voz_pocket(voz) or es_voz_kokoro(voz):
        return False

    # 🛡️ CANCELACIÓN AGRESIVA: Si el usuario cambia de página o selección,
    # matamos el renderizado anterior para no generar lag.
    estado_app.abortar_renderizado = True

    def worker():
        time.sleep(0.1)  # Breve pausa para limpieza de hilos
        estado_app.abortar_renderizado = False

        if not lista_paginas or not estado_app.doc:
            return

        actual = lista_paginas[0]
        # Prioridad 1: Página Actual (Hoja 1)
        # Prioridad 2: Página Siguiente (Hoja 2)
        # Prioridad 3: Página Anterior (Hoja 3)
        orden = [actual]
        if actual + 1 < len(estado_app.doc):
            orden.append(actual + 1)
        if actual - 1 >= 0:
            orden.append(actual - 1)

        print(f"🚀 [NITRO] Priorizando bloque de audio: {orden} con voz: {voz}")

        from concurrent.futures import ThreadPoolExecutor
        es_edge = not voz.startswith("Local-") and not (
            voz.startswith("Microsoft") and any(nombre in voz for nombre in _obtener_onecore()[1])
        )
        max_trabajadores = 5 if es_edge else 2

        # Analizar configuración de traducción para audio pre-renderizado
        trad_activa = trad_config.get("activa", False) if isinstance(trad_config, dict) else False
        trad_modo = trad_config.get("modo", "subtitulos") if trad_activa else "subtitulos"
        trad_orig = trad_config.get("origen", "auto") if trad_activa else "auto"
        trad_dest = trad_config.get("destino", "es") if trad_activa else "es"
        trad_motor = trad_config.get("motor", "online") if trad_activa else "online"

        for num_pag in orden:
            if estado_app.abortar_renderizado:
                return

            layout_pag = None
            if isinstance(layouts_por_pagina, dict):
                layout_pag = layouts_por_pagina.get(str(num_pag)) or layouts_por_pagina.get(num_pag)

            # Extraer oraciones de forma ligera (0% GPU/Imagen) respetando el layout de esa página
            textos = obtener_solo_texto_pagina_ligera(
                num_pag,
                dict_activo,
                layout_pagina=layout_pag,
                auto_layout=bool(auto_layout),
            )
            es_prioridad_max = (num_pag == actual)

            # Construir la lista de textos a hornear según el modo
            textos_a_hornear = []
            for frase in textos:
                if not frase or not frase.strip():
                    continue
                frase_limpia = frase.strip()

                if trad_activa and trad_modo == "solo_traduccion":
                    res = traductor_global.traducir(frase_limpia, trad_orig, trad_dest, trad_motor)
                    txt_trad = res.get("traducido") or frase_limpia
                    textos_a_hornear.append(txt_trad)
                elif trad_activa and trad_modo == "aprendizaje":
                    textos_a_hornear.append(frase_limpia)
                    res = traductor_global.traducir(frase_limpia, trad_orig, trad_dest, trad_motor)
                    txt_trad = res.get("traducido")
                    if txt_trad and txt_trad != frase_limpia:
                        textos_a_hornear.append(txt_trad)
                else:
                    textos_a_hornear.append(frase_limpia)

            def hornear_frase(frase):
                if estado_app.abortar_renderizado or not frase or not frase.strip():
                    return
                vel_key = round(float(velocidad or 1.0), 2)
                t_id = f"{normalizar_texto(frase)}|{voz}|{vel_key}"
                epoch_local = estado_app.pasteleria_epoch
                if t_id not in estado_app.pasteleria_dict and t_id not in estado_app.textos_en_proceso:
                    try:
                        estado_app.textos_en_proceso.add(t_id)
                        res = cocinar_ahora_pro(frase, voz, velocidad, es_prioridad_max)
                        if not estado_app.abortar_renderizado and epoch_local == estado_app.pasteleria_epoch and res and "pcm" in res and len(res["pcm"]) > 0:
                            estado_app.pasteleria_dict[t_id] = res
                    except Exception as e:
                        print(f"⚠️ Error horneando frase: {e}")
                    finally:
                        estado_app.textos_en_proceso.discard(t_id)

            if es_edge:
                with ThreadPoolExecutor(max_workers=max_trabajadores) as pool:
                    futures = [pool.submit(hornear_frase, f) for f in textos_a_hornear]
                    for f in futures:
                        if estado_app.abortar_renderizado:
                            pool.shutdown(wait=False, cancel_futures=True)
                            return
                        try:
                            f.result()
                        except Exception:
                            pass
            else:
                for frase in textos_a_hornear:
                    if estado_app.abortar_renderizado:
                        return
                    hornear_frase(frase)

        print(f"✨ [NITRO] Pre-renderizado de audio completado para páginas {orden}")

    estado_app.hilo_rendimiento_actual = threading.Thread(target=worker, daemon=True)
    estado_app.hilo_rendimiento_actual.start()
