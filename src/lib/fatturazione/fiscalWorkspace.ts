export const FISCAL_SECTIONS = [
  "iva",
  "contabilita",
  "ritenute",
  "archivio",
] as const;
export type FiscalSection = (typeof FISCAL_SECTIONS)[number];
export function fiscalSection(params: URLSearchParams): FiscalSection {
  const value = params.get("sezione");
  return FISCAL_SECTIONS.includes(value as FiscalSection)
    ? (value as FiscalSection)
    : "iva";
}
export function fiscalPeriod(params: URLSearchParams, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value),
    month = Number(parts.find((p) => p.type === "month")!.value);
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const raw = params.get(key);
    return raw && /^\d+$/.test(raw) && Number(raw) >= min && Number(raw) <= max
      ? Number(raw)
      : fallback;
  };
  const anno = integer("anno", year, 2000, 2100),
    mese = integer("mese", month, 1, 12);
  const trimestre = integer("trimestre", Math.ceil(mese / 3), 1, 4);
  const tipo =
    params.get("periodo") === "trimestrale"
      ? ("trimestrale" as const)
      : ("mensile" as const);
  const firstMonth = tipo === "mensile" ? mese : (trimestre - 1) * 3 + 1;
  const lastMonth = tipo === "mensile" ? mese : trimestre * 3;
  return {
    anno,
    mese,
    trimestre,
    tipo,
    dal: `${anno}-${String(firstMonth).padStart(2, "0")}-01`,
    al: new Date(Date.UTC(anno, lastMonth, 0)).toISOString().slice(0, 10),
  };
}
export function fiscalHref(section: FiscalSection, search = "") {
  const params = new URLSearchParams(search);
  params.set("tab", "fiscalita");
  params.set("sezione", section);
  return `/azienda/documenti?${params}`;
}
// Keep both views on the same period while retaining unrelated URL context.
export function updateFiscalParams(
  params: URLSearchParams,
  changes: Record<string, string>,
  now = new Date(),
) {
  const next = new URLSearchParams(params);
  Object.entries(changes).forEach(([key, value]) => next.set(key, value));
  if ("mese" in changes || "trimestre" in changes || "periodo" in changes) {
    const before = fiscalPeriod(params, now);
    const after = fiscalPeriod(next, now);
    if (
      "mese" in changes ||
      (changes.periodo === "trimestrale" && !("trimestre" in changes))
    ) {
      next.set("mese", String(after.mese));
      next.set("trimestre", String(Math.ceil(after.mese / 3)));
    } else {
      const quarter =
        "trimestre" in changes ? after.trimestre : before.trimestre;
      const month =
        Math.ceil(after.mese / 3) === quarter
          ? after.mese
          : (quarter - 1) * 3 + 1;
      next.set("mese", String(month));
      next.set("trimestre", String(quarter));
    }
  }
  return next;
}

export function fiscalAmountTotal(values: unknown[]): number | null {
  let total = 0;
  for (const value of values) {
    const cents = fiscalCents(value);
    if (cents === null || !Number.isSafeInteger(total + cents)) return null;
    total += cents;
  }
  return total / 100;
}

export function partitionFiscalMonths<T extends { mese: number | null }>(
  entries: T[],
  period: { tipo: "mensile" | "trimestrale"; mese: number; trimestre: number },
) {
  return {
    selected: entries.filter(
      (entry) =>
        Number.isInteger(entry.mese) &&
        entry.mese! >= 1 &&
        entry.mese! <= 12 &&
        (period.tipo === "mensile"
          ? entry.mese === period.mese
          : Math.ceil(entry.mese! / 3) === period.trimestre),
    ),
    unassigned: entries.filter(
      (entry) =>
        !Number.isInteger(entry.mese) || entry.mese! < 1 || entry.mese! > 12,
    ),
  };
}

