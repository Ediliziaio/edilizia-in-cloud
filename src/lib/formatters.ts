import { TICKET_STATI, ticketStatoLabel } from "@/types/tickets";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

function toValidDate(date: string | Date | null | undefined): Date | null {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatCurrency(amount: number | string | null | undefined): string {
  // Difesa: Intl.NumberFormat.format(undefined|NaN) stampa "NaN €" (trappola
  // ricorrente, es. tariffe/costi non valorizzati). Coercizziamo a numero finito,
  // fallback 0, così nessuna card mostra mai "NaN €".
  // useGrouping "always": il CLDR italiano omette il separatore migliaia sotto
  // le 5 cifre (1250 → "1250,00 €" ma 12500 → "12.500,00 €") — nello stesso
  // riepilogo sembrava un'incoerenza. Forziamo "1.250,00 €" ovunque.
  const n = typeof amount === "number" ? amount : Number(amount);
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    useGrouping: "always",
  }).format(Number.isFinite(n) ? n : 0);
}

// "always" è nello standard (Intl.NumberFormat v3) ma non nei tipi della lib
// TypeScript del progetto: il cast sta qui, una volta sola.
const CONTEGGIO_IT = new Intl.NumberFormat("it-IT", {
  useGrouping: "always",
} as unknown as Intl.NumberFormatOptions);

/** Conteggi col punto delle migliaia anche a quattro cifre: «2.243», non
 *  «2243» (stessa ragione di formatCurrency qui sopra). */
export function formatCount(n: number | null | undefined): string {
  const v = Number(n);
  return CONTEGGIO_IT.format(Number.isFinite(v) ? v : 0);
}

/** Compact currency for chart axes: €1.2M, €45k, €800 */
export function formatCurrencyCompact(v: number): string {
  // Simbolo DOPO il numero, come ovunque in italiano ("836k €", non "€836k"):
  // questo formatter alimenta 35 file tra KPI e assi dei grafici.
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M €`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}k €`;
  return `${sign}${Math.round(abs)} €`;
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

/**
 * Colore del badge di stato. La tinta la decide il catalogo in
 * src/types/tickets.ts (campo `tone`): prima qui c'era uno switch con 3 casi e
 * tutti gli altri stati finivano grigi con il nome tecnico a vista.
 */
const TONI: Record<string, { bg: string; text: string; border: string }> = {
  blue:   { bg: "hsl(var(--primary) / 0.1)", text: "hsl(var(--primary))", border: "hsl(var(--primary) / 0.3)" },
  amber:  { bg: "hsl(45 93% 47% / 0.1)",  text: "hsl(45 93% 40%)",  border: "hsl(45 93% 47% / 0.3)" },
  orange: { bg: "hsl(25 95% 53% / 0.1)",  text: "hsl(25 95% 45%)",  border: "hsl(25 95% 53% / 0.3)" },
  purple: { bg: "hsl(271 81% 56% / 0.1)", text: "hsl(271 81% 48%)", border: "hsl(271 81% 56% / 0.3)" },
  indigo: { bg: "hsl(239 84% 67% / 0.1)", text: "hsl(239 84% 58%)", border: "hsl(239 84% 67% / 0.3)" },
  green:  { bg: "hsl(142 76% 36% / 0.1)", text: "hsl(142 76% 36%)", border: "hsl(142 76% 36% / 0.3)" },
  slate:  { bg: "hsl(var(--muted))", text: "hsl(var(--muted-foreground))", border: "hsl(var(--border))" },
};

export function getTicketStatusColor(status: string): {
  bg: string;
  text: string;
  border: string;
} {
  const tone = TICKET_STATI.find((s) => s.value === status)?.tone ?? "slate";
  return TONI[tone] ?? TONI.slate;
}

export function getTicketStatusLabel(status: string): string {
  return ticketStatoLabel(status);
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
