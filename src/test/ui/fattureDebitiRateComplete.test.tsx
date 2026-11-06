import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const scenario = vi.hoisted(() => ({ erroreSecondaPagina: false }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-demo" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    let start = 0, end = 999;
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "or", "in", "order", "abortSignal"]) query[method] = () => query;
    query.range = (from: number, to: number) => { start = from; end = to; return query; };
    query.then = (resolve: (value: unknown) => unknown) => {
      if (table === "rate_fornitori" && start > 0 && scenario.erroreSecondaPagina)
        return Promise.resolve({ data: null, error: new Error("Pagina rate non disponibile") }).then(resolve);
      const rows = table === "fatture_ricevute" ? [{
        id: "fattura", numero_fattura: "REGRESSIONE", data_fattura: "2020-01-01", tipo_documento: "TD01",
        totale_documento: 1001, netto_a_pagare: 1001, stato: "non_letta", company_cost_id: null, costo: null,
      }] : Array.from({ length: 1001 }, (_, i) => ({
        id: `rata-${i}`, fattura_ricevuta_id: "fattura", company_cost_id: null, numero: i + 1,
        scadenza: "2020-02-01", importo: 1, metodo: "bonifico",
        stato: i < 1000 ? "pagata" : "da_pagare", pagata_il: i < 1000 ? "2020-02-01" : null,
      }));
      return Promise.resolve({ data: rows.slice(start, end + 1), error: null }).then(resolve);
    };
    return query;
  },
} }));

import { FattureDebitiFornitore } from "@/components/suppliers/FattureDebitiFornitore";

afterEach(() => { cleanup(); scenario.erroreSecondaPagina = false; });
const mostra = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><FattureDebitiFornitore supplierId={null} partitaIva="IT01234567890" /></MemoryRouter>
  </QueryClientProvider>,
);

describe("rate delle fatture individuate dalla P.IVA", () => {
  it("non considera pagata una fattura se la rata aperta è oltre il limite API", async () => {
    mostra();
    expect(await screen.findByText("Scaduta")).toBeTruthy();
    expect(screen.getByText("Rate e RiBa da pagare")).toBeTruthy();
  });
  it("non mostra un saldo parziale se una pagina successiva fallisce", async () => {
    scenario.erroreSecondaPagina = true;
    mostra();
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a leggere fatture e debiti del fornitore");
    expect(screen.queryByText("Pagata")).toBeNull();
  });
});
