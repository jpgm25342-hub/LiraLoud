# LiraLoud
# Copyright 2026 José Pablo González Macías
# Licensed under the Apache License, Version 2.0

import os
import time
import ctypes
from ctypes import wintypes
import threading
import tkinter as tk
from PIL import ImageGrab, ImageTk
from backend.core.estado_global import estado_app

BASE_DIR = estado_app.base_dir
TEMP_DIR = os.path.join(BASE_DIR, "temp_converted")
os.makedirs(TEMP_DIR, exist_ok=True)


class RECT(ctypes.Structure):
    _fields_ = [
        ("left", wintypes.LONG),
        ("top", wintypes.LONG),
        ("right", wintypes.LONG),
        ("bottom", wintypes.LONG),
    ]


def _enumerar_monitores():
    """Devuelve lista de rectángulos físicos (left, top, right, bottom) de cada monitor."""
    monitores = []
    MonitorEnumProc = ctypes.WINFUNCTYPE(
        wintypes.BOOL,
        wintypes.HMONITOR,
        wintypes.HDC,
        ctypes.POINTER(RECT),
        wintypes.LPARAM,
    )

    def _cb(hMonitor, hdcMonitor, lprcMonitor, dwData):
        r = lprcMonitor.contents
        monitores.append((r.left, r.top, r.right, r.bottom))
        return True

    ctypes.windll.user32.EnumDisplayMonitors(None, None, MonitorEnumProc(_cb), 0)
    return monitores


class MultiMonitorSnipper:
    """Crea una ventana overlay independiente en cada monitor físico (soporta X/Y negativos)."""

    def __init__(self, root, full_img, vx, vy, monitores):
        self.root = root
        self.root.withdraw()
        self.full_img = full_img
        self.vx = vx
        self.vy = vy
        self.result_bbox = None
        self.ventanas = []
        self._refs_img = []

        for (m_left, m_top, m_right, m_bottom) in monitores:
            mw = m_right - m_left
            mh = m_bottom - m_top
            if mw <= 0 or mh <= 0:
                continue

            crop_box = (m_left - vx, m_top - vy, m_right - vx, m_bottom - vy)
            sub_img = full_img.crop(crop_box).point(lambda p: int(p * 0.6))

            win = tk.Toplevel(self.root)
            win.overrideredirect(True)
            win.attributes("-topmost", True)
            win.geometry(f"{mw}x{mh}+{m_left}+{m_top}")
            win.config(cursor="cross", bg="black")

            canvas = tk.Canvas(
                win,
                width=mw,
                height=mh,
                highlightthickness=0,
                bd=0,
                bg="black",
            )
            canvas.pack(fill="both", expand=True)

            tk_img = ImageTk.PhotoImage(sub_img, master=win)
            self._refs_img.append(tk_img)
            canvas.create_image(0, 0, anchor="nw", image=tk_img)

            # Forzar ubicación física exacta en Win32 (incluso con X < 0 en monitor izquierdo)
            win.update_idletasks()
            hwnd = ctypes.windll.user32.GetParent(win.winfo_id()) or win.winfo_id()
            ctypes.windll.user32.SetWindowPos(hwnd, -1, m_left, m_top, mw, mh, 0x0040)
            canvas.update()

            estado = {"sx": None, "sy": None, "rect": None}

            def _on_press(ev, c=canvas, st=estado):
                st["sx"] = ev.x
                st["sy"] = ev.y
                st["rect"] = c.create_rectangle(
                    ev.x, ev.y, ev.x + 1, ev.y + 1,
                    outline="#38bdf8", width=2
                )

            def _on_drag(ev, c=canvas, st=estado):
                if st["rect"] is not None:
                    c.coords(st["rect"], st["sx"], st["sy"], ev.x, ev.y)

            def _on_release(ev, st=estado, ox=m_left - vx, oy=m_top - vy):
                if st["sx"] is None:
                    return
                x0 = min(st["sx"], ev.x) + ox
                y0 = min(st["sy"], ev.y) + oy
                x1 = max(st["sx"], ev.x) + ox
                y1 = max(st["sy"], ev.y) + oy
                if (x1 - x0) > 10 and (y1 - y0) > 10:
                    self.result_bbox = (x0, y0, x1, y1)
                self.cerrar()

            canvas.bind("<ButtonPress-1>", _on_press)
            canvas.bind("<B1-Motion>", _on_drag)
            canvas.bind("<ButtonRelease-1>", _on_release)
            win.bind("<Escape>", lambda e: self.cerrar())
            self.ventanas.append(win)

    def cerrar(self):
        for w in self.ventanas:
            try:
                w.destroy()
            except Exception:
                pass
        try:
            self.root.quit()
        except Exception:
            pass


def iniciar_captura_pantalla():
    """
    Oculta pywebview, captura todos los monitores, despliega un overlay nativo por
    cada pantalla física y restaura LiraLoud con repaint forzado de WebView2.
    """
    import webview
    ventana = webview.windows[0] if getattr(webview, "windows", None) else None

    if ventana:
        try:
            ventana.hide()
            time.sleep(0.25)
        except Exception:
            pass

    monitores = _enumerar_monitores()
    if not monitores:
        img_single = ImageGrab.grab()
        monitores = [(0, 0, img_single.width, img_single.height)]

    vx = min(m[0] for m in monitores)
    vy = min(m[1] for m in monitores)
    vr = max(m[2] for m in monitores)
    vb = max(m[3] for m in monitores)

    try:
        full_img = ImageGrab.grab(bbox=(vx, vy, vr, vb), all_screens=True)
    except Exception:
        full_img = ImageGrab.grab(all_screens=True)

    resultado = {"bbox": None}

    def _worker_tk():
        root = tk.Tk()
        app = MultiMonitorSnipper(root, full_img, vx, vy, monitores)
        root.mainloop()
        resultado["bbox"] = app.result_bbox
        try:
            root.destroy()
        except Exception:
            pass

    hilo = threading.Thread(target=_worker_tk, name="SnippingToolThread", daemon=True)
    hilo.start()
    hilo.join()

    if ventana:
        try:
            ventana.show()
            ventana.restore()
            ventana.evaluate_js(
                "window.dispatchEvent(new Event('resize'));"
                "requestAnimationFrame(() => { document.body.style.transform = 'translateZ(0)'; });"
            )
        except Exception:
            pass

    bbox = resultado["bbox"]
    if not bbox:
        return {"ok": False, "error": "Captura cancelada por el usuario."}

    try:
        cropped = full_img.crop(bbox)
        if cropped.mode != "RGB":
            cropped = cropped.convert("RGB")

        ts = int(time.time())
        ruta_pdf = os.path.join(TEMP_DIR, f"captura_{ts}.pdf")
        cropped.save(ruta_pdf, "PDF", resolution=100.0)

        return {"ok": True, "ruta": ruta_pdf, "titulo": f"Captura de Pantalla {ts}"}
    except Exception as e:
        return {"ok": False, "error": f"Error al procesar la captura: {str(e)[:150]}"}