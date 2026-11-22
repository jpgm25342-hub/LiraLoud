import fitz
import math
import os
import stat
import json
import shutil
import statistics

def asegurar_permiso_escritura(ruta_archivo):
    """Garantiza que el archivo PDF no tenga el flag de solo lectura en el sistema de archivos."""
    if ruta_archivo and os.path.exists(ruta_archivo):
        try:
            modo_actual = os.stat(ruta_archivo).st_mode
            if not (modo_actual & stat.S_IWRITE):
                os.chmod(ruta_archivo, modo_actual | stat.S_IWRITE | stat.S_IWUSR)
        except Exception as e:
            print(f"⚠️ No se pudo cambiar permisos de archivo {ruta_archivo}: {e}")

def hex_to_rgb(hex_color):
    """Convierte un color '#RRGGBB' a una tupla de floats (R, G, B) en rango 0.0 - 1.0"""
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 3:
        hex_color = ''.join(c * 2 for c in hex_color)
    return tuple(int(hex_color[i:i+2], 16) / 255.0 for i in (0, 2, 4))

def normalizar_color(color):
    """Normaliza cualquier representación de color (int 0xRRGGBB, hex str, lista/tupla RGB) a tupla (r, g, b) en [0.0, 1.0]."""
    if color is None:
        return (0.0, 0.0, 0.0)
    if isinstance(color, int):
        return tuple(max(0.0, min(1.0, float(c))) for c in fitz.sRGB_to_pdf(color))
    if isinstance(color, str):
        try:
            return hex_to_rgb(color)
        except Exception:
            return (0.0, 0.0, 0.0)
    if isinstance(color, (list, tuple)):
        if len(color) == 1:
            v = float(color[0])
            if v > 1.0:
                v /= 255.0
            v = max(0.0, min(1.0, v))
            return (v, v, v)
        if len(color) >= 3:
            vals = [float(color[i]) for i in range(3)]
            if any(v > 1.0 for v in vals):
                vals = [v / 255.0 for v in vals]
            return tuple(max(0.0, min(1.0, v)) for v in vals)
    return (0.0, 0.0, 0.0)

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
_CACHE_FUENTES_BUILTIN = {}

def cargar_fuente_builtin(codigo_base14):
    if codigo_base14 in _CACHE_FUENTES_BUILTIN:
        return _CACHE_FUENTES_BUILTIN[codigo_base14]
    try:
        font_obj = fitz.Font(codigo_base14)
        _CACHE_FUENTES_BUILTIN[codigo_base14] = font_obj
        return font_obj
    except Exception:
        _CACHE_FUENTES_BUILTIN[codigo_base14] = None
        return None

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
    if (
        (flags & FLAG_MONO)
        or any(k in nombre for k in ("courier", "cour", "consolas", "mono", "menlo", "lucon"))
    ):
        return "mono"
    if any(k in nombre for k in ("sans", "arial", "helv", "helvetica", "calibri", "segoe", "verdana", "tahoma", "roboto", "inter")):
        return "sans"
    if (
        (flags & FLAG_SERIF)
        or any(k in nombre for k in ("serif", "times", "tiro", "georgia", "cambria", "garamond", "roman", "palatino", "book"))
    ):
        return "serif"
    return "sans"

def detectar_negrita_cursiva(nombre_fuente, flags):
    nombre = (nombre_fuente or "").lower()
    negrita = bool(flags & FLAG_NEGRITA) or any(k in nombre for k in ("bold", "black", "heavy", "semibold", "negrita", "hebo", "tibo", "cobo", "hebi", "tibi", "cobi"))
    cursiva = bool(flags & FLAG_ITALICO) or any(k in nombre for k in ("italic", "oblique", "ital", "cursiva", "heit", "tiit", "coit", "hebi", "tibi", "cobi"))
    return negrita, cursiva

def _bboxes_similares(a, b, tolerancia=1.5):
    return all(abs(a[i] - b[i]) <= tolerancia for i in range(4))

def _extraer_geometria_drawings_detallada(page):
    """Extrae segmentos verticales, horizontales, celdas con trazo y rectángulos solo-relleno."""
    verticales = []      # (x, y0, y1)
    horizontales = []    # (y, x0, x1)
    celdas = []          # fitz.Rect
    celdas_relleno = []  # fitz.Rect
    pw, ph = page.rect.width, page.rect.height

    def _clasificar_rect(rr, tiene_trazo, emitir_bordes_trazo):
        rw, rh = rr.width, rr.height
        if rw <= 3.0 and rh >= 4.0:
            verticales.append(((rr.x0 + rr.x1) / 2.0, rr.y0, rr.y1))
        elif rh <= 3.0 and rw >= 4.0:
            horizontales.append(((rr.y0 + rr.y1) / 2.0, rr.x0, rr.x1))
        elif rw >= pw * 0.92 and rh >= ph * 0.92:
            return
        elif rw < 10.0 and rh >= max(12.0, rw * 2.5):
            if tiene_trazo:
                verticales.append((rr.x0, rr.y0, rr.y1))
                verticales.append((rr.x1, rr.y0, rr.y1))
            else:
                celdas_relleno.append(fitz.Rect(rr))
        elif rh < 8.0 and rw >= max(12.0, rh * 2.5):
            if tiene_trazo:
                horizontales.append((rr.y0, rr.x0, rr.x1))
                horizontales.append((rr.y1, rr.x0, rr.x1))
            else:
                celdas_relleno.append(fitz.Rect(rr))
        elif rw >= 10.0 and rh >= 8.0:
            if tiene_trazo:
                celdas.append(fitz.Rect(rr))
                if emitir_bordes_trazo:
                    verticales.append((rr.x0, rr.y0, rr.y1))
                    verticales.append((rr.x1, rr.y0, rr.y1))
                    horizontales.append((rr.y0, rr.x0, rr.x1))
                    horizontales.append((rr.y1, rr.x0, rr.x1))
            else:
                celdas_relleno.append(fitz.Rect(rr))

    try:
        for d in page.get_drawings():
            tiene_trazo = (d.get("color") is not None) and (
                d.get("width") is None or float(d.get("width") or 0.0) > 0.0
            )
            items = d.get("items", [])
            tiene_re = any(it and it[0] == "re" for it in items)
            r = d.get("rect")
            if r is not None and not tiene_re and items:
                solo_lineas = all(it and it[0] == "l" for it in items)
                if (not solo_lineas and len(items) <= 12) or (not tiene_trazo and len(items) <= 4):
                    _clasificar_rect(fitz.Rect(r), tiene_trazo, emitir_bordes_trazo=False)

            for item in items:
                op = item[0]
                if op == "l" and len(item) >= 3:
                    p1, p2 = item[1], item[2]
                    if abs(p1.x - p2.x) <= 2.0 and abs(p2.y - p1.y) >= 4.0:
                        verticales.append(((p1.x + p2.x) / 2.0, min(p1.y, p2.y), max(p1.y, p2.y)))
                    elif abs(p1.y - p2.y) <= 2.0 and abs(p2.x - p1.x) >= 4.0:
                        horizontales.append(((p1.y + p2.y) / 2.0, min(p1.x, p2.x), max(p1.x, p2.x)))
                elif op == "re" and len(item) >= 2:
                    _clasificar_rect(fitz.Rect(item[1]), tiene_trazo, emitir_bordes_trazo=True)
    except Exception:
        pass
    return verticales, horizontales, celdas, celdas_relleno

