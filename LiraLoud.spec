# -*- mode: python ; coding: utf-8 -*-
# ============================================================
# LiraLoud - Especificacion PyInstaller
# Genera un build "onedir" en dist\LiraLoud\
# Uso: python -m PyInstaller --noconfirm --clean LiraLoud.spec
# ============================================================
import os
from PyInstaller.utils.hooks import collect_all, collect_data_files

RUTA_RAIZ = os.path.abspath('.')

datas = [('web', 'web')]        # Interfaz servida por Eel (va a _internal/web)
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