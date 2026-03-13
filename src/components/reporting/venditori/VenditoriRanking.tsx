import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Medal, Award, Users } from "lucide-react";
import { useTableSort } from "@/hooks/useTableSort";
import { formatCurrency } from "@/lib/formatters";
import type { VendorKPI } from "@/hooks/useVendorReport";

const RANK_ICONS = [Crown, Medal, Award];
const RANK_COLORS = ["text-yellow-500", "text-gray-400", "text-amber-600"];

function kpiBadge(val: number | null, field: string) {
  const v = val ?? 0;
  const good = (f: string, n: number) => {
    if (f === "avg_giorni_chiusura") return n > 0 && n < 30;
    if (f === "tasso_chiusura") return n >= 35;
    if (f === "tasso_show_up") return n >= 70;
    if (f === "tasso_app_to_close") return n >= 25;
    return false;
  };
  const bad = (f: string, n: number) => {
    if (f === "avg_giorni_chiusura") return n > 60;
    if (f === "tasso_chiusura") return n < 20;
    if (f === "tasso_show_up") return n < 50;
    if (f === "tasso_app_to_close") return n < 12;
    return false;
  };

  const isPercent = ["tasso_chiusura", "tasso_show_up", "tasso_app_to_close"].includes(field);
  const isDays = field === "avg_giorni_chiusura";
  const display = isPercent ? `${v}%` : isDays ? `${v}gg` : String(v);

  const color = good(field, v)
    ? "bg-green-50 text-green-700 border-green-200"
    : bad(field, v)
    ? "bg-red-50 text-red-700 border-red-200"
    : "bg-amber-50 text-amber-700 border-amber-200";

  return <Badge variant="outline" className={`text-xs font-medium ${color}`}>{display}</Badge>;
}

