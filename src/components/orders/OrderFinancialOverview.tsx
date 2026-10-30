import type { ReactNode } from "react";
import { ArrowUpRight, LayoutDashboard } from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import { calculateGrossFromNet } from "@/lib/vatUtils";
import { useOrderEconomicsBase } from "@/hooks/useOrderEconomicsBase";
import { useCostoPrevistoCommessa } from "@/hooks/useCostoPrevistoCommessa";
import { useEsposizioneCommessa, type RataEsposizione } from "@/hooks/useEsposizioneCommessa";
import type { EconItem } from "@/lib/orders/economics";
import { numeriCommessa } from "@/lib/orders/numeriCommessa";
import { paymentOverview } from "@/lib/orders/paymentOverview";
import type { VarianteDatata } from "@/lib/commissions";

interface Props {
  orderId: string;
  totalAmount: number;
  vatRate: number;
  items: EconItem[];
  itemsLoading?: boolean;
  itemsError?: boolean;
  installments: (RataEsposizione & { expected_date?: string | null })[];
  installmentsLoading?: boolean;
  installmentsError?: boolean;
  collectedGross: number;
  cashTotalGross: number;
  /** Per il «da pagare»: lo stesso calcolo della cassa della commessa. */
  financingCost?: number;
  varianti?: ReadonlyArray<VarianteDatata>;
  canViewAmounts: boolean;
  canViewMargins: boolean;
  /** Il «da pagare» si vede col permesso sui costi (come la cassa); se manca vale quello sui margini. */
  canViewCosts?: boolean;
  onOpenEconomics: () => void;
  onOpenPayments: () => void;
}

const pctTesto = (n: number | null) => (n == null ? "" : `${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`);

/**
 * La commessa in numeri, in due righe allineate per colonna (31/10/2026):
 *              Ricavi        Costi              Margine
 *   Previsto   contratto     costo previsto     margine previsto
 *   Reale      incassato     costi sostenuti    margine reale
 *                            (e da pagare)      (e scarto sul previsto)
 * Ogni numero viene da una fonte che la pagina usa già (numeriCommessa.ts):
 * qui non si calcola niente di nuovo, si mette uno accanto all'altro.
 */
