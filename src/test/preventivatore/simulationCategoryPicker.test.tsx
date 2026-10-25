import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SALES_AREAS } from '@/lib/moduli-vendita/areas';
import { QUOTE_SIMULATION_SCENARIOS, QUOTE_SIMULATION_AREAS, quoteSimulationScenario, quoteSimulationTarget } from '@/lib/preventivi/quoteSimulationScenarios';
import { localDraftKey, readLocalQuoteSnapshot } from '@/lib/preventivi/localQuoteMemory';
import { localSnapshot, memoryScope } from './localPlanFixtures';
import { QuoteSimulationPicker } from '@/components/quotes/dev/QuoteSimulationPicker';
import { QuoteTemplatePicker } from '@/components/quotes/dev/QuoteTemplatePicker';
import { DEFAULT_TEMPLATE, type QuoteTemplate } from '@/types/quoteTemplate';
vi.mock('@/lib/prezzario/queries', () => ({ usePrezzarioFonti: () => ({ data: [] as never[], isFetching: false, error: null as Error | null }) }));
import Workspace from '@/components/quotes/dev/QuoteAssistedWorkspace';
afterEach(cleanup);
const offer: QuoteTemplate = { ...DEFAULT_TEMPLATE, id: 'a2000000-0000-4000-a000-000000000001', company_id: memoryScope.companyId, name: 'Offerta energia', created_at: '', updated_at: '', layout: 'modern' };
describe('Catalogo delle simulazioni dalla tassonomia del gestionale', () => {
  it('isola il bilocale allegato e non scambia ingombro esterno e superficie netta', () => {
    const scenario = quoteSimulationScenario('bilocale-pianta'); expect(scenario).toBeDefined();
    expect(scenario!.prompt).toContain('36,30 m²'); expect(scenario!.prompt).toContain('NON comprende il disimpegno');
    expect(scenario!.prompt).toContain('ingombro esterno, non superficie netta');
    expect(localDraftKey({ ...memoryScope, scenarioId: 'bilocale-pianta' })).not.toBe(localDraftKey({ ...memoryScope, scenarioId: 'ristrutturazioni--completa' }));
  });
  it('copre esattamente tutte le aree e gli interventi senza duplicare cataloghi o identità', () => {
    expect(QUOTE_SIMULATION_AREAS).toBe(SALES_AREAS);
    expect(QUOTE_SIMULATION_AREAS).toHaveLength(14);
    expect(QUOTE_SIMULATION_SCENARIOS.filter(s => s.areaId)).toHaveLength(SALES_AREAS.reduce((n, a) => n + a.interventions.length, 0));
    expect(new Set(QUOTE_SIMULATION_SCENARIOS.map(s => s.id)).size).toBe(QUOTE_SIMULATION_SCENARIOS.length);
    expect(new Set(QUOTE_SIMULATION_SCENARIOS.map(s => s.label.toLocaleLowerCase('it'))).size).toBe(QUOTE_SIMULATION_SCENARIOS.length);
    const keys = QUOTE_SIMULATION_SCENARIOS.map(s => localDraftKey({ ...memoryScope, scenarioId: s.id }));
    expect(new Set(keys).size).toBe(keys.length); expect(keys).not.toContain(localDraftKey(memoryScope));
    expect(() => localDraftKey({ ...memoryScope, scenarioId: 'unknown--unknown' })).toThrow();
  });
  it.each(QUOTE_SIMULATION_SCENARIOS.filter(s => s.areaId))('$id: prompt modificabile, nessuna riga/prezzo e ambito specifico', scenario => {
    expect(quoteSimulationScenario(scenario.id)).toBe(scenario);
    expect(quoteSimulationTarget(`Simulazione ${scenario.label.toLocaleLowerCase('it')}`)).toBe(scenario.id);
    expect(scenario.prompt.length).toBeLessThanOrEqual(3000); expect(scenario.title.length).toBeLessThanOrEqual(200);
    expect(scenario.prompt).toContain('una sola domanda prioritaria'); expect(scenario.prompt).toContain('senza inventare codici o prezzi');
    expect(scenario.prompt).toContain('Nessuna inclusione automatica'); expect(scenario.prompt).toContain('modello grafico scelto non determina');
    expect(scenario).not.toHaveProperty('lines'); expect(scenario).not.toHaveProperty('price');
    const area = SALES_AREAS.find(a => a.id === scenario.areaId)!;
    for (const field of area.interventions.find(i => i.id === scenario.interventionId)!.fields) expect(scenario.prompt).toContain(field);
  });
  it('non confonde energia, potenza, falde e proiezione', () => {
    expect(quoteSimulationScenario('fotovoltaico--nuovo')?.prompt).toContain('6 kWp');
    expect(quoteSimulationScenario('fotovoltaico--nuovo')?.prompt).toContain('10 kWh come alternativa, non ancora scelto');
    expect(quoteSimulationScenario('fotovoltaico--nuovo')?.prompt).toContain('Non ricavare producibilità');
    expect(quoteSimulationScenario('tetti--rifacimento')?.prompt).toContain('proiezione orizzontale dichiarata di 120 m²');
    expect(quoteSimulationScenario('tetti--rifacimento')?.prompt).toContain('Pendenza e superficie reale delle falde non note');
  });
  it.each(SALES_AREAS)('apre $title e seleziona un intervento senza invocare servizi', async area => {
    const select = vi.fn(); render(<QuoteSimulationPicker onSelect={select} />);
    fireEvent.click(screen.getByRole('button', { name: `Apri categoria ${area.title}` }));
    expect(screen.getByRole('button', { name: 'Categorie' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Interventi di prova' })).getAllByRole('button')).toHaveLength(area.interventions.length);
    fireEvent.click(screen.getByRole('button', { name: `Prova ${area.title} · ${area.interventions[0].title}` }));
    await waitFor(() => expect(select).toHaveBeenCalledExactlyOnceWith(`${area.id}--${area.interventions[0].id}`));
  });
  it('cerca anche varianti interne e protegge le interazioni disabilitate', () => {
    const select = vi.fn(); render(<QuoteSimulationPicker disabled onSelect={select} />);
    expect(screen.getByRole('textbox', { name: 'Cerca categoria o intervento' })).toBeDisabled();
    for (const button of screen.getAllByRole('button')) { expect(button).toBeDisabled(); fireEvent.click(button); }
    expect(select).not.toHaveBeenCalled();
  });
  it('restringe accumulo al fotovoltaico e gestisce ricerca vuota', () => {
    render(<QuoteSimulationPicker onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Cerca categoria o intervento' }), { target: { value: 'fotovoltaico accumulo' } });
    expect(screen.getByRole('button', { name: /Prova Fotovoltaico · Aggiunta accumulo/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Apri categoria Tetti/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Cerca categoria o intervento' }), { target: { value: 'xyz inesistente' } });
    expect(screen.getByRole('status')).toHaveTextContent('Nessuna corrispondenza');
  });
  it('mantiene i selettori salvati e rifiuta un selettore attribuito all’utente', () => {
    const snapshot = localSnapshot(); snapshot.messages = [{ role: 'assistant', diagnostic: true, text: 'Scegli', picker: 'simulations' }, { role: 'assistant', diagnostic: true, text: 'Modello', picker: 'templates' }];
    expect(readLocalQuoteSnapshot(snapshot).messages).toEqual(snapshot.messages);
    snapshot.messages = [{ role: 'user', diagnostic: true, text: 'Scegli', picker: 'simulations' }]; expect(() => readLocalQuoteSnapshot(snapshot)).toThrow();
  });
  it('non ripete il cambio simulazione mentre il salvataggio è pendente', async () => {
    let done!: () => void;
    const select = vi.fn(() => new Promise<void>(resolve => { done = resolve; }));
    render(<QuoteSimulationPicker onSelect={select} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apri categoria Fotovoltaico' }));
    const button = screen.getByRole('button', { name: 'Prova Fotovoltaico · Aggiunta accumulo' });
    fireEvent.click(button); fireEvent.click(button); expect(select).toHaveBeenCalledOnce(); expect(button).toBeDisabled();
    done(); await waitFor(() => expect(button).not.toBeDisabled());
  });
});
describe('Modello documento all’inizio della chat', () => {
  it('non mostra un modello mancante mentre la libreria salvata si sta caricando', () => {
    const select = vi.fn();
    const view = render(<QuoteTemplatePicker selectedId={offer.id} library={{ templates: [], loading: true }} onSelect={select} />);
    expect(screen.getByText('Caricamento modello…')).toBeVisible();
    expect(screen.queryByText('Modello salvato non disponibile')).not.toBeInTheDocument();
    view.rerender(<QuoteTemplatePicker selectedId={offer.id} library={{ templates: [offer], loading: false }} onSelect={select} />);
    expect(screen.getByText('Offerta energia')).toBeVisible(); expect(select).not.toHaveBeenCalled();
    view.rerender(<QuoteTemplatePicker selectedId={null} library={{ templates: [], loading: true }} onSelect={select} />);
    expect(screen.getByText('Preventivo classico')).toBeVisible();
  });
  it('candidato e conferma sono distinti; non include blocchi o modelli inattivi', async () => {
    const select = vi.fn(); render(<QuoteTemplatePicker expanded library={{ templates: [offer, { ...offer, id: 'off', is_active: false }, { ...offer, id: 'block', kind: 'prodotto' }], defaultId: offer.id }} onSelect={select} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Offerta energia/ })); expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Usa questo modello' })); await waitFor(() => expect(select).toHaveBeenCalledExactlyOnceWith(offer.id));
  });
  it('cambia ricerca e annulla il candidato; fallback classico con errore di lettura', async () => {
    const select = vi.fn(); render(<QuoteTemplatePicker expanded library={{ templates: [offer], error: true }} onSelect={select} />);
    expect(screen.getByRole('button', { name: /Offerta energia/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Preventivo classico/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Cerca modello di preventivo' }), { target: { value: 'non esiste' } });
    expect(screen.queryByRole('button', { name: 'Usa questo modello' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Preventivo classico/ })); fireEvent.click(screen.getByRole('button', { name: 'Usa questo modello' }));
    await waitFor(() => expect(select).toHaveBeenCalledExactlyOnceWith(null));
  });
  it('non applica un candidato rimosso durante la selezione', () => {
    const select = vi.fn(); const view = render(<QuoteTemplatePicker expanded library={{ templates: [offer] }} onSelect={select} />);
    fireEvent.click(screen.getByRole('button', { name: /Offerta energia/ }));
    view.rerender(<QuoteTemplatePicker expanded library={{ templates: [] }} onSelect={select} />);
    expect(screen.getByRole('button', { name: 'Usa questo modello' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Usa questo modello' })); expect(select).not.toHaveBeenCalled();
  });
  it('inizia dal modello senza chiamare AI e conserva il testo pronto dello scenario', async () => {
    const call = vi.fn(); render(<Workspace companyId={memoryScope.companyId} scenarioId="fotovoltaico--nuovo" onScenario={vi.fn()} onBack={vi.fn()} simulated={false} transport={call} templateLibrary={{ templates: [offer], defaultId: offer.id }} />);
    const input = screen.getByRole('textbox', { name: 'Messaggio all’assistente preventivi' }); const prepared = (input as HTMLTextAreaElement).value;
    const picker = within(screen.getByRole('region', { name: 'Modello del preventivo' }));
    fireEvent.click(picker.getByRole('button', { name: /Preventivo classico/ })); fireEvent.click(picker.getByRole('button', { name: 'Usa questo modello' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Anteprima del modello aziendale' })).toHaveTextContent('Preventivo classico'));
    expect(input).toHaveValue(prepared); expect(call).not.toHaveBeenCalled(); expect(screen.getAllByRole('tab')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Mostra simulazioni' })); expect(input).toHaveValue(prepared);
    expect(screen.getByRole('region', { name: 'Simulazioni per categoria' })).toBeVisible(); expect(call).not.toHaveBeenCalled();
  });
});
