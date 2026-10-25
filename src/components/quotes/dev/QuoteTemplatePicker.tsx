import { useRef, useState } from 'react';
import { FileText, Search, Check } from 'lucide-react';
import { workspaceOfferTemplates, type QuoteWorkspaceTemplates } from './QuoteTemplateDocument';

const layoutNames: Record<string, string> = { classic: 'Classico', modern: 'Moderno', minimal: 'Essenziale', bold: 'Impatto' };
export function QuoteTemplatePicker({ library, selectedId, expanded = false, disabled, onSelect }: {
  library?: QuoteWorkspaceTemplates; selectedId?: string | null; expanded?: boolean; disabled?: boolean;
  onSelect: (id: string | null) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(expanded); const [query, setQuery] = useState('');
  const [candidate, setCandidate] = useState<string | null | undefined>(undefined);
  const [pending, setPending] = useState(false); const [error, setError] = useState(''); const latch = useRef(false);
  const offers = workspaceOfferTemplates(library);
  const selected = offers.find(t => t.id === (selectedId ?? library?.defaultId));
  const name = selectedId === null ? 'Preventivo classico' : selected?.name ?? (library?.loading ? 'Caricamento modello…' : selectedId ? 'Modello salvato non disponibile' : 'Preventivo classico');
  const words = query.toLocaleLowerCase('it').trim().split(/\s+/).filter(Boolean);
  const filtered = offers.filter(t => words.every(w => `${t.name} ${t.description ?? ''} ${layoutNames[t.layout] ?? t.layout}`.toLocaleLowerCase('it').includes(w)));
  const choose = async () => {
    if (disabled || latch.current || candidate === undefined || candidate !== null && !offers.some(t => t.id === candidate)) return;
    latch.current = true; setPending(true); setError('');
    try { await onSelect(candidate); setCandidate(undefined); setOpen(false); }
    catch { setError('Modello non applicato. La scelta e la bozza precedenti restano conservate.'); }
    finally { latch.current = false; setPending(false); }
  };
  return <section className="quote-chat-picker quote-template-picker" aria-label="Modello del preventivo">
    <header><div><strong>{open ? 'Come vuoi presentare il preventivo?' : name}</strong><small>{open ? 'Scegli il classico o un modello della tua azienda.' : selectedId === undefined ? 'Modello proposto · puoi cambiarlo prima di iniziare' : 'Modello della bozza · voci e prezzi indipendenti'}</small></div>
      <button type="button" disabled={disabled || pending} onClick={() => { setOpen(!open); setCandidate(undefined); setQuery(''); }}>{open ? 'Chiudi' : 'Scegli modello'}</button></header>
    {open && <>
      {library?.error && <p role="status">Modelli aziendali non disponibili. Puoi usare il classico senza cambiare la libreria.{library.retry && <button type="button" disabled={disabled || pending} onClick={library.retry}>Riprova modelli</button>}</p>}
      {library?.loading && <p role="status">Caricamento modelli aziendali…</p>}
      <label className="quote-source-search"><Search size={15} aria-hidden="true" /><input aria-label="Cerca modello di preventivo" placeholder="Cerca nei modelli aziendali…" value={query} disabled={disabled || pending} onChange={e => { setQuery(e.target.value); setCandidate(undefined); }} /></label>
      <ul className="quote-picker-results" aria-label="Modelli aziendali disponibili">
        <li><button type="button" aria-pressed={candidate === null} disabled={disabled || pending} onClick={() => setCandidate(null)}><FileText size={17} aria-hidden="true" /><span><strong>Preventivo classico</strong><small>Impostazione standard · nessuna scheda prodotto aggiunta</small></span>{candidate === null && <Check size={15} aria-hidden="true" />}</button></li>
        {filtered.map(t => <li key={t.id}><button type="button" aria-pressed={candidate === t.id} disabled={disabled || pending || library?.loading || library?.error} onClick={() => setCandidate(t.id)}><FileText size={17} aria-hidden="true" /><span><strong>{t.name}</strong><small>{layoutNames[t.layout] ?? t.layout}{t.is_default ? ' · Predefinito' : ''} · {(t.linked_product_ids?.length ?? 0) + (t.linked_section_ids?.length ?? 0)} schede/sezioni allegate</small>{t.description && <small>{t.description}</small>}</span>{candidate === t.id && <Check size={15} aria-hidden="true" />}</button></li>)}
      </ul>
      {query.trim() && !filtered.length && <p role="status">Nessun modello aziendale corrispondente. Il classico resta disponibile.</p>}
      {candidate !== undefined && <div className="quote-picker-confirm"><small>La conferma aggiorna l’anteprima a destra, non le lavorazioni o i prezzi.</small><button type="button" disabled={disabled || pending || candidate !== null && !offers.some(t => t.id === candidate)} onClick={() => void choose()}>Usa questo modello</button></div>}
      {error && <p role="alert">{error}</p>}
      <footer>Copertina, colori e condizioni restano quelli del modello. Verifica che le schede allegate siano pertinenti; non aggiungono voci al computo.</footer>
    </>}
  </section>;
}
