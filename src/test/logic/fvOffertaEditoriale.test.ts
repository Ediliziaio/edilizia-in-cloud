import { describe, expect, it } from "vitest";
import { buildFvPreviewBase } from "../../lib/moduli-vendita/fvPreviewData";
import { createFullFvTemplate } from "../../lib/moduli-vendita/fullFvModules";
import { normalizeFvPdfPagesOrder } from "../../../supabase/functions/_shared/fvPagine";
import { renderFvPdfHtml, getFvPdfRenderedPagesCount } from "../../../supabase/functions/_shared/fvHtmlTemplate";
import { catalogoPersonalizzazioneFv, contestoPersonalizzazioneFv } from "../../../supabase/functions/_shared/fvPersonalizzazioneCompleta";
const sezioni = (h: string) => h.split(/(?=<div class="page">)/);
describe("Presentazione e perimetro della proposta FV", () => {
  it("non aggiunge pagine vuote né attiva nuove promesse nei modelli esistenti", () => {
    const d = buildFvPreviewBase({}); d.template = { pdf_pages_order: normalizeFvPdfPagesOrder([{ id: "chi_siamo", visible: true }, { id: "ambito_offerta", visible: true }]) };
    const h = renderFvPdfHtml(d); expect(h).not.toContain('data-fv-section="chi_siamo"'); expect(h).not.toContain('data-fv-section="ambito_offerta"');
  });
  it("usa presentazione, punti di forza e certificazioni senza inventare dati o duplicarli nelle garanzie", () => {
    const d = buildFvPreviewBase({}); d.template = { presentazione_impresa_html: "<p>Presentazione verificata dell’installatore.</p>", chi_siamo_titolo: "Il tuo referente", usp: [{ titolo: "Metodo confermato", descrizione: "Descrizione confermata" }], certificazioni: [{ nome: "Certificato inserito", ente: "Ente indicato" }], pdf_pages_order: normalizeFvPdfPagesOrder([{ id: "chi_siamo", visible: true }]) };
    const h = renderFvPdfHtml(d), p = sezioni(h).find(p => p.includes('data-fv-section="chi_siamo"'))!;
    expect(p).toContain("Presentazione verificata"); expect(p).toContain("Certificato inserito"); expect(h.match(/Metodo confermato/g)).toHaveLength(1);
    expect(p).not.toContain("anni di esperienza"); expect(h.match(/<div class="page">/g)).toHaveLength(getFvPdfRenderedPagesCount(d));
    expect(catalogoPersonalizzazioneFv(h, contestoPersonalizzazioneFv(d)).some(p => p.sezione === "chi_siamo")).toBe(true);
  });
  it("conserva presentazioni e voci lunghe su più pagine senza perdere la fine del testo", () => {
    const d = buildFvPreviewBase({}); d.template = { presentazione_impresa_html: Array.from({ length: 80 }, (_, i) => `<p>Passaggio ${i} del metodo illustrato, con le responsabilità concordate.</p>`).join(""), pdf_pages_order: normalizeFvPdfPagesOrder([{ id: "chi_siamo", visible: true }, { id: "ambito_offerta", visible: true }]), pdf_blocchi: { ambito_offerta: { attivo: true, inclusioni: Array.from({ length: 24 }, (_, i) => `Attività inclusa ${i}`), esclusioni: ["Opera esclusa"], verifiche: ["Verifica da concordare"] } } };
    const h = renderFvPdfHtml(d); expect(h.match(/data-fv-section="chi_siamo"/g)!.length).toBeGreaterThan(1); expect(h).toContain("Passaggio 79"); expect(h).toContain("Attività inclusa 23"); expect(h).toContain("Opera esclusa"); expect(h).toContain("Verifica da concordare");
    expect(h.match(/<div class="page">/g)).toHaveLength(getFvPdfRenderedPagesCount(d));
    d.template.pdf_blocchi!.ambito_offerta = { attivo: false, inclusioni: ["Non mostrare questa attività"] }; expect(renderFvPdfHtml(d)).not.toContain("Non mostrare questa attività");
  });
  it("rende disponibili le schede prodotto anche per l’azienda, solo se selezionate nel modello", () => {
    const t = createFullFvTemplate({}, "demo", "aziendale"), d = buildFvPreviewBase(t); d.template = { ...t, pdf_pages_order: normalizeFvPdfPagesOrder(t.pdf_pages_order).map(p => p.id === "schede_prodotti" ? { ...p, visible: true } : p) };
    const h = renderFvPdfHtml(d); expect(h).toContain('data-fv-section="schede_prodotti"'); expect(h).toContain("Ogni componente");
    expect(h.match(/<div class="page">/g)).toHaveLength(getFvPdfRenderedPagesCount(d));
  });
  it("mantiene riconoscibile una foto illustrativa anche dopo l’incorporazione nel PDF", () => {
    const d = buildFvPreviewBase({}); d.template = { foto_team_url: "data:image/png;base64,AA==", foto_team_illustrativa: true, pdf_pages_order: normalizeFvPdfPagesOrder([{ id: "chi_siamo", visible: true }]) };
    const p = sezioni(renderFvPdfHtml(d)).find(p => p.includes('data-fv-section="chi_siamo"'))!;
    expect(p).toContain("Immagine illustrativa"); expect(p).toContain("non è un lavoro attribuito all’installatore");
  });
});
