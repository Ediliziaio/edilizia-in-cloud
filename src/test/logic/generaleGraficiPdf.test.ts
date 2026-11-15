import { describe, expect, it } from "vitest";
import {
  cifraCompatta, fetteTorta, gruppiPerCategoria, nomeCategoriaPiano, passiCascata, percorsoSpicchio, scalaAsse,
} from "@/lib/orders/generali/graficiPdf";

describe("grafici dei PDF: torta", () => {
  it("tiene solo i positivi, dal più grande, e le quote fanno 1", () => {
    const f = fetteTorta([{ nome: "a", valore: 10 }, { nome: "b", valore: 30 }, { nome: "zero", valore: 0 }, { nome: "neg", valore: -5 }]);
    expect(f.map((x) => x.nome)).toEqual(["b", "a"]);
    expect(f.reduce((t, x) => t + x.quota, 0)).toBeCloseTo(1, 10);
  });

  it("oltre il massimo le più piccole vanno in «Altro»", () => {
    const voci = Array.from({ length: 10 }, (_, i) => ({ nome: `v${i}`, valore: 100 - i }));
    const f = fetteTorta(voci, 7);
    expect(f).toHaveLength(7);
    expect(f[6].nome).toBe("Altro");
    expect(f[6].valore).toBe(94 + 93 + 92 + 91);
  });

  it("niente fette se non c'è niente da dividere", () => {
    expect(fetteTorta([{ nome: "a", valore: 0 }])).toEqual([]);
  });

  it("uno spicchio intero si chiude in due archi (un arco solo non si disegna)", () => {
    expect(percorsoSpicchio(50, 50, 50, 30, 0, 1).match(/A /g)).toHaveLength(4);
    expect(percorsoSpicchio(50, 50, 50, 30, 0, 0.25)).toMatch(/^M 50\.00 0\.00 A 50 50 0 0 1 100\.00 50\.00/);
  });
});

describe("grafici dei PDF: cascata", () => {
  it("dai ricavi scende un costo alla volta fino al margine", () => {
    const p = passiCascata(1000, [{ nome: "Materiali", valore: 300 }, { nome: "Terreno", valore: 500 }]);
    expect(p.map((x) => [x.nome, x.da, x.a])).toEqual([
      ["Ricavi", 0, 1000], ["Terreno", 1000, 500], ["Materiali", 500, 200], ["Margine", 0, 200],
    ]);
  });

  it("un margine negativo resta negativo, e i costi in più finiscono in «Altri costi»", () => {
    const costi = Array.from({ length: 9 }, (_, i) => ({ nome: `c${i}`, valore: 200 }));
    const p = passiCascata(1000, costi, 7);
    expect(p).toHaveLength(9);
    expect(p[7].nome).toBe("Altri costi");
    expect(p[8]).toMatchObject({ nome: "Margine", da: 0, a: -800 });
  });
});

describe("grafici dei PDF: assi ed etichette", () => {
  it("una scala tonda che comprende lo zero", () => {
    const a = scalaAsse(-749_800, 831_103);
    expect(a.min).toBeLessThanOrEqual(-749_800);
    expect(a.max).toBeGreaterThanOrEqual(831_103);
    expect(a.valori).toContain(0);
    expect([100_000, 200_000, 250_000, 500_000, 1_000_000]).toContain(a.passo);
  });

  it("cifre corte col trattino normale (l'Helvetica dei PDF non ha il segno meno)", () => {
    expect(cifraCompatta(1_780_000)).toBe("1,8 mln");
    expect(cifraCompatta(-382_000)).toBe("-382k");
    expect(cifraCompatta(900)).toBe("900");
    expect(cifraCompatta(-1)).not.toContain("−");
  });
});

describe("piano raggruppato per categoria", () => {
  it("gruppi nell'ordine in cui compaiono, coi totali", () => {
    const r = (categoria: string, previsto: number, stima: number) => ({ categoria, etichetta: categoria, previsto, reale: 0, aFinire: stima, stima, scostamento: stima - previsto });
    const g = gruppiPerCategoria([r("materiali", 100, 120), r("terreno", 50, 50), r("materiali", 10, 5)]);
    expect(g.map((x) => [x.categoria, x.righe.length, x.totali.previsto, x.totali.stima])).toEqual([
      ["materiali", 2, 110, 125], ["terreno", 1, 50, 50],
    ]);
    expect(g[0].nome).toBe("Materiali");
  });

  it("i nomi delle categorie fuori elenco restano leggibili", () => {
    expect(nomeCategoriaPiano("varianti_acquirenti")).toBe("Varianti degli acquirenti");
    expect(nomeCategoriaPiano("noleggio_gru")).toBe("Noleggio gru");
  });
});
