import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { OrderFinancialOverview } from "@/components/orders/OrderFinancialOverview";
const state = vi.hoisted(() => ({
  pending: false, error: false, costs: 400, margin: 600, pct: 60, commissions: 0, hook: vi.fn(),
  previsto: { costo: 300, lavorazioni: 3, lavorazioniSenzaPrevisto: 0, isLoading: false, isError: false },
  daPagare: 150, cassa: vi.fn(),
}));
vi.mock("@/hooks/useOrderEconomicsBase", () => ({ useOrderEconomicsBase: (...args: unknown[]) => {
  state.hook(...args);
  const canShowMargin = state.costs > 0;
  return {
    isPending: state.pending,
    isError: state.error,
    actual: { costs: state.costs, margin: state.margin, marginPct: state.pct, commissions: state.commissions },
    quality: {
      canShowMargin,
      status: canShowMargin ? "ready" : "missing",
      label: canShowMargin ? "Dati attendibili" : "Dati da completare",
      issues: canShowMargin ? [] : [{ code: "no_registered_costs", label: "Nessun costo registrato" }],
    },
  };
} }));
vi.mock("@/hooks/useCostoPrevistoCommessa", () => ({ useCostoPrevistoCommessa: () => state.previsto }));
vi.mock("@/hooks/useEsposizioneCommessa", () => ({ useEsposizioneCommessa: (a: unknown) => {
  state.cassa(a);
  return { esposizione: { daPagare: state.daPagare }, isLoading: false, isError: false };
} }));
afterEach(cleanup);
beforeEach(() => {
  Object.assign(state, { pending: false, error: false, costs: 400, margin: 600, pct: 60, commissions: 0, daPagare: 150,
    previsto: { costo: 300, lavorazioni: 3, lavorazioniSenzaPrevisto: 0, isLoading: false, isError: false } });
  state.hook.mockClear(); state.cassa.mockClear();
});
function mount(extra: Partial<ComponentProps<typeof OrderFinancialOverview>> = {}) {
  const props: ComponentProps<typeof OrderFinancialOverview> = { orderId: "order", totalAmount: 1000, vatRate: 22, items: [], installments: [], collectedGross: 200, cashTotalGross: 1220, canViewAmounts: true, canViewMargins: true, onOpenEconomics: vi.fn(), onOpenPayments: vi.fn(), ...extra };
  render(<OrderFinancialOverview {...props} />);
  return props;
}
const cella = (nome: string) => screen.getByRole("cell", { name: `Apri dettagli: ${nome}` });