def _extraer_geometria_drawings(page):
    """Extrae segmentos verticales, horizontales y rectángulos contenedores de los dibujos vectoriales."""
    verticales, horizontales, celdas, celdas_relleno = _extraer_geometria_drawings_detallada(page)
    return verticales, horizontales, celdas + celdas_relleno

def obtener_lineas_vectoriales(page):
    lineas = []
    verticales, horizontales, _ = _extraer_geometria_drawings(page)
    for x, y0, y1 in verticales:
        lineas.append((x, y0, x, y1))
    for y, x0, x1 in horizontales:
        lineas.append((x0, y, x1, y))
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

def _fuente_soporta_texto(font_obj, texto):
    if font_obj is None or not texto:
        return True
    for ch in texto:
        if ch in ("\n", "\r", "\t", " "):
            continue
        try:
            if not font_obj.has_glyph(ord(ch)):
                return False
        except Exception:
            return False
    return True

def resolver_fuente_completa(doc, page, nombre_fuente, flags, texto=""):
    negrita, cursiva = detectar_negrita_cursiva(nombre_fuente, flags)
    familia = clasificar_familia(nombre_fuente, flags)
    codigo_base14 = FUENTES_ESTANDAR[(familia, negrita, cursiva)]

    font_builtin = cargar_fuente_builtin(codigo_base14)
    if font_builtin is not None and _fuente_soporta_texto(font_builtin, texto):
        return ("sistema", font_builtin)

    font_fallback = None

    # Si hay caracteres especiales fuera de Base-14/Nimbus, probar fuentes embebidas completas (no subset)
    for f in page.get_fonts(full=True):
        xref, ext, tipo, basefont, nombre_ref, encoding = f[:6]
        es_subset = len(basefont or "") > 7 and basefont[6] == "+"
        if es_subset:
            continue
        if basefont == nombre_fuente or nombre_ref == nombre_fuente:
            if ext == "n/a":
                break
            try:
                _, extension, _, buffer_fuente = doc.extract_font(xref)
                if buffer_fuente and extension != "n/a":
                    font_emb = fitz.Font(fontbuffer=buffer_fuente)
                    if _fuente_soporta_texto(font_emb, texto):
                        font_fallback = font_emb
                        break
            except Exception:
                pass
            break

    # Intentar fuente TTF del sistema si soporta todos los glifos
    if font_fallback is None:
        font_sys = cargar_fuente_sistema(familia, negrita, cursiva)
        if font_sys is not None and _fuente_soporta_texto(font_sys, texto):
            font_fallback = font_sys

    # Fallback Unicode amplio en Windows
    if font_fallback is None:
        for ruta_unicode in (_FW + "seguisym.ttf", _FW + "arial.ttf", _FW + "msgothic.ttc"):
            if os.path.exists(ruta_unicode):
                try:
                    f_uni = fitz.Font(fontfile=ruta_unicode)
                    if _fuente_soporta_texto(f_uni, texto):
                        font_fallback = f_uni
                        break
                except Exception:
                    continue

    if font_fallback is not None:
        if font_builtin is not None:
            # Conservar font_builtin para espacios ASCII (evita \xa0 de TTFs) y glifos latinos,
            # delegando solo los glifos ausentes a font_fallback.
            return ("mixta", (font_builtin, font_fallback))
        return ("sistema", font_fallback)

    if font_builtin is not None:
        return ("sistema", font_builtin)

    return ("base14", codigo_base14)

def _dividir_runs_mixtos(texto, font_primaria, font_fallback):
    """Divide texto en runs usando font_primaria para espacios y glifos soportados, y font_fallback para el resto."""
    runs = []
    cur_font = None
    cur_chars = []
    for ch in texto:
        if ch in (" ", "\t") or font_primaria.has_glyph(ord(ch)):
            fnt = font_primaria
        elif font_fallback.has_glyph(ord(ch)):
            fnt = font_fallback
        else:
            fnt = font_primaria
        if fnt is cur_font:
            cur_chars.append(ch)
        else:
            if cur_chars:
                runs.append((cur_font, "".join(cur_chars)))
            cur_font = fnt
            cur_chars = [ch]
    if cur_chars:
        runs.append((cur_font, "".join(cur_chars)))
    return runs

