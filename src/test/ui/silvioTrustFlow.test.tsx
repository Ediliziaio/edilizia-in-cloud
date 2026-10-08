import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SilvioCompletedActions, SilvioCompletedActionCard } from "@/components/silvio/SilvioCompletedActions";
import { SilvioContextBar } from "@/components/silvio/SilvioContextBar";
import { useSilvioContextLabel } from "@/hooks/useSilvioContextLabel";
import { silvioActionDestination } from "@/lib/silvio/actionDestination";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
const id = "1778464d-0839-4011-a3f8-d267f7c9120f";
const action = { id: "proposal", company_id: "demo", user_id: "actor", status: "applied", action_type: "create_quote_draft", summary: "Bozza per Cliente Demo", applied_result: { quote_id: id } };
const context = { entity_type: "order" as const, entity_id: id, route_label: "Commessa", route_path: `/azienda/ordini/${id}` };
let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
function query(data: unknown, error: unknown = null) {
  const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn() };
  for (const fn of [q.select, q.eq, q.order, q.abortSignal]) fn.mockReturnValue(q);
  q.limit.mockResolvedValue({ data, error }); q.maybeSingle.mockResolvedValue({ data, error });
  mocks.from.mockReturnValue(q); return q;
}
beforeEach(() => { vi.clearAllMocks(); client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); });
afterEach(() => { cleanup(); client.clear(); });

describe("Completed actions: visible, durable and tenant scoped", () => {
  it("loads persisted results after reopening and never offers execution", async () => {
    const q = query([action]);
    const ui = render(<SilvioCompletedActions companyId="demo" userId="actor" />, { wrapper });
    expect(await screen.findByRole("link", { name: "Apri il preventivo creato" })).toHaveAttribute("href", `/azienda/marketing/preventivi/${id}`);
    expect(q.eq).toHaveBeenCalledWith("company_id", "demo"); expect(q.eq).toHaveBeenCalledWith("user_id", "actor"); expect(q.eq).toHaveBeenCalledWith("status", "applied");
    expect(q.limit).toHaveBeenCalledWith(3); expect(screen.queryByRole("button")).toBeNull();
    ui.unmount(); render(<SilvioCompletedActions companyId="demo" userId="actor" />, { wrapper });
    expect(await screen.findByText("Esito registrato")).toBeVisible();
  });
  it("does not expose stale results after changing company or actor", async () => {
    query([action]); const ui = render(<SilvioCompletedActions companyId="demo" userId="actor" />, { wrapper });
    await screen.findByRole("link"); ui.rerender(<SilvioCompletedActions companyId="other" userId="other" />);
    await waitFor(() => expect(screen.queryByRole("link")).toBeNull());
  });
  it("does not read when no authenticated scope is available", () => {
    query([action]); render(<SilvioCompletedActions companyId="demo" />, { wrapper });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not call an unavailable history a failed action", async () => {
    query(null, new Error("offline")); render(<SilvioCompletedActions companyId="demo" userId="actor" />, { wrapper });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Storico delle azioni non disponibile"));
    expect(screen.queryByRole("link")).toBeNull();
  });
  it.each(["pending", "confirmed", "failed", "rejected"])("does not label %s as completed", status => {
    render(<SilvioCompletedActionCard action={{ ...action, status }} />);
    expect(screen.queryByText("Esito registrato")).toBeNull();
  });
  it.each(["https://evil.test", "../../clienti", `${id}/modifica`, "", null])("rejects arbitrary destinations %s", quote_id => {
    expect(silvioActionDestination("create_quote_draft", "applied", { quote_id, url: "https://evil.test" })).toBeNull();
  });
  it("does not confuse a follow-up with creating a quote", () => {
    expect(silvioActionDestination("send_quote_followup", "applied", { quote_id: id })).toBeNull();
    expect(silvioActionDestination("create_quote_draft", "confirmed", { quote_id: id })).toBeNull();
  });
});

function ContextFixture({ companyId = "demo", userId = "actor", open = true }) {
  const label = useSilvioContextLabel(context, companyId, userId, open);
  return <SilvioContextBar context={context} entityLabel={label} companyName={companyId} enabled onToggle={() => {}} />;
}
describe("Readable context without leaking company data", () => {
  it("uses only the selected order's minimal display fields", async () => {
    const q = query({ id, company_id: "demo", order_code: "ORD-12", client_name: "Cliente Demo", description: "Bagno" });
    render(<ContextFixture />, { wrapper });
    expect(await screen.findByText(/ORD-12 · Cliente Demo · Bagno/)).toBeVisible();
    expect(screen.getByText("Azienda: demo")).toBeVisible();
    expect(q.eq).toHaveBeenCalledWith("company_id", "demo"); expect(q.eq).toHaveBeenCalledWith("id", id);
  });
  it.each([null, { id, company_id: "foreign", client_name: "Do not expose" }, { id: "wrong", company_id: "demo", client_name: "Do not expose" }])("falls back safely for absent or mismatched records", async data => {
    const q = query(data); render(<ContextFixture />, { wrapper });
    await waitFor(() => expect(q.maybeSingle).toHaveBeenCalled());
    expect(screen.getByText(`#${id.slice(0, 8)}`)).toBeVisible();
    expect(screen.queryByText(/Do not expose/)).toBeNull();
  });
  it("hides the previous label immediately on company switch", async () => {
    query({ id, company_id: "demo", client_name: "Old company client" });
    const ui = render(<ContextFixture />, { wrapper }); await screen.findByText(/Old company client/);
    ui.rerender(<ContextFixture companyId="other" />);
    expect(screen.queryByText(/Old company client/)).toBeNull();
  });
  it("does not load labels while the panel is closed", () => {
    query(null); render(<ContextFixture open={false} />, { wrapper }); expect(mocks.from).not.toHaveBeenCalled();
  });
});
