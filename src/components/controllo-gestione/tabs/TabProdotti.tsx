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
  /** Ricavo di listino della riga = unit_price × quantità (da order_items). */
  ricavo: number;
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
  // Marginalità sui materiali.
  ricavo: number;
  margine: number;          // ricavo − costo_reale
  margine_perc: number | null;
}

const FONTE_LABEL: Record<string, string> = {
  manuale: "Manuale",
  oda: "Ordine fornitore",
  magazzino: "Magazzino",
};

export function TabProdotti({ anno }: Props) {
  const companyId = useEffectiveCompanyId();
  const [dim, setDim] = useState<"categoria" | "prodotto">("categoria");
  // Vista: marginalità (dove guadagno/perdo) vs controllo costi (listino vs reale).
  const [vista, setVista] = useState<"marginalita" | "costi">("marginalita");

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
      const righe = (data ?? []) as RigaCosto[];

      // Ricavo per riga = order_items.unit_price × quantità. La vista costi non
      // espone il prezzo di vendita, quindi lo prendiamo da order_items in chunk
      // .in() da 200 id (URL corta). Righe senza prezzo → ricavo 0.
      const ids = righe.map((r) => r.order_item_id);
      const priceById = new Map<string, number>();
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data: oi, error: oiErr } = await supabase
          .from("order_items")
          .select("id, unit_price")
          .in("id", chunk);
        if (oiErr) throw oiErr;
        for (const row of (oi ?? []) as Array<{ id: string; unit_price: number | null }>) {
          priceById.set(row.id, Number(row.unit_price ?? 0));
        }
      }
      for (const r of righe) {
        r.ricavo = (priceById.get(r.order_item_id) ?? 0) * (r.quantity ?? 0);
      }
      return righe;
    },
  });

  const { aggregati, totali, fonteMix, peggiore } = useMemo(() => {
    const rows = q.data ?? [];
    const map = new Map<string, Aggregato>();
    for (const r of rows) {
      const key = dim === "categoria" ? r.categoria : (r.article_template_id ?? `name:${r.name}`);
      const label = dim === "categoria" ? r.categoria : r.name;
      const cur = map.get(key) ?? {
        key, label, n_righe: 0, costo_standard: 0, costo_reale: 0,
        scostamento: 0, scostamento_perc: null, con_baseline: 0,
        ricavo: 0, margine: 0, margine_perc: null,
      };
      cur.n_righe += 1;
      cur.costo_standard += r.costo_standard;
      cur.costo_reale += r.costo_reale;
      cur.ricavo += r.ricavo;
      cur.con_baseline += r.ha_baseline_listino ? 1 : 0;
      map.set(key, cur);
    }
    const agg = Array.from(map.values())
      .map((a) => {
        a.scostamento = Math.round((a.costo_reale - a.costo_standard) * 100) / 100;
        a.scostamento_perc = a.costo_standard > 0 ? (a.scostamento / a.costo_standard) * 100 : null;
        a.margine = Math.round((a.ricavo - a.costo_reale) * 100) / 100;
        a.margine_perc = a.ricavo > 0 ? (a.margine / a.ricavo) * 100 : null;
        return a;
      })
      // In marginalità ordiniamo per margine € (dai più redditizi ai peggiori);
      // in controllo costi per costo reale (dove spendo di più).
      .sort((x, y) => vista === "marginalita" ? y.margine - x.margine : y.costo_reale - x.costo_reale);

    const fonteCount: Record<string, number> = {};
    rows.forEach((r) => { fonteCount[r.fonte_costo] = (fonteCount[r.fonte_costo] ?? 0) + 1; });

    const ricavoTot = rows.reduce((s, r) => s + r.ricavo, 0);
    const costoRealeTot = rows.reduce((s, r) => s + r.costo_reale, 0);
    const totali = {
      costo_standard: rows.reduce((s, r) => s + r.costo_standard, 0),
      costo_reale: costoRealeTot,
      ricavo: ricavoTot,
      margine: Math.round((ricavoTot - costoRealeTot) * 100) / 100,
      margine_perc: ricavoTot > 0 ? ((ricavoTot - costoRealeTot) / ricavoTot) * 100 : null,
      n_gruppi: agg.length,
      con_baseline: rows.filter((r) => r.ha_baseline_listino).length,
      tot: rows.length,
    };
    // Peggiore per marginalità: il gruppo con margine% più basso tra quelli con ricavo.
    const conRicavo = agg.filter((a) => a.ricavo > 0 && a.margine_perc != null);
    const peggiore = conRicavo.length
      ? conRicavo.reduce((min, a) => (a.margine_perc! < min.margine_perc! ? a : min))
      : null;
    return { aggregati: agg, totali, fonteMix: fonteCount, peggiore };
  }, [q.data, dim, vista]);

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

  const margTotColor = totali.margine >= 0 ? "text-emerald-600" : "text-rose-600";

  return (
    <div className="space-y-4">
      {/* Switch vista: Marginalità (dove guadagno/perdo) vs Controllo costi */}
      <ToggleGroup
        type="single"
        value={vista}
        onValueChange={(v) => v && setVista(v as "marginalita" | "costi")}
        size="sm"
        className="justify-start"
      >
        <ToggleGroupItem value="marginalita">Marginalità</ToggleGroupItem>
        <ToggleGroupItem value="costi">Controllo costi (listino vs reale)</ToggleGroupItem>
      </ToggleGroup>

      {/* KPI marginalità */}
      {vista === "marginalita" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Ricavo (da preventivo)</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold tabular-nums">{formatCurrency(totali.ricavo)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Costo materiali</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold tabular-nums">{formatCurrency(totali.costo_reale)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Margine su materiali</CardTitle></CardHeader>
              <CardContent>
                <p className={cn("text-2xl font-bold tabular-nums", margTotColor)}>{formatCurrency(totali.margine)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {totali.margine_perc != null ? `${totali.margine_perc.toFixed(1)}% sul ricavo` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card className={peggiore && (peggiore.margine_perc ?? 0) < 15 ? "border-rose-200 bg-rose-50/40" : undefined}>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Margine più basso</CardTitle></CardHeader>
              <CardContent>
                {peggiore ? (
                  <>
                    <p className="text-lg font-bold tabular-nums truncate" title={peggiore.label}>{peggiore.label}</p>
                    <p className={cn("text-[11px] mt-0.5", (peggiore.margine_perc ?? 0) < 15 ? "text-rose-600 font-medium" : "text-muted-foreground")}>
                      {peggiore.margine_perc != null ? `${peggiore.margine_perc.toFixed(1)}% di margine` : "—"}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Caption: cosa NON include questo margine */}
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Margine sui <strong>materiali</strong>: ricavo di preventivo meno il costo reale d'acquisto degli articoli.
              La <strong>manodopera</strong> è un costo a parte (per cantiere, non per prodotto): per il margine netto
              di ogni commessa — materiali + manodopera + spese — usa la tab <strong>Commesse</strong>.
            </span>
          </div>
        </>
      )}

      {/* KPI controllo costi */}
      {vista === "costi" && (
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
      )}

      {/* Avviso copertura listino basso — solo in controllo costi */}
      {vista === "costi" && baselinePerc < 50 && (
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
              const isMarg = vista === "marginalita";
              await exportXlsx({
                filename: `prodotti_${isMarg ? "marginalita" : "costi"}_${dim}_${anno}.xlsx`,
                brand: {
                  title: isMarg ? "Marginalità per prodotto/categoria" : "Costi per prodotto/categoria",
                  subtitle: `Esercizio ${anno} · ${dim === "categoria" ? "Categorie" : "Prodotti"}`,
                },
                sheets: [{
                  name: `${isMarg ? "Marginalità" : "Costi"} ${anno}`,
                  columns: isMarg
                    ? [
                        { header: dim === "categoria" ? "Categoria" : "Prodotto", key: "label", width: 32 },
                        { header: "N. righe", key: "n_righe", width: 10, type: "number" },
                        { header: "Ricavo", key: "ricavo", width: 14, type: "number" },
                        { header: "Costo materiali", key: "costo_reale", width: 14, type: "number" },
                        { header: "Margine €", key: "margine", width: 14, type: "number" },
                        { header: "Margine %", key: "marg_perc", width: 12 },
                      ]
                    : [
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
                    ricavo: a.ricavo,
                    costo_standard: a.costo_standard,
                    costo_reale: a.costo_reale,
                    margine: a.margine,
                    marg_perc: a.margine_perc != null ? `${a.margine_perc.toFixed(1)}%` : "—",
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
                {vista === "marginalita" ? (
                  <>
                    <th className="p-3 font-medium text-right">Ricavo</th>
                    <th className="p-3 font-medium text-right">Costo materiali</th>
                    <th className="p-3 font-medium text-right">Margine</th>
                  </>
                ) : (
                  <>
                    <th className="p-3 font-medium text-right">Costo listino</th>
                    <th className="p-3 font-medium text-right">Costo reale</th>
                    <th className="p-3 font-medium text-right">Scostamento</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {aggregati.map((a) => {
                const over = a.scostamento > 0.005;
                const under = a.scostamento < -0.005;
                // Semaforo margine: <10% rosso, <20% ambra, ≥20% verde.
                const mp = a.margine_perc;
                const margColor = mp == null ? "text-muted-foreground"
                  : mp < 10 ? "text-rose-600" : mp < 20 ? "text-amber-600" : "text-emerald-600";
                return (
                  <tr key={a.key} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium truncate max-w-[280px]">{a.label}</div>
                      {a.con_baseline < a.n_righe && (
                        <div className="text-[10px] text-muted-foreground">{a.con_baseline}/{a.n_righe} dal listino</div>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{a.n_righe}</td>
                    {vista === "marginalita" ? (
                      <>
                        <td className="p-3 text-right tabular-nums">{a.ricavo > 0 ? formatCurrency(a.ricavo) : "—"}</td>
                        <td className="p-3 text-right tabular-nums">{formatCurrency(a.costo_reale)}</td>
                        <td className="p-3 text-right tabular-nums">
                          <span className={cn("font-medium", margColor)}>{formatCurrency(a.margine)}</span>
                          {mp != null && <span className={cn("ml-1 text-[11px]", margColor)}>({mp.toFixed(0)}%)</span>}
                        </td>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
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
