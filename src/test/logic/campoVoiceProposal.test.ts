import { describe, expect, it } from "vitest";
import { normalizeVoiceProposal } from "@/lib/campo/voiceProposal";
describe("Le proposte AI non decidono ore o permessi", () => {
  it("scarta campi decisionali, ore fuori scala e materiali malformati", () => {
    const p = normalizeVoiceProposal({ trascrizione: " Posa ", dati_estratti: { lavorazione: "Pavimento", ore_lavorate: 40, stato: "approvato", presenze: [{ ore: 8 }], percentuale: 100, materiali: [null, { nome: "Malta", quantita: "otto" }, { nome: "Malta", quantita: 2, unita: "sacco" }] } });
    expect(p.dati_estratti).toEqual({ lavorazione: "Pavimento", note: "", materiali: [{ nome: "Malta", quantita: 2, unita: "sacco" }] }); expect(p.trascrizione).toBe("Posa");
  });
  it("null, array e campi incompleti non fanno bloccare il modulo", () => {
    expect(normalizeVoiceProposal(null).trascrizione).toBe(""); expect(normalizeVoiceProposal({ dati_estratti: { materiali: "inventato" } }).dati_estratti.materiali).toEqual([]);
  });
  it("non precompila ore che non sono state dichiarate", () => {
    expect(normalizeVoiceProposal({ dati_estratti: {} }).dati_estratti).not.toHaveProperty("ore_lavorate");
  });
});
