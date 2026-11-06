"""Controlli geometrici e contenuti dei PDF generati dalla matrice TypeScript."""
import json
import subprocess
from pathlib import Path
import pdfplumber
from pypdf import PdfReader

base = Path('output/pdf/simulazioni-standard')
renders = Path('tmp/pdfs/matrice-standard')
renders.mkdir(parents=True, exist_ok=True)
manifest = json.loads((base / 'manifest.json').read_text())
for old in renders.glob('*.png'):
    old.unlink()
result = []
for case in manifest:
    path = base / (case['nome'] + '.pdf')
    reader = PdfReader(path)
    texts = [p.extract_text() for p in reader.pages]
    assert len(texts) == case['pagine']
    for n, text in enumerate(texts, 1):
        assert case['titolo'] in text, (case['nome'], n, 'titolo')
        assert case['azienda'] in text, (case['nome'], n, 'azienda')
        assert f'Pagina {n} di {len(texts)}' in text, (case['nome'], n, 'pagina')
    full = '\n'.join(texts)
    if case['prezziDaConfermare']:
        assert 'Prezzi da confermare' in full
        assert 'Totale ordine' not in full
    if case['tipo'] == 'economia':
        assert 'Totale IVA esclusa' in full
        assert 'Imponibile' not in full
        assert full.count('Totale intervento') == (15 if case['righe'] > 10 else 2)
    if 'multipagina' in case['nome']:
        assert len(texts) > 1
        # Non lasciare una pagina finale composta soltanto da testata e firme.
        assert len(texts[-1]) > 500, (case['nome'], 'pagina finale orfana')
    with pdfplumber.open(path) as pdf:
        for n, page in enumerate(pdf.pages, 1):
            outside = [w['text'] for w in page.extract_words() if w['x0'] < 35 or w['x1'] > 560 or w['top'] < 0 or w['bottom'] > 835]
            assert not outside, (case['nome'], n, outside)
    subprocess.run(['pdftoppm', '-scale-to', '1000', '-png', str(path), str(renders / case['nome'])], check=True, stderr=subprocess.DEVNULL)
    result.append({'caso': case['nome'], 'pagine': len(texts), 'esito': 'OK'})
(base / 'verifica.json').write_text(json.dumps(result, indent=2))
print(f"Verificati {len(result)} casi, {sum(c['pagine'] for c in result)} pagine: titoli, aziende, importi, gruppi, margini e piè di pagina.")
