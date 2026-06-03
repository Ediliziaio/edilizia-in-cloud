/**
 * FvConfrontoVarianti — affianca 2-3 configurazioni dell'impianto (la scelta +
 * "più potenza" + "con/senza accumulo") con i KPI chiave e una variante
 * "consigliata", per aiutare il cliente a decidere (gap vs Reonic/Autarc:
 * "3-5 varianti", "il cliente capisce i numeri e firma prima").
 *
 * I numeri delle varianti diverse dalla base sono una STIMA INDICATIVA lato
 * client (stessi costi marginali e modello autoconsumo del server): il valore
 * definitivo resta quello ricalcolato dal server sulla configurazione scelta.
 */
import { useMemo } from "react";
import { Check, Clock, PiggyBank, Sun, TrendingUp, Wallet, Zap } from "lucide-react";
import {
  costruisciConfrontoVicino,
  type ContestoVariantiVicine,
  type VarianteKPI,
} from "@/lib/fotovoltaico/varianti";
import { cn } from "@/lib/utils";

const eur = (v: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);

const anni = (v: number | null) =>
  v == null
    ? "oltre 25 anni"
    : `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })} anni`;

const pct = (v: number) => `${Math.round(v * 100)}%`;

const lcoe = (v: number) =>
  `${v.toLocaleString("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/kWh`;

function Kpi({
  icon: Icon,
  label,
  value,
  strong,
}: {
  icon: typeof Sun;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        {label}
      </span>
      <span className={cn("text-sm tabular-nums", strong ? "font-bold text-slate-900" : "font-semibold text-slate-700")}>
        {value}
      </span>
    </div>
  );
}

function VarianteCard({ v }: { v: VarianteKPI }) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border p-4 flex flex-col transition-shadow",
        v.is_consigliata
          ? "border-orange-300 bg-orange-50/40 shadow-md ring-1 ring-orange-200"
          : "border-slate-200 bg-white",
      )}
    >
      {v.is_consigliata && (
        <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-orange-500 to-amber-400 px-2.5 py-0.5 text-[10px] font-bold text-white shadow">
          <Check className="h-3 w-3" /> Consigliata
        </span>
      )}

      <div className="mb-2">
        <h4 className="text-sm font-bold text-slate-900">{v.label}</h4>
        {v.descrizione && <p className="text-[11px] text-slate-500 mt-0.5">{v.descrizione}</p>}
      </div>

      <div className="flex flex-wrap gap-1 mb-2 min-h-[18px]">
        {v.is_best_payback && (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 border border-emerald-200">
            <Clock className="h-2.5 w-2.5" /> Rientro più rapido
          </span>
        )}
        {v.is_best_npv && (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700 border border-blue-200">
            <TrendingUp className="h-2.5 w-2.5" /> Massimo guadagno
          </span>
        )}
      </div>

      <div className="mt-auto">
        <Kpi icon={Wallet} label="Investimento" value={eur(v.investimento_eur)} />
        <Kpi icon={PiggyBank} label="Risparmio 1° anno" value={`${eur(v.beneficio_lordo_anno_1_eur)}/anno`} strong />
        <Kpi icon={Clock} label="Rientro" value={anni(v.payback_anni)} strong />
        <Kpi icon={TrendingUp} label="Guadagno netto 25 anni" value={eur(v.beneficio_totale_eur)} />
        <Kpi icon={Sun} label="Autoconsumo" value={pct(v.autoconsumo_pct)} />
        <Kpi icon={Zap} label="Costo kWh prodotto" value={lcoe(v.lcoe_eur_kwh)} />
      </div>
    </div>
  );
}

export function FvConfrontoVarianti({
  ctx,
  className,
}: {
  ctx: ContestoVariantiVicine | null;
  className?: string;
}) {
  const confronto = useMemo(() => (ctx ? costruisciConfrontoVicino(ctx) : null), [ctx]);

  // Serve almeno un'alternativa oltre alla base per avere senso.
  if (!confronto || confronto.varianti.length < 2) return null;

  return (
    <section className={cn("rounded-2xl border border-slate-200 bg-white p-4 sm:p-5", className)}>
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Sun className="h-4 w-4 text-orange-500" />
          Confronta le soluzioni
        </h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Tre scenari a confronto: scegli quello giusto per il cliente. Evidenziata la soluzione
          con il miglior equilibrio tra spesa e rendimento.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {confronto.varianti.map((v) => (
          <VarianteCard key={v.id} v={v} />
        ))}
      </div>

      <p className="text-[10px] text-slate-400 mt-3 leading-snug">
        Stima indicativa: gli scenari diversi dalla configurazione scelta usano i costi medi €/kWp
        e €/kWh del tuo listino. Il preventivo definitivo è calcolato sui componenti reali della
        configurazione selezionata.
      </p>
    </section>
  );
}
