import { useCallback, useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import {
  syntheticPlanningScenario, readPlanningScenario, comparePlanningScenarios, PLANNING_LIMITS,
  type PlanningScenario, type PlanningWorker, type PlanningTask, type PlanningSupply,
  type PlanningResult, type PlanningComparison,
} from '@/lib/preventivi/quotePlanningScenario';

export type QuotePlanningScenarioPanelProps = {
  value: PlanningScenario;
  onChange: (next: PlanningScenario) => void;
  disabled?: boolean;
  stale?: boolean;
  onClose: () => void;
  onRebase?: () => void;
  onImport?: () => void;
  importable?: boolean;
};

const inputClass = 'w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60';
const buttonClass = 'rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50';
const gridClass = 'grid grid-cols-1 gap-3 sm:grid-cols-2';
type DraftReporter = (id: string, pending: boolean) => void;

/** Keep incomplete edits local. Only a validated blur can update the scenario. */
type DraftFieldProps = {
  label: string; value: string; onCommit: (value: string) => string | void;
  validate?: (value: string) => string | undefined; report: DraftReporter;
  type?: 'text' | 'date'; numeric?: boolean; hint?: string;
};
function DraftField(props: DraftFieldProps) {
  // A committed external value starts a fresh field; no synchronous reset effect.
  return <DraftFieldInput key={props.value} {...props} />;
}
function DraftFieldInput({ label, value, onCommit, validate, report, type = 'text', numeric = false, hint }: DraftFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string>();
  useEffect(() => () => report(id, false), [id, report]);
  return <div className="block min-w-0 space-y-1 text-sm text-slate-700">
    <label htmlFor={id} className="block">{label}</label>
    <input id={id} className={inputClass} type={type} inputMode={numeric ? 'decimal' : undefined}
      value={draft} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-help` : undefined}
      onChange={event => {
        const next = event.target.value;
        setDraft(next); setError(validate?.(next)); report(id, next !== value);
      }}
      onBlur={() => {
        const message = validate?.(draft);
        setError(message);
        if (message) { report(id, true); return; }
        const rejected = draft !== value ? onCommit(draft) : undefined;
        setError(rejected || undefined); report(id, !!rejected);
      }}
      onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
        if (event.key === 'Escape') { event.preventDefault(); setDraft(value); setError(undefined); report(id, false); }
      }} />
    {(error || hint) && <span id={`${id}-help`} className={`block text-xs ${error ? 'text-orange-800' : 'text-slate-500'}`} role={error ? 'alert' : undefined}>{error || hint}</span>}
  </div>;
}

function NumericField({ label, value, onCommit, report, min = 0, max, integer = false, nullable = false, hint, scale = 1 }: {
  label: string; value: number | null | undefined; onCommit: (value: number | null) => string | void;
  report: DraftReporter; min?: number; max?: number; integer?: boolean; nullable?: boolean; hint?: string; scale?: number;
}) {
  const parse = (raw: string) => Number(raw.trim().replace(',', '.')) * scale;
  return <DraftField label={label} numeric value={value == null ? '' : String(value / scale)} report={report} hint={hint}
    validate={raw => {
      if (!raw.trim()) return nullable ? undefined : 'Inserisci un valore; il campo vuoto non vale zero.';
      const number = parse(raw);
      if (!/^\d+(?:[.,]\d+)?$/.test(raw.trim()) || !Number.isFinite(number)) return 'Inserisci un numero valido, per esempio 1,5.';
      if (integer && Math.abs(Math.round(number) - number) > 1e-8) return scale === 1 ? 'Inserisci un numero intero.' : 'Esprimi le ore in minuti interi, per esempio 1,5 ore.';
      if (number < min || (max != null && number > max)) return `Valore ammesso: da ${min / scale}${max == null ? ' in su' : ` a ${max / scale}`}.`;
      return undefined;
    }} onCommit={raw => onCommit(raw.trim() ? (integer ? Math.round(parse(raw)) : parse(raw)) : null)} />;
}

function Detail({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details open={open || undefined} className="rounded-lg border border-slate-200 bg-white">
    <summary className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">{title}</summary>
    <div className="space-y-3 border-t border-slate-100 p-3">{children}</div>
  </details>;
}

function validDate(raw: string) {
  if (!raw) return undefined;
  const date = new Date(`${raw}T12:00:00Z`);
  return /^20\d{2}-\d{2}-\d{2}$/.test(raw) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === raw
    ? undefined : 'Inserisci una data valida.';
}

const tokens = (raw: string) => [...new Set(raw.split(',').map(token => token.trim()).filter(Boolean))];

const newId = (prefix: string, rows: { id: string }[]) => {
  let index = 1;
  while (rows.some(row => row.id === `${prefix}-${index}`)) index++;
  return `${prefix}-${index}`;
};
const skillError = (raw: string) => tokens(raw).length > 0 && tokens(raw).length <= 16 && tokens(raw).every(token => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(token))
  ? undefined : 'Usa da 1 a 16 codici competenza separati da virgole, senza spazi interni (es. general, elettricista).';
const datesError = (raw: string) => tokens(raw).length <= 366 && tokens(raw).every(date => !validDate(date)) ? undefined : 'Usa date valide 2000–2099 separate da virgole: AAAA-MM-GG.';
const nameError = (raw: string) => raw.trim().length > 0 && raw.trim().length <= 200 ? undefined : 'Inserisci un nome da 1 a 200 caratteri.';
const freshWorker = (id: string): PlanningWorker => ({ id, label: 'Nuova persona (ipotesi)', skills: ['general'], availableFrom: null, availableThrough: null, unavailableDates: [], windowMinutesByDate: [] });
const numberText = (number: number | null | undefined) => number == null || !Number.isFinite(number) ? 'Da definire' : new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2, useGrouping: 'always' }).format(number);
const moneyText = (number: number | null | undefined, currency: string) => number == null ? 'Da definire' : `${numberText(number)} ${currency}`;
const resultStatus = (result: PlanningResult) => ({
  absent: 'Scenario assente', invalid: 'Dati non validi', missing: 'Fattibilità non verificabile: dati incompleti',
  feasible: result.meetsDeadline === null ? 'Piano simulato: obiettivo da definire' : 'Entro obiettivo, sotto ipotesi',
  deadline_missed: 'Oltre la data obiettivo', infeasible_within_horizon: 'Non completato nell’orizzonte simulato',
})[result.status];
const blockerText = (blocker: string) => blocker.startsWith('insufficient_skill:') ? `Competenza insufficiente: ${blocker.split(':')[1]}` : ({
  dependencies: 'Dipendenze non completate in tempo', supply_after_horizon: 'Fornitura oltre l’orizzonte',
  calendar_wait_within_horizon: 'Attesa tecnica non conclusa nell’orizzonte',
  shared_daily_worker_limit: 'Limite condiviso di persone presenti',
  capacity_or_availability_within_horizon: 'Capacità o disponibilità insufficienti nell’orizzonte',
}[blocker] ?? blocker);
const missingCostText = (missing: string) => ({ labor: 'lavoro', travel: 'viaggio', vehicle: 'mezzi/km', other: 'altri costi giornalieri', unfinishedSchedule: 'lavori non completati' }[missing] ?? missing);

function ScenarioComparison({ value, pending, stale, blocked, disabled }: { value: PlanningScenario; pending: boolean; stale: boolean; blocked: boolean; disabled: boolean }) {
  const [calculated, setCalculated] = useState<{ snapshot: PlanningScenario; comparison: PlanningComparison }>();
  const suspended = pending || stale || blocked;
  const current = calculated?.snapshot === value && !suspended;
  return <div className="space-y-3">
    <button type="button" className={`${buttonClass} quote-planning-primary`} disabled={suspended || disabled} onClick={() => setCalculated({ snapshot: value, comparison: comparePlanningScenarios(value) })}>Confronta base / +1 / +2</button>
    {current ? <ComparisonResults value={value} comparison={calculated.comparison} /> : <div role="status" className={`rounded-lg border p-3 text-sm ${suspended || calculated ? 'border-orange-200 bg-orange-50 text-orange-950' : 'border-blue-100 bg-white text-blue-950'}`}>
      <strong>{suspended || calculated ? 'Confronto da aggiornare' : 'Prepariamo il tuo scenario'}</strong>
      <p className="mt-1 text-xs">{suspended ? stale ? 'Confronto sospeso: rivedi le ipotesi rispetto al nuovo ambito.' : 'Confronto sospeso: completa o correggi le modifiche.' : calculated ? 'Ipotesi modificate: esegui di nuovo il confronto.' : value.tasks.some(task => task.kind === 'work' ? task.personHours == null : task.calendarDays == null) ? 'Carico incompleto: inserisci ore-persona e durate mancanti, poi confronta.' : 'Confronto non ancora eseguito. I dati restano ipotesi da verificare.'}</p>
    </div>}
  </div>;
}

function ComparisonResults({ value, comparison }: { value: PlanningScenario; comparison: PlanningComparison }) {
  if (comparison.status !== 'ready') return <div role="status" className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950">
    <strong>{comparison.status === 'invalid' ? 'Fattibilità non verificabile: dati non validi' : 'Fattibilità non verificabile: dati incompleti'}</strong>
    <ul className="mt-2 list-disc space-y-1 pl-5">{comparison.issues.map((issue, index) => {
      const task = value.tasks.find(row => issue.path.includes(`.${row.id}.`));
      const supply = value.supplies.find(row => issue.path === `supplies.${row.id}`);
      return <li key={index}>{task ? `Completa ${task.kind === 'work' ? 'le ore-persona' : 'i giorni di attesa'}: ${task.label}.` : supply ? `Completa disponibilità confermata o data d’ordine e lead time: ${supply.label}.` : `${issue.path}: ${issue.message}`}</li>;
    })}</ul>
  </div>;
  return <div className="space-y-3">
    <div className="rounded-lg border border-blue-200 bg-white p-3" role="status">
      <strong className="text-sm text-blue-950">Confronto ipotetico · {resultStatus(comparison.alternatives[0].result)}</strong>
      <p className="mt-1 text-xs text-slate-600">Più persone non garantiscono meno giorni. Tutti i risultati dipendono da competenze, disponibilità, limiti delle fasi, attese e forniture.</p>
    </div>
    <div className="quote-planning-cards" role="group" aria-label="Soluzioni a colpo d’occhio">
      {comparison.alternatives.map(row => <article key={row.addedWorkers} className="quote-planning-card" data-outcome={row.result.meetsDeadline === false ? 'late' : 'conditional'}>
        <span className="quote-planning-card-label">{row.addedWorkers === 0 ? 'Squadra attuale' : `Con ${row.addedWorkers === 1 ? 'una persona' : 'due persone'} in più`}</span>
        <strong>{row.result.finishDate ? row.result.finishDate.split('-').reverse().join('/') : 'Da rivedere'}</strong>
        <span>{row.result.activeWorkdays} giorni attivi{!row.result.finishDate && ' parziali'}</span>
        <small>{!row.result.finishDate ? 'Capacità o vincoli da rivedere' : row.result.meetsDeadline === false ? 'Oltre la data richiesta' : row.result.meetsDeadline === true ? 'Entro la data, sotto ipotesi' : 'Scadenza da indicare'}</small>
        {row.addedWorkers > 0 && row.workdaysSaved != null && <span className="quote-planning-card-delta">{row.workdaysSaved > 0 ? `${numberText(row.workdaysSaved)} giorni attivi in meno` : row.workdaysSaved === 0 ? 'Stessi giorni: verifica i vincoli' : `${numberText(-row.workdaysSaved)} giorni attivi in più`}</span>}
        <span className="quote-planning-card-cost">{row.result.costs?.total == null ? 'Costi da completare' : moneyText(row.result.costs.total, value.costs.currency)}</span>
      </article>)}
    </div>
    <Detail title="Riepilogo numerico e costi">
    <div className="overflow-x-auto rounded-lg border border-blue-100 bg-white" tabIndex={0} role="region" aria-label="Tabella confronto scenari">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Confronto risorse attuali e persone aggiuntive ipotetiche</caption>
        <thead className="bg-blue-50 text-blue-950"><tr>{['Scenario', 'Fine simulata', 'Giorni attivi', 'Costo interno', 'Differenza costo'].map(label => <th key={label} scope="col" className="p-2 align-top">{label}</th>)}</tr></thead>
        <tbody>{comparison.alternatives.map(row => <tr key={row.addedWorkers} className="border-t border-slate-100">
          <th scope="row" className="p-2 align-top font-medium">{row.addedWorkers === 0 ? 'Base' : `+${row.addedWorkers} ${row.addedWorkers === 1 ? 'persona' : 'persone'}`}<span className="mt-1 block font-normal text-slate-600">{resultStatus(row.result)}</span></th>
          <td className="p-2 align-top">{row.result.finishDate ?? 'Non determinata'}{row.result.deadlineSlackCalendarDays != null && <span className="mt-1 block text-slate-500">Margine: {numberText(row.result.deadlineSlackCalendarDays)} giorni di calendario</span>}</td>
          <td className="p-2 align-top">{row.result.activeWorkdays}{!row.result.finishDate && ' (parziali)'}{row.workdaysSaved != null && row.addedWorkers > 0 && <span className="mt-1 block text-slate-500">Risparmiati: {numberText(row.workdaysSaved)}</span>}</td>
          <td className="p-2 align-top">{row.result.costs?.total != null ? moneyText(row.result.costs.total, value.costs.currency) : <><span className="font-medium text-orange-900">Incompleto</span><span className="mt-1 block text-slate-600">Costi noti: {moneyText(row.result.costs?.knownSubtotal, value.costs.currency)}</span><span className="mt-1 block text-orange-900">Mancano: {row.result.costs?.missing.map(missingCostText).join(', ') || 'componenti da definire'}</span></>}</td>
          <td className="p-2 align-top">{row.costDelta == null ? 'Non determinabile' : row.addedWorkers === 0 ? 'Riferimento' : moneyText(row.costDelta, value.costs.currency)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    </Detail>
    {!value.additionalWorker && <p className="text-xs text-orange-900">Per confrontare +1 e +2, abilita e definisci il profilo delle persone aggiuntive sotto Persone e competenze.</p>}
    <Detail title="Vedi capacità, vincoli e date delle forniture">
      <p className="text-xs text-slate-600">Modello giornaliero con priorità nell’ordine delle fasi. Le fasi dipendenti iniziano in una data successiva. Non dimostra un piano ottimale né la disponibilità contemporanea entro la giornata.</p>
      {comparison.alternatives.map(row => <div key={row.addedWorkers} className="space-y-2 rounded border border-slate-200 p-2">
        <h4 className="text-sm font-semibold text-blue-950">{row.addedWorkers === 0 ? 'Base' : `+${row.addedWorkers} persone ipotetiche`}</h4>
        <p className="text-xs">Produzione nominale: {numberText(row.result.capacity ? row.result.capacity.productiveMinutesPerWorkerDay / 60 : null)} h/persona/giorno · {numberText(row.result.capacity?.nominalCrewPersonHoursPerDay)} h-persona/squadra/giorno.</p>
        <p className="text-xs">Lavoro allocato: {numberText(row.result.totalWorkPersonHours)} h-persona · Viaggio: {numberText(row.result.totalTravelPersonHours)} h-persona · Distanza: {numberText(row.result.totalVehicleKm)} km-mezzo.</p>
        <p className="text-xs">Durata: {numberText(row.result.elapsedCalendarDays)} giorni di calendario, fino a {row.result.finishDate ?? `orizzonte ${row.result.horizonEndDate ?? 'da definire'}`}.</p>
        {row.result.tasks.map(task => <p key={task.id} className="text-xs text-slate-700"><strong>{value.tasks.find(item => item.id === task.id)?.label ?? task.id}</strong>: {task.startDate || '?'} → {task.finishDate || 'fine non determinata'}{task.remainingPersonHours != null && task.remainingPersonHours > 0 && ` · residue ${numberText(task.remainingPersonHours)} h-persona`}{task.blockers.length > 0 && <span className="block text-orange-900">{task.blockers.map(blockerText).join('; ')}</span>}</p>)}
        {row.result.supplies.map(supply => <p key={supply.id} className="text-xs text-slate-700"><strong>{value.supplies.find(item => item.id === supply.id)?.label ?? supply.id}</strong>: pronta {supply.readyDate ?? '?'} ({supply.readiness === 'confirmed' ? 'conferma fornitore dichiarata' : supply.readiness === 'estimated' ? 'stima' : 'dato mancante'}) · primo utilizzo {supply.firstUseDate ?? 'non determinato'} · ordine entro {supply.orderByDate ?? 'non determinabile'}{supply.orderBeforeRelease && <span className="block text-orange-900">La data limite precede la prima data disponibile per l’ordine.</span>}</p>)}
        {row.result.deadlinePlan && <section aria-label={`Requisiti a ritroso · ${row.addedWorkers === 0 ? 'Base' : `+${row.addedWorkers}`}`} className="space-y-2 rounded border border-orange-200 bg-orange-50 p-2 text-xs">
          <h5 className="font-semibold text-orange-950">Requisiti a ritroso per l’obiettivo {row.result.deadlinePlan.deadlineDate}</h5>
          <p>Stima condizionale basata sulle durate dello scenario e sulle dipendenze. Queste date esprimono requisiti: non dimostrano la disponibilità delle risorse né la fattibilità degli approvvigionamenti. Non è un piano ottimizzato.</p>
          <p>Avvio più tardivo richiesto: {row.result.deadlinePlan.latestProjectStartDate}.</p>
          {row.result.deadlinePlan.startsBeforeScenario && <p className="font-medium text-orange-900">L’avvio richiesto precede la data di inizio dello scenario.</p>}
          {row.result.deadlinePlan.tasks.map(task => <p key={task.id}><strong>{value.tasks.find(item => item.id === task.id)?.label ?? task.id}</strong>: inizio entro {task.latestStartDate} · fine entro {task.latestFinishDate} · {numberText(task.durationDays)} giorni {task.durationCalendar === 'working' ? 'lavorativi' : 'di calendario'} stimati.</p>)}
          {row.result.deadlinePlan.supplies.map(supply => <div key={supply.id} className="space-y-1">
            <p><strong>{value.supplies.find(item => item.id === supply.id)?.label ?? supply.id}</strong>: pronta entro obiettivo {supply.requiredReadyDate ?? 'non determinabile'} · ordine entro per l’obiettivo {supply.latestOrderDate ?? 'non determinabile'}.</p>
            {supply.releaseAfterLatestOrder && <p className="font-medium text-orange-900">L’ordine sarebbe richiesto prima della data da cui è possibile ordinarlo.</p>}
            {supply.confirmedReadyAfterRequiredDate && <p className="font-medium text-orange-900">La data pronta confermata è successiva a quella richiesta per l’obiettivo.</p>}
          </div>)}
          <p>Risorse condivise e disponibilità alle date spostate vanno verificate. Le date d’ordine sono requisiti, non ordini o promesse del fornitore; non autorizzano retrodatazioni.</p>
        </section>}
      </div>)}
      <p className="text-xs text-slate-600">Le date d’ordine derivano dal primo uso simulato, non da una pianificazione ottimizzata a ritroso. I costi coprono solo le componenti dichiarate, non prezzi, IVA o margini.</p>
    </Detail>
  </div>;
}

export function QuotePlanningScenarioPanel({ value, onChange, disabled = false, stale = false, onClose, onRebase, onImport, importable = false }: QuotePlanningScenarioPanelProps) {
  const titleId = useId();
  const [drafts, setDrafts] = useState<Record<string, boolean>>({});
  const [commitError, setCommitError] = useState<string>();
  const report = useCallback<DraftReporter>((id, pending) => { if (!pending) setCommitError(undefined); setDrafts(previous => {
    if (!!previous[id] === pending) return previous;
    const next = { ...previous }; if (pending) next[id] = true; else delete next[id]; return next;
  }); }, []);
  const pending = Object.values(drafts).some(Boolean);
  const commit = (next: PlanningScenario): string | void => {
    if (disabled) return;
    try { const checked = readPlanningScenario(next); if (checked) { setCommitError(undefined); onChange(checked); } }
    catch { const message = 'Modifica non valida: controlla date, limiti, competenze e dipendenze (nessun ciclo).'; setCommitError(message); return message; }
  };
  const patch = (next: Partial<PlanningScenario>) => commit({ ...value, ...next });
  const updateWorker = (id: string, next: Partial<PlanningWorker>, additional = false) => additional
    ? patch({ additionalWorker: { ...value.additionalWorker!, ...next } })
    : patch({ workers: value.workers.map(worker => worker.id === id ? { ...worker, ...next } : worker) });
  const updateTask = (id: string, next: PlanningTask) => patch({ tasks: value.tasks.map(task => task.id === id ? next : task) });
  const updateSupply = (id: string, next: Partial<PlanningSupply>) => patch({ supplies: value.supplies.map(supply => supply.id === id ? { ...supply, ...next } : supply) });
  const cost = (next: Partial<PlanningScenario['costs']>) => patch({ costs: { ...value.costs, ...next } });
  const dateField = (label: string, date: string | null, onCommit: (next: string) => string | void, required = false) => <DraftField label={label} value={date ?? ''} type="date" report={report}
    validate={raw => required && !raw ? 'Inserisci la data.' : validDate(raw)} onCommit={onCommit} />;
  const workerEditor = (worker: PlanningWorker, additional = false) => <Detail key={worker.id} title={`${worker.label} · ${worker.skills.join(', ')}`}>
    <div className={gridClass}>
      <DraftField label="Nome persona" value={worker.label} validate={nameError} report={report} onCommit={label => updateWorker(worker.id, { label }, additional)} />
      <DraftField label="Competenze della persona" value={worker.skills.join(', ')} validate={skillError} report={report} hint="Codici condivisi con le lavorazioni; es. general, elettricista." onCommit={raw => updateWorker(worker.id, { skills: tokens(raw) }, additional)} />
      {dateField('Disponibile dal', worker.availableFrom, raw => updateWorker(worker.id, { availableFrom: raw || null }, additional))}
      {dateField('Disponibile fino al', worker.availableThrough, raw => updateWorker(worker.id, { availableThrough: raw || null }, additional))}
    </div>
    <DraftField label="Giorni di indisponibilità" value={worker.unavailableDates.join(', ')} validate={datesError} report={report} hint="Date AAAA-MM-GG separate da virgole. Vuoto: nessuna esclusione dichiarata." onCommit={raw => updateWorker(worker.id, { unavailableDates: tokens(raw) }, additional)} />
    <Detail title="Disponibilità parziale per data">
      <p className="text-xs text-slate-600">Sostituisce la finestra giornaliera. Pause, preparazione e viaggio si sottraggono una sola volta.</p>
      {worker.windowMinutesByDate.map((row, index) => <div key={index} className={`${gridClass} rounded border border-slate-200 p-2`}>
        {dateField('Data disponibilità parziale', row.date, date => updateWorker(worker.id, { windowMinutesByDate: worker.windowMinutesByDate.map((item, i) => i === index ? { ...item, date } : item) }, additional), true)}
        <NumericField label="Finestra parziale (ore)" value={row.minutes} scale={60} integer max={value.window.minutes} report={report} onCommit={minutes => updateWorker(worker.id, { windowMinutesByDate: worker.windowMinutesByDate.map((item, i) => i === index ? { ...item, minutes: minutes! } : item) }, additional)} />
        <button type="button" className={buttonClass} onClick={() => updateWorker(worker.id, { windowMinutesByDate: worker.windowMinutesByDate.filter((_, i) => i !== index) }, additional)}>Rimuovi disponibilità parziale</button>
      </div>)}
      <button type="button" className={buttonClass} disabled={worker.windowMinutesByDate.some(row => row.date === value.startDate)} onClick={() => updateWorker(worker.id, { windowMinutesByDate: [...worker.windowMinutesByDate, { date: value.startDate, minutes: value.window.minutes }] }, additional)}>Aggiungi disponibilità parziale</button>
    </Detail>
    {!additional && <button type="button" className={buttonClass} onClick={() => patch({ workers: value.workers.filter(person => person.id !== worker.id) })}>Rimuovi persona</button>}
  </Detail>;

  return <section aria-labelledby={titleId} className="quote-planning-surface my-3 min-w-0 overflow-hidden rounded-xl border border-blue-200 bg-blue-50/50 text-slate-900 shadow-sm">
    <header className="flex items-start justify-between gap-3 border-b border-blue-100 p-3">
      <div><h3 id={titleId} className="m-0 text-base font-semibold text-blue-950">Tempi e risorse</h3><p className="mt-1 text-xs text-slate-600">{value.workers.length} {value.workers.length === 1 ? 'persona' : 'persone'} · {value.tasks.length} {value.tasks.length === 1 ? 'fase' : 'fasi'} · {value.source === 'synthetic' ? 'ESEMPIO SINTETICO' : 'ipotesi da verificare'} · obiettivo {value.deadlineDate ? value.deadlineDate.split('-').reverse().join('/') : 'da definire'}</p></div>
      <button type="button" className={buttonClass} onClick={onClose} aria-label="Chiudi pianificazione">Chiudi</button>
    </header>
    <div className="space-y-3 p-3" role="region" aria-label="Dettagli e confronto di pianificazione">
      {stale && <div role="status" className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-950">Scenario non aggiornato: l’ambito del preventivo è cambiato. Rivedi le ore e le fasi prima del confronto.
        {onRebase && <button type="button" className={`${buttonClass} ml-2 mt-2`} disabled={disabled || pending || !!commitError} onClick={onRebase}>Ho rivisto le ipotesi</button>}</div>}
      {commitError && <p role="alert" className="text-sm text-orange-900">{commitError}</p>}
      {pending && <p role="status" className="text-sm text-orange-900">Modifiche da completare: conferma il campo con Invio o uscendo dal campo. Esc ripristina il valore precedente.</p>}
      <ScenarioComparison value={value} pending={pending} stale={stale} blocked={!!commitError} disabled={disabled} />
      <fieldset disabled={disabled} className="min-w-0 space-y-3 border-0 p-0">
        <legend className="sr-only">Ipotesi dello scenario</legend>
        <Detail title="Carico di lavoro e origine dei dati" open={value.tasks.some(task => task.kind === 'work' && task.personHours == null)}>
          <p className="text-sm text-slate-700">Inserisci le ore delle fasi oppure importa le voci incluse come bozza: titoli e ore dichiarate nei costi, solo se pertinenti all’ambito corrente; altrimenti le ore restano mancanti. Sono dati da verificare, non ore certificate. Il prezzo non determina le ore.</p>
          <div className="flex flex-wrap gap-2">
            {onImport && <button type="button" className={buttonClass} disabled={!importable || pending} onClick={onImport}>Importa voci come bozza di fasi</button>}
            <button type="button" className={buttonClass} disabled={pending} onClick={() => commit(syntheticPlanningScenario())}>Carica esempio sintetico 360 h</button>
          </div>
          {value.tasks.length === 1 && value.tasks[0].kind === 'work' && <NumericField label="Ore-persona da pianificare" nullable max={1000000} value={value.tasks[0].personHours} report={report} hint="Carico complessivo della fase, non ore per ciascun operaio. Lascia vuoto se non lo conosci." onCommit={personHours => updateTask(value.tasks[0].id, { ...value.tasks[0], kind: 'work', personHours, skill: value.tasks[0].kind === 'work' ? value.tasks[0].skill : 'general', minCrew: value.tasks[0].kind === 'work' ? value.tasks[0].minCrew : 1, maxCrew: value.tasks[0].kind === 'work' ? value.tasks[0].maxCrew : 32 })} />}
          {onImport && !importable && <p className="text-xs text-slate-600">Nessuna voce inclusa importabile dal preventivo corrente.</p>}
          <p className="text-xs text-slate-600">L’esempio sostituisce le ipotesi locali con 360 ore-persona sintetiche; non rappresenta questo progetto.</p>
        </Detail>
        <Detail title="Personalizza date, squadra e forniture">
        <Detail title="Date, calendario e giornata">
          <div className={gridClass}>
            {dateField('Data di inizio', value.startDate, startDate => patch({ startDate }), true)}
            {dateField('Data obiettivo', value.deadlineDate, raw => patch({ deadlineDate: raw || null }))}
            <NumericField label="Orizzonte di simulazione (giorni)" integer min={1} max={PLANNING_LIMITS.horizonDays} value={value.horizonDays} report={report} onCommit={horizonDays => patch({ horizonDays: horizonDays! })} />
            <NumericField label="Finestra disponibile (ore/giorno)" scale={60} integer max={1440} value={value.window.minutes} report={report} onCommit={minutes => patch({ window: { ...value.window, minutes: minutes! } })} />
            <NumericField label="Pause ancora da sottrarre (minuti)" integer max={1440} value={value.window.breakMinutes} report={report} onCommit={breakMinutes => patch({ window: { ...value.window, breakMinutes: breakMinutes! } })} hint="Se già escluse dalla finestra, inserisci 0." />
            <NumericField label="Preparazione, escluso viaggio (minuti)" integer max={1440} value={value.window.setupMinutes} report={report} onCommit={setupMinutes => patch({ window: { ...value.window, setupMinutes: setupMinutes! } })} />
          </div>
          <fieldset className="min-w-0"><legend className="mb-2 text-sm text-slate-700">Giorni lavorativi</legend><div className="flex flex-wrap gap-3">{['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'].map((day, index) => <label key={day} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={value.weekdays.includes(index + 1)} disabled={value.weekdays.length === 1 && value.weekdays.includes(index + 1)} onChange={event => patch({ weekdays: event.target.checked ? [...value.weekdays, index + 1].sort() : value.weekdays.filter(item => item !== index + 1) })} />{day}</label>)}</div></fieldset>
          <DraftField label="Festività e chiusure" value={value.holidays.join(', ')} validate={datesError} report={report} hint="Date AAAA-MM-GG separate da virgole; prevalgono sui giorni lavorativi." onCommit={raw => patch({ holidays: tokens(raw) })} />
        </Detail>
        <Detail title="Trasferte, mezzi e chilometri">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={value.window.reference === 'depot'} onChange={event => patch({ window: { ...value.window, reference: event.target.checked ? 'depot' : 'site' } })} /><span>Viaggio compreso nella finestra disponibile<br /><span className="text-xs text-slate-600">{value.window.reference === 'depot' ? 'Partenza dalla sede: andata e ritorno riducono le ore produttive.' : 'Già in cantiere: viaggio esterno alla finestra, da valutare comunque per disponibilità e costi.'}</span></span></label>
          <div className={gridClass}>
            <NumericField label="Andata (minuti)" value={value.travel.outboundMinutes} integer max={1440} report={report} onCommit={outboundMinutes => patch({ travel: { ...value.travel, outboundMinutes: outboundMinutes! } })} />
            <NumericField label="Ritorno (minuti)" value={value.travel.returnMinutes} integer max={1440} report={report} onCommit={returnMinutes => patch({ travel: { ...value.travel, returnMinutes: returnMinutes! } })} />
            <NumericField label="Distanza andata (km per mezzo)" value={value.travel.outboundKm} nullable max={100000} report={report} onCommit={outboundKm => patch({ travel: { ...value.travel, outboundKm } })} />
            <NumericField label="Distanza ritorno (km per mezzo)" value={value.travel.returnKm} nullable max={100000} report={report} onCommit={returnKm => patch({ travel: { ...value.travel, returnKm } })} />
            <NumericField label="Mezzi per giornata attiva" value={value.travel.vehicles} integer max={32} report={report} onCommit={vehicles => patch({ travel: { ...value.travel, vehicles: vehicles! } })} />
          </div><p className="text-xs text-slate-600">Ogni mezzo percorre una andata e un ritorno nei giorni di lavoro attivo. I passeggeri non moltiplicano i km-mezzo. Nessuna regola paghe è dedotta dall’orario.</p>
        </Detail>
        <Detail title={`Persone e competenze · ${value.workers.length} attuali`}>
          <NumericField label="Massimo persone presenti al giorno" value={value.maxWorkersPerDay} integer min={1} max={32} report={report} onCommit={maxWorkersPerDay => patch({ maxWorkersPerDay: maxWorkersPerDay! })} hint="Limite condiviso tra tutte le fasi, anche per +1 e +2." />
          {value.workers.map(worker => workerEditor(worker))}
          <button type="button" className={buttonClass} disabled={value.workers.length >= PLANNING_LIMITS.workers} onClick={() => patch({ workers: [...value.workers, freshWorker(newId('worker', value.workers))] })}>Aggiungi persona alla base</button>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.additionalWorker != null} onChange={event => patch({ additionalWorker: event.target.checked ? freshWorker('additional') : null })} />Valuta +1 / +2 persone ipotetiche con lo stesso profilo</label>
          {value.additionalWorker && workerEditor(value.additionalWorker, true)}
          <p className="text-xs text-slate-600">Le persone aggiuntive ereditano competenze e disponibilità del profilo. Attese, forniture e limiti di squadra possono impedire accelerazioni.</p>
        </Detail>
        <Detail title={`Fasi, ore e dipendenze · ${value.tasks.length}`}>
          {value.tasks.map(task => <Detail key={task.id} title={`${task.label} · ${task.kind === 'work' ? `${task.personHours ?? '?'} h-persona` : `${task.calendarDays ?? '?'} giorni di attesa`}`}>
            <div className={gridClass}>
              <DraftField label="Nome fase" value={task.label} validate={nameError} report={report} onCommit={label => updateTask(task.id, { ...task, label })} />
              <label className="block space-y-1 text-sm">Tipo di fase<select className={inputClass} value={task.kind} onChange={event => {
                const common = { id: task.id, label: task.label, dependsOn: [...task.dependsOn], supplyIds: [...task.supplyIds] };
                updateTask(task.id, event.target.value === 'work' ? { ...common, kind: 'work', personHours: null, skill: 'general', minCrew: 1, maxCrew: 32 } : { ...common, kind: 'wait', calendarDays: null });
              }}><option value="work">Lavoro (ore-persona)</option><option value="wait">Attesa tecnica (giorni di calendario)</option></select></label>
              {task.kind === 'work' ? <>
                <NumericField label="Ore-persona richieste" value={task.personHours} nullable max={1000000} report={report} onCommit={personHours => updateTask(task.id, { ...task, personHours })} hint="Vuoto: carico mancante. Zero: carico esplicitamente nullo." />
                <DraftField label="Competenza richiesta" value={task.skill} report={report} validate={raw => skillError(raw) || (tokens(raw).length !== 1 ? 'Scegli una sola competenza per fase.' : undefined)} onCommit={skill => updateTask(task.id, { ...task, skill: skill.trim() })} />
                <NumericField label="Squadra minima per fase" value={task.minCrew} integer min={1} max={32} report={report} onCommit={minCrew => updateTask(task.id, { ...task, minCrew: minCrew! })} />
                <NumericField label="Squadra massima per fase" value={task.maxCrew} integer min={1} max={32} report={report} onCommit={maxCrew => updateTask(task.id, { ...task, maxCrew: maxCrew! })} />
              </> : <NumericField label="Attesa tecnica (giorni di calendario)" value={task.calendarDays} integer nullable max={3660} report={report} onCommit={calendarDays => updateTask(task.id, { ...task, calendarDays })} hint="L’attesa non viene ridotta aggiungendo persone." />}
            </div>
            <fieldset><legend className="mb-1 text-sm text-slate-700">Fasi precedenti richieste</legend>{value.tasks.filter(other => other.id !== task.id).map(other => <label key={other.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={task.dependsOn.includes(other.id)} onChange={event => updateTask(task.id, { ...task, dependsOn: event.target.checked ? [...task.dependsOn, other.id] : task.dependsOn.filter(id => id !== other.id) })} />{other.label}</label>)}{value.tasks.length === 1 && <p className="text-xs text-slate-500">Nessuna altra fase.</p>}</fieldset>
            <button type="button" className={buttonClass} disabled={value.tasks.length === 1} onClick={() => patch({ tasks: value.tasks.filter(other => other.id !== task.id).map(other => ({ ...other, dependsOn: other.dependsOn.filter(id => id !== task.id) })) })}>Rimuovi fase e relativi collegamenti</button>
          </Detail>)}
          <button type="button" className={buttonClass} disabled={value.tasks.length >= PLANNING_LIMITS.tasks} onClick={() => patch({ tasks: [...value.tasks, { id: newId('task', value.tasks), label: 'Nuova fase', kind: 'work', personHours: null, skill: 'general', minCrew: 1, maxCrew: 32, dependsOn: [], supplyIds: [] }] })}>Aggiungi fase</button>
        </Detail>
        <Detail title={`Forniture e primo utilizzo · ${value.supplies.length}`}>
          {value.supplies.map(supply => <Detail key={supply.id} title={supply.label}>
            <div className={gridClass}>
              <DraftField label="Nome fornitura" value={supply.label} validate={nameError} report={report} onCommit={label => updateSupply(supply.id, { label })} />
              <NumericField label="Tempo di approvvigionamento (giorni)" value={supply.leadDays} integer nullable max={3660} report={report} onCommit={leadDays => updateSupply(supply.id, { leadDays })} />
              <label className="block space-y-1 text-sm">Calendario fornitore<select className={inputClass} value={supply.leadCalendar} onChange={event => updateSupply(supply.id, { leadCalendar: event.target.value as PlanningSupply['leadCalendar'] })}><option value="working">Giorni lavorativi del calendario scenario</option><option value="calendar">Giorni di calendario</option></select></label>
              {dateField('Ordine possibile dal', supply.releaseDate, raw => updateSupply(supply.id, { releaseDate: raw || null }))}
              {dateField('Data pronta confermata dal fornitore', supply.confirmedReadyDate, raw => updateSupply(supply.id, { confirmedReadyDate: raw || null }))}
            </div>
            <fieldset><legend className="mb-1 text-sm text-slate-700">Fasi di utilizzo (il primo uso è calcolato)</legend>{value.tasks.map(task => <label key={task.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={task.supplyIds.includes(supply.id)} onChange={event => updateTask(task.id, { ...task, supplyIds: event.target.checked ? [...task.supplyIds, supply.id] : task.supplyIds.filter(id => id !== supply.id) })} />{task.label}</label>)}</fieldset>
            <p className="text-xs text-slate-500">Inserire una data confermata richiede una conferma reale del fornitore; un lead time resta una stima.</p>
            <button type="button" className={buttonClass} onClick={() => patch({ supplies: value.supplies.filter(other => other.id !== supply.id), tasks: value.tasks.map(task => ({ ...task, supplyIds: task.supplyIds.filter(id => id !== supply.id) })) })}>Rimuovi fornitura e relativi collegamenti</button>
          </Detail>)}
          <button type="button" className={buttonClass} disabled={value.supplies.length >= PLANNING_LIMITS.supplies} onClick={() => patch({ supplies: [...value.supplies, { id: newId('supply', value.supplies), label: 'Nuova fornitura', releaseDate: null, leadDays: null, leadCalendar: 'working', confirmedReadyDate: null }] })}>Aggiungi fornitura</button>
        </Detail>
        <Detail title="Costi interni e basi di valorizzazione">
          <p className="text-xs text-slate-600">Tariffe vuote = sconosciute; 0 = costo dichiarato nullo. Le tariffe si applicano anche alle persone aggiuntive.</p>
          <div className={gridClass}>
            <NumericField label={`Costo lavoro (${value.costs.currency}/ora-persona)`} nullable max={1000000} value={value.costs.laborRatePerPersonHour} report={report} onCommit={laborRatePerPersonHour => cost({ laborRatePerPersonHour })} />
            <label className="block space-y-1 text-sm">Base costo lavoro<select className={inputClass} value={value.costs.laborBasis} onChange={event => cost({ laborBasis: event.target.value as PlanningScenario['costs']['laborBasis'] })}><option value="attendance">Intera finestra di presenza</option><option value="productive">Solo ore di lavoro allocate</option></select></label>
            <label className="block space-y-1 text-sm">Valorizzazione viaggio<select className={inputClass} value={value.costs.travelCostMode} onChange={event => cost({ travelCostMode: event.target.value as PlanningScenario['costs']['travelCostMode'] })}><option value="included">Incluso nella tariffa lavoro</option><option value="separate">Separato per ore-persona di viaggio</option></select></label>
            {value.costs.travelCostMode === 'separate' && <NumericField label={`Costo viaggio (${value.costs.currency}/ora-persona)`} nullable max={1000000} value={value.costs.travelRatePerPersonHour} report={report} onCommit={travelRatePerPersonHour => cost({ travelRatePerPersonHour })} />}
            <label className="block space-y-1 text-sm">Valorizzazione mezzo<select className={inputClass} value={value.costs.vehicleCostMode} onChange={event => cost({ vehicleCostMode: event.target.value as PlanningScenario['costs']['vehicleCostMode'] })}><option value="perKm">Tariffa per km-mezzo</option><option value="included">Già incluso, nessun costo aggiuntivo</option></select></label>
            {value.costs.vehicleCostMode === 'perKm' && <NumericField label={`Costo mezzo (${value.costs.currency}/km-mezzo)`} nullable max={1000000} value={value.costs.vehicleRatePerKm} report={report} onCommit={vehicleRatePerKm => cost({ vehicleRatePerKm })} />}
            <NumericField label={`Altri costi (${value.costs.currency}/giorno attivo)`} nullable max={1000000} value={value.costs.otherCostPerActiveDay} report={report} onCommit={otherCostPerActiveDay => cost({ otherCostPerActiveDay })} />
          </div>
          <p className="text-xs text-slate-600">La base di presenza comprende la finestra lorda; con viaggio separato il motore evita di valorizzare due volte le stesse ore. La tariffa km deve già chiarire le componenti incluse.</p>
        </Detail>
        <Detail title="Ipotesi dichiarate"><ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">{value.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul></Detail>
        </Detail>
      </fieldset>
      <p className="text-xs text-slate-600">Simulazione locale: nessuna modifica a prezzi, IVA, assegnazioni o ordini. Disponibilità e fattibilità restano da confermare.</p>
    </div>
  </section>;
}

export default QuotePlanningScenarioPanel;
