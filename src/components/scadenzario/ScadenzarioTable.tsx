import { Fragment, useMemo } from "react";
import { format, isPast, isToday, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CreditCard, ArrowUpRight, ArrowDownLeft, CalendarClock, Plus, Undo2 } from "lucide-react";
import { controparteScadenza, type Scadenza } from "@/hooks/useScadenzario";
import { CLASSE_TONO, giorniDaOggi, statoScadenza } from "@/lib/finance/collegamentiFinanza";
import { siAnnullaIncasso } from "@/lib/finance/annulloIncassoScadenza";
import { formatCurrency } from "@/lib/formatters";
import { etichettaMetodo, gruppoMetodo } from "@/lib/finance/metodoScadenza";

const fmtEur = (n: number) => formatCurrency(n);

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  incasso_cliente: { label: "Incasso", color: "bg-green-100 text-green-800" },
  pagamento_fornitore: { label: "Fornitore", color: "bg-blue-100 text-blue-800" },
  costo_aziendale: { label: "Costo", color: "bg-orange-100 text-orange-800" },
  scadenza_fiscale: { label: "Fiscale", color: "bg-purple-100 text-purple-800" },
};

import { NotaRiga } from "@/components/shared/NotaRiga";

interface Props {
  scadenze: Scadenza[];
  onMarkPaid: (s: Scadenza) => void;
  onCancel: (id: string) => void;
  /** Annulla l'incasso registrato dallo scadenzario: le righe di prima nota automatiche non si eliminano altrove. */
  onAnnullaIncasso?: (s: Scadenza) => void;
  onAdd?: () => void;
  /** Click su una riga (es. apri la fattura/commessa collegata). */
  onRowClick?: (s: Scadenza) => void;
  /** Scrive la nota della riga: vale anche sulle scadenze nate da una fattura. */
  onNota?: (s: Scadenza, nota: string | null) => Promise<unknown>;
}

