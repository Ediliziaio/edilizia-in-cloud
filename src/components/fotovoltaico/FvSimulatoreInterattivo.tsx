/**
 * FvSimulatoreInterattivo — il cliente muove i parametri (prezzo energia,
 * autoconsumo, inflazione) e vede risparmio/rientro/guadagno aggiornarsi in
 * tempo reale, con la curva di cassa cumulata. È la leva di conversione #1
 * (gap vs Reonic/Autarc: "il cliente capisce subito i numeri e firma prima").
 *
 * Ricalcolo 100% client-side riusando il motore finanziario già testato
 * (`applicaOverride` + `calcolaKpiVariante` + `calcolaCassaCumulata`). È una
 * simulazione LIVE indicativa: il preventivo definitivo resta quello del server.
 */
import { useMemo, useState } from "react";
import { RotateCcw, SlidersHorizontal, Sun, Clock, PiggyBank, TrendingUp } from "lucide-react";
import {
  applicaOverride,
  calcolaKpiVariante,
} from "@/lib/fotovoltaico/varianti";
import { calcolaCassaCumulata, type InputCassaCumulata } from "@/lib/fotovoltaico/finanziaria";
import { CassaCumulataChart } from "@/components/fotovoltaico/CassaCumulataChart";
import { cn } from "@/lib/utils";

const eur = (v: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);

const anni = (v: number | null) =>
  v == null ? "oltre 25 anni" : `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })} anni`;

function Slider({
  label,
  display,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-slate-600">{label}</span>
        <span className="text-xs font-bold text-slate-900 tabular-nums">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-orange-500 cursor-pointer"
        aria-label={label}
      />
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Sun;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        accent ? "border-orange-200 bg-orange-50/50" : "border-slate-200 bg-white",
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-0.5">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-base font-bold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}

export function FvSimulatoreInterattivo({
  base,
  potenzaKwp,
  conAccumulo,
  className,
}: {
  base: InputCassaCumulata;
  potenzaKwp: number;
  conAccumulo: boolean;
  className?: string;
}) {
  const [costoKwh, setCostoKwh] = useState(base.costo_kwh_attuale);
  const [autoconsumo, setAutoconsumo] = useState(base.autoconsumo_pct);
  const [inflazione, setInflazione] = useState(base.inflazione_energia_pct);

  const { kpi, cassa } = useMemo(() => {
    const input = applicaOverride(base, {
      costo_kwh_attuale: costoKwh,
      autoconsumo_pct: autoconsumo,
      inflazione_energia_pct: inflazione,
    });
    return {
      kpi: calcolaKpiVariante({
        id: "sim",
        label: "Simulazione",
        potenza_kwp: potenzaKwp,
        con_accumulo: conAccumulo,
        cassa: input,
      }),
      cassa: calcolaCassaCumulata(input),
    };
  }, [base, costoKwh, autoconsumo, inflazione, potenzaKwp, conAccumulo]);

  const modificato =
    costoKwh !== base.costo_kwh_attuale ||
    autoconsumo !== base.autoconsumo_pct ||
    inflazione !== base.inflazione_energia_pct;

  const reset = () => {
    setCostoKwh(base.costo_kwh_attuale);
    setAutoconsumo(base.autoconsumo_pct);
    setInflazione(base.inflazione_energia_pct);
  };

  return (
    <section className={cn("rounded-2xl border border-slate-200 bg-white p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-orange-500" />
            Simula il tuo risparmio
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Muovi i parametri e guarda come cambiano risparmio e rientro dell'investimento.
          </p>
        </div>
        {modificato && (
          <button
            type="button"
            onClick={reset}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="h-3 w-3" /> Ripristina
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <Slider
          label="Prezzo energia oggi"
          display={`${costoKwh.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kWh`}
          value={costoKwh}
          min={0.15}
          max={0.5}
          step={0.01}
          onChange={setCostoKwh}
        />
        <Slider
          label="Energia che usi quando produci"
          display={`${Math.round(autoconsumo * 100)}%`}
          value={autoconsumo}
          min={0.2}
          max={0.95}
          step={0.05}
          onChange={setAutoconsumo}
        />
        <Slider
          label="Aumento prezzo energia / anno"
          display={`${(inflazione * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`}
          value={inflazione}
          min={0}
          max={0.06}
          step={0.005}
          onChange={setInflazione}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        <KpiTile
          icon={PiggyBank}
          label="Risparmio 1° anno"
          value={`${eur(kpi.beneficio_lordo_anno_1_eur)}`}
          accent
        />
        <KpiTile icon={Clock} label="Rientro" value={anni(kpi.payback_anni)} accent />
        <KpiTile icon={TrendingUp} label="Guadagno netto 25 anni" value={eur(kpi.beneficio_totale_eur)} />
        <KpiTile
          icon={Sun}
          label="Costo kWh prodotto"
          value={`${kpi.lcoe_eur_kwh.toLocaleString("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/kWh`}
        />
      </div>

      <CassaCumulataChart cassa={cassa} payback={kpi.payback_anni} />

      <p className="text-[10px] text-slate-400 mt-3 leading-snug">
        Simulazione live indicativa basata sulla configurazione scelta. Il preventivo definitivo è
        calcolato dal nostro sistema sui componenti e gli incentivi reali.
      </p>
    </section>
  );
}