export function VenditoriRanking({ kpiList, isLoading }: { kpiList: VendorKPI[]; isLoading: boolean }) {
  const accessors = useMemo(() => ({
    nome_agente: (k: VendorKPI) => k.nome_agente,
    fatturato_generato: (k: VendorKPI) => k.fatturato_generato,
    tasso_chiusura: (k: VendorKPI) => k.tasso_chiusura ?? 0,
    tasso_show_up: (k: VendorKPI) => k.tasso_show_up ?? 0,
    importo_medio_chiusura: (k: VendorKPI) => k.importo_medio_chiusura,
    opp_vinte: (k: VendorKPI) => k.opp_vinte,
    tasso_app_to_close: (k: VendorKPI) => k.tasso_app_to_close ?? 0,
    avg_giorni_chiusura: (k: VendorKPI) => -(k.avg_giorni_chiusura ?? 0), // negated so asc = fastest
    pipeline_valore: (k: VendorKPI) => k.pipeline_valore,
    nuovi_contatti: (k: VendorKPI) => k.nuovi_contatti,
  }), []);

  const { sortConfig, toggleSort, sortedItems } = useTableSort(kpiList, accessors);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (!kpiList.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-medium text-muted-foreground">Nessun dato agente</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">Nessun dato disponibile per il periodo selezionato.</p>
        </CardContent>
      </Card>
    );
  }

  // Team totals
  const totFatturato = sortedItems.reduce((a, k) => a + k.fatturato_generato, 0);
  const totVinte = sortedItems.reduce((a, k) => a + k.opp_vinte, 0);
  const totPipeline = sortedItems.reduce((a, k) => a + k.pipeline_valore, 0);
  const totContatti = sortedItems.reduce((a, k) => a + k.nuovi_contatti, 0);
  const n = sortedItems.length;
  const avgChiusura = n > 0 ? Math.round(sortedItems.reduce((a, k) => a + (k.tasso_chiusura ?? 0), 0) / n) : 0;
  const avgShowUp = n > 0 ? Math.round(sortedItems.reduce((a, k) => a + (k.tasso_show_up ?? 0), 0) / n) : 0;
  const avgAppClose = n > 0 ? Math.round(sortedItems.reduce((a, k) => a + (k.tasso_app_to_close ?? 0), 0) / n) : 0;
  const avgCiclo = n > 0 ? Math.round(sortedItems.reduce((a, k) => a + (k.avg_giorni_chiusura ?? 0), 0) / n) : 0;

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="" label="#" sortConfig={null} onSort={() => {}} className="w-10 text-center" />
              <SortableTableHead column="nome_agente" label="Agente" sortConfig={sortConfig} onSort={toggleSort} />
              <SortableTableHead column="fatturato_generato" label="Fatturato" sortConfig={sortConfig} onSort={toggleSort} className="text-right" />
              <SortableTableHead column="tasso_chiusura" label="Chiusura%" sortConfig={sortConfig} onSort={toggleSort} className="text-center" />
              <SortableTableHead column="tasso_show_up" label="Show-Up%" sortConfig={sortConfig} onSort={toggleSort} className="text-center" />
              <SortableTableHead column="importo_medio_chiusura" label="Deal Medio" sortConfig={sortConfig} onSort={toggleSort} className="text-right" />
              <SortableTableHead column="opp_vinte" label="Opp Vinte" sortConfig={sortConfig} onSort={toggleSort} className="text-center" />
              <SortableTableHead column="tasso_app_to_close" label="App→Close" sortConfig={sortConfig} onSort={toggleSort} className="text-center" />
              <SortableTableHead column="avg_giorni_chiusura" label="Ciclo" sortConfig={sortConfig} onSort={toggleSort} className="text-center" />
              <SortableTableHead column="pipeline_valore" label="Pipeline" sortConfig={sortConfig} onSort={toggleSort} className="text-right" />
              <SortableTableHead column="nuovi_contatti" label="Contatti" sortConfig={sortConfig} onSort={toggleSort} className="text-center" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedItems.map((k, idx) => {
              const RankIcon = RANK_ICONS[idx];
              const rankColor = RANK_COLORS[idx] ?? "";
              return (
                <TableRow key={k.agent_id}>
                  <TableCell className="text-center font-medium">
                    {RankIcon ? <RankIcon className={`h-4 w-4 mx-auto ${rankColor}`} /> : idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{k.nome_agente}</div>
                    <div className="text-xs text-muted-foreground">{k.email_agente}</div>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(k.fatturato_generato)}</TableCell>
                  <TableCell className="text-center">{kpiBadge(k.tasso_chiusura, "tasso_chiusura")}</TableCell>
                  <TableCell className="text-center">{kpiBadge(k.tasso_show_up, "tasso_show_up")}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(k.importo_medio_chiusura)}</TableCell>
                  <TableCell className="text-center">
                    <span className="font-semibold">{k.opp_vinte}</span>
                    <span className="text-muted-foreground text-xs"> / {k.opp_totali}</span>
                  </TableCell>
                  <TableCell className="text-center">{kpiBadge(k.tasso_app_to_close, "tasso_app_to_close")}</TableCell>
                  <TableCell className="text-center">{kpiBadge(k.avg_giorni_chiusura, "avg_giorni_chiusura")}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(k.pipeline_valore)}</TableCell>
                  <TableCell className="text-center">{k.nuovi_contatti}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {n > 1 && (
            <TableFooter>
              <TableRow>
                <TableCell />
                <TableCell className="font-semibold">Totale Team</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(totFatturato)}</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">{avgChiusura}% avg</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">{avgShowUp}% avg</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(totVinte > 0 ? totFatturato / totVinte : 0)}</TableCell>
                <TableCell className="text-center font-semibold">{totVinte}</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">{avgAppClose}% avg</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">{avgCiclo}gg avg</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(totPipeline)}</TableCell>
                <TableCell className="text-center">{totContatti}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </CardContent>

      <div className="flex items-center gap-4 px-6 pb-4 text-xs text-muted-foreground">
        <span><Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">val</Badge> Ottimo</span>
        <span><Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">val</Badge> Da migliorare</span>
        <span><Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">val</Badge> Critico</span>
      </div>
    </Card>
  );
}