const monthLabel = (d: Date) => {
  const s = format(d, "LLLL yyyy", { locale: it });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** I totali di un mese nella riga del titolo: quanto entra, quanto esce, quanto resta aperto. */
interface TotaliMese { incassi: number; pagamenti: number; apertoIn: number; apertoOut: number }

export default function ScadenzarioTable({ scadenze, onMarkPaid, onCancel, onAnnullaIncasso, onAdd, onRowClick, onNota }: Props) {
  // Totali per mese delle righe in pagina (16/11/2026): si legge il mese senza sommare a mente.
  const totaliMese = useMemo(() => {
    const m = new Map<string, TotaliMese>();
    for (const s of scadenze) {
      if (s.status === "annullata") continue;
      const k = monthLabel(new Date(s.due_date));
      const t = m.get(k) ?? { incassi: 0, pagamenti: 0, apertoIn: 0, apertoOut: 0 };
      const resto = Math.max(0, Number(s.amount) - Number(s.paid_amount || 0));
      if (s.direction === "entrata") { t.incassi += Number(s.amount); t.apertoIn += s.status === "pagata" ? 0 : resto; }
      else { t.pagamenti += Number(s.amount); t.apertoOut += s.status === "pagata" ? 0 : resto; }
      m.set(k, t);
    }
    return m;
  }, [scadenze]);

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
                  {etichettaMetodo(s.payment_method) ? ` · ${etichettaMetodo(s.payment_method)}` : ""}
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
                    {s.direction === "entrata" ? "Incassa" : "Paga"}
                  </button>
                )}
                {onAnnullaIncasso && siAnnullaIncasso(s) && (
                  <button
                    type="button"
                    className="tap-compact mt-0.5 block w-full text-right text-[11px] font-medium leading-tight text-primary"
                    aria-label={`Annulla l'incasso di ${s.description}`}
                    onClick={(e) => { e.stopPropagation(); onAnnullaIncasso(s); }}
                  >
                    Annulla incasso
                  </button>
                )}
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
    {/* Desktop: una scadenza per riga, niente a capo. Controparte, documento,
        commessa e metodo hanno le loro colonne; il clic apre il dettaglio con
        pagamenti e bonifico abbinato. Le colonne meno importanti spariscono
        sotto 1280/1536 invece di andare a capo. */}
    <div className="hidden sm:block rounded-lg border overflow-x-auto">
      <table className="w-full text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_td]:px-2 [&_th]:px-2 [&_td]:py-1.5">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="py-2 font-medium">Scadenza</th>
            <th className="hidden py-2 font-medium 2xl:table-cell">Tipo</th>
            <th className="py-2 font-medium">Cliente / fornitore</th>
            <th className="py-2 font-medium">Descrizione</th>
            <th className="hidden py-2 font-medium lg:table-cell">Documento · commessa</th>
            <th className="hidden py-2 font-medium xl:table-cell">Modalità</th>
            <th className="py-2 text-right font-medium">Importo</th>
            <th className="py-2 text-right font-medium">Residuo</th>
            <th className="py-2 font-medium">Stato</th>
            <th className="py-2"><span className="sr-only">Azioni</span></th>
          </tr>
        </thead>
        <tbody>
          {scadenze.map((s, idx) => {
            const dueDate = new Date(s.due_date);
            const showMonthHeader = idx === 0 || monthLabel(dueDate) !== monthLabel(new Date(scadenze[idx - 1].due_date));
            const remaining = Math.max(0, s.amount - s.paid_amount);
            const stato = statoScadenza(s);
            const daysLeft = giorniDaOggi(s.due_date);
            const isPaid = stato.tono === "ok";
            const isCancelled = s.status === "annullata";
            const isOverdue = stato.tono === "scaduta";
            const isDueToday = !isPaid && !isCancelled && daysLeft === 0;
            const isDueSoon = !isPaid && !isCancelled && daysLeft > 0 && daysLeft <= 7;
            const tipoInfo = TIPO_LABELS[s.tipo] || { label: s.tipo, color: "bg-muted text-muted-foreground" };
            const rowStyle = isCancelled ? "opacity-50" : isPaid ? "opacity-70" : isOverdue ? "bg-destructive/5" : isDueToday ? "bg-amber-50 dark:bg-amber-950/20" : isDueSoon ? "bg-orange-50/50 dark:bg-orange-950/10" : "";
            const controparte = controparteScadenza(s);
            const documento = s.invoices?.invoice_number ? `Fatt. ${s.invoices.invoice_number}` : s.company_costs?.name ? "Costo" : null;
            return (
              <Fragment key={s.id}>
                {showMonthHeader && (() => {
                  const t = totaliMese.get(monthLabel(dueDate));
                  return (
                    <tr className="bg-muted/30">
                      <td colSpan={10} className="!py-1.5 text-xs">
                        <span className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
                          <span className="font-semibold text-foreground">{monthLabel(dueDate)}</span>
                          {t && t.incassi > 0 && <span className="tabular-nums text-emerald-700 dark:text-emerald-400">↓ {fmtEur(t.incassi)} da clienti</span>}
                          {t && t.pagamenti > 0 && <span className="tabular-nums text-rose-700 dark:text-rose-400">↑ {fmtEur(t.pagamenti)} a fornitori</span>}
                          {/* «Ancora aperto» solo se non è tutto il mese: in «Aperte» ripeterebbe le stesse cifre. */}
                          {t && (t.apertoIn > 0 || t.apertoOut > 0) && (Math.abs(t.apertoIn - t.incassi) > 0.005 || Math.abs(t.apertoOut - t.pagamenti) > 0.005) && (
                            <span className="tabular-nums text-muted-foreground">
                              ancora aperto: {[t.apertoIn > 0 ? `${fmtEur(t.apertoIn)} da incassare` : null, t.apertoOut > 0 ? `${fmtEur(t.apertoOut)} da pagare` : null].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })()}
              <tr
                className={`border-b hover:bg-muted/30 ${rowStyle} ${onRowClick ? "cursor-pointer" : ""}`}
                onClick={onRowClick ? () => onRowClick(s) : undefined}
              >
                <td>
                  <span className={`inline-flex items-center gap-1.5 tabular-nums ${isOverdue ? "font-semibold text-destructive" : ""}`}>
                    {isOverdue && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                    {format(dueDate, "dd/MM/yyyy", { locale: it })}
                  </span>
                  {!isPaid && !isCancelled && (
                    <span className={`ml-1.5 text-xs tabular-nums ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}
                      title={isOverdue ? `Scaduta da ${stato.giorniRitardo} giorni` : undefined}>
                      {isOverdue ? `+${stato.giorniRitardo} gg` : isDueToday ? "oggi" : `fra ${daysLeft} gg`}
                    </span>
                  )}
                </td>
                <td className="hidden 2xl:table-cell">
                  <Badge variant="secondary" className={`text-xs ${tipoInfo.color}`}>
                    {s.direction === "entrata" ? <ArrowDownLeft className="mr-1 inline h-3 w-3" /> : <ArrowUpRight className="mr-1 inline h-3 w-3" />}
                    {tipoInfo.label}
                  </Badge>
                </td>
                <td><span className="block max-w-[130px] truncate xl:max-w-[180px] 2xl:max-w-[220px]" title={controparte ?? undefined}>{controparte ?? <span className="text-muted-foreground">—</span>}</span></td>
                <td><span className="block max-w-[170px] truncate font-medium xl:max-w-[280px] 2xl:max-w-[360px]" title={s.description}>{s.description}</span></td>
                <td className="hidden lg:table-cell">
                  <span className="block max-w-[120px] truncate font-mono text-xs 2xl:max-w-[260px]" title={[documento === "Costo" ? `Costo · ${s.company_costs?.name}` : documento, s.orders?.order_code ? `Commessa ${s.orders.order_code}` : null].filter(Boolean).join(" · ") || undefined}>
                    {[documento, s.orders?.order_code].filter(Boolean).join(" · ") || <span className="text-muted-foreground">—</span>}
                  </span>
                </td>
                <td className="hidden xl:table-cell text-xs" title={s.payment_method ?? undefined}>
                  {etichettaMetodo(s.payment_method)
                    ? <span className={gruppoMetodo(s.payment_method) === "riba" ? "rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 font-medium text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300" : ""}>{etichettaMetodo(s.payment_method)}</span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className={`text-right tabular-nums ${s.direction === "entrata" ? "text-green-700" : ""}`}>
                  {s.direction === "uscita" ? "−" : "+"}{fmtEur(s.amount)}
                </td>
                <td className={`text-right tabular-nums ${isOverdue ? "font-semibold text-destructive" : "font-medium"}`}
                  title={s.status === "parziale" && s.amount > 0 ? `${fmtEur(s.paid_amount)} già ${s.direction === "entrata" ? "incassati" : "pagati"} (${Math.round((s.paid_amount / s.amount) * 100)}%)` : undefined}>
                  {isPaid || isCancelled ? <span className="font-normal text-muted-foreground">—</span> : <>
                    {fmtEur(remaining)}
                  </>}
                </td>
                <td><Badge variant="outline" className={`px-1.5 text-[11px] ${CLASSE_TONO[stato.tono]}`}>{stato.label}</Badge></td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    {onNota && (
                      <NotaRiga
                        nota={s.notes}
                        titolo={`${format(dueDate, "dd/MM/yyyy", { locale: it })} · ${s.description}`}
                        onSalva={(nota) => onNota(s, nota)}
                      />
                    )}
                    {!isPaid && !isCancelled && (
                      <Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs" onClick={() => onMarkPaid(s)}>
                        <CreditCard className="mr-1 h-3.5 w-3.5" />{s.direction === "entrata" ? "Incassa" : "Paga"}
                      </Button>
                    )}
                    {onAnnullaIncasso && siAnnullaIncasso(s) && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Annulla incasso"
                        aria-label={`Annulla l'incasso di ${s.description}`} onClick={() => onAnnullaIncasso(s)}>
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
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
