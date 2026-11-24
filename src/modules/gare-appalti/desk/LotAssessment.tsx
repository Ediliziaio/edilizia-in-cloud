import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileSearch, Layers, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';
import { EditorDialog, Panel, Status } from '../components';
import { dateLabel, money } from '../domain';
import { calendarDate } from '../operations';
import { SourceReader } from '../reader/SourceReader';
import { EvidenceFiles } from '../pages/EvidenceFiles';
import { requirementLabels, type CompanyAsset, type Evidence, type Participation, type PreparationRun, type Requirement, type Tender } from '../types';
import { assessLots, type AssessmentRow } from './lot-assessment';

export function LotAssessment({ p, tender, preparation, onEdit, onLots, onAI }: {
 p: Participation; tender: Tender; preparation?: PreparationRun | null;
 onEdit: (r: Requirement) => void; onLots: () => void; onAI: () => void;
}) {
 const { data, canEdit } = useWorkspace();
 const [params, setParams] = useSearchParams();
 const [openedSource, setOpenedSource] = useState<AssessmentRow | null>(null);
 const [openedProof, setOpenedProof] = useState<{ evidence?: Evidence; asset?: CompanyAsset; valid?: boolean } | null>(null);
 const assessment = assessLots(data, p, tender, tender.deadline_date || calendarDate(new Date()), preparation);
 const lotId = assessment.lots.find(lot => lot.id === params.get('valuta_lotto'))?.id || '';
 const rows = assessment.rowsFor(lotId);

 function showLot(id: string) {
  setParams(current => {
   const next = new URLSearchParams(current);
   if (id) next.set('valuta_lotto', id);
   else next.delete('valuta_lotto');
   return next;
  }, { replace: true, preventScrollReset: true });
 }

 return <Panel className="ga-lot-assessment" title="Requisiti e prove per lotto"
  description={lotId ? 'La vista include i requisiti senza lotto assegnato.' : 'Confronta disciplinare, prove aziendali e verifiche registrate.'}
  action={canEdit && assessment.lots.length > 0 && <Button size="sm" variant="outline" onClick={onLots}><Layers size={14}/>Seleziona lotti</Button>}>
  {assessment.lots.length > 0 && <div className="ga-lot-options" role="group" aria-label="Lotto da valutare">
   <button type="button" aria-pressed={!lotId} onClick={() => showLot('')}><strong>Tutti i lotti</strong><small>{assessment.rows.length} requisiti distinti</small></button>
   {assessment.lots.map(lot => {
    const scoped = assessment.rows.filter(row => row.requirement.lot_id === lot.id);
    const open = scoped.filter(row => !row.checked).length;
    return <button key={lot.id} type="button" aria-pressed={lotId === lot.id} onClick={() => showLot(lot.id)}>
     <strong>Lotto {lot.code} · {lot.title}</strong>
     <small>{assessment.selected.has(lot.id) ? 'In partecipazione' : 'Da valutare'}{lot.amount > 0 && ' · ' + money(lot.amount)}</small>
     <span>{open ? `${open} da verificare` : scoped.length ? `${scoped.length} verificati` : 'Nessun requisito assegnato al lotto'}</span>
    </button>;
   })}
  </div>}
  {rows.length > 0 ? <div className="ga-assessment-rows">
   {rows.map(row => {
    const r = row.requirement;
    const scope = r.lot_id ? assessment.lots.find(lot => lot.id === r.lot_id)?.code : null;
    return <article key={r.id}>
     <div className="ga-assessment-head">
      <div><p>{scope ? `Lotto ${scope}` : r.lot_id ? 'Lotto da verificare' : 'Senza lotto assegnato'} · {r.mandatory ? 'Obbligatorio' : 'Da valutare se applicabile'}</p><h3>{r.description}</h3></div>
      <Status tone={row.checked ? 'success' : r.status === 'incompatibilita' ? 'danger' : 'warning'}>
       {row.checked ? requirementLabels[r.status] : r.status === 'compatibile' || r.status === 'non_applicabile' ? 'Verifica da aggiornare' : requirementLabels[r.status]}
      </Status>
     </div>
     <div className="ga-assessment-pair">
      <div><span>Fonte</span>{row.source ? <>
       <button type="button" onClick={() => setOpenedSource(row)}><FileSearch size={14}/>{row.source.name} · v{row.source.version}{r.source_page ? ` · p. ${r.source_page}` : ''}</button>
       {!row.sourceCurrent && <small>Versione da aggiornare</small>}
       {r.source_section && <small>{r.source_section}</small>}
      </> : <small>Fonte da collegare</small>}</div>
      <div><span>Prova collegata</span>{row.evidence ? <>
       <button type="button" onClick={() => setOpenedProof({ evidence: row.evidence, valid: row.evidenceCurrent })}>{row.evidence.title}</button>
       {row.evidenceHolders.length > 0 && <small>{row.evidenceHolders.join(' · ')}</small>}
       <small>{row.evidenceCurrent ? (tender.deadline_date ? 'Valida alla scadenza registrata' : 'Valida alla data odierna') : 'Validità da verificare'} · {row.evidence.responsible || 'Responsabile da assegnare'}</small>
      </> : <small>Nessuna prova collegata</small>}</div>
     </div>
     {(r.source_quote || r.applicability || r.threshold || r.reference_period || r.expected_proof || r.note) && <details>
      <summary>Estratto, condizioni e note</summary>
      {r.source_quote && <blockquote>{r.source_quote}</blockquote>}
      {[r.applicability, [r.threshold, r.unit].filter(Boolean).join(' '), r.reference_period, r.expected_proof, r.note].filter(Boolean).map((value, index) => <p key={index}>{value}</p>)}
     </details>}
     {row.candidates.length > 0 && <details>
      <summary>Proposte di collegamento · {row.candidates.length}</summary>
      {row.candidates.map(({ asset, reasons }) => <div className="ga-comparison-candidate" key={asset.id}>
       <button type="button" onClick={() => setOpenedProof({ asset, evidence: data.evidence.find(e => e.id === asset.evidence_id) })}>{asset.title}</button>
       <p>{asset.entity_name || 'Operatore da verificare'} · {reasons[0] || 'Verifica pertinenza al requisito'}</p>
      </div>)}
     </details>}
     {canEdit && <Button size="sm" variant="outline" onClick={() => onEdit(r)}><Pencil size={14}/>Verifica requisito</Button>}
    </article>;
   })}
  </div> : <div className="ga-comparison-empty">
   <p>{lotId ? 'Nessun requisito registrato per questo lotto.' : 'I requisiti della gara sono ancora da censire.'}</p>
   <Button size="sm" variant="outline" onClick={onAI}>Apri analisi e proposte</Button>
  </div>}
  {openedSource?.source && <SourceReader document={openedSource.source} initialPage={openedSource.requirement.source_page}
   initialSection={openedSource.requirement.source_section} initialQuote={openedSource.requirement.source_quote} onClose={() => setOpenedSource(null)}/>}
  {openedProof && <EditorDialog title={openedProof.asset?.title || openedProof.evidence!.title}
   description={openedProof.asset?.entity_name || 'Evidenza del fascicolo aziendale'} onClose={() => setOpenedProof(null)}>
   {openedProof.asset && <>
    <dl className="ga-comparison-proof">{Object.entries(openedProof.asset.data).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{key.replace(/_/g, ' ')}</dt><dd>{value}</dd></div>)}</dl>
    {openedProof.asset.source_locator && <p className="text-sm">{openedProof.asset.source_locator}</p>}
    {openedProof.asset.source_quote && <blockquote className="text-sm whitespace-pre-wrap">{openedProof.asset.source_quote}</blockquote>}
   </>}
   {openedProof.evidence && <>{openedProof.valid !== undefined && <Status tone={openedProof.valid ? 'success' : 'warning'}>{openedProof.valid ? 'Valida alla data di riferimento' : 'Validità da verificare'}</Status>}<p className="text-sm">{openedProof.evidence.value}</p><p className="text-sm text-muted-foreground">Fonte {openedProof.evidence.source} · verifica {dateLabel(openedProof.evidence.verified_on)}{openedProof.evidence.expires_on ? ` · scade il ${dateLabel(openedProof.evidence.expires_on)}` : ''}</p><EvidenceFiles evidence={openedProof.evidence}/></>}
  </EditorDialog>}
 </Panel>;
}
