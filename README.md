# LiraLoud v2.0

Lector de escritorio híbrido, local-first y de código abierto para documentos PDF y artículos web con síntesis de voz (TTS) multimotor, seguimiento tipo karaoke palabra por palabra, edición directa de PDF y asistente de estudio con IA local (RAG).

---

## Características principales

* **Cuatro motores TTS integrados:**
  * **Edge TTS:** Voces neuronales en la nube de alta naturalidad con soporte multilingüe.
  * **Piper TTS:** Síntesis neuronal 100 % offline y ultrarrápida mediante modelos ONNX (incluyendo voces personalizadas en español).
  * **Kokoro (StyleTTS 2):** Síntesis local expresiva con mezcla de estilos vocales (*voice blending*).
  * **Pocket:** Motor ligero para lectura continua de bajo consumo.
* **Lectura sincronizada e inmersiva:**
  * Resaltado tipo karaoke palabra por palabra sincronizado con el audio.
  * **Modo Teatro:** Asignación de múltiples voces y perfiles para diálogos o personajes.
  * **Audio Ducking y filtros DSP:** Ajuste de velocidad, tono y atenuación inteligente del audio de fondo.
  * Diccionario personalizable de abreviaturas y reglas de pronunciación.
* **Visor y editor avanzado de PDF / Web:**
  * Renderizado mediante **PyMuPDF (`fitz`)** con reconocimiento óptico de caracteres (**RapidOCR**) para documentos escaneados.
  * Subrayado en línea, notas contextuales, captura de recortes y edición directa sobre el PDF.
  * Regla de lectura y modo oscuro diseñado para reducir la fatiga visual en sesiones largas de estudio.
* **IA Local y RAG (Retrieval-Augmented Generation):**
  * Consulta y análisis contextual sobre los documentos abiertos mediante modelos locales (integración con **Ollama**), sin depender de servidores externos.
* **Exportación y privacidad:**
  * Exportación directa de capítulos o selecciones a **MP3**.
  * **Modo Privacidad** para trabajar completamente sin conexión.
  * Interfaz multilingüe con soporte **i18n / Unicode** (español, inglés, francés, alemán, portugués, ruso, hindi, bengalí, árabe y chino).

---

## Arquitectura del proyecto

En la versión **v2.0**, LiraLoud migró de una estructura monolítica a una arquitectura modular con separación de responsabilidades entre el backend en Python y la interfaz web ejecutada sobre **pywebview (Edge WebView2)**:

```text
LiraLoud/
├── app_principal.pyw          # Punto de entrada de la aplicación de escritorio
├── backend/                   # Lógica central en Python (motores TTS, PyMuPDF, OCR, RAG, edición PDF)
├── web/                       # Frontend modular (HTML, CSS y JS)
│   ├── componentes/           # Vistas, modales, barras de herramientas y menús contextuales
│   ├── css/                   # Tema oscuro, estilos de componentes y paneles
│   └── js/                    # Controladores de audio, visor PDF, i18n, IA y módulos de UI
├── LiraLoud.spec              # Configuración de empaquetado con PyInstaller
├── requirements.txt           # Dependencias de Python
├── ESTRUCTURA_PROYECTO.md     # Documentación técnica de módulos
└── documentacion.txt          # Guía de referencia interna