export function fiscalDocumentIssues(rows: FiscalRow[]) {
  const groups = new Map<
    string,
    {
      id: string;
      documentId: string;
      number: string;
      side: FiscalRow["side"];
      issues: string[];
    }
  >();
  rows
    .filter((row) => row.issues.length)
    .forEach((row) => {
      // RC projections still refer to the same received invoice, not a new document.
      const source = row.synthetic ? "acquisti" : row.side;
      const id = `${source}:${row.documentId}`;
      const previous = groups.get(id);
      groups.set(id, {
        id,
        documentId: row.documentId,
        number: row.number,
        side: source,
        issues: [...new Set([...(previous?.issues ?? []), ...row.issues])],
      });
    });
  return [...groups.values()];
}
export function fiscalNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const normalized = raw.includes(",")
    ? /^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(raw)
      ? raw.replace(/\./g, "").replace(",", ".")
      : null
    : raw;
  return normalized !== null &&
    /^-?\d+(?:\.\d+)?$/.test(normalized) &&
    Number.isFinite(Number(normalized))
    ? Number(normalized)
    : null;
}
export function fiscalCents(value: unknown): number | null {
  const n = fiscalNumber(value);
  if (n === null || Math.abs(n) > 1e12) return null;
  if (Math.abs(n) < 0.005) return 0;
  const [whole, fraction = ""] = String(Math.abs(n)).split(".");
  const digits = fraction.padEnd(3, "0");
  const cents =
    BigInt(whole) * 100n +
    BigInt(digits.slice(0, 2)) +
    (digits[2] >= "5" ? 1n : 0n);
  return Number(cents) * Math.sign(n);
}
export interface FiscalBucket {
  base: number | null;
  tax: number | null;
  rate: string | null;
  nature: string;
  exigibility: string;
  issues: string[];
}
export function fiscalBucket(raw: unknown, exigibility = "I"): FiscalBucket {
  const r =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const a = fiscalNumber(r.aliquota),
    b = fiscalNumber(r.aliquota_iva),
    issues: string[] = [];
  let rate = a ?? b;
  if (a !== null && b !== null && a !== b) {
    rate = null;
    issues.push("Aliquote sorgente in conflitto");
  }
  if (rate === null || rate < 0 || rate > 100) {
    rate = null;
    issues.push("Aliquota non verificata");
  }
  const base = fiscalCents(r.imponibile),
    tax = fiscalCents(r.imposta);
  if (base === null || tax === null)
    issues.push("Importi incompleti o non validi");
  if (rate === 0 && tax !== null && tax !== 0)
    issues.push(
      "Aliquota zero con imposta valorizzata: verificare il documento originale",
    );
  return {
    base,
    tax,
    rate: rate === null ? null : String(rate),
    nature: typeof r.natura === "string" ? r.natura : "",
    exigibility:
      typeof r.esigibilita === "string" ? r.esigibilita : exigibility,
    issues,
  };
}
export interface FiscalDocument {
  id: string;
  tipo?: string;
  tipo_documento?: string;
  numero?: string;
  numero_fattura?: string;
  data_emissione?: string;
  data_fattura?: string;
  data_detrazione?: string;
  data_ricezione_sdi?: string | null;
  cliente_snapshot?: {
    ragione_sociale?: string;
    nome?: string;
    cognome?: string;
  } | null;
  cedente_ragione_sociale?: string;
  imponibile_totale: unknown;
  iva_totale: unknown;
  totale_documento: unknown;
  riepilogo_iva: unknown;
  esigibilita_iva?: string;
  sdi_stato?: string | null;
  aliquota_reverse_charge?: unknown;
}
export interface FiscalRow extends FiscalBucket {
  id: string;
  documentId: string;
  date: string;
  periodDate: string;
  received: string | null;
  number: string;
  counterparty: string;
  side: "vendite" | "acquisti";
  synthetic: boolean;
}
const integrations = [
  "reverse_charge_interno",
  "integrazione_servizi_estero",
  "integrazione_beni_ue",
  "integrazione_beni_extra_ue",
];
export const SALES_TYPES = [
  "fattura",
  "fattura_pa",
  "nota_credito",
  "nota_debito",
  "autofattura",
  "fattura_riepilogativa",
  "parcella",
  "fattura_accompagnatoria",
  ...integrations,
];
export function fiscalRows(
  sales: FiscalDocument[],
  purchases: FiscalDocument[],
) {
  const out: FiscalRow[] = [];
  const expand = (doc: FiscalDocument, side: FiscalRow["side"]) => {
    const credit =
      side === "vendite"
        ? doc.tipo === "nota_credito"
        : /^(TD04)$|CREDIT/i.test(doc.tipo_documento || "");
    const sign = (n: number | null) =>
      n === null ? null : credit ? -Math.abs(n) : n;
    const name =
      side === "vendite"
        ? doc.cliente_snapshot?.ragione_sociale ||
          [doc.cliente_snapshot?.nome, doc.cliente_snapshot?.cognome]
            .filter(Boolean)
            .join(" ")
        : doc.cedente_ragione_sociale;
    const date =
      (side === "vendite" ? doc.data_emissione : doc.data_fattura) || "";
    const common = {
      documentId: doc.id,
      date,
      periodDate: side === "acquisti" ? doc.data_detrazione || date : date,
      received: doc.data_ricezione_sdi || null,
      number: doc.numero || doc.numero_fattura || "Numero non disponibile",
      counterparty: name || "Controparte da verificare",
      side,
      synthetic: false,
    };
    const raw = Array.isArray(doc.riepilogo_iva) ? doc.riepilogo_iva : [];
    const buckets: FiscalBucket[] = raw.length
      ? raw.map((r) => fiscalBucket(r, doc.esigibilita_iva))
      : [
          {
            base: fiscalCents(doc.imponibile_totale),
            tax: fiscalCents(doc.iva_totale),
            rate: null,
            nature: "",
            exigibility: doc.esigibilita_iva || "I",
            issues: [
              "Riepilogo IVA assente: totali documento, aliquota non verificata",
            ],
          },
        ];
    buckets.forEach((b, i) => {
      const issues = [...b.issues];
      if (side === "acquisti" && !common.received)
        issues.push("Ricezione SDI non documentata: periodo da verificare");
      if (
        side === "vendite" &&
        doc.sdi_stato &&
        !["consegnata", "accettata", "mancata_consegna"].includes(doc.sdi_stato)
      )
        issues.push(`Esito SDI da verificare: ${doc.sdi_stato}`);
      if (b.exigibility === "D")
        issues.push("IVA differita/per cassa: incasso da verificare");
      const row: FiscalRow = {
        ...common,
        ...b,
        issues,
        base: sign(b.base),
        tax: sign(b.tax),
        id: `${side}:${doc.id}:${i}`,
      };
      out.push(row);
      if (side === "acquisti" && b.nature.toUpperCase().startsWith("N6")) {
        const rate = fiscalNumber(doc.aliquota_reverse_charge);
        if (rate === null || rate <= 0 || rate > 100 || b.base === null) {
          issues.push(
            "Reverse charge: aliquota di integrazione non confermata",
          );
          return;
        }
        // A separate, explicitly provisional projection. Never writes an integration invoice.
        const numerator =
          BigInt(Math.abs(b.base)) * BigInt(Math.round(rate * 10000));
        const tax = sign(Number((numerator + 500000n) / 1000000n));
        const projection = {
          ...row,
          rate: String(rate),
          tax,
          synthetic: true,
          nature: `${b.nature} · proiezione RC`,
          issues: [
            ...issues,
            "Verificare integrazioni già registrate: proiezione esclusa dal prospetto documentale",
          ],
        };
        out.push(
          { ...projection, side: "vendite", id: `rc-v:${doc.id}:${i}` },
          { ...projection, base: 0, id: `rc-a:${doc.id}:${i}` },
        );
      }
    });
  };
  sales.forEach((d) => expand(d, "vendite"));
  purchases.forEach((d) => expand(d, "acquisti"));
  return out;
}
export function fiscalTotals(rows: FiscalRow[]) {
  const documents = rows.filter((r) => !r.synthetic);
  const known = documents.every((r) => r.base !== null && r.tax !== null);
  return {
    base: known ? documents.reduce((s, r) => s + r.base!, 0) : null,
    tax: known ? documents.reduce((s, r) => s + r.tax!, 0) : null,
    issues: rows.flatMap((r) => r.issues),
    count: new Set(documents.map((r) => r.documentId)).size,
  };
}
