/**
 * Merge tag dei template preventivo (composer condiviso con la edge
 * generate-quote-pdf). Collaudo reale del 2026-09-02: nel PDF gli importi
 * uscivano "€28816,40" e {{preventivo.piano_pagamenti}} restava vuoto quando
 * il preventivo non aveva fasi strutturate.
 */
import { describe, it, expect } from "vitest";
import { buildMergeContext, substituteMergeTags } from "../../../supabase/functions/_shared/quoteTemplateComposer";

const quote = { quote_number: "PRV-2026-520", total: 28816.4, subtotal: 23620, vat_amount: 5196.4, client_name: "Fabio Marchetti", client_address: "Corso Italia 88, Bergamo", created_at: "2026-08-24T10:00:00Z" };
const company = { name: "Demo Azienda 2 S.r.l." };

describe("merge tag preventivo", () => {
  it("gli importi hanno il formato del resto del PDF: punto migliaia, virgola decimali, euro dopo", () => {
    const ctx = buildMergeContext({ quote, company });
    expect(ctx.preventivo.totale).toBe("28.816,40 €");
    expect(ctx.preventivo.subtotale).toBe("23.620,00 €");
    expect(ctx.preventivo.iva).toBe("5.196,40 €");
    expect(buildMergeContext({ quote: { total: 999.5 } }).preventivo.totale).toBe("999,50 €");
    expect(buildMergeContext({ quote: { total: 1234567.891 } }).preventivo.totale).toBe("1.234.567,89 €");
  });

  it("il piano pagamenti usa le fasi strutturate quando ci sono", () => {
    const ctx = buildMergeContext({ quote: { ...quote, payment_method: "Bonifico", payment_phases: [{ label: "Acconto", percent: 30, amount: 8644.92 }, { label: "Saldo", percent: 70, amount: 20171.48 }] } });
    expect(ctx.preventivo.piano_pagamenti).toBe("Modalità: Bonifico · Acconto 30% (8.644,92 €) · Saldo 70% (20.171,48 €)");
  });

  it("senza fasi il piano pagamenti prende le condizioni di pagamento del template, mai vuoto", () => {
    const conTemplate = buildMergeContext({ quote, template: { payment_terms_text: "<p>Acconto 30% alla firma, saldo alla consegna.</p>" } });
    expect(conTemplate.preventivo.piano_pagamenti).toBe("Acconto 30% alla firma, saldo alla consegna.");
    const senzaNulla = buildMergeContext({ quote });
    expect(senzaNulla.preventivo.piano_pagamenti).toBe("come da condizioni di pagamento concordate");
  });

  it("i tag vengono sostituiti nel testo e quelli sconosciuti non fanno danni", () => {
    const ctx = buildMergeContext({ quote, company });
    const testo = substituteMergeTags("{{azienda.ragione_sociale}} per {{cliente.nome_completo}}: {{preventivo.totale}} ({{preventivo.numero}})", ctx);
    expect(testo).toBe("Demo Azienda 2 S.r.l. per Fabio Marchetti: 28.816,40 € (PRV-2026-520)");
  });
});
