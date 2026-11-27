"""
Paquete modular de edición de PDF (subrayados, tipografías, geometría, layout y edición in-place).
Reexporta la API pública y helpers internos para mantener retrocompatibilidad total.
"""

from .comun import (
    asegurar_permiso_escritura,
    hex_to_rgb,
    normalizar_color,
    _guardar_documento_seguro,
    FUENTES_ESTANDAR,
    _MAPA_BASE14_FAMILIA,
    EQUIVALENCIAS_METRICAS,
    FLAG_ITALICO,
    FLAG_SERIF,
    FLAG_MONO,
    FLAG_NEGRITA,
)
from .fuentes import (
    invalidar_cache_fuentes,
    _dir_fuentes_locales,
    _rutas_directorios_fuentes_sistema,
    _extraer_info_nombre_fuente,
    limpiar_nombre_fuente,
    normalizar_clave_familia,
    detectar_negrita_cursiva,
    clasificar_familia,
    _cargar_objeto_fuente_ruta,
    _escanear_directorio_fuentes,
    obtener_indice_fuentes,
    buscar_fuente_en_indice,
    cargar_fuente_builtin,
    _fuente_soporta_texto,
    _buscar_fuente_embebida_completa,
    _buscar_fuente_fallback_unicode,
    verificar_fuente_disponible,
    resolver_fuente_completa,
    _dividir_runs_mixtos,
    medir_texto,
    _parchear_tounicode_espacio,
    _registrar_fuente_en_pagina,
    insertar_texto_con_fuente,
)
from .geometria import (
    _bboxes_similares,
    _extraer_geometria_drawings_detallada,
    _extraer_geometria_drawings,
    obtener_lineas_vectoriales,
    limitar_rect_a_vecinos,
    obtener_origen_linea_original,
    _unir_spans_texto,
    _recortar_rect_contra_vecinos,
    _inspeccionar_spans_en_rect,
    _muestrear_color_fondo,
    _calcular_caja_disponible,
)
from .subrayados import (
    agregar_subrayados_lote,
    eliminar_subrayados_area,
    eliminar_subrayado_punto,
    obtener_todos_subrayados,
    obtener_todos_subrayados_biblioteca,
    _recopilar_rects_subrayados_antiguos,
)
from .layout_texto import (
    _envolver_texto,
    _extraer_candidatos_subrayado_detalle,
    _extraer_candidatos_subrayado,
    _dividir_span_por_subrayados_rawdict,
    _normalizar_spans_entrada,
    _envolver_spans,
    _ajustar_y_renderizar_texto,
)
from .editor import (
    _construir_bloque_ocr,
    obtener_bloques_texto_pagina,
    editar_texto_pdf,
    agregar_anotacion_freetext,
)
