import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const dati: Record<string, unknown[]> = {
  fatture_ricevute: [
    { id: "f1", numero_fattura: "101", data_fattura: "2026-09-01", tipo_documento: "TD01", totale_documento: 1220, netto_a_pagare: 1220, stato: "contabilizzata", company_cost_id: "c1", storico_esterno: false, costo: { is_paid: false, paid_date: null } },
    { id: "f2", numero_fattura: "102", data_fattura: "2026-10-20", tipo_documento: "TD01", totale_documento: 500, netto_a_pagare: 500, stato: "non_letta", company_cost_id: null, storico_esterno: false, costo: null },
  ],
  rate_fornitori: [
    { id: "r1", fattura_ricevuta_id: "f1", company_cost_id: "c1", numero: 1, scadenza: "2026-09-30", importo: 610, metodo: "riba", stato: "pagata", pagata_il: "2026-09-30" },
    { id: "r2", fattura_ricevuta_id: "f1", company_cost_id: "c1", numero: 2, scadenza: "2026-10-31", importo: 610, metodo: "riba", stato: "da_pagare", pagata_il: null },
  ],
};
// Le letture a pagine (range) restituiscono i dati della tabella; quella delle rate per fattura nessuna in più.
let tabella = "", aPagine = false;
const catena: Record<string, unknown> = {};
for (const m of ["select", "eq", "or", "order", "in", "abortSignal"]) catena[m] = () => catena;
catena.range = () => { aPagine = true; return catena; };
catena.then = (ok: (v: unknown) => unknown) => {
  const data = aPagine ? dati[tabella] : [];
  aPagine = false;
  return Promise.resolve({ data, error: null }).then(ok);
};
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => { tabella = t; return catena; } } }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: (): string => "az1" }));

import { FattureDebitiFornitore } from "@/components/suppliers/FattureDebitiFornitore";

describe("scheda fornitore: Fatture e debiti", () => {
  it("mostra stato, residuo, RiBa aperte ed estratto conto", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <FattureDebitiFornitore supplierId="s1" partitaIva="IT01234567890" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Scaduta")).toBeTruthy();
    expect(screen.getAllByText("Da registrare")).toHaveLength(2); // il totale e la fattura 102
    expect(screen.getByText("Rate e RiBa da pagare")).toBeTruthy();
    fireEvent.click(screen.getByText("Estratto conto"));
    expect(screen.getByText("Pagamento Fattura 101 · rata 1")).toBeTruthy();
    // 1220 − 610 + 500 = 1110 di saldo finale
    expect(screen.getAllByText(/1\.110,00/).length).toBeGreaterThan(0);
  });
});
