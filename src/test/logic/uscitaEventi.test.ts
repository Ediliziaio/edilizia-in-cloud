/**
 * Termini di pagamento a fornitore.
 *
 * Il caso che conta è "60 gg fine mese": una fattura del 3 marzo si paga il 31
 * maggio, non il 2 maggio. Sbagliare quella regola significa pagare due mesi
 * prima del dovuto, e in edilizia due mesi di cassa sono tutto.
 *
 * Le stesse regole vivono in SQL (data_pagamento_uscita + v_uscite_stato).
 */
import { describe, it, expect } from "vitest";
import {
  dataPagamentoUscita,
  fineMese,
  messaggioUscita,
  statoUscita,
  termineLeggibile,
  etichettaEventoUscita,
  EVENTI_USCITA,
} from "@/lib/costi/uscitaEventi";

const BASI = {
  data_fattura: "2026-03-03",
  data_consegna: "2026-02-20",
  data_ordine: "2026-02-01",
  data_fine_lavori: "2026-06-30",
};

describe("fine mese", () => {
  it("prende l'ultimo giorno del mese, anche a febbraio", () => {
    expect(fineMese("2026-03-03")).toBe("2026-03-31");
    expect(fineMese("2026-02-10")).toBe("2026-02-28");
    // 2028 è bisestile: il 29 esiste.
    expect(fineMese("2028-02-10")).toBe("2028-02-29");
    expect(fineMese("2026-12-01")).toBe("2026-12-31");
  });
});

describe("data di pagamento dai termini", () => {
  it("30 giorni data fattura", () => {
    expect(dataPagamentoUscita("data_fattura", null, 30, BASI)).toBe("2026-04-02");
  });

  it("60 giorni fine mese: si parte dal 31 marzo, non dal 3", () => {
    // È l'errore classico: 3 marzo + 60 = 2 maggio. Il termine vero è 30 maggio.
    expect(dataPagamentoUscita("fine_mese_fattura", null, 60, BASI)).toBe("2026-05-30");
    expect(dataPagamentoUscita("fine_mese_fattura", null, 30, BASI)).toBe("2026-04-30");
  });

  it("consegna, ordine e fine lavori contano dalla loro data", () => {
    expect(dataPagamentoUscita("ricezione_merce", null, 30, BASI)).toBe("2026-03-22");
    expect(dataPagamentoUscita("data_ordine", null, 0, BASI)).toBe("2026-02-01");
    expect(dataPagamentoUscita("fine_lavori", null, 15, BASI)).toBe("2026-07-15");
  });

  it("a data fissa vince la data scritta sul costo", () => {
    expect(dataPagamentoUscita("data_fissa", "2026-05-10", 30, BASI)).toBe("2026-05-10");
    expect(dataPagamentoUscita(null, "2026-05-10", 30, BASI)).toBe("2026-05-10");
  });

  it("la sentinella 9999-12-31 non è una scadenza", () => {
    // I costi senza scadenza usano quella data: trattarla come vera significa
    // avere una previsione di cassa con un'uscita nell'anno 9999.
    expect(dataPagamentoUscita("data_fissa", "9999-12-31", 0, BASI)).toBeNull();
  });

  it("se la fattura non è ancora arrivata non si inventa una scadenza", () => {
    expect(dataPagamentoUscita("data_fattura", "2026-05-10", 30, { ...BASI, data_fattura: null })).toBeNull();
    expect(dataPagamentoUscita("ricezione_merce", null, 30, { ...BASI, data_consegna: null })).toBeNull();
  });

  it("se la fattura arriva in ritardo, la scadenza slitta con lei", () => {
    // È il punto di tutto: prima la data restava quella scritta a mano.
    const puntuale = dataPagamentoUscita("data_fattura", null, 30, BASI);
    const inRitardo = dataPagamentoUscita("data_fattura", null, 30, { ...BASI, data_fattura: "2026-03-13" });
    expect(puntuale).toBe("2026-04-02");
    expect(inRitardo).toBe("2026-04-12");
  });
});

describe("stato dell'uscita", () => {
  const oggi = new Date(2026, 2, 15); // 15 marzo 2026

  it("pagata vince su tutto", () => {
    expect(statoUscita({ isPaid: true, dataPagamento: "2026-01-01", oggi })).toBe("pagata");
  });

  it("distingue scaduta, preavviso e a posto", () => {
    expect(statoUscita({ isPaid: false, dataPagamento: "2026-03-14", oggi })).toBe("scaduta");
    expect(statoUscita({ isPaid: false, dataPagamento: "2026-03-20", oggi })).toBe("preavviso");
    expect(statoUscita({ isPaid: false, dataPagamento: "2026-04-30", oggi })).toBe("ok");
    expect(statoUscita({ isPaid: false, dataPagamento: null, oggi })).toBe("senza_data");
  });

  it("il preavviso è regolabile sul singolo costo", () => {
    expect(statoUscita({ isPaid: false, dataPagamento: "2026-03-25", giorniPreavviso: 3, oggi })).toBe("ok");
    expect(statoUscita({ isPaid: false, dataPagamento: "2026-03-25", giorniPreavviso: 15, oggi })).toBe("preavviso");
  });
});

describe("come si legge", () => {
  it("il termine si scrive come lo direbbe un fornitore", () => {
    expect(termineLeggibile("fine_mese_fattura", 60)).toBe("60 gg fine mese fattura");
    expect(termineLeggibile("data_fattura", 30)).toBe("30 gg data fattura");
    // Senza giorni resta solo la base, non "0 gg".
    expect(termineLeggibile("ricezione_merce", 0)).toBe("Alla consegna della merce");
    expect(termineLeggibile("data_fissa", 30)).toBe("A una data precisa");
    expect(etichettaEventoUscita("boh")).toBe("A una data precisa");
  });

  it("il messaggio parla di soldi che escono", () => {
    expect(messaggioUscita({ stato: "preavviso", giorni: 3, importoEur: 4200, fornitore: "Edilfer" }))
      .toContain("Escono");
    expect(messaggioUscita({ stato: "preavviso", giorni: 3, importoEur: 4200, fornitore: "Edilfer" }))
      .toContain("a Edilfer tra 3 giorni");
    expect(messaggioUscita({ stato: "scaduta", giorni: -5, importoEur: 4200 }))
      .toContain("da pagare da 5 giorni");
    expect(messaggioUscita({ stato: "ok", giorni: 40, importoEur: 4200 })).toBeNull();
    expect(messaggioUscita({ stato: "pagata", giorni: -5, importoEur: 4200 })).toBeNull();
  });

  it("gli identificativi coincidono con quelli ammessi dal database", () => {
    const ammessiDalDb = ["data_fissa", "data_fattura", "fine_mese_fattura", "ricezione_merce", "data_ordine", "fine_lavori"];
    expect([...EVENTI_USCITA.map((e) => e.value)].sort()).toEqual([...ammessiDalDb].sort());
  });
});
