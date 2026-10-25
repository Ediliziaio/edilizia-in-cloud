import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { applyPlanningChatCommand, planningChatIntent, planningChatSummary } from '@/lib/preventivi/quotePlanningChat';
import { defaultPlanningScenario, syntheticPlanningScenario } from '@/lib/preventivi/quotePlanningScenario';
import { planningStorageKey, readLocalPlanningRecord, writeLocalPlanningRecord } from '@/lib/preventivi/localPlanningScenario';
import { emptyChatDocument, type QuoteChatTransport } from '@/lib/preventivi/quoteChatDocument';
import { emptyQuoteProject, quoteCostScope } from '@/lib/preventivi/quoteProject';
import { localSnapshot } from './localPlanFixtures';
vi.mock('@/lib/prezzario/queries', () => ({ usePrezzarioFonti: () => ({ data: [] as never[], isFetching: false, error: null as null, refetch: vi.fn() }) }));
import Workspace from '@/components/quotes/dev/QuoteAssistedWorkspace';
import QuotePlanningChat from '@/components/quotes/dev/QuotePlanningChat';

const companyId = 'd2000000-0000-4000-a000-000000000002';
afterEach(() => { cleanup(); localStorage.clear(); });
describe('Comandi locali di pianificazione, non modifiche commerciali', () => {
  it.each(['Mostra scenari di cantiere', 'Simula la trasferta', 'Il viaggio dura 60 minuti', 'Devo finire entro un mese'])('apre gli scenari: %s', text => expect(planningChatIntent(text)).toBe(true));
  it.each(['Non simulare trasferte', 'Prepara un preventivo includendo il viaggio', 'Aggiungi voce trasferta di 40 km', '> viaggio dura 60 minuti', 'Mostra IVA', 'Prepara un cronoprogramma del bagno'])('non intercetta altri flussi: %s', text => expect(planningChatIntent(text)).toBe(false));
  it('il semplice numero di persone è una risposta solo durante la pianificazione', () => {
    expect(planningChatIntent('3 persone')).toBe(false); expect(planningChatIntent('3 persone', true)).toBe(true);
  });
  it('non ricava ore dal prezzo e mantiene il carico sconosciuto', () => {
    const draft = defaultPlanningScenario(); expect(planningChatSummary(draft)).toContain('servono le ore-persona');
    expect(applyPlanningChatCommand(draft, 'Il cantiere costa 38000 euro').changed).toBe(false);
  });
  it('aggiorna carico, viaggi e distanze separati senza mutare l’originale', () => {
    const original = defaultPlanningScenario(); const before = JSON.stringify(original);
    const result = applyPlanningChatCommand(original, 'Carico: 360 ore-persona; andata: 45 minuti; ritorno: 1,25 ore; andata: 40 km; ritorno: 50 km');
    expect(result.changed).toBe(true); expect(result.scenario.travel).toMatchObject({ outboundMinutes: 45, returnMinutes: 75, outboundKm: 40, returnKm: 50 });
    expect(result.scenario.tasks[0]).toMatchObject({ personHours: 360 }); expect(JSON.stringify(original)).toBe(before);
  });
  it('non applica domande, negazioni, date impossibili o valori fuori limite', () => {
    const draft = defaultPlanningScenario();
    for (const text of ['Squadra: 4 persone?', 'Non partiamo dalla sede', 'Avvio: 2026-02-30', 'Squadra: 45 persone', 'Giornata: 0 ore; pausa: 30 minuti'])
      expect(applyPlanningChatCommand(draft, text).changed).toBe(false);
  });
  it('non cancella competenze o calendari eterogenei', () => {
    const s = defaultPlanningScenario(); s.workers[0].skills = ['electric'];
    expect(applyPlanningChatCommand(s, 'Squadra: 4 persone').scenario).toBe(s);
  });
  it('non trasforma più fasi in un carico unico', () => {
    const s = defaultPlanningScenario(); s.tasks.push({ ...s.tasks[0], id: 'second' });
    expect(applyPlanningChatCommand(s, 'Carico: 360 ore-persona').changed).toBe(false);
  });
  it('l’esempio sintetico richiede una richiesta esplicita', () => {
    const result = applyPlanningChatCommand(defaultPlanningScenario(), 'Esempio trasferte 360 ore');
    expect(result.scenario.source).toBe('synthetic'); expect(result.reply).toContain('18 ore-persona/giorno');
  });
  it('comprende persone e viaggi dichiarati nel linguaggio della conversazione', () => {
    const result = applyPlanningChatCommand(syntheticPlanningScenario(), 'Siamo 4 persone; un’ora di andata e 45 minuti di ritorno');
    expect(planningChatIntent('Siamo 4 persone', true)).toBe(true);
    expect(result.changed).toBe(true); expect(result.scenario.workers).toHaveLength(4);
    expect(result.scenario.travel).toMatchObject({ outboundMinutes: 60, returnMinutes: 45 });
  });
});
describe('Memoria separata dello scenario', () => {
  it('isola proprietario, azienda e sessione e conserva le copie non leggibili', () => {
    const key = planningStorageKey('one', companyId, 'session');
    expect(key).not.toBe(planningStorageKey('two', companyId, 'session'));
    expect(key).not.toBe(planningStorageKey('one', 'other', 'session'));
    expect(key).not.toBe(planningStorageKey('one', companyId, 'other'));
    expect(() => readLocalPlanningRecord('{bad')).toThrow();
    localStorage.setItem(key, 'other-copy');
    expect(() => writeLocalPlanningRecord(localStorage, key, { version: 1, scope: 'a', scenario: defaultPlanningScenario() }, null)).toThrow(/altra scheda/);
    expect(localStorage.getItem(key)).toBe('other-copy');
  });
  it('salva e rilegge lo scenario senza aggiungerlo al progetto commerciale', () => {
    const project = emptyQuoteProject(); const before = JSON.stringify(project);
    const record = { version: 1 as const, scope: 'abc', scenario: syntheticPlanningScenario() };
    const serialized = writeLocalPlanningRecord(localStorage, 'scenario-test', record, null);
    expect(readLocalPlanningRecord(serialized)).toEqual(record); expect(JSON.stringify(project)).toBe(before);
  });
  it('conserva la copia corrotta e non applica comandi quando la memoria è bloccata', async () => {
    const key = planningStorageKey('owner', companyId, 'session'); localStorage.setItem(key, '{bad');
    render(<QuotePlanningChat ownerId="owner" companyId={companyId} sessionId="session" scope="a" document={emptyChatDocument()} project={emptyQuoteProject()} request={{ id: 1, text: 'Esempio trasferte 360 ore' }} onReply={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Non posso leggere'); expect(localStorage.getItem(key)).toBe('{bad');
  });
  it('importa titoli e solo ore pertinenti, lasciando quantità e prezzi originali intatti', () => {
    const doc = localSnapshot().document; doc.lines = doc.lines.map(line => ({ ...line, included: true, price: 65 }));
    const project = emptyQuoteProject();
    project.costs = doc.lines.map((line, i) => ({ id: line.id, materials: null as null, hours: 12, hourlyRate: null as null, subcontract: null as null, other: null as null, scope: i === 0 ? quoteCostScope(line) : 'vecchia-quantita' }));
    const before = JSON.stringify([doc, project]);
    render(<QuotePlanningChat ownerId="owner" companyId={companyId} sessionId="import" scope="current" document={doc} project={project} request={null} onReply={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Importa voci come bozza di fasi' }));
    const record = readLocalPlanningRecord(localStorage.getItem(planningStorageKey('owner', companyId, 'import')))!;
    expect(record.scenario.tasks).toHaveLength(doc.lines.length);
    expect(record.scenario.tasks[0]).toMatchObject({ label: doc.lines[0].title, personHours: 12 });
    expect(record.scenario.tasks[1]).toMatchObject({ personHours: null });
    expect(JSON.stringify([doc, project])).toBe(before);
  });
  it('rileva il cambio di ambito senza riassegnare ore e riprende la copia alla riapertura', () => {
    const key = planningStorageKey('owner', companyId, 'persist');
    const scenario = syntheticPlanningScenario();
    writeLocalPlanningRecord(localStorage, key, { version: 1, scope: 'old', scenario }, null);
    const props = { ownerId: 'owner', companyId, sessionId: 'persist', scope: 'new', document: emptyChatDocument(), project: emptyQuoteProject(), request: null as null, onReply: vi.fn(), onClose: vi.fn() };
    const view = render(<QuotePlanningChat {...props} />);
    expect(screen.getByText(/Scenario non aggiornato/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confronta base / +1 / +2' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ho rivisto le ipotesi' }));
    expect(readLocalPlanningRecord(localStorage.getItem(key))?.scenario.tasks).toEqual(scenario.tasks);
    view.unmount(); render(<QuotePlanningChat {...props} />);
    expect(screen.queryByText(/Scenario non aggiornato/)).not.toBeInTheDocument();
    expect(readLocalPlanningRecord(localStorage.getItem(key))?.scope).toBe('new');
  });
  it('non sovrascrive gli aggiornamenti ricevuti da un’altra scheda', () => {
    const key = planningStorageKey('owner', companyId, 'concurrent');
    render(<QuotePlanningChat ownerId="owner" companyId={companyId} sessionId="concurrent" scope="a" document={emptyChatDocument()} project={emptyQuoteProject()} request={null} onReply={vi.fn()} onClose={vi.fn()} />);
    const other = JSON.stringify({ version: 1, scope: 'b', scenario: syntheticPlanningScenario() });
    localStorage.setItem(key, other);
    fireEvent(window, new StorageEvent('storage', { key, newValue: other }));
    expect(screen.getByRole('alert')).toHaveTextContent('altra scheda');
    expect(localStorage.getItem(key)).toBe(other);
  });
});
it('la chat Demo 2 apre la simulazione senza chiamare LLM e senza creare voci', async () => {
  const transport = vi.fn<QuoteChatTransport>();
  render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={transport} />);
  const send = (text: string) => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Messaggio all’assistente preventivi' }), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Invia messaggio' }));
  };
  send('Mostra scenari di cantiere');
  await screen.findByTestId('planning-chat-local');
  send('Esempio trasferte 360 ore');
  await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('18 ore-persona/giorno'));
  expect(transport).not.toHaveBeenCalled(); expect(screen.getByRole('tab', { name: /Voci del preventivo/ })).toHaveTextContent('0');
  expect(screen.queryByRole('tab', { name: /Pianificazione/ })).not.toBeInTheDocument();
});
