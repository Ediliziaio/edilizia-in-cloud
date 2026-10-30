import { describe, expect, it } from "vitest";
import { economiaFasi, type AssegnazioneFase, type VocePrevistaFase } from "@/lib/orders/economiaFasi";
import { conIva, costoDaVoci, origineCostoDitta, quantitaDellaTariffa } from "@/lib/orders/costoDitta";
import { fontePrevistoTesto } from "@/components/orders/EconomiaFaseRiga";
import { formatCurrency } from "@/lib/formatters";

/**
 * Costo previsto delle lavorazioni dalle voci del preventivo e dal listino
 * manodopera (29/10/2026, Dimora Torino). Il caso vero: commessa O-0001, 13
 * lavorazioni dal computo RST-2026-010, una ditta su ognuna con previsto 0.
 */

const voce = (extra: Partial<VocePrevistaFase>): VocePrevistaFase => ({
  phase_id: "demolizione", quantita: 1, costo_manodopera: 0, costo_materiali: 0, ...extra,
});
const ditta = (extra: Partial<AssegnazioneFase>): AssegnazioneFase => ({
  phase_id: "demolizione", source: "team", cost_preventivo: 0, cost_consuntivo: 0, ...extra,
});

describe("il previsto di una lavorazione nata dal preventivo", () => {
  it("con la ditta senza previsto vale il lavoro delle voci, senza IVA e sotto le ditte", () => {
    const e = economiaFasi({
      fasi: [{ id: "demolizione", importo_venduto: 9941.35 }],
      righe: [],
      assegnazioni: [ditta({})],
      vociPreviste: [
        voce({ quantita: 14.55, costo_manodopera: 15 }),
        voce({ quantita: 59, costo_manodopera: 12 }),
        voce({ quantita: 18, costo_manodopera: 50 }),
      ],
    }).perFase.get("demolizione")!;
    expect(e.previsto).toEqual({ manodopera: 0, ditte: 1826.25, materiali: 0 });
    expect(e.costoPrevisto).toBe(1826.25);
    expect(e.fontePrevisto).toEqual({ lavoro: "preventivo", materiali: null });
    expect(e.vociPreviste).toBe(3);
    expect(e.marginePrevistoPct).toBe(81.6);
    expect(fontePrevistoTesto(e)).toBe("dal preventivo, 3 voci");
  });

  it("senza ditte il lavoro del preventivo va alla manodopera", () => {
    const e = economiaFasi({ fasi: [{ id: "demolizione" }], righe: [], assegnazioni: [], vociPreviste: [voce({ quantita: 2, costo_manodopera: 100 })] })
      .perFase.get("demolizione")!;
    expect(e.previsto.manodopera).toBe(200);
    expect(e.previsto.ditte).toBe(0);
  });

  it("appena un'assegnazione ha un previsto, vale quello: mai sommato alle voci", () => {
    const e = economiaFasi({
      fasi: [{ id: "demolizione" }],
      righe: [],
      assegnazioni: [ditta({ cost_preventivo: 1220 })],
      vociPreviste: [voce({ quantita: 10, costo_manodopera: 150 })],
    }).perFase.get("demolizione")!;
    expect(e.previsto.ditte).toBe(1000); // 1.220 IVA inclusa → 1.000 senza
    expect(e.fontePrevisto.lavoro).toBe("assegnazioni");
    expect(fontePrevistoTesto(e)).toBe("da persone e ditte");
  });

  it("i materiali delle voci valgono solo se nessuna riga collegata ha un costo", () => {
    const conRiga = economiaFasi({
      fasi: [{ id: "demolizione" }],
      righe: [{ id: "r", phase_id: "demolizione", quantity: 4, unit_price: 0, discount_percent: 0, purchase_price: 25, standard_cost: null }],
      assegnazioni: [],
      vociPreviste: [voce({ quantita: 2, costo_manodopera: 10, costo_materiali: 30 })],
    }).perFase.get("demolizione")!;
    expect(conRiga.previsto).toEqual({ manodopera: 20, ditte: 0, materiali: 100 });
    expect(conRiga.fontePrevisto).toEqual({ lavoro: "preventivo", materiali: "righe" });
    expect(fontePrevistoTesto(conRiga)).toBe("lavoro dal preventivo · materiali dalle righe");

    const senza = economiaFasi({ fasi: [{ id: "demolizione" }], righe: [], assegnazioni: [], vociPreviste: [voce({ quantita: 2, costo_materiali: 30 })] })
      .perFase.get("demolizione")!;
    expect(senza.previsto.materiali).toBe(60);
    expect(senza.fontePrevisto.materiali).toBe("preventivo");
  });

  it("nel totale le fonti diverse diventano «misto», e le voci di fasi sconosciute non contano", () => {
    const t = economiaFasi({
      fasi: [{ id: "a" }, { id: "b" }],
      righe: [],
      assegnazioni: [ditta({ phase_id: "a", cost_preventivo: 122 })],
      vociPreviste: [voce({ phase_id: "b", quantita: 1, costo_manodopera: 50 }), voce({ phase_id: "altra", quantita: 1, costo_manodopera: 999 })],
    }).totaleFasi;
    expect(t.costoPrevisto).toBe(150);
    expect(t.fontePrevisto.lavoro).toBe("misto");
  });
});

