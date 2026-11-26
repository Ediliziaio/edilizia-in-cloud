import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, FileCode2, FileText, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';
import { Status } from '../components';
import { activeTenderDocuments } from '../tender-ux';
import { canonicalField } from '../dossier/field-key';
import { CompanyFactsPanel } from '../journey/JourneyData';
import { ReviewDialog } from './ReviewDialog';
import { reviewCheckLabel, reviewGroups, reviewRows, reviewTitle, type ReviewFilter } from './review-list';
import { subjectKinds, type CompanySubject } from '../office/types';
import type { ReviewEntry } from './types';
import type { GareDocument, Participation } from '../types';

export function ReviewDesk({ participation: p, onPrepare }: { participation: Participation; onPrepare?: () => void }) {
  const { api, data } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<GareDocument | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>('tutti');
  const [search, setSearch] = useState('');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  const dossiers = useQuery({ queryKey: ['gare', api.companyId, 'office-subjects'], queryFn: () => api.local<{ subjects: CompanySubject[] }>('office', 'dossier', {}) });
  const subjects = (dossiers.data?.subjects || []).filter(s => s.status !== 'archiviato');
  const checks = useQuery({ queryKey: ['gare', api.companyId, 'review-desk', p.id], queryFn: () => api.local<ReviewEntry[]>('review', 'list', { participation_id: p.id }), retry: false });
  const contracts = useQuery({ queryKey: ['gare', api.companyId, 'review-models', p.id], queryFn: async () => {
    const { data, error } = await api.client.from('gare_document_contracts').select('id,fields,source_document_id').eq('company_id', api.companyId).eq('participation_id', p.id);
    if (error) throw error;
    return data as { id: string; fields: { key: string; label: string }[]; source_document_id: string }[];
  } });
  const currentContracts = useMemo(() => {
    const sources = new Set(activeTenderDocuments(data.documents.filter(d => d.tender_id === p.tender_id && d.category === 'fonte')).map(d => d.id));
    return (contracts.data || []).filter(c => sources.has(c.source_document_id));
  }, [contracts.data, data.documents, p.tender_id]);
  const working = data.documents.filter(d => d.participation_id === p.id && /\.json$/i.test(d.name) && d.generation_snapshot?.answers && !data.documents.some(n => n.previous_id === d.id));
  const docs = activeTenderDocuments(data.documents.filter(d => d.participation_id === p.id && !['fonte', 'ricevuta'].includes(d.category))).filter(d => !working.includes(d));
  const sources = activeTenderDocuments(data.documents.filter(d => d.tender_id === p.tender_id && d.category === 'fonte' && /\.xml$/i.test(d.name)));
  const entries = new Map((checks.data || []).map(c => [c.document_id, c]));
  const needs = useMemo(() => Array.from(new Map(currentContracts.flatMap(c => c.fields.map(f => {
    const key = canonicalField(f); return [key, { key, label: f.label }] as const;
  })).filter(([key]) => !!key)).values()), [currentContracts]);
  const facts = (data.companyFacts || []).filter(f => f.status === 'confermato' && f.verified_on <= today && (!f.expires_on || f.expires_on >= today));
  const missing = needs.filter(n => !facts.some(f => f.key === n.key));
  const handed = docs.filter(d => entries.get(d.id)?.handoff_current).length;
  const operators = reviewGroups(docs).filter(g => g.operator.key !== 'participation').length;
  const rows = reviewRows(docs, checks.data || [], search, filter);
  const groups = reviewGroups(rows);
  const requested = params.get('revisiona');
  useEffect(() => {
    if (!requested || checks.isPending) return;
    const timer = setTimeout(() => setSelected(docs.find(d => d.id === requested) || null), 0);
    return () => clearTimeout(timer);
  }, [requested, checks.isPending]);
  const close = () => { setSelected(null); if (params.has('revisiona')) { const next = new URLSearchParams(params); next.delete('revisiona'); setParams(next, { replace: true }); } };
  const go = (view: string) => { const next = new URLSearchParams(params); next.set('tab', 'documenti'); next.set('documenti_vista', view); setParams(next); };

  return <div className="ga-review-desk">
    <header className="ga-review-heading">
      <div><p className="ga-review-eyebrow">DOCUMENTI DELLA PARTECIPAZIONE</p><h2>Preparazione e controlli</h2><p>Rileggi le bozze, verifica i dati e consegna al revisore.</p></div>
      <Button size="sm" variant="outline" onClick={() => onPrepare ? onPrepare() : go('ufficio')}>Apri preparazione completa<ArrowRight className="h-4 w-4" /></Button>
    </header>
    <div className="ga-review-summary" aria-label="Riepilogo dei documenti">
      <span><FileText aria-hidden="true" /><strong>{docs.length}</strong> {docs.length === 1 ? 'documento' : 'documenti'}</span>
      <span><Building2 aria-hidden="true" /><strong>{operators}</strong> {operators === 1 ? 'operatore' : 'operatori'}</span>
      <div className="ga-review-delivery"><ShieldCheck aria-hidden="true" /><span><strong>{checks.isPending ? '…' : `${handed}/${docs.length}`}</strong> consegnati alla revisione</span><div className="ga-review-track" aria-hidden="true"><i style={{ width: `${docs.length && checks.data ? handed / docs.length * 100 : 0}%` }} /></div></div>
    </div>

    <section className="ga-review-list" aria-label="Documenti da controllare">
      <div className="ga-review-toolbar">
        <label className="ga-review-search"><Search aria-hidden="true" /><span className="sr-only">Cerca bozze da revisionare</span><input aria-label="Cerca bozze da revisionare" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca documento, operatore o identificativo…" /></label>
        <label><span className="sr-only">Filtra bozze da revisionare</span><select aria-label="Filtra bozze da revisionare" value={filter} onChange={e => setFilter(e.target.value as ReviewFilter)}><option value="tutti">Tutti i documenti</option><option value="aperti">Con punti da completare</option><option value="inviati">Consegnati al revisore</option><option value="approvati">Approvati</option></select></label>
        {(search || filter !== 'tutti') && <button className="ga-review-reset" onClick={() => { setSearch(''); setFilter('tutti'); }}>Azzera filtri</button>}
      </div>
      {checks.error && <p role="alert" className="ga-review-message text-red-700">{checks.error.message}</p>}
      {checks.isPending && <p role="status" className="ga-review-message">Caricamento dei controlli conservati…</p>}
      <div className="ga-review-results" aria-live="polite">{rows.length} {rows.length === 1 ? 'documento' : 'documenti'}{search || filter !== 'tutti' ? ` su ${docs.length}` : ''} · raggruppati per operatore</div>
      {groups.map(({ operator, documents }) => <section key={operator.key} className="ga-review-group" aria-label={operator.name}>
        <header className="ga-review-group-heading"><span className="ga-review-operator-icon"><Building2 aria-hidden="true" /></span><div><h3>{operator.name}</h3><p>{subjectKinds[operator.kind as keyof typeof subjectKinds] || 'Fascicolo della partecipazione'}{operator.taxId ? ` · ${operator.taxId}` : ''}</p></div><span className="ga-review-group-count">{documents.length} {documents.length === 1 ? 'documento' : 'documenti'}</span></header>
        {documents.map(d => {
          const c = entries.get(d.id), check = reviewCheckLabel(c), title = reviewTitle(d);
          const portalOpen = !!d.generation_snapshot?.dgue_case_id && d.unresolved_fields === 1;
          const xml = /\.xml$/i.test(d.name), Icon = xml ? FileCode2 : FileText;
          return <article key={d.id} className="ga-review-row" aria-label={`${title} · ${operator.name}`}>
            <div className={`ga-review-file-icon ${xml ? 'is-xml' : ''}`}><Icon aria-hidden="true" /><span>{xml ? 'XML' : d.name.split('.').pop()?.toUpperCase().slice(0, 4) || 'FILE'}</span></div>
            <div className="ga-review-document">
              <div className="ga-review-document-title"><h4>{title}</h4><Status tone={d.status === 'approvato' ? 'success' : d.status === 'in_verifica' ? 'blue' : 'neutral'}>{d.status === 'in_verifica' ? 'In verifica' : d.status === 'approvato' ? 'Approvato' : 'Bozza'}</Status></div>
              <p className="ga-review-file-name">{d.name}</p>
              <div className="ga-review-document-meta"><span>{d.category} · v{d.version}</span><span className="ga-review-check" data-tone={check.tone}>{check.tone === 'success' && <CheckCircle2 aria-hidden="true" />}{check.label}</span>{portalOpen ? <span className="ga-review-portal">Profilo portale da verificare</span> : !!d.unresolved_fields && <span className="ga-review-portal">{d.unresolved_fields} {d.unresolved_fields === 1 ? 'dato aperto' : 'dati aperti'}</span>}</div>
              {c?.latest && <details className="ga-review-note"><summary>Nota e dettagli dell’ultimo controllo</summary><div><p>Controllo del {new Date(c.latest.created_at).toLocaleString('it-IT')}</p>{c.latest.note ? <p>{c.latest.note}</p> : <p>Nessuna nota di consegna registrata.</p>}</div></details>}
            </div>
            <Button className="ga-review-open" size="sm" variant="outline" aria-label={`Apri revisione di ${title} · ${operator.name}`} onClick={() => setSelected(d)}>Apri revisione<ArrowRight className="h-4 w-4" /></Button>
          </article>;
        })}
      </section>)}
      {!rows.length && <div className="ga-review-empty"><FileText aria-hidden="true" /><h3>{docs.length ? 'Nessun documento con questi filtri' : 'Le bozze compariranno qui'}</h3><p>{docs.length ? 'Prova il nome dell’operatore o azzera la ricerca.' : 'Riconosci i modelli o completa i DGUE, poi apri le bozze per la revisione.'}</p>{!docs.length && <Button size="sm" variant="outline" onClick={() => go('modelli')}>Apri modelli ufficiali</Button>}</div>}
      <footer className="ga-review-footer"><span>Controlli locali e consegna al revisore. Firma e presentazione restano passaggi successivi.</span><Link to={`/azienda/gare/partecipazioni/${p.id}?tab=panoramica&fase_lavoro=presenta`}>Checklist per lotto e invio<ArrowRight aria-hidden="true" /></Link></footer>
    </section>

    <details className="ga-review-tools"><summary>Strumenti e dati del fascicolo</summary><div className="ga-review-tool-links"><Button size="sm" variant="outline" asChild><Link to="/azienda/gare?sezione=fascicolo">Fascicoli aziendali{subjects.length ? ` · ${subjects.filter(s => s.current).length}/${subjects.length} identità riscontrate` : ''}</Link></Button><Button size="sm" variant="outline" onClick={() => go('modelli')}>Modelli ufficiali · {currentContracts.length}</Button><Button size="sm" variant="outline" onClick={() => go('dgue')}>DGUE XML · {sources.length} {sources.length === 1 ? 'fonte' : 'fonti'}</Button></div>{dossiers.error && <p role="alert">{dossiers.error.message}</p>}{contracts.error && <p role="alert">{contracts.error.message}</p>}
      <details id="gare-review-dossier" className="ga-review-support"><summary>Anagrafica generale riutilizzabile · {missing.length} {missing.length === 1 ? 'dato da verificare' : 'dati da verificare'}</summary><p>Questi sono i dati generali dell’impresa. I moduli legati a un operatore conservano il suo fascicolo e la relativa revisione.</p>{!!needs.length && <div className="mb-3 flex flex-wrap gap-2">{needs.map(n => <Status key={n.key} tone={missing.some(m => m.key === n.key) ? 'warning' : 'success'}>{n.label} · {missing.some(m => m.key === n.key) ? 'da verificare' : 'dato disponibile'}</Status>)}</div>}<CompanyFactsPanel /></details>
      {!!sources.length && <details className="ga-review-support"><summary>Valida le Request XML originali · {sources.length}</summary>{sources.map(d => <div key={d.id} className="ga-review-source"><span>{d.name}</span><Button size="sm" variant="outline" onClick={() => setSelected(d)}>Controlla XML</Button></div>)}</details>}
    </details>
    {!!working.length && <div className="ga-review-working"><span>{working.length} {working.length === 1 ? 'questionario DGUE parziale conservato' : 'questionari DGUE parziali conservati'}</span><Button size="sm" variant="outline" onClick={() => go('dgue')}>Riprendi il DGUE parziale</Button></div>}
    {selected && <ReviewDialog key={selected.id} document={selected} entry={entries.get(selected.id)} onClose={close} />}
  </div>;
}
