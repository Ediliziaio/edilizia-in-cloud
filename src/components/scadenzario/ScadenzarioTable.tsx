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
}

export default function ScadenzarioTable({ scadenze, onMarkPaid, onCancel, onAdd }: Props) {
  if (scadenze.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center border rounded-xl bg-card">
        <CalendarClock className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">Nessuna scadenza trovata</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Non ci sono scadenze per i filtri selezionati.
          </p>
        </div>
        {onAdd && (
          <Button size="sm" variant="outline" onClick={onAdd} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Nuova scadenza
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
    {/* Mobile card list */}
    <div className="sm:hidden divide-y border rounded-lg">
      {scadenze.map((s) => {
        const dueDate = new Date(s.due_date);
        const remaining = s.amount - s.paid_amount;
        const daysLeft = differenceInDays(dueDate, new Date());
        const isOverdue = isPast(dueDate) && !isToday(dueDate) && s.status !== "pagata" && s.status !== "annullata";
        const isDueToday = isToday(dueDate) && s.status !== "pagata" && s.status !== "annullata";
        const isPaid = s.status === "pagata";
        const isCancelled = s.status === "annullata";
        const tipoInfo = TIPO_LABELS[s.tipo] || { label: s.tipo, color: "bg-muted text-muted-foreground" };
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
          <div key={s.id} className={`px-4 py-3 ${isOverdue ? "bg-destructive/5" : isDueToday ? "bg-amber-50 dark:bg-amber-950/20" : ""} ${isCancelled || isPaid ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {isOverdue && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                  {isPaid && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                  {isCancelled && <Ban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <span className={`text-sm font-medium ${isOverdue ? "text-destructive" : ""}`}>
                    {format(dueDate, "dd/MM/yyyy", { locale: it })}
                  </span>
                  <Badge variant="secondary" className={`text-xs ${tipoInfo.color}`}>
                    {s.direction === "entrata" ? <ArrowDownLeft className="h-3 w-3 mr-1 inline" /> : <ArrowUpRight className="h-3 w-3 mr-1 inline" />}
                    {tipoInfo.label}
                  </Badge>
                </div>
                <p className="font-medium text-sm mt-0.5 truncate">{s.description}</p>
                {refLabel && <p className="text-xs text-muted-foreground">{refLabel}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isPaid ? "Saldato" : isCancelled ? "Annullata" : isOverdue ? `${Math.abs(daysLeft)} giorni fa` : isDueToday ? "Oggi" : `tra ${daysLeft} giorni`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className={`font-semibold text-sm font-mono ${s.direction === "entrata" ? "text-green-700" : ""}`}>
                  {s.direction === "uscita" ? "-" : "+"}{fmtEur(s.amount)}
                </span>
                {!isPaid && !isCancelled && s.status === "parziale" && (
                  <p className="text-xs text-muted-foreground">{fmtEur(remaining)} residuo</p>
                )}
                {!isPaid && !isCancelled && (
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2 mt-1" onClick={() => onMarkPaid(s)}>
                    <CreditCard className="h-3.5 w-3.5 mr-1" /> Paga
                  </Button>
                )}
              </div>
            </div>
          </div>
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
          {scadenze.map((s) => {
            const dueDate = new Date(s.due_date);
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
              <tr key={s.id} className={`border-b hover:bg-muted/30 ${rowStyle}`}>
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
                        onClick={() => onMarkPaid(s)}
                      >
                        <CreditCard className="h-3.5 w-3.5 mr-1" /> Paga
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