export function OrderFinancialOverview(props: Props) {
  const { totalAmount, vatRate, items, canViewAmounts, canViewMargins } = props;
  const canViewCosts = props.canViewCosts ?? canViewMargins;
  const { actual, quality, isPending, isError } = useOrderEconomicsBase(props.orderId, totalAmount, items, canViewMargins);
  const previsto = useCostoPrevistoCommessa(props.orderId, canViewMargins);
  const { esposizione, isLoading: cassaLoading, isError: cassaError } = useEsposizioneCommessa({
    orderId: props.orderId,
    totalAmount,
    vatRate,
    financingCost: props.financingCost ?? 0,
    installments: props.installments,
    varianti: props.varianti,
    enabled: canViewCosts,
  });
  if (!canViewAmounts && !canViewMargins) return null;

  const loading = isPending || props.itemsLoading;
  const error = isError || props.itemsError;
  const realeReady = !loading && !error && quality.canShowMargin;
  const previstoReady = !previsto.isLoading && !previsto.isError;
  const numeri = numeriCommessa({
    ricavo: totalAmount,
    costoPrevistoLavorazioni: previsto.costo,
    lavorazioniSenzaPrevisto: previsto.lavorazioniSenzaPrevisto,
    provvigioni: actual.commissions,
    costiReali: actual.costs,
    margineReale: actual.margin,
  });
  const { grossAmount } = calculateGrossFromNet(totalAmount, vatRate);
  const payments = paymentOverview(props.cashTotalGross, props.collectedGross, props.installments);
  const paymentReady = !props.installmentsLoading && !props.installmentsError;

  const realeHint = error
    ? "Costi non disponibili"
    : loading
      ? "Caricamento costi…"
      : quality.status === "ready" ? "Sui costi registrati" : quality.issues[0]?.label ?? quality.label;
  const scarto = numeri.scostamento;
  const previstoHint = !previstoReady
    ? previsto.isError ? "Lavorazioni non disponibili" : "Caricamento lavorazioni…"
    : !numeri.previsto
      ? "Nessuna lavorazione ha un costo previsto"
      : numeri.previsto.lavorazioniSenzaPrevisto > 0
        ? `Parziale: ${numeri.previsto.lavorazioniSenzaPrevisto} di ${previsto.lavorazioni} lavorazioni senza costo previsto`
        : "Dalle lavorazioni e dalle provvigioni";
  const toneMargine = (m: number, parziale: boolean) => (m < 0 ? "text-red-200" : parziale ? "text-amber-200" : "text-emerald-200");

  // Sul telefono i numeri di una riga stanno affiancati, sotto il nome della riga.
  const perRiga = (canViewAmounts ? 1 : 0) + (canViewMargins ? 2 : 0);
  const colonne = perRiga === 3
    ? "grid-cols-3 sm:grid-cols-[6.5rem_repeat(3,minmax(0,1fr))]"
    : perRiga === 2 ? "grid-cols-2 sm:grid-cols-[6.5rem_repeat(2,minmax(0,1fr))]" : "grid-cols-1 sm:grid-cols-[6.5rem_minmax(0,1fr)]";

  return (
    <section aria-label="Riepilogo economico commessa" className="overflow-hidden rounded-2xl border border-eic-navy-deep bg-eic-navy-deep p-3 text-white shadow-sm sm:p-4 max-sm:p-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 max-sm:hidden">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_6px_16px_rgba(249,115,22,0.25)]"><LayoutDashboard className="h-4 w-4" /></span>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-100">La commessa in numeri</h2>
        </div>
        <span className="hidden text-xs text-blue-100 sm:block">Importi senza IVA, tranne contratto, incassi e da pagare</span>
      </div>

      <div role="table" aria-label="Previsto e reale" className={`grid gap-1.5 sm:gap-2 ${colonne}`}>
        {/* Intestazione delle colonne, solo da tablet in su */}
        <div role="row" className="contents max-sm:hidden">
          <span role="columnheader" />
          {canViewAmounts && <span role="columnheader" className="px-1 text-[11px] font-medium uppercase tracking-wide text-blue-200">Ricavi</span>}
          {canViewMargins && <>
            <span role="columnheader" className="px-1 text-[11px] font-medium uppercase tracking-wide text-blue-200">Costi</span>
            <span role="columnheader" className="px-1 text-[11px] font-medium uppercase tracking-wide text-blue-200">Margine</span>
          </>}
        </div>

        {/* PREVISTO */}
        <div role="row" className="contents">
          <Etichetta titolo="Previsto" sotto="dal contratto" />
          {canViewAmounts && (
            <Cella label="Contratto" value={formatCurrency(grossAmount)} hint={`Imponibile ${formatCurrency(totalAmount)} · IVA ${vatRate}%`} onClick={props.onOpenPayments} />
          )}
          {canViewMargins && <>
            <Cella label="Costo previsto" value={previstoReady && numeri.previsto ? formatCurrency(numeri.previsto.costo) : "—"} hint={previstoHint} onClick={props.onOpenEconomics} />
            <Cella
              label="Margine previsto"
              value={previstoReady && numeri.previsto ? formatCurrency(numeri.previsto.margine) : "—"}
              aside={previstoReady && numeri.previsto ? pctTesto(numeri.previsto.marginePct) : undefined}
              hint={previstoReady && numeri.previsto ? "Se i costi restano quelli previsti" : previstoHint}
              tone={previstoReady && numeri.previsto ? toneMargine(numeri.previsto.margine, numeri.previsto.lavorazioniSenzaPrevisto > 0) : "text-white"}
              onClick={props.onOpenEconomics}
            />
          </>}
        </div>

        {/* REALE */}
        <div role="row" className="contents">
          <Etichetta titolo="Reale" sotto="ad oggi" />
          {canViewAmounts && (
            <Cella
              label="Incassato"
              value={paymentReady ? formatCurrency(props.collectedGross) : props.installmentsError ? "Non disponibile" : "…"}
              aside={paymentReady ? payments.status : undefined}
              hint={!paymentReady ? "" : payments.excess > 0.01
                ? `Eccedenza ${formatCurrency(payments.excess)}`
                : payments.remaining <= 0.01 && props.cashTotalGross > 0
                  ? "Tutto incassato"
                  : `Da incassare ${formatCurrency(payments.remaining)}${payments.nextDate ? ` · ${payments.overdue ? "scaduta il" : "prossima"} ${format(parseISO(payments.nextDate), "d MMM", { locale: it })}` : ""}`}
              tone={payments.overdue || payments.excess > 0.01 ? "text-red-200" : payments.status === "Saldato" ? "text-emerald-200" : "text-white"}
              progresso={paymentReady ? payments.percent : undefined}
              progressoAvviso={payments.overdue}
              onClick={props.onOpenPayments}
              apri
            />
          )}
          {canViewMargins && <>
            <Cella
              label="Costi sostenuti"
              value={realeReady ? formatCurrency(numeri.reale.costi) : "—"}
              hint={realeReady ? realeHint : realeHint}
              evidenza={canViewCosts && !cassaLoading && !cassaError && esposizione.daPagare > 0.005
                ? `Da pagare ${formatCurrency(esposizione.daPagare)}`
                : canViewCosts && !cassaLoading && !cassaError ? "Tutto pagato" : undefined}
              evidenzaTitolo="Costi registrati non ancora pagati (fatture, costi della commessa, provvigioni), IVA compresa. Gli ordini ai fornitori non ancora fatturati non ci sono."
              onClick={props.onOpenEconomics}
            />
            <Cella
              label="Margine reale"
              value={realeReady ? formatCurrency(numeri.reale.margine) : "—"}
              aside={realeReady ? pctTesto(numeri.reale.marginePct) : undefined}
              hint={!realeReady ? realeHint : scarto == null
                ? quality.label
                : Math.abs(scarto) < 0.5
                  ? "Costi in linea col previsto"
                  : scarto > 0
                    ? `Costi oltre il previsto di ${formatCurrency(scarto)}`
                    : `Costi sotto il previsto di ${formatCurrency(-scarto)}`}
              tone={realeReady ? toneMargine(numeri.reale.margine, quality.status === "partial") : "text-white"}
              onClick={props.onOpenEconomics}
            />
          </>}
        </div>
      </div>
    </section>
  );
}

