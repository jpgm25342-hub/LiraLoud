# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import os
import re
import json
import datetime
import webview
from backend.core.webview_bridge import eel, puente_webview
from backend.core.logger_config import logger

DIR_BASE_DEFAULT = os.path.join(os.getcwd(), "lira_notas")

def asegurar_directorio(ruta):
    """Crea el directorio si no existe."""
    if not os.path.exists(ruta):
        os.makedirs(ruta, exist_ok=True)

def limpiar_nombre_carpeta(nombre):
    """Sanea un nombre para ser usado como carpeta o archivo."""
    if not nombre or not isinstance(nombre, str):
        return "General"
    # Eliminar caracteres inválidos en Windows
    limpio = re.sub(r'[\\/*?:"<>|]', "", nombre).strip()
    return limpio if limpio else "General"

def parsear_archivo_md(ruta_completa, ruta_base):
    """Lee un archivo Markdown y extrae sus metadatos del Frontmatter YAML y su contenido."""
    try:
        with open(ruta_completa, 'r', encoding='utf-8', errors='replace') as f:
            contenido_raw = f.read()

        metadatos = {
            "id": os.path.splitext(os.path.basename(ruta_completa))[0],
            "titulo": os.path.splitext(os.path.basename(ruta_completa))[0],
            "libro": "Sin libro",
            "pagina": 1,
            "clasificacion": "General",
            "fecha_creacion": datetime.datetime.fromtimestamp(os.path.getctime(ruta_completa)).strftime('%Y-%m-%d %H:%M:%S'),
            "fecha_modificacion": datetime.datetime.fromtimestamp(os.path.getmtime(ruta_completa)).strftime('%Y-%m-%d %H:%M:%S'),
            "ruta_relativa": os.path.relpath(ruta_completa, ruta_base).replace("\\", "/"),
            "ruta_absoluta": ruta_completa
        }

        # Comprobar si tiene Frontmatter YAML (--- ... ---)
        cuerpo = contenido_raw
        if contenido_raw.startswith("---"):
            partes = contenido_raw.split("---", 2)
            if len(partes) >= 3:
                yaml_raw = partes[1]
                cuerpo = partes[2].strip()
                for linea in yaml_raw.splitlines():
                    if ":" in linea:
                        k, v = linea.split(":", 1)
                        k = k.strip().lower()
                        v = v.strip().strip('"').strip("'")
                        if k == "pagina":
                            try:
                                metadatos["pagina"] = int(v)
                            except:
                                metadatos["pagina"] = 1
                        elif k in metadatos:
                            metadatos[k] = v

        # Inferir libro y etiqueta/clasificación desde la estructura de carpetas si no vienen en frontmatter
        rel_dir = os.path.dirname(os.path.relpath(ruta_completa, ruta_base))
        partes_dir = [p for p in rel_dir.replace("\\", "/").split("/") if p and p != "."]
        if len(partes_dir) >= 2:
            if metadatos["libro"] == "Sin libro" or not metadatos["libro"]:
                metadatos["libro"] = partes_dir[0]
            if metadatos["clasificacion"] == "General" or not metadatos["clasificacion"]:
                metadatos["clasificacion"] = partes_dir[1]
        elif len(partes_dir) == 1:
            if metadatos["libro"] == "Sin libro" or not metadatos["libro"]:
                metadatos["libro"] = partes_dir[0]

        metadatos["contenido"] = cuerpo
        return metadatos
    except Exception as e:
        logger.error(f"[Notas] Error al parsear nota '{ruta_completa}': {e}")
        return None

def limpiar_carpetas_vacias(ruta_directorio, ruta_base):
    """Elimina recursivamente carpetas vacías hacia arriba hasta la ruta base."""
    try:
        actual = os.path.abspath(ruta_directorio)
        base = os.path.abspath(ruta_base)
        while actual != base and actual.startswith(base):
            if os.path.exists(actual) and not os.listdir(actual):
                os.rmdir(actual)
                actual = os.path.dirname(actual)
            else:
                break
    except Exception as e:
        logger.debug(f"[Notas] Limpieza de carpetas vacías: {e}")

