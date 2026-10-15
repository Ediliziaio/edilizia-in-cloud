"""Read supplied sources and prepare a review-only onboarding package. No DB writes."""
import argparse
import collections
import hashlib
import json
import pathlib
import re
import subprocess
import openpyxl

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--company-id')
parser.add_argument('--company-name')
args = parser.parse_args()
root, out = pathlib.Path(args.source), pathlib.Path(args.output)
out.mkdir(parents=True, exist_ok=True)

def save(name, value):
    (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def norm(value):
    return re.sub(r'\s+', ' ', str(value or '').strip()).casefold()

text = (root / 'Elenco fornitori e clienti.txt').read_text(encoding='utf-8-sig')
blocks = re.split(r'(?m)^(Fornitore|Cliente)\s*$', text)
contacts = []
for i in range(1, len(blocks), 2):
    values = [s.strip() for s in blocks[i + 1].splitlines() if s.strip()]
    identifiers = list(dict.fromkeys(v for v in values[2:] if re.fullmatch(r'[A-Z0-9]{11,16}', v)))
    contacts.append(dict(role=blocks[i], name=values[0], locality=values[1] if len(values)>1 else None,
                         tax_identifiers=identifiers, source_record=(i+1)//2))
groups = collections.defaultdict(list)
for c in contacts:
    key = (c['role'], c['tax_identifiers'][0] if c['tax_identifiers'] else norm(c['name']))
    groups[key].append(c)
dedup = []
for key, values in groups.items():
    c = dict(values[0])
    c['aliases'] = list(dict.fromkeys(v['name'] for v in values))
    c['source_records'] = [v['source_record'] for v in values]
    c['review_required'] = len(c['aliases']) > 1 or not c['tax_identifiers']
    dedup.append(c)
save('anagrafiche-da-verificare.json', dedup)

book = openpyxl.load_workbook(root / 'listino-template-product_compilato_prezzi_IVA_corretta.xlsx', data_only=True)
products = []
units = {'pz':'pz','n.':'pz','nr':'pz','n':'pz','mq':'m2','ml':'m','ml.':'m','kg':'kg','ql':'q'}
contact_names = {norm(n) for c in dedup if c['role']=='Fornitore' for n in c['aliases']}
for row in list(book['Dati'].rows)[1:]:
    v = [c.value for c in row]
    if not v[0]:
        continue
    vat = v[10] * 100 if isinstance(v[10], (int,float)) and '%' in row[10].number_format else v[10]
    supplier = v[4]
    issues = []
    unit = units.get(norm(v[5]))
    if unit is None: issues.append('unità da verificare')
    if norm(supplier) not in contact_names: issues.append('fornitore non abbinato alle anagrafiche')
    if v[6] is None and v[7] is None: issues.append('prezzo vendita da definire')
    if not v[2]: issues.append('categoria da definire')
    products.append(dict(code=str(v[0]), description=v[1], supplier_source=supplier,
        unit_source=v[5], unit=unit, purchase_cost=v[8], sale_price=v[7], base_price=v[6],
        vat_rate=vat, category=v[2], family=v[3], source_row=row[0].row, source_note=v[12], review=issues))
save('catalogo-costi-base.json', products)

employees = []
lines = (root/'lista dipendenti.txt').read_text(encoding='utf-8-sig').splitlines()
for line in lines[1:]:
    v = line.split('\t')
    if len(v) < 3: continue
    rate = re.search(r'\d+(?:,\d+)?', v[2])
    employees.append(dict(name=v[0], qualification=v[1], contractual_hourly_wage=float(rate.group().replace(',','.')) if rate else None,
        company_hourly_cost=None, review=['Retribuzione contrattuale: costo aziendale da determinare', 'Nessuna credenziale o invito da generare automaticamente']))
save('dipendenti-base.json', employees)

pdf = subprocess.check_output(['pdftotext','-layout',str(root/'ilovepdf_merged.pdf'),'-'], text=True)
pages = pdf.split('\f')
if not pages[-1].strip(): pages.pop()
quote_lines = []
for page_number, page in enumerate(pages,1):
    context = []
    for line in page.splitlines():
        context.append(line)
        match = re.search(r'€/\s*([A-Za-z²³]+)\s+([\d.,]+)\s*=\s*€\s*([\d.,]+)',line)
        if match:
            def itnum(s): return float(s.replace('.','').replace(',','.'))
            quote_lines.append(dict(page=page_number, unit=match.group(1), sale_unit_price=itnum(match.group(2)),
                line_amount=itnum(match.group(3)), source_line=line.strip(), context='\n'.join(context[-16:]),
                purchase_cost=None, vat_rate=None, review_required=True,
                review_reason='Prezzo storico di offerta: verificare descrizione completa, inclusioni, versione e aliquota prima di creare una lavorazione'))
save('lavorazioni-storiche-candidate.json', quote_lines)
save('prezzi-aggiuntivi-fonte.json', dict(source=(root/'prezzi vari.txt').read_text(), review='Costi da maggiorare: ricarico e IVA non definiti'))
summary = dict(company_name_in_database=args.company_name, company_id=args.company_id,
    production_import_executed=False, raw_contacts=dict(collections.Counter(c['role'] for c in contacts)),
    deduplicated_contacts=dict(collections.Counter(c['role'] for c in dedup)),
    duplicate_groups=[c for c in dedup if len(c['source_records'])>1],
    products=len(products), products_by_supplier=dict(collections.Counter(p['supplier_source'] for p in products)),
    unit_review_count=sum(p['unit'] is None for p in products),
    unmatched_supplier_products=sum(norm(p['supplier_source']) not in contact_names for p in products),
    employees=len(employees), missing_wages=sum(e['contractual_hourly_wage'] is None for e in employees),
    pdf_pages=len(pages), historical_quote_line_candidates=len(quote_lines),
    sources={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in root.iterdir() if p.name in [
      'Elenco fornitori e clienti.txt','lista dipendenti.txt','prezzi vari.txt','ilovepdf_merged.pdf',
      'listino-template-product_compilato_prezzi_IVA_corretta.xlsx']})
save('riepilogo.json', summary)
print(json.dumps({k:v for k,v in summary.items() if k not in ['sources','duplicate_groups']},ensure_ascii=False,indent=2))
