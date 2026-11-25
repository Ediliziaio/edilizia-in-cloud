import type { ReactNode } from "react";
import { Search, X, CheckCircle2, ChevronRight } from "lucide-react";
import { DettaglioFiltri, GruppoFiltri, SceltaFiltro } from "@/components/mobile/FiltriMobile";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { RICERCA_BARRA } from "@/components/orders/TestataScheda";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Status {
  id: string;
  name: string;
  color: string;
  position: number;
}

const MONTHS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

interface OrdersFiltersProps {
  panel?: boolean;
  trailingControls?: ReactNode;
  /** Il conteggio dei risultati, in fondo alla stessa riga. */
  summary?: ReactNode;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  statuses: Status[];
  yearFilter: string;
  onYearFilterChange: (value: string) => void;
  availableYears: number[];
  paymentFilter: "all" | "pending" | "paid" | "overdue";
  onPaymentFilterChange: (
    value: "all" | "pending" | "paid" | "overdue",
  ) => void;
  monthFilter: string;
  onMonthFilterChange: (value: string) => void;
  hasAnyFilter: boolean;
  onClearAllFilters: () => void;
  hideCompleted: boolean;
  onHideCompletedChange: (value: boolean) => void;
  /** Solo per chi ha commesse generali: altrimenti il filtro non compare. */
  generaliFilter?: "all" | "solo" | "senza";
  onGeneraliFilterChange?: (value: "all" | "solo" | "senza") => void;
}

export function OrderSearch({value, onChange, expand = false}: {value: string; onChange: (text: string) => void; expand?: boolean}) {
  const t = useT();
  // Stessa misura della ricerca nelle altre schede di Commesse (25/11/2026): era 116-150px.
  return (<div className={expand ? "relative min-w-32 flex-1" : cn(RICERCA_BARRA, "col-span-2 max-sm:w-full")}>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t("Cerca…")}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 border-slate-200 bg-white pl-7 shadow-none max-sm:h-9 sm:h-8 sm:text-xs"
            aria-label={t("Cerca per codice, descrizione o cliente")}
          />
        </div>);
}

function FilterField({panel, title, children}: {panel: boolean; title: string; children: ReactNode}) {
  return panel ? <div className="grid min-w-0 gap-1.5"><span className="text-xs font-medium text-muted-foreground">{title}</span>{children}</div> : <>{children}</>;
}

