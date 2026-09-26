import type { SrTemplatePdfRow } from "@/types/serramenti";
import { findSerramentiTemplateModule, type SerramentiTemplateModuleId } from "./serramentiTemplateModules";
import { archivioModelliAzienda } from "./archivioModelli";

export interface LocalSerramentiTemplate {
  version: 1;
  companyId: string;
  moduleId: SerramentiTemplateModuleId;
  savedAt: string;
  template: Partial<SrTemplatePdfRow>;
}
type StoragePort = Pick<Storage, "getItem" | "setItem">;
export function localSerramentiTemplateKey(companyId: string, moduleId: SerramentiTemplateModuleId) {
  if (!companyId || !findSerramentiTemplateModule(moduleId)) throw new Error("Azienda o modulo non valido.");
  return `eic:local-module-template:v1:${encodeURIComponent(companyId)}:serramenti:${moduleId}`;
}
function assertRecord(value: unknown, companyId: string, moduleId: SerramentiTemplateModuleId): asserts value is LocalSerramentiTemplate {
  const r = value as LocalSerramentiTemplate | null;
  const t = r?.template;
  if (!r || r.version !== 1 || r.companyId !== companyId || r.moduleId !== moduleId ||
    typeof r.savedAt !== "string" || !Number.isFinite(Date.parse(r.savedAt)) ||
    !t || t.company_id !== companyId || t.id !== `local-serramenti-${moduleId}` ||
    typeof t.pdf_cover_hero !== "string" ||
    [t.esigenze_default, t.soluzione_default].some(a => !Array.isArray(a) || a.some(v => !v || typeof v.titolo !== "string" || typeof v.descrizione !== "string")) ||
    [t.incluso_default, t.perche_noi_default, t.pdf_cta_finale_passi].some(a => !Array.isArray(a) || a.some(v => typeof v !== "string")) ||
    !Array.isArray(t.faq_items) || t.faq_items.some(v => !v || typeof v.domanda !== "string" || typeof v.risposta !== "string") ||
    !Array.isArray(t.pdf_pages_order) || t.pdf_pages_order.some(v => !v || typeof v.id !== "string" || typeof v.visible !== "boolean")) {
    throw new Error("Copia locale non leggibile: non è stata sovrascritta. Conserva i dati e chiedi assistenza.");
  }
}
export function loadLocalSerramentiTemplate(companyId: string, moduleId: SerramentiTemplateModuleId, storage: StoragePort = archivioModelliAzienda): LocalSerramentiTemplate | null {
  const raw = storage.getItem(localSerramentiTemplateKey(companyId, moduleId));
  if (raw === null) return null;
  let record: unknown;
  try { record = JSON.parse(raw); } catch { throw new Error("Copia locale danneggiata: nessun dato modificato."); }
  assertRecord(record, companyId, moduleId);
  return record;
}
export function saveLocalSerramentiTemplate(companyId: string, moduleId: SerramentiTemplateModuleId, template: Partial<SrTemplatePdfRow>, expectedSavedAt: string | null, storage: StoragePort = archivioModelliAzienda): LocalSerramentiTemplate {
  if (template.company_id !== companyId || template.id !== `local-serramenti-${moduleId}`) throw new Error("Il modello non appartiene a questa azienda o modulo.");
  const existing = loadLocalSerramentiTemplate(companyId, moduleId, storage);
  if ((existing?.savedAt ?? null) !== expectedSavedAt) throw new Error("Il modulo è cambiato in un'altra scheda. Riaprilo prima di salvare.");
  const record: LocalSerramentiTemplate = { version: 1, companyId, moduleId, template,
    savedAt: new Date(Math.max(Date.now(), existing ? Date.parse(existing.savedAt) + 1 : 0)).toISOString() };
  assertRecord(record, companyId, moduleId);
  try { storage.setItem(localSerramentiTemplateKey(companyId, moduleId), JSON.stringify(record)); }
  catch { throw new Error("Spazio locale esaurito o browser non disponibile. Riduci le immagini; le modifiche restano aperte."); }
  return record;
}
