import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MonthSummary } from "@/hooks/billing/useMonthlyTimeline";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

/** Nome del mese nella lingua scelta (in italiano resta «Gennaio», «Febbraio»…). */
function nomeMese(m: MonthSummary): string {
  const nome = new Date(m.year, m.month - 1, 1).toLocaleDateString(intlCampo(), { month: "long" });
  return nome ? nome.charAt(0).toUpperCase() + nome.slice(1) : m.label;
}

/**
 * Striscia dei mesi piegabile (25/11/2026, «troppo spazio vuoto, l'elenco parte troppo in
 * basso»): 126px sopra la tabella anche quando nessun mese è scelto. Piegata di serie se si
 * guardano tutti i mesi, aperta se un mese è scelto; la scelta di chi la apre o la chiude
 * resta in questo browser, per pagina.
 */
export function useStrisciaMesi(chiave: string, meseScelto: string | null) {
  const nome = `strisciaMesi:${chiave}`;
  // Decisa una volta all'apertura della pagina: se dipendesse dal mese scelto a ogni giro,
  // togliendo il mese dalla striscia la striscia si chiuderebbe sotto il dito.
  const [aperta, setAperta] = useState<boolean>(() => {
    try {
      const v = window.localStorage.getItem(nome);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch { /* memoria del browser chiusa: si usa la scelta di serie */ }
    return meseScelto != null;
  });
  const cambia = () => {
    const nuovo = !aperta;
    setAperta(nuovo);
    try { window.localStorage.setItem(nome, nuovo ? "1" : "0"); } catch { /* resta per questa visita */ }
  };
  return { aperta, cambia };
}

/** Il bottone «Mesi» che apre e chiude la striscia; con un mese scelto ne mostra il nome. */
export function BottoneMesi({
  aperta, onClick, months, selectedMonth, className, idStriscia,
}: {
  aperta: boolean;
  /** L'id della striscia che il bottone apre (aria-controls). */
  idStriscia?: string;
  onClick: () => void;
  months: MonthSummary[];
  selectedMonth: string | null;
  className?: string;
}) {
  const t = useT();
  const scelto = selectedMonth ? months.find(m => m.key === selectedMonth) : undefined;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-expanded={aperta}
      aria-controls={idStriscia}
      title={aperta ? t("Nascondi") : t("Mostra")}
      onClick={onClick}
      className={cn(
        "h-8 gap-1.5 px-2.5 text-xs",
        scelto && "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300",
        className,
      )}
    >
      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
      {t("Mesi")}
      {scelto && <span className="font-semibold">· {nomeMese(scelto).substring(0, 3)} {scelto.year}</span>}
      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", aperta && "rotate-180")} aria-hidden="true" />
    </Button>
  );
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
  const isCurrentYear = year === currentYear;

  // Yearly totals
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
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* Year navigation header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          aria-label={t("Anno precedente")}
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
            <span className="text-xs text-muted-foreground">{t("{docs} doc · {amount}", { docs: String(yearTotals.docs ?? ""), amount: formatCurrencyCompact(yearTotals.amount) })}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          aria-label={t("Anno successivo")}
          onClick={() => onYearChange(year + 1)}
          disabled={year >= currentYear}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Month grid — su mobile scorre in orizzontale: con grid-cols-12 fisse le celle
          scendevano a ~31px (testo su 3-4 righe, tap impossibile). In fondo, la colonna
          del totale dell'anno con imponibile e IVA (16/11/2026). */}
      <div role="group" aria-label={t("Filtra documenti per mese")} className="flex overflow-x-auto scrollbar-none sm:grid sm:grid-cols-[repeat(12,minmax(0,1fr))_minmax(0,1.7fr)]">
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
                "min-w-[64px] flex-1 shrink-0 sm:min-w-0 border-r last:border-r-0 border-border px-1 py-2.5 text-center transition-colors hover:bg-accent/50 relative",
                isSelected && "bg-primary/10 ring-inset ring-1 ring-primary/30",
                isCurrent && !isSelected && "bg-accent/40"
              )}
            >
              <p className={cn(
                "text-[10px] font-medium uppercase tracking-wide",
                isSelected ? "text-primary" : "text-muted-foreground"
              )}>
                {nomeMese(month).substring(0, 3).toUpperCase()} '{String(month.year).slice(2)}
              </p>

              <p className={cn(
                "text-xs mt-0.5",
                month.docCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
              )}>{t("{docCount} doc", { docCount: String(month.docCount ?? "") })}</p>

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
        <div
          className="min-w-[132px] shrink-0 bg-muted/40 px-2 py-2.5 text-center sm:min-w-0"
          aria-label={t("Totale {year}", { year: String(year ?? "") })}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("Totale {year}", { year: String(year ?? "") })}</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums leading-tight" title={formatCurrency(yearTotals.amount)}>
            {formatCurrencyCompact(yearTotals.amount)}
          </p>
          <p className="mt-0.5 truncate text-[10px] tabular-nums text-muted-foreground" title={t("Imponibile {imponibile}", { imponibile: formatCurrency(yearTotals.imponibile) })}>{t("Imp. {imponibile}", { imponibile: formatCurrencyCompact(yearTotals.imponibile) })}</p>
          <p className="truncate text-[10px] tabular-nums text-muted-foreground" title={`IVA ${formatCurrency(yearTotals.iva)}`}>
            IVA {formatCurrencyCompact(yearTotals.iva)}
          </p>
        </div>
      </div>

      {selectedMonth && (
        <div className="flex justify-end px-3 py-1.5 border-t border-border bg-muted/30">
          <button
            onClick={() => onSelectMonth(null)}
            className="text-xs text-primary font-medium hover:underline"
          >
            {t("Mostra tutti i mesi")}
          </button>
        </div>
      )}
    </div>
  );
}