def medir_texto(texto, fuente_info, tamano):
    tipo, valor = fuente_info
    if tipo == "mixta":
        f_prim, f_fb = valor
        return sum(fnt.text_length(s, fontsize=tamano) for fnt, s in _dividir_runs_mixtos(texto, f_prim, f_fb))
    if tipo == "sistema":
        return valor.text_length(texto, fontsize=tamano)
    else:
        return fitz.get_text_length(texto, fontname=valor, fontsize=tamano)

def _registrar_fuente_en_pagina(page, font_obj, mapa_fuentes=None):
    """Registra un fitz.Font en la página con un nombre único y devuelve ese fontname."""
    if mapa_fuentes is not None and id(font_obj) in mapa_fuentes:
        return mapa_fuentes[id(font_obj)]
    existentes = {f[4] for f in page.get_fonts(full=False) if len(f) > 4 and f[4]}
    idx = len(existentes) + (len(mapa_fuentes) if mapa_fuentes else 0)
    nombre_reg = f"LiraF{idx}"
    while nombre_reg in existentes:
        idx += 1
        nombre_reg = f"LiraF{idx}"
    page.insert_font(fontname=nombre_reg, fontbuffer=font_obj.buffer)
    if mapa_fuentes is not None:
        mapa_fuentes[id(font_obj)] = nombre_reg
    return nombre_reg

def insertar_texto_con_fuente(page, punto, texto, fuente_info, tamano, color):
    tipo, valor = fuente_info
    if tipo == "mixta":
        f_prim, f_fb = valor
        mapa = {}
        x_cur = float(punto.x)
        y_cur = float(punto.y)
        for fnt, s in _dividir_runs_mixtos(texto, f_prim, f_fb):
            fname = _registrar_fuente_en_pagina(page, fnt, mapa)
            page.insert_text(
                fitz.Point(x_cur, y_cur),
                s,
                fontname=fname,
                fontsize=tamano,
                color=color,
            )
            x_cur += fnt.text_length(s, fontsize=tamano)
    elif tipo == "sistema":
        fname = _registrar_fuente_en_pagina(page, valor)
        page.insert_text(
            punto,
            texto,
            fontname=fname,
            fontsize=tamano,
            color=color,
        )
    else:
        page.insert_text(
            punto, texto,
            fontname=valor,
            fontsize=tamano,
            color=color,
        )

def _unir_spans_texto(spans):
    """Une los spans de una línea respetando kerning contiguo y puntuación."""
    texto = ""
    prev_sp = None
    for sp in spans:
        t = sp.get("text", "")
        if not t:
            continue
        if not texto:
            texto = t
        else:
            gap = None
            if prev_sp is not None and prev_sp.get("bbox") and sp.get("bbox"):
                gap = float(sp["bbox"][0]) - float(prev_sp["bbox"][2])
            tam_ref = min(
                float(prev_sp.get("size", 10.0) or 10.0) if prev_sp else 10.0,
                float(sp.get("size", 10.0) or 10.0),
            )
            contiguo = gap is not None and gap <= max(1.0, tam_ref * 0.12)
            if (
                contiguo
                or texto.endswith((" ", "\t", "\xa0"))
                or t.startswith((" ", "\t", "\xa0", ",", ".", ";", ":", "!", "?", ")", "]", "}", "…", "»"))
            ):
                texto += t
            else:
                texto += " " + t
        prev_sp = sp
    return texto.strip()

def _recortar_rect_contra_vecinos(rect_target, unmatched_rects):
    """Recorta rect_target respecto a spans vecinos no coincidentes sin invadir líneas ni columnas vecinas."""
    if not unmatched_rects or not any(not (rect_target & ur).is_empty for ur in unmatched_rects):
        return fitz.Rect(rect_target)

    x0, y0, x1, y1 = rect_target.x0, rect_target.y0, rect_target.x1, rect_target.y1
    cx_self = (rect_target.x0 + rect_target.x1) / 2.0
    cy_self = (rect_target.y0 + rect_target.y1) / 2.0

    for ur in unmatched_rects:
        inter = fitz.Rect(x0, y0, x1, y1) & ur
        if inter.is_empty:
            continue
        min_w = max(1e-6, min(rect_target.width, ur.width))
        min_h = max(1e-6, min(rect_target.height, ur.height))
        overlap_x = inter.width / min_w
        overlap_y = inter.height / min_h

        if overlap_x >= overlap_y:
            cy_ur = (ur.y0 + ur.y1) / 2.0
            if cy_ur < cy_self and ur.y1 > y0:
                y0 = max(y0, ur.y1 + 0.1)
            elif cy_ur > cy_self and ur.y0 < y1:
                y1 = min(y1, ur.y0 - 0.1)
        else:
            cx_ur = (ur.x0 + ur.x1) / 2.0
            if cx_ur < cx_self and ur.x1 > x0:
                x0 = max(x0, ur.x1 + 0.1)
            elif cx_ur > cx_self and ur.x0 < x1:
                x1 = min(x1, ur.x0 - 0.1)

    if y1 <= y0 + 1.0:
        y0_band = rect_target.y0
        y1_band = rect_target.y1
        for ur in unmatched_rects:
            if ur.x1 <= rect_target.x0 + 0.5 or ur.x0 >= rect_target.x1 - 0.5:
                continue
            if (rect_target & ur).is_empty:
                continue
            cy_ur = (ur.y0 + ur.y1) / 2.0
            if cy_ur < cy_self:
                y0_band = max(y0_band, (cy_ur + cy_self) / 2.0 + 0.1)
            elif cy_ur > cy_self:
                y1_band = min(y1_band, (cy_self + cy_ur) / 2.0 - 0.1)
        if y1_band > y0_band + 0.4:
            y0, y1 = y0_band, y1_band
        else:
            y0 = cy_self - 0.5
            y1 = cy_self + 0.5

    if x1 <= x0 + 0.5:
        x0, x1 = rect_target.x0, rect_target.x1

    return fitz.Rect(x0, y0, x1, y1)

