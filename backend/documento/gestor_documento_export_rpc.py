# LiraLoud - Exportación de PDFs configurados y diálogo nativo de guardado
import os
import re
import sys
import shutil
import ctypes
import pymupdf as fitz

from backend.core.webview_bridge import eel
from backend.core.estado_global import estado_app
from backend.documento.edicion_pdf import asegurar_permiso_escritura


def _dialogo_guardar_pdf_nativo(nombre_sugerido="documento_editado.pdf", es_zip=False):
    """Abre el diálogo nativo Win32 'Guardar como...' para exportar PDF o ZIP."""
    if sys.platform == "win32":
        try:
            from ctypes import wintypes

            class OPENFILENAMEW(ctypes.Structure):
                _fields_ = [
                    ("lStructSize", wintypes.DWORD),
                    ("hwndOwner", wintypes.HWND),
                    ("hInstance", wintypes.HINSTANCE),
                    ("lpstrFilter", wintypes.LPCWSTR),
                    ("lpstrCustomFilter", wintypes.LPWSTR),
                    ("nMaxCustFilter", wintypes.DWORD),
                    ("nFilterIndex", wintypes.DWORD),
                    ("lpstrFile", wintypes.LPWSTR),
                    ("nMaxFile", wintypes.DWORD),
                    ("lpstrFileTitle", wintypes.LPWSTR),
                    ("nMaxFileTitle", wintypes.DWORD),
                    ("lpstrInitialDir", wintypes.LPCWSTR),
                    ("lpstrTitle", wintypes.LPCWSTR),
                    ("Flags", wintypes.DWORD),
                    ("nFileOffset", wintypes.WORD),
                    ("nFileExtension", wintypes.WORD),
                    ("lpstrDefExt", wintypes.LPCWSTR),
                    ("lCustData", wintypes.LPARAM),
                    ("lpfnHook", ctypes.c_void_p),
                    ("lpTemplateName", wintypes.LPCWSTR),
                    ("pvReserved", ctypes.c_void_p),
                    ("dwReserved", wintypes.DWORD),
                    ("FlagsEx", wintypes.DWORD),
                ]

            buf = ctypes.create_unicode_buffer(nombre_sugerido, 1024)
            if es_zip:
                filtro = "Archivo ZIP (*.zip)\0*.zip\0Todos los archivos (*.*)\0*.*\0\0"
                def_ext = "zip"
                titulo = "Guardar PDFs divididos (ZIP)"
            else:
                filtro = "Documento PDF (*.pdf)\0*.pdf\0Todos los archivos (*.*)\0*.*\0\0"
                def_ext = "pdf"
                titulo = "Guardar documento PDF"

            ofn = OPENFILENAMEW()
            ofn.lStructSize = ctypes.sizeof(OPENFILENAMEW)
            ofn.hwndOwner = ctypes.windll.user32.GetForegroundWindow()
            ofn.lpstrFilter = filtro
            ofn.lpstrFile = ctypes.cast(buf, wintypes.LPWSTR)
            ofn.nMaxFile = 1024
            ofn.lpstrTitle = titulo
            ofn.Flags = 0x00000002 | 0x00000800 | 0x00000008  # OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR
            ofn.lpstrDefExt = def_ext

            if ctypes.windll.comdlg32.GetSaveFileNameW(ctypes.byref(ofn)):
                return buf.value
            return ""
        except Exception as e:
            print(f"⚠️ Fallo diálogo Win32 Guardar PDF: {e}")
    return ""

def _construir_subdocumento_pdf(doc_origen, p_ini_idx, p_fin_idx, incluir_subrayados=True, aplanar=False):
    """Crea un nuevo fitz.Document con las páginas [p_ini_idx..p_fin_idx] aplicando las opciones."""
    nuevo_doc = fitz.open()
    nuevo_doc.insert_pdf(doc_origen, from_page=p_ini_idx, to_page=p_fin_idx)

    if not incluir_subrayados:
        for pagina in nuevo_doc:
            annots = list(pagina.annots() or [])
            for annot in annots:
                try:
                    # 8 = Highlight, 9 = Underline, 10 = Squiggly, 11 = StrikeOut
                    if annot.type[0] in (8, 9, 10, 11):
                        pagina.delete_annot(annot)
                except Exception:
                    pass

    if aplanar and hasattr(nuevo_doc, "bake"):
        try:
            nuevo_doc.bake()
        except Exception as e_bake:
            print(f"⚠️ Aviso al aplanar anotaciones (bake): {e_bake}")

    return nuevo_doc

def _construir_rangos_exportacion_pdf(doc, pag_ini, pag_fin, total_pags, corte_modo, corte_paginas, base_nombre):
    """Construye la lista de rangos (p0, p1, nombre_archivo) para exportar un PDF completo o dividido."""
    rangos = []
    if corte_modo == "pagina":
        p = pag_ini
        idx_bloque = 1
        while p <= pag_fin:
            p_end = min(pag_fin, p + corte_paginas - 1)
            etiqueta = f"pag_{p}" if p == p_end else f"pags_{p}_a_{p_end}"
            rangos.append((p - 1, p_end - 1, f"{idx_bloque:02d}_{base_nombre}_{etiqueta}.pdf"))
            p = p_end + 1
            idx_bloque += 1
    elif corte_modo == "seccion":
        from backend.audio.pistas_exporter import detectar_secciones_rango
        secciones = detectar_secciones_rango(doc, pag_ini - 1, pag_fin - 1)
        if len(secciones) > 1:
            for idx_s, sec in enumerate(secciones, start=1):
                t_limpio = re.sub(r"[^\w\-_\. ]", "_", sec.get("titulo", f"seccion_{idx_s}"))[:40].strip() or f"seccion_{idx_s}"
                rangos.append((sec["inicio_pag"], sec["fin_pag"], f"{idx_s:02d}_{t_limpio}.pdf"))
        else:
            rangos.append((pag_ini - 1, pag_fin - 1, f"{base_nombre}_editado.pdf"))
    else:
        sufijo = f"_pags_{pag_ini}-{pag_fin}" if (pag_ini > 1 or pag_fin < total_pags) else "_editado"
        rangos.append((pag_ini - 1, pag_fin - 1, f"{base_nombre}{sufijo}.pdf"))
    return rangos

