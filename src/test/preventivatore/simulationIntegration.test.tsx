import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCurrency } from "@/lib/formatters";
const realApi = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: realApi } }));
vi.mock("@/lib/velocity/sentry", () => ({ captureVelocityEvent: vi.fn(), captureVelocityError: vi.fn() }));
import Simulazione from "@/components/quotes/dev/QuoteAiSimulationFixture";
import { demo, proposta, supabase as simulated } from "@/lib/preventivi/devSimulation";

beforeEach(() => {
  demo.scenario = "bagno"; demo.richieste = 0; demo.eventi = []; demo.lenta = false;
  vi.spyOn(simulated.functions, "invoke").mockImplementation(async () => {
    demo.richieste++;
    return { data: proposta(demo.scenario), error: null };
  });
  realApi.invoke.mockClear();
});
afterEach(() => { cleanup(); vi.mocked(simulated.functions.invoke).mockRestore(); });
async function genera(scenario: string) {
  render(<Simulazione companyId="d2000000-0000-4000-a000-000000000002" companyName="Demo Azienda 2 S.r.l." />);
  fireEvent.click(screen.getByRole("button", { name: "Verifiche tecniche AI" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Scenario" }), { target: { value: scenario } });
  fireEvent.click(screen.getByRole("button", { name: /Genera con AI/ }));
  fireEvent.change(screen.getByPlaceholderText(/Sostituzione 2 finestre/), { target: { value: "Richiesta sintetica della prova" } });
  fireEvent.click(screen.getByRole("button", { name: /Genera preventivo/ }));
  await screen.findByText("Completa i dati prima di inserire le righe");
}
describe("simulazioni integrate con componenti e conti dell'app", () => {
  it("bagno: domanda, conferma, costi, sconto e anteprima senza API reali", async () => {
    await genera("bagno");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Quantità di Demolizione del bagno di prova" }), { target: { value: "24" } });
    fireEvent.click(screen.getByRole("button", { name: "Inserisci nel preventivo" }));
    expect(await screen.findByRole("spinbutton", { name: "Quantità riga 1" })).toHaveValue(24);
    expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(1405.44));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Quantità riga 1" }), { target: { value: "30" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Costo riga 1" }), { target: { value: "15" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Sconto simulato" }), { target: { value: "10" } });
    expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(1462.54));
    expect(simulated.functions.invoke).toHaveBeenCalledOnce();
    expect(realApi.invoke).not.toHaveBeenCalled();
  });
  it("cappotto: completamento, scenario nuovo senza sconto ereditato", async () => {
    await genera("cappotto");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Quantità di Ponteggio di prova" }), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Inserisci nel preventivo" }));
    await screen.findByRole("spinbutton", { name: "Quantità riga 1" });
    expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(8491.2));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Sconto simulato" }), { target: { value: "10" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Scenario" }), { target: { value: "tennis" } });
    expect(screen.getByRole("spinbutton", { name: "Sconto simulato" })).toHaveValue(0);
    expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(0));
    expect(realApi.invoke).not.toHaveBeenCalled();
  });
  it("tennis: prezzo assente confermato a mano, mai inventato dal sistema", async () => {
    await genera("tennis");
    expect(screen.getByRole("button", { name: "Inserisci nel preventivo" })).toBeDisabled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Prezzo netto di Recinzione di prova" }), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Inserisci nel preventivo" }));
    await screen.findByRole("spinbutton", { name: "Quantità riga 1" });
    expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(35380));
    expect(simulated.functions.invoke).toHaveBeenCalledOnce();
    expect(realApi.invoke).not.toHaveBeenCalled();
  });
});
