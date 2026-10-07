// src/test/logic/fasiDaCapitoli.test.ts
import { describe, expect, it } from "vitest";
import { fasiDaCapitoli, MAX_FASI_DA_CAPITOLI } from "@/lib/orders/fasiDaCapitoli";

const voce = (capitolo_nome: string | null, importo: number | string | null) => ({ capitolo_nome, importo });

describe("fasiDaCapitoli", () => {
  it("un capitolo è una fase, nell'ordine in cui compare, col suo importo", () => {
    const f = fasiDaCapitoli([voce("Demolizioni", 1000), voce("Impianti", 3000), voce("Demolizioni", 500)], 4500);
    expect(f).toEqual([{ nome: "Demolizioni", venduto: 1500 }, { nome: "Impianti", venduto: 3000 }]);
  });
  it("con uno sconto globale i venduti si scalano e sommano all'imponibile", () => {
    const f = fasiDaCapitoli([voce("A", 1000), voce("B", 1000), voce("C", 1000)], 2700);
    expect(f.map((x) => x.venduto)).toEqual([900, 900, 900]);
    expect(f.reduce((s, x) => s + x.venduto, 0)).toBeCloseTo(2700, 2);
  });
  it("l'ultimo capitolo prende il resto: la somma fa sempre l'imponibile, al centesimo", () => {
    const f = fasiDaCapitoli([voce("A", 1), voce("B", 1), voce("C", 1)], 100);
    expect(f.map((x) => x.venduto)).toEqual([33.33, 33.33, 33.34]);
  });
  it("un capitolo a zero euro resta una fase a zero, e non prende il resto", () => {
    const f = fasiDaCapitoli([voce("A", 100), voce("B", 0)], 150);
    expect(f).toEqual([{ nome: "A", venduto: 150 }, { nome: "B", venduto: 0 }]);
  });
  it("una voce senza capitolo va in «Generale»; gli spazi non contano", () => {
    expect(fasiDaCapitoli([voce(null, 10), voce("  ", 10), voce(" Bagno ", 20)], 40)).toEqual([
      { nome: "Generale", venduto: 20 }, { nome: "Bagno", venduto: 20 },
    ]);
  });
  it("gli importi che arrivano come testo contano; quelli rotti valgono zero", () => {
    expect(fasiDaCapitoli([voce("A", "250.50"), voce("B", "boh"), voce("C", null)], 250.5)).toEqual([
      { nome: "A", venduto: 250.5 }, { nome: "B", venduto: 0 }, { nome: "C", venduto: 0 },
    ]);
  });
  it("senza importi o senza imponibile le fasi nascono a zero (nessun venduto inventato)", () => {
    expect(fasiDaCapitoli([voce("A", 0), voce("B", 0)], 1000)).toEqual([{ nome: "A", venduto: 0 }, { nome: "B", venduto: 0 }]);
    expect(fasiDaCapitoli([voce("A", 100)], 0)).toEqual([{ nome: "A", venduto: 0 }]);
  });
  it("un importo negativo (uno storno) non toglie venduto agli altri capitoli", () => {
    expect(fasiDaCapitoli([voce("A", 100), voce("Storno", -50)], 100)).toEqual([
      { nome: "A", venduto: 100 }, { nome: "Storno", venduto: 0 },
    ]);
  });
  it("oltre il limite di fasi gli ultimi capitoli si uniscono in «Altri capitoli»", () => {
    const voci = Array.from({ length: MAX_FASI_DA_CAPITOLI + 5 }, (_, i) => voce(`Cap ${i + 1}`, 10));
    const f = fasiDaCapitoli(voci, 650);
    expect(f).toHaveLength(MAX_FASI_DA_CAPITOLI);
    expect(f[f.length - 1].nome).toBe("Altri capitoli");
    expect(f.reduce((s, x) => s + x.venduto, 0)).toBeCloseTo(650, 2);
  });
  it("nessuna voce, nessuna fase", () => {
    expect(fasiDaCapitoli([], 1000)).toEqual([]);
  });
});
