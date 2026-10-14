import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFormDraft } from "@/hooks/campo/useFormDraft";
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe("Bozze del campo", () => {
  it("non crea una bozza vuota al primo render", () => {
    const h = renderHook(() => useFormDraft("a", { testo: "" }));
    act(() => vi.advanceTimersByTime(1000)); h.unmount(); expect(localStorage.length).toBe(0);
  });
  it("il debounce salva l'ultimo valore, non quello del render precedente", () => {
    const h = renderHook(() => useFormDraft("a", { testo: "" }));
    act(() => { h.result.current.updateDraft({ testo: "prima" }); h.result.current.updateDraft({ testo: "ultima" }); vi.advanceTimersByTime(500); });
    expect(JSON.parse(localStorage.getItem("campo-draft:a")!).data.testo).toBe("ultima"); expect(h.result.current.hasSavedDraft).toBe(true);
  });
  it("uscendo subito non perde il valore in attesa", () => {
    const h = renderHook(() => useFormDraft("a", { testo: "" }));
    act(() => h.result.current.updateDraft({ testo: "prima di uscire" })); h.unmount();
    expect(JSON.parse(localStorage.getItem("campo-draft:a")!).data.testo).toBe("prima di uscire");
  });
  it("la bozza cancellata dopo l'invio non ricompare all'uscita", () => {
    const h = renderHook(() => useFormDraft("a", { testo: "" }));
    act(() => { h.result.current.updateDraft({ testo: "inviato" }); h.result.current.clearDraft(); }); h.unmount();
    act(() => vi.advanceTimersByTime(1000)); expect(localStorage.getItem("campo-draft:a")).toBeNull();
  });
  it("con spazio locale esaurito non dichiara un salvataggio riuscito", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    const h = renderHook(() => useFormDraft("a", { testo: "" }));
    act(() => { h.result.current.updateDraft({ testo: "in memoria" }); vi.advanceTimersByTime(500); });
    expect(h.result.current.saveError).toContain("non è stata salvata"); expect(h.result.current.hasSavedDraft).toBe(false); expect(h.result.current.draft.testo).toBe("in memoria");
  });
  it("non recupera dati di un altro utente o azienda", () => {
    localStorage.setItem("campo-draft:rapportino:c1:u1:o:g:daily", JSON.stringify({ data: { testo: "privato" }, savedAt: new Date().toISOString() }));
    const h = renderHook(() => useFormDraft("rapportino:c2:u2:o:g:daily", { testo: "" }));
    expect(h.result.current.hasSavedDraft).toBe(false); expect(h.result.current.draft.testo).toBe("");
  });
  it("recupera solo campi noti, senza firme estranee allo schema", () => {
    localStorage.setItem("campo-draft:a", JSON.stringify({ data: { testo: "bozza", firma: "finta" }, savedAt: new Date().toISOString() }));
    const h = renderHook(() => useFormDraft("a", { testo: "" })); expect(h.result.current.draft).toEqual({ testo: "bozza" });
  });
});
