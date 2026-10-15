import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CompaniesKPIStrip } from "@/components/admin/company/CompaniesKPIStrip";
afterEach(cleanup);
const companies = [{ id: "company", status: "active", subscription_plans: null }];
describe("Stato delle valutazioni nei KPI", () => {
  it("non presenta un errore di caricamento come zero aziende a rischio", () => {
    const click = vi.fn();
    render(<CompaniesKPIStrip companies={companies} healthData={{}} healthStatus="error" onKpiClick={click} />);
    expect(screen.getByText("N/D")).toBeInTheDocument();
    expect(screen.getByText("Valutazioni non disponibili")).toBeInTheDocument();
    expect(screen.queryByText("tutto sotto controllo")).not.toBeInTheDocument();
  });
  it("rende esplicite le aziende senza valutazione", () => {
    render(<CompaniesKPIStrip companies={companies} healthData={{}} />);
    expect(screen.getByText("1 azienda senza valutazione")).toBeInTheDocument();
    expect(screen.queryByText("tutto sotto controllo")).not.toBeInTheDocument();
  });
});
