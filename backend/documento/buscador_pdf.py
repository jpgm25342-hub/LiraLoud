import unicodedata
import pymupdf as fitz


def _norm_busq(s):
    return "".join(c for c in unicodedata.normalize("NFKD", str(s).lower()) if not unicodedata.combining(c))


def buscar_texto_en_doc(doc, query, max_resultados=150):
    """Busca todas las coincidencias de query en doc (exactas o flexibles sin tildes)."""
    if not doc or not query:
        return []

    resultados = []
    q_norm = _norm_busq(query).strip()
    for i in range(len(doc)):
        pagina = doc[i]
        instancias = pagina.search_for(query)
        if not instancias and q_norm:
            for w in pagina.get_text("words"):
                if q_norm in _norm_busq(w[4]):
                    instancias.append(fitz.Rect(w[0], w[1], w[2], w[3]))

        if instancias:
            texto_puro = pagina.get_text("text").replace("\n", " ")
            texto_norm = _norm_busq(texto_puro)
            idx = -1
            for inst in instancias:
                idx = texto_norm.find(q_norm, idx + 1) if q_norm else -1
                if idx != -1:
                    inicio = max(0, idx - 35)
                    fin = min(len(texto_puro), idx + len(q_norm) + 35)
                    snippet = "..." + texto_puro[inicio:fin].strip() + "..."
                else:
                    snippet = f"...{query}..."

                resultados.append({
                    "pagina": i + 1,
                    "frase": snippet,
                    "coords": [inst.x0, inst.y0, inst.x1, inst.y1]
                })
                if len(resultados) >= max_resultados:
                    break
            if len(resultados) >= max_resultados:
                break

    return resultados