def _inspeccionar_spans_en_rect(page, rect_original):
    """Antes de redactar, recopila metadatos reales y bboxes exactos de los spans afectados."""
    data = page.get_text("dict")
    matched = []
    unmatched_rects = []

    for b in data.get("blocks", []):
        if b.get("type") != 0:
            continue
        for l in b.get("lines", []):
            for sp in l.get("spans", []):
                txt = sp.get("text", "")
                if not txt.strip():
                    continue
                sr = fitz.Rect(sp.get("bbox"))
                inter = sr & rect_original
                area_sp = max(1e-6, sr.get_area())
                centro = fitz.Point((sr.x0 + sr.x1) / 2.0, (sr.y0 + sr.y1) / 2.0)
                if (not inter.is_empty and (inter.get_area() / area_sp) >= 0.45) or rect_original.contains(centro):
                    matched.append(sp)
                else:
                    unmatched_rects.append(sr)

    if not matched:
        return False, None, None, [fitz.Rect(rect_original)]

    span_dom = max(matched, key=lambda s: len((s.get("text") or "").strip()))
    top_span = min(matched, key=lambda s: float(s.get("bbox", (0, 0, 0, 0))[1]))
    top_bb = top_span.get("bbox", (0, 0, 0, 0))
    primera_linea = [
        s for s in matched
        if (float(top_bb[1]) - 2.0)
        <= ((float(s.get("bbox", (0, 0, 0, 0))[1]) + float(s.get("bbox", (0, 0, 0, 0))[3])) / 2.0)
        <= (float(top_bb[3]) + 2.0)
    ] or matched
    span_izq = min(primera_linea, key=lambda s: float(s.get("bbox", (0, 0, 0, 0))[0]))
    span_dom_linea = max(primera_linea, key=lambda s: len((s.get("text") or "").strip()))
    orig_izq = span_izq.get("origin")
    orig_dom = span_dom_linea.get("origin")
    if orig_izq and orig_dom:
        origen = (float(orig_izq[0]), float(orig_dom[1]))
    else:
        origen = orig_dom or orig_izq

    rect_union = fitz.Rect(matched[0].get("bbox"))
    for sp in matched[1:]:
        rect_union |= fitz.Rect(sp.get("bbox"))

    toca_vecino_original = any(not (rect_original & ur).is_empty for ur in unmatched_rects)
    toca_vecino_union = any(not (rect_union & ur).is_empty for ur in unmatched_rects)

    if not toca_vecino_union:
        rect_redact = fitz.Rect(rect_union) if toca_vecino_original else fitz.Rect(rect_original | rect_union)
        return True, origen, span_dom, [rect_redact]

    rects_redact = [
        _recortar_rect_contra_vecinos(fitz.Rect(sp.get("bbox")), unmatched_rects)
        for sp in matched
    ]
    return True, origen, span_dom, rects_redact

def _muestrear_color_fondo(page, rect):
    """Muestrea el color de fondo alrededor de rect para páginas escaneadas/OCR."""
    try:
        pr = page.rect
        clip = fitz.Rect(
            max(pr.x0, rect.x0 - 2.0),
            max(pr.y0, rect.y0 - 2.0),
            min(pr.x1, rect.x1 + 2.0),
            min(pr.y1, rect.y1 + 2.0),
        )
        pix = page.get_pixmap(matrix=fitz.Matrix(1, 1), clip=clip, alpha=False)
        if pix.width >= 3 and pix.height >= 3 and pix.n >= 3:
            samples = pix.samples
            w, h, n = pix.width, pix.height, pix.n
            borde = []
            for x in range(w):
                for y in (0, h - 1):
                    idx = (y * w + x) * n
                    borde.append((samples[idx], samples[idx + 1], samples[idx + 2]))
            for y in range(h):
                for x in (0, w - 1):
                    idx = (y * w + x) * n
                    borde.append((samples[idx], samples[idx + 1], samples[idx + 2]))
            if borde:
                r = statistics.median(p[0] for p in borde) / 255.0
                g = statistics.median(p[1] for p in borde) / 255.0
                b = statistics.median(p[2] for p in borde) / 255.0
                return (r, g, b)
    except Exception:
        pass
    return (1.0, 1.0, 1.0)

