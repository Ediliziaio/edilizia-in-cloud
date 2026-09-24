/**
 * POS sul modello ufficiale (DI 9/9/2014, Allegato I): il controllo dei
 * contenuti minimi dell'Allegato XV, punto 3.2.1, che blocca l'approvazione;
 * la lettura sicura dei dati salvati; l'aggiornamento dai dati dell'app che non
 * tocca quello che l'utente ha scritto; indirizzi e formazione presi dall'app.
 */
import { describe, expect, it } from "vitest";
import {
  aggiornaDaDatiApp, completezzaPercento, lavorazioneVuota, normalizzaPos, posVuoto, vociMancanti,
  type Lavorazione, type PosContenuto,
} from "../../../supabase/functions/_shared/posModello";
import { dividiIndirizzo, formazioneDaAttestati } from "../../../supabase/functions/_shared/posDatiApp";

function lavorazione(extra: Partial<Lavorazione> = {}): Lavorazione {
  return {
    ...lavorazioneVuota("l1"),
    titolo: "Posa del cappotto termico",
    descrizione: "Incollaggio e tassellatura dei pannelli isolanti sulla facciata",
    sostanze: "Nessuna",
    opere_provvisionali: "Ponteggio metallico fisso",
    macchine: "Trapano tassellatore, miscelatore",
    impianti: "Impianto elettrico di cantiere",
    turni: "Turno unico diurno",
    rischi: "Caduta dall'alto\nPolveri",
    misure: "Parapetti sul ponteggio\nAspirazione delle polveri",
    dpi: "Elmetto EN 397\nCalzature di sicurezza EN ISO 20345\nFacciale filtrante FFP2 EN 149",
    durata_giorni: 20,
    ...extra,
  };
}

function posCompleto(): PosContenuto {
  const p = posVuoto();
  p.opera.committente = { nominativo: "Fabio Riva", codice_fiscale: "", indirizzo: "Via Mazzini 14, Como", telefono: "", email: "" };
  p.opera.cantiere = { via: "Via Mazzini 14", localita: "Como", provincia: "CO" };
  p.opera.descrizione_attivita = "Cappotto termico su edificio residenziale";
  p.opera.modalita_organizzative = "Accesso dal cortile, stoccaggio sotto il portico";
  p.opera.turni_lavoro = "Turno unico diurno 8-12, 13-17";
  p.impresa.ragione_sociale = "Demo Azienda S.r.l.";
  p.impresa.datore_lavoro = "Mario Rossi";
  p.impresa.sede_legale = { indirizzo: "Via dei Cantieri 1, Sesto San Giovanni", telefono: "02 1234567", email: "info@demo.it" };
  p.dirigenti = [{ nominativo: "Mario Rossi", ruolo: "direttore_tecnico", mansioni_sicurezza: "Dirige il cantiere" }];
  p.preposti = [{ nominativo: "Luca Bianchi", ruolo: "capocantiere", ruolo_altro: "", mansioni_sicurezza: "Sovrintende le lavorazioni" }];
  p.rspp = { svolto_da: "esterno", nominativo: "Anna Verdi", mansioni_sicurezza: "Collabora alla valutazione dei rischi" };
  p.medico_competente = { previsto: true, nominativo: "Dott. Neri", mansioni_sicurezza: "Sorveglianza sanitaria" };
  p.rls = { tipo: "rlst", nominativo: "Paolo Gialli", mansioni_sicurezza: "Consultato sul POS" };
  p.emergenze.addetti = [{ nominativo: "Luca Bianchi", antincendio: true, primo_soccorso: true, mansioni_sicurezza: "Emergenze in cantiere" }];
  p.lavoratori = [{ qualifica: "Operaio specializzato", numero: 2, note: "" }];
  p.formazione = [
    { nominativo: "Luca Bianchi", qualifica: "Capocantiere", base: true, rischi_specifici: true, rischi_cantiere: true, dpi_terza_categoria: true, altro: "", attestati: "" },
    { nominativo: "Marco Operaio", qualifica: "Operaio", base: true, rischi_specifici: false, rischi_cantiere: false, dpi_terza_categoria: false, altro: "", attestati: "" },
  ];
  p.rumore.esito = "Dalla valutazione del 12/03/2026 l'esposizione è inferiore a 80 dB(A)";
  p.lavorazioni = [lavorazione()];
  return p;
}

