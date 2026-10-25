import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error, info: mocks.info } }));
vi.mock("@/lib/velocity/sentry", () => ({ captureVelocityEvent: vi.fn(), captureVelocityError: vi.fn() }));
import AIQuotePanel from "@/components/quotes/AIQuotePanel";

const payload = (extra: Record<string, unknown> = {}) => ({ data: { sezioni: [{ nome: "Opere", righe: [{ item_category: "posa", nome: "Scavo", descrizione: "", quantita: 2, unita_misura: "mq", unit_price: 30, tariffa_id: "t", ...extra }] }] }, error: null as { message: string } | null });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
function open(onInsert = vi.fn()) {
  const view = render(<AIQuotePanel companyId="azienda-test" onRigheGenerate={onInsert} />);
  fireEvent.click(screen.getByRole("button", { name: /Genera con AI/ }));
  fireEvent.change(screen.getByPlaceholderText(/Sostituzione 2 finestre/), { target: { value: "Scavo del terreno" } });
  return { ...view, onInsert, generate: () => fireEvent.click(screen.getByRole("button", { name: /Genera preventivo/ })) };
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe("pannello AI con servizi simulati e rete bloccata", () => {
  it("nessuna richiesta durante scrittura o correzione della quantità", async () => {
    mocks.invoke.mockResolvedValue(payload({ quantita: null }));
    const ui = open();
    expect(mocks.invoke).not.toHaveBeenCalled();
    ui.generate();
    const quantity = await screen.findByRole("spinbutton", { name: "Quantità di Scavo" });
    expect(quantity).toHaveValue(null);
    expect(screen.getByRole("button", { name: "Inserisci nel preventivo" })).toBeDisabled();
    expect(screen.getByText(/Parziale valorizzato/)).toBeInTheDocument();
    fireEvent.change(quantity, { target: { value: "3" } });
    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Inserisci nel preventivo" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Inserisci nel preventivo" }));
    await waitFor(() => expect(ui.onInsert).toHaveBeenCalledOnce());
    expect(ui.onInsert.mock.calls[0][0][0].righe[0].quantita).toBe(3);
  });
  it("prezzo mancante resta fuori dall'editor, non è un omaggio", async () => {
    mocks.invoke.mockResolvedValue(payload({ unit_price: null }));
    const ui = open(); ui.generate();
    expect(await screen.findByText(/Importo da completare/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inserisci nel preventivo" })).toBeDisabled();
    expect(ui.onInsert).not.toHaveBeenCalled();
  });
  it("in simulazione usa solo il servizio finto e non offre trascrizioni a pagamento", async () => {
    const simulated = vi.fn().mockResolvedValue(payload());
    render(<AIQuotePanel companyId="azienda-test" onRigheGenerate={vi.fn()} generazioneSimulata={simulated} />);
    fireEvent.click(screen.getByRole("button", { name: /Genera con AI/ }));
    expect(screen.queryByRole("tab", { name: /Voce/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Foto/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Sostituzione 2 finestre/), { target: { value: "Lavoro test" } });
    fireEvent.click(screen.getByRole("button", { name: /Genera preventivo/ }));
    await screen.findByText("Scavo");
    expect(simulated).toHaveBeenCalledOnce();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("un prezzo libero scritto dall'utente completa la proposta senza chiamare l'AI", async () => {
    mocks.invoke.mockResolvedValue(payload({ tariffa_id: null, unit_price: null }));
    const ui = open(); ui.generate();
    const input = await screen.findByRole("spinbutton", { name: "Prezzo netto di Scavo" });
    fireEvent.change(input, { target: { value: "45.50" } });
    expect(screen.getByRole("button", { name: "Inserisci nel preventivo" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Inserisci nel preventivo" }));
    await waitFor(() => expect(ui.onInsert).toHaveBeenCalledOnce());
    expect(ui.onInsert.mock.calls[0][0][0].righe[0].unit_price).toBe(45.5);
    expect(mocks.invoke).toHaveBeenCalledOnce();
  });
  it("interrompe la richiesta e ignora anche una risposta tardiva riuscita", async () => {
    const pending = deferred<ReturnType<typeof payload>>();
    mocks.invoke.mockReturnValue(pending.promise);
    const ui = open(); ui.generate();
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledOnce());
    const signal = mocks.invoke.mock.calls[0][1].signal as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: "Interrompi analisi" }));
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(payload()); });
    expect(screen.queryByText("Scavo")).not.toBeInTheDocument();
    expect(ui.onInsert).not.toHaveBeenCalled();
  });
  it("non applica il risultato dell'azienda precedente", async () => {
    const pending = deferred<ReturnType<typeof payload>>();
    mocks.invoke.mockReturnValue(pending.promise);
    const ui = open(); ui.generate();
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledOnce());
    ui.rerender(<AIQuotePanel companyId="altra-azienda" onRigheGenerate={ui.onInsert} />);
    await act(async () => { pending.resolve(payload()); });
    expect(screen.queryByText("Scavo")).not.toBeInTheDocument();
    expect(ui.onInsert).not.toHaveBeenCalled();
  });
  it("una risposta malformata non diventa un successo vuoto", async () => {
    mocks.invoke.mockResolvedValue({ data: { sezioni: "errore" }, error: null });
    const ui = open(); ui.generate();
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(ui.onInsert).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it("attende l'inserimento e blocca i doppi clic", async () => {
    mocks.invoke.mockResolvedValue(payload());
    const pending = deferred<void>();
    const onInsert = vi.fn(() => pending.promise);
    const ui = open(onInsert); ui.generate();
    const insert = await screen.findByRole("button", { name: "Inserisci nel preventivo" });
    fireEvent.click(insert); fireEvent.click(insert);
    expect(onInsert).toHaveBeenCalledOnce();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Inserimento in corso…" })).toBeDisabled();
    await act(async () => { pending.resolve(); });
    expect(mocks.success).toHaveBeenCalledOnce();
  });
  it("conserva la proposta se l'inserimento fallisce", async () => {
    mocks.invoke.mockResolvedValue(payload());
    const ui = open(vi.fn().mockRejectedValue(new Error("griglia non disponibile"))); ui.generate();
    fireEvent.click(await screen.findByRole("button", { name: "Inserisci nel preventivo" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(screen.getByText("Scavo")).toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Inserisci nel preventivo" })).toBeEnabled();
  });
  it("smontare il pannello interrompe la richiesta senza nuovi invii", async () => {
    const pending = deferred<ReturnType<typeof payload>>();
    mocks.invoke.mockReturnValue(pending.promise);
    const ui = open(); ui.generate();
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledOnce());
    const signal = mocks.invoke.mock.calls[0][1].signal as AbortSignal;
    ui.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(payload()); });
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it("una risposta vecchia non sostituisce l'analisi successiva", async () => {
    const old = deferred<ReturnType<typeof payload>>();
    mocks.invoke.mockReturnValueOnce(old.promise).mockResolvedValueOnce(payload({ nome: "Nuova proposta" }));
    const ui = open(); ui.generate();
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Interrompi analisi" }));
    ui.generate();
    await screen.findByText("Nuova proposta");
    await act(async () => { old.resolve(payload({ nome: "Proposta vecchia" })); });
    expect(screen.queryByText("Proposta vecchia")).not.toBeInTheDocument();
    expect(screen.getByText("Nuova proposta")).toBeInTheDocument();
  });
  it("un'unità mancante si può completare con più caratteri senza perdere il campo", async () => {
    mocks.invoke.mockResolvedValue(payload({ unita_misura: "" }));
    const ui = open(); ui.generate();
    const unit = await screen.findByRole("textbox", { name: "Unità di Scavo" });
    fireEvent.change(unit, { target: { value: "m" } });
    fireEvent.change(unit, { target: { value: "ml" } });
    expect(unit).toHaveValue("ml");
    expect(screen.getByRole("button", { name: "Inserisci nel preventivo" })).toBeEnabled();
    expect(mocks.invoke).toHaveBeenCalledOnce();
  });
  it("smontare durante l'inserimento non mostra un falso successo su un'altra pagina", async () => {
    mocks.invoke.mockResolvedValue(payload());
    const pending = deferred<void>();
    const ui = open(vi.fn(() => pending.promise)); ui.generate();
    fireEvent.click(await screen.findByRole("button", { name: "Inserisci nel preventivo" }));
    ui.unmount();
    await act(async () => { pending.resolve(); });
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
