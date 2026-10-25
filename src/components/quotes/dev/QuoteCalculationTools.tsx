import { useState } from 'react';
import type { ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { calculateQuoteQuantity, readIndicativeEstimate, type QuoteIndicativeEstimate } from '@/lib/preventivi/quoteCalculations';
import { formatCurrency } from '@/lib/formatters';

/** Inline chat tool; no tab, cloud write, defaults masquerading as measured data. */
export function QuoteCalculationTools({ mode, document, disabled, onFormula, onEstimate, onSearchEstimate }: {
  mode: 'quantity' | 'estimate'; document: ChatDocument; disabled: boolean;
  onFormula: (id: string, expression: string, revision: number) => void;
  onEstimate: (id: string, estimate: QuoteIndicativeEstimate, revision: number) => void;
  onSearchEstimate: (index: number) => void;
}) {
  const [id, setId] = useState(document.lines.find(r => !r.supersededBy?.length)?.id ?? '');
  const [expression, setExpression] = useState(''); const [low, setLow] = useState(''); const [high, setHigh] = useState('');
  const [basis, setBasis] = useState(''); const [assumptions, setAssumptions] = useState(''); const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ revision: number; id: string; result: number } | null>(null);
  const row = document.lines.find(r => r.id === id && !r.supersededBy?.length);
  const changed = () => { setError(''); setPreview(null); };
  const quantity = mode === 'quantity';
  return <section className="quote-calculation-tool" aria-label={quantity ? 'Calcolatore quantità in chat' : 'Stima indicativa in chat'}>
    <h3>{quantity ? 'Quantità calcolata dal software' : 'Stima indicativa · separata dal preventivo'}</h3>
    <p>{quantity ? 'Scrivi una formula con misure già confermate, tutte nella stessa unità. Il software calcola, non l’AI. La conferma aggiorna solo la voce scelta e la riporta da confermare.' : 'Cerca una base nel prezzario oppure inserisci un intervallo e spiega da dove deriva. Nessun valore precompilato: una stima senza basi non viene prodotta.'}</p>
    <fieldset disabled={disabled}><label>Voce da elaborare<select aria-label="Voce da elaborare" value={id} onChange={e => { setId(e.target.value); setExpression(''); changed(); }}>{document.lines.map((r, i) => !r.supersededBy?.length && <option key={r.id} value={r.id}>{i + 1}. {r.title}</option>)}</select></label>
    {quantity ? <><label>Formula della quantità<input aria-label="Formula della quantità" value={expression} maxLength={240} placeholder="Es. 2*(3+4)*2,20-0,80*2,10-1,20*1" onChange={e => { setExpression(e.target.value); changed(); }} /></label>
      <button disabled={!row} onClick={() => { try { setPreview({ id, revision: document.revision, result: calculateQuoteQuantity(expression) }); setError(''); } catch (e) { setError((e as Error).message); } }}>Verifica formula</button>
      {preview && <div role="status"><strong>{preview.result.toLocaleString('it-IT')} {row?.unit}</strong><p>{expression} · non ancora applicata</p><button disabled={preview.id !== id || preview.revision !== document.revision} onClick={() => { onFormula(id, expression, preview.revision); setPreview(null); }}>Conferma quantità calcolata</button></div>}
    </> : <>
      <button disabled={!row || row.price != null} onClick={() => onSearchEstimate(document.lines.findIndex(r => r.id === id))}>Proponi intervallo dal prezzario</button>
      <details><summary>Inserisci una stima motivata o un’analisi di costo</summary><p>Importi netti per {row?.unit || 'unità'}. Se parti dai costi, specifica materiali, ore, tariffe e ricarico nelle ipotesi; non sommare costi già inclusi nelle opere compiute.</p>
      <label>Minimo unitario € o formula dei costi<input aria-label="Stima minimo unitario" maxLength={240} value={low} onChange={e => setLow(e.target.value)} /></label>
      <label>Massimo unitario € o formula dei costi<input aria-label="Stima massimo unitario" maxLength={240} value={high} onChange={e => setHigh(e.target.value)} /></label>
      <label>Origine dei valori<textarea aria-label="Origine della stima" value={basis} maxLength={1000} onChange={e => setBasis(e.target.value)} placeholder="Offerta fornitore, analisi materiali/ore, precedente confrontabile…" /></label>
      <label>Ipotesi ed esclusioni<textarea aria-label="Ipotesi della stima" value={assumptions} maxLength={1000} onChange={e => setAssumptions(e.target.value)} /></label>
      <button disabled={!row || row.price != null} onClick={() => { try { const estimate = readIndicativeEstimate({ low: calculateQuoteQuantity(low), high: calculateQuoteQuantity(high), unit: row?.unit, basis, assumptions: `Calcolo minimo: ${low}; massimo: ${high}. ${assumptions}`, origin: 'user', codes: [] }); if (!assumptions.trim()) throw new Error('Indica ipotesi ed esclusioni.'); onEstimate(id, estimate, document.revision); setError(''); } catch (e) { setError((e as Error).message); } }}>Salva solo come stima indicativa</button></details>
      {row?.estimate && <p role="status">Stima salvata: {formatCurrency(row.estimate.low)}–{formatCurrency(row.estimate.high)} / {row.unit}. Fuori dal totale confermato.</p>}
    </>}
    {error && <p role="alert">{error}</p>}</fieldset>
  </section>;
}
