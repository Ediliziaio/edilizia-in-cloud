import { describe, expect, it } from 'vitest';
import {
  PLANNING_LIMITS, PlanningScenarioValidationError, calculatePlanningScenario,
  comparePlanningScenarios, defaultPlanningScenario, estimatePlanningDeadline, readPlanningScenario, syntheticPlanningScenario,
  type PlanningScenario, type PlanningSupply, type PlanningTask, type PlanningWorker,
} from '../../lib/preventivi/quotePlanningScenario';

function work(id: string, personHours: number | null, extra: Partial<Extract<PlanningTask, { kind: 'work' }>> = {}): PlanningTask {
  return { id, label: id, kind: 'work', personHours, skill: 'general', minCrew: 1, maxCrew: 32,
    dependsOn: [], supplyIds: [], ...extra };
}
function wait(id: string, calendarDays: number | null, dependsOn: string[] = []): PlanningTask {
  return { id, label: id, kind: 'wait', calendarDays, dependsOn, supplyIds: [] };
}
function example(hours = 360): PlanningScenario {
  const s = syntheticPlanningScenario();
  s.tasks = [work('work-1', hours)];
  return s;
}
function priced(s: PlanningScenario): PlanningScenario {
  s.costs = { currency: 'EUR', laborRatePerPersonHour: 20, laborBasis: 'attendance',
    travelCostMode: 'separate', travelRatePerPersonHour: 10, vehicleCostMode: 'perKm',
    vehicleRatePerKm: 0.5, otherCostPerActiveDay: 0 };
  return s;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

describe('optional, local, explicitly synthetic planning', () => {
  it('keeps absent scenarios absent and defaults safe with no project workload or prices', () => {
    expect(readPlanningScenario(undefined)).toBeNull();
    expect(readPlanningScenario(null)).toBeNull();
    expect(calculatePlanningScenario(null).status).toBe('absent');
    expect(comparePlanningScenarios(undefined).status).toBe('absent');
    const draft = defaultPlanningScenario();
    expect(draft.source).toBe('manual');
    expect(draft.tasks[0]).toMatchObject({ personHours: null });
    const result = calculatePlanningScenario(draft);
    expect(result.status).toBe('missing');
    expect(result.issues).toContainEqual(expect.objectContaining({ path: 'tasks.work-1.personHours', code: 'missing' }));
    expect(result.finishDate).toBeNull();
    expect(result.capacity).toBeNull();
    expect(result.costs).toBeNull();
    expect(comparePlanningScenarios(draft)).toMatchObject({ status: 'missing', alternatives: [] });
  });

  it('creates independent drafts; parser detaches nested data and accepts object data only', () => {
    const a = defaultPlanningScenario(), b = defaultPlanningScenario();
    a.workers[0].skills.push('electrical');
    expect(b.workers[0].skills).toEqual(['general']);
    const parsed = readPlanningScenario(a)!;
    parsed.workers[0].skills.push('plumbing');
    expect(a.workers[0].skills).not.toContain('plumbing');
    expect(() => readPlanningScenario(JSON.stringify(a))).toThrow(PlanningScenarioValidationError);
  });

  it('does not mutate frozen inputs and is deterministic for calculations/comparisons', () => {
    const s = freeze(example());
    const before = JSON.stringify(s);
    expect(calculatePlanningScenario(s)).toEqual(calculatePlanningScenario(s));
    expect(comparePlanningScenarios(s)).toEqual(comparePlanningScenarios(s));
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('explicit capacity, windows, person-hours and vehicle-km', () => {
  it('computes 3 × 6 = 18 person-hours/day, 360 / 18 = 20 days, 40 × 2 × 20 = 1600 vehicle-km', () => {
    const result = calculatePlanningScenario(example());
    expect(result.status).toBe('feasible');
    expect(result.capacity).toEqual({ productiveMinutesPerWorkerDay: 360,
      nominalCrewPersonHoursPerDay: 18, workloadPersonHours: 360, arithmeticWorkdays: 20 });
    expect(result.activeWorkdays).toBe(20);
    expect(result.finishDate).toBe('2026-11-27');
    expect(result.totalWorkPersonHours).toBe(360);
    expect(result.totalTravelPersonHours).toBe(120);
    expect(result.totalVehicleKm).toBe(1600);
    expect(result.meetsDeadline).toBe(true);
    expect(result.deadlineSlackCalendarDays).toBe(0);
    expect(result.units).toMatchObject({ work: 'person-hours', distance: 'vehicle-km' });
    expect(result.warnings.join(' ')).toContain('SYNTHETIC');
  });

  it('site window leaves 8 productive hours, 24 per crew and 15 workdays; travel still exists', () => {
    const s = example(); s.window.reference = 'site';
    const result = calculatePlanningScenario(s);
    expect(result.capacity?.nominalCrewPersonHoursPerDay).toBe(24);
    expect(result.activeWorkdays).toBe(15);
    expect(result.finishDate).toBe('2026-11-20');
    expect(result.totalTravelPersonHours).toBe(90);
    expect(result.totalVehicleKm).toBe(1200);
    expect(result.days[0].attendancePersonHours).toBe(30);
  });

  it('deducts explicit breaks/setup once; asymmetric travel is minutes, not inferred from km', () => {
    const s = example(10);
    s.travel.outboundMinutes = 45; s.travel.returnMinutes = 75;
    s.window.breakMinutes = 30; s.window.setupMinutes = 30;
    const result = calculatePlanningScenario(s);
    expect(result.capacity?.productiveMinutesPerWorkerDay).toBe(300);
    expect(result.days[0]).toMatchObject({ travelPersonHours: 4, breakPersonHours: 1,
      setupPersonHours: 1, vehicleKm: 80, workPersonHours: 10 });
  });

  it('counts each vehicle once per active day, independently of passenger count', () => {
    const s = example(18); s.travel.vehicles = 2;
    expect(calculatePlanningScenario(s)).toMatchObject({ totalVehicleKm: 160, totalTravelPersonHours: 6 });
    s.travel.vehicles = 0; s.travel.outboundKm = null;
    expect(calculatePlanningScenario(s).totalVehicleKm).toBe(0);
  });

  it('handles travel consuming the full window without a divide-by-zero or fake finish', () => {
    const s = example(); s.travel.outboundMinutes = 240; s.travel.returnMinutes = 240;
    const result = calculatePlanningScenario(s);
    expect(result.status).toBe('infeasible_within_horizon');
    expect(result.capacity?.arithmeticWorkdays).toBeNull();
    expect(result.finishDate).toBeNull();
    expect(result.totalTravelPersonHours).toBe(0);
    expect(result.costs?.total).toBeNull();
  });
});

describe('civil calendar, deadlines, DAG and noncompressible waits', () => {
  it('skips configured holidays and weekends, including leap-day validation', () => {
    const s = example(36); s.holidays = ['2026-11-03'];
    expect(calculatePlanningScenario(s).finishDate).toBe('2026-11-04');
    s.startDate = '2028-02-29'; s.deadlineDate = null;
    expect(readPlanningScenario(s)?.startDate).toBe('2028-02-29');
    s.startDate = '2026-02-29';
    expect(calculatePlanningScenario(s).status).toBe('invalid');
  });

  it('uses ISO weekdays and accepts weekend starts/holiday-only windows', () => {
    const s = example(18); s.startDate = '2026-11-01'; s.weekdays = [7]; s.deadlineDate = null;
    expect(calculatePlanningScenario(s).finishDate).toBe('2026-11-01');
    s.holidays = ['2026-11-01']; s.horizonDays = 7;
    expect(calculatePlanningScenario(s).status).toBe('infeasible_within_horizon');
  });

  it('successors start on a later day even with residual capacity and reversed input order', () => {
    const s = example(1);
    s.tasks = [work('second', 1, { dependsOn: ['first'] }), work('first', 1)];
    const result = calculatePlanningScenario(s);
    expect(result.tasks.find(t => t.id === 'first')?.finishDate).toBe('2026-11-02');
    expect(result.tasks.find(t => t.id === 'second')?.startDate).toBe('2026-11-03');
    expect(result.activeWorkdays).toBe(2);
  });

  it('counts fixed waits through weekends without consuming crews or triggering daily travel', () => {
    const s = example(); s.startDate = '2026-11-06'; s.deadlineDate = null;
    s.tasks = [work('first', 18), wait('cure', 2, ['first']), work('last', 18, { dependsOn: ['cure'] })];
    const result = calculatePlanningScenario(s);
    expect(result.tasks[1]).toMatchObject({ startDate: '2026-11-07', finishDate: '2026-11-08' });
    expect(result.finishDate).toBe('2026-11-09');
    expect(result.activeWorkdays).toBe(2);
    expect(result.totalVehicleKm).toBe(160);
  });

  it('extra workers cannot compress a calendar wait or repair its missed deadline', () => {
    const s = example(); s.tasks = [wait('cure', 40)];
    const comparison = comparePlanningScenarios(s);
    expect(comparison.alternatives).toHaveLength(3);
    for (const row of comparison.alternatives) {
      expect(row.result.status).toBe('deadline_missed');
      expect(row.result.finishDate).toBe('2026-12-11');
      expect(row.result.totalTravelPersonHours).toBe(0);
      expect(row.result.deadlineSlackCalendarDays).toBe(-14);
    }
  });

  it('respects inclusive horizon; distinguishes incomplete search from a completed late schedule', () => {
    const s = example(36); s.horizonDays = 1;
    let result = calculatePlanningScenario(s);
    expect(result.status).toBe('infeasible_within_horizon');
    expect(result.horizonEndDate).toBe('2026-11-02');
    expect(result.meetsDeadline).toBeNull(); // Deadline lies outside evaluated horizon.
    expect(result.tasks[0].remainingPersonHours).toBe(18);
    s.deadlineDate = '2026-11-02';
    expect(calculatePlanningScenario(s).meetsDeadline).toBe(false);
    s.horizonDays = 2;
    result = calculatePlanningScenario(s);
    expect(result.status).toBe('deadline_missed');
    expect(result.finishDate).toBe('2026-11-03');
    s.tasks = [wait('long-wait', 3)];
    expect(calculatePlanningScenario(s).finishDate).toBeNull();
  });

  it('does not require a deadline and supports explicit zero-work milestones', () => {
    const s = example(0); s.deadlineDate = null;
    expect(calculatePlanningScenario(s)).toMatchObject({ status: 'feasible', meetsDeadline: null,
      finishDate: '2026-11-02', activeWorkdays: 0, totalVehicleKm: 0 });
  });
});

describe('requested-deadline backward estimate, explicitly not a feasibility proof', () => {
  it('backs dependencies, calendar waits and supplier order requirements from the requested deadline', () => {
    const s = example();
    s.tasks = [work('first', 18), wait('cure', 2, ['first']),
      work('last', 18, { dependsOn: ['cure'], supplyIds: ['supply'] })];
    s.supplies = [{ id: 'supply', label: 'supply', releaseDate: '2026-11-02',
      leadDays: 2, leadCalendar: 'working', confirmedReadyDate: null }];
    const result = calculatePlanningScenario(s);
    expect(result.supplies[0].orderByDate).toBe('2026-11-03'); // Computed first use, not deadline.
    const backward = result.deadlinePlan!;
    expect(backward).toMatchObject({ basis: 'baseline-duration-estimate', deadlineDate: '2026-11-27',
      latestProjectStartDate: '2026-11-24', startsBeforeScenario: false });
    expect(backward.tasks.map(row => [row.id, row.latestStartDate, row.latestFinishDate])).toEqual([
      ['first', '2026-11-24', '2026-11-24'], ['cure', '2026-11-25', '2026-11-26'],
      ['last', '2026-11-27', '2026-11-27'],
    ]);
    expect(backward.supplies[0]).toMatchObject({ requiredReadyDate: '2026-11-27', latestOrderDate: '2026-11-25',
      releaseAfterLatestOrder: false, confirmedReadyAfterRequiredDate: null });
    expect(estimatePlanningDeadline(s)).toEqual(backward);
  });

  it('flags order-release/confirmed-readiness conflicts and work required before the scenario start', () => {
    const s = example(); s.tasks = [wait('wait', 40)];
    expect(estimatePlanningDeadline(s)).toMatchObject({ latestProjectStartDate: '2026-10-19', startsBeforeScenario: true });
    s.tasks = [work('a', 18, { supplyIds: ['supply'] })];
    s.supplies = [{ id: 'supply', label: 'supply', releaseDate: '2026-11-30',
      leadDays: 2, leadCalendar: 'working', confirmedReadyDate: '2026-12-01' }];
    expect(estimatePlanningDeadline(s)?.supplies[0]).toMatchObject({ releaseAfterLatestOrder: true,
      confirmedReadyAfterRequiredDate: true, latestOrderDate: '2026-11-25' });
  });

  it('uses working calendars for work and order leads but does not claim shifted resource feasibility', () => {
    const s = example(); s.deadlineDate = '2026-11-29'; s.holidays = ['2026-11-27'];
    s.tasks = [work('a', 18), work('b', 18)];
    const backward = estimatePlanningDeadline(s)!;
    // Independent work can collide here; warnings make the limitation explicit.
    expect(backward.tasks.map(row => row.latestStartDate)).toEqual(['2026-11-26', '2026-11-26']);
    expect(backward.warnings.join(' ')).toContain('NOT an optimized backward resource schedule');
    expect(backward.warnings.join(' ')).toContain('No feasibility proof');
  });

  it('returns no backward dates for unknown workload, incomplete horizon, absence or no deadline', () => {
    expect(estimatePlanningDeadline(defaultPlanningScenario())).toBeNull();
    expect(estimatePlanningDeadline(null)).toBeNull();
    const s = example(); s.horizonDays = 1;
    expect(estimatePlanningDeadline(s)).toBeNull();
    s.horizonDays = 120; s.deadlineDate = null;
    expect(estimatePlanningDeadline(s)).toBeNull();
  });
});

describe('skills, individual availability, shared worker budgets and crew limits', () => {
  it('does not substitute general workers for a missing skill, even in +1/+2 variants', () => {
    const s = example(10); s.tasks = [work('wire', 10, { skill: 'electrical' })];
    const comparison = comparePlanningScenarios(s);
    for (const row of comparison.alternatives) {
      expect(row.result.status).toBe('infeasible_within_horizon');
      expect(row.result.tasks[0].blockers).toContain('insufficient_skill:electrical');
    }
    s.additionalWorker!.skills = ['electrical'];
    expect(comparePlanningScenarios(s).alternatives[1].result.status).toBe('feasible');
  });

  it('shares each worker remaining daily hours across tasks without repeating trips/setup', () => {
    const s = example(); s.workers = [s.workers[0]]; s.window.setupMinutes = 60;
    s.tasks = [work('a', 2), work('b', 3)];
    const result = calculatePlanningScenario(s);
    expect(result.days).toHaveLength(1);
    expect(result.days[0]).toMatchObject({ workPersonHours: 5, travelPersonHours: 2,
      setupPersonHours: 1, vehicleKm: 80, workerIds: ['worker-1'] });
    expect(result.days[0].allocations).toHaveLength(2);
  });

  it('caps distinct daily workers across tasks with different skills, not just per task', () => {
    const s = example(); s.maxWorkersPerDay = 1;
    s.workers = [{ ...s.workers[0], skills: ['electrical'] }, { ...s.workers[1], skills: ['plumbing'] }];
    s.tasks = [work('wire', 6, { skill: 'electrical' }), work('pipes', 6, { skill: 'plumbing' })];
    const result = calculatePlanningScenario(s);
    expect(result.activeWorkdays).toBe(2);
    expect(result.days.every(day => day.workerIds.length === 1)).toBe(true);
    expect(result.finishDate).toBe('2026-11-03');
  });

  it('deducts existing commitments via replacement daily windows and availability dates', () => {
    const s = example(9); s.workers = [s.workers[0]];
    s.workers[0].availableFrom = '2026-11-03';
    s.workers[0].availableThrough = '2026-11-06';
    s.workers[0].unavailableDates = ['2026-11-04'];
    s.workers[0].windowMinutesByDate = [{ date: '2026-11-03', minutes: 300 }];
    const result = calculatePlanningScenario(s);
    expect(result.days.map(day => [day.date, day.workPersonHours])).toEqual([
      ['2026-11-03', 3], ['2026-11-05', 6],
    ]);
  });

  it('enforces simultaneous minimum crew and max crew rather than linear unlimited acceleration', () => {
    const s = example(36); s.tasks = [work('small-room', 36, { maxCrew: 1 })];
    expect(comparePlanningScenarios(s).alternatives.map(row => row.result.activeWorkdays)).toEqual([6, 6, 6]);
    s.tasks = [work('lift', 18, { minCrew: 3, maxCrew: 3 })];
    s.workers[0].unavailableDates = ['2026-11-02'];
    expect(calculatePlanningScenario(s).finishDate).toBe('2026-11-03');
    s.maxWorkersPerDay = 2;
    expect(calculatePlanningScenario(s).tasks[0].blockers).toContain('shared_daily_worker_limit');
  });

  it('produces meaningful baseline/+1/+2 and honors unavailable additional workers', () => {
    const s = example();
    const comparison = comparePlanningScenarios(s);
    expect(comparison.status).toBe('ready');
    expect(comparison.alternatives.map(row => row.addedWorkers)).toEqual([0, 1, 2]);
    expect(comparison.alternatives.map(row => row.result.activeWorkdays)).toEqual([20, 15, 12]);
    expect(comparison.alternatives.map(row => row.workdaysSaved)).toEqual([0, 5, 8]);
    expect(comparison.alternatives.every(row => row.costDelta === null)).toBe(true);
    s.additionalWorker!.availableFrom = '2027-06-01';
    expect(comparePlanningScenarios(s).alternatives.map(row => row.result.activeWorkdays)).toEqual([20, 20, 20]);
    s.additionalWorker = null;
    expect(comparePlanningScenarios(s).alternatives).toHaveLength(1);
  });
});

describe('procurement release, lead calendars and supplier confirmation', () => {
  function procurement(): PlanningScenario {
    const s = example(18);
    s.supplies = [{ id: 'supply', label: 'Materiale dichiarato', releaseDate: '2026-11-06',
      leadDays: 2, leadCalendar: 'calendar', confirmedReadyDate: null }];
    s.tasks[0].supplyIds = ['supply'];
    return s;
  }

  it('distinguishes calendar lead, working lead and holidays without retroactive orders', () => {
    const s = procurement();
    let result = calculatePlanningScenario(s);
    expect(result.supplies[0]).toMatchObject({ readyDate: '2026-11-08', readiness: 'estimated',
      firstUseDate: '2026-11-09', orderByDate: '2026-11-07', orderBeforeRelease: false });
    s.supplies[0].leadCalendar = 'working'; s.holidays = ['2026-11-09'];
    result = calculatePlanningScenario(s);
    expect(result.supplies[0]).toMatchObject({ readyDate: '2026-11-11', firstUseDate: '2026-11-11',
      orderByDate: '2026-11-06' });
  });

  it('requires known release/lead or confirmed readiness, and does not label an estimate confirmed', () => {
    const s = procurement(); s.supplies[0].leadDays = null;
    expect(calculatePlanningScenario(s).status).toBe('missing');
    s.supplies[0].releaseDate = null; s.supplies[0].confirmedReadyDate = '2026-11-04';
    const result = calculatePlanningScenario(s);
    expect(result.status).toBe('feasible');
    expect(result.supplies[0]).toMatchObject({ readyDate: '2026-11-04', readiness: 'confirmed', orderByDate: null });
    expect(result.finishDate).toBe('2026-11-04');
  });

  it('supplier confirmation overrides estimates without silently changing an inconsistent confirmed date', () => {
    const s = procurement(); s.supplies[0].confirmedReadyDate = '2026-11-20';
    expect(calculatePlanningScenario(s).finishDate).toBe('2026-11-20');
    s.supplies[0].confirmedReadyDate = '2026-11-02';
    expect(() => readPlanningScenario(s)).toThrow(PlanningScenarioValidationError);
    expect(calculatePlanningScenario(s)).toMatchObject({ status: 'invalid', supplies: [],
      issues: [expect.objectContaining({ path: 'supplies.0.confirmedReadyDate', code: 'invalid' })] });
    s.supplies[0].confirmedReadyDate = '2026-11-06';
    expect(calculatePlanningScenario(s).finishDate).toBe('2026-11-06');
    s.supplies[0].confirmedReadyDate = '2026-12-01';
    expect(comparePlanningScenarios(s).alternatives.every(row => row.result.status === 'deadline_missed')).toBe(true);
    s.horizonDays = 10;
    expect(calculatePlanningScenario(s).tasks[0].blockers).toContain('supply_after_horizon');
  });

  it('a missing unused supply does not invalidate work that does not need it', () => {
    const s = procurement(); s.tasks[0].supplyIds = [];
    s.supplies[0].releaseDate = null; s.supplies[0].leadDays = null;
    expect(calculatePlanningScenario(s).status).toBe('feasible');
  });
});

describe('cost completeness and single-source inclusion', () => {
  it('unknown costs stay null while timing remains calculable; zero is explicit', () => {
    const s = example();
    const result = calculatePlanningScenario(s);
    expect(result.status).toBe('feasible');
    expect(result.costs).toMatchObject({ total: null, labor: null, travel: 0, vehicle: null, other: null });
    expect(result.costs?.missing).toEqual(['labor', 'vehicle', 'other']);
    priced(s);
    const known = calculatePlanningScenario(s);
    expect(known.costs).toMatchObject({ labor: 7200, travel: 1200, vehicle: 800, other: 0, total: 9200 });
    s.costs.laborRatePerPersonHour = 0;
    expect(calculatePlanningScenario(s).costs?.labor).toBe(0);
  });

  it('does not add a second travel/vehicle charge when declared included in labor rates', () => {
    const s = priced(example());
    s.costs.travelCostMode = 'included'; s.costs.vehicleCostMode = 'included';
    const result = calculatePlanningScenario(s);
    expect(result.costs).toMatchObject({ labor: 9600, travel: 0, vehicle: 0, total: 9600 });
  });

  it('site attendance plus separately priced outside travel never overlaps labor hours', () => {
    const s = priced(example(24)); s.window.reference = 'site';
    expect(calculatePlanningScenario(s).costs).toMatchObject({ labor: 480, travel: 60, vehicle: 40, total: 580 });
    s.costs.travelCostMode = 'included';
    expect(calculatePlanningScenario(s).costs).toMatchObject({ labor: 600, travel: 0, vehicle: 40, total: 640 });
  });

  it('exposes known subtotal but not total/delta when distances or costs are incomplete', () => {
    const s = priced(example()); s.travel.outboundKm = null;
    const result = calculatePlanningScenario(s);
    expect(result.totalVehicleKm).toBeNull();
    expect(result.costs).toMatchObject({ labor: 7200, travel: 1200, vehicle: null, knownSubtotal: 8400, total: null });
    expect(comparePlanningScenarios(s).alternatives.every(row => row.costDelta === null)).toBe(true);
    s.travel.outboundKm = 40;
    expect(comparePlanningScenarios(s).alternatives[0].costDelta).toBe(0);
  });

  it('does not report a full cost for partially scheduled work', () => {
    const s = priced(example()); s.horizonDays = 1;
    const result = calculatePlanningScenario(s);
    expect(result.costs?.knownSubtotal).toBeGreaterThan(0);
    expect(result.costs?.total).toBeNull();
    expect(result.costs?.missing).toContain('unfinishedSchedule');
  });
});

describe('strong validation and bounded scheduling invariants', () => {
  it('never infers workload or productivity from any known cost, price or quantity', () => {
    const s = priced(defaultPlanningScenario());
    expect(calculatePlanningScenario(s)).toMatchObject({ status: 'missing', capacity: null, finishDate: null });
    expect(calculatePlanningScenario({ ...s, quotePrice: 38600, quantity: 100 }).status).toBe('invalid');
    expect(calculatePlanningScenario({ ...s, tasks: [{ ...s.tasks[0], price: 38600, productivity: 5 }] }).status).toBe('invalid');
  });

  it.each([
    ['NaN workload', (s: PlanningScenario) => { s.tasks = [work('bad', NaN)]; }],
    ['infinite workload', (s: PlanningScenario) => { s.tasks = [work('bad', Infinity)]; }],
    ['negative workload', (s: PlanningScenario) => { s.tasks = [work('bad', -1)]; }],
    ['fractional crew', (s: PlanningScenario) => { s.tasks = [work('bad', 10, { minCrew: 1.5 })]; }],
    ['inverted crew', (s: PlanningScenario) => { s.tasks = [work('bad', 10, { minCrew: 3, maxCrew: 2 })]; }],
    ['fractional vehicle count', (s: PlanningScenario) => { s.travel.vehicles = 1.5; }],
    ['fractional wait', (s: PlanningScenario) => { s.tasks = [wait('bad', 1.5)]; }],
    ['fractional minute', (s: PlanningScenario) => { s.travel.outboundMinutes = 1.5; }],
    ['fractional horizon', (s: PlanningScenario) => { s.horizonDays = 1.5; }],
    ['too large horizon', (s: PlanningScenario) => { s.horizonDays = 367; }],
    ['no weekdays', (s: PlanningScenario) => { s.weekdays = []; }],
    ['duplicate weekdays', (s: PlanningScenario) => { s.weekdays = [1, 1]; }],
    ['duplicate workers', (s: PlanningScenario) => { s.workers.push(s.workers[0]); }],
    ['duplicate tasks', (s: PlanningScenario) => { s.tasks.push(s.tasks[0]); }],
    ['unknown dependency', (s: PlanningScenario) => { s.tasks[0].dependsOn = ['absent']; }],
    ['unknown supply', (s: PlanningScenario) => { s.tasks[0].supplyIds = ['absent']; }],
    ['self cycle', (s: PlanningScenario) => { s.tasks[0].dependsOn = ['work-1']; }],
    ['disconnected cycle', (s: PlanningScenario) => { s.tasks.push(work('a', 1, { dependsOn: ['b'] }), work('b', 1, { dependsOn: ['a'] })); }],
    ['bad holiday', (s: PlanningScenario) => { s.holidays = ['2026-13-01']; }],
    ['deadline precedes start', (s: PlanningScenario) => { s.deadlineDate = '2026-11-01'; }],
    ['duplicate availability', (s: PlanningScenario) => { s.workers[0].windowMinutesByDate = [{ date: '2026-11-02', minutes: 300 }, { date: '2026-11-02', minutes: 400 }]; }],
    ['oversized availability', (s: PlanningScenario) => { s.workers[0].windowMinutesByDate = [{ date: '2026-11-02', minutes: 600 }]; }],
    ['inverted availability', (s: PlanningScenario) => { s.workers[0].availableFrom = '2026-11-03'; s.workers[0].availableThrough = '2026-11-02'; }],
    ['oversized breaks', (s: PlanningScenario) => { s.window.breakMinutes = 481; }],
    ['invalid cost', (s: PlanningScenario) => { s.costs.laborRatePerPersonHour = NaN; }],
  ])('rejects %s before scheduling', (_name, mutate) => {
    const s = example(); mutate(s);
    expect(() => readPlanningScenario(s)).toThrow(PlanningScenarioValidationError);
    expect(calculatePlanningScenario(s)).toMatchObject({ status: 'invalid', days: [], finishDate: null, costs: null });
    expect(comparePlanningScenarios(s).status).toBe('invalid');
  });

  it('rejects unknown fields, coercion, and excessive task/worker/supply arrays', () => {
    expect(calculatePlanningScenario({ ...example(), hiddenPrice: 99 }).status).toBe('invalid');
    expect(calculatePlanningScenario({ ...example(), horizonDays: '20' }).status).toBe('invalid');
    const s = example();
    s.tasks = Array.from({ length: 65 }, (_, i) => work(`t-${i}`, 1));
    expect(calculatePlanningScenario(s).status).toBe('invalid');
    s.tasks = [work('a', 1)];
    s.workers = Array.from({ length: 33 }, (_, i) => ({ ...s.workers[0], id: `w-${i}` }));
    expect(calculatePlanningScenario(s).status).toBe('invalid');
    s.workers = [];
    s.supplies = Array.from({ length: 65 }, (_, i): PlanningSupply => ({ id: `s-${i}`, label: 's', releaseDate: null,
      leadDays: null, leadCalendar: 'calendar', confirmedReadyDate: null }));
    expect(calculatePlanningScenario(s).status).toBe('invalid');
  });

  it('accepts explicitly fractional person-hours without rounding away work', () => {
    const s = example(0.25);
    const result = calculatePlanningScenario(s);
    expect(result.status).toBe('feasible');
    expect(result.totalWorkPersonHours).toBe(0.25);
  });

  it('keeps daily person budgets, shared caps and workload invariant across bounded mixed DAGs', () => {
    for (let count = 1; count <= 12; count++) {
      const s = example(); s.horizonDays = 90; s.deadlineDate = null;
      s.maxWorkersPerDay = 2; s.window.setupMinutes = 15;
      s.tasks = Array.from({ length: count }, (_, index) => work(`t-${index}`, 5 + index / 4,
        { maxCrew: 1 + index % 2, dependsOn: index > 2 ? [`t-${index - 3}`] : [] }));
      const result = calculatePlanningScenario(s);
      expect(result.status).toBe('feasible');
      expect(result.totalWorkPersonHours).toBeCloseTo(s.tasks.reduce((sum, task) => sum + (task.kind === 'work' ? task.personHours! : 0), 0));
      for (const day of result.days) {
        expect(day.workerIds.length).toBeLessThanOrEqual(2);
        for (const id of day.workerIds) {
          const allocated = day.allocations.filter(a => a.workerId === id).reduce((sum, a) => sum + a.personHours, 0);
          expect(allocated).toBeLessThanOrEqual(5.75 + 1e-8);
        }
      }
      for (const task of s.tasks) {
        const row = result.tasks.find(t => t.id === task.id)!;
        for (const dependency of task.dependsOn)
          expect(row.startDate! > result.tasks.find(t => t.id === dependency)!.finishDate!).toBe(true);
      }
    }
  });

  it('handles maximum bounded task/day/worker dimensions without unbounded output', () => {
    const s = example(); s.horizonDays = PLANNING_LIMITS.horizonDays; s.deadlineDate = null;
    const template: PlanningWorker = s.workers[0];
    s.workers = Array.from({ length: PLANNING_LIMITS.workers }, (_, i) => ({ ...template, id: `w-${i}` }));
    s.tasks = Array.from({ length: PLANNING_LIMITS.tasks }, (_, i) => work(`t-${i}`, 1_000_000));
    const before = performance.now();
    const result = calculatePlanningScenario(s);
    const elapsed = performance.now() - before;
    expect(result.status).toBe('infeasible_within_horizon');
    expect(result.days.length).toBeLessThanOrEqual(366);
    expect(result.days.every(day => day.allocations.length <= PLANNING_LIMITS.workers)).toBe(true);
    expect(elapsed).toBeLessThan(2000); // Generous CI guard; not a claimed device latency SLA.
    // All three valid comparisons at the maximum bounds: 30 / 31 / 32 workers.
    // A baseline already at 32 cannot have a valid +1/+2 within the input bound.
    s.workers = s.workers.slice(0, 30);
    const compareBefore = performance.now();
    const comparison = comparePlanningScenarios(s);
    const compareElapsed = performance.now() - compareBefore;
    expect(comparison.alternatives).toHaveLength(3);
    expect(comparison.alternatives.every(row => row.result.status === 'infeasible_within_horizon')).toBe(true);
    expect(compareElapsed).toBeLessThan(2000);
    console.info(`planning benchmark: 64 tasks × 32 workers × 366 days: ${elapsed.toFixed(1)}ms; `
      + `baseline/+1/+2 (30/31/32 workers): ${compareElapsed.toFixed(1)}ms (200ms target, 2000ms CI guard)`);
  });
});
