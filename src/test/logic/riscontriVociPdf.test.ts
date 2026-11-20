import { describe, expect, it } from "vitest";
import { parseContractExtract } from "@/lib/orders/contractExtract";
import { integraUnitaDalPdf } from "@/lib/orders/riscontriVociPdf";
const estratto = (extra = {}) => parseContractExtract({ voci: [{ descrizione: "A.1.01 Realizzazione pozzetto", quantita: 3, prezzo_unitario_eur: 150, ...extra }] });
describe("riscontri gratuiti delle unità mancanti sul PDF", () => {
  it("riconosce l'unità dopo prezzo e importi, senza ricavare pezzi dai numeri dell'importo", () => {
    const r = integraUnitaDalPdf(estratto(), ["A.1.01 Pozzetto 3 3 3 150,00 450,00 cadauno A.1.02 Altro"]);
    expect(r.estratto.voci[0].unita).toBe("cad");
  });
  it("cerca anche dopo un dettaglio numerico che somiglia al totale", () => {
    const e = estratto({ descrizione: "A.1.03 Rasatura", quantita: 300, prezzo_unitario_eur: 10.61 });
    expect(integraUnitaDalPdf(e, ["A.1.03 300.00 300,00 300,00 10,61 3.183,00 mq."]).estratto.voci[0].unita).toBe("mq");
  });
  it("trova quantità, unità e prezzo della stessa voce, anche se il codice è su due righe", () => {
    const e = estratto(), prima = JSON.stringify(e);
    const r = integraUnitaDalPdf(e, ["A.1. 01 Pozzetto finegronda 3 cadauno 150,00 450,00 A.1.02 Altro 20 m 45,00"]);
    expect(r.estratto.voci[0]).toMatchObject({ unita: "cad", quantita: 3, prezzo_unitario_eur: 150, codice: "A.1.01" });
    expect(r.riscontri[0]).toMatchObject({ pagina: 1, voce: 1 });
    expect(JSON.stringify(e)).toBe(prima);
  });
  it("legge l'ordine unità-quantità-prezzo e non trasforma la dicitura A CORPO in un pezzo", () => {
    const e = estratto({ descrizione: "1 Rimozione sanitari", quantita: 37, prezzo_unitario_eur: 92.4 });
    expect(integraUnitaDalPdf(e, ["A CORPO nr 37,00 € 92,40 € 3.418,80"]).estratto.voci[0].unita).toBe("cad");
  });
  it.each([
    "A.1.01 Pozzetto 3 mq 150,00 e 3 pz 150,00",
    "A.1.01 Pozzetto 3 pz 151,00",
    "A.1.01 Pozzetto 4 pz 150,00",
  ])("non completa dati ambigui o discordanti: %s", testo => {
    expect(integraUnitaDalPdf(estratto(), [testo]).riscontri).toEqual([]);
  });
  it("senza prezzo confrontabile non deduce l'unità dalle dimensioni nella descrizione", () => {
    expect(integraUnitaDalPdf(estratto({ prezzo_unitario_eur: null }), ["A.1.01 Tubo m 3 150"]).riscontri).toEqual([]);
  });
  it("conserva l'unità strutturata già letta", () => {
    expect(integraUnitaDalPdf(estratto({ unita: "cad" }), ["A.1.01 3 mq 150,00"]).estratto.voci[0].unita).toBe("cad");
  });
  it("recupera metri su una riga inclusa nel prezzo complessivo solo entro il suo codice", () => {
    const e = estratto({ descrizione: "CAVO DC FV 6MM - Fornitura e posa cavo solare", quantita: 70, prezzo_unitario_eur: 0 });
    const r = integraUnitaDalPdf(e, ["CAVO DC FV 6MM Fornitura e posa cavo 70 Metri 0,00 € 0,00 €"]);
    expect(r.estratto.voci[0]).toMatchObject({ unita: "m", quantita: 70, prezzo_unitario_eur: 0 });
    expect(integraUnitaDalPdf(estratto({ prezzo_unitario_eur: 0 }), ["Altro 3 pz 0,00"]).riscontri).toHaveLength(0);
  });
});
