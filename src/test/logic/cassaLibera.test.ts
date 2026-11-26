import { describe, expect, it } from "vitest";
import { cassaLiberaCommessa } from "@/lib/orders/cassaLibera";

describe("cassa libera della commessa", () => {
  it("l'acconto che sembra utile: in mano 5.000, ma i costi devono ancora arrivare", () => {
    // Serramento da 10.000 €: acconto 5.000 incassato, niente ancora pagato,
    // nessuna fattura arrivata, lavori non iniziati. Costo previsto 7.000.
    const cassa = cassaLiberaCommessa({ saldoOggi: 5000, daPagare: 0, costoPrevisto: 7000, avanzamentoPct: 0 });
    expect(cassa.libera).toBe(5000);
    expect(cassa.daSostenere).toBe(7000);
    expect(cassa.copre).toBe(false);
  });

  it("le fatture già arrivate e non pagate escono subito dalla cassa libera", () => {
    const cassa = cassaLiberaCommessa({ saldoOggi: 5000, daPagare: 3200, costoPrevisto: 7000, avanzamentoPct: 50 });
    expect(cassa.libera).toBe(1800);
    // A metà lavori resta da sostenere metà del previsto.
    expect(cassa.daSostenere).toBe(3500);
    expect(cassa.copre).toBe(false);
  });

  it("a lavori finiti non resta niente da sostenere e la cassa libera è il risultato vero", () => {
    const cassa = cassaLiberaCommessa({ saldoOggi: 2800, daPagare: 0, costoPrevisto: 7000, avanzamentoPct: 100 });
    expect(cassa.daSostenere).toBe(0);
    expect(cassa.copre).toBe(true);
    expect(cassa.libera).toBe(2800);
  });

  it("senza preventivo o senza avanzamento la stima non si inventa", () => {
    expect(cassaLiberaCommessa({ saldoOggi: 1000, daPagare: 0, costoPrevisto: 0, avanzamentoPct: 30 }).daSostenere).toBeNull();
    expect(cassaLiberaCommessa({ saldoOggi: 1000, daPagare: 0, costoPrevisto: 7000, avanzamentoPct: null }).daSostenere).toBeNull();
    expect(cassaLiberaCommessa({ saldoOggi: 1000, daPagare: 0 }).copre).toBeNull();
  });

  it("una commessa che stai finanziando tu parte già sotto zero", () => {
    const cassa = cassaLiberaCommessa({ saldoOggi: -4000, daPagare: 1500, costoPrevisto: 20000, avanzamentoPct: 80 });
    expect(cassa.libera).toBe(-5500);
    expect(cassa.daSostenere).toBe(4000);
    expect(cassa.copre).toBe(false);
  });
});
