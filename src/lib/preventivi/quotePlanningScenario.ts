import { z } from 'zod';

/** Pure, local scenario data. Never attach this to a commercial quote automatically.
 * Dates are ISO civil dates (UTC arithmetic, no local timezone/DST conversion).
 * Limits apply before scheduling; no network, prices or productivity inference.
 */
export const PLANNING_LIMITS = { tasks: 64, workers: 32, supplies: 64, horizonDays: 366 } as const;
const DAY_MS = 86_400_000;
const EPS = 1e-8;
const dateNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const dateString = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const dateSchema = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(value => {
  const day = dateNumber(value);
  return Number.isFinite(day) && dateString(day) === value;
}, 'Expected a real ISO date in 2000–2099');
const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const labelSchema = z.string().trim().min(1).max(200);
const amount = (max: number) => z.number().finite().min(0).max(max);
const integer = (max: number) => amount(max).int();
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const idsSchema = z.array(idSchema).max(64).refine(unique, 'Duplicate reference');
const datesSchema = z.array(dateSchema).max(366).refine(unique, 'Duplicate date');

const workerSchema = z.object({
  id: idSchema,
  label: labelSchema,
  skills: z.array(idSchema).min(1).max(16).refine(unique, 'Duplicate skill'),
  availableFrom: dateSchema.nullable(),
  availableThrough: dateSchema.nullable(),
  unavailableDates: datesSchema,
  /** Replacement gross window, not extra capacity; zero means unavailable.
   * The same breaks/setup/travel deductions still apply, once per active day. */
  windowMinutesByDate: z.array(z.object({ date: dateSchema, minutes: integer(1440) }).strict())
    .max(366).refine(rows => unique(rows.map(row => row.date)), 'Duplicate availability date'),
}).strict();
const taskBase = { id: idSchema, label: labelSchema, dependsOn: idsSchema, supplyIds: idsSchema };
const taskSchema = z.discriminatedUnion('kind', [
  z.object({ ...taskBase, kind: z.literal('work'), personHours: amount(1_000_000).nullable(),
    skill: idSchema, minCrew: integer(32).min(1), maxCrew: integer(32).min(1) }).strict(),
  z.object({ ...taskBase, kind: z.literal('wait'), calendarDays: integer(3660).nullable() }).strict(),
]);
const supplySchema = z.object({
  id: idSchema, label: labelSchema,
  /** Earliest allowed order/release. Positive leads exclude the release day. */
  releaseDate: dateSchema.nullable(),
  leadDays: integer(3660).nullable(),
  leadCalendar: z.enum(['working', 'calendar']),
  /** Overrides an estimate. A date preceding release is rejected as inconsistent. */
  confirmedReadyDate: dateSchema.nullable(),
}).strict();
const scenarioSchema = z.object({
  version: z.literal(1), label: labelSchema, source: z.enum(['manual', 'synthetic']),
  assumptions: z.array(z.string().min(1).max(500)).max(32),
  startDate: dateSchema, deadlineDate: dateSchema.nullable(),
  /** Inclusive horizon: startDate through startDate + horizonDays - 1. */
  horizonDays: integer(PLANNING_LIMITS.horizonDays).min(1),
  /** ISO weekdays: Monday=1 … Sunday=7. Holidays override weekdays. */
  weekdays: z.array(integer(7).min(1)).min(1).max(7).refine(unique, 'Duplicate weekday'),
  holidays: datesSchema,
  window: z.object({
    /** depot: both journeys are inside; site: both are outside the window. */
    reference: z.enum(['depot', 'site']), minutes: integer(1440),
    /** Only breaks not already removed from minutes. Setup never includes travel. */
    breakMinutes: integer(1440), setupMinutes: integer(1440),
  }).strict(),
  travel: z.object({
    outboundMinutes: integer(1440), returnMinutes: integer(1440),
    outboundKm: amount(100_000).nullable(), returnKm: amount(100_000).nullable(),
    /** All vehicles make one round trip on each day with any work allocation.
     * Passenger count does NOT multiply vehicle km. No seat/route optimization. */
    vehicles: integer(32),
  }).strict(),
  workers: z.array(workerSchema).max(PLANNING_LIMITS.workers),
  /** Distinct attendees shared across all tasks, not a fresh cap for each task. */
  maxWorkersPerDay: integer(32).min(1),
  tasks: z.array(taskSchema).min(1).max(PLANNING_LIMITS.tasks),
  supplies: z.array(supplySchema).max(PLANNING_LIMITS.supplies),
  /** Explicit hypothetical worker template for +1/+2; null disables additions.
   * IDs for copies are generated; skills/availability/cost assumptions are retained. */
  additionalWorker: workerSchema.nullable(),
  costs: z.object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    laborRatePerPersonHour: amount(1_000_000).nullable(),
    /** productive: only allocated work; attendance: whole gross daily window.
     * With included travel, attendance also prices travel outside a site window.
     * With separate travel, attendance excludes travel, so hours never overlap. */
    laborBasis: z.enum(['productive', 'attendance']),
    travelCostMode: z.enum(['included', 'separate']),
    travelRatePerPersonHour: amount(1_000_000).nullable(),
    vehicleCostMode: z.enum(['included', 'perKm']),
    vehicleRatePerKm: amount(1_000_000).nullable(),
    /** Explicit all-other modeled daily costs; null is unknown, zero is known. */
    otherCostPerActiveDay: amount(1_000_000).nullable(),
  }).strict(),
}).strict();

