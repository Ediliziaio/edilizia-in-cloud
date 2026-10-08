import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FinanceAutomationSettings } from "@/components/settings/FinanceAutomationSettings";

const state = vi.hoisted(() => ({
  readError: false, writeError: false, canEdit: true,
  prefs: { id: "prefs-1", company_id: "company-1", alert_enabled: true, default_alert_days: 7, alert_email: null as string | null, alert_on_overdue: true, alert_on_upcoming: true, auto_generate_from_invoices: true, auto_reconcile_payments: true },
  updates: [] as Record<string, unknown>[], filters: [] as [string, unknown][],
  toastError: vi.fn(), toastSuccess: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: state.canEdit, canViewCosts: true, solaLettura: !state.canEdit }) }));
vi.mock("sonner", () => ({ toast: { error: state.toastError, success: state.toastSuccess } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    let write = false;
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => { if (write) state.filters.push([key, value]); return builder; },
      maybeSingle: async () => ({ data: state.readError ? null : state.prefs, error: state.readError ? { message: "read failed" } : null }),
      update: (payload: Record<string, unknown>) => { write = true; state.updates.push(payload); return builder; },
      single: async () => {
        if (!state.writeError) Object.assign(state.prefs, state.updates.at(-1));
        return { data: state.writeError ? null : { id: state.prefs.id }, error: state.writeError ? { message: "update denied" } : null };
      },
    };
    return builder;
  },
} }));

function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><FinanceAutomationSettings /></QueryClientProvider>);
  return client;
}
beforeEach(() => {
  state.readError = false; state.writeError = false; state.canEdit = true;
  state.prefs.default_alert_days = 7; state.prefs.alert_email = null;
  state.updates.length = 0; state.filters.length = 0;
  state.toastError.mockClear(); state.toastSuccess.mockClear();
});
afterEach(cleanup);

describe("Automazioni finanza: salvataggi controllati", () => {
  it("non mostra valori salvabili se la lettura fallisce", async () => {
    state.readError = true;
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent("Nessuna modifica verrà salvata");
    expect(screen.queryByRole("button", { name: "Salva impostazioni" })).toBeNull();
    expect(state.updates).toHaveLength(0);
  });
  it("non salva automaticamente e invia solo il campo cambiato nella propria azienda", async () => {
    open();
    const days = await screen.findByLabelText("Giorni di preavviso");
    expect(screen.getByLabelText("Email per avvisi")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Salva impostazioni" })).toBeDisabled();
    fireEvent.change(days, { target: { value: "12" } });
    expect(state.updates).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledOnce());
    expect(state.updates[0]).toEqual({ default_alert_days: 12, updated_at: expect.any(String) });
    expect(state.filters).toEqual([["id", "prefs-1"], ["company_id", "company-1"]]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Salva impostazioni" })).toBeDisabled());
  });
  it("mantiene la bozza se il salvataggio viene rifiutato", async () => {
    state.writeError = true;
    open();
    fireEvent.change(await screen.findByLabelText("Giorni di preavviso"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));
    await waitFor(() => expect(state.toastError).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Giorni di preavviso")).toHaveValue(15);
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
    expect(state.toastSuccess).not.toHaveBeenCalled();
  });
  it.each([0, 31, 1.5])("rifiuta un preavviso non valido: %s", async value => {
    open();
    fireEvent.change(await screen.findByLabelText("Giorni di preavviso"), { target: { value: String(value) } });
    fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));
    await waitFor(() => expect(state.toastError).toHaveBeenCalledOnce());
    expect(state.updates).toHaveLength(0);
  });
  it("disabilita davvero i controlli in sola lettura", async () => {
    state.canEdit = false;
    open();
    expect(await screen.findByLabelText("Giorni di preavviso")).toBeDisabled();
    expect(screen.getByLabelText("Email per avvisi")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salva impostazioni" })).toBeDisabled();
  });
  it("un refetch non cancella i valori ancora da salvare", async () => {
    const client = open();
    fireEvent.change(await screen.findByLabelText("Giorni di preavviso"), { target: { value: "14" } });
    state.prefs.default_alert_days = 9;
    await client.refetchQueries();
    expect(screen.getByLabelText("Giorni di preavviso")).toHaveValue(14);
    expect(state.updates).toHaveLength(0);
  });
});
