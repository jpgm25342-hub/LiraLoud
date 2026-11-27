# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

"""
=============================================================================
LIRALOUD - MOTOR DE CONVERSIÓN Y LECTURA DE DOCUMENTOS WORD (.DOCX / .DOC)
=============================================================================
Convierte documentos Word a formato PDF maquetado para permitir la lectura
sincronizada, segmentación de oraciones y karaoke visual en LiraLoud.

Estrategia Híbrida:
1. Nativo MS Word (docx2pdf / win32com) si Microsoft Word está disponible.
2. Generador Portable de Alto Rendimiento (python-docx + PyMuPDF) si Word no está disponible.
3. Caché basada en hash para aperturas instantáneas de documentos ya convertidos.
=============================================================================
"""

import os
import sys
import hashlib
import logging
import zipfile
import xml.etree.ElementTree as ET
from typing import Optional, List, Dict, Any

from backend.core.estado_global import estado_app

logger = logging.getLogger("LiraWordEngine")

# Directorio de caché temporal para PDFs convertidos
BASE_PROYECTO = estado_app.base_dir
DIR_TEMP_CONVERTED = os.path.join(BASE_PROYECTO, "temp_converted")
os.makedirs(DIR_TEMP_CONVERTED, exist_ok=True)


def _obtener_hash_archivo(ruta_archivo: str) -> str:
    """Calcula un identificador único basado en ruta, tamaño y fecha de modificación."""
    try:
        st = os.stat(ruta_archivo)
        info = f"{ruta_archivo}_{st.st_size}_{st.st_mtime}"
        return hashlib.md5(info.encode("utf-8")).hexdigest()[:16]
    except Exception:
        return hashlib.md5(ruta_archivo.encode("utf-8")).hexdigest()[:16]


def _clasificar_parrafo_docx(parrafo) -> Optional[Dict[str, Any]]:
    """Convierte un párrafo de python-docx en un elemento tipado o None si está vacío."""
    texto = parrafo.text.strip()
    if not texto:
        return None
    style_name = parrafo.style.name.lower() if parrafo.style else ""
    if "heading" in style_name or "título" in style_name or "titulo" in style_name:
        return {"texto": texto, "tipo": "titulo"}
    if "list" in style_name or "bullet" in style_name:
        return {"texto": f"• {texto}", "tipo": "item"}
    return {"texto": texto, "tipo": "parrafo"}


def _extraer_parrafos_con_python_docx(ruta_docx: str) -> List[Dict[str, Any]]:
    """Extrae párrafos y tablas de un .docx usando python-docx si está disponible."""
    elementos: List[Dict[str, Any]] = []
    try:
        import docx
        doc = docx.Document(ruta_docx)
        for p in doc.paragraphs:
            elem = _clasificar_parrafo_docx(p)
            if elem:
                elementos.append(elem)

        for table in doc.tables:
            for row in table.rows:
                celdas = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if celdas:
                    elementos.append({"texto": " | ".join(celdas), "tipo": "parrafo"})
    except Exception as e:
        logger.debug(f"[WordEngine] python-docx no disponible o fallo menor ({e}), usando parser XML nativo.")
    return elementos


def _extraer_parrafos_docx_nativo(ruta_docx: str) -> List[Dict[str, Any]]:
    """
    Extrae párrafos estructurados de un .docx utilizando python-docx o fallback a zipfile XML.
    Devuelve lista de objetos: [{'texto': '...', 'tipo': 'titulo'|'parrafo'|'item'}]
    """
    # 1. Intentar con python-docx si está instalado
    elementos = _extraer_parrafos_con_python_docx(ruta_docx)
    if elementos:
        return elementos

    # 2. Fallback portable 100% puro estándar Python: descomprimir word/document.xml
    try:
        with zipfile.ZipFile(ruta_docx, 'r') as z:
            if 'word/document.xml' in z.namelist():
                xml_data = z.read('word/document.xml')
                root = ET.fromstring(xml_data)
                
                # Namespaces de OpenXML
                ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                for p in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
                    textos = []
                    for t in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
                        if t.text:
                            textos.append(t.text)
                    linea = "".join(textos).strip()
                    if linea:
                        elementos.append({"texto": linea, "tipo": "parrafo"})
    except Exception as e:
        logger.error(f"❌ [WordEngine] Error parseando XML de docx: {e}")

    return elementos


