import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WhatsAppOperationsReview } from "@/components/whatsapp/WhatsAppOperationsReview";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
let client: QueryClient;
beforeEach(() => { vi.clearAllMocks(); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.rpc.mockResolvedValue({ data: true, error: null }); });
afterEach(() => { cleanup(); client.clear(); });
function mount() { return render(<QueryClientProvider client={client}><WhatsAppOperationsReview companyId="company-fixture" /></QueryClientProvider>); }
function store() {
  const q = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(), order: vi.fn(), limit: vi.fn() };
  for (const fn of [q.select,q.eq,q.in,q.is,q.order]) fn.mockReturnValue(q);
  q.limit.mockResolvedValue({ data: [{ id: "op", kind: "send", status: "unknown", credit_eur: 0.1,
    created_at: "2026-10-07T10:00:00Z", provider_message_id: null, context: { to: "0000" }, reviewed_at: null }], error: null });
  mocks.from.mockReturnValue(q); return q;
}
describe("Operation review UX", () => {
  it("shows unknown delivery, scopes reads, refreshes without resending and records only a review note", async () => {
    const q = store(); mount();
    expect(await screen.findByText("Esito incerto")).toBeVisible();
    expect(q.eq).toHaveBeenCalledWith("company_id","company-fixture");
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna" }));
    await waitFor(() => expect(q.limit).toHaveBeenCalledTimes(2));
    expect(mocks.rpc.mock.calls.every(([name]) => name === "puo_gestire_whatsapp")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Registra verifica" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Esito della verifica" }), { target: { value: "Verificato in conversazione" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva nota" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("whatsapp_operation_review", { p_company: "company-fixture", p_id: "op", p_note: "Verificato in conversazione" }));
  });
  it("does not call an empty permission-filtered result a successful all-clear", async () => {
    mocks.rpc.mockResolvedValue({ data: false }); mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("non significa".replace("non", "Non"));
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
