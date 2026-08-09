# Estructura del Proyecto LiraLoud

Este documento describe la nueva arquitectura modular del proyecto. Hemos abandonado los archivos monolíticos para adoptar un enfoque basado en componentes lógicos, lo cual facilita enormemente la depuración, escalabilidad y mantenimiento del código por cualquier desarrollador.

---

## 📁 Estructura de Directorios

### 🐍 Backend (Python)
El servidor ahora tiene una arquitectura híbrida que maximiza la limpieza sin comprometer la estabilidad asíncrona de `Eel`.

- **`app_principal.pyw`**: Archivo maestro. Mantiene exclusivamente la lógica asíncrona de audio (motores Piper y Edge), rutinas de alto rendimiento, y el renderizado del PDF, al estar fuertemente atados al estado de la memoria global.
- **/backend/**: Módulos independientes y seguros.
  - `gestor_archivos.py`: Centraliza la persistencia. Encargado de leer/escribir los `.json` (diccionario, ajustes, favoritos).
  - `utils.py`: Herramientas puras y sanitización (limpieza de texto, filtros anti-acentos).

### 🌐 Frontend (HTML y CSS)
Ubicados en la carpeta `/web/`.

- `index.html`: Punto de entrada unificado. Ahora cuenta con **etiquetas estructurales** (`<!-- ======= -->`) que dividen lógicamente el código en secciones visuales (Banner, Visor, Modales, etc.).
- `/web/css/`: El monolito `style.css` fue atomizado en módulos especializados:
  - `base.css`: Estilos estructurales y configuración básica.
  - `layout.css`: Contenedores principales (banner, visor).
  - `components.css`: Inputs, botones globales, y menús contextuales.
  - `modals.css`: Modales interactivos (Configuración, Teatro, Descarga, Diccionario).
  - `animations.css`: Transiciones y animaciones clave (Drag & Drop, pantalla de carga).

### ⚙️ Lógica de Negocio (JavaScript)
Ubicados en la carpeta `/web/js/`. El archivo original `script.js` fue diseccionado manteniendo el scope global inalterado para preservar la integridad de las funciones originales:

- **/core/**
  - `estado.js`: Contiene todas las variables globales y de sesión.
  - `init.js`: Rutas de inicialización, promesas de carga (`forzarCargaPiper`) y hooks del DOM.

- **/navegacion/**
  - `pdfManager.js`: Controlador de la paginación, zoom, carga del canvas y búfer extendido.
  - `atajos.js`: Manejadores del teclado para la experiencia fluida del usuario.

- **/audio/**
  - `motorPiper.js`: Núcleo de reproducción de texto a voz, sincronización con Eel y rutinas "Gapless DJ".
  - `gestorVoces.js`: Manejo de selectores de voces, idiomas y lista de favoritos en vivo.

- **/graficos/**
  - `karaoke.js`: Motor de renderizado en canvas para el seguimiento de lectura (resaltado, cálculo de progreso).
  - `lienzo.js` (Opcional, integrado según sección visual).

- **/modulos/**
  - `ui.js`: Controladores para interactividad de modales avanzados (Teatro, Diccionario, Exportación MP3) y reordenamientos visuales drag-and-drop.

---

## 🚀 Cómo Modificar el Proyecto
- **Si necesitas añadir un nuevo botón**: Añade el HTML en `index.html`, crea la clase en `css/components.css` y asigna su lógica en `js/modulos/ui.js` o `js/navegacion/atajos.js`.
- **Si hay un error en el audio**: Depura exclusivamente en `js/audio/motorPiper.js`. Las variables de estado las encontrarás en `js/core/estado.js`.
- **Si hay un error en el backend**: Todo el puente asíncrono hacia Python está en `app_principal.pyw`.
