/**
 * MP-EMAIL-AI-05 — Test motore regole instradamento.
 *
 * Caso guida obbligatorio: Edil Forniture SpA con 4 indirizzi che vanno
 * trattati in modo diverso pur essendo la stessa entità CRM.
 */

import { describe, it, expect } from "vitest";
import { applyRules, evaluateRule, type Regola, type RuleEmailInput } from "../rules-engine";

const FORNITORE_ID = "00000000-0000-0000-0000-00000000ed11";

// 4 regole Edil Forniture (priorità crescente = più specifiche prima)
const REGOLE_EDIL_FORNITURE: Regola[] = [
  {
    id: "r-news", nome: "Newsletter Edil Forniture", origine: "manuale", stato: "attiva",
    priorita: 10, combinatore: "AND",
    condizioni: [{ campo: "indirizzo", operatore: "e", valore: "newsletter@ediforniture.it" }],
    azioni: [{ tipo: "categoria", valore: "newsletter" }, { tipo: "silenzia" }, { tipo: "salta_ai" }],
  },
  {
    id: "r-prev", nome: "Preventivi Edil Forniture", origine: "manuale", stato: "attiva",
    priorita: 10, combinatore: "AND",
    condizioni: [{ campo: "indirizzo", operatore: "e", valore: "preventivi@ediforniture.it" }],
    azioni: [
      { tipo: "categoria", valore: "preventivo" },
      { tipo: "collega_entita", valore: { tipo: "fornitore", id: FORNITORE_ID } },
      { tipo: "priorita", valore: "alta" },
    ],
  },
  {
    id: "r-ord", nome: "Ordini Edil Forniture", origine: "manuale", stato: "attiva",
    priorita: 10, combinatore: "AND",
    condizioni: [{ campo: "indirizzo", operatore: "e", valore: "ordini@ediforniture.it" }],
    azioni: [
      { tipo: "categoria", valore: "fornitore" },
      { tipo: "collega_entita", valore: { tipo: "fornitore", id: FORNITORE_ID } },
      { tipo: "priorita", valore: "alta" },
    ],
  },
  {
    id: "r-log", nome: "Logistica Edil Forniture (DDT)", origine: "manuale", stato: "attiva",
    priorita: 10, combinatore: "AND",
    condizioni: [{ campo: "indirizzo", operatore: "e", valore: "logistica@ediforniture.it" }],
    azioni: [
      { tipo: "categoria", valore: "fornitore" },
      { tipo: "collega_entita", valore: { tipo: "fornitore", id: FORNITORE_ID } },
      { tipo: "marca_da_fare" },
      { tipo: "notifica", valore: { reparto: "cantiere" } },
    ],
  },
];

function emailDa(indirizzo: string, extra: Partial<RuleEmailInput> = {}): RuleEmailInput {
  return { from_email: indirizzo, fromDomain: "ediforniture.it", subject: "", snippet: "", ...extra };
}

describe("MP-05 — Edil Forniture: 1 entità, 4 canali, 4 trattamenti", () => {
  it("newsletter@ → newsletter + silenzia + salta_ai", () => {
    const m = applyRules(emailDa("newsletter@ediforniture.it"), REGOLE_EDIL_FORNITURE);
    expect(m).not.toBeNull();
    expect(m!.result.categoria).toBe("newsletter");
    expect(m!.side_effects.silenzia).toBe(true);
    expect(m!.side_effects.salta_ai).toBe(true);
    expect(m!.regola_nome).toContain("Newsletter");
  });

  it("preventivi@ → preventivo + entità fornitore + priorità alta", () => {
    const m = applyRules(emailDa("preventivi@ediforniture.it"), REGOLE_EDIL_FORNITURE);
    expect(m!.result.categoria).toBe("preventivo");
    expect(m!.result.entita_tipo).toBe("fornitore");
    expect(m!.result.entita_id).toBe(FORNITORE_ID);
    expect(m!.side_effects.priorita).toBe("alta");
  });

  it("ordini@ → fornitore + entità + priorità alta", () => {
    const m = applyRules(emailDa("ordini@ediforniture.it"), REGOLE_EDIL_FORNITURE);
    expect(m!.result.categoria).toBe("fornitore");
    expect(m!.result.entita_id).toBe(FORNITORE_ID);
    expect(m!.side_effects.priorita).toBe("alta");
  });

  it("logistica@ → fornitore + marca_da_fare + notifica cantiere", () => {
    const m = applyRules(emailDa("logistica@ediforniture.it"), REGOLE_EDIL_FORNITURE);
    expect(m!.result.categoria).toBe("fornitore");
    expect(m!.side_effects.marca_da_fare).toBe(true);
    expect(m!.side_effects.notifica).toEqual({ reparto: "cantiere" });
  });

  it("indirizzo non coperto → nessun match (scende nella cascata)", () => {
    const m = applyRules(emailDa("amministrazione@ediforniture.it"), REGOLE_EDIL_FORNITURE);
    expect(m).toBeNull();
  });
});

