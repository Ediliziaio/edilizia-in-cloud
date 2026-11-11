import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnomalyDetailDialog } from "@/components/orders/AnomalyDetailDialog";
import type { AnomalyWorkflowRecord } from "@/lib/orders/anomalyWorkflow";
const state = vi.hoisted(() => ({ stale: false, patches: [] as Array<Record<string, unknown>>, filters: [] as Array<[string, unknown]> }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user1" }, effectiveCompany: { id: "company1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const chain = { eq: vi.fn(), is: vi.fn(), select: vi.fn(), single: vi.fn(async () => ({ data: state.stale ? null : { id: "a1" }, error: state.stale ? { message: "conflitto" } : null })), order: vi.fn(), range: vi.fn(async () => ({ data: [{ id: "o1", order_code: "ORD-1", description: "Bagno" }], error: null as null })) };
  chain.eq.mockImplementation((key, value) => { state.filters.push([key, value]); return chain; }); chain.is.mockReturnValue(chain); chain.select.mockReturnValue(chain); chain.order.mockReturnValue(chain);
  return { ...chain, update: (patch: Record<string, unknown>) => { state.patches.push(patch); return chain; }, insert: async (patch: Record<string, unknown>) => { state.patches.push(patch); return { error: null as null }; } };
} } }));
const record: AnomalyWorkflowRecord = { id: "a1", order_id: "o1", amount: 100, description: "Danno materiale", error_date: "2026-01-01", error_type: "merce", error_category: "danno_materiale", updated_at: "2026-01-01T00:00:00Z" };
const close = vi.fn();
function mount(canEdit = true, create = false) { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<QueryClientProvider client={client}><MemoryRouter><AnomalyDetailDialog companyId="company1" record={create ? null : record} actors={[{ id: "p1", name: "Mario Rossi", kind: "employee" }]} canEdit={canEdit} onClose={close} /></MemoryRouter></QueryClientProvider>); }
beforeEach(() => { state.stale = false; state.patches = []; state.filters = []; close.mockClear(); });
afterEach(cleanup);
describe("Popup operativo anomalie", () => {
  it("non salva un'assegnazione senza responsabile", async () => {
    mount(); fireEvent.change(screen.getByLabelText("Stato"), { target: { value: "assegnata" } }); fireEvent.click(screen.getByRole("button", { name: "Salva anomalia" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("responsabile"); expect(state.patches).toHaveLength(0);
  });
  it("salva il responsabile scelto, la scadenza e l'azione con protezione delle modifiche concorrenti", async () => {
    mount(); fireEvent.change(screen.getByLabelText("Soggetti collegati alla commessa"), { target: { value: "employee:p1" } });
    fireEvent.change(screen.getByLabelText("Azione correttiva"), { target: { value: "Sostituire materiale" } });
    fireEvent.change(screen.getByLabelText("Scadenza intervento"), { target: { value: "2026-12-01" } });
    fireEvent.change(screen.getByLabelText("Stato"), { target: { value: "assegnata" } }); fireEvent.click(screen.getByRole("button", { name: "Salva anomalia" }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(state.patches[0]).toMatchObject({ confirmed_responsibility_id: "p1", confirmed_responsibility_name: "Mario Rossi", corrective_due_date: "2026-12-01", review_status: "assegnata" });
    expect(state.filters).toEqual(expect.arrayContaining([["company_id", "company1"], ["id", "a1"], ["updated_at", record.updated_at], ["description", record.description]]));
  });
  it("mantiene aperto il popup in caso di conflitto", async () => {
    state.stale = true; mount(); fireEvent.click(screen.getByRole("button", { name: "Salva anomalia" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("altro utente"); expect(close).not.toHaveBeenCalled();
  });
  it("mantiene consultabile il dettaglio senza permettere salvataggi in sola lettura", () => {
    mount(false); expect(screen.queryByRole("button", { name: "Salva anomalia" })).not.toBeInTheDocument(); expect(screen.getByLabelText("Stato")).toBeDisabled();
  });
  it("registra una nuova anomalia nella commessa scelta", async () => {
    mount(true, true); await screen.findByRole("option", { name: "ORD-1" });
    fireEvent.change(screen.getByLabelText("Commessa"), { target: { value: "o1" } }); fireEvent.change(screen.getByLabelText("Problema e contesto"), { target: { value: "Misura errata" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva anomalia" })); await waitFor(() => expect(close).toHaveBeenCalled());
    expect(state.patches[0]).toMatchObject({ company_id: "company1", order_id: "o1", created_by: "user1", review_status: "aperta" });
  });
});
