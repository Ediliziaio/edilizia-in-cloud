import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stampaPreventivoNativo } from "@/lib/fotovoltaico/htmlToPdf";
const { preparaMappa } = vi.hoisted(() => ({ preparaMappa: vi.fn() }));
vi.mock("@/lib/fotovoltaico/googleMapsDocumento", () => ({ preparaMappeDocumentoFv: preparaMappa }));
beforeEach(() => { preparaMappa.mockReset(); preparaMappa.mockResolvedValue(() => {}); });

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); document.body.innerHTML = ""; });

function browser(ready: Promise<unknown>) {
  vi.useFakeTimers();
  const frame = document.createElement("iframe");
  const print = vi.fn();
  const listeners = new Map<string, () => void>();
  Object.defineProperty(frame, "contentDocument", { value: {
    open: vi.fn(), write: vi.fn(), close: vi.fn(), title: "", readyState: "complete",
    body: { offsetHeight: 1 }, images: [], fonts: { ready },
  } });
  Object.defineProperty(frame, "contentWindow", { value: {
    focus: vi.fn(), print, addEventListener: (event: string, fn: () => void) => listeners.set(event, fn),
  } });
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => tag === "iframe" ? frame : create(tag, options));
  return { frame, print, listeners };
}

describe("Stampa FV originale: nessuna attesa infinita e nessuna stampa prematura", () => {
  it("aspetta anche la foto Google prima di aprire il dialogo PDF", async () => {
    let done!: () => void;
    preparaMappa.mockReturnValue(new Promise<void>(resolve => { done = resolve; }));
    const b = browser(Promise.resolve());
    const pending = stampaPreventivoNativo("<html>Foto Google</html>", "Preventivo QA");
    await vi.advanceTimersByTimeAsync(1000);
    expect(b.print).not.toHaveBeenCalled();
    preparaMappa.mockClear(); done();
    await vi.advanceTimersByTimeAsync(200); await pending;
    expect(b.print).toHaveBeenCalledTimes(1);
  });
  it("non stampa una mappa vuota se il caricamento Google fallisce", async () => {
    preparaMappa.mockRejectedValue(new Error("Google non ha autorizzato la mappa"));
    const b = browser(Promise.resolve());
    await expect(stampaPreventivoNativo("<html>Foto Google</html>", "Preventivo QA")).rejects.toThrow("non ha autorizzato");
    expect(b.print).not.toHaveBeenCalled();
    expect(document.body.contains(b.frame)).toBe(false);
  });
  it("aspetta i caratteri e conserva il frame fino alla chiusura della stampa", async () => {
    let done!: () => void;
    const b = browser(new Promise<void>(resolve => { done = resolve; }));
    const pending = stampaPreventivoNativo("<html>Cliente QA</html>", "Preventivo QA");
    await vi.advanceTimersByTimeAsync(200);
    expect(b.print).not.toHaveBeenCalled();
    done();
    await vi.advanceTimersByTimeAsync(200);
    await pending;
    expect(b.print).toHaveBeenCalledTimes(1);
    expect(document.body.contains(b.frame)).toBe(true);
    b.listeners.get("afterprint")!();
    expect(document.body.contains(b.frame)).toBe(false);
  });
  it("se i caratteri non arrivano, termina con errore e rimuove il frame senza stampare", async () => {
    const b = browser(new Promise(() => undefined));
    const pending = stampaPreventivoNativo("<html>Cliente QA</html>", "Preventivo QA");
    const assertion = expect(pending).rejects.toThrow("non si caricano");
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
    expect(b.print).not.toHaveBeenCalled();
    expect(document.body.contains(b.frame)).toBe(false);
  });
});
