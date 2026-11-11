import { describe, expect, it } from "vitest";
import { buildFvPreviewBase } from "../../lib/moduli-vendita/fvPreviewData";
import { createFullFvTemplate } from "../../lib/moduli-vendita/fullFvModules";
import { renderFvPdfHtml, getFvPdfRenderedPagesCount } from "../../../supabase/functions/_shared/fvHtmlTemplate";
import { coverIndustrialeFv } from "../../../supabase/functions/_shared/fvCopertinaIndustriale";
import { catalogoPersonalizzazioneFv, contestoPersonalizzazioneFv } from "../../../supabase/functions/_shared/fvPersonalizzazioneCompleta";
function esempio() {
  const t = createFullFvTemplate({}, "demo", "aziendale-noleggio"), d = buildFvPreviewBase(t);
  d.template = t; return d;
}
const primaPagina = (h: string) => h.split(/(?=<div class="page">)/)[1];
describe("Copertina industriale editoriale", () => {
  it("usa i dati dell’impianto, separa la foto dai testi e rimane personalizzabile", () => {
    const d = esempio(), h = renderFvPdfHtml(d), cover = primaPagina(h);
    expect(cover).toContain("cover--industrial"); expect(cover).toContain("POTENZA PROPOSTA");
    expect(cover).toContain("MODULI PREVISTI"); expect(cover).toContain("Noleggio operativo");
    expect(cover).toContain("Immagine illustrativa"); expect(cover).not.toContain("70.000");
    expect(h.match(/<div class="page">/g)).toHaveLength(getFvPdfRenderedPagesCount(d));
    const cat = catalogoPersonalizzazioneFv(h, contestoPersonalizzazioneFv(d))[0];
    expect(cat.immagini.some(i => i.originale.includes("capannone-copertina"))).toBe(true);
    expect(cat.testi.some(t => t.originale.includes("Energia per crescere"))).toBe(true);
  });
  it("rispetta titoli personalizzati, dati del cliente e scelta del layout precedente", () => {
    const d = esempio(); d.template!.pdf_cover_hero = "La proposta per la tua attività";
    d.cliente.nome = "Cliente <privato>";
    let h = primaPagina(renderFvPdfHtml(d)); expect(h).toContain("La proposta per la tua attività"); expect(h).toContain("&lt;privato&gt;");
    d.template!.pdf_blocchi!.copertina_industriale = { attiva: false };
    h = primaPagina(renderFvPdfHtml(d)); expect(h).not.toContain("cover--industrial"); expect(h).toContain("cover-bg-img");
  });
  it.each([['cash','Acquisto diretto'],['rate','Finanziamento'],['noleggio','Noleggio operativo'],['leasing','Leasing']] as const)("mostra la formula %s senza aggiungere rate o vantaggi non calcolati", (modo, label) => {
    const d = esempio(); d.economia_azienda!.input.parametri.modo = modo;
    const h = coverIndustrialeFv(d, { cliente:"Cliente",indirizzo:"Sede",tipologia:"Capannone",eyebrow:"Fotovoltaico",hero:"Il tuo tetto.\nEnergia per crescere.",subtitle:"Proposta dimostrativa",bgColor:"#163d40",textColor:"#fff",imageUrl:null,logoUrl:null,showBrand:true,brandJustify:"flex-start",align:"left",showClientCard:true,titleSize:38,subtitleSize:12,eyebrowSize:8,fotoIllustrativa:false });
    expect(h).toContain(label); expect(h).not.toContain("€/mese"); expect(h).not.toContain("img src");
  });
  it("non cambia la copertina del privato anche se eredita un blocco aziendale", () => {
    const d = buildFvPreviewBase({}); d.template = { pdf_blocchi: { copertina_industriale: { attiva: true } } };
    expect(primaPagina(renderFvPdfHtml(d))).not.toContain("cover--industrial");
  });
});
