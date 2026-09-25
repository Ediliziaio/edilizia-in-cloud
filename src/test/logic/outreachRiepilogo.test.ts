import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  componiRiepilogo,
  finestraGiorno,
  OBIETTIVO_POSITIVE_PCT,
  percentuale,
  rigaBrand,
  rigaDaChiamare,
  type ContiBrand,
  type DatiRiepilogo,
} from "../../../supabase/functions/_shared/outreachRiepilogo";

const conti = (p: Partial<ContiBrand>): ContiBrand => ({
  brand: "ThermoDMR", inviate: 0, primoContatto: 0, fallite: 0, risposte: 0, interessati: 0,
  negative: 0, optout: 0, rimbalzi: 0, aperte: 0, tracciaAperture: false, inPartenza: 0, inCoda: 0, ...p,
});

describe("riepilogo giornaliero outreach", () => {
  it("le percentuali sono in italiano, e senza invii non si inventano", () => {
    expect(percentuale(3, 480)).toBe("0,6%");
    expect(percentuale(12, 100)).toBe("12%");
    expect(percentuale(0, 0)).toBe("—");
  });

  it("la riga del brand separa primo contatto e follow-up", () => {
    const r = rigaBrand(conti({ inviate: 120, primoContatto: 90, risposte: 2, interessati: 1, inPartenza: 40, inCoda: 7000 }));
    expect(r.etichetta).toBe("ThermoDMR");
    expect(r.valore).toContain("120 email (90 primo contatto, 30 follow-up)");
    expect(r.valore).toContain("2 risposte (1,7%)");
    expect(r.valore).toContain("1 interessati");
    expect(r.valore).toContain("aperture non tracciate");
    // In italiano il punto delle migliaia parte da cinque cifre: 7000, ma 47.000.
    expect(r.valore).toContain("oggi 40 in partenza, 7000 in coda");
  });

  it("col tracciamento acceso compare il tasso di apertura", () => {
    expect(rigaBrand(conti({ inviate: 200, aperte: 50, tracciaAperture: true })).valore).toContain("aperture 25%");
  });

  it("una giornata vuota si legge lo stesso", () => {
    const { titolo, righe, testo } = componiRiepilogo({
      giorno: "giovedì 17 settembre", brand: [conti({ brand: "Edilizia in Cloud" })],
      chiHaRisposto: [], caselleFerme: [], caselleAttive: 12,
    });
    expect(titolo).toBe("Outreach giovedì 17 settembre: 0 email, nessuna risposta");
    expect(testo).toContain("DA CHIAMARE OGGI\nNessuno");
    expect(testo).toContain("Nessuna risposta ieri.");
    expect(righe[0]).toEqual({ etichetta: "Da chiamare oggi", valore: "nessuno" });
    expect(righe.at(-1)?.valore).toBe("12 spediscono, nessuna ferma");
  });

  it("chi ha risposto e le caselle ferme finiscono nel riepilogo", () => {
    const { titolo, righe, testo } = componiRiepilogo({
      giorno: "giovedì 17 settembre",
      brand: [
        conti({ brand: "Edilizia in Cloud", inviate: 300, primoContatto: 200, risposte: 2, rimbalzi: 1, inPartenza: 100, inCoda: 40000 }),
        conti({ brand: "ThermoDMR", inviate: 180, primoContatto: 180, fallite: 20, risposte: 1, optout: 1, inPartenza: 60, inCoda: 7000 }),
      ],
      chiHaRisposto: ["Rossi Serramenti — interessato", "Bianchi Infissi — non interessato"],
      caselleFerme: ["info@x.it (in pausa)"],
      caselleAttive: 11,
    });
    expect(titolo).toBe("Outreach giovedì 17 settembre: 480 email, 3 risposte");
    const ieri = righe.find((r) => r.etichetta === "Ieri in tutto")!;
    expect(ieri.valore).toContain("480 email inviate · 3 risposte (0,6%)");
    expect(ieri.valore).toContain("1 indirizzi inesistenti");
    // «Tasso di invio»: quante sono davvero partite di quelle tentate.
    expect(ieri.valore).toContain("20 non partite (invio 96%)");
    expect(righe.find((r) => r.etichetta === "Oggi")?.valore).toBe("160 email in partenza · 47.000 ancora in coda");
    expect(righe.at(-1)?.valore).toContain("ferme: info@x.it (in pausa)");
    expect(testo).toContain("• Rossi Serramenti — interessato");
  });

  it("la giornata è quella di Roma: il riepilogo delle 07:30 racconta ieri", () => {
    // 18 settembre 2026, 05:30 UTC = 07:30 a Roma (ora legale).
    const f = finestraGiorno(new Date("2026-09-18T05:30:00Z"));
    expect(f.da).toBe("2026-09-16T22:00:00.000Z");
    expect(f.a).toBe("2026-09-17T22:00:00.000Z");
    expect(f.etichetta).toContain("17 settembre");
    // D'inverno l'Italia è a +1: la finestra si sposta di un'ora.
    const inverno = finestraGiorno(new Date("2027-01-10T05:30:00Z"));
    expect(inverno.da).toBe("2027-01-08T23:00:00.000Z");
    expect(inverno.a).toBe("2027-01-09T23:00:00.000Z");
    // Il giorno del ritorno all'ora solare dura 25 ore.
    const cambio = finestraGiorno(new Date("2026-10-26T05:30:00Z"));
    expect(new Date(cambio.a).getTime() - new Date(cambio.da).getTime()).toBe(25 * 3_600_000);
  });
});

