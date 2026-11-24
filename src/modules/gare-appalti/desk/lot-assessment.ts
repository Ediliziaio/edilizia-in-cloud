import { evidenceValidAt } from '../domain';
import { activeTenderDocuments, requirementOpen } from '../tender-ux';
import type { CompanyAsset, Evidence, GareDocument, Participation, Requirement, Tender, Workspace } from '../types';
import type { PreparationRun } from '../types';

export interface AssessmentRow {
 requirement: Requirement;
 source?: GareDocument;
 sourceCurrent: boolean;
 evidence?: Evidence;
 evidenceCurrent: boolean;
 evidenceHolders: string[];
 candidates: { asset: CompanyAsset; reasons: string[] }[];
 checked: boolean;
}

export function assessLots(data: Workspace, p: Participation, tender: Tender, referenceDate: string, preparation?: PreparationRun | null) {
 const lots = data.lots.filter(lot => lot.tender_id === tender.id);
 const selected = new Set(data.participationLots.filter(lot => lot.participation_id === p.id).map(lot => lot.lot_id));
 const sources = data.documents.filter(doc => doc.tender_id === tender.id && doc.category === 'fonte');
 const current = new Set(activeTenderDocuments(sources).map(doc => doc.id));
 // Suggestions only refer to sources and company records from the corresponding analysis.
 const snapshot = preparation?.snapshot;
 const currentSourceHashes = new Map(sources.filter(doc => current.has(doc.id)).map(doc => [doc.id, doc.sha256]));
 const matches = snapshot?.sources?.length && snapshot.sources.length === currentSourceHashes.size
  && snapshot.sources.every(doc => currentSourceHashes.get(doc.id) === doc.sha256)
  ? preparation?.result.matches || [] : [];
 const revisions = new Map((snapshot?.assets || []).map(asset => [asset.id, asset.revision]));
 const assets = new Map((data.companyAssets || []).filter(asset => asset.status !== 'archiviato' && !asset.source_replaced && revisions.get(asset.id) === asset.revision).map(asset => [asset.id, asset]));

 const rows: AssessmentRow[] = data.requirements.filter(r => r.participation_id === p.id).map(requirement => {
  const source = sources.find(doc => doc.id === requirement.source_document_id);
  const sourceCurrent = !!source && current.has(source.id);
  const evidence = data.evidence.find(item => item.id === requirement.evidence_id);
  const evidenceCurrent = !!evidence && !!evidence.verified_on && evidenceValidAt(evidence.status, evidence.expires_on, evidence.verified_on, referenceDate);
  const evidenceHolders = evidence ? [...new Set((data.companyAssets || []).filter(asset =>
   asset.evidence_id === evidence.id && asset.status === 'confermato' && !asset.source_replaced,
  ).map(asset => asset.entity_name).filter(Boolean))] : [];
  const match = matches.find(entry => entry.requirement_id === requirement.id && entry.description === requirement.description);
  const candidates = (match?.candidates || []).flatMap(candidate => {
   const asset = assets.get(candidate.id);
   return asset ? [{ asset, reasons: candidate.reasons }] : [];
  });
  const checked = !requirementOpen(requirement) && sourceCurrent && (requirement.status === 'non_applicabile' || evidenceCurrent);
  return { requirement, source, sourceCurrent, evidence, evidenceCurrent, evidenceHolders, candidates, checked };
 });

 const rowsFor = (lot: string) => rows.filter(row => !lot || !row.requirement.lot_id || row.requirement.lot_id === lot);
 return { lots, selected, rows, rowsFor };
}
