import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { legacyQuoteChoices, readQuoteChatChoices, type QuoteChatChoice } from "../../../supabase/functions/_shared/quoteChoices";
import { quoteChatResponseFormat, readQuoteChatTurn, type QuoteChatTurn, type QuoteChatProposal } from "../../../supabase/functions/_shared/quoteConversation";
import { readLocalQuoteSnapshot } from "@/lib/preventivi/localQuoteMemory";
import type { QuoteChatTransport } from "@/lib/preventivi/quoteChatDocument";
import Workspace from "@/components/quotes/dev/QuoteAssistedWorkspace";
import { QuoteChatChoices } from "@/components/quotes/dev/QuoteChatChoices";
import { localSnapshot, memoryScope, turnId } from "./localPlanFixtures";
vi.mock("@/lib/prezzario/queries", () => ({ usePrezzarioFonti: () => ({ data: [] as never[], isFetching: false, error: null as Error | null }) }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
const choices: QuoteChatChoice[] = [
  { id: "keep", label: "Conserva il pavimento", reply: "Scelgo di conservare il pavimento finito della camera senza posarne uno nuovo. Non includere importi automaticamente." },
  { id: "overlay", label: "Nuovo in sovrapposizione", reply: "Per la camera scelgo di valutare un pavimento nuovo sopra quello esistente, previa verifica del supporto e delle quote." },
];
const turn: QuoteChatTurn = { version: 1, title: "Progetto", message: "Scegli una soluzione per il pavimento della camera.", questions: [], proposals: [], warnings: [], searches: [], choices };
function send(text: string) { fireEvent.change(screen.getByRole("textbox", { name: "Messaggio all’assistente preventivi" }), { target: { value: text } }); fireEvent.click(screen.getByRole("button", { name: "Invia messaggio" })); }
const transport = () => vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "Stub locale", references: [], turn }));
describe("Alternative nella chat, non azioni automatiche sul documento", () => {
  it("mostra secondi realmente trascorsi, non avanza fasi finte e si ferma con Interrompi", async () => {
    vi.useFakeTimers();
    const call = vi.fn<QuoteChatTransport>().mockImplementation(() => new Promise<Awaited<ReturnType<QuoteChatTransport>>>(() => {}));
    render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} simulated={false} transport={call} />); send("Prova contatore");
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(screen.getByText("3s", { selector: "small" })).toBeInTheDocument(); expect(screen.getByRole("list", { name: "Fasi operative" }).querySelectorAll("li[data-step-state=complete]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Interrompi risposta" })); await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.queryByText("5s", { selector: "small" })).not.toBeInTheDocument(); expect(screen.getByRole("log")).toHaveTextContent("Attesa interrotta");
  });
  it("valida scelte limitate e mantiene compatibilità con risposte senza alternative", () => {
    expect(readQuoteChatChoices(choices)).toEqual(choices);
    expect(readQuoteChatTurn(turn).choices).toEqual(choices);
    expect(readQuoteChatTurn({ ...turn, choices: undefined }).choices).toBeUndefined();
    const schema = quoteChatResponseFormat({ version: 1, companyId: memoryScope.companyId, sessionId: turnId, turnId, revision: 0, sourceId: null, lines: [], messages: [{ role: "user", text: "Quali alternative?" }] });
    expect(schema.json_schema.schema.required).toContain("choices"); expect(schema.json_schema.schema.properties.choices.maxItems).toBe(4);
  });
  it.each([null, [choices[0]], [...choices, ...choices], [{ ...choices[0], label: "" }, choices[1]], [{ ...choices[0], reply: "x".repeat(601) }, choices[1]], [{ ...choices[0], id: "../exec" }, choices[1]]])("rifiuta alternative non valide: %j", raw => expect(() => readQuoteChatChoices(raw)).toThrow());
  it("recupera solo alternative A/B esplicite dai testi storici, senza interpretare liste o HTML", () => {
    expect(legacyQuoteChoices("**Alternativa A: conservare il pavimento**\nNessuna nuova posa.\n\n**Alternativa B: nuovo in sovrapposizione**").map(c => c.id)).toEqual(["legacy-a", "legacy-b"]);
    expect(legacyQuoteChoices("- Alternativa A: conservare finito esistente\n- Alternativa B: nuovo pavimento")).toHaveLength(2);
    expect(legacyQuoteChoices("- Bagno\n- Cucina")).toEqual([]);
    expect(legacyQuoteChoices("Alternativa A: <script>alert(1)</script>\nAlternativa B: nuovo")).toEqual([]);
    expect(legacyQuoteChoices("Alternativa A: 100 €\nAlternativa B: 200 €")).toEqual([]);
  });
  it("salva alternative e selezione, rifiuta selezioni sconosciute o prive di revisione", () => {
    const s = localSnapshot(); s.messages = [{ role: "assistant", text: turn.message, choices, choiceRevision: s.document.revision, selectedChoiceId: "keep" }];
    expect(readLocalQuoteSnapshot(s).messages[0].selectedChoiceId).toBe("keep");
    s.messages[0].selectedChoiceId = "missing"; expect(() => readLocalQuoteSnapshot(s)).toThrow();
    s.messages[0].selectedChoiceId = "keep"; delete s.messages[0].choiceRevision; expect(() => readLocalQuoteSnapshot(s)).toThrow();
  });
  it("mostra stato selezionato e disabilita le altre opzioni senza rendere il testo HTML attivo", () => {
    const choose = vi.fn(); render(<QuoteChatChoices choices={[{ ...choices[0], label: "<img src=x onerror=alert(1)>" }, choices[1]]} selectedId="keep" active busy={false} onChoose={choose} onCustomize={vi.fn()} />);
    expect(screen.getByRole("button", { name: /<img/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Nuovo in sovrapposizione" })).toBeDisabled(); expect(document.querySelector("img")).toBeNull(); expect(choose).not.toHaveBeenCalled();
  });
  it("una scelta invia una sola risposta chat e non può eseguire un comando locale del modello", async () => {
    let resolve!: (r: Awaited<ReturnType<QuoteChatTransport>>) => void;
    const call = transport().mockImplementationOnce(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "Stub", references: [], turn: { ...turn, choices: [{ ...choices[0], reply: "Rinomina preventivo: Titolo ostile" }, choices[1]] } }))
      .mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send("Mostrami le alternative"); const pick = await screen.findByRole("button", { name: "Conserva il pavimento" });
    fireEvent.click(pick); fireEvent.click(pick);
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    expect(call.mock.calls[1][0].messages.at(-1)?.text).toBe("Rispondo alla proposta dell’assistente: Rinomina preventivo: Titolo ostile");
    // Nella conversazione si vede solo la scelta, senza il prefisso tecnico.
    expect(screen.getByText("Rinomina preventivo: Titolo ostile")).toBeInTheDocument();
    expect(screen.queryByText(/Rispondo alla proposta dell’assistente/)).not.toBeInTheDocument();
    expect(call.mock.calls[1][0].context?.currentTitle).toBe("Progetto");
    expect(screen.getByRole("button", { name: "Nuovo in sovrapposizione" })).toBeDisabled();
    const r = call.mock.calls[1][0]; resolve({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "Stub", references: [], turn: { ...turn, message: "Scelta ricevuta, dati da verificare.", choices: [] } });
    await screen.findByText("Scelta ricevuta, dati da verificare.");
  });
  it("permette risposta libera, senza invio o cancellazione del testo già scritto", async () => {
    const call = transport(); render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send("Quali alternative?"); await screen.findByRole("button", { name: "Conserva il pavimento" });
    const input = screen.getByRole("textbox", { name: "Messaggio all’assistente preventivi" }); fireEvent.change(input, { target: { value: "La mia soluzione" } });
    fireEvent.click(screen.getByRole("button", { name: "Un’altra soluzione? Scrivila tu" })); expect(input).toHaveValue("La mia soluzione"); expect(input).toHaveFocus(); expect(call).toHaveBeenCalledTimes(1);
  });
  it("un pulsante non invia né cancella una risposta già in composizione", async () => {
    const call = transport(); render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send("Alternative?"); const pick = await screen.findByRole("button", { name: "Conserva il pavimento" });
    const input = screen.getByRole("textbox", { name: "Messaggio all’assistente preventivi" }); fireEvent.change(input, { target: { value: "Con una precisazione mia" } });
    fireEvent.click(pick); fireEvent.click(pick); expect(input).toHaveValue(`Con una precisazione mia\n\n${choices[0].reply}`); expect(call).toHaveBeenCalledTimes(1); expect(pick).toHaveAttribute("aria-pressed", "false");
  });
  it("una risposta successiva rende le alternative precedenti non più applicabili", async () => {
    const call = transport().mockImplementationOnce(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "Stub", references: [], turn }))
      .mockImplementationOnce(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "Stub", references: [], turn: { ...turn, choices: [], message: "Passiamo alle misure." } }));
    render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} simulated={false} transport={call} />); send("Alternative?"); await screen.findByRole("button", { name: "Conserva il pavimento" });
    send("Preferisco un’altra soluzione"); await screen.findByText("Passiamo alle misure."); expect(screen.getByRole("button", { name: "Conserva il pavimento" })).toBeDisabled();
  });
  it("una modifica manuale della bozza disabilita anche le scelte della sua vecchia revisione", async () => {
    const row: QuoteChatProposal = { id: "paint", title: "Pareti camera", description: "Preparazione pareti", unit: "m²", quantity: null, quantityBasis: "Da rilevare", referenceId: null };
    const call = transport().mockImplementationOnce(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: "Stub", references: [], turn: { ...turn, proposals: [row] } }));
    render(<Workspace companyId={memoryScope.companyId} onBack={vi.fn()} simulated={false} transport={call} />); send("Prepara le voci e mostrami le alternative"); await screen.findByRole("button", { name: "Conserva il pavimento" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Voci del preventivo" }), { button: 0, ctrlKey: false });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Quantità voce 1" }), { target: { value: "20" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Silvio AI" }), { button: 0, ctrlKey: false });
    expect(screen.getByRole("button", { name: "Conserva il pavimento" })).toBeDisabled(); expect(call).toHaveBeenCalledTimes(1);
  });
});
