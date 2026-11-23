import { loadCommissionContract, commissionContractFigures } from "@/lib/orders/commissionContractDetails";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { FileText, Wallet, ArrowDownLeft, Clock3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIncassiUnita } from "@/hooks/useCommesseGenerali";
import { conIncassiUnita, nettoUnitaInLordo } from "@/lib/orders/incassiCommessa";
import { formatCurrency } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";


function date(value: string | null | undefined) {
  if (!value) return "—";
  try { return format(parseISO(value), "dd/MM/yyyy"); } catch { return "—"; }
}

export function CommissionContractDetails({ orderId }: { orderId: string }) {
  const t = useT();
  const { effectiveCompany } = useAuth();
  const query = useQuery({
    queryKey: ["commission-contract-details", effectiveCompany?.id, orderId],
    enabled: !!effectiveCompany?.id && !!orderId,
    staleTime: 0,
    queryFn: () => loadCommissionContract(effectiveCompany!.id, orderId),
  });
  const unit = useIncassiUnita(query.data?.order?.id);
  const order = query.data?.order;
  if (query.isPending || unit.isFetching) return <div role="status" className="rounded-xl border bg-muted/30 p-6 text-sm text-muted-foreground">{t("Caricamento contratto e incassi cliente…")}</div>;
  if (query.isError || !order) return <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">{t("Contratto e incassi non disponibili. Nessun importo viene interpretato come zero.")} <Button variant="outline" size="sm" onClick={() => void query.refetch()}>{t("Riprova")}</Button></div>;
  if (order.workflow_kind === "generale" || order.workflow_kind === "intervento" || order.vat_rate == null || order.total_amount == null) return <div className="rounded-xl border p-4 text-sm">{t("I dati economici di questa commessa vanno verificati nel contratto di origine.")} <Link className="text-primary underline" to={`/azienda/ordini/${order.id}`}>{t("Apri contratto")}</Link></div>;
  const financials = (() => {
    try {
      const figures = commissionContractFigures(order, format(new Date(), "yyyy-MM-dd"));
      const totals = conIncassiUnita(figures.totals, nettoUnitaInLordo(unit.data?.incassi ?? 0, figures.vat), figures.vat, nettoUnitaInLordo(unit.data?.permute ?? 0, figures.vat));
      return { figures, totals };
    } catch { return null; }
  })();
  if (!financials) return <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">{t("Il piano pagamenti contiene dati da verificare. Apri la commessa per controllare gli importi.")}</div>;
  const { figures, totals } = financials;
    const paid = totals.daIncassareLordo <= 0.01 && totals.totaleLordo > 0;
    const name = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") || t("Cliente non indicato");
    return <section className="space-y-4" aria-label={t("Contratto e incassi cliente")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" />{t("Contratto e cliente")}</h3><p className="mt-1 text-sm text-muted-foreground">{order.order_code} · {name}</p></div>
        <Badge variant="outline">{order.status?.name || t("Stato commessa non indicato")}</Badge>
      </div>
      {query.data?.original.id !== order.id && <p className="text-xs text-muted-foreground">{t("L'intervento {codice} fa riferimento a questo contratto per i pagamenti.", { codice: query.data?.original.order_code })}</p>}
      <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-muted-foreground">{t("Valore contratto, IVA esclusa")}</p><p className="mt-1 font-semibold">{formatCurrency(figures.agreed)}</p><p className="mt-1 text-xs text-muted-foreground">{t("Incluse le varianti approvate · IVA {iva}%", { iva: figures.vat })}</p></div>
        <div><p className="text-xs text-muted-foreground">{t("Modalità pagamento cliente")}</p><p className="mt-1 font-medium">{order.payment_type === "financing" ? t("Finanziamento") : order.payment_type === "standard" ? t("Acconti e saldo") : t("Da verificare")}</p><p className="mt-1 text-xs text-muted-foreground">{t("Commessa inserita il {data}", { data: date(order.created_at) })}</p></div>
        <div><p className="text-xs text-muted-foreground">{t("Descrizione contratto")}</p><p className="mt-1">{order.description || t("Non indicata")}</p></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{t("Pagamenti del cliente")}</h3><Badge variant={paid ? "default" : "outline"}>{paid ? t("Saldo incassato") : totals.incassatoLordo > 0 ? t("Incassato parzialmente") : t("Non ancora incassato")}</Badge></div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[{ label: "Totale da incassare da contratto", amount: totals.totaleLordo, icon: Wallet }, { label: "Già incassato", amount: totals.incassatoLordo, icon: ArrowDownLeft }, { label: "Residuo da incassare", amount: totals.daIncassareLordo, icon: Clock3 }].map(({ label, amount, icon: Icon }) => <div key={label} className="rounded-xl border p-4"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{t(label)}</p><p className="mt-2 text-xl font-semibold tabular-nums">{formatCurrency(amount)}</p></div>)}
      </div>
      <p className="text-xs text-muted-foreground">{t("Incassi e rate IVA inclusa. Il pagamento del cliente è distinto dal pagamento della provvigione.")}{totals.costoFinanziaria > 0 && " " + t("Costo finanziaria: {importo}.", { importo: formatCurrency(totals.costoFinanziaria) })}</p>
      {unit.isFetching ? <p role="status" className="text-xs text-muted-foreground">{t("Verifica incassi dell'unità immobiliare…")}</p> : (unit.data?.incassi ?? 0) > 0 || (unit.data?.permute ?? 0) > 0 ? <p className="text-xs text-muted-foreground">{t("Il riepilogo considera anche incassi e permute dell'unità immobiliare; la tabella sotto riporta il piano rate.")}</p> : null}
      <div className="overflow-x-auto rounded-xl border">
        <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
          <TableHeader><TableRow><TableHead>{t("Rata")}</TableHead><TableHead>{t("Scadenza prevista")}</TableHead><TableHead>{t("Data incasso")}</TableHead><TableHead className="text-right">{t("Importo")}</TableHead><TableHead className="text-right">{t("Incassato")}</TableHead><TableHead className="text-right">{t("Residuo")}</TableHead><TableHead>{t("Situazione")}</TableHead></TableRow></TableHeader>
          <TableBody>{figures.rows.map((row, index) => <TableRow key={row.id || index}><TableCell><p className="font-medium">{row.label || t("Rata {n}", { n: index + 1 })}</p>{row.fattura?.numero && <p className="text-xs text-muted-foreground">{t("Fattura {numero}", { numero: row.fattura.numero })}</p>}</TableCell><TableCell>{date(row.expected_date)}</TableCell><TableCell>{date(row.paid_date)}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.total)}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.received)}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.due)}</TableCell><TableCell><Badge variant="outline">{row.status}</Badge></TableCell></TableRow>)}</TableBody>
        </Table>
      </div>
      {figures.unplanned > 0.01 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("{importo} ancora da pianificare: questa quota non è coperta dalle rate elencate.", { importo: formatCurrency(figures.unplanned) })}</p>}
    </section>;
}
