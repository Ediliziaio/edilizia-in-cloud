import type { EleTemplatePdf } from "@/types/elettrico";
import { isFullEltModuleId, type FullEltModuleId } from "./fullEltModules";
import { archivioModelliAzienda } from "./archivioModelli";

export interface LocalEltTemplate {
  version: 1;
  companyId: string;
  moduleId: FullEltModuleId;
  savedAt: string;
  template: EleTemplatePdf;
}
type StoragePort = Pick<Storage, "getItem" | "setItem">;

export function localEltTemplateKey(companyId: string, moduleId: FullEltModuleId) {
  if (!companyId || !isFullEltModuleId(moduleId)) throw new Error("Azienda o modulo non valido.");
  return `eic:full-elt-module:v1:${encodeURIComponent(companyId)}:${moduleId}`;
}

function assertRecord(value: unknown, companyId: string, moduleId: FullEltModuleId): asserts value is LocalEltTemplate {
  const r = value as LocalEltTemplate | null;
  const t = r?.template;
  const lists = [t?.esigenze, t?.soluzione, t?.usp, t?.percorso, t?.garanzie];
  if (!r || r.version !== 1 || r.companyId !== companyId || r.moduleId !== moduleId ||
    typeof r.savedAt !== "string" || !Number.isFinite(Date.parse(r.savedAt)) ||
    !t || t.company_id !== companyId || t.id !== `local-elettrico-${moduleId}` ||
    t.pdf_blocchi?.modulo_intervento !== moduleId ||
    (t.cover_title !== null && typeof t.cover_title !== "string") ||
    lists.some(list => !Array.isArray(list) || list.some(item => !item || typeof item.titolo !== "string")) ||
    !Array.isArray(t.faq) || t.faq.some(f => !f || typeof f.domanda !== "string" || typeof f.risposta !== "string") ||
    !Array.isArray(t.cronoprogramma) || t.cronoprogramma.some(f => !f || typeof f.fase !== "string") ||
    !Array.isArray(t.testimonianze) || t.testimonianze.some(v => !v || typeof v.autore !== "string" || typeof v.testo !== "string") ||
    !Array.isArray(t.gallery_lavori) ||
    !Array.isArray(t.pdf_pagine_libere) || t.pdf_pagine_libere.some(p => !p || typeof p.id !== "string" || typeof p.titolo !== "string") ||
    !Array.isArray(t.pdf_ordine_capitoli) || t.pdf_ordine_capitoli.some(p => !p || typeof p.chiave !== "string" || typeof p.visibile !== "boolean")) {
    throw new Error("La copia locale non è leggibile. Non è stata sovrascritta: conserva i dati e chiedi assistenza.");
  }
}

export function loadLocalEltTemplate(companyId: string, moduleId: FullEltModuleId, storage: StoragePort = archivioModelliAzienda): LocalEltTemplate | null {
  const raw = storage.getItem(localEltTemplateKey(companyId, moduleId));
  if (raw === null) return null;
  let record: unknown;
  try { record = JSON.parse(raw); } catch { throw new Error("Copia locale danneggiata: i dati non sono stati modificati."); }
  assertRecord(record, companyId, moduleId);
  return record;
}

/** Optimistic revision check prevents a second tab silently overwriting changes. */
export function saveLocalEltTemplate(companyId: string, moduleId: FullEltModuleId, template: EleTemplatePdf, expectedSavedAt: string | null, storage: StoragePort = archivioModelliAzienda): LocalEltTemplate {
  if (template.company_id !== companyId) throw new Error("Il modello appartiene a un'altra azienda. Riapri il modulo.");
  const existing = loadLocalEltTemplate(companyId, moduleId, storage);
  if ((existing?.savedAt ?? null) !== expectedSavedAt) throw new Error("Questo modulo è stato modificato in un'altra scheda. Riaprilo prima di salvare.");
  const record: LocalEltTemplate = { version: 1, companyId, moduleId,
    savedAt: new Date(Math.max(Date.now(), existing ? Date.parse(existing.savedAt) + 1 : 0)).toISOString(),
    template: { ...template, id: `local-elettrico-${moduleId}`, company_id: companyId } };
  assertRecord(record, companyId, moduleId);
  try { storage.setItem(localEltTemplateKey(companyId, moduleId), JSON.stringify(record)); }
  catch { throw new Error("Salvataggio locale non riuscito: spazio esaurito o browser non disponibile. Riduci le immagini; le modifiche restano aperte nell'editor."); }
  return record;
}
