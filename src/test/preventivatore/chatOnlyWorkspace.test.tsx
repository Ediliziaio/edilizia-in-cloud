import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { source, catalog } from "./apartmentFixtures";
import { formatCurrency } from "@/lib/formatters";
import { parseQuoteChatCommand } from "@/lib/preventivi/devQuoteChatCommands";
const io = vi.hoisted(() => ({ sources: [] as unknown[], rows: [] as unknown[], error: null as Error | null, refetch: vi.fn() }));
vi.mock("@/lib/prezzario/queries", () => ({
  usePrezzarioFonti: () => ({ data: io.sources, error: null as Error | null, isFetching: false, refetch: io.refetch }),
  usePrezzarioVociPerCodici: () => ({ data: io.rows, isError: !!io.error, error: io.error, isFetching: false, refetch: io.refetch }),
}));
import Workspace from "@/components/quotes/dev/QuoteConversationWorkspace";
afterEach(cleanup);
beforeEach(() => { io.sources = [source]; io.rows = catalog; io.error = null; io.refetch.mockClear(); });
function send(text: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Messaggio all’assistente preventivi" }), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Invia messaggio" }));
}
async function openRegional() {
  render(<Workspace companyName="Demo Azienda 2" />);
  send("Ristrutturazione completa 80 mq trilocale con un bagno in Lombardia");
  await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Conferma in chat l’edizione"));
  send("Usa Lombardia 2025");
  await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Ho letto 11 corrispondenze"));
  send("Simula caso base");
}
function total(n: number) { expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(n)); }
describe("Una chat sola, nessuna scheda o modulo esterno", () => {
  it("sceglie fonte, simula e conferma senza select, tab o campi numerici", async () => {
    await openRegional();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument(); expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Voci modificabili del preventivo" })).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Copertina" })).not.toBeInTheDocument();
    send("Mostra voci"); total(0); send("Conferma tutte le voci disponibili"); total(44800);
    expect(screen.getByRole("log")).toHaveTextContent("9 voci confermate");
    expect(screen.queryByText("IVA 0%")).not.toBeInTheDocument(); expect(io.refetch).not.toHaveBeenCalled();
  });
  it("prezzi, misure, esclusioni e ripristino si gestiscono da messaggio", async () => {
    await openRegional(); send("Conferma tutte le voci disponibili");
    send("Prezzo voce 2: 55 €"); total(41200);
    send("Usa Lombardia 2025"); total(41200);
    send("Quantità voce 2: 70 mq"); total(40650);
    send("Ripristina prezzo voce 2"); total(43800);
    send("Escludi voce 2"); total(36800);
    send("Conferma voce 2"); total(43800);
    expect(io.refetch).not.toHaveBeenCalled();
  });
  it("non applica una quantità con unità incompatibile e non conferma una voce assente", async () => {
    await openRegional(); send("Conferma tutte le voci disponibili");
    send("Quantità voce 2: 70 ml"); total(44800);
    send("Conferma voce 3"); total(44800);
    expect(screen.getByRole("log")).toHaveTextContent("Unità incompatibile"); expect(screen.getByRole("log")).toHaveTextContent("Voce non trovata");
  });
  it("i casi alternativi si scelgono nella conversazione e non accumulano righe", async () => {
    await openRegional(); send("Conferma tutte le voci disponibili"); send("Simula misure sconosciute"); send("Conferma tutte le voci disponibili"); total(0);
    send("Simula pavimento mantenuto"); send("Conferma tutte le voci disponibili"); total(28700);
    send("Simula distribuzione modificata"); send("Conferma tutte le voci disponibili"); total(49600);
    send("Simula caso base"); send("Conferma tutte le voci disponibili"); total(44800);
  });
  it("una conferma da un elenco vecchio richiede di rivedere i dati correnti", async () => {
    await openRegional(); send("Mostra voci");
    const oldConfirm = screen.getByRole("button", { name: "Conferma tutte le voci disponibili" });
    send("Prezzo voce 2: 55 €"); fireEvent.click(oldConfirm); total(0);
    expect(screen.getByRole("log")).toHaveTextContent("Le voci sono cambiate");
  });
  it("mantiene il progetto sintetico nella stessa chat e permette correzioni senza form", () => {
    render(<Workspace />); send("Un campo da tennis"); send("600 mq"); send("100 metri"); total(29280);
    send("50 euro"); total(35380); send("Prezzo voce 1: 50 €"); total(42700);
    send("ricomincia"); total(0); expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });
  it("anima solo i dati cambiati: le righe invariate mantengono lo stesso elemento", async () => {
    await openRegional(); send("Conferma tutte le voci disponibili");
    const unchanged = screen.getByText("Rimozione pavimento e allettamento", { exact: true }).closest(".quote-preview-row-motion");
    const changed = screen.getByText("Pavimento monocottura 30×30 su letto in malta", { exact: true }).closest(".quote-preview-row-motion");
    send("Prezzo voce 2: 55 €");
    expect(screen.getByText("Rimozione pavimento e allettamento", { exact: true }).closest(".quote-preview-row-motion")).toBe(unchanged);
    expect(screen.getByText("Pavimento monocottura 30×30 su letto in malta", { exact: true }).closest(".quote-preview-row-motion")).not.toBe(changed);
    expect(screen.getByTestId("live-quote-total")).toHaveClass("quote-preview-total-motion");
    expect(io.refetch).not.toHaveBeenCalled();
  });
  it("modifica titolo, descrizione, quantità e prezzo dalla tabella sotto la chat", async () => {
    await openRegional(); send("Conferma tutte le voci disponibili");
    fireEvent.change(screen.getByRole("textbox", { name: "Titolo voce 2" }), { target: { value: "Pavimento scelto dal cliente" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Descrizione voce 2" }), { target: { value: "Finitura e posa personalizzate" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Quantità voce 2" }), { target: { value: "70" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Prezzo voce 2" }), { target: { value: "55" } });
    total(40650); expect(screen.getByRole("region", { name: "Anteprima live dell'offerta" })).toHaveTextContent("Pavimento scelto dal cliente");
    expect(screen.getByRole("region", { name: "Anteprima live dell'offerta" })).toHaveTextContent("Finitura e posa personalizzate");
    send("Prezzo voce 2: 60 €"); expect(screen.getByRole("spinbutton", { name: "Prezzo voce 2" })).toHaveValue(60); total(41000);
    expect(io.refetch).not.toHaveBeenCalled();
  });
  it("cambiare dimensione non riusa prezzo e quantità della vecchia unità", async () => {
    await openRegional(); send("Conferma tutte le voci disponibili");
    fireEvent.change(screen.getByRole("textbox", { name: "Unità voce 2" }), { target: { value: "cad" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Unità voce 2" }));
    expect(screen.getByRole("spinbutton", { name: "Quantità voce 2" })).toHaveValue(null);
    expect(screen.getByRole("spinbutton", { name: "Prezzo voce 2" })).toHaveValue(null); total(36800);
    expect(screen.getByRole("checkbox", { name: "Includi voce 2" })).toBeDisabled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Quantità voce 2" }), { target: { value: "1" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Prezzo voce 2" }), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Includi voce 2" })); total(37300);
    expect(screen.getByRole("region", { name: "Anteprima live dell'offerta" })).toHaveTextContent("Voce manuale: unità modificata");
    expect(io.refetch).not.toHaveBeenCalled();
  });
  it("un alias della stessa unità non cancella i valori e un titolo vuoto non entra nel totale", async () => {
    await openRegional(); send("Conferma tutte le voci disponibili");
    fireEvent.change(screen.getByRole("textbox", { name: "Unità voce 2" }), { target: { value: "m" } }); total(44800);
    fireEvent.change(screen.getByRole("textbox", { name: "Unità voce 2" }), { target: { value: "mq" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Unità voce 2" })); total(44800);
    fireEvent.change(screen.getByRole("textbox", { name: "Titolo voce 2" }), { target: { value: "" } }); total(36800);
    expect(screen.getByRole("checkbox", { name: "Includi voce 2" })).toBeDisabled();
  });
});
describe("Comandi espliciti: nessun parsing di importi ambigui", () => {
  it.each(["non prezzo voce 1: 55", "Prezzo voce 1: 40-60", "Prezzo voce 1: 0", "Prezzo voce 1: 1.000", "Prezzo voce 1: 55 mq", "Quantità voce 1: Infinity", "Prezzo voce 1: 55 e 60"])("rifiuta %s", command => {
    expect(parseQuoteChatCommand(command)).toBeNull();
  });
});
