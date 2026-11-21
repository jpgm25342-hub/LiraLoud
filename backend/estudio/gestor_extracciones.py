# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import os
import json
import base64
import uuid
import datetime
from backend.core.webview_bridge import eel
from backend.core.logger_config import logger

DIR_BASE_CAPTURAS = os.path.join(os.getcwd(), "lira_capturas")
ARCHIVO_INDICE_CAPTURAS = os.path.join(DIR_BASE_CAPTURAS, "extracciones.json")

def asegurar_carpeta_capturas():
    if not os.path.exists(DIR_BASE_CAPTURAS):
        os.makedirs(DIR_BASE_CAPTURAS, exist_ok=True)

def cargar_indice():
    asegurar_carpeta_capturas()
    if not os.path.exists(ARCHIVO_INDICE_CAPTURAS):
        return []
    try:
        with open(ARCHIVO_INDICE_CAPTURAS, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error al leer índice de capturas: {e}")
        return []

def guardar_indice(datos):
    asegurar_carpeta_capturas()
    try:
        with open(ARCHIVO_INDICE_CAPTURAS, "w", encoding="utf-8") as f:
            json.dump(datos, f, indent=4, ensure_ascii=False)
        return True
    except Exception as e:
        logger.error(f"Error al guardar índice de capturas: {e}")
        return False

@eel.expose
def guardar_captura_extraccion(ruta_pdf, pagina_idx, titulo, imagen_base64):
    """
    Guarda una imagen recortada (DataURL base64) en disco y registra los metadatos en extracciones.json.
    """
    try:
        asegurar_carpeta_capturas()
        
        # Procesar dataURL
        if "," in imagen_base64:
            header, encoded = imagen_base64.split(",", 1)
        else:
            encoded = imagen_base64
            
        img_bytes = base64.b64decode(encoded)
        
        id_captura = f"cap_{int(datetime.datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}"
        nombre_archivo = f"{id_captura}.png"
        ruta_archivo = os.path.join(DIR_BASE_CAPTURAS, nombre_archivo)
        
        with open(ruta_archivo, "wb") as f:
            f.write(img_bytes)
            
        nombre_libro = os.path.basename(ruta_pdf) if ruta_pdf else "Documento"
        titulo_final = titulo.strip() if (titulo and titulo.strip()) else f"Captura Pág. {pagina_idx + 1}"
        fecha_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        registro = {
            "id": id_captura,
            "ruta_pdf": os.path.abspath(ruta_pdf) if ruta_pdf else "",
            "libro_nombre": nombre_libro,
            "pagina": pagina_idx,
            "titulo": titulo_final,
            "archivo": nombre_archivo,
            "fecha": fecha_str
        }
        
        indice = cargar_indice()
        indice.append(registro)
        guardar_indice(indice)
        
        registro_completo = dict(registro)
        registro_completo["data_url"] = imagen_base64
        
        logger.info(f"📸 [GESTOR EXTRACCIÓN] Captura guardada: '{titulo_final}' en pág {pagina_idx + 1}")
        return {"success": True, "captura": registro_completo}
    except Exception as e:
        logger.error(f"❌ Error al guardar captura de extracción: {e}")
        return {"success": False, "error": str(e)}

@eel.expose
def obtener_capturas_libro(ruta_pdf=None):
    """
    Retorna todas las capturas registradas, opcionalmente filtradas por libro.
    Lee los bytes de las imágenes y los envía como DataURL base64 para que el frontend
    pueda renderizarlas directamente.
    """
    try:
        indice = cargar_indice()
        ruta_norm = os.path.abspath(ruta_pdf) if ruta_pdf else None
        
        resultado = []
        for item in indice:
            item_ruta = os.path.abspath(item.get("ruta_pdf", "")) if item.get("ruta_pdf") else ""
            if not ruta_norm or item_ruta == ruta_norm or not item_ruta:
                path_img = os.path.join(DIR_BASE_CAPTURAS, item.get("archivo", ""))
                data_url = ""
                if os.path.exists(path_img):
                    try:
                        with open(path_img, "rb") as img_f:
                            b64 = base64.b64encode(img_f.read()).decode("utf-8")
                            data_url = f"data:image/png;base64,{b64}"
                    except Exception as err:
                        logger.warning(f"No se pudo leer imagen {path_img}: {err}")
                
                elem = dict(item)
                elem["data_url"] = data_url
                resultado.append(elem)
                
        return {"success": True, "capturas": resultado}
    except Exception as e:
        logger.error(f"Error al obtener capturas: {e}")
        return {"success": False, "error": str(e), "capturas": []}

@eel.expose
def eliminar_captura_extraccion(id_captura):
    """
    Elimina la captura del índice y borra el archivo de imagen de disco.
    """
    try:
        indice = cargar_indice()
        nuevo_indice = []
        encontrado = None
        for item in indice:
            if item.get("id") == id_captura:
                encontrado = item
            else:
                nuevo_indice.append(item)
                
        if encontrado:
            path_img = os.path.join(DIR_BASE_CAPTURAS, encontrado.get("archivo", ""))
            if os.path.exists(path_img):
                try:
                    os.remove(path_img)
                except Exception as err:
                    logger.warning(f"No se pudo eliminar archivo físico {path_img}: {err}")
            guardar_indice(nuevo_indice)
            logger.info(f"🗑️ Captura eliminada: {id_captura}")
            return {"success": True}
        else:
            return {"success": False, "error": "Captura no encontrada"}
    except Exception as e:
        logger.error(f"Error al eliminar captura: {e}")
        return {"success": False, "error": str(e)}
