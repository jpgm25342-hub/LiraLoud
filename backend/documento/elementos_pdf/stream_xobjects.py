# LiraLoud - Tokenizador de streams PDF y gestión de Form/Image XObjects
import re
from dataclasses import dataclass

import pymupdf as fitz

from .comun import _bbox_l1, _bbox_max_delta, _recargar_pagina_segura

from .stream_tokenizer import (
    _DELIMS,
    _WHITESPACE,
    _saltar_espacios_y_comentarios,
    _leer_cadena_literal,
    _leer_diccionario_pdf,
    _leer_hex_o_dict,
    _leer_array,
    _avanzar_token_regular,
    _leer_imagen_inline,
    _tokenizar_stream,
)


@dataclass
class _ImageOccurrence:
    xref: int
    bbox: tuple
    stream_xref: int
    span: tuple
    name: str
    form_chain: list
    ord_idx: int
    is_inline: bool = False


def _parsear_xobject_dict(obj_text):
    res = {}
    if not obj_text:
        return res
    for nombre, ref in re.findall(r"/([^\s/<>\[\]\(\)\{\}%]+)\s+(\d+)\s+\d+\s+R", obj_text):
        res["/" + nombre] = int(ref)
    return res


def _buscar_clave_xobject_en_resources(doc, owner_xref):
    """Resuelve (kind, val) de Resources/XObject en owner_xref o heredado por Parent."""
    actual = owner_xref
    seen = set()
    while actual not in seen:
        seen.add(actual)
        r_kind, r_val = doc.xref_get_key(actual, "Resources")
        if r_kind == "xref":
            return doc.xref_get_key(int(r_val.split()[0]), "XObject")
        if r_kind == "dict":
            return doc.xref_get_key(actual, "Resources/XObject")
        if r_kind != "null":
            break
        p_kind, p_val = doc.xref_get_key(actual, "Parent")
        if p_kind != "xref":
            break
        actual = int(p_val.split()[0])
    return "null", ""


def _resolver_xobjects(doc, owner_xref, page=None):
    xobj_map = {}
    try:
        xo_kind, xo_val = _buscar_clave_xobject_en_resources(doc, owner_xref)

        if xo_kind == "xref":
            xo_xref = int(xo_val.split()[0])
            xobj_map.update(_parsear_xobject_dict(doc.xref_object(xo_xref)))
        elif xo_kind == "dict":
            xobj_map.update(_parsear_xobject_dict(xo_val))
    except Exception:
        pass

    if not xobj_map and page is not None and owner_xref == page.xref:
        try:
            for item in page.get_images(full=True):
                if len(item) >= 10 and int(item[9]) == 0 and item[7]:
                    xobj_map["/" + str(item[7]).lstrip("/")] = int(item[0])
        except Exception:
            pass

    return xobj_map


