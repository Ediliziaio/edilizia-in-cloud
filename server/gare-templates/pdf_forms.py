import io, json, re, sys
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject
from reportlab.pdfbase.pdfmetrics import stringWidth

request = json.load(sys.stdin)
raw = Path(request['source']).read_bytes()
if b'/ByteRange' in raw or b'/JavaScript' in raw or b'/OpenAction' in raw:
    raise ValueError('PDF firmato o con azioni attive: conservare l’originale e compilare con il percorso manuale.')
reader = PdfReader(io.BytesIO(raw))
if reader.is_encrypted:
    raise ValueError('PDF cifrato: compilazione automatica non supportata.')
form = reader.trailer['/Root'].get('/AcroForm')
if form and form.get_object().get('/XFA'):
    raise ValueError('PDF XFA non supportato: percorso manuale.')
fields = reader.get_fields() or {}
if not fields:
    raise ValueError('PDF senza campi AcroForm canonici. Usare il percorso manuale.')
widgets = {}
for page_index, page in enumerate(reader.pages):
    for ref in page.get('/Annots', []):
        annotation = ref.get_object()
        if annotation.get('/Subtype') != '/Widget':
            continue
        parent = annotation.get('/Parent')
        parent = parent.get_object() if parent else None
        name = annotation.get('/T') or (parent.get('/T') if parent else None)
        if name:
            widgets.setdefault(str(name), []).append((annotation, page_index + 1, parent))
result = []
for name, field in fields.items():
    field_type = str(field.get('/FT', ''))
    flags = int(field.get('/Ff', 0))
    entries = widgets.get(name, [])
    reason = ''
    options=[]
    if field_type == '/Btn' and not(flags & 65536):
        options=sorted({str(k).lstrip('/') for widget,_,_ in entries for k in (widget.get('/AP',{}).get('/N',{}).keys()) if str(k)!='/Off'})
        if not options:reason='Stati del campo di scelta non disponibili'
        elif len(options)>1 and not(flags & 32768):reason='Caselle omonime ambigue: compilazione manuale'
        options=['Off']+options
    elif field_type=='/Ch' and not(flags & 2097152):
        options=[str(v[0] if isinstance(v,list) else v) for v in field.get('/Opt',[])]
        if not options:reason='Scelte del PDF non disponibili'
    elif field_type != '/Tx': reason = 'Tipo di campo non supportato: compilazione manuale'
    if flags & 1: reason = 'Campo di sola lettura preservato'
    elif field_type=='/Tx' and flags & (4096 | 8192 | 1048576 | 16777216 | 33554432): reason = 'Campo multilinea fuori dalla famiglia inizialmente supportata'
    elif not entries: reason = 'Widget non riscontrato nel documento'
    elif len(entries) > 1 and any(parent is None for _, _, parent in entries): reason = 'Campi omonimi ambigui da verificare'
    rect = entries[0][0].get('/Rect', [0, 0, 0, 0]) if entries else [0, 0, 0, 0]
    da = str((entries[0][0].get('/DA') if entries else None) or field.get('/DA') or '/Helv 10 Tf')
    match = re.search(r'/([^\s]+)\s+([\d.]+)\s+Tf', da)
    font_size = float(match.group(2)) if match else 10
    if not reason and field_type in('/Tx','/Ch') and match and match.group(1) not in ('Helv', 'Helvetica', 'Arial'):
        reason = 'Font del campo da verificare: compilazione manuale'
    if entries:
        widths = [float(w.get('/Rect', [0,0,0,0])[2])-float(w.get('/Rect', [0,0,0,0])[0]) for w,_,_ in entries]
        width = min(widths)
        heights = [float(w.get('/Rect', [0,0,0,0])[3])-float(w.get('/Rect', [0,0,0,0])[1]) for w,_,_ in entries]
        if not reason and field_type in('/Tx','/Ch') and (font_size or 10)+4 > min(heights): reason = 'Campo troppo basso per il font: compilazione manuale'
    else: width = 0
    result.append({'key': name, 'label': str(field.get('/TU') or name), 'options':options, 'value': str(field.get('/V', '')), 'required': bool(flags & 2),
                   'supported': not reason, 'reason': reason, 'max_length': field.get('/MaxLen'),
                   'width': width, 'font_size': font_size or 10,
                   'page': entries[0][1] if entries else None, 'type': field_type})
if request['operation'] == 'inspect':
    print(json.dumps({'fields': result, 'pages': len(reader.pages), 'format': 'pdf_acroform'}, ensure_ascii=False))
else:
    values = request['values']
    allowed = {f['key']: f for f in result if f['supported']}
    if any(key not in allowed for key in values):
        raise ValueError('Tentativo di compilare un campo non supportato o protetto.')
    for name, value in values.items():
        meta = allowed[name]
        if meta['type'] in('/Btn','/Ch'):
            if value and value not in meta['options']:raise ValueError(f'Scelta non prevista nel campo {name}')
            continue
        try: value.encode('cp1252')
        except UnicodeEncodeError: raise ValueError(f'Caratteri non supportati dal font in {name}: compilazione manuale.')
        if '\n' in value or '\r' in value:
            raise ValueError(f'Il campo {name} richiede una sola riga.')
        if meta['max_length'] and len(value) > int(meta['max_length']):
            raise ValueError(f'Testo troppo lungo nel campo {name}.')
        if stringWidth(value, 'Helvetica', meta['font_size']) > max(0, meta['width'] - 8):
            raise ValueError(f'Il testo non entra nel campo {name}: abbreviare o compilare manualmente.')
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    typed={name:('/'+(value or 'Off') if allowed[name]['type']=='/Btn' else value) for name,value in values.items()}
    writer.update_page_form_field_values(None, typed, auto_regenerate=False)
    output = io.BytesIO()
    writer.write(output)
    written = PdfReader(io.BytesIO(output.getvalue()))
    after = written.get_fields() or {}
    for name, expected in typed.items():
        if name not in after or str(after[name].get('/V', '')) != expected:
            raise ValueError(f'Valore canonico non verificato: {name}')
    for page in written.pages:
        for ref in page.get('/Annots', []):
            widget = ref.get_object()
            if widget.get('/Subtype') != '/Widget': continue
            parent = widget.get('/Parent')
            parent = parent.get_object() if parent else None
            name = widget.get('/T') or (parent.get('/T') if parent else None)
            if name not in typed: continue
            actual = widget.get('/V', parent.get('/V') if parent else None)
            if str(actual) != typed[name]: raise ValueError(f'Widget non aggiornato: {name}')
            appearance = widget.get('/AP')
            normal = appearance.get('/N') if appearance else None
            if allowed[name]['type']=='/Btn':
                states=normal.get_object() if normal else {}
                if str(widget.get('/AS','/Off')) not in states:raise ValueError(f'Aspetto della scelta non valido: {name}')
                continue
            if not normal or not normal.get_object().get_data(): raise ValueError(f'Anteprima del campo assente: {name}')
    Path(request['output']).write_bytes(output.getvalue())
    print(json.dumps({'verified_fields': list(values), 'pages': len(written.pages)}, ensure_ascii=False))