export type PlanningWorker = z.infer<typeof workerSchema>;
export type PlanningTask = z.infer<typeof taskSchema>;
export type PlanningSupply = z.infer<typeof supplySchema>;
export type PlanningScenario = z.infer<typeof scenarioSchema>;
export type PlanningIssue = { path: string; code: 'invalid' | 'missing'; message: string };
export class PlanningScenarioValidationError extends Error {
  constructor(public readonly issues: PlanningIssue[]) {
    super(issues.map(issue => `${issue.path}: ${issue.message}`).join('; '));
    this.name = 'PlanningScenarioValidationError';
  }
}
export type PlanningAllocation = { taskId: string; workerId: string; personHours: number };
export type PlanningDay = {
  date: string; workerIds: string[]; allocations: PlanningAllocation[];
  capacityPersonHours: number; workPersonHours: number; travelPersonHours: number;
  breakPersonHours: number; setupPersonHours: number; attendancePersonHours: number;
  vehicleKm: number | null;
};
export type PlanningTaskResult = {
  id: string; kind: PlanningTask['kind']; startDate: string | null; finishDate: string | null;
  completed: boolean; scheduledPersonHours: number; remainingPersonHours: number | null;
  blockers: string[];
};
export type PlanningSupplyResult = {
  id: string; readyDate: string | null; readiness: 'confirmed' | 'estimated' | 'missing';
  firstUseDate: string | null; orderByDate: string | null; orderBeforeRelease: boolean | null;
};
export type PlanningCostResult = {
  currency: string; labor: number | null; travel: number | null; vehicle: number | null;
  other: number | null; knownSubtotal: number; total: number | null; missing: string[];
};
export type PlanningDeadlinePlan = {
  basis: 'baseline-duration-estimate'; deadlineDate: string;
  latestProjectStartDate: string; startsBeforeScenario: boolean;
  tasks: Array<{ id: string; durationDays: number; durationCalendar: 'working' | 'calendar';
    latestStartDate: string; latestFinishDate: string }>;
  supplies: Array<{ id: string; requiredReadyDate: string | null; latestOrderDate: string | null;
    releaseAfterLatestOrder: boolean | null; confirmedReadyAfterRequiredDate: boolean | null }>;
  warnings: string[];
};
export type PlanningResult = {
  status: 'absent' | 'invalid' | 'missing' | 'feasible' | 'deadline_missed' | 'infeasible_within_horizon';
  algorithm: 'daily-greedy-v1'; issues: PlanningIssue[]; warnings: string[];
  units: { work: 'person-hours'; travel: 'person-hours'; distance: 'vehicle-km'; duration: 'calendar-days' };
  /** Null when inputs are invalid/incomplete; never a fabricated zero duration. */
  capacity: { productiveMinutesPerWorkerDay: number; nominalCrewPersonHoursPerDay: number;
    workloadPersonHours: number; arithmeticWorkdays: number | null } | null;
  finishDate: string | null; horizonEndDate: string | null;
  meetsDeadline: boolean | null; deadlineSlackCalendarDays: number | null;
  activeWorkdays: number; elapsedCalendarDays: number | null;
  totalWorkPersonHours: number; totalTravelPersonHours: number; totalVehicleKm: number | null;
  days: PlanningDay[]; tasks: PlanningTaskResult[]; supplies: PlanningSupplyResult[];
  costs: PlanningCostResult | null;
  /** Backward dependency estimate, not a resource-feasible or optimized plan. */
  deadlinePlan: PlanningDeadlinePlan | null;
};
export type PlanningComparison = {
  status: 'ready' | 'absent' | 'invalid' | 'missing'; issues: PlanningIssue[];
  alternatives: Array<{ addedWorkers: 0 | 1 | 2; label: string; result: PlanningResult;
    costDelta: number | null; workdaysSaved: number | null }>;
  earliestFinishDate: string | null;
};

