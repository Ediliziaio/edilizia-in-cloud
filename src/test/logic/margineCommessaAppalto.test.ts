import { describe, it, expect } from "vitest";
import { margineCommessa, totaliCommessaAppalto, type RigaPerTotali } from "@/lib/appalto/rendiconto";

const euro = (v: number) => `${v.toLocaleString("it-IT", { useGrouping: "always" })} €`;

/** Una riga valorizzata: importo, costo, e se è fuori contratto. */
function riga(importo: number, costo: number | null, extra = false, stato = "confermata"): RigaPerTotali {
  return {
    stato,
    importo,
    costo_interno: costo,
    margine: costo === null ? null : importo - costo,
    extra_contratto: extra,
    sal_stato: null,
  } as RigaPerTotali;
}

const tot = (righe: RigaPerTotali[]) => totaliCommessaAppalto(righe);

describe("margineCommessa — a corpo", () => {
  /**
   * Il cantiere di AP-2026-004 in Demo 2: concordato 12.000, lavorato 13.420.
   * Sommare i margini delle righe darebbe 4.009 (29,9%), ma quei 1.420 di
   * sforamento non si fatturano: il ricavo vero è 12.000.
   */
  it("il ricavo è il concordato, non il rendiconto", () => {
    const totali = tot([riga(10290, 7203), riga(2320, 1632), riga(810, 576)]);
    expect(totali.margine).toBe(4009); // quello che si vedeva prima
    const m = margineCommessa({ valorizzazione: "a_corpo", riferimento: 12000, totali, euro });
    expect(m.ricavo).toBe(12000);
    expect(m.margine).toBe(12000 - 9411);
    expect(m.marginePct).toBe(21.6);
    expect(m.nota).toContain("Concordato meno i costi");
    expect(m.notaPct).toContain("non sul rendiconto");
  });

  it("sotto il concordato il margine è più ALTO della somma delle righe", () => {
    // Lavoro chiuso spendendo meno: il risparmio resta in tasca.
    const totali = tot([riga(8000, 5000)]);
    const m = margineCommessa({ valorizzazione: "a_corpo", riferimento: 12000, totali, euro });
    expect(m.margine).toBe(7000);
    expect(totali.margine).toBe(3000);
  });

  it("il lavoro fuori contratto si fattura a parte, quindi è ricavo in più", () => {
    const totali = tot([riga(10000, 6000), riga(1500, 900, true)]);
    const m = margineCommessa({ valorizzazione: "a_corpo", riferimento: 12000, totali, euro });
    expect(m.ricavo).toBe(13500);
    expect(m.margine).toBe(13500 - 6900);
    expect(m.nota).toContain("fuori contratto");
    expect(m.nota).toContain("1.500");
  });

  it("se una sola riga non sa quanto è costata non esce nessun numero", () => {
    // Un costo parziale contro un ricavo intero non è ottimista: è sbagliato.
    const totali = tot([riga(10290, 7203), riga(2320, null)]);
    const m = margineCommessa({ valorizzazione: "a_corpo", riferimento: 12000, totali, euro });
    expect(m.margine).toBeNull();
    expect(m.marginePct).toBeNull();
    expect(m.nota).toContain("a corpo servono tutte");
  });

  it("a cantiere aperto dice che vale finché non spendi altro", () => {
    // Un terzo del lavoro fatto: il concordato c'è tutto, i costi no.
    const totali = tot([riga(4000, 2500)]);
    const m = margineCommessa({ valorizzazione: "a_corpo", riferimento: 12000, totali, euro });
    expect(m.margine).toBe(9500);
    expect(m.nota).toContain("se non spendi altro");
  });

  it("un costo che supera il concordato dà margine negativo", () => {
    const totali = tot([riga(13000, 14500)]);
    const m = margineCommessa({ valorizzazione: "a_corpo", riferimento: 12000, totali, euro });
    expect(m.margine).toBe(-2500);
    expect(m.marginePct).toBeLessThan(0);
  });

  it("senza nessun costo noto dice che manca il costo, non zero", () => {
    const m = margineCommessa({ valorizzazione: "a_corpo", riferimento: 12000, totali: tot([riga(5000, null)]), euro });
    expect(m.margine).toBeNull();
    expect(m.nota).toContain("costo");
  });

  it("con le sole bozze lo dice, invece di dare la colpa al costo", () => {
    const m = margineCommessa({ valorizzazione: "a_corpo", riferimento: 12000, totali: tot([riga(5000, 3000, false, "bozza")]), euro });
    expect(m.margine).toBeNull();
    expect(m.nota).toContain("bozza");
    expect(m.notaPct).toContain("bozza");
  });

  it("senza cifra concordata si torna al conto delle righe", () => {
    // Una commessa a corpo senza importo: non si inventa un ricavo.
    const totali = tot([riga(5000, 3000)]);
    const m = margineCommessa({ valorizzazione: "a_corpo", riferimento: null, totali, euro });
    expect(m.margine).toBe(2000);
    expect(m.nota).toContain("righe valorizzate");
  });
});

describe("margineCommessa — a misura non cambia", () => {
  it("il ricavo resta il rendiconto, perché a misura si fattura quello", () => {
    const totali = tot([riga(10290, 7203), riga(2320, 1632), riga(810, 576)]);
    const m = margineCommessa({ valorizzazione: "a_misura", riferimento: 12000, totali, euro });
    expect(m.margine).toBe(4009);
    expect(m.marginePct).toBe(totali.marginePct);
  });

  it("con qualche riga senza costo guarda solo quelle che lo sanno, e lo dice", () => {
    const totali = tot([riga(1000, 600), riga(1000, null)]);
    const m = margineCommessa({ valorizzazione: "a_misura", riferimento: null, totali, euro });
    expect(m.margine).toBe(400);
    expect(m.nota).toContain("1 riga non ha il costo");
    expect(m.notaPct).toContain("50%");
  });
});