describe("MP-05 — operatori e combinatori", () => {
  it("operatore 'contiene' su oggetto", () => {
    const regola: Regola = {
      id: "r1", nome: "DDT generico", origine: "manuale", stato: "attiva",
      priorita: 50, combinatore: "AND",
      condizioni: [{ campo: "oggetto", operatore: "contiene", valore: "ddt" }],
      azioni: [{ tipo: "categoria", valore: "fornitore" }],
    };
    expect(evaluateRule(emailDa("x@y.it", { subject: "Trasmissione DDT 451" }), regola)).toBe(true);
    expect(evaluateRule(emailDa("x@y.it", { subject: "Preventivo" }), regola)).toBe(false);
  });

  it("operatore 'termina_con' su dominio", () => {
    const regola: Regola = {
      id: "r2", nome: "Dominio fornitore", origine: "manuale", stato: "attiva",
      priorita: 50, combinatore: "AND",
      condizioni: [{ campo: "dominio", operatore: "termina_con", valore: "ediforniture.it" }],
      azioni: [{ tipo: "categoria", valore: "fornitore" }],
    };
    expect(evaluateRule(emailDa("chiunque@ediforniture.it"), regola)).toBe(true);
  });

  it("combinatore OR: basta una condizione", () => {
    const regola: Regola = {
      id: "r3", nome: "Fattura o sollecito", origine: "manuale", stato: "attiva",
      priorita: 50, combinatore: "OR",
      condizioni: [
        { campo: "oggetto", operatore: "contiene", valore: "fattura" },
        { campo: "oggetto", operatore: "contiene", valore: "sollecito" },
      ],
      azioni: [{ tipo: "categoria", valore: "fattura" }],
    };
    expect(evaluateRule(emailDa("x@y.it", { subject: "Sollecito pagamento" }), regola)).toBe(true);
    expect(evaluateRule(emailDa("x@y.it", { subject: "Newsletter" }), regola)).toBe(false);
  });

  it("combinatore AND: servono tutte", () => {
    const regola: Regola = {
      id: "r4", nome: "DDT da fornitore con allegato", origine: "manuale", stato: "attiva",
      priorita: 50, combinatore: "AND",
      condizioni: [
        { campo: "dominio", operatore: "e", valore: "ediforniture.it" },
        { campo: "oggetto", operatore: "contiene", valore: "ddt" },
        { campo: "allegato", operatore: "e", valore: "si" },
      ],
      azioni: [{ tipo: "categoria", valore: "fornitore" }],
    };
    expect(evaluateRule(emailDa("log@ediforniture.it", { subject: "DDT 9", has_attachment: true }), regola)).toBe(true);
    expect(evaluateRule(emailDa("log@ediforniture.it", { subject: "DDT 9", has_attachment: false }), regola)).toBe(false);
  });
});

describe("MP-05 — precedenza", () => {
  it("priorità più bassa vince", () => {
    const rules: Regola[] = [
      { id: "generica", nome: "Generica dominio", origine: "manuale", stato: "attiva", priorita: 100, combinatore: "AND",
        condizioni: [{ campo: "dominio", operatore: "e", valore: "ediforniture.it" }],
        azioni: [{ tipo: "categoria", valore: "fornitore" }] },
      { id: "specifica", nome: "Specifica preventivi", origine: "manuale", stato: "attiva", priorita: 10, combinatore: "AND",
        condizioni: [{ campo: "indirizzo", operatore: "e", valore: "preventivi@ediforniture.it" }],
        azioni: [{ tipo: "categoria", valore: "preventivo" }] },
    ];
    const m = applyRules(emailDa("preventivi@ediforniture.it"), rules);
    expect(m!.result.categoria).toBe("preventivo"); // priorità 10 vince su 100
  });

  it("regola disattivata viene ignorata", () => {
    const rules: Regola[] = [
      { id: "off", nome: "Disattivata", origine: "manuale", stato: "disattivata", priorita: 1, combinatore: "AND",
        condizioni: [{ campo: "dominio", operatore: "e", valore: "ediforniture.it" }],
        azioni: [{ tipo: "categoria", valore: "spam" }] },
    ];
    expect(applyRules(emailDa("x@ediforniture.it"), rules)).toBeNull();
  });
});
