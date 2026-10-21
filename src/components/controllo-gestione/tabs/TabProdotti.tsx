/**
 * Tab Prodotti & Categorie — margine sui materiali e costo di listino contro
 * costo reale, per fase di lavoro, fornitore, prodotto o categoria.
 *
 * Fonti: vista `v_ordine_articoli_costi` (una riga per articolo di commessa:
 * costo reale = righe d'ordine al fornitore se ci sono, altrimenti prezzo
 * d'acquisto manuale o di magazzino) + `order_items` per prezzo di vendita,
 * sconto, fase e fornitore. Le commesse cancellate non contano.
 * Calcoli in `@/lib/controlloGestione/prodottiMargine`.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";
import { ExportButton } from "@/components/controllo-gestione/ui/ExportButton";
import { exportXlsx } from "@/lib/controlloGestione/exportXlsx";
import { formatCurrency } from "@/lib/formatters";
import { percIt } from "@/lib/controlloGestione/formatoCG";
import {
  aggregaProdotti, ricavoRiga, totaliProdotti,
  type DimensioneProdotti, type RigaProdotto,
} from "@/lib/controlloGestione/prodottiMargine";
import { cn } from "@/lib/utils";
import { Package, TrendingUp, TrendingDown, Info } from "lucide-react";

interface Props {
  anno: number;
}

const FONTE_LABEL: Record<string, string> = {
  manuale: "Costo scritto a mano",
  oda: "Da ordine al fornitore",
  magazzino: "Da magazzino",
};

const DIMENSIONI: { value: DimensioneProdotti; label: string; colonna: string }[] = [
  { value: "fase", label: "Per fase di lavoro", colonna: "Fase di lavoro" },
  { value: "fornitore", label: "Per fornitore", colonna: "Fornitore" },
  { value: "prodotto", label: "Per prodotto", colonna: "Prodotto" },
  { value: "categoria", label: "Per categoria", colonna: "Categoria scritta sull'articolo" },
];

// Vista e relazioni non tutte nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface RigaVista {
  order_item_id: string;
  order_id: string;
  article_template_id: string | null;
  categoria: string | null;
  name: string | null;
  costo_standard: number | string | null;
  costo_reale: number | string | null;
  fonte_costo: string;
  ha_baseline_listino: boolean | null;
}
interface RigaArticolo {
  id: string;
  unit_price: number | string | null;
  quantity: number | string | null;
  discount_percent: number | string | null;
  supplier: { name: string | null } | null;
  phase: { name: string | null } | null;
  order: { deleted_at: string | null } | null;
}

async function leggiRighe(companyId: string, anno: number): Promise<RigaProdotto[]> {
  // Inizio e fine anno nell'ora italiana, non in UTC.
  const da = new Date(anno, 0, 1).toISOString();
  const a = new Date(anno + 1, 0, 1).toISOString();
  // A pagine: PostgREST taglia a mille righe (prima c'era .limit(5000), inutile).
  const vista = await allPaymentRows<RigaVista>((from, to) =>
    db.from("v_ordine_articoli_costi")
      .select("order_item_id,order_id,article_template_id,categoria,name,costo_standard,costo_reale,fonte_costo,ha_baseline_listino")
      .eq("company_id", companyId)
      .gte("created_at", da)
      .lt("created_at", a)
      .order("order_item_id")
      .range(from, to));
  const articoli = new Map<string, RigaArticolo>();
  const ids = vista.map((r) => r.order_item_id);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await db
      .from("order_items")
      .select("id,unit_price,quantity,discount_percent,supplier:suppliers(name),phase:order_work_phases!order_items_phase_id_fkey(name),order:orders!order_items_order_id_fkey(deleted_at)")
      .in("id", chunk);
    if (error) throw error;
    for (const r of (data ?? []) as RigaArticolo[]) articoli.set(r.id, r);
  }
  return vista
    .filter((r) => {
      const art = articoli.get(r.order_item_id);
      // Le commesse cancellate non contano (la vista non le esclude).
      return art && !art.order?.deleted_at;
    })
    .map((r) => {
      const art = articoli.get(r.order_item_id)!;
      return {
        order_item_id: r.order_item_id,
        name: r.name ?? "",
        categoria: r.categoria ?? "Senza categoria",
        fase: art.phase?.name?.trim() || null,
        fornitore: art.supplier?.name?.trim() || null,
        article_template_id: r.article_template_id,
        costo_standard: Number(r.costo_standard ?? 0),
        costo_reale: Number(r.costo_reale ?? 0),
        fonte_costo: r.fonte_costo,
        ha_baseline_listino: !!r.ha_baseline_listino,
        ricavo: ricavoRiga(art.unit_price, art.quantity, art.discount_percent),
      };
    });
}

export function TabProdotti({ anno }: Props) {
  const companyId = useEffectiveCompanyId();
  const [dim, setDim] = useState<DimensioneProdotti>("fase");
  // Vista: marginalità (dove guadagno/perdo) vs controllo costi (listino vs reale).
  const [vista, setVista] = useState<"marginalita" | "costi">("marginalita");

  const q = useQuery({
    queryKey: ["cg-articoli-costi", "v2", companyId, anno],
    enabled: !!companyId,
    queryFn: () => leggiRighe(companyId!, anno),
    staleTime: 60_000,
  });

  const { aggregati, totali, fonteMix, peggiore } = useMemo(() => {
    const rows = q.data ?? [];
    const agg = aggregaProdotti(rows, dim)
      // In marginalità dai più redditizi ai peggiori; in controllo costi dove spendo di più.
      .sort((x, y) => (vista === "marginalita" ? y.margine - x.margine : y.costo_reale - x.costo_reale));
    const fonteCount: Record<string, number> = {};
    rows.forEach((r) => { fonteCount[r.fonte_costo] = (fonteCount[r.fonte_costo] ?? 0) + 1; });
    const conRicavo = agg.filter((a) => a.ricavo > 0 && a.margine_perc != null);
    const peggiore = conRicavo.length
      ? conRicavo.reduce((min, a) => (a.margine_perc! < min.margine_perc! ? a : min))
      : null;
    return { aggregati: agg, totali: totaliProdotti(rows), fonteMix: fonteCount, peggiore };
  }, [q.data, dim, vista]);

  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (q.isError) return <ErrorBlock onRetry={() => q.refetch()} />;
  if (!q.data || q.data.length === 0) {
    return (
      <EmptyState
        icon={<Package className="h-6 w-6 text-muted-foreground" />}
        title="Nessun articolo nelle commesse dell'anno"
        description={`Nelle commesse aperte nel ${anno} non ci sono articoli. Aggiungili alle commesse per vedere su quali materiali guadagni di più.`}
      />
    );
  }

  const colonna = DIMENSIONI.find((d) => d.value === dim)!.colonna;
  const baselinePerc = totali.righe > 0 ? Math.round((totali.con_baseline / totali.righe) * 100) : 0;
  const scostTot = totali.scostamento;
  const overColor = scostTot > 0.005 ? "text-rose-600" : scostTot < -0.005 ? "text-emerald-600" : "text-muted-foreground";
  const margTotColor = totali.margine >= 0 ? "text-emerald-600" : "text-rose-600";

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Articoli delle commesse aperte nel {anno} ({totali.righe} righe; commesse cancellate escluse).
      </p>
      {/* Switch vista: Marginalità (dove guadagno/perdo) vs Controllo costi */}
      <ToggleGroup
        type="single"
        value={vista}
        onValueChange={(v) => v && setVista(v as "marginalita" | "costi")}
        size="sm"
        className="flex-wrap justify-start"
      >
        <ToggleGroupItem value="marginalita">Margine sui materiali</ToggleGroupItem>
        <ToggleGroupItem value="costi">Costo di listino contro costo reale</ToggleGroupItem>
      </ToggleGroup>

      {vista === "marginalita" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KPI label="Venduto (dai preventivi)" value={formatCurrency(totali.ricavo)} sub="Prezzo di vendita delle righe, sconti tolti" />
            <KPI label="Costo materiali" value={formatCurrency(totali.costo_con_ricavo)} sub="Delle stesse righe" />
            <KPI
              label="Margine sui materiali"
              value={formatCurrency(totali.margine)}
              valueClass={margTotColor}
              sub={totali.margine_perc != null ? `${percIt(totali.margine_perc)} del venduto` : "—"}
            />
            <KPI
              label={dim === "prodotto" ? "Prodotto con meno margine" : "Gruppo con meno margine"}
              value={peggiore ? peggiore.label : "—"}
              title={peggiore?.label}
              valueClass="truncate text-lg"
              sub={peggiore?.margine_perc != null ? `${percIt(peggiore.margine_perc)} di margine` : undefined}
              alert={!!peggiore && (peggiore.margine_perc ?? 0) < 15}
            />
          </div>

          {totali.righe_senza_ricavo > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>{formatCurrency(totali.costo_senza_ricavo)}</strong> di costi su {totali.righe_senza_ricavo} {totali.righe_senza_ricavo === 1 ? "riga" : "righe"}{" "}
                senza prezzo di vendita: sono materiali comprati ma non presenti nel preventivo (o con prezzo zero).
                Non li contiamo come margine negativo: controlla se vanno fatti pagare al cliente o se sono un costo
                del cantiere. Sono comunque nei costi della scheda Commesse.
              </span>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Margine sui <strong>materiali</strong>: prezzo di vendita meno costo d'acquisto degli articoli.
              Manodopera e spese del cantiere non ci sono (si pagano per commessa, non per prodotto): per il margine
              completo di ogni lavoro usa la scheda <strong>Commesse</strong>.
            </span>
          </div>
        </>
      )}

      {vista === "costi" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KPI label="Costo reale" value={formatCurrency(totali.costo_reale)} sub="Tutte le righe" />
          <KPI label="Costo di listino" value={formatCurrency(totali.costo_standard)} sub={`Sulle ${totali.con_baseline} righe che lo hanno`} />
          <KPI
            label="Differenza dal listino"
            value={`${scostTot > 0 ? "+" : ""}${formatCurrency(scostTot)}`}
            valueClass={overColor}
            icon={scostTot > 0.005 ? <TrendingUp className="h-5 w-5" /> : scostTot < -0.005 ? <TrendingDown className="h-5 w-5" /> : null}
            sub={totali.scostamento_perc != null
              ? `${totali.scostamento_perc > 0 ? "+" : ""}${percIt(totali.scostamento_perc)} rispetto al listino`
              : "Nessuna riga con costo di listino"}
          />
          <KPI label="Righe con costo di listino" value={`${baselinePerc}%`} sub={`${totali.con_baseline} su ${totali.righe} righe`} />
        </div>
      )}

      {vista === "costi" && baselinePerc < 50 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {totali.con_baseline === 0
              ? "Nessun articolo ha un costo di listino: sono stati scritti a mano nella commessa invece di essere presi dal listino. "
              : `Solo il ${baselinePerc}% delle righe ha un costo di listino. `}
            Il confronto si fa solo su quelle righe. Aggiungendo gli articoli <strong>dal listino</strong> il costo
            previsto viene salvato e qui vedi subito dove paghi più del previsto.
          </span>
        </div>
      )}

      {/* Raggruppamento + export */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup type="single" value={dim} onValueChange={(v) => v && setDim(v as DimensioneProdotti)} size="sm" className="flex-wrap justify-start">
          {DIMENSIONI.map((d) => (
            <ToggleGroupItem key={d.value} value={d.value}>{d.label}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(fonteMix).map(([f, n]) => (
            <Badge key={f} variant="outline" className="text-[10px] font-normal">
              {FONTE_LABEL[f] ?? f}: {n}
            </Badge>
          ))}
          <ExportButton
            onExport={async () => {
              const isMarg = vista === "marginalita";
              await exportXlsx({
                filename: `prodotti_${isMarg ? "margine" : "costi"}_${dim}_${anno}.xlsx`,
                brand: {
                  title: isMarg ? "Margine sui materiali" : "Costo di listino e costo reale",
                  subtitle: `Esercizio ${anno} · ${colonna}`,
                },
                sheets: [{
                  name: `${isMarg ? "Margine" : "Costi"} ${anno}`,
                  columns: isMarg
                    ? [
                        { header: colonna, key: "label", width: 32 },
                        { header: "N. righe", key: "n_righe", width: 10, type: "number" },
                        { header: "Venduto", key: "ricavo", width: 14, type: "number" },
                        { header: "Costo materiali", key: "costo_con_ricavo", width: 14, type: "number" },
                        { header: "Margine €", key: "margine", width: 14, type: "number" },
                        { header: "Margine %", key: "marg_perc", width: 12 },
                        { header: "Costi senza prezzo di vendita", key: "costo_senza_ricavo", width: 18, type: "number" },
                      ]
                    : [
                        { header: colonna, key: "label", width: 32 },
                        { header: "N. righe", key: "n_righe", width: 10, type: "number" },
                        { header: "Righe con listino", key: "con_baseline", width: 12, type: "number" },
                        { header: "Costo listino", key: "costo_standard", width: 14, type: "number" },
                        { header: "Costo reale", key: "costo_reale", width: 14, type: "number" },
                        { header: "Differenza €", key: "scostamento", width: 14, type: "number" },
                        { header: "Differenza %", key: "scost_perc", width: 12 },
                      ],
                  rows: aggregati.map((a) => ({
                    ...a,
                    marg_perc: percIt(a.margine_perc),
                    scost_perc: a.scostamento_perc != null ? `${a.scostamento_perc > 0 ? "+" : ""}${percIt(a.scostamento_perc)}` : "—",
                  })),
                }],
              });
            }}
          />
        </div>
      </div>

      {/* Tabella */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">{vista === "marginalita" ? "Margine sui materiali" : "Costo di listino e costo reale"} per {colonna.toLowerCase()}</caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="p-3 font-medium">{colonna}</th>
                <th scope="col" className="p-3 text-right font-medium">Righe</th>
                {vista === "marginalita" ? (
                  <>
                    <th scope="col" className="p-3 text-right font-medium">Venduto</th>
                    <th scope="col" className="p-3 text-right font-medium">Costo materiali</th>
                    <th scope="col" className="p-3 text-right font-medium">Margine</th>
                  </>
                ) : (
                  <>
                    <th scope="col" className="p-3 text-right font-medium">Costo di listino</th>
                    <th scope="col" className="p-3 text-right font-medium">Costo reale</th>
                    <th scope="col" className="p-3 text-right font-medium">Differenza</th>
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
                      <div className="max-w-[280px] truncate font-medium" title={a.label}>{a.label}</div>
                      {vista === "costi" && a.con_baseline < a.n_righe && (
                        <div className="text-[10px] text-muted-foreground">
                          {a.con_baseline === 0 ? "Nessuna riga dal listino" : `${a.con_baseline} su ${a.n_righe} righe con costo di listino`}
                        </div>
                      )}
                      {vista === "marginalita" && a.righe_senza_ricavo > 0 && (
                        <div className="text-[10px] font-medium text-amber-700">
                          {formatCurrency(a.costo_senza_ricavo)} di costi senza prezzo di vendita ({a.righe_senza_ricavo} {a.righe_senza_ricavo === 1 ? "riga" : "righe"})
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{a.n_righe}</td>
                    {vista === "marginalita" ? (
                      <>
                        <td className="whitespace-nowrap p-3 text-right tabular-nums">{a.ricavo > 0 ? formatCurrency(a.ricavo) : "—"}</td>
                        <td className="whitespace-nowrap p-3 text-right tabular-nums">{a.ricavo > 0 ? formatCurrency(a.costo_con_ricavo) : "—"}</td>
                        <td className="whitespace-nowrap p-3 text-right tabular-nums">
                          {a.ricavo > 0 ? (
                            <>
                              <span className={cn("font-medium", margColor)}>{formatCurrency(a.margine)}</span>
                              {mp != null && <span className={cn("ml-1 text-[11px]", margColor)}>({percIt(mp, 0)})</span>}
                            </>
                          ) : (
                            <span className="text-xs font-medium text-amber-700">Costo senza preventivo</span>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="whitespace-nowrap p-3 text-right tabular-nums">{a.costo_standard > 0 ? formatCurrency(a.costo_standard) : "—"}</td>
                        <td className="whitespace-nowrap p-3 text-right font-medium tabular-nums">{formatCurrency(a.costo_reale)}</td>
                        <td className="whitespace-nowrap p-3 text-right tabular-nums">
                          {a.scostamento_perc == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={cn("font-medium", over ? "text-rose-600" : under ? "text-emerald-600" : "text-muted-foreground")}>
                              {over ? "▲" : under ? "▼" : ""} {a.scostamento > 0 ? "+" : ""}{formatCurrency(a.scostamento)}
                              <span className="ml-1 text-[11px]">({a.scostamento_perc > 0 ? "+" : ""}{percIt(a.scostamento_perc, 0)})</span>
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

function KPI({ label, value, sub, valueClass, title, alert = false, icon }: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  title?: string;
  alert?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Card className={cn("min-w-0", alert && "border-rose-200 bg-rose-50/40")}>
      <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent>
        <p className={cn("flex items-center gap-1 break-words text-xl font-bold leading-tight tabular-nums", valueClass)} title={title}>
          {icon}{value}
        </p>
        {sub && <p className={cn("mt-0.5 text-[11px]", alert ? "font-medium text-rose-600" : "text-muted-foreground")}>{sub}</p>}
      </CardContent>
    </Card>
  );
}
