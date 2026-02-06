import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

/**
 * Format a number as Italian currency (EUR)
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

/**
 * Format a date string as "d MMMM yyyy" in Italian
 * Example: "5 Febbraio 2026"
 */
export function formatDate(date: string | Date): string {
  return format(new Date(date), "d MMMM yyyy", { locale: it });
}

/**
 * Format a date string as "d MMM yyyy" in Italian (short month)
 * Example: "5 Feb 2026"
 */
export function formatDateShort(date: string | Date): string {
  return format(new Date(date), "d MMM yyyy", { locale: it });
}

/**
 * Format a date string with time as "d MMM yyyy 'alle' HH:mm" in Italian
 * Example: "5 Feb 2026 alle 14:30"
 */
export function formatDateTime(date: string | Date): string {
  return format(new Date(date), "d MMM yyyy 'alle' HH:mm", { locale: it });
}

/**
 * Format a date as relative time ("2 ore fa", "ieri", etc.)
 */
export function formatRelativeTime(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: it });
}

/**
 * Get status badge color classes based on ticket status
 */
export function getTicketStatusColor(status: "aperto" | "in_lavorazione" | "risolto"): {
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

/**
 * Get human-readable status label
 */
export function getTicketStatusLabel(status: "aperto" | "in_lavorazione" | "risolto"): string {
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