@eel.expose
def notas_obtener_ruta_base(config_ruta=""):
    """Retorna la ruta base configurada para guardar las notas o la ruta por defecto."""
    if config_ruta and os.path.isdir(config_ruta):
        return os.path.abspath(config_ruta)
    asegurar_directorio(DIR_BASE_DEFAULT)
    return os.path.abspath(DIR_BASE_DEFAULT)

@eel.expose
def notas_listar(config_ruta="", filtro_libro=None, filtro_pagina=None, filtro_clasificacion=None, busqueda=""):
    """
    Lista todas las notas guardadas en Markdown aplicando filtros opcionales.
    """
    try:
        ruta_base = notas_obtener_ruta_base(config_ruta)
        asegurar_directorio(ruta_base)
        
        lista_notas = []
        for raiz, _, archivos in os.walk(ruta_base):
            for archivo in archivos:
                if archivo.lower().endswith(".md"):
                    ruta_completa = os.path.join(raiz, archivo)
                    nota = parsear_archivo_md(ruta_completa, ruta_base)
                    if not nota:
                        continue
                    
                    # Aplicar filtro por libro
                    if filtro_libro and filtro_libro != "TODOS":
                        if nota.get("libro", "").lower().strip() != filtro_libro.lower().strip():
                            continue
                    
                    # Aplicar filtro por página
                    if filtro_pagina is not None and filtro_pagina != 0 and filtro_pagina != "TODAS":
                        try:
                            if int(nota.get("pagina", 1)) != int(filtro_pagina):
                                continue
                        except:
                            pass
                    
                    # Aplicar filtro por clasificación
                    if filtro_clasificacion and filtro_clasificacion != "TODAS":
                        if nota.get("clasificacion", "").lower().strip() != filtro_clasificacion.lower().strip():
                            continue
                    
                    # Aplicar filtro por texto de búsqueda
                    if busqueda and busqueda.strip():
                        q = busqueda.lower().strip()
                        en_titulo = q in nota.get("titulo", "").lower()
                        en_contenido = q in nota.get("contenido", "").lower()
                        en_clasif = q in nota.get("clasificacion", "").lower()
                        if not (en_titulo or en_contenido or en_clasif):
                            continue
                    
                    lista_notas.append(nota)
        
        # Ordenar por fecha de modificación descendente
        lista_notas.sort(key=lambda x: x.get("fecha_modificacion", ""), reverse=True)
        return {"exito": True, "notas": lista_notas, "ruta_base": ruta_base}
    except Exception as e:
        logger.error(f"[Notas] Error al listar notas: {e}", exc_info=True)
        return {"exito": False, "error": str(e), "notas": []}