/** A safe local draft. Workforce, dates and windows are editable assumptions;
 * no hours, prices or actual quote contents are loaded by this factory. */
export function defaultPlanningScenario(): PlanningScenario {
  const worker = (id: string, label: string): PlanningWorker => ({ id, label, skills: ['general'],
    availableFrom: null, availableThrough: null, unavailableDates: [], windowMinutesByDate: [] });
  return {
    version: 1, label: 'Bozza locale — ipotesi da verificare', source: 'manual',
    assumptions: ['Squadra, calendario e trasferte sono ipotesi modificabili, non disponibilità confermate.'],
    startDate: '2026-11-02', deadlineDate: '2026-11-27', horizonDays: 120,
    weekdays: [1, 2, 3, 4, 5], holidays: [],
    window: { reference: 'depot', minutes: 480, breakMinutes: 0, setupMinutes: 0 },
    travel: { outboundMinutes: 60, returnMinutes: 60, outboundKm: null, returnKm: null, vehicles: 1 },
    workers: [worker('worker-1', 'Persona 1 (ipotesi)'), worker('worker-2', 'Persona 2 (ipotesi)'),
      worker('worker-3', 'Persona 3 (ipotesi)')],
    maxWorkersPerDay: 32,
    tasks: [{ id: 'work-1', label: 'Lavoro — ore da inserire', kind: 'work', personHours: null,
      skill: 'general', minCrew: 1, maxCrew: 32, dependsOn: [], supplyIds: [] }],
    supplies: [], additionalWorker: worker('additional', 'Persona aggiuntiva (ipotesi)'),
    costs: { currency: 'EUR', laborRatePerPersonHour: null, laborBasis: 'attendance',
      travelCostMode: 'included', travelRatePerPersonHour: null, vehicleCostMode: 'perKm',
      vehicleRatePerKm: null, otherCostPerActiveDay: null },
  };
}

/** Explicit opt-in arithmetic fixture, never a real quote load. */
export function syntheticPlanningScenario(): PlanningScenario {
  const scenario = defaultPlanningScenario();
  scenario.source = 'synthetic';
  scenario.label = 'ESEMPIO SINTETICO — 360 ore-persona, non un preventivo';
  scenario.assumptions = ['Esempio aritmetico sintetico: 3 persone generaliste, 360 ore-persona, nessuna interferenza.',
    '480 minuti disponibili dopo le pause; 60 minuti per tratta dentro la finestra; un mezzo, 40 km per tratta.'];
  scenario.tasks = [{ ...scenario.tasks[0], kind: 'work', personHours: 360, skill: 'general', minCrew: 1, maxCrew: 32 }];
  scenario.travel.outboundKm = 40;
  scenario.travel.returnKm = 40;
  return scenario;
}

/** Validates and detaches an object (not a JSON string). Absence stays absent.
 * Throws PlanningScenarioValidationError for malformed data. Null workloads and
 * missing cost rates are preserved for editing, never defaulted to zero. */
export function readPlanningScenario(raw: unknown): PlanningScenario | null {
  if (raw === null || raw === undefined) return null;
  const parsed = scenarioSchema.safeParse(raw);
  if (!parsed.success) throw new PlanningScenarioValidationError(parsed.error.issues.map(issue => ({
    path: issue.path.map(String).join('.'), code: 'invalid', message: issue.message,
  })));
  const s = parsed.data;
  const issues: PlanningIssue[] = [];
  const invalid = (path: string, message: string) => issues.push({ path, message, code: 'invalid' });
  for (const key of ['workers', 'tasks', 'supplies'] as const) {
    if (!unique(s[key].map(item => item.id))) invalid(key, 'IDs must be unique');
  }
  if (s.deadlineDate && s.deadlineDate < s.startDate) invalid('deadlineDate', 'Deadline precedes start');
  if (s.window.breakMinutes + s.window.setupMinutes > s.window.minutes)
    invalid('window', 'Breaks and setup exceed the gross window');
  const workers = [...s.workers, ...(s.additionalWorker ? [s.additionalWorker] : [])];
  workers.forEach((worker, index) => {
    const path = index < s.workers.length ? `workers.${index}` : 'additionalWorker';
    if (worker.availableFrom && worker.availableThrough && worker.availableFrom > worker.availableThrough)
      invalid(path, 'Availability ends before it starts');
    if (worker.windowMinutesByDate.some(row => row.minutes > s.window.minutes))
      invalid(path, 'A daily window cannot exceed the scenario window');
  });
  if (s.travel.outboundMinutes + s.travel.returnMinutes + s.window.minutes > 1440 && s.window.reference === 'site')
    invalid('travel', 'Window plus outside travel exceeds a calendar day');
  const tasksById = new Map(s.tasks.map(task => [task.id, task]));
  const suppliesById = new Set(s.supplies.map(supply => supply.id));
  s.tasks.forEach((task, index) => {
    if (task.kind === 'work' && task.minCrew > task.maxCrew) invalid(`tasks.${index}`, 'minCrew exceeds maxCrew');
    if (task.dependsOn.some(id => !tasksById.has(id))) invalid(`tasks.${index}.dependsOn`, 'Unknown predecessor');
    if (task.supplyIds.some(id => !suppliesById.has(id))) invalid(`tasks.${index}.supplyIds`, 'Unknown supply');
  });
  s.supplies.forEach((supply, index) => {
    if (supply.releaseDate && supply.confirmedReadyDate && supply.confirmedReadyDate < supply.releaseDate)
      invalid(`supplies.${index}.confirmedReadyDate`, 'Confirmed readiness precedes procurement release; reconcile the dates');
  });
  // Bounded DFS: at most 64 nodes. Reject cycles even in disconnected components.
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const predecessor of tasksById.get(id)?.dependsOn ?? []) if (!visit(predecessor)) return false;
    visiting.delete(id); visited.add(id); return true;
  };
  if (s.tasks.some(task => !visit(task.id))) invalid('tasks', 'Cyclic task dependencies');
  if (issues.length) throw new PlanningScenarioValidationError(issues);
  return s;
}

