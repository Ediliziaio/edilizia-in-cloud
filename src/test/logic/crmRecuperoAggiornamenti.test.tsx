import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveRefresh } from "@/lib/realtime/createLiveRefresh";
import { queryKeys } from "@/lib/queryKeys";

const live = vi.hoisted(() => ({
  companyId: "az1",
  events: [] as { table: string; event: string; filter?: string; cb: () => void }[],
  status: null as null | ((s: string) => void),
  remove: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: live.companyId } }) }));
vi.mock("@/integrations/supabase/client", () => {
  const channel = {
    on: (_type: string, filter: { table: string; event: string; filter?: string }, cb: () => void) => {
      live.events.push({ ...filter, cb }); return channel;
    },
    subscribe: (cb: (s: string) => void) => { live.status = cb; return channel; },
  };
  return { supabase: { channel: () => channel, removeChannel: live.remove } };
});
import { useContactsLive, isCompanyContactQuery } from "@/hooks/useContactsLive";

const hidden = (value: boolean) => Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
const online = (value: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  hidden(false); online(true); live.events = []; live.companyId = "az1"; live.remove.mockClear();
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); hidden(false); online(true); });

describe("recupero CRM senza evento Realtime", () => {
  it("al ritorno rilegge anche senza aver ricevuto eventi mentre era nascosta", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const queue = createLiveRefresh({ busy: () => false, refresh });
    hidden(true); document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(180_000);
    expect(refresh).not.toHaveBeenCalled();
    hidden(false); document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledExactlyOnceWith(true);
    queue.dispose();
  });

  it("canale silenzioso o mai connesso: riconcilia ogni due minuti, non ad ogni render", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const queue = createLiveRefresh({ busy: () => false, refresh });
    await vi.advanceTimersByTimeAsync(120_999);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledExactlyOnceWith(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    queue.dispose();
  });

  it("non legge offline; al ripristino accorpa online, focus e ritorno visibile", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const queue = createLiveRefresh({ busy: () => false, refresh });
    online(false); queue.request();
    await vi.advanceTimersByTimeAsync(150_000);
    expect(refresh).not.toHaveBeenCalled();
    online(true); window.dispatchEvent(new Event("online")); window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
    queue.dispose();
  });

  it("aspetta letture/salvataggi in corso; non annulla le query e recupera l'evento", async () => {
    let busy = true;
    const refresh = vi.fn().mockResolvedValue(undefined);
    const queue = createLiveRefresh({ busy: () => busy, refresh });
    queue.request(); await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).not.toHaveBeenCalled();
    busy = false; await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
    queue.dispose();
  });

  it("lo smontaggio ferma timer, eventi e callback tardivi, anche durante una lettura", async () => {
    let resolve!: () => void;
    const refresh = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const queue = createLiveRefresh({ busy: () => false, refresh });
    queue.request(); await vi.advanceTimersByTimeAsync(1000);
    queue.request(); queue.dispose(); resolve(); queue.request(true);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(600_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("contatti azienda e piattaforma", () => {
  it.each(["az1", "piattaforma"])("aggiorna contatti derivati dalle opportunità solo in %s", async (companyId) => {
    live.companyId = companyId;
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue(undefined);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { unmount } = renderHook(() => useContactsLive(), { wrapper });
    expect(live.events.filter((e) => e.event !== "DELETE").every((e) => e.filter === `company_id=eq.${companyId}`)).toBe(true);
    live.events.find((e) => e.event === "UPDATE")!.cb();
    live.events.find((e) => e.event === "INSERT")!.cb();
    await vi.advanceTimersByTimeAsync(1000);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate.mock.calls[0][1]).toEqual({ cancelRefetch: false });
    const predicate = invalidate.mock.calls[0][0]!.predicate!;
    const q = (queryKey: readonly unknown[]) => ({ queryKey }) as any;
    expect(predicate(q(["marketing-contacts", companyId, "Mario", 2]))).toBe(true);
    expect(predicate(q(queryKeys.marketingContacts.reachability(companyId, null)))).toBe(true);
    expect(predicate(q(queryKeys.marketingContacts.list("altra-azienda")))).toBe(false);
    expect(predicate(q(queryKeys.opportunities.list("altra-azienda", "p1")))).toBe(false);
    unmount(); expect(live.remove).toHaveBeenCalledTimes(1);
    live.status?.("SUBSCRIBED"); live.status?.("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(180_000);
    expect(invalidate).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it("le query detail con ID uguale alla società non vengono confuse con liste", () => {
    expect(isCompanyContactQuery({ queryKey: queryKeys.marketingContacts.detail("az1") }, "az1")).toBe(false);
  });
});
