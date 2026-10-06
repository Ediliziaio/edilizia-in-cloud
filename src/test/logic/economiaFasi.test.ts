import { describe, expect, it } from "vitest";
import {
  costoConsuntivoRighe,
  costoPrevistoRiga,
  economiaFasi,
  vendutoRiga,
  type AssegnazioneFase,
  type RigaContrattoFase,
} from "@/lib/orders/economiaFasi";

/**
 * Economia delle lavorazioni (06/10/2026): per ogni fase venduto, costo
 * previsto e costo consuntivo, con le regole del conto economico della
 * commessa (v_ordine_marginalita).
 */

const riga = (extra: Partial<RigaContrattoFase>): RigaContrattoFase => ({
  id: "r", phase_id: "f1", quantity: 1, unit_price: 0, discount_percent: 0, purchase_price: null, standard_cost: null,
  ...extra,
});
const persona = (extra: Partial<AssegnazioneFase>): AssegnazioneFase => ({
  phase_id: "f1", source: "employee", cost_preventivo: 0, cost_consuntivo: 0, ...extra,
});

describe("le righe del contratto", () => {
  it("il venduto è prezzo × quantità meno lo sconto di riga", () => {
    expect(vendutoRiga({ quantity: 10, unit_price: 50, discount_percent: 10 })).toBe(450);
    expect(vendutoRiga({ quantity: 2, unit_price: 100, discount_percent: null })).toBe(200);
  });

  it("il costo previsto è il costo d'acquisto, e se manca quello standard", () => {
    expect(costoPrevistoRiga({ quantity: 3, purchase_price: 20, standard_cost: 25 })).toBe(60);
    expect(costoPrevistoRiga({ quantity: 3, purchase_price: 0, standard_cost: 25 })).toBe(75);
    expect(costoPrevistoRiga({ quantity: 3, purchase_price: null, standard_cost: null })).toBe(0);
  });

  it("il consuntivo: acquisti emessi, e magazzino solo per le righe che un acquisto non copre", () => {
    const costo = costoConsuntivoRighe(
      [{ order_item_id: "a", line_total: 300 }, { order_item_id: "a", line_total: 50 }, { order_item_id: null, line_total: 999 }],
      [
        { order_item_id: "a", movement_type: "scarico", quantity: 5, unit_cost: 10 }, // coperta dall'OdA: non conta
        { order_item_id: "b", movement_type: "scarico", quantity: 4, unit_cost: 12 },
        { order_item_id: "b", movement_type: "carico", quantity: 1, unit_cost: 12 }, // reso
        { order_item_id: "c", movement_type: "carico", quantity: 2, unit_cost: 10 }, // solo resi: mai sotto zero
      ],
    );
    expect(costo.get("a")).toBe(350);
    expect(costo.get("b")).toBe(36);
    expect(costo.get("c")).toBe(0);
  });
});