def _generar_pdf_desde_parrafos(elementos: List[Dict[str, Any]], ruta_pdf_salida: str, titulo_doc: str = "") -> str:
    """
    Maqueta y crea un archivo PDF con formato limpio utilizando PyMuPDF (fitz).
    Crea páginas tamaño A4 con márgenes adecuados, títulos destacados y paginación.
    """
    import fitz

    doc_pdf = fitz.open()
    ancho_pag = 595.0  # A4 width en puntos (72 dpi)
    alto_pag = 842.0   # A4 height en puntos
    margen_x = 54.0    # 0.75 pulgadas
    margen_y = 54.0
    ancho_util = ancho_pag - (2 * margen_x)
    alto_util = alto_pag - (2 * margen_y)

    rect_util = fitz.Rect(margen_x, margen_y, ancho_pag - margen_x, alto_pag - margen_y)

    if not elementos:
        # Documento vacío
        pag = doc_pdf.new_page(width=ancho_pag, height=alto_pag)
        pag.insert_text(fitz.Point(margen_x, margen_y + 40), f"(Documento vacío o sin texto extraíble: {titulo_doc})", fontsize=11)
        doc_pdf.save(ruta_pdf_salida)
        doc_pdf.close()
        return ruta_pdf_salida

    # Construir páginas maquetadas
    pagina_actual = doc_pdf.new_page(width=ancho_pag, height=alto_pag)
    cursor_y = margen_y + 20

    # Insertar Título Principal si existe
    if titulo_doc:
        pagina_actual.insert_text(
            fitz.Point(margen_x, cursor_y),
            titulo_doc,
            fontsize=16,
            fontname="helv",
            color=(0.15, 0.2, 0.35)
        )
        cursor_y += 30

    for elem in elementos:
        texto = elem["texto"]
        tipo = elem.get("tipo", "parrafo")

        if tipo == "titulo":
            font_size = 14
            line_height = 18
            color = (0.1, 0.15, 0.3)
            cursor_y += 10
        else:
            font_size = 10.5
            line_height = 15
            color = (0.12, 0.12, 0.12)

        # Medir e insertar líneas ajustadas al ancho_util
        palabras = texto.split()
        lineas_parrafo = []
        linea_temp = []

        for w in palabras:
            linea_temp.append(w)
            ancho_linea = fitz.get_text_length(" ".join(linea_temp), fontname="helv", fontsize=font_size)
            if ancho_linea > ancho_util:
                if len(linea_temp) > 1:
                    linea_temp.pop()
                    lineas_parrafo.append(" ".join(linea_temp))
                    linea_temp = [w]
                else:
                    lineas_parrafo.append(" ".join(linea_temp))
                    linea_temp = []

        if linea_temp:
            lineas_parrafo.append(" ".join(linea_temp))

        for linea in lineas_parrafo:
            if cursor_y + line_height > alto_pag - margen_y:
                # Salto de página
                pagina_actual = doc_pdf.new_page(width=ancho_pag, height=alto_pag)
                cursor_y = margen_y + 20

            pagina_actual.insert_text(
                fitz.Point(margen_x, cursor_y),
                linea,
                fontsize=font_size,
                fontname="helv",
                color=color
            )
            cursor_y += line_height

        cursor_y += 8  # Espacio entre párrafos

    doc_pdf.save(ruta_pdf_salida)
    doc_pdf.close()
    return ruta_pdf_salida


