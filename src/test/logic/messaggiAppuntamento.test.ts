import { describe, it, expect } from "vitest";
import {
  emailAppuntamento, linkGoogleCalendar, momentiDaMandare, whatsappAppuntamento,
  type DatiMessaggio, type StatoAppuntamento,
} from "../../../supabase/functions/_shared/messaggiAppuntamento";

const demo: DatiMessaggio = {
  nome: "Mario",
  calendario: "Demo Edilizia in Cloud",
  dataIso: "2026-09-29",
  ora: "10:30",
  durataMin: 30,
  linkCall: "https://meet.google.com/djt-jywd-myg",
  linkGestione: "https://app.ediliziaincloud.com/appuntamento/abc",
  firma: "Il team di Edilizia in Cloud",
  cosaPreparare: "– come fate oggi i preventivi;\n– dove segnate ore e materiali dei cantieri;\n\n– qual è l'attività che vi fa perdere più tempo.",
};

describe("WhatsApp dell'appuntamento", () => {
  it("la conferma ha giorno, ora, videochiamata, link, come spostarlo e la firma", () => {
    const t = whatsappAppuntamento("conferma", demo);
    expect(t).toContain("Ciao Mario, il tuo appuntamento «Demo Edilizia in Cloud» è confermato!");
    expect(t).toContain("📅 Martedì 29 settembre 2026");
    expect(t).toContain("🕐 ore 10:30");
    expect(t).toContain("💻 Videochiamata di 30 minuti");
    expect(t).toContain("Link: https://meet.google.com/djt-jywd-myg");
    expect(t).toContain("puoi spostarlo qui:\nhttps://app.ediliziaincloud.com/appuntamento/abc");
    expect(t).toContain("Rispondi OK");
    expect(t.endsWith("Il team di Edilizia in Cloud")).toBe(true);
  });

  it("il promemoria dei 5 minuti porta il link della call; senza link non parte niente", () => {
    expect(whatsappAppuntamento("promemoria_5min", demo)).toBe("Ciao Mario, siamo già collegati e ti aspettiamo qui 👇\nhttps://meet.google.com/djt-jywd-myg");
    expect(whatsappAppuntamento("promemoria_5min", { ...demo, linkCall: null })).toBe("");
  });

  it("senza link della call non si parla di collegarsi", () => {
    const t = whatsappAppuntamento("promemoria_1h", { ...demo, linkCall: null });
    expect(t).toBe("Ciao Mario, ci vediamo tra un'ora, alle 10:30.");
    expect(whatsappAppuntamento("conferma", { ...demo, linkCall: null })).not.toContain("Videochiamata");
  });

  it("senza nome: «Ciao,» e non «Ciao ,»", () => {
    expect(whatsappAppuntamento("promemoria_24h", { ...demo, nome: "  " }).startsWith("Ciao, ti ricordiamo")).toBe(true);
  });

  it("nessun prezzo nei messaggi", () => {
    for (const m of ["conferma", "spostato", "promemoria_24h", "promemoria_1h", "promemoria_5min"] as const) {
      expect(whatsappAppuntamento(m, demo)).not.toMatch(/€|euro/i);
    }
  });
});

describe("email dell'appuntamento", () => {
  it("la conferma elenca cosa preparare, il link della call, come spostarlo e la firma", () => {
    const e = emailAppuntamento("conferma", demo);
    expect(e.oggetto).toBe("Appuntamento confermato: martedì 29 settembre alle 10:30");
    expect(e.testo).toContain("– come fate oggi i preventivi;");
    expect(e.testo).toContain("– qual è l'attività che vi fa perdere più tempo.");
    expect(e.testo).toContain("Link della videochiamata: https://meet.google.com/djt-jywd-myg");
    expect(e.testo).toContain("Se ti serve spostarlo: https://app.ediliziaincloud.com/appuntamento/abc");
    expect(e.html).toContain("Aggiungi al calendario");
    expect(e.testo.endsWith("Il team di Edilizia in Cloud")).toBe(true);
  });

  it("promemoria: il giorno prima col pulsante per collegarsi, un'ora prima col link", () => {
    expect(emailAppuntamento("promemoria_24h", demo).oggetto).toBe("Promemoria: il tuo appuntamento è domani alle 10:30");
    expect(emailAppuntamento("promemoria_24h", demo).html).toContain("Collegati alla videochiamata");
    expect(emailAppuntamento("promemoria_1h", demo).oggetto).toBe("Tra un'ora il tuo appuntamento: ecco il link");
  });

  it("senza firma chiude con «A presto», senza link niente pulsante per collegarsi", () => {
    const e = emailAppuntamento("promemoria_24h", { ...demo, firma: null, linkCall: null });
    expect(e.testo.endsWith("A presto")).toBe(true);
    expect(e.html).not.toContain("Collegati alla videochiamata");
  });
});