def _calcular_caja_disponible(page, rect_original, rect_deseado, origen_original, tamano):
    """
    Calcula la caja disponible (x_start, y_start, x_max, y_max) respetando bordes de tabla,
    celdas contenedoras, bloques de texto vecinos e imágenes en la página.
    """
    pw, ph = page.rect.width, page.rect.height
    x_start = float(origen_original[0]) if origen_original else float(rect_original.x0)
    y_start = float(rect_original.y0)

    verticales, horizontales, celdas, celdas_relleno = _extraer_geometria_drawings_detallada(page)
    centro_orig = fitz.Point(
        (rect_original.x0 + rect_original.x1) / 2.0,
        (rect_original.y0 + rect_original.y1) / 2.0,
    )

    for fc in celdas_relleno:
        if (
            fc.x0 <= rect_original.x0 + 2.0
            and fc.x1 >= rect_original.x1 - 2.0
            and fc.y0 <= centro_orig.y <= fc.y1
            and (fc.width > rect_original.width + 6.0 or fc.height > rect_original.height + 5.0)
        ):
            celdas.append(fc)
        elif fc.x0 >= rect_original.x1 - 1.5 and fc.y1 >= y_start - 2.0:
            verticales.append((fc.x0, fc.y0, fc.y1))
        elif fc.y0 >= rect_original.y1 - 1.5:
            horizontales.append((fc.y0, fc.x0, fc.x1))

    celda_contenedora = None
    for c in celdas:
        if c.contains(centro_orig):
            if celda_contenedora is None or c.get_area() < celda_contenedora.get_area():
                celda_contenedora = c

    if celda_contenedora is None:
        v_izq = [
            (vx, vy0, vy1) for vx, vy0, vy1 in verticales
            if vx <= centro_orig.x and vy0 <= centro_orig.y + 2.0 and vy1 >= centro_orig.y - 2.0
        ]
        v_der = [
            (vx, vy0, vy1) for vx, vy0, vy1 in verticales
            if vx >= centro_orig.x and vx > x_start + 5.0 and vy0 <= centro_orig.y + 2.0 and vy1 >= centro_orig.y - 2.0
        ]
        h_top = [
            (hy, hx0, hx1) for hy, hx0, hx1 in horizontales
            if hy <= centro_orig.y and hx0 <= centro_orig.x + 2.0 and hx1 >= centro_orig.x - 2.0
        ]
        h_bot = [
            (hy, hx0, hx1) for hy, hx0, hx1 in horizontales
            if hy >= centro_orig.y and hy >= rect_original.y1 - 0.5 and hx0 <= centro_orig.x + 2.0 and hx1 >= centro_orig.x - 2.0
        ]
        if v_izq and v_der and h_top and h_bot:
            cand_l = max(v_izq, key=lambda s: s[0])
            cand_r = min(v_der, key=lambda s: s[0])
            cand_t = max(h_top, key=lambda s: s[0])
            cand_b = min(h_bot, key=lambda s: s[0])
            cw = cand_r[0] - cand_l[0]
            ch = cand_b[0] - cand_t[0]
            if (
                10.0 <= cw < pw * 0.90
                and 8.0 <= ch < ph * 0.90
                and cand_l[1] <= cand_t[0] + 3.0 and cand_l[2] >= cand_b[0] - 3.0
                and cand_r[1] <= cand_t[0] + 3.0 and cand_r[2] >= cand_b[0] - 3.0
                and cand_t[1] <= cand_l[0] + 3.0 and cand_t[2] >= cand_r[0] - 3.0
                and cand_b[1] <= cand_l[0] + 3.0 and cand_b[2] >= cand_r[0] - 3.0
            ):
                celda_contenedora = fitz.Rect(cand_l[0], cand_t[0], cand_r[0], cand_b[0])

    # Borde izquierdo más cercano para inferir padding simétrico de celda
    borde_izq = None
    for vx, vy0, vy1 in verticales:
        if vy1 >= rect_original.y0 - 2.0 and vy0 <= rect_original.y1 + 2.0 and vx <= x_start:
            if borde_izq is None or vx > borde_izq:
                borde_izq = vx
    if celda_contenedora is not None:
        if borde_izq is None or celda_contenedora.x0 > borde_izq:
            borde_izq = celda_contenedora.x0

    pad_h = max(4.0, min(8.0, x_start - borde_izq)) if borde_izq is not None else 4.0

    # Líneas de texto restantes (ya redactado el texto original) e imágenes
    text_lines = []
    try:
        data = page.get_text("dict")
        for b in data.get("blocks", []):
            if b.get("type") != 0:
                continue
            for l in b.get("lines", []):
                if any((sp.get("text") or "").strip() for sp in l.get("spans", [])):
                    text_lines.append(l.get("bbox"))
    except Exception:
        pass

    area_orig = max(1e-6, rect_original.get_area())
    image_rects = []
    try:
        for img in page.get_image_info(xrefs=False):
            bb = img.get("bbox")
            if bb:
                ir = fitz.Rect(bb)
                inter = ir & rect_original
                if ir.contains(centro_orig) or (not inter.is_empty and (inter.get_area() / area_orig) >= 0.25):
                    continue
                image_rects.append((ir.x0, ir.y0, ir.x1, ir.y1))
    except Exception:
        pass

    # 1. Límite derecho inicial (en la banda vertical original)
    limite_der = page.rect.x1 - 12.0
    hay_obstaculo_der = False

    y_band_top = y_start - 2.0
    y_band_bot = max(rect_original.y1, y_start + tamano * 1.2) + 2.0
    y_centro_orig = (rect_original.y0 + rect_original.y1) / 2.0
    h_orig = max(1.0, rect_original.y1 - rect_original.y0)

    def _linea_en_banda(ly0, ly1, b_top, b_bot, b_centro, b_alto):
        solape = min(ly1, b_bot) - max(ly0, b_top)
        if solape <= 0.0:
            return False
        ly_centro = (ly0 + ly1) / 2.0
        ly_alto = max(1.0, ly1 - ly0)
        if solape >= 0.5 * min(ly_alto, b_alto):
            return True
        return (b_top - 1.0) <= ly_centro <= (b_bot + 1.0) and abs(ly_centro - b_centro) <= max(tamano * 0.55, b_alto * 0.55)

    for vx, vy0, vy1 in verticales:
        if vy1 >= y_band_top and vy0 <= y_band_bot and vx > x_start + 5.0:
            limite_der = min(limite_der, vx - pad_h)
            hay_obstaculo_der = True

    if celda_contenedora is not None:
        limite_der = min(limite_der, celda_contenedora.x1 - pad_h)
        hay_obstaculo_der = True

    for lx0, ly0, lx1, ly1 in text_lines:
        if lx0 > x_start + 5.0 and _linea_en_banda(ly0, ly1, rect_original.y0, rect_original.y1, y_centro_orig, h_orig):
            limite_der = min(limite_der, lx0 - 4.0)
            hay_obstaculo_der = True

    for ix0, iy0, ix1, iy1 in image_rects:
        if iy1 >= y_band_top and iy0 <= y_band_bot and ix0 > x_start + 5.0:
            limite_der = min(limite_der, ix0 - 3.0)
            hay_obstaculo_der = True

    popup_desplazado_izq = (rect_deseado.x0 < rect_original.x0 - 5.0) and (
        rect_deseado.x1 <= rect_original.x1 + 1.0
        or (rect_deseado.x1 - x_start) < 0.5 * max(1.0, rect_deseado.width)
    )

    if rect_deseado.x1 > rect_original.x1 + 1.0 and not popup_desplazado_izq:
        x_max = min(float(rect_deseado.x1), limite_der)
    elif rect_deseado.height > rect_original.height + 4.0 and not popup_desplazado_izq:
        # El llamador especificó un cuadro multilínea acotado: respetar su ancho deseado
        x_max = min(float(rect_deseado.x1), limite_der)
    elif celda_contenedora is not None:
        x_max = limite_der
    elif rect_original.height > tamano * 1.6 and not popup_desplazado_izq:
        x_max = min(float(rect_original.x1), limite_der)
    else:
        # Línea única sin celda contenedora (o popup UI desplazado a la izquierda): permitir expansión hasta
        # limite_der y margen simétrico para no aplastar el texto contra rect_original.x1.
        margen_der = max(12.0, min(72.0, x_start - page.rect.x0))
        x_max = min(limite_der, page.rect.x1 - margen_der)
        x_max = max(x_max, min(float(rect_original.x1), limite_der))

    x_max = max(x_max, x_start + 12.0)

    # 2. Límite inferior (en el rango horizontal [x_start, x_max])
    limite_abajo = page.rect.y1 - 12.0
    for hy, hx0, hx1 in horizontales:
        if hx1 >= x_start and hx0 <= x_max and hy >= rect_original.y1 - 0.5:
            # Ignorar subrayados pegados al borde inferior del texto si no forman parte de una celda/borde con verticales
            dentro_sobre_piso = celda_contenedora is None or hy < celda_contenedora.y1 - 2.0
            es_subrayado_propio = (
                dentro_sobre_piso
                and hy < rect_original.y1 + 3.0
                and not any(
                    vy0 <= hy + 2.0 and vy1 >= hy - 2.0 and (hx0 - 2.0) <= vx <= (hx1 + 2.0)
                    for vx, vy0, vy1 in verticales
                )
            )
            if not es_subrayado_propio:
                limite_abajo = min(limite_abajo, hy - 3.0)

    if celda_contenedora is not None:
        limite_abajo = min(limite_abajo, celda_contenedora.y1 - 3.0)

    for lx0, ly0, lx1, ly1 in text_lines:
        ly_centro = (ly0 + ly1) / 2.0
        if lx1 >= x_start and lx0 <= x_max and ly_centro > y_centro_orig + 2.0 and ly1 > rect_original.y1 + 1.0:
            limite_abajo = min(limite_abajo, ly0 - 1.0)

    for ix0, iy0, ix1, iy1 in image_rects:
        iy_centro = (iy0 + iy1) / 2.0
        if ix1 >= x_start and ix0 <= x_max and iy0 >= rect_original.y1 - 2.0 and iy_centro > y_centro_orig + 2.0 and iy1 > rect_original.y1 + 1.0:
            limite_abajo = min(limite_abajo, iy0 - 2.0)

    y_max_deseado = max(float(rect_original.y1), float(rect_deseado.y1))
    if celda_contenedora is not None and rect_deseado.y1 <= rect_original.y1 + 1.0:
        y_max_deseado = max(y_max_deseado, limite_abajo)
    y_max = min(y_max_deseado, limite_abajo)
    y_max = max(y_max, y_start + 4.0)

    # 3. Re-verificar obstáculos derechos en toda la altura [y_start, y_max]
    y_centro_caja = (y_start + y_max) / 2.0
    h_caja = max(1.0, y_max - y_start)
    for vx, vy0, vy1 in verticales:
        if vy1 >= y_start and vy0 <= y_max and vx > x_start + 5.0:
            x_max = min(x_max, vx - pad_h)
    for lx0, ly0, lx1, ly1 in text_lines:
        if lx0 > x_start + 5.0 and _linea_en_banda(ly0, ly1, y_start, y_max, y_centro_caja, h_caja):
            x_max = min(x_max, lx0 - 4.0)
    for ix0, iy0, ix1, iy1 in image_rects:
        if iy1 >= y_start and iy0 <= y_max and ix0 > x_start + 5.0:
            x_max = min(x_max, ix0 - 3.0)

    x_max = max(x_max, x_start + 12.0)
    return fitz.Rect(x_start, y_start, x_max, y_max)

