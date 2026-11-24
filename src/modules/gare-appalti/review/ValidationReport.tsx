import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '../api';
import { Status } from '../components';
import type { ReviewReport, XmlReport } from './types';

export function ValidationReport({ report, onLocate, fixUrl, onNavigate }: { report: ReviewReport; onLocate?: (id: string) => void; fixUrl?: string | null; onNavigate?: () => void }) {
  const [search, setSearch] = useState(''), [limit, setLimit] = useState(20), [allBlockers, setAllBlockers] = useState(false);
  const xml = 'xsd' in report.detail ? report.detail as XmlReport : null;
  const findings = useMemo(() => xml?.findings.filter(f => !search || [f.rule_id, f.message, f.criterion_id, f.question_id].join(' ').toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it'))) || [], [xml, search]);
  const fieldUrl = (key?: string) => {
    if (!fixUrl) return null;
    const [path, search] = fixUrl.split('?'), params = new URLSearchParams(search);
    if (key) params.set('campo', key);
    return `${path}?${params}`;
  };
  return <div className="ga-validation-report">
    <div className="ga-validation-status"><Status tone={!report.reviewable ? 'danger' : report.warnings.length ? 'warning' : 'success'}>{report.reviewable ? 'Controlli eseguiti' : `${report.blockers.length} punti da completare`}</Status><Button type="button" variant="ghost" size="sm" onClick={() => downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), 'Rapporto_controlli_locale.json')}>Scarica rapporto</Button></div>
    {(allBlockers?report.blockers:report.blockers.slice(0,4)).map((b, i) => <div key={i} role="alert" className="ga-validation-blocker"><p>{b.message.replace(/^Completa il campo obbligatorio:\s*/, '')}</p>{fieldUrl(b.field_key) && <Link to={fieldUrl(b.field_key)!} onClick={onNavigate}>{b.field_key ? 'Correggi questo campo' : 'Apri punto da correggere'}</Link>}<details><summary>Riferimento tecnico</summary><span>{b.code}{b.field_key ? ` · ${b.field_key}` : ''}</span></details></div>)}
    {report.blockers.length>4&&<button className="ga-show-more" onClick={()=>setAllBlockers(v=>!v)}>{allBlockers?'Mostra meno':`Mostra tutti i ${report.blockers.length} punti da completare`}</button>}
    {!!report.warnings.length && <details className="ga-validation-warnings"><summary>{report.warnings.length} {report.warnings.length === 1 ? 'avviso da esaminare' : 'avvisi da esaminare'}</summary>{report.warnings.map((w, i) => <p key={i}>{w}</p>)}</details>}
    {xml ? <>
      <div className="ga-validation-metrics"><Metric label="Struttura XML" value={xml.xsd ? 'Controllata' : 'Da correggere'} /><Metric label={xml.kind === 'Request' ? 'Coerenza interna' : 'Confronto Request'} value={xml.kind === 'Response' && !xml.request_compared ? 'Da collegare' : xml.local_consistency ? 'Controllata' : 'Da correggere'} /><Metric label="Profilo europeo" value={xml.european_rules_passed ? 'Regole superate' : 'Da verificare'} /></div>
      {!xml.profile.strict_match && <p className="ga-validation-portal">Il profilo della procedura richiede confronto specifico con il portale.</p>}
      <details className="ga-validation-technical"><summary>Profilo e regole eseguite</summary><p>{xml.profile.label} · {xml.finding_count} rilievi</p><p className="break-all">Versione: {xml.rules_commit || 'Nessun pacchetto riconosciuto'}</p>{xml.checks.map((c, i) => <p key={i}>{c.name} · {c.status === 'passed' ? 'senza rilievi' : c.status === 'failed' ? 'rilievi presenti' : 'non eseguito'}</p>)}</details>
      {xml.engine_errors.map((e, i) => <p key={i} role="alert" className="text-xs text-red-700">Controllo non eseguito: {e.file} · {e.error}</p>)}
      {!!xml.finding_count && <details className="ga-validation-findings" open={!!xml.findings.some(f => f.severity !== 'warning')}><summary>Rilievi del DGUE · {xml.finding_count}</summary><label>Cerca nei rilievi<input aria-label="Cerca rilievi del DGUE" value={search} onChange={e => { setSearch(e.target.value); setLimit(20); }} /></label><p className="ga-xml-count">{Math.min(limit, findings.length)} di {findings.length}{xml.truncated ? ' · rapporto parziale' : ''}</p>{findings.slice(0, limit).map((f, i) => <article key={i}><strong>{f.rule_id}</strong><p>{f.message}</p><div className="flex flex-wrap gap-2">{(f.question_id || f.criterion_id) && onLocate && <Button size="sm" variant="outline" onClick={() => onLocate(f.question_id || f.criterion_id!)}>Mostra nel documento</Button>}{fixUrl && (f.question_id || f.criterion_id) && <Button size="sm" variant="ghost" asChild><Link to={`${fixUrl}&domanda=${encodeURIComponent(f.question_id || f.criterion_id!)}`} onClick={onNavigate}>Correggi risposta</Link></Button>}</div><details><summary>Posizione e identificativi</summary><p className="break-all">{f.location}</p>{f.criterion_id && <p>Criterio: {f.criterion_id}</p>}{f.question_id && <p>Domanda: {f.question_id}</p>}</details></article>)}{limit < findings.length && <Button size="sm" variant="outline" onClick={() => setLimit(n => n + 60)}>Mostra altri rilievi</Button>}</details>}
    </> : <p className="ga-validation-fields">{'required_fields' in report.detail ? `${report.detail.completed_fields}/${report.detail.required_fields} campi mappati obbligatori compilati · ${report.detail.manual_values} ${report.detail.manual_values===1?'valore da verificare':'valori da verificare'} manualmente.` : 'File e dipendenze controllati.'}</p>}
  </div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div><p>{label}</p><strong>{value}</strong></div>; }
