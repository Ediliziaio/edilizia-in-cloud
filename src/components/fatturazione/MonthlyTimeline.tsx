import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MonthSummary } from "@/hooks/billing/useMonthlyTimeline";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

/** Nome del mese nella lingua scelta (in italiano resta «Gennaio», «Febbraio»…). */
function nomeMese(m: MonthSummary): string {
  const nome = new Date(m.year, m.month - 1, 1).toLocaleDateString(intlCampo(), { month: "long" });
  return nome ? nome.charAt(0).toUpperCase() + nome.slice(1) : m.label;
}

interface MonthlyTimelineProps {
  months: MonthSummary[];
  selectedMonth: string | null;
  onSelectMonth: (month: string | null) => void;
  year: number;
  onYearChange: (year: number) => void;
}

export function MonthlyTimeline({ months, selectedMonth, onSelectMonth, year, onYearChange }: MonthlyTimelineProps) {
  const t = useT();
  const currentMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const currentYear = new Date().getFullYear();

  // Totali dell'anno: in fondo alla riga, col dettaglio nel tooltip.
  const yearTotals = useMemo(() => {
    let docs = 0, amount = 0, imponibile = 0, iva = 0;
    for (const m of months) {
      docs += m.docCount;
      amount += m.totalAmount;
      imponibile += m.imponibile;
      iva += m.iva;
    }
    return { docs, amount, imponibile, iva };
  }, [months]);

  return (
    /* 26/11/2026: una riga sola, sempre in vista. Prima erano 126px (tre righe per mese) e
       stava dietro il bottone «Mesi»: la somma del mese non si vedeva più. Qui ogni mese è
       sigla + totale; documenti, imponibile e IVA restano nel tooltip. */
    <div className="flex items-stretch overflow-x-auto rounded-lg border bg-card text-xs scrollbar-none">
      <div className="flex shrink-0 items-center gap-0.5 border-r bg-muted/40 px-1">
        <Button variant="ghost" size="sm" className="h-6 w-5 p-0" aria-label={t("Anno precedente")} onClick={() => onYearChange(year - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="font-semibold tabular-nums">{year}</span>
        <Button variant="ghost" size="sm" className="h-6 w-5 p-0" aria-label={t("Anno successivo")} onClick={() => onYearChange(year + 1)} disabled={year >= currentYear}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div role="group" aria-label={t("Filtra documenti per mese")} className="flex flex-1">
        {months.map((month) => {
          const isSelected = selectedMonth === month.key;
          const isCurrent = month.key === currentMonthKey;
          return (
            <button
              key={month.key}
              aria-pressed={isSelected}
              title={month.docCount > 0
                ? t("{label} {year}: {docCount} doc · totale {totalAmount} · imponibile {imponibile} · IVA {iva}", { label: nomeMese(month), year: String(month.year ?? ""), docCount: String(month.docCount ?? ""), totalAmount: formatCurrency(month.totalAmount), imponibile: formatCurrency(month.imponibile), iva: formatCurrency(month.iva) })
                : t("{label} {year}: nessun documento", { label: nomeMese(month), year: String(month.year ?? "") })}
              onClick={() => onSelectMonth(isSelected ? null : month.key)}
              className={cn(
                "flex min-w-fit flex-1 items-center justify-center gap-1 whitespace-nowrap border-r px-1.5 py-1.5 transition-colors hover:bg-accent/50",
                isSelected && "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
                isCurrent && !isSelected && "bg-accent/40",
              )}
            >
              <span className={cn("text-[10px] font-medium uppercase", isSelected ? "" : "text-muted-foreground")}>
                {nomeMese(month).substring(0, 3)}
              </span>
              <span className={cn("tabular-nums", month.totalAmount > 0 ? "font-semibold" : "text-muted-foreground")}>
                {month.totalAmount > 0 ? formatCurrencyCompact(month.totalAmount) : "—"}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="flex shrink-0 items-center gap-1.5 bg-muted/40 px-2"
        aria-label={t("Totale {year}", { year: String(year ?? "") })}
        title={t("{docs} doc · {amount}", { docs: String(yearTotals.docs ?? ""), amount: formatCurrency(yearTotals.amount) }) + ` · ${t("Imp. {imponibile}", { imponibile: formatCurrency(yearTotals.imponibile) })} · IVA ${formatCurrency(yearTotals.iva)}`}
      >
        <span className="text-[10px] uppercase text-muted-foreground">{t("Totale")}</span>
        <span className="font-bold tabular-nums">{formatCurrencyCompact(yearTotals.amount)}</span>
        {selectedMonth && (
          <button onClick={() => onSelectMonth(null)} className="font-medium text-primary hover:underline">
            {t("Tutti")}
          </button>
        )}
      </div>
    </div>
  );
}
