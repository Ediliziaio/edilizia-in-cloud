import { describe, expect, it } from "vitest";
import { aggregaProdotti, ricavoRiga, totaliProdotti, type RigaProdotto } from "@/lib/controlloGestione/prodottiMargine";
import { euroIntero, percIt } from "@/lib/controlloGestione/formatoCG";
import { erroreFinanziamento } from "@/lib/controlloGestione/finanziamenti";

const riga = (over: Partial<RigaProdotto>): RigaProdotto => ({
  order_item_id: "r", name: "Mattoni", categoria: "materiali", fase: "Opere murarie", fornitore: "Edilmateriali",
  article_template_id: null, costo_standard: 0, costo_reale: 60, fonte_costo: "manuale", ha_baseline_listino: false, ricavo: 100, ...over,
});

describe("margine sui materiali", () => {
  it("il ricavo toglie lo sconto di riga e ignora prezzi o quantità non validi", () => {
    expect(ricavoRiga(100, 3, 10)).toBe(270);
    expect(ricavoRiga("50", "2", null)).toBe(100);
    expect(ricavoRiga(null, 2, 0)).toBe(0);
    expect(ricavoRiga(10, -1, 0)).toBe(0);
  });

  it("un costo senza prezzo di vendita resta a parte e non diventa margine negativo", () => {
    const agg = aggregaProdotti([
      riga({}),
      riga({ order_item_id: "f", name: "FINESTRA 1 ANTA", ricavo: 0, costo_reale: 1480 }),
    ], "fase");
    expect(agg).toHaveLength(1);
    expect(agg[0]).toMatchObject({ ricavo: 100, costo_con_ricavo: 60, margine: 40, costo_senza_ricavo: 1480, righe_senza_ricavo: 1 });
    expect(agg[0].margine_perc).toBe(40);
    const t = totaliProdotti([riga({}), riga({ order_item_id: "f", ricavo: 0, costo_reale: 1480 })]);
    expect(t).toMatchObject({ margine: 40, costo_senza_ricavo: 1480, costo_reale: 1540 });
  });

  it("raggruppa per fase, fornitore, prodotto o categoria con nomi leggibili quando mancano", () => {
    const righe = [riga({}), riga({ order_item_id: "b", fase: null, fornitore: null })];
    expect(aggregaProdotti(righe, "fase").map((a) => a.label).sort()).toEqual(["Opere murarie", "Senza fase"]);
    expect(aggregaProdotti(righe, "fornitore").map((a) => a.label).sort()).toEqual(["Edilmateriali", "Senza fornitore"]);
    expect(aggregaProdotti(righe, "prodotto")).toHaveLength(1);
  });

  it("la differenza dal listino si calcola solo sulle righe che hanno un costo di listino", () => {
    const agg = aggregaProdotti([
      riga({ ha_baseline_listino: true, costo_standard: 50, costo_reale: 60 }),
      riga({ order_item_id: "x", costo_reale: 900 }),
    ], "fase");
    expect(agg[0].scostamento).toBe(10);
    expect(agg[0].scostamento_perc).toBe(20);
    expect(totaliProdotti([riga({ costo_reale: 900 })]).scostamento_perc).toBeNull();
  });
});

describe("formati del Controllo di gestione", () => {
  it("importi interi con il punto e percentuali con la virgola", () => {
    expect(euroIntero(1234567.4)).toBe("1.234.567 €");
    expect(euroIntero(-164000)).toBe("-164.000 €");
    expect(euroIntero(-0.2)).toBe("0 €");
    expect(percIt(18.56)).toBe("18,6%");
    expect(percIt(3.9, 2)).toBe("3,90%");
    expect(percIt(null)).toBe("—");
  });
});

describe("controlli del finanziamento", () => {
  const ok = { banca: "Banca", capitale_iniziale: 100, capitale_residuo: 50, rata_mensile: 5, durata_mesi: 24, rate_pagate: 2, data_inizio: "2026-01-01", data_fine: "2028-01-01" };
  it("accetta dati coerenti e spiega quelli sbagliati", () => {
    expect(erroreFinanziamento(ok)).toBeNull();
    expect(erroreFinanziamento({ ...ok, banca: " " })).toMatch(/banca/);
    expect(erroreFinanziamento({ ...ok, capitale_residuo: 200 })).toMatch(/residuo/);
    expect(erroreFinanziamento({ ...ok, rate_pagate: 30 })).toMatch(/durata/);
    expect(erroreFinanziamento({ ...ok, data_fine: "2025-01-01" })).toMatch(/fine/);
  });
});
