import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

function toValidDate(date: string | Date | null | undefined): Date | null {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

/** Compact currency for chart axes: €1.2M, €45k, €800 */
export function formatCurrencyCompact(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}€${(abs / 1_000).toFixed(0)}k`;
  return `${sign}€${Math.round(abs)}`;
}

export function formatDate(date: string | Date): string {
  const parsed = toValidDate(date);
  return parsed ? format(parsed, "d MMMM yyyy", { locale: it }) : "—";
}

export function formatDateShort(date: string | Date): string {
  const parsed = toValidDate(date);
  return parsed ? format(parsed, "d MMM yyyy", { locale: it }) : "—";
}

/**
 * 2026-05-27 (content quality audit): alias canonico per le date in formato
 * italiano abbreviato "d MMM yyyy" (es. "27 mag 2026"). Esposto come helper
 * unificato per smontare le ~20 implementazioni inline di formatDate sparse
 * nella codebase senza riscriverle tutte ora. Nuovi componenti devono usare
 * questo. variant: "short" = "27 mag 2026" (default), "long" = "27 maggio 2026".
 */
export function formatDateIt(date: string | Date | null | undefined, variant: "short" | "long" = "short"): string {
  const parsed = toValidDate(date);
  if (!parsed) return "—";
  return variant === "long"
    ? format(parsed, "d MMMM yyyy", { locale: it })
    : format(parsed, "d MMM yyyy", { locale: it });
}

export function formatDateTime(date: string | Date): string {
  const parsed = toValidDate(date);
  return parsed ? format(parsed, "d MMM yyyy 'alle' HH:mm", { locale: it }) : "—";
}

export function formatRelativeTime(date: string | Date): string {
  const parsed = toValidDate(date);
  return parsed ? formatDistanceToNow(parsed, { addSuffix: true, locale: it }) : "—";
}

export function getTicketStatusColor(status: string): {
  bg: string;
  text: string;
  border: string;
} {
  switch (status) {
    case "aperto":
      return {
        bg: "hsl(var(--primary) / 0.1)",
        text: "hsl(var(--primary))",
        border: "hsl(var(--primary) / 0.3)",
      };
    case "in_lavorazione":
      return {
        bg: "hsl(45 93% 47% / 0.1)",
        text: "hsl(45 93% 47%)",
        border: "hsl(45 93% 47% / 0.3)",
      };
    case "risolto":
      return {
        bg: "hsl(142 76% 36% / 0.1)",
        text: "hsl(142 76% 36%)",
        border: "hsl(142 76% 36% / 0.3)",
      };
    default:
      return {
        bg: "hsl(var(--muted))",
        text: "hsl(var(--muted-foreground))",
        border: "hsl(var(--border))",
      };
  }
}

export function getTicketStatusLabel(status: string): string {
  switch (status) {
    case "aperto":
      return "Aperto";
    case "in_lavorazione":
      return "In Lavorazione";
    case "risolto":
      return "Risolto";
    default:
      return status;
  }
}

export function getTicketPriorityColor(priority: string): {
  bg: string;
  text: string;
  border: string;
} {
  switch (priority) {
    case "bassa":
      return {
        bg: "hsl(var(--muted))",
        text: "hsl(var(--muted-foreground))",
        border: "hsl(var(--border))",
      };
    case "normale":
      return {
        bg: "hsl(210 100% 50% / 0.1)",
        text: "hsl(210 100% 50%)",
        border: "hsl(210 100% 50% / 0.3)",
      };
    case "alta":
      return {
        bg: "hsl(25 95% 53% / 0.1)",
        text: "hsl(25 95% 53%)",
        border: "hsl(25 95% 53% / 0.3)",
      };
    case "urgente":
      return {
        bg: "hsl(0 84% 60% / 0.1)",
        text: "hsl(0 84% 60%)",
        border: "hsl(0 84% 60% / 0.3)",
      };
    default:
      return {
        bg: "hsl(var(--muted))",
        text: "hsl(var(--muted-foreground))",
        border: "hsl(var(--border))",
      };
  }
}

export function getTicketPriorityLabel(priority: string): string {
  switch (priority) {
    case "bassa":
      return "Bassa";
    case "normale":
      return "Normale";
    case "alta":
      return "Alta";
    case "urgente":
      return "Urgente";
    default:
      return priority;
  }
}
