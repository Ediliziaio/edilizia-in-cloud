import { format, formatDistanceToNowStrict } from "date-fns";
import { it } from "date-fns/locale";

export type RenderStatusKey = "pending" | "processing" | "completed" | "failed";

export const STALE_RENDER_MINUTES = 30;

export function normalizeRenderStatus(value: string | null | undefined): RenderStatusKey {
  if (value === "completed" || value === "processing" || value === "pending" || value === "failed") return value;
  if (value === "completato" || value === "succeeded" || value === "success") return "completed";
  if (value === "errore" || value === "error") return "failed";
  if (value === "analyzing" || value === "analysis_done" || value === "queued" || value === "running") return "processing";
  return "pending";
}

export function parseRenderDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRenderDate(value: string | null | undefined, pattern = "d MMM yyyy, HH:mm") {
  const date = parseRenderDate(value);
  return date ? format(date, pattern, { locale: it }) : "Data non disponibile";
}

export function formatRenderAge(value: string | null | undefined) {
  const date = parseRenderDate(value);
  return date ? formatDistanceToNowStrict(date, { addSuffix: true, locale: it }) : "tempo non disponibile";
}

export function isRenderStale(status: string | null | undefined, value: string | null | undefined, staleMinutes = STALE_RENDER_MINUTES) {
  const normalized = normalizeRenderStatus(status);
  if (normalized !== "processing" && normalized !== "pending") return false;
  const date = parseRenderDate(value);
  if (!date) return false;
  return Date.now() - date.getTime() > staleMinutes * 60 * 1000;
}

export function renderStatusLabel(status: string | null | undefined) {
  const normalized = normalizeRenderStatus(status);
  const labels: Record<RenderStatusKey, string> = {
    completed: "Completato",
    processing: "In elaborazione",
    pending: "In coda",
    failed: "Errore",
  };
  return labels[normalized];
}
