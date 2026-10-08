import { useEffect, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { channelMessagesQueryKey, readChannelMessagesItems, upsertChannelMessage, type ChannelMessagesCache } from "@/lib/chat/channelMessagesCache";
import { invokeSilvioWithRecovery, type DeliveredSilvioMessage } from "@/lib/silvio/replyDelivery";

const mock = vi.hoisted(() => ({ invoke: vi.fn(), read: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: mock.invoke },
  from: () => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: () => q,
      abortSignal: () => q, maybeSingle: () => mock.read() };
    return q;
  },
} }));

// Isolated simulation: real delivery and shared cache; fake transport and minimal
// test UI. This is deliberately NOT an authenticated full-page browser E2E test.
function Conversation({ channel }: { channel: string }) {
  const qc = useQueryClient();
  const controller = useRef<AbortController | null>(null);
  const [status, setStatus] = useState("Pronto");
  const { data } = useQuery<ChannelMessagesCache<DeliveredSilvioMessage>>({
    queryKey: channelMessagesQueryKey(channel), enabled: false,
  });
  useEffect(() => () => controller.current?.abort(), []);
  const start = async () => {
    const ac = new AbortController(); controller.current = ac;
    setStatus("Attendo");
    try {
      await invokeSilvioWithRecovery({ functionName: "silvio-chat", body: { channel_id: channel },
        requestMessageId: `question-${channel}`, senderId: "silvio", signal: ac.signal,
        onRecovering: () => setStatus("Recupero"),
        onMessage: message => qc.setQueryData<ChannelMessagesCache<DeliveredSilvioMessage>>(
          channelMessagesQueryKey(channel), prev => upsertChannelMessage(prev, message)),
      });
      setStatus("Consegnato");
    } catch (error) {
      setStatus((error as { name?: string })?.name === "AbortError" ? "Interrotto" : "Da verificare");
    }
  };
  return <section>
    <button onClick={() => void start()} disabled={status === "Attendo" || status === "Recupero"}>Invia</button>
    <button onClick={() => controller.current?.abort()}>Stop</button>
    <output>{status}</output>
    <ul>{readChannelMessagesItems(data).map(m => <li key={m.id}>{m.content}</li>)}</ul>
  </section>;
}
const reply = (channel: string, content = "Costi registrati: 12.500 €. Dati da completare.", streaming = false) => ({
  id: `reply-${channel}`, channel_id: channel, sender_id: "silvio", reply_to_id: `question-${channel}`,
  content, created_at: "2026-10-07T10:00:00Z", message_type: "text", streaming,
});
let client: QueryClient;
const view = (channel = "a") => <QueryClientProvider client={client}><Conversation key={channel} channel={channel} /></QueryClientProvider>;
const advance = async (ms: number) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  // React Query batches observer notifications on a separate timer tick.
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
};
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  mock.invoke.mockResolvedValue({ data: {}, error: null });
  mock.read.mockResolvedValue({ data: null, error: null });
});
afterEach(() => { cleanup(); client.clear(); vi.clearAllTimers(); vi.useRealTimers(); });

describe("Local Silvio delivery simulations (no live services)", () => {
  it("survives temporary read failures and reopening without another generation", async () => {
    mock.invoke.mockResolvedValue({ data: null, error: new Error("transport disconnected") });
    mock.read.mockResolvedValue({ data: null, error: new Error("offline") });
    const ui = render(view()); fireEvent.click(screen.getByText("Invia")); await advance(6_000);
    expect(screen.getByRole("status")).toHaveTextContent("Recupero");
    mock.read.mockResolvedValue({ data: reply("a"), error: null }); await advance(2_000);
    expect(screen.getByRole("status")).toHaveTextContent("Consegnato");
    ui.unmount(); render(view());
    expect(screen.getByText(/Costi registrati/)).toBeVisible();
    expect(mock.invoke).toHaveBeenCalledOnce();
  });
  it("renders a delayed answer without reload after an empty HTTP acknowledgement", async () => {
    render(view()); fireEvent.click(screen.getByText("Invia")); await advance(60_000);
    expect(screen.getByRole("status")).toHaveTextContent("Recupero");
    expect(screen.getByText("Invia")).toBeDisabled();
    mock.read.mockResolvedValue({ data: reply("a"), error: null }); await advance(2_000);
    expect(screen.getByRole("status")).toHaveTextContent("Consegnato");
    expect(screen.getByText(/Costi registrati/)).toBeInTheDocument();
    expect(mock.invoke).toHaveBeenCalledOnce();
  });
  it("replaces stream fragments in place, including duplicate Realtime events", async () => {
    mock.invoke.mockImplementation(() => new Promise(() => {}));
    render(view()); fireEvent.click(screen.getByText("Invia"));
    const partial = reply("a", "Sto confrontando i costi", true);
    mock.read.mockResolvedValue({ data: partial, error: null }); await advance(2_000);
    act(() => client.setQueryData<ChannelMessagesCache<DeliveredSilvioMessage>>(
      channelMessagesQueryKey("a"), prev => upsertChannelMessage(prev, partial)));
    await advance(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    mock.read.mockResolvedValue({ data: reply("a"), error: null }); await advance(2_000);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("Sto confrontando i costi")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Consegnato");
  });
  it("stops waiting without resending and does not render a late read", async () => {
    let deliver!: (value: unknown) => void;
    mock.read.mockImplementation(() => new Promise(resolve => { deliver = resolve; }));
    render(view()); fireEvent.click(screen.getByText("Invia")); await advance(2_000);
    fireEvent.click(screen.getByText("Stop"));
    await act(async () => { deliver({ data: reply("a"), error: null }); });
    expect(screen.getByRole("status")).toHaveTextContent("Interrotto");
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(mock.invoke).toHaveBeenCalledOnce();
  });
  it("does not leak a late answer into a different conversation", async () => {
    let deliver!: (value: unknown) => void;
    mock.read.mockImplementation(() => new Promise(resolve => { deliver = resolve; }));
    const ui = render(view("a")); fireEvent.click(screen.getByText("Invia")); await advance(2_000);
    ui.rerender(view("b"));
    await act(async () => { deliver({ data: reply("a"), error: null }); });
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(client.getQueryData(channelMessagesQueryKey("b"))).toBeUndefined();
    expect(mock.invoke).toHaveBeenCalledOnce();
  });
  it("keeps the timeout honest when no saved response can be found", async () => {
    render(view()); fireEvent.click(screen.getByText("Invia")); await advance(240_000);
    expect(screen.getByRole("status")).toHaveTextContent("Da verificare");
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(mock.invoke).toHaveBeenCalledOnce();
  });
});
