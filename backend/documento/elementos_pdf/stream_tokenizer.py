# LiraLoud - Tokenizador léxico de streams PDF
import re

_DELIMS = set(b"()<>[]{}/%")
_WHITESPACE = set(b"\x00\t\n\x0c\r ")


def _saltar_espacios_y_comentarios(data, i, n):
    while i < n:
        b = data[i]
        if b in _WHITESPACE:
            i += 1
        elif b == 37:  # '%'
            while i < n and data[i] not in (10, 13):
                i += 1
        else:
            break
    return i

def _leer_cadena_literal(data, i, n):
    start = i
    i += 1
    depth = 1
    while i < n and depth > 0:
        b = data[i]
        if b == 92:  # '\\'
            i += 2
        elif b == 40:  # '('
            depth += 1
            i += 1
        elif b == 41:  # ')'
            depth -= 1
            i += 1
        else:
            i += 1
    return ("str", data[start:i], start, i)

def _leer_diccionario_pdf(data, start, n):
    """Lee un diccionario PDF balanceado `<< ... >>` comenzando en `start`."""
    i = start + 2
    depth = 1
    while i < n and depth > 0:
        b = data[i]
        if b == 40:
            _, _, _, i = _leer_cadena_literal(data, i, n)
        elif b == 60 and i + 1 < n and data[i + 1] == 60:
            depth += 1
            i += 2
        elif b == 62 and i + 1 < n and data[i + 1] == 62:
            depth -= 1
            i += 2
        else:
            i += 1
    return ("dict", data[start:i], start, i)

def _leer_hex_o_dict(data, i, n):
    start = i
    if i + 1 < n and data[i + 1] == 60:  # '<<'
        return _leer_diccionario_pdf(data, start, n)

    i += 1
    while i < n and data[i] != 62:
        i += 1
    if i < n:
        i += 1
    return ("hex", data[start:i], start, i)

def _leer_array(data, i, n):
    start = i
    i += 1
    depth = 1
    while i < n and depth > 0:
        b = data[i]
        if b == 40:
            _, _, _, i = _leer_cadena_literal(data, i, n)
        elif b == 37:
            while i < n and data[i] not in (10, 13):
                i += 1
        elif b == 91:  # '['
            depth += 1
            i += 1
        elif b == 93:  # ']'
            depth -= 1
            i += 1
        else:
            i += 1
    return ("array", data[start:i], start, i)

def _avanzar_token_regular(data, pos, n):
    while pos < n and data[pos] not in _WHITESPACE and data[pos] not in _DELIMS:
        pos += 1
    return pos

def _leer_imagen_inline(data, start, i, n):
    """Escanea una imagen inline PDF (BI ... ID <binary> EI) y retorna (token, nuevo_i) o None."""
    j = i
    found_id = False
    while j < n:
        j = _saltar_espacios_y_comentarios(data, j, n)
        if j >= n:
            break
        bj = data[j]
        if bj == 40:
            _, _, _, j = _leer_cadena_literal(data, j, n)
        elif bj == 60:
            _, _, _, j = _leer_hex_o_dict(data, j, n)
        elif bj == 91:
            _, _, _, j = _leer_array(data, j, n)
        elif bj == 47:
            j = _avanzar_token_regular(data, j + 1, n)
        else:
            kw_start = j
            j = _avanzar_token_regular(data, j, n)
            if data[kw_start:j] == b"ID":
                found_id = True
                break
    if found_id:
        bin_start = j + 1 if j < n else j
        m = re.search(
            rb"[\x00\t\n\x0c\r ]EI(?=[\x00\t\n\x0c\r <>\[\]\{\}/%]|$)",
            data[bin_start:],
        )
        if m:
            ei_end = bin_start + m.end()
            return ("inline_img", None, start, ei_end), ei_end
    return None

def _tokenizar_stream(data):
    tokens = []
    n = len(data)
    i = 0
    while i < n:
        i = _saltar_espacios_y_comentarios(data, i, n)
        if i >= n:
            break
        b = data[i]

        if b == 40:  # '('
            tok = _leer_cadena_literal(data, i, n)
            tokens.append(tok)
            i = tok[3]
        elif b == 60:  # '<'
            tok = _leer_hex_o_dict(data, i, n)
            tokens.append(tok)
            i = tok[3]
        elif b == 91:  # '['
            tok = _leer_array(data, i, n)
            tokens.append(tok)
            i = tok[3]
        elif b == 47:  # '/'
            start = i
            i = _avanzar_token_regular(data, i + 1, n)
            tokens.append(("name", data[start:i].decode("latin1"), start, i))
        elif b in (123, 125, 93, 62, 41):  # '{', '}', ']', '>', ')'
            tokens.append(("op", data[i : i + 1], i, i + 1))
            i += 1
        else:
            start = i
            i = _avanzar_token_regular(data, i, n)
            raw = data[start:i]
            if raw == b"BI":
                res_inline = _leer_imagen_inline(data, start, i, n)
                if res_inline is not None:
                    tok_img, i = res_inline
                    tokens.append(tok_img)
                    continue
                tokens.append(("op", raw, start, i))
            else:
                try:
                    num = float(raw)
                    tokens.append(("num", num, start, i))
                except ValueError:
                    tokens.append(("op", raw, start, i))
    return tokens
