import { describe, expect, it, vi } from "vitest";
import { calcolaMargine, type ArgomentiMargine, type RigaCostoListino } from "@/lib/serramenti/margine";
import type { SrAccessorioRow, SrSerramentoRow, SrServizioRow } from "@/types/serramenti";

/**
 * Il margine dell'anteprima segue le regole dello step Economia: il costo di una
 * posizione lo dà il listino (qui una funzione finta, la stessa che usa l'hook
 * `useCostoPosizioneListino`), il costo dei servizi è quello scritto sulla riga, e
 * un costo che manca toglie la percentuale. Qui si fissano le regole del conto.
 */
const s = (extra: Partial<SrSerramentoRow>) => ({ id: "s", quantita: 1, prezzo_unitario: null, prezzo_totale: null, listino_voce_id: null, ...extra }) as unknown as SrSerramentoRow;
const a = (extra: Partial<SrAccessorioRow>) => ({ id: "a", quantita: 1, prezzo_unitario: null, prezzo_totale: null, listino_voce_id: null, ...extra }) as unknown as SrAccessorioRow;
const m = (extra: Partial<SrServizioRow>) => ({ id: "m", quantita: 1, prezzo_unitario_vendita: null, prezzo_totale_vendita: null, prezzo_unitario_costo: null, prezzo_totale_costo: null, ...extra }) as unknown as SrServizioRow;

/** Un listino finto: i costi per id di riga. */
const listino = (costi: Record<string, number>) => (riga: RigaCostoListino): number | null => costi[riga.id] ?? null;

describe("calcolaMargine", () => {
  it("costi tutti noti: margine e percentuale sulla vendita netta", () => {
    const r = calcolaMargine({
      detail: { serramenti: [s({ id: "s1", prezzo_totale: 1000 })], accessori: [], servizi: [] },
      prezzoManuale: false,
      venditaNetta: 1000,
      costoPosizione: listino({ s1: 600 }),
    });
    expect(r).toMatchObject({ costoTotale: 600, margine: 400, costiCompleti: true, righeConCosto: 1, righeSenzaCosto: 0 });
    expect(r.marginePct).toBeCloseTo(40, 6);
  });

  it("al listino si passa la riga intera (misure, varianti, pezzi), per serramenti e accessori ma non per i servizi", () => {
    const costoPosizione = vi.fn((riga: RigaCostoListino): number | null => (riga.id ? 100 : null));
    calcolaMargine({
      detail: {
        serramenti: [s({ id: "s1", prezzo_totale: 1000, quantita: 3, family_id: "f1", larghezza_mm: 1200 })],
        accessori: [a({ id: "a1", prezzo_totale: 300 })],
        servizi: [m({ id: "m1", prezzo_totale_vendita: 150, prezzo_totale_costo: 90 })],
      },
      prezzoManuale: false,
      venditaNetta: 1450,
      costoPosizione,
    });
    expect(costoPosizione).toHaveBeenCalledTimes(2);
    expect(costoPosizione.mock.calls[0][0]).toMatchObject({ id: "s1", family_id: "f1", quantita: 3, larghezza_mm: 1200 });
  });

  it("un costo che manca: niente percentuale (sarebbe falsa), il margine è parziale", () => {
    const r = calcolaMargine({
      detail: { serramenti: [s({ id: "s1", prezzo_totale: 1000 }), s({ id: "s2", prezzo_totale: 500 })], accessori: [], servizi: [] },
      prezzoManuale: false,
      venditaNetta: 1500,
      costoPosizione: listino({ s1: 600 }),
    });
    expect(r.costiCompleti).toBe(false);
    expect(r.marginePct).toBeNull();
    expect(r.righeSenzaCosto).toBe(1);
    expect(r.costoPerRiga.get("s2")).toBeNull();
  });

  it("le righe a 0 € non contano, tranne col prezzo scritto a mano (hanno comunque un costo)", () => {
    const detail: ArgomentiMargine["detail"] = { serramenti: [s({ id: "s1", prezzo_totale: 0 })], accessori: [], servizi: [] };
    expect(calcolaMargine({ detail, prezzoManuale: false, venditaNetta: 0, costoPosizione: listino({ s1: 400 }) })).toMatchObject({ costoTotale: 0, righeConVendita: 0 });
    const conManuale = calcolaMargine({ detail, prezzoManuale: true, venditaNetta: 900, costoPosizione: listino({ s1: 400 }) });
    expect(conManuale).toMatchObject({ costoTotale: 400, margine: 500, costiCompleti: true });
  });

  it("i servizi: il costo scritto sulla riga (totale, o unitario × quantità)", () => {
    const r = calcolaMargine({
      detail: {
        serramenti: [],
        accessori: [a({ id: "a1", quantita: 4, prezzo_totale: 1200 })],
        servizi: [m({ id: "m1", prezzo_totale_vendita: 150, prezzo_totale_costo: 100 }), m({ id: "m2", quantita: 2, prezzo_totale_vendita: 80, prezzo_totale_costo: null, prezzo_unitario_costo: 25 })],
      },
      prezzoManuale: false,
      venditaNetta: 1430,
      costoPosizione: listino({ a1: 600 }),
    });
    expect(r.costoTotale).toBe(600 + 100 + 50);
    expect(r.costoPerRiga.get("m1")).toBe(100);
    expect(r.costoPerRiga.get("m2")).toBe(50);
  });

  it("sotto il margine minimo: lo dice solo se i costi sono completi", () => {
    const detail: ArgomentiMargine["detail"] = { serramenti: [s({ id: "s1", prezzo_totale: 1000 })], accessori: [], servizi: [] };
    const base = { detail, prezzoManuale: false, venditaNetta: 1000, costoPosizione: listino({ s1: 900 }) };
    expect(calcolaMargine({ ...base, margineMinPct: 25 }).sottoTarget).toBe(true);
    expect(calcolaMargine({ ...base, margineMinPct: 5 }).sottoTarget).toBe(false);
    expect(calcolaMargine(base).sottoTarget).toBe(false);
    // costo ignoto: nessuna percentuale, quindi nessun «sotto il minimo»
    expect(calcolaMargine({ ...base, costoPosizione: listino({}), margineMinPct: 25 }).sottoTarget).toBe(false);
  });
});
