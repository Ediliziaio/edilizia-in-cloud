import type { AdminUserSession } from "@/hooks/superadmin/useAdminUsers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UsersList from "@/pages/admin/UsersList";
import { AdminBreadcrumb } from "@/components/admin/header/AdminBreadcrumb";
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
const { usersQuery } = vi.hoisted(() => ({ usersQuery: vi.fn() }));
vi.mock("@/hooks/superadmin/useCompanyGroups", () => ({
  useCompanyGroups: () => ({ data: [{ name: "Scavolo", companyIds: ["company-a", "company-b"] }] }),
  useAccountsOverview: () => ({ data: { accounts: 224, with_profile: 213, without_profile: 11, portal: 6, roles: ["company_admin", "customer"], companies: [{ id: "company-a", name: "Azienda A", accounts: 5, portal: 0 }, { id: null, name: "Senza azienda", accounts: 13, portal: 0 }] } }),
}));
vi.mock("@/hooks/superadmin/useAdminUsers", () => ({
  useAdminUsers: (filters: unknown) => { usersQuery(filters); return ({ data: { rows: [{ id: "demo", nome: "Persona demo", email: "demo@example.test", azienda_nome: "Azienda demo", ruoli: ["company_admin", "salesperson"], ultimo_accesso: null as string | null, sessioni_attive: 1, tentativi_falliti: 0, bloccato: false }], total: 1 }, isLoading: false }); },
  useAdminUserSessions: () => ({ data: [] as AdminUserSession[] }),
  useAdminUserActions: () => ({}),
}));
afterEach(cleanup);
describe("Leggibilità della pagina Utenti", () => {
  it.each(["/admin/utenti", "/admin/utenti/"])("usa il nome corretto nel percorso %s", (path) => {
    render(<MemoryRouter initialEntries={[path]}><AdminBreadcrumb /></MemoryRouter>);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Utenti");
  });
  it("filtra per azienda, ruolo e gruppo e azzera i filtri", () => {
    render(<UsersList />);
    fireEvent.change(screen.getByLabelText("Azienda accessibile"), { target: { value: "company-a" } });
    fireEvent.change(screen.getByLabelText("Ruolo"), { target: { value: "customer" } });
    expect(usersQuery).toHaveBeenLastCalledWith(expect.objectContaining({ companyId: "company-a", role: "customer", page: 0 }));
    fireEvent.change(screen.getByLabelText("Gruppo aziendale"), { target: { value: "Scavolo" } });
    expect(usersQuery).toHaveBeenLastCalledWith(expect.objectContaining({ companyId: "", group: "Scavolo", role: "customer" }));
    fireEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));
    expect(usersQuery).toHaveBeenLastCalledWith(expect.objectContaining({ companyId: "", group: "", role: "", stato: null }));
    expect(screen.getByLabelText("Riepilogo account")).toHaveTextContent("224 account totali");
    expect(screen.getByLabelText("Riepilogo account")).toHaveTextContent("11 senza profilo");
  });
  it("mostra ruoli leggibili e il numero di sessioni", () => {
    render(<UsersList />);
    expect(screen.getAllByText("Amministratore")).toHaveLength(2);
    expect(screen.getByText("Venditore")).toBeInTheDocument();
    expect(screen.queryByText("company_admin")).not.toBeInTheDocument();
    expect(screen.getByText(/1 sessione attiva/)).toBeInTheDocument();
  });
});
