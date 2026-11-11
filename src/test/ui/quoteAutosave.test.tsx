import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBoundedAutosave, useDraftExitFlush } from "@/hooks/useBoundedAutosave";
import { readQuoteDraft, serializeQuoteDraft } from "@/lib/preventivi/quoteDraft";

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("salvataggio automatico del preventivo classico", () => {
  it("salva l'ultimo input entro 15 secondi anche scrivendo continuamente", () => {
    const save = vi.fn();
    const { rerender } = renderHook(({ text }) => useBoundedAutosave(text, true, () => save(text), "azienda:preventivo"), { initialProps: { text: "inizio" } });
    for (let i = 1; i <= 14; i++) {
      act(() => vi.advanceTimersByTime(1_000));
      rerender({ text: `nota ${i}` });
    }
    expect(save).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1_000));
    expect(save).toHaveBeenCalledExactlyOnceWith("nota 14");
  });

  it("raggruppa le modifiche e non invia dati di una pagina abbandonata", () => {
    const save = vi.fn();
    const { rerender, unmount } = renderHook(({ text, enabled, scope }) => useBoundedAutosave(text, enabled, () => save(scope, text), scope), {
      initialProps: { text: "uno", enabled: true, scope: "A" },
    });
    act(() => vi.advanceTimersByTime(2_000));
    rerender({ text: "due", enabled: true, scope: "A" });
    act(() => vi.advanceTimersByTime(3_000));
    expect(save).toHaveBeenCalledExactlyOnceWith("A", "due");
    rerender({ text: "tre", enabled: true, scope: "B" });
    act(() => vi.advanceTimersByTime(2_000));
    rerender({ text: "tre", enabled: false, scope: "B" });
    act(() => vi.advanceTimersByTime(60_000));
    expect(save).toHaveBeenCalledTimes(1);
    rerender({ text: "quattro", enabled: true, scope: "B" });
    unmount();
    act(() => vi.advanceTimersByTime(60_000));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("conserva l'ultima nota e le righe uscendo nella SPA prima dei 500 ms", () => {
    const key = "quote-draft-A-preventivo1";
    const { rerender, unmount } = renderHook(({ notes }) => useDraftExitFlush(() => {
      localStorage.setItem(key, serializeQuoteDraft({ notes, clientName: "Cliente", selectedMaterials: ["scheda-tecnica"], paymentMethod: "bonifico" }));
    }), { initialProps: { notes: "nota precedente" } });
    rerender({ notes: "ultima nota appena scritta" });
    unmount();
    expect(readQuoteDraft(localStorage.getItem(key)!)).toMatchObject({ notes: "ultima nota appena scritta", selectedMaterials: ["scheda-tecnica"], paymentMethod: "bonifico" });
  });

  it("protegge la bozza alla chiusura e non la confonde con un'altra azienda", () => {
    renderHook(() => useDraftExitFlush(() => localStorage.setItem("quote-draft-A-id", serializeQuoteDraft({ notes: "Da recuperare" }))));
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(readQuoteDraft(localStorage.getItem("quote-draft-A-id")!)).toMatchObject({ notes: "Da recuperare" });
    expect(localStorage.getItem("quote-draft-B-id")).toBeNull();
  });
});
