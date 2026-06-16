/**
 * Tab Prodotti & Categorie — costo STANDARD (listino) vs REALE per prodotto/categoria.
 *
 * Fonte dati: vista `v_ordine_articoli_costi` (una riga per articolo di commessa).
 * Il costo reale è la riga-ODA collegata se presente, altrimenti il purchase_price
 * manuale/magazzino → gestisce ODA opzionale + giacenza senza doppi conteggi.
 *
 * Mostra:
 *  • KPI: costo reale, costo da listino, scostamento € e %, % righe agganciate al listino
 *  • Toggle Per categoria / Per prodotto
 *  • Tabella ordinata per costo reale: dove spendo di più e dove sforo il listino
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";
import { ExportButton } from "@/components/controllo-gestione/ui/ExportButton";
import { exportXlsx } from "@/lib/controlloGestione/exportXlsx";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Package, TrendingUp, TrendingDown, Info } from "lucide-react";

interface Props {
  anno: number;
}

interface RigaCosto {
  order_item_id: string;
  article_template_id: string | null;
  categoria: string;
  name: string;
  quantity: number;
  costo_standard: number;
  costo_reale: number;
  fonte_costo: string;
  ha_baseline_listino: boolean;
  created_at: string;
}

interface Aggregato {
  key: string;
  label: string;
  n_righe: number;
  costo_standard: number;
  costo_reale: number;
  scostamento: number;
  scostamento_perc: number | null;
  con_baseline: number;
}

const FONTE_LABEL: Record<string, string> = {
  manuale: "Manuale",
  oda: "Ordine fornitore",
  magazzino: "Magazzino",
};

export function TabProdotti({ anno }: Props) {
  const companyId = useEffectiveCompanyId();
  const [dim, setDim] = useState<"categoria" | "prodotto">("categoria");

  const q = useQuery({
    queryKey: ["cg-articoli-costi", companyId, anno],
    enabled: !!companyId,
    queryFn: async () => {
      const start = `${anno}-01-01`;
      const end = `${anno + 1}-01-01`;
      const { data, error } = await supabase
        .from("v_ordine_articoli_costi")
        .select(
          "order_item_id, article_template_id, categoria, name, quantity, costo_standard, costo_reale, fonte_costo, ha_baseline_listino, created_at",
        )
        .eq("company_id", companyId!)
        .gte("created_at", start)
        .lt("created_at", end)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as RigaCosto[];
    },
  });

  const { aggregati, totali, fonteMix } = useMemo(() => {
    const rows = q.data ?? [];
    const map = new Map<string, Aggregato>();
    for (const r of rows) {
      const key = dim === "categoria" ? r.categoria : (r.article_template_id ?? `name:${r.name}`);
      const label = dim === "categoria" ? r.categoria : r.name;
      const cur = map.get(key) ?? {
        key, label, n_righe: 0, costo_standard: 0, costo_reale: 0,
        scostamento: 0, scostamento_perc: null, con_baseline: 0,
      };
      cur.n_righe += 1;
      cur.costo_standard += r.costo_standard;
      cur.costo_reale += r.costo_reale;
      cur.con_baseline += r.ha_baseline_listino ? 1 : 0;
      map.set(key, cur);
    }
    const agg = Array.from(map.values())
      .map((a) => {
        a.scostamento = Math.round((a.costo_reale - a.costo_standard) * 100) / 100;
        a.scostamento_perc = a.costo_standard > 0 ? (a.scostamento / a.costo_standard) * 100 : null;
        return a;
      })
      .sort((x, y) => y.costo_reale - x.costo_reale);

    const fonteCount: Record<string, number> = {};
    rows.forEach((r) => { fonteCount[r.fonte_costo] = (fonteCount[r.fonte_costo] ?? 0) + 1; });

    const totali = {
      costo_standard: rows.reduce((s, r) => s + r.costo_standard, 0),
      costo_reale: rows.reduce((s, r) => s + r.costo_reale, 0),
      n_gruppi: agg.length,
      con_baseline: rows.filter((r) => r.ha_baseline_listino).length,
      tot: rows.length,
    };
    return { aggregati: agg, totali, fonteMix: fonteCount };
  }, [q.data, dim]);

  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (q.isError) return <ErrorBlock onRetry={() => q.refetch()} />;
  if (!q.data || q.data.length === 0) {
    return (
      <EmptyState
        icon={<Package className="h-6 w-6 text-muted-foreground" />}
        title="Nessun articolo di commessa nel periodo"
        description={`Per l'esercizio ${anno} non ci sono righe di commessa. Aggiungi articoli alle commesse (meglio se dal listino) per analizzare costo standard vs reale.`}
      />
    );
  }

  const scostTot = Math.round((totali.costo_reale - totali.costo_standard) * 100) / 100;
  const scostTotPerc = totali.costo_standard > 0 ? (scostTot / totali.costo_standard) * 100 : null;
  const baselinePerc = totali.tot > 0 ? Math.round((totali.con_baseline / totali.tot) * 100) : 0;
  const overColor = scostTot > 0.005 ? "text-rose-600" : scostTot < -0.005 ? "text-emerald-600" : "text-muted-foreground";

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Costo reale</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold tabular-nums">{formatCurrency(totali.costo_reale)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Costo da listino</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(totali.costo_standard)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">baseline standard</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Scostamento</CardTitle></CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold tabular-nums flex items-center gap-1", overColor)}>
              {scostTot > 0.005 ? <TrendingUp className="h-5 w-5" /> : scostTot < -0.005 ? <TrendingDown className="h-5 w-5" /> : null}
              {scostTot > 0 ? "+" : ""}{formatCurrency(scostTot)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {scostTotPerc != null ? `${scostTotPerc > 0 ? "+" : ""}${scostTotPerc.toFixed(1)}% vs listino` : "baseline assente"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Righe agganciate al listino</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{baselinePerc}%</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{totali.con_baseline}/{totali.tot} righe</p>
          </CardContent>
        </Card>
      </div>

      {/* Avviso copertura listino basso */}
      {baselinePerc < 50 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Solo il {baselinePerc}% delle righe è agganciato al listino: lo scostamento standard/reale è calcolabile
            solo su quelle. Inserendo gli articoli di commessa <strong>dal listino</strong> (anziché a mano) l'analisi
            diventa completa.
          </span>
        </div>
      )}

      {/* Toggle + export */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <ToggleGroup type="single" value={dim} onValueChange={(v) => v && setDim(v as "categoria" | "prodotto")} size="sm">
          <ToggleGroupItem value="categoria">Per categoria</ToggleGroupItem>
          <ToggleGroupItem value="prodotto">Per prodotto</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(fonteMix).map(([f, n]) => (
            <Badge key={f} variant="outline" className="text-[10px] font-normal">
              {FONTE_LABEL[f] ?? f}: {n}
            </Badge>
          ))}
          <ExportButton
            onExport={async () => {
              await exportXlsx({
                filename: `prodotti_costi_${dim}_${anno}.xlsx`,
                brand: { title: "Costi per prodotto/categoria", subtitle: `Esercizio ${anno} · ${dim === "categoria" ? "Categorie" : "Prodotti"}` },
                sheets: [{
                  name: `Costi ${anno}`,
                  columns: [
                    { header: dim === "categoria" ? "Categoria" : "Prodotto", key: "label", width: 32 },
                    { header: "N. righe", key: "n_righe", width: 10, type: "number" },
                    { header: "Costo listino", key: "costo_standard", width: 14, type: "number" },
                    { header: "Costo reale", key: "costo_reale", width: 14, type: "number" },
                    { header: "Scostamento €", key: "scostamento", width: 14, type: "number" },
                    { header: "Scostamento %", key: "scost_perc", width: 12 },
                  ],
                  rows: aggregati.map((a) => ({
                    label: a.label,
                    n_righe: a.n_righe,
                    costo_standard: a.costo_standard,
                    costo_reale: a.costo_reale,
                    scostamento: a.scostamento,
                    scost_perc: a.scostamento_perc != null ? `${a.scostamento_perc > 0 ? "+" : ""}${a.scostamento_perc.toFixed(1)}%` : "—",
                  })),
                }],
              });
            }}
          />
        </div>
      </div>

      {/* Tabella */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-3 font-medium">{dim === "categoria" ? "Categoria" : "Prodotto"}</th>
                <th className="p-3 font-medium text-right">Righe</th>
                <th className="p-3 font-medium text-right">Costo listino</th>
                <th className="p-3 font-medium text-right">Costo reale</th>
                <th className="p-3 font-medium text-right">Scostamento</th>
              </tr>
            </thead>
            <tbody>
              {aggregati.map((a) => {
                const over = a.scostamento > 0.005;
                const under = a.scostamento < -0.005;
                return (
                  <tr key={a.key} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium truncate max-w-[280px]">{a.label}</div>
                      {a.con_baseline < a.n_righe && (
                        <div className="text-[10px] text-muted-foreground">{a.con_baseline}/{a.n_righe} dal listino</div>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{a.n_righe}</td>
                    <td className="p-3 text-right tabular-nums">{a.costo_standard > 0 ? formatCurrency(a.costo_standard) : "—"}</td>
                    <td className="p-3 text-right tabular-nums font-medium">{formatCurrency(a.costo_reale)}</td>
                    <td className="p-3 text-right tabular-nums">
                      {a.scostamento_perc == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={cn("font-medium", over ? "text-rose-600" : under ? "text-emerald-600" : "text-muted-foreground")}>
                          {over ? "▲" : under ? "▼" : ""} {a.scostamento > 0 ? "+" : ""}{formatCurrency(a.scostamento)}
                          <span className="ml-1 text-[11px]">({a.scostamento_perc > 0 ? "+" : ""}{a.scostamento_perc.toFixed(0)}%)</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