def _envolver_texto(texto, fuente_info, tamano, ancho_max, permitir_corte_palabra=True):
    """Envuelve el texto en líneas que quepan dentro de ancho_max."""
    ancho_max = max(8.0, float(ancho_max))
    lineas_resultado = []
    parrafos = texto.replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ").split("\n")

    for parrafo in parrafos:
        if not parrafo.strip():
            lineas_resultado.append("")
            continue
        palabras = parrafo.split(" ")
        linea_actual = ""
        for palabra in palabras:
            if not palabra and linea_actual:
                continue
            candidato = (linea_actual + " " + palabra) if linea_actual else palabra
            if medir_texto(candidato, fuente_info, tamano) <= ancho_max:
                linea_actual = candidato
            else:
                if linea_actual:
                    lineas_resultado.append(linea_actual)
                    linea_actual = ""
                if medir_texto(palabra, fuente_info, tamano) <= ancho_max:
                    linea_actual = palabra
                elif not permitir_corte_palabra:
                    return None
                else:
                    trozo = ""
                    for ch in palabra:
                        if medir_texto(trozo + ch, fuente_info, tamano) <= ancho_max:
                            trozo += ch
                        else:
                            if trozo:
                                lineas_resultado.append(trozo)
                            trozo = ch
                    linea_actual = trozo
        if linea_actual:
            lineas_resultado.append(linea_actual)

    while len(lineas_resultado) > 1 and not lineas_resultado[-1]:
        lineas_resultado.pop()

    return lineas_resultado

