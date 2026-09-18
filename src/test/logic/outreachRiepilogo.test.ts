import { describe, expect, it } from "vitest";
import {
  componiRiepilogo,
  finestraGiorno,
  percentuale,
  rigaBrand,
  type ContiBrand,
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
    expect(testo).toBe("Nessuna risposta ieri.");
    expect(righe[0].valore).toContain("nessuna risposta");
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
    expect(righe[0].valore).toContain("480 email inviate · 3 risposte (0,6%)");
    expect(righe[0].valore).toContain("1 indirizzi inesistenti");
    // «Tasso di invio»: quante sono davvero partite di quelle tentate.
    expect(righe[0].valore).toContain("20 non partite (invio 96%)");
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
