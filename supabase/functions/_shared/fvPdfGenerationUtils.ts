export interface FvPdfQueryResultLike {
  error?: { message?: string | null } | null;
}

export interface FvPdfVisibleService {
  tipo: string;
  descrizione: string;
  quantita: number;
  prezzo_vendita: number;
  note_operative: string | null;
}

export function assertFvPdfQueryOk(label: string, result: FvPdfQueryResultLike): void {
  if (!result.error) return;
  const message = result.error.message || "errore sconosciuto";
  throw new Error(`Errore ${label}: ${message}`);
}

export function safeFvPdfStorageSegment(value: unknown, fallback = "preventivo-fv"): string {
  const raw = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  const safe = raw
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
  return safe || fallback;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function mapFvManodoperaRowsToPdfServices(
  rows: Array<Record<string, unknown>>,
): FvPdfVisibleService[] {
  return rows
    .map((row) => {
      const descrizione = textValue(row.descrizione);
      const ore = numberValue(row.ore);
      const tariffa = numberValue(row.tariffa_oraria_vendita);
      const prezzo = Math.round(ore * tariffa * 100) / 100;
      return {
        tipo: "installazione",
        descrizione,
        quantita: 1,
        prezzo_vendita: prezzo,
        note_operative: ore > 0 ? `Ore previste: ${ore}` : null,
      };
    })
    .filter((row) => row.descrizione.length > 0);
}
