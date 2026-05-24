import { format } from "date-fns";
import { it } from "date-fns/locale";

type QueryFetchStatus = "fetching" | "paused" | "idle";

const LEGACY_QUOTE_STATUS_BY_ARCHIVE_STATUS: Record<string, string[]> = {
  tutti: ["inviata", "accettata", "rifiutata"],
  pending: ["inviata"],
  expired: ["inviata"],
  signed: ["accettata"],
  refused: ["rifiutata"],
  otp_verified: [],
  cancelled: [],
};

export interface FirmaRequestSearchable {
  signer_name?: unknown;
  signer_email?: unknown;
  token?: unknown;
  documento_label?: unknown;
  documento_subtitle?: unknown;
}

const SEARCH_FIELDS: Array<keyof FirmaRequestSearchable> = [
  "signer_name",
  "signer_email",
  "token",
  "documento_label",
  "documento_subtitle",
];

export function normalizeFirmaText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

export function filterSignatureRequests<T extends FirmaRequestSearchable>(
  requests: T[],
  search: string,
): T[] {
  const needle = normalizeFirmaText(search);
  if (!needle) return requests;

  return requests.filter((request) =>
    SEARCH_FIELDS.some((field) => normalizeFirmaText(request[field]).includes(needle)),
  );
}

export function toValidFirmaDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatFirmaDate(value: unknown, pattern = "dd MMM yyyy"): string {
  const date = toValidFirmaDate(value);
  if (!date) return "—";
  try {
    return format(date, pattern, { locale: it });
  } catch {
    return "—";
  }
}

export function isFirmaExpired(
  expiresAt: unknown,
  status: string,
  now: Date = new Date(),
): boolean {
  if (status === "signed") return false;
  const expiryDate = toValidFirmaDate(expiresAt);
  const comparisonDate = toValidFirmaDate(now) ?? new Date();
  return Boolean(expiryDate && expiryDate.getTime() < comparisonDate.getTime());
}

export function sortSignatureRequestsByCreatedAt<T extends { created_at?: unknown }>(
  requests: T[],
): T[] {
  return [...requests].sort((a, b) => {
    const aTime = toValidFirmaDate(a.created_at)?.getTime() ?? -Infinity;
    const bTime = toValidFirmaDate(b.created_at)?.getTime() ?? -Infinity;
    return bTime - aTime;
  });
}

export function shouldShowFirmaRequestsLoader({
  hasCompanyId,
  isLoading,
  fetchStatus,
}: {
  hasCompanyId: boolean;
  isLoading: boolean;
  fetchStatus: QueryFetchStatus;
}): boolean {
  return hasCompanyId && isLoading && fetchStatus === "fetching";
}

export function getFirmaRequestErrorMessage(error: unknown): string {
  const defaultMessage = "Controlla connessione e permessi, poi riprova.";
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (!message) return defaultMessage;

  const normalized = message.toLowerCase();
  if (normalized.includes("timeout") || normalized.includes("aborted") || normalized.includes("abort")) {
    return "Il caricamento delle richieste firma ha impiegato troppo tempo. Riprova il caricamento senza lasciare la pagina.";
  }

  return message;
}

export function getLegacyQuoteStatusFilter(statusFilter: unknown): string[] {
  if (typeof statusFilter !== "string") return [];
  return LEGACY_QUOTE_STATUS_BY_ARCHIVE_STATUS[statusFilter] ?? [];
}
