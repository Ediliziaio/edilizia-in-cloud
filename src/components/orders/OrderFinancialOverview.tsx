import { type ModalitaCostoFinanziaria } from "@/lib/finanziamenti/costoFinanziaria";
import { ArrowUpRight, LayoutDashboard } from "lucide-react";
import { format, parseISO } from "date-fns";
import { dateFnsCampo, intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { formatCurrency } from "@/lib/formatters";
import { calculateGrossFromNet } from "@/lib/vatUtils";
import { useOrderEconomicsBase } from "@/hooks/useOrderEconomicsBase";
import { useImpegniAcquisti } from "@/hooks/useImpegniAcquisti";
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
  totalePattuitoConIvaMista?: number;
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
  financingCostMode?: ModalitaCostoFinanziaria | null;
  varianti?: ReadonlyArray<VarianteDatata>;
  canViewAmounts: boolean;
  canViewMargins: boolean;
  /** Il «da pagare» si vede col permesso sui costi (come la cassa); se manca vale quello sui margini. */
  canViewCosts?: boolean;
  onOpenEconomics: () => void;
  onOpenPayments: () => void;
}

const pctTesto = (n: number | null) => (n == null ? "" : `${n.toLocaleString(intlCampo(), { maximumFractionDigits: 1 })}%`);

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
  const t = useT();
  const { totalAmount, vatRate, items, canViewAmounts, canViewMargins } = props;
  const canViewCosts = props.canViewCosts ?? canViewMargins;
  const { actual, quality, isPending, isError } = useOrderEconomicsBase(props.orderId, totalAmount, items, canViewMargins);
  const impegni = useImpegniAcquisti(props.orderId, canViewMargins && canViewCosts);
  const impegno = impegni.data?.impegno ?? 0;
  const conImpegni = impegno > 0.005;
  const distinzioneDisponibile = impegni.isSuccess;
  const previsto = useCostoPrevistoCommessa(props.orderId, canViewMargins);
  const { esposizione, isLoading: cassaLoading, isError: cassaError } = useEsposizioneCommessa({
    orderId: props.orderId,
    totalAmount,
    vatRate,
    financingCost: props.financingCost ?? 0,
    financingCostMode: props.financingCostMode,
    installments: props.installments,
    varianti: props.varianti,
    enabled: canViewCosts,
  });
  if (!canViewAmounts && !canViewMargins) return null;

  const loading = isPending || props.itemsLoading;
  const error = isError || props.itemsError;
  const realeReady = !loading && !error && quality.canShowMargin;
  const costiReady = !loading && !error;
  const previstoReady = !previsto.isLoading && !previsto.isError;
  // Il ricavo della vista (contratto + varianti approvate), lo stesso del margine reale:
  // previsto, stima e percentuali stanno sulla stessa base. Finché la vista non c'è, il contratto.
  const ricavo = actual.revenue > 0 ? actual.revenue : totalAmount;
  const numeri = numeriCommessa({
    ricavo,
    costoPrevistoLavorazioni: previsto.costo,
    lavorazioniSenzaPrevisto: previsto.lavorazioniSenzaPrevisto,
    provvigioni: actual.commissions,
    costiReali: actual.costs,
    margineReale: actual.margin,
  });
  const grossAmount = props.totalePattuitoConIvaMista ?? calculateGrossFromNet(totalAmount, vatRate).grossAmount;
  const etichettaIva = props.totalePattuitoConIvaMista == null
    ? t("IVA {aliquota}%", { aliquota: vatRate.toLocaleString(intlCampo(), { maximumFractionDigits: 2 }) })
    : t("IVA mista 10% e 22%");
  const payments = paymentOverview(props.cashTotalGross, props.collectedGross, props.installments);
  const paymentReady = !props.installmentsLoading && !props.installmentsError;

  const realeHint = error
    ? t("Costi non disponibili")
    : loading
      ? t("Caricamento costi…")
      : quality.status === "ready" ? t("Sui costi registrati") : quality.issues[0]?.label ?? quality.label;
  const scarto = numeri.scostamento;
  const fine = realeReady && previstoReady ? numeri.aFinire : null;
  const costiHint = !costiReady
    ? realeHint
    : numeri.reale.costi === 0 ? t("Nessun costo registrato")
    : !fine || scarto == null
      ? t("Sui costi registrati")
    : scarto > 0.5
      ? t("Oltre il previsto di {importo}", { importo: formatCurrency(scarto) })
      : t(conImpegni ? "Coperto da costi e impegni il {percentuale}% del previsto · restano {importo}" : "Speso il {percentuale}% del previsto · restano {importo}", { percentuale: fine.spesoPct, importo: formatCurrency(fine.residuo) });
  const previstoHint = !previstoReady
    ? previsto.isError ? t("Lavorazioni non disponibili") : t("Caricamento lavorazioni…")
    : !numeri.previsto
      ? t("Nessuna lavorazione ha un costo previsto")
      : numeri.previsto.lavorazioniSenzaPrevisto > 0
        ? t("Parziale: {n} di {totale} lavorazioni senza costo previsto", { n: numeri.previsto.lavorazioniSenzaPrevisto, totale: previsto.lavorazioni })
        : t("Dalle lavorazioni e dalle provvigioni");
  // Tutte le lavorazioni senza un costo completo: il margine sarebbe il contratto meno quasi niente
  // (99,7% su una commessa dal computo senza listino, 17/11/2026). Si mostra il costo, non il margine.
  const margineIgnoto = !!numeri.previsto && previsto.lavorazioni > 0 && numeri.previsto.lavorazioniSenzaPrevisto >= previsto.lavorazioni;
  const toneMargine = (m: number, parziale: boolean) => (m < 0 ? "text-red-200" : parziale ? "text-amber-200" : "text-emerald-200");

  // Sul telefono i numeri di una riga stanno affiancati, sotto il nome della riga.
  const perRiga = (canViewAmounts ? 1 : 0) + (canViewMargins ? 2 : 0);
  const colonne = perRiga === 3
    ? "grid-cols-3 sm:grid-cols-[6.5rem_repeat(3,minmax(0,1fr))]"
    : perRiga === 2 ? "grid-cols-2 sm:grid-cols-[6.5rem_repeat(2,minmax(0,1fr))]" : "grid-cols-1 sm:grid-cols-[6.5rem_minmax(0,1fr)]";

  return (
    <section aria-label={t("Riepilogo economico commessa")} className="commessa-financial-overview overflow-hidden rounded-2xl border border-eic-navy-deep bg-eic-navy-deep p-3 text-white shadow-sm sm:p-4 max-sm:p-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 max-sm:hidden">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="commessa-summary-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"><LayoutDashboard className="h-4 w-4" /></span>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-100">{t("La commessa in numeri")}</h2>
        </div>
        <span className="hidden text-xs text-blue-100 sm:block">{t("Importi senza IVA, tranne contratto, incassi e da pagare")}</span>
      </div>

      <div role="table" aria-label={t("Previsto e reale")} className={`grid gap-1.5 sm:gap-2 ${colonne}`}>
        {/* Intestazione delle colonne, solo da tablet in su */}
        <div role="row" className="contents max-sm:hidden">
          <span role="columnheader" />
          {canViewAmounts && <span role="columnheader" className="px-1 text-[11px] font-medium uppercase tracking-wide text-blue-200">{t("Ricavi")}</span>}
          {canViewMargins && <>
            <span role="columnheader" className="px-1 text-[11px] font-medium uppercase tracking-wide text-blue-200">{t("Costi")}</span>
            <span role="columnheader" className="px-1 text-[11px] font-medium uppercase tracking-wide text-blue-200">{t("Margine")}</span>
          </>}
        </div>

        {/* PREVISTO */}
        <div role="row" className="contents">
          <Etichetta titolo={t("Previsto")} sotto={t("dal contratto")} />
          {canViewAmounts && (
            <Cella label={t("Contratto")} value={formatCurrency(grossAmount)} hint={`${t("Imponibile {importo}", { importo: formatCurrency(totalAmount) })} · ${etichettaIva}${Math.abs(actual.approvedVariations) > 0.005 ? ` · ${t("varianti {segno}{importo}", { segno: actual.approvedVariations > 0 ? "+" : "−", importo: formatCurrency(Math.abs(actual.approvedVariations)) })}` : ""}`} onClick={props.onOpenPayments} />
          )}
          {canViewMargins && <>
            <Cella label={t("Costo previsto")} value={previstoReady && numeri.previsto ? formatCurrency(numeri.previsto.costo) : "—"} hint={previstoHint} onClick={props.onOpenEconomics} />
            <Cella
              label={t("Margine previsto")}
              value={previstoReady && numeri.previsto && !margineIgnoto ? formatCurrency(numeri.previsto.margine) : "—"}
              aside={previstoReady && numeri.previsto && !margineIgnoto ? pctTesto(numeri.previsto.marginePct) : undefined}
              hint={previstoReady && numeri.previsto && !margineIgnoto ? t("Se i costi restano quelli previsti") : margineIgnoto ? t("Nessuna lavorazione ha il costo completo") : previstoHint}
              tone={previstoReady && numeri.previsto && !margineIgnoto ? toneMargine(numeri.previsto.margine, numeri.previsto.lavorazioniSenzaPrevisto > 0) : "text-white"}
              onClick={props.onOpenEconomics}
            />
          </>}
        </div>

        {/* REALE */}
        <div role="row" className="contents">
          <Etichetta titolo={t("Reale")} sotto={t("ad oggi")} />
          {canViewAmounts && (
            <Cella
              label={t("Incassato")}
              value={paymentReady ? formatCurrency(props.collectedGross) : props.installmentsError ? t("Non disponibile") : "…"}
              aside={paymentReady ? t(payments.status) : undefined}
              hint={!paymentReady ? "" : payments.excess > 0.01
                ? t("Eccedenza {importo}", { importo: formatCurrency(payments.excess) })
                : payments.remaining <= 0.01 && props.cashTotalGross > 0
                  ? t("Tutto incassato")
                  : `${t("Da incassare {importo}", { importo: formatCurrency(payments.remaining) })}${payments.nextDate ? ` · ${t(payments.overdue ? "scaduta il {data}" : "prossima {data}", { data: format(parseISO(payments.nextDate), "d MMM", { locale: dateFnsCampo() }) })}` : ""}`}
              tone={payments.overdue || payments.excess > 0.01 ? "text-red-200" : payments.status === "Saldato" ? "text-emerald-200" : "text-white"}
              progresso={paymentReady ? payments.percent : undefined}
              progressoNome={t("Percentuale incassata")}
              progressoColore={payments.overdue ? "bg-amber-400" : "bg-emerald-400"}
              onClick={props.onOpenPayments}
              apri
            />
          )}
          {canViewMargins && <>
            <Cella
              label={conImpegni || !distinzioneDisponibile ? t("Costi e impegni") : t("Costi registrati")}
              value={costiReady ? formatCurrency(numeri.reale.costi) : "—"}
              hint={costiHint}
              dettaglio={costiReady ? [dettaglioCosti(actual, t), distinzioneDisponibile
                ? t("{costi} costi registrati · {impegni} impegni ODA oltre i costi registrati", { costi: formatCurrency(Math.max(0, actual.costs - impegno)), impegni: formatCurrency(impegno) })
                : impegni.isError ? t("Distinzione tra costi e impegni non disponibile") : t("Verifico gli impegni degli ordini…")].filter(Boolean).join(' · ') : undefined}
              progresso={fine ? Math.min(100, fine.spesoPct) : undefined}
              progressoNome={conImpegni ? t("Previsto coperto da costi e impegni") : t("Previsto già speso")}
              progressoColore={fine ? (fine.spesoPct > 100 ? "bg-red-400" : fine.spesoPct > 90 ? "bg-amber-400" : "bg-sky-400") : undefined}
              evidenza={canViewCosts && !cassaLoading && !cassaError && esposizione.daPagare > 0.005
                ? t("Da pagare {importo}", { importo: formatCurrency(esposizione.daPagare) })
                : canViewCosts && !cassaLoading && !cassaError && costiReady && numeri.reale.costi > 0 ? t("Nessun costo registrato da pagare") : undefined}
              evidenzaTitolo={t("Costi registrati non ancora pagati (fatture, costi della commessa, provvigioni), IVA compresa. Gli ordini ai fornitori non ancora fatturati non ci sono.")}
              onClick={props.onOpenEconomics}
            />
            <Cella
              label={conImpegni || !distinzioneDisponibile ? t("Margine con impegni") : t("Margine su costi registrati")}
              value={realeReady ? formatCurrency(numeri.reale.margine) : "—"}
              aside={realeReady ? pctTesto(numeri.reale.marginePct) : undefined}
              evidenza={fine ? t("A fine lavori ≈ {importo} · {percentuale}", { importo: formatCurrency(fine.margine), percentuale: pctTesto(fine.marginePct) }) : undefined}
              evidenzaTitolo={t("Stima: ai costi sostenuti si aggiunge il previsto che resta da spendere. Se si è già oltre il previsto, contano i costi veri.")}
              evidenzaTono={fine && fine.margine < 0 ? "text-red-200" : "text-emerald-200"}
              hint={!realeReady ? realeHint : conImpegni ? t("Include gli impegni degli ODA, anche se non ancora fatturati") : fine && fine.residuo > 0.5 ? t("Ad oggi: ricavo intero meno i costi registrati") : quality.label}
              tone={realeReady ? toneMargine(numeri.reale.margine, quality.status === "partial") : "text-white"}
              onClick={props.onOpenEconomics}
            />
          </>}
        </div>
      </div>
    </section>
  );
}