function calendar(s: PlanningScenario) {
  const holidays = new Set(s.holidays.map(dateNumber));
  const weekdays = new Set(s.weekdays);
  const weekday = (day: number) => ((day + 3) % 7 + 7) % 7 + 1;
  const working = (day: number) => weekdays.has(weekday(day)) && !holidays.has(day);
  const shift = (start: number, count: number, kind: PlanningSupply['leadCalendar'], direction = 1) => {
    if (!count) return start;
    if (kind === 'calendar') return start + direction * count;
    // Skip whole weeks, then account for holidays in the skipped interval.
    // Retain at least one workday to resolve nonworking start/end boundaries.
    const weeks = Math.floor((count - 1) / weekdays.size);
    let day = start + direction * weeks * 7;
    let remaining = count - weeks * weekdays.size;
    for (const holiday of holidays) {
      if (weekdays.has(weekday(holiday)) && (direction > 0
        ? holiday > start && holiday <= day : holiday < start && holiday >= day)) remaining++;
    }
    while (remaining > 0) { day += direction; if (working(day)) remaining--; }
    return day;
  };
  return { working, shift };
}

function emptyResult(status: PlanningResult['status'], issues: PlanningIssue[] = []): PlanningResult {
  return {
    status, algorithm: 'daily-greedy-v1', issues, warnings: [],
    units: { work: 'person-hours', travel: 'person-hours', distance: 'vehicle-km', duration: 'calendar-days' },
    capacity: null, finishDate: null, horizonEndDate: null, meetsDeadline: null,
    deadlineSlackCalendarDays: null, activeWorkdays: 0, elapsedCalendarDays: null,
    totalWorkPersonHours: 0, totalTravelPersonHours: 0, totalVehicleKm: null,
    days: [], tasks: [], supplies: [], costs: null, deadlinePlan: null,
  };
}

function pricedCosts(s: PlanningScenario, result: PlanningResult): PlanningCostResult {
  const c = s.costs;
  const travelHours = result.totalTravelPersonHours;
  const laborHours = c.laborBasis === 'productive' ? result.totalWorkPersonHours
    : result.days.reduce((sum, day) => sum + day.attendancePersonHours
      - (c.travelCostMode === 'separate' ? day.travelPersonHours : 0), 0);
  const price = (quantity: number | null, rate: number | null) => quantity === 0 ? 0
    : quantity === null || rate === null ? null : quantity * rate;
  const labor = price(laborHours, c.laborRatePerPersonHour);
  const travel = c.travelCostMode === 'included' ? 0 : price(travelHours, c.travelRatePerPersonHour);
  const vehicle = c.vehicleCostMode === 'included' ? 0 : price(result.totalVehicleKm, c.vehicleRatePerKm);
  const other = price(result.activeWorkdays, c.otherCostPerActiveDay);
  const components = { labor, travel, vehicle, other };
  const missing = Object.entries(components).filter(([, value]) => value === null).map(([key]) => key);
  if (result.status === 'infeasible_within_horizon') missing.push('unfinishedSchedule');
  const knownSubtotal = Object.values(components).reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return { currency: c.currency, ...components, knownSubtotal,
    total: missing.length ? null : knownSubtotal, missing };
}

