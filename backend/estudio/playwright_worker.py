"""
playwright_worker.py — Worker aislado de Playwright para LiraLoud.
Se ejecuta como subprocess independiente, completamente fuera del contexto
de gevent/eel, para evitar conflictos de monkey-patching.

Uso:
    python playwright_worker.py <url> <ruta_salida.pdf>

Devuelve por stdout una línea JSON con el resultado:
    {"ok": true, "titulo": "..."}
    {"ok": false, "error": "..."}
"""

import sys
import json
import time

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "Uso: playwright_worker.py <url> <ruta_pdf>"}))
        sys.exit(1)

    url     = sys.argv[1]
    ruta_pdf = sys.argv[2]

    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
    except ImportError:
        print(json.dumps({"ok": False, "error": "Playwright no está instalado en este entorno."}))
        sys.exit(1)

    chrome_args = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--js-flags=--max-old-space-size=256",
        "--disable-extensions",
        "--disable-default-apps",
        "--renderer-process-limit=1",
    ]

    try:
        with sync_playwright() as p:
            with p.chromium.launch(headless=True, args=chrome_args) as browser:
                with browser.new_context(
                    viewport={"width": 1280, "height": 900},
                    ignore_https_errors=True,
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/127.0.0.0 Safari/537.36"
                    ),
                ) as context:
                    page = context.new_page()

                    try:
                        # Tiempo máximo de 10 segundos. Si es pesada y no carga, aborta la espera y toma la foto.
                        page.goto(url, wait_until="load", timeout=10000)
                    except PlaywrightTimeout:
                        pass  # Continuar inmediatamente con lo que haya alcanzado a cargar

                    titulo = page.title() or url
                    
                    # Ocultar banners de cookies comunes mediante CSS
                    page.add_style_tag(content="""
                        #onetrust-consent-sdk,
                        #qc-cmp2-ui,
                        .cookie-banner,
                        .cookie-notice,
                        #cookie-notice,
                        #cookie-bar,
                        .cc-window,
                        .cc-banner,
                        .cookie-consent,
                        .cookie-popup,
                        #cookie-popup,
                        .optanon-alert-box-wrapper,
                        #BorlabsCookieBox,
                        .fc-consent-root {
                            display: none !important;
                        }
                    """)
                    
                    # Forzar CSS de pantalla para que el PDF sea 100% fiel a lo que el usuario ve
                    page.emulate_media(media="screen")



                    page.pdf(
                        path=ruta_pdf,
                        format="A4",
                        print_background=True,
                        margin={"top": "10mm", "right": "10mm", "bottom": "10mm", "left": "10mm"},
                    )

        print(json.dumps({"ok": True, "titulo": titulo}))

    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)[:200]}))
        sys.exit(1)


if __name__ == "__main__":
    main()
