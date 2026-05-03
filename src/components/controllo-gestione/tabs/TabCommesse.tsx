/**
 * Tab Commesse — marginalità per cantiere/commessa.
 *
 * Mostra:
 *  • KPI aggregati (numero, preventivo, margine, commesse in perdita)
 *  • Tabella commesse con: preventivo | consuntivo | %avanz | margine corrente
 *    | proiezione finale (margine atteso a chiusura) | semaforo
 *  • Filtro per stato (tutti / in corso / completate)
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";
import {
  useMarginalitaCommesse, type Semaforo,
} from "@/hooks/controlloGestione/useMarginalitaCommesse";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Hammer, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ExportButton } from "@/components/controllo-gestione/ui/ExportButton";
import { exportXlsx } from "@/lib/controlloGestione/exportXlsx";

interface Props {
  anno: number;
}

const SEMAFORO_COLORS: Record<Semaforo, string> = {
  verde:  "bg-emerald-500",
  giallo: "bg-amber-500",
  rosso:  "bg-rose-500",
  grigio: "bg-muted-foreground/40",
};

const SEMAFORO_BG: Record<Semaforo, string> = {
  verde:  "bg-emerald-50 text-emerald-700",
  giallo: "bg-amber-50 text-amber-700",
  rosso:  "bg-rose-50 text-rose-700",
  grigio: "bg-muted/40 text-muted-foreground",
};

const SEMAFORO_LABEL: Record<Semaforo, string> = {
  verde:  "Marginalità ≥ 15%",
  giallo: "Marginalità 0–15%",
  rosso:  "In perdita",
  grigio: "Non valutabile",
};

export function TabCommesse({ anno }: Props) {
  const [filter, setFilter] = useState<"all" | "in_corso" | "completato">("all");
  const statusFilter = filter === "all" ? null : filter;
  const q = useMarginalitaCommesse(anno, statusFilter);

  const counts = useMemo(() => {
    if (!q.data) return null;
    const bySem: Record<Semaforo, number> = { verde: 0, giallo: 0, rosso: 0, grigio: 0 };
    q.data.righe.forEach((r) => {
      bySem[r.semaforo] = (bySem[r.semaforo] ?? 0) + 1;
    });
    return bySem;
  }, [q.data]);

  if (q.isLoading) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }
  if (q.isError) return <ErrorBlock onRetry={() => q.refetch()} />;
  if (!q.data) return null;

  const { kpi, righe } = q.data;

  return (
    <div className="space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KPIMini
          label="Commesse"
          value={String(kpi.n_commesse)}
          sub={`${kpi.n_in_corso} in corso · ${kpi.n_completate} completate`}
        />
        <KPIMini
          label="Preventivato"
          value={formatCurrency(kpi.preventivo_totale)}
          sub="Valore contratti"
          tone="blue"
        />
        <KPIMini
          label="Consuntivato"
          value={formatCurrency(kpi.consuntivo_totale)}
          sub="Costi diretti sostenuti"
          tone="amber"
        />
        <KPIMini
          label="Margine atteso fine"
          value={formatCurrency(kpi.margine_atteso_totale)}
          sub={
            kpi.preventivo_totale > 0
              ? `${((kpi.margine_atteso_totale / kpi.preventivo_totale) * 100).toFixed(1)}% sul preventivo`
              : "—"
          }
          tone={kpi.margine_atteso_totale > 0 ? "green" : "red"}
        />
        <KPIMini
          label="Commesse in perdita"
          value={String(kpi.n_in_perdita)}
          sub={kpi.n_in_perdita > 0 ? "Richiede attenzione" : "Tutte ok"}
          tone={kpi.n_in_perdita > 0 ? "red" : "green"}
        />
      </div>

      {/* Filtro stato + semaforo summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v as typeof filter)}
        >
          <ToggleGroupItem value="all" variant="outline" size="sm">Tutte</ToggleGroupItem>
          <ToggleGroupItem value="in_corso" variant="outline" size="sm">In corso</ToggleGroupItem>
          <ToggleGroupItem value="completato" variant="outline" size="sm">Completate</ToggleGroupItem>
        </ToggleGroup>

        {counts && (
          <div className="flex flex-wrap gap-2 text-xs">
            {(Object.keys(SEMAFORO_LABEL) as Semaforo[]).map((s) => (
              counts[s] > 0 && (
                <Badge key={s} variant="outline" className={cn("text-[11px]", SEMAFORO_BG[s])}>
                  <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full", SEMAFORO_COLORS[s])} />
                  {SEMAFORO_LABEL[s]}: {counts[s]}
                </Badge>
              )
            ))}
          </div>
        )}
      </div>

      {/* Tabella commesse */}
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Marginalità per cantiere</CardTitle>
            <p className="text-xs text-muted-foreground">
              Margine atteso = Preventivo − (Consuntivo / % avanzamento). Semaforo verde se ≥ 15%, rosso se &lt; 0.
            </p>
          </div>
          <ExportButton
            onExport={async () => {
              await exportXlsx({
                filename: `commesse_${anno}.xlsx`,
                brand: { title: "Marginalità Commesse", subtitle: `Esercizio ${anno}` },
                sheets: [{
                  name: `Commesse ${anno}`,
                  columns: [
                    { header: "Codice", key: "order_code", width: 12 },
                    { header: "Descrizione", key: "description", width: 35 },
                    { header: "Cliente", key: "cliente", width: 25 },
                    { header: "Stato", key: "status", width: 12 },
                    { header: "% avanz.", key: "pct_disp", width: 10 },
                    { header: "Preventivo", key: "preventivo", width: 14, type: "number" },
                    { header: "Consuntivo", key: "consuntivo", width: 14, type: "number" },
                    { header: "Margine ora", key: "margine", width: 14, type: "number" },
                    { header: "Costo atteso", key: "costo_atteso", width: 14, type: "number" },
                    { header: "Margine fine", key: "margine_atteso", width: 14, type: "number" },
                    { header: "Margine fine %", key: "margine_atteso_perc", width: 12 },
                    { header: "Semaforo", key: "semaforo", width: 10 },
                  ],
                  rows: righe.map((r) => ({
                    ...r,
                    pct_disp: `${(r.pct_avanzamento * 100).toFixed(0)}%`,
                  })),
                }],
              });
            }}
          />
        </CardHeader>
        <CardContent>
          {righe.length === 0 ? (
            <EmptyState
              title="Nessuna commessa"
              description={
                filter === "all"
                  ? `Per il ${anno} non ci sono commesse registrate.`
                  : "Nessuna commessa per questo filtro."
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="w-2 px-1 py-2"></th>
                    <th className="min-w-[200px] px-3 py-2 text-left text-xs font-medium text-muted-foreground">Commessa</th>
                    <th className="min-w-[120px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">Preventivo</th>
                    <th className="min-w-[120px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">Consuntivo</th>
                    <th className="min-w-[120px] px-3 py-2 text-left text-xs font-medium text-muted-foreground">Avanz.</th>
                    <th className="min-w-[120px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">Margine ora</th>
                    <th className="min-w-[140px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">Margine fine prev.</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/20">
                      <td className="px-1">
                        <span className={cn("block h-8 w-1.5 rounded-r", SEMAFORO_COLORS[r.semaforo])} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <Hammer className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {r.order_code && (
                                <span className="mr-1 font-mono text-xs text-muted-foreground">
                                  {r.order_code}
                                </span>
                              )}
                              {r.description}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {r.cliente ?? "—"}
                              {r.work_start && ` · dal ${formatDate(r.work_start)}`}
                              {r.work_end && ` al ${formatDate(r.work_end)}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(r.preventivo)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(r.consuntivo)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(r.pct_avanzamento * 100, 100)} className="h-2 w-16" />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {(r.pct_avanzamento * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          r.margine < 0 && "text-rose-700",
                          r.margine > 0 && "text-emerald-700",
                        )}
                      >
                        {formatCurrency(r.margine)}
                        {r.margine_perc !== 0 && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({r.margine_perc.toFixed(1)}%)
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          r.margine_atteso !== null && r.margine_atteso < 0 && "text-rose-700 font-semibold",
                          r.margine_atteso !== null && r.margine_atteso > 0 && "text-emerald-700",
                        )}
                      >
                        {r.margine_atteso !== null ? (
                          <>
                            {r.margine_atteso < 0 && (
                              <AlertTriangle className="mr-1 inline h-3 w-3" />
                            )}
                            {formatCurrency(r.margine_atteso)}
                            {r.margine_atteso_perc !== null && (
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                ({r.margine_atteso_perc.toFixed(1)}%)
                              </span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPIMini({
  label, value, sub, tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "blue" | "green" | "amber" | "red";
}) {
  const palette: Record<typeof tone, string> = {
    neutral: "bg-muted/40",
    blue: "bg-blue-50",
    green: "bg-emerald-50",
    amber: "bg-amber-50",
    red: "bg-rose-50",
  };
  return (
    <Card className={cn("rounded-2xl border-0", palette[tone])}>
      <CardContent className="p-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
