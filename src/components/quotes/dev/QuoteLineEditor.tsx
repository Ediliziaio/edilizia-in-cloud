import { useEffect, useRef } from 'react';
import type { ApartmentOverride } from "@/lib/preventivi/devLombardiaApartment";
export type EditableQuoteLine = { id: string; title: string; description: string; quantity: number | null; price: number | null; unit: string; included: boolean; issue: string | null; reference: string; originalDescription?: string; archived?: boolean };
const numeric = (value: string) => {
  if (!value.trim()) return null;
  const n = Number(value); return Number.isFinite(n) && n > 0 && n <= 1_000_000 ? n : null;
};
/** Compact direct edits; the parent can keep this mounted in a workbench tab. */
export default function QuoteLineEditor({ rows, onPatch, onReset }: { rows: EditableQuoteLine[]; onPatch: (id: string, patch: ApartmentOverride) => void; onReset: (id: string) => void }) {
  const elements = useRef(new Map<string, HTMLTableRowElement>());
  const previous = useRef(new Map(rows.map(row => [row.id, row])));
  const animations = useRef(new Map<string, Animation>());
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    for (const row of rows) {
      const old = previous.current.get(row.id);
      const changed = !old || old.title !== row.title || old.description !== row.description || old.quantity !== row.quantity || old.unit !== row.unit || old.price !== row.price || old.included !== row.included;
      if (!changed || row.archived) continue;
      animations.current.get(row.id)?.cancel(); animations.current.delete(row.id);
      if (reduced) continue;
      const animation = elements.current.get(row.id)?.animate?.([{ backgroundColor: '#fff0db' }, { backgroundColor: 'transparent' }], { duration: 650, easing: 'ease-out' });
      if (animation) { animations.current.set(row.id, animation); animation.onfinish = () => { if (animations.current.get(row.id) === animation) animations.current.delete(row.id); }; }
    }
    previous.current = new Map(rows.map(row => [row.id, row]));
  }, [rows]);
  useEffect(() => { const active = animations.current; return () => { active.forEach(a => a.cancel()); active.clear(); }; }, []);
  if (!rows.length) return null;
  return <section className="chat-inline-editor" aria-label="Voci modificabili del preventivo"><header><h2>Voci del preventivo</h2><p>Modifica qui oppure scrivilo in chat. Gli importi si aggiornano subito. «Inclusa» non significa prezzo verificato: controlla la provenienza sotto ogni voce.</p></header>
    <div className="chat-inline-table"><table><thead><tr><th>Voce e descrizione</th><th>Quantità</th><th>Unità</th><th>Prezzo netto</th><th>Inclusa</th></tr></thead><tbody>{rows.map((row, i) => row.archived ? null : <tr key={row.id} ref={element => { if (element) elements.current.set(row.id, element); else elements.current.delete(row.id); }}>
      <td><small>Voce {i + 1}</small><label><span className="sr-only">Titolo voce {i + 1}</span><input aria-label={`Titolo voce ${i + 1}`} value={row.title} maxLength={200} onChange={e => onPatch(row.id, { title: e.target.value })} /></label>
        <details><summary>Descrizione</summary><textarea aria-label={`Descrizione voce ${i + 1}`} rows={3} maxLength={6000} value={row.description} onChange={e => onPatch(row.id, { description: e.target.value })} /></details>
        <small>{row.reference}</small>{row.originalDescription && <details><summary>Testo originale del listino</summary><p>{row.originalDescription}</p></details>}
        <button className="chat-inline-reset" onClick={() => onReset(row.id)} aria-label={`Ripristina voce ${i + 1}`}>Ripristina</button>
        {row.issue && <p className="regional-warning" role="status">{row.issue}</p>}
      </td>
      <td><input aria-label={`Quantità voce ${i + 1}`} type="number" min="0.01" max="1000000" step="0.01" value={row.quantity ?? ""} placeholder="Da definire" onChange={e => onPatch(row.id, { quantity: numeric(e.target.value) })} /></td>
      <td><input key={row.unit} aria-label={`Unità voce ${i + 1}`} defaultValue={row.unit} maxLength={24}
        onBlur={e => { if (e.currentTarget.value !== row.unit) onPatch(row.id, { unit: e.currentTarget.value }); }}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} /></td>
      <td><input aria-label={`Prezzo voce ${i + 1}`} type="number" min="0.01" max="1000000" step="0.01" value={row.price ?? ""} placeholder="Da definire" onChange={e => onPatch(row.id, { price: numeric(e.target.value) })} /></td>
      <td><input aria-label={`Includi voce ${i + 1}`} type="checkbox" checked={row.included} disabled={!!row.issue} onChange={e => onPatch(row.id, { approved: e.target.checked })} /></td>
    </tr>)}</tbody></table></div>
    {rows.some(r => r.archived) && <details><summary>Storico voci sostituite ({rows.filter(r => r.archived).length})</summary>{rows.filter(r => r.archived).map(r => <article key={r.id}><strong>{r.title}</strong><p>{r.description}</p><p>{r.issue} Per ripristinare, chiedi «Mostra doppioni» nella chat.</p></article>)}</details>}
  </section>;
}
