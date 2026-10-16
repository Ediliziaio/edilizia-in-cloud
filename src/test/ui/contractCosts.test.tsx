import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractCosts } from "@/components/orders/ContractCosts";
import { consolidateContractCosts } from "@/lib/orders/contractCosts";
const m = vi.hoisted(() => ({ allowed: true, error: false, margins: true }));
vi.mock("react-router-dom", () => ({ Link: ({ to, children }: any) => <a href={to}>{children}</a> }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewMargins: m.margins, canViewOrderAmounts: m.margins }) }));
vi.mock("@/hooks/useContractCosts", () => ({ useContractCosts: () => ({ allowed: m.allowed, isPending: false, isError: m.error, isFetching: false, refetch: vi.fn(), data: result }) }));
const result = consolidateContractCosts({ company_id: "c", contract_id: "root", calculated_at: "", lines: [
  { id: "root", order_code: "C", description: "Contratto", is_contract: true, intervention_reference: null, economics: { consuntivo: 50, preventivo_totale: 1000, costo_diretto: 50 } },
  { id: "child", order_code: "INT", description: "Ripristino", is_contract: false, intervention_reference: "PED-1", economics: { consuntivo: 200, costo_manodopera: 200 } },
] }, "c", "root");
beforeEach(() => { m.allowed = true; m.error = false; m.margins = true; }); afterEach(cleanup);
describe("riepilogo sul contratto", () => {
  it("mostra i tre valori, il dettaglio collegato e il margine consolidato", () => {
    render(<ContractCosts contractId="root" financeConfirmed />);
    expect(screen.getByText("Totale consolidato dei costi registrati").nextSibling?.textContent).toMatch(/250,00/);
    expect(screen.getByRole("link", { name: /PED-1/ })).toHaveAttribute("href", "/azienda/ordini/child?tab=cantiere");
    expect(screen.getByText(/Margine sui costi registrati/).textContent).toMatch(/750,00/);
  });
  it("la bozza mostra i costi senza inventare il margine", () => {
    render(<ContractCosts contractId="root" financeConfirmed={false} />);
    expect(screen.getByText(/Margine da verificare/)).toBeVisible();
    expect(screen.queryByText(/Margine sui costi registrati/)).not.toBeInTheDocument();
  });
  it("permesso sui costi non espone anche ricavi e margini", () => {
    m.margins = false; render(<ContractCosts contractId="root" financeConfirmed />);
    expect(screen.getByText("Totale consolidato dei costi registrati")).toBeVisible();
    expect(screen.queryByText(/Ricavi del solo contratto/)).not.toBeInTheDocument();
  });
  it("un errore dopo una lettura riuscita nasconde il vecchio totale", () => {
    m.error = true; render(<ContractCosts contractId="root" financeConfirmed />);
    expect(screen.getByRole("alert")).toHaveTextContent("Nessun totale parziale");
    expect(screen.queryByText("Totale consolidato dei costi registrati")).not.toBeInTheDocument();
  });
  it("senza permesso non mostra costi memorizzati", () => {
    m.allowed = false; const { container } = render(<ContractCosts contractId="root" financeConfirmed />);
    expect(container).toBeEmptyDOMElement();
  });
});
