import fitz
import os
import stat
import json

def asegurar_permiso_escritura(ruta_archivo):
    """Garantiza que el archivo PDF no tenga el flag de solo lectura en el sistema de archivos."""
    if ruta_archivo and os.path.exists(ruta_archivo):
        try:
            modo_actual = os.stat(ruta_archivo).st_mode
            if not (modo_actual & stat.S_IWRITE):
                os.chmod(ruta_archivo, modo_actual | stat.S_IWRITE)
        except Exception as e:
            print(f"⚠️ No se pudo cambiar permisos de archivo {ruta_archivo}: {e}")

def hex_to_rgb(hex_color):
    """Convierte un color '#RRGGBB' a una tupla de floats (R, G, B) en rango 0.0 - 1.0"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) / 255.0 for i in (0, 2, 4))

import json

def agregar_subrayados_lote(pdf_path, pagina_idx, coordenadas_list, color_hex, id_anotacion=None, texto_extraido=None, doc_obj=None):
    """
    Agrega resaltados a múltiples coordenadas en una sola operación de guardado.
    coordenadas_list: [{"x0": float, "y0": float, "x1": float, "y1": float}, ...]
    """
    asegurar_permiso_escritura(pdf_path)
    if not doc_obj and not os.path.exists(pdf_path):
        return {"success": False, "error": "Documento no encontrado."}
        
    try:
        doc = doc_obj if doc_obj else fitz.open(pdf_path)
        # El frontend (LiraLoud) maneja paginaActual de forma 0-based
        page = doc[pagina_idx] 
        
        rgb_color = hex_to_rgb(color_hex)
        
        # Procesar todas las coordenadas como un solo bloque de quads
        if coordenadas_list:
            quads = [fitz.Rect(coord['x0'], coord['y0'], coord['x1'], coord['y1']).quad for coord in coordenadas_list]
            annot = page.add_highlight_annot(quads)
            annot.set_colors(stroke=rgb_color)
            if id_anotacion or texto_extraido:
                info_dict = {"id": id_anotacion or "", "text": texto_extraido or ""}
                annot.set_info(content=json.dumps(info_dict))
            annot.update()
            
        try:
            doc.saveIncr()
        except Exception as err:
            if "incremental writes" in str(err) or "repaired" in str(err):
                return {"success": False, "error": "NEEDS_FULL_SAVE"}
            raise err
        if not doc_obj:
            doc.close()
        return {"success": True}
    except Exception as e:
        print(f"Error al agregar subrayados: {e}")
        return {"success": False, "error": str(e)}

def eliminar_subrayados_area(pdf_path, pagina_idx, x0, y0, x1, y1, doc_obj=None):
    """
    Elimina cualquier anotación de tipo Highlight que colisione con el rectángulo dado.
    """
    asegurar_permiso_escritura(pdf_path)
    if not doc_obj and not os.path.exists(pdf_path):
        return {"success": False, "error": "Documento no encontrado."}
        
    try:
        doc = doc_obj if doc_obj else fitz.open(pdf_path)
        page = doc[pagina_idx]
        
        target_rect = fitz.Rect(x0, y0, x1, y1)
        annot = page.first_annot
        borrados = 0
        ids_borrados = []
        
        while annot:
            # 8 es el tipo Highlight en PyMuPDF
            if annot.type[0] == 8:
                if annot.rect.intersects(target_rect):
                    content_raw = annot.info.get("content", "")
                    content_id = ""
                    if content_raw:
                        try:
                            data = json.loads(content_raw)
                            content_id = data.get("id", content_raw)
                        except json.JSONDecodeError:
                            content_id = content_raw
                            
                    if content_id:
                        ids_borrados.append(content_id)
                        
                    next_annot = annot.next
                    page.delete_annot(annot)
                    annot = next_annot
                    borrados += 1
                    continue
            annot = annot.next
            
        if borrados > 0:
            try:
                doc.saveIncr()
            except Exception as err:
                if "incremental writes" in str(err) or "repaired" in str(err):
                    return {"success": False, "error": "NEEDS_FULL_SAVE"}
                raise err
        if not doc_obj:
            doc.close()
        
        return {"success": True, "borrados": borrados, "ids_borrados": ids_borrados}
    except Exception as e:
        print(f"Error al borrar subrayados: {e}")
        return {"success": False, "error": str(e)}

def eliminar_subrayado_punto(pdf_path, pagina_idx, x, y, doc_obj=None):
    """
    Elimina la primera anotación de tipo Highlight que contenga el punto (x, y).
    """
    asegurar_permiso_escritura(pdf_path)
    if not doc_obj and not os.path.exists(pdf_path):
        return {"success": False, "error": "Documento no encontrado."}
        
    try:
        doc = doc_obj if doc_obj else fitz.open(pdf_path)
        page = doc[pagina_idx]
        punto = fitz.Point(x, y)
        
        annot = page.first_annot
        id_borrado = None
        
        while annot:
            if annot.type[0] == 8: # Highlight
                if annot.rect.contains(punto):
                    content_raw = annot.info.get("content", "")
                    if content_raw:
                        try:
                            data = json.loads(content_raw)
                            id_borrado = data.get("id", content_raw)
                        except json.JSONDecodeError:
                            id_borrado = content_raw
                            
                    page.delete_annot(annot)
                    break # Solo borrar uno
            annot = annot.next
            
        if id_borrado is not None:
            try:
                doc.saveIncr()
            except Exception as err:
                if "incremental writes" in str(err) or "repaired" in str(err):
                    return {"success": False, "error": "NEEDS_FULL_SAVE", "id_borrado": id_borrado}
                raise err
                
        if not doc_obj:
            doc.close()
            
        return {"success": True, "id_borrado": id_borrado}
    except Exception as e:
        print(f"Error al borrar subrayado por punto: {e}")
        return {"success": False, "error": str(e)}

def obtener_todos_subrayados(pdf_path, doc_obj=None):
    if not doc_obj and not os.path.exists(pdf_path):
        return {"success": False, "error": "Documento no encontrado."}
    
    try:
        doc = doc_obj if doc_obj else fitz.open(pdf_path)
        subrayados = []
        
        for pagina_idx in range(len(doc)):
            page = doc[pagina_idx]
            annot = page.first_annot
            while annot:
                if annot.type[0] == 8: # Highlight
                    content_raw = annot.info.get("content", "")
                    content_id = f"id_{len(subrayados)}_{pagina_idx}"
                    texto = ""
                    
                    if content_raw:
                        try:
                            data = json.loads(content_raw)
                            content_id = data.get("id", content_id)
                            texto = data.get("text", "")
                        except json.JSONDecodeError:
                            content_id = content_raw
                            
                    # Si no hay texto guardado (antiguo formato o hecho en otro programa), usar OCR/extracción
                    if not texto:
                        texto = page.get_textbox(annot.rect).replace("\n", " ").strip()
                        if not texto:
                            texto = "[Subrayado sin texto detectado]"
                        
                    color = annot.colors.get("stroke")
                    color_hex = "#00ff00"
                    if color and len(color) == 3:
                        r, g, b = int(color[0]*255), int(color[1]*255), int(color[2]*255)
                        color_hex = f"#{r:02x}{g:02x}{b:02x}"
                    
                    subrayados.append({
                        "texto": texto,
                        "color": color_hex,
                        "id": content_id,
                        "pagina": pagina_idx
                    })
                annot = annot.next
                
        if not doc_obj:
            doc.close()
            
        return {"success": True, "subrayados": subrayados}
    except Exception as e:
        print(f"Error obteniendo subrayados: {e}")
        return {"success": False, "error": str(e)}

def obtener_todos_subrayados_biblioteca(rutas_pdfs=None):
    """
    Obtiene todos los subrayados de todos los libros registrados en la biblioteca o de la lista de rutas dada.
    """
    try:
        if not rutas_pdfs:
            from backend.core.gestor_archivos import validar_json, ARCHIVO_BIBLIOTECA
            bib = validar_json(ARCHIVO_BIBLIOTECA)
            rutas_pdfs = list(bib.keys()) if isinstance(bib, dict) else []

        todos = []
        for r in rutas_pdfs:
            if r and os.path.exists(r) and r.lower().endswith('.pdf'):
                nombre_libro = os.path.basename(r)
                res = obtener_todos_subrayados(r)
                if res.get("success") and res.get("subrayados"):
                    for s in res["subrayados"]:
                        s_copy = dict(s)
                        s_copy["libro"] = nombre_libro
                        todos.append(s_copy)
        return {"success": True, "subrayados": todos}
    except Exception as e:
        print(f"Error obteniendo subrayados de la biblioteca: {e}")
        return {"success": False, "error": str(e), "subrayados": []}

# =====================================================================
# EDITOR DE TEXTO IN-PLACE (Estilo Acrobat Reader)
# =====================================================================

# ─── Fuentes base-14 del PDF (fallback final) ────────────────────────────
FUENTES_ESTANDAR = {
    ("serif", False, False): "tiro",
    ("serif", True,  False): "tibo",
    ("serif", False, True):  "tiit",
    ("serif", True,  True):  "tibi",
    ("mono",  False, False): "cour",
    ("mono",  True,  False): "cobo",
    ("mono",  False, True):  "coit",
    ("mono",  True,  True):  "cobi",
    ("sans",  False, False): "helv",
    ("sans",  True,  False): "hebo",
    ("sans",  False, True):  "heit",
    ("sans",  True,  True):  "hebi",
}

# ─── Fuentes TTF del sistema Windows (primer intento de sustitución) ──────
_FW = "C:/Windows/Fonts/"
FUENTES_SISTEMA = {
    ("serif", False, False): [_FW + "georgia.ttf", _FW + "BOOKOS.TTF", _FW + "times.ttf"],
    ("serif", True,  False): [_FW + "georgiab.ttf", _FW + "BOOKOSB.TTF", _FW + "timesbd.ttf"],
    ("serif", False, True):  [_FW + "georgiai.ttf", _FW + "BOOKOSI.TTF", _FW + "timesi.ttf"],
    ("serif", True,  True):  [_FW + "georgiaz.ttf", _FW + "BOOKOSBI.TTF", _FW + "timesbi.ttf"],
    ("sans",  False, False): [_FW + "calibri.ttf", _FW + "arial.ttf"],
    ("sans",  True,  False): [_FW + "calibrib.ttf", _FW + "arialbd.ttf"],
    ("sans",  False, True):  [_FW + "calibrii.ttf", _FW + "ariali.ttf"],
    ("sans",  True,  True):  [_FW + "calibriz.ttf", _FW + "arialbi.ttf"],
    ("mono",  False, False): [_FW + "cour.ttf"],
    ("mono",  True,  False): [_FW + "courbd.ttf"],
    ("mono",  False, True):  [_FW + "couri.ttf"],
    ("mono",  True,  True):  [_FW + "courbi.ttf"],
}

_CACHE_FUENTES_SISTEMA = {}

def cargar_fuente_sistema(familia, negrita, cursiva):
    clave = (familia, negrita, cursiva)
    if clave in _CACHE_FUENTES_SISTEMA:
        return _CACHE_FUENTES_SISTEMA[clave]

    for ruta in FUENTES_SISTEMA.get(clave, []):
        if os.path.exists(ruta):
            try:
                font_obj = fitz.Font(fontfile=ruta)
                _CACHE_FUENTES_SISTEMA[clave] = font_obj
                return font_obj
            except Exception:
                continue

    _CACHE_FUENTES_SISTEMA[clave] = None
    return None

FLAG_ITALICO = 1 << 1
FLAG_SERIF   = 1 << 2
FLAG_MONO    = 1 << 3
FLAG_NEGRITA = 1 << 4

def clasificar_familia(nombre_fuente, flags):
    nombre = (nombre_fuente or "").lower()
    if flags & FLAG_MONO or "courier" in nombre or "consolas" in nombre or "mono" in nombre:
        return "mono"
    if flags & FLAG_SERIF or "times" in nombre or "georgia" in nombre or "cambria" in nombre or "garamond" in nombre or "roman" in nombre:
        return "serif"
    return "sans"

def detectar_negrita_cursiva(nombre_fuente, flags):
    nombre = (nombre_fuente or "").lower()
    negrita = bool(flags & FLAG_NEGRITA) or any(k in nombre for k in ("bold", "black", "heavy", "semibold", "negrita"))
    cursiva = bool(flags & FLAG_ITALICO) or any(k in nombre for k in ("italic", "oblique", "ital", "cursiva"))
    return negrita, cursiva

def _bboxes_similares(a, b, tolerancia=1.5):
    return all(abs(a[i] - b[i]) <= tolerancia for i in range(4))

def obtener_lineas_vectoriales(page):
    lineas = []
    try:
        for d in page.get_drawings():
            r = d.get("rect")
            if r is None:
                continue
            alto = r.y1 - r.y0
            ancho = r.x1 - r.x0
            if alto <= 2.5 or ancho <= 2.5:
                lineas.append((r.x0, r.y0, r.x1, r.y1))
    except Exception:
        pass
    return lineas

def limitar_rect_a_vecinos(page, rect_deseado, bbox_original_linea):
    data = page.get_text("dict")
    limite_arriba = 0.0
    limite_abajo = page.rect.height

    candidatos = []
    for b in data.get("blocks", []):
        if b.get("type") != 0:
            continue
        for l in b.get("lines", []):
            x0, y0, x1, y1 = l.get("bbox")
            if bbox_original_linea and _bboxes_similares((x0, y0, x1, y1), bbox_original_linea):
                continue
            candidatos.append((x0, y0, x1, y1))

    candidatos.extend(obtener_lineas_vectoriales(page))

    for x0, y0, x1, y1 in candidatos:
        if x1 < rect_deseado.x0 or x0 > rect_deseado.x1:
            continue
        centro_vecino = (y0 + y1) / 2.0
        centro_deseado = (rect_deseado.y0 + rect_deseado.y1) / 2.0

        if centro_vecino <= centro_deseado:
            limite_arriba = max(limite_arriba, y1)
        else:
            limite_abajo = min(limite_abajo, y0)

    nuevo_y0 = max(rect_deseado.y0, limite_arriba + 1)
    nuevo_y1 = min(rect_deseado.y1, limite_abajo - 1)
    nuevo_y1 = max(nuevo_y1, nuevo_y0 + 4)

    return fitz.Rect(rect_deseado.x0, nuevo_y0, rect_deseado.x1, nuevo_y1)

def obtener_origen_linea_original(page, bbox_original, tolerancia=1.5):
    data = page.get_text("dict")
    for b in data.get("blocks", []):
        if b.get("type") != 0:
            continue
        for l in b.get("lines", []):
            if _bboxes_similares(l.get("bbox"), bbox_original, tolerancia):
                spans = l.get("spans", [])
                if spans:
                    return spans[0].get("origin")
    return None

def resolver_fuente_completa(doc, page, nombre_fuente, flags):
    negrita, cursiva = detectar_negrita_cursiva(nombre_fuente, flags)
    familia = clasificar_familia(nombre_fuente, flags)

    for f in page.get_fonts(full=True):
        xref, ext, tipo, basefont, nombre_ref, encoding = f[:6]
        if basefont == nombre_fuente or nombre_ref == nombre_fuente:
            if ext == "n/a":
                break
            try:
                _, extension, _, buffer_fuente = doc.extract_font(xref)
                if buffer_fuente and extension != "n/a":
                    alias = f"embebida_{xref}"
                    page.insert_font(fontname=alias, fontbuffer=buffer_fuente)
                    fitz.get_text_length("test", fontname=alias, fontsize=12)
                    return ("base14", alias)
            except Exception:
                pass
            break

    font_obj = cargar_fuente_sistema(familia, negrita, cursiva)
    if font_obj is not None:
        return ("sistema", font_obj)

    nombre_base14 = FUENTES_ESTANDAR[(familia, negrita, cursiva)]
    return ("base14", nombre_base14)

def medir_texto(texto, fuente_info, tamano):
    tipo, valor = fuente_info
    if tipo == "sistema":
        return valor.text_length(texto, fontsize=tamano)
    else:
        return fitz.get_text_length(texto, fontname=valor, fontsize=tamano)

def insertar_texto_con_fuente(page, punto, texto, fuente_info, tamano, color):
    tipo, valor = fuente_info
    if tipo == "sistema":
        tw = fitz.TextWriter(page.rect)
        tw.append(punto, texto, font=valor, fontsize=tamano)
        tw.write_text(page, color=color)
    else:
        page.insert_text(
            punto, texto,
            fontname=valor,
            fontsize=tamano,
            color=color,
        )





def obtener_bloques_texto_pagina(pdf_path, pagina_idx, doc_obj=None):
    if not doc_obj and not os.path.exists(pdf_path):
        return {"success": False, "error": "Documento no encontrado."}
    
    try:
        doc = doc_obj if doc_obj else fitz.open(pdf_path)
        page = doc[pagina_idx]
        doc_path = getattr(doc, "name", pdf_path) or pdf_path

        from backend.documento.ocr_engine import esta_en_cache_ocr, obtener_palabras_cache_ocr
        es_pagina_ocr = esta_en_cache_ocr(doc_path, pagina_idx)

        bloques = []

        # Caso 1: La página tiene reconocimiento OCR en caché (es un documento escaneado/imagen)
        # En este caso, SIEMPRE extraemos todos los bloques desde la caché de OCR para que
        # al editar 1 línea, el resto de las líneas sigan visibles con sus cuadros azules.
        if es_pagina_ocr:
            palabras_ocr = obtener_palabras_cache_ocr(doc_path, pagina_idx)
            if palabras_ocr:
                lineas_dict = {}
                for p in palabras_ocr:
                    l_idx = p[6] if len(p) > 6 else p[5]
                    if l_idx not in lineas_dict:
                        lineas_dict[l_idx] = []
                    lineas_dict[l_idx].append(p)

                for l_idx, words in sorted(lineas_dict.items(), key=lambda item: item[0]):
                    if not words:
                        continue
                    words_sorted = sorted(words, key=lambda w: w[0])
                    x0 = min(w[0] for w in words_sorted)
                    y0 = min(w[1] for w in words_sorted)
                    x1 = max(w[2] for w in words_sorted)
                    y1 = max(w[3] for w in words_sorted)
                    texto_linea = " ".join(str(w[4]) for w in words_sorted).strip()

                    if texto_linea:
                        alto_linea = max(8.0, y1 - y0)
                        tamano_est = round(alto_linea * 0.8, 1)
                        bloques.append({
                            "id": f"ocr-line-{l_idx}",
                            "bbox": [x0, y0, x1, y1],
                            "texto": texto_linea,
                            "fuente": "helv",
                            "flags": 0,
                            "tamano": tamano_est,
                            "color": [0, 0, 0],
                            "is_ocr": True,
                        })

        # Caso 2: Documento con texto vectorial nativo
        if not es_pagina_ocr or len(bloques) == 0:
            data_dict = page.get_text("dict")
            contador = 0
            for b in data_dict.get("blocks", []):
                if b.get("type") == 0:
                    for l in b.get("lines", []):
                        texto_linea = ""
                        fuente_base = "helv"
                        tamano_base = 10.0
                        color_base = 0
                        flags_base = 0

                        for span in l.get("spans", []):
                            t = span.get("text", "")
                            if t:
                                texto_linea += t + " "
                                fuente_base = span.get("font", "helv")
                                tamano_base = span.get("size", 10.0)
                                color_base = span.get("color", 0)
                                flags_base = span.get("flags", 0)

                        texto_limpio = texto_linea.strip()
                        if texto_limpio:
                            x0, y0, x1, y1 = l.get("bbox")
                            color_pdf = fitz.sRGB_to_pdf(color_base)

                            bloques.append({
                                "id": f"line-{contador}",
                                "bbox": [x0, y0, x1, y1],
                                "texto": texto_limpio,
                                "fuente": fuente_base,
                                "flags": flags_base,
                                "tamano": tamano_base,
                                "color": color_pdf,
                                "is_ocr": False,
                            })
                            contador += 1

            # Si no tenía caché ni texto nativo (página imagen nueva), procesar OCR bajo demanda
            if len(bloques) == 0:
                pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
                from backend.documento.ocr_engine import procesar_ocr_pagina
                palabras_ocr = procesar_ocr_pagina(
                    pixmap_bytes=pix.tobytes("png"),
                    ancho_pdf=page.rect.width,
                    alto_pdf=page.rect.height,
                    ancho_px=pix.width,
                    alto_px=pix.height,
                    doc_path=doc_path,
                    num_pagina=pagina_idx,
                    forzar=False
                )

                if palabras_ocr:
                    lineas_dict = {}
                    for p in palabras_ocr:
                        l_idx = p[6] if len(p) > 6 else p[5]
                        if l_idx not in lineas_dict:
                            lineas_dict[l_idx] = []
                        lineas_dict[l_idx].append(p)

                    for l_idx, words in sorted(lineas_dict.items(), key=lambda item: item[0]):
                        if not words:
                            continue
                        words_sorted = sorted(words, key=lambda w: w[0])
                        x0 = min(w[0] for w in words_sorted)
                        y0 = min(w[1] for w in words_sorted)
                        x1 = max(w[2] for w in words_sorted)
                        y1 = max(w[3] for w in words_sorted)
                        texto_linea = " ".join(str(w[4]) for w in words_sorted).strip()

                        if texto_linea:
                            alto_linea = max(8.0, y1 - y0)
                            tamano_est = round(alto_linea * 0.8, 1)
                            bloques.append({
                                "id": f"ocr-line-{l_idx}",
                                "bbox": [x0, y0, x1, y1],
                                "texto": texto_linea,
                                "fuente": "helv",
                                "flags": 0,
                                "tamano": tamano_est,
                                "color": [0, 0, 0],
                                "is_ocr": True,
                            })

        if not doc_obj:
            doc.close()
        return {"success": True, "bloques": bloques}
    except Exception as e:
        print(f"Error obteniendo bloques de texto: {e}")
        return {"success": False, "error": str(e)}

def editar_texto_pdf(pdf_path, pagina_idx, datos, doc_obj=None):
    asegurar_permiso_escritura(pdf_path)
    if not doc_obj and not os.path.exists(pdf_path):
        return {"success": False, "error": "Documento no encontrado."}
    
    try:
        doc = doc_obj if doc_obj else fitz.open(pdf_path)
        page = doc[pagina_idx]
        
        raw_bbox = datos['bbox']
        bbox_original = datos.get('bbox_original', raw_bbox)
        nuevo_texto = datos['texto']
        fuente_original = datos['fuente']
        flags_original = datos.get('flags', 0)
        tamano = float(datos['tamano'])
        color = datos['color']
        
        rect_original = fitz.Rect(bbox_original)
        rect_deseado = fitz.Rect(raw_bbox)
        
        # 1. Cubrir el texto original
        # Para texto vectorial:
        page.add_redact_annot(rect_original, fill=(1, 1, 1))
        page.apply_redactions(
            images=fitz.PDF_REDACT_IMAGE_NONE,
            graphics=fitz.PDF_REDACT_LINE_ART_NONE,
        )
        # Para imágenes / páginas escaneadas con OCR:
        # Dibujar un rectángulo blanco que tape los píxeles originales de la imagen
        page.draw_rect(rect_original, color=(1, 1, 1), fill=(1, 1, 1))
        
        origen_original = obtener_origen_linea_original(page, tuple(bbox_original))
        x_inicio = origen_original[0] if origen_original else bbox_original[0]
        ancho_disponible = page.rect.width - x_inicio - 4

        if nuevo_texto.strip():
            fuente_info = resolver_fuente_completa(doc, page, fuente_original, flags_original)
            es_una_linea = "\n" not in nuevo_texto.strip()
            insertado = False

            if origen_original and es_una_linea:
                tamano_actual = tamano
                while tamano_actual > 4:
                    ancho_necesario = medir_texto(nuevo_texto, fuente_info, tamano_actual)
                    if ancho_necesario <= ancho_disponible:
                        break
                    tamano_actual -= 0.5
                try:
                    insertar_texto_con_fuente(
                        page,
                        fitz.Point(origen_original[0], origen_original[1]),
                        nuevo_texto,
                        fuente_info,
                        tamano_actual,
                        color,
                    )
                    insertado = True
                except Exception:
                    insertado = False

            if not insertado:
                rect_textbox = fitz.Rect(
                    rect_original.x0,
                    rect_original.y0,
                    max(rect_original.x1, page.rect.width - 4),
                    max(rect_original.y1, rect_original.y0 + tamano * 1.5, rect_deseado.y1),
                )
                tipo, valor = fuente_info
                if tipo == "sistema":
                    negrita, cursiva = detectar_negrita_cursiva(fuente_original, flags_original)
                    familia = clasificar_familia(fuente_original, flags_original)
                    fuente_textbox = FUENTES_ESTANDAR[(familia, negrita, cursiva)]
                else:
                    fuente_textbox = valor

                tamano_actual = tamano
                while tamano_actual > 4:
                    sobra = page.insert_textbox(
                        rect_textbox,
                        nuevo_texto,
                        fontname=fuente_textbox,
                        fontsize=tamano_actual,
                        color=color,
                        align=fitz.TEXT_ALIGN_LEFT,
                    )
                    if sobra >= 0:
                        break
                    tamano_actual -= 0.5
                else:
                    page.insert_textbox(
                        rect_textbox, nuevo_texto, fontname=fuente_textbox,
                        fontsize=tamano_actual, color=color, align=fitz.TEXT_ALIGN_LEFT,
                    )
                    
        # Actualizar la caché OCR para que el lector de voz, karaoke y editor mantengan sincronía
        try:
            doc_path = getattr(doc, "name", pdf_path) or pdf_path
            from backend.documento.ocr_engine import actualizar_linea_cache_ocr
            actualizar_linea_cache_ocr(doc_path, pagina_idx, datos.get('id', ''), bbox_original, nuevo_texto, raw_bbox)
        except Exception as ocr_err:
            print(f"Nota: No se actualizó caché OCR tras edición: {ocr_err}")

        try:
            doc.saveIncr()
        except Exception as err:
            if "incremental writes" in str(err) or "repaired" in str(err):
                return {"success": False, "error": "NEEDS_FULL_SAVE"}
            raise err
            
        if not doc_obj:
            doc.close()
            
        return {"success": True}
    except Exception as e:
        print(f"Error editando texto: {e}")
        return {"success": False, "error": str(e)}


def agregar_anotacion_freetext(pdf_path, pagina_idx, bbox, texto, config_fuente, doc_obj=None):
    """
    Crea una anotación FreeText (Cuadro de texto flotante interactivo) en la posición especificada.
    bbox: [x0, y0, x1, y1] en puntos PDF
    config_fuente: dict con fuente, tamano, color, negrita, cursiva
    """
    asegurar_permiso_escritura(pdf_path)
    if not doc_obj and not os.path.exists(pdf_path):
        return {"success": False, "error": "Documento no encontrado."}
    
    try:
        doc = doc_obj if doc_obj else fitz.open(pdf_path)
        page = doc[pagina_idx]
        
        rect = fitz.Rect(bbox)
        
        # Mapear familia y estilos a las fuentes base-14 (requerido para FreeText estándar)
        familia_raw = config_fuente.get("fuente", "helv").lower()
        negrita = config_fuente.get("negrita", False)
        cursiva = config_fuente.get("cursiva", False)
        color_hex = config_fuente.get("color", "#000000")
        
        # Clasificar familia
        if "mono" in familia_raw or "courier" in familia_raw or "consolas" in familia_raw:
            familia = "mono"
        elif "serif" in familia_raw or "times" in familia_raw or "georgia" in familia_raw or "roman" in familia_raw:
            familia = "serif"
        else:
            familia = "sans"
            
        fontname = FUENTES_ESTANDAR[(familia, negrita, cursiva)]
        
        tamano = config_fuente.get("tamano", 16)
        text_color = hex_to_rgb(color_hex)
        
        annot = page.add_freetext_annot(
            rect,
            texto,
            fontsize=tamano,
            fontname=fontname,
            text_color=text_color,
            fill_color=None # transparente para pintar por encima (overlay)
        )
        
        annot.update()
        
        try:
            doc.saveIncr()
        except Exception as err:
            if "incremental writes" in str(err) or "repaired" in str(err):
                return {"success": False, "error": "NEEDS_FULL_SAVE"}
            raise err
            
        if not doc_obj:
            doc.close()
            
        return {"success": True}
    except Exception as e:
        print(f"Error creando anotación FreeText: {e}")
        return {"success": False, "error": str(e)}
