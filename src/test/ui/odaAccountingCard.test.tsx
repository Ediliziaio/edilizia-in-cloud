import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OdaAccountingCard } from "@/components/orders/OdaAccountingCard";

// Un ODA da 10.000 € con la sola fattura d'acconto (3.000 €) e due rate aperte.
let DATI: Record<string, unknown[]> = {
  company_costs: [{ id: "c1", amount: 2459.02, is_paid: false, due_date: "2026-11-15", paid_date: null }],
  fatture_ricevute: [{ id: "f1", numero_fattura: "A-12", data_fattura: "2026-10-20", totale_documento: 3000, stato: "contabilizzata", tipo_documento: "TD02" }],
  rate_fornitori: [
    { numero: 1, scadenza: "2026-11-15", importo: 1500, metodo: "riba", stato: "da_pagare" },
    { numero: 2, scadenza: "2026-12-15", importo: 1500, metodo: "riba", stato: "da_pagare" },
  ],
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      const risposta = Promise.resolve({ data: DATI[tabella] ?? [], error: null });
      const q = { select: () => q, eq: () => risposta, in: () => risposta };
      return q;
    },
  },
}));
vi.mock("@/components/orders/ExpensePaymentDialog", () => ({ ExpensePaymentDialog: (): null => null }));

describe("Scheda Contabilità dell'ODA", () => {
  it("un acconto non fa scattare l'avviso: dice quanto resta da fatturare e la prossima RiBa", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <OdaAccountingCard odaId="oda1" totaleOrdine={10000} stato="confermato" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Restano da fatturare/)).toBeTruthy();
    expect(screen.queryByText(/Verifica prima di pagare/)).toBeNull();
    expect(screen.getByText("Prossima uscita")).toBeTruthy();
    expect(screen.getByText(/il 15\/11\/2026 · RiBa · 2 rate da pagare/)).toBeTruthy();
  });

  it("una fattura divisa tra più ordini conta solo la quota di questo, IVA compresa", async () => {
    DATI = {
      company_costs: [],
      fatture_ricevute: [],
      rate_fornitori: [],
      fattura_ricevuta_ordini: [{
        importo: 1000,
        fattura: { id: "fc", numero_fattura: "C-9", data_fattura: "2026-10-31", totale_documento: 3660, imponibile_totale: 3000, stato: "contabilizzata", tipo_documento: "TD01" },
      }],
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <OdaAccountingCard odaId="oda2" totaleOrdine={1220} stato="ricevuto" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Fatture e ordine combaciano")).toBeTruthy();
    expect(screen.getByText(/n\. C-9 del 31\/10\/2026/)).toBeTruthy();
  });
});
