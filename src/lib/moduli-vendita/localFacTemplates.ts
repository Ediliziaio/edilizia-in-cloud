import { z } from "zod";
import { isFacLocalImage, isFullFacModuleId, type FullFacModuleId, type FullFacTemplate } from "./fullFacModules";
import { archivioModelliAzienda } from "./archivioModelli";

export interface LocalFacTemplate { version: 1; companyId: string; moduleId: FullFacModuleId; savedAt: string; template: FullFacTemplate }
export type FacStoragePort = Pick<Storage, "getItem" | "setItem">;
const text = z.string().nullable();
const image = text.refine(value => value === null || isFacLocalImage(value), "Immagine non locale");
const pair = z.object({ titolo: z.string(), descrizione: text.optional() });
const block = z.object({ occhiello: z.string().optional(), titolo: z.string().optional(), intro: text.optional(),
  voci: z.array(z.object({ titolo: z.string(), testo: text, icona: text })).optional(),
  escluse: z.array(z.object({ titolo: z.string(), testo: text, icona: text })).optional(),
  foto: z.array(image).optional(), senzaFoto: z.boolean().optional(), nota: text.optional(),
}).passthrough();
const blocks = z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
  for (const [key, entry] of Object.entries(value)) {
    if (["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"].includes(key) || key.startsWith("pagina_")) {
      if (!block.safeParse(entry).success) ctx.addIssue({ code: "custom", message: "Blocco non valido", path: [key] });
    }
  }
});
const schema = z.object({
  id: z.string(), company_id: z.string(),
  cover_title: text, cover_subtitle: text, cover_image_url: image, pdf_cover_image_url: image,
  logo_url: image, cover_logo_url: image, chi_siamo_foto_url: image, chi_siamo: text,
  ragione_sociale: text, indirizzo_completo: text, telefono: text, email: text, partita_iva: text,
  color_primary: text, color_secondary: text, color_accent: text, font_family: text,
  pdf_cover_eyebrow: text, pdf_cover_bg_color: z.string(), pdf_cover_text_color: z.string(),
  pdf_cover_title_size: z.number().min(16).max(60), pdf_cover_subtitle_size: z.number().min(8).max(24),
  pdf_cover_overlay_opacity: z.number().min(0).max(100),
  pdf_cover_overlay_style: z.enum(["flat", "gradient", "gradient_diag", "vignette"]),
  pdf_cover_text_align: z.enum(["left", "center"]), pdf_cover_text_vertical: z.enum(["top", "center", "bottom"]),
  esigenze: z.array(pair), soluzione: z.array(pair), usp: z.array(pair), percorso: z.array(pair), garanzie: z.array(pair),
  faq: z.array(z.object({ domanda: z.string(), risposta: z.string() })),
  cronoprogramma: z.array(z.object({ fase: z.string(), descrizione: text.optional(), durata: text.optional() })),
  testimonianze: z.array(z.object({ autore: z.string(), testo: z.string(), ruolo: text.optional(), voto: z.number().min(1).max(5).nullable().optional() })),
  gallery_lavori: z.array(z.object({ id: z.string(), url: image, didascalia: text.optional(), luogo: text.optional() })).nullable(),
  pdf_pagine_libere: z.array(z.object({ id: z.string(), titolo: z.string(), occhiello: text.optional(), testoHtml: text.optional(), fotoUrl: image.optional(), didascalia: text.optional() })),
  pdf_ordine_capitoli: z.array(z.object({ chiave: z.string(), visibile: z.boolean() })).nullable(),
  pdf_blocchi: blocks, payment_terms_text: text, validity_text: text, condizioni_legali_testo: text,
  condizioni_legali_attivo: z.boolean().nullable(),
  show_chi_siamo: z.boolean(), show_percorso: z.boolean(), show_garanzie: z.boolean(), show_cronoprogramma: z.boolean(),
  default_iva_pct: z.number().min(0).max(100).nullable(), default_detrazione_pct: z.literal(0),
}).passthrough();

export function localFacTemplateKey(companyId: string, moduleId: FullFacModuleId): string {
  if (!companyId?.trim() || !isFullFacModuleId(moduleId)) throw new Error("Azienda o modulo Facciate non valido.");
  return `eic:full-fac-module:v1:${encodeURIComponent(companyId)}:${moduleId}`;
}
export function assertFacTemplate(template: unknown, companyId: string, id: FullFacModuleId): asserts template is FullFacTemplate {
  const parsed = schema.safeParse(template);
  if (!parsed.success || parsed.data.company_id !== companyId || parsed.data.id !== `local-facciate-${id}`) {
    throw new Error("Copia locale Facciate non valida o di un'altra azienda. I dati non sono stati sovrascritti.");
  }
  const defaults = parsed.data.pdf_blocchi.modulo_defaults;
  if (!defaults || !blocks.safeParse(defaults).success) throw new Error("Contenuto di serie non leggibile. Conserva la copia locale e chiedi assistenza.");
}
export function loadLocalFacTemplate(companyId: string, id: FullFacModuleId, storage: FacStoragePort = archivioModelliAzienda): LocalFacTemplate | null {
  let raw: string | null;
  try { raw = storage.getItem(localFacTemplateKey(companyId, id)); }
  catch { throw new Error("Il browser non consente di leggere la copia locale. Nessun dato è stato modificato."); }
  if (raw === null) return null;
  let record: LocalFacTemplate;
  try { record = JSON.parse(raw); } catch { throw new Error("Copia locale danneggiata. I dati non sono stati sovrascritti."); }
  if (!record || record.version !== 1 || record.companyId !== companyId || record.moduleId !== id || typeof record.savedAt !== "string" || !Number.isFinite(Date.parse(record.savedAt))) {
    throw new Error("Copia locale incompatibile. I dati non sono stati sovrascritti.");
  }
  assertFacTemplate(record.template, companyId, id);
  return record;
}
/** Synchronous read/compare/write; Web Locks at the panel boundary serialize cooperating tabs. */
export function saveLocalFacTemplate(companyId: string, id: FullFacModuleId, template: FullFacTemplate, expectedSavedAt: string | null, storage: FacStoragePort = archivioModelliAzienda): LocalFacTemplate {
  assertFacTemplate(template, companyId, id);
  const current = loadLocalFacTemplate(companyId, id, storage);
  if ((current?.savedAt ?? null) !== expectedSavedAt) throw new Error("Il modulo è stato modificato in un'altra scheda. Riaprilo prima di salvare; la bozza resta aperta.");
  const record: LocalFacTemplate = { version: 1, companyId, moduleId: id, template: structuredClone(template),
    savedAt: new Date(Math.max(Date.now(), current ? Date.parse(current.savedAt) + 1 : 0)).toISOString() };
  try { storage.setItem(localFacTemplateKey(companyId, id), JSON.stringify(record)); }
  catch { throw new Error("Salvataggio locale non riuscito: spazio esaurito o browser non disponibile. Riduci le immagini; le modifiche restano aperte."); }
  return record;
}
