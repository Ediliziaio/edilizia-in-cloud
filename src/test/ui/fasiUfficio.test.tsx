import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FasiUfficio, inRitardo } from "@/components/orders/FasiUfficio";

const state = vi.hoisted(() => ({ righe: [] as Record<string, unknown>[], update: vi.fn(), success: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c" }, user: { id: "u" }, role: "company_admin" }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditOrders: true, canEditSettingsOrders: false }) }));
vi.mock("@/components/orders/PlaybookEditorDialog", () => ({ PlaybookEditorDialog: (): null => null }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async (): Promise<{ data: unknown[]; error: unknown }> => ({ data: [], error: null }),
  from: (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order"]) q[m] = () => q;
    q.update = (patch: unknown) => { state.update(patch); return { eq: () => ({ eq: async () => ({ error: null as unknown }), then: (y: (r: unknown) => unknown) => Promise.resolve({ error: null as unknown }).then(y) }) }; };
    q.then = (y: (r: unknown) => unknown) => Promise.resolve(
      table === "tasks" ? { data: state.righe, error: null as unknown }
      : table === "profiles" ? { data: [{ id: "p1", first_name: "Anna", last_name: "Rossi" }], error: null as unknown }
      : table === "order_work_phases" ? { data: [{ id: "f1", name: "Rilievo misure" }], error: null as unknown }
      : { data: [], error: null as unknown }).then(y);
    return q;
  },
} }));

const nessuno = null as string | null;
const fase = (over: Record<string, unknown>) => ({ id: "t", title: "Fase", status: "da_fare", due_date: nessuno, completed_at: nessuno, assigned_to: "p1", ufficio_id: nessuno, sort_order: 1, bloccata_da_task_id: nessuno, attende_fase_id: nessuno, ...over });
const mostra = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FasiUfficio orderId="o" /></QueryClientProvider>);

beforeEach(() => { vi.clearAllMocks(); state.righe = []; });
afterEach(cleanup);

describe("Fasi dell'ufficio", () => {
  it("in ordine, con chi le fa, cosa aspettano e quante sono fatte", async () => {
    state.righe = [
      fase({ id: "a", title: "Contratto firmato", status: "completata", completed_at: "2026-10-10T10:00:00Z", sort_order: 1 }),
      fase({ id: "b", title: "Ordine serramenti", status: "in_attesa", attende_fase_id: "f1", sort_order: 2 }),
    ];
    mostra();
    expect(await screen.findByText("1 di 2 fatte.")).toBeInTheDocument();
    expect(screen.getByText(/aspetta il cantiere: «Rilievo misure»/)).toBeInTheDocument();
    expect(screen.getAllByText(/Anna Rossi/).length).toBeGreaterThan(0);
  });
  it("«Fatta» chiude la fase", async () => {
    state.righe = [fase({ id: "a", title: "Pratica ENEA" })];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Fatta" }));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ status: "completata" })));
  });
  it("in ritardo solo se non fatta e scaduta", () => {
    expect(inRitardo({ status: "da_fare", due_date: "2026-10-01" }, "2026-10-18")).toBe(true);
    expect(inRitardo({ status: "completata", due_date: "2026-10-01" }, "2026-10-18")).toBe(false);
    expect(inRitardo({ status: "da_fare", due_date: null }, "2026-10-18")).toBe(false);
  });
});
