/**
 * L'intestazione economica di una commessa in appalto.
 *
 * L'intestazione normale (`OrderFinancialOverview`) legge `total_amount`, il
 * piano incassi e le scadenze: su un lavoro per un appaltatore quei campi sono
 * vuoti per costruzione, e il titolare si trovava davanti cinque riquadri a
 * «0,00 €» e «Importo da definire» su un cantiere con cinquemila euro di
 * lavoro rendicontato. Un numero sbagliato e' peggio di nessun numero: qui il
 * cantiere vale quello che hai rendicontato.
 *
 * Quello che NON c'e', di proposito: fatturato e incassato in euro. Con la
 * fatturazione mensile cumulativa una fattura copre piu' cantieri, e spalmarla
 * su uno solo sarebbe inventare. La parte gia' diventata fattura si legge
 * dalle righe; il resto sta nei conti del committente, a un clic da qui.
 */
import { Banknote, FileText, LayoutDashboard, Percent, TrendingUp, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { euro } from "@/lib/clienti/schedaCliente";
import { accordoCommessa, margineCommessa, type TotaliCommessaAppalto } from "@/lib/appalto/rendiconto";

interface Props {
  totali: TotaliCommessaAppalto;
  /** 'a_corpo' | 'a_misura' */
  valorizzazione: string | null;
  /** A corpo e' questa la cifra concordata, non il tetto. */
  totalAmount: number | null;
  tettoImporto: number | null;
  committenteId: string | null;
  canViewAmounts: boolean;
  canViewMargins: boolean;
  caricamento?: boolean;
  onApriRendiconto: () => void;
}

function Riquadro({ label, value, hint, icon, tone, onClick }: {
  label: string; value: string; hint?: string; icon: React.ReactNode; tone?: string; onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className="min-w-0 rounded-xl border border-white/20 bg-white/[0.08] p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:bg-white/[0.14] max-sm:px-2.5 max-sm:py-2 sm:p-4"
    >
      <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-blue-100">
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-orange-200/25 bg-orange-400/15 text-orange-100 max-sm:hidden">{icon}</span>
        {label}
      </span>
      <span className={`mt-2 block text-base font-semibold tabular-nums max-sm:mt-1 max-sm:text-sm ${tone ?? "text-white"}`}>{value}</span>
      {hint && <span className="mt-1 block text-[11px] text-blue-100 max-sm:hidden">{hint}</span>}
    </Tag>
  );
}

export function RiepilogoAppaltoCommessa({
  totali, valorizzazione, totalAmount, tettoImporto, committenteId,
  canViewAmounts, canViewMargins, caricamento, onApriRendiconto,
}: Props) {
  if (!canViewAmounts && !canViewMargins) return null;

  /* La cifra di riferimento e cosa dire quando la si supera: a corpo e a
     misura non vogliono dire la stessa cosa. Vedi `accordoCommessa`. */
  const accordo = accordoCommessa({
    valorizzazione,
    totalAmount,
    tettoImporto,
    rendicontato: totali.rendicontato,
    extra: totali.extra,
    euro: (v) => euro(v, true),
  });

  /* A corpo il ricavo e' il concordato, non il rendiconto: sommare i margini
     delle righe sovrastima esattamente dello sforamento. Vedi `margineCommessa`. */
  const marg = margineCommessa({
    valorizzazione,
    riferimento: accordo.riferimento,
    totali,
    euro: (v) => euro(v, true),
  });

  const tonoMargine = marg.margine === null ? "text-white"
    : marg.margine < 0 ? "text-red-200"
      : totali.righeSenzaCosto > 0 ? "text-amber-200" : "text-emerald-200";

  return (
    <section aria-label="Riepilogo economico della commessa in appalto" className="overflow-hidden rounded-2xl border border-eic-navy-deep bg-eic-navy-deep p-3 text-white shadow-sm max-sm:p-2 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 max-sm:hidden">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_6px_16px_rgba(249,115,22,0.25)]"><LayoutDashboard className="h-4 w-4" /></span>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-100">Il cantiere in appalto, in numeri</h2>
        </div>
        <span className="hidden text-xs text-blue-100 sm:block">{accordo.etichetta}</span>
      </div>

      <div className={`grid grid-cols-2 gap-2 sm:gap-3 ${canViewAmounts && canViewMargins ? "md:grid-cols-4 xl:grid-cols-6" : "lg:grid-cols-4"}`}>
        {canViewAmounts && <>
          <Riquadro
            label="Rendicontato"
            value={caricamento ? "…" : euro(totali.rendicontato, true)}
            hint={accordo.nota}
            icon={<FileText className="h-3.5 w-3.5" />}
            tone={accordo.allarme ? "text-amber-200" : undefined}
            onClick={onApriRendiconto}
          />
          <Riquadro
            label="Da rendicontare"
            value={caricamento ? "…" : euro(totali.daRendicontare, true)}
            hint={totali.inBozza > 0 ? `${euro(totali.inBozza, true)} ancora in bozza` : "Lavoro fatto che il committente non ha visto"}
            icon={<Banknote className="h-3.5 w-3.5" />}
            tone={totali.daRendicontare > 0 ? "text-amber-200" : undefined}
            onClick={onApriRendiconto}
          />
        </>}
        {canViewMargins && <>
          <Riquadro
            label="Margine €"
            value={caricamento ? "…" : marg.margine === null ? "—" : euro(marg.margine, true)}
            hint={marg.nota}
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            tone={tonoMargine}
            onClick={onApriRendiconto}
          />
          <Riquadro
            label="Margine %"
            value={caricamento ? "…" : marg.marginePct === null ? "—" : `${marg.marginePct.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`}
            hint={marg.notaPct}
            icon={<Percent className="h-3.5 w-3.5" />}
            tone={tonoMargine}
            onClick={onApriRendiconto}
          />
        </>}
        {canViewAmounts && (
          <div className={`col-span-2 min-w-0 ${canViewMargins ? "md:col-span-4 xl:col-span-2" : ""} rounded-xl border border-white/20 bg-white/[0.08] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] max-sm:px-2.5 max-sm:py-2 sm:p-4`}>
            <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-blue-100">
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-orange-200/25 bg-orange-400/15 text-orange-100 max-sm:hidden"><Banknote className="h-3.5 w-3.5" /></span>
              Verso il committente
            </span>
            <span className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-blue-100">
              <span>Chiuso nei rendiconti <strong className="text-white tabular-nums">{euro(totali.chiuso, true)}</strong></span>
              <span>Già fatturato <strong className="text-white tabular-nums">{euro(totali.fatturato, true)}</strong></span>
            </span>
            <span className="mt-1.5 block text-[11px] text-blue-100">
              {/* Gli incassi non si spezzano per cantiere: con la fatturazione
                  cumulativa una fattura ne copre piu' d'uno. */}
              Incassi e ritenute si leggono sul committente.
            </span>
            {committenteId && (
              <Link
                to={`/azienda/committenti/${committenteId}`}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-orange-100 underline-offset-2 hover:underline"
              >
                I conti del committente <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
