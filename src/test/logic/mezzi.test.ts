import { describe, it, expect } from "vitest";
import {
  dataLetta,
  numeroLetto,
  testoLetto,
  costoAnnuoMezzo,
  giorniSovrapposti,
  periodiDelGiorno,
  aggiungiAnni,
  aggiungiGiorni,
  descriviScadenza,
  documentiConStato,
  formatContatore,
  giorniTra,
  oggiIso,
  prossimoTagliando,
  statoPerData,
  statoPeggiore,
  type MezzoDocumentoCategoria,
} from "@/types/mezzi";

// Stesse regole della vista mezzi_scadenze (migrazione 20280924150000): questi
// casi sono quelli provati sul database il 24/09/2026.
const OGGI = "2026-09-24";

describe("date", () => {
  it("oggiIso usa la data locale, non l'UTC", () => {
    expect(oggiIso(new Date(2026, 8, 24, 23, 30))).toBe("2026-09-24");
  });
  it("aggiungiGiorni attraversa mesi e anni", () => {
    expect(aggiungiGiorni("2026-12-25", 10)).toBe("2027-01-04");
    expect(aggiungiGiorni("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("aggiungiAnni: 29 febbraio diventa 28 febbraio", () => {
    expect(aggiungiAnni("2028-02-29", 1)).toBe("2029-02-28");
    expect(aggiungiAnni("2026-09-24", 1)).toBe("2027-09-24");
  });
  it("giorniTra conta i giorni di calendario", () => {
    expect(giorniTra("2026-09-24", "2026-10-04")).toBe(10);
    expect(giorniTra("2026-09-24", "2026-09-21")).toBe(-3);
  });
});

describe("statoPerData", () => {
  it("scaduto, in scadenza, in regola, senza scadenza", () => {
    expect(statoPerData("2026-09-21", 30, OGGI)).toBe("scaduto");
    expect(statoPerData("2026-10-04", 30, OGGI)).toBe("in_scadenza");
    expect(statoPerData("2026-10-24", 30, OGGI)).toBe("in_scadenza"); // proprio al trentesimo giorno
    expect(statoPerData("2026-10-25", 30, OGGI)).toBe("valido");
    expect(statoPerData(null, 30, OGGI)).toBe("senza_scadenza");
  });
  it("la scadenza di oggi è ancora in scadenza, non scaduta", () => {
    expect(statoPerData(OGGI, 30, OGGI)).toBe("in_scadenza");
  });
  it("con avviso a 0 giorni resta in regola fino al giorno stesso", () => {
    expect(statoPerData("2026-09-25", 0, OGGI)).toBe("valido");
  });
});

describe("documentiConStato", () => {
  const doc = (id: string, categoria: MezzoDocumentoCategoria, data_scadenza: string | null) =>
    ({ id, categoria, data_scadenza, alert_giorni_prima: 30 });

  it("la polizza vecchia dopo il rinnovo è rinnovata, non scaduta", () => {
    const r = documentiConStato(
      [doc("a", "assicurazione", "2026-09-04"), doc("b", "assicurazione", "2027-09-04")],
      OGGI,
    );
    expect(r.find((d) => d.id === "a")?.stato).toBe("sostituito");
    expect(r.find((d) => d.id === "b")?.stato).toBe("valido");
  });

  it("categorie diverse non si sostituiscono a vicenda", () => {
    const r = documentiConStato(
      [doc("a", "revisione", "2026-09-21"), doc("b", "assicurazione", "2027-09-04")],
      OGGI,
    );
    expect(r.find((d) => d.id === "a")?.stato).toBe("scaduto");
  });

  it("gli 'altro' contano tutti, anche se uno è più recente", () => {
    const r = documentiConStato(
      [doc("a", "altro", "2026-09-21"), doc("b", "altro", "2027-01-01")],
      OGGI,
    );
    expect(r.find((d) => d.id === "a")?.stato).toBe("scaduto");
  });
});

describe("prossimoTagliando", () => {
  const man = (id: string, data: string, prossima_data: string | null, prossimo_contatore: number | null) => ({
    id, data, created_at: `${data}T08:00:00Z`, prossima_data, prossimo_contatore,
  });

  it("per km: a 500 km dal traguardo è in scadenza", () => {
    const t = prossimoTagliando([man("t1", "2025-11-28", null, 59000)], 58500, "km", OGGI);
    expect(t?.stato).toBe("in_scadenza");
  });

  it("per km: superato il traguardo è scaduto", () => {
    const t = prossimoTagliando([man("t1", "2025-11-28", null, 59000)], 59100, "km", OGGI);
    expect(t?.stato).toBe("scaduto");
  });

  it("per ore: margine di 50 ore", () => {
    expect(prossimoTagliando([man("t1", "2026-09-19", null, 1300)], 1260, "ore", OGGI)?.stato).toBe("in_scadenza");
    expect(prossimoTagliando([man("t1", "2026-09-19", null, 1300)], 1200, "ore", OGGI)?.stato).toBe("valido");
  });

  it("per data: vale la regola dei 30 giorni", () => {
    expect(prossimoTagliando([man("t1", "2026-03-01", "2026-10-10", null)], null, "km", OGGI)?.stato).toBe("in_scadenza");
    expect(prossimoTagliando([man("t1", "2026-03-01", "2026-09-01", null)], null, "km", OGGI)?.stato).toBe("scaduto");
  });

  it("conta l'ultimo intervento che indica il prossimo, non una riparazione successiva senza indicazioni", () => {
    const t = prossimoTagliando(
      [
        man("vecchio", "2025-01-10", null, 30000),
        man("nuovo", "2026-01-10", null, 60000),
        man("riparazione", "2026-05-01", null, null),
      ],
      58000,
      "km",
      OGGI,
    );
    expect(t?.manutenzioneId).toBe("nuovo");
    expect(t?.stato).toBe("valido");
  });

  it("nessuna indicazione del prossimo tagliando: nessuna scadenza", () => {
    expect(prossimoTagliando([man("r", "2026-05-01", null, null)], 1000, "km", OGGI)).toBeNull();
  });

  it("senza km attuali, il traguardo in km non fa scattare nulla", () => {
    expect(prossimoTagliando([man("t1", "2026-01-10", null, 60000)], null, "km", OGGI)?.stato).toBe("valido");
  });
});

describe("statoPeggiore e descrizioni", () => {
  it("scaduto vince su in scadenza, che vince su in regola", () => {
    expect(statoPeggiore(["valido", "in_scadenza", "scaduto"])).toBe("scaduto");
    expect(statoPeggiore(["valido", "in_scadenza"])).toBe("in_scadenza");
    expect(statoPeggiore([])).toBeNull();
  });

  it("descrive la scadenza in parole", () => {
    expect(
      descriviScadenza({ categoria: "revisione", data_scadenza: "2026-09-21", contatore_scadenza: null, contatore_unita: "km", stato: "scaduto" }),
    ).toBe("Revisione · scadenza passata il 21/09/2026");
    expect(
      descriviScadenza({ categoria: "bollo", data_scadenza: "2026-10-04", contatore_scadenza: null, contatore_unita: "km", stato: "in_scadenza" }),
    ).toBe("Bollo · scade il 04/10/2026");
    expect(
      descriviScadenza({ categoria: "tagliando", data_scadenza: null, contatore_scadenza: 59000, contatore_unita: "km", stato: "in_scadenza" }),
    ).toBe("Tagliando · a 59.000 km");
  });

  it("formatta km e ore all'italiana", () => {
    expect(formatContatore(58500, "km")).toBe("58.500 km");
    expect(formatContatore(1260.5, "ore")).toBe("1.260,5 ore");
    expect(formatContatore(null, "km")).toBe("—");
  });
});

describe("storico delle assegnazioni", () => {
  // Orari a mezzogiorno UTC: stesso giorno in Italia e sul server di CI.
  const periodi = [
    { id: "rossi", dal: "2026-03-01T12:00:00Z", al: "2026-03-12T12:00:00Z" },
    { id: "bianchi", dal: "2026-03-12T12:00:00Z", al: "2026-04-30T12:00:00Z" },
    { id: "verdi", dal: "2026-05-02T12:00:00Z", al: null },
  ];

  it("chi aveva il mezzo il giorno della multa", () => {
    expect(periodiDelGiorno(periodi, "2026-03-05").map((p) => p.id)).toEqual(["rossi"]);
    expect(periodiDelGiorno(periodi, "2026-04-10").map((p) => p.id)).toEqual(["bianchi"]);
  });

  it("il giorno del passaggio di mano li mostra entrambi", () => {
    expect(periodiDelGiorno(periodi, "2026-03-12").map((p) => p.id)).toEqual(["rossi", "bianchi"]);
  });

  it("un giorno scoperto non dà nessuno; il periodo aperto arriva a oggi", () => {
    expect(periodiDelGiorno(periodi, "2026-05-01")).toEqual([]);
    expect(periodiDelGiorno(periodi, "2026-09-24").map((p) => p.id)).toEqual(["verdi"]);
  });

  it("giorni sovrapposti a un intervallo, estremi inclusi", () => {
    expect(giorniSovrapposti("2026-03-01T12:00:00Z", "2026-03-12T12:00:00Z", "2026-03-10", "2026-03-31")).toBe(3);
    expect(giorniSovrapposti("2026-05-02T12:00:00Z", null, "2026-05-01", "2026-05-10")).toBe(9);
    expect(giorniSovrapposti("2026-03-01T12:00:00Z", "2026-03-12T12:00:00Z", "2026-04-01", "2026-04-30")).toBe(0);
  });
});

describe("costoAnnuoMezzo", () => {
  const doc = (categoria: MezzoDocumentoCategoria, importo: number | null, data_scadenza: string) =>
    ({ categoria, importo, data_scadenza, created_at: `${data_scadenza}T00:00:00Z` });

  it("somma assicurazione e bollo in corso, rate e manutenzioni dell'ultimo anno", () => {
    const c = costoAnnuoMezzo(
      { rata_mensile: 450 },
      [
        doc("assicurazione", 1240, "2026-09-04"), // vecchia polizza: non conta
        doc("assicurazione", 1310, "2027-09-04"),
        doc("bollo", 280, "2027-01-31"),
        doc("revisione", 79, "2027-03-01"), // la revisione non è un costo annuo fisso
      ],
      [
        { data: "2026-06-10", costo: 385 },
        { data: "2025-06-10", costo: 900 }, // più di un anno fa
        { data: "2026-08-01", costo: null },
      ],
      "2026-09-24",
    );
    expect(c.documenti).toBe(1590);
    expect(c.rate).toBe(5400);
    expect(c.manutenzioni).toBe(385);
    expect(c.totale).toBe(7375);
    expect(c.alGiorno).toBe(20.21);
  });

  it("un mezzo senza costi segnati vale zero, non NaN", () => {
    const c = costoAnnuoMezzo({ rata_mensile: null }, [], [], "2026-09-24");
    expect(c.totale).toBe(0);
    expect(c.alGiorno).toBe(0);
  });
});

describe("valori letti dall'AI", () => {
  it("numeri all'italiana, date ISO, testi vuoti", () => {
    expect(numeroLetto("1.234,56")).toBe(1234.56);
    expect(numeroLetto(1310)).toBe(1310);
    expect(numeroLetto("€ 980,00")).toBe(980);
    expect(numeroLetto("")).toBeNull();
    expect(numeroLetto(null)).toBeNull();
    expect(dataLetta("2027-09-04")).toBe("2027-09-04");
    expect(dataLetta("04/09/2027")).toBeNull();
    expect(testoLetto("  Allianz ")).toBe("Allianz");
    expect(testoLetto("   ")).toBeNull();
  });
});