@eel.expose
def notas_guardar(nota_data, config_ruta=""):
    """
    Crea o actualiza una nota en formato Markdown con la jerarquía:
    # 1. Carpeta principal base (Vault / lira_notas)
    ## 2. Carpeta con el nombre del libro
    ### 3. Carpeta con el nombre de la etiqueta / clasificación
    #### 4. Archivo: {titulo}.md
    """
    try:
        ruta_base = notas_obtener_ruta_base(config_ruta)
        asegurar_directorio(ruta_base)
        
        libro_nombre = limpiar_nombre_carpeta(nota_data.get("libro") or "General")
        clasificacion = limpiar_nombre_carpeta(nota_data.get("clasificacion") or "General")
        
        # Jerarquía: {ruta_base}/{libro_nombre}/{clasificacion}
        carpeta_destino = os.path.join(ruta_base, libro_nombre, clasificacion)
        asegurar_directorio(carpeta_destino)
        
        titulo = (nota_data.get("titulo") or "Nota sin título").strip()
        nombre_archivo = limpiar_nombre_carpeta(titulo) + ".md"
        
        # Si la nota ya tenía una ruta previa y cambió de título o categoría, eliminar la anterior
        ruta_anterior = nota_data.get("ruta_absoluta")
        ruta_nueva = os.path.join(carpeta_destino, nombre_archivo)
        
        if ruta_anterior and os.path.exists(ruta_anterior) and os.path.abspath(ruta_anterior) != os.path.abspath(ruta_nueva):
            try:
                os.remove(ruta_anterior)
                limpiar_carpetas_vacias(os.path.dirname(ruta_anterior), ruta_base)
            except Exception as e_del:
                logger.warning(f"[Notas] No se pudo eliminar archivo anterior '{ruta_anterior}': {e_del}")

        ahora = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        fecha_creacion = nota_data.get("fecha_creacion") or ahora
        pagina = nota_data.get("pagina") or 1
        try:
            pagina = int(pagina)
        except:
            pagina = 1

        contenido_md = nota_data.get("contenido") or ""

        # Construir contenido con Frontmatter YAML estructurado compatible con Obsidian
        frontmatter = (
            f"---\n"
            f"id: \"{limpiar_nombre_carpeta(titulo)}\"\n"
            f"titulo: \"{titulo}\"\n"
            f"libro: \"{nota_data.get('libro') or 'General'}\"\n"
            f"pagina: {pagina}\n"
            f"clasificacion: \"{nota_data.get('clasificacion') or 'General'}\"\n"
            f"fecha_creacion: \"{fecha_creacion}\"\n"
            f"fecha_modificacion: \"{ahora}\"\n"
            f"---\n\n"
            f"{contenido_md}\n"
        )

        with open(ruta_nueva, 'w', encoding='utf-8') as f:
            f.write(frontmatter)

        logger.info(f"📝 [Notas] Nota guardada con éxito en: {ruta_nueva}")
        return {
            "exito": True,
            "ruta_absoluta": ruta_nueva,
            "ruta_relativa": os.path.relpath(ruta_nueva, ruta_base).replace("\\", "/"),
            "fecha_modificacion": ahora
        }
    except Exception as e:
        logger.error(f"[Notas] Error al guardar nota: {e}", exc_info=True)
        return {"exito": False, "error": str(e)}

@eel.expose
def notas_eliminar(ruta_archivo, config_ruta=""):
    """Elimina una nota por su ruta absoluta o relativa y limpia carpetas vacías."""
    try:
        ruta_base = notas_obtener_ruta_base(config_ruta)
        ruta_completa = ruta_archivo if os.path.isabs(ruta_archivo) else os.path.join(ruta_base, ruta_archivo)
        
        if os.path.exists(ruta_completa):
            os.remove(ruta_completa)
            logger.info(f"🗑️ [Notas] Nota eliminada: {ruta_completa}")
            
            # Limpiar carpetas vacías (etiqueta y libro) si quedaron vacías
            limpiar_carpetas_vacias(os.path.dirname(ruta_completa), ruta_base)
                
            return {"exito": True}
        return {"exito": False, "error": "El archivo de la nota no existe"}
    except Exception as e:
        logger.error(f"[Notas] Error al eliminar nota: {e}", exc_info=True)
        return {"exito": False, "error": str(e)}

@eel.expose
def notas_obtener_clasificaciones_y_libros(config_ruta=""):
    """Retorna la lista de libros y categorías existentes para poblar los filtros."""
    try:
        ruta_base = notas_obtener_ruta_base(config_ruta)
        asegurar_directorio(ruta_base)
        
        libros = set()
        clasificaciones = set()
        
        for raiz, _, archivos in os.walk(ruta_base):
            for archivo in archivos:
                if archivo.lower().endswith(".md"):
                    nota = parsear_archivo_md(os.path.join(raiz, archivo), ruta_base)
                    if nota:
                        if nota.get("libro"): libros.add(nota["libro"])
                        if nota.get("clasificacion"): clasificaciones.add(nota["clasificacion"])
        
        return {
            "exito": True,
            "libros": sorted(list(libros)),
            "clasificaciones": sorted(list(clasificaciones))
        }
    except Exception as e:
        logger.error(f"[Notas] Error al obtener libros y clasificaciones: {e}")
        return {"exito": False, "libros": [], "clasificaciones": []}

