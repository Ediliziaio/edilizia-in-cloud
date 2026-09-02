/**
 * I blocchi "Condizioni e termini legali" importati dalla libreria nei moduli
 * vendita portano i merge tag: i PDF dei moduli devono sostituirli coi dati
 * del progetto (prima uscivano letterali).
 */
import { describe, it, expect } from "vitest";
import { applicaMergeTagModulo } from "@/lib/mergeTagsModuli";

describe("merge tag nei moduli vendita", () => {
  it("sostituisce azienda, cliente, cantiere e numero", () => {
    const out = applicaMergeTagModulo(
      "{{azienda.ragione_sociale}} esegue i lavori per {{cliente.nome_completo}} presso {{cantiere.indirizzo}} ({{preventivo.numero}}).",
      { companyName: "Demo Azienda 2 S.r.l.", clienteNome: "Fabio", clienteCognome: "Marchetti", cantiereIndirizzo: "Corso Italia 88, Bergamo", numero: "SF-260625-0001" },
    );
    expect(out).toBe("Demo Azienda 2 S.r.l. esegue i lavori per Fabio Marchetti presso Corso Italia 88, Bergamo (SF-260625-0001).");
  });

  it("il piano pagamenti ricade sulle condizioni di pagamento del modulo", () => {
    const out = applicaMergeTagModulo("Pagamento: {{preventivo.piano_pagamenti}}", { pianoPagamenti: "30% alla firma, saldo a fine lavori" });
    expect(out).toBe("Pagamento: 30% alla firma, saldo a fine lavori");
  });

  it("senza tag restituisce il testo com'è, e con testo vuoto una stringa vuota", () => {
    expect(applicaMergeTagModulo("Nessun tag qui", {})).toBe("Nessun tag qui");
    expect(applicaMergeTagModulo(null, {})).toBe("");
  });
});
