import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { createFullFvTemplate, FULL_FV_MODULES } from "@/lib/moduli-vendita/fullFvModules";
import { buildFvPreviewBase } from "@/lib/moduli-vendita/fvPreviewData";
import { renderFvPdfHtml } from "../../../supabase/functions/_shared/fvHtmlTemplate";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { refreshCombinatoVisuals } from "@/lib/moduli-vendita/serramentiVisualRefresh";
import { serramentiRoomSummary } from "@/lib/moduli-vendita/serramentiRoomSummary";
import type { SrSerramentoRow } from "@/types/serramenti";

describe.each(FULL_FV_MODULES)("Edizione FV %s", id => {
  it("ha contenuti propri e immagini esistenti", () => {
    const t = createFullFvTemplate({}, "test-company", id);
    expect(t.pdf_blocchi?.modulo_intervento).toBe(id);
    expect(t.faq_items!.length).toBeGreaterThanOrEqual(7);
    expect(t.cronoprogramma).toHaveLength(4);
    expect(existsSync(`public${t.pdf_cover_image_url}`)).toBe(true);
  });
  it("non presenta simulazioni economiche non calcolate né perde componenti", () => {
    const data = buildFvPreviewBase(createFullFvTemplate({}, "test-company", id));
    expect(data.finanziamento).toBeNull(); expect(data.costi.detrazione_eur).toBe(0);
    data.componenti = Array.from({ length: 15 }, (_, i) => ({ categoria: "altro", descrizione: `Elemento-unico-${i}`, quantita: 1 }));
    const html = renderFvPdfHtml(data);
    for (let i = 0; i < 15; i++) expect(html).toContain(`Elemento-unico-${i}`);
    const dom = new DOMParser().parseFromString(html, "text/html");
    dom.querySelectorAll("script,style").forEach(el => el.remove());
    expect(dom.body.textContent?.match(/NaN|undefined|Infinity/)).toBeNull();
    if (id !== "accumulo") expect(html).not.toContain("Aggiunta accumulo");
    expect(html).not.toContain("chiavi in mano");
  });
});
it("aggiorna immagini di serie senza cambiare testi o foto personalizzati", () => {
  const t = createFullSerramentiTemplate({}, "combinato");
  t.pdf_cover_image_url = "/foto-personale.jpg"; t.pdf_cover_hero = "Titolo mio";
  t.pdf_blocchi = { ...t.pdf_blocchi, comeFunziona: { titolo: "Pagina mia", foto: ["/mia.jpg"] } };
  const next = refreshCombinatoVisuals(t);
  expect(next.pdf_cover_image_url).toBe("/foto-personale.jpg"); expect(next.pdf_cover_hero).toBe("Titolo mio");
  expect(next.pdf_blocchi?.comeFunziona).toEqual(t.pdf_blocchi.comeFunziona);
  expect(t.pdf_blocchi.modulo_visual_revision).toBeUndefined();
});
it("raggruppa ambienti senza presumere il numero di vani", () => {
  const rows = [ { tipologia: "finestra", ambiente: "Sala", quantita: 2 }, { tipologia: "zanzariera", ambiente: "Sala", quantita: 1 }, { tipologia: "porta", ambiente: null, quantita: 3 } ] as SrSerramentoRow[];
  const summary = serramentiRoomSummary(rows);
  expect(summary).toHaveLength(2); expect(summary[0].products.map(p => p.quantity)).toEqual([2, 1]);
  expect(summary[1].name).toBe("Ambiente da indicare");
});
