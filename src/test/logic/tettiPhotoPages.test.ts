import { describe, expect, it } from "vitest";
import type { TetTemplatePdf } from "@/types/tetti";
import { createFullTettiTemplate, FULL_TETTI_MODULES } from "@/lib/moduli-vendita/fullTettiModules";
import { TETTI_PHOTOGRAPHY_CORRECTIONS } from "@/lib/moduli-vendita/tettiPhotographyCorrections";
import { leggiBlocco, leggiFotoPagina } from "../../../supabase/functions/_shared/blocchiPreventivo";

const base = { id: "qa", company_id: "qa" } as TetTemplatePdf;
const blockKeys = ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const;

describe("Fotografie realmente visibili nelle edizioni Tetti", () => {
  it("il mapping rev2 consegnato al refresh coincide con i nuovi default", () => {
    for (const [id, corrections] of Object.entries(TETTI_PHOTOGRAPHY_CORRECTIONS)) {
      const t = createFullTettiTemplate(base, id as keyof typeof TETTI_PHOTOGRAPHY_CORRECTIONS);
      for (const [key, correction] of Object.entries(corrections)) {
        expect(t.pdf_blocchi?.[key]).toMatchObject(correction.newUrl === null
          ? { senzaFoto: true } : { foto: [correction.newUrl] });
      }
    }
  });
  it.each(FULL_TETTI_MODULES)("%s: chiusura presente e non soppressa come duplicato di un blocco", id => {
    const t = createFullTettiTemplate(base, id);
    const closing = leggiFotoPagina("chiusura", "tetti", t.pdf_blocchi);
    expect(closing).toBeTruthy();
    const blockPhotos = blockKeys.flatMap(key => leggiBlocco(key, "tetti", t.pdf_blocchi).foto);
    expect(blockPhotos).not.toContain(closing);
    expect(t.pdf_blocchi?.modulo_defaults).toMatchObject({ pagina_chiusura: { foto: [closing] } });
  });

  it("impermeabilizzazione: diario su membrana piana, percorso e chiusura distinti", () => {
    const t = createFullTettiTemplate(base, "impermeabilizzazione");
    expect(leggiBlocco("diario", "tetti", t.pdf_blocchi).foto).toEqual(["/module-art/tetti-impermeabilizzazione-cover.jpg"]);
    expect(leggiFotoPagina("chiusura", "tetti", t.pdf_blocchi)).toBe("/module-art/tetti-terrazzo-finitura.jpg");
    expect(leggiFotoPagina("percorso", "tetti", t.pdf_blocchi)).not.toBe(leggiFotoPagina("chiusura", "tetti", t.pdf_blocchi));
    expect(leggiFotoPagina("tempi", "tetti", t.pdf_blocchi)).toBeNull();
  });
  it("lattoneria: la foto del percorso non viene riservata alla chiusura", () => {
    const t = createFullTettiTemplate(base, "lattoneria");
    expect(leggiFotoPagina("percorso", "tetti", t.pdf_blocchi)).toBe("/pdf-stock/comune/domande.jpg");
    expect(leggiFotoPagina("chiusura", "tetti", t.pdf_blocchi)).toBe("/module-art/tetti-lattoneria-cover.jpg");
  });
});