function backwardDates(s: PlanningScenario, result: PlanningResult): PlanningDeadlinePlan | null {
  if (s.deadlineDate === null || result.finishDate === null) return null;
  const cal = calendar(s), deadline = dateNumber(s.deadlineDate);
  const successors = new Map(s.tasks.map(task => [task.id, [] as string[]]));
  s.tasks.forEach(task => task.dependsOn.forEach(id => successors.get(id)!.push(task.id)));
  const rows = new Map<string, PlanningDeadlinePlan['tasks'][number]>();
  const tasks = new Map(s.tasks.map(task => [task.id, task]));
  const baseline = new Map(result.tasks.map(task => [task.id, task]));
  const visit = (id: string): PlanningDeadlinePlan['tasks'][number] => {
    if (rows.has(id)) return rows.get(id)!;
    const task = tasks.get(id)!;
    const nextStarts = successors.get(id)!.map(next => dateNumber(visit(next).latestStartDate));
    let finish = Math.min(deadline, ...nextStarts.map(day => day - 1));
    let duration = task.kind === 'wait' ? Math.max(1, task.calendarDays!) : 0;
    if (task.kind === 'work') {
      // Preserve baseline span (including idle workdays), not a new productivity.
      const row = baseline.get(id)!;
      for (let day = dateNumber(row.startDate!); day <= dateNumber(row.finishDate!); day++)
        if (cal.working(day)) duration++;
      while (!cal.working(finish)) finish--;
    }
    const kind = task.kind === 'wait' ? 'calendar' : 'working';
    const start = cal.shift(finish, duration - 1, kind, -1);
    const row = { id, durationDays: duration, durationCalendar: kind as 'calendar' | 'working',
      latestStartDate: dateString(start), latestFinishDate: dateString(finish) };
    rows.set(id, row);
    return row;
  };
  s.tasks.forEach(task => visit(task.id));
  const latestStart = Math.min(...[...rows.values()].map(row => dateNumber(row.latestStartDate)));
  return {
    basis: 'baseline-duration-estimate', deadlineDate: s.deadlineDate,
    latestProjectStartDate: dateString(latestStart), startsBeforeScenario: latestStart < dateNumber(s.startDate),
    tasks: s.tasks.map(task => rows.get(task.id)!),
    supplies: s.supplies.map(supply => {
      const uses = s.tasks.filter(task => task.supplyIds.includes(supply.id))
        .map(task => dateNumber(rows.get(task.id)!.latestStartDate));
      if (!uses.length) return { id: supply.id, requiredReadyDate: null, latestOrderDate: null,
        releaseAfterLatestOrder: null, confirmedReadyAfterRequiredDate: null };
      const use = Math.min(...uses);
      const order = supply.leadDays === null ? null : cal.shift(use, supply.leadDays, supply.leadCalendar, -1);
      return { id: supply.id, requiredReadyDate: dateString(use),
        latestOrderDate: order === null ? null : dateString(order),
        releaseAfterLatestOrder: order === null || supply.releaseDate === null ? null : dateNumber(supply.releaseDate) > order,
        confirmedReadyAfterRequiredDate: supply.confirmedReadyDate === null ? null : dateNumber(supply.confirmedReadyDate) > use };
    }),
    warnings: [
      'Backward estimate from requested deadline using baseline task spans and dependency dates, NOT an optimized backward resource schedule.',
      'Shared workers, exact availability and procurement feasibility are not revalidated at these shifted dates. No feasibility proof or supplier promise.',
      'Latest order dates are requirements, not orders: never backdate a release or reinterpret an estimate as supplier confirmation.',
    ],
  };
}

/** Deterministic bounded daily heuristic, NOT an optimal solver.
 *
 * - Input task order is priority. Independent tasks may share a day and a worker's
 *   remaining hours. Every dependency completes on a strictly EARLIER date: no
 *   same-day successor, even if hours remain (zero-work tasks are milestones).
 * - A task gets one equal-duration crew allocation per day, capped by min/max crew
 *   and each member's remaining budget. Largest remaining budgets win; ties retain
 *   input worker order. This is a daily capacity model, not an intraday timetable;
 *   it does not prove exact simultaneous crew windows or optimize partial crews.
 * - Waits use inclusive calendar days, no workers. A zero-day wait is a milestone
 *   on its release date. Positive supplier leads exclude the release day.
 * - Travel, break and setup are charged once per ATTENDING worker/day; every
 *   configured vehicle travels once per active day. Idle/wait days incur no trips.
 * - Equipment/front constraints beyond task maxCrew and shared daily attendees,
 *   multiple sites, payroll, and actual resource reservations are outside scope.
 * - 'infeasible_within_horizon' means this bounded heuristic did not finish; it
 *   NEVER claims global impossibility. Completed schedules remain assumptions.
 */
