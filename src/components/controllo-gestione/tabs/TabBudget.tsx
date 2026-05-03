/**
 * Tab Budget vs Consuntivo + Forecast.
 *
 * Tabella per ogni voce CE: Budget | Consuntivo YTD | Forecast a fine anno
 * (run-rate) | Variance € | Variance % | Semaforo verde/giallo/rosso.
 *
 * Editing inline degli importi budget tramite Sheet.
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import {
  useBudgetForecast, useUpsertBudget,
  type VoceBudget,
} from "@/hooks/controlloGestione/useBudget";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ExportButton } from "@/components/controllo-gestione/ui/ExportButton";
import { exportXlsx } from "@/lib/controlloGestione/exportXlsx";

interface Props {
  anno: number;
}

const SEM_BG = {
  verde:  "bg-emerald-50 text-emerald-700",
  giallo: "bg-amber-50 text-amber-700",
  rosso:  "bg-rose-50 text-rose-700",
  grigio: "bg-muted/40 text-muted-foreground",
} as const;

export function TabBudget({ anno }: Props) {
  const q = useBudgetForecast(anno);
  const [editor, setEditor] = useState<VoceBudget | null>(null);

  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (q.isError)   return <ErrorBlock onRetry={() => q.refetch()} />;
  if (!q.data) return null;

  const { meta, voci } = q.data;

  // Solo voci editabili = quelle non subtotali
  const vociEdit = voci.filter((v) => v.tipo === "voce");

  const totBudget    = vociEdit.reduce((s, v) => s + v.budget, 0);
  const totConsYtd   = vociEdit.reduce((s, v) => s + v.consuntivo_ytd, 0);
  const totForecast  = vociEdit.reduce((s, v) => s + v.forecast_anno, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="rounded-2xl border-0 bg-blue-50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Budget annuale (totale voci)</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatCurrency(totBudget)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 bg-amber-50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Consuntivo YTD (gen→{meta.mese_corrente})</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatCurrency(totConsYtd)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 bg-violet-50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Forecast fine anno</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatCurrency(totForecast)}</p>
            <p className="text-[11px] text-muted-foreground">Run-rate lineare</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 bg-muted/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Variance fine anno vs budget</p>
            <p
              className={cn(
                "mt-1 text-xl font-bold tabular-nums",
                totForecast - totBudget < 0 ? "text-rose-700" : "text-emerald-700",
              )}
            >
              {formatCurrency(totForecast - totBudget)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {totBudget > 0 ? `${(((totForecast - totBudget) / totBudget) * 100).toFixed(1)}%` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Budget vs Consuntivo · {anno}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Forecast = Consuntivo YTD ÷ {meta.mese_corrente} mesi × 12. Semaforo: verde tolleranza ±5–15%, rosso fuori.
            </p>
          </div>
          <ExportButton
            onExport={async () => {
              await exportXlsx({
                filename: `budget_vs_consuntivo_${anno}.xlsx`,
                brand: { title: "Budget vs Consuntivo + Forecast", subtitle: `Esercizio ${anno}` },
                sheets: [{
                  name: `Budget ${anno}`,
                  columns: [
                    { header: "Cod", key: "codice", width: 6 },
                    { header: "Voce", key: "label", width: 30 },
                    { header: "Budget", key: "budget", width: 14, type: "number" },
                    { header: "Consuntivo YTD", key: "consuntivo_ytd", width: 16, type: "number" },
                    { header: "Forecast anno", key: "forecast_anno", width: 16, type: "number" },
                    { header: "Var. €", key: "variance_eur", width: 14, type: "number" },
                    { header: "Var. %", key: "variance_pct_disp", width: 12 },
                    { header: "Semaforo", key: "semaforo", width: 12 },
                  ],
                  rows: voci.map((v) => ({
                    ...v,
                    variance_pct_disp: v.variance_pct !== null ? `${v.variance_pct.toFixed(1)}%` : "—",
                  })),
                  rowStyle: (row) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const t = (row as any).tipo as string;
                    if (t === "subtot_grasso") return "total";
                    if (t === "subtot") return "subtot";
                    return "normal";
                  },
                }],
              });
            }}
          />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="w-12 px-2 py-2 text-left text-xs font-medium text-muted-foreground">Cod</th>
                  <th className="min-w-[180px] px-3 py-2 text-left text-xs font-medium text-muted-foreground">Voce</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Budget</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Consuntivo YTD</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Forecast</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Var. €</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Var. %</th>
                  <th className="w-12 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {voci.map((v) => {
                  const isSub = v.tipo !== "voce";
                  const semClass = SEM_BG[v.semaforo];
                  return (
                    <tr
                      key={v.codice}
                      className={cn(
                        "border-t",
                        isSub && "bg-muted/30 font-semibold",
                        v.tipo === "subtot_grasso" && "bg-primary/5 font-bold",
                      )}
                    >
                      <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{v.codice}</td>
                      <td className="px-3 py-2">{v.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {v.budget !== 0 ? formatCurrency(v.budget) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {v.consuntivo_ytd !== 0 ? formatCurrency(v.consuntivo_ytd) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {v.forecast_anno !== 0 ? formatCurrency(v.forecast_anno) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          v.variance_eur > 0 ? "text-emerald-700" : "text-rose-700",
                        )}
                      >
                        {v.variance_eur !== 0 ? formatCurrency(v.variance_eur) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {v.variance_pct !== null ? (
                          <span className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-medium",
                            semClass,
                          )}>
                            {v.variance_pct > 0 ? "+" : ""}{v.variance_pct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {!isSub && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => setEditor(v)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <BudgetEditor
        anno={anno}
        voce={editor}
        onClose={() => setEditor(null)}
      />
    </div>
  );
}

function BudgetEditor({
  anno, voce, onClose,
}: {
  anno: number;
  voce: VoceBudget | null;
  onClose: () => void;
}) {
  const upsert = useUpsertBudget();
  const { toast } = useToast();
  const [importo, setImporto] = useState("");
  const [note, setNote] = useState("");

  // Initialize when voce changes
  useEffect(() => {
    if (voce) {
      setImporto(String(voce.budget || ""));
      setNote("");
    }
  }, [voce]);

  if (!voce) return null;

  const handleSave = async () => {
    const num = Number(importo);
    if (!Number.isFinite(num) || num < 0) {
      toast({ title: "Importo non valido", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        anno,
        codice: voce.codice,
        importo: num,
        note: note.trim() || null,
      });
      toast({ title: "Budget salvato" });
      onClose();
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    }
  };

  return (
    <Sheet open={!!voce} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Budget {anno} — {voce.label}</SheetTitle>
          <p className="text-xs text-muted-foreground">Codice {voce.codice}</p>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div>
            <Label className="text-xs">Importo annuo (€)</Label>
            <Input
              type="number"
              step="0.01"
              value={importo}
              onChange={(e) => setImporto(e.target.value)}
              autoFocus
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Consuntivo YTD: {formatCurrency(voce.consuntivo_ytd)} · Forecast:{" "}
              {formatCurrency(voce.forecast_anno)}
            </p>
          </div>
          <div>
            <Label className="text-xs">Note</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="es. +12% vs 2025"
            />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={upsert.isPending}>
            Salva budget
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
