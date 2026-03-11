import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

/** Compact currency for chart axes: €1.2M, €45k, €800 */
export function formatCurrencyCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `€${(v / 1_000).toFixed(0)}k`;
  return `€${Math.round(v)}`;
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), "d MMMM yyyy", { locale: it });
}

export function formatDateShort(date: string | Date): string {
  return format(new Date(date), "d MMM yyyy", { locale: it });
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), "d MMM yyyy 'alle' HH:mm", { locale: it });
}

export function formatRelativeTime(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: it });
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
