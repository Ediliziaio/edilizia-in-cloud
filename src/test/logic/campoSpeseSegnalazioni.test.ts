import { describe, expect, it } from "vitest";
import { leggiImporto, percorsoScontrino, totaliSpese } from "@/lib/campo/spese";
import { dataServeEntro, statoSegnalazione } from "@/lib/campo/segnalazione";
import { passiFineGiornata } from "@/lib/campo/fineGiornata";

describe("Spese dell'operaio (24/11/2026)", () => {
  it("legge l'importo come lo scrive un operaio", () => {
    expect(leggiImporto("12,50")).toBe(12.5);
    expect(leggiImporto("12.50 €")).toBe(12.5);
    expect(leggiImporto("€ 1.234,5")).toBe(1234.5);
    expect(leggiImporto("1,234.50")).toBe(1234.5);
    expect(leggiImporto("80")).toBe(80);
    expect(leggiImporto("")).toBeNull();
    expect(leggiImporto("0")).toBeNull();
    expect(leggiImporto("abc")).toBeNull();
  });

  it("la foto va nella cartella azienda/utente (quella che il bucket permette)", () => {
    expect(percorsoScontrino("c1", "u1", "s1", "IMG 0001.JPG")).toBe("c1/u1/s1.jpg");
  });

  it("da rimborsare conta solo le spese approvate pagate di tasca propria", () => {
    expect(totaliSpese([
      { stato: "inviata", importo: 10, pagata_con: "soldi_miei" },
      { stato: "approvata", importo: 20.5, pagata_con: "soldi_miei" },
      { stato: "approvata", importo: 50, pagata_con: "carta_aziendale" },
      { stato: "rimborsata", importo: 99, pagata_con: "soldi_miei" },
    ])).toEqual({ inAttesa: 10, daRimborsare: 20.5 });
  });
});

describe("Segnalazioni: serve entro e stato", () => {
  it("oggi, domani, il venerdì di questa settimana", () => {
    const martedi = new Date(2026, 10, 24, 18, 30);
    expect(dataServeEntro("oggi", martedi)).toBe("2026-11-24");
    expect(dataServeEntro("domani", martedi)).toBe("2026-11-25");
    expect(dataServeEntro("settimana", martedi)).toBe("2026-11-27");
    expect(dataServeEntro("settimana", new Date(2026, 10, 28))).toBe("2026-11-28");
  });

  it("lo stato in parole dell'operaio", () => {
    expect(statoSegnalazione({ status: "aperto", merce_stato: "da_ordinare" }).testo).toBe("Inviata all'ufficio");
    expect(statoSegnalazione({ status: "aperto", merce_stato: "ordinata" }).testo).toBe("Materiale ordinato");
    expect(statoSegnalazione({ status: "in_lavorazione", merce_stato: "arrivata" })).toEqual({ testo: "Materiale arrivato", fatto: true });
    expect(statoSegnalazione({ status: "risolto", merce_stato: null }).fatto).toBe(true);
    expect(statoSegnalazione({ status: "in_lavorazione", merce_stato: null }).testo).toBe("L'ufficio ci sta lavorando");
  });
});

describe("Fine giornata guidata del caposquadra", () => {
  const base = { giorno: "2026-11-24", rapportiniInviati: new Set<string>(), timbra: true, dentro: true, haTimbratoOggi: true };
  it("un rapportino per ogni cantiere dove è capo, poi materiale e uscita", () => {
    const passi = passiFineGiornata({ ...base, cantieri: [
      { order_id: "o1", codice: "C-1", capo: true },
      { order_id: "o2", codice: "C-2", capo: false },
    ] });
    expect(passi.map(p => p.chiave)).toEqual(["rapportino:o1", "materiale", "uscita"]);
    expect(passi[0].link).toBe("/campo/lavoro/o1/rapportino?data=2026-11-24");
    expect(passi[1].link).toBe("/campo/ticket/nuovo/o1?tipo=materiale");
  });

  it("chi non timbra dall'app non ha il passo uscita; il rapportino inviato è spuntato", () => {
    const passi = passiFineGiornata({ ...base, timbra: false, rapportiniInviati: new Set(["o1"]),
      cantieri: [{ order_id: "o1", codice: null, capo: true }] });
    expect(passi.map(p => [p.chiave, p.fatto])).toEqual([["rapportino:o1", true], ["materiale", false]]);
  });

  it("già uscito: l'uscita è fatta", () => {
    const passi = passiFineGiornata({ ...base, dentro: false, cantieri: [{ order_id: "o1", codice: null, capo: true }] });
    expect(passi.find(p => p.chiave === "uscita")?.fatto).toBe(true);
  });
});

describe("Scontrino letto dall'AI: si scrive solo quello che ha senso", () => {
  it("tiene importo, data, tipo ed esercente puliti", async () => {
    const { pulisciScontrino } = await import("@/lib/campo/scontrinoLetto");
    expect(pulisciScontrino({ importo: 45.237, data: "2026-11-22", tipo: "carburante", esercente: " Q8 Bergamo " }, "2026-11-24"))
      .toEqual({ importo: 45.24, giorno: "2026-11-22", tipo: "carburante", esercente: "Q8 Bergamo" });
    expect(pulisciScontrino({ importo: "12,50" }, "2026-11-24").importo).toBe(12.5);
    // La pagina ripulisce di nuovo la risposta del server, che usa «giorno»: la data non si perde.
    const dalServer = pulisciScontrino({ importo: 55.5, data: "2026-11-22", tipo: "carburante" }, "2026-11-24");
    expect(pulisciScontrino(dalServer, "2026-11-24").giorno).toBe("2026-11-22");
  });

  it("scarta date future o troppo vecchie, tipi inventati, importi assurdi", async () => {
    const { pulisciScontrino } = await import("@/lib/campo/scontrinoLetto");
    expect(pulisciScontrino({ importo: 0, data: "2026-12-01", tipo: "benzina" }, "2026-11-24"))
      .toEqual({ importo: null, giorno: null, tipo: null, esercente: null });
    expect(pulisciScontrino({ data: "2024-01-01" }, "2026-11-24").giorno).toBeNull();
    expect(pulisciScontrino(null, "2026-11-24").importo).toBeNull();
  });
});