// 24/09/2026: le risposte non arrivano più per email una a una. Quelle buone
// finiscono qui, in cima al riepilogo, col numero da comporre; e sopra ancora
// c'è quello che è fermo.
describe("da chiamare oggi e urgenze", () => {
  const base: DatiRiepilogo = {
    giorno: "giovedì 24 settembre",
    brand: [conti({ brand: "ThermoDMR", inviate: 180, primoContatto: 180, risposte: 2, interessati: 2 })],
    chiHaRisposto: ["Rossi Serramenti — interessato"],
    caselleFerme: [] as string[],
    caselleAttive: 9,
  };

  it("chi ha risposto bene è in cima, col numero e cosa ha detto", () => {
    const { titolo, righe, testo } = componiRiepilogo({
      ...base,
      daChiamare: [
        { chi: "Rossi Serramenti", canale: "email", motivo: "interessato", quando: "ieri", telefono: "348 123 4567", cosa: "mi mandate un preventivo?" },
        { chi: "Bianchi Infissi", canale: "whatsapp", motivo: "chiede un appuntamento", quando: "sabato", telefono: null },
      ],
    });
    expect(titolo).toBe("Outreach giovedì 24 settembre: 180 email, 2 da chiamare");
    expect(righe[0]).toEqual({ etichetta: "Da chiamare oggi", valore: "2 · Rossi Serramenti, Bianchi Infissi" });
    expect(testo).toContain("DA CHIAMARE OGGI (2)");
    expect(testo).toContain("• Rossi Serramenti — interessato (email, ieri) · 348 123 4567 · «mi mandate un preventivo?»");
    // Senza numero in rubrica lo dice, invece di lasciare un buco.
    expect(testo).toContain("• Bianchi Infissi — chiede un appuntamento (WhatsApp, sabato) · numero non in rubrica");
    // Le chiamate stanno PRIMA dell'elenco di tutte le risposte.
    expect(testo.indexOf("DA CHIAMARE OGGI")).toBeLessThan(testo.indexOf("Hanno risposto ieri:"));
  });

  it("le urgenze si vedono dall'oggetto e aprono il rapporto", () => {
    const { titolo, righe, testo } = componiRiepilogo({
      ...base,
      urgenze: ["WhatsApp Numero appuntamenti +39 350 178 2744: staccato", "la casella info@x.it non spedisce"],
      daChiamare: [{ chi: "Rossi Serramenti", canale: "email", motivo: "interessato", quando: "ieri", telefono: "348 123 4567" }],
    });
    expect(titolo.startsWith("Da guardare — Outreach")).toBe(true);
    expect(righe[0].etichetta).toBe("Urgenze");
    expect(testo.startsWith("URGENZE\n• WhatsApp Numero appuntamenti")).toBe(true);
    expect(testo.indexOf("URGENZE")).toBeLessThan(testo.indexOf("DA CHIAMARE OGGI"));
  });

  it("il messaggio lungo si accorcia, quello vuoto non lascia virgolette vuote", () => {
    const lungo = rigaDaChiamare({
      chi: "Verdi Costruzioni", canale: "email", motivo: "fa una domanda", quando: "oggi",
      telefono: "02 1234567", cosa: "a".repeat(200),
    });
    expect(lungo).toContain("…»");
    expect(lungo.length).toBeLessThan(200);
    const senzaTesto = rigaDaChiamare({ chi: "Verdi", canale: "whatsapp", motivo: "da ricontattare", quando: "ieri", telefono: "02 1234567" });
    expect(senzaTesto).toBe("• Verdi — da ricontattare (WhatsApp, ieri) · 02 1234567");
  });
});

// 24/09/2026: l'obiettivo è il 3% di risposte positive sulle PERSONE
// contattate, e il riepilogo del mattino lo mette sotto gli occhi ogni giorno.
describe("positive sulle persone contattate, ultimi 30 giorni", () => {
  it("la riga del brand dice positive e persone, con la percentuale", () => {
    const r = rigaBrand(conti({ persone30: 510, positive30: 8 }));
    expect(r.valore).toContain("30 giorni: 8 positive su 510 persone (1,6%)");
    expect(rigaBrand(conti({ persone30: 1097, positive30: 0 })).valore).toContain("30 giorni: nessuna positiva su 1097 persone (0,0%)");
  });

  it("senza il dato dei 30 giorni la riga resta com'era", () => {
    expect(rigaBrand(conti({})).valore).not.toContain("30 giorni");
  });

  it("il totale sta subito sotto «Ieri in tutto», con l'obiettivo accanto", () => {
    const { righe } = componiRiepilogo({
      giorno: "giovedì 24 settembre",
      brand: [conti({ brand: "ThermoDMR", persone30: 510, positive30: 8 }), conti({ brand: "Marketing Edile", persone30: 1784, positive30: 9 })],
      chiHaRisposto: [], caselleFerme: [], caselleAttive: 90,
    });
    const iIeri = righe.findIndex((r) => r.etichetta === "Ieri in tutto");
    expect(righe[iIeri + 1].etichetta).toBe("Ultimi 30 giorni");
    expect(righe[iIeri + 1].valore).toBe(`17 risposte positive su 2294 persone contattate (0,7%) · obiettivo ${OBIETTIVO_POSITIVE_PCT}%`);
  });

  it("la funzione del riepilogo legge il conto dal database, chiusa ad anon", () => {
    // La raccolta sta nel modulo condiviso dal 25/09/2026 (la usa anche l'email del mattino).
    const funzione = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/outreachRiepilogoDati.ts"), "utf8");
    expect(funzione).toContain('admin.rpc("outreach_positive_30_giorni")');
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20280924130000_outreach_positive_30_giorni.sql"), "utf8");
    expect(sql).toContain("revoke all on function public.outreach_positive_30_giorni() from public, anon, authenticated;");
    expect(sql).toContain("r.intent in ('interested', 'question')");
  });
});
