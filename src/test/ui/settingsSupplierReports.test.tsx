import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SupplierReportsPanel } from "@/pages/azienda/settings/SettingsSuppliers";

const state = vi.hoisted(() => ({ isLoading: false, isError: false, refetch: vi.fn() }));
vi.mock("@/hooks/useOperationalSuppliers", () => ({ useOperationalSuppliers: () => ({ ...state, suppliers: [{
  id: "supplier-1", name: "Fornitore materiali edili con nome molto lungo", is_active: true,
  product_category: "Materiali da costruzione", oda_count: 2, oda_total: 1000,
  scadenze_aperte: 1, scadenze_importo: 250,
}] }) }));
vi.mock("@/components/settings/SuppliersConfig", () => ({ SuppliersConfig: (): null => null }));
vi.mock("@/pages/azienda/Suppliers", () => ({ SuppliersOperational: (): null => null }));
beforeEach(() => { state.isLoading = false; state.isError = false; state.refetch.mockClear(); });
afterEach(cleanup);

describe("Report fornitori", () => {
  it("mostra acquisti, scadenze e valore medio separati", () => {
    render(<SupplierReportsPanel />);
    expect(screen.getByText("Acquisti OdA").parentElement).toHaveTextContent("1.000");
    expect(screen.getByText("Valore medio OdA").parentElement).toHaveTextContent("500");
    expect(screen.getAllByText("Scadenze aperte")[0].parentElement).toHaveTextContent("250");
  });
  it("vincola i nomi lunghi senza allargare la griglia mobile", () => {
    const { container } = render(<SupplierReportsPanel />);
    expect(container.querySelector('[class*="minmax(0,1fr)"]')).not.toBeNull();
    expect(screen.getAllByText("Fornitore materiali edili con nome molto lungo")).toHaveLength(2);
  });
  it("durante il caricamento non presenta totali incompleti", () => {
    state.isLoading = true;
    render(<SupplierReportsPanel />);
    expect(screen.getByText("Caricamento report fornitori...")).toBeInTheDocument();
    expect(screen.queryByText("Acquisti OdA")).toBeNull();
  });
  it("distingue un errore dai totali a zero e permette di riprovare", () => {
    state.isError = true;
    render(<SupplierReportsPanel />);
    expect(screen.getByRole("alert")).toHaveTextContent("Nessun totale viene mostrato come zero");
    expect(screen.queryByText("Acquisti OdA")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});
