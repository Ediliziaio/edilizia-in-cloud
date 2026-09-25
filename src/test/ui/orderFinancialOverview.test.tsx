import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { OrderFinancialOverview } from "@/components/orders/OrderFinancialOverview";
const state = vi.hoisted(() => ({ pending: false, error: false, costs: 400, margin: 600, pct: 60, hook: vi.fn() }));
vi.mock("@/hooks/useOrderEconomicsBase", () => ({ useOrderEconomicsBase: (...args: unknown[]) => {
  state.hook(...args);
  return { isPending: state.pending, isError: state.error, econ: { costsTot: state.costs, margin: state.margin, marginPct: state.pct, laborNet: 100 } };
} }));
afterEach(cleanup);
beforeEach(() => { state.pending = false; state.error = false; state.costs = 400; state.margin = 600; state.pct = 60; state.hook.mockClear(); });
function mount(extra: Partial<ComponentProps<typeof OrderFinancialOverview>> = {}) {
  const props: ComponentProps<typeof OrderFinancialOverview> = { orderId: "order", totalAmount: 1000, vatRate: 22, items: [], installments: [], collectedGross: 200, cashTotalGross: 1220, canViewAmounts: true, canViewMargins: true, onOpenEconomics: vi.fn(), onOpenPayments: vi.fn(), ...extra };
  render(<OrderFinancialOverview {...props} />);
  return props;
}
describe("Fascia economica condivisa", () => {
  it("mostra contratto IVA inclusa, imponibile, margini e residuo", () => {
    const props = mount();
    expect(screen.getByRole("button", { name: "Apri dettagli: Totale contratto" })).toHaveTextContent("1.220,00");
    expect(screen.getByRole("button", { name: "Apri dettagli: Imponibile" })).toHaveTextContent("1.000,00");
    expect(screen.getByRole("button", { name: "Apri dettagli: Margine €" })).toHaveTextContent("600,00");
    expect(screen.getByRole("button", { name: "Apri dettagli: Margine %" })).toHaveTextContent("60%");
    expect(screen.getByRole("button", { name: "Apri stato pagamenti" })).toHaveTextContent("1.020,00");
    fireEvent.click(screen.getByRole("button", { name: "Apri dettagli: Margine €" }));
    expect(props.onOpenEconomics).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Apri stato pagamenti" }));
    expect(props.onOpenPayments).toHaveBeenCalledOnce();
  });
  it.each(["loading", "error", "missing"] as const)("non mostra margini falsi: %s", condition => {
    state.pending = condition === "loading"; state.error = condition === "error"; state.costs = condition === "missing" ? 0 : 400;
    mount();
    expect(screen.getByRole("button", { name: "Apri dettagli: Margine €" })).toHaveTextContent("—");
    expect(screen.getByRole("button", { name: "Apri dettagli: Margine %" })).not.toHaveTextContent("60%");
  });
  it("nasconde i margini e disabilita le query senza il permesso", () => {
    mount({ canViewMargins: false });
    expect(screen.queryByRole("button", { name: "Apri dettagli: Margine €" })).toBeNull();
    expect(state.hook).toHaveBeenCalledWith("order", 1000, [], false);
  });
  it("nasconde gli importi e i pagamenti senza il permesso", () => {
    mount({ canViewAmounts: false });
    expect(screen.queryByRole("button", { name: "Apri stato pagamenti" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Apri dettagli: Totale contratto" })).toBeNull();
  });
  it("non monta la fascia per un ruolo senza visibilità finanziaria", () => {
    mount({ canViewAmounts: false, canViewMargins: false });
    expect(screen.queryByRole("region", { name: "Riepilogo economico commessa" })).toBeNull();
  });
  it.each([{ installmentsLoading: true }, { installmentsError: true }])("non dichiara rate da incassare o saldate prima di caricarle", state => {
    mount(state);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("button", { name: "Apri stato pagamenti" })).not.toHaveTextContent("Incassato parzialmente");
  });
  it("non trasforma IVA zero in 22%", () => {
    mount({ vatRate: 0, cashTotalGross: 1000 });
    expect(screen.getByRole("button", { name: "Apri dettagli: Totale contratto" })).toHaveTextContent("1.000,00");
  });
});
