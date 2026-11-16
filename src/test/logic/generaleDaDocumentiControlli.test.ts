// Lotto 0 di docs/piano-commessa-generale-da-documenti.md: catalogo e controlli di coerenza.
// Tutti i dati sono inventati: riproducono solo le FORME di errore viste in un contratto vero
// (penale con due valori, somma del computo che non torna, un giorno di differenza sulla fine).
import { describe, expect, it } from "vitest";
import { catalogoPer, SCELTE_DECISE, tipoDaDocumenti } from "@/lib/orders/generali/daDocumenti/catalogo";
import { aggiungiGiorni, controlli, riepilogo, statoCampi, statoCampo, type DatiLetti, type Occorrenza } from "@/lib/orders/generali/daDocumenti/controlli";

const o = (valore: Occorrenza["valore"], pagina = 1, file = "contratto.pdf", extra: Partial<Occorrenza> = {}): Occorrenza =>
  ({ valore, file, pagina, citazione: "…", certezza: "letto", ...extra });

/** Un appalto pubblico inventato in cui tutto torna. */
const buono = (): DatiLetti => ({
  importo_base: [o(400000, 3)],
  ribasso_pct: [o(12.5, 2, "verbale.pdf")],
  oneri_sicurezza: [o(15000, 3)],
  importo_contrattuale: [o(365000, 2)],
  totale_computo: [o(400000, 9, "computo.xpwe")],
  totale_sicurezza: [o(15000, 14, "sicurezza.pdf")],
  data_consegna: [o("2027-03-01", 1, "verbale.pdf")],
  durata_giorni: [o(365, 4)],
  data_fine_prevista: [o("2028-02-29", 2, "verbale.pdf")],
  car_somma_lavori: [o(365000, 2, "polizza.pdf")],
  rct_massimale: [o(500000, 2, "polizza.pdf")],
  rct_massimale_contratto: [o(500000, 8)],
  penale_massima_pct: [o(10, 5)],
  ritenuta_pct: [o(0.5, 6, "capitolato.pdf")],
  cig: [o("Z1A2B3C4D5", 1)],
  cig_accordo: [o("Y9X8W7V6U5", 1)],
  cup: [o("A12B34C56D78E90", 1)],
  codice_univoco: [o("UFX9Q2", 11)],
});

const esito = (id: string, dati: DatiLetti, scelte = {}) => controlli("appalto_pubblico", dati, scelte).find((c) => c.id === id)!;

describe("catalogo", () => {
  it("l'appalto pubblico cerca i codici PA, il privato no", () => {
    const pub = catalogoPer("appalto_pubblico").campi.map((c) => c.chiave);
    const pri = catalogoPer("appalto_privato").campi.map((c) => c.chiave);
    expect(pub).toEqual(expect.arrayContaining(["cig", "cig_accordo", "cup", "rup", "split_payment"]));
    expect(pri).not.toContain("cig");
    expect(pri).toContain("totale_rate");
  });

  it("le chiavi non si ripetono e ogni scelta citata esiste", () => {
    for (const tipo of ["appalto_pubblico", "appalto_privato", "sviluppo", "compravendita"] as const) {
      const campi = catalogoPer(tipo).campi;
      expect(new Set(campi.map((c) => c.chiave)).size).toBe(campi.length);
      for (const c of campi) if (c.scelta) expect(SCELTE_DECISE[c.scelta]).toBeDefined();
    }
  });

  it("il contratto è l'unico documento obbligatorio dell'appalto pubblico", () => {
    expect(catalogoPer("appalto_pubblico").documenti.filter((d) => d.obbligatorio).map((d) => d.id)).toEqual(["contratto"]);
  });

  it("dal popup: appalto senza tipo = privato", () => {
    expect(tipoDaDocumenti("appalto", "Pubblico")).toBe("appalto_pubblico");
    expect(tipoDaDocumenti("appalto", "")).toBe("appalto_privato");
    expect(tipoDaDocumenti("sviluppo")).toBe("sviluppo");
  });
});

