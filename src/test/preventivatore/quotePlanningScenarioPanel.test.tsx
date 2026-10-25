import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import DefaultPanel, { QuotePlanningScenarioPanel, type QuotePlanningScenarioPanelProps } from '@/components/quotes/dev/QuotePlanningScenarioPanel';
import * as engine from '@/lib/preventivi/quotePlanningScenario';
import type { PlanningScenario } from '@/lib/preventivi/quotePlanningScenario';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function Editor({ initial, onChange, ...props }: { initial: PlanningScenario; onChange?: (next: PlanningScenario) => void } & Partial<Omit<QuotePlanningScenarioPanelProps, 'value' | 'onChange'>>) {
  const [value, setValue] = useState(initial);
  return <QuotePlanningScenarioPanel value={value} onClose={() => {}} {...props} onChange={next => { onChange?.(next); setValue(next); }} />;
}
const compare = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Confronta base / +1 / +2' }));
  const numerical = screen.queryByText('Riepilogo numerico e costi', { selector: 'summary' });
  if (numerical) fireEvent.click(numerical);
};
const open = (title: string) => {
  const summary = screen.getByText(title, { selector: 'summary' });
  const parents: HTMLDetailsElement[] = []; let parent = summary.parentElement?.parentElement;
  while (parent) { if (parent instanceof HTMLDetailsElement && !parent.open) parents.unshift(parent); parent = parent.parentElement; }
  for (const details of parents) { const control = details.querySelector(':scope > summary'); if (control) fireEvent.click(control); }
  fireEvent.click(summary);
};
const blurValue = (label: string, value: string) => {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } }); fireEvent.blur(input); return input;
};

