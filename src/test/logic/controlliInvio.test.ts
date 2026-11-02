import { beforeEach, describe, expect, it } from "vitest";
import { allegatoDimenticato, cancellaBozza, leggiBozza, motivoBloccoEmail, salvaBozza } from "@/lib/messaggi/controlliInvio";

describe("controlli prima dell'invio", () => {
  it("segnala l'allegato dimenticato, non le parole simili né se il file c'è", () => {
    expect(allegatoDimenticato("In allegato trova il preventivo", 0)).toBe(true);
    expect(allegatoDimenticato("Le allego la fattura", 0)).toBe(true);
    expect(allegatoDimenticato("Vedi gli ALLEGATI", 0)).toBe(true);
    expect(allegatoDimenticato("In allegato trova il preventivo", 1)).toBe(false);
    expect(allegatoDimenticato("Un cantiere allegro", 0)).toBe(false);
  });

  it("dice cosa manca, nell'ordine in cui si compila", () => {
    const ok = { mittente: "m", oggetto: "o", testo: "t", caricamento: false };
    expect(motivoBloccoEmail(ok)).toBeNull();
    expect(motivoBloccoEmail({ ...ok, mittente: "" })).toMatch(/casella/);
    expect(motivoBloccoEmail({ ...ok, oggetto: "  " })).toBe("Manca l'oggetto");
    expect(motivoBloccoEmail({ ...ok, testo: "" })).toBe("Manca il testo");
    expect(motivoBloccoEmail({ ...ok, caricamento: true })).toMatch(/caricamento/);
  });
});

describe("bozza del messaggio", () => {
  beforeEach(() => localStorage.clear());

  it("torna per lo stesso utente e destinatario, e scade dopo sette giorni", () => {
    salvaBozza("u", "c1", { emailSubject: "Oggetto", emailBody: "Testo" }, 1000);
    expect(leggiBozza("u", "c1", 2000)).toMatchObject({ emailSubject: "Oggetto", emailBody: "Testo" });
    expect(leggiBozza("u", "c2", 2000)).toBeNull();
    expect(leggiBozza("altro", "c1", 2000)).toBeNull();
    expect(leggiBozza("u", "c1", 1000 + 8 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it("testo vuoto o invio riuscito la tolgono", () => {
    salvaBozza("u", "c1", { smsText: "ciao" });
    salvaBozza("u", "c1", { smsText: "  ", emailBody: "" });
    expect(leggiBozza("u", "c1")).toBeNull();
    salvaBozza("u", "c1", { smsText: "ciao" });
    cancellaBozza("u", "c1");
    expect(leggiBozza("u", "c1")).toBeNull();
  });
});