export function calculatePlanningScenario(raw: unknown): PlanningResult {
  let s: PlanningScenario | null;
  try { s = readPlanningScenario(raw); }
  catch (error) {
    if (error instanceof PlanningScenarioValidationError) return emptyResult('invalid', error.issues);
    throw error;
  }
  if (!s) return emptyResult('absent');
  const cal = calendar(s);
  const start = dateNumber(s.startDate), end = start + s.horizonDays - 1;
  const result = emptyResult('missing');
  result.horizonEndDate = dateString(end);
  result.warnings = [
    'Simulation only: no resource booking, supplier order or commercial quote update.',
    'Daily greedy heuristic; input task order is priority; successors start on a later date. No optimality or exact intraday crew timing is proven.',
    'Costs cover only the selected labor basis, travel, vehicles and explicit daily extras; not quote prices, tax or margin.',
    ...s.assumptions,
  ];
  if (s.source === 'synthetic') result.warnings.push('SYNTHETIC EXAMPLE: not actual project workload or confirmed availability.');
  const referencedSupplies = new Set(s.tasks.flatMap(task => task.supplyIds));
  const readiness = new Map<string, number | null>();
  result.supplies = s.supplies.map((supply): PlanningSupplyResult => {
    const ready = supply.confirmedReadyDate
      ? dateNumber(supply.confirmedReadyDate)
      : supply.releaseDate !== null && supply.leadDays !== null
        ? cal.shift(dateNumber(supply.releaseDate), supply.leadDays, supply.leadCalendar) : null;
    readiness.set(supply.id, ready);
    if (referencedSupplies.has(supply.id)) {
      if (ready === null) result.issues.push({ path: `supplies.${supply.id}`, code: 'missing',
        message: 'Provide confirmed readiness or both release date and explicit lead time' });
      else if (!supply.confirmedReadyDate) result.warnings.push(`Supply ${supply.id}: readiness is estimated, not supplier-confirmed.`);
    }
    return { id: supply.id, readyDate: ready === null ? null : dateString(ready),
      readiness: ready === null ? 'missing' as const : supply.confirmedReadyDate ? 'confirmed' as const : 'estimated' as const,
      firstUseDate: null, orderByDate: null, orderBeforeRelease: null };
  });
  for (const task of s.tasks) {
    if (task.kind === 'work' ? task.personHours === null : task.calendarDays === null)
      result.issues.push({ path: `tasks.${task.id}.${task.kind === 'work' ? 'personHours' : 'calendarDays'}`,
        code: 'missing', message: 'Explicit workload/duration required; never inferred from price' });
  }
  if (result.issues.length) return result;

  const travelMinutes = s.travel.outboundMinutes + s.travel.returnMinutes;
  const travelInside = s.window.reference === 'depot' ? travelMinutes : 0;
  const deductions = s.window.breakMinutes + s.window.setupMinutes + travelInside;
  const nominalMinutes = Math.max(0, s.window.minutes - deductions);
  const workload = s.tasks.reduce((sum, task) => sum + (task.kind === 'work' ? task.personHours! : 0), 0);
  const nominalDaily = nominalMinutes / 60 * Math.min(s.workers.length, s.maxWorkersPerDay);
  result.capacity = { productiveMinutesPerWorkerDay: nominalMinutes,
    nominalCrewPersonHoursPerDay: nominalDaily, workloadPersonHours: workload,
    arithmeticWorkdays: workload === 0 ? 0 : nominalDaily > 0 ? Math.ceil(workload / nominalDaily) : null };
  if (nominalMinutes === 0) result.warnings.push('Travel/breaks/setup leave zero productive capacity in the daily window.');
  result.warnings.push('Nominal capacity/arithmetic workdays ignore skills, availability, dependencies, waits and supplies.');

  type State = { start: number | null; finish: number | null; waitEnd: number | null; remaining: number; hours: number };
  const states = new Map<string, State>(s.tasks.map((task): [string, State] => [task.id, {
    start: null, finish: null, waitEnd: null, remaining: task.kind === 'work' ? task.personHours! : 0, hours: 0,
  }]));
  const availability = s.workers.map(worker => ({
    from: worker.availableFrom ? dateNumber(worker.availableFrom) : -Infinity,
    through: worker.availableThrough ? dateNumber(worker.availableThrough) : Infinity,
    absent: new Set(worker.unavailableDates.map(dateNumber)),
    windows: new Map(worker.windowMinutesByDate.map(row => [dateNumber(row.date), row.minutes])),
  }));
  const kmPerDay = s.travel.vehicles === 0 ? 0
    : s.travel.outboundKm === null || s.travel.returnKm === null ? null
      : (s.travel.outboundKm + s.travel.returnKm) * s.travel.vehicles;

  for (let day = start; day <= end; day++) {
    const isWorkday = cal.working(day);
    const windows = availability.map(a => isWorkday && day >= a.from && day <= a.through && !a.absent.has(day)
      ? a.windows.get(day) ?? s.window.minutes : 0);
    const budgets = windows.map(minutes => Math.max(0, minutes - deductions) / 60);
    const originalBudgets = [...budgets];
    const attending = new Set<number>();
    const allocations: PlanningAllocation[] = [];
    for (const task of s.tasks) {
      const state = states.get(task.id)!;
      if (state.finish !== null || state.waitEnd !== null) continue;
      if (task.dependsOn.some(id => states.get(id)!.finish === null || states.get(id)!.finish! >= day)) continue;
      if (task.supplyIds.some(id => readiness.get(id)! > day)) continue;
      if (task.kind === 'wait') {
        state.start = day;
        state.waitEnd = day + Math.max(0, task.calendarDays! - 1);
        if (state.waitEnd <= end) state.finish = state.waitEnd;
        continue;
      }
      if (!isWorkday) continue;
      if (state.remaining === 0) { state.start = day; state.finish = day; continue; }
      const eligible = s.workers.map((worker, index) => ({ worker, index }))
        .filter(({ worker, index }) => worker.skills.includes(task.skill) && budgets[index] > EPS)
        .sort((a, b) => budgets[b.index] - budgets[a.index] || a.index - b.index);
      const crew: number[] = [];
      let newAttendees = 0;
      for (const { index } of eligible) {
        if (!attending.has(index) && attending.size + newAttendees >= s.maxWorkersPerDay) continue;
        crew.push(index);
        if (!attending.has(index)) newAttendees++;
        if (crew.length >= task.maxCrew) break;
      }
      if (crew.length < task.minCrew) continue;
      // Avoid recruiting unnecessary attendees for a small remaining workload.
      while (crew.length > task.minCrew) {
        const smaller = crew.slice(0, -1);
        if (Math.min(...smaller.map(index => budgets[index])) * smaller.length + EPS < state.remaining) break;
        crew.pop();
      }
      const hoursEach = Math.min(state.remaining / crew.length, ...crew.map(index => budgets[index]));
      if (hoursEach <= 0) continue;
      state.start ??= day;
      for (const index of crew) {
        budgets[index] = Math.max(0, budgets[index] - hoursEach);
        attending.add(index);
        allocations.push({ taskId: task.id, workerId: s.workers[index].id, personHours: hoursEach });
      }
      state.hours += hoursEach * crew.length;
      state.remaining = Math.max(0, task.personHours! - state.hours);
      if (state.remaining <= EPS) { state.remaining = 0; state.finish = day; }
    }
    if (attending.size) {
      const indices = [...attending];
      result.days.push({ date: dateString(day), workerIds: indices.map(index => s!.workers[index].id), allocations,
        capacityPersonHours: indices.reduce((sum, index) => sum + originalBudgets[index], 0),
        workPersonHours: allocations.reduce((sum, allocation) => sum + allocation.personHours, 0),
        travelPersonHours: attending.size * travelMinutes / 60,
        breakPersonHours: attending.size * s.window.breakMinutes / 60,
        setupPersonHours: attending.size * s.window.setupMinutes / 60,
        attendancePersonHours: indices.reduce((sum, index) => sum + windows[index]
          + (s!.window.reference === 'site' ? travelMinutes : 0), 0) / 60,
        vehicleKm: kmPerDay });
    }
    if ([...states.values()].every(state => state.finish !== null)) break;
  }
  result.tasks = s.tasks.map(task => {
    const state = states.get(task.id)!;
    const blockers: string[] = [];
    if (state.finish === null) {
      if (task.dependsOn.some(id => states.get(id)!.finish === null || states.get(id)!.finish! >= end))
        blockers.push('dependencies');
      if (task.supplyIds.some(id => readiness.get(id)! > end)) blockers.push('supply_after_horizon');
      if (task.kind === 'wait') blockers.push('calendar_wait_within_horizon');
      else {
        if (s.workers.filter(worker => worker.skills.includes(task.skill)).length < task.minCrew)
          blockers.push(`insufficient_skill:${task.skill}`);
        if (task.minCrew > s.maxWorkersPerDay) blockers.push('shared_daily_worker_limit');
        blockers.push('capacity_or_availability_within_horizon');
      }
    }
    return { id: task.id, kind: task.kind, startDate: state.start === null ? null : dateString(state.start),
      finishDate: state.finish === null ? null : dateString(state.finish), completed: state.finish !== null,
      scheduledPersonHours: state.hours, remainingPersonHours: task.kind === 'work' ? state.remaining : null, blockers };
  });
  result.supplies.forEach((row, index) => {
    const firstUse = s!.tasks.filter(task => task.supplyIds.includes(row.id))
      .map(task => states.get(task.id)!.start).filter((day): day is number => day !== null);
    if (!firstUse.length) return;
    const supply = s!.supplies[index];
    const use = Math.min(...firstUse);
    row.firstUseDate = dateString(use);
    // This is order-by for the computed first use, not an optimal backward plan.
    if (supply.leadDays !== null) {
      const order = cal.shift(use, supply.leadDays, supply.leadCalendar, -1);
      row.orderByDate = dateString(order);
      row.orderBeforeRelease = supply.releaseDate === null ? null : order < dateNumber(supply.releaseDate);
    }
  });
  const complete = result.tasks.every(task => task.completed);
  result.finishDate = complete ? dateString(Math.max(...[...states.values()].map(state => state.finish!))) : null;
  result.meetsDeadline = s.deadlineDate === null ? null : complete ? result.finishDate! <= s.deadlineDate
    : dateNumber(s.deadlineDate) <= end ? false : null;
  result.status = !complete ? 'infeasible_within_horizon' : result.meetsDeadline === false ? 'deadline_missed' : 'feasible';
  result.deadlineSlackCalendarDays = s.deadlineDate && result.finishDate
    ? dateNumber(s.deadlineDate) - dateNumber(result.finishDate) : null;
  result.activeWorkdays = result.days.length;
  result.elapsedCalendarDays = result.finishDate ? dateNumber(result.finishDate) - start + 1 : null;
  result.totalWorkPersonHours = result.days.reduce((sum, day) => sum + day.workPersonHours, 0);
  result.totalTravelPersonHours = result.days.reduce((sum, day) => sum + day.travelPersonHours, 0);
  result.totalVehicleKm = !result.days.length ? 0 : kmPerDay === null ? null : kmPerDay * result.days.length;
  result.costs = pricedCosts(s, result);
  result.deadlinePlan = backwardDates(s, result);
  return result;
}