describe("stato dei campi", () => {
  it("due valori diversi della penale sono un conflitto, con la scelta del titolare", () => {
    const dati: DatiLetti = { penale_permille: [o(0.5, 5), o(1, 3, "verbale.pdf")] };
    const s = statoCampo("appalto_pubblico", "penale_permille", dati);
    expect(s.stato).toBe("conflitto");
    expect(s.valore).toBeNull();
    expect(s.valori).toHaveLength(2);
    expect(s.scelta).toBe("penale_due_valori");
  });

  it("lo stesso valore letto due volte non è un conflitto", () => {
    const s = statoCampo("appalto_pubblico", "importo_contrattuale", { importo_contrattuale: [o(365000, 2), o(365000.001, 9)] });
    expect(s.stato).toBe("letto");
    expect(s.valori[0].occorrenze).toHaveLength(2);
  });

  it("i testi si confrontano senza spazi e maiuscole", () => {
    expect(statoCampo("appalto_pubblico", "rup", { rup: [o("Ing.  Mario Prova"), o("ing. mario prova")] }).stato).toBe("letto");
  });

  it("scritto a mano resta da guardare; la scelta dell'utente chiude il conflitto", () => {
    expect(statoCampo("appalto_pubblico", "contratto_numero", { contratto_numero: [o("123/2027", 1, "c.pdf", { aMano: true })] }).stato).toBe("a_mano");
    const s = statoCampo("appalto_pubblico", "penale_permille", { penale_permille: [o(0.5), o(1)] }, { penale_permille: 1 });
    expect(s.stato).toBe("scelto");
    expect(s.valore).toBe(1);
  });

  it("i conti dedicati non si estraggono mai, anche se letti", () => {
    expect(statoCampo("appalto_pubblico", "conti_dedicati", { conti_dedicati: [o("IT00X…")] }).stato).toBe("escluso");
  });

  it("un campo assente è «non trovato»", () => {
    const tutti = statoCampi("appalto_pubblico", {});
    expect(tutti.every((c) => c.stato === "non_trovato" || c.stato === "escluso")).toBe(true);
  });
});

