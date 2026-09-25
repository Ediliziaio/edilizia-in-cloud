import type { SrProgettoRow, SrTemplatePdfRow } from "@/types/serramenti";

/**
 * Gli interventi Serramenti che aprono il preventivatore col loro modello: tutti e
 * sette dal 25/09/2026 (prima solo finestre, persiane e combinato). Il modello decide
 * il documento, non i prodotti: dal preventivo si aggiunge sempre tutto il listino
 * dell'area (modelCatalog.ts suggerisce, non limita).
 */
export const SR_OPERATIONAL_MODELS = ["finestre", "persiane", "avvolgibili", "zanzariere", "porte-ingresso", "porte-interne", "combinato"] as const;
export type SrQuoteModelId = typeof SR_OPERATIONAL_MODELS[number];
export function isSrQuoteModelId(value: unknown): value is SrQuoteModelId {
  return typeof value === "string" && (SR_OPERATIONAL_MODELS as readonly string[]).includes(value);
}

/** Document configuration only. Prices/measurements always come from the real quote. */
export interface SrQuoteModelSnapshot {
  version: 1;
  modelId: SrQuoteModelId;
  companyId: string;
  capturedAt: string;
  template: Partial<SrTemplatePdfRow>;
}

export function makeSrQuoteModelSnapshot(companyId: string, modelId: SrQuoteModelId, template: Partial<SrTemplatePdfRow>): SrQuoteModelSnapshot {
  if (!companyId || !isSrQuoteModelId(modelId) || template.company_id !== companyId) {
    throw new Error("Il modello non appartiene all'azienda del preventivo.");
  }
  const copy = structuredClone(template);
  // These are editor-only baselines, not part of an issued document.
  if (copy.pdf_blocchi) {
    delete copy.pdf_blocchi.modulo_defaults;
    delete copy.pdf_blocchi.modulo_foto;
  }
  const snapshot: SrQuoteModelSnapshot = { version: 1, companyId, modelId, capturedAt: new Date().toISOString(), template: copy };
  readSrQuoteModelSnapshot(snapshot, companyId);
  return snapshot;
}

/** Fail closed: never silently generate the general PDF when a model is damaged. */
export function readSrQuoteModelSnapshot(value: unknown, companyId: string): SrQuoteModelSnapshot | null {
  if (value == null) return null;
  const s = value as SrQuoteModelSnapshot;
  if (s.version !== 1 || !isSrQuoteModelId(s.modelId) || s.companyId !== companyId ||
      !Number.isFinite(Date.parse(s.capturedAt)) || !s.template || s.template.company_id !== companyId ||
      s.template.pdf_blocchi?.modulo_intervento !== s.modelId ||
      typeof s.template.pdf_cover_hero !== "string" || !s.template.pdf_cover_hero.trim() ||
      !Array.isArray(s.template.pdf_pages_order) || s.template.pdf_pages_order.length === 0 ||
      s.template.pdf_pages_order.some(p => !p || typeof p.id !== "string" || typeof p.visible !== "boolean")) {
    throw new Error("Il modello salvato nel preventivo non è valido. Il PDF generico non verrà usato al suo posto.");
  }
  return s;
}

/** Snapshot wins over both a changed URL and a later company-template revision. */
export function quoteModelTemplate(project: Pick<SrProgettoRow, "company_id" | "modello_snapshot">): Partial<SrTemplatePdfRow> | null {
  return readSrQuoteModelSnapshot(project.modello_snapshot, project.company_id)?.template ?? null;
}

export async function resolveSrDocumentTemplate(
  project: Pick<SrProgettoRow, "company_id" | "modello_snapshot">,
  draft: Partial<SrTemplatePdfRow> | null | undefined,
  fresh: boolean | undefined,
  loadCompanyTemplate: (companyId: string) => Promise<Partial<SrTemplatePdfRow> | null>,
) {
  const snapshot = quoteModelTemplate(project);
  if (snapshot) return snapshot;
  return fresh ? loadCompanyTemplate(project.company_id) : draft ?? null;
}

export function srModelProjectDefaults(snapshot: SrQuoteModelSnapshot): Partial<SrProgettoRow> {
  const t = snapshot.template;
  return {
    esigenze: structuredClone(t.esigenze_default ?? []), soluzione: structuredClone(t.soluzione_default ?? []),
    perche_noi: [...(t.perche_noi_default ?? [])], incluso_investimento: [...(t.incluso_default ?? [])],
    prossimi_passi: [...(t.prossimi_passi_default ?? [])], testimonianze: [],
    valido_fino_giorni: t.valido_giorni_default ?? 30,
    // Tax and payment choices remain the company's actual defaults, not preview fixtures.
  };
}
