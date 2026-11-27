import os
import json
import fitz

from .comun import (
    asegurar_permiso_escritura,
    hex_to_rgb,
    normalizar_color,
    _guardar_documento_seguro,
)
from .geometria import _bboxes_similares
from .layout_texto import _extraer_candidatos_subrayado_detalle

def _insertar_highlight_quads(page, coordenadas_list, rgb_color, id_anotacion=None, texto_extraido=None):
    """Inserta una anotación Highlight con sus quads, color y metadatos opcionales."""
    if not coordenadas_list:
        return
    quads = [fitz.Rect(coord['x0'], coord['y0'], coord['x1'], coord['y1']).quad for coord in coordenadas_list]
    annot = page.add_highlight_annot(quads)
    annot.set_colors(stroke=rgb_color)
    if id_anotacion or texto_extraido:
        info_dict = {"id": id_anotacion or "", "text": texto_extraido or ""}
        annot.set_info(content=json.dumps(info_dict))
    annot.update()


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
        _insertar_highlight_quads(page, coordenadas_list, rgb_color, id_anotacion, texto_extraido)
            
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

def _borrar_highlights_en_rect(page, target_rect):
    """Elimina anotaciones Highlight que intersectan target_rect y retorna (borrados, ids_borrados)."""
    annot = page.first_annot
    borrados = 0
    ids_borrados = []

    while annot:
        # 8 es el tipo Highlight en PyMuPDF
        if annot.type[0] == 8 and annot.rect.intersects(target_rect):
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

    return borrados, ids_borrados


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
        borrados, ids_borrados = _borrar_highlights_en_rect(page, target_rect)
            
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

def _borrar_primer_highlight_en_punto(page, punto):
    """Elimina la primera anotación Highlight que contenga el punto y retorna su ID (o None)."""
    annot = page.first_annot
    id_borrado = None

    while annot:
        if annot.type[0] == 8 and annot.rect.contains(punto):
            content_raw = annot.info.get("content", "")
            if content_raw:
                try:
                    data = json.loads(content_raw)
                    id_borrado = data.get("id", content_raw)
                except json.JSONDecodeError:
                    id_borrado = content_raw

            page.delete_annot(annot)
            break
        annot = annot.next

    return id_borrado


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
        id_borrado = _borrar_primer_highlight_en_punto(page, punto)
            
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

def _serializar_highlight_annot(page, annot, pagina_idx, total_previos):
    """Extrae texto, color hex e id de una anotación Highlight de PyMuPDF."""
    content_raw = annot.info.get("content", "")
    content_id = f"id_{total_previos}_{pagina_idx}"
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
        r, g, b = int(color[0] * 255), int(color[1] * 255), int(color[2] * 255)
        color_hex = f"#{r:02x}{g:02x}{b:02x}"

    return {
        "texto": texto,
        "color": color_hex,
        "id": content_id,
        "pagina": pagina_idx,
    }


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
                    subrayados.append(
                        _serializar_highlight_annot(page, annot, pagina_idx, len(subrayados))
                    )
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


def _subrayado_encaja_en_clusters(ux0, ux1, clusters):
    """Comprueba si el tramo horizontal de subrayado encaja dentro de algún clúster de spans."""
    for cx0, cx1 in clusters:
        extiende_izq = cx0 - ux0
        extiende_der = ux1 - cx1
        if (
            ux1 > cx0
            and ux0 < cx1
            and extiende_izq <= 1.2
            and extiende_der <= 1.2
            and not (extiende_izq >= 0.8 and extiende_der >= 0.8)
            and (ux1 - ux0) <= (cx1 - cx0) + 2.4
        ):
            return True
    return False


def _rect_subrayado_para_candidato(uy, ux0, ux1, stroke_w, spans_meta):
    """Evalúa si un segmento candidato pertenece a los spans redactados y retorna su Rect de borrado o None."""
    spans_ancla = [
        it for it in spans_meta
        if (it[3] - 0.5) <= uy <= it[3] + max(2.2, 0.22 * it[2])
    ]
    if not spans_ancla:
        return None

    spans_en_linea = [
        (sx0, sx1, ssz)
        for sx0, sx1, ssz, orig_y in spans_meta
        if any(abs(orig_y - ay) <= 1.5 for _, _, _, ay in spans_ancla) and uy >= (orig_y - 0.5)
    ]
    if not spans_en_linea:
        return None

    # Agrupar en clústeres horizontales contiguos para cubrir subrayados multi-span en la misma línea
    spans_en_linea.sort(key=lambda it: it[0])
    clusters = []
    cur_x0, cur_x1, cur_max_sz = spans_en_linea[0]
    for sx0, sx1, ssz in spans_en_linea[1:]:
        gap_max = max(14.0, max(cur_max_sz, ssz) * 2.0)
        if sx0 <= cur_x1 + gap_max:
            cur_x1 = max(cur_x1, sx1)
            cur_max_sz = max(cur_max_sz, ssz)
        else:
            clusters.append((cur_x0, cur_x1))
            cur_x0, cur_x1, cur_max_sz = sx0, sx1, ssz
    clusters.append((cur_x0, cur_x1))

    if _subrayado_encaja_en_clusters(ux0, ux1, clusters):
        pad_x = max(1.5, stroke_w * 0.6 + 0.5)
        pad_y = max(1.5, stroke_w * 0.6 + 0.8)
        return fitz.Rect(ux0 - pad_x, uy - pad_y, ux1 + pad_x, uy + pad_y)
    return None


def _extraer_spans_en_rect_original(page, rect_original):
    """Recopila los spans no vacíos de la página que se solapan con `rect_original`."""
    data = page.get_text("dict")
    matched_spans = []
    for b in data.get("blocks", []):
        if b.get("type") != 0:
            continue
        for l in b.get("lines", []):
            for sp in l.get("spans", []):
                if not (sp.get("text") or "").strip():
                    continue
                sr = fitz.Rect(sp.get("bbox"))
                inter = sr & rect_original
                centro = fitz.Point((sr.x0 + sr.x1) / 2.0, (sr.y0 + sr.y1) / 2.0)
                if (not inter.is_empty and (inter.get_area() / max(1e-6, sr.get_area())) >= 0.45) or rect_original.contains(centro):
                    matched_spans.append(sp)
    return matched_spans


def _recopilar_rects_subrayados_antiguos(page, rect_original, rects_redact):
    """
    Detecta trazos de subrayado contenidos dentro de la banda horizontal de los spans redactados
    (incluyendo subrayados continuos que abarcan varios spans en la misma línea, sin tocar bordes ni divisores)
    para eliminarlos limpiamente al re-renderizar.
    """
    rects_ul = []
    try:
        matched_spans = _extraer_spans_en_rect_original(page, rect_original)
        if not matched_spans:
            return []

        spans_meta = []
        for sp in matched_spans:
            sb = sp.get("bbox")
            sp_size = float(sp.get("size", 10.0) or 10.0)
            orig_y = float(sp["origin"][1]) if sp.get("origin") else float(sb[3])
            spans_meta.append((float(sb[0]), float(sb[2]), sp_size, orig_y))

        candidatos = _extraer_candidatos_subrayado_detalle(page)
        for uy, ux0, ux1, stroke_w in candidatos:
            rect_ul = _rect_subrayado_para_candidato(uy, ux0, ux1, stroke_w, spans_meta)
            if rect_ul is not None:
                rects_ul.append(rect_ul)
    except Exception:
        pass
    return rects_ul
