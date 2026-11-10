import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const state = vi.hoisted(() => ({ readonly: false, loading: false, mutate: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: true, canEditCustomers: true, solaLettura: state.readonly, isLoading: state.loading }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "test" } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({
 useQuery: () => ({ data: [] as unknown[] }),
 useQueryClient: () => ({ invalidateQueries: vi.fn() }),
 useMutation: () => ({ mutate: state.mutate, isPending: false }),
}));
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { VoceEliminaCliente } from "@/components/clients/VoceEliminaCliente";
import { CustomerProfileCard } from "@/components/clients/CustomerProfileCard";
const customer: Parameters<typeof CustomerProfileCard>[0]["customer"] = {
 id: "test", first_name: "Mario", last_name: "Rossi", email: "demo@example.invalid", phone: null, address: null, site_address: null,
 fiscal_code: null, vat_number: null, notes: null, created_at: "2026-01-01", salesperson_id: null,
};
beforeEach(() => { state.readonly = false; state.loading = false; state.mutate.mockClear(); });
afterEach(cleanup);
it.each(["readonly", "loading"] as const)("non apre l’editor inline quando i permessi sono %s", (mode) => {
 state[mode] = true;
 render(<MemoryRouter><CustomerProfileCard customer={customer} /></MemoryRouter>);
 fireEvent.click(screen.getByText("Mario", { exact: true }));
 expect(screen.queryByDisplayValue("Mario")).toBeNull();
 expect(state.mutate).not.toHaveBeenCalled();
});
it("mantiene la modifica inline per l’amministratore con scrittura abilitata", () => {
 render(<MemoryRouter><CustomerProfileCard customer={customer} /></MemoryRouter>);
 fireEvent.click(screen.getByText("Mario", { exact: true }));
 const input = screen.getByDisplayValue("Mario");
 fireEvent.change(input, { target: { value: "Marco" } }); fireEvent.blur(input);
 expect(state.mutate).toHaveBeenCalledWith({ field: "first_name", value: "Marco" });
});

function openDeleteMenu() {
 render(<MemoryRouter><DropdownMenu><DropdownMenuTrigger>Azioni cliente</DropdownMenuTrigger><DropdownMenuContent><VoceEliminaCliente id="test" commesse={0} /></DropdownMenuContent></DropdownMenu></MemoryRouter>);
 fireEvent.keyDown(screen.getByRole("button", { name: "Azioni cliente" }), { key: "ArrowDown" });
 return screen.getByRole("menuitem", { name: "Elimina cliente" });
}
it.each(["readonly", "loading"] as const)("blocca anche l’eliminazione se i permessi sono %s", (mode) => {
 state[mode] = true;
 expect(openDeleteMenu()).toHaveAttribute("aria-disabled", "true");
});
it("mantiene disponibile la conferma di eliminazione per l’editor con dati noti", () => {
 expect(openDeleteMenu()).not.toHaveAttribute("aria-disabled", "true");
});
