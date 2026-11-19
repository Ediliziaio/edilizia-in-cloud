import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  invalidate: vi.fn(), remove: vi.fn(), owner: {} as object,
  channels: [] as Array<{ change: () => void; status: (s: string) => void; filter: string }>,
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => state.owner }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  channel: () => {
    const handlers = { change: () => {}, status: (_: string) => {}, filter: "" };
    state.channels.push(handlers);
    const channel = {
      on: (_: string, cfg: { filter: string }, fn: () => void) => {
        handlers.change = fn; handlers.filter = cfg.filter; return channel;
      },
      subscribe: (fn: (s: string) => void) => { handlers.status = fn; return channel; },
    };
    return channel;
  },
  removeChannel: (channel: unknown) => state.remove(channel),
} }));
import { useInternalChatUpdates } from "@/hooks/useInternalChatUpdates";

beforeEach(() => {
  vi.useFakeTimers(); state.channels = [];
  state.invalidate.mockReset(); state.remove.mockReset();
  state.owner = { invalidateQueries: state.invalidate };
});
afterEach(async () => { cleanup(); await Promise.resolve(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Arrivo di una chat nuova", () => {
  it("ascolta il primo messaggio anche senza conversazioni e rilegge le membership", () => {
    renderHook(() => useInternalChatUpdates("azienda", "utente"));
    expect(state.channels[0].filter).toBe("company_id=eq.azienda");
    act(() => state.channels[0].change());
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["internal-chat-my-memberships", "azienda", "utente"] });
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["internal-chat-sidebar-state", "azienda", "utente"] });
  });
  it("recupera un gruppo ancora vuoto anche quando Realtime non invia eventi", () => {
    renderHook(() => useInternalChatUpdates("azienda", "utente"));
    act(() => vi.advanceTimersByTime(15_000));
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["internal-chat-my-memberships", "azienda", "utente"] });
  });
  it("recupera dopo riconnessione senza controlli in background", () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    renderHook(() => useInternalChatUpdates("azienda", "utente"));
    act(() => vi.advanceTimersByTime(30_000));
    expect(state.invalidate).not.toHaveBeenCalled();
    act(() => state.channels[0].status("SUBSCRIBED"));
    expect(state.invalidate).toHaveBeenCalled();
  });
  it("isola il cambio azienda e rimuove timer e canali al termine", async () => {
    const hook = renderHook(({ company }) => useInternalChatUpdates(company, "utente"), { initialProps: { company: "prima" } });
    hook.rerender({ company: "seconda" });
    await act(async () => {});
    expect(state.remove).toHaveBeenCalledTimes(1);
    state.invalidate.mockClear();
    act(() => vi.advanceTimersByTime(15_000));
    expect(state.invalidate.mock.calls.every(([args]) => args.queryKey[1] === "seconda")).toBe(true);
    hook.unmount(); await act(async () => {}); state.invalidate.mockClear();
    act(() => vi.advanceTimersByTime(30_000));
    expect(state.invalidate).not.toHaveBeenCalled();
  });
  it("non duplica la subscription in StrictMode e non parte senza account", async () => {
    const hook = renderHook(() => useInternalChatUpdates("azienda", "utente"), { wrapper: StrictMode });
    await act(async () => {}); expect(state.channels).toHaveLength(1);
    hook.unmount(); await act(async () => {});
    renderHook(() => useInternalChatUpdates(null, undefined));
    expect(state.channels).toHaveLength(1);
  });
});
