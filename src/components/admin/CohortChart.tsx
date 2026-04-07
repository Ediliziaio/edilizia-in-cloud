import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react";
import { useCohortData, toCohortMatrix } from "@/hooks/superadmin/useCohortData";
import type { CohortMatrixEntry, CohortRow } from "@/hooks/superadmin/useCohortData";

// ─── Costanti ────────────────────────────────────────────

/** Numero massimo di periodi (mesi) visualizzati nella matrice */
const MAX_PERIODS = 12;

// ─── Helpers colore cella heatmap ────────────────────────

interface CellStyle {
  bg: string;
  text: string;
}

/** Restituisce le classi Tailwind per il colore di sfondo in base alla retention */
function retentionCellStyle(retention: number): CellStyle {
  if (retention >= 80) return { bg: "bg-green-800", text: "text-white" };
  if (retention >= 60) return { bg: "bg-green-500", text: "text-white" };
  if (retention >= 40) return { bg: "bg-yellow-400", text: "text-gray-900" };
  if (retention >= 20) return { bg: "bg-orange-400", text: "text-white" };
  return { bg: "bg-red-500", text: "text-white" };
}

// ─── Tooltip personalizzato per il grafico churn ─────────

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string | number;
}

function ChurnTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-lg p-3 shadow-lg text-xs">
      <p className="font-semibold mb-1">Mese {label}</p>
      <p className="text-muted-foreground">
        Retention media: <span className="font-medium text-foreground">{payload[0].value}%</span>
      </p>
    </div>
  );
}

// ─── Tab 1: Matrice Heatmap ───────────────────────────────

interface CohortMatrixProps {
  matrix: CohortMatrixEntry[];
}

function CohortMatrix({ matrix }: CohortMatrixProps) {
  if (matrix.length === 0) {
    return (
      <div className="py-12 text-center">
        <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Nessun dato cohort disponibile</p>
      </div>
    );
  }

  // Calcola il massimo periodo presente nei dati (fino a MAX_PERIODS)
  const maxPeriod = Math.min(
    Math.max(...matrix.flatMap((c) => c.periods.map((p) => p.period)), 0),
    MAX_PERIODS
  );

  const periodHeaders = Array.from({ length: maxPeriod + 1 }, (_, i) => i);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {/* Intestazione colonna cohort */}
            <th className="text-left p-2 font-semibold whitespace-nowrap border-b bg-muted/40 sticky left-0 z-10">
              Cohort
            </th>
            <th className="text-center p-2 font-semibold whitespace-nowrap border-b bg-muted/40">
              Aziende
            </th>
            {periodHeaders.map((m) => (
              <th
                key={m}
                className="text-center p-2 font-semibold whitespace-nowrap border-b bg-muted/40 min-w-[52px]"
              >
                Mese {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((cohort) => {
            // Indicizza i periodi per lookup rapido
            const periodMap = new Map(
              cohort.periods.map((p) => [p.period, p])
            );

            return (
              <tr key={cohort.cohortMonth} className="hover:bg-muted/20 transition-colors">
                {/* Etichetta cohort */}
                <td className="p-2 font-medium whitespace-nowrap border-b sticky left-0 bg-background z-10">
                  {cohort.cohortMonth}
                </td>
                {/* Totale aziende */}
                <td className="p-2 text-center border-b font-medium">
                  {cohort.totalUsers}
                </td>
                {/* Celle retention */}
                {periodHeaders.map((m) => {
                  const period = periodMap.get(m);
                  if (!period) {
                    return (
                      <td
                        key={m}
                        className="p-2 text-center border-b bg-muted text-muted-foreground"
                      >
                        —
                      </td>
                    );
                  }
                  const style = retentionCellStyle(period.retention);
                  return (
                    <td
                      key={m}
                      className={`p-2 text-center border-b font-semibold rounded-sm ${style.bg} ${style.text}`}
                      title={`${period.active} aziende attive`}
                    >
                      {period.retention}%
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Legenda colori */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="text-muted-foreground font-medium">Legenda:</span>
        {[
          { label: "≥ 80%", ...retentionCellStyle(80) },
          { label: "60–79%", ...retentionCellStyle(65) },
          { label: "40–59%", ...retentionCellStyle(45) },
          { label: "20–39%", ...retentionCellStyle(25) },
          { label: "< 20%", ...retentionCellStyle(10) },
        ].map(({ label, bg, text }) => (
          <span key={label} className={`px-2 py-0.5 rounded font-semibold ${bg} ${text}`}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Tab 2: LineChart churn mensile ──────────────────────

interface ChurnPoint {
  period: number;
  retention: number;
}

/** Calcola la retention media per periodo su tutte le cohort */
function buildChurnData(rows: CohortRow[]): ChurnPoint[] {
  const periodSums = new Map<number, { sum: number; count: number }>();

  for (const row of rows) {
    const existing = periodSums.get(row.period_number) ?? { sum: 0, count: 0 };
    periodSums.set(row.period_number, {
      sum: existing.sum + row.retention_rate,
      count: existing.count + 1,
    });
  }

  return Array.from(periodSums.entries())
    .filter(([period]) => period <= MAX_PERIODS)
    .sort(([a], [b]) => a - b)
    .map(([period, { sum, count }]) => ({
      period,
      retention: Math.round(sum / count),
    }));
}

interface ChurnChartProps {
  rows: CohortRow[];
}

function ChurnLineChart({ rows }: ChurnChartProps) {
  const chartData = buildChurnData(rows);

  if (chartData.length === 0) {
    return (
      <div className="py-12 text-center">
        <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Nessun dato disponibile per il grafico churn</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-4">
        Retention media tra tutte le cohort per mese di attività
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 16, left: -8, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="period"
            tickFormatter={(v: number) => `M${v}`}
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
            label={{ value: "Mesi dall'iscrizione", position: "insideBottom", offset: -2, fontSize: 11 }}
          />
          <YAxis
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 11 }}
            domain={[0, 100]}
            stroke="hsl(var(--muted-foreground))"
          />
          <Tooltip content={<ChurnTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "11px" }}
          />
          <Line
            type="monotone"
            dataKey="retention"
            name="Retention media (%)"
            stroke="#16A34A"
            strokeWidth={2}
            dot={{ r: 4, fill: "#16A34A" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────

function CohortSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-6 gap-1">
        {Array.from({ length: 42 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    </div>
  );
}

// ─── Componente principale CohortChart ───────────────────

/** Visualizzazione cohort con due tab: matrice retention e grafico churn mensile */
export function CohortChart() {
  const { data: rows, isLoading, isError } = useCohortData();
  const matrix = toCohortMatrix(rows ?? []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Analisi Cohort</h2>
        <p className="text-sm text-muted-foreground">
          Retention delle aziende per mese di acquisizione
        </p>
      </div>

      {/* Stato errore */}
      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive font-medium">
            Impossibile caricare i dati cohort. Riprova più tardi.
          </p>
        </div>
      )}

      <Tabs defaultValue="matrice">
        <TabsList>
          <TabsTrigger value="matrice">Matrice Retention</TabsTrigger>
          <TabsTrigger value="churn">Churn per Cohort</TabsTrigger>
        </TabsList>

        {/* Tab 1: Heatmap */}
        <TabsContent value="matrice" className="mt-4">
          {isLoading ? (
            <CohortSkeleton />
          ) : (
            <CohortMatrix matrix={matrix} />
          )}
        </TabsContent>

        {/* Tab 2: LineChart churn */}
        <TabsContent value="churn" className="mt-4">
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <ChurnLineChart rows={rows ?? []} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
