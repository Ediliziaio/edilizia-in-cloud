import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Search } from 'lucide-react';
import { QUOTE_LEGACY_SIMULATIONS, QUOTE_SIMULATION_AREAS, QUOTE_SIMULATION_SCENARIOS, type QuoteSimulationId } from '@/lib/preventivi/quoteSimulationScenarios';
import { matchesSalesArea } from '@/lib/moduli-vendita/areas';

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it-IT');
export function QuoteSimulationPicker({ disabled, currentId, onSelect }: {
  disabled?: boolean; currentId?: QuoteSimulationId; onSelect: (id: QuoteSimulationId) => void | Promise<void>;
}) {
  const [query, setQuery] = useState(''); const [areaId, setAreaId] = useState<string | null>(null);
  const [pending, setPending] = useState(false); const [error, setError] = useState(''); const latch = useRef(false);
  const area = QUOTE_SIMULATION_AREAS.find(a => a.id === areaId);
  const areas = QUOTE_SIMULATION_AREAS.filter(a => matchesSalesArea(a, query));
  const cases = useMemo(() => {
    const words = normalize(query).trim().split(/\s+/).filter(Boolean);
    return QUOTE_SIMULATION_SCENARIOS.filter(s => (!areaId || s.areaId === areaId) && words.every(w => normalize([s.label, s.prompt].join(' ')).includes(w)));
  }, [query, areaId]);
  const select = async (id: QuoteSimulationId) => {
    if (disabled || latch.current) return;
    latch.current = true; setPending(true); setError('');
    try { await onSelect(id); } catch { setError('Non ho cambiato simulazione. Riprova dopo aver verificato il salvataggio locale.'); }
    finally { latch.current = false; setPending(false); }
  };
  return <section className="quote-chat-picker" aria-label="Simulazioni per categoria">
    <header><div><strong>{area ? area.title : 'Quale lavoro proviamo?'}</strong><small>{area ? 'Scegli un intervento: il messaggio iniziale resta modificabile.' : `${QUOTE_SIMULATION_AREAS.length} categorie · ${QUOTE_SIMULATION_SCENARIOS.length} scenari di prova`}</small></div>
      {area && <button type="button" disabled={disabled || pending} onClick={() => { setAreaId(null); setQuery(''); }}><ArrowLeft size={13} /> Categorie</button>}</header>
    <label className="quote-source-search"><Search size={15} aria-hidden="true" /><input aria-label="Cerca categoria o intervento" placeholder="Cerca fotovoltaico, tetti, accumulo…" value={query} disabled={disabled || pending} onChange={e => setQuery(e.target.value)} /></label>
    {!area && !query.trim() && <details className="quote-picker-examples"><summary>Esempi già preparati</summary><div>{QUOTE_LEGACY_SIMULATIONS.map(s => <button type="button" key={s.id} disabled={disabled || pending} onClick={() => void select(s.id)}>{`Simulazione ${s.label.toLocaleLowerCase('it')}`}</button>)}</div></details>}
    <ul className="quote-picker-results" aria-label={area || query.trim() ? 'Interventi di prova' : 'Categorie di prova'}>
      {!area && !query.trim() ? areas.map(a => <li key={a.id}><button type="button" disabled={disabled || pending} aria-label={`Apri categoria ${a.title}`} onClick={() => { setAreaId(a.id); setQuery(''); }}><span><strong>{a.title}</strong><small>{a.interventions.length} interventi · {a.summary}</small></span><ArrowUpRight size={15} aria-hidden="true" /></button></li>)
        : cases.map(s => <li key={s.id}><button type="button" aria-label={`Prova ${s.label}`} aria-current={s.id === currentId ? 'true' : undefined} disabled={disabled || pending} onClick={() => void select(s.id)}><span><strong>{area ? s.label.split(' · ').slice(1).join(' · ') : s.label}</strong><small>{s.id === currentId ? 'Simulazione attuale · riprendi bozza' : 'Chat e bozza separate · nessuna chiamata automatica'}</small></span><ArrowUpRight size={15} aria-hidden="true" /></button></li>)}
    </ul>
    {(area || query.trim()) && !cases.length && <p role="status">Nessuna corrispondenza. Prova un altro termine o descrivi il tuo lavoro direttamente in chat.</p>}
    {error && <p role="alert">{error}</p>}
    <footer>Ogni prova conserva la propria bozza locale. Questi esempi non attivano moduli e non certificano fattibilità o prezzi.</footer>
  </section>;
}