describe('Pannello locale di pianificazione', () => {
  it('mostra prima tre soluzioni leggibili e lascia i dettagli numerici chiusi', () => {
    render(<Editor initial={engine.syntheticPlanningScenario()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confronta base / +1 / +2' }));
    const cards = screen.getByRole('group', { name: 'Soluzioni a colpo d’occhio' });
    expect(within(cards).getByText('Squadra attuale')).toBeVisible();
    expect(within(cards).getByText('Con una persona in più')).toBeVisible();
    expect(within(cards).getByText('27/11/2026')).toBeVisible();
    expect(within(cards).getAllByText('Costi da completare')).toHaveLength(3);
    expect(screen.getByRole('table')).not.toBeVisible();
    expect(screen.getByText('Personalizza date, squadra e forniture', { selector: 'summary' }).parentElement).not.toHaveAttribute('open');
  });
  it('offre entrambi gli export, nessun carico fittizio e nessun calcolo all’apertura', () => {
    expect(DefaultPanel).toBe(QuotePlanningScenarioPanel);
    const calculate = vi.spyOn(engine, 'comparePlanningScenarios');
    const changed = vi.fn(); const initial = freeze(engine.defaultPlanningScenario());
    render(<Editor initial={initial} onChange={changed} />);
    expect(screen.getByText(/Carico incompleto/)).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(calculate).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
    compare();
    expect(calculate).toHaveBeenCalledOnce(); expect(screen.getByText(/Completa le ore-persona/)).toBeVisible();
    expect(initial.tasks[0].kind === 'work' && initial.tasks[0].personHours).toBeNull();
  });

  it('carica le 360 ore solo tramite azione esplicita, confronta su richiesta e conserva l’originale', () => {
    const initial = freeze(engine.defaultPlanningScenario()); const changed = vi.fn();
    const calculate = vi.spyOn(engine, 'comparePlanningScenarios');
    render(<Editor initial={initial} onChange={changed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Carica esempio sintetico 360 h' }));
    const next: PlanningScenario = changed.mock.calls[0][0];
    expect(next.source).toBe('synthetic'); expect(next.tasks[0].kind === 'work' && next.tasks[0].personHours).toBe(360);
    expect(initial.source).toBe('manual'); expect(initial.travel.outboundKm).toBeNull();
    expect(calculate).not.toHaveBeenCalled();
    compare(); expect(calculate).toHaveBeenCalledOnce();
    const table = screen.getByRole('table'); expect(within(table).getAllByRole('row')).toHaveLength(4);
    const baseline = within(table).getAllByRole('row')[1];
    expect(within(baseline).getByText('20')).toBeVisible();
    expect(within(baseline).getByText('Incompleto')).toBeVisible();
    expect(within(baseline).getByText('Non determinabile')).toBeVisible();
    expect(screen.getByText(/Più persone non garantiscono meno giorni/)).toBeVisible();
    open('Vedi capacità, vincoli e date delle forniture');
    expect(screen.getByText(/Viaggio: 120 h-persona · Distanza: 1.600 km-mezzo/)).toBeVisible();
  });

  it('mantiene bozze invalide senza NaN, zero implicito o calcolo durante la digitazione', () => {
    const calculate = vi.spyOn(engine, 'comparePlanningScenarios'); const changed = vi.fn();
    const initial = freeze(engine.syntheticPlanningScenario()); render(<Editor initial={initial} onChange={changed} />);
    open('Trasferte, mezzi e chilometri');
    for (const invalid of ['', 'abc', '1e309', '-4', '0x10', '2.5']) {
      const input = blurValue('Andata (minuti)', invalid);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('button', { name: 'Confronta base / +1 / +2' })).toBeDisabled();
      expect(changed).not.toHaveBeenCalled(); expect(initial.travel.outboundMinutes).toBe(60);
    }
    expect(calculate).not.toHaveBeenCalled();
    const input = screen.getByLabelText('Andata (minuti)'); input.focus();
    fireEvent.keyDown(input, { key: 'Escape' }); expect(input).toHaveValue('60');
    fireEvent.change(input, { target: { value: '45' } });
    expect(changed).not.toHaveBeenCalled(); fireEvent.keyDown(input, { key: 'Enter' });
    expect(changed).toHaveBeenCalledOnce(); expect(changed.mock.calls[0][0].travel.outboundMinutes).toBe(45);
    expect(changed.mock.calls[0][0].travel.returnMinutes).toBe(60);
    expect(calculate).not.toHaveBeenCalled();
  });

  it('distingue tariffe nulle e zero e accetta la virgola decimale', () => {
    const changed = vi.fn(); render(<Editor initial={freeze(engine.syntheticPlanningScenario())} onChange={changed} />);
    open('Costi interni e basi di valorizzazione');
    const input = screen.getByLabelText('Costo lavoro (EUR/ora-persona)'); expect(input).toHaveValue('');
    blurValue('Costo lavoro (EUR/ora-persona)', '32,5'); expect(changed.mock.lastCall![0].costs.laborRatePerPersonHour).toBe(32.5);
    blurValue('Costo lavoro (EUR/ora-persona)', '0'); expect(changed.mock.lastCall![0].costs.laborRatePerPersonHour).toBe(0);
    blurValue('Costo lavoro (EUR/ora-persona)', ''); expect(changed.mock.lastCall![0].costs.laborRatePerPersonHour).toBeNull();
    compare(); expect(screen.getAllByText('Incompleto')).toHaveLength(3);
    expect(screen.getAllByText('Non determinabile')).toHaveLength(3);
  });

  it('converte ore in minuti, distingue il viaggio esterno e invalida il confronto precedente', () => {
    const changed = vi.fn(); const calculate = vi.spyOn(engine, 'comparePlanningScenarios');
    render(<Editor initial={freeze(engine.syntheticPlanningScenario())} onChange={changed} />);
    compare(); expect(screen.getByRole('table')).toBeVisible();
    open('Date, calendario e giornata');
    blurValue('Finestra disponibile (ore/giorno)', '7,5');
    expect(changed.mock.lastCall![0].window.minutes).toBe(450);
    expect(screen.queryByRole('table')).not.toBeInTheDocument(); expect(calculate).toHaveBeenCalledOnce();
    open('Trasferte, mezzi e chilometri');
    fireEvent.click(screen.getByLabelText(/Viaggio compreso nella finestra disponibile/));
    expect(changed.mock.lastCall![0].window.reference).toBe('site');
    compare(); expect(calculate).toHaveBeenCalledTimes(2);
  });

  it('rifiuta date incoerenti senza pubblicarle e consente di annullare la bozza da tastiera', () => {
    const initial = freeze(engine.defaultPlanningScenario()); const changed = vi.fn();
    render(<Editor initial={initial} onChange={changed} />); open('Date, calendario e giornata');
    const input = blurValue('Data obiettivo', '2026-10-01');
    expect(input).toHaveAttribute('aria-invalid', 'true'); expect(changed).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' }); expect(input).toHaveValue(initial.deadlineDate);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    blurValue('Data obiettivo', ''); expect(changed.mock.lastCall![0].deadlineDate).toBeNull();
  });

  it('delega importazione e revisione al parent, e sospende i risultati obsoleti', () => {
    const changed = vi.fn(), imported = vi.fn(), rebased = vi.fn();
    const initial = freeze(engine.defaultPlanningScenario());
    const view = render(<QuotePlanningScenarioPanel value={initial} onChange={changed} onClose={vi.fn()} stale onRebase={rebased} onImport={imported} importable />);
    expect(screen.getByText(/Scenario non aggiornato/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confronta base / +1 / +2' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ho rivisto le ipotesi' })); expect(rebased).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Importa voci come bozza di fasi' }));
    expect(imported).toHaveBeenCalledOnce(); expect(changed).not.toHaveBeenCalled();
    view.rerender(<QuotePlanningScenarioPanel value={initial} onChange={changed} onClose={vi.fn()} onImport={imported} importable={false} />);
    expect(screen.getByRole('button', { name: 'Importa voci come bozza di fasi' })).toBeDisabled();
  });

  it('disabilita le modifiche mantenendo accessibile la chiusura', () => {
    const close = vi.fn(), changed = vi.fn(); const calculate = vi.spyOn(engine, 'comparePlanningScenarios');
    render(<Editor initial={freeze(engine.defaultPlanningScenario())} disabled onClose={close} onChange={changed} />);
    expect(screen.getByRole('button', { name: 'Carica esempio sintetico 360 h' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confronta base / +1 / +2' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Confronta base / +1 / +2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi pianificazione' }));
    expect(close).toHaveBeenCalledOnce(); expect(changed).not.toHaveBeenCalled(); expect(calculate).not.toHaveBeenCalled();
  });

  it('rispetta il limite per fase: +1 e +2 non producono una promessa lineare', () => {
    const initial = engine.syntheticPlanningScenario();
    if (initial.tasks[0].kind === 'work') initial.tasks[0].maxCrew = 1;
    render(<Editor initial={freeze(initial)} />); compare();
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    const dates = rows.map(row => within(row).getAllByRole('cell')[0].textContent);
    expect(new Set(dates).size).toBe(1);
    rows.slice(1).forEach(row => expect(within(row).getByText('Risparmiati: 0')).toBeVisible());
  });

  it('edita fornitura, calendario e primo uso tramite collegamento alla fase senza mutare gli input', () => {
    const changed = vi.fn(); const initial = freeze(engine.defaultPlanningScenario());
    render(<Editor initial={initial} onChange={changed} />); open('Forniture e primo utilizzo · 0');
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi fornitura' })); open('Nuova fornitura');
    blurValue('Tempo di approvvigionamento (giorni)', '10');
    blurValue('Ordine possibile dal', '2026-11-02');
    fireEvent.change(screen.getByLabelText('Calendario fornitore'), { target: { value: 'calendar' } });
    fireEvent.click(screen.getByLabelText('Lavoro — ore da inserire'));
    const next: PlanningScenario = changed.mock.lastCall![0];
    expect(next.supplies[0]).toMatchObject({ leadDays: 10, releaseDate: '2026-11-02', leadCalendar: 'calendar', confirmedReadyDate: null });
    expect(next.tasks[0].supplyIds).toEqual([next.supplies[0].id]);
    expect(initial.supplies).toEqual([]); expect(initial.tasks[0].supplyIds).toEqual([]);
  });

  it('mostra le date a ritroso come requisiti condizionali, senza provarne la fattibilità', () => {
    const initial = engine.syntheticPlanningScenario();
    initial.deadlineDate = '2026-11-13'; initial.additionalWorker = null;
    initial.supplies = [{ id: 'porte', label: 'Porte', releaseDate: '2026-11-02', leadDays: 3, leadCalendar: 'working', confirmedReadyDate: '2026-11-03' }];
    initial.tasks[0].supplyIds = ['porte']; freeze(initial);
    const view = render(<QuotePlanningScenarioPanel value={initial} onChange={vi.fn()} onClose={vi.fn()} />);
    compare(); open('Vedi capacità, vincoli e date delle forniture');
    const requirements = screen.getByRole('region', { name: 'Requisiti a ritroso · Base' });
    expect(requirements).toHaveTextContent('Stima condizionale');
    expect(requirements).toHaveTextContent('non dimostrano la disponibilità delle risorse né la fattibilità degli approvvigionamenti');
    expect(requirements).toHaveTextContent('Non è un piano ottimizzato.');
    expect(requirements).toHaveTextContent('Avvio più tardivo richiesto: 2026-10-19');
    expect(requirements).toHaveTextContent('inizio entro 2026-10-19 · fine entro 2026-11-13');
    expect(requirements).toHaveTextContent('ordine entro per l’obiettivo 2026-10-14');
    expect(requirements).toHaveTextContent('L’avvio richiesto precede la data di inizio');
    expect(requirements).toHaveTextContent('L’ordine sarebbe richiesto prima della data da cui è possibile ordinarlo');
    expect(requirements).toHaveTextContent('La data pronta confermata è successiva a quella richiesta');
    expect(requirements).toHaveTextContent('non ordini o promesse del fornitore');
    view.rerender(<QuotePlanningScenarioPanel value={{ ...initial, deadlineDate: null }} onChange={vi.fn()} onClose={vi.fn()} />);
    compare();
    expect(screen.queryByRole('region', { name: 'Requisiti a ritroso · Base', hidden: true })).not.toBeInTheDocument();
  });
});
