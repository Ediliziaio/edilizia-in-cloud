/**
 * Grafico di un importo nel tempo (la cassa da oggi a fine anno, il saldo dei
 * mesi…): area sfumata sotto una linea con ombra, fondo a puntini, il punto
 * più alto e il più basso evidenziati, sopra la riga «più alto / più basso /
 * variazione». Gli importi sono quelli veri passati da chi lo usa.
 */
import { useId, useMemo } from "react";
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/formatters";
import { formatEuroRiquadro } from "@/lib/controlloGestione/formatCG";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import {
  COLORI_GRAFICO, PillolaVariazione, StatGrafico, TESTO_ASSE, TooltipScheda, defsGrafico, euroAsse, idSvg,
} from "./comune";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface PuntoAndamento {
  /** Etichetta corta sull'asse («Fine nov»). */
  etichetta: string;
  /** Etichetta per il tooltip e le statistiche («fine novembre»). */
  etichettaLunga?: string;
  valore: number;
}

interface Props {
  dati: PuntoAndamento[];
  nomeSerie: string;
  colore?: string;
  altezza?: number;
  /** Linea dello zero: per la cassa conta sapere se si va sotto. */
  lineaZero?: boolean;
  /** Testo dopo «Variazione» («da oggi a fine anno»). */
  notaVariazione?: string;
  /** Nascondi la riga delle statistiche (quando chi lo usa le mostra altrove). */
  senzaStatistiche?: boolean;
}

export function GraficoAndamento({
  dati, nomeSerie, colore = COLORI_GRAFICO.blu, altezza = 240, lineaZero = false, notaVariazione, senzaStatistiche,
}: Props) {
  const t = useT();
  const id = idSvg(useId());
  const fermo = usePreferisceMenoMovimento();

  const stat = useMemo(() => {
    if (dati.length === 0) return null;
    let iMax = 0;
    let iMin = 0;
    dati.forEach((d, i) => {
      if (d.valore > dati[iMax].valore) iMax = i;
      if (d.valore < dati[iMin].valore) iMin = i;
    });
    const primo = dati[0].valore;
    const ultimo = dati[dati.length - 1].valore;
    const diff = ultimo - primo;
    // 15/11/2026: solo da una base positiva: «+433%» partendo da −48.514 € non dice niente.
    const pct = primo > 0 ? (diff / primo) * 100 : null;
    return { iMax, iMin, diff, pct };
  }, [dati]);

  if (!stat) return null;
  const sottoZero = dati[stat.iMin].valore < 0;
  const nome = (i: number) => dati[i].etichettaLunga ?? dati[i].etichetta;

  return (
    <div className="space-y-3">
      {!senzaStatistiche && (
        <div className="grid grid-cols-3 gap-3 rounded-xl border bg-muted/30 px-3 py-2">
          <StatGrafico etichetta={t("Più alto")} valore={formatEuroRiquadro(dati[stat.iMax].valore)} nota={nome(stat.iMax)} />
          <StatGrafico
            etichetta={t("Più basso")}
            valore={formatEuroRiquadro(dati[stat.iMin].valore)}
            nota={nome(stat.iMin)}
            tono={sottoZero ? "cattivo" : "neutro"}
          />
          <StatGrafico
            etichetta={t("Variazione")}
            valore={
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {`${stat.diff > 0 ? "+" : ""}${formatEuroRiquadro(stat.diff)}`}
                <PillolaVariazione pct={stat.pct} />
              </span>
            }
            nota={notaVariazione}
            tono={stat.diff > 0 ? "buono" : stat.diff < 0 ? "cattivo" : "neutro"}
          />
        </div>
      )}
      <div style={{ height: altezza }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dati} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            {defsGrafico(id, { serie: colore })}
            <CartesianGrid
              fill={`url(#${id}-punti)`}
              vertical={false}
              stroke="hsl(var(--border))"
              strokeDasharray="4 6"
            />
            <XAxis dataKey="etichetta" tick={TESTO_ASSE} axisLine={false} tickLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tick={TESTO_ASSE} axisLine={false} tickLine={false} width={64} tickFormatter={euroAsse} />
            {lineaZero && sottoZero && (
              <ReferenceLine y={0} stroke={COLORI_GRAFICO.rosso} strokeOpacity={0.6} strokeDasharray="4 4" />
            )}
            <Tooltip
              cursor={{ stroke: colore, strokeOpacity: 0.35, strokeDasharray: "3 3" }}
              content={(p) => (
                <TooltipScheda
                  active={p.active}
                  payload={p.payload as never}
                  label={(p.payload?.[0]?.payload as PuntoAndamento | undefined)?.etichettaLunga ?? p.label}
                  nascondi={["area"]}
                  extra={(riga) => {
                    const i = dati.indexOf(riga as unknown as PuntoAndamento);
                    if (i <= 0) return null;
                    const d = dati[i].valore - dati[i - 1].valore;
                    return (
                      <p className="mt-1.5 border-t pt-1.5 text-[11px] text-muted-foreground">
                        {t("Rispetto al punto prima:")}{" "}
                        <span className={d >= 0 ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-rose-600 dark:text-rose-400"}>
                          {d > 0 ? "+" : ""}{formatCurrency(d)}
                        </span>
                      </p>
                    );
                  }}
                />
              )}
            />
            <Area
              dataKey="valore"
              name="area"
              type="monotone"
              stroke="none"
              fill={`url(#${id}-sfuma-serie)`}
              isAnimationActive={!fermo}
              animationDuration={900}
              legendType="none"
              activeDot={false}
            />
            <Line
              dataKey="valore"
              name={nomeSerie}
              type="monotone"
              stroke={colore}
              strokeWidth={2.5}
              filter={`url(#${id}-ombra)`}
              isAnimationActive={!fermo}
              animationDuration={900}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))", fill: colore }}
              dot={(p: { cx?: number; cy?: number; index?: number }) => {
                const evidenzia = p.index === stat.iMax || p.index === stat.iMin;
                if (!evidenzia || p.cx == null || p.cy == null) return <g key={`d-${p.index}`} />;
                const basso = p.index === stat.iMin && p.index !== stat.iMax;
                const c = basso && sottoZero ? COLORI_GRAFICO.rosso : colore;
                return (
                  <g key={`d-${p.index}`}>
                    <circle cx={p.cx} cy={p.cy} r={8} fill={c} fillOpacity={0.15} />
                    <circle cx={p.cx} cy={p.cy} r={4} fill="hsl(var(--background))" stroke={c} strokeWidth={2.5} />
                  </g>
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
