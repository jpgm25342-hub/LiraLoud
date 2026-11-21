# Estructura del Proyecto LiraLoud

Este documento describe la arquitectura modular de **LiraLoud**, diseñada para mantener una separación limpia de responsabilidades tanto en el backend de Python como en el frontend web sobre **pywebview (Edge WebView2)**.

---

## 📁 Estructura de Directorios

### 🐍 Backend (`app_principal.pyw` y `/backend/`)
- **`app_principal.pyw` (~140 líneas)**: Lanzador puro. Configura logs, identidad de proceso Win32, certificados SSL y variables de entorno de WebView2, importa todos los módulos RPC de `backend/` para registrarlos en el puente nativo y arranca la ventana principal de `pywebview`.
- **`/backend/core/`**: Núcleo e infraestructura transversal.
  - `estado_global.py`: Contenedor singleton `estado_app` (documento PDF activo, snapshots de página, colas de audio, locks y cachés en RAM).
  - `webview_bridge.py`: Puente bidireccional `eel` / `puente_webview` sobre `window.pywebview.api`.
  - `logger_config.py`: Sistema de logging persistente en `app.log`.
  - `gestor_archivos.py`: Lectura y escritura de todos los archivos `.json` de configuración y biblioteca.
  - `utils.py`: Funciones utilitarias puras (`safe_async_run`, `normalizar_texto`, `crear_regex_inmune_acentos`).
- **`/backend/audio/`**: Motores de síntesis de voz, streaming y multimedia.
  - `motor_audio.py`: Síntesis híbrida (Kokoro-82M, Pocket-TTS, Piper ONNX, Windows OneCore y Edge TTS), workers de horneado anticipado y streaming PCM.
  - `gestor_voces_rpc.py`: Endpoints RPC de catálogo de voces, tienda Hugging Face, laboratorio de mezclas/muestras Kokoro y clonación Pocket-TTS.
  - `kokoro_engine.py`, `pocket_engine.py`, `voice_catalogue.py`, `exportador_audio.py`, `media_control.py`.
- **`/backend/documento/`**: Procesamiento de PDF/Word, edición, layout y OCR.
  - `gestor_documento_rpc.py`: Endpoints RPC de carga de PDF/Word, renderizado de páginas, edición/subrayados, DocLayout-YOLO y RapidOCR.
  - `edicion_pdf.py`, `procesador_texto.py`, `buscador_pdf.py`, `ocr_engine.py`, `layout_engine.py`, `docx_engine.py`.
- **`/backend/ia/`**: Inteligencia Artificial, RAG y Traducción.
  - `rag_module.py`: Motor RAG con ChromaDB y citas trazables a coordenadas del PDF.
  - `traductor.py`: Traducción neuronal híbrida (online + Argos Translate offline).
  - `ollama_store.py` y `llm_providers/` (Ollama, Gemini, Groq, OpenAI, DeepSeek).
- **`/backend/estudio/`**: Servicios RPC generales, notas, extracciones y captura web/pantalla.
  - `servicios_rpc.py`: Endpoints RPC de SMTC, audio ducking, logs, búsqueda, traducción, tienda Ollama y LiraAI (RAG).
  - `gestor_notas.py`, `gestor_extracciones.py`, `captura_pantalla.py`, `web_reader.py`, `playwright_worker.py`, `servidor_extension.py`.

---

### 🌐 Frontend (`/web/`)
- `web/index.html`: Punto de entrada de la interfaz con secciones demarcadas.
- `/web/css/`: Estilos modulares (`base.css`, `layout.css`, `components.css`, `modals.css`, `animations.css`).
- `/web/js/core/`: `webview_bridge.js`, `bootstrap.js`, `estado.js`, `init.js`.
- `/web/js/audio/`: `motorPiper.js`, `gestorVoces.js`, `kokoroLab.js`, `voiceStore.js`, `audioStudio.js`.
- `/web/js/navegacion/`: `pdfManager.js`, `atajos.js`, `buscador.js`, `edicionPdf.js`, `subrayador.js`, `capturaExtraccion.js`, `webReader.js`.
- `/web/js/graficos/`: `karaoke.js`, `lienzo.js`.
- `/web/js/modulos/`: `ui.js`, `liraAi.js`, `notasEstudio.js`, `diccionario.js`, `teatro.js`, `traduccion.js`.
