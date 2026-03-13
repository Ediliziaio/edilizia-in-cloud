import { useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatCurrencyCompact } from "@/lib/formatters";
import type { MonthSummary } from "@/hooks/billing/useMonthlyTimeline";

interface MonthlyTimelineProps {
  months: MonthSummary[];
  selectedMonth: string | null;
  onSelectMonth: (month: string | null) => void;
}

export function MonthlyTimeline({ months, selectedMonth, onSelectMonth }: MonthlyTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    const el = scrollRef.current?.querySelector('[data-current="true"]');
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, []);

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto scrollbar-thin"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {months.map((month) => {
          const isSelected = selectedMonth === month.key;
          const isCurrent = month.key === currentMonthKey;

          return (
            <button
              key={month.key}
              data-current={isCurrent}
              onClick={() => onSelectMonth(isSelected ? null : month.key)}
              className={cn(
                "flex-none w-[7rem] border-r border-border px-2 py-2.5 text-center transition-colors hover:bg-accent/50 relative",
                isSelected && "bg-primary/10 ring-inset ring-1 ring-primary/30",
                isCurrent && !isSelected && "bg-accent/40"
              )}
              style={{ scrollSnapAlign: "start" }}
            >
              <p className={cn(
                "text-[11px] font-medium uppercase tracking-wide",
                isSelected ? "text-primary" : "text-muted-foreground"
              )}>
                {month.label.substring(0, 3)} {month.year !== new Date().getFullYear() ? `'${String(month.year).slice(2)}` : ""}
              </p>

              <p className={cn(
                "text-xs mt-0.5",
                month.docCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
              )}>
                {month.docCount} doc
              </p>

              <p className={cn(
                "text-[11px] mt-0.5 font-mono",
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
