import { Fragment } from "react";
import { format, isPast, isToday, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, CreditCard, Ban, ArrowUpRight, ArrowDownLeft, CalendarClock, Plus } from "lucide-react";
import type { Scadenza } from "@/hooks/useScadenzario";
import { formatCurrency } from "@/lib/formatters";

const fmtEur = (n: number) => formatCurrency(n);

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  incasso_cliente: { label: "Incasso", color: "bg-green-100 text-green-800" },
  pagamento_fornitore: { label: "Fornitore", color: "bg-blue-100 text-blue-800" },
  costo_aziendale: { label: "Costo", color: "bg-orange-100 text-orange-800" },
  scadenza_fiscale: { label: "Fiscale", color: "bg-purple-100 text-purple-800" },
};

interface Props {
  scadenze: Scadenza[];
  onMarkPaid: (s: Scadenza) => void;
  onCancel: (id: string) => void;
  onAdd?: () => void;
  /** Click su una riga (es. apri la fattura/commessa collegata). */
  onRowClick?: (s: Scadenza) => void;
}

const monthLabel = (d: Date) => {
  const s = format(d, "LLLL yyyy", { locale: it });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export default function ScadenzarioTable({ scadenze, onMarkPaid, onCancel, onAdd, onRowClick }: Props) {
  if (scadenze.length === 0) {
    return (
      // Mobile: una riga di testo, senza icona, spiegazione e bottone (c'è «Nuova» in testata).
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center border rounded-xl bg-card max-sm:py-4">
        <CalendarClock className="h-12 w-12 text-muted-foreground/40 max-sm:hidden" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground max-sm:text-xs max-sm:font-normal max-sm:text-muted-foreground">Nessuna scadenza trovata</p>
          <p className="text-xs text-muted-foreground mt-0.5 max-sm:hidden">
            Non ci sono scadenze per i filtri selezionati.
          </p>
        </div>
        {onAdd && (
          <Button size="sm" variant="outline" onClick={onAdd} className="gap-1.5 max-sm:hidden">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Nuova scadenza
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
    {/* Mobile: una riga da ~52px per scadenza (descrizione; data, riferimento e
        giorni; importo e «Paga»), col mese come riga sottile. Prima: tre righe
        di testo, badge del tipo e bottone per ogni scadenza. */}
    <div className="sm:hidden overflow-hidden rounded-lg border bg-card">
      {scadenze.map((s, idx) => {
        const dueDate = new Date(s.due_date);
        const showMonthHeader = idx === 0 || monthLabel(dueDate) !== monthLabel(new Date(scadenze[idx - 1].due_date));
        const remaining = s.amount - s.paid_amount;
        const daysLeft = differenceInDays(dueDate, new Date());
        const isOverdue = isPast(dueDate) && !isToday(dueDate) && s.status !== "pagata" && s.status !== "annullata";
        const isDueToday = isToday(dueDate) && s.status !== "pagata" && s.status !== "annullata";
        const isPaid = s.status === "pagata";
        const isCancelled = s.status === "annullata";
        const refLabel = s.invoices?.invoice_number
          ? `Fatt. ${s.invoices.invoice_number}`
          : s.orders?.order_code
            ? `Ord. ${s.orders.order_code}`
            : s.suppliers?.name
              ? s.suppliers.name
              : s.marketing_contacts
                ? `${s.marketing_contacts.first_name} ${s.marketing_contacts.last_name}`
                : null;
        return (
          <Fragment key={s.id}>
            {showMonthHeader && (
              <div className={`bg-muted/60 px-3 py-1 text-[11px] font-semibold text-muted-foreground ${idx > 0 ? "border-t" : ""}`}>
                {monthLabel(dueDate)}
              </div>
            )}
            <div
              className={`flex items-center gap-2.5 px-3 py-2.5 ${showMonthHeader ? "" : "border-t"} ${isOverdue ? "bg-destructive/5" : isDueToday ? "bg-amber-50 dark:bg-amber-950/20" : ""} ${isCancelled || isPaid ? "opacity-60" : ""} ${onRowClick ? "cursor-pointer active:bg-muted" : ""}`}
              onClick={onRowClick ? () => onRowClick(s) : undefined}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold leading-tight">{s.description}</p>
                <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                  {format(dueDate, "dd/MM", { locale: it })}
                  {refLabel ? ` · ${refLabel}` : ""}
                  {isOverdue && <span className="font-medium text-destructive"> · da {Math.abs(daysLeft)} gg</span>}
                  {isDueToday && <span className="font-medium text-amber-600"> · oggi</span>}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-[13px] font-semibold leading-tight tabular-nums ${s.direction === "entrata" ? "text-green-700" : ""}`}>
                  {s.direction === "uscita" ? "−" : "+"}{fmtEur(isPaid || isCancelled ? s.amount : remaining)}
                </p>
                {isPaid || isCancelled ? (
                  <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{isPaid ? "Saldato" : "Annullata"}</p>
                ) : (
                  <button
                    type="button"
                    className="tap-compact mt-0.5 text-[11px] font-medium leading-tight text-primary"
                    onClick={(e) => { e.stopPropagation(); onMarkPaid(s); }}
                  >
                    Paga
                  </button>
                )}
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
    {/* Desktop table */}
    <div className="hidden sm:block rounded-lg border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-medium">Scadenza</th>
            <th className="text-left p-3 font-medium">Tipo</th>
            <th className="text-left p-3 font-medium">Descrizione</th>
            <th className="text-right p-3 font-medium">Importo</th>
            <th className="text-right p-3 font-medium">Residuo</th>
            <th className="text-left p-3 font-medium">Stato</th>
            <th className="p-3 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {scadenze.map((s, idx) => {
            const dueDate = new Date(s.due_date);
            const showMonthHeader = idx === 0 || monthLabel(dueDate) !== monthLabel(new Date(scadenze[idx - 1].due_date));
            const remaining = s.amount - s.paid_amount;
            const daysLeft = differenceInDays(dueDate, new Date());
            const isOverdue = isPast(dueDate) && !isToday(dueDate) && s.status !== "pagata" && s.status !== "annullata";
            const isDueToday = isToday(dueDate) && s.status !== "pagata" && s.status !== "annullata";
            const isDueSoon = daysLeft > 0 && daysLeft <= 7 && s.status !== "pagata" && s.status !== "annullata";
            const isPaid = s.status === "pagata";
            const isCancelled = s.status === "annullata";
            const tipoInfo = TIPO_LABELS[s.tipo] || { label: s.tipo, color: "bg-muted text-muted-foreground" };

            const rowStyle = isCancelled
              ? "opacity-50"
              : isPaid
                ? "opacity-60"
                : isOverdue
                  ? "bg-destructive/5"
                  : isDueToday
                    ? "bg-amber-50 dark:bg-amber-950/20"
                    : isDueSoon
                      ? "bg-orange-50/50 dark:bg-orange-950/10"
                      : "";

            const refLabel = s.invoices?.invoice_number
              ? `Fatt. ${s.invoices.invoice_number}`
              : s.orders?.order_code
                ? `Ord. ${s.orders.order_code}`
                : s.suppliers?.name
                  ? s.suppliers.name
                  : s.marketing_contacts
                    ? `${s.marketing_contacts.first_name} ${s.marketing_contacts.last_name}`
                    : null;

            return (
              <Fragment key={s.id}>
                {showMonthHeader && (
                  <tr className="bg-muted/20">
                    <td colSpan={7} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">{monthLabel(dueDate)}</td>
                  </tr>
                )}
              <tr
                className={`border-b hover:bg-muted/30 ${rowStyle} ${onRowClick ? "cursor-pointer" : ""}`}
                onClick={onRowClick ? () => onRowClick(s) : undefined}
              >
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {isOverdue && <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />}
                    {isPaid && <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />}
                    {isCancelled && <Ban className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                    <span className={isOverdue ? "font-semibold text-destructive" : ""}>
                      {format(dueDate, "dd/MM/yyyy", { locale: it })}
                    </span>
                  </div>
                  {!isPaid && !isCancelled && (
                    <span className="text-xs text-muted-foreground">
                      {isOverdue
                        ? `${Math.abs(daysLeft)} giorni fa`
                        : isDueToday
                          ? "Oggi"
                          : `tra ${daysLeft} giorni`}
                    </span>
                  )}
                </td>
                <td className="p-3">
                  <Badge variant="secondary" className={`text-xs ${tipoInfo.color}`}>
                    {s.direction === "entrata"
                      ? <ArrowDownLeft className="h-3 w-3 mr-1 inline" />
                      : <ArrowUpRight className="h-3 w-3 mr-1 inline" />
                    }
                    {tipoInfo.label}
                  </Badge>
                </td>
                <td className="p-3">
                  <p className="font-medium truncate max-w-[200px]">{s.description}</p>
                  {refLabel && <p className="text-xs text-muted-foreground">{refLabel}</p>}
                </td>
                <td className="p-3 text-right font-mono">
                  <span className={s.direction === "entrata" ? "text-green-700" : ""}>
                    {s.direction === "uscita" ? "-" : "+"}{fmtEur(s.amount)}
                  </span>
                </td>
                <td className="p-3 text-right">
                  {isPaid ? (
                    <Badge variant="secondary" className="bg-green-100 text-green-800">Saldato</Badge>
                  ) : isCancelled ? (
                    <Badge variant="secondary">Annullata</Badge>
                  ) : s.status === "parziale" ? (
                    <div className="space-y-1">
                      <span className="font-medium">{fmtEur(remaining)}</span>
                      <Progress value={(s.paid_amount / s.amount) * 100} className="h-1.5" />
                      <span className="text-xs text-muted-foreground">{Math.round((s.paid_amount / s.amount) * 100)}%</span>
                    </div>
                  ) : (
                    <span className={isOverdue ? "text-destructive font-bold" : "font-medium"}>{fmtEur(remaining)}</span>
                  )}
                </td>
                <td className="p-3">
                  <Badge variant={
                    isPaid ? "default" :
                    isCancelled ? "secondary" :
                    isOverdue ? "destructive" :
                    "outline"
                  } className="text-xs">
                    {isPaid ? "Pagata" : isCancelled ? "Annullata" : isOverdue ? "Scaduta" : s.status === "parziale" ? "Parziale" : "Aperta"}
                  </Badge>
                </td>
                <td className="p-3">
                  {!isPaid && !isCancelled && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 px-2"
                        onClick={(e) => { e.stopPropagation(); onMarkPaid(s); }}
                      >
                        <CreditCard className="h-3.5 w-3.5 mr-1" /> Paga
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
