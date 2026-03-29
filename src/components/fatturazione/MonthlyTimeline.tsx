import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatCurrencyCompact } from "@/lib/formatters";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MonthSummary } from "@/hooks/billing/useMonthlyTimeline";

interface MonthlyTimelineProps {
  months: MonthSummary[];
  selectedMonth: string | null;
  onSelectMonth: (month: string | null) => void;
  year: number;
  onYearChange: (year: number) => void;
}

export function MonthlyTimeline({ months, selectedMonth, onSelectMonth, year, onYearChange }: MonthlyTimelineProps) {
  const currentMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const currentYear = new Date().getFullYear();
  const isCurrentYear = year === currentYear;

  // Yearly totals
  const yearTotals = useMemo(() => {
    let docs = 0, amount = 0;
    for (const m of months) {
      docs += m.docCount;
      amount += m.totalAmount;
    }
    return { docs, amount };
  }, [months]);

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* Year navigation header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => onYearChange(year - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <span className={cn(
            "text-sm font-semibold",
            isCurrentYear && "text-primary"
          )}>
            {year}
          </span>
          {yearTotals.docs > 0 && (
            <span className="text-xs text-muted-foreground">
              {yearTotals.docs} doc · {formatCurrencyCompact(yearTotals.amount)}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => onYearChange(year + 1)}
          disabled={year >= currentYear}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-12">
        {months.map((month) => {
          const isSelected = selectedMonth === month.key;
          const isCurrent = month.key === currentMonthKey;

          return (
            <button
              key={month.key}
              onClick={() => onSelectMonth(isSelected ? null : month.key)}
              className={cn(
                "border-r last:border-r-0 border-border px-1 py-2.5 text-center transition-colors hover:bg-accent/50 relative",
                isSelected && "bg-primary/10 ring-inset ring-1 ring-primary/30",
                isCurrent && !isSelected && "bg-accent/40"
              )}
            >
              <p className={cn(
                "text-[10px] font-medium uppercase tracking-wide",
                isSelected ? "text-primary" : "text-muted-foreground"
              )}>
                {month.label.substring(0, 3).toUpperCase()} '{String(month.year).slice(2)}
              </p>

              <p className={cn(
                "text-xs mt-0.5",
                month.docCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
              )}>
                {month.docCount} doc
              </p>

              <p className={cn(
                "text-[10px] mt-0.5 font-mono",
                month.totalAmount > 0
                  ? isSelected ? "text-primary font-semibold" : "text-foreground"
                  : "text-muted-foreground"
              )}>
                {month.totalAmount > 0 ? formatCurrencyCompact(month.totalAmount) : "€0"}
              </p>

              {isCurrent && (
                <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      {selectedMonth && (
        <div className="flex justify-end px-3 py-1.5 border-t border-border bg-muted/30">
          <button
            onClick={() => onSelectMonth(null)}
            className="text-xs text-primary font-medium hover:underline"
          >
            Mostra tutti i mesi
          </button>
        </div>
      )}
    </div>
  );
}
