import type { AdminUserSession } from "@/hooks/superadmin/useAdminUsers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UsersList from "@/pages/admin/UsersList";
import { AdminBreadcrumb } from "@/components/admin/header/AdminBreadcrumb";
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/superadmin/useAdminUsers", () => ({
  useAdminUsers: () => ({ data: { rows: [{ id: "demo", nome: "Persona demo", email: "demo@example.test", azienda_nome: "Azienda demo", ruoli: ["company_admin", "salesperson"], ultimo_accesso: null as string | null, sessioni_attive: 1, tentativi_falliti: 0, bloccato: false }], total: 1 }, isLoading: false }),
  useAdminUserSessions: () => ({ data: [] as AdminUserSession[] }),
  useAdminUserActions: () => ({}),
}));
afterEach(cleanup);
describe("Leggibilità della pagina Utenti", () => {
  it.each(["/admin/utenti", "/admin/utenti/"])("usa il nome corretto nel percorso %s", (path) => {
    render(<MemoryRouter initialEntries={[path]}><AdminBreadcrumb /></MemoryRouter>);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Utenti");
  });
  it("mostra ruoli leggibili e il numero di sessioni", () => {
    render(<UsersList />);
    expect(screen.getByText("Amministratore")).toBeInTheDocument();
    expect(screen.getByText("Venditore")).toBeInTheDocument();
    expect(screen.queryByText("company_admin")).not.toBeInTheDocument();
    expect(screen.getByText(/1 sessione attiva/)).toBeInTheDocument();
  });
});
