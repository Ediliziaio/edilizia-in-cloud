import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 30/10/2026 — Il riepilogo della fattura ricevuta funziona senza XML (righe e totali
// dal database), dice a cosa è collegata e collega fornitore e commessa da lì.

const finto = vi.hoisted(() => ({ dati: {} as Record<string, unknown>, rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string): any => {
    const c: any = {};
    for (const m of ["select", "eq", "is", "order", "in", "or", "limit"]) c[m] = () => c;
    c.maybeSingle = async () => ({ data: finto.dati[tabella] ?? null, error: null as null });
    c.then = (ok: (v: unknown) => unknown) => ok({ data: finto.dati[`${tabella}[]`] ?? [], error: null as null });
    return c;
  };
  return { supabase: { from: catena, rpc: (...a: unknown[]) => finto.rpc(...a) } };
});
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { RiepilogoFatturaRicevuta } from "@/components/fatturazione/RiepilogoFatturaRicevuta";

const FIC: Record<string, unknown> = {
  id: "f1", cedente_ragione_sociale: "Edilmateriali Rossi Srl", cedente_piva: "IT01234567890", cedente_cf: null,
  tipo_documento: "TD01", numero_fattura: "1288", data_fattura: "2026-10-15",
  imponibile_totale: 356, iva_totale: 78.32, totale_documento: 434.32,
  righe: [
    { descrizione: "ZAVORRA CLS 13 X 100 X H21", quantita: 4, prezzo_unitario: 20, aliquota_iva: 22, imponibile: 80 },
    { descrizione: "CEMENTO 32,5 R SACCO 25 KG", quantita: 40, prezzo_unitario: 6.9, aliquota_iva: 22, imponibile: 276 },
  ],
  riepilogo_iva: [], stato: "letta", xml_url: null, xml_bytes: null,
  purchase_order_id: null, company_cost_id: null, fornitore_id: null, order_id_suggerito: "o9", anomalie_rilevate: [],
};

function apri() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter>
      <RiepilogoFatturaRicevuta fatturaId="f1" companyId="co" onClose={() => {}} azioni={{ onVersioneCompleta: vi.fn() }} />
    </MemoryRouter></QueryClientProvider>,
  );
}

beforeEach(() => {
  finto.rpc.mockReset().mockResolvedValue({ data: { esito: "collegata" }, error: null });
  finto.dati = {
    fatture_ricevute: FIC,
    "fatture_ricevute[]": [{ id: "f1" }, { id: "f2" }],
    "suppliers[]": [{ id: "s1", name: "Edilmateriali Rossi", vat_number: "01234567890", fiscal_code: null }],
    orders: { id: "o9", order_code: "C-2026-041", client_name: "Biemme" },
  };
});

describe("riepilogo della fattura ricevuta", () => {
  it("senza XML mostra righe, IVA ricavata e totale; niente «versione completa»", async () => {
    apri();
    expect((await screen.findAllByText("CEMENTO 32,5 R SACCO 25 KG")).length).toBeGreaterThan(0);
    expect(screen.getByText(/IVA 22% su/)).toBeTruthy();
    expect(screen.getByText("434,32 €")).toBeTruthy();
    expect(screen.queryByText(/Versione completa/)).toBeNull();
  });

  it("collega il fornitore della stessa partita IVA, con le altre fatture del cedente", async () => {
    apri();
    fireEvent.click(await screen.findByText(/Collega a Edilmateriali Rossi/));
    await waitFor(() => expect(finto.rpc).toHaveBeenCalledWith("collega_fornitore_ricevute", {
      p_company_id: "co", p_invoice_ids: ["f1", "f2"], p_supplier_id: "s1",
    }));
  });

  it("accetta la commessa suggerita dall'AI", async () => {
    apri();
    await screen.findByText("L'AI suggerisce");
    fireEvent.click(screen.getByRole("button", { name: "Collega" }));
    await waitFor(() => expect(finto.rpc).toHaveBeenCalledWith("commessa_collega_fattura_ricevuta", { p_fattura_id: "f1", p_order_id: "o9" }));
  });

  it("con l'ordine d'acquisto la commessa non si sceglie qui", async () => {
    finto.dati.fatture_ricevute = { ...FIC, purchase_order_id: "po1" };
    finto.dati.purchase_orders = { id: "po1", oda_number: "ODA-118", orders: { id: "o1", order_code: "C-2026-033" } };
    apri();
    await screen.findByText("ODA-118");
    expect(screen.getByText("C-2026-033")).toBeTruthy();
    expect(screen.queryByText("Scegli commessa")).toBeNull();
    expect(screen.queryByText("L'AI suggerisce")).toBeNull();
  });
});