describe("controlli dell'appalto pubblico", () => {
  it("tutto torna", () => {
    const c = controlli("appalto_pubblico", buono());
    expect(c.filter((x) => x.esito !== "ok").map((x) => x.id)).toEqual([]);
    expect(c.length).toBeGreaterThanOrEqual(12);
  });

  it("importo contrattuale che non torna", () => {
    const d = buono(); d.importo_contrattuale = [o(366000, 2)];
    const c = esito("importo_contrattuale", d);
    expect(c.esito).toBe("errore");
    expect(c.messaggio).toMatch(/differenza di 1\.?000,00 €/);
  });

  it("somma del computo che non torna di pochi euro", () => {
    const d = buono(); d.totale_computo = [o(399983.21, 9)];
    expect(esito("somma_computo", d).esito).toBe("errore");
  });

  it("entro un euro la somma torna", () => {
    const d = buono(); d.totale_computo = [o(400000.6, 9)];
    expect(esito("somma_computo", d).esito).toBe("ok");
  });

  it("fine lavori: valgono le due letture, con o senza il giorno di consegna", () => {
    const d = buono(); d.data_fine_prevista = [o("2028-02-28", 2)];
    expect(esito("durata", d).esito).toBe("ok");
    d.data_fine_prevista = [o("2028-03-08", 2)];
    expect(esito("durata", d).esito).toBe("errore");
  });

  it("anni bisestili", () => {
    expect(aggiungiGiorni("2027-03-01", 365)).toBe("2028-02-29");
    expect(aggiungiGiorni("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("CAR diversa dal contratto, RCT sotto il massimale", () => {
    const d = buono(); d.car_somma_lavori = [o(400000)]; d.rct_massimale = [o(250000)];
    expect(esito("car", d).esito).toBe("errore");
    expect(esito("rct", d).esito).toBe("errore");
  });

  it("penale oltre il 10% è un errore, ritenuta diversa dallo 0,5% un avviso", () => {
    const d = buono(); d.penale_massima_pct = [o(20)]; d.ritenuta_pct = [o(5)];
    expect(esito("penale_massima", d).esito).toBe("errore");
    expect(esito("ritenuta", d).esito).toBe("avviso");
  });

  it("formati di CIG, CUP e codice univoco", () => {
    const d = buono(); d.cig = [o("Z1A2B3C4D")]; d.cup = [o("A12B34")]; d.codice_univoco = [o("UF X9Q2")];
    expect(esito("formato_cig", d).esito).toBe("errore");
    expect(esito("formato_cup", d).esito).toBe("errore");
    expect(esito("formato_codice_univoco", d).esito).toBe("ok");
  });

  it("il CIG del contratto uguale a quello dell'accordo quadro è un errore", () => {
    const d = buono(); d.cig_accordo = [o("z1a2b3c4d5")];
    expect(esito("cig_distinti", d).esito).toBe("errore");
  });

  it("un dato in conflitto rende il controllo non verificabile, e lo dice", () => {
    const d = buono(); d.ribasso_pct = [o(12.5, 2), o(15, 7)];
    const c = esito("importo_contrattuale", d);
    expect(c.esito).toBe("non_verificabile");
    expect(c.messaggio).toContain("scegli");
    // la scelta dell'utente fa ripartire il controllo
    expect(esito("importo_contrattuale", d, { ribasso_pct: 12.5 }).esito).toBe("ok");
  });

  it("senza dati: non verificabile, mai ok", () => {
    expect(controlli("appalto_pubblico", {}).every((c) => c.esito === "non_verificabile")).toBe(true);
  });
});

describe("altri tipi", () => {
  it("privato: rate e acconto", () => {
    const d: DatiLetti = { importo_contrattuale: [o(120000)], totale_rate: [o(110000)], acconto: [o(150000)] };
    const c = controlli("appalto_privato", d);
    expect(c.find((x) => x.id === "somma_rate")!.esito).toBe("errore");
    expect(c.find((x) => x.id === "acconto")!.esito).toBe("errore");
    expect(c.find((x) => x.id === "formato_cig")).toBeUndefined();
  });

  it("sviluppo: scadenza del titolo dopo il rilascio", () => {
    expect(controlli("sviluppo", { titolo_data: [o("2027-05-01")], titolo_scadenza: [o("2027-01-01")] })[0].esito).toBe("errore");
  });

  it("compravendita: rogito prima del compromesso, prezzi diversi", () => {
    const c = controlli("compravendita", { data_compromesso: [o("2027-06-01")], data_rogito: [o("2027-05-01")], prezzo_compromesso: [o(200000)], prezzo_atto: [o(195000)] });
    expect(c.find((x) => x.id === "rogito_dopo_compromesso")!.esito).toBe("errore");
    expect(c.find((x) => x.id === "prezzo_uguale")!.esito).toBe("avviso");
  });
});

describe("riepilogo", () => {
  it("conflitti ed errori bloccano, un errore accettato no", () => {
    const d = buono(); d.penale_permille = [o(0.5), o(1)]; d.importo_contrattuale = [o(366000)];
    const campi = statoCampi("appalto_pubblico", d);
    const ctrl = controlli("appalto_pubblico", d);
    expect(riepilogo(campi, ctrl).bloccanti).toBe(3);
    expect(riepilogo(campi, ctrl, new Set(["importo_contrattuale", "car"])).bloccanti).toBe(1);
  });
});

describe("appalto privato: soglie del pubblico non bloccano", () => {
  it("penale sopra il 10% è un avviso, la ritenuta non si controlla", () => {
    const c = controlli("appalto_privato", { penale_massima_pct: [o(15)], ritenuta_pct: [o(5)] });
    expect(c.find((x) => x.id === "penale_massima")!.esito).toBe("avviso");
    expect(c.find((x) => x.id === "ritenuta")).toBeUndefined();
  });

  it("percentuali con la virgola", () => {
    const c = controlli("appalto_pubblico", { importo_base: [o(400000)], ribasso_pct: [o(12.5)], oneri_sicurezza: [o(15000)], importo_contrattuale: [o(365000)] });
    expect(c.find((x) => x.id === "importo_contrattuale")!.messaggio).toContain("12,5%");
  });
});

describe("varianti di uno stesso testo (lotto 9)", () => {
  it("titoli, punteggiatura e testo contenuto non sono un conflitto; si mostra il più completo", () => {
    expect(statoCampo("appalto_pubblico", "rup", { rup: [o("Sig. Mario Prova"), o("Ing. Mario Prova")] }).stato).toBe("letto");
    const s = statoCampo("appalto_pubblico", "oggetto", { oggetto: [o("Lavori di manutenzione delle strade"), o("Lavori di manutenzione delle strade comunali")] });
    expect(s.stato).toBe("letto");
    expect(s.valore).toBe("Lavori di manutenzione delle strade comunali");
    expect(statoCampo("appalto_pubblico", "stazione_appaltante", { stazione_appaltante: [o("COMUNE DI PROVA - Ufficio Tecnico"), o("Comune di Prova, Ufficio tecnico")] }).stato).toBe("letto");
  });
  it("testi diversi, codici e date restano conflitti", () => {
    expect(statoCampo("appalto_pubblico", "esecutore_forma", { esecutore_forma: [o("RTI"), o("Impresa singola")] }).stato).toBe("conflitto");
    expect(statoCampo("appalto_pubblico", "cig", { cig: [o("Z1A2B3C4D5"), o("Z1A2B3C4D6")] }).stato).toBe("conflitto");
    expect(statoCampo("appalto_pubblico", "contratto_numero", { contratto_numero: [o("12/2027"), o("Prot. 3456 del 2027")] }).stato).toBe("conflitto");
  });
});

describe("revisione finale del 15/11: confronti e manodopera", () => {
  it("parole intere e numeri uguali", () => {
    expect(statoCampo("appalto_pubblico", "rup", { rup: [o("Mario Rossi"), o("Mario Rossini")] }).stato).toBe("conflitto");
    expect(statoCampo("appalto_pubblico", "luogo", { luogo: [o("Lotto 1 via Prova"), o("Lotto 12 via Prova")] }).stato).toBe("conflitto");
  });
  it("repertori, catasto e corpo/misura sono rigidi", () => {
    expect(statoCampo("appalto_pubblico", "contratto_numero", { contratto_numero: [o("Rep. 12"), o("Rep. 123")] }).stato).toBe("conflitto");
    expect(statoCampo("appalto_pubblico", "corpo_misura", { corpo_misura: [o("a corpo"), o("a corpo e a misura")] }).stato).toBe("conflitto");
    expect(statoCampo("sviluppo", "catasto", { catasto: [o("Fg. 5 mapp. 12"), o("mapp. 123")] }).stato).toBe("conflitto");
  });
  it("manodopera fuori dal ribasso: la seconda formula torna e lo dice", () => {
    // (400.000 − 100.000) × 0,75 + 100.000 + 15.000 = 340.000
    const d = { importo_base: [o(400000)], ribasso_pct: [o(25)], oneri_sicurezza: [o(15000)], costo_manodopera: [o(100000)], importo_contrattuale: [o(340000)] };
    const c = controlli("appalto_pubblico", d).find((x) => x.id === "importo_contrattuale")!;
    expect(c.esito).toBe("ok");
    expect(c.messaggio).toContain("manodopera fuori dal ribasso");
  });
});
