import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import type { useMetaAdsReport } from "@/hooks/useMetaAdsReport";
import type { NormalizedCampaignRow } from "@/lib/metaInsightsNormalizer";

interface Props {
  report: ReturnType<typeof useMetaAdsReport>;
}

const fmtNum = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(n);
const fmtCurrency = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
const fmtPct = (n: number) => new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + "%";

const ALL_COLUMNS: { key: string; label: string; format: (r: NormalizedCampaignRow) => string; align?: string }[] = [
  { key: "campaign_name", label: "Campagna", format: (r) => r.campaign_name || r.adset_name || r.ad_name || "—" },
  { key: "status", label: "Stato", format: (r) => r.status || "—" },
  { key: "clicks", label: "Clic", format: (r) => fmtNum(r.clicks), align: "right" },
  { key: "spend", label: "Costo", format: (r) => fmtCurrency(r.spend), align: "right" },
  { key: "revenue", label: "Entrate", format: (r) => fmtCurrency(r.revenue), align: "right" },
  { key: "roi", label: "ROI %", format: (r) => (r.revenue > 0 ? fmtPct(r.roi) : "—"), align: "right" },
  { key: "cpc", label: "CPC", format: (r) => fmtCurrency(r.cpc), align: "right" },
  { key: "ctr", label: "CTR", format: (r) => fmtPct(r.ctr), align: "right" },
  { key: "purchases", label: "Vendite", format: (r) => fmtNum(r.purchases), align: "right" },
  { key: "cps", label: "CPS", format: (r) => (r.purchases > 0 ? fmtCurrency(r.cps) : "—"), align: "right" },
  { key: "leads", label: "Lead", format: (r) => fmtNum(r.leads), align: "right" },
  { key: "cpl", label: "CPL", format: (r) => (r.leads > 0 ? fmtCurrency(r.cpl) : "—"), align: "right" },
  { key: "impressions", label: "Impressioni", format: (r) => fmtNum(r.impressions), align: "right" },
  { key: "avg_revenue", label: "Entrate medie", format: (r) => (r.purchases > 0 ? fmtCurrency(r.avg_revenue) : "—"), align: "right" },
];

const StatusBadge = ({ status }: { status?: string }) => {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const s = status.toUpperCase();
  if (s === "ACTIVE") return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">Attivo</Badge>;
  if (s === "PAUSED") return <Badge variant="secondary" className="text-xs">In pausa</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
};

const CampaignTable = ({ report }: Props) => {
  const columns = ALL_COLUMNS.filter((c) => report.visibleColumns.includes(c.key));

  const SortIcon = ({ col }: { col: string }) => {
    if (report.sortColumn !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return report.sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  return (
    <Card className="overflow-hidden">
      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-muted/30">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca campagna..."
            value={report.filters.search}
            onChange={(e) => report.setFilters({ ...report.filters, search: e.target.value })}
            className="pl-8 h-8 text-xs"
          />
        </div>

        <Select
          value={report.filters.status}
          onValueChange={(v) => report.setFilters({ ...report.filters, status: v as any })}
        >
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="ACTIVE">Attivi</SelectItem>
            <SelectItem value="PAUSED">In pausa</SelectItem>
          </SelectContent>
        </Select>

        {report.objectives.length > 0 && (
          <Select
            value={report.filters.objective || "all"}
            onValueChange={(v) => report.setFilters({ ...report.filters, objective: v === "all" ? "" : v })}
          >
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="Obiettivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli obiettivi</SelectItem>
              {report.objectives.map((o) => (
                <SelectItem key={o} value={o!}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-1.5">
          <Switch
            checked={report.filters.onlyWithLeads}
            onCheckedChange={(v) => report.setFilters({ ...report.filters, onlyWithLeads: v })}
            className="h-4 w-7"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">Solo con lead</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0 z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors ${col.align === "right" ? "text-right" : "text-left"}`}
                  onClick={() => report.toggleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIcon col={col.key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-t border-border/50">
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2.5">
                      <Skeleton className="h-4 w-16" />
                    </td>
                  ))}
                </tr>
              ))
            ) : report.rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-12 text-muted-foreground text-sm">
                  Nessun dato nel periodo selezionato
                </td>
              </tr>
            ) : (
              report.rows.map((row, i) => (
                <tr key={`${row.campaign_id}-${i}`} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-2.5 whitespace-nowrap ${col.align === "right" ? "text-right tabular-nums" : "text-left"}`}
                    >
                      {col.key === "status" ? (
                        <StatusBadge status={row.status} />
                      ) : (
                        <span className="text-sm">{col.format(row)}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {!report.isLoading && report.rows.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
          <span>{report.rows.length} campagne</span>
          <span>Totale: {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(report.rows.reduce((s, r) => s + r.spend, 0))}</span>
        </div>
      )}
    </Card>
  );
};

export default CampaignTable;
