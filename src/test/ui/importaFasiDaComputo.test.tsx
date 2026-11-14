/**
 * «Da computo o preventivo» in «Aggiungi fasi» (14/11/2026): il file diventa fasi con le righe
 * per i SAL, con l'anteprima e senza raddoppiare le fasi già presenti.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { voceVuota } from "@/lib/computo/editorNativo";

const m = vi.hoisted(() => ({ rpc: vi.fn(), ok: vi.fn(), err: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: m.ok, error: m.err } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: m.rpc, from: vi.fn() } }));
vi.mock("@/lib/computo/leggiVoci", () => ({
  leggiVociDaFile: async () => ({
    formato: "xlsx", via: "browser", esito: {},
    voci: [
      { ...voceVuota(), capitolo: "Demolizioni", descrizione: "Demolizione tramezze", unita: "mq", quantita: "120", prezzo: "20", avvisi: [] as string[], origine: "c.xlsx" },
      { ...voceVuota(), capitolo: "Murature", descrizione: "Tramezza", unita: "mq", quantita: "80", prezzo: "40", avvisi: [] as string[], origine: "c.xlsx" },
    ],
  }),
}));

import { ImportaFasiDaComputo } from "@/components/orders/ImportaFasiDaComputo";

beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: { aggiunte: 1, saltate: 0, voci: 1, con_importi: true }, error: null }); });
afterEach(cleanup);

function apri(mostraImporti = true, onFatto = vi.fn()) {
  render(<QueryClientProvider client={new QueryClient()}>
    <ImportaFasiDaComputo orderId="o1" companyId="c1" userId="u1" fasiEsistenti={["demolizioni"]} mostraImporti={mostraImporti} onFatto={onFatto} />
  </QueryClientProvider>);
  fireEvent.change(screen.getByLabelText(/Computo o preventivo: Excel/), { target: { files: [new File(["x"], "computo.xlsx")] } });
  return onFatto;
}

describe("Importa fasi da un computo", () => {
  it("mostra le fasi con righe e importi, e quella già presente non si può scegliere", async () => {
    apri();
    const elenco = await screen.findByRole("list", { name: "Fasi da importare" });
    expect(elenco).toHaveTextContent("Demolizioni");
    expect(elenco).toHaveTextContent("già presente");
    expect(screen.getByRole("checkbox", { name: "Importa Demolizioni" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Importa Murature" })).toBeChecked();
    expect(elenco).toHaveTextContent(/3\.200,00/);
  });

  it("manda solo le fasi nuove, con le righe, e chiude", async () => {
    const onFatto = apri();
    fireEvent.click(await screen.findByRole("button", { name: "Importa 1 fase" }));
    await waitFor(() => expect(onFatto).toHaveBeenCalled());
    expect(m.rpc).toHaveBeenCalledWith("commessa_importa_fasi", {
      p_order_id: "o1", p_origine: "computo", p_codice: "computo.xlsx",
      p_fasi: [{ nome: "Murature", voci: [{ descrizione: "Tramezza", unita: "mq", quantita: 80, importo: 3200 }] }],
    });
  });

  it("senza «Venduto e importi» non mostra gli importi e lo dice", async () => {
    apri(false);
    await screen.findByRole("list", { name: "Fasi da importare" });
    expect(screen.queryByText(/3\.200,00/)).toBeNull();
    expect(screen.getByText(/Gli importi non si importano/)).toBeInTheDocument();
  });

  it("col database di prima dice che non è ancora attivo", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" } });
    apri();
    fireEvent.click(await screen.findByRole("button", { name: "Importa 1 fase" }));
    await waitFor(() => expect(m.err).toHaveBeenCalled());
    expect(m.err.mock.calls[0][1].description).toMatch(/non è ancora attivo/);
  });
});
