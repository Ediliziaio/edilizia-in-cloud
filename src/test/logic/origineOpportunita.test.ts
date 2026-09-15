/**
 * «Creato il … da …» nella scheda opportunità: chi o cosa l'ha creata.
 * Casi presi dai dati veri di BeMade del 14/09/2026.
 */
import { describe, expect, it } from "vitest";
import { idModuloDaFonte, origineOpportunita } from "@/lib/origineOpportunita";

const staff: Record<string, string> = {
  "1ddef22b-a1a4-448f-8120-ccabf2382953": "Antonella BeMade",
};
const moduli: Record<string, string> = {
  "d7682cd1-afc5-431f-ad86-34f4a2983473": "BeMade — Nuovo",
};
const nomeUtente = (id: string) => staff[id] ?? null;
const nomeModulo = (id: string) => moduli[id] ?? null;

describe("origineOpportunita", () => {
  it("inserita a mano: dice la persona, anche se c'è una fonte", () => {
    expect(origineOpportunita(
      { created_by: "1ddef22b-a1a4-448f-8120-ccabf2382953", source: "facebook", tags: [] },
      nomeUtente, nomeModulo,
    )).toEqual({ tipo: "utente", testo: "Antonella BeMade", importata: false });
  });

  it("persona che non è più nell'elenco dello staff: non inventa un nome", () => {
    expect(origineOpportunita({ created_by: "ffffffff-0000-0000-0000-000000000000" }, nomeUtente, nomeModulo))
      .toEqual({ tipo: "utente", testo: "un utente", importata: false });
  });

  it("modulo del sito col codice form_<id>: torna il nome del modulo", () => {
    expect(origineOpportunita(
      { source: "form_d7682cd1-afc5-431f-ad86-34f4a2983473" }, nomeUtente, nomeModulo,
    )).toEqual({ tipo: "fonte", testo: "modulo «BeMade — Nuovo»", importata: false });
  });

  it("modulo del sito cancellato: resta «modulo del sito», non il codice", () => {
    expect(origineOpportunita(
      { source: "form_9e4006e3-f00b-43c9-a967-835ab44f5073" }, nomeUtente, nomeModulo,
    )?.testo).toBe("modulo del sito");
  });

  it("Facebook, con e senza il modulo Lead Ads", () => {
    expect(origineOpportunita({ source: "facebook" }, nomeUtente, nomeModulo)?.testo).toBe("Facebook");
    expect(origineOpportunita({ source: "facebook", meta_lead_id: "1234" }, nomeUtente, nomeModulo)?.testo)
      .toBe("Facebook (modulo Lead Ads)");
  });

  it("fonte scritta a mano da chi ha configurato il canale: resta com'è", () => {
    expect(origineOpportunita({ source: "Google nuovo" }, nomeUtente, nomeModulo)?.testo).toBe("Google nuovo");
    expect(origineOpportunita({ source: "google" }, nomeUtente, nomeModulo)?.testo).toBe("Google");
  });

  it("importata dal CRM precedente: fonte più il segno dell'importazione", () => {
    expect(origineOpportunita(
      { source: "facebook", tags: ["import-bemade-1109"] }, nomeUtente, nomeModulo,
    )).toEqual({ tipo: "fonte", testo: "Facebook", importata: true });
    expect(origineOpportunita({ source: null, tags: ["import-bemade-restauro-1109"] }, nomeUtente, nomeModulo))
      .toEqual({ tipo: "fonte", testo: "importazione", importata: true });
  });

  it("nessuna informazione: non scrive niente", () => {
    expect(origineOpportunita({ source: "  ", tags: ["nuovo"] }, nomeUtente, nomeModulo)).toBeNull();
  });

  it("idModuloDaFonte riconosce solo il formato form_<uuid>", () => {
    expect(idModuloDaFonte("form_d7682cd1-afc5-431f-ad86-34f4a2983473")).toBe("d7682cd1-afc5-431f-ad86-34f4a2983473");
    expect(idModuloDaFonte("modulo mail")).toBeNull();
    expect(idModuloDaFonte(null)).toBeNull();
  });
});
