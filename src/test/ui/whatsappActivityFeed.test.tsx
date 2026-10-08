import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WhatsAppActivityFeed } from "@/components/whatsapp/WhatsAppActivityFeed";

const mocks = vi.hoisted(() => ({ from: vi.fn(), channel: vi.fn(), remove: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo-fixture" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, channel: mocks.channel, removeChannel: mocks.remove } }));
let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
function query(status = "processed", error: unknown = null) {
  const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() };
  for (const fn of [q.select, q.eq, q.order]) fn.mockReturnValue(q);
  q.limit.mockResolvedValue({ data: error ? null : [{ id: "fixture", ai_intent: "domanda", processing_status: status, created_at: "2026-10-07T10:00:00Z", content_text: "Messaggio fittizio", employees: { first_name: "Mario", last_name: "Demo" } }], error });
  mocks.from.mockReturnValue(q); return q;
}
beforeEach(() => {
  vi.clearAllMocks(); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const channel = { on: vi.fn(), subscribe: vi.fn() }; channel.on.mockReturnValue(channel); channel.subscribe.mockReturnValue(channel); mocks.channel.mockReturnValue(channel);
});
afterEach(() => { cleanup(); client.clear(); });

describe("WhatsApp activity: truthful feedback without resending", () => {
  it.each([
    ["failed_max_retries", "Elaborazione interrotta"], ["failed", "Da verificare"],
    ["requires_confirmation", "Attende conferma"], ["received", "In attesa"],
    ["unexpected", "Stato da verificare"], ["processed", "Elaborato"],
  ])("shows %s without an endless spinner", async (status, label) => {
    const q = query(status); const ui = render(<WhatsAppActivityFeed cantiereId="site-fixture" />, { wrapper });
    expect(await screen.findByRole("img", { name: label })).toBeVisible();
    expect(ui.container.querySelector(".animate-spin")).toBeNull();
    expect(q.eq).toHaveBeenCalledWith("company_id", "demo-fixture");
    expect(q.eq).toHaveBeenCalledWith("cantiere_id", "site-fixture");
  });
  it("animates only actual processing", async () => {
    query("processing"); const ui = render(<WhatsAppActivityFeed cantiereId="site-fixture" />, { wrapper });
    await screen.findByRole("img", { name: "In elaborazione" }); expect(ui.container.querySelector(".animate-spin")).not.toBeNull();
  });
  it("does not hide query failures and retries only the read", async () => {
    const q = query("", new Error("offline")); render(<WhatsAppActivityFeed cantiereId="site-fixture" />, { wrapper });
    expect(await screen.findByRole("alert")).toHaveTextContent("I messaggi non vengono reinviati");
    q.limit.mockResolvedValue({ data: [], error: null });
    fireEvent.click(screen.getByRole("button", { name: "Ricarica attività" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(q.limit).toHaveBeenCalledTimes(2);
  });
});
