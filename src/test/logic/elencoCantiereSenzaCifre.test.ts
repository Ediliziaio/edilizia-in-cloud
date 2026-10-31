import { describe, expect, it } from "vitest";
import { costruisciElencoCantiereHtml, elencoCantiereSenzaCifre, type DatiContrattoSubappalto } from "@/lib/subappaltatori/contrattoSubappaltoHtml";

const d = {
  committente: { ragioneSociale: "DIMORA SRL", partitaIva: "1", indirizzo: "", rappresentante: "" },
  subappaltatore: { ragioneSociale: "Il Termotecnico", partitaIva: "2", indirizzo: "", email: "", pec: "" },
  commessa: { codice: "O-0001", descrizione: "", indirizzoCantiere: "Via Lessona 25", cliente: "" },
  elencoLavori: [
    { fase: "Impianto gas", descrizione: "Linea gas", unita: "m", quantita: 12.5, prezzo: 40, importo: 500 },
    { fase: "Impianto gas", descrizione: "Contatore", unita: "cad", quantita: 1, prezzo: 120, importo: 120 },
  ],
} as unknown as DatiContrattoSubappalto;

describe("elenco lavori per il cantiere", () => {
  it("tiene lavori e quantità, non prezzi né importi", () => {
    const g = elencoCantiereSenzaCifre(d);
    expect(g).toHaveLength(1);
    expect(g[0].righe.map((r) => r.descrizione)).toEqual(["Linea gas", "Contatore"]);
    expect(g[0].righe[0].quantita).toBe("12,5");
    expect(JSON.stringify(g)).not.toMatch(/prezzo|importo|500|120|40/);
  });
  it("l'HTML non ha cifre in euro", () => {
    const h = costruisciElencoCantiereHtml(d);
    expect(h).toContain("Linea gas");
    expect(h).not.toContain("€");
    expect(h).not.toMatch(/Prezzo|Importo|Totale/);
  });
});
