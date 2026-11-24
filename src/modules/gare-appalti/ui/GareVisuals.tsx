import { useId, useState, type ReactNode } from 'react';
import { ArrowUpRight, ClipboardList, FileText, Gavel, Info, ShieldCheck } from 'lucide-react';
import { Panel } from '../components';
import { money } from '../domain';
import { useWorkspace } from '../WorkspaceContext';
import { activeTenderDocuments, requirementOpen, requestComplete } from '../tender-ux';
import type { GareDocument, Participation, Tender } from '../types';
import { dossierBreakdown, requirementBreakdown } from './visual-metrics';
import { HubSummary } from './HubSummary';

type Tone = 'blue' | 'teal' | 'amber' | 'rose';
export function MetricCard({ label, value, note, icon, tone = 'blue', primary = false, onClick }: {
  label: string; value: ReactNode; note: string; icon: ReactNode; tone?: Tone; primary?: boolean; onClick?: () => void;
}) {
  const contents = <><div className="ga-metric-label"><span>{label}</span><span className="ga-metric-icon">{icon}</span></div><strong className="ga-metric-value">{value}</strong><span className="ga-metric-note">{note}{onClick && <ArrowUpRight size={13} aria-hidden="true" />}</span></>;
  const className = `ga-metric ga-tone-${tone}${primary ? ' ga-metric-primary' : ''}`;
  return onClick ? <button className={className} onClick={onClick}>{contents}</button> : <section className={className}>{contents}</section>;
}

export function PortfolioMetrics({title='Il tuo portafoglio gare',description='Una vista sui fascicoli e sulle verifiche della tua impresa.'}:{title?:string;description?:string}) {
  const { data } = useWorkspace();
  const active = data.participations.filter(p => !['esito', 'ritirata', 'non_partecipare'].includes(p.stage));
  const ids = new Set(active.map(p => p.id));
  const documents = activeTenderDocuments(data.documents);
  const open = data.requirements.filter(r => ids.has(r.participation_id) && requirementOpen(r)).length;
  const missing = data.documentRequests.filter(r => ids.has(r.participation_id) && !requestComplete(r, documents)).length;
  return <HubSummary title={title} description={description} eyebrow="Portafoglio aziendale · tutti i fascicoli">
      <MetricCard primary label="Opportunità in archivio" value={data.tenders.length} note="Procedure registrate" icon={<Gavel />} />
      <MetricCard label="Partecipazioni attive" value={active.length} note="Fascicoli non conclusi" icon={<ClipboardList />} tone="teal" />
      <MetricCard label="Verifiche aperte" value={open} note="Nei fascicoli attivi" icon={<ShieldCheck />} tone={open ? 'amber' : 'teal'} />
      <MetricCard label="Richieste da completare" value={missing} note="Nei fascicoli attivi" icon={<FileText />} tone={missing ? 'amber' : 'teal'} />
  </HubSummary>;
}

function RequirementRing({ rows, onOpen }: { rows: ReturnType<typeof requirementBreakdown>; onOpen: () => void }) {
  const id = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const closed = rows[0].value;
  const active = rows.some(row => row.id === selected && row.value > 0) ? selected : null;
  const circumference = Math.PI * 104;
  return <Panel title="Stato delle verifiche" description={`${total} requisiti registrati`} action={<button className="ga-text-action" onClick={onOpen}>Apri requisiti <ArrowUpRight size={13} /></button>}>
    {total ? <div className="ga-donut-layout"><div className="ga-ring"><svg viewBox="0 0 150 150" role="img" aria-labelledby={id}>
      <title id={id}>{rows.map(row => `${row.label}: ${row.value}`).join('; ')}</title>
      <circle cx="75" cy="75" r="52" fill="none" stroke="#edf1f6" strokeWidth="15" />
      {rows.map((row,index) => {
        const start = rows.slice(0,index).reduce((sum,part)=>sum+part.value,0) / total * circumference;
        const length = row.value / total * circumference;
        return row.value > 0 && <circle key={row.id} cx="75" cy="75" r="52" fill="none" stroke={row.color} strokeWidth={active === row.id ? 19 : 15} strokeDasharray={`${Math.max(0, length - 2)} ${circumference - Math.max(0, length - 2)}`} strokeDashoffset={-start} transform="rotate(-90 75 75)" opacity={!active || active === row.id ? 1 : .25} />;
      })}
    </svg><div className="ga-ring-center"><strong>{closed} / {total}</strong><span>verifiche chiuse</span></div></div><div className="ga-legend">{rows.map(row => <button key={row.id} disabled={!row.value} aria-pressed={active === row.id} onClick={() => setSelected(selected === row.id ? null : row.id)}><i style={{ background: row.color }} /><span>{row.label}</span><strong>{row.value}</strong></button>)}</div></div> : <div className="ga-chart-empty"><ShieldCheck size={28} /><strong>Nessun requisito registrato</strong><span>Censisci le condizioni della gara per visualizzare le verifiche.</span></div>}
    <p className="ga-chart-note"><Info size={13} />Verifiche chiuse: compatibili o non applicabili, con revisione registrata. Il grafico non determina l’ammissibilità.</p>
  </Panel>;
}