describe("contenuti minimi dell'Allegato XV", () => {
  it("un POS vuoto ha le voci obbligatorie mancanti, con il riferimento alla lettera", () => {
    const voci = vociMancanti(posVuoto());
    const riferimenti = voci.map((v) => v.riferimento);
    for (const r of ["3.2.1 a) 1", "3.2.1 a) 3", "3.2.1 a) 5", "3.2.1 a) 6", "3.2.1 a) 7", "3.2.1 c)", "3.2.1 f)", "3.2.1 l)"]) {
      expect(riferimenti).toContain(r);
    }
    expect(completezzaPercento(posVuoto())).toBe(0);
  });

  it("un POS completo non ha voci mancanti", () => {
    expect(vociMancanti(posCompleto())).toEqual([]);
    expect(completezzaPercento(posCompleto())).toBe(100);
  });

  it("una scheda proposta dall'AI blocca finché qualcuno non la conferma", () => {
    const p = posCompleto();
    p.lavorazioni = [lavorazione({ origine: "ai", verificata: false })];
    expect(vociMancanti(p).map((v) => v.testo).join()).toMatch(/proposta dall'AI, da rileggere/);
    p.lavorazioni[0].verificata = true;
    expect(vociMancanti(p)).toEqual([]);
  });

  it("le sostanze pericolose chiedono le schede di sicurezza allegate; «Nessuna» no", () => {
    const p = posCompleto();
    p.lavorazioni = [lavorazione({ sostanze: "Collante cementizio, primer" })];
    expect(vociMancanti(p).map((v) => v.riferimento)).toContain("3.2.1 e)");
    p.allegati = [{ tipo: "scheda_sicurezza", nome: "collante.pdf", file_path: "az/pos/1/collante.pdf" }];
    expect(vociMancanti(p)).toEqual([]);
    p.allegati = [];
    p.lavorazioni = [lavorazione({ sostanze: "nessuna." })];
    expect(vociMancanti(p)).toEqual([]);
  });

  it("emergenze: interne vogliono un addetto antincendio e uno al primo soccorso, a cura del committente no", () => {
    const p = posCompleto();
    p.emergenze.addetti = [{ nominativo: "Luca Bianchi", antincendio: true, primo_soccorso: false, mansioni_sicurezza: "x" }];
    expect(vociMancanti(p).map((v) => v.testo)).toContain("Addetto al primo soccorso");
    p.emergenze.gestione = "committente";
    p.emergenze.addetti = [];
    expect(vociMancanti(p)).toEqual([]);
    p.emergenze.gestione = "comune";
    expect(vociMancanti(p).map((v) => v.sezione)).toContain("emergenze");
  });

  it("ogni figura nominata deve avere le mansioni di sicurezza (lettera b)", () => {
    const p = posCompleto();
    p.rspp.mansioni_sicurezza = "";
    const voce = vociMancanti(p).find((v) => v.riferimento === "3.2.1 b)");
    expect(voce?.testo).toContain("Anna Verdi");
  });

  it("medico non previsto: niente voce; subappalto senza affidataria: voce", () => {
    const p = posCompleto();
    p.medico_competente = { previsto: false, nominativo: "", mansioni_sicurezza: "" };
    expect(vociMancanti(p)).toEqual([]);
    p.impresa.ruolo = "esecutrice_subappalto";
    expect(vociMancanti(p).map((v) => v.testo)).toContain("Impresa affidataria per cui si lavora in subappalto");
  });

  it("un lavoratore senza nessuna formazione segnata blocca", () => {
    const p = posCompleto();
    p.formazione[1].base = false;
    expect(vociMancanti(p).find((v) => v.riferimento === "3.2.1 l)")?.testo).toContain("Marco Operaio");
  });

  it("procedure del PSC richieste ma non scritte bloccano", () => {
    const p = posCompleto();
    p.procedure_psc = { psc_presente: true, richieste: true, voci: [] };
    expect(vociMancanti(p).map((v) => v.riferimento)).toContain("3.2.1 h)");
  });
});

describe("lettura sicura", () => {
  it("null, vecchio generatore o dati sporchi diventano un POS con tutte le chiavi", () => {
    expect(normalizzaPos(null)).toEqual(posVuoto());
    expect(normalizzaPos({ tipo_lavori: "Cappotto", rischi_presenti: [] })).toEqual(posVuoto());
    const sporco = normalizzaPos({
      versione_modello: 1,
      impresa: { ruolo: "boh", ragione_sociale: 42 },
      lavoratori: [{ qualifica: "Operaio", numero: "3,0" }, "rotto"],
      lavorazioni: [{ titolo: "Scavo", origine: "ai", durata_giorni: "5" }],
    });
    expect(sporco.impresa.ruolo).toBe("affidataria_esecutrice");
    expect(sporco.impresa.ragione_sociale).toBe("42");
    expect(sporco.lavoratori[0]).toEqual({ qualifica: "Operaio", numero: 3, note: "" });
    expect(sporco.lavoratori[1]).toEqual({ qualifica: "", numero: 0, note: "" });
    expect(sporco.lavorazioni[0]).toMatchObject({ titolo: "Scavo", origine: "ai", verificata: false, durata_giorni: 5 });
  });
});

describe("aggiornamento dai dati dell'app", () => {
  it("rilegge impresa, figure e lavoratori, non tocca lavorazioni, rumore, turni e ruolo", () => {
    const attuale = posCompleto();
    attuale.impresa.ruolo = "esecutrice_subappalto";
    attuale.impresa.subappalto_a = "Grande Impresa S.p.A.";
    const daApp = posVuoto();
    daApp.impresa.ragione_sociale = "Demo Azienda S.r.l. (nuova)";
    daApp.lavoratori = [{ qualifica: "Operaio", numero: 4, note: "" }];
    const nuovo = aggiornaDaDatiApp(attuale, daApp);
    expect(nuovo.impresa.ragione_sociale).toBe("Demo Azienda S.r.l. (nuova)");
    expect(nuovo.impresa.ruolo).toBe("esecutrice_subappalto");
    expect(nuovo.impresa.subappalto_a).toBe("Grande Impresa S.p.A.");
    expect(nuovo.lavoratori).toEqual([{ qualifica: "Operaio", numero: 4, note: "" }]);
    expect(nuovo.lavorazioni).toEqual(attuale.lavorazioni);
    expect(nuovo.rumore).toEqual(attuale.rumore);
    expect(nuovo.opera.turni_lavoro).toBe(attuale.opera.turni_lavoro);
    // Quello che l'app non ha non cancella quello scritto a mano.
    expect(nuovo.rspp.nominativo).toBe("Anna Verdi");
    expect(nuovo.opera.committente.nominativo).toBe("Fabio Riva");
  });
});

describe("dati presi dall'app", () => {
  it("divide l'indirizzo del cantiere in via, località e provincia", () => {
    expect(dividiIndirizzo("Via Mazzini 14, Como")).toEqual({ via: "Via Mazzini 14", localita: "Como", provincia: "" });
    expect(dividiIndirizzo("Via Roma 3, 22100 Como (CO)")).toEqual({ via: "Via Roma 3", localita: "Como", provincia: "CO" });
    expect(dividiIndirizzo("Piazza Duomo 1, Milano MI")).toEqual({ via: "Piazza Duomo 1", localita: "Milano", provincia: "MI" });
    expect(dividiIndirizzo("Cascina Bianca")).toEqual({ via: "Cascina Bianca", localita: "", provincia: "" });
    expect(dividiIndirizzo("")).toEqual({ via: "", localita: "", provincia: "" });
  });

  it("spunta la formazione solo dove c'è un attestato che la documenta", () => {
    expect(formazioneDaAttestati([], false)).toEqual({ base: false, rischi_specifici: false, dpi_terza_categoria: false });
    expect(formazioneDaAttestati(["Formazione generale 4 ore"], false)).toMatchObject({ base: true, rischi_specifici: false });
    expect(formazioneDaAttestati(["Formazione specifica rischio alto 12 ore"], false)).toMatchObject({ rischi_specifici: true });
    expect(formazioneDaAttestati(["Lavori in quota e DPI anticaduta"], false)).toMatchObject({ dpi_terza_categoria: true });
    expect(formazioneDaAttestati([], true)).toMatchObject({ base: true, rischi_specifici: true, dpi_terza_categoria: false });
  });
});
