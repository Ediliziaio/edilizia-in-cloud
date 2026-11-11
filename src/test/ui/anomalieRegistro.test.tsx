import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company1" }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditOrders: true }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company1" }, user: { id: "u1" } }) }));
vi.mock("recharts", () => {
  const Component = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { BarChart: Component, Bar: Component, XAxis: Component, YAxis: Component, CartesianGrid: Component, Tooltip: Component, ResponsiveContainer: Component, Legend: Component, Cell: Component };
});
vi.mock("@tanstack/react-query", async original => {
  const actual = await original<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === "global-errors" ? [
    { id: "a1", order_id: "o1", amount: 50, error_type: "merce", error_category: "misura", description: "Misura da rifare\n[Gestione] Priorità: high", error_date: "2026-01-01", review_status: "assegnata", confirmed_responsibility_name: "Mario Rossi", corrective_due_date: "2020-01-01", orders: { order_code: "ORD-1", description: "Bagno" } },
    { id: "a2", order_id: "o2", amount: 100, error_type: "merce", error_category: "altro", description: "Vetro sostituito", error_date: "2026-01-02", review_status: "risolta", orders: { order_code: "ORD-2", description: "Casa" } },
  ] : undefined, isLoading: false, isFetching: false, error: null as null }) };
});
import GlobalErrors from "@/pages/azienda/GlobalErrors";
afterEach(cleanup);
function mount() { return render(<MemoryRouter><GlobalErrors /></MemoryRouter>); }
describe("Registro anomalie", () => {
  it("parte dal registro compatto, distingue responsabile confermato e priorità scelta", () => {
    mount(); const table = screen.getByRole("table");
    expect(within(table).getByText("Mario Rossi")).toBeVisible(); expect(within(table).getByText("Critica")).toBeVisible();
    expect(screen.queryByText("Andamento mensile per sorgente")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuova anomalia" })).toBeVisible();
    expect(within(table).getAllByRole("button", { name: "Apri dettaglio" })).toHaveLength(2);
  });
  it("filtra casi aperti e scaduti senza includere quelli risolti", () => {
    mount(); fireEvent.change(screen.getByLabelText("Stato anomalie"), { target: { value: "overdue" } });
    const table = screen.getByRole("table"); expect(within(table).getByText("Misura da rifare")).toBeVisible(); expect(within(table).queryByText("Vetro sostituito")).not.toBeInTheDocument();
  });
  it("cerca il responsabile confermato anche senza attribuzioni suggerite", () => {
    mount(); fireEvent.change(screen.getByLabelText("Cerca commessa, causa o responsabile"), { target: { value: "Mario Rossi" } });
    const table = screen.getByRole("table"); expect(within(table).getByText("Misura da rifare")).toBeVisible(); expect(within(table).queryByText("Vetro sostituito")).not.toBeInTheDocument();
  });
  it("rende disponibili le analisi in una vista separata", () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Analisi e statistiche" }));
    expect(screen.getByText("Andamento mensile per sorgente")).toBeVisible();
    expect(screen.getByText("Perdita finale netta")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Apri dettaglio" })).not.toBeInTheDocument();
  });
});
