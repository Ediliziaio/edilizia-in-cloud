/**
 * Rate ancorate agli eventi del cantiere.
 *
 * La regola che conta: l'avviso deve arrivare PRIMA che si parta coi lavori,
 * non dopo. Chi pianifica il cantiere con settimane di anticipo non vuole una
 * finestra di conferma il giorno in cui scrive la data — vuole un preavviso
 * mentre la data si avvicina.
 *
 * Le stesse regole vivono in SQL (data_attesa_rata + v_rate_commessa_stato).
 */
import { describe, it, expect } from "vitest";
import {
  dataAttesaRata,
  giorniAllEvento,
  messaggioRata,
  statoIncassoRata,
  etichettaEvento,
  EVENTI_RATA,
} from "@/lib/orders/rateEventi";

const CANTIERE = {
  created_at: "2026-01-10T09:00:00Z",
  warehouse_arrival_date: "2026-03-05",
  work_start_date: "2026-03-20",
  work_end_date: "2026-05-15",
  data_stato: "2026-02-28",
};

describe("data attesa dall'evento", () => {
  it("ogni evento pesca dalla sua data del cantiere", () => {
    expect(dataAttesaRata("firma_contratto", null, CANTIERE)).toBe("2026-01-10");
    expect(dataAttesaRata("merce_magazzino", null, CANTIERE)).toBe("2026-03-05");
    expect(dataAttesaRata("inizio_lavori", null, CANTIERE)).toBe("2026-03-20");
    expect(dataAttesaRata("fine_lavori", null, CANTIERE)).toBe("2026-05-15");
    expect(dataAttesaRata("stato_commessa", null, CANTIERE)).toBe("2026-02-28");
  });

  it("a data fissa vince la data scritta sulla rata", () => {
    expect(dataAttesaRata("data_fissa", "2026-04-01", CANTIERE)).toBe("2026-04-01");
    // Un evento non riconosciuto non deve inventare date: ricade sul campo.
    expect(dataAttesaRata(null, "2026-04-01", CANTIERE)).toBe("2026-04-01");
  });

  it("se sposti l'inizio lavori la rata lo segue: è il punto di tutto", () => {
    const prima = dataAttesaRata("inizio_lavori", "2026-01-01", CANTIERE);
    const dopo = dataAttesaRata("inizio_lavori", "2026-01-01", { ...CANTIERE, work_start_date: "2026-04-30" });
    expect(prima).toBe("2026-03-20");
    expect(dopo).toBe("2026-04-30");
  });

  it("un evento non ancora avvenuto non ha data, e non è un errore", () => {
    expect(dataAttesaRata("merce_magazzino", "2026-04-01", { ...CANTIERE, warehouse_arrival_date: null })).toBeNull();
    expect(dataAttesaRata("stato_commessa", null, { ...CANTIERE, data_stato: null })).toBeNull();
  });
});

describe("stato di incasso", () => {
  const oggi = new Date(2026, 2, 15); // 15 marzo 2026

  it("pagata vince su tutto", () => {
    expect(statoIncassoRata({ isPaid: true, dataAttesa: "2026-01-01", oggi })).toBe("pagata");
  });

  it("l'evento passato senza incasso è scaduta", () => {
    expect(statoIncassoRata({ isPaid: false, dataAttesa: "2026-03-14", oggi })).toBe("scaduta");
    expect(statoIncassoRata({ isPaid: false, dataAttesa: "2026-03-15", oggi })).toBe("scaduta");
  });

  it("dentro i giorni di preavviso è preavviso, fuori è a posto", () => {
    // Preavviso predefinito: 7 giorni.
    expect(statoIncassoRata({ isPaid: false, dataAttesa: "2026-03-20", oggi })).toBe("preavviso");
    expect(statoIncassoRata({ isPaid: false, dataAttesa: "2026-03-22", oggi })).toBe("preavviso");
    expect(statoIncassoRata({ isPaid: false, dataAttesa: "2026-03-23", oggi })).toBe("ok");
  });

  it("il preavviso è regolabile sulla singola rata", () => {
    // Tre giorni per la merce, dieci per l'inizio lavori: sono esigenze diverse.
    expect(statoIncassoRata({ isPaid: false, dataAttesa: "2026-03-20", giorniPreavviso: 3, oggi })).toBe("ok");
    expect(statoIncassoRata({ isPaid: false, dataAttesa: "2026-03-20", giorniPreavviso: 10, oggi })).toBe("preavviso");
    // Zero giorni = nessun preavviso, solo scaduta.
    expect(statoIncassoRata({ isPaid: false, dataAttesa: "2026-03-16", giorniPreavviso: 0, oggi })).toBe("ok");
  });

  it("senza data non si inventa un allarme", () => {
    expect(statoIncassoRata({ isPaid: false, dataAttesa: null, oggi })).toBe("senza_data");
  });
});

describe("giorni all'evento e messaggi", () => {
  const oggi = new Date(2026, 2, 15);

  it("conta i giorni, negativi se l'evento è passato", () => {
    expect(giorniAllEvento("2026-03-20", oggi)).toBe(5);
    expect(giorniAllEvento("2026-03-15", oggi)).toBe(0);
    expect(giorniAllEvento("2026-03-10", oggi)).toBe(-5);
    expect(giorniAllEvento(null, oggi)).toBeNull();
  });

  it("il messaggio parla del cantiere, non del database", () => {
    expect(messaggioRata({ stato: "preavviso", evento: "inizio_lavori", giorni: 5, importoEur: 8000 }))
      .toBe("Si parte tra 5 giorni e mancano 8000 €".replace("8000 €", (8000).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })));
    expect(messaggioRata({ stato: "preavviso", evento: "inizio_lavori", giorni: 1, importoEur: 8000 }))
      .toContain("Si parte domani");
    expect(messaggioRata({ stato: "scaduta", evento: "inizio_lavori", giorni: -3, importoEur: 8000 }))
      .toContain("Lavori avviati senza incassare");
    expect(messaggioRata({ stato: "scaduta", evento: "fine_lavori", giorni: -3, importoEur: 8000 }))
      .toContain("Lavori chiusi");
  });

  it("quando è tutto a posto non dice niente", () => {
    expect(messaggioRata({ stato: "ok", evento: "inizio_lavori", giorni: 30, importoEur: 8000 })).toBeNull();
    expect(messaggioRata({ stato: "pagata", evento: "inizio_lavori", giorni: -3, importoEur: 8000 })).toBeNull();
  });
});

describe("catalogo eventi", () => {
  it("ha le sei voci e nomi leggibili da un titolare, non da un tecnico", () => {
    expect(EVENTI_RATA).toHaveLength(6);
    expect(etichettaEvento("inizio_lavori")).toBe("Prima dell'inizio lavori");
    expect(etichettaEvento("merce_magazzino")).toBe("All'arrivo della merce");
    // Un valore sconosciuto non lascia il campo vuoto.
    expect(etichettaEvento("boh")).toBe("A una data precisa");
  });
});
