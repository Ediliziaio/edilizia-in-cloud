/**
 * «Speso contro piano»: il grafico a linea della Panoramica (14/11/2026).
 *
 * Linea piena arancione = quanto si è speso davvero, cumulato, fino a oggi; tratteggiata grigia
 * = quanto il piano prevedeva di aver speso a ogni mese, fino alla fine. La linea verticale
 * segna oggi; i punti evidenziati sono oggi e il mese in cui il piano tocca il massimo.
 * Le linee si disegnano con un'animazione breve, spenta per chi chiede meno movimento.
 */
import { useMemo, useState } from "react";
import { ArrowUpRight, CalendarClock, LineChart as IconaLinea, Target, TrendingDown, TrendingUp } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { useSearchParams } from "react-router-dom";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/line-charts-9";
import { useGeneralePianoNumeri } from "@/hooks/useGeneralePiano";
import { formattaEuro, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { serieSpesaPianoReale, type PuntoSpesa } from "@/lib/orders/generali/serieSpesa";
import { nomeMese } from "../piano/formato";
import type * as React from "react";
import { cn } from "@/lib/utils";

const config = {
  speso: { label: "Speso", color: "#ea580c" },
  piano: { label: "Previsto dal piano", color: "#94a3b8" },
} satisfies ChartConfig;

const meseBreve = (m: string) => {
  const n = nomeMese(m);
  return n === "—" ? m : `${n.slice(0, 3)} ${m.slice(2, 4)}`;
};

/** «1,4 mln €», «350k €», «800 €»: sull'asse c'è poco spazio. */
const asseBreve = (v: number) =>
  Math.abs(v) >= 1_000_000
    ? `${(v / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} mln €`
    : Math.abs(v) >= 1000
      ? `${Math.round(v / 1000).toLocaleString("it-IT")}k €`
      : `${Math.round(v)} €`;

const menoMovimento = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Suggerimento({ active, payload }: { active?: boolean; payload?: Array<{ payload: PuntoSpesa }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const diff = p.speso == null ? null : p.speso - p.piano;
  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-lg">
      <div className="mb-1.5 text-muted-foreground">{nomeMese(p.mese)}</div>
      {p.speso != null && (
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-muted-foreground">Speso</span>
          <span className="text-sm font-semibold tabular-nums">{formattaEuro(p.speso)}</span>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-muted-foreground">Piano</span>
        <span className="tabular-nums">{formattaEuro(p.piano)}</span>
      </div>
      {diff != null && Math.abs(diff) >= 1 && (
        <div className={cn("mt-1 text-right font-medium tabular-nums", diff > 0 ? "text-red-600" : "text-emerald-600")}>
          {diff > 0 ? "+" : "−"}
          {formattaEuro(Math.abs(diff))} {diff > 0 ? "sopra il piano" : "sotto il piano"}
        </div>
      )}
    </div>
  );
}

export function GraficoSpesa({ riepilogo }: { riepilogo: RiepilogoGenerale }) {
  const n = useGeneralePianoNumeri(riepilogo);
  const [parametri, setParametri] = useSearchParams();
  const [sotto, setSotto] = useState<number | null>(null);
  const serie = useMemo(
    () => (n.reale?.permessi.costi ? serieSpesaPianoReale(n.voci, n.reale.righe, n.reale.oggi) : null),
    [n.voci, n.reale],
  );
  if (!riepilogo.permessi.costi || n.isLoading || n.isError || !serie || serie.punti.length < 2) return null;

  const animare = !menoMovimento();
  const picco = serie.punti.reduce((a, b) => (b.piano > a.piano ? b : a), serie.punti[0]);
  const meseMaxPiano = serie.punti.find((p) => p.piano === picco.piano)?.mese;
  const sopra = serie.differenza > 0;
  const quota = serie.pianoTotale > 0 ? Math.min(100, (serie.spesoOggi / serie.pianoTotale) * 100) : null;
  // L'area si accende fino al mese sotto il mouse; il resto resta in trasparenza.
  const dati = serie.punti.map((p, i) => ({ ...p, acceso: sotto == null || i <= sotto ? p.speso : null }));
  const iOggi = serie.punti.findIndex((p) => p.mese === serie.oggi);
  const prossimi = iOggi >= 0 ? serie.punti.slice(iOggi + 1, iOggi + 4) : [];
  const usciteProssime = prossimi.length ? (prossimi.at(-1)!.piano - serie.pianoOggi) : 0;
  const dovrei = serie.pianoTotale > 0 ? Math.min(100, (serie.pianoOggi / serie.pianoTotale) * 100) : null;
  const apriPiano = () => {
    const p = new URLSearchParams(parametri);
    p.set("scheda", "piano");
    p.set("vista-piano", "cassa");
    setParametri(p);
  };

  return (
    <section aria-labelledby="grafico-spesa-titolo" className="generale-panel">
      <header className="generale-panel-heading">
        <div className="generale-panel-title">
          <span className="generale-section-icon">
            <IconaLinea aria-hidden="true" />
          </span>
          <div>
            <h2 id="grafico-spesa-titolo">Speso contro piano</h2>
            <p>Costi cumulati mese per mese · importi netti</p>
          </div>
        </div>
        <button type="button" onClick={apriPiano} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          Cassa del piano <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4 px-5 pb-5 pt-4 xl:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-3xl font-bold tabular-nums">{formattaEuro(serie.spesoOggi)}</span>
          <span className="text-sm text-muted-foreground">spesi a {nomeMese(serie.oggi).toLowerCase()}</span>
          {serie.pianoOggi > 0 && Math.abs(serie.differenza) >= 1 && (
            <span className={cn("inline-flex items-center gap-1 text-sm font-medium", sopra ? "text-red-600" : "text-emerald-600")}>
              {sopra ? <TrendingUp className="h-4 w-4" aria-hidden="true" /> : <TrendingDown className="h-4 w-4" aria-hidden="true" />}
              {sopra ? "+" : "−"}
              {formattaEuro(Math.abs(serie.differenza))} rispetto al piano
            </span>
          )}
        </div>

        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <div className="flex gap-1.5">
            <dt>Piano a oggi:</dt>
            <dd className="font-medium text-slate-600">{formattaEuro(serie.pianoOggi)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Piano a fine lavori:</dt>
            <dd className="font-medium text-slate-600">{formattaEuro(serie.pianoTotale)}</dd>
          </div>
          {quota != null && (
            <div className="flex gap-1.5">
              <dt>Speso sul totale:</dt>
              <dd className="font-medium text-orange-600">{quota.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%</dd>
            </div>
          )}
        </dl>

        <ChartContainer config={config} className="aspect-auto h-72 w-full [&_.recharts-curve.recharts-tooltip-cursor]:stroke-[initial]">
          <ComposedChart
            data={dati}
            margin={{ top: 16, right: 12, left: 4, bottom: 8 }}
            accessibilityLayer
            onMouseMove={(st: { activeTooltipIndex?: number | string | null }) => {
              const i = Number(st?.activeTooltipIndex);
              setSotto(Number.isFinite(i) ? i : null);
            }}
            onMouseLeave={() => setSotto(null)}
          >
            <defs>
              <linearGradient id="spesa-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-speso)" stopOpacity={0.08} />
                <stop offset="100%" stopColor="var(--color-speso)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="spesa-area-accesa" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-speso)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-speso)" stopOpacity={0.02} />
              </linearGradient>
              <pattern id="spesa-punti" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="1" fill="hsl(var(--border))" fillOpacity="0.6" />
              </pattern>
              <filter id="spesa-ombra-punto" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.35)" />
              </filter>
              <filter id="spesa-alone" x="-20%" y="-50%" width="140%" height="200%">
                <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="rgba(234,88,12,0.35)" />
              </filter>
            </defs>
            <rect x="0" y="0" width="100%" height="100%" fill="url(#spesa-punti)" style={{ pointerEvents: "none" }} />
            <CartesianGrid strokeDasharray="4 8" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="mese" axisLine={false} tickLine={false} tickMargin={12} minTickGap={24} tickFormatter={meseBreve} tick={{ fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tickMargin={8} width={60} tickFormatter={asseBreve} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<Suggerimento />} cursor={{ strokeDasharray: "3 3", stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.5 }} />
            <ReferenceLine
              x={serie.oggi}
              stroke="var(--color-speso)"
              strokeDasharray="4 4"
              label={{ value: "oggi", position: "insideTopRight", fill: "var(--color-speso)", fontSize: 11 }}
            />
            <Line
              type="monotone"
              dataKey="piano"
              stroke="var(--color-piano)"
              strokeWidth={1.75}
              strokeDasharray="6 5"
              dot={(p: { cx?: number; cy?: number; payload?: PuntoSpesa }) =>
                p.payload?.mese === meseMaxPiano && p.cx != null && p.cy != null ? (
                  <circle key={`piano-${p.payload.mese}`} cx={p.cx} cy={p.cy} r={4} fill="var(--color-piano)" stroke="white" strokeWidth={2} />
                ) : (
                  <g key={`piano-${p.payload?.mese}`} />
                )
              }
              activeDot={{ r: 4, fill: "var(--color-piano)", stroke: "white", strokeWidth: 2 }}
              isAnimationActive={animare}
              animationDuration={900}
            />
            <Area type="monotone" dataKey="speso" stroke="none" fill="url(#spesa-area)" isAnimationActive={animare} animationDuration={900} connectNulls={false} legendType="none" tooltipType="none" />
            <Area type="monotone" dataKey="acceso" stroke="none" fill="url(#spesa-area-accesa)" isAnimationActive={false} connectNulls={false} legendType="none" tooltipType="none" />
            <Line
              type="monotone"
              dataKey="speso"
              stroke="var(--color-speso)"
              strokeWidth={2.5}
              filter="url(#spesa-alone)"
              connectNulls={false}
              dot={(p: { cx?: number; cy?: number; payload?: PuntoSpesa }) =>
                p.payload?.mese === serie.oggi && p.cx != null && p.cy != null ? (
                  <circle key={`speso-${p.payload.mese}`} cx={p.cx} cy={p.cy} r={6} fill="var(--color-speso)" stroke="white" strokeWidth={2} filter="url(#spesa-ombra-punto)" />
                ) : (
                  <g key={`speso-${p.payload?.mese}`} />
                )
              }
              activeDot={{ r: 6, fill: "var(--color-speso)", stroke: "white", strokeWidth: 2, filter: "url(#spesa-ombra-punto)" }}
              isAnimationActive={animare}
              animationDuration={1100}
            />
          </ComposedChart>
        </ChartContainer>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded bg-orange-600" aria-hidden="true" /> Speso, fino a oggi
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0 w-5 border-t-2 border-dashed border-slate-400" aria-hidden="true" /> Previsto dal piano
          </span>
          {serie.vociSenzaImporto > 0 && (
            <span className="text-amber-700">
              Il piano non conta ancora {serie.vociSenzaImporto} {serie.vociSenzaImporto === 1 ? "voce" : "voci"} senza stima.
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="generale-appare flex flex-1 flex-col justify-between rounded-2xl bg-slate-900 p-5 text-white shadow-lg" style={{ "--i": 1 } as React.CSSProperties}>
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              <Target className="h-3 w-3" aria-hidden="true" /> Budget speso
            </p>
            <h3 className="text-lg font-semibold tracking-tight">Dove siamo sul piano</h3>
          </div>
          {quota != null ? (
            <div className="mt-6">
              <div className="mb-2 flex items-end justify-between">
                <span className="text-3xl font-semibold tabular-nums tracking-tight">{quota.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%</span>
                {dovrei != null && <span className="mb-1 text-xs text-slate-400">a oggi il piano dice {dovrei.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%</span>}
              </div>
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                <div className="generale-barra-crescita h-full rounded-full bg-white" style={{ width: `${quota}%` }} />
                {dovrei != null && <div className="absolute inset-y-[-2px] w-0.5 bg-orange-400" style={{ left: `${dovrei}%` }} title="Dove dice il piano a oggi" />}
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm text-slate-300">Il piano non ha ancora importi di costo: completa le stime per vedere a che punto sei.</p>
          )}
        </div>
        <div className="generale-appare flex-1 rounded-2xl border border-border bg-muted/40 p-5" style={{ "--i": 2 } as React.CSSProperties}>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
            </span>
            <h3 className="font-semibold">Prossimi tre mesi</h3>
          </div>
          {prossimi.length ? (
            <p className="text-sm text-muted-foreground">
              Il piano prevede di spendere <span className="font-semibold text-foreground">{formattaEuro(usciteProssime)}</span> fino a {nomeMese(prossimi.at(-1)!.mese).toLowerCase()}.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Il piano finisce qui: nessuna uscita prevista dopo oggi.</p>
          )}
        </div>
      </div>
      </div>
    </section>
  );
}
