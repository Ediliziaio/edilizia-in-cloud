import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGenerazioneProtetta } from "@/components/shared/livePreview/useGenerazioneProtetta";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe("Preview generation cleanup and truthful status", () => {
  it("does not revoke a source returned again by a static preview on refresh", async () => {
    vi.useFakeTimers();
    const discard = vi.fn();
    const {result,unmount} = renderHook(() => useGenerazioneProtetta(async () => "blob:same", "a", {debounceMs: 1,onScarta:discard}));
    await act(() => vi.advanceTimersByTimeAsync(5));
    act(() => result.current.rigenera());
    await act(() => vi.advanceTimersByTimeAsync(5));
    expect(discard).not.toHaveBeenCalled();
    expect(result.current.aggiornato).toBe(true);
    unmount();
    expect(discard).toHaveBeenCalledOnce();
  });
  it("releases a renderer result arriving after its timeout", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let finish!: (value: string) => void;
    const discard = vi.fn();
    const {result} = renderHook(() => useGenerazioneProtetta(() => new Promise<string>(resolve => { finish = resolve; }), "a", {debounceMs: 1, timeoutMs: 10, onScarta: discard}));
    await act(() => vi.advanceTimersByTimeAsync(20));
    expect(result.current.errore).toBeTruthy();
    expect(result.current.aggiornato).toBe(false);
    await act(async () => { finish("blob:late"); });
    expect(discard).toHaveBeenCalledWith("blob:late");
    expect(result.current.risultato).toBeNull();
  });
  it("never marks a failed refresh as updated just because an older PDF exists", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const generate = vi.fn().mockResolvedValueOnce("blob:first").mockRejectedValue(new Error("offline"));
    const {result} = renderHook(() => useGenerazioneProtetta(generate, "a", {debounceMs: 1}));
    await act(() => vi.advanceTimersByTimeAsync(5));
    expect(result.current.aggiornato).toBe(true);
    act(() => result.current.rigenera());
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current.risultato).toBe("blob:first");
    expect(result.current.errore).toBe("offline");
    expect(result.current.aggiornato).toBe(false);
  });
});
