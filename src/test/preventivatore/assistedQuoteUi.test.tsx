import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { formatCurrency } from "@/lib/formatters";
import { source } from "./apartmentFixtures";
import type { QuoteChatResult, QuoteChatRequest } from "../../../supabase/functions/_shared/quoteConversation";
import type { QuoteChatTransport } from "@/lib/preventivi/quoteChatDocument";
vi.mock("@/lib/prezzario/queries", () => ({ usePrezzarioFonti: () => ({ data: [source], isFetching: false, error: null as Error | null, refetch: vi.fn() }) }));
import Workspace from "@/components/quotes/dev/QuoteAssistedWorkspace";
import { localSnapshot } from './localPlanFixtures';
import { emptyQuoteProject } from '@/lib/preventivi/quoteProject';
const companyId = "d2000000-0000-4000-a000-000000000002";
afterEach(cleanup);
it('impedisce di salvare e chiudere mentre l’allegato viene ancora preparato', async () => {
  const onChange = vi.fn(), onSnapshot = vi.fn();
  let finishRead!: (buffer: ArrayBuffer) => void;
  const file = { name: 'pianta.jpg', size: 3, slice: () => ({ arrayBuffer: () => new Promise<ArrayBuffer>(resolve => { finishRead = resolve; }) }), arrayBuffer: async () => new Uint8Array([0, 0, 0]).buffer };
  render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false}
    embedded={{ title: 'Preventivo', document: { revision: 0, title: 'Originale', lines: [] }, project: emptyQuoteProject(), onChange, onSnapshot, preview: () => null }} />);
  fireEvent.change(screen.getByLabelText('File planimetria'), { target: { files: [file] } });
  expect(onChange).toHaveBeenLastCalledWith(expect.anything(), true);
  expect(onSnapshot.mock.calls.at(-1)?.[0].snapshot.interrupted).toBe(true);
  await act(async () => finishRead(new Uint8Array([0, 0, 0]).buffer));
  expect(onChange).toHaveBeenLastCalledWith(expect.anything(), false);
  expect(onSnapshot.mock.calls.at(-1)?.[0].snapshot.plan).toBeNull();
});
it('riprende la bozza AI embedded completa e pubblica le modifiche senza chiamare il provider', async () => {
  const snapshot = localSnapshot(); snapshot.plan = null; snapshot.rectangle = null;
  const call = vi.fn<QuoteChatTransport>(), onChange = vi.fn(), onSnapshot = vi.fn();
  render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call}
    embedded={{ title: 'Preventivo', document: { revision: 0, title: 'Originale', lines: [] }, project: emptyQuoteProject(),
      initial: { snapshot, blob: null }, onChange, onSnapshot, savedLocally: true, preview: () => <p>Anteprima originale</p> }} />);
  expect(screen.getByRole('textbox', { name: 'Messaggio all’assistente preventivi' })).toHaveValue(snapshot.input);
  expect(screen.getByRole('log')).toHaveTextContent('Il mio progetto');
  expect(screen.getByRole('log')).toHaveTextContent('Misure da confermare');
  expect(onChange).toHaveBeenLastCalledWith(snapshot.document, false);
  expect(onSnapshot.mock.calls.at(-1)?.[0].snapshot.sessionId).toBe(snapshot.sessionId);
  openLines();
  expect(screen.getByRole('textbox', { name: 'Titolo voce 1' })).toHaveValue(snapshot.document.lines[0].title);
  fireEvent.change(screen.getByRole('textbox', { name: 'Titolo voce 1' }), { target: { value: 'Riga ripresa e modificata' } });
  expect(onSnapshot.mock.calls.at(-1)?.[0].snapshot.document.lines[0].title).toBe('Riga ripresa e modificata');
  expect(call).not.toHaveBeenCalled();
});
it('un’ipotesi sulla squadra non vieta il programma idrico preliminare né include voci nel computo', async () => {
  const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ ...response(r), turn: { ...response(r).turn, proposals: [], questions: [], message: 'Solo ipotesi temporali, nessuna autorizzazione economica', scheduleProposal: { title: 'Programma da verificare', assumptions: ['Impiantista da confermare'], tasks: [{ id: 'idrico', title: 'Impianto idrico', kind: 'work', minDays: 2, maxDays: 4, after: [], basis: 'Disponibilità da verificare' }] } } }));
  render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
  send('Prepara un cronoprogramma preliminare. Ipotesi: una squadra con idraulico nelle rispettive fasi.');
  await screen.findByRole('region', { name: 'Cronoprogramma preliminare' });
  expect(screen.getByRole('textbox', { name: 'Titolo fase 1' })).toHaveValue('Impianto idrico');
  expect(call.mock.calls[0][0].lines).toHaveLength(0);
});
it('il cronoprogramma non imposta un budget né modifica voci e mantiene il contesto della risposta', async () => {
  const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ ...response(r), turn: { ...response(r).turn, proposals: [], questions: ['Quante persone nella squadra?'], message: 'Fasi di test, senza modifiche commerciali', scheduleProposal: { title: 'Programma sintetico', assumptions: ['Ipotesi, non prenotazione'], tasks: [{ id: 'fase_a', title: 'Demolizioni', kind: 'work', minDays: 1, maxDays: 2, after: [], basis: 'Durata da verificare' }] } } }));
  render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
  send('Prepara cronoprogramma del bagno da 12000 euro'); await screen.findByRole('region', { name: 'Cronoprogramma preliminare' });
  expect(call.mock.calls[0][0].advanced?.mode).toBe('schedule');
  expect(call.mock.calls[0][0].messages.some(m => m.text.includes('BUDGET UTENTE: 12000'))).toBe(false);
  send('Una squadra di due persone'); await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
  expect(call.mock.calls[1][0].advanced?.mode).toBe('schedule');
  expect(call.mock.calls[1][0].lines).toHaveLength(0);
});
function send(text: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Silvio AI" }), { button: 0, ctrlKey: false });
  fireEvent.change(screen.getByRole("textbox", { name: "Messaggio all’assistente preventivi" }), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Invia messaggio" }));
}
const response = (request: QuoteChatRequest): QuoteChatResult => ({ version: 1, revision: request.revision, turnId: request.turnId,
  simulated: false, model: "modello-effettivo-dal-router", references: [], turn: { version: 1, message: "Servono misure confermate", title: "Progetto libero",
    questions: ["Quale materiale vuoi?"], warnings: [], searches: [], proposals: [{ id: "r1", title: "Lavorazione proposta", description: "Da verificare", unit: "m²", quantity: 10, quantityBasis: "Misura riferita dall’utente", referenceId: null }] } });
const openLines = () => fireEvent.mouseDown(screen.getByRole("tab", { name: "Voci del preventivo" }), { button: 0, ctrlKey: false });
describe("Conversazione e voci: due tab nello stesso spazio", () => {
  it.each(['Come funziona un appalto pubblico?', 'Quali sono le fasi della costruzione di una casa?', 'Spiegami le cause delle infiltrazioni nel tetto'])('le domande libere non autorizzano modifiche nemmeno se il provider le propone: %s', async question => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => response(r));
    render(<Workspace companyId={companyId} flow="classico" onBack={vi.fn()} simulated={false} transport={call} />);
    send(question); await screen.findByText('Servono misure confermate');
    expect(call.mock.calls[0][0].advanced?.mode).toBe('conversation');
    expect(call.mock.calls[0][0].messages.at(-1)?.text).toBe(question);
    expect(call.mock.calls[0][0].messages.some(m => m.text.includes('ORIENTAMENTO DEL TURNO'))).toBe(true);
    openLines(); expect(screen.queryByRole('textbox', { name: 'Titolo voce 1' })).not.toBeInTheDocument();
  });
  it.each(['Prepara un computo per la costruzione di una villa', 'Prepara un computo di lavori pubblici per una scuola', 'Prepara un preventivo per ristrutturazione appartamento'])('le richieste di computo restano modificabili senza prezzi o quantità fittizi: %s', async text => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ ...response(r), turn: { ...response(r).turn, proposals: [{ ...response(r).turn.proposals[0], quantity: null, quantityBasis: 'Misure mancanti: da rilevare' }] } }));
    render(<Workspace companyId={companyId} flow="classico" onBack={vi.fn()} simulated={false} transport={call} />);
    send(text); await screen.findByText('Servono misure confermate'); openLines();
    expect(screen.getByRole('textbox', { name: 'Titolo voce 1' })).toHaveValue('Lavorazione proposta');
    expect(screen.getByRole('spinbutton', { name: 'Quantità voce 1' })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: 'Prezzo voce 1' })).toHaveValue(null);
    expect(screen.getByRole('checkbox', { name: 'Includi voce 1' })).not.toBeChecked();
  });
  it('il riepilogo corrente del classico viene dal software, non dai vecchi numeri della risposta AI', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ ...response(r), turn: { ...response(r).turn, message: call.mock.calls.length === 1 ? 'Proposta iniziale di test' : 'La voce corrente ha 999 m² al prezzo di 999 euro', proposals: call.mock.calls.length === 1 ? response(r).turn.proposals : [], questions: call.mock.calls.length === 1 ? [] : ['Vuoi confermare 999 m²?'] } }));
    render(<Workspace companyId={companyId} flow="classico" onBack={vi.fn()} simulated={false} transport={call} />);
    send('Prepara sola posa gres'); await screen.findByText('Proposta iniziale di test'); openLines();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Prezzo voce 1' }), { target: { value: '38' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantità voce 1' }), { target: { value: '12' } });
    send('Riepiloga la voce corrente'); await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('12 m²'));
    expect(screen.getByRole('log')).toHaveTextContent('38,00'); expect(screen.getByRole('log')).not.toHaveTextContent('999');
    expect(call.mock.calls[1][0].messages.some(m => m.text.includes('quantità, unità e inclusione fanno fede lines'))).toBe(true);
  });
  it('una valutazione AI ottimista non prevale sulla somma degli intervalli sopra budget', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ ...response(r), turn: { ...response(r).turn, proposals: [], message: 'Il budget di 12000 euro è sufficiente.', preliminaryBudget: { scope: 'Bagno sintetico', currency: 'EUR', assumptions: ['Da verificare'], exclusions: [], groups: [{ label: 'Lavori', low: 12300, high: 22700, basis: 'Intervallo di test' }] } } }));
    render(<Workspace companyId={companyId} flow="bagni:completo" onBack={vi.fn()} simulated={false} transport={call} />);
    send('Bagno completo con budget 12000€ netti');
    await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('Il budget non copre l’intervallo proposto.'));
    expect(screen.getByRole('log')).toHaveTextContent('300,00');
    expect(screen.getByRole('log')).not.toHaveTextContent('è sufficiente');
  });
  it('un bagno di 6 mq a budget resta il progetto chiesto, non diventa l’esempio fisso di 12 mq', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ ...response(r), turn: { ...response(r).turn, proposals: [], message: 'Chiarisco le priorità del bagno di 6 mq', preliminaryBudget: { scope: 'Bagno di 6 mq', currency: 'EUR', assumptions: ['Misure dichiarate'], exclusions: ['Opere strutturali'], groups: [{ label: 'Lavori preliminari', low: 1000, high: 2000, basis: 'Intervallo sintetico di test, non tariffa' }] } } }));
    render(<Workspace companyId={companyId} flow="bagni:completo" onBack={vi.fn()} simulated={false} transport={call} />);
    send('Fammi un bagno completo di 6 mq con budget di 12000€ netti');
    await screen.findByText('Chiarisco le priorità del bagno di 6 mq');
    expect(call).toHaveBeenCalledOnce(); expect(call.mock.calls[0][0].advanced?.mode).toBe('budget');
    expect(call.mock.calls[0][0].messages.at(-1)?.text).toContain('6 mq');
    expect(call.mock.calls[0][0].messages.some(m => m.text.includes('Vincolo, NON prezzo calcolato'))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Mostra proposta da 12.000 € netti' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Prepara proposta indicativa dal budget' }));
    expect(screen.queryByRole('generic', { name: 'Totale proposta a budget' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Conferma proposta indicativa dal budget · revisione 0' }));
    expect(screen.getByRole('region', { name: 'Anteprima nativa Bagni' })).toHaveTextContent('1.500,00');
    expect(screen.getByRole('region', { name: 'Anteprima nativa Bagni' })).not.toHaveTextContent('12.000,00');
    expect(call).toHaveBeenCalledOnce();
  });
  it('mostra il confronto su una riga manuale e la cambia soltanto dopo approvazione', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ ...response(r), turn: { ...response(r).turn, message: call.mock.calls.length === 1 ? 'Prima proposta' : 'Propongo di rivedere la descrizione', proposals: [{ id: 'r1', title: 'Posa pavimento bagno', description: call.mock.calls.length === 1 ? 'Sola posa' : 'Posa con adesivo specificato', unit: 'm²', quantity: call.mock.calls.length === 1 ? 10 : 12, quantityBasis: 'Misura dichiarata', referenceId: null }] } }));
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send('Rifai il pavimento bagno'); await screen.findByText('Prima proposta'); openLines();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Prezzo voce 1' }), { target: { value: '40' } });
    send('Aggiorna la descrizione della posa pavimento bagno e la quantità a 12 mq');
    await screen.findByRole('region', { name: 'Modifiche proposte alle righe protette' });
    openLines(); expect(screen.getByRole('spinbutton', { name: 'Quantità voce 1' })).toHaveValue(10);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Silvio AI' }), { button: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Approva queste modifiche' }));
    openLines(); expect(screen.getByRole('spinbutton', { name: 'Quantità voce 1' })).toHaveValue(12);
    expect(screen.getByRole('spinbutton', { name: 'Prezzo voce 1' })).toHaveValue(40);
    expect(call).toHaveBeenCalledTimes(2);
  });
  it('mostra un esempio valorizzato di bagno da 12000 netti solo dopo conferma, senza chiamate AI', () => {
    const call = vi.fn<QuoteChatTransport>();
    render(<Workspace companyId={companyId} flow="bagni:completo" onBack={vi.fn()} simulated={false} transport={call} />);
    send('Esempio bagno da 12.000 € netti');
    expect(screen.getByRole('log')).toHaveTextContent('Caso di esempio: bagno di 12 m²');
    expect(screen.queryByRole('generic', { name: 'Totale proposta a budget' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mostra proposta da 12.000 € netti' }));
    const preview = screen.getByRole('region', { name: 'Anteprima nativa Bagni' });
    expect(preview).toHaveTextContent('12.000,00'); expect(preview).toHaveTextContent('Proposta economica dimostrativa');
    expect(preview).toHaveTextContent('IVA da definire');
    expect(screen.getByRole('button', { name: 'Mostra proposta da 12.000 € netti' })).toBeDisabled();
    expect(call).not.toHaveBeenCalled();
    openLines();
    expect(screen.getByRole('spinbutton', { name: 'Prezzo voce 1' })).toHaveValue(450);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Prezzo voce 1' }), { target: { value: '500' } });
    expect(preview).toHaveTextContent('12.050,00'); expect(call).not.toHaveBeenCalled();
  });
  it('Proposta iniziale prepara testo conservando le esclusioni e attende invio prima del budget', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async request => response(request));
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />); send('Prepara una ristrutturazione parziale');
    await screen.findByRole('button', { name: 'Proposta iniziale' });
    const input = screen.getByRole('textbox', { name: 'Messaggio all’assistente preventivi' }); fireEvent.change(input, { target: { value: 'Il bagno resta escluso.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Proposta iniziale' })); expect((input as HTMLTextAreaElement).value).toContain('Il bagno resta escluso.'); expect((input as HTMLTextAreaElement).value).toContain('ipotesi esplicite da confermare'); expect(call).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Invia messaggio' })); await waitFor(() => expect(call).toHaveBeenCalledTimes(2)); expect(call.mock.calls[1][0].advanced?.mode).toBe('budget');
    openLines(); expect(screen.getByRole('textbox', { name: 'Titolo voce 1' })).toHaveValue('Lavorazione proposta'); expect(screen.queryByRole('textbox', { name: 'Titolo voce 2' })).not.toBeInTheDocument();
  });
  it('Proposta iniziale non tronca un messaggio già lungo e non chiama AI', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async request => response(request)); render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />); send('Progetto con dati mancanti'); await screen.findByRole('button', { name: 'Proposta iniziale' });
    const input = screen.getByRole('textbox', { name: 'Messaggio all’assistente preventivi' }); fireEvent.change(input, { target: { value: 'x'.repeat(2990) } }); fireEvent.click(screen.getByRole('button', { name: 'Proposta iniziale' }));
    expect(input).toHaveValue('x'.repeat(2990)); expect(screen.getByRole('log')).toHaveTextContent('il testo scritto resta conservato'); expect(call).toHaveBeenCalledOnce();
  });
  it('nessun riscontro tecnico automatico: domande, scelte e dettagli no-op compatti', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ ...response(r), usage: { inputTokens: 5000, outputTokens: 800, calls: 1, costUsd: .02746, visionUsed: false }, turn: { ...response(r).turn, message: 'Impostiamo il progetto da 120 m².', proposals: [], questions: ['Che tipo di ristrutturazione?', 'Quale regione e prezzario?', 'Quali ambienti vuoi escludere?'], warnings: ['Le pareti vanno misurate.'], choices: [{ id: 'complete', label: 'Completa', reply: 'Vorrei una ristrutturazione completa.' }, { id: 'light', label: 'Leggera', reply: 'Vorrei una ristrutturazione leggera.' }] } }));
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />); send('Prepara il progetto da 120 m²');
    await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('Impostiamo il progetto da 120 m².'));
    expect(screen.getByRole('log')).not.toHaveTextContent('Riscontro OpenRouter'); expect(screen.getByRole('log')).not.toHaveTextContent('token input');
    expect(screen.getByText('Quale regione e prezzario?')).toBeVisible(); expect(screen.getByRole('button', { name: 'Completa' })).toBeVisible();
    expect(screen.queryByText('Per proseguire')).not.toBeInTheDocument(); expect(screen.queryByText('Scegli come proseguire')).not.toBeInTheDocument();
    expect(screen.getByText(/Nessuna modifica alle voci o al parziale/)).not.toBeVisible(); expect(screen.getByText('Dettagli del turno').closest('details')).not.toHaveAttribute('open');
    expect(call).toHaveBeenCalledOnce();
  });
  it('offre il prezzario richiesto senza inviare all’AI né perdere la bozza scritta', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ ...response(r), turn: { ...response(r).turn, proposals: [], questions: ['Quale prezzario ed edizione vuoi usare?'], choices: [] } }));
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />); send('Ristrutturazione completa'); await screen.findByRole('button', { name: 'Scegli prezzario' });
    const input = screen.getByRole('textbox', { name: 'Messaggio all’assistente preventivi' }); fireEvent.change(input, { target: { value: 'Appartamento al secondo piano, finiture medie' } });
    fireEvent.click(screen.getByRole('button', { name: 'Scegli prezzario' }));
    expect(input).toHaveValue('Appartamento al secondo piano, finiture medie'); expect(call).toHaveBeenCalledOnce();
    expect(await screen.findByRole('region', { name: 'Selezione prezzario' })).toBeVisible();
  });
  it('scegliere un modello dai pulsanti non cancella il messaggio ancora da inviare', () => {
    const call = vi.fn<QuoteChatTransport>();
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    const input = screen.getByRole('textbox', { name: 'Messaggio all’assistente preventivi' });
    fireEvent.change(input, { target: { value: 'Descrizione lunga del progetto non ancora inviata' } });
    fireEvent.click(screen.getByRole('button', { name: 'Modello e costi AI' }));
    expect(input).toHaveValue('Descrizione lunga del progetto non ancora inviata');
    fireEvent.click(screen.getByRole('button', { name: /^Usa GPT 6\.1 Sol$/ }));
    expect(input).toHaveValue('Descrizione lunga del progetto non ancora inviata'); expect(call).not.toHaveBeenCalled();
  });
  it('budget preliminare resta fuori dalle voci anche se il provider propone una riga', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ ...response(r), turn: { ...response(r).turn, preliminaryBudget: { scope: 'Scenario sintetico', currency: 'EUR', assumptions: ['Solo dati di test'], exclusions: [], groups: [{ label: 'Gruppo di prova', low: 100, high: 200, basis: 'Valori sintetici, non tariffe' }] } } }));
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send('Prepara un budget preliminare per un bagno');
    await waitFor(() => expect(screen.getAllByRole('region', { name: 'Budget preliminare AI separato dal computo' })).toHaveLength(2));
    expect(call.mock.calls[0][0].advanced).toEqual({ model: 'anthropic/claude-sonnet-5.5', mode: 'budget' });
    expect(screen.getByTestId('live-quote-total')).toHaveTextContent('Importo da determinare');
    openLines(); expect(screen.queryByRole('textbox', { name: 'Titolo voce 1' })).not.toBeInTheDocument();
    for (let i = 0; i < 51; i++) send('Mostra strumenti AI');
    expect(screen.getAllByRole('region', { name: 'Budget preliminare AI separato dal computo' })).toHaveLength(1); // old chat card evicted, independent saved summary remains
    expect(screen.getByRole('region', { name: 'Budget preliminare AI separato dal computo' })).toHaveTextContent('100,00');
    expect(call).toHaveBeenCalledTimes(1);
  }, 30_000); // 51 invii in un render solo: sulla CI occupata sfiorava i 5 secondi
  it('risposte ai dati mancanti continuano il budget e non diventano modifiche al computo', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ ...response(r), turn: { ...response(r).turn, message: 'Chiarimento budget', preliminaryBudget: null, proposals: [] } }));
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send('Budget preliminare del bagno'); await screen.findByText('Chiarimento budget');
    send('Sono al piano terra e scelgo finiture medie'); await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    expect(call.mock.calls[1][0].advanced?.mode).toBe('budget');
    fireEvent.click(screen.getAllByRole('button', { name: 'Passa al computo verificato' }).at(-1)!);
    send('Prepara le lavorazioni'); await waitFor(() => expect(call).toHaveBeenCalledTimes(3));
    expect(call.mock.calls[2][0].advanced?.mode).toBe('conversation');
  });
  it('citare la separazione budget/computo non attiva per errore la modalità budget', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => response(r));
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send('SIMULAZIONE: prepara le lavorazioni dell’appartamento; budget preliminare e computo verificato devono restare separati.');
    await waitFor(() => expect(call).toHaveBeenCalledTimes(1)); expect(call.mock.calls[0][0].advanced?.mode).toBe('conversation');
  });
  it('un nuovo budget invalida i vecchi pulsanti e le vecchie conferme anche senza cambiare revisione delle righe', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ ...response(r), turn: { ...response(r).turn, proposals: [], questions: [], message: `Budget sintetico ${call.mock.calls.length}`, preliminaryBudget: { scope: 'Bagno sintetico', currency: 'EUR', assumptions: ['Da verificare'], exclusions: [], groups: [{ label: 'Lavori', low: 1000 * call.mock.calls.length, high: 2000 * call.mock.calls.length, basis: 'Intervallo di test senza sovrapposizioni' }] } } }));
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send('Prepara un preventivo indicativo per un bagno'); await screen.findByText('Budget sintetico 1');
    fireEvent.click(screen.getByRole('button', { name: 'Prepara proposta indicativa dal budget' }));
    await screen.findByRole('button', { name: 'Conferma proposta indicativa dal budget · revisione 0' });
    send('Aggiorna il budget preliminare per lo stesso bagno'); await screen.findByText('Budget sintetico 2');
    expect(screen.getAllByRole('button', { name: 'Prepara proposta indicativa dal budget' })[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Conferma proposta indicativa dal budget · revisione 0' })).toBeDisabled();
    send('Conferma proposta indicativa dal budget · revisione 0');
    await screen.findByText('Conferma budget superata: rivedi la proposta indicativa attuale prima di applicarla.');
    openLines(); expect(screen.queryByRole('textbox', { name: 'Titolo voce 1' })).not.toBeInTheDocument();
    expect(call).toHaveBeenCalledTimes(2);
  });
  it('richiede formule per voci selezionate e non applica quantità ordinarie al loro posto', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => {
      const answer = response(r);
      if (call.mock.calls.length > 1) answer.turn.proposals = [{ ...r.lines[0], quantity: 999, quantityBasis: 'Quantità confermata dal modello, senza formula' }];
      return answer;
    });
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send('Una lavorazione'); await screen.findByText('Servono misure confermate');
    send('Proponi formule per voci 1');
    await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('Formula non applicata'));
    expect(call.mock.calls[1][0].messages.at(-1)?.text).toContain('r1: Lavorazione proposta [m²]');
    openLines(); expect(screen.getByRole('spinbutton', { name: 'Quantità voce 1' })).toHaveValue(10);
    send('Proponi formule per voci 99');
    expect(call).toHaveBeenCalledTimes(2); expect(screen.getByRole('log')).toHaveTextContent('Scegli da una a sei voci attive');
  });
  it("mostra solo il pannello attivo, conserva la bozza del messaggio e permette il ritorno dalla tab vuota", () => {
    const call = vi.fn<QuoteChatTransport>();
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    const input = screen.getByRole("textbox", { name: "Messaggio all’assistente preventivi" });
    fireEvent.change(input, { target: { value: "Un progetto ancora da inviare" } });
    openLines();
    expect(screen.getByRole("tabpanel", { name: "Voci del preventivo" })).toBeVisible();
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
    expect(input).toBeInTheDocument(); expect(input).not.toBeVisible();
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Inizia dalla chat" }));
    expect(screen.getByRole("textbox", { name: "Messaggio all’assistente preventivi" })).toBe(input);
    expect(input).toHaveValue("Un progetto ancora da inviare"); expect(call).not.toHaveBeenCalled();
  });
  it("cambiare tab durante una richiesta non la interrompe né la duplica", async () => {
    let resolve!: (r: QuoteChatResult) => void; let request!: QuoteChatRequest; let signal!: AbortSignal;
    const call = vi.fn<QuoteChatTransport>().mockImplementation((r, s) => { request = r; signal = s; return new Promise(done => { resolve = done; }); });
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send("Un campo da tennis"); openLines();
    expect(signal.aborted).toBe(false);
    await act(async () => resolve(response(request)));
    expect(screen.getByRole("textbox", { name: "Titolo voce 1" })).toHaveValue("Lavorazione proposta");
    expect(screen.getByRole("region", { name: "Anteprima del modello aziendale" })).toHaveTextContent("1 da completare · 0 da confermare");
    expect(screen.getByTestId("live-quote-total")).toHaveTextContent('Importo da determinare');
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Silvio AI" }), { button: 0, ctrlKey: false });
    expect(screen.getByRole("log")).toHaveTextContent("Servono misure confermate");
    expect(call).toHaveBeenCalledTimes(1); expect(signal.aborted).toBe(false);
  });
  it("rivedi voci apre l’editor senza perdere dettagli espansi e conserva il totale", async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => response(r));
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send("Una lavorazione"); await screen.findByText("Servono misure confermate");
    fireEvent.click(screen.getByRole("button", { name: /^Rivedi voci/ }));
    const title = screen.getByRole("textbox", { name: "Titolo voce 1" });
    const details = title.closest("td")!.querySelector("details")!;
    fireEvent.click(details.querySelector("summary")!);
    expect(details).toHaveAttribute("open");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Prezzo voce 1" }), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Includi voce 1" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Silvio AI" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("button", { name: /^Rivedi voci/ }));
    expect(screen.getByRole("textbox", { name: "Titolo voce 1" })).toBe(title);
    expect(details).toHaveAttribute("open");
    expect(screen.getByRole("checkbox", { name: "Includi voce 1" })).toBeChecked();
    expect(screen.getByTestId("live-quote-total").textContent).toContain(formatCurrency(120));
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("i tab si attivano anche da tastiera e collegano il pannello corretto", () => {
    render(<Workspace companyId={companyId} onBack={vi.fn()} />);
    const lines = screen.getByRole("tab", { name: "Voci del preventivo" });
    fireEvent.keyDown(lines, { key: "Enter" });
    expect(lines).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Voci del preventivo" })).toHaveAttribute("id", lines.getAttribute("aria-controls"));
    fireEvent.keyDown(screen.getByRole("tab", { name: "Silvio AI" }), { key: " " });
    expect(screen.getByRole("tab", { name: "Silvio AI" })).toHaveAttribute("aria-selected", "true");
  });
  it("riproduce la planimetria senza spacciarla per OCR o LLM e mantiene prezzi null", async () => {
    render(<Workspace companyId={companyId} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Analizza la planimetria di esempio" }));
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("due WC"));
    fireEvent.click(screen.getByRole("button", { name: "Solo camera in alto a sinistra, terrazzi esclusi" }));
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("19,5925"));
    fireEvent.click(screen.getByRole("button", { name: "Confermo 4,61 × 4,25 m netti; rifai pavimento e tinteggiatura" }));
    openLines();
    await waitFor(() => expect(screen.getByRole("spinbutton", { name: "Quantità voce 1" })).toHaveValue(19.59));
    expect(screen.getByRole("spinbutton", { name: "Quantità voce 3" })).toHaveValue(null);
    expect(screen.getByRole("spinbutton", { name: "Prezzo voce 1" })).toHaveValue(null);
    expect(screen.getByRole("checkbox", { name: "Includi voce 1" })).toBeDisabled();
    expect(screen.getAllByRole("tab")).toHaveLength(2); expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByTestId("live-quote-total")).toHaveTextContent('Importo da determinare');
    fireEvent.change(screen.getByRole("spinbutton", { name: "Prezzo voce 1" }), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Includi voce 1" }));
    expect(screen.getByTestId("live-quote-total").textContent).toContain(formatCurrency(293.85));
    send("Prezzo voce 1: 20 €");
    expect(screen.getByTestId("live-quote-total").textContent).toContain(formatCurrency(391.8));
    send("Quantità voce 1: 10 mq"); expect(screen.getByTestId("live-quote-total").textContent).toContain(formatCurrency(200));
    send("Quantità voce 1: 10 cad"); expect(screen.getByTestId("live-quote-total").textContent).toContain(formatCurrency(200));
    expect(screen.getByRole("log")).toHaveTextContent("Unità incompatibile");
    expect(screen.queryByText("IVA 0%")).not.toBeInTheDocument();
  });
  it("non chiama il provider durante digitazione e usa un solo turno per Invio", async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => response(r));
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Messaggio all’assistente preventivi" }), { target: { value: "Un lavoro non previsto da un modello" } });
    expect(call).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Invia messaggio" }));
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Servono misure confermate"));
    expect(call).toHaveBeenCalledTimes(1); expect(screen.getByText(/Ultimo esito: modello-effettivo-dal-router/)).toBeInTheDocument();
    expect(call.mock.calls[0][0].messages.at(-1)?.text).toContain("non previsto");
  });
  it("le fonti si scelgono in chat senza chiamare LLM", async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => response(r));
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    fireEvent.click(screen.getByRole("button", { name: "Mostra prezzari" }));
    const candidate = await screen.findByRole('button', { name: /Lombardia · 2025/ });
    fireEvent.click(candidate); expect(call).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Usa questo prezzario' }));
    await screen.findByText(/Useremo il prezzario/);
    expect(call).not.toHaveBeenCalled(); send("Pavimento di 30 mq");
    await waitFor(() => expect(call).toHaveBeenCalledTimes(1)); expect(call.mock.calls[0][0].sourceId).toBe(source.id);
  });
  it("Stop e cambi azienda non applicano risultati tardivi né rilanciano il provider", async () => {
    let resolve!: (r: QuoteChatResult) => void; let request!: QuoteChatRequest; let signal!: AbortSignal;
    const call = vi.fn<QuoteChatTransport>().mockImplementation((r, s) => { request = r; signal = s; return new Promise(done => { resolve = done; }); });
    const view = render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send("Costruisci un campo da tennis");
    fireEvent.click(screen.getByRole("button", { name: "Interrompi risposta" }));
    expect(signal.aborted).toBe(true); await act(async () => resolve(response(request)));
    expect(screen.queryByRole("region", { name: "Voci modificabili del preventivo" })).not.toBeInTheDocument();
    send("Altra prova"); view.rerender(<Workspace companyId="b2000000-0000-4000-a000-000000000002" onBack={vi.fn()} simulated={false} transport={call} />);
    expect(signal.aborted).toBe(true); await act(async () => resolve(response(request)));
    expect(screen.getByRole("log")).not.toHaveTextContent("Servono misure confermate"); expect(call).toHaveBeenCalledTimes(2);
  });
  it("una modifica durante l’attesa conserva la riga e annulla l’applicazione AI", async () => {
    let resolve!: (r: QuoteChatResult) => void; let request!: QuoteChatRequest;
    const call = vi.fn<QuoteChatTransport>().mockImplementationOnce(async r => response(r)).mockImplementation((r) => { request = r; return new Promise(done => { resolve = done; }); });
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send("Prima proposta"); openLines(); await waitFor(() => expect(screen.getByRole("textbox", { name: "Titolo voce 1" })).toBeInTheDocument());
    send("Modifica la proposta"); openLines(); fireEvent.change(screen.getByRole("textbox", { name: "Titolo voce 1" }), { target: { value: "Il mio titolo" } });
    await act(async () => resolve(response(request)));
    expect(screen.getByRole("textbox", { name: "Titolo voce 1" })).toHaveValue("Il mio titolo");
  });
  it("errore o JSON fuori contratto non aggiungono righe parziali", async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ ...response(r), turn: { ...response(r).turn, proposals: [{ ...response(r).turn.proposals[0], quantity: Infinity }] } }));
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send("Proponi voci"); await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Quantità non valida"));
    expect(screen.queryByRole("region", { name: "Voci modificabili del preventivo" })).not.toBeInTheDocument();
  });
});
