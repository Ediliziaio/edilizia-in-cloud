import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Search } from 'lucide-react';
import { QUOTE_LEGACY_SIMULATIONS, QUOTE_SIMULATION_AREAS, QUOTE_SIMULATION_SCENARIOS, type QuoteSimulationId } from '@/lib/preventivi/quoteSimulationScenarios';
import { matchesSalesArea } from '@/lib/moduli-vendita/areas';
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it-IT');
export function QuoteSimulationPicker({ disabled, currentId, onSelect }: {
  disabled?: boolean; currentId?: QuoteSimulationId; onSelect: (id: QuoteSimulationId) => void | Promise<void>;
}) {
  const t = useT();
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
    try { await onSelect(id); } catch { setError(t("Non ho cambiato simulazione. Riprova dopo aver verificato il salvataggio locale.")); }
    finally { latch.current = false; setPending(false); }
  };
  return <section className="quote-chat-picker" aria-label={t("Simulazioni per categoria")}>
    <header><div><strong>{area ? area.title : t("Quale lavoro proviamo?")}</strong><small>{area ? t("Scegli un intervento: il messaggio iniziale resta modificabile.") : t("{categorie} categorie · {scenari} scenari di prova", { categorie: QUOTE_SIMULATION_AREAS.length, scenari: QUOTE_SIMULATION_SCENARIOS.length })}</small></div>
      {area && <button type="button" disabled={disabled || pending} onClick={() => { setAreaId(null); setQuery(''); }}><ArrowLeft size={13} /> {t("Categorie")}</button>}</header>
    <label className="quote-source-search"><Search size={15} aria-hidden="true" /><input aria-label={t("Cerca categoria o intervento")} placeholder={t("Cerca fotovoltaico, tetti, accumulo…")} value={query} disabled={disabled || pending} onChange={e => setQuery(e.target.value)} /></label>
    {!area && !query.trim() && <details className="quote-picker-examples"><summary>{t("Esempi già preparati")}</summary><div>{QUOTE_LEGACY_SIMULATIONS.map(s => <button type="button" key={s.id} disabled={disabled || pending} onClick={() => void select(s.id)}>{t("Simulazione {nome}", { nome: s.label.toLocaleLowerCase('it') })}</button>)}</div></details>}
    <ul className="quote-picker-results" aria-label={area || query.trim() ? t("Interventi di prova") : t("Categorie di prova")}>
      {!area && !query.trim() ? areas.map(a => <li key={a.id}><button type="button" disabled={disabled || pending} aria-label={t("Apri categoria {nome}", { nome: a.title })} onClick={() => { setAreaId(a.id); setQuery(''); }}><span><strong>{a.title}</strong><small>{t("{n} interventi", { n: a.interventions.length })} · {a.summary}</small></span><ArrowUpRight size={15} aria-hidden="true" /></button></li>)
        : cases.map(s => <li key={s.id}><button type="button" aria-label={t("Prova {nome}", { nome: s.label })} aria-current={s.id === currentId ? 'true' : undefined} disabled={disabled || pending} onClick={() => void select(s.id)}><span><strong>{area ? s.label.split(' · ').slice(1).join(' · ') : s.label}</strong><small>{s.id === currentId ? t("Simulazione attuale · riprendi bozza") : t("Chat e bozza separate · nessuna chiamata automatica")}</small></span><ArrowUpRight size={15} aria-hidden="true" /></button></li>)}
    </ul>
    {(area || query.trim()) && !cases.length && <p role="status">{t("Nessuna corrispondenza. Prova un altro termine o descrivi il tuo lavoro direttamente in chat.")}</p>}
    {error && <p role="alert">{error}</p>}
    <footer>{t("Ogni prova conserva la propria bozza locale. Questi esempi non attivano moduli e non certificano fattibilità o prezzi.")}</footer>
  </section>;
}
