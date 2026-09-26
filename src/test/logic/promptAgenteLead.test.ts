/**
 * Il prompt dell'agente WhatsApp dei lead (25/09/2026): quello dell'azienda
 * resta intero, sotto vanno regole che l'azienda non può togliere.
 */
import { describe, expect, it } from "vitest";
import { dataOraRoma, promptAgenteLead } from "../../../supabase/functions/_shared/promptAgenteLead";

const BASE = {
  promptAzienda: "Sei Giusy de IL BAGNO GROUP. Non dire mai che sei un'AI.",
  nomeAzienda: "Il Bagno Group",
  adesso: new Date("2026-09-25T12:05:00Z"),
  contatto: { nome: "Marta", cognome: "Rossi" },
  qualificazione: { zona: "Monza" },
  faseAttuale: "Nuovo contatto AI",
  calendarioNome: "Calendario Katia",
};

describe("promptAgenteLead", () => {
  it("tiene intero il prompt dell'azienda", () => {
    expect(promptAgenteLead(BASE)).toContain(BASE.promptAzienda);
  });

  it("dice all'agente che giorno e che ora sono a Roma", () => {
    expect(promptAgenteLead(BASE)).toContain("venerdì 25 settembre 2026, ore 14:05");
  });

  it("la trasparenza sull'AI vince su qualunque istruzione dell'azienda", () => {
    const p = promptAgenteLead(BASE);
    expect(p).toMatch(/assistente automatico/);
    expect(p.indexOf("assistente automatico")).toBeGreaterThan(p.indexOf(BASE.promptAzienda));
  });

  it("si presenta come assistente virtuale anche se l'azienda gli dà un nome di persona", () => {
    const p = promptAgenteLead(BASE);
    expect(p).toContain("sono l'assistente virtuale di Il Bagno Group");
    expect(p.indexOf("assistente virtuale")).toBeGreaterThan(p.indexOf(BASE.promptAzienda));
  });

  it("non inventa da dove arriva il contatto", () => {
    expect(promptAgenteLead(BASE)).toContain("L'origine del contatto non è indicata nel CRM.");
    expect(promptAgenteLead({ ...BASE, origine: "Meta Lead Ads" })).toContain("Origine del contatto nel CRM: «Meta Lead Ads».");
    expect(promptAgenteLead(BASE)).toMatch(/Non dire che il contatto ha compilato un modulo/);
  });

  it("con gli showroom fissa l'appuntamento di persona se il cliente lo chiede", () => {
    const p = promptAgenteLead({ ...BASE, showroom: [{ nome: "Lissone", indirizzo: "Via Nuova Valassina 27" }, { nome: "Inverigo", indirizzo: null }] });
    expect(p).toContain("prenota_showroom");
    expect(p).toContain("Lissone (Via Nuova Valassina 27); Inverigo");
    expect(p).toContain("non insistere con la telefonata");
  });

  it("senza showroom non promette appuntamenti di persona", () => {
    const p = promptAgenteLead(BASE);
    expect(p).not.toContain("prenota_showroom");
    expect(p).toContain("Si fissano solo telefonate");
  });

  it("orari e prenotazioni solo dagli strumenti", () => {
    const p = promptAgenteLead(BASE);
    expect(p).toContain("orari_liberi");
    expect(p).toContain("prenota_chiamata");
    expect(p).toContain("Calendario Katia");
  });

  it("porta nome, risposte già date e fase del contatto", () => {
    const p = promptAgenteLead(BASE);
    expect(p).toContain("Marta Rossi");
    expect(p).toContain('"zona":"Monza"');
    expect(p).toContain("Nuovo contatto AI");
  });

  it("senza nome né risposte non scrive segnaposto", () => {
    const p = promptAgenteLead({ ...BASE, contatto: { nome: null, cognome: null }, qualificazione: {}, faseAttuale: null });
    expect(p).not.toContain("null");
    expect(p).not.toContain("undefined");
  });
});

describe("dataOraRoma", () => {
  it("usa l'ora legale e l'ora solare", () => {
    expect(dataOraRoma(new Date("2026-09-25T12:05:00Z"))).toBe("venerdì 25 settembre 2026, ore 14:05");
    expect(dataOraRoma(new Date("2026-12-07T08:00:00Z"))).toBe("lunedì 7 dicembre 2026, ore 09:00");
  });
});
