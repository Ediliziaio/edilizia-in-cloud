import { parseHrCostAmount } from "@/lib/personale/laborCostPlan";
export const PAYROLL_TYPES = {
  tfr_iniziale: "TFR · saldo iniziale comunicato",
  tfr_quota: "TFR · quota maturata",
  tfr_rivalutazione: "TFR · rivalutazione",
  tfr_anticipo: "TFR · anticipo",
  tfr_liquidazione: "TFR · liquidazione",
  tfr_rettifica: "TFR · rettifica",
  welfare_budget: "Welfare · budget assegnato",
  welfare_utilizzo: "Welfare · utilizzo",
  welfare_rettifica: "Welfare · rettifica",
  tredicesima: "Rateo tredicesima",
  quattordicesima: "Rateo quattordicesima",
  cassa_edile: "Cassa Edile",
  fondo: "Fondo / previdenza",
  trasferta: "Trasferta",
  premio: "Premio",
  storno: "Storno documentato",
} as const;
export type PayrollType = keyof typeof PAYROLL_TYPES;
export interface PayrollPerson {
  id: string;
  nome: string;
  cognome: string;
  matricola?: string | null;
  employee_id: string | null;
  attivo: boolean;
  buono_pasto_abilitato: boolean;
  rimborso_km_abilitato: boolean;
}
export interface PayrollMovement {
  id: string;
  profilo_id: string;
  data: string;
  tipo: PayrollType;
  importo: number;
  fonte: string;
  riferimento: string;
  destinazione: string | null;
  storno_di: string | null;
  created_at: string;
}
export interface BenefitRow {
  id: string;
  profilo_id: string;
  giorno: string;
  importo: number;
  stato: string;
  tipo?: string;
  km?: number;
  tariffa_eur_km?: number;
  note?: string | null;
}
export interface BenefitConfig {
  company_id: string;
  buono_pasto_attivo: boolean;
  buono_pasto_modalita: string;
  buono_pasto_valore: number;
  buono_pasto_soglia_ore: number;
  km_tariffa_eur: number;
}
export interface PayrollDocument {
  id: string;
  titolo: string;
  hr_profilo_id: string | null;
  employee_id: string | null;
}
export interface PayrollLink {
  movimento_id: string;
  documento_id: string;
  motivo: string;
}
export interface PayrollBalance {
  profilo_id: string;
  tfr_registrato: number;
  welfare_anno_registrato: number;
}
export function overlappingMeals(rows: BenefitRow[]) {
  const days = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.stato === "annullato") continue;
    const key = `${r.profilo_id}:${r.giorno}`,
      types = days.get(key) || new Set<string>();
    types.add(r.tipo || "");
    days.set(key, types);
  }
  return [...days.values()].filter(
    (types) => types.has("fisso") && types.has("ricevuta"),
  ).length;
}
export function payrollPeriod(month: string) {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    Number(month.slice(0, 4)) < 1900 ||
    Number(month.slice(0, 4)) > 2199
  )
    throw Error("Seleziona un mese valido");
  const [y, m] = month.split("-").map(Number);
  return {
    start: `${month}-01`,
    end: `${month}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`,
  };
}
export function payrollAmount(value: string, label = "Importo") {
  const n = parseHrCostAmount(value);
  if (
    n == null ||
    n <= 0 ||
    n >= 10_000_000_000 ||
    Math.abs(n * 100 - Math.round(n * 100)) > 0.00001
  )
    throw Error(`${label}: usa un importo positivo con massimo due decimali`);
  return n;
}
export function assertPayrollDate(date: string, month: string) {
  const { start, end } = payrollPeriod(month);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < start || date > end)
    throw Error("La data deve appartenere al periodo selezionato");
}
export function optionalPayrollAmount(value: string, label: string) {
  if (!value.trim()) return null;
  const n = parseHrCostAmount(value);
  if (
    n == null ||
    n >= 10_000_000_000 ||
    Math.abs(n * 100 - Math.round(n * 100)) > 0.00001
  )
    throw Error(
      `${label}: inserisci un valore valido con massimo due decimali`,
    );
  return n;
}
export function signedPayrollAmount(
  type: PayrollType,
  value: string,
  reduce = false,
) {
  const n = payrollAmount(value);
  return ["tfr_anticipo", "tfr_liquidazione", "welfare_utilizzo"].includes(
    type,
  ) ||
    (["tfr_iniziale", "tfr_rettifica", "welfare_rettifica"].includes(type) &&
      reduce)
    ? -n
    : n;
}
export function payrollCsv(
  rows: PayrollMovement[],
  names: Map<string, string>,
) {
  const cell = (raw: unknown) => {
    const s = String(raw ?? "");
    return (
      '"' + (/^[\s]*[=+@-]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"'
    );
  };
  return (
    "\uFEFF" +
    [
      [
        "Data",
        "Persona",
        "Voce",
        "Importo registrato EUR",
        "Fonte dichiarata",
        "Riferimento",
        "Destinazione",
      ],
      ...rows.map((r) => [
        r.data,
        names.get(r.profilo_id) || r.profilo_id,
        PAYROLL_TYPES[r.tipo],
        Number(r.importo).toFixed(2),
        r.fonte,
        r.riferimento,
        r.destinazione,
      ]),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}
