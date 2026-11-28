// «Chiudi le spese bancarie» (lotto B, 28/11/2026): elenco, preselezione, una conferma, annullamento.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("sonner", () => ({ toast: mock.toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc } }));
import { ChiudiSpeseBancarie } from "@/components/tesoreria/ChiudiSpeseBancarie";
import { preselezione, sommaSelezionate, type SpesaBancariaAperta } from "@/lib/finance/speseBancarie";

const riga = (id: string, importo: number, descrizione: string, da_controllare = false, gia_in_prima_nota = false): SpesaBancariaAperta => ({
  id, data: "2026-11-20", descrizione, importo, conto_id: "conto", regola_natura: "N-SPESE-COMM/v1",
  categoria_costo: "spese bancarie", da_controllare, motivo_controllo: da_controllare ? "bonifico" : null, gia_in_prima_nota,
});
const righe = [
  riga("a", 1.5, "COMM. RICHIESTA INCASSO SEPA B2C"),
  riga("b", 0.43, "fx_card"),
  riga("c", 2800, "Bonifico tramite Internet Banking INSTANT commissioni", true),
  riga("d", 1.5, "COMM. RICHIESTA INCASSO SEPA B2B", false, true),
];

function apri(onFatto = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ChiudiSpeseBancarie companyId="az" accounts={[{ id: "conto", nome: "Banca ···0769" }]} open onOpenChange={() => {}} onFatto={onFatto} />
    </QueryClientProvider>,
  );
  return onFatto;
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.rpc.mockImplementation(async (nome: string) => {
    if (nome === "tesoreria_spese_bancarie_aperte")
      return { data: { movimenti: righe, numero: 4, totale: 2803.43, da_controllare: 1, soglia: 50, troppi: false }, error: null };
    if (nome === "tesoreria_chiudi_spese_bancarie")
      return { data: { chiusi: ["a", "b"], con_costo: 2, lasciati_prima_nota: [], gia_chiusi: 0, totale: 1.93 }, error: null };
    if (nome === "tesoreria_riapri_spese_bancarie") return { data: { riaperti: 2 }, error: null };
    return { data: null, error: null };
  });
});

describe("Chiudi le spese bancarie", () => {
  it("quelle da controllare, e quelle già nella prima nota, non partono selezionate; il totale è delle sole selezionate", () => {
    expect([...preselezione(righe)]).toEqual(["a", "b"]);
    expect(sommaSelezionate(righe, preselezione(righe))).toBe(1.93);
    expect(sommaSelezionate(righe, new Set(["a", "b", "c"]))).toBe(2801.93);
  });

  it("chiude le selezionate con una conferma e permette di annullare il lotto", async () => {
    const fatto = apri();
    expect(await screen.findByText("COMM. RICHIESTA INCASSO SEPA B2C")).toBeInTheDocument();
    expect(screen.getByText("Da controllare: sembra un bonifico")).toBeInTheDocument();
    // Già nella prima nota senza banca: non si chiude in blocco, va collegata alla sua riga.
    expect(screen.getByText("Già nella prima nota: collegala dal dettaglio del movimento")).toBeInTheDocument();
    const caselle = screen.getAllByRole("checkbox", { name: /^Chiudi la spesa del/ });
    expect(caselle.map((c) => [c.getAttribute("aria-checked"), (c as HTMLButtonElement).disabled])).toEqual([
      ["true", false], ["true", false], ["false", false], ["false", true],
    ]);
    const conferma = screen.getByRole("button", { name: /Registra 2 spese/ });
    fireEvent.click(conferma);
    await waitFor(() => expect(fatto).toHaveBeenCalledTimes(1));
    expect(mock.rpc).toHaveBeenCalledWith("tesoreria_chiudi_spese_bancarie", { p_company: "az", p_movimenti: ["a", "b"] });
    fireEvent.click(await screen.findByRole("button", { name: "Annulla questo lotto" }));
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("tesoreria_riapri_spese_bancarie", { p_company: "az", p_movimenti: ["a", "b"] }));
    await waitFor(() => expect(fatto).toHaveBeenCalledTimes(2));
  });

  it("un errore del lotto si legge e non dice che è andata bene", async () => {
    mock.rpc.mockImplementation(async (nome: string) =>
      nome === "tesoreria_chiudi_spese_bancarie"
        ? { data: null, error: { message: "Il movimento del 21/11/2026 (40,00 €) non è più una spesa bancaria da chiudere: ricarica l'elenco.", code: "PT409" } }
        : { data: { movimenti: righe, numero: 4, totale: 2803.43, da_controllare: 1, soglia: 50, troppi: false }, error: null });
    const fatto = apri();
    fireEvent.click(await screen.findByRole("button", { name: /Registra 2 spese/ }));
    await waitFor(() => expect(mock.toast.error).toHaveBeenCalled());
    expect(mock.toast.success).not.toHaveBeenCalled();
    expect(fatto).not.toHaveBeenCalled();
  });
});
