import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { IDBFactory } from "fake-indexeddb";
import { Blob as NodeBlob } from "node:buffer";
import { reading, memoryScope, localSnapshot } from "./localPlanFixtures";
import { createLocalQuoteMemory } from "@/lib/preventivi/localQuoteMemory";
import type { PlanReading } from "@/lib/preventivi/planReading";
vi.mock("@/lib/prezzario/queries", () => ({ usePrezzarioFonti: () => ({ data: [] as never[], isFetching: false, error: null as Error | null, refetch: vi.fn() }) }));
vi.mock("@/lib/preventivi/quoteLocalCatalogue", () => ({ readLocalQuoteCatalogue: vi.fn() }));
vi.mock("@/lib/preventivi/planReading", async original => ({ ...await original<typeof import("@/lib/preventivi/planReading")>(), readPlanLocally: vi.fn() }));
import { readPlanLocally } from "@/lib/preventivi/planReading";
import Workspace from "@/components/quotes/dev/QuoteAssistedWorkspace";
import PersistentQuoteSession, { type MemoryProps } from "@/components/quotes/dev/PersistentQuoteSession";
import type { QuoteChatTransport } from "@/lib/preventivi/quoteChatDocument";
import type { QuoteSimulationId } from "@/lib/preventivi/quoteSimulationScenarios";
beforeAll(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  // Native Blob structured cloning is supported by browsers; jsdom File is not clonable in Node.
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:test"); static revokeObjectURL = vi.fn(); });
});
afterEach(() => { cleanup(); vi.mocked(readPlanLocally).mockReset(); });
const openLines = () => fireEvent.mouseDown(screen.getByRole("tab", { name: "Voci del preventivo" }), { button: 0, ctrlKey: false });
const openChat = () => fireEvent.mouseDown(screen.getByRole("tab", { name: "Silvio AI" }), { button: 0, ctrlKey: false });
function send(text: string) { openChat(); fireEvent.change(screen.getByRole("textbox", { name: "Messaggio all’assistente preventivi" }), { target: { value: text } }); fireEvent.click(screen.getByRole("button", { name: "Invia messaggio" })); }
function attach() {
  const file = Object.assign(new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }), { name: "pianta.jpg", lastModified: 0 });
  fireEvent.change(screen.getByLabelText("File planimetria"), { target: { files: [file] } });
}
function RemountProbe({ memory }: { memory: MemoryProps }) {
  const [title] = useState(memory.initial.snapshot?.document.title ?? "vuoto");
  const snapshot = localSnapshot(); snapshot.document.title = "Ultima bozza con scelta"; snapshot.plan = null; snapshot.rooms = []; snapshot.selectedRoom = null; snapshot.rectangle = null;
  return <div><p>{title}</p><span>{memory.status}</span><button onClick={() => memory.save(snapshot, null)}>Salva versione nuova</button></div>;
}
function ScenarioProbe({ ownerId, transport }: { ownerId: string; transport: QuoteChatTransport }) {
  const [scenarioId, setScenario] = useState<QuoteSimulationId | null>(null);
  return <Workspace companyId={memoryScope.companyId} ownerId={ownerId} memoryMode="plan" scenarioId={scenarioId ?? undefined} onScenario={setScenario} simulated={false} transport={transport} onBack={vi.fn()} />;
}
describe("Planimetria e memoria: percorso intero nella chat", () => {
  it("separa una richiesta mista e compone solo dopo la conferma esplicita, senza riscrivere il messaggio originale", async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "test", references: [], turn: { version: 1, title: "", message: "Lavorazioni ricevute", questions: [], warnings: [], searches: [], proposals: [] } }));
    render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    const original = "Rifai pavimento soggiorno 22 m²; non ho ancora deciso il soffitto soggiorno";
    send(original); expect(call).not.toHaveBeenCalled(); expect(screen.getByRole("log")).toHaveTextContent(original);
    fireEvent.click(screen.getByRole("button", { name: "Componi le lavorazioni confermate" }));
    await screen.findByText("Lavorazioni ricevute"); expect(call).toHaveBeenCalledOnce();
    expect(call.mock.calls[0][0].messages.at(-1)?.text).toContain("Rifai pavimento soggiorno");
    expect(call.mock.calls[0][0].messages.at(-1)?.text).not.toContain("non ho ancora deciso");
    expect(call.mock.calls[0][0].context?.brief).toContain("undecided");
  });
  it("mostra il calcolo serramenti e lo allega come riscontro software alla richiesta, senza approvare voci", async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "Stub locale", references: [], turn: { version: 1, title: "", message: "Dati da verificare", questions: [], warnings: [], searches: [], proposals: [] } }));
    render(<Workspace companyId={memoryScope.companyId} scenarioId="serramenti" onBack={vi.fn()} simulated={false} transport={call} />);
    send("2 finestre da 120 × 140 cm e 1 portafinestra da 100 × 240 cm"); await screen.findByText("Dati da verificare");
    expect(screen.getByRole("log")).toHaveTextContent("3,36 m² totali");
    const softwareEvidence = call.mock.calls[0][0].messages.find(m => m.text.includes('RISCONTRO DEL SOFTWARE'));
    expect(softwareEvidence?.text).toContain("3,36 m² totali");
    expect(call.mock.calls[0][0].messages.at(-1)?.text).toBe("2 finestre da 120 × 140 cm e 1 portafinestra da 100 × 240 cm");
    send("Verifica misure serramenti"); expect(call).toHaveBeenCalledOnce();
    expect(screen.getByTestId("live-quote-total")).toHaveTextContent('Importo da determinare');
  });
  it("mostra le proposte incomplete nell’anteprima senza trasformarle in totale confermato", async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "Stub locale", references: [], turn: { version: 1, title: "", message: "Proposta da verificare", questions: [], warnings: [], searches: [], proposals: [{ id: "bath_floor", title: "Bagno · Pavimento", description: "Materiali da definire", unit: "m²", quantity: 6, quantityBasis: "2 × 3 m", referenceId: null }] } }));
    render(<Workspace companyId={memoryScope.companyId} scenarioId="bagno" onBack={vi.fn()} simulated={false} transport={call} />);
    send("Rifai pavimento bagno");
    fireEvent.click(await screen.findByText('1 proposte fuori dal documento'));
    await screen.findByRole("region", { name: "Proposte non incluse nel parziale" });
    expect(screen.getByRole("region", { name: "Proposte non incluse nel parziale" })).toHaveTextContent("Bagno · Pavimento");
    expect(screen.getByRole("region", { name: "Proposte non incluse nel parziale" })).toHaveTextContent("Prezzo da definire");
    expect(screen.getByTestId("live-quote-total")).toHaveTextContent('Importo da determinare');
    openLines(); fireEvent.change(screen.getByRole("spinbutton", { name: "Prezzo voce 1" }), { target: { value: "60" } });
    expect(screen.getByTestId("live-quote-total")).toHaveTextContent('Importo da determinare');
    fireEvent.click(screen.getByRole("checkbox", { name: "Includi voce 1" }));
    expect(screen.getByTestId("live-quote-total")).toHaveTextContent("360,00");
    expect(screen.queryByRole("region", { name: "Proposte non incluse nel parziale" })).not.toBeInTheDocument();
  });
  it("sceglie prove dalla chat, salva prima del cambio e ritrova il progetto principale senza chiamate automatiche", async () => {
    const scope = { ...memoryScope, ownerId: "a8000000-0000-4000-a000-000000000001" };
    const snapshot = localSnapshot(); snapshot.plan = null; snapshot.rooms = []; snapshot.rectangle = null; snapshot.selectedRoom = null;
    snapshot.document.lines[0].price = 15; snapshot.document.lines[0].included = true;
    await createLocalQuoteMemory().save(scope, snapshot, 0, null);
    const call = vi.fn<QuoteChatTransport>(); render(<ScenarioProbe ownerId={scope.ownerId} transport={call} />);
    await screen.findByRole("button", { name: "Allega file" }); send("Mostra simulazioni");
    fireEvent.click(screen.getByText('Esempi già preparati'));
    fireEvent.click(screen.getByRole("button", { name: "Simulazione bagno completo" }));
    await screen.findByText("Simulazione: Bagno completo.", { selector: "strong" });
    expect((screen.getByRole("textbox", { name: "Messaggio all’assistente preventivi" }) as HTMLTextAreaElement).value).toContain("ristrutturare completamente un bagno");
    openLines(); expect(screen.queryByRole("textbox", { name: "Titolo voce 1" })).not.toBeInTheDocument();
    send("Mostra simulazioni"); fireEvent.click(screen.getByText('Esempi già preparati')); fireEvent.click(screen.getByRole("button", { name: "Simulazione solo serramenti" }));
    await screen.findByText("Simulazione: Solo serramenti.", { selector: "strong" }); expect(call).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Torna al progetto principale" }));
    await screen.findByRole("heading", { level: 3, name: snapshot.document.title }); openLines();
    await waitFor(() => expect(screen.getByRole("spinbutton", { name: "Prezzo voce 1" })).toHaveValue(15));
    expect(screen.getByRole("checkbox", { name: "Includi voce 1" })).toBeChecked(); expect(call).not.toHaveBeenCalled();
  });
  it("un figlio rimontato riparte dall’ultimo salvataggio, non dalla vecchia copia del primo caricamento", async () => {
    const scope = { ...memoryScope, ownerId: "a5000000-0000-4000-a000-000000000002" };
    const view = render(<PersistentQuoteSession scope={scope}>{memory => <RemountProbe key="prima" memory={memory} />}</PersistentQuoteSession>);
    fireEvent.click(await screen.findByRole("button", { name: "Salva versione nuova" })); await screen.findByText("Salvato su questo browser", {}, { timeout: 3000 });
    expect(screen.getByText("vuoto")).toBeInTheDocument();
    view.rerender(<PersistentQuoteSession scope={scope}>{memory => <RemountProbe key="dopo-refresh" memory={memory} />}</PersistentQuoteSession>);
    await screen.findByText("Ultima bozza con scelta");
  });
  it("riprende una scelta già inviata senza ripeterla al provider dopo rimontaggio", async () => {
    const ownerId = "a5000000-0000-4000-a000-000000000001";
    let responses = 0;
    const choices = [{ id: "keep", label: "Mantieni pavimento", reply: "Confermo di conservare il pavimento finito della camera, senza nuova posa." }, { id: "replace", label: "Sostituisci pavimento", reply: "Preferisco sostituire il pavimento della camera, previa verifica tecnica." }];
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "Stub locale", references: [],
      turn: { version: 1, title: "Progetto", message: ++responses === 1 ? "Scegli il pavimento" : "Scelta ricevuta", questions: [], warnings: [], searches: [], proposals: [], choices: responses === 1 ? choices : [] } }));
    const element = <Workspace ownerId={ownerId} companyId={memoryScope.companyId} onBack={vi.fn()} simulated={false} transport={call} />;
    const view = render(element); await screen.findByRole("button", { name: "Allega file" }); send("Quali alternative?");
    fireEvent.click(await screen.findByRole("button", { name: "Mantieni pavimento" })); await screen.findByText("Scelta ricevuta");
    await screen.findByText("Salvato su questo browser", {}, { timeout: 3000 }); view.unmount(); render(element);
    const selected = await screen.findByRole("button", { name: "Mantieni pavimento" }); expect(selected).toHaveAttribute("aria-pressed", "true"); expect(selected).toBeDisabled(); expect(call).toHaveBeenCalledTimes(2);
  });
  it("conserva esclusioni utente anche se il provider fallisce e dopo rimontaggio; domande senza marcatori doppi", async () => {
    const scope = { ...memoryScope, ownerId: "a4000000-0000-4000-a000-000000000001" };
    const call = vi.fn<QuoteChatTransport>().mockRejectedValueOnce(new Error("Timeout di test")).mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "Stub locale", references: [],
      turn: { version: 1, title: "Titolo non richiesto", message: "Quali finiture?", questions: ["1. Quale **finitura** vuoi?"], warnings: [], searches: [], proposals: [], brief: "Riepilogo che omette le esclusioni" } }));
    const element = <Workspace ownerId={scope.ownerId} companyId={scope.companyId} onBack={vi.fn()} simulated={false} transport={call} />;
    const view = render(element); await screen.findByRole("button", { name: "Allega file" });
    send("Rinomina preventivo: Titolo mio"); send("Impianti, soffitto, bagno e terrazzi esclusi.");
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Timeout di test"));
    await screen.findByText("Salvato su questo browser", {}, { timeout: 3000 }); view.unmount(); render(element);
    await screen.findByRole("button", { name: "Allega file" }); send("Quali dati servono ora?");
    await screen.findByText("finitura", { selector: "strong" });
    expect(call.mock.calls[1][0].context?.scopeFacts?.map(f => f.topic)).toEqual(["soffitto", "terrazzi", "bagno", "impianti"]);
    expect(call.mock.calls[1][0].context?.currentTitle).toBe("Titolo mio");
    expect(screen.getByRole("log").querySelector(".quote-chat-questions ol")).toBeNull();
    expect(screen.getByRole("log")).not.toHaveTextContent("1. Quale");
    send("Mostra esclusioni"); expect(call).toHaveBeenCalledTimes(2); expect(screen.getByRole("log")).toHaveTextContent("Decisioni esplicite salvate");
  });
  it("formatta risposta, domande e avvisi AI senza applicare interpretazioni al messaggio utente", async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "Stub locale",
      references: [], turn: { version: 1, title: "Progetto", message: "## Prossimo passo\n\nConfermiamo **le finiture**.\n\n- Nessun prezzo inventato", questions: ["Quale **formato** preferisci?"], warnings: ["**Supporto** da verificare"], searches: [], proposals: [] } }));
    render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send("Vorrei **pavimenti nuovi**");
    await screen.findByRole("heading", { name: "Prossimo passo", level: 4 });
    expect(screen.getByText("le finiture", { selector: "strong" })).toBeInTheDocument(); expect(screen.getByText("formato", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Supporto", { selector: "strong" })).toBeInTheDocument(); expect(screen.getByText("Vorrei **pavimenti nuovi**")).toBeInTheDocument();
    expect(call).toHaveBeenCalledTimes(1); expect(screen.getAllByRole("tab")).toHaveLength(2);
  });
  it("riprende le decisioni per stanza e blocca proposte escluse anche da un backend non conforme", async () => {
    const scope = { ...memoryScope, ownerId: "a7000000-0000-4000-a000-000000000001" };
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "Stub locale", references: [],
      turn: { version: 1, title: "", message: "Ho aggiornato tutte le voci.\n\nVerifica tecnica necessaria.", questions: [], warnings: [], searches: [], proposals: [
        { id: "kitchen_ceiling", title: "Cucina · Tinteggiatura soffitto", description: "Da verificare", quantity: null, unit: "m²", quantityBasis: "Da rilevare", referenceId: null },
        { id: "bedroom_ceiling", title: "Camera · Tinteggiatura soffitto", description: "Da verificare", quantity: null, unit: "m²", quantityBasis: "Da rilevare", referenceId: null }] } }));
    const element = <Workspace ownerId={scope.ownerId} companyId={scope.companyId} onBack={vi.fn()} simulated={false} transport={call} />;
    const view = render(element); await screen.findByRole("button", { name: "Allega file" }); send("Soffitto cucina escluso; includi soffitto camera");
    await screen.findByText("Verifica tecnica necessaria."); expect(screen.getByRole("log")).not.toHaveTextContent("Ho aggiornato tutte le voci");
    expect(screen.getByRole("log")).toHaveTextContent("Vedi modifiche");
    openLines(); expect(screen.getByRole("textbox", { name: "Titolo voce 1" })).toHaveValue("Camera · Tinteggiatura soffitto");
    expect(screen.queryByRole("textbox", { name: "Titolo voce 2" })).not.toBeInTheDocument();
    await screen.findByText("Salvato su questo browser", {}, { timeout: 3000 }); view.unmount(); render(element);
    await screen.findByRole("button", { name: "Allega file" }); send("Mostra memoria");
    expect(call).toHaveBeenCalledTimes(1); expect(screen.getByRole("log")).toHaveTextContent("cucina"); expect(screen.getByRole("log")).toHaveTextContent("camera");
    send("Quali misure servono?"); await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    expect(call.mock.calls[1][0].context?.roomDecisions?.map(d => [d.room, d.work, d.state])).toEqual([["cucina", "soffitto", "excluded"], ["camera", "soffitto", "included"]]);
  });
  it("chiede conferma prima del confronto e si ferma se il costo è ignoto, senza creare voci", async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: r.modelTest!.model, references: [],
      turn: { version: 1, title: "", message: "Verifica sintetica", questions: [], warnings: [], searches: [], proposals: [] },
      modelTest: { requestedModel: r.modelTest!.model, caseId: r.modelTest!.caseId, calls: 1, inputTokens: 100, outputTokens: 10, costUsd: null,
        rawTurns: [{ version: 1, title: "", message: "Verifica sintetica", questions: [], warnings: [], searches: [], proposals: [] }] } }));
    render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send("Confronta modelli"); expect(call).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Avvia confronto sintetico modelli" }));
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Confronto interrotto dopo 1/12"));
    expect(screen.getByRole("log")).toHaveTextContent("Costo provider non disponibile"); expect(call).toHaveBeenCalledOnce();
    openLines(); expect(screen.queryByRole("textbox", { name: "Titolo voce 1" })).not.toBeInTheDocument();
  });
  it("non attribuisce il confronto al modello richiesto se risponde un fallback", async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "fallback/diverso", references: [],
      turn: { version: 1, title: "", message: "Risposta", questions: [], warnings: [], searches: [], proposals: [] } }));
    render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send("Avvia confronto sintetico modelli");
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Confronto interrotto dopo 0/12")); expect(call).toHaveBeenCalledOnce();
    expect(screen.getByRole("log")).toHaveTextContent("modello/caso effettivo");
  });
  it("una vecchia esclusione non può agire su una revisione modificata manualmente", async () => {
    const scope = { ...memoryScope, ownerId: "a7000000-0000-4000-a000-000000000002" };
    const snapshot = localSnapshot(); snapshot.plan = null; snapshot.rooms = []; snapshot.selectedRoom = null; snapshot.rectangle = null;
    snapshot.document.lines[0].price = 15; snapshot.document.lines[0].included = true;
    await createLocalQuoteMemory().save(scope, snapshot, 0, null);
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "Stub locale", references: [],
      turn: { version: 1, title: "", message: "La voce è ancora inclusa fino alla conferma.", questions: [], warnings: [], searches: [], proposals: [], excludeIds: [r.lines[0].id] } }));
    render(<Workspace ownerId={scope.ownerId} companyId={scope.companyId} memoryMode="plan" onBack={vi.fn()} simulated={false} transport={call} />);
    await screen.findByRole("button", { name: "Allega file" }); send("Proponi di escludere la prima voce");
    expect(await screen.findByRole("button", { name: "Escludi voce 1" })).toBeEnabled();
    openLines(); fireEvent.change(screen.getByRole("spinbutton", { name: "Prezzo voce 1" }), { target: { value: "25" } }); openChat();
    expect(screen.getByRole("button", { name: "Escludi voce 1" })).toBeDisabled();
    expect(screen.getByRole("log")).toHaveTextContent("Proposta precedente");
  });
  it("interrompe il confronto senza applicare risultati tardivi né rilanciarlo", async () => {
    let resolve!: (result: Awaited<ReturnType<QuoteChatTransport>>) => void;
    const call = vi.fn<QuoteChatTransport>().mockImplementation(() => new Promise(r => { resolve = r; }));
    render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send("Avvia confronto sintetico modelli"); fireEvent.click(screen.getByRole("button", { name: "Interrompi risposta" }));
    const request = call.mock.calls[0][0];
    await act(async () => resolve({ version: 1, revision: request.revision, turnId: request.turnId, simulated: false, model: request.modelTest!.model, references: [], turn: { version: 1, title: "", message: "Risultato tardivo", questions: [], warnings: [], searches: [], proposals: [] } }));
    expect(call).toHaveBeenCalledOnce(); expect(screen.getByRole("log")).not.toHaveTextContent("Risultato tardivo");
    openLines(); expect(screen.queryByRole("textbox", { name: "Titolo voce 1" })).not.toBeInTheDocument();
  });
  it("non promuove il riepilogo di un’ipotesi nella memoria confermata neppure con backend non conforme", async () => {
    let responses = 0;
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "Stub locale", references: [],
      turn: { version: 1, title: "Progetto", message: "Risposta di prova", questions: [], warnings: [], searches: [], proposals: [], brief: ++responses === 1 ? "Lavori confermati" : "Ipotesi erroneamente confermata" } }));
    render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send("Rifacciamo la cucina"); await screen.findByText("Risposta di prova");
    send("Non ho ancora deciso se mantenere il pavimento");
    await waitFor(() => expect(screen.getAllByText("Risposta di prova")).toHaveLength(2));
    send("Quali dati servono?"); await waitFor(() => expect(call).toHaveBeenCalledTimes(3));
    expect(call.mock.calls[2][0].context?.brief).toContain("Lavori confermati");
    expect(call.mock.calls[2][0].context?.brief).not.toContain("Ipotesi erroneamente confermata");
  });
  it("mostra il riferimento acquisito in chat senza richiamare il provider o modificare le righe", async () => {
    const scope = { ...memoryScope, ownerId: "a3000000-0000-4000-a000-000000000001" };
    const snapshot = localSnapshot(); snapshot.input = "";
    const ref = { id: "a3000000-0000-4000-a000-000000000002", sourceId: "9b9bb854-9317-43b0-bab1-d3b706bc4993", code: "CODICE-FIXTURE", description: "Testo originale del campione", unit: "m²", price: 54.11, sourceName: "Fonte test" };
    snapshot.sourceId = ref.sourceId; snapshot.document.lines[0] = { ...snapshot.document.lines[0], referenceId: ref.id, reference: ref, price: 70, manual: true };
    await createLocalQuoteMemory().save(scope, snapshot, 0, new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }));
    const transport = vi.fn<QuoteChatTransport>();
    render(<Workspace ownerId={scope.ownerId} companyId={scope.companyId} memoryMode="plan" onBack={vi.fn()} simulated={false} transport={transport} />);
    await screen.findByRole("tab", { name: "Voci del preventivo" }); openLines(); await screen.findByRole("textbox", { name: "Titolo voce 1" }); send("Mostra riferimenti");
    fireEvent.click(await screen.findByRole("button", { name: "Mostra riferimento voce 1" }));
    expect(screen.getByRole("log")).toHaveTextContent("CODICE-FIXTURE"); expect(screen.getByRole("log")).toHaveTextContent("54,11");
    openLines(); expect(screen.getByRole("spinbutton", { name: "Prezzo voce 1" })).toHaveValue(70); expect(transport).not.toHaveBeenCalled();
  });
  it("dialogo AI libero: usa l’OCR e conserva brief, propone voci ed esclusioni confermabili in chat", async () => {
    vi.mocked(readPlanLocally).mockResolvedValue(reading);
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "OpenRouter-stub-per-test",
      references: [], turn: { version: 1, title: "Camera e cucina", message: "Partiamo dagli ambienti richiesti", questions: ["Quali finiture vuoi mantenere?"], warnings: [], searches: [],
        brief: "Terrazzi esclusi, bagno invariato", excludeIds: r.lines.length ? [r.lines[0].id] : [], proposals: r.lines.length ? [] : [{ id: "kitchen", title: "Cucina · Preparazione pareti", description: "Da definire", unit: "m²", quantity: null, quantityBasis: "Altezza e aperture da confermare", referenceId: null }] } }));
    render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} simulated={false} transport={call} />); attach();
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("8 testi"));
    send("Vorrei rinnovare solo la cucina, mantenendo il bagno e senza lavori sui terrazzi: da cosa partiamo?");
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Quali finiture vuoi mantenere?"));
    expect(call.mock.calls[0][0].context?.plan?.texts[0].text).toBe("letto");
    openLines();
    expect(screen.getByRole("spinbutton", { name: "Prezzo voce 1" })).toHaveValue(null);
    // A row already outside the total does not need a redundant exclusion.
    fireEvent.change(screen.getByRole("spinbutton", { name: "Quantità voce 1" }), { target: { value: "10" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Prezzo voce 1" }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Includi voce 1" }));
    send("Quella preparazione non mi serve: proponi di toglierla");
    await screen.findByRole("button", { name: "Escludi voce 1" });
    expect(screen.getByRole("log")).toHaveTextContent("Esclusione ancora da confermare.");
    openLines();
    expect(screen.getByRole("checkbox", { name: "Includi voce 1" })).toBeChecked();
    expect(call.mock.calls[1][0].context?.brief).toBe("Terrazzi esclusi, bagno invariato");
    expect(screen.getAllByRole("tab")).toHaveLength(2); expect(call).toHaveBeenCalledTimes(2);
  });
  it("backend OpenRouter assente: non applica una risposta simulata e conserva le voci", async () => {
    const call = vi.fn<QuoteChatTransport>().mockRejectedValue(new Error("Backend AI locale non attivo"));
    render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send("Che interventi consigli per questa pianta?");
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Backend AI locale non attivo"));
    expect(screen.queryByRole("region", { name: "Voci modificabili del preventivo" })).not.toBeInTheDocument();
  });
  it("OCR, scelta, conferma, valori manuali e ripresa dopo rimontaggio senza un’altra lettura", async () => {
    vi.mocked(readPlanLocally).mockResolvedValue(reading);
    const element = <StrictMode><Workspace ownerId={memoryScope.ownerId} companyId={memoryScope.companyId} onBack={vi.fn()} /></StrictMode>;
    const view = render(element);
    await screen.findByRole("button", { name: "Allega file" }); attach();
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("8 testi"));
    fireEvent.click(screen.getByRole("button", { name: "Seleziona ambiente 1 pagina 1" }));
    send("confermo rettangolo 4,61 x 4,25 m"); send("rifai pavimento e tinteggiatura");
    openLines();
    expect(screen.getByRole("spinbutton", { name: "Quantità voce 1" })).toHaveValue(19.59);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Prezzo voce 1" }), { target: { value: "15" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Titolo voce 1" }), { target: { value: "Titolo conservato" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Includi voce 1" }));
    openChat();
    fireEvent.change(screen.getByRole("textbox", { name: "Messaggio all’assistente preventivi" }), { target: { value: "Da continuare dopo" } });
    await screen.findByText("Salvato su questo browser", {}, { timeout: 3000 });
    view.unmount(); render(element);
    await screen.findByRole("tab", { name: "Voci del preventivo" }); openLines();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Titolo voce 1" })).toHaveValue("Titolo conservato"));
    expect(screen.getByRole("spinbutton", { name: "Prezzo voce 1" })).toHaveValue(15);
    expect(screen.getByRole("checkbox", { name: "Includi voce 1" })).toBeChecked();
    openChat(); expect(screen.getByRole("textbox", { name: "Messaggio all’assistente preventivi" })).toHaveValue("Da continuare dopo");
    expect(screen.getByRole("log")).toHaveTextContent("8 testi"); expect(readPlanLocally).toHaveBeenCalledTimes(1);
    send("non rifai pavimento"); expect(screen.getByRole("log")).toHaveTextContent("non usa un LLM");
    openLines();
    expect(screen.getByRole("textbox", { name: "Titolo voce 1" })).toHaveValue("Titolo conservato");
  });
  it("Stop impedisce l’applicazione tardiva dell’OCR; il file resta recuperabile", async () => {
    let resolve!: (r: PlanReading) => void; let signal!: AbortSignal;
    vi.mocked(readPlanLocally).mockImplementation((_b, _p, s) => { signal = s; return new Promise(done => { resolve = done; }); });
    render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} />); attach();
    await screen.findByRole("button", { name: "Interrompi risposta" }); fireEvent.click(screen.getByRole("button", { name: "Interrompi risposta" }));
    expect(signal.aborted).toBe(true); await act(async () => resolve(reading));
    expect(screen.getByRole("log")).not.toHaveTextContent("8 testi");
    expect(screen.getByRole("log")).toHaveTextContent("Lettura locale interrotta");
    vi.mocked(readPlanLocally).mockResolvedValue(reading); send("leggi planimetria");
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("8 testi"));
  });
  it("pagina PDF differente: non usa pulsanti di ambiente obsoleti né misure precedenti", async () => {
    vi.mocked(readPlanLocally).mockResolvedValueOnce(reading).mockResolvedValue({ ...reading, page: 2 });
    render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} />); attach();
    await screen.findByRole("button", { name: "Seleziona ambiente 1 pagina 1" }); send("pagina 2");
    await screen.findByRole("button", { name: "Seleziona ambiente 1 pagina 2" });
    fireEvent.click(screen.getByRole("button", { name: "Seleziona ambiente 1 pagina 1" }));
    expect(screen.getByRole("log")).toHaveTextContent("un’altra pagina");
    send("confermo rettangolo 4 x 5 m"); expect(screen.getByRole("log")).toHaveTextContent("Seleziona prima");
  });
});
