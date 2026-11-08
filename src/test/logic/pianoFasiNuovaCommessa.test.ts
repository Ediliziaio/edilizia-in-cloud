import { describe, expect, it } from "vitest";
import { contaLavorativi, fasiColPiano, giorniDaSottofasi, pianificaFasi, sottofasiSullaDurata } from "@/lib/orders/pianoFasiNuovaCommessa";
import { calendarioCantiere } from "@/lib/orders/sottofasi";

// Lunedì 9 novembre 2026; nessuna chiusura, sabato a casa.
const feriali = calendarioCantiere({ sabato: false, chiusure: new Set() });
const fase = (giorni?: number | null, sottofasi: Array<{ giorni?: number; in_parallelo?: boolean }> = []) =>
  ({ giorni, sottofasi: sottofasi.map((s, i) => ({ nome: `s${i}`, peso: 1, ...s })) });

describe("pianificaFasi", () => {
  it("divide i giorni di lavoro fra inizio e fine in parti uguali, i giorni avanzati alle prime", () => {
    // 9→20 novembre = 10 giorni feriali, 3 fasi → 4, 3, 3
    const p = pianificaFasi([fase(), fase(), fase()], { inizio: "2026-11-09", fine: "2026-11-20", lavorativo: feriali });
    expect(p.righe.map((r) => r.giorni)).toEqual([4, 3, 3]);
    expect(p.righe.map((r) => [r.dal, r.al])).toEqual([
      ["2026-11-09", "2026-11-12"], ["2026-11-13", "2026-11-17"], ["2026-11-18", "2026-11-20"],
    ]);
    expect(p.oltreFine).toBe(false);
  });

  it("i giorni scritti a mano e quelli delle sottofasi valgono, il resto si divide", () => {
    const p = pianificaFasi([fase(2), fase(null, [{ giorni: 3 }, { giorni: 2, in_parallelo: true }]), fase()],
      { inizio: "2026-11-09", fine: "2026-11-20", lavorativo: feriali });
    expect(p.righe.map((r) => [r.giorni, r.origine])).toEqual([[2, "mano"], [3, "sottofasi"], [5, "divisi"]]);
    expect(p.fineFasi).toBe("2026-11-20");
  });

  it("salta sabati, domeniche e chiusure", () => {
    const conFesta = calendarioCantiere({ sabato: false, chiusure: new Set(["2026-12-08"]) });
    const p = pianificaFasi([fase(3)], { inizio: "2026-12-05", fine: null, lavorativo: conFesta });
    // sabato 5 → si parte lunedì 7, l'8 è chiuso: 7, 9, 10
    expect([p.righe[0].dal, p.righe[0].al]).toEqual(["2026-12-07", "2026-12-10"]);
  });

  it("senza data di inizio niente date; senza fine le fasi senza durata restano vuote", () => {
    expect(pianificaFasi([fase(2)], { inizio: null, fine: null, lavorativo: feriali }).righe[0]).toMatchObject({ giorni: 2, dal: null });
    const p = pianificaFasi([fase(2), fase(), fase(1)], { inizio: "2026-11-09", fine: null, lavorativo: feriali });
    expect(p.righe.map((r) => r.al)).toEqual(["2026-11-10", null, "2026-11-11"]);
  });

  it("se le fasi non ci stanno avvisa che finiscono dopo la fine lavori", () => {
    const p = pianificaFasi([fase(5), fase(5), fase()], { inizio: "2026-11-09", fine: "2026-11-13", lavorativo: feriali });
    expect(p.righe[2].giorni).toBe(1);
    expect(p.oltreFine).toBe(true);
  });
});

describe("conti dei giorni", () => {
  it("contaLavorativi conta solo i giorni di lavoro, estremi compresi", () => {
    expect(contaLavorativi("2026-11-09", "2026-11-15", feriali)).toBe(5);
    expect(contaLavorativi("2026-11-15", "2026-11-09", feriali)).toBe(0);
  });
  it("giorniDaSottofasi: le parallele non allungano, se non durano di più", () => {
    expect(giorniDaSottofasi(fase(null, [{ giorni: 3 }, { giorni: 5, in_parallelo: true }, { giorni: 2 }]))).toBe(7);
    expect(giorniDaSottofasi(fase(null, [{}]))).toBeNull();
  });
});

describe("sottofasi che seguono la durata scritta a mano", () => {
  const giorni = (l: Array<{ giorni?: number | null }>) => l.map((s) => s.giorni);
  const sotto = (...v: Array<{ giorni?: number; in_parallelo?: boolean }>) => v.map((s, i) => ({ nome: `s${i}`, peso: 1, ...s }));

  it("accorciando, la differenza la assorbe la sottofase più lunga", () => {
    // Trovato provando la pagina: Produzione portata da 21 a 10 giorni teneva 20 giorni d'attesa.
    const r = sottofasiSullaDurata(sotto({ giorni: 20 }, { giorni: 1 }), 10);
    expect(giorni(r)).toEqual([9, 1]);
    expect(giorniDaSottofasi({ sottofasi: r })).toBe(10);
  });
  it("allungando, i giorni in più vanno alla più lunga", () => {
    expect(giorni(sottofasiSullaDurata(sotto({ giorni: 2 }, { giorni: 5 }), 10))).toEqual([2, 8]);
  });
  it("nessuna scende sotto un giorno", () => {
    expect(giorni(sottofasiSullaDurata(sotto({ giorni: 4 }, { giorni: 3 }), 1))).toEqual([1, 1]);
  });
  it("una parallela non resta più lunga della sottofase accanto", () => {
    const r = sottofasiSullaDurata(sotto({ giorni: 6 }, { giorni: 6, in_parallelo: true }, { giorni: 1 }), 3);
    expect(giorni(r)).toEqual([2, 2, 1]);
    expect(giorniDaSottofasi({ sottofasi: r })).toBe(3);
  });
  it("sottofasi senza giorni restano come sono, e l'originale non cambia", () => {
    const orig = sotto({}, {});
    expect(giorni(sottofasiSullaDurata(orig, 5))).toEqual([undefined, undefined]);
    const piene = sotto({ giorni: 8 });
    sottofasiSullaDurata(piene, 2);
    expect(piene[0].giorni).toBe(8);
  });
  it("fasiColPiano tocca solo le fasi con la durata scritta a mano", () => {
    const fasi = [{ nome: "a", sottofasi: sotto({ giorni: 20 }, { giorni: 1 }), giorni: 10 }, { nome: "b", sottofasi: sotto({ giorni: 3 }) }];
    const p = pianificaFasi(fasi, { inizio: "2026-11-09", fine: null, lavorativo: feriali });
    const r = fasiColPiano(fasi, p);
    expect(giorni(r[0].sottofasi)).toEqual([9, 1]);
    expect(giorni(r[1].sottofasi)).toEqual([3]);
    expect([r[0].data_inizio, r[0].data_fine]).toEqual(["2026-11-09", "2026-11-20"]);
  });
});