export function OrdersFilters({
  panel = false,
  trailingControls,
  summary,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statuses,
  yearFilter,
  onYearFilterChange,
  availableYears,
  paymentFilter,
  onPaymentFilterChange,
  monthFilter,
  onMonthFilterChange,
  hasAnyFilter,
  onClearAllFilters,
  hideCompleted,
  onHideCompletedChange,
  generaliFilter,
  onGeneraliFilterChange,
}: OrdersFiltersProps) {
  const t = useT();
  return (
    <div
      className={panel ? "space-y-3" : "flex items-start gap-2 sm:gap-1.5 lg:items-center"}
      role="group"
      aria-label={t("Filtri commesse")}
    >
      <div className={panel ? "grid grid-cols-2 items-end gap-3" : "grid min-w-0 flex-1 grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:gap-1.5 xl:gap-1"}>
        {!panel && <OrderSearch value={searchQuery} onChange={onSearchChange} />}

        <FilterField panel={panel} title={t("Stato commessa")}><Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger
            aria-label={t("Stato commessa")}
            className={panel ? "h-9 w-full bg-background text-sm" : cn("h-10 w-full border-slate-200 bg-white shadow-none sm:px-2", "sm:h-8 sm:w-[180px] sm:shrink-0 sm:text-xs")}
          >
            <SelectValue placeholder={t("Stato")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("Tutti gli stati")}</SelectItem>
            <SelectItem value="__da_completare__">{t("Da completare")}</SelectItem>
            <SelectItem value="__completati__">{t("Completati")}</SelectItem>
            <SelectItem value="__assistenza__">{t("In assistenza")}</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status.id} value={status.id}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: status.color }}
                  />
                  {status.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select></FilterField>
        <FilterField panel={panel} title={t("Pagamento")}><Select
          value={paymentFilter}
          onValueChange={(val) =>
            onPaymentFilterChange(val as "all" | "pending" | "paid" | "overdue")
          }
        >
          <SelectTrigger
            aria-label={t("Stato pagamento")}
            className={panel ? "h-9 w-full bg-background text-sm" : "max-md:hidden h-10 w-full border-slate-200 bg-white shadow-none sm:h-8 sm:w-auto sm:min-w-[84px] sm:gap-1.5 sm:px-2 sm:text-xs sm:shrink-0"}
          >
            <SelectValue placeholder={t("Pagamenti")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("Tutti i pagamenti")}</SelectItem>
            <SelectItem value="pending">{t("Da incassare")}</SelectItem>
            <SelectItem value="paid">{t("Saldato")}</SelectItem>
            <SelectItem value="overdue">{t("Rate scadute")}</SelectItem>
          </SelectContent>
        </Select></FilterField>
        {generaliFilter && onGeneraliFilterChange && (
          <FilterField panel={panel} title={t("Tipo di commessa")}><Select value={generaliFilter} onValueChange={(val) => onGeneraliFilterChange(val as "all" | "solo" | "senza")}>
            <SelectTrigger
              aria-label={t("Commesse generali")}
              className={panel ? "h-9 w-full bg-background text-sm" : "h-10 w-full border-slate-200 bg-white shadow-none sm:h-8 sm:w-auto sm:min-w-[84px] sm:gap-1.5 sm:px-2 sm:text-xs sm:shrink-0"}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Tutte le commesse")}</SelectItem>
              <SelectItem value="solo">{t("Solo generali")}</SelectItem>
              <SelectItem value="senza">{t("Senza generale")}</SelectItem>
            </SelectContent>
          </Select></FilterField>
        )}
        <FilterField panel={panel} title={t("Periodo")}><Select value={yearFilter} onValueChange={onYearFilterChange}>
          <SelectTrigger
            aria-label={t("Periodo commesse")}
            title={
              yearFilter === "corrente"
                ? t("{anno} + precedenti da gestire", { anno: new Date().getFullYear() })
                : undefined
            }
            className={panel ? "h-9 w-full bg-background text-sm" : "h-10 w-full border-slate-200 bg-white shadow-none max-md:hidden sm:h-8 sm:w-auto sm:min-w-[84px] sm:gap-1.5 sm:px-2 sm:text-xs sm:shrink-0"}
          >
            <SelectValue placeholder={t("Anno")}>
              {yearFilter === "corrente"
                ? t("{anno} + pregresso", { anno: new Date().getFullYear() })
                : yearFilter === "all"
                  ? t("Tutti gli anni")
                  : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {/* La scelta di partenza della pagina: senza questa voce, col
                  valore «corrente» il campo restava vuoto (solo l'icona). */}
            <SelectItem value="corrente">
              {t("{anno} + precedenti da gestire", { anno: new Date().getFullYear() })}
            </SelectItem>
            <SelectItem value="all">{t("Tutti gli anni")}</SelectItem>
            {availableYears.map((year) => (
              <SelectItem key={year} value={String(year)}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select></FilterField>
        <FilterField panel={panel} title={t("Mese")}><Select value={monthFilter} onValueChange={onMonthFilterChange}>
          <SelectTrigger
            aria-label={t("Mese commesse")}
            className={panel ? "h-9 w-full bg-background text-sm" : "max-md:hidden h-10 w-full border-slate-200 bg-white shadow-none sm:h-8 sm:w-auto sm:min-w-[84px] sm:gap-1.5 sm:px-2 sm:text-xs sm:shrink-0"}
          >
            <SelectValue placeholder={t("Mese")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("Tutti i mesi")}</SelectItem>
            {MONTHS.map((name, i) => (
              <SelectItem key={i} value={i.toString()}>
                {t(name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select></FilterField>
        <Button
          variant={hideCompleted ? "default" : "outline"}
          size="sm"
          onClick={() => onHideCompletedChange(!hideCompleted)}
          className={panel ? "h-9 text-xs" : "tap-compact col-span-2 h-9 shrink-0 gap-1.5 max-md:hidden sm:h-8 sm:px-2 sm:text-xs"}
          aria-label={t("Nascondi commesse con lavori completati")}
          aria-pressed={hideCompleted}
          title={t("Nascondi commesse con lavori completati")}
        >
          <CheckCircle2 className="h-3.5 w-3.5 sm:hidden" />
          <span>{t("Nascondi completate")}</span>
        </Button>
        {/* Ordinamento, colonne e conteggio restano un blocco unico a destra (25/11/2026): quando la riga
            non basta vanno a capo insieme, invece di lasciare «124 risultati» da solo su una riga. */}
        <div className="col-span-2 flex items-center gap-1.5 sm:ml-auto sm:shrink-0">
          {trailingControls}
          {!panel && summary && (
            <div className="text-xs text-slate-600 sm:whitespace-nowrap">{summary}</div>
          )}
        </div>
      </div>
      {hasAnyFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAllFilters}
          className="tap-compact h-9 shrink-0 gap-1.5 whitespace-nowrap text-muted-foreground sm:h-8 sm:px-2 sm:text-xs"
          aria-label={t("Cancella tutti i filtri")}
        >
          <X className="h-3.5 w-3.5" />
          <span>{t("Azzera filtri")}</span>
        </Button>
      )}
    </div>
  );
}

type FiltriCommesseCompattiProps = Pick<OrdersFiltersProps,
  "statusFilter" | "onStatusFilterChange" | "statuses" | "yearFilter" | "onYearFilterChange" | "availableYears" |
  "paymentFilter" | "onPaymentFilterChange" | "monthFilter" | "onMonthFilterChange" | "generaliFilter" |
  "onGeneraliFilterChange" | "hideCompleted" | "onHideCompletedChange"
> & {
  altriAttivi: number;
  onAvanzati: () => void;
  children?: ReactNode;
};

export function FiltriCommesseCompatti({
  statusFilter, onStatusFilterChange, statuses,
  yearFilter, onYearFilterChange, availableYears,
  paymentFilter, onPaymentFilterChange, monthFilter, onMonthFilterChange,
  generaliFilter, onGeneraliFilterChange, hideCompleted, onHideCompletedChange,
  altriAttivi, onAvanzati, children,
}: FiltriCommesseCompattiProps) {
  const t = useT();
  return (
    <GruppoFiltri>
      <SceltaFiltro titolo={t("Stato")} valore={statusFilter} onScegli={onStatusFilterChange} scelte={[
        { value: "all", label: hideCompleted ? t("Senza completate") : t("Tutti gli stati") },
        { value: "__da_completare__", label: t("Da completare") },
        { value: "__completati__", label: t("Completati") },
        { value: "__assistenza__", label: t("In assistenza") },
        ...statuses.map(({ id, name }) => ({ value: id, label: name })),
      ]} />
      <SceltaFiltro titolo={t("Periodo")} valore={yearFilter} onScegli={onYearFilterChange} scelte={[
        { value: "corrente", label: t("{anno} + pregresso", { anno: new Date().getFullYear() }) },
        { value: "all", label: t("Tutti gli anni") },
        ...Array.from(new Set(availableYears.map(String).concat(/^\d{4}$/.test(yearFilter) ? [yearFilter] : [])))
          .map(anno => ({ value: anno, label: anno })),
      ]} />
      <DettaglioFiltri titolo={t("Altri filtri")} riepilogo={altriAttivi ? String(altriAttivi) : undefined}>
        <SceltaFiltro titolo={t("Pagamento")} valore={paymentFilter} onScegli={onPaymentFilterChange} scelte={[
          { value: "all", label: t("Tutti") },
          { value: "pending", label: t("Da incassare") },
          { value: "paid", label: t("Saldati") },
          { value: "overdue", label: t("Rate scadute") },
        ] as const} />
        <SceltaFiltro titolo={t("Mese")} valore={monthFilter} onScegli={onMonthFilterChange} scelte={[
          { value: "all", label: t("Tutti i mesi") },
          ...MONTHS.map((label, i) => ({ value: String(i), label: t(label) })),
        ]} />
        {generaliFilter && onGeneraliFilterChange && (
          <SceltaFiltro titolo={t("Tipo")} valore={generaliFilter} onScegli={onGeneraliFilterChange} scelte={[
            { value: "all", label: t("Tutte") },
            { value: "solo", label: t("Solo generali") },
            { value: "senza", label: t("Senza generale") },
          ] as const} />
        )}
        <button type="button" className="flex min-h-12 w-full items-center justify-between gap-2 px-3 text-left text-sm font-medium hover:bg-muted/40"
          aria-pressed={hideCompleted} onClick={() => onHideCompletedChange(!hideCompleted)}>
          {t("Nascondi completate")}
          {hideCompleted && <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />}
        </button>
        {children}
        <button type="button" className="flex min-h-12 w-full items-center justify-between gap-2 px-3 text-left text-sm font-medium text-primary hover:bg-muted/40"
          onClick={onAvanzati}>
          {t("Filtri avanzati")}
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </DettaglioFiltri>
    </GruppoFiltri>
  );
}