def _intentar_convertir_word_a_pdf(ruta_archivo_word: str, ruta_pdf_salida: str, ext: str, nombre_base: str) -> bool:
    """Ejecuta las estrategias de conversión Word -> PDF (MS Word COM y generador portable PyMuPDF)."""
    # ESTRATEGIA 1: Conversión nativa mediante Microsoft Word (docx2pdf / COM) si está en Windows
    if sys.platform == "win32":
        try:
            import docx2pdf
            docx2pdf.convert(ruta_archivo_word, ruta_pdf_salida)
            if os.path.exists(ruta_pdf_salida) and os.path.getsize(ruta_pdf_salida) > 0:
                logger.info(f"✅ [WordEngine] Conversión nativa exitosa vía MS Word: {ruta_pdf_salida}")
                return True
        except Exception as e:
            logger.debug(f"[WordEngine] Conversión con MS Word COM no disponible ({e}). Pasando a generador portable.")

    # ESTRATEGIA 2: Generador Portable de Alto Rendimiento
    if ext == ".docx":
        elementos = _extraer_parrafos_docx_nativo(ruta_archivo_word)
        _generar_pdf_desde_parrafos(elementos, ruta_pdf_salida, titulo_doc=nombre_base)
        if os.path.exists(ruta_pdf_salida) and os.path.getsize(ruta_pdf_salida) > 0:
            logger.info(f"✅ [WordEngine] Generación portable exitosa con PyMuPDF: {ruta_pdf_salida}")
            return True

    return False


def convertir_word_a_pdf(ruta_archivo_word: str) -> str:
    """
    Punto de entrada principal. Convierte un documento .docx o .doc a un archivo .pdf.
    Aplica caché inteligente: si ya fue convertido, devuelve el PDF en <1ms.
    """
    if not os.path.exists(ruta_archivo_word):
        raise FileNotFoundError(f"No se encontró el archivo: {ruta_archivo_word}")

    ext = os.path.splitext(ruta_archivo_word)[1].lower()
    if ext not in [".docx", ".doc"]:
        raise ValueError(f"Formato no soportado por WordEngine: {ext}")

    hash_doc = _obtener_hash_archivo(ruta_archivo_word)
    nombre_base = os.path.splitext(os.path.basename(ruta_archivo_word))[0]
    # Sanitizar nombre de archivo para evitar caracteres inválidos
    nombre_limpio = "".join(c for c in nombre_base if c.isalnum() or c in (' ', '_', '-')).strip()
    ruta_pdf_salida = os.path.join(DIR_TEMP_CONVERTED, f"{nombre_limpio}_{hash_doc}.pdf")

    # Si ya existe en caché, reutilizar instantáneamente
    if os.path.exists(ruta_pdf_salida) and os.path.getsize(ruta_pdf_salida) > 0:
        logger.info(f"⚡ [WordEngine] PDF en caché encontrado: {ruta_pdf_salida}")
        return ruta_pdf_salida

    logger.info(f"🔄 [WordEngine] Convirtiendo '{os.path.basename(ruta_archivo_word)}' a PDF...")

    if _intentar_convertir_word_a_pdf(ruta_archivo_word, ruta_pdf_salida, ext, nombre_base):
        return ruta_pdf_salida

    raise RuntimeError(f"No fue posible convertir el documento Word '{ruta_archivo_word}' a PDF.")


EXTENSIONES_EBOOK = {".epub", ".fb2", ".mobi", ".xps", ".cbz"}
EXTENSIONES_IMAGEN = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".gif"}


def convertir_ebook_a_pdf(ruta_ebook: str) -> str:
    """
    Convierte un libro electrónico (.epub, .fb2, .mobi, .xps, .cbz) a un PDF real en caché
    usando el motor nativo de MuPDF (`convert_to_pdf`), habilitando subrayados, notas y RAG.
    """
    import pymupdf as fitz

    if not os.path.exists(ruta_ebook):
        raise FileNotFoundError(f"No se encontró el archivo: {ruta_ebook}")

    hash_doc = _obtener_hash_archivo(ruta_ebook)
    nombre_base = os.path.splitext(os.path.basename(ruta_ebook))[0]
    nombre_limpio = "".join(c for c in nombre_base if c.isalnum() or c in (" ", "_", "-")).strip() or "ebook"
    ruta_pdf_salida = os.path.join(DIR_TEMP_CONVERTED, f"{nombre_limpio}_{hash_doc}.pdf")

    if os.path.exists(ruta_pdf_salida) and os.path.getsize(ruta_pdf_salida) > 0:
        logger.info(f"⚡ [EbookEngine] PDF en caché encontrado: {ruta_pdf_salida}")
        return ruta_pdf_salida

    logger.info(f"📚 [EbookEngine] Convirtiendo '{os.path.basename(ruta_ebook)}' a PDF...")
    src_doc = fitz.open(ruta_ebook)
    try:
        pdf_bytes = src_doc.convert_to_pdf()
        pdf_doc = fitz.open("pdf", pdf_bytes)
        pdf_doc.save(ruta_pdf_salida, garbage=1, deflate=True)
        pdf_doc.close()
    finally:
        src_doc.close()

    return ruta_pdf_salida


