/**
 * La stampa A4 della scheda opportunità: nessun dato perso, nessun campo vuoto taciuto.
 */
import { describe, expect, it } from "vitest";
import { VUOTO, costruisciSchedaStampa, dataLunga, euro, type DatiSchedaStampa } from "@/lib/opportunita/schedaStampa";

const base: DatiSchedaStampa = {
  nomeOpportunita: "Aurora Ghia",
  creazione: "Creato il 7 ott 2026 · fonte: Facebook",
  contatto: { nome: "Aurora", cognome: "Ghia", email: "aurora@icloud.com", telefono: "+393298179099", indirizzo: "", citta: "Vigevano", provincia: "PV", regione: "Lombardia" },
  campiContatto: [{ id: "c1", name: "Interesse", field_type: "text" }],
  valoriContatto: { c1: "Divano angolare" },
  pipeline: "Nuovo",
  fase: "Da Chiamare",
  stato: "Aperta",
  valore: 1234.5,
  venditore: "",
  follower: "",
  callCenter: "",
  azienda: "",
  fonte: "facebook",
  etichette: ["levante", "facebook"],
  campiOpportunita: [{ id: "o1", name: "Data sopralluogo", field_type: "date" }],
  valoriOpportunita: { o1: "2026-10-09" },
  probabilita: 40,
  chiusuraPrevista: "2026-10-30",
  prossimaAzione: "Richiamare",
  dataProssimaAzione: null,
  motivoPerdita: "",
  note: [{ created_at: "2026-10-07T13:20:00Z", content: "Chiede il prezzo", autore: "Roberta" }],
  appuntamenti: [],
  adesso: new Date("2026-10-08T10:00:00Z"),
};

const trova = (s: ReturnType<typeof costruisciSchedaStampa>, titolo: string) => s.sezioni.find((x) => x.titolo.startsWith(titolo))!;

describe("costruisciSchedaStampa", () => {
  const s = costruisciSchedaStampa(base);

  it("il titolo è il nome del contatto", () => {
    expect(s.titolo).toBe("Aurora Ghia");
  });

  it("ci sono tutte le sezioni della scheda", () => {
    expect(s.sezioni.map((x) => x.titolo.replace(/ \(\d+\)/, ""))).toEqual(["Contatto", "Opportunità", "Avanzamento commerciale", "Appuntamenti", "Appunti"]);
  });

  it("un campo vuoto si stampa con il trattino, non sparisce", () => {
    const contatto = trova(s, "Contatto").righe!;
    expect(contatto.find((r) => r.etichetta === "Indirizzo")?.valore).toBe(VUOTO);
    const opp = trova(s, "Opportunità").righe!;
    expect(opp.find((r) => r.etichetta === "Venditore")?.valore).toBe(VUOTO);
  });

  it("i campi personalizzati escono con il loro nome, le date in chiaro", () => {
    expect(trova(s, "Contatto").righe!.find((r) => r.etichetta === "Interesse")?.valore).toBe("Divano angolare");
    expect(trova(s, "Opportunità").righe!.find((r) => r.etichetta === "Data sopralluogo")?.valore).toBe("9 ottobre 2026");
  });

  it("valore in euro, etichette elencate, probabilità con il percento", () => {
    const opp = trova(s, "Opportunità").righe!;
    expect(opp.find((r) => r.etichetta === "Valore")?.valore).toMatch(/1\.?234,50/);
    expect(opp.find((r) => r.etichetta === "Etichette")?.valore).toBe("levante, facebook");
    expect(trova(s, "Avanzamento").righe!.find((r) => r.etichetta === "Probabilità")?.valore).toBe("40%");
  });

  it("tutti gli appunti ci sono, con autore", () => {
    const appunti = trova(s, "Appunti");
    expect(appunti.titolo).toBe("Appunti (1)");
    expect(appunti.blocchi![0].intestazione).toContain("Roberta");
    expect(appunti.blocchi![0].testo).toBe("Chiede il prezzo");
  });

  it("il motivo della perdita compare solo se c'è", () => {
    expect(trova(s, "Avanzamento").righe!.some((r) => r.etichetta === "Motivo della perdita")).toBe(false);
    const persa = costruisciSchedaStampa({ ...base, motivoPerdita: "Troppo lontano" });
    expect(trova(persa, "Avanzamento").righe!.find((r) => r.etichetta === "Motivo della perdita")?.valore).toBe("Troppo lontano");
  });

  it("un appuntamento in videochiamata riporta il link, non un luogo", () => {
    const conAppuntamento = costruisciSchedaStampa({
      ...base,
      appuntamenti: [{
        appointment_date: "2026-10-09", appointment_time: "10:00:00", appointment_end_time: "11:00:00", title: "Demo · Aurora Ghia",
        appointment_type: "videocall", status: "confermato", formatted_address: null, meeting_url: "meet.google.com/djt-jywd-myg", assegnato: "Florin", description: null,
      }],
    });
    const a = trova(conAppuntamento, "Appuntamenti");
    expect(a.titolo).toBe("Appuntamenti (1)");
    expect(a.blocchi![0].intestazione).toContain("10:00–11:00");
    expect(a.blocchi![0].intestazione).toContain("Videochiamata");
    expect(a.blocchi![0].testo).toContain("meet.google.com/djt-jywd-myg");
    expect(a.blocchi![0].testo).toContain("Assegnato a: Florin");
  });

  it("senza appunti né appuntamenti c'è un messaggio, non una sezione sparita", () => {
    const vuota = costruisciSchedaStampa({ ...base, note: [] });
    expect(trova(vuota, "Appunti").vuota).toBe("Nessun appunto.");
    expect(trova(vuota, "Appuntamenti").vuota).toBe("Nessun appuntamento.");
  });
});

describe("formati", () => {
  it("euro e date", () => {
    expect(euro(null)).toBe(VUOTO);
    expect(euro("abc")).toBe(VUOTO);
    expect(dataLunga("2026-10-09")).toBe("9 ottobre 2026");
    expect(dataLunga("")).toBe(VUOTO);
  });
});
