"""Reconcile the supplied purchase-cost sources against a read-only DB export.

No database connection or writes. Keep the exported data and report outside Git.
Requires openpyxl and pypdf; run with the bundled document-analysis Python.
"""
import argparse
import collections
import decimal
import hashlib
import json
import pathlib
import re

import openpyxl
from pypdf import PdfReader


def same_amount(actual, expected):
    if actual is None or expected is None:
        return actual is expected
    return abs(decimal.Decimal(str(actual)) - decimal.Decimal(str(expected))) <= decimal.Decimal('0.000001')


def audit(source, database, previous_manifest=None):
    book_path = source / 'listino-template-product_compilato_prezzi_IVA_corretta.xlsx'
    workbook = openpyxl.load_workbook(book_path, data_only=True)
    templates = collections.defaultdict(list)
    for row in database['templates']:
        templates[str(row['sku'])].append(row)
    families = {row['id']: row for row in database['families']}
    issues, source_rows, zero_costs = [], [], []
    for cells in workbook['Dati'].iter_rows(min_row=2):
        values = [cell.value for cell in cells]
        if not values[0]:
            continue
        code, cost, vat = str(values[0]), values[8], values[10]
        if isinstance(vat, (float, int)) and '%' in cells[10].number_format:
            vat *= 100
        source_rows.append({'code': code, 'source_row': cells[0].row, 'cost': cost})
        matches = templates[code]
        if len(matches) != 1:
            issues.append({'source_row': cells[0].row, 'code': code, 'issue': 'missing_or_duplicate_template', 'matches': len(matches)})
            continue
        record = matches[0]
        if cost is None or not same_amount(record['prezzo_acquisto_netto'], cost):
            issues.append({'code': code, 'issue': 'purchase_cost_mismatch', 'source': cost, 'database': record['prezzo_acquisto_netto']})
        if vat is not None and not same_amount(record['vat_rate'], vat):
            issues.append({'code': code, 'issue': 'vat_mismatch', 'source': vat, 'database': record['vat_rate']})
        if cost == 0:
            zero_costs.append({'code': code, 'name': values[1], 'source_row': cells[0].row})
        if record.get('family_id'):
            family = families.get(record['family_id'])
            if not family or not same_amount(family['prezzo_base_acquisto'], cost):
                issues.append({'code': code, 'issue': 'family_purchase_cost_mismatch'})
        elif record['attivo']:
            issues.append({'code': code, 'issue': 'active_product_without_catalog_family'})

    extras = (source / 'prezzi vari.txt').read_text(encoding='utf-8-sig')
    extra_checks = []
    for line in extras.splitlines():
        if not line.strip():
            continue
        cost_match = re.search(r'€/\s*(?:ml|cad\.)\s*([\d.,]+)', line)
        if not cost_match:
            issues.append({'issue': 'unparsed_extra_cost', 'source': line})
            continue
        cost = float(cost_match.group(1).replace('.', '').replace(',', '.'))
        dimensions = re.search(r'monoblocco\s+cm\s+(\d+)\s*x\s*(\d+)', line, re.I)
        if dimensions:
            size = dimensions.group(1) + 'x' + dimensions.group(2)
            matches = [row for row in database['templates'] if 'monoblocco' in row['name'].lower() and re.search(r'(?<!\d)' + re.escape(size) + r'(?!\d)', row['name'].replace(' ', '').lower())]
            ok = len(matches) == 1 and same_amount(matches[0]['prezzo_acquisto_netto'], cost)
            family = families.get(matches[0].get('family_id')) if len(matches) == 1 else None
            ok = ok and bool(family) and same_amount(family['prezzo_base_acquisto'], cost)
            extra_checks.append({'type': 'monoblocco', 'size': size, 'cost': cost, 'matched': ok, 'catalog_active': family['attivo'] if family else None})
        else:
            matches = [row for row in database['tariffe'] if 'scossaline' in row['nome'].lower()]
            ok = len(matches) == 1 and same_amount(matches[0]['prezzo_costo'], cost)
            extra_checks.append({'type': 'fornitura_e_posa', 'cost': cost, 'matched': ok})
        if not ok:
            issues.append({'issue': 'extra_cost_missing_or_different', 'source': line})

    # ML is a documented workmanship cost in Excel, not a material or a sale price.
    workmanship = [row for row in source_rows if row['code'] == 'ML']
    if workmanship:
        matches = [row for row in database['tariffe'] if row['codice'] == 'PALMA-LAVORAZIONE-BATTISCOPA']
        if len(matches) != 1 or not same_amount(matches[0]['prezzo_costo'], workmanship[0]['cost']):
            issues.append({'issue': 'workmanship_cost_missing_or_different', 'code': 'ML'})

    pdf = PdfReader(source / 'ilovepdf_merged.pdf')
    pdf_pages = []
    for index, page in enumerate(pdf.pages, 1):
        text = page.extract_text() or ''
        offer_context = bool(re.search(r'preventivo|committent|spett\.|offerta|totale\s+(?:lavori|opere)', text, re.I))
        purchase_markers = re.findall(r'.{0,100}(?:costo\s+(?:a noi|d.acquisto)|fattura\s+(?:fornitore|acquisto)|prezzo\s+d.acquisto).{0,100}', text, re.I)
        pdf_pages.append({'page': index, 'text_chars': len(text), 'offer_context': offer_context, 'purchase_markers': purchase_markers, 'euro_signs': text.count('€')})

    sales = {
        'templates': [row['sku'] for row in database['templates'] if row.get('prezzo_vendita') not in (None, 0)],
        'families': [row['id'] for row in database['families'] if row.get('prezzo_base_vendita') not in (None, 0)],
        'tariffe': [row['codice'] for row in database['tariffe'] if row.get('prezzo_vendita') not in (None, 0)],
    }
    if any(sales.values()):
        issues.append({'issue': 'unexpected_sale_prices', 'records': sales})
    hashes = {name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in (
        'listino-template-product_compilato_prezzi_IVA_corretta.xlsx', 'prezzi vari.txt', 'ilovepdf_merged.pdf', 'Elenco fornitori e clienti.txt', 'lista dipendenti.txt')}
    changed = [name for name, value in hashes.items() if previous_manifest and previous_manifest.get('sources', {}).get(name) != value]
    return {'source_hashes': hashes, 'sources_changed_since_import': changed,
            'excel_rows_checked': len(source_rows), 'source_zero_costs': zero_costs,
            'additional_costs_checked': extra_checks, 'workmanship_costs_checked': len(workmanship),
            'database_counts': {key: len(value) for key, value in database.items()},
            'sale_prices_found': sales, 'pdf_pages': pdf_pages, 'issues': issues,
            'database_writes_executed': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=pathlib.Path, required=True)
    parser.add_argument('--database', type=pathlib.Path, required=True)
    parser.add_argument('--previous-manifest', type=pathlib.Path)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    previous = json.loads(args.previous_manifest.read_text()) if args.previous_manifest else None
    result = audit(args.source, json.loads(args.database.read_text()), previous)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: value for key, value in result.items() if key not in ('source_hashes', 'pdf_pages')}, ensure_ascii=False, indent=2))
