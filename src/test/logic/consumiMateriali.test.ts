import { describe, expect, it } from "vitest";
import { bilancioPosa, consumiPerArticolo } from "@/lib/distinta/consumiMateriali";

const unita = new Map<string, string | null>([["cem", "sacco"], ["corpo", "a corpo"], ["pz", null]]);
const r = (stato: string, ...mat: Record<string, unknown>[]) => ({ stato, materiali_usati: mat });

describe("consumi dai rapportini", () => {
  it("somma i posati per articolo e per fase, solo dai rapportini approvati", () => {
    const c = consumiPerArticolo([
      r("approvato", { order_item_id: "cem", quantita: 3, unita: "sacchi", fase_id: "murarie" }),
      r("approvato", { order_item_id: "cem", quantita: "5", unita: "sacco", fase_id: "finiture" }),
      r("inviato", { order_item_id: "cem", quantita: 40, unita: "sacco", fase_id: "finiture" }),
      r("rifiutato", { order_item_id: "cem", quantita: 40 }),
    ], unita).get("cem")!;
    expect(c.posati).toBe(8);
    expect(c.perFase.get("murarie")).toBe(3);
    expect(c.perFase.get("finiture")).toBe(5);
    expect(c.rapportini).toBe(2);
  });

  it("un'unità diversa si tiene a parte e non si confronta", () => {
    const c = consumiPerArticolo([r("approvato", { order_item_id: "corpo", quantita: 120, unita: "sacco" })], unita).get("corpo")!;
    expect(c.posati).toBe(0);
    expect(c.altreUnita.get("sacco")).toBe(120);
  });

  it("senza unità nel rapportino vale quella dell'articolo; righe di altre commesse o illeggibili si saltano", () => {
    const m = consumiPerArticolo([r("approvato",
      { order_item_id: "pz", quantita: 2 }, { order_item_id: "altro", quantita: 9 }, { order_item_id: "pz", quantita: "tanti" }, { quantita: 4 },
    )], unita);
    expect(m.get("pz")!.posati).toBe(2);
    expect(m.has("altro")).toBe(false);
  });
});

describe("bilancio della posa", () => {
  it("10 comprati, 8 posati: ne avanzano 2 da far rientrare", () => {
    expect(bilancioPosa(10, "sacco", 8, 0)).toMatchObject({ confrontabile: true, avanzano: 2, tuttoPosato: false });
  });
  it("con i 2 rientrati in magazzino è chiuso", () => {
    expect(bilancioPosa(10, "sacco", 8, 2)).toMatchObject({ avanzano: 0, tuttoPosato: true });
  });
  it("posati più dei previsti: segnalato", () => {
    expect(bilancioPosa(10, "sacco", 12, 0)).toMatchObject({ avanzano: 0, tuttoPosato: true, oltre: true });
  });
  it("«a corpo» non si confronta", () => {
    expect(bilancioPosa(1, "a corpo", 0, 0).confrontabile).toBe(false);
  });
});

import { economiaFasi } from "@/lib/orders/economiaFasi";

describe("costo per fase dal posato", () => {
  const fasi = [{ id: "murarie" }, { id: "finiture" }];
  const riga = { id: "cem", phase_id: "murarie", quantity: 10, unit_price: 0, discount_percent: 0, purchase_price: 10, standard_cost: 0 };
  const acquisti = [{ order_item_id: "cem", quantity: 10, line_total: 100 }];
  const posa = new Map([["cem", new Map<string | null, number>([["murarie", 3], ["finiture", 5]])]]);

  it("10 sacchi da 100 €, 3 posati sulle murarie e 5 sulle finiture: i 2 avanzati restano alla fase della riga", () => {
    const e = economiaFasi({ fasi, righe: [riga], assegnazioni: [], acquisti, movimenti: [], posaPerFase: posa });
    expect(e.perFase.get("murarie")!.consuntivo.materiali).toBe(50);
    expect(e.perFase.get("finiture")!.consuntivo.materiali).toBe(50);
  });

  it("rientrati i 2 in magazzino, la commessa paga 80 €, divisi 30 e 50", () => {
    const movimenti = [{ order_item_id: "cem", movement_type: "carico", quantity: 2, unit_cost: 10, rientro_commessa: true }];
    const e = economiaFasi({ fasi, righe: [riga], assegnazioni: [], acquisti, movimenti, posaPerFase: posa });
    expect(e.perFase.get("murarie")!.consuntivo.materiali).toBe(30);
    expect(e.perFase.get("finiture")!.consuntivo.materiali).toBe(50);
    expect(e.totaleFasi.consuntivo.materiali).toBe(80);
  });

  it("senza posato il costo resta alla fase della riga, come prima", () => {
    const e = economiaFasi({ fasi, righe: [riga], assegnazioni: [], acquisti, movimenti: [] });
    expect(e.perFase.get("murarie")!.consuntivo.materiali).toBe(100);
    expect(e.perFase.get("finiture")!.consuntivo.materiali).toBe(0);
  });
});

