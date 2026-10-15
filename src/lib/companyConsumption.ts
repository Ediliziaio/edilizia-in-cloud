import { z } from "zod";
import { companyEconomics, type EconomicsReport } from "./companyEconomics";

export interface DatabaseFootprint {
  measured_at: string;
  database_bytes: number;
  eligible_tables: number;
  eligible_bytes: number;
  method: "largest_company_tables_v1";
  query_load_available: false;
  tables: {
    name: string;
    total_bytes: number;
    companies: { company_id: string | null; records: number }[];
  }[];
}
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const footprintSchema = z
  .object({
    measured_at: z
      .string()
      .refine((value) => Number.isFinite(Date.parse(value))),
    database_bytes: count,
    eligible_tables: count,
    eligible_bytes: count,
    method: z.literal("largest_company_tables_v1"),
    query_load_available: z.literal(false),
    tables: z
      .array(
        z.object({
          name: z.string(),
          total_bytes: count,
          companies: z
            .array(
              z.object({ company_id: z.string().nullable(), records: count }),
            )
            .refine(
              (rows) =>
                new Set(rows.map((r) => r.company_id)).size === rows.length,
            ),
        }),
      )
      .max(12),
  })
  .refine(
    (value) =>
      new Set(value.tables.map((t) => t.name)).size === value.tables.length &&
      value.tables.length <= value.eligible_tables,
  );
export function parseDatabaseFootprint(value: unknown): DatabaseFootprint {
  const result = footprintSchema.safeParse(value);
  if (!result.success)
    throw new Error("Rilevazione database incompleta o non valida.");
  // The project disables strictNullChecks; nullable fields are validated above.
  return result.data as DatabaseFootprint;
}
export type ConsumptionMetric = "cost" | "files" | "database" | "records";
export const consumptionShareLabel = (value: number | null) =>
  value === null
    ? "Non disponibile"
    : value > 0 && value < 0.1
      ? "<0,1%"
      : `${value.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
export const bytesLabel = (value: number | null | undefined) => {
  if (value == null) return "Non disponibile";
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(4, Math.max(0, Math.floor(Math.log10(value) / 3)));
  return `${(value / 1000 ** i).toLocaleString("it-IT", { maximumFractionDigits: 2 })} ${units[i]}`;
};
export function consumptionRanking(
  report: EconomicsReport,
  footprint: DatabaseFootprint | null | undefined,
  metric: ConsumptionMetric,
) {
  const measuredTables = footprint?.tables ?? [];
  const rows = report.companies
    .map((company) => {
      const economics = companyEconomics(report, company.id)!;
      const tables = measuredTables.map((table) => {
        const records =
          table.companies.find((c) => c.company_id === company.id)?.records ??
          0;
        const total = table.companies.reduce((s, c) => s + c.records, 0);
        return {
          name: table.name,
          records,
          estimatedBytes: total > 0 ? (table.total_bytes * records) / total : 0,
        };
      });
      const records =
        footprint && measuredTables.length
          ? tables.reduce((s, t) => s + t.records, 0)
          : null;
      const databaseBytes =
        records === null
          ? null
          : tables.reduce((s, t) => s + t.estimatedBytes, 0);
      const value =
        metric === "cost"
          ? economics.direct === 0 && economics.missing > 0
            ? null
            : economics.direct
          : metric === "files"
            ? (economics.storage?.bytes ?? null)
            : metric === "records"
              ? records
              : databaseBytes;
      return { ...economics, records, databaseBytes, tables, value };
    })
    .sort(
      (a, b) =>
        (b.value ?? -Infinity) - (a.value ?? -Infinity) ||
        a.company.name.localeCompare(b.company.name, "it"),
    );
  const total = rows.reduce((s, row) => s + (row.value ?? 0), 0);
  // Rank before filtering; missing values never become zero or receive a rank.
  let previous: number | null = null,
    rank = 0;
  return rows.map((row, i) => {
    if (row.value !== null && row.value !== previous) rank = i + 1;
    previous = row.value;
    return {
      ...row,
      rank: row.value === null ? null : rank,
      share: row.value !== null && total > 0 ? (row.value / total) * 100 : null,
    };
  });
}
export function footprintCoverage(
  footprint: DatabaseFootprint,
  companyIds: string[],
) {
  const known = new Set(companyIds);
  const coveredBytes = footprint.tables.reduce((s, t) => s + t.total_bytes, 0);
  let unassignedRecords = 0,
    unassignedBytes = 0;
  for (const table of footprint.tables) {
    const total = table.companies.reduce((s, c) => s + c.records, 0);
    const outside = table.companies
      .filter((c) => !c.company_id || !known.has(c.company_id))
      .reduce((s, c) => s + c.records, 0);
    unassignedRecords += outside;
    // An empty relation's allocated pages cannot be assigned to any company.
    unassignedBytes += total
      ? (table.total_bytes * outside) / total
      : table.total_bytes;
  }
  return {
    coveredBytes,
    unassignedRecords,
    unassignedBytes,
    databasePercent: footprint.database_bytes
      ? (coveredBytes / footprint.database_bytes) * 100
      : null,
  };
}
export function consumptionCsv(
  report: EconomicsReport,
  footprint: DatabaseFootprint | null | undefined,
  metric: ConsumptionMetric,
) {
  const esc = (v: unknown) =>
    `"${String(v ?? "Non disponibile")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""')}"`;
  const rows = consumptionRanking(report, footprint, metric).map((r) => [
    r.rank,
    r.company.name,
    r.direct,
    r.estimated,
    r.missing,
    r.shared,
    r.storage?.bytes,
    r.records,
    r.databaseBytes,
    "Non disponibile",
    report.measured_at,
    report.storage_measured_at,
    footprint?.measured_at,
    "Parziale; costi registrati possono includere stime; quota comune e bytes DB stimati; record limitati alle tabelle rilevate; nessuna misura CPU per azienda",
  ]);
  return (
    "\uFEFF" +
    [
      [
        "Posizione",
        "Azienda",
        "Costo registri EUR incluse stime",
        "Operazioni con costo stimato",
        "Costi non misurati",
        "Quota comune stimata EUR",
        "File bytes misurati",
        "Record nelle tabelle rilevate",
        "Database bytes STIMATI",
        "Tempo SQL per azienda",
        "Data costi",
        "Data file",
        "Data database",
        "Qualità",
      ],
      ...rows,
    ]
      .map((r) => r.map(esc).join(";"))
      .join("\r\n")
  );
}
