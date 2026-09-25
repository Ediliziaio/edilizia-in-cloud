import type { PavTemplatePdf } from "@/types/pavimenti";
import { isFullPavModuleId, type FullPavModuleId } from "./fullPavModules";

export interface LocalPavTemplate {
  version: 1;
  companyId: string;
  moduleId: FullPavModuleId;
  savedAt: string;
  template: PavTemplatePdf;
}
type StoragePort = Pick<Storage, "getItem" | "setItem">;

export function localPavTemplateKey(companyId: string, moduleId: FullPavModuleId) {
  if (!companyId || !isFullPavModuleId(moduleId)) throw new Error("Azienda o modulo non valido.");
  return `eic:full-pav-module:v1:${encodeURIComponent(companyId)}:${moduleId}`;
}

function assertRecord(value: unknown, companyId: string, moduleId: FullPavModuleId): asserts value is LocalPavTemplate {
  const r = value as LocalPavTemplate | null;
  const t = r?.template;
  const lists = [t?.esigenze, t?.soluzione, t?.usp, t?.percorso, t?.garanzie];
  if (!r || r.version !== 1 || r.companyId !== companyId || r.moduleId !== moduleId ||
    typeof r.savedAt !== "string" || !Number.isFinite(Date.parse(r.savedAt)) ||
    !t || t.company_id !== companyId || t.id !== `local-pavimenti-${moduleId}` ||
    (t.cover_title !== null && typeof t.cover_title !== "string") ||
    lists.some(list => !Array.isArray(list) || list.some(item => !item || typeof item.titolo !== "string")) ||
    !Array.isArray(t.faq) || t.faq.some(f => !f || typeof f.domanda !== "string" || typeof f.risposta !== "string") ||
    !Array.isArray(t.cronoprogramma) || t.cronoprogramma.some(f => !f || typeof f.fase !== "string") ||
    !Array.isArray(t.testimonianze)) {
    throw new Error("La copia locale non è leggibile. Non è stata sovrascritta: conserva i dati e chiedi assistenza.");
  }
}

export function loadLocalPavTemplate(companyId: string, moduleId: FullPavModuleId, storage: StoragePort = localStorage): LocalPavTemplate | null {
  const raw = storage.getItem(localPavTemplateKey(companyId, moduleId));
  if (raw === null) return null;
  let record: unknown;
  try { record = JSON.parse(raw); } catch { throw new Error("Copia locale danneggiata: i dati non sono stati modificati."); }
  assertRecord(record, companyId, moduleId);
  return record;
}

/** Optimistic revision check prevents a second tab silently overwriting changes. */
export function saveLocalPavTemplate(companyId: string, moduleId: FullPavModuleId, template: PavTemplatePdf, expectedSavedAt: string | null, storage: StoragePort = localStorage): LocalPavTemplate {
  if (template.company_id !== companyId) throw new Error("Il modello appartiene a un'altra azienda. Riapri il modulo.");
  const existing = loadLocalPavTemplate(companyId, moduleId, storage);
  if ((existing?.savedAt ?? null) !== expectedSavedAt) throw new Error("Questo modulo è stato modificato in un'altra scheda. Riaprilo prima di salvare.");
  const record: LocalPavTemplate = { version: 1, companyId, moduleId,
    savedAt: new Date(Math.max(Date.now(), existing ? Date.parse(existing.savedAt) + 1 : 0)).toISOString(),
    template: { ...template, id: `local-pavimenti-${moduleId}`, company_id: companyId } };
  assertRecord(record, companyId, moduleId);
  try { storage.setItem(localPavTemplateKey(companyId, moduleId), JSON.stringify(record)); }
  catch { throw new Error("Salvataggio locale non riuscito: spazio esaurito o browser non disponibile. Riduci le immagini; le modifiche restano aperte nell'editor."); }
  return record;
}
