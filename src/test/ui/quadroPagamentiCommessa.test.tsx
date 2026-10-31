import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Risposta di commessa_quadro_pagamenti() come arriva dal database (DEMO-2026-N008,
// ridotta) più una tassa comunale senza fattura scaduta e un ordine senza fattura.
const quadro = {
  oggi: "2026-10-31",
  rate: [
    { id: "r1", label: "Acconto 30%", type: "deposit", amount: 18694.07, fattura: "DEM2026-008-1/2026", is_paid: true, scaduta: false, paid_date: "2026-03-15", expected_date: "2026-03-15" },
    { id: "r2", label: "Saldo 30%", type: "balance", amount: 18694.08, fattura: null, is_paid: false, scaduta: true, paid_date: null, expected_date: "2026-05-10" },
  ],
  sal_cliente: [{ id: "s1", rata: "Acconto 30%", stato: "approvato", incassato: true, numero_sal: 1, data_emissione: "2026-02-13", importo_totale: 16994.61 }],
  uscite: [
    { stato: "scaduto", chiave: "costo:t", pagato: 0, fatture: null, importo: 350, residuo: 350, ritenute: null, scadenza: "2026-10-20", categoria: "extra", contratto: null, pagato_il: null, quota_pct: 100, ripartito: false, origine_id: "t", controparte: null, descrizione: "Tassa comunale", ha_ricevuta: true, riferimento: null, origine_tipo: "costo", senza_fattura: true, maturato_lordo: null },
    { stato: "fattura_da_arrivare", chiave: "oda:p", pagato: 0, fatture: null, importo: 900, residuo: 900, ritenute: null, scadenza: "2026-11-15", categoria: "materiali", contratto: null, pagato_il: null, quota_pct: 100, ripartito: false, origine_id: "p", controparte: "Internorm Italia S.r.l.", descrizione: "Ordine d'acquisto", ha_ricevuta: false, riferimento: "OdA 12", origine_tipo: "oda", senza_fattura: false, maturato_lordo: null },
    { stato: "pagato", chiave: "costo:m", pagato: 24189, fatture: "FOR-DEMO-2026-N008", importo: 24189, residuo: 0, ritenute: null, scadenza: "2026-03-15", categoria: "materiali", contratto: null, pagato_il: null, quota_pct: 100, ripartito: false, origine_id: "m", controparte: "Internorm Italia S.r.l.", descrizione: "Materiali", ha_ricevuta: false, riferimento: "OdA ODA-DEMO-2026-N008", origine_tipo: "costo", senza_fattura: false, maturato_lordo: null },
    { stato: "parziale", chiave: "sub:k", pagato: 5000, fatture: "2 SAL", importo: 12462.72, residuo: 7462.72, ritenute: 623.14, scadenza: "2026-11-30", categoria: "subappalti", contratto: 20000, pagato_il: null, quota_pct: 100, ripartito: false, origine_id: "k", controparte: "Impianti Rossi", descrizione: "Impianti", ha_ricevuta: false, riferimento: "Contratto SUB-1", origine_tipo: "subappalto", senza_fattura: false, maturato_lordo: 13085.86 },
  ],
  mezzi_stimati: { costo: 4.82, mezzi: 2, giorni: 8 },
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async () => ({ data: quadro, error: null })) },
}));
vi.mock("@/components/orders/ExpensePaymentDialog", () => ({ ExpensePaymentDialog: ({ costId }: { costId: string }) => <div>dialogo costo {costId}</div> }));
vi.mock("@/components/orders/PurchasePaymentsDialog", () => ({ PurchasePaymentsDialog: ({ orderId }: { orderId: string }) => <div>dialogo ordine {orderId}</div> }));

import { QuadroPagamentiCommessa } from "@/components/orders/QuadroPagamentiCommessa";

const mostra = (p: Partial<Parameters<typeof QuadroPagamentiCommessa>[0]> = {}) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <QuadroPagamentiCommessa orderId="o1" mostraIncassi mostraUscite onApriSubappalti={p.onApriSubappalti} {...p} />
  </QueryClientProvider>,
);
afterEach(cleanup);

describe("Incassi e pagamenti della commessa", () => {
  it("dice in quattro numeri quanto è entrato, quanto deve entrare, quanto è uscito e quanto resta", async () => {
    mostra();
    expect(await screen.findByText("Incassato")).toBeInTheDocument();
    expect(screen.getByText("Da incassare").parentElement).toHaveTextContent("scaduti");
    // Da pagare: 350 (tassa) + 7.462,72 (residuo subappalto); l'ordinato senza fattura a parte.
    const daPagare = screen.getAllByText("Da pagare").find((e) => e.tagName === "P")!.parentElement!;
    expect(daPagare).toHaveTextContent(/7\.812,72/);
    expect(daPagare).toHaveTextContent(/ordinati senza fattura/);
  });

  it("elenca le uscite aperte con documento, scadenza e azione; il pagato si vede solo con «Tutti»", async () => {
    mostra();
    const elenco = await screen.findByRole("list", { name: "Pagamenti della commessa" });
    expect(within(elenco).getByText(/Senza fattura · ricevuta allegata/)).toBeInTheDocument();
    expect(within(elenco).getByText(/scaduta da 11 giorni/)).toBeInTheDocument();
    expect(within(elenco).getByText(/ancora da maturare/)).toBeInTheDocument();
    expect(within(elenco).queryByText(/FOR-DEMO-2026-N008/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Tutti/ }));
    expect(within(screen.getByRole("list", { name: "Pagamenti della commessa" })).getByText(/FOR-DEMO-2026-N008/)).toBeInTheDocument();
  });

  it("i pulsanti aprono il registro giusto", async () => {
    const onApriSubappalti = vi.fn();
    mostra({ onApriSubappalti });
    const elenco = await screen.findByRole("list", { name: "Pagamenti della commessa" });
    fireEvent.click(within(elenco).getAllByRole("button", { name: "Registra pagamento" })[0]);
    expect(screen.getByText("dialogo costo t")).toBeInTheDocument();
    fireEvent.click(within(elenco).getByRole("button", { name: "Apri SAL" }));
    expect(onApriSubappalti).toHaveBeenCalledOnce();
  });

  it("senza permesso sui costi non mostra le uscite", async () => {
    mostra({ mostraUscite: false });
    expect(await screen.findByText("Incassi dal cliente")).toBeInTheDocument();
    expect(screen.queryByText("Pagamenti della commessa")).toBeNull();
    expect(screen.queryByText("Pagato")).toBeNull();
  });
});
