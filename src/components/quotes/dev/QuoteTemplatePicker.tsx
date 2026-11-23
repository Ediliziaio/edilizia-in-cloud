import { useRef, useState } from 'react';
import { FileText, Search, Check } from 'lucide-react';
import { workspaceOfferTemplates, type QuoteWorkspaceTemplates } from './QuoteTemplateDocument';
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const layoutNames: Record<string, string> = { classic: 'Classico', modern: 'Moderno', minimal: 'Essenziale', bold: 'Impatto' };
export function QuoteTemplatePicker({ library, selectedId, expanded = false, disabled, onSelect }: {
  library?: QuoteWorkspaceTemplates; selectedId?: string | null; expanded?: boolean; disabled?: boolean;
  onSelect: (id: string | null) => void | Promise<void>;
}) {
  const tr = useT();
  const [open, setOpen] = useState(expanded); const [query, setQuery] = useState('');
  const [candidate, setCandidate] = useState<string | null | undefined>(undefined);
  const [pending, setPending] = useState(false); const [error, setError] = useState(''); const latch = useRef(false);
  const offers = workspaceOfferTemplates(library);
  const selected = offers.find(t => t.id === (selectedId ?? library?.defaultId));
  const name = selectedId === null ? tr("Preventivo classico") : selected?.name ?? (library?.loading ? tr("Caricamento modello…") : selectedId ? tr("Modello salvato non disponibile") : tr("Preventivo classico"));
  const words = query.toLocaleLowerCase('it').trim().split(/\s+/).filter(Boolean);
  const filtered = offers.filter(t => words.every(w => `${t.name} ${t.description ?? ''} ${layoutNames[t.layout] ?? t.layout}`.toLocaleLowerCase('it').includes(w)));
  const choose = async () => {
    if (disabled || latch.current || candidate === undefined || candidate !== null && !offers.some(t => t.id === candidate)) return;
    latch.current = true; setPending(true); setError('');
    try { await onSelect(candidate); setCandidate(undefined); setOpen(false); }
    catch { setError(tr("Modello non applicato. La scelta e la bozza precedenti restano conservate.")); }
    finally { latch.current = false; setPending(false); }
  };
  return <section className="quote-chat-picker quote-template-picker" aria-label={tr("Modello del preventivo")}>
    <header><div><strong>{open ? tr("Come vuoi presentare il preventivo?") : name}</strong><small>{open ? tr("Scegli il classico o un modello della tua azienda.") : selectedId === undefined ? tr("Modello proposto · puoi cambiarlo prima di iniziare") : tr("Modello della bozza · voci e prezzi indipendenti")}</small></div>
      <button type="button" disabled={disabled || pending} onClick={() => { setOpen(!open); setCandidate(undefined); setQuery(''); }}>{open ? tr("Chiudi") : tr("Scegli modello")}</button></header>
    {open && <>
      {library?.error && <p role="status">{tr("Modelli aziendali non disponibili. Puoi usare il classico senza cambiare la libreria.")}{library.retry && <button type="button" disabled={disabled || pending} onClick={library.retry}>{tr("Riprova modelli")}</button>}</p>}
      {library?.loading && <p role="status">{tr("Caricamento modelli aziendali…")}</p>}
      <label className="quote-source-search"><Search size={15} aria-hidden="true" /><input aria-label={tr("Cerca modello di preventivo")} placeholder={tr("Cerca nei modelli aziendali…")} value={query} disabled={disabled || pending} onChange={e => { setQuery(e.target.value); setCandidate(undefined); }} /></label>
      <ul className="quote-picker-results" aria-label={tr("Modelli aziendali disponibili")}>
        <li><button type="button" aria-pressed={candidate === null} disabled={disabled || pending} onClick={() => setCandidate(null)}><FileText size={17} aria-hidden="true" /><span><strong>{tr("Preventivo classico")}</strong><small>{tr("Impostazione standard · nessuna scheda prodotto aggiunta")}</small></span>{candidate === null && <Check size={15} aria-hidden="true" />}</button></li>
        {filtered.map(t => <li key={t.id}><button type="button" aria-pressed={candidate === t.id} disabled={disabled || pending || library?.loading || library?.error} onClick={() => setCandidate(t.id)}><FileText size={17} aria-hidden="true" /><span><strong>{t.name}</strong><small>{layoutNames[t.layout] ? tr(layoutNames[t.layout]) : t.layout}{t.is_default ? ` · ${tr("Predefinito")}` : ''} · {tr("{n} schede/sezioni allegate", { n: (t.linked_product_ids?.length ?? 0) + (t.linked_section_ids?.length ?? 0) })}</small>{t.description && <small>{t.description}</small>}</span>{candidate === t.id && <Check size={15} aria-hidden="true" />}</button></li>)}
      </ul>
      {query.trim() && !filtered.length && <p role="status">{tr("Nessun modello aziendale corrispondente. Il classico resta disponibile.")}</p>}
      {candidate !== undefined && <div className="quote-picker-confirm"><small>{tr("La conferma aggiorna l’anteprima a destra, non le lavorazioni o i prezzi.")}</small><button type="button" disabled={disabled || pending || candidate !== null && !offers.some(t => t.id === candidate)} onClick={() => void choose()}>{tr("Usa questo modello")}</button></div>}
      {error && <p role="alert">{error}</p>}
      <footer>{tr("Copertina, colori e condizioni restano quelli del modello. Verifica che le schede allegate siano pertinenti; non aggiungono voci al computo.")}</footer>
    </>}
  </section>;
}