def _ajustar_y_renderizar_texto(page, rect_caja, rect_original, origen_original, nuevo_texto, fuente_info, tamano, color):
    """Aplica reflow inteligente y escalado proporcional suave dentro de rect_caja."""
    ancho_max = max(8.0, rect_caja.width)
    alto_max = max(6.0, rect_caja.height)
    tamano_min = max(2.0, min(4.0, tamano * 0.45))

    def _baseline_para_tamano(t_val):
        if origen_original is not None:
            offset_asc_orig = max(0.75 * tamano, float(origen_original[1]) - float(rect_original.y0))
            if abs(t_val - tamano) < 0.01:
                return float(origen_original[1])
            return rect_caja.y0 + offset_asc_orig * (t_val / max(1.0, tamano))
        return rect_caja.y0 + 0.90 * t_val

    def _buscar_ajuste(t_limite, permitir_corte_palabra):
        t = float(tamano)
        ultimo_t = None
        ultimas_lineas = None
        while t >= t_limite - 1e-6:
            lineas = _envolver_texto(
                nuevo_texto, fuente_info, t, ancho_max,
                permitir_corte_palabra=permitir_corte_palabra,
            )
            if lineas is not None:
                if not lineas:
                    lineas = [""]
                cabe_ancho = all(medir_texto(ln, fuente_info, t) <= ancho_max + 0.5 for ln in lineas)
                if len(lineas) == 1:
                    cabe_alto = (t <= alto_max + 1.5) or (t <= tamano + 0.1 and origen_original is not None) or (t <= tamano_min)
                else:
                    y_bl_0 = _baseline_para_tamano(t)
                    y_bottom = y_bl_0 + (len(lineas) - 1) * (t * 1.18) + 0.22 * t
                    cabe_alto = (y_bottom <= rect_caja.y1 + 0.5) and (((len(lineas) - 1) * 1.18 + 1.12) * t <= alto_max + 1.5)
                ultimo_t = t
                ultimas_lineas = lineas
                if cabe_ancho and cabe_alto:
                    return True, t, lineas
            t = round(t - 0.25, 2)
        return False, ultimo_t, ultimas_lineas

    palabras_no_vacias = [w for w in nuevo_texto.replace("\xa0", " ").split() if w]
    t_limite_intacto = tamano_min if len(palabras_no_vacias) <= 3 else max(tamano_min, round(tamano * 0.5, 2))
    ok, tamano_elegido, lineas_elegidas = _buscar_ajuste(t_limite_intacto, permitir_corte_palabra=False)
    if not ok:
        _, t_fb, ln_fb = _buscar_ajuste(tamano_min, permitir_corte_palabra=True)
        if ln_fb is not None:
            tamano_elegido, lineas_elegidas = t_fb, ln_fb
        elif lineas_elegidas is None:
            tamano_elegido, lineas_elegidas = tamano, [nuevo_texto]

    y_baseline_0 = _baseline_para_tamano(tamano_elegido)
    line_step = tamano_elegido * 1.18
    tipo, valor = fuente_info

    if tipo == "mixta":
        f_prim, f_fb = valor
        mapa = {}
        for idx, ln in enumerate(lineas_elegidas):
            if not ln:
                continue
            y_bl = y_baseline_0 + idx * line_step
            x_cur = float(rect_caja.x0)
            for fnt, s in _dividir_runs_mixtos(ln, f_prim, f_fb):
                fname = _registrar_fuente_en_pagina(page, fnt, mapa)
                page.insert_text(
                    fitz.Point(x_cur, y_bl),
                    s,
                    fontname=fname,
                    fontsize=tamano_elegido,
                    color=color,
                )
                x_cur += fnt.text_length(s, fontsize=tamano_elegido)
    elif tipo == "sistema":
        fname = _registrar_fuente_en_pagina(page, valor)
        for idx, ln in enumerate(lineas_elegidas):
            if not ln:
                continue
            y_bl = y_baseline_0 + idx * line_step
            page.insert_text(
                fitz.Point(rect_caja.x0, y_bl),
                ln,
                fontname=fname,
                fontsize=tamano_elegido,
                color=color,
            )
    else:
        for idx, ln in enumerate(lineas_elegidas):
            if not ln:
                continue
            y_bl = y_baseline_0 + idx * line_step
            page.insert_text(
                fitz.Point(rect_caja.x0, y_bl),
                ln,
                fontname=valor,
                fontsize=tamano_elegido,
                color=color,
            )


def obtener_bloques_texto_pagina(pdf_path, pagina_idx, doc_obj=None):
    if not doc_obj and not os.path.exists(pdf_path):
        return {"success": False, "error": "Documento no encontrado."}

    doc = None
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
                        spans = [s for s in l.get("spans", []) if s.get("text", "")]
                        texto_limpio = _unir_spans_texto(spans)
                        if texto_limpio:
                            spans_no_vacios = [s for s in spans if (s.get("text") or "").strip()]
                            span_dom = max(
                                spans_no_vacios,
                                key=lambda s: len((s.get("text") or "").strip()),
                            ) if spans_no_vacios else spans[0]

                            fuente_base = span_dom.get("font", "helv")
                            tamano_base = span_dom.get("size", 10.0)
                            color_base = span_dom.get("color")
                            if color_base is None:
                                color_base = 0
                            flags_base = span_dom.get("flags", 0)

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

        if not doc_obj and not getattr(doc, "is_closed", False):
            doc.close()
        return {"success": True, "bloques": bloques}
    except Exception as e:
        print(f"Error obteniendo bloques de texto: {e}")
        return {"success": False, "error": str(e)}
    finally:
        if not doc_obj and doc is not None and not getattr(doc, "is_closed", False):
            try:
                doc.close()
            except Exception:
                pass

