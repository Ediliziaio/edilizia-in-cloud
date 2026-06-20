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
 *     di massima esposizione è evidenziato con un dot dedicato. Verde (chart-2)
 *     sopra zero, rosso (chart-5) sotto: il colore segue il segno del netto.
 *   - Metriche: esposizione massima (= |max_esposizione|, rosso chart-5) alla
 *     settimana X, acconto (brand primary), saldo (verde chart-2).
 *
 * Empty-state se non ci sono fasi nel cronoprogramma.
 */
import { useMemo } from "react";
import {
  AreaChart,
  Area,
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
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
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

// Colori semantici del flusso di cassa dalla palette chart del brand:
// verde (chart-2) per il netto positivo, rosso (chart-5) per l'esposizione.
const CASSA_POSITIVO = "hsl(var(--chart-2))";
const CASSA_NEGATIVO = "hsl(var(--chart-5))";

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

  // Offset del gradiente al passaggio per lo zero: la frazione [0..1] dell'asse Y
  // (dall'alto) dove `netto = 0`. Sopra → verde, sotto → rosso. Trucco recharts
  // standard per colorare un'unica area in base al segno (solo presentazione).
  const gradientOffset = useMemo(() => {
    const valori = cassa.serie.map((p) => p.netto);
    const max = Math.max(...valori, 0);
    const min = Math.min(...valori, 0);
    if (max <= 0) return 0; // tutto ≤ 0 → tutto rosso
    if (min >= 0) return 1; // tutto ≥ 0 → tutto verde
    return max / (max - min);
  }, [cassa.serie]);

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
    <Card className="rounded-xl">
      <CardContent className="space-y-4 p-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Wallet className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold">Flusso di cassa nel tempo (SAL)</h3>
          </div>
          {inputs}
        </div>

        {cassa.serie.length === 0 ? (
          <EmptyState
            icon={Wallet}
            size="sm"
            tone="success"
            title="Nessun flusso di cassa"
            description="Aggiungi fasi nel cronoprogramma per vedere come acconto, SAL e saldo coprono i costi nel tempo."
          />
        ) : (
          <>
            {/* Grafico netto cumulato per settimana — area con gradiente verde
                (sopra zero) / rosso (sotto zero) e punto di massima esposizione. */}
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart
                data={cassa.serie}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
              >
                <defs>
                  {/* Stroke: verde→rosso al passaggio per lo zero (gradientOffset). */}
                  <linearGradient id="simCassaStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={gradientOffset} stopColor={CASSA_POSITIVO} stopOpacity={1} />
                    <stop offset={gradientOffset} stopColor={CASSA_NEGATIVO} stopOpacity={1} />
                  </linearGradient>
                  {/* Fill: stessa logica, sfumato verso trasparente in basso. */}
                  <linearGradient id="simCassaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CASSA_POSITIVO} stopOpacity={0.28} />
                    <stop offset={gradientOffset} stopColor={CASSA_POSITIVO} stopOpacity={0.04} />
                    <stop offset={gradientOffset} stopColor={CASSA_NEGATIVO} stopOpacity={0.04} />
                    <stop offset="100%" stopColor={CASSA_NEGATIVO} stopOpacity={0.28} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="settimana"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: number) => `S${v}`}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={formatCurrencyCompact}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), "Netto cassa"]}
                  labelFormatter={(label: number) => `Settimana ${label}`}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                    boxShadow: "0 4px 12px hsl(var(--foreground) / 0.08)",
                  }}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" />
                <Area
                  type="monotone"
                  dataKey="netto"
                  name="Netto"
                  stroke="url(#simCassaStroke)"
                  strokeWidth={2.5}
                  fill="url(#simCassaFill)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                {puntoMax ? (
                  <ReferenceDot
                    x={puntoMax.settimana}
                    y={puntoMax.netto}
                    r={5}
                    fill={CASSA_NEGATIVO}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                    label={{
                      value: `Esposizione ${formatCurrencyCompact(cassa.max_esposizione)}`,
                      position: "top",
                      fontSize: 11,
                      fontWeight: 600,
                      fill: CASSA_NEGATIVO,
                    }}
                  />
                ) : null}
              </AreaChart>
            </ResponsiveContainer>

            {/* Metriche */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Esposizione: box semantico rosso (chart-5), tinta tenue inline. */}
              <div
                className="rounded-xl border p-3"
                style={{
                  borderColor: "hsl(var(--chart-5) / 0.30)",
                  backgroundColor: "hsl(var(--chart-5) / 0.06)",
                }}
              >
                <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: CASSA_NEGATIVO }}>
                  <TrendingDown className="h-3.5 w-3.5" />
                  Esposizione massima
                </div>
                <p className="mt-1 text-lg font-semibold tabular-nums" style={{ color: CASSA_NEGATIVO }}>
                  {formatCurrency(esposizione)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  alla settimana {cassa.settimana_max_esposizione}
                </p>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Acconto ({sal.acconto_pct.toLocaleString("it-IT")}%)
                </div>
                <p className="mt-1 text-lg font-semibold tabular-nums text-primary">
                  {formatCurrency(acconto)}
                </p>
                <p className="text-[11px] text-muted-foreground">alla firma</p>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Saldo ({sal.saldo_pct.toLocaleString("it-IT")}%)
                </div>
                <p className="mt-1 text-lg font-semibold tabular-nums" style={{ color: CASSA_POSITIVO }}>
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
