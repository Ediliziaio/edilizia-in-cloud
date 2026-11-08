/**
 * Il cruscotto del fabbisogno: entro quando ordinare e quanto è urgente.
 * Le date vengono da materiali_riconciliazione_azienda (20281222200000),
 * provata nel database il 07/11/2026: fase che inizia fra 3 giorni, fornitore
 * con 10 giorni di consegna → «ordina entro» 7 giorni fa, in ritardo.
 */
import { describe, expect, it } from "vitest";
import { quantitaDaOrdinare } from "@/lib/orders/createMaterialPurchaseOrder";
import { giorniAlLimite, linkMateriali, raggruppaPerUrgenza, testoLimite, urgenza, type RigaFabbisogno } from "@/lib/acquisti/fabbisogno";

const riga = (p: Partial<RigaFabbisogno>): RigaFabbisogno => ({
  order_item_id: "i", order_id: "o", commessa: "C-001", phase_id: "f", fase: "Isolamento", name: "EPS", unita_misura: "mq",
  supplier_id: "s", fornitore: "Fornitore", previsto: 100, ordinato: 0, in_bozza: 0, ricevuto: 0, residuo: 100, eccedenza: 0,
  unita_diversa: false, stato: "da_ordinare", data_serve: "2026-11-10", giorni_consegna: 10, ordina_entro: "2026-10-31", ...p,
});
const oggi = "2026-11-07";

describe("fabbisogno: urgenza", () => {
  it("in ritardo, entro 7, entro 30, più avanti, senza data", () => {
    expect(urgenza(riga({ ordina_entro: "2026-10-31" }), oggi)).toBe("ritardo");
    expect(urgenza(riga({ ordina_entro: "2026-11-07" }), oggi)).toBe("settimana");
    expect(urgenza(riga({ ordina_entro: "2026-11-14" }), oggi)).toBe("settimana");
    expect(urgenza(riga({ ordina_entro: "2026-11-15" }), oggi)).toBe("mese");
    expect(urgenza(riga({ ordina_entro: "2026-12-30" }), oggi)).toBe("dopo");
    expect(urgenza(riga({ ordina_entro: null }), oggi)).toBe("senza_data");
  });

  it("niente da ordinare ma ordinato in più o in un'altra unità: da verificare, non urgente", () => {
    expect(urgenza(riga({ residuo: 0, eccedenza: 2, stato: "ordinato" }), oggi)).toBe("da_verificare");
    expect(urgenza(riga({ residuo: 3, stato: "consegnato", unita_diversa: true }), oggi)).toBe("da_verificare");
  });

  it("i gruppi escono nell'ordine dell'urgenza, e dentro per data", () => {
    const g = raggruppaPerUrgenza([
      riga({ order_item_id: "b", ordina_entro: "2026-12-30" }),
      riga({ order_item_id: "a", ordina_entro: "2026-11-02" }),
      riga({ order_item_id: "c", ordina_entro: "2026-10-20" }),
    ], oggi);
    expect(g.map((x) => x.urgenza)).toEqual(["ritardo", "dopo"]);
    expect(g[0].righe.map((r) => r.order_item_id)).toEqual(["c", "a"]);
  });

  it("le parole del limite", () => {
    expect(giorniAlLimite("2026-11-10", oggi)).toBe(3);
    expect(testoLimite("2026-11-10", oggi)).toBe("fra 3 giorni");
    expect(testoLimite("2026-11-07", oggi)).toBe("oggi");
    expect(testoLimite("2026-11-03", oggi)).toBe("da 4 giorni");
    expect(testoLimite(null, oggi)).toMatch(/senza data/);
  });

  it("«Ordina» porta ai materiali della commessa, sulla fase", () => {
    expect(linkMateriali({ order_id: "o1", phase_id: "f1" })).toBe("/azienda/ordini/o1?tab=articoli&vista_materiali=articoli&fase=f1");
  });
});


describe("ordine parziale", () => {
  const voce = { id: "r", name: "Rete", quantity: 253.59, supplier_id: "s" };
  it("senza scelta si ordina tutto il residuo; con una scelta solo quella", () => {
    expect(quantitaDaOrdinare(voce, undefined).quantity).toBe(253.59);
    expect(quantitaDaOrdinare(voce, 200).quantity).toBe(200);
  });
  it("mai oltre il residuo, mai zero", () => {
    expect(() => quantitaDaOrdinare(voce, 300)).toThrow(/al massimo 253,59/);
    expect(() => quantitaDaOrdinare(voce, 0)).toThrow(/maggiore di zero/);
  });
  it("con la distinta delle posizioni si ordina intero", () => {
    expect(quantitaDaOrdinare({ ...voce, posizioni: [{ descrizione: "P1", quantita: 253.59 }] }, 100).quantity).toBe(253.59);
  });
});