import { statoInCantiere } from "@/lib/distinta/statoMateriale";

describe("stato per chi va in cantiere", () => {
  it("posato, arrivato, in parte, non arrivato", () => {
    expect(statoInCantiere({ status: "installato" }, [])).toBe("posato");
    expect(statoInCantiere({ status: "in_magazzino" }, [])).toBe("arrivato");
    expect(statoInCantiere({ status: "da_ordinare" }, [{ quantity: 10, quantity_received: 10 }])).toBe("arrivato");
    expect(statoInCantiere({ status: "ordinato" }, [{ quantity: 10, quantity_received: 4 }])).toBe("arrivato_in_parte");
    expect(statoInCantiere({ status: "ordinato" }, [{ quantity: 10, quantity_received: 0 }])).toBe("non_arrivato");
    expect(statoInCantiere({ status: null }, [])).toBe("non_arrivato");
  });
});

describe("articolo a corpo con più prodotti di magazzino", () => {
  it("cemento, malta e rasante non si sommano: sono componenti, uno per uno", () => {
    const c = consumiPerArticolo([r("approvato",
      { order_item_id: "corpo", stock_item_id: "s-cem", nome: "DEMO · Cemento 32.5", quantita: 105, unita: "sacchi" },
      { order_item_id: "corpo", stock_item_id: "s-mal", nome: "Malta premiscelata", quantita: 78, unita: "sacchi" },
      { order_item_id: "corpo", stock_item_id: "s-cem", nome: "DEMO · Cemento 32.5", quantita: 5, unita: "sacco" },
    )], new Map([["corpo", { unita: "a corpo" }]])).get("corpo")!;
    expect(c.posati).toBe(0);
    expect(c.altreUnita.size).toBe(0);
    expect(c.componenti.get("Cemento 32.5|sacco")).toEqual({ quantita: 110, unita: "sacco" });
    expect(c.componenti.get("Malta premiscelata|sacco")).toEqual({ quantita: 78, unita: "sacco" });
  });

  it("lo stesso prodotto dell'articolo conta come posato", () => {
    const c = consumiPerArticolo([r("approvato", { order_item_id: "cem", stock_item_id: "s-cem", quantita: 8, unita: "sacchi" })],
      new Map([["cem", { unita: "sacco", stock: "s-cem" }]])).get("cem")!;
    expect(c.posati).toBe(8);
  });
});

describe("costo per fase: i casi della revisione del 30/10", () => {
  const fasi = [{ id: "A" }, { id: "B" }];
  const riga = { id: "r", phase_id: "A", quantity: 10, unit_price: 0, discount_percent: 0, purchase_price: 10, standard_cost: 0 };

  it("posato senza fase: il costo resta alla fase della riga, non finisce fuori dalle fasi", () => {
    const e = economiaFasi({ fasi, righe: [riga], assegnazioni: [], acquisti: [{ order_item_id: "r", quantity: 10, line_total: 100 }], movimenti: [],
      posaPerFase: new Map([["r", new Map<string | null, number>([[null, 8]])]]) });
    expect(e.perFase.get("A")!.consuntivo.materiali).toBe(100);
    expect(e.senzaFase.consuntivo.materiali).toBe(0);
  });

  it("la base è il comprato: ordinati 5 su 10, tutti e 5 posati sulla B → 50 € alla B", () => {
    const e = economiaFasi({ fasi, righe: [riga], assegnazioni: [], acquisti: [{ order_item_id: "r", quantity: 5, line_total: 50 }], movimenti: [],
      posaPerFase: new Map([["r", new Map<string | null, number>([["B", 5]])]]) });
    expect(e.perFase.get("B")!.consuntivo.materiali).toBe(50);
    expect(e.perFase.get("A")!.consuntivo.materiali).toBe(0);
  });
});
