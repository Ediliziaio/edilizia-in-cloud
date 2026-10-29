import {describe, expect, it} from "vitest";
import {totaliRendiconto, tariffaUsabileIl} from "@/lib/appalto/rendiconto";

const r = (o: Partial<{importo: number; costo_interno: number | null; margine: number | null; stato: string; extra_contratto: boolean}> = {}) => ({
  importo: 100, costo_interno: null as number | null, margine: null as number | null,
  stato: "confermata", extra_contratto: false, ...o,
});

describe("i totali del rendiconto", () => {
  it("tiene le bozze separate: non sono ancora soldi", () => {
    const t = totaliRendiconto([r({importo: 240}), r({importo: 160, stato: "bozza"})]);
    expect(t.confermato).toBe(240);
    expect(t.inBozza).toBe(160);
  });

  it("il margine resta NULL se nessuna riga confermata sa il suo costo", () => {
    const t = totaliRendiconto([r({importo: 240})]);
    expect(t.margine).toBeNull();
    expect(t.costo).toBeNull();
  });

  it("somma il margine solo sulle righe che hanno un costo, e dice quante ne restano fuori", () => {
    const t = totaliRendiconto([
      r({importo: 240, costo_interno: 150, margine: 90}),
      r({importo: 100}), // costo ignoto
    ]);
    expect(t.margine).toBe(90);
    expect(t.costo).toBe(150);
    expect(t.righeSenzaCosto).toBe(1);
    // Il confermato resta il totale vero, non solo la parte col costo noto.
    expect(t.confermato).toBe(340);
  });

  it("il costo di una bozza non entra nel margine", () => {
    const t = totaliRendiconto([r({importo: 100, stato: "bozza", costo_interno: 80, margine: 20})]);
    expect(t.margine).toBeNull();
    expect(t.inBozza).toBe(100);
  });

  it("le righe fuori contratto si contano a parte, restando nel totale", () => {
    const t = totaliRendiconto([r({importo: 240}), r({importo: 150, extra_contratto: true})]);
    expect(t.extra).toBe(150);
    expect(t.confermato).toBe(390);
  });

  it("senza righe non inventa numeri", () => {
    const t = totaliRendiconto([]);
    expect(t.confermato).toBe(0);
    expect(t.margine).toBeNull();
  });
});

describe("quando una tariffa si può usare", () => {
  const t = (o: Partial<{attivo: boolean; valido_dal: string | null; valido_al: string | null}> = {}) =>
    ({attivo: true, valido_dal: null as string | null, valido_al: null as string | null, ...o});

  it("una tariffa senza date vale sempre", () => {
    expect(tariffaUsabileIl(t(), "2026-10-28")).toBe(true);
  });
  it("vale anche l'ultimo giorno, non scade il giorno stesso", () => {
    expect(tariffaUsabileIl(t({valido_al: "2026-10-28"}), "2026-10-28")).toBe(true);
    expect(tariffaUsabileIl(t({valido_al: "2026-10-27"}), "2026-10-28")).toBe(false);
  });
  it("non vale prima di partire", () => {
    expect(tariffaUsabileIl(t({valido_dal: "2026-11-01"}), "2026-10-28")).toBe(false);
  });
  it("una tariffa spenta non si usa nemmeno se le date tornano", () => {
    expect(tariffaUsabileIl(t({attivo: false}), "2026-10-28")).toBe(false);
  });
});

it("la percentuale di margine si calcola sul ricavo di cui si conosce il costo", () => {
  // Due righe confermate: una da 1.000 con 700 di costo, una da 500 senza
  // costo. Il margine è 300. Diviso per 1.500 farebbe 20%, che è falso: il
  // margine vero su quello che si sa è il 30%.
  const t = totaliRendiconto([
    {importo: 1000, costo_interno: 700, margine: 300, stato: "confermata", extra_contratto: false},
    {importo: 500, costo_interno: null, margine: null, stato: "confermata", extra_contratto: false},
  ]);
  expect(t.confermato).toBe(1500);
  expect(t.margine).toBe(300);
  expect(t.confermatoConCosto).toBe(1000);
  expect(t.marginePct).toBe(30);
  expect(t.righeSenzaCosto).toBe(1);
});

it("senza nessun costo noto la percentuale resta vuota, non zero", () => {
  const t = totaliRendiconto([
    {importo: 1000, costo_interno: null, margine: null, stato: "confermata", extra_contratto: false},
  ]);
  expect(t.marginePct).toBeNull();
  expect(t.confermatoConCosto).toBe(0);
});
