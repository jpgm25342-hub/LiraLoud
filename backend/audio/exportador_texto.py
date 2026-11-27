# LiraLoud - Preparación de texto, layout y OCR por página para ExportadorAudio
import re
import logging
from typing import Optional, Dict, Any, Callable, List, Tuple

from backend.core.gestor_archivos import cargar_ajustes_lectura, cargar_diccionario
from backend.documento.ocr_engine import procesar_ocr_pagina, renderizar_pixmap_ocr

logger = logging.getLogger(__name__)


class ExportadorTextoMixin:
    """Resuelve layout, extrae palabras/OCR y segmenta oraciones con voces para exportación."""

    @staticmethod
    def _cargar_layout_guardado_pagina(
        num_pag: int,
        doc_path: str,
        estado_app: Any,
        cargar_progreso_libro: Callable[[str], Any],
    ) -> Tuple[List[Any], Dict[str, Any], List[Any], Any]:
        """Obtiene cortes, límites, zonas excluidas y estructura IA desde memoria o progreso guardado."""
        lay_mem = estado_app.layouts_por_pagina.get(int(num_pag))
        if isinstance(lay_mem, dict):
            fuente = lay_mem
            est_ia = lay_mem.get("estructura")
        elif doc_path:
            prog = cargar_progreso_libro(doc_path)
            layouts = prog.get("layouts", {}) if isinstance(prog, dict) else {}
            fuente = layouts.get(str(num_pag), {})
            est_ia = None
        else:
            fuente = {}
            est_ia = None
        return (
            fuente.get("cortesV") or [],
            fuente.get("limitesH") or {},
            fuente.get("zonasExcluidas") or [],
            est_ia,
        )

    def _resolver_layout_pagina_export(
        self,
        pagina: Any,
        num_pag: int,
        doc_path: str,
        aplicar_layout: bool,
        estado_app: Any,
        cargar_progreso_libro: Callable[[str], Any],
    ) -> Tuple[List[Any], Dict[str, Any], List[Any], Any, bool, bool, bool]:
        """Resuelve cortes, límites horizontales, zonas excluidas, estructura IA y usar_sort para exportación."""
        if aplicar_layout:
            pag_cortes_v, pag_limites_h, pag_zonas, est_ia = self._cargar_layout_guardado_pagina(
                num_pag, doc_path, estado_app, cargar_progreso_libro
            )
        else:
            pag_cortes_v, pag_limites_h, pag_zonas, est_ia = [], {}, [], None

        tiene_cortes_v = bool(pag_cortes_v)
        tiene_limites_h = any(
            isinstance(lim, (list, tuple)) and len(lim) >= 2 and (lim[0] > 5 or lim[1] < (pagina.rect.height - 5))
            for lim in pag_limites_h.values()
        )
        usar_sort = not tiene_cortes_v and not tiene_limites_h
        return pag_cortes_v, pag_limites_h, pag_zonas, est_ia, tiene_cortes_v, tiene_limites_h, usar_sort

    @staticmethod
    def _filtrar_y_asignar_voces_oraciones(
        oraciones_raw: List[Dict[str, Any]],
        dict_activo: Dict[str, Any],
        filtros: Dict[str, Any],
        modo_teatro: bool,
        obra_actual: str,
        voz_default: str,
        estado_app: Any,
        aplicar_reemplazos_fn: Callable[..., Any],
    ) -> List[Tuple[str, str]]:
        """Aplica reemplazos y asigna la voz activa a cada oración útil de la página."""
        oraciones_filtradas: List[Tuple[str, str]] = []
        for orac in oraciones_raw:
            txt_orac = str(orac.get("texto") or "").strip()
            if not txt_orac:
                continue
            pack = aplicar_reemplazos_fn(
                txt_orac,
                dict_activo,
                filtros,
                modo_teatro=modo_teatro,
                obra_actual=obra_actual,
            )
            texto_final, voz_detectada = pack if isinstance(pack, tuple) else (pack, None)
            voz_actual = voz_detectada or (estado_app.voz_teatro_persistente if modo_teatro else None) or voz_default
            if texto_final and re.search(r"[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]", str(texto_final)):
                oraciones_filtradas.append((str(texto_final).strip(), voz_actual))
        return oraciones_filtradas

    @staticmethod
    def _extraer_palabras_pagina_export(
        pagina: Any,
        num_pag: int,
        doc_path: str,
        ajustes: Dict[str, Any],
        aplicar_layout: bool,
        pag_cortes_v: List[Any],
        pag_limites_h: Dict[str, Any],
        pag_zonas: List[Any],
        tiene_cortes_v: bool,
        tiene_limites_h: bool,
        usar_sort: bool,
        extraer_fn: Callable[..., Any],
        filtrar_excl_fn: Callable[..., Any],
        organizar_fn: Callable[..., Any],
    ) -> List[Any]:
        """Extrae palabras de la página (con fallback OCR, exclusiones y cortes/límites de layout)."""
        palabras_raw = extraer_fn(pagina, sort=usar_sort)
        if not palabras_raw and ajustes.get("auto_ocr", True):
            try:
                pix = renderizar_pixmap_ocr(pagina)
                palabras_raw = procesar_ocr_pagina(
                    pixmap_bytes=pix.tobytes("png"),
                    ancho_pdf=pagina.rect.width,
                    alto_pdf=pagina.rect.height,
                    ancho_px=pix.width,
                    alto_px=pix.height,
                    doc_path=doc_path or "doc_actual",
                    num_pagina=num_pag,
                    forzar=False,
                )
            except Exception as e:
                logger.warning(f"⚠️ No se pudo procesar OCR para la página {num_pag}: {e}")

        if aplicar_layout and pag_zonas:
            palabras_raw = filtrar_excl_fn(palabras_raw, pag_zonas)

        if aplicar_layout and (tiene_cortes_v or tiene_limites_h):
            palabras_raw = organizar_fn(
                palabras_raw, pag_cortes_v, pag_limites_h, pagina.rect.width, pagina.rect.height
            )
        return palabras_raw

    def preparar_texto_pagina(
        self,
        doc: Any,
        num_pag: int,
        dict_activo: Optional[Dict[str, Any]] = None,
        filtros: Optional[Dict[str, Any]] = None,
        modo_teatro: bool = False,
        obra_actual: str = "General",
        voz_default: str = "es-MX-DaliaNeural",
        aplicar_layout: bool = True,
    ) -> List[Tuple[str, str]]:
        """
        Prepara la lista de (texto_frase, voz_asignada) usando el mismo pipeline
        de segmentación y filtros que el karaoke en vivo.
        """
        if not doc or num_pag < 0 or num_pag >= len(doc):
            return []

        from backend.core.estado_global import estado_app
        from backend.core.gestor_archivos import cargar_progreso_libro
        from backend.documento.gestor_documento_rpc import (
            _extraer_palabras_con_tipografia,
            _filtrar_palabras_por_exclusiones,
        )
        from backend.documento.procesador_texto import (
            organizar_palabras_con_cortes_y_limites,
            procesar_oraciones_de_palabras,
            aplicar_reemplazos,
        )

        pagina = doc[num_pag]
        ajustes = cargar_ajustes_lectura()
        if dict_activo is None:
            dict_activo = cargar_diccionario()

        if filtros is None:
            filtros = {
                "chk-urls": ajustes.get("omitirUrls", False),
                "chk-paren": ajustes.get("omitirParen", False),
                "chk-corch": ajustes.get("omitirCorch", False),
                "chk-llaves": ajustes.get("omitirLlaves", False),
                "chk-barras": ajustes.get("omitirBarras", False),
                "chk-referencias": ajustes.get("omitirSuperindices", ajustes.get("omitirReferencias", True)),
                "chk-superindices": ajustes.get("omitirSuperindices", ajustes.get("omitirReferencias", True)),
                "chk-subindices": ajustes.get("omitirSubindices", False),
            }
        filtros = {
            **filtros,
            "usarBloquesNativos": ajustes.get("usarBloquesNativos", True),
            "sensibilidadSalto": float(ajustes.get("sensibilidadSalto", 0.5)),
            "detectarSangria": ajustes.get("detectarSangria", True),
            "modo_teatro": bool(modo_teatro),
            "obra_actual": str(obra_actual or "General"),
        }

        doc_path = getattr(doc, "name", "") or ""
        (
            pag_cortes_v,
            pag_limites_h,
            pag_zonas,
            est_ia,
            tiene_cortes_v,
            tiene_limites_h,
            usar_sort,
        ) = self._resolver_layout_pagina_export(
            pagina, num_pag, doc_path, aplicar_layout, estado_app, cargar_progreso_libro
        )

        palabras_raw = self._extraer_palabras_pagina_export(
            pagina,
            num_pag,
            doc_path,
            ajustes,
            aplicar_layout,
            pag_cortes_v,
            pag_limites_h,
            pag_zonas,
            tiene_cortes_v,
            tiene_limites_h,
            usar_sort,
            _extraer_palabras_con_tipografia,
            _filtrar_palabras_por_exclusiones,
            organizar_palabras_con_cortes_y_limites,
        )

        oraciones_raw = procesar_oraciones_de_palabras(palabras_raw, dict_activo, filtros_externos=filtros, estructura_ia=est_ia)
        return self._filtrar_y_asignar_voces_oraciones(
            oraciones_raw,
            dict_activo,
            filtros,
            modo_teatro,
            obra_actual,
            voz_default,
            estado_app,
            aplicar_reemplazos,
        )

    def _es_inicio_seccion(self, texto: str) -> bool:
        t = (texto or "").strip()
        if not t or len(t) > 90:
            return False
        if re.match(r"^(?:cap[ií]tulo|secci[oó]n|parte|chapter|section|part|act|acto|escena)\b", t, re.IGNORECASE):
            return True
        letras = re.sub(r"[^a-zA-ZáéíóúÁÉÍÓÚñÑ]", "", t)
        return len(letras) >= 5 and letras.isupper() and len(t.split()) <= 10