describe("il previsto della ditta", () => {
  it("il listino è senza IVA: sulla ditta si scrive con l'IVA", () => {
    expect(conIva(1000)).toBe(1220);
    expect(conIva(1000, 0)).toBe(1000);
    expect(conIva(1000, 10)).toBe(1100);
  });

  it("dalle voci della lavorazione, al prezzo che quella ditta ha sul listino quando c'è", () => {
    const voci = [
      { quantita: 10, costo_manodopera: 15, tariffa_id: "t1" },
      { quantita: 2, costo_manodopera: 100, tariffa_id: "t2" },
      { quantita: 3, costo_manodopera: 0, tariffa_id: null }, // senza costo: non conta
    ];
    const varianti = [
      { tariffa_id: "t1", external_team_id: "decoredil", costo: 12, is_default: true },
      { tariffa_id: "t1", external_team_id: "altra", costo: 99 },
    ];
    expect(costoDaVoci(voci, varianti, "decoredil")).toEqual({ netto: 320, voci: 2, conVariante: 1 });
    expect(costoDaVoci(voci, varianti, null)).toEqual({ netto: 350, voci: 2, conVariante: 0 });
  });

  it("la quantità da proporre è quella della voce con la stessa tariffa", () => {
    const voci = [
      { quantita: 87.48, costo_manodopera: 28.5, tariffa_id: "massetto" },
      { quantita: 12.52, costo_manodopera: 28.5, tariffa_id: "massetto" },
      { quantita: 5, costo_manodopera: 10, tariffa_id: "altro" },
    ];
    expect(quantitaDellaTariffa(voci, "massetto")).toBe(100);
    expect(quantitaDellaTariffa(voci, "nessuna")).toBeNull();
  });

  it("la riga della ditta dice da dove viene il previsto", () => {
    expect(origineCostoDitta({ cost_preventivo: 266.22, costo_origine: "listino", quantita: 14.55, costo_unitario: 15, vat_rate: 22 }))
      .toBe(`Previsto dal listino: 14,55 × ${formatCurrency(15)} + IVA 22%`);
    expect(origineCostoDitta({ cost_preventivo: 1000, costo_origine: "preventivo" })).toBe("Previsto dalle voci del preventivo + IVA 22%");
    expect(origineCostoDitta({ cost_preventivo: 1000, costo_origine: "manuale" })).toBe("Previsto scritto a mano");
    expect(origineCostoDitta({ cost_preventivo: 0, costo_origine: "listino" })).toBeNull();
    expect(origineCostoDitta({ cost_preventivo: 1000, costo_origine: null })).toBeNull();
  });
});