def _guardar_documento_seguro(doc, pdf_path, doc_obj):
    """Guarda incrementalmente o ejecuta guardado completo seguro según propiedad de doc_obj."""
    def _hacer_full_save_propio():
        temp_path = pdf_path + ".tmp"
        try:
            doc.save(temp_path, garbage=1, deflate=True)
            doc.close()
            asegurar_permiso_escritura(pdf_path)
            shutil.move(temp_path, pdf_path)
        finally:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

    if not getattr(doc, "can_save_incrementally", lambda: True)():
        if doc_obj is not None:
            return {"success": False, "error": "NEEDS_FULL_SAVE"}
        _hacer_full_save_propio()
        return {"success": True}

    try:
        doc.saveIncr()
        return {"success": True}
    except Exception as err:
        msg = str(err).lower()
        if "incremental writes" in msg or "repaired" in msg or "incremental" in msg:
            if doc_obj is not None:
                return {"success": False, "error": "NEEDS_FULL_SAVE"}
            _hacer_full_save_propio()
            return {"success": True}
        raise err

def editar_texto_pdf(pdf_path, pagina_idx, datos, doc_obj=None):
    asegurar_permiso_escritura(pdf_path)
    if not doc_obj and not os.path.exists(pdf_path):
        return {"success": False, "error": "Documento no encontrado."}

    doc = None
    try:
        doc = doc_obj if doc_obj else fitz.open(pdf_path)
        page = doc[pagina_idx]

        raw_bbox = datos['bbox']
        bbox_original = datos.get('bbox_original') or raw_bbox
        raw_texto = datos.get('texto', '')
        nuevo_texto = "" if raw_texto is None else str(raw_texto).replace("\xa0", " ").replace("\t", " ")

        rect_original = fitz.Rect(bbox_original).normalize()
        rect_deseado = fitz.Rect(raw_bbox).normalize()

        # 0. Inspeccionar spans originales ANTES de redactar
        tiene_vector, origen_original, span_dom, rects_redact = _inspeccionar_spans_en_rect(page, rect_original)
        if origen_original is None:
            origen_original = obtener_origen_linea_original(page, tuple(rect_original))

        fuente_original = datos.get('fuente') or (span_dom.get('font') if span_dom else 'helv')
        if datos.get('flags') is not None:
            flags_original = int(datos['flags'])
        else:
            flags_original = int(span_dom.get('flags', 0)) if span_dom else 0

        raw_tam = datos.get('tamano')
        if raw_tam is not None and raw_tam != "":
            tam_f = float(raw_tam)
        else:
            tam_f = float(span_dom.get('size', 10.0)) if span_dom else 10.0
        if not math.isfinite(tam_f):
            tam_f = float(span_dom.get('size', 10.0)) if span_dom else 10.0
        tamano = max(4.0, tam_f)

        if datos.get('color') is not None:
            color = normalizar_color(datos['color'])
        else:
            color = normalizar_color(span_dom.get('color', 0) if span_dom else 0)

        # 1. Borrado quirúrgico sin destruir vectores ni imágenes ni fondo de celda
        for r_red in rects_redact:
            page.add_redact_annot(r_red, fill=None)
        page.apply_redactions(
            images=fitz.PDF_REDACT_IMAGE_NONE,
            graphics=fitz.PDF_REDACT_LINE_ART_NONE,
        )

        # Solo cubrir píxeles con rectángulo de fondo si el área es OCR/imagen (sin texto vectorial nativo)
        if (not tiene_vector) or bool(datos.get("is_ocr", False)) or str(datos.get("id", "")).startswith("ocr-line-"):
            bg_color = _muestrear_color_fondo(page, rect_original)
            page.draw_rect(rect_original, color=None, fill=bg_color, width=0)

        # 2. Reflow inteligente y fidelidad tipográfica
        if nuevo_texto.strip():
            rect_caja = _calcular_caja_disponible(
                page, rect_original, rect_deseado, origen_original, tamano
            )
            fuente_info = resolver_fuente_completa(
                doc, page, fuente_original, flags_original, texto=nuevo_texto
            )
            _ajustar_y_renderizar_texto(
                page, rect_caja, rect_original, origen_original,
                nuevo_texto, fuente_info, tamano, color,
            )

        # 3. Actualizar la caché OCR para mantener sincronía con el lector/karaoke
        try:
            doc_path = getattr(doc, "name", pdf_path) or pdf_path
            from backend.documento.ocr_engine import actualizar_linea_cache_ocr
            actualizar_linea_cache_ocr(doc_path, pagina_idx, datos.get('id', ''), bbox_original, nuevo_texto, raw_bbox)
        except Exception as ocr_err:
            print(f"Nota: No se actualizó caché OCR tras edición: {ocr_err}")

        # 4. Guardado seguro
        res_guardado = _guardar_documento_seguro(doc, pdf_path, doc_obj)
        if not doc_obj and not getattr(doc, "is_closed", False):
            doc.close()
        return res_guardado
    except Exception as e:
        print(f"Error editando texto: {e}")
        return {"success": False, "error": str(e)}
    finally:
        if not doc_obj and doc is not None and not getattr(doc, "is_closed", False):
            try:
                doc.close()
            except Exception:
                pass


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
