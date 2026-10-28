import { fiscalTotals, fiscalNumber, type FiscalRow } from "./fiscalWorkspace";
import { formatCurrency } from "@/lib/formatters";

export function fiscalToday(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function fiscalDate(value: unknown, missing = "Da verificare") {
  if (typeof value !== "string" || !value.trim()) return missing;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      return missing;
    return new Intl.DateTimeFormat("it-IT", { timeZone: "UTC" }).format(date);
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return missing;
  if (fiscalDate(value.slice(0, 10)) === "Da verificare") return missing;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome" }).format(date)
    : missing;
}
export function fiscalDue(
  value: unknown,
  today = fiscalToday(),
): "scaduta" | "prossima" | "futura" | "mancante" {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    fiscalDate(value) === "Da verificare"
  )
    return "mancante";
  if (value < today) return "scaduta";
  const days =
    (Date.parse(`${value}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) /
    86400000;
  return days <= 30 ? "prossima" : "futura";
}
export function fiscalMatch(query: string, ...values: unknown[]) {
  const clean = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("it")
      .trim();
  return clean(values.filter((v) => typeof v === "string").join(" ")).includes(
    clean(query),
  );
}
export function fiscalVatGroups(rows: FiscalRow[]) {
  const groups = new Map<string, FiscalRow[]>();
  rows
    .filter((row) => !row.synthetic)
    .forEach((row) => {
      const key = JSON.stringify([
        row.side,
        row.rate,
        row.nature,
        row.exigibility,
      ]);
      const items = groups.get(key);
      if (items) items.push(row);
      else groups.set(key, [row]);
    });
  return [...groups.entries()].map(([key, items]) => ({
    key,
    side: items[0].side,
    rate: items[0].rate,
    nature: items[0].nature,
    exigibility: items[0].exigibility,
    ...fiscalTotals(items),
  }));
}

const names: Record<string, string> = {
  vendite: "Documenti di vendita",
  acquisti: "Documenti di acquisto",
  split_payment: "IVA split payment",
  esigibilita_differita: "IVA a esigibilità differita",
  escluso: "Esclusioni",
  nota: "Nota",
  aliquota: "Aliquota",
  imponibile: "Imponibile",
  imposta: "IVA",
  lato: "Registro",
  senza_data_ricezione: "Senza data di ricezione",
  integrazioni: "Integrazioni",
  acquisti_senza_data_ricezione: "Acquisti senza data di ricezione",
};
/** Preserve unknown fields without showing raw JSON or treating a missing value as zero. */
export function fiscalReadable(
  value: unknown,
  prefix = "",
  depth = 0,
  field = "",
): { label: string; value: string }[] {
  if (value === null || value === undefined)
    return [{ label: prefix || "Dato", value: "Non disponibile" }];
  if (depth >= 6)
    return [
      {
        label: prefix,
        value: "Dettaglio complesso da verificare sul documento sorgente",
      },
    ];
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length)
      return [
        { label: prefix || "Dettaglio", value: "Nessuna voce restituita" },
      ];
    return entries.flatMap(([key, item]) =>
      fiscalReadable(
        item,
        [
          prefix,
          Array.isArray(value)
            ? `Voce ${Number(key) + 1}`
            : (names[key] ?? key.replace(/_/g, " ")),
        ]
          .filter(Boolean)
          .join(" · "),
        depth + 1,
        key,
      ),
    );
  }
  const number = fiscalNumber(value);
  const moneyFields = [
    "imposta",
    "imponibile",
    "split_payment",
    "esigibilita_differita",
    "iva_vendite",
    "iva_acquisti",
    "saldo",
  ];
  const formatted =
    number !== null && moneyFields.includes(field)
      ? formatCurrency(number)
      : number !== null && field === "aliquota"
        ? `${number.toLocaleString("it-IT")}%`
        : String(value);
  return [
    {
      label: prefix || "Dato",
      value: typeof value === "boolean" ? (value ? "Sì" : "No") : formatted,
    },
  ];
}
