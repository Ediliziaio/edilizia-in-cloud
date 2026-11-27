import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Download, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';
import { EditorDialog, Notice } from '../components';
import { downloadBlob } from '../api';
import type { GareDocument } from '../types';
import type { ReviewEntry, ReviewReport, SavedCheck } from './types';
import { documentOperator, reviewDownloadName } from './document-operator';
import { correctionUrl } from './review-navigation';
import { reviewTitle } from './review-list';
import { ReviewContent } from './ReviewContent';
import { ReviewProvenance } from './ReviewProvenance';
import { ReviewProgress } from './ReviewProgress';
import { ValidationReport } from './ValidationReport';
import { messaggioErrore } from "@/lib/messaggioErrore";

export function ReviewDialog({ document: initial, entry, onClose }: { document: GareDocument; entry?: ReviewEntry; onClose: () => void }) {
  const { api, data, canEdit, canApprove, refresh } = useWorkspace();
  const [doc, setDoc] = useState(initial);
  const [requestId, setRequestId] = useState(String(initial.generation_snapshot?.source_id || entry?.latest?.dependency_snapshot?.request_source?.id || ''));
  const [report, setReport] = useState<ReviewReport | null>(entry?.latest?.report || null), [current, setCurrent] = useState(!!entry?.latest_current);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState(false);
  const [preview, setPreview] = useState(false), [declarations, setDeclarations] = useState(false), [ack, setAck] = useState(false), [note, setNote] = useState('');
  const [pane, setPane] = useState<'documento' | 'controlli'>('documento'), [xmlFocus, setXmlFocus] = useState('');
  const canHand = canEdit && !!doc.participation_id && !['fonte', 'ricevuta'].includes(doc.category);
  const fix = correctionUrl(doc);
  async function run(handoff = false) {
    setBusy(true); setError('');
    try {
      const result = await api.local<{ report: ReviewReport; document: GareDocument; check: SavedCheck }>('review', handoff ? 'handoff' : 'validate', {
        document_id: doc.id, ...(requestId ? { request_document_id: requestId } : {}), expected_revision: doc.revision || 1,
        preview_confirmed: preview, declarations_confirmed: declarations, scope_ack: ack, note,
      });
      setDoc(result.document); setReport(result.report); setCurrent(true); if (handoff) setSent(true); await refresh();
    } catch (e) { setError(messaggioErrore(e)); setCurrent(false); }
    finally { setBusy(false); }
  }
  return <EditorDialog wide className="ga-review-dialog" title={reviewTitle(doc)} description={documentOperator(doc) || doc.name} onClose={onClose}>
    <div className="ga-review-dialog-top"><ReviewProgress document={doc} entry={entry} sent={sent} current={current} reviewable={!!report?.reviewable} /><Button size="sm" variant="outline" onClick={async () => { try { downloadBlob(await api.blob(doc), reviewDownloadName(doc)); } catch (e) { setError(messaggioErrore(e)); } }}><Download />Scarica il documento</Button></div>
    <div className="ga-review-pane-switch" role="group" aria-label="Vista della revisione"><button aria-pressed={pane === 'documento'} onClick={() => setPane('documento')}>Documento</button><button aria-pressed={pane === 'controlli'} onClick={() => setPane('controlli')}>Controlli e consegna{report?.blockers.length ? ` · ${report.blockers.length}` : ''}</button></div>
    <div className="ga-review-split" data-pane={pane}>
      <section className="ga-review-preview-pane" aria-label="Documento da leggere"><div className="ga-review-pane-label"><strong>Documento</strong><span>{doc.name}</span></div><ReviewContent document={doc} focus={xmlFocus} /></section>
      <section className="ga-review-control-pane" aria-label="Controlli e consegna">
        <div className="ga-review-control-toolbar"><h3>Controlli del documento</h3><Button type="button" size="sm" disabled={busy || !canEdit && !canApprove} onClick={() => void run()}>{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}{busy ? 'Controlli in corso…' : 'Aggiorna controlli'}</Button></div>
        {/\.xml$/i.test(doc.name) && doc.category !== 'fonte' && !doc.generation_snapshot?.source_id && <label className="ga-review-request">Request originale<select aria-label="Request originale per il confronto" value={requestId} disabled={busy || sent} onChange={e => { setRequestId(e.target.value); setCurrent(false); }}><option value="">Collega la Request della gara</option>{data.documents.filter(d => d.tender_id === doc.tender_id && d.category === 'fonte' && /\.xml$/i.test(d.name) && !data.documents.some(n => n.previous_id === d.id) && !d.archived).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
        {report && !current && <Notice>Rapporto superato: esegui di nuovo i controlli.</Notice>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {busy && <p role="status" className="text-xs">Verifica del file e delle dipendenze…</p>}
        {report ? <ValidationReport report={report} onLocate={id => { setXmlFocus(id); setPane('documento'); }} fixUrl={canEdit ? fix : null} onNavigate={onClose} /> : <p className="ga-review-no-report">Esegui i controlli per vedere cosa manca.</p>}
        <ReviewProvenance document={doc} />
        {fix && canEdit && <Button size="sm" variant="outline" asChild><Link to={fix} onClick={onClose}>Riapri compilazione<ArrowRight /></Link></Button>}
        {canHand && <details className="ga-review-handoff-box" open={!entry?.handoff_current}><summary>{entry?.handoff_current?'Consegna già registrata · rivedi':'Consegna al revisore'}</summary><div className="ga-review-handoff">
          <label><input type="checkbox" checked={preview} onChange={e => setPreview(e.target.checked)} disabled={busy || sent} /><span>Ho letto il documento integrale e confrontato l’anteprima, se disponibile.</span></label>
          <label><input type="checkbox" checked={declarations} onChange={e => setDeclarations(e.target.checked)} disabled={busy || sent} /><span>Ho verificato dati, dichiarazioni e campi obbligatori.</span></label>
          {!!report?.warnings.length && <label><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} disabled={busy || sent} /><span>Ho esaminato gli avvisi e riportato in nota le verifiche ancora aperte.</span></label>}
          <label className="ga-review-handoff-note">Nota per il revisore<textarea aria-label="Nota per il revisore" value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={2} disabled={busy || sent} placeholder="Controlli svolti e punti aperti · almeno 10 caratteri" /></label>
          <Button type="button" disabled={busy || sent || !current || !report?.reviewable || !preview || !declarations || note.trim().length < 10 || !!report?.warnings.length && !ack} onClick={() => void run(true)}>{sent ? 'Inviato alla revisione' : 'Invia alla revisione'}</Button>
          <p className="ga-review-scope">Passa a «In verifica». Approvazione, firma e invio sono successivi.</p>
          {sent && <p role="status" className="text-sm font-semibold text-emerald-800">Bozza consegnata alla revisione. Documento e rapporto conservati.</p>}
        </div></details>}
      </section>
    </div>
  </EditorDialog>;
}