function Etichetta({ titolo, sotto }: { titolo: string; sotto: string }) {
  return (
    <div role="rowheader" className="col-span-full flex items-center gap-2 px-1 sm:col-span-1 sm:flex-col sm:items-start sm:justify-center sm:gap-0">
      <span className="text-sm font-semibold text-white">{titolo}</span>
      <span className="text-[11px] text-blue-200">{sotto}</span>
    </div>
  );
}

function Cella({ label, value, aside, hint, tone = "text-white", evidenza, evidenzaTitolo, progresso, progressoAvviso, onClick, apri }: {
  label: string; value: string; aside?: string; hint: string; tone?: string;
  evidenza?: string; evidenzaTitolo?: string; progresso?: number; progressoAvviso?: boolean;
  onClick: () => void; apri?: boolean;
}) {
  return (
    <button type="button" role="cell" onClick={onClick} aria-label={`Apri dettagli: ${label}`}
      className="min-w-0 rounded-xl border border-white/20 bg-white/[0.08] px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2 focus-visible:ring-offset-eic-navy-deep max-sm:rounded-lg max-sm:px-2 max-sm:py-1.5">
      <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-blue-100 max-sm:text-[9px] max-sm:leading-tight">
        {label}{apri && <ArrowUpRight className="ml-auto h-3.5 w-3.5 max-sm:hidden" aria-hidden />}
      </span>
      <span className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className={`text-lg font-bold leading-tight tabular-nums max-sm:text-[13px] ${tone}`}>{value}</span>
        {aside && <span className={`text-sm font-semibold tabular-nums max-sm:text-[11px] ${tone}`}>{aside}</span>}
      </span>
      {evidenza && <span title={evidenzaTitolo} className="mt-1 block text-xs font-semibold text-orange-200 tabular-nums max-sm:mt-0.5 max-sm:text-[10px]">{evidenza}</span>}
      {progresso !== undefined && (
        <span role="progressbar" aria-label="Percentuale incassata" aria-valuenow={Math.round(progresso)} aria-valuemin={0} aria-valuemax={100}
          className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/15">
          <span className={`block h-full rounded-full ${progressoAvviso ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${progresso}%` }} />
        </span>
      )}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-blue-100 max-sm:hidden">{hint}</span>}
    </button>
  );
}
