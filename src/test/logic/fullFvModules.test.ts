import { beforeEach, describe, expect, it } from "vitest";
import { createFullFvTemplate } from "@/lib/moduli-vendita/fullFvModules";
import { buildFvPreviewBase } from "@/lib/moduli-vendita/fvPreviewData";
import { accumuloCopyChoices } from "@/lib/moduli-vendita/fvInterventionCopy";
import { loadLocalFvTemplate, localFvTemplateKey, saveLocalFvTemplate } from "@/lib/moduli-vendita/localFvTemplates";
import { FV_ACCUMULO_PAGINE_NON_APPLICABILI } from "../../../supabase/functions/_shared/fvIntervento";
import { getFvPdfRenderedPagesCount, renderFvPdfHtml } from "../../../supabase/functions/_shared/fvHtmlTemplate";
const seed = () => createFullFvTemplate({ logo_url: "/brand.png" }, "company-a", "accumulo");
beforeEach(() => localStorage.clear());

describe("Accumulo: modello FV originale completo", () => {
  it("ha pagine specifiche senza certificazioni, risparmi o recensioni inventati", () => {
    const t = seed();
    expect(t.logo_url).toBe("/brand.png");
    expect(t.faq_items).toHaveLength(7);
    expect(t.cronoprogramma).toHaveLength(4);
    expect(t.recensioni).toEqual([]);
    expect(t.certificazioni).toEqual([]);
    expect(t.condizioni_legali_attivo).toBe(false);
    expect(t.pdf_pages_order?.filter(p => p.visible).every(p => !FV_ACCUMULO_PAGINE_NON_APPLICABILI.has(p.id))).toBe(true);
    expect(t.pdf_blocchi?.modulo_defaults).toBeTruthy();
  });
  it("l'anteprima propone la batteria, non un nuovo impianto o vantaggi economici attribuiti al totale", () => {
    const d = buildFvPreviewBase(seed());
    expect(d.componenti.map(c => c.categoria)).toEqual(["accumulo"]);
    expect(d.costi.detrazione_eur).toBe(0);
    expect(d.finanziamento).toBeNull();
    expect(d.scenario.risparmio_anno1_eur).toBe(0);
    expect(d.azienda.tagline).toContain("DIMOSTRATIVA");
    const html = renderFvPdfHtml(d);
    expect(html).toContain("Aggiunta accumulo 10,0 kWh");
    expect(html).toContain("Integrazione sistema di accumulo");
    expect(html).not.toContain("Impianto FV 0");
    expect(html).not.toContain("Costo netto reale");
    expect((html.match(/class="page"/g) || []).length).toBe(getFvPdfRenderedPagesCount(d));
  });
  it("non reintroduce i grafici dell'intero impianto anche con un ordine pagine precedente", () => {
    const t = seed();
    t.pdf_pages_order = t.pdf_pages_order!.map(p => ({ ...p, visible: true }));
    const d = buildFvPreviewBase(t);
    const html = renderFvPdfHtml(d);
    expect(html).not.toContain("class=\"sankey");
    expect(html).not.toContain("La tua casa,<br/>con i pannelli.");
    expect(getFvPdfRenderedPagesCount(d)).toBe(getFvPdfRenderedPagesCount(buildFvPreviewBase(seed())));
  });
  it("non stampa condizioni disattivate nel riepilogo", () => {
    const t = seed(); t.condizioni_legali_testo = "CONDIZIONI-DISATTIVATE-PRIVATE";
    expect(renderFvPdfHtml(buildFvPreviewBase(t))).not.toContain("CONDIZIONI-DISATTIVATE-PRIVATE");
  });
  it("stampa tutti i componenti, anche quelli fuori dalle categorie principali, su più pagine", () => {
    const d = buildFvPreviewBase(seed());
    d.componenti = Array.from({ length: 12 }, (_, i) => ({ ...d.componenti[0], categoria: "altro", descrizione: `PRODOTTO-UNICO-${i + 1}-FINE` }));
    const html = renderFvPdfHtml(d);
    for (let i = 1; i <= 12; i++) expect(html).toContain(`PRODOTTO-UNICO-${i}-FINE`);
    expect(getFvPdfRenderedPagesCount(d)).toBeGreaterThan(getFvPdfRenderedPagesCount(buildFvPreviewBase(seed())));
    expect((html.match(/class="page"/g) || []).length).toBe(getFvPdfRenderedPagesCount(d));
  });
  it("non tronca l'elenco delle FAQ a otto voci", () => {
    const d = buildFvPreviewBase(seed());
    d.template!.faq_items = Array.from({ length: 15 }, (_, i) => ({ domanda: `DOMANDA-UNICA-${i + 1}-FINE`, risposta: "Dettagli da verificare con il referente. ".repeat(6) }));
    const html = renderFvPdfHtml(d);
    for (let i = 1; i <= 15; i++) expect(html).toContain(`DOMANDA-UNICA-${i}-FINE`);
    expect((html.match(/class="page"/g) || []).length).toBe(getFvPdfRenderedPagesCount(d));
  });
  it("mantiene la foto locale, gli a capo e un importo nullo senza valori non numerici", () => {
    const d = buildFvPreviewBase(seed());
    d.costi.prezzo_vendita_iva_inclusa = 0;
    const html = renderFvPdfHtml(d);
    expect(html).toContain("/module-art/fotovoltaico-accumulo-cover.jpg");
    expect(html).toContain("Più spazio alla tua<br");
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it("offre dieci varianti che sostituiscono solo il campo scelto", () => {
    const choices = accumuloCopyChoices(seed());
    expect(choices).toHaveLength(10);
    expect(new Set(choices.map(c => c.id)).size).toBe(10);
    for (const c of choices) { expect(Object.keys(c.patch)).toHaveLength(1); expect(c.preview.length).toBeGreaterThan(20); }
  });
  it("salva in uno spazio distinto con isolamento aziendale e protezione multi-scheda", () => {
    const oldKey = "eic:module-document:old-copy"; localStorage.setItem(oldKey, "personalizzato");
    const record = saveLocalFvTemplate("company-a", "accumulo", seed(), null);
    expect(loadLocalFvTemplate("company-a", "accumulo")?.template.pdf_cover_hero).toBe(seed().pdf_cover_hero);
    expect(loadLocalFvTemplate("company-b", "accumulo")).toBeNull();
    expect(() => saveLocalFvTemplate("company-a", "accumulo", seed(), null)).toThrow("un'altra scheda");
    saveLocalFvTemplate("company-a", "accumulo", { ...seed(), pdf_cover_hero: "Mio titolo" }, record.savedAt);
    expect(loadLocalFvTemplate("company-a", "accumulo")?.template.pdf_cover_hero).toBe("Mio titolo");
    expect(localStorage.getItem(oldKey)).toBe("personalizzato");
  });
  it("preserva copie corrotte e non considera riuscito un salvataggio senza spazio", () => {
    const key = localFvTemplateKey("company-a", "accumulo"); localStorage.setItem(key, "{broken");
    expect(() => saveLocalFvTemplate("company-a", "accumulo", seed(), null)).toThrow("danneggiata");
    expect(localStorage.getItem(key)).toBe("{broken");
    expect(() => saveLocalFvTemplate("company-a", "accumulo", seed(), null, { getItem: () => null, setItem: () => { throw new Error("quota"); } })).toThrow("Spazio locale");
  });
});
