import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCampoDayTime } from "@/hooks/campo/useCampoDayTime";
import type { CampoPunch } from "@/lib/campo/timeSummary";

const state = vi.hoisted(() => ({ data: [] as CampoPunch[], dataUpdatedAt: 0, options: {} as Record<string, unknown> }));
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: Record<string, unknown>) => {
  state.options = options; return { data: state.data, dataUpdatedAt: state.dataUpdatedAt };
} }));
vi.mock("@/lib/campo/loadTimePunches", () => ({ loadCampoDayPunches: vi.fn() }));
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 24, 8)); state.data = []; state.dataUpdatedAt = 0; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Tempo condiviso: refresh, identità e cambio giorno", () => {
  it("riconosce subito la timbratura riletta, anche prima del tick di 30 secondi", () => {
    const { result, rerender } = renderHook(() => useCampoDayTime("worker", "company"));
    expect(result.current.summary.state).toBe("out");
    const savedAt = new Date(2026, 8, 24, 8, 0, 5);
    state.data = [{ tipo: "entrata", timestamp_evento: savedAt.toISOString(), order_id: "A" }];
    state.dataUpdatedAt = savedAt.getTime() + 100;
    rerender();
    expect(result.current.summary.state).toBe("working");
    expect(result.current.todayPunches).toHaveLength(1);
  });
  it("separa cache per azienda, utente e data", () => {
    renderHook(() => useCampoDayTime("worker", "company"));
    expect(state.options.queryKey).toEqual(["campo-time-day", "company", "worker", "2026-09-24", false]);
    expect(state.options.enabled).toBe(true);
    expect(state.options.refetchIntervalInBackground).toBe(false);
  });
  it("non interroga il backend senza identità completa", () => {
    renderHook(() => useCampoDayTime("worker", null));
    expect(state.options.enabled).toBe(false);
  });
  it("cambia la chiave della giornata dopo mezzanotte", () => {
    vi.setSystemTime(new Date("2026-09-24T23:59:50+02:00"));
    const { result } = renderHook(() => useCampoDayTime("worker", "company"));
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(result.current.day).toBe("2026-09-25");
    expect(state.options.queryKey).toEqual(["campo-time-day", "company", "worker", "2026-09-25", false]);
  });
});
