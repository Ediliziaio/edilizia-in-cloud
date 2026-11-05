/**
 * La fattura fatta da un SAL vale esattamente quanto il SAL (04/11/2026).
 *
 * Le voci di un verbale sono cumulative e arrotondate una per una: la loro differenza col
 * verbale precedente poteva sommare qualche centesimo in meno o in più della quota, e
 * quei centesimi finivano in fattura. Il SAL diceva un numero, la fattura che lo incassa
 * ne diceva un altro, e la rata collegata risultava comunque saldata.
 */
import { describe, expect, it } from "vitest";
import { righeSal } from "@/lib/orders/fatturaDaLavori";

const voce = (descrizione: string, importo_sal: number) => ({ descrizione, importo_sal });
const sal = (numero_sal: number, importo_totale: number, voci: ReturnType<typeof voce>[], extra: Record<string, unknown> = {}) =>
  ({ id: `s${numero_sal}`, numero_sal, stato: "emesso", importo_totale, sal_voci: voci, ...extra });

const somma = (righe: ReturnType<typeof righeSal>) =>
  Math.round(righe.reduce((s, r) => s + Number(r.prezzo_unitario) * Number(r.quantita), 0) * 100) / 100;

describe("la fattura da SAL prende l'importo esatto del verbale", () => {
  it("le voci arrotondate non fanno perdere centesimi: la somma è la quota", () => {
    // 3 voci che per conto loro fanno 333,33 × 3 = 999,99, ma il verbale vale 1000,00
    const s1 = sal(1, 1000, [voce("Scavi", 333.33), voce("Muratura", 333.33), voce("Finiture", 333.33)]);
    const righe = righeSal(s1, [s1], 22);
    expect(righe.length).toBe(3);
    expect(somma(righe)).toBe(1000);
  });

  it("lo scarto va sull'ultima voce, le altre restano quelle del verbale", () => {
    const s1 = sal(1, 1000, [voce("Scavi", 333.33), voce("Muratura", 333.33), voce("Finiture", 333.33)]);
    const righe = righeSal(s1, [s1], 22);
    expect(Number(righe[0].prezzo_unitario)).toBe(333.33);
    expect(Number(righe[1].prezzo_unitario)).toBe(333.33);
    expect(Number(righe[2].prezzo_unitario)).toBe(333.34);
  });

  it("col secondo verbale si fattura solo la differenza, e torna esatta", () => {
    const s1 = sal(1, 400, [voce("Scavi", 200), voce("Muratura", 200)]);
    const s2 = sal(2, 1000, [voce("Scavi", 433.33), voce("Muratura", 566.67)]);
    expect(somma(righeSal(s2, [s1, s2], 22))).toBe(600);
  });

  it("quando le voci non tornano col verbale resta una riga sola, con l'importo giusto", () => {
    // nomi cambiati fra un verbale e l'altro: le differenze non significano più niente
    const s1 = sal(1, 500, [voce("Scavi", 500)]);
    const s2 = sal(2, 900, [voce("Opere murarie", 900)]);
    const righe = righeSal(s2, [s1, s2], 22);
    expect(righe.length).toBe(1);
    expect(somma(righe)).toBe(400);
  });

  it("col certificato di pagamento si fattura il suo netto, già senza ritenuta", () => {
    const s1 = sal(1, 1000, [voce("Scavi", 1000)], { sal_certificati: [{ netto: 900 }] });
    const righe = righeSal(s1, [s1], 22);
    expect(righe.length).toBe(1);
    expect(somma(righe)).toBe(900);
    expect(righe[0].descrizione).toContain("Certificato di pagamento");
  });

  it("un verbale che non porta lavori nuovi non produce righe", () => {
    const s1 = sal(1, 1000, [voce("Scavi", 1000)]);
    const s2 = sal(2, 1000, [voce("Scavi", 1000)]);
    expect(righeSal(s2, [s1, s2], 22)).toEqual([]);
  });
});
