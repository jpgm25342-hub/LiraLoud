import os
import sys
import queue
import threading


class EstadoApp:
    """Contenedor centralizado y thread-safe del estado global de LiraLoud."""

    def __init__(self):
        if getattr(sys, "frozen", False):
            self.base_dir = os.path.dirname(sys.executable)
            self.bundle_dir = getattr(sys, "_MEIPASS", self.base_dir)
        else:
            self.base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            self.bundle_dir = self.base_dir

        self.directorio_piper = os.path.join(self.base_dir, "piper_voices")
        self.icono_path = os.path.join(self.base_dir, "web", "LiraLoud.ico")

        self.lock_edicion_pdf = threading.RLock()
        self.doc = None
        self.ruta_pdf_actual = ""
        self.tipo_documento = "pdf"
        self.pagina_actual_global = 0

        # Snapshots de la página activa
        self.snapshot_oraciones_raw = []
        self.snapshot_palabras_raw = []
        self.snapshot_cortes_v = []
        self.snapshot_limites_h = {}
        self.snapshot_zonas_excluidas = []
        self.cache_estructura_layout = {}
        self.layouts_por_pagina = {}
        self.layout_lookahead_token = 0

        # Colas y caché de streaming de audio
        self.audio_queue = queue.Queue()
        self.cola_horno = queue.Queue()
        self.cola_de_trabajo = queue.Queue()
        self.pasteleria_dict = {}
        self.pasteleria_epoch = 0
        self.textos_en_proceso = set()

        # Control de reproducción, hilos background y privacidad
        self.streaming_active = False
        self.stream_counter = 0
        self.abortar_renderizado = False
        self.hilo_rendimiento_actual = None
        self.abortar_pretraduccion = False
        self.hilo_pretraduccion_actual = None
        self.abortar_batch_ocr = False
        self.hilo_batch_ocr = None
        self.pre_cache_ocr_token = 0
        self.exportacion_activa = False
        self.modo_privacidad_estricta = False
        self.voz_teatro_persistente = None

        # Caché de voces en RAM
        self.voces_cargadas = {}
        self.voces_uso_tiempo = {}
        self.catalogo_edge_cache = {}
        self.voces_disponibles = []


estado_app = EstadoApp()