describe("La commessa in numeri: previsto e reale", () => {
  it("previsto: contratto IVA inclusa, costo e margine previsti dalle lavorazioni", () => {
    mount();
    expect(cella("Contratto")).toHaveTextContent("1.220,00");
    expect(cella("Contratto")).toHaveTextContent("Imponibile 1.000,00");
    expect(cella("Costo previsto")).toHaveTextContent("300,00");
    expect(cella("Margine previsto")).toHaveTextContent("700,00");
    expect(cella("Margine previsto")).toHaveTextContent("70%");
  });

  it("reale: costi sostenuti col da pagare, margine reale con lo scarto sul previsto, incassato", () => {
    const props = mount();
    expect(cella("Costi sostenuti")).toHaveTextContent("400,00");
    expect(cella("Costi sostenuti")).toHaveTextContent("Da pagare 150,00");
    expect(cella("Margine reale")).toHaveTextContent("600,00");
    expect(cella("Margine reale")).toHaveTextContent("60%");
    expect(cella("Costi sostenuti")).toHaveTextContent("Oltre il previsto di 100,00");
    expect(cella("Margine reale")).toHaveTextContent("A fine lavori ≈ 600,00");
    expect(cella("Incassato")).toHaveTextContent("200,00");
    expect(cella("Incassato")).toHaveTextContent("Da incassare 1.020,00");
    fireEvent.click(cella("Margine reale"));
    expect(props.onOpenEconomics).toHaveBeenCalledOnce();
    fireEvent.click(cella("Incassato"));
    expect(props.onOpenPayments).toHaveBeenCalledOnce();
  });

  it("le provvigioni entrano nel previsto (si conoscono alla firma)", () => {
    state.commissions = 50;
    mount();
    expect(cella("Costo previsto")).toHaveTextContent("350,00");
  });

  it("previsto parziale: lo dice, e senza lavorazioni con un costo non inventa un margine", () => {
    state.previsto = { ...state.previsto, lavorazioniSenzaPrevisto: 2 };
    mount();
    expect(cella("Costo previsto")).toHaveTextContent("Parziale: 2 di 3 lavorazioni senza costo previsto");
    cleanup();
    state.previsto = { ...state.previsto, costo: 0 };
    mount();
    expect(cella("Margine previsto")).toHaveTextContent("—");
    expect(cella("Margine reale")).not.toHaveTextContent("A fine lavori");
  });

  it("a metà lavori: quanto previsto è già speso e il margine stimato a fine lavori", () => {
    state.costs = 120; state.margin = 880; state.pct = 88;
    mount();
    expect(cella("Costi sostenuti")).toHaveTextContent("Speso il 40% del previsto · restano 180,00");
    expect(screen.getByRole("progressbar", { name: "Previsto già speso" })).toHaveAttribute("aria-valuenow", "40");
    expect(cella("Margine reale")).toHaveTextContent("880,00");
    expect(cella("Margine reale")).toHaveTextContent("A fine lavori ≈ 700,00 € · 70%");
  });

  it("niente da pagare: lo dice", () => {
    state.daPagare = 0;
    mount();
    expect(cella("Costi sostenuti")).toHaveTextContent("Tutto pagato");
  });

  it.each(["loading", "error", "missing"] as const)("non mostra margini reali falsi: %s", condition => {
    state.pending = condition === "loading"; state.error = condition === "error"; state.costs = condition === "missing" ? 0 : 400;
    mount();
    expect(cella("Margine reale")).toHaveTextContent("—");
    expect(cella("Margine reale")).not.toHaveTextContent("60%");
  });

  it("senza permesso sui margini: niente costi né margini, query spente", () => {
    mount({ canViewMargins: false });
    expect(screen.queryByRole("cell", { name: "Apri dettagli: Margine reale" })).toBeNull();
    expect(screen.queryByRole("cell", { name: "Apri dettagli: Costo previsto" })).toBeNull();
    expect(state.hook).toHaveBeenCalledWith("order", 1000, [], false);
    expect(state.cassa).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("col permesso sui margini ma non sui costi: niente «da pagare»", () => {
    mount({ canViewCosts: false });
    expect(cella("Costi sostenuti")).not.toHaveTextContent("Da pagare");
    expect(state.cassa).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("senza permesso sugli importi: niente contratto né incassi", () => {
    mount({ canViewAmounts: false });
    expect(screen.queryByRole("cell", { name: "Apri dettagli: Incassato" })).toBeNull();
    expect(screen.queryByRole("cell", { name: "Apri dettagli: Contratto" })).toBeNull();
  });

  it("non monta la fascia per un ruolo senza visibilità finanziaria", () => {
    mount({ canViewAmounts: false, canViewMargins: false });
    expect(screen.queryByRole("region", { name: "Riepilogo economico commessa" })).toBeNull();
  });

  it.each([{ installmentsLoading: true }, { installmentsError: true }])("non dichiara incassi prima di caricarli", s => {
    mount(s);
    expect(screen.queryByRole("progressbar", { name: "Percentuale incassata" })).toBeNull();
    expect(cella("Incassato")).not.toHaveTextContent("Da incassare");
  });

  it("non trasforma IVA zero in 22%", () => {
    mount({ vatRate: 0, cashTotalGross: 1000 });
    expect(cella("Contratto")).toHaveTextContent("1.000,00");
  });
});
