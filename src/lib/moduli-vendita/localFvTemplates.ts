import type { FullFvTemplate, FullFvModuleId } from "./fullFvModules";
import { FULL_FV_MODULES } from "./fullFvModules";
import { archivioModelliAzienda } from "./archivioModelli";

export interface LocalFvTemplate {
  version: 1; companyId: string; moduleId: FullFvModuleId; savedAt: string; template: FullFvTemplate;
}
type StoragePort = Pick<Storage, "getItem" | "setItem">;
export function localFvTemplateKey(companyId: string, moduleId: FullFvModuleId) {
  if (!companyId || !FULL_FV_MODULES.includes(moduleId)) throw new Error("Azienda o modulo non valido.");
  // Separate from the previous generic document: never overwrite that draft.
  return `eic:full-fv-module:v1:${encodeURIComponent(companyId)}:${moduleId}`;
}
function assertRecord(value: unknown, companyId: string, moduleId: FullFvModuleId): asserts value is LocalFvTemplate {
  const r = value as LocalFvTemplate | null, t = r?.template;
  if (!r || r.version !== 1 || r.companyId !== companyId || r.moduleId !== moduleId ||
    !Number.isFinite(Date.parse(r.savedAt)) || !t || t.company_id !== companyId || t.id !== `local-fotovoltaico-${moduleId}` ||
    typeof t.pdf_cover_hero !== "string" || t.pdf_blocchi?.modulo_intervento !== moduleId ||
    !Array.isArray(t.pdf_pages_order) || t.pdf_pages_order.some(p => !p || typeof p.id !== "string" || typeof p.visible !== "boolean") ||
    !Array.isArray(t.faq_items) || t.faq_items.some(f => !f || typeof f.domanda !== "string" || typeof f.risposta !== "string") ||
    !Array.isArray(t.cronoprogramma) || !Array.isArray(t.usp) || !Array.isArray(t.garanzie_conversione)) {
    throw new Error("Copia locale non leggibile. I dati non sono stati sovrascritti.");
  }
}
export function loadLocalFvTemplate(companyId: string, moduleId: FullFvModuleId, storage: StoragePort = archivioModelliAzienda): LocalFvTemplate | null {
  const raw = storage.getItem(localFvTemplateKey(companyId, moduleId));
  if (raw === null) return null;
  let record: unknown;
  try { record = JSON.parse(raw); } catch { throw new Error("Copia locale danneggiata: i dati non sono stati modificati."); }
  assertRecord(record, companyId, moduleId);
  return record;
}
export function saveLocalFvTemplate(companyId: string, moduleId: FullFvModuleId, template: FullFvTemplate, expectedSavedAt: string | null, storage: StoragePort = archivioModelliAzienda) {
  const previous = loadLocalFvTemplate(companyId, moduleId, storage);
  if ((previous?.savedAt ?? null) !== expectedSavedAt) throw new Error("Il modulo è stato modificato in un'altra scheda. Riaprilo prima di salvare.");
  const record: LocalFvTemplate = { version: 1, companyId, moduleId,
    savedAt: new Date(Math.max(Date.now(), previous ? Date.parse(previous.savedAt) + 1 : 0)).toISOString(),
    template: { ...template, id: `local-fotovoltaico-${moduleId}`, company_id: companyId } };
  assertRecord(record, companyId, moduleId);
  try { storage.setItem(localFvTemplateKey(companyId, moduleId), JSON.stringify(record)); }
  catch { throw new Error("Spazio locale non disponibile. Riduci le immagini: le modifiche restano aperte nell'editor."); }
  return record;
}
