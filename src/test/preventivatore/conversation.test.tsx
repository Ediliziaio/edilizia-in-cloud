import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceLabConversation, type LabConversation } from "@/lib/preventivi/devQuoteConversation";
import { formatCurrency } from "@/lib/formatters";
const realApi = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: realApi } }));
vi.mock("@/lib/velocity/sentry", () => ({ captureVelocityEvent: vi.fn(), captureVelocityError: vi.fn() }));
import Simulazione from "@/components/quotes/dev/QuoteAiSimulationFixture";
import { demo } from "@/lib/preventivi/devSimulation";

describe("protocollo della chat locale, non LLM", () => {
  const initial: LabConversation = { scenario: "bagno", step: "request" };
  it("sceglie il progetto dalla richiesta, senza generare valori sconosciuti", () => {
    const turn = advanceLabConversation(initial, "Vorrei costruire un campo da tennis");
    expect(turn.next).toEqual({ scenario: "tennis", step: "firstQuantity" });
    expect(turn.row).toBeUndefined();
  });
  it("dichiara il limite sui progetti non supportati", () => {
    const turn = advanceLabConversation(initial, "Voglio una piscina");
    expect(turn.next).toEqual(initial);
    expect(turn.reply).toContain("non è ancora collegato");
  });
  it.each(["non so", "0", "-20", "Infinity", "24 o 30", "24 euro", "1.234,56", "1000001"])("non converte una misura ambigua: %s", text => {
    const state: LabConversation = { scenario: "bagno", step: "firstQuantity" };
    const turn = advanceLabConversation(state, text);
    expect(turn.next).toEqual(state); expect(turn.row).toBeUndefined();
  });
  it("accetta la virgola e non assume uguali due superfici diverse", () => {
    const turn = advanceLabConversation({ scenario: "bagno", step: "firstQuantity" }, "24,50 mq");
    expect(turn.row?.value.quantity).toBe(24.5);
    expect(turn.next.step).toBe("secondQuantity");
    expect(turn.reply).toContain("Non li deduco");
  });
  it("chiede il prezzo mancante prima di includere la recinzione nel totale", () => {
    const a = advanceLabConversation({ scenario: "tennis", step: "secondQuantity" }, "100 metri");
    expect(a.row).toBeUndefined(); expect(a.next.step).toBe("price");
    const b = advanceLabConversation(a.next, "50 euro");
    expect(b.row?.value).toMatchObject({ quantity: 100, unit_price: 50, unit_of_measure: "ml" });
  });
  it("limita lo sconto", () => {
    const state: LabConversation = { scenario: "bagno", step: "ready" };
    expect(advanceLabConversation(state, "sconto del 101%").discount).toBeUndefined();
    expect(advanceLabConversation(state, "applica uno sconto del 10%").discount).toBe(10);
  });
});

describe("chat e preventivo affiancati nella piattaforma", () => {
  beforeEach(() => { vi.useFakeTimers(); demo.richieste = 0; demo.eventi = []; demo.lenta = false; realApi.invoke.mockClear(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  function open() { render(<Simulazione companyId="d2000000-0000-4000-a000-000000000002" companyName="Demo Azienda 2 S.r.l." />); }
  async function send(text: string) {
    fireEvent.change(screen.getByRole("textbox", { name: "Messaggio all’assistente preventivi" }), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Invia messaggio" }));
    await act(() => vi.advanceTimersByTimeAsync(250));
  }
  it("compone progressivamente senza Inserisci e mantiene le modifiche manuali", async () => {
    open();
    await send("Ristrutturiamo un bagno");
    expect(screen.queryByRole("spinbutton", { name: "Quantità riga 1" })).toBeNull();
    await send("24 mq");
    expect(screen.getByRole("spinbutton", { name: "Quantità riga 1" })).toHaveValue(24);
    expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(878.4));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Quantità riga 1" }), { target: { value: "30" } });
    await send("24 mq");
    expect(screen.getByRole("spinbutton", { name: "Quantità riga 1" })).toHaveValue(30);
    expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(1625.04));
    await send("sconto del 10%");
    expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(1462.54));
    expect(screen.getByRole("log")).toHaveTextContent("Sconto del 10%");
    expect(realApi.invoke).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Inserisci nel preventivo" })).toBeNull();
  });
  it("tennis: cambia progetto via chat e attende il prezzo senza duplicare righe", async () => {
    open(); await send("Un campo da tennis"); await send("600 mq"); await send("100 metri");
    expect(screen.getByRole("combobox", { name: "Scenario" })).toHaveValue("tennis");
    expect(screen.queryByRole("spinbutton", { name: "Quantità riga 2" })).toBeNull();
    expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(29280));
    await send("50 euro");
    expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(35380));
    expect(realApi.invoke).not.toHaveBeenCalled();
  });
  it("l'interruzione non applica modifiche tardive", async () => {
    open(); await send("Un bagno");
    fireEvent.click(screen.getByRole("checkbox", { name: "Analisi lenta per provare l’interruzione" }));
    await send("24 mq");
    fireEvent.click(screen.getByRole("button", { name: "Interrompi risposta" }));
    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(screen.queryByRole("spinbutton", { name: "Quantità riga 1" })).toBeNull();
    expect(screen.getByRole("log")).toHaveTextContent("Risposta interrotta");
  });
  it("ricominciare durante una risposta non porta righe nella nuova conversazione", async () => {
    open(); await send("Un bagno");
    fireEvent.change(screen.getByRole("textbox", { name: "Messaggio all’assistente preventivi" }), { target: { value: "24 mq" } });
    fireEvent.click(screen.getByRole("button", { name: "Invia messaggio" }));
    fireEvent.click(screen.getByRole("button", { name: "Ricomincia la prova" }));
    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(screen.queryByRole("spinbutton", { name: "Quantità riga 1" })).toBeNull();
    expect(screen.getByRole("log")).toHaveTextContent("Che lavoro vuoi preventivare?");
  });
  it("modificare i numeri non produce nuovi messaggi né chiamate", async () => {
    open(); await send("Un cappotto"); await send("120 mq"); await send("120 mq");
    const count = demo.richieste;
    fireEvent.change(screen.getByRole("spinbutton", { name: "Prezzo riga 1" }), { target: { value: "60" } });
    expect(demo.richieste).toBe(count); expect(realApi.invoke).not.toHaveBeenCalled();
    expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(9955.2));
  });
  it("anima le fasi senza modificare la bozza prima della fase finale", async () => {
    open(); await send("Un bagno");
    fireEvent.click(screen.getByRole("checkbox", { name: "Analisi lenta per provare l’interruzione" }));
    await send("24 mq");
    expect(screen.getByRole("list", { name: "Fasi operative" }).querySelector('[data-step-state="active"]')).toHaveTextContent("Leggo");
    await act(() => vi.advanceTimersByTimeAsync(2350));
    expect(screen.getByRole("list", { name: "Fasi operative" }).querySelector('[data-step-state="active"]')).toHaveTextContent("Controllo");
    expect(screen.queryByRole("spinbutton", { name: "Quantità riga 1" })).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(2600));
    expect(screen.getByRole("list", { name: "Fasi operative" }).querySelector('[data-step-state="active"]')).toHaveTextContent("Aggiorno");
    fireEvent.click(screen.getByRole("button", { name: "Interrompi risposta" }));
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(screen.queryByRole("spinbutton", { name: "Quantità riga 1" })).toBeNull();
    expect(screen.getByRole("button", { name: /Operazione interrotta/ })).toBeEnabled();
  });
});
