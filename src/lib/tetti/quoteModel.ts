import type { TetTemplatePdf } from "@/types/tetti";
import { findTettiTemplateModule, type TettiTemplateModuleId } from "@/lib/moduli-vendita/tettiTemplateModules";
import { conArchivioDelDocumento } from "@/lib/condizioni/archivioNelModello";

export interface TetQuoteModelSnapshot {
  version: 1;
  modulo?: 'tetti';
  modelId: TettiTemplateModuleId;
  companyId: string;
  capturedAt: string;
  template: TetTemplatePdf;
}
export function readTetQuoteModel(value: unknown, companyId: string): TetQuoteModelSnapshot | null {
  if (value == null) return null;
  const s = value as TetQuoteModelSnapshot;
  if (s.version !== 1 || (s.modulo !== undefined && s.modulo !== 'tetti') || !findTettiTemplateModule(s.modelId) || s.companyId !== companyId ||
      !Number.isFinite(Date.parse(s.capturedAt)) || s.template?.company_id !== companyId ||
      s.template.pdf_blocchi?.modulo_intervento !== s.modelId || !s.template.cover_title?.trim() ||
      !Array.isArray(s.template.pdf_ordine_capitoli) || !s.template.pdf_ordine_capitoli.length) {
    throw new Error("Il modello Tetti salvato non è valido o appartiene a un'altra azienda. Nessun PDF generico verrà usato al suo posto.");
  }
  return s;
}
export function makeTetQuoteModel(companyId: string, modelId: TettiTemplateModuleId, source: TetTemplatePdf): TetQuoteModelSnapshot {
  const template = structuredClone(source);
  if (template.pdf_blocchi) {
    delete template.pdf_blocchi.modulo_defaults;
    delete template.pdf_blocchi.modulo_foto;
  }
  const snapshot: TetQuoteModelSnapshot = { version: 1, modulo: 'tetti', modelId, companyId, capturedAt: new Date().toISOString(), template };
  readTetQuoteModel(snapshot, companyId);
  return snapshot;
}
export async function resolveTetQuoteTemplate(
  project: { company_id: string; modello_snapshot?: unknown; condizioni_origine?: unknown },
  draft: TetTemplatePdf | null | undefined,
  load: (companyId: string) => Promise<TetTemplatePdf>,
) {
  const template = readTetQuoteModel(project.modello_snapshot, project.company_id)?.template ?? draft ?? await load(project.company_id);
  // Le condizioni vengono da «Contratti e condizioni» (07/11/2026), come per gli altri preventivatori.
  return conArchivioDelDocumento(template, project);
}