def _preparar_plan_exportacion_pdf(doc, opciones):
    """Normaliza opciones de exportación y calcula rangos, nombre sugerido y flags de guardado."""
    opciones = opciones if isinstance(opciones, dict) else {}
    total_pags = len(doc)
    pag_ini = max(1, min(int(opciones.get("pag_ini", 1) or 1), total_pags))
    pag_fin = max(pag_ini, min(int(opciones.get("pag_fin", total_pags) or total_pags), total_pags))
    incluir_subrayados = bool(opciones.get("incluir_subrayados", True))
    aplanar = bool(opciones.get("aplanar_anotaciones", False))
    optimizar = bool(opciones.get("optimizar_peso", True))
    corte_modo = str(opciones.get("corte_modo", "unico") or "unico")
    corte_paginas = max(1, int(opciones.get("corte_paginas", 1) or 1))

    ruta_actual = estado_app.ruta_pdf_actual or getattr(doc, "name", "") or "documento.pdf"
    base_nombre = os.path.splitext(os.path.basename(ruta_actual))[0] or "documento"
    base_nombre = re.sub(r"[^\w\-_\. ]", "_", base_nombre).strip() or "documento"

    rangos = _construir_rangos_exportacion_pdf(
        doc, pag_ini, pag_fin, total_pags, corte_modo, corte_paginas, base_nombre
    )
    es_multiple = len(rangos) > 1
    nombre_sugerido = f"{base_nombre}_dividido.zip" if es_multiple else rangos[0][2]
    return rangos, es_multiple, nombre_sugerido, incluir_subrayados, aplanar, optimizar

@eel.expose
def exportar_pdf_configurado(opciones=None):
    """
    Exporta o guarda una copia del documento PDF actual con las configuraciones indicadas:
    - pag_ini, pag_fin (1-based)
    - incluir_subrayados (bool)
    - aplanar_anotaciones (bool)
    - optimizar_peso (bool)
    - corte_modo ('unico' | 'pagina' | 'seccion')
    - corte_paginas (int)
    """
    import zipfile

    if not estado_app.doc:
        return {"ok": False, "error": "No hay ningún documento abierto para exportar."}

    with estado_app.lock_edicion_pdf:
        (
            rangos,
            es_multiple,
            nombre_sugerido,
            incluir_subrayados,
            aplanar,
            optimizar,
        ) = _preparar_plan_exportacion_pdf(estado_app.doc, opciones)

    ruta_destino = _dialogo_guardar_pdf_nativo(nombre_sugerido=nombre_sugerido, es_zip=es_multiple)
    if not ruta_destino:
        return {"ok": False, "cancelado": True}

    try:
        with estado_app.lock_edicion_pdf:
            save_kwargs = {"garbage": 3, "deflate": True} if optimizar else {"garbage": 1, "deflate": False}
            if not es_multiple:
                if not ruta_destino.lower().endswith(".pdf"):
                    ruta_destino += ".pdf"
                p0, p1, _ = rangos[0]
                sub_doc = _construir_subdocumento_pdf(
                    estado_app.doc, p0, p1,
                    incluir_subrayados=incluir_subrayados,
                    aplanar=aplanar,
                )
                try:
                    temp_out = ruta_destino + ".tmp"
                    sub_doc.save(temp_out, **save_kwargs)
                finally:
                    sub_doc.close()
                if os.path.exists(ruta_destino):
                    asegurar_permiso_escritura(ruta_destino)
                shutil.move(temp_out, ruta_destino)
                return {
                    "ok": True,
                    "ruta": ruta_destino,
                    "archivos": 1,
                    "mensaje": f"PDF guardado correctamente en:\n{ruta_destino}"
                }
            else:
                if not ruta_destino.lower().endswith(".zip"):
                    ruta_destino += ".zip"
                with zipfile.ZipFile(ruta_destino, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                    for p0, p1, nombre_item in rangos:
                        sub_doc = _construir_subdocumento_pdf(
                            estado_app.doc, p0, p1,
                            incluir_subrayados=incluir_subrayados,
                            aplanar=aplanar,
                        )
                        try:
                            pdf_bytes = sub_doc.tobytes(**save_kwargs)
                            zf.writestr(nombre_item, pdf_bytes)
                        finally:
                            sub_doc.close()
                return {
                    "ok": True,
                    "ruta": ruta_destino,
                    "archivos": len(rangos),
                    "mensaje": f"Se exportaron {len(rangos)} archivos PDF en:\n{ruta_destino}"
                }
    except Exception as e:
        return {"ok": False, "error": f"No se pudo guardar el PDF: {str(e)}"}
