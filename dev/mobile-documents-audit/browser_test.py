import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description='Verifica documenti con componenti reali e backend simulato.')
parser.add_argument('--url', default='http://127.0.0.1:4187')
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--chromium-channel', default='')
args = parser.parse_args()
base = args.output.resolve()
base.mkdir(parents=True, exist_ok=True)
(base / 'screenshots').mkdir(exist_ok=True)
(base / 'qa-downloads').mkdir(exist_ok=True)
results = []
with sync_playwright() as p:
    cases = [('iphone-webkit', p.webkit, {}, 375, 812), ('android-chrome', p.chromium, ({'channel': args.chromium_channel} if args.chromium_channel else {}), 412, 915)]
    for name, engine, launch, width, height in cases:
        browser = engine.launch(headless=True, **launch)
        context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=True, has_touch=True, accept_downloads=True)
        state = {'fail_upload': False, 'uploads': 0, 'pdf': b''}
        def upload(route):
            state['uploads'] += 1
            route.fulfill(status=503 if state['fail_upload'] else 200, content_type='application/json', body='{}')
        context.route('**/__qa-upload', upload)
        context.route('**/documento.pdf', lambda route: route.fulfill(status=200, content_type='application/pdf', body=state['pdf']))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url, wait_until='networkidle', timeout=60000)
        expect(page.locator('canvas[data-page="1"]')).to_be_visible(timeout=30000)
        expect(page.get_by_title('Scarica PDF')).to_be_enabled()
        with page.expect_download(timeout=15000) as download:
            page.get_by_title('Scarica PDF').click()
        saved = base / 'qa-downloads' / (name + '-anteprima.pdf')
        download.value.save_as(str(saved))
        state['pdf'] = saved.read_bytes()
        assert state['pdf'].startswith(b'%PDF-'), 'Download PDF non valido'

        apri = page.get_by_role('button', name='Apri attestato.pdf', exact=True)
        expect(apri).to_be_visible()
        box = apri.bounding_box()
        assert box['width'] >= 44 and box['height'] >= 44, f'Pulsante allegato: {box}; viewport={page.evaluate("innerWidth")}; css={apri.evaluate("el => ({height:getComputedStyle(el).height,width:getComputedStyle(el).width,root:getComputedStyle(document.documentElement).fontSize,transform:getComputedStyle(el).transform})")}'
        with context.expect_event('response', predicate=lambda r: r.url.endswith('/documento.pdf'), timeout=15000) as document_response:
            with page.expect_popup() as popup:
                apri.click()
        assert document_response.value.status == 200
        if not popup.value.is_closed():
            popup.value.close()

        page.get_by_role('button', name='Carica un attestato', exact=True).click()
        page.get_by_label('Scegli il file', exact=True).set_input_files({'name': 'attestato-android.pdf', 'mimeType': '', 'buffer': state['pdf']})
        page.get_by_role('button', name="Invia all'ufficio", exact=True).click()
        expect(page.locator('#caricamenti')).to_contain_text('attestato-android.pdf · application/pdf')
        assert state['uploads'] == 1

        page.get_by_role('button', name='Carica un attestato', exact=True).click()
        page.get_by_label('Scegli il file', exact=True).set_input_files({'name': 'corso-rete.pdf', 'mimeType': 'application/pdf', 'buffer': state['pdf']})
        state['fail_upload'] = True
        page.get_by_role('button', name="Invia all'ufficio", exact=True).click()
        expect(page.get_by_text('Connessione interrotta. Riprova.', exact=True)).to_be_visible()
        expect(page.get_by_text('corso-rete.pdf', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name="Invia all'ufficio", exact=True)).to_be_enabled()
        state['fail_upload'] = False
        page.get_by_role('button', name="Invia all'ufficio", exact=True).click()
        expect(page.locator('#caricamenti')).to_contain_text('corso-rete.pdf · application/pdf')
        assert state['uploads'] == 3

        page.get_by_role('button', name='Carica un attestato', exact=True).click()
        page.get_by_label('Scegli il file', exact=True).set_input_files({'name': 'offline.pdf', 'mimeType': 'application/pdf', 'buffer': state['pdf']})
        context.set_offline(True)
        page.get_by_role('button', name="Invia all'ufficio", exact=True).click()
        expect(page.get_by_text('Sei senza rete: riprova appena torna il campo.', exact=True)).to_be_visible()
        expect(page.get_by_text('offline.pdf', exact=True)).to_be_visible()
        assert state['uploads'] == 3
        context.set_offline(False)
        page.get_by_role('button', name="Invia all'ufficio", exact=True).click()
        expect(page.locator('#caricamenti')).to_contain_text('offline.pdf · application/pdf')
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), 'Overflow orizzontale'
        assert not errors, errors
        page.screenshot(path=str(base / 'screenshots' / (name + '-documenti-verificati.png')), full_page=True)
        result = {'browser': name, 'viewport': f'{width}x{height}', 'pdf_canvas': True, 'pdf_download_bytes': len(state['pdf']), 'hr_document_visible_and_opens': True, 'upload_without_mime': True, 'failed_upload_retains_file_and_retries': True, 'offline_retains_file_and_recovers': True, 'horizontal_overflow': False, 'page_errors': errors}
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
        context.close()
        browser.close()
(base / 'browser-documents-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