describe("economia di ogni fase", () => {
  const fasi = [{ id: "f1" }, { id: "f2" }];

  it("venduto, costo previsto e consuntivo, con le voci e i margini", () => {
    const { perFase } = economiaFasi({
      fasi,
      righe: [
        riga({ id: "r1", quantity: 10, unit_price: 100, discount_percent: 0, purchase_price: 40 }), // venduto 1000, previsto 400
        riga({ id: "r2", phase_id: "f2", quantity: 1, unit_price: 500 }),
      ],
      assegnazioni: [
        persona({ cost_preventivo: 200, cost_consuntivo: 260 }),
        persona({ source: "team", cost_preventivo: 150, cost_consuntivo: 100 }),
      ],
      acquisti: [{ order_item_id: "r1", line_total: 420 }],
      movimenti: [],
    });
    const f1 = perFase.get("f1")!;
    expect(f1.venduto).toBe(1000);
    expect(f1.previsto).toEqual({ manodopera: 200, ditte: 150, materiali: 400 });
    expect(f1.consuntivo).toEqual({ manodopera: 260, ditte: 100, materiali: 420 });
    expect(f1.costoPrevisto).toBe(750);
    expect(f1.costoConsuntivo).toBe(780);
    expect(f1.scostamento).toBe(30);
    expect(f1.marginePrevistoPct).toBe(25);
    expect(f1.margineConsuntivoPct).toBe(22);
    expect(f1.righe).toBe(1);
    expect(perFase.get("f2")!.venduto).toBe(500);
  });

  it("senza venduto i margini non si dicono", () => {
    const { perFase } = economiaFasi({ fasi, righe: [], assegnazioni: [persona({ cost_preventivo: 100 })] });
    expect(perFase.get("f1")!.marginePrevistoPct).toBeNull();
    expect(perFase.get("f1")!.margineConsuntivoPct).toBeNull();
    expect(perFase.get("f2")!.costoPrevisto).toBe(0);
  });

  it("righe e persone senza fase, o di una fase che non c'è più, restano della commessa", () => {
    const { senzaFase, totaleFasi } = economiaFasi({
      fasi,
      righe: [riga({ id: "r1", phase_id: null, unit_price: 300 }), riga({ id: "r2", phase_id: "sparita", unit_price: 200 }), riga({ id: "r3", unit_price: 100 })],
      assegnazioni: [persona({ phase_id: null, cost_consuntivo: 80 })],
    });
    expect(senzaFase.venduto).toBe(500);
    expect(senzaFase.costoConsuntivo).toBe(80);
    expect(senzaFase.righe).toBe(2);
    expect(totaleFasi.venduto).toBe(100);
  });

  it("il venduto scritto sulla fase vale più delle righe; quello delle righe resta da confrontare", () => {
    const { perFase } = economiaFasi({
      fasi: [{ id: "f1", importo_venduto: 8000 }, { id: "f2", importo_venduto: null }],
      righe: [riga({ id: "r1", quantity: 2, unit_price: 1500 }), riga({ id: "r2", phase_id: "f2", quantity: 4, unit_price: 250 })],
      assegnazioni: [persona({ cost_preventivo: 6000, cost_consuntivo: 6600 })],
    });
    expect(perFase.get("f1")).toMatchObject({ venduto: 8000, fonteVenduto: "fase", vendutoRighe: 3000, marginePrevistoPct: 25, margineConsuntivoPct: 17.5 });
    expect(perFase.get("f2")).toMatchObject({ venduto: 1000, fonteVenduto: "righe", vendutoRighe: 1000 });
  });

  it("righe collegate senza prezzo di vendita (i materiali) non fanno un venduto di zero: non c'è", () => {
    const { perFase, fasiSenzaVenduto, totaleFasi } = economiaFasi({
      fasi: [{ id: "f1" }, { id: "f2", importo_venduto: 0 }, { id: "f3", importo_venduto: 4500 }],
      righe: [riga({ id: "r1", quantity: 60, unit_price: 0, purchase_price: 8 })],
      assegnazioni: [],
    });
    expect(perFase.get("f1")).toMatchObject({ venduto: 0, fonteVenduto: null, righe: 1, costoPrevisto: 480 });
    // zero scritto apposta è un venduto (lavorazione in omaggio), non un dato che manca
    expect(perFase.get("f2")).toMatchObject({ venduto: 0, fonteVenduto: "fase" });
    expect(fasiSenzaVenduto).toBe(1);
    expect(totaleFasi).toMatchObject({ venduto: 4500, fonteVenduto: "fase" });
  });

  it("il totale delle fasi somma le fasi", () => {
    const { totaleFasi } = economiaFasi({
      fasi,
      righe: [riga({ id: "r1", unit_price: 100, purchase_price: 30 }), riga({ id: "r2", phase_id: "f2", unit_price: 0.1, purchase_price: 0.2 })],
      assegnazioni: [persona({ phase_id: "f2", cost_preventivo: 0.1, cost_consuntivo: 0.2 })],
    });
    expect(totaleFasi.venduto).toBe(100.1);
    expect(totaleFasi.costoPrevisto).toBe(30.3);
    expect(totaleFasi.costoConsuntivo).toBe(0.2);
  });
});
