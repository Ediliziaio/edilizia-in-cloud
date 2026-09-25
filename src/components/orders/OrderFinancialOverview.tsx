import type { ReactNode } from "react";
import { ArrowUpRight, Banknote, FileText, LayoutDashboard, Percent, ReceiptText, TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import { calculateGrossFromNet } from "@/lib/vatUtils";
import { useOrderEconomicsBase } from "@/hooks/useOrderEconomicsBase";
import type { EconItem } from "@/lib/orders/economics";
import { paymentOverview } from "@/lib/orders/paymentOverview";
import type { InstallmentLike } from "@/lib/commissions";

interface Props {
  orderId: string;
  totalAmount: number;
  vatRate: number;
  items: EconItem[];
  itemsLoading?: boolean;
  itemsError?: boolean;
  installments: (InstallmentLike & { expected_date?: string | null })[];
  installmentsLoading?: boolean;
  installmentsError?: boolean;
  collectedGross: number;
  cashTotalGross: number;
  canViewAmounts: boolean;
  canViewMargins: boolean;
  onOpenEconomics: () => void;
  onOpenPayments: () => void;
}

/** Shared header, outside the tabs. No mutations or new financial data source. */
export function OrderFinancialOverview(props: Props) {
  const { totalAmount, vatRate, items, canViewAmounts, canViewMargins } = props;
  const { econ, isPending, isError } = useOrderEconomicsBase(props.orderId, totalAmount, items, canViewMargins);
  if (!canViewAmounts && !canViewMargins) return null;
  const loading = isPending || props.itemsLoading;
  const error = isError || props.itemsError;
  const hasCosts = econ.costsTot !== 0;
  const marginReady = !loading && !error && hasCosts;
  const incomplete = items.some(i => !i.purchase_price) || econ.laborNet === 0;
  const marginHint = error ? "Costi non disponibili" : loading ? "Caricamento costi…" : !hasCosts
    ? "Inserisci i costi della commessa" : incomplete ? "Parziale · verifica i costi" : "Sui costi registrati · IVA esclusa";
  const marginTone = marginReady ? econ.margin < 0 ? "text-red-200" : incomplete ? "text-amber-200" : "text-emerald-200" : "text-white";
  const { grossAmount, vatAmount } = calculateGrossFromNet(totalAmount, vatRate);
  const payments = paymentOverview(props.cashTotalGross, props.collectedGross, props.installments);
  const paymentReady = !props.installmentsLoading && !props.installmentsError;
  const paymentTone = payments.overdue || payments.excess > 0.01 ? "text-red-200" : payments.status === "Saldato" ? "text-emerald-200" : "text-white";

  return (
    <section aria-label="Riepilogo economico commessa" className="overflow-hidden rounded-2xl border border-[#173b67] bg-[#173b67] p-3 text-white shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_6px_16px_rgba(249,115,22,0.25)]"><LayoutDashboard className="h-4 w-4" /></span>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-100">La commessa in numeri</h2>
        </div>
        <span className="hidden text-xs text-blue-100 sm:block">Importi e incassi sempre in vista</span>
      </div>
      <div className={`grid grid-cols-2 gap-2 sm:gap-3 ${canViewAmounts && canViewMargins ? "xl:grid-cols-6" : canViewAmounts ? "lg:grid-cols-4" : ""}`}>
        {canViewAmounts && <>
          <Metric label="Totale contratto" value={formatCurrency(grossAmount)} hint={`IVA inclusa · ${vatRate}%`} icon={<FileText />} onClick={props.onOpenPayments} highlight />
          <Metric label="Imponibile" value={formatCurrency(totalAmount)} hint={`IVA ${formatCurrency(vatAmount)}`} icon={<ReceiptText />} onClick={props.onOpenPayments} />
        </>}
        {canViewMargins && <>
          <Metric label="Margine €" value={marginReady ? formatCurrency(econ.margin) : "—"} hint={marginHint} icon={<TrendingUp />} tone={marginTone} onClick={props.onOpenEconomics} />
          <Metric label="Margine %" value={marginReady && totalAmount > 0 ? `${econ.marginPct.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%` : "—"} hint={marginReady && totalAmount <= 0 ? "Imponibile non positivo" : "Margine / imponibile"} icon={<Percent />} tone={marginTone} onClick={props.onOpenEconomics} />
        </>}
        {canViewAmounts && <button type="button" onClick={props.onOpenPayments} className="col-span-2 min-w-0 rounded-xl border border-white/20 bg-white/[0.08] p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#173b67] sm:p-4" aria-label="Apri stato pagamenti">
          <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-blue-100"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-orange-200/25 bg-orange-400/15 text-orange-100"><Banknote className="h-3.5 w-3.5" /></span> Stato pagamenti <ArrowUpRight className="ml-auto h-3.5 w-3.5" /></span>
          <span className={`mt-2 block text-base font-semibold ${paymentReady ? paymentTone : "text-blue-100"}`}>{props.installmentsError ? "Dati non disponibili" : props.installmentsLoading ? "Caricamento…" : payments.status}</span>
          {paymentReady && <>
            <span className="mt-1 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-blue-100">
              <span>Incassato <strong className="text-white">{formatCurrency(props.collectedGross)}</strong></span>
              <span>Residuo <strong className="text-white">{formatCurrency(payments.remaining)}</strong></span>
            </span>
            <span role="progressbar" aria-label="Percentuale incassata" aria-valuenow={Math.round(payments.percent)} aria-valuemin={0} aria-valuemax={100} className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/15"><span className={`block h-full rounded-full ${payments.overdue ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${payments.percent}%` }} /></span>
            <span className="mt-1.5 block text-[11px] text-blue-100">
              {payments.excess > 0.01 ? `Eccedenza ${formatCurrency(payments.excess)}` : payments.remaining <= 0.01 && props.cashTotalGross > 0 ? "Tutto incassato" : payments.nextDate ? `${payments.overdue ? "Scaduta il" : "Prossima scadenza"} ${format(parseISO(payments.nextDate), "d MMM yyyy", { locale: it })}` : "Nessuna scadenza fissata"}
              {Math.abs(grossAmount - props.cashTotalGross) > 0.01 && " · residuo sul piano incassi"}
            </span>
          </>}
        </button>}
      </div>
    </section>
  );
}

function Metric({ label, value, hint, icon, tone = "text-white", onClick, highlight }: { label: string; value: string; hint: string; icon: ReactNode; tone?: string; onClick: () => void; highlight?: boolean }) {
  return <button type="button" onClick={onClick} className={`relative flex min-w-0 flex-col items-stretch rounded-xl border p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:bg-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#173b67] 2xl:p-4 ${highlight ? "border-orange-300/60 bg-white/[0.12]" : "border-white/20 bg-white/[0.08]"}`} aria-label={`Apri dettagli: ${label}`}>
    <span className="flex min-h-8 items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-blue-100">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border [&>svg]:h-3.5 [&>svg]:w-3.5 ${highlight ? "border-orange-200/30 bg-orange-400/20 text-orange-100" : "border-blue-100/20 bg-white/10 text-blue-50"}`}>{icon}</span>{label}
    </span>
    <span className={`mt-2 block break-words text-base font-bold leading-tight tracking-tight tabular-nums sm:text-lg 2xl:text-xl ${tone}`}>{value}</span>
    <span className="mt-1.5 block text-[11px] leading-snug text-blue-100">{hint}</span>
  </button>;
}