describe("aggiungi a Google Calendar", () => {
  it("usa l'ora italiana convertita in UTC e il link come luogo", () => {
    const u = new URL(linkGoogleCalendar(demo));
    // 29 settembre, ora legale: le 10:30 italiane sono le 08:30 UTC.
    expect(u.searchParams.get("dates")).toBe("20260929T083000Z/20260929T090000Z");
    expect(u.searchParams.get("location")).toBe("https://meet.google.com/djt-jywd-myg");
    expect(u.searchParams.get("text")).toBe("Demo Edilizia in Cloud");
  });
});

describe("quando partono conferma e promemoria", () => {
  const ORA = 3_600_000;
  const MIN = 60_000;
  const inizio = Date.UTC(2026, 8, 29, 8, 30); // martedì 29/09, 10:30 italiane
  const stato = (s: Partial<StatoAppuntamento>): StatoAppuntamento => ({
    adesso: inizio - 3 * 24 * ORA,
    inizio,
    creatoIl: inizio - 5 * 24 * ORA,
    confermaInviataIl: inizio - 5 * 24 * ORA,
    giaMandati: { h24: false, h1: false, m5: false },
    confermaDovuta: false,
    ...s,
  });

  it("fissato giorni prima: il giorno prima, un'ora prima e 5 minuti prima", () => {
    expect(momentiDaMandare(stato({ adesso: inizio - 23 * ORA - 58 * MIN }))).toEqual(["promemoria_24h"]);
    expect(momentiDaMandare(stato({ adesso: inizio - 58 * MIN }))).toEqual(["promemoria_1h"]);
    expect(momentiDaMandare(stato({ adesso: inizio - 3 * MIN }))).toEqual(["promemoria_5min"]);
    expect(momentiDaMandare(stato({ adesso: inizio - 2 * ORA }))).toEqual([]);
  });

  it("già mandati: non si ripetono", () => {
    expect(momentiDaMandare(stato({ adesso: inizio - 58 * MIN, giaMandati: { h24: true, h1: true, m5: false } }))).toEqual([]);
  });

  it("fissato per meno di 24 ore dopo: niente promemoria del giorno prima", () => {
    const fissato = inizio - 20 * ORA;
    expect(momentiDaMandare(stato({ adesso: inizio - 23 * ORA - 30 * MIN, creatoIl: fissato, confermaInviataIl: fissato }))).toEqual([]);
    expect(momentiDaMandare(stato({ adesso: inizio - 58 * MIN, creatoIl: fissato, confermaInviataIl: fissato }))).toEqual(["promemoria_1h"]);
  });

  it("fissato per meno di un'ora dopo: solo quello dei 5 minuti", () => {
    const fissato = inizio - 50 * MIN;
    expect(momentiDaMandare(stato({ adesso: inizio - 50 * MIN, creatoIl: fissato, confermaInviataIl: fissato }))).toEqual([]);
    expect(momentiDaMandare(stato({ adesso: inizio - 3 * MIN, creatoIl: fissato, confermaInviataIl: fissato }))).toEqual(["promemoria_5min"]);
  });

  it("inserito a mano: prima la conferma da sola, poi i promemoria", () => {
    const creato = inizio - 3 * ORA;
    expect(momentiDaMandare(stato({ adesso: creato + MIN, creatoIl: creato, confermaInviataIl: null, confermaDovuta: true }))).toEqual(["conferma"]);
    // Anche nella finestra dell'ora prima: la conferma non arriva insieme al promemoria.
    const tardi = inizio - 58 * MIN;
    expect(momentiDaMandare(stato({ adesso: tardi, creatoIl: tardi - MIN, confermaInviataIl: null, confermaDovuta: true }))).toEqual(["conferma"]);
    // Il giro dopo: fissato meno di un'ora prima dell'inizio, quindi niente «un'ora prima».
    expect(momentiDaMandare(stato({ adesso: tardi + 5 * MIN, creatoIl: tardi - MIN, confermaInviataIl: tardi, confermaDovuta: true }))).toEqual([]);
  });

  it("spostato: la conferma riparte e i promemoria contano dalla nuova conferma", () => {
    // Prenotato da 5 giorni, spostato 10 ore prima del nuovo orario.
    const spostato = inizio - 10 * ORA;
    expect(momentiDaMandare(stato({ adesso: spostato + MIN, confermaInviataIl: null, confermaDovuta: true }))).toEqual(["conferma"]);
    expect(momentiDaMandare(stato({ adesso: inizio - 58 * MIN, confermaInviataIl: spostato + MIN }))).toEqual(["promemoria_1h"]);
  });

  it("appuntamento già iniziato: niente", () => {
    expect(momentiDaMandare(stato({ adesso: inizio + MIN, confermaInviataIl: null, confermaDovuta: true }))).toEqual([]);
  });
});
