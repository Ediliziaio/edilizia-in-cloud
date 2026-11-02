import { describe, expect, it } from "vitest";
import { applyVariationTemplate, blankVariationTemplate, validateVariationTemplate, VARIATION_TEMPLATE_EXAMPLES } from "@/lib/orders/variationTemplates";
import { emptyVariationDraft, prepareVariation } from "@/lib/orders/variationDraft";
import { variationDocumentContext } from "@/lib/orders/variationDocumentContext";
import { variationProposalPdf } from "@/lib/orders/variationPreviewPdf";
import { writeFileSync } from "node:fs";

describe("Modelli riutilizzabili delle varianti", () => {
  it("mantiene lavori, prezzo, giorni, riferimento e appunti della commessa", () => {
    const draft = { ...emptyVariationDraft(), title: "Extra", description: "Lavori specifici", amount: "300", days: "3", dayUnit: "lavorativi" as const, internalNotes: "PRIVATE", contractReference: "PRE-1" };
    const result = applyVariationTemplate(draft, VARIATION_TEMPLATE_EXAMPLES[0], { orderCode: "ORD-1" });
    expect(result).toMatchObject({ title: "Extra", description: "Lavori specifici", amount: "300", days: "3", dayUnit: "lavorativi", internalNotes: "PRIVATE", contractReference: "PRE-1" });
    expect(result.documentIntro).toContain("ORD-1");
    expect(prepareVariation(result).descrizione).toContain("contratto originario");
    expect(prepareVariation(result).descrizione).not.toContain("PRIVATE");
  });
  it("le modifiche successive al modello non riscrivono la bozza già compilata", () => {
    const model = { ...VARIATION_TEMPLATE_EXAMPLES[0] };
    const draft = applyVariationTemplate(emptyVariationDraft(), model, { orderCode: "ORD-1" });
    model.conditions_text = "Altre condizioni";
    expect(draft.additionalTerms).not.toBe(model.conditions_text);
  });
  it.each(["{{password}}", "{{azienda.token}}", "{{cliente.nome_completo}"])("rifiuta variabile o sintassi non valida %s", intro_text => {
    expect(() => validateVariationTemplate({ ...VARIATION_TEMPLATE_EXAMPLES[0], intro_text })).toThrow();
  });
  it("non inventa un dato cliente mancante", () => {
    expect(() => applyVariationTemplate(emptyVariationDraft(), { ...VARIATION_TEMPLATE_EXAMPLES[0], intro_text: "Gentile {{cliente.nome_completo}}" }, {})).toThrow("Manca il dato");
  });
  it("non permette testi senza nome o colori invisibili", () => {
    expect(() => validateVariationTemplate(blankVariationTemplate())).toThrow("Completa");
    expect(() => validateVariationTemplate({ ...VARIATION_TEMPLATE_EXAMPLES[0], primary_color: "#ffffff" })).toThrow("Stile");
  });
  it("non ripropone metadati o dati privati nel payload da salvare", () => {
    const raw = { ...VARIATION_TEMPLATE_EXAMPLES[0], company_id: "wrong-company", id: "old-id", revision: 900, firma_token: "PRIVATE" };
    expect(validateVariationTemplate(raw)).not.toHaveProperty("company_id");
    expect(JSON.stringify(validateVariationTemplate(raw))).not.toMatch(/old-id|PRIVATE/);
  });
  it("genera un esempio PDF dal modello con condizioni e dati dimostrativi, senza firma o invio", async () => {
    const context = { companyName: "Impresa DEMO - dati fittizi", customerName: "Cliente DEMO", orderCode: "ORD-DEMO-001", siteAddress: "Cantiere dimostrativo", currentNet: 10000, vatRate: 10 };
    const template = { ...VARIATION_TEMPLATE_EXAMPLES[1], conditions_text: VARIATION_TEMPLATE_EXAMPLES[1].conditions_text + "\n" + Array.from({ length: 10 }, (_, i) => `Condizione dimostrativa ${i+1}: materiali, tempi di esecuzione e accesso al cantiere vanno concordati nella singola commessa prima dell'accettazione.`).join("\n"), payment_terms: "Saldo dei lavori aggiuntivi alla consegna concordata." };
    const draft = applyVariationTemplate({ ...emptyVariationDraft(), kind: "modifica", documentCompanyName: context.companyName, documentCustomerName: context.customerName, title: "ESEMPIO - modifica pavimento cucina", description: "Sostituzione della finitura prevista con nuovo pavimento. Materiali e posa inclusi; descrivere separatamente le opere escluse dal preventivo iniziale.", amount: "500", days: "2" }, template, context);
    const pdf = await variationProposalPdf(prepareVariation(draft), variationDocumentContext(draft, context));
    const source = pdf.output(); expect(source).toContain("Proposta di modifica del contratto"); expect(source).toContain("DA APPROVARE"); expect(source).toContain("Saldo dei lavori"); expect(source).not.toContain("{{");
    if (process.env.VARIATION_TEMPLATE_PDF_PROOF) writeFileSync(process.env.VARIATION_TEMPLATE_PDF_PROOF, Buffer.from(pdf.output("arraybuffer")));
  });
});

describe("modello «Variante in opera» (Dimora Torino, 31/10/2026)", () => {
  const modello = VARIATION_TEMPLATE_EXAMPLES.find((m) => m.name === "Variante in opera")!;
  it("è valido e si applica con committente, appaltatore e commessa", () => {
    expect(modello).toBeDefined();
    const bozza = applyVariationTemplate(emptyVariationDraft(), modello, { orderCode: "O-0001", customerName: "Mario Bianchi", companyName: "Dimora srl" });
    expect(bozza.documentHeading).toBe("Variante in opera");
    expect(bozza.documentIntro).toContain("O-0001");
    expect(bozza.documentIntro).toContain("Mario Bianchi");
    expect(bozza.documentIntro).toContain("IVA esclusa");
    expect(bozza.additionalTerms).toContain("approvazione scritta");
    expect(bozza.paymentTerms).toContain("prossima tranche di SAL");
    expect(bozza.dayUnit).toBe("lavorativi");
  });
  it("senza il nome del cliente lo chiede, invece di stampare un buco", () => {
    expect(() => applyVariationTemplate(emptyVariationDraft(), modello, { orderCode: "O-0001", companyName: "Dimora srl" })).toThrow(/cliente\.nome_completo/);
  });
});