/** Optional pure helper; null without a requested deadline or complete baseline.
 * See warnings: backward dates express requirements, not resource feasibility. */
export function estimatePlanningDeadline(raw: unknown): PlanningDeadlinePlan | null {
  return calculatePlanningScenario(raw).deadlinePlan;
}

/** Compare only baseline/+1/+2 with the explicitly supplied worker template.
 * Task limits, shared attendee cap, waits and supplies remain the same. These
 * are conditional scenarios, not evidence that additional staff are available. */
export function comparePlanningScenarios(raw: unknown): PlanningComparison {
  const baseline = calculatePlanningScenario(raw);
  if (baseline.status === 'absent' || baseline.status === 'invalid' || baseline.status === 'missing')
    return { status: baseline.status, issues: baseline.issues, alternatives: [], earliestFinishDate: null };
  const s = readPlanningScenario(raw)!;
  const alternatives: PlanningComparison['alternatives'] = [{ addedWorkers: 0, label: 'Risorse attuali (scenario)',
    result: baseline, costDelta: baseline.costs?.total === null ? null : 0, workdaysSaved: 0 }];
  if (s.additionalWorker) {
    for (const addedWorkers of [1, 2] as const) {
      const variant = readPlanningScenario(s)!;
      const usedIds = new Set(variant.workers.map(worker => worker.id));
      for (let count = 0; count < addedWorkers; count++) {
        let suffix = count + 1;
        while (usedIds.has(`scenario-extra-${suffix}`)) suffix++;
        const id = `scenario-extra-${suffix}`;
        usedIds.add(id);
        variant.workers.push({ ...variant.additionalWorker!, id,
          label: `${variant.additionalWorker!.label} ${count + 1}` });
      }
      variant.assumptions = [...variant.assumptions.slice(0, 31),
        `${addedWorkers} additional worker(s) use the declared hypothetical skills and availability; not a resource reservation.`];
      const result = calculatePlanningScenario(variant);
      const total = result.costs?.total, baseTotal = baseline.costs?.total;
      alternatives.push({ addedWorkers, label: `+${addedWorkers} persone (ipotesi)`, result,
        costDelta: total != null && baseTotal != null ? total - baseTotal : null,
        workdaysSaved: result.finishDate && baseline.finishDate ? baseline.activeWorkdays - result.activeWorkdays : null });
    }
  }
  const finishes = alternatives.map(row => row.result.finishDate).filter((date): date is string => date !== null).sort();
  return { status: 'ready', issues: [], alternatives, earliestFinishDate: finishes[0] ?? null };
}
