/**
 * SimFlussoCassa — flusso di cassa nel tempo (SAL) della simulazione.
 *
 * Modello: `calcolaCassa(fasi, voci, costoPieno, prezzoCliente, sal)` produce la
 * serie settimanale di costi cumulati / incassi cumulati / netto e l'esposizione
 * massima (minimo del netto). L'acconto è incassato all'inizio, il saldo a fine
 * lavori, il corpo durante in proporzione all'avanzamento dei costi.
 *
 * UI:
 *   - Due input percentuali: `acconto_pct` e `saldo_pct` (→ `onChangeSal`).
 *   - Grafico a linee del netto per settimana con `ReferenceLine y=0`; il punto
 *     di massima esposizione è evidenziato con un dot dedicato.
 *   - Metriche: esposizione massima (= |max_esposizione|, in rosso) alla
 *     settimana X, acconto, saldo.
 *
 * Empty-state se non ci sono fasi nel cronoprogramma.
 */
import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import { Wallet, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/formatters";
import { calcolaCassa } from "@/lib/simulatore/calcoli";
import type { FaseSim, VoceSim } from "@/lib/simulatore/tipi";

interface SimFlussoCassaProps {
  fasi: FaseSim[];
  voci: VoceSim[];
  costoPieno: number;
  prezzoCliente: number;
  sal: { acconto_pct: number; saldo_pct: number };
  onChangeSal: (sal: { acconto_pct: number; saldo_pct: number }) => void;
}

/** Percentuale 0–100 da input; fallback 0, mai NaN, clamp al 100. */
function parsePct(raw: string): number {
  const n = Math.min(100, Math.max(0, Number(raw)));
  return Number.isFinite(n) ? n : 0;
}

export function SimFlussoCassa({
  fasi,
  voci,
  costoPieno,
  prezzoCliente,
  sal,
  onChangeSal,
}: SimFlussoCassaProps) {
  const cassa = useMemo(
    () => calcolaCassa(fasi, voci, costoPieno, prezzoCliente, sal),
    [fasi, voci, costoPieno, prezzoCliente, sal],
  );

  const acconto = useMemo(
    () => Math.round(((prezzoCliente * sal.acconto_pct) / 100) * 100) / 100,
    [prezzoCliente, sal.acconto_pct],
  );
  const saldo = useMemo(
    () => Math.round(((prezzoCliente * sal.saldo_pct) / 100) * 100) / 100,
    [prezzoCliente, sal.saldo_pct],
  );

  // Punto di massima esposizione (per evidenziarlo sul grafico).
  const puntoMax = cassa.serie.find(
    (p) => p.settimana === cassa.settimana_max_esposizione,
  );
  // Esposizione mostrata come valore assoluto (l'utente legge "scoperto di …").
  const esposizione = Math.abs(cassa.max_esposizione);

  const inputs = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-[120px] space-y-1">
        <Label className="text-[11px] text-muted-foreground">Acconto (%)</Label>
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          max="100"
          step="1"
          value={String(sal.acconto_pct)}
          onChange={(e) =>
            onChangeSal({ ...sal, acconto_pct: parsePct(e.target.value) })
          }
          className="h-8 text-right tabular-nums"
        />
      </div>
      <div className="w-[120px] space-y-1">
        <Label className="text-[11px] text-muted-foreground">Saldo (%)</Label>
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          max="100"
          step="1"
          value={String(sal.saldo_pct)}
          onChange={(e) =>
            onChangeSal({ ...sal, saldo_pct: parsePct(e.target.value) })
          }
          className="h-8 text-right tabular-nums"
        />
      </div>
    </div>
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-muted-foreground">
              Flusso di cassa nel tempo (SAL)
            </h3>
          </div>
          {inputs}
        </div>

        {cassa.serie.length === 0 ? (
          <EmptyState
            icon={Wallet}
            size="sm"
            title="Nessun flusso di cassa"
            description="Aggiungi fasi nel cronoprogramma per vedere il flusso di cassa."
          />
        ) : (
          <>
            {/* Grafico netto per settimana */}
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={cassa.serie}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="settimana"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => `S${v}`}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) =>
                    `€${(v / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k`
                  }
                  width={56}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), "Netto"]}
                  labelFormatter={(label: number) => `Settimana ${label}`}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <ReferenceLine
                  y={0}
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="4 2"
                />
                <Line
                  type="monotone"
                  dataKey="netto"
                  name="Netto"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                {puntoMax ? (
                  <ReferenceDot
                    x={puntoMax.settimana}
                    y={puntoMax.netto}
                    r={5}
                    fill="hsl(var(--destructive))"
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>

            {/* Metriche */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <TrendingDown className="h-3.5 w-3.5" />
                  Esposizione massima
                </div>
                <p className="mt-1 text-lg font-semibold tabular-nums text-rose-600">
                  {formatCurrency(esposizione)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  alla settimana {cassa.settimana_max_esposizione}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Acconto ({sal.acconto_pct.toLocaleString("it-IT")}%)
                </div>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatCurrency(acconto)}
                </p>
                <p className="text-[11px] text-muted-foreground">alla firma</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Saldo ({sal.saldo_pct.toLocaleString("it-IT")}%)
                </div>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatCurrency(saldo)}
                </p>
                <p className="text-[11px] text-muted-foreground">a fine lavori</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
