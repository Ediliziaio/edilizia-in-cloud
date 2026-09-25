/**
 * Read-only preview of the EXISTING report approval contract.
 * Not a payroll engine or a replacement for the server cost ledger.
 */
export interface LaborEmployee {
  id: string; user_id: string | null; first_name?: string | null; last_name?: string | null;
  costo_orario?: number | string | null; gross_salary?: number | string | null;
  inps_rate?: number | string | null; monthly_hours?: number | string | null;
}
export interface LaborReport {
  id: string; company_id: string; order_id: string; user_id: string; data_lavoro: string;
  stato: string | null; approvato?: boolean | null; updated_at: string;
  ore_lavorate: number | string | null; ore_straordinario?: number | string | null;
  presenze?: unknown;
}
type Numeric = number | string | null | undefined;
function numeric(value: Numeric): number | null {
  if (value == null || (typeof value !== "number" && typeof value !== "string")) return null;
  if (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
/** Exact decimal ratios, also when JS serializes a small value as 1e-7. */
function decimal(value: number): [bigint, bigint] {
  const [base, exponent = "0"] = String(value).toLowerCase().split("e");
  const [whole, fraction = ""] = base.split(".");
  const power = fraction.length - Number(exponent);
  const integer = BigInt(whole + fraction);
  return power >= 0 ? [integer, 10n ** BigInt(power)] : [integer * 10n ** BigInt(-power), 1n];
}
function roundedRatio(numerator: bigint, denominator: bigint): number {
  // Positive monetary amounts: PostgreSQL numeric ROUND(...,2), not binary ties.
  const cents = (numerator * 100n * 2n + denominator) / (2n * denominator);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Importo fuori intervallo: verifica ore e tariffa");
  return Number(cents) / 100;
}
export function laborLineCost(hours: number, rate: number): number {
  if (!Number.isFinite(hours) || !Number.isFinite(rate) || hours < 0 || rate < 0) throw new Error("Ore o tariffa non valide");
  const [h, hd] = decimal(hours), [r, rd] = decimal(rate);
  return roundedRatio(h * r, hd * rd);
}
export interface HourlyCostReview { amount: number | null; source: "manuale" | "calcolato" | "mancante"; note: string }
export function reviewHourlyCost(e: LaborEmployee): HourlyCostReview {
  const manual = numeric(e.costo_orario);
  if (manual != null && manual > 0) return { amount: manual, source: "manuale" as const, note: "Tariffa della scheda dipendente" };
  if (e.costo_orario != null && (manual == null || manual < 0)) return { amount: null, source: "mancante" as const, note: "Tariffa non valida" };
  const gross = numeric(e.gross_salary), hours = numeric(e.monthly_hours);
  const inps = e.inps_rate == null ? 28 : numeric(e.inps_rate);
  if (gross == null || gross <= 0 || hours == null || hours <= 0 || inps == null || inps < 0) {
    return { amount: null, source: "mancante" as const, note: "Servono tariffa oppure lordo, ore mensili e aliquota validi" };
  }
  const [g, gd] = decimal(gross), [i, id] = decimal(inps), [h, hd] = decimal(hours);
  return {
    amount: roundedRatio(g * (100n * id + i) * hd, gd * 100n * id * h),
    source: "calcolato" as const,
    note: e.inps_rate == null ? "Lordo e aliquota INPS / ore mensili · aliquota predefinita 28%" : "Lordo e aliquota INPS / ore mensili",
  };
}
interface Presence { employee_id?: string; subappaltatore_id?: string; nome?: string; ore?: Numeric }
export interface LaborParticipant {
  key: string; name: string; hours: number | null; kind: "employee" | "external" | "unresolved";
  employee?: LaborEmployee;
}
export function reportParticipants(report: LaborReport, employees: LaborEmployee[]): LaborParticipant[] {
  const employeeMap = new Map(employees.map(e => [e.id, e]));
  const presences = Array.isArray(report.presenze) ? report.presenze : [];
  if (presences.length) return presences.map((raw, index) => {
    const p = raw && typeof raw === "object" ? raw as Presence : {};
    const employee = p.employee_id ? employeeMap.get(p.employee_id) : undefined;
    const name = employee ? [employee.first_name, employee.last_name].filter(Boolean).join(" ") : p.nome;
    return {
      key: p.employee_id ? `employee:${p.employee_id}` : p.subappaltatore_id ? `external:${p.subappaltatore_id}` : `unresolved:${report.id}:${index}`,
      name: name || "Persona da identificare", hours: numeric(p.ore),
      kind: employee ? "employee" : p.subappaltatore_id && !p.employee_id ? "external" : "unresolved",
      employee,
    };
  });
  const matches = employees.filter(e => e.user_id === report.user_id);
  const employee = matches.length === 1 ? matches[0] : undefined;
  const ordinary = numeric(report.ore_lavorate), extra = numeric(report.ore_straordinario ?? 0);
  return [{
    key: employee ? `employee:${employee.id}` : `user:${report.user_id}`,
    name: employee ? [employee.first_name, employee.last_name].filter(Boolean).join(" ") || "Dipendente" : "Autore senza scheda dipendente verificata",
    hours: ordinary == null || extra == null || ordinary < 0 || extra < 0 ? null : ordinary + extra,
    kind: employee ? "employee" : "unresolved", employee,
  }];
}
export function reportStatus(r: LaborReport) { return r.stato ?? (r.approvato ? "approvato" : "inviato"); }
export function summarizeLaborBudget(rows: {cost_preventivo: Numeric; total_cost: Numeric}[]) {
  const sum = (field: "cost_preventivo" | "total_cost") => {
    const values = rows.map(r => numeric(r[field]));
    if (values.some(v => v == null || v < 0)) return null;
    return values.reduce<number>((total, value) => total + Math.round(value! * 100), 0) / 100;
  };
  return { planned: rows.length ? sum("cost_preventivo") : null, registered: sum("total_cost") };
}
export function reviewLaborReport(target: LaborReport, dayReports: LaborReport[], employees: LaborEmployee[], showCosts: boolean) {
  const participants = reportParticipants(target, employees);
  const blockers: string[] = [], warnings: string[] = [];
  if (!["inviato", "rifiutato"].includes(reportStatus(target))) blockers.push("Questo rapportino non è più da approvare.");
  const seen = new Set<string>();
  for (const p of participants) {
    if (p.hours == null || p.hours < 0 || p.hours > 24) blockers.push(`Ore non valide: ${p.name}.`);
    if (seen.has(p.key)) blockers.push(`Presenza ripetuta nello stesso rapportino: ${p.name}.`);
    seen.add(p.key);
    if (p.kind === "unresolved" && p.hours !== 0) warnings.push(`${p.name}: identità/costo da verificare; non viene inventata una tariffa.`);
  }
  const otherReports = dayReports.filter(r => r.id !== target.id && r.company_id === target.company_id &&
    r.data_lavoro === target.data_lavoro && ["inviato", "approvato"].includes(reportStatus(r)));
  const overlaps: { reportId: string; participant: string; hours: number; status: string }[] = [];
  const rows = participants.map(p => {
    let otherHours = 0;
    for (const report of otherReports) {
      for (const other of reportParticipants(report, employees)) {
        if (other.key !== p.key || !other.hours || !p.hours) continue;
        otherHours += other.hours;
        if (report.order_id === target.order_id) overlaps.push({ reportId: report.id, participant: p.name, hours: other.hours, status: reportStatus(report) });
      }
    }
    if ((p.hours ?? 0) + otherHours > 24) blockers.push(`${p.name}: oltre 24 ore dichiarate nella giornata, considerando gli altri rapportini.`);
    const rate = showCosts && p.employee ? reviewHourlyCost(p.employee) : null;
    const cost = !showCosts ? null : p.hours === 0 ? 0 :
      p.hours != null && p.hours > 0 && rate?.amount != null ? laborLineCost(p.hours, rate.amount) : null;
    if (showCosts && p.kind === "employee" && (p.hours ?? 0) > 0 && rate?.amount == null) {
      warnings.push(`${p.name}: costo orario non determinabile. Completa la scheda: senza tariffa o dati per il calcolo, le ore possono essere registrate a costo zero.`);
    }
    return { ...p, rate, cost, otherHours };
  });
  if (overlaps.length) warnings.push("La stessa persona compare in altri rapportini di questo cantiere e giorno: verifica che le ore siano distinte.");
  const costRows = rows.filter(r => r.kind !== "external");
  const complete = showCosts && costRows.every(r => r.cost != null);
  const knownCost = rows.reduce((sum, r) => sum + Math.round((r.cost ?? 0) * 100), 0) / 100;
  return { rows, overlaps, warnings, blockers, complete, knownCost };
}