def convertir_imagen_a_pdf(ruta_imagen: str) -> str:
    """
    Envuelve una imagen (.jpg, .jpeg, .png, .webp, .bmp, .tif, .tiff, .gif) en un documento
    PDF de 1 página en caché para que LiraLoud pueda visualizarla, aplicar RapidOCR,
    subrayar y leer su contenido en voz alta.
    """
    import pymupdf as fitz

    if not os.path.exists(ruta_imagen):
        raise FileNotFoundError(f"No se encontró la imagen: {ruta_imagen}")

    hash_img = _obtener_hash_archivo(ruta_imagen)
    nombre_base = os.path.splitext(os.path.basename(ruta_imagen))[0]
    nombre_limpio = "".join(c for c in nombre_base if c.isalnum() or c in (" ", "_", "-")).strip() or "imagen"
    ruta_pdf_salida = os.path.join(DIR_TEMP_CONVERTED, f"{nombre_limpio}_{hash_img}.pdf")

    if os.path.exists(ruta_pdf_salida) and os.path.getsize(ruta_pdf_salida) > 0:
        logger.info(f"⚡ [ImageEngine] PDF de imagen en caché encontrado: {ruta_pdf_salida}")
        return ruta_pdf_salida

    logger.info(f"🖼️ [ImageEngine] Convirtiendo imagen '{os.path.basename(ruta_imagen)}' a PDF...")
    img_doc = fitz.open(ruta_imagen)
    try:
        rect_orig = img_doc[0].rect
        w, h = float(rect_orig.width), float(rect_orig.height)
        # Escalar proporcionalmente a un ancho de lectura cómodo (~595pt A4) si la imagen es muy grande o muy pequeña
        if w > 0 and h > 0:
            escala = 595.0 / w if (w > 900.0 or w < 400.0) else 1.0
            ancho_pag = max(300.0, w * escala)
            alto_pag = max(300.0, h * escala)
        else:
            ancho_pag, alto_pag = 595.0, 842.0

        pdf_doc = fitz.open()
        pagina = pdf_doc.new_page(width=ancho_pag, height=alto_pag)
        pagina.insert_image(fitz.Rect(0, 0, ancho_pag, alto_pag), filename=ruta_imagen)
        pdf_doc.save(ruta_pdf_salida, garbage=1, deflate=True)
        pdf_doc.close()
    finally:
        img_doc.close()

    return ruta_pdf_salida


def preparar_documento_como_pdf(ruta: str) -> str:
    """
    Normaliza cualquier formato soportado (.pdf, .docx, .doc, .epub, .fb2, .cbz,
    .jpg, .jpeg, .png, .webp, .bmp, .tif, .tiff) a una ruta PDF lista para fitz.open().
    """
    ext = os.path.splitext(ruta)[1].lower()
    if ext in [".docx", ".doc"]:
        print(f"📄 [PY] Convirtiendo documento Word: {os.path.basename(ruta)}")
        return convertir_word_a_pdf(ruta)
    if ext in EXTENSIONES_EBOOK:
        print(f"📚 [PY] Convirtiendo libro {ext.upper()}: {os.path.basename(ruta)}")
        return convertir_ebook_a_pdf(ruta)
    if ext in EXTENSIONES_IMAGEN:
        print(f"🖼️ [PY] Preparando imagen {ext.upper()} para lectura/OCR: {os.path.basename(ruta)}")
        return convertir_imagen_a_pdf(ruta)
    return ruta
