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

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useValorizzazione, type ValorizzazioneMethod,
} from "@/hooks/warehouse/useWarehouseValorizzazione";
import { riepilogoValore } from "@/lib/magazzino/riepiloghiMagazzino";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Calculator, TrendingUp, AlertCircle } from "lucide-react";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  warehouseId?: string | null;
}

export function WarehouseValorizzazionePanel({ warehouseId = null }: Props) {
  const t = useT();
  const [method, setMethod] = useState<ValorizzazioneMethod>("media");
  const q = useValorizzazione(method, warehouseId);

  if (q.isLoading) {
    return <Skeleton className="h-[400px] w-full rounded-2xl" />;
  }
  if (q.isError) {
    return (
      <Card className="rounded-2xl border-destructive/30 bg-destructive/5">
        <CardContent className="p-4 text-sm text-destructive">
          {t("Impossibile verificare la valorizzazione.")} <Button variant="outline" size="sm" onClick={()=>void q.refetch()}>{t("Riprova valorizzazione")}</Button>
        </CardContent>
      </Card>
    );
  }
  if (!q.data) return null;

  const { kpi, articoli } = q.data;
  const summary = riepilogoValore(articoli);

  return (
    <div className="space-y-2">
      {/* 26/11/2026: titolo, spiegazione e metodo su una riga; i quattro numeri in una fascia bassa;
          l'avviso sui lotti su una riga. Prima la tabella partiva a ~600px dalla barra. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Calculator className="h-4 w-4 text-muted-foreground" />
          {t("Valorizzazione Magazzino")}
        </h2>
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={t("Costo dei materiali in giacenza secondo il metodo selezionato. Confluisce nella voce \"Rimanenze\" dello Stato Patrimoniale.")}>
          {t("Costo dei materiali in giacenza secondo il metodo selezionato. Confluisce nella voce \"Rimanenze\" dello Stato Patrimoniale.")}
        </p>
        <ToggleGroup
          type="single"
          value={method}
          onValueChange={(v) => v && setMethod(v as ValorizzazioneMethod)}
          className="gap-1 [&>button]:h-8 [&>button]:px-2.5 [&>button]:text-xs [&>button[data-state=on]]:border-orange-200 [&>button[data-state=on]]:bg-orange-50 [&>button[data-state=on]]:text-orange-700"
        >
          <ToggleGroupItem value="media" variant="outline" size="sm">
            {t("Costo medio")}
          </ToggleGroupItem>
          <ToggleGroupItem value="fifo" variant="outline" size="sm">
            FIFO
          </ToggleGroupItem>
          <ToggleGroupItem value="lifo" variant="outline" size="sm">
            LIFO
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {articoli.some(a=>a.copertura_lotti_incompleta)&&<p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs">{t("Valore stimato per gli articoli con lotti incompleti: la quota senza lotto usa il costo medio registrato in magazzino.")}</p>}
      {articoli.some(a=>a.prezzo_da_definire)&&<p role="status" className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs">{t("Valore parziale: alcuni articoli hanno prezzi ancora da confermare.")}</p>}
      {/* Numeri */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">{t("Valore totale magazzino")}</p>
          <p className="text-lg font-bold leading-tight tabular-nums">{formatCurrency(kpi.valore_totale)}</p>
          <p className="text-[11px] text-muted-foreground">{t("Metodo:")} <strong className="capitalize">{method}</strong></p>
        </div>
        <div className="rounded-xl border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">{t("Articoli a stock")}</p>
          <p className="text-lg font-bold leading-tight tabular-nums">{summary.articoli}</p>
          <p className="text-[11px] text-muted-foreground">{t("{conLotti} con tracciamento lotti", { conLotti: String(summary.conLotti ?? "") })}</p>
        </div>
        <div className="rounded-xl border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">{t("Quantità per unità")}</p>
          <div className="flex flex-wrap gap-x-2 text-sm font-bold leading-tight tabular-nums">{summary.quantita.map(([unit, quantity]) => <span key={unit}>{quantity.toLocaleString(intlCampo(), {maximumFractionDigits:6})} {unit}</span>)}</div>
          {summary.unitaDaVerificare > 0 && <p className="text-[11px] text-amber-800">{t("{unitaDaVerificare} articoli con unità da verificare", { unitaDaVerificare: String(summary.unitaDaVerificare ?? "") })}</p>}
          {summary.quantita.length === 0 && !summary.unitaDaVerificare && <p>—</p>}
        </div>
        <div className="rounded-xl border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">{t("Valore senza lotti")}</p>
          <p className="text-lg font-bold leading-tight tabular-nums">{formatCurrency(summary.valoreSenzaLotti)}</p>
          <p className="text-[11px] text-muted-foreground">{t("calcolato dal costo anagrafico")}</p>
        </div>
      </div>

      {/* Avviso se mancano lotti: una riga, la spiegazione intera nel tooltip. */}
      {kpi.n_articoli > 0 && kpi.n_articoli_con_lotti === 0 && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900"
          title={t("La valorizzazione usa il costo unitario dell'anagrafica articoli (fallback). Per un calcolo preciso FIFO/LIFO, registra i carichi via DDT ricezione con costo unitario. In quel modo ogni lotto entra a magazzino col suo prezzo storico.")}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span className="shrink-0 whitespace-nowrap font-semibold">{t("Nessun articolo ha lotti tracciati")}</span>
          <span className="min-w-0 truncate">{t("La valorizzazione usa il costo unitario dell'anagrafica articoli (fallback). Per un calcolo preciso FIFO/LIFO, registra i carichi via DDT ricezione con costo unitario. In quel modo ogni lotto entra a magazzino col suo prezzo storico.")}</span>
        </div>
      )}

      {/* Tabella dettaglio */}
      <Card className="rounded-xl">
        <CardHeader className="px-3 py-2">
          <CardTitle className="text-sm">{t("Dettaglio per articolo")}</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          {articoli.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("Nessun articolo a magazzino.")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      {t("Articolo")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      {t("Codice")}
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                      {t("Quantità")}
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                      {t("Costo unit.")}
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                      {t("Valore")}
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                      {t("Lotti")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {articoli.map((a) => (
                    <tr key={a.id} className="border-t hover:bg-muted/20 [&>td]:whitespace-nowrap [&>td]:py-1.5">
                      <td className="max-w-[320px] truncate px-3 py-1.5 font-medium" title={a.name}>{a.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {a.internal_code ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {a.quantity.toLocaleString(intlCampo())} {a.unita_misura ?? ""}
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
                            <TrendingUp className="mr-1 h-3 w-3" /> {t("tracciato")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            {t("fallback")}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30 font-bold">
                  <tr>
                    <td className="px-3 py-2.5" colSpan={4}>{t("TOTALE MAGAZZINO ({method})", { method: String(method ?? "") })}</td>
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
