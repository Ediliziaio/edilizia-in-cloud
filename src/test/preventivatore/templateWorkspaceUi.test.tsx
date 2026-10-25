import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { DEFAULT_TEMPLATE, type QuoteTemplate } from '@/types/quoteTemplate';
import { QuoteTemplatePreview, type TemplatePreviewDocument } from '@/components/quotes/QuoteTemplatePreview';
import { QuoteTemplateDocument, workspaceOfferTemplates } from '@/components/quotes/dev/QuoteTemplateDocument';
import { QuoteCatalogueMessage } from '@/components/quotes/dev/QuoteCatalogueMessage';
import { readLocalQuoteSnapshot } from '@/lib/preventivi/localQuoteMemory';
import { localSnapshot } from './localPlanFixtures';
vi.mock('@/lib/prezzario/queries', () => ({ usePrezzarioFonti: () => ({ data: [] as never[], isFetching: false, error: null as Error | null }) }));
import Workspace from '@/components/quotes/dev/QuoteAssistedWorkspace';
import type { QuoteChatTransport } from '@/lib/preventivi/quoteChatDocument';
const offer: QuoteTemplate = { ...DEFAULT_TEMPLATE, id: 'a2000000-0000-4000-a000-000000000001', company_id: 'd2000000-0000-4000-a000-000000000002', created_at: '', updated_at: '', name: 'Modello aziendale blu', cover_title: '', cover_subtitle: '', primary_color: '#123456' };
const data: TemplatePreviewDocument = { title: 'Rinnovo soggiorno', clientName: 'Cliente DEMO', date: '19/10/2026', net: 1190.42, taxPending: true, rows: [{ id: 'floor', name: 'Pavimento confermato', description: 'Descrizione verificata', quantity: 22, unit: 'm²', price: 54.11, amount: 1190.42 }] };
afterEach(cleanup);
const send = (text: string) => { fireEvent.change(screen.getByRole('textbox', { name: 'Messaggio all’assistente preventivi' }), { target: { value: text } }); fireEvent.click(screen.getByRole('button', { name: 'Invia messaggio' })); };
describe('Modelli aziendali nel preventivatore in chat', () => {
  it('usa gli stessi pagamenti nel corpo e nei segnaposto, senza importi inventati se IVA manca', () => {
    const { container } = render(<QuoteTemplatePreview template={{ ...offer, show_contractual_terms: true, contractual_terms_text: 'Piano: {{preventivo.piano_pagamenti}}', payment_terms_text: 'Vecchia condizione' }} documentData={{ ...data, paymentMethod: 'Bonifico', paymentPhases: [{ label: 'Acconto', percent: 30, amount: 999, type: 'deposit' }, { label: 'Saldo', percent: 70, amount: 999, type: 'balance' }] }} page="detail" />);
    expect(container.textContent).toContain('Acconto: 30% — importo da definire');
    expect(container.textContent).toContain('Saldo: 70% — importo da definire');
    expect(container.textContent).not.toContain('999');
    expect(container.textContent).not.toContain('Vecchia condizione');
  });
  it('ricalcola gli importi del piano sul totale corrente e conserva le condizioni del modello senza un piano', () => {
    const { container, rerender } = render(<QuoteTemplatePreview template={{ ...offer, contractual_terms_text: 'Piano: {{preventivo.piano_pagamenti}}', show_contractual_terms: true }} documentData={{ ...data, taxPending: false, gross: 1220, paymentPhases: [{ label: 'Unica soluzione', percent: 100, amount: 0, type: 'balance' }] }} page="detail" />);
    expect(container.textContent).toContain('Unica soluzione: 100% — 1.220,00');
    rerender(<QuoteTemplatePreview template={{ ...offer, payment_terms_text: 'Accordo da modello', contractual_terms_text: 'Piano: {{preventivo.piano_pagamenti}}', show_contractual_terms: true }} documentData={data} page="detail" />);
    expect(container.textContent).toContain('Piano: Accordo da modello');
  });
  it('riflette le nuove foto e descrizioni delle schede collegate senza cambiare quantità o prezzi', () => {
    const linked = { ...offer, linked_product_ids: ['product'] };
    const product = { ...offer, id: 'product', kind: 'prodotto' as const, name: 'Scheda serramento', product_image_url: 'https://example.com/prima.jpg', product_long_description: 'Profilo precedente' };
    const props = { companyName: 'Demo 2', data, incomplete: 0, awaiting: 0, onReview: vi.fn() };
    const { rerender } = render(<QuoteTemplateDocument {...props} library={{ templates: [linked, product], defaultId: offer.id }} />);
    expect(screen.getByRole('img', { name: 'Scheda serramento' })).toHaveAttribute('src', product.product_image_url);
    rerender(<QuoteTemplateDocument {...props} library={{ templates: [linked, { ...product, product_image_url: 'https://example.com/nuova.jpg', product_long_description: 'Profilo aggiornato' }], defaultId: offer.id }} />);
    expect(screen.getByRole('img', { name: 'Scheda serramento' })).toHaveAttribute('src', 'https://example.com/nuova.jpg');
    expect(screen.getByText('Profilo aggiornato')).toBeInTheDocument(); expect(screen.getByRole('table')).toHaveTextContent('22 m²');
    expect(screen.getByTestId('live-quote-total')).toHaveTextContent('1.190,42');
  });
  it.each(['classic', 'modern', 'minimal', 'bold'] as const)('riusa il layout %s con dati effettivi, mai righe o importi dimostrativi', layout => {
    const { container } = render(<QuoteTemplatePreview template={{ ...offer, layout }} documentData={data} companyName="Demo Azienda 2" page="detail" />);
    expect(container.querySelector('[data-template-layout]')).toHaveAttribute('data-template-layout', layout);
    const table = screen.getByRole('table', { name: 'Lavorazioni confermate nel modello' });
    expect(table).toHaveTextContent('Pavimento confermato'); expect(table).toHaveTextContent('22 m²'); expect(table).toHaveTextContent('54,11');
    expect(screen.getByTestId('live-quote-total')).toHaveTextContent('1.190,42');
    expect(container).not.toHaveTextContent('Mario Rossi'); expect(container).not.toHaveTextContent('5.870,00'); expect(container).not.toHaveTextContent('IVA 22%'); expect(container).not.toHaveTextContent('LOGO');
  });
  it('lascia invariata la miniatura dimostrativa delle impostazioni quando non riceve una bozza', () => {
    const { container } = render(<QuoteTemplatePreview template={offer} companyName="Demo" page="detail" />);
    expect(container).toHaveTextContent('Fornitura principale su misura'); expect(container).toHaveTextContent('5.870,00');
  });
  it('mostra copertina e clausole risolte, compila i merge tag ed esclude prezzi indicativi degli allegati', () => {
    const cover = { ...offer, id: 'cover', kind: 'copertina' as const, cover_title: 'Offerta per {{cliente.nome_completo}}', primary_color: '#654321' };
    const terms = { ...offer, id: 'terms', kind: 'condizioni' as const, body_html: '# Accordo\n{{azienda.ragione_sociale}} · {{preventivo.totale}}' };
    const section = { ...offer, id: 'section', kind: 'sezione' as const, body_html: 'Lavora con {{azienda.ragione_sociale}}', name: 'Presentazione' };
    const product = { ...offer, id: 'product', kind: 'prodotto' as const, name: 'Scheda tecnica', product_long_description: 'Dettagli allegati', product_indicative_price: 99999 };
    render(<QuoteTemplateDocument library={{ templates: [{ ...offer, linked_cover_id: 'cover', linked_terms_id: 'terms', linked_section_ids: ['section'], linked_product_ids: ['product'] }, cover, terms, section, product], defaultId: offer.id }} companyName="Demo Azienda 2" data={data} incomplete={0} awaiting={0} onModels={vi.fn()} onReview={vi.fn()} />);
    expect(screen.getByText('Offerta per Cliente DEMO')).toBeInTheDocument(); expect(screen.getByText('Lavora con Demo Azienda 2')).toBeInTheDocument(); expect(screen.getByText('Demo Azienda 2 · Da determinare')).toBeInTheDocument();
    expect(screen.getByRole('table')).not.toHaveTextContent('Scheda tecnica'); expect(screen.getByRole('region')).not.toHaveTextContent('99.999');
  });
  it('non presenta lo zero come preventivo completo e tiene le proposte fuori dal foglio', () => {
    render(<QuoteTemplateDocument data={{ ...data, rows: [], net: 0 }} companyName="Demo" incomplete={1} awaiting={0} pending={[{ id: 'pending', title: 'Pareti cucina', quantity: 12, unit: 'm²', price: null }]} onModels={vi.fn()} onReview={vi.fn()} />);
    expect(screen.getByTestId('live-quote-total')).toHaveTextContent('Importo da determinare');
    fireEvent.click(screen.getByText('1 proposte fuori dal documento'));
    expect(screen.getByRole('region', { name: 'Proposte non incluse nel parziale' })).toHaveTextContent('Pareti cucina');
    expect(screen.getByRole('table')).not.toHaveTextContent('Pareti cucina');
  });
  it('non nasconde righe lunghe e non esegue HTML delle clausole', () => {
    const { container } = render(<QuoteTemplatePreview template={{ ...offer, contractual_terms_text: '<img src=x onerror=alert(1)># Clausola', show_contractual_terms: true }} documentData={{ ...data, rows: Array.from({ length: 100 }, (_, n) => ({ ...data.rows[0], id: String(n), name: `Voce ${n}`, description: 'Descrizione lunga '.repeat(30) })) }} page="detail" />);
    expect(screen.getByText('Voce 99')).toBeInTheDocument(); expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-template-layout]')?.firstElementChild).toHaveStyle({ minHeight: '842px', overflow: 'visible' });
  });
  it('con un modello rimosso segnala il ripiego classico, senza fingere di averlo caricato', () => {
    render(<QuoteTemplateDocument library={{ templates: [], error: true }} templateId={offer.id} data={data} companyName="Demo" incomplete={0} awaiting={0} onModels={vi.fn()} onReview={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('non è più disponibile'); expect(workspaceOfferTemplates({ templates: [offer, { ...offer, id: 'terms', kind: 'condizioni' }, { ...offer, id: 'old', is_active: false }] })).toEqual([offer]);
  });
  it('sceglie modelli in chat senza LLM né modifiche alle voci e conserva soltanto due tab', async () => {
    const call = vi.fn(); render(<Workspace companyId={offer.company_id} templateLibrary={{ templates: [offer], defaultId: offer.id }} simulated={false} transport={call} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cambia modello' }));
    let picker = within(screen.getAllByRole('region', { name: 'Modello del preventivo' }).at(-1)!);
    fireEvent.click(picker.getByRole('button', { name: /Preventivo classico/ })); fireEvent.click(picker.getByRole('button', { name: 'Usa questo modello' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Anteprima del modello aziendale' })).toHaveTextContent('Preventivo classico'));
    expect(screen.getByRole('region', { name: 'Anteprima del modello aziendale' })).toHaveTextContent('Preventivo classico');
    fireEvent.click(screen.getByRole('button', { name: 'Cambia modello' }));
    picker = within(screen.getAllByRole('region', { name: 'Modello del preventivo' }).at(-1)!);
    fireEvent.click(picker.getByRole('button', { name: /Modello aziendale blu/ })); fireEvent.click(picker.getByRole('button', { name: 'Usa questo modello' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Anteprima del modello aziendale' })).toHaveTextContent('Modello aziendale blu'));
    expect(screen.getByRole('region', { name: 'Anteprima del modello aziendale' })).toHaveTextContent('Modello aziendale blu'); expect(screen.getAllByRole('tab')).toHaveLength(2); expect(call).not.toHaveBeenCalled();
    send('Usa modello preventivo a2000000-0000-4000-a000-000000000002'); expect(screen.getByRole('log')).toHaveTextContent('Modello non più disponibile'); expect(call).not.toHaveBeenCalled();
  });
  it('salva una scelta per bozza con compatibilità verso le memorie senza modello', () => {
    expect(readLocalQuoteSnapshot(localSnapshot()).templateId).toBeUndefined();
    expect(readLocalQuoteSnapshot({ ...localSnapshot(), templateId: offer.id }).templateId).toBe(offer.id);
    expect(readLocalQuoteSnapshot({ ...localSnapshot(), templateId: null }).templateId).toBeNull();
    expect(() => readLocalQuoteSnapshot({ ...localSnapshot(), templateId: 'invalid' })).toThrow();
  });
  it('cambiare modello conserva anche una voce manuale già inclusa e una risposta non inviata', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: 'test', references: [], turn: { version: 1, title: 'Prova', message: 'Voce da completare', questions: [], warnings: [], searches: [], proposals: [{ id: 'floor', title: 'Pavimento', description: 'Prova', unit: 'm²', quantity: 10, quantityBasis: 'Misura dichiarata', referenceId: null }] } }));
    render(<Workspace companyId={offer.company_id} templateLibrary={{ templates: [offer] }} simulated={false} transport={call} onBack={vi.fn()} />);
    send('Prepara una voce da 10 m²'); await screen.findByText('Voce da completare');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Voci del preventivo' }), { button: 0, ctrlKey: false });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Prezzo voce 1' }), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Includi voce 1' }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Silvio AI' }), { button: 0, ctrlKey: false });
    fireEvent.change(screen.getByRole('textbox', { name: 'Messaggio all’assistente preventivi' }), { target: { value: 'Una risposta ancora da inviare' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cambia modello' }));
    const picker = within(screen.getAllByRole('region', { name: 'Modello del preventivo' }).at(-1)!);
    fireEvent.click(picker.getByRole('button', { name: /Modello aziendale blu/ })); fireEvent.click(picker.getByRole('button', { name: 'Usa questo modello' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Anteprima del modello aziendale' })).toHaveTextContent('Modello aziendale blu'));
    expect(screen.getByRole('textbox', { name: 'Messaggio all’assistente preventivi' })).toHaveValue('Una risposta ancora da inviare');
    expect(screen.getByTestId('live-quote-total')).toHaveTextContent('200,00'); expect(call).toHaveBeenCalledOnce();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Voci del preventivo' }), { button: 0, ctrlKey: false });
    expect(screen.getByRole('spinbutton', { name: 'Prezzo voce 1' })).toHaveValue(20);
    expect(screen.getByRole('checkbox', { name: 'Includi voce 1' })).toBeChecked();
  });
  it('annulla solo l’ultima modifica del documento e non rilancia richieste o conferma prezzi mancanti', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: 'test', references: [], turn: { version: 1, title: 'Progetto test', message: 'Proposta pronta', questions: ['Quale finitura?'], warnings: [], searches: [], proposals: [{ id: 'floor', title: 'Pavimento', description: 'Da confermare', unit: 'm²', quantity: 10, quantityBasis: 'Confermata', referenceId: null }] } }));
    render(<Workspace companyId={offer.company_id} onBack={vi.fn()} simulated={false} transport={call} />); send('Rifai pavimento soggiorno 10 m²'); await screen.findByText('Proposta pronta');
    fireEvent.click(screen.getByRole('button', { name: 'Aiutami a scegliere' })); expect(call).toHaveBeenCalledOnce(); expect(screen.getByRole('textbox', { name: 'Messaggio all’assistente preventivi' })).toHaveValue('Non lo so ancora: aiutami a capire quali dati servono prima di scegliere.');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Voci del preventivo' }), { button: 0, ctrlKey: false });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Prezzo voce 1' }), { target: { value: '20' } }); fireEvent.click(screen.getByRole('checkbox', { name: 'Includi voce 1' })); expect(screen.getByTestId('live-quote-total')).toHaveTextContent('200,00');
    fireEvent.click(screen.getByRole('button', { name: 'Annulla ultima modifica' })); await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Includi voce 1' })).not.toBeChecked()); expect(screen.getByRole('spinbutton', { name: 'Prezzo voce 1' })).toHaveValue(20); expect(screen.getByTestId('live-quote-total')).toHaveTextContent('Importo da determinare'); expect(call).toHaveBeenCalledOnce();
  });
  it('rende candidati compatti con codice originale e pulsanti disattivati se superati', () => {
    const action = 'Collega codice LOM.CODE alla voce 1 · revisione 3'; const choose = vi.fn();
    render(<QuoteCatalogueMessage content={'Ricerca esatta\n\n**Risultato 1 · LOM.CODE**\nLombardia · m² · 54,11 €\nPiastrelle gres, inclusioni originali\nCandidato da verificare: posa e sottofondo.'} actions={[action]} disabled onAction={choose} />);
    expect(screen.getByRole('heading', { name: 'Piastrelle gres, inclusioni originali' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collega alla voce 1' })).toBeDisabled(); fireEvent.click(screen.getByText('Codice, fonte e descrizione originale')); expect(within(screen.getByRole('region', { name: 'Candidato 1' })).getByText('LOM.CODE')).toBeInTheDocument(); expect(choose).not.toHaveBeenCalled();
  });
});
