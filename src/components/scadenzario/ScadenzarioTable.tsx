import { scadenzaDaFonte } from "@/lib/finance/fontiScadenzario";
import { commesseScadenza } from "@/lib/finance/commesseScadenza";
import { Fragment, useMemo } from "react";
import { format, isPast, isToday, differenceInDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CreditCard, ArrowUpRight, ArrowDownLeft, CalendarClock, Plus, Undo2, Pencil, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { percheScadenzaNonModificabile } from "@/lib/finance/modificaScadenza";
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
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

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
  onModifica?: (s: Scadenza) => void;
  selezionate?: Set<string>;
  onSeleziona?: (id: string) => void;
  onSelezionaPagina?: (attive: boolean) => void;
  tutteSelezionate?: boolean;
  selezioneParziale?: boolean;
  inCorso?: boolean;
  /** La riga si paga qui, anche se viene da un documento (23/11/2026: le rate dei fornitori). */
  pagaSulPosto?: (s: Scadenza) => boolean;
}

const monthLabel = (d: Date | null) => {
  if (!d) return "Senza data";
  const s = format(d, "LLLL yyyy", { locale: dateFnsCampo() });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** I totali di un mese nella riga del titolo: quanto entra, quanto esce, quanto resta aperto. */
interface TotaliMese { incassi: number; pagamenti: number; apertoIn: number; apertoOut: number }

export default function ScadenzarioTable({ scadenze, onMarkPaid, onCancel, onAnnullaIncasso, onAdd, onRowClick, onNota, onModifica, selezionate, onSeleziona, onSelezionaPagina, tutteSelezionate, selezioneParziale, inCorso = false, pagaSulPosto }: Props) {
  const tTesto = useT();
  const azionePagamento = (s: Scadenza) => pagaSulPosto?.(s) ? tTesto("Paga") : scadenzaDaFonte(s) ? tTesto("Apri fonte") : s.direction === "entrata" ? tTesto("Incassa") : tTesto("Paga");
  // «Senza data» fa anche da chiave del gruppo: si traduce solo quando si mostra.
  const meseMostrato = (d: Date | null) => d ? monthLabel(d) : tTesto("Senza data");
  // Totali per mese delle righe in pagina (16/11/2026): si legge il mese senza sommare a mente.
  const totaliMese = useMemo(() => {
    const m = new Map<string, TotaliMese>();
    for (const s of scadenze) {
      if (s.status === "annullata") continue;
      const k = monthLabel(s.due_date ? new Date(s.due_date) : null);
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
        <CalendarClock className="h-12 w-12 text-muted-foreground/40 max-lg:hidden" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground max-sm:text-xs max-sm:font-normal max-sm:text-muted-foreground">{tTesto("Nessuna scadenza trovata")}</p>
          <p className="text-xs text-muted-foreground mt-0.5 max-lg:hidden">
            {tTesto("Non ci sono scadenze per i filtri selezionati.")}
          </p>
        </div>
        {onAdd && (
          <Button size="sm" variant="outline" onClick={onAdd} className="gap-1.5 max-lg:hidden">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {tTesto("Nuova scadenza")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
    {/* Sul telefono niente selezione multipla (le distinte si fanno da computer o tablet): una
        casella per riga e «Seleziona pagina» occupavano una colonna e una riga in più. */}
    {onSelezionaPagina && <label className="flex min-h-11 items-center gap-2 px-2 text-sm lg:hidden max-sm:hidden">
      <Checkbox aria-label={tTesto("Seleziona le scadenze di questa pagina")} checked={tutteSelezionate ? true : selezioneParziale ? "indeterminate" : false} disabled={inCorso} onCheckedChange={v => onSelezionaPagina(v === true)} />
      {tTesto("Seleziona pagina")}
    </label>}
    {/* Mobile: una riga da ~52px per scadenza (descrizione; data, riferimento e
        giorni; importo e «Paga»), col mese come riga sottile. Prima: tre righe
        di testo, badge del tipo e bottone per ogni scadenza. */}
    <div className="lg:hidden overflow-hidden rounded-lg border bg-card">
      {scadenze.map((s, idx) => {
        const dueDate = s.due_date ? new Date(s.due_date) : null;
        const showMonthHeader = idx === 0 || monthLabel(dueDate) !== monthLabel(scadenze[idx - 1].due_date ? new Date(scadenze[idx - 1].due_date!) : null);
        const remaining = s.amount - s.paid_amount;
        const daysLeft = dueDate ? differenceInDays(dueDate, new Date()) : NaN;
        const isOverdue = !!dueDate && isPast(dueDate) && !isToday(dueDate) && s.status !== "pagata" && s.status !== "annullata";
        const isDueToday = !!dueDate && isToday(dueDate) && s.status !== "pagata" && s.status !== "annullata";
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
                {meseMostrato(dueDate)}
              </div>
            )}
            <div
              className={`flex items-center gap-2.5 px-3 py-2.5 ${showMonthHeader ? "" : "border-t"} ${isOverdue ? "bg-destructive/5" : isDueToday ? "bg-amber-50 dark:bg-amber-950/20" : ""} ${isCancelled || isPaid ? "opacity-60" : ""}`}
            >
              {onSeleziona && <span className="max-sm:hidden" onClick={(e) => e.stopPropagation()}><Checkbox aria-label={tTesto("Seleziona {descrizione}", { descrizione: String(s.description ?? "") })} checked={selezionate?.has(s.id) ?? false} disabled={inCorso} onCheckedChange={() => onSeleziona(s.id)} /></span>}
              <div className="min-w-0 flex-1">
                {onRowClick ? (
                  <button type="button" className="min-h-11 w-full text-left text-sm font-semibold leading-tight hover:underline max-sm:min-h-0 max-sm:truncate" onClick={() => onRowClick(s)}>
                    {s.description}
                  </button>
                ) : <p className="break-words text-sm font-semibold leading-tight max-sm:truncate">{s.description}</p>}
                <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                  {dueDate ? format(dueDate, "dd/MM", { locale: dateFnsCampo() }) : tTesto("Senza data")}
                  {refLabel ? ` · ${refLabel}` : ""}
                  {etichettaMetodo(s.payment_method) ? ` · ${etichettaMetodo(s.payment_method)}` : ""}
                  {isOverdue && <span className="font-medium text-destructive">{" · "}{tTesto("da {giorni} gg", { giorni: Math.abs(daysLeft) })}</span>}
                  {isDueToday && <span className="font-medium text-amber-600"> · {tTesto("oggi")}</span>}
                </p>
              </div>
              {onModifica && !percheScadenzaNonModificabile(s) && <Button size="icon" variant="ghost" className="size-11 shrink-0" disabled={inCorso} aria-label={tTesto("Modifica {descrizione}", { descrizione: String(s.description ?? "") })} onClick={(e) => { e.stopPropagation(); onModifica(s); }}><Pencil className="h-4 w-4" /></Button>}
              <div className="shrink-0 text-right">
                <p className={`text-[13px] font-semibold leading-tight tabular-nums ${s.direction === "entrata" ? "text-green-700" : ""}`}>
                  {s.direction === "uscita" ? "−" : "+"}{fmtEur(isPaid || isCancelled ? s.amount : remaining)}
                </p>
                {isPaid || isCancelled ? (
                  <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{isPaid ? tTesto("Saldato") : tTesto("Annullata")}</p>
                ) : (
                  <button
                    type="button"
                    // «Apri fonte» sul telefono sta nel dettaglio che si apre toccando la riga.
                    className={`min-h-11 px-1 text-xs font-medium leading-tight text-primary max-sm:min-h-8 ${scadenzaDaFonte(s) ? "max-sm:hidden" : ""}`}
                    onClick={(e) => { e.stopPropagation(); onMarkPaid(s); }}
                  >
                    {azionePagamento(s)}
                  </button>
                )}
                {onAnnullaIncasso && siAnnullaIncasso(s) && (
                  <button
                    type="button"
                    className="block min-h-11 w-full text-right text-xs font-medium leading-tight text-primary"
                    aria-label={tTesto("Annulla l'incasso di {descrizione}", { descrizione: String(s.description ?? "") })}
                    onClick={(e) => { e.stopPropagation(); onAnnullaIncasso(s); }}
                  >
                    {tTesto("Annulla incasso")}
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
        sotto 1280/1800 invece di andare a capo. La descrizione prende lo spazio che resta
        (25/11/2026): a 1600 con la barra laterale la tabella era larga il 124% del riquadro. */}
    <div className="relative hidden lg:block rounded-lg border overflow-x-auto">
      <table className="w-full text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_td]:px-2 [&_th]:px-2 [&_td]:py-1.5">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            {onSeleziona && <th className="w-10">{onSelezionaPagina ? <Checkbox aria-label={tTesto("Seleziona le scadenze di questa pagina")} checked={tutteSelezionate ? true : selezioneParziale ? "indeterminate" : false} disabled={inCorso} onCheckedChange={v => onSelezionaPagina(v === true)} /> : <span className="sr-only">{tTesto("Selezione")}</span>}</th>}
            <th className="py-2 font-medium">{tTesto("Scadenza")}</th>
            <th className="hidden py-2 font-medium min-[1800px]:table-cell">{tTesto("Tipo")}</th>
            <th className="py-2 font-medium">{tTesto("Cliente / fornitore")}</th>
            <th className="w-full py-2 font-medium">{tTesto("Descrizione")}</th>
            <th className="hidden py-2 font-medium lg:table-cell">{tTesto("Documento · commessa")}</th>
            <th className="py-2 font-medium">{tTesto("Modalità")}</th>
            <th className="py-2 text-right font-medium">{tTesto("Importo")}</th>
            <th className="py-2 text-right font-medium">{tTesto("Residuo")}</th>
            <th className="py-2 font-medium">{tTesto("Stato")}</th>
            <th className="py-2"><span className="sr-only">{tTesto("Azioni")}</span></th>
          </tr>
        </thead>
        <tbody>
          {scadenze.map((s, idx) => {
            const dueDate = s.due_date ? new Date(s.due_date) : null;
            const showMonthHeader = idx === 0 || monthLabel(dueDate) !== monthLabel(scadenze[idx - 1].due_date ? new Date(scadenze[idx - 1].due_date!) : null);
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
            const commesse = commesseScadenza(s);
            return (
              <Fragment key={s.id}>
                {showMonthHeader && (() => {
                  const t = totaliMese.get(monthLabel(dueDate));
                  return (
                    <tr className="bg-muted/30">
                      <td colSpan={onSeleziona ? 11 : 10} className="!py-1.5 text-xs">
                        <span className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
                          <span className="font-semibold text-foreground">{meseMostrato(dueDate)}</span>
                          {t && t.incassi > 0 && <span className="tabular-nums text-emerald-700 dark:text-emerald-400">{tTesto("↓ {incassi} da clienti", { incassi: fmtEur(t.incassi) })}</span>}
                          {t && t.pagamenti > 0 && <span className="tabular-nums text-rose-700 dark:text-rose-400">{tTesto("↑ {pagamenti} a fornitori", { pagamenti: fmtEur(t.pagamenti) })}</span>}
                          {/* «Ancora aperto» solo se non è tutto il mese: in «Aperte» ripeterebbe le stesse cifre. */}
                          {t && (t.apertoIn > 0 || t.apertoOut > 0) && (Math.abs(t.apertoIn - t.incassi) > 0.005 || Math.abs(t.apertoOut - t.pagamenti) > 0.005) && (
                            <span className="tabular-nums text-muted-foreground">{tTesto("ancora aperto: {valore}", { valore: [t.apertoIn > 0 ? tTesto("{importo} da incassare", { importo: fmtEur(t.apertoIn) }) : null, t.apertoOut > 0 ? tTesto("{importo} da pagare", { importo: fmtEur(t.apertoOut) }) : null].filter(Boolean).join(" · ") })}</span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })()}
              <tr
                className={`border-b hover:bg-muted/30 ${rowStyle} ${onRowClick ? "cursor-pointer" : ""}`}
                >
                {onSeleziona && <td onClick={(e) => e.stopPropagation()}><Checkbox aria-label={tTesto("Seleziona {descrizione}", { descrizione: String(s.description ?? "") })} checked={selezionate?.has(s.id) ?? false} disabled={inCorso} onCheckedChange={() => onSeleziona(s.id)} /></td>}
                <td>
                  <span className={`inline-flex items-center gap-1.5 tabular-nums ${isOverdue ? "font-semibold text-destructive" : ""}`}>
                    {isOverdue && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                    {dueDate ? format(dueDate, "dd/MM/yyyy", { locale: dateFnsCampo() }) : tTesto("Senza data")}
                  </span>
                  {dueDate && !isPaid && !isCancelled && (
                    <span className={`ml-1.5 text-xs tabular-nums ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}
                      title={isOverdue ? tTesto("Scaduta da {giorni} giorni", { giorni: stato.giorniRitardo }) : undefined}>
                      {isOverdue ? tTesto("+{giorni} gg", { giorni: stato.giorniRitardo }) : isDueToday ? tTesto("oggi") : tTesto("fra {giorni} gg", { giorni: String(daysLeft ?? "") })}
                    </span>
                  )}
                </td>
                <td className="hidden min-[1800px]:table-cell">
                  <Badge variant="secondary" className={`text-xs ${tipoInfo.color}`}>
                    {s.direction === "entrata" ? <ArrowDownLeft className="mr-1 inline h-3 w-3" /> : <ArrowUpRight className="mr-1 inline h-3 w-3" />}
                    {tTesto(tipoInfo.label)}
                  </Badge>
                </td>
                <td><span className="block max-w-[130px] truncate xl:max-w-[160px] min-[1800px]:max-w-[220px]" title={controparte ?? undefined}>{controparte ?? <span className="text-muted-foreground">—</span>}</span></td>
                <td className="w-full min-w-[186px] max-w-0"><span className="block truncate font-medium" title={s.description}>{s.description}</span></td>
                <td className="hidden lg:table-cell">
                  <span className="block max-w-[150px] truncate font-mono text-xs min-[1800px]:max-w-[260px]" title={[documento === "Costo" ? `Costo · ${s.company_costs?.name}` : documento, commesse ? `Commesse ${commesse}` : null].filter(Boolean).join(" · ") || undefined}>
                    {[commesse, documento].filter(Boolean).join(" · ") || <span className="text-muted-foreground">—</span>}
                  </span>
                </td>
                <td className="text-xs" title={s.payment_method ?? undefined}>
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
                <td><Badge variant="outline" className={`px-1.5 text-[11px] ${CLASSE_TONO[stato.tono]}`}>{tTesto(stato.label)}</Badge></td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    {onModifica && !percheScadenzaNonModificabile(s) && <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={inCorso} aria-label={tTesto("Modifica {descrizione}", { descrizione: String(s.description ?? "") })} title={tTesto("Modifica scadenza")} onClick={() => onModifica(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={inCorso} aria-label={tTesto("Annulla scadenza {descrizione}", { descrizione: String(s.description ?? "") })} title={tTesto("Annulla scadenza")} onClick={() => onCancel(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </>}
                    {onNota && !scadenzaDaFonte(s) && (
                      <NotaRiga
                        nota={s.notes}
                        titolo={`${dueDate ? format(dueDate, "dd/MM/yyyy", { locale: dateFnsCampo() }) : tTesto("Senza data")} · ${s.description}`}
                        onSalva={(nota) => onNota(s, nota)}
                      />
                    )}
                    {!isPaid && !isCancelled && (
                      <Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs" onClick={() => onMarkPaid(s)}>
                        <CreditCard className="mr-1 h-3.5 w-3.5" />{azionePagamento(s)}
                      </Button>
                    )}
                    {onAnnullaIncasso && siAnnullaIncasso(s) && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title={tTesto("Annulla incasso")}
                        aria-label={tTesto("Annulla l'incasso di {descrizione}", { descrizione: String(s.description ?? "") })} onClick={() => onAnnullaIncasso(s)}>
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
