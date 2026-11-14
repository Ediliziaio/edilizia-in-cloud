/**
 * «Previsto contro reale»: il grafico a linea della Panoramica (14/11/2026).
 *
 * Tre misure, a scelta: costi (speso contro budget), ricavi (ottenuto contro previsto) e
 * margine (reale contro previsto). Linea piena = reale cumulato fino a oggi; tratteggiata =
 * piano cumulato fino alla fine. La linea verticale segna oggi. Sotto, tre schede mettono a
 * confronto previsto e reale di ogni misura; un clic sulla scheda cambia il grafico.
 * Le linee si disegnano con un'animazione breve, spenta per chi chiede meno movimento.
 */
import { useMemo, useState } from "react";
import type * as React from "react";
import { ArrowUpRight, CalendarClock, LineChart as IconaLinea, Target, TrendingDown, TrendingUp } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { useSearchParams } from "react-router-dom";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/line-charts-9";
import { useGeneralePianoNumeri } from "@/hooks/useGeneralePiano";
import { formattaEuro, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { serieConfronto, sopraEBene, type Misura, type PuntoConfronto, type TotaliMisura } from "@/lib/orders/generali/serieSpesa";
import { nomeMese } from "../piano/formato";
import { cn } from "@/lib/utils";

const MISURE: Record<Misura, { nome: string; colore: string; reale: string; piano: string; verbo: string }> = {
  costi: { nome: "Costi", colore: "#ea580c", reale: "Speso", piano: "Budget del piano", verbo: "spesi" },
  ricavi: { nome: "Ricavi", colore: "#059669", reale: "Ottenuto", piano: "Ricavi previsti", verbo: "ottenuti" },
  margine: { nome: "Margine", colore: "#4f46e5", reale: "Margine reale", piano: "Margine previsto", verbo: "di margine" },
};

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

const euroConSegno = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formattaEuro(Math.abs(n))}`;

/** Verde se lo scostamento va nel verso buono della misura, rosso altrimenti. */
const tono = (m: Misura, diff: number) => (Math.abs(diff) < 1 ? "text-muted-foreground" : diff > 0 === sopraEBene(m) ? "text-emerald-600" : "text-red-600");

type Riga = { mese: string; piano: number; reale: number | null; acceso: number | null };

function Suggerimento({ active, payload, misura }: { active?: boolean; payload?: Array<{ payload: Riga }>; misura: Misura }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const diff = p.reale == null ? null : p.reale - p.piano;
  const d = MISURE[misura];
  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-lg">
      <div className="mb-1.5 text-muted-foreground">{nomeMese(p.mese)}</div>
      {p.reale != null && (
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-muted-foreground">{d.reale}</span>
          <span className="text-sm font-semibold tabular-nums">{formattaEuro(p.reale)}</span>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-muted-foreground">{d.piano}</span>
        <span className="tabular-nums">{formattaEuro(p.piano)}</span>
      </div>
      {diff != null && Math.abs(diff) >= 1 && (
        <div className={cn("mt-1 text-right font-medium tabular-nums", tono(misura, diff))}>{euroConSegno(diff)} rispetto al piano</div>
      )}
    </div>
  );
}

export function GraficoSpesa({ riepilogo }: { riepilogo: RiepilogoGenerale }) {
  const n = useGeneralePianoNumeri(riepilogo);
  const [parametri, setParametri] = useSearchParams();
  const [sotto, setSotto] = useState<number | null>(null);
  const permesse: Misura[] = [
    ...(riepilogo.permessi.costi ? (["costi"] as const) : []),
    ...(riepilogo.permessi.importi ? (["ricavi"] as const) : []),
    ...(riepilogo.permessi.costi && riepilogo.permessi.importi && riepilogo.permessi.margini ? (["margine"] as const) : []),
  ];
  const [scelta, setScelta] = useState<Misura>("costi");
  const misura: Misura | undefined = permesse.includes(scelta) ? scelta : permesse[0];
  const serie = useMemo(() => (n.reale ? serieConfronto(n.voci, n.reale.righe, n.reale.oggi) : null), [n.voci, n.reale]);
  if (!misura || n.isLoading || n.isError || !serie || serie.punti.length < 2) return null;

  const d = MISURE[misura];
  const t = serie.totali[misura];
  const dati: Riga[] = serie.punti.map((p: PuntoConfronto, i) => {
    const reale = misura === "costi" ? p.costiReale : misura === "ricavi" ? p.ricaviReale : p.margineReale;
    return {
      mese: p.mese,
      piano: misura === "costi" ? p.costiPiano : misura === "ricavi" ? p.ricaviPiano : p.marginePiano,
      reale,
      // L'area si accende fino al mese sotto il mouse; il resto resta in trasparenza.
      acceso: sotto == null || i <= sotto ? reale : null,
    };
  });
  const animare = !menoMovimento();
  const iOggi = dati.findIndex((p) => p.mese === serie.oggi);
  const prossimi = iOggi >= 0 ? dati.slice(iOggi + 1, iOggi + 4) : [];
  const prossimoValore = prossimi.length ? prossimi[prossimi.length - 1].piano - t.pianoOggi : 0;
  const quota = misura !== "margine" && t.pianoTotale > 0 ? Math.min(100, (t.realeOggi / t.pianoTotale) * 100) : null;
  const dovrei = misura !== "margine" && t.pianoTotale > 0 ? Math.min(100, (t.pianoOggi / t.pianoTotale) * 100) : null;
  const stimeMancanti = serie.vociSenzaImporto > 0 && misura !== "ricavi";
  const apriPiano = () => {
    const p = new URLSearchParams(parametri);
    p.set("scheda", "piano");
    p.set("vista-piano", "cassa");
    setParametri(p);
  };
  const pct = (x: number) => `${x.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
  const importo = (m: Misura, x: number) => (m === "margine" ? euroConSegno(x) : formattaEuro(x));

  return (
    <section aria-labelledby="grafico-spesa-titolo" className="generale-panel">
      <header className="generale-panel-heading">
        <div className="generale-panel-title">
          <span className="generale-section-icon">
            <IconaLinea aria-hidden="true" />
          </span>
          <div>
            <h2 id="grafico-spesa-titolo">Previsto contro reale</h2>
            <p>Cumulati mese per mese · importi netti</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {permesse.length > 1 && (
            <div className="generale-segmented" role="group" aria-label="Misura del grafico">
              {permesse.map((m) => (
                <button key={m} type="button" aria-pressed={misura === m} onClick={() => setScelta(m)}>
                  {MISURE[m].nome}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={apriPiano} className="hidden items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground sm:inline-flex">
            Cassa del piano <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 px-5 pb-5 pt-4 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-3xl font-bold tabular-nums">{importo(misura, t.realeOggi)}</span>
            <span className="text-sm text-muted-foreground">
              {d.verbo} a {nomeMese(serie.oggi).toLowerCase()}
            </span>
            {Math.abs(t.differenza) >= 1 && (
              <span className={cn("inline-flex items-center gap-1 text-sm font-medium", tono(misura, t.differenza))}>
                {t.differenza > 0 ? <TrendingUp className="h-4 w-4" aria-hidden="true" /> : <TrendingDown className="h-4 w-4" aria-hidden="true" />}
                {euroConSegno(t.differenza)} rispetto al piano a oggi
              </span>
            )}
          </div>

          <ChartContainer
            config={{ reale: { label: d.reale, color: d.colore }, piano: { label: d.piano, color: "#94a3b8" } } satisfies ChartConfig}
            className="aspect-auto h-72 w-full [&_.recharts-curve.recharts-tooltip-cursor]:stroke-[initial]"
          >
            <ComposedChart
              key={misura}
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
                <linearGradient id="confronto-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-reale)" stopOpacity={0.08} />
                  <stop offset="100%" stopColor="var(--color-reale)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="confronto-area-accesa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-reale)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--color-reale)" stopOpacity={0.02} />
                </linearGradient>
                <pattern id="confronto-punti" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="1" fill="hsl(var(--border))" fillOpacity="0.6" />
                </pattern>
                <filter id="confronto-ombra-punto" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.35)" />
                </filter>
                <filter id="confronto-alone" x="-20%" y="-50%" width="140%" height="200%">
                  <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor={d.colore} floodOpacity={0.35} />
                </filter>
              </defs>
              <rect x="0" y="0" width="100%" height="100%" fill="url(#confronto-punti)" style={{ pointerEvents: "none" }} />
              <CartesianGrid strokeDasharray="4 8" stroke="hsl(var(--border))" vertical={false} />
              {misura === "margine" && <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />}
              <XAxis dataKey="mese" axisLine={false} tickLine={false} tickMargin={12} minTickGap={24} tickFormatter={meseBreve} tick={{ fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tickMargin={8} width={64} tickFormatter={asseBreve} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<Suggerimento misura={misura} />} cursor={{ strokeDasharray: "3 3", stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.5 }} />
              <ReferenceLine
                x={serie.oggi}
                stroke="var(--color-reale)"
                strokeDasharray="4 4"
                label={{ value: "oggi", position: "insideTopRight", fill: "var(--color-reale)", fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="piano"
                stroke="var(--color-piano)"
                strokeWidth={1.75}
                strokeDasharray="6 5"
                dot={false}
                activeDot={{ r: 4, fill: "var(--color-piano)", stroke: "white", strokeWidth: 2 }}
                isAnimationActive={animare}
                animationDuration={900}
              />
              <Area type="monotone" dataKey="reale" stroke="none" fill="url(#confronto-area)" isAnimationActive={animare} animationDuration={900} connectNulls={false} legendType="none" tooltipType="none" />
              <Area type="monotone" dataKey="acceso" stroke="none" fill="url(#confronto-area-accesa)" isAnimationActive={false} connectNulls={false} legendType="none" tooltipType="none" />
              <Line
                type="monotone"
                dataKey="reale"
                stroke="var(--color-reale)"
                strokeWidth={2.5}
                filter="url(#confronto-alone)"
                connectNulls={false}
                dot={(p: { cx?: number; cy?: number; payload?: Riga }) =>
                  p.payload?.mese === serie.oggi && p.cx != null && p.cy != null ? (
                    <circle key={`reale-${p.payload.mese}`} cx={p.cx} cy={p.cy} r={6} fill="var(--color-reale)" stroke="white" strokeWidth={2} filter="url(#confronto-ombra-punto)" />
                  ) : (
                    <g key={`reale-${p.payload?.mese}`} />
                  )
                }
                activeDot={{ r: 6, fill: "var(--color-reale)", stroke: "white", strokeWidth: 2, filter: "url(#confronto-ombra-punto)" }}
                isAnimationActive={animare}
                animationDuration={1100}
              />
            </ComposedChart>
          </ChartContainer>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-5 rounded" style={{ backgroundColor: d.colore }} aria-hidden="true" /> {d.reale}, fino a oggi
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0 w-5 border-t-2 border-dashed border-slate-400" aria-hidden="true" /> {d.piano}
            </span>
            {stimeMancanti && (
              <span className="text-amber-700">
                Il piano non conta ancora {serie.vociSenzaImporto} {serie.vociSenzaImporto === 1 ? "voce" : "voci"} senza stima
                {misura === "margine" ? ": il margine previsto è più alto del vero." : "."}
              </span>
            )}
            {misura !== "costi" && serie.ricaviSenzaMese > 0 && (
              <span className="text-amber-700">
                {serie.ricaviSenzaMese} {serie.ricaviSenzaMese === 1 ? "ricavo del piano senza mese: non entra" : "ricavi del piano senza mese: non entrano"} nella linea.
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="generale-appare flex flex-1 flex-col justify-between rounded-2xl bg-slate-900 p-5 text-white shadow-lg" style={{ "--i": 1 } as React.CSSProperties}>
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                <Target className="h-3 w-3" aria-hidden="true" /> {misura === "costi" ? "Budget speso" : misura === "ricavi" ? "Ricavi ottenuti" : "Margine a fine lavori"}
              </p>
              <h3 className="text-lg font-semibold tracking-tight">Dove siamo sul piano</h3>
            </div>
            {misura === "margine" ? (
              <div className="mt-6 space-y-1">
                <div className="text-3xl font-semibold tabular-nums tracking-tight">{euroConSegno(t.pianoTotale)}</div>
                <p className="text-xs text-slate-400">
                  previsto a fine lavori · oggi il reale è {euroConSegno(t.realeOggi)}
                  {stimeMancanti && " · mancano stime di costo"}
                </p>
              </div>
            ) : quota != null ? (
              <div className="mt-6">
                <div className="mb-2 flex items-end justify-between">
                  <span className="text-3xl font-semibold tabular-nums tracking-tight">{pct(quota)}</span>
                  {dovrei != null && <span className="mb-1 text-xs text-slate-400">a oggi il piano dice {pct(dovrei)}</span>}
                </div>
                <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                  <div className="generale-barra-crescita h-full rounded-full bg-white" style={{ width: `${quota}%` }} />
                  {dovrei != null && <div className="absolute inset-y-[-2px] w-0.5 bg-orange-400" style={{ left: `${dovrei}%` }} title="Dove dice il piano a oggi" />}
                </div>
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-300">Il piano non ha ancora importi qui: completa le stime per vedere a che punto sei.</p>
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
                {misura === "costi" ? "Il piano prevede di spendere " : misura === "ricavi" ? "Il piano prevede ricavi per " : "Il piano prevede un margine di "}
                <span className="font-semibold text-foreground">{importo(misura, prossimoValore)}</span> fino a {nomeMese(prossimi[prossimi.length - 1].mese).toLowerCase()}.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Il piano finisce qui: niente di previsto dopo oggi.</p>
            )}
          </div>
        </div>
      </div>

      {permesse.length > 1 && (
        <ul className="grid grid-cols-1 gap-3 border-t px-5 py-4 sm:grid-cols-3" aria-label="Previsto e reale per misura">
          {permesse.map((m, i) => {
            const x: TotaliMisura = serie.totali[m];
            const dx = MISURE[m];
            const buono = x.differenza > 0 === sopraEBene(m);
            return (
              <li key={m} className="generale-appare" style={{ "--i": 3 + i } as React.CSSProperties}>
                <button
                  type="button"
                  onClick={() => setScelta(m)}
                  aria-pressed={misura === m}
                  aria-label={`Mostra ${dx.nome.toLowerCase()} nel grafico`}
                  className={cn(
                    "w-full rounded-xl border p-4 text-left transition-colors",
                    misura === m ? "border-foreground/30 bg-background shadow-sm" : "bg-muted/30 hover:bg-muted/60",
                  )}
                >
                  <span className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dx.colore }} aria-hidden="true" />
                    {dx.nome}
                  </span>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-xl font-bold tabular-nums tracking-tight">{importo(m, x.realeOggi)}</span>
                    {Math.abs(x.differenza) >= 1 && (
                      <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", tono(m, x.differenza), buono ? "bg-emerald-50" : "bg-red-50")}>
                        {euroConSegno(x.differenza)}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    reale a oggi · previsto a oggi {importo(m, x.pianoOggi)} · a fine lavori{" "}
                    <span className="font-medium text-foreground">{importo(m, x.pianoTotale)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