export function TenderSummary({ tender, participation, documents, onTab }: { tender: Tender; participation: Participation; documents: GareDocument[]; onTab: (id: string) => void }) {
  const { data } = useWorkspace();
  const requirements = data.requirements.filter(r => r.participation_id === participation.id);
  const tasks = data.tasks.filter(task => task.participation_id === participation.id && !task.completed);
  const requests = data.documentRequests.filter(request => request.participation_id === participation.id);
  const rows = requirementBreakdown(requirements);
  const dossier = dossierBreakdown(requests, documents);
  const missing = dossier.reduce((sum, row) => sum + row.total - row.done, 0);
  return <div aria-label="Indicatori della gara" className="ga-tender-metrics ga-metrics">
      <MetricCard primary label="Base della procedura" value={money(tender.base_amount)} note="Importo di gara · IVA esclusa" icon={<Gavel />} />
      <MetricCard label="Verifiche chiuse" value={requirements.length ? `${rows[0].value} / ${requirements.length}` : 'Da censire'} note={requirements.length ? `${requirements.length - rows[0].value} verifiche aperte` : 'Requisiti da registrare'} icon={<ShieldCheck />} tone={requirements.length && rows[0].value === requirements.length ? 'teal' : 'amber'} onClick={() => onTab('requisiti')} />
      <MetricCard label="Richieste documentali aperte" value={requests.length ? missing : 'Da censire'} note={requests.length ? `${requests.length} ${requests.length === 1 ? 'richiesta censita' : 'richieste censite'}` : 'Richieste da censire'} icon={<FileText />} tone={missing || !requests.length ? 'amber' : 'teal'} onClick={() => onTab('documenti:checklist')} />
      <MetricCard label="Attività aperte" value={tasks.length} note="Responsabili e termini interni" icon={<ClipboardList />} onClick={() => onTab('attivita')} />
    </div>;
}

export function TenderCharts({ participation, documents, onTab, beforeCharts }: { beforeCharts?: ReactNode; participation: Participation; documents: GareDocument[]; onTab: (id: string) => void }) {
  const { data } = useWorkspace();
  const rows = requirementBreakdown(data.requirements.filter(r => r.participation_id === participation.id));
  const dossier = dossierBreakdown(data.documentRequests.filter(r => r.participation_id === participation.id), documents);
  return <>
    {beforeCharts}
    <div className="ga-charts">
      <RequirementRing rows={rows} onOpen={() => onTab('requisiti')} />
      <Panel title="Dossier per busta" description="Richieste collegate a un file approvato" action={<button className="ga-text-action" onClick={() => onTab('offerta')}>Apri offerta <ArrowUpRight size={13} /></button>}>
        <div className="ga-dossier">{dossier.map(row => <button key={row.category} onClick={() => onTab(`offerta:${row.category}`)}><span className="ga-dossier-heading"><strong>{row.label}</strong><span>{row.total ? `${row.done} / ${row.total}` : 'Da definire'}</span></span><span className={`ga-progress ${!row.total ? 'ga-progress-unknown' : ''}`}>{!!row.total && <i style={{ width: `${row.done / row.total * 100}%`, background: row.color }} />}</span><span className="ga-dossier-meta">{row.files} {row.files === 1 ? 'file corrente' : 'file correnti'} · {row.total ? `${row.total - row.done} ${row.total - row.done === 1 ? 'richiesta aperta' : 'richieste aperte'}` : 'nessuna richiesta censita'}</span></button>)}</div>
        <p className="ga-chart-note"><Info size={13} />Conteggi dai file correnti. Firma, fonti aggiornate e controllo finale restano verifiche separate.</p>
      </Panel>
    </div>
  </>;
}

export function EconomicComparison({ offered, cost, complete }: { offered: string; cost: string; complete: boolean }) {
  const max = Math.max(Number(offered), Number(cost), 1);
  return <div className="ga-economic-chart" aria-label="Confronto tra prezzo simulato e costi stimati">
    {[{ label: 'Prezzo simulato · IVA esclusa', value: offered, color: '#314e86' }, { label: complete ? 'Costi stimati completi' : 'Costi stimati · copertura parziale', value: cost, color: complete ? '#3a99cf' : '#c78315' }].map(row => <div key={row.label}><div className="ga-comparison-label"><span>{row.label}</span><strong>{money(row.value)}</strong></div><div className="ga-progress"><i style={{ width: `${Number(row.value) / max * 100}%`, background: row.color }} /></div></div>)}
  </div>;
}