@eel.expose
def notas_seleccionar_carpeta_dialogo(config_actual=""):
    """Abre el diálogo nativo mediante pywebview para que el usuario seleccione una carpeta de notas."""
    try:
        inicial = config_actual if config_actual and os.path.isdir(config_actual) else DIR_BASE_DEFAULT
        asegurar_directorio(inicial)
        
        carpeta_seleccionada = None
        if puente_webview.ventana:
            carpeta_seleccionada = puente_webview.ventana.create_file_dialog(
                webview.FileDialog.FOLDER,
                directory=inicial
            )
            
        if isinstance(carpeta_seleccionada, (tuple, list)):
            carpeta_seleccionada = carpeta_seleccionada[0] if carpeta_seleccionada else None
        
        if carpeta_seleccionada:
            carpeta_norm = os.path.abspath(carpeta_seleccionada)
            asegurar_directorio(carpeta_norm)
            return {"exito": True, "ruta": carpeta_norm}
        return {"exito": False, "cancelado": True}
    except Exception as e:
        logger.error(f"[Notas] Error en diálogo de selección de carpeta: {e}")
        return {"exito": False, "error": str(e)}

@eel.expose
def notas_abrir_carpeta_explorador(config_ruta=""):
    """Abre la carpeta de notas en el explorador de Windows."""
    try:
        ruta_base = notas_obtener_ruta_base(config_ruta)
        asegurar_directorio(ruta_base)
        os.startfile(ruta_base)
        return {"exito": True}
    except Exception as e:
        logger.error(f"[Notas] Error al abrir carpeta en explorador: {e}")
        return {"exito": False, "error": str(e)}

@eel.expose
def notas_procesar_con_ia(texto_nota, instruccion, accion="mejorar"):
    """
    Procesa directamente el texto de una nota con IA (redacción, ortografía, ampliación, petición personalizada)
    y devuelve el texto procesado para aplicarlo directamente sobre la nota en el editor.
    """
    try:
        from backend.ia.rag_module import rag_global
        import asyncio

        system_prompt = (
            "Eres un asistente de redacción y edición para el cuaderno de apuntes del usuario en LiraLoud.\n"
            "Tu único objetivo es trabajar de forma aislada y estricta sobre el texto de la nota provista.\n\n"
            "REGLAS FUNDAMENTALES:\n"
            "1. Trabaja EXCLUSIVAMENTE sobre el texto provisto en la nota. No agregues contenido de otros documentos ni inventes referencias ajenas.\n"
            "2. Ejecuta la instrucción solicitada (mejorar redacción, corregir ortografía, estructurar o profundizar sobre los conceptos contenidos en la nota).\n"
            "3. Devuelve DIRECTAMENTE el texto procesado en formato Markdown limpio (con negritas, viñetas o títulos si corresponde).\n"
            "4. Prohibido añadir introducciones ('Aquí tienes:', 'He corregido:'), saludos o despedidas."
        )

        user_prompt = (
            f"TEXTO DEL APUNTE DEL USUARIO:\n\"\"\"\n{texto_nota}\n\"\"\"\n\n"
            f"INSTRUCCIÓN / SOLICITUD:\n{instruccion}\n\n"
            f"TEXTO RESULTANTE PARA LA NOTA:"
        )

        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            res_texto = ex.submit(lambda: asyncio.run(
                rag_global._generar_respuesta_llm_async(
                    system_prompt=system_prompt,
                    mensajes_previos=[],
                    user_prompt=user_prompt,
                    temperatura=0.25
                )
            )).result()

        return {"exito": True, "resultado": res_texto.strip()}
    except Exception as e:
        logger.error(f"[Notas IA] Error procesando nota con IA: {e}")
        return {"exito": False, "error": str(e)}

