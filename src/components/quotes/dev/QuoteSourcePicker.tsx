import { useId, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { filterQuoteSources, quoteSourcePresentation, type QuoteChatSource } from '@/lib/preventivi/quoteSourcePresentation';

export function QuoteSourcePicker({ options, selectedId, disabled, loading, error, onRetry, onSelect }: {
  options: QuoteChatSource[]; selectedId: string | null; disabled?: boolean; loading?: boolean; error?: boolean;
  onRetry: () => void; onSelect: (id: string) => void | Promise<void>;
}) {
  const labelId = useId(); const [query, setQuery] = useState(''); const [editing, setEditing] = useState(false);
  const [candidateId, setCandidateId] = useState<string | null>(null); const [pending, setPending] = useState(false);
  const [issue, setIssue] = useState('');
  const selecting = useRef(false);
  const selected = options.find(option => option.id === selectedId);
  const candidate = options.find(option => option.id === candidateId);
  const visible = filterQuoteSources(options, query);
  const locked = disabled || loading || pending;
  const choose = async () => {
    if (!candidate || locked || selecting.current) return;
    selecting.current = true;
    setPending(true); setIssue('');
    try { await onSelect(candidate.id); setEditing(false); setCandidateId(null); setQuery(''); }
    catch { setIssue('Non ho potuto selezionare il prezzario. Quello precedente resta invariato.'); }
    finally { selecting.current = false; setPending(false); }
  };
  return <section className="quote-source-picker" aria-label="Selezione prezzario">
    {selected && !editing ? <div className="quote-source-selected"><span><small>Prezzario</small><strong>{quoteSourcePresentation(selected).title}</strong></span><button type="button" disabled={locked} onClick={() => { setEditing(true); setCandidateId(null); }}>Cambia</button></div> : <>
      <div className="quote-source-picker-head"><strong id={labelId}>Scegli il prezzario</strong>{selected && <button type="button" disabled={pending} onClick={() => setEditing(false)}>Annulla</button>}</div>
      <label className="quote-source-search"><Search size={15} aria-hidden="true" /><input aria-label="Cerca regione, anno o nome del prezzario" placeholder="Cerca regione o prezzario…" value={query} disabled={pending} onChange={event => { setQuery(event.target.value); setCandidateId(null); }} /></label>
      {loading && <p role="status">Carico i prezzari…</p>}
      {error ? <div role="alert">Elenco non disponibile. Nessun prezzario cambiato. <button type="button" onClick={onRetry}>Riprova</button></div> : <>
        <ul className="quote-source-results" aria-labelledby={labelId}>
          {visible.map(option => { const info = quoteSourcePresentation(option); const duplicate = options.some(other => other.id !== option.id && quoteSourcePresentation(other).title === info.title); const detail = duplicate ? info.name : ''; return <li key={option.id}><button type="button" aria-label={[info.title, detail].filter(Boolean).join(' ')} aria-pressed={candidateId === option.id} disabled={locked} onClick={() => setCandidateId(option.id)}><span><strong>{info.title}</strong>{detail && <small>{detail}</small>}</span>{candidateId === option.id && <Check size={16} aria-hidden="true" />}</button></li>; })}
        </ul>
        {!visible.length && !loading && <p role="status">Nessun prezzario trovato. Prova con un’altra regione o con l’anno.</p>}
        <small className="quote-source-result-count">{visible.length} {visible.length === 1 ? 'prezzario disponibile' : 'prezzari disponibili'}</small>
      </>}
      {candidate && !error && <div className="quote-source-confirm"><strong>{quoteSourcePresentation(candidate).title}</strong><details><summary>Dettagli della fonte</summary><p>{quoteSourcePresentation(candidate).name}</p>{candidate.version && <p>Versione dei dati importati: {candidate.version}. Non indica necessariamente l’edizione ufficiale.</p>}</details><button type="button" disabled={locked} onClick={() => void choose()}>{pending ? 'Selezione…' : 'Usa questo prezzario'}</button></div>}
      {issue && <p role="alert">{issue}</p>}
    </>}
  </section>;
}
