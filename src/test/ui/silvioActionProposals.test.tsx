import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SilvioActionProposals } from "@/components/silvio/SilvioActionProposals";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), from: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, functions: { invoke: mocks.invoke } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" }, user: { id: "actor" } }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error, warning: mocks.warning } }));
const proposal = (id: string, overrides = {}) => ({
  id, action_type: "create_quote_draft", summary: `Proposta ${id}`, payload: {}, status: "pending", risk_level: "yellow",
  expires_at: "2099-01-01", created_at: "2026-10-07", ...overrides,
});
function setup(rows = [proposal("one")], error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn() };
  for (const method of [query.select, query.eq, query.in, query.order, query.abortSignal]) method.mockReturnValue(query);
  query.limit.mockResolvedValue({ data: rows, error });
  mocks.from.mockReturnValue(query);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><SilvioActionProposals /></QueryClientProvider>);
  return query;
}
beforeEach(() => { vi.clearAllMocks(); mocks.invoke.mockResolvedValue({ data: { ok: true, message: "Bozza creata" }, error: null }); });
afterEach(cleanup);
async function confirm() { fireEvent.click(await screen.findByRole("button", { name: "Conferma e applica" })); }

describe("Silvio action acknowledgement UI", () => {
  it("shows success only after explicit acknowledgement", async () => {
    const query = setup(); await confirm();
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Bozza creata"));
    expect(query.eq).toHaveBeenCalledWith("company_id", "demo");
    expect(query.eq).toHaveBeenCalledWith("user_id", "actor");
    expect(query.in).toHaveBeenCalledWith("status", ["pending", "confirmed"]);
  });
  it("preserves a visible warning and blocks retries when executed but not recorded", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: false, needs_review: true, execution_succeeded: true }, error: null });
    setup(); await confirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("Azione eseguita");
    expect(screen.getByRole("button", { name: "Conferma e applica" })).toBeDisabled();
    expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.error).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Conferma e applica" }));
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}, { ok: "true" }])("does not invent success for malformed acknowledgement %j", async data => {
    mocks.invoke.mockResolvedValue({ data, error: null }); setup(); await confirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("Esito da verificare");
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it("network failures never offer a blind retry", async () => {
    mocks.invoke.mockRejectedValue(new Error("network lost")); setup(); await confirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("Non verrà reinviata automaticamente");
    expect(screen.getByRole("button", { name: "Conferma e applica" })).toBeDisabled();
  });
  it("keeps previously claimed actions visible and locked after loading", async () => {
    setup([proposal("claimed", { status: "confirmed" })]);
    expect(await screen.findByText(/Azione già avviata/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conferma e applica" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Annulla" })).toBeDisabled();
  });
  it("stops bulk execution on the first uncertain outcome and reports unstarted actions", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null }).mockResolvedValueOnce({ data: null, error: null });
    setup([proposal("one"), proposal("two"), proposal("three")]);
    fireEvent.click(await screen.findByRole("button", { name: "Approva tutte (3)" }));
    await waitFor(() => expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining("Applicate 1, non applicate 0, da verificare 1. 1 non avviate")));
    expect(mocks.invoke).toHaveBeenCalledTimes(2); expect(mocks.success).not.toHaveBeenCalled();
  });
  it("disables bulk and other rows during an individual execution", async () => {
    mocks.invoke.mockImplementation(() => new Promise(() => {}));
    setup([proposal("one"), proposal("two")]);
    const buttons = await screen.findAllByRole("button", { name: "Conferma e applica" });
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(buttons[1]).toBeDisabled());
    expect(screen.getByRole("button", { name: "Approva tutte (2)" })).toBeDisabled();
  });
  it("does not hide a failed read as an empty queue", async () => {
    setup([], new Error("offline"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossibile verificare lo stato");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("excludes expired proposals from bulk execution", async () => {
    setup([proposal("one"), proposal("two", { expires_at: "2020-01-01" })]);
    expect(await screen.findByText("Proposta scaduta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approva tutte/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Conferma e applica" })[1]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Annulla" })[1]).toBeEnabled();
  });

  it("recovers a lost acknowledgement by reading the saved outcome without invoking again", async () => {
    mocks.invoke.mockRejectedValue(new Error("connection lost"));
    const query = setup(); await confirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("Esito da verificare");
    query.maybeSingle.mockResolvedValue({ data: { id: "one", company_id: "demo", user_id: "actor", status: "applied" }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Verifica esito" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Esito registrato: azione applicata");
    expect(query.eq).toHaveBeenCalledWith("id", "one");
    expect(query.eq).toHaveBeenCalledWith("company_id", "demo");
    expect(query.eq).toHaveBeenCalledWith("user_id", "actor");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Conferma e applica" })).toBeDisabled();
  });

  it.each(["pending", "confirmed", "unknown"])("never re-enables a blind retry for saved status %s", async status => {
    const query = setup([proposal("one", { status: "confirmed" })]);
    query.maybeSingle.mockResolvedValue({ data: { id: "one", company_id: "demo", user_id: "actor", status }, error: null });
    fireEvent.click(await screen.findByRole("button", { name: "Verifica esito" }));
    await waitFor(() => expect(query.maybeSingle).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole("button", { name: "Verifica esito" })).toBeEnabled());
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Conferma e applica" })).toBeDisabled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it.each([null, { id: "one", company_id: "other", user_id: "actor", status: "applied" },
    { id: "one", company_id: "demo", user_id: "other", status: "applied" },
    { id: "another", company_id: "demo", user_id: "actor", status: "applied" },
  ])("does not confirm a missing or foreign saved result: %j", async data => {
    const query = setup([proposal("one", { status: "confirmed" })]);
    query.maybeSingle.mockResolvedValue({ data, error: null });
    fireEvent.click(await screen.findByRole("button", { name: "Verifica esito" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("non trovata o non accessibile"));
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("allows retrying a failed read, never retrying the business operation", async () => {
    const query = setup([proposal("one", { status: "confirmed" })]);
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error("offline") })
      .mockResolvedValueOnce({ data: { id: "one", company_id: "demo", user_id: "actor", status: "failed" }, error: null });
    fireEvent.click(await screen.findByRole("button", { name: "Verifica esito" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Verifica non disponibile"));
    fireEvent.click(screen.getByRole("button", { name: "Verifica esito" }));
    expect(await screen.findByRole("status")).toHaveTextContent("eventuali effetti parziali");
    expect(query.maybeSingle).toHaveBeenCalledTimes(2);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
