import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import InsolutiPage from "@/pages/admin/InsolutiPage";
import { AdminBreadcrumb } from "@/components/admin/header/AdminBreadcrumb";
const state = vi.hoisted(() => ({ loading: false, error: null as Error | null, refetch: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: undefined, isLoading: state.loading, error: state.error, refetch: state.refetch, isFetching: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
afterEach(() => { cleanup(); state.loading = false; state.error = null; state.refetch.mockClear(); });
describe("Insoluti: dati disponibili e percorso", () => {
  it("non presenta zeri come dati reali durante il caricamento", () => {
    state.loading = true; render(<MemoryRouter><InsolutiPage /></MemoryRouter>);
    expect(screen.queryByText(/0,00/)).not.toBeInTheDocument();
    expect(screen.getByText("Caricamento posizioni…")).toBeInTheDocument();
  });
  it("mostra l'errore e consente di riprovare senza dichiarare gli abbonamenti in regola", () => {
    state.error = new Error("offline"); render(<MemoryRouter><InsolutiPage /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("Impossibile caricare");
    expect(screen.queryByText(/0,00/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name:"Riprova"}));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it.each(["/admin/insoluti", "/admin/insoluti/"])("riconosce il percorso %s", path => {
    render(<MemoryRouter initialEntries={[path]}><AdminBreadcrumb /></MemoryRouter>);
    expect(screen.getByRole("navigation", {name:"Breadcrumb"})).toHaveTextContent("Insoluti");
  });
});
