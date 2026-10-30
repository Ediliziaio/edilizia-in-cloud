/**
 * L'anteprima del POS dall'editor: stato «in corso», fase, annullamento. Il disegno vero è provato altrove
 * (posPdfBrowser.test.ts, posPdfBrowserMotore.test.ts): qui si prova solo ciò che l'hook fa fare all'interfaccia.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ apri: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/sicurezza/apriPdfPos", () => ({ apriAnteprimaPos: s.apri }));
import { toast } from "sonner";
import { useAnteprimaPos } from "@/hooks/useAnteprimaPos";
import { ErroreAnnullato } from "@/lib/sicurezza/posPdfBrowser";

beforeEach(() => { s.apri.mockReset(); vi.mocked(toast.error).mockClear(); });
afterEach(cleanup);

describe("Anteprima dall'editor", () => {
  it("mentre prepara è «in corso» con la fase che riceve, e a fine lavoro torna libera", async () => {
    let finisci!: () => void;
    s.apri.mockImplementation((_c: string, _p: string, o: { onFase: (f: string) => void }) => new Promise<void>((ok) => { o.onFase("prepara"); finisci = ok; }));
    const h = renderHook(() => useAnteprimaPos());
    expect(h.result.current.inCorso).toBe(false);
    let fatto!: Promise<void>;
    act(() => { fatto = h.result.current.apri("azienda-a", "pos-1"); });
    await waitFor(() => expect(h.result.current.fase).toBe("prepara"));
    expect(h.result.current.inCorso).toBe(true);
    await act(async () => { finisci(); await fatto; });
    expect(h.result.current.inCorso).toBe(false);
    expect(h.result.current.fase).toBeNull();
  });

  it("annullando passa il segnale a chi disegna e non mostra nessun errore", async () => {
    s.apri.mockImplementation((_c: string, _p: string, o: { segnale: AbortSignal }) => new Promise<void>((_ok, ko) => { o.segnale.addEventListener("abort", () => ko(new ErroreAnnullato())); }));
    const h = renderHook(() => useAnteprimaPos());
    let fatto!: Promise<void>;
    act(() => { fatto = h.result.current.apri("azienda-a", "pos-1"); });
    await waitFor(() => expect(h.result.current.inCorso).toBe(true));
    act(() => { h.result.current.annulla(); });
    await act(async () => { await fatto; });
    expect(toast.error).not.toHaveBeenCalled();
    expect(h.result.current.inCorso).toBe(false);
  });

  it("un errore vero si mostra con il suo messaggio, in italiano; senza messaggio c'è quello di sempre", async () => {
    s.apri.mockRejectedValueOnce(new Error("Il PDF richiede un font aggiuntivo per i caratteri U+6D4B"));
    const h = renderHook(() => useAnteprimaPos());
    await act(async () => { await h.result.current.apri("azienda-a", "pos-1"); });
    expect(toast.error).toHaveBeenLastCalledWith("Il PDF richiede un font aggiuntivo per i caratteri U+6D4B");
    s.apri.mockRejectedValueOnce("boh");
    await act(async () => { await h.result.current.apri("azienda-a", "pos-1"); });
    expect(toast.error).toHaveBeenLastCalledWith("Anteprima non disponibile");
    expect(h.result.current.inCorso).toBe(false);
  });
});
