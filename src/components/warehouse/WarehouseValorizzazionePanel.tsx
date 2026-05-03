/**
 * Pannello Valorizzazione Magazzino — KPI + tabella articoli con metodo
 * MEDIA / FIFO / LIFO selezionabile.
 *
 * Usa wh_get_valorizzazione (RPC) che combina warehouse_lot_batches per i
 * costi reali; fallback a warehouse_stock.unit_cost per articoli senza lotti.
 *
 * Bug pre-fix: il valore di magazzino non veniva mai calcolato → "Rimanenze"
 * nello SP riclassificato era sempre 0.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useValorizzazione, type ValorizzazioneMethod,
} from "@/hooks/warehouse/useWarehouseValorizzazione";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Calculator, Package, TrendingUp, AlertCircle } from "lucide-react";

interface Props {
  warehouseId?: string | null;
}

export function WarehouseValorizzazionePanel({ warehouseId = null }: Props) {
  const [method, setMethod] = useState<ValorizzazioneMethod>("media");
  const q = useValorizzazione(method, warehouseId);

  if (q.isLoading) {
    return <Skeleton className="h-[400px] w-full rounded-2xl" />;
  }
  if (q.isError) {
    return (
      <Card className="rounded-2xl border-destructive/30 bg-destructive/5">
        <CardContent className="p-4 text-sm text-destructive">
          Errore caricamento valorizzazione: {String(q.error)}
        </CardContent>
      </Card>
    );
  }
  if (!q.data) return null;

  const { kpi, articoli } = q.data;

  return (
    <div className="space-y-4">
      {/* Header con method toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Calculator className="h-4 w-4 text-muted-foreground" />
            Valorizzazione Magazzino
          </h2>
          <p className="text-xs text-muted-foreground">
            Costo dei materiali in giacenza secondo il metodo selezionato.
            Confluisce nella voce "Rimanenze" dello Stato Patrimoniale.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={method}
          onValueChange={(v) => v && setMethod(v as ValorizzazioneMethod)}
        >
          <ToggleGroupItem value="media" variant="outline" size="sm">
            Costo medio
          </ToggleGroupItem>
          <ToggleGroupItem value="fifo" variant="outline" size="sm">
            FIFO
          </ToggleGroupItem>
          <ToggleGroupItem value="lifo" variant="outline" size="sm">
            LIFO
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="rounded-2xl border-0 bg-blue-50">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Valore totale magazzino
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatCurrency(kpi.valore_totale)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Metodo: <strong className="capitalize">{method}</strong>
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 bg-emerald-50">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Articoli a stock
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{kpi.n_articoli}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {kpi.n_articoli_con_lotti} con tracciamento lotti
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 bg-violet-50">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Quantità totale
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {kpi.qty_totale.toLocaleString("it-IT")}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">unità</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 bg-amber-50">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Costo medio articolo
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {kpi.qty_totale > 0
                ? formatCurrency(kpi.valore_totale / kpi.qty_totale)
                : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">€ / unità</p>
          </CardContent>
        </Card>
      </div>

      {/* Banner se mancano lotti */}
      {kpi.n_articoli > 0 && kpi.n_articoli_con_lotti === 0 && (
        <Card className="rounded-2xl border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">Nessun articolo ha lotti tracciati</p>
              <p className="mt-1 text-xs">
                La valorizzazione usa il <code>unit_cost</code> dell'anagrafica
                articoli (fallback). Per un calcolo preciso FIFO/LIFO,
                registra i carichi via <strong>DDT ricezione</strong> con costo unitario.
                In quel modo ogni lotto entra a magazzino col suo prezzo storico.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabella dettaglio */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dettaglio per articolo</CardTitle>
        </CardHeader>
        <CardContent>
          {articoli.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nessun articolo a magazzino.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Articolo
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Codice
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                      Qty
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                      Costo unit.
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                      Valore
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                      Lotti
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {articoli.map((a) => (
                    <tr key={a.id} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <Package className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="font-medium">{a.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {a.internal_code ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {a.quantity.toLocaleString("it-IT")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(a.unit_cost)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums font-semibold",
                          a.valore > 0 ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {formatCurrency(a.valore)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {a.ha_lotti ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 text-[10px]">
                            <TrendingUp className="mr-1 h-3 w-3" /> tracciato
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            fallback
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30 font-bold">
                  <tr>
                    <td className="px-3 py-2.5" colSpan={4}>
                      TOTALE MAGAZZINO ({method})
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-base">
                      {formatCurrency(kpi.valore_totale)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
