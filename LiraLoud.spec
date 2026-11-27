# -*- mode: python ; coding: utf-8 -*-
# ============================================================
# LiraLoud - Especificacion PyInstaller
# Genera un build "onedir" en dist\LiraLoud\
# Uso: python -m PyInstaller --noconfirm --clean LiraLoud.spec
# ============================================================
import os
from PyInstaller.utils.hooks import collect_all, collect_data_files

RUTA_RAIZ = os.path.abspath('.')

datas = [('web', 'web')]        # Interfaz servida por pywebview (va a _internal/web)
for extra_src, extra_dst in [
    ('layout_models', 'layout_models'),
    ('cache_tutorial_audio', 'cache_tutorial_audio'),
    ('recursos', 'recursos'),
    ('CREDITS.txt', '.'),
    ('backend/estudio/playwright_worker.py', 'backend/estudio'),
]:
    if os.path.exists(os.path.join(RUTA_RAIZ, extra_src)):
        datas.append((extra_src, extra_dst))

binaries = []
hiddenimports = []


def colectar(modulo):
    try:
        d, b, h = collect_all(modulo)
        return d, b, h
    except Exception as e:
        print(f'[AVISO] No se pudo colectar {modulo}: {e}')
        return [], [], []


# Paquetes que requieren datos/binarios adicionales empaquetados
for m in [
    'rapidocr_onnxruntime',   # Modelos ONNX de OCR
    'onnxruntime',            # Motor ONNX (DocLayout-YOLO / Kokoro / OCR)
    'kokoro_onnx',            # Motor Kokoro TTS
    'espeakng_loader',        # Fonemizador Kokoro
    'phonemizer',
    'dlinfo',
    'chromadb',               # Vector DB persistente
    'argostranslate',         # Traduccion offline
    'ctranslate2',            # Motor de Argos
    'winsdk',                 # Voz OneCore / pausa inteligente
    'comtypes',               # pycaw / audio ducking
    'pycaw',
]:
    d, b, h = colectar(m)
    datas += d
    binaries += b
    hiddenimports += h

# piper: datos de fonematizacion (espeak-ng-data, tashkeel)
try:
    piper_datas = collect_data_files(
        'piper',
        includes=['espeak-ng-data/**', 'tashkeel/**'],
        excludes=['train/**'],
    )
    datas += piper_datas
except Exception as e:
    print(f'[AVISO] No se pudo colectar piper: {e}')

# pywebview y soporte WebView2 / pythonnet
for m_wv in ['webview', 'pythonnet', 'clr_loader']:
    d, b, h = colectar(m_wv)
    datas += d
    binaries += b
    hiddenimports += h
hiddenimports += [
    'webview',
    'webview.platforms.edgechromium',
    'webview.platforms.winforms',
    'clr',
    'bottle',
    'sqlite3',
    '_sqlite3',
    'backend.documento.elementos_pdf',
    'backend.documento.elementos_pdf.comun',
    'backend.documento.elementos_pdf.stream_xobjects',
    'backend.documento.elementos_pdf.imagenes',
    'backend.documento.elementos_pdf.anotaciones',
    'backend.documento.elementos_pdf.capas',
    'backend.documento.ocr_modelos',
    'backend.documento.historial_pdf',
    'backend.documento.gestor_fuentes',
    'backend.ia.fts_store',
]

a = Analysis(
    ['app_principal.pyw'],
    pathex=[RUTA_RAIZ],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    exclude_binaries=True,
    name='LiraLoud',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,                 # Ventana de app (sin consola)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='LiraLoud.ico',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='LiraLoud',
)