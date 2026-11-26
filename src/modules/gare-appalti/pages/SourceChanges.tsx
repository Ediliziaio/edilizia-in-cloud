import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';
import { ActionForm, Notice, Panel, Status, TextField, value } from '../components';
import { FoldPanel } from '../ui/FoldPanel';
import { SourceReader } from '../reader/SourceReader';
import type { GareDocument, Participation, Tender } from '../types';
import { sourceImpact } from './source-impact';

interface Change {
 id: string; status: string; review_note: string;
 notice: { normalized: { publication_number: string; title: string; url: string; deadline_dates?: string[]; deadline_times?: string[]; estimated_values?: string[]; currencies?: string[] } } | null;
}

export function SourceChanges({ tender, participation }: { tender: Tender; participation?: Participation }) {
 const { api, data, canEdit, refresh } = useWorkspace();
 const [source, setSource] = useState<GareDocument | null>(null);
 const updates = useQuery({
  queryKey: ['gare', api.companyId, 'source-changes', tender.id],
  queryFn: async () => {
   const { data, error } = await api.client.from('gare_source_changes').select('id,status,review_note,notice:gare_notice_versions(normalized)')
    .eq('company_id', api.companyId).eq('tender_id', tender.id).order('created_at', { ascending: false });
   if (error) throw error;
   return data as unknown as Change[];
  },
 });
 const impacts = sourceImpact(data, tender, participation);
 const pending = updates.data?.filter(update => update.status === 'pending') || [];
 const historical = updates.data?.filter(update => update.status !== 'pending') || [];
 const show = impacts.length || updates.data?.length || updates.isError;
 if (!show) return null;

 const renderChange = (change: Change) => {
  const notice = change.notice?.normalized;
  return <article key={change.id} className="ga-source-impact">
   <h3>{notice?.title || 'Avviso ufficiale'}{notice?.publication_number && <small> · {notice.publication_number}</small>}</h3>
   {notice?.url && /^https?:\/\//.test(notice.url) && <a href={notice.url} target="_blank" rel="noopener noreferrer">Apri avviso ufficiale ↗</a>}
   {change.status === 'pending' ? <>
    <dl className="ga-assessment-pair">
     <div><dt>Presentazione nel fascicolo</dt><dd>{tender.deadline_date || 'Data da acquisire'} · {tender.deadline_time?.slice(0, 5) || 'Ora da verificare'}</dd></div>
     <div><dt>Termini riportati nell’avviso</dt><dd>{notice?.deadline_dates?.join(', ') || 'Date da leggere negli atti'}{notice?.deadline_times?.length ? ` · ${notice.deadline_times.join(', ')}` : ''}</dd></div>
    </dl>
    <Notice>Verifica termini e lotti sull’avviso originale e acquisisci gli allegati rettificati. Lo stato Pronta resta bloccato finché l’avviso è aperto.</Notice>
    {canEdit && <details><summary>Registra verifica dell’aggiornamento</summary>
     <ActionForm label="Registra verifica" onSave={async form => {
      const { data, error } = await api.client.from('gare_source_changes').update({ status: 'reviewed', review_note: value(form, 'note') })
       .eq('id', change.id).eq('company_id', api.companyId).eq('status', 'pending').select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw Error('Aggiornamento già elaborato. Ricarica il fascicolo.');
      await Promise.all([refresh(), updates.refetch()]);
     }}>
      <TextField name="note" label="Impatto rilevato, dati aggiornati e documenti acquisiti" minLength={5} required/>
     </ActionForm>
    </details>}
   </> : <p>Verificato · {change.review_note}</p>}
  </article>;
 };
 return <Panel className="ga-source-updates" title="Rettifiche e documenti da rivedere"
  description="Confronta gli avvisi e apri gli elementi collegati alle versioni superate.">
  {updates.isError && <p role="alert">Gli avvisi registrati non sono disponibili. <button className="underline" onClick={() => updates.refetch()}>Riprova</button></p>}
  {pending.map(renderChange)}
  {impacts.length > 0 && <FoldPanel title="Versioni degli atti e relativo impatto" hint={`${impacts.length} ${impacts.length === 1 ? 'versione precedente' : 'versioni precedenti'}`}>
  {impacts.map(({ previous, replacement, items }) => <article className="ga-source-impact" key={previous.id}>
   <div className="ga-assessment-head"><h3>{replacement?.name || previous.name}</h3><Status tone="warning">{replacement ? `v${previous.version} → v${replacement.version}` : 'Fonte non corrente'}</Status></div>
   <div className="ga-desk-actions">
    <Button size="sm" variant="outline" onClick={() => setSource(previous)}>Leggi versione {previous.version}</Button>
    {replacement && <Button size="sm" variant="outline" onClick={() => setSource(replacement)}>Leggi versione {replacement.version}</Button>}
    {canEdit && participation && replacement && previous.sha256 !== replacement.sha256 && <Button size="sm" variant="outline" asChild><Link to={`/azienda/gare/partecipazioni/${participation.id}?tab=ai&mode=confronta&${new URLSearchParams({fonti_confronto: [previous.id, replacement.id].join(',')})}`}>Confronta con AI</Link></Button>}
   </div>
   {items.length ? <details><summary>{items.length} {items.length === 1 ? 'elemento collegato' : 'elementi collegati'} alla versione precedente</summary>
    <ul>{items.map(item => <li key={item.area + item.title + item.to}><span>{item.area}</span><Link to={item.to}>{item.title} ↗</Link></li>)}</ul>
   </details> : <p>Nessun collegamento rilevato nei dati salvati.</p>}
  </article>)}
  </FoldPanel>}
  {!!historical.length && <details><summary>Avvisi già verificati · {historical.length}</summary>{historical.map(renderChange)}</details>}
  {source && <SourceReader document={source} onClose={() => setSource(null)}/>}
 </Panel>;
}
