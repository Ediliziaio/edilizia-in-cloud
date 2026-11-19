import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { IncassiMarginiCommessa } from "@/components/orders/IncassiMarginiCommessa";
import { normalizzaIvaCommessa } from "@/lib/orders/ivaCommessa";
import type { FatturaCommessa } from "@/lib/orders/fattureCommessa";
import type { Installment } from "@/lib/orderUtils";
import { quadraturaCassaCommessa, riepilogoBonificiCommessa } from "@/lib/orders/quadraturaCassaCommessa";

const m = vi.hoisted(() => ({ bancarie: vi.fn(), commerciali: vi.fn() }));
vi.mock("@/hooks/useRitenuteBonifici", () => ({ useRitenuteBonificiCommessa: m.bancarie }));
vi.mock("@/hooks/useCommercialiCommessa", () => ({ useCommercialiCommessa: m.commerciali }));
vi.mock("@/hooks/useRitenuteGaranzia", () => ({
  useRitenuteGaranzia: () => ({ isLoading: false, isError: false, totaleRitenuto: 0 }),
}));
vi.mock("@/components/ritenute/RitenuteClienteCommessa", () => ({
  useRitenuteClienteCommessa: () => ({
    permissions: { isAdmin: true }, q: { isSuccess: true, isError: false }, trattenute: 10600, trattenuteSal: 10600,
  }),
}));
vi.mock("@/components/orders/IvaCommessa", () => ({
  useIvaCommessa: () => ({ data: normalizzaIvaCommessa({ aliquota: 10, debito_previsto: 21200 }), isError: false }),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const rate: Installment[] = [22000, 28611, 53790, 50782.53, 46308.34, 20048.13].map((amount, position) => ({
  id: String(position), label: `Rata ${position + 1}`, type: position === 5 ? "balance" : "deposit",
  amount, position, is_paid: position === 0,
}));
const fattura: FatturaCommessa = {
  id: "f1", numero: "FT-1", data_emissione: "2026-11-18", tipo: "fattura", stato: "pagata",
  totale_da_pagare: 11000, totale_documento: 11000, importo_pagato: 11000, importo_associato: null,
};

it("la demo spiega lo scarto di 11.660 euro e lascia invariati i 199.540 euro di rate aperte", () => {
  const vaiA = vi.fn();
  m.bancarie.mockReturnValue({ data: [], isLoading: false });
  m.commerciali.mockReturnValue({ data: [] });
  render(<MemoryRouter><IncassiMarginiCommessa orderId="o1" rate={rate} documenti={[]}
    residuoContratto={211200} incassato={22000} statoIncassi="pronto" conCommerciali
    conRitenuteBancarie apriRegistroBancario vaiA={vaiA} /></MemoryRouter>);
  const pane = within(screen.getByRole("region", { name: "IVA, trattenute e cassa" }));
  expect(pane.getByText("Residuo delle rate registrate").parentElement).toHaveTextContent("199.540,00");
  expect(pane.getByText("Differenza").parentElement).toHaveTextContent("11.660,00");
  expect(pane.getByText(/già al netto di questa garanzia/)).toHaveTextContent("10.600,00");
  expect(pane.getByText(/Nessun bonifico parlante registrato/)).toBeInTheDocument();
  fireEvent.click(pane.getByRole("button", { name: "Dettaglio garanzie e svincoli" }));
  expect(vaiA).toHaveBeenCalledWith("section-ritenute");
});

it("mostra il commerciale e il netto dei bonifici della commessa, per quota ed esclusi gli storni", () => {
  const vaiA = vi.fn();
  const bonifico = { documento_id: "f1", lordo: 11000, ritenuta: 900, commissioni: 10, stato: "certificata", netto: 10090 } as const;
  const registrazioni = [bonifico, { ...bonifico, stato: "stornata" as const }, { ...bonifico, documento_id: "altra" }];
  m.commerciali.mockReturnValue({ data: [{
    salesperson: { first_name: "Anna", last_name: "Rossi" }, commission_amount: 300, deduction_amount: 25,
  }] });
  m.bancarie.mockReturnValue({ data: registrazioni, isLoading: false });
  render(<MemoryRouter><IncassiMarginiCommessa orderId="o1" rate={[]} documenti={[{ ...fattura, importo_associato: 5500 }]}
    residuoContratto={0} incassato={5500} statoIncassi="pronto" conCommerciali conRitenuteBancarie
    apriRegistroBancario vaiA={vaiA} /></MemoryRouter>);
  expect(m.bancarie).toHaveBeenCalledWith(["f1"], true);
  expect(screen.getByText("Trattenuta dalla banca").parentElement).toHaveTextContent("450,00");
  expect(screen.getByText("Commissioni bancarie").parentElement).toHaveTextContent("5,00");
  expect(screen.getByText("Netto accreditato").parentElement).toHaveTextContent("5.045,00");
  expect(screen.getByText("Incassato dal cliente").parentElement).toHaveTextContent("5.500,00");
  expect(screen.getByText("275,00 €")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Commerciale Anna Rossi" }));
  expect(vaiA).toHaveBeenCalledWith("section-provvigioni");
  expect(riepilogoBonificiCommessa([fattura], registrazioni).netto).toBe(10090);
});

it("non chiama lo scarto garanzia quando il residuo e i SAL non coincidono", () => {
  expect(quadraturaCassaCommessa(211300, rate, [], 10600, 10)).toEqual({
    rateAperte: 199540, differenza: 11760, coerenteConGaranzia: false,
  });
  expect(quadraturaCassaCommessa(6000, [
    { ...rate[1], amount: 11000, documento_quota_lorda: 11000, quota_fattura_residua: 6000 },
  ], [], 0, 10)).toMatchObject({ rateAperte: 6000, differenza: 0 });
});
