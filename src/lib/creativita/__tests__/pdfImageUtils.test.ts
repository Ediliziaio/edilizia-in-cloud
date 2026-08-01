/**
 * Test di toDataUrl — la regola che evita l'anteprima PDF bloccata.
 *
 * Contesto del bug (01/08): l'anteprima dei template di TUTTI i verticali
 * restava a girare all'infinito. Causa: quando un'immagine non si caricava,
 * questo helper restituiva l'URL originale "così react-pdf ci prova" — ma
 * react-pdf scarica le immagini remote SENZA timeout, quindi `toBlob()` non
 * si risolveva mai.
 *
 * Regola blindata qui: immagine non caricata → `null` (il PDF esce senza
 * quell'immagine) e MAI l'URL, che bloccherebbe la generazione.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toDataUrl } from "../../serramenti/pdfImageUtils";

/** Sostituisce globalThis.Image con un finto che simula esito e tempi. */
function mockImage(esito: "load" | "error" | "mai", opts?: { taintCanvas?: boolean }) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin = "";
    naturalWidth = 100;
    naturalHeight = 100;
    set src(_v: string) {
      if (esito === "mai") return; // non risponde mai: deve intervenire il timeout
      setTimeout(() => {
        if (esito === "load") this.onload?.();
        else this.onerror?.();
      }, 0);
    }
  }
  vi.stubGlobal("Image", FakeImage);

  // Canvas: toDataURL funziona, oppure lancia come su canvas "tainted".
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag !== "canvas") return createElement(tag);
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toDataURL: () => {
        if (opts?.taintCanvas) throw new Error("Tainted canvas");
        return "data:image/png;base64,FAKE";
      },
    } as unknown as HTMLElement;
  });
}

describe("toDataUrl", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("converte l'immagine caricata in data URL", async () => {
    mockImage("load");
    const p = toDataUrl("https://esempio.it/logo.png");
    await vi.runAllTimersAsync();
    expect(await p).toBe("data:image/png;base64,FAKE");
  });

  it("immagine NON raggiungibile → null, mai l'URL (bloccherebbe react-pdf)", async () => {
    mockImage("error");
    const p = toDataUrl("https://esempio.it/logo-rotto.png");
    await vi.runAllTimersAsync();
    expect(await p).toBeNull();
  });

  it("immagine che non risponde mai → null dopo il timeout, non resta appesa", async () => {
    mockImage("mai");
    const p = toDataUrl("https://lentissimo.it/logo.png");
    await vi.advanceTimersByTimeAsync(12_500);
    expect(await p).toBeNull();
  });

  it("canvas tainted (immagine c'è ma non esportabile) → passa l'URL a react-pdf", async () => {
    mockImage("load", { taintCanvas: true });
    const p = toDataUrl("https://esempio.it/logo.png");
    await vi.runAllTimersAsync();
    // Qui l'immagine ESISTE: react-pdf ha una chance concreta, e il timeout
    // del pannello copre comunque il caso peggiore.
    expect(await p).toBe("https://esempio.it/logo.png");
  });

  it("un data URL già pronto passa invariato senza toccare la rete", async () => {
    expect(await toDataUrl("data:image/png;base64,GIA_PRONTO")).toBe("data:image/png;base64,GIA_PRONTO");
  });

  it("null/undefined/stringa vuota → null", async () => {
    expect(await toDataUrl(null)).toBeNull();
    expect(await toDataUrl(undefined)).toBeNull();
    expect(await toDataUrl("")).toBeNull();
  });
});
