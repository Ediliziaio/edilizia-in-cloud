import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflittoModifica } from "@/lib/concorrenza";
import { erroreSalvataggioTemporaneo, useQuoteAutosaveRetry } from "@/hooks/useQuoteAutosaveRetry";

describe("Ripresa del salvataggio dei preventivi", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("al ritorno online salva l'ultimo input una volta sola", () => {
    vi.useFakeTimers();
    const rete = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const salva = vi.fn();
    const { rerender, unmount } = renderHook(({ titolo }) =>
      useQuoteAutosaveRetry(0, true, () => salva(titolo), "azienda:preventivo"),
    { initialProps: { titolo: "Prima modifica" } });
    act(() => vi.advanceTimersByTime(20_000));
    expect(salva).not.toHaveBeenCalled();

    rerender({ titolo: "Ultima modifica" });
    rete.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
      vi.advanceTimersByTime(8_000);
    });
    expect(salva).toHaveBeenCalledOnce();
    expect(salva).toHaveBeenCalledWith("Ultima modifica");
    unmount();
  });

  it("ferma i tentativi su conflitto, permesso negato e limite superato", () => {
    expect(erroreSalvataggioTemporaneo(new ConflittoModifica("preventivo"))).toBe(false);
    expect(erroreSalvataggioTemporaneo({ code: "42501", message: "Timeout policy" })).toBe(false);
    expect(erroreSalvataggioTemporaneo({ code: "", message: "TypeError: Failed to fetch" })).toBe(true);

    vi.useFakeTimers();
    const salva = vi.fn();
    const { unmount } = renderHook(() => useQuoteAutosaveRetry(3, true, salva, "azienda:preventivo"));
    act(() => {
      window.dispatchEvent(new Event("online"));
      vi.advanceTimersByTime(20_000);
    });
    expect(salva).not.toHaveBeenCalled();
    unmount();
  });
});
