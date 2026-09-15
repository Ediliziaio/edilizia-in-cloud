import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avviaIntervalloVisibile, type DocumentoVisibile } from "@/lib/intervalloVisibile";

function fintoDocumento(stato: "visible" | "hidden") {
  const ascoltatori = new Set<() => void>();
  const doc: DocumentoVisibile & { imposta: (s: "visible" | "hidden") => void; quanti: () => number } = {
    visibilityState: stato,
    addEventListener: (_t, fn) => void ascoltatori.add(fn),
    removeEventListener: (_t, fn) => void ascoltatori.delete(fn),
    imposta(s) {
      doc.visibilityState = s;
      for (const fn of ascoltatori) fn();
    },
    quanti: () => ascoltatori.size,
  };
  return doc;
}

describe("avviaIntervalloVisibile", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gira mentre la scheda è visibile", () => {
    const esegui = vi.fn();
    const doc = fintoDocumento("visible");
    const ferma = avviaIntervalloVisibile(esegui, 1000, doc);
    vi.advanceTimersByTime(3000);
    expect(esegui).toHaveBeenCalledTimes(3);
    ferma();
  });

  it("non gira da nascosta e al ritorno esegue una volta sola, poi riprende", () => {
    const esegui = vi.fn();
    const doc = fintoDocumento("visible");
    const ferma = avviaIntervalloVisibile(esegui, 1000, doc);

    doc.imposta("hidden");
    vi.advanceTimersByTime(10_000);
    expect(esegui).not.toHaveBeenCalled();

    doc.imposta("visible");
    expect(esegui).toHaveBeenCalledTimes(1);
    doc.imposta("visible"); // evento doppio: niente seconda esecuzione
    expect(esegui).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(esegui).toHaveBeenCalledTimes(2);
    ferma();
  });

  it("partendo nascosta aspetta il ritorno in primo piano", () => {
    const esegui = vi.fn();
    const doc = fintoDocumento("hidden");
    const ferma = avviaIntervalloVisibile(esegui, 1000, doc);
    vi.advanceTimersByTime(5000);
    expect(esegui).not.toHaveBeenCalled();
    doc.imposta("visible");
    expect(esegui).toHaveBeenCalledTimes(1);
    ferma();
  });

  it("fermato, smette di girare e toglie l'ascoltatore", () => {
    const esegui = vi.fn();
    const doc = fintoDocumento("visible");
    const ferma = avviaIntervalloVisibile(esegui, 1000, doc);
    ferma();
    vi.advanceTimersByTime(5000);
    doc.imposta("visible");
    expect(esegui).not.toHaveBeenCalled();
    expect(doc.quanti()).toBe(0);
  });
});