def _parsear_matriz_pdf(doc, form_xref):
    try:
        kind, val = doc.xref_get_key(form_xref, "Matrix")
        if kind == "array":
            nums = [float(x) for x in re.findall(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)", val)]
            if len(nums) >= 6:
                return fitz.Matrix(nums[0], nums[1], nums[2], nums[3], nums[4], nums[5])
    except Exception:
        pass
    return fitz.Matrix(1, 0, 0, 1, 0, 0)


def _bbox_desde_ctm(ctm, page):
    if getattr(page, "rotation", 0) % 360 != 0:
        cb = page.cropbox
        mb = page.mediabox
        tmat = fitz.Matrix(1.0, 0.0, 0.0, -1.0, -cb.x0, mb.y1 - cb.y0)
    else:
        tmat = page.transformation_matrix
    full = ctm * tmat
    pts = [
        fitz.Point(u, v) * full
        for u, v in ((0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0))
    ]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def _recolectar_instancias_do(doc, page):
    occurrences = []
    form_call_counts = {}
    counter = [0]

    def _procesar_stream(stream_xref, owner_xref, xobj_map, form_chain, ctm, stack):
        raw = doc.xref_stream(stream_xref)
        if not raw:
            return ctm
        tokens = _tokenizar_stream(raw)
        operands = []

        for tok_type, tok_val, start, end in tokens:
            if tok_type == "inline_img":
                bbox = _bbox_desde_ctm(ctm, page)
                occurrences.append(
                    _ImageOccurrence(
                        xref=0,
                        bbox=bbox,
                        stream_xref=stream_xref,
                        span=(start, end),
                        name="BI",
                        form_chain=list(form_chain),
                        ord_idx=counter[0],
                        is_inline=True,
                    )
                )
                counter[0] += 1
                operands.clear()
                continue

            if tok_type != "op":
                operands.append((tok_type, tok_val, start, end))
                continue

            if tok_val == b"q":
                stack.append(fitz.Matrix(ctm))
                operands.clear()
            elif tok_val == b"Q":
                if stack:
                    ctm = stack.pop()
                operands.clear()
            elif tok_val == b"cm":
                if len(operands) >= 6 and all(op[0] == "num" for op in operands[-6:]):
                    a, b, c, d, e, f = [op[1] for op in operands[-6:]]
                    ctm = fitz.Matrix(a, b, c, d, e, f) * ctm
                operands.clear()
            elif tok_val == b"Do":
                if operands and operands[-1][0] == "name":
                    _, name_str, name_start, _ = operands[-1]
                    res_xref = xobj_map.get(name_str)
                    if res_xref:
                        if doc.xref_is_image(res_xref):
                            bbox = _bbox_desde_ctm(ctm, page)
                            occurrences.append(
                                _ImageOccurrence(
                                    xref=int(res_xref),
                                    bbox=bbox,
                                    stream_xref=stream_xref,
                                    span=(name_start, end),
                                    name=name_str,
                                    form_chain=list(form_chain),
                                    ord_idx=counter[0],
                                    is_inline=False,
                                )
                            )
                            counter[0] += 1
                        else:
                            try:
                                _, sub_val = doc.xref_get_key(res_xref, "Subtype")
                            except Exception:
                                sub_val = ""
                            if sub_val == "/Form":
                                form_call_counts[res_xref] = form_call_counts.get(res_xref, 0) + 1
                                if not any(step["form_xref"] == res_xref for step in form_chain):
                                    form_mat = _parsear_matriz_pdf(doc, res_xref)
                                    has_res = doc.xref_get_key(res_xref, "Resources")[0] != "null"
                                    form_xobj = (
                                        _resolver_xobjects(doc, res_xref)
                                        if has_res
                                        else xobj_map
                                    )
                                    step = {
                                        "form_xref": int(res_xref),
                                        "owner_xref": int(owner_xref),
                                        "call_stream_xref": int(stream_xref),
                                        "call_span": (name_start, end),
                                        "call_name": name_str,
                                    }
                                    _procesar_stream(
                                        int(res_xref),
                                        int(res_xref),
                                        form_xobj,
                                        form_chain + [step],
                                        form_mat * ctm,
                                        [],
                                    )
                operands.clear()
            else:
                operands.clear()

        return ctm

    page_xobj_map = _resolver_xobjects(doc, page.xref, page=page)
    ctm_global = fitz.Matrix(1, 0, 0, 1, 0, 0)
    stack_global = []
    for cx in page.get_contents():
        ctm_global = _procesar_stream(
            int(cx), int(page.xref), page_xobj_map, [], ctm_global, stack_global
        )

    return occurrences, form_call_counts


def _contar_refs_form_en_doc(doc, form_xref):
    """Cuenta cuántas veces aparece referenciado `form_xref` en las páginas (y Form XObjects) del PDF."""
    total = 0
    target = int(form_xref)
    try:
        for p in doc:
            xmap = _resolver_xobjects(doc, p.xref, page=p)
            cola = list(xmap.values())
            visitados_page = set()
            while cola:
                rx = int(cola.pop(0))
                if rx == target:
                    total += 1
                if rx in visitados_page:
                    continue
                visitados_page.add(rx)
                try:
                    if doc.xref_get_key(rx, "Subtype")[1] == "/Form":
                        sub_xmap = _resolver_xobjects(doc, rx)
                        cola.extend(sub_xmap.values())
                except Exception:
                    pass
    except Exception:
        pass
    return total


def _buscar_resources_heredados(doc, start_xref):
    """Recorre /Parent desde `start_xref` buscando el diccionario /Resources heredado."""
    p_kind, p_val = doc.xref_get_key(start_xref, "Parent")
    seen = {int(start_xref)}
    while p_kind == "xref":
        px = int(p_val.split()[0])
        if px in seen:
            break
        seen.add(px)
        r_kind, r_val = doc.xref_get_key(px, "Resources")
        if r_kind == "xref":
            return doc.xref_object(int(r_val.split()[0]))
        if r_kind == "dict":
            return r_val
        p_kind, p_val = doc.xref_get_key(px, "Parent")
    return None


def _clonar_resources_en_owner(doc, owner_xref, res_dict_str):
    """Materializa una copia aislada de /Resources en `owner_xref` (clonando /XObject si era indirecto)."""
    local_res_xref = doc.get_new_xref()
    doc.update_object(local_res_xref, res_dict_str)
    xo_kind, xo_val = doc.xref_get_key(local_res_xref, "XObject")
    if xo_kind == "xref":
        old_xo_xref = int(xo_val.split()[0])
        new_xo_xref = doc.get_new_xref()
        doc.update_object(new_xo_xref, doc.xref_object(old_xo_xref))
        doc.xref_set_key(local_res_xref, "XObject", f"{new_xo_xref} 0 R")
    doc.xref_set_key(owner_xref, "Resources", f"{local_res_xref} 0 R")
    return local_res_xref


def _asignar_xobject_en_owner(doc, owner_xref, nombre_sin_slash, target_xref, fallback_owner_xref=None):
    res_kind, res_val = doc.xref_get_key(owner_xref, "Resources")

    if res_kind == "null":
        inherited_str = _buscar_resources_heredados(doc, owner_xref)
        if inherited_str is None and fallback_owner_xref is not None:
            fk, fv = doc.xref_get_key(fallback_owner_xref, "Resources")
            if fk == "xref":
                inherited_str = doc.xref_object(int(fv.split()[0]))
            elif fk == "dict":
                inherited_str = fv
            elif fk == "null":
                inherited_str = _buscar_resources_heredados(doc, fallback_owner_xref)
        if inherited_str is not None:
            local_res_xref = _clonar_resources_en_owner(doc, owner_xref, inherited_str)
            res_kind, res_val = "xref", f"{local_res_xref} 0 R"
        else:
            doc.xref_set_key(
                owner_xref,
                f"Resources/XObject/{nombre_sin_slash}",
                f"{target_xref} 0 R",
            )
            return

    if res_kind == "xref":
        res_xref = int(res_val.split()[0])
        xo_kind, xo_val = doc.xref_get_key(res_xref, "XObject")
        if xo_kind == "xref":
            xo_xref = int(xo_val.split()[0])
            doc.xref_set_key(xo_xref, nombre_sin_slash, f"{target_xref} 0 R")
        else:
            doc.xref_set_key(res_xref, f"XObject/{nombre_sin_slash}", f"{target_xref} 0 R")
        return

    xo_kind, xo_val = doc.xref_get_key(owner_xref, "Resources/XObject")
    if xo_kind == "xref":
        old_xo_xref = int(xo_val.split()[0])
        new_xo_xref = doc.get_new_xref()
        doc.update_object(new_xo_xref, doc.xref_object(old_xo_xref))
        doc.xref_set_key(owner_xref, "Resources/XObject", f"{new_xo_xref} 0 R")
        doc.xref_set_key(new_xo_xref, nombre_sin_slash, f"{target_xref} 0 R")
    else:
        doc.xref_set_key(
            owner_xref,
            f"Resources/XObject/{nombre_sin_slash}",
            f"{target_xref} 0 R",
        )


def _xref_tiene_resources(doc, xref):
    try:
        return doc.xref_get_key(xref, "Resources")[0] != "null"
    except Exception:
        return False


def _clonar_y_reasignar_form_xobject(doc, fx, ox, csx, step, tiene_hijos, ox_has_res, last_res_owner_xref):
    """Clona un Form XObject compartido, aísla sus Resources si tiene hijos y reescribe su invocación Do."""
    new_fx = doc.get_new_xref()
    doc.update_object(new_fx, doc.xref_object(fx))
    raw_fx = doc.xref_stream(fx)
    if raw_fx is not None:
        doc.update_stream(new_fx, raw_fx)

    # Si este Form XObject tiene hijos en la cadena y /Resources o /XObject indirectos, aislarlos
    if tiene_hijos:
        rk, rv = doc.xref_get_key(new_fx, "Resources")
        if rk == "xref":
            _clonar_resources_en_owner(doc, new_fx, doc.xref_object(int(rv.split()[0])))
        elif rk == "dict":
            xok, _ = doc.xref_get_key(new_fx, "Resources/XObject")
            if xok == "xref":
                _clonar_resources_en_owner(doc, new_fx, rv)

    existing_xmap = _resolver_xobjects(doc, ox)
    if not ox_has_res and last_res_owner_xref != ox:
        existing_xmap = {**_resolver_xobjects(doc, last_res_owner_xref), **existing_xmap}
    n_idx = 0
    while True:
        cand = f"LiraFm{new_fx}_{n_idx}"
        if ("/" + cand) not in existing_xmap:
            break
        n_idx += 1

    _asignar_xobject_en_owner(
        doc,
        ox,
        cand,
        new_fx,
        fallback_owner_xref=last_res_owner_xref,
    )
    raw_parent = doc.xref_stream(csx)
    ns, de = step["call_span"]
    new_call = f"/{cand} Do".encode("latin1")
    doc.update_stream(csx, raw_parent[:ns] + new_call + raw_parent[de:])
    return new_fx


def _clonar_form_chain_si_compartido(doc, occ, form_call_counts):
    if not occ.form_chain:
        return occ.stream_xref

    target_stream_xref = occ.stream_xref
    owner_override = None
    stream_override = None
    any_cloned = False
    last_res_owner_xref = occ.form_chain[0]["owner_xref"]
    ultimo_idx = len(occ.form_chain) - 1

    for idx_step, step in enumerate(occ.form_chain):
        fx = step["form_xref"]
        ox = owner_override if owner_override is not None else step["owner_xref"]
        csx = stream_override if stream_override is not None else step["call_stream_xref"]

        ox_has_res = _xref_tiene_resources(doc, ox)
        if ox_has_res:
            last_res_owner_xref = ox

        es_compartido = (
            any_cloned
            or form_call_counts.get(fx, 0) > 1
            or _contar_refs_form_en_doc(doc, fx) > 1
        )
        if es_compartido:
            any_cloned = True
            next_fx = _clonar_y_reasignar_form_xobject(
                doc, fx, ox, csx, step, idx_step < ultimo_idx, ox_has_res, last_res_owner_xref
            )
            if idx_step == ultimo_idx:
                target_stream_xref = next_fx
        else:
            next_fx = fx

        owner_override = next_fx
        stream_override = next_fx
        if _xref_tiene_resources(doc, next_fx):
            last_res_owner_xref = next_fx

    return target_stream_xref


def _seleccionar_ocurrencia_imagen(occurrences, target_xref, bbox_original, index=None):
    """Filtra y selecciona la ocurrencia de imagen más cercana al target_xref y bbox_original."""
    target_xref = int(target_xref or 0)
    if target_xref > 0:
        cands = [o for o in occurrences if not o.is_inline and o.xref == target_xref]
    else:
        cands = [o for o in occurrences if o.is_inline]

    if not cands:
        cands = [o for o in occurrences if _bbox_max_delta(o.bbox, bbox_original) <= 2.5]

    if not cands:
        raise RuntimeError(
            f"No se encontró la instancia objetivo (xref={target_xref}) en el contenido de la página."
        )

    def _score(o):
        l1 = round(_bbox_l1(o.bbox, bbox_original), 4)
        idx_diff = abs(o.ord_idx - int(index)) if index is not None else 0
        return (l1, idx_diff)

    elegida = min(cands, key=_score)
    if _bbox_l1(elegida.bbox, bbox_original) > 12.0:
        raise RuntimeError("La instancia encontrada difiere demasiado del bbox objetivo.")
    return elegida


def _remover_instancia_imagen(doc, page, target_xref, bbox_original, index=None):
    occurrences, form_call_counts = _recolectar_instancias_do(doc, page)
    if not occurrences:
        raise RuntimeError("No se encontraron instancias de imagen en el stream de la página.")

    elegida = _seleccionar_ocurrencia_imagen(occurrences, target_xref, bbox_original, index=index)

    stream_xref = _clonar_form_chain_si_compartido(doc, elegida, form_call_counts)
    raw = doc.xref_stream(stream_xref)
    start, end = elegida.span
    if start < 0 or end > len(raw) or end <= start:
        raise RuntimeError("Span inválido al remover instancia de imagen.")

    blanco = b" " * (end - start)
    doc.update_stream(stream_xref, raw[:start] + blanco + raw[end:])
    page = _recargar_pagina_segura(doc, page)
    return page, elegida
