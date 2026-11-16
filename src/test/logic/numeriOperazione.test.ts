import { describe, expect, it } from "vitest";
import { noteSuperficie, numeriOperazione, superficieOperazione } from "@/lib/orders/generali/numeriOperazione";

describe("superficie dell'operazione", () => {
  it("somma i metri quadri delle unità e dice quante sono", () => {
    const s = superficieOperazione({ unitaMq: [80, 95.5, 120] });
    expect(s).toMatchObject({ mq: 295.5, fonte: "unita", unitaContate: 3, unitaSenzaMq: 0 });
    expect(noteSuperficie(s)).toBe("3 unità");
  });

  it("dice quante unità non hanno i metri quadri: la somma è parziale", () => {
    const s = superficieOperazione({ unitaMq: [80, 95, null, 0] });
    expect(s).toMatchObject({ mq: 175, fonte: "unita", unitaContate: 2, unitaSenzaMq: 2 });
    expect(noteSuperficie(s)).toBe("2 unità, 2 senza metri quadri");
  });

  it("una somma parziale non batte il totale scritto a mano", () => {
    // 1 unità su 4 coi metri quadri: 80 m² non è la superficie dell'operazione.
    expect(superficieOperazione({ unitaMq: [80, null, null, null], mqVendibili: 1200 }))
      .toEqual({ mq: 1200, fonte: "manuale" });
    // E senza un totale completo è meglio nessun €/m² che uno calcolato su un quarto delle unità.
    expect(superficieOperazione({ unitaMq: [80, null, null, null] })).toBeNull();
  });

  it("senza unità usa quella scritta a mano, poi quella dell'immobile", () => {
    expect(superficieOperazione({ mqVendibili: 420 })).toEqual({ mq: 420, fonte: "manuale" });
    expect(superficieOperazione({ immobileMq: 110 })).toEqual({ mq: 110, fonte: "immobile" });
    // La superficie scritta a mano vince su quella dell'immobile: è la vendibile.
    expect(superficieOperazione({ mqVendibili: 420, immobileMq: 110 })?.fonte).toBe("manuale");
    // Le unità vincono su tutto: si aggiornano da sole.
    expect(superficieOperazione({ unitaMq: [50], mqVendibili: 420 })?.fonte).toBe("unita");
  });

  it("legge un numero scritto come testo e scarta lo zero e il non numero", () => {
    expect(superficieOperazione({ mqVendibili: "1.250" })?.mq).toBe(1.25);
    expect(superficieOperazione({ mqVendibili: "1250,5" })?.mq).toBe(1250.5);
    expect(superficieOperazione({ mqVendibili: 0 })).toBeNull();
    expect(superficieOperazione({ mqVendibili: "molti" })).toBeNull();
    expect(superficieOperazione({})).toBeNull();
  });
});

describe("previsionale e reale", () => {
  const superficie = { mq: 1000, fonte: "manuale" as const };

  it("mette in fila i due scenari e divide per i metri quadri", () => {
    const n = numeriOperazione({
      venditaPrevista: 2_496_000, costiPrevisti: 1_937_609,
      venduto: 600_000, speso: 738_937, superficie,
    });
    expect(n.previsionale).toMatchObject({ margine: 558_391, venditaMq: 2496, costiMq: 1937.61 });
    expect(n.previsionale.marginePct).toBe(22.4);
    expect(n.reale).toMatchObject({ margine: -138_937, venditaMq: 600, costiMq: 738.94 });
    expect(n.scartoCosti).toBe(-1_198_672);
    expect(n.spesoPct).toBe(38.1);
    expect(n.scartoCostoMq).toBe(-1198.67);
  });

  it("senza venduto il margine reale non si calcola: si sta costruendo", () => {
    const n = numeriOperazione({
      venditaPrevista: 2_496_000, costiPrevisti: 1_937_609,
      venduto: 0, speso: 738_937, superficie,
    });
    expect(n.reale.vendita).toBeNull();
    expect(n.reale.margine).toBeNull();
    expect(n.reale.venditaMq).toBeNull();
    // I costi però sono veri e restano.
    expect(n.reale.costi).toBe(738_937);
    expect(n.reale.costiMq).toBe(738.94);
  });

  it("senza superficie i €/m² restano vuoti, il resto no", () => {
    const n = numeriOperazione({
      venditaPrevista: 1_000_000, costiPrevisti: 800_000, venduto: null, speso: 100_000, superficie: null,
    });
    expect(n.previsionale.margine).toBe(200_000);
    expect(n.previsionale.venditaMq).toBeNull();
    expect(n.previsionale.costiMq).toBeNull();
    expect(n.scartoCostoMq).toBeNull();
  });

  it("sforare il budget si vede nello scarto e oltre il 100%", () => {
    const n = numeriOperazione({
      venditaPrevista: null, costiPrevisti: 100_000, venduto: null, speso: 130_000, superficie: null,
    });
    expect(n.scartoCosti).toBe(30_000);
    expect(n.spesoPct).toBe(130);
    expect(n.previsionale.margine).toBeNull();
  });
});
