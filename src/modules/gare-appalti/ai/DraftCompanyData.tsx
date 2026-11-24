import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import type { AiDraft } from '../types';
import { profileFields } from './draft-review';
import { dateLabel } from '../domain';

export function DraftCompanyData({draft}:{draft:AiDraft}){
 const{member,data}=useWorkspace();const profile=draft.fact_snapshot?.impresa;
 return <div className="space-y-4"><div className="rounded-md bg-accent/50 p-3 text-[11px] leading-5 text-muted-foreground">Dati messi a disposizione dell’AI alla generazione. La loro presenza nel fascicolo non conferma automaticamente le dichiarazioni nel testo.</div>
  {!profile?<p className="text-xs leading-5 text-amber-900">Questa bozza non conserva lo snapshot aziendale. Confronta il testo con il fascicolo corrente o genera una nuova proposta.</p>:<dl className="space-y-3">{profileFields.map(field=>{const original=profile[field.key]||'';const current=member.company.profile[field.key]||'';return <div key={field.key} className="border-b pb-3 last:border-0"><dt className="text-[10px] text-muted-foreground">{field.label} · anagrafica alla generazione</dt><dd className="mt-1 break-words text-xs font-medium text-secondary">{original||'Dato mancante'}</dd>{original!==current&&<dd className="mt-1 rounded bg-amber-50 p-2 text-[11px] leading-5 text-amber-950">Dato corrente: {current||'Da completare'} · cambiato dopo la generazione</dd>}</div>;})}</dl>}
  {!!draft.fact_snapshot?.evidenze?.length&&<div><h3 className="mb-2 text-xs font-semibold text-secondary">Prove disponibili alla generazione</h3>{draft.fact_snapshot.evidenze.map(e=>{const current=data.evidence.find(item=>item.id===e.id);return <div key={e.id} className="mb-2 rounded-md border p-3 text-[11px] leading-5"><p className="font-semibold">{e.title} · r{e.revision}</p><p className="mt-1 break-words">{e.value}</p><p className="mt-1 text-muted-foreground">Fonte: {e.source} · verifica {dateLabel(e.verified_on)}</p>{(!current||current.revision!==e.revision)&&<p className="mt-1 text-amber-900">Evidenza cambiata o non più disponibile.</p>}</div>;})}</div>}
  <Link className="inline-flex items-center gap-1 text-xs font-semibold text-secondary underline" to="/azienda/gare?sezione=fascicolo">Apri fascicolo impresa<ArrowUpRight className="h-3.5 w-3.5"/></Link>
 </div>;
}
