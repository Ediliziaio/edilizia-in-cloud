import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditOrderDatesDialog } from "@/components/calendar/EditOrderDatesDialog";
import type { CalendarOrder } from "@/types/calendar";
const state = vi.hoisted(() => ({
  readonly: false, edit: true, payments: false, fail: false, calls: [] as { method: string; args: unknown[] }[],
  queries: [] as { enabled: boolean; queryFn: () => Promise<unknown> }[], success: vi.fn(), error: vi.fn(), sync: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" }, user: { id: "me" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isLoading: false, solaLettura: state.readonly, canEditOrders: state.edit, canViewScadenzario: state.payments }) }));
vi.mock("@tanstack/react-query", async () => ({ ...await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query"), useQuery: (q: typeof state.queries[number]) => { state.queries.push(q); return { data: { order: { total_amount: 12000, deposit_amount: 6000, deposit_paid: false, balance_amount: 6000, balance_paid: false }, installments: [] as never[], invoices: [] as never[] } }; } }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "update", "eq"]) q[m] = (...args: unknown[]) => { state.calls.push({ method: m, args }); return q; };
  q.single = () => Promise.resolve(state.fail ? { data: null, error: { message: "Salvataggio rifiutato" } } : { data: { id: "order" }, error: null }); return q;
}, functions: { invoke: (...args: unknown[]) => { state.sync(...args); return Promise.resolve({ data: null, error: null }); } } } }));
const order: CalendarOrder = { id: "order", order_code: "ORD-1", description: "Casa", expected_date: "2026-10-14", work_start_date: "2026-10-14", work_end_date: "2026-10-15", warehouse_arrival_date: null, created_at: "", customer_id: "customer", current_status_id: null, customer: { first_name: "Anna", last_name: "Rossi" }, status: null, order_employees: [{ employee: { id: "worker", first_name: "Mario", last_name: "Bianchi" } }], order_external_teams: [] };
function page(extra: Partial<CalendarOrder> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const close = vi.fn();
  render(<MemoryRouter><QueryClientProvider client={client}><EditOrderDatesDialog order={{ ...order, ...extra }} open onOpenChange={close} /></QueryClientProvider></MemoryRouter>); return close;
}
beforeEach(() => { state.readonly = false; state.edit = true; state.payments = false; state.fail = false; state.calls = []; state.queries = []; state.success.mockClear(); state.error.mockClear(); state.sync.mockClear(); });
afterEach(cleanup);
describe("Date commessa: accesso e risorse canoniche", () => {
  it("i pagamenti non vengono letti né mostrati dalla cache senza permesso economico", async () => {
    page(); expect(state.queries[0].enabled).toBe(false); expect(screen.queryByRole("heading", { name: "Pagamenti" })).toBeNull();
    await expect(state.queries[0].queryFn()).rejects.toThrow("Non hai accesso"); expect(state.calls).toEqual([]);
  });
  it.each(["readonly", "edit"] as const)("%s blocca la modifica ma conserva i collegamenti alla commessa", condition => {
    if (condition === "readonly") state.readonly = true; else state.edit = false;
    page(); expect(screen.queryByRole("button", { name: "Salva date" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Chiudi" }).length).toBeGreaterThan(0);
    expect((screen.getByRole("dialog").querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
  });
  it("gestisce le risorse attraverso le lavorazioni, senza cancellare tutte le assegnazioni di una persona", () => {
    page(); expect(screen.getByText("Mario Bianchi")).toBeTruthy();
    expect(screen.queryByText("Aggiungi operaio...")).toBeNull();
    expect(screen.getByRole("link", { name: "Apri lavorazioni e risorse" }).getAttribute("href")).toContain("/azienda/ordini/order?tab=cantiere");
  });
  it("conferma la riga aggiornata nella propria azienda prima di chiudere", async () => {
    const close = page(); fireEvent.click(screen.getByRole("button", { name: "Salva date" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Date aggiornate"));
    expect(state.calls).toContainEqual({ method: "eq", args: ["company_id", "company"] });
    expect(state.calls).toContainEqual({ method: "select", args: ["id"] }); expect(close).toHaveBeenCalledWith(false);
  });
  it("un errore conserva il modulo e non avvia la sincronizzazione", async () => {
    state.fail = true; const close = page(); fireEvent.click(screen.getByRole("button", { name: "Salva date" }));
    await waitFor(() => expect(state.error).toHaveBeenCalled()); expect(state.success).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled(); expect(state.sync).not.toHaveBeenCalled();
  });
  it("intervalli invertiti non sono salvati", () => {
    page({ work_start_date: "2026-10-20", work_end_date: "2026-10-14" }); fireEvent.click(screen.getByRole("button", { name: "Salva date" }));
    expect(state.error).toHaveBeenCalled(); expect(state.calls).toEqual([]);
  });
});
