# LiraLoud - Paquete modular de manipulación de elementos PDF
from .anotaciones import (
    crear_figura_pdf,
    editar_figura_pdf,
    eliminar_freetext,
    mover_redimensionar_freetext,
)
from .capas import (
    cambiar_capa_elemento_pdf,
    obtener_elementos_pagina,
)
from .comun import _guardar_cambio_pdf
from .imagenes import (
    eliminar_imagen,
    insertar_imagen_pdf,
    mover_imagen,
    recortar_zona_como_imagen_pdf,
    redimensionar_imagen,
    reemplazar_imagen,
    rotar_imagen,
)

__all__ = [
    'obtener_elementos_pagina',
    'insertar_imagen_pdf',
    'recortar_zona_como_imagen_pdf',
    'mover_imagen',
    'redimensionar_imagen',
    'reemplazar_imagen',
    'rotar_imagen',
    'eliminar_imagen',
    'mover_redimensionar_freetext',
    'eliminar_freetext',
    'crear_figura_pdf',
    'editar_figura_pdf',
    'cambiar_capa_elemento_pdf',
    '_guardar_cambio_pdf',
]
