import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const query = vi.hoisted(() => ({ isError: false, retry: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-test" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] as unknown[], isLoading: false, isError: query.isError, refetch: query.retry }) }));
import { DrilldownDrawer } from "@/components/cruscotto/DrilldownDrawer";
beforeEach(() => { query.isError = false; query.retry.mockClear(); });
afterEach(cleanup);
it.each(["revenue", "margin", "late-orders", "tickets"] as const)("distingue errore e vuoto nel dettaglio %s e consente di riprovare", (type) => {
  query.isError = true;
  render(<DrilldownDrawer type={type} onClose={vi.fn()} dateFrom={new Date("2026-01-01")} dateTo={new Date("2026-01-31")} />);
  expect(screen.queryByText(/Nessun dato/)).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Impossibile caricare il dettaglio");
  fireEvent.click(screen.getByRole("button", { name: "Riprova caricamento dettaglio" }));
  expect(query.retry).toHaveBeenCalledOnce();
});
it("mantiene lo stato vuoto quando la lettura riesce", () => {
  render(<DrilldownDrawer type="revenue" onClose={vi.fn()} dateFrom={new Date("2026-01-01")} dateTo={new Date("2026-01-31")} />);
  expect(screen.getByText(/Nessun dato/)).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
