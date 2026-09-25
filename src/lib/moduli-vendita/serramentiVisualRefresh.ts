import type { SrTemplatePdfRow } from "@/types/serramenti";
import { createFullSerramentiTemplate } from "./fullSerramentiModules";

/** User-triggered, conservative refresh. Custom image URLs, text and photo overrides stay untouched. */
export function refreshCombinatoVisuals(saved: Partial<SrTemplatePdfRow>) {
  const defaults = createFullSerramentiTemplate(saved, "combinato");
  const result = structuredClone(saved);
  if (result.pdf_cover_image_url === "/module-art/serramenti.jpg") result.pdf_cover_image_url = defaults.pdf_cover_image_url;
  const blocks = { ...result.pdf_blocchi };
  const original = saved.pdf_blocchi?.modulo_defaults as Record<string, unknown> | undefined;
  for (const key of ["comeFunziona", "protezione", "pagina_percorso", "pagina_cta", "modulo_foto"]) {
    // Only a recorded, unchanged original can be replaced safely.
    if (original?.[key] !== undefined && JSON.stringify(blocks[key]) === JSON.stringify(original[key])) {
      blocks[key] = defaults.pdf_blocchi?.[key];
    }
  }
  blocks.modulo_visual_revision = 3;
  blocks.modulo_defaults = defaults.pdf_blocchi?.modulo_defaults;
  result.pdf_blocchi = blocks;
  return result;
}