/** Di cosa sono fatti i costi sostenuti: gli stessi addendi della vista, senza IVA. */
function dettaglioCosti(a: { purchases: number; warehouseMaterials: number; labor: number; commissions: number; directCosts: number; errors: number; mileageReimbursements: number }, t: ReturnType<typeof useT>) {
  const merce = a.purchases + a.warehouseMaterials;
  const altro = a.commissions + a.directCosts + a.errors + a.mileageReimbursements;
  return [
    merce > 0.005 && t("Merce {importo}", { importo: formatCurrency(merce) }),
    a.labor > 0.005 && t("Manodopera e ditte {importo}", { importo: formatCurrency(a.labor) }),
    altro > 0.005 && t("Altro {importo}", { importo: formatCurrency(altro) }),
  ].filter(Boolean).join(" · ");
}

function Etichetta({ titolo, sotto }: { titolo: string; sotto: string }) {
  return (
    <div role="rowheader" className="col-span-full flex items-center gap-2 px-1 sm:col-span-1 sm:flex-col sm:items-start sm:justify-center sm:gap-0">
      <span className="text-sm font-semibold text-white">{titolo}</span>
      <span className="text-[11px] text-blue-200">{sotto}</span>
    </div>
  );
}

function Cella({ label, value, aside, hint, dettaglio, tone = "text-white", evidenza, evidenzaTitolo, evidenzaTono = "text-orange-200", progresso, progressoNome, progressoColore = "bg-emerald-400", onClick, apri }: {
  label: string; value: string; aside?: string; hint: string; dettaglio?: string; tone?: string;
  evidenza?: string; evidenzaTitolo?: string; evidenzaTono?: string;
  progresso?: number; progressoNome?: string; progressoColore?: string;
  onClick: () => void; apri?: boolean;
}) {
  const t = useT();
  return (
    <button type="button" role="cell" onClick={onClick} aria-label={t("Apri dettagli: {voce}", { voce: label })}
      className="commessa-summary-card min-w-0 rounded-xl border border-white/20 bg-white/[0.08] px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2 focus-visible:ring-offset-eic-navy-deep max-sm:rounded-lg max-sm:px-2 max-sm:py-1.5">
      <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-blue-100 max-sm:text-[11px] max-sm:normal-case max-sm:tracking-normal max-sm:leading-tight">
        {label}{apri && <ArrowUpRight className="ml-auto h-3.5 w-3.5 max-sm:hidden" aria-hidden />}
      </span>
      <span className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className={`commessa-summary-value text-lg font-bold leading-tight tabular-nums max-sm:text-[13px] ${tone}`}>{value}</span>
        {aside && <span className={`text-sm font-semibold tabular-nums max-sm:text-[11px] ${tone}`}>{aside}</span>}
      </span>
      {evidenza && <span title={evidenzaTitolo} className={`mt-1 block text-xs font-semibold tabular-nums ${evidenzaTono} max-sm:hidden`}>{evidenza}</span>}
      {progresso !== undefined && (
        <span role="progressbar" aria-label={progressoNome} aria-valuenow={Math.round(progresso)} aria-valuemin={0} aria-valuemax={100}
          className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/15">
          <span className={`block h-full rounded-full ${progressoColore}`} style={{ width: `${progresso}%` }} />
        </span>
      )}
      {hint && <span className="commessa-summary-note mt-1 block text-[11px] leading-snug text-blue-100 max-sm:hidden">{hint}</span>}
      {dettaglio && <span className="mt-0.5 block text-[11px] leading-snug text-blue-200/80 tabular-nums max-sm:hidden">{dettaglio}</span>}
    </button>
  );
}
