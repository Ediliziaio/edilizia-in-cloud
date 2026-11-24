import type { GareDocument } from '../types';
import type { OfficeModel } from './types';
import type { FormProposal } from '../dossier/FormAssistance';
import { canonicalField } from '../dossier/field-key';

export function formCorrection(doc: GareDocument | undefined, models: OfficeModel[]) {
  const snapshot = doc?.generation_snapshot;
  const subject = snapshot?.subject_snapshot as { id?: string } | undefined;
  const model = models.find(m => m.id === doc?.template_contract_id);
  if (!doc || !model || !subject?.id) return null;
  const mapping = snapshot?.mapping as Record<string, string> | undefined;
  const sources = snapshot?.form_sources as { field_key: string; value?: string; citation?: NonNullable<FormProposal['citation']> }[] | undefined;
  const assetBindings = model.constraints.subject_id === subject.id ? model.constraints.asset_bindings as Record<string, string> | undefined : undefined;
  const assets = snapshot?.reusable_assets as { id: string; title: string; revision: number }[] | undefined;
  const values: Record<string, { value: string; proposal?: FormProposal }> = {};
  for (const field of model.fields.filter(f => f.supported)) {
    const key = canonicalField(field) || `${model.id}_${field.key}`, value = mapping?.[field.key] || '';
    const source = sources?.find(s => s.field_key === field.key);
    const asset = assets?.find(a => a.id === assetBindings?.[field.key] && model.mapping[field.key] === value);
    values[key] = { value, ...(source?.citation && source.value === value ? { proposal: { field_key: field.key, value, kind: 'tender_source' as const, title: 'Fonte conservata della bozza', locator: source.citation.section, citation: source.citation } } : asset ? { proposal: { field_key: field.key, value, kind: 'asset' as const, asset_id: asset.id, revision: asset.revision, title: asset.title, locator: 'Prova aziendale conservata', citation: null } } : {}) };
  }
  const required = Array.isArray(snapshot?.required_fields) ? snapshot.required_fields as string[] : null;
  const previousFields = Array.isArray(snapshot?.fields) ? snapshot.fields as { key: string }[] : [];
  const restoredModel = required ? { ...model, fields: model.fields.map(f => previousFields.some(old => old.key === f.key) ? { ...f, required: required.includes(f.key) } : f) } : model;
  return { subjectId: subject.id, model: restoredModel, values, chosen: [model.source_document_id] };
}
