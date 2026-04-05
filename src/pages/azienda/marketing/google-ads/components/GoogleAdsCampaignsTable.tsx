/**
 * Tabella campagne Google Ads con paginazione, ordinamento e filtro.
 * Mostra: nome campagna, spesa, impressioni, click, CTR, CPC, conversioni.
 *
 * @param campaigns - Lista campagne aggregate
 * @param isLoading - Stato di caricamento
 */
import { useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Megaphone, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatCurrency,
  formatPercent,
  formatNumber,
} from "@/lib/google-ads/formatters";
import type { GoogleAdsCampaign } from "@/types/google-ads";

const PAGE_SIZE = 10;

type SortKey = keyof Pick<
  GoogleAdsCampaign,
  "campaign_name" | "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "conversions"
>;

type SortDir = "asc" | "desc";

interface GoogleAdsCampaignsTableProps {
  campaigns: GoogleAdsCampaign[];
  isLoading: boolean;
}

function SortIcon({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
  return dir === "asc"
    ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
    : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
}

export function GoogleAdsCampaignsTable({
  campaigns,
  isLoading,
}: GoogleAdsCampaignsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  };

  const sorted = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc"
          ? av.localeCompare(bv, "it")
          : bv.localeCompare(av, "it");
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [campaigns, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (campaigns.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <Megaphone className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Nessuna campagna nel periodo selezionato.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Modifica il filtro date o verifica la sincronizzazione dei dati.
          </p>
        </CardContent>
      </Card>
    );
  }

  const cols: { key: SortKey; label: string; align?: "right" }[] = [
    { key: "campaign_name", label: "Campagna" },
    { key: "spend", label: "Spesa", align: "right" },
    { key: "impressions", label: "Impressioni", align: "right" },
    { key: "clicks", label: "Click", align: "right" },
    { key: "ctr", label: "CTR", align: "right" },
    { key: "cpc", label: "CPC", align: "right" },
    { key: "conversions", label: "Conv.", align: "right" },
  ];

  const renderCell = (row: GoogleAdsCampaign, key: SortKey): string => {
    switch (key) {
      case "campaign_name": return row.campaign_name;
      case "spend": return formatCurrency(row.spend);
      case "impressions": return formatNumber(row.impressions);
      case "clicks": return formatNumber(row.clicks);
      case "ctr": return formatPercent(row.ctr);
      case "cpc": return formatCurrency(row.cpc);
      case "conversions": return formatNumber(row.conversions);
      default: return "-";
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">
          Campagne ({campaigns.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {cols.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-2 font-medium text-muted-foreground whitespace-nowrap ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    <button
                      className="inline-flex items-center hover:text-foreground transition-colors"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      <SortIcon col={col.key} sortKey={sortKey} dir={sortDir} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((row, i) => (
                <tr
                  key={row.campaign_id ?? i}
                  className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                >
                  {cols.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 ${
                        col.align === "right"
                          ? "text-right tabular-nums"
                          : "max-w-[180px] truncate"
                      }`}
                      title={col.key === "campaign_name" ? row.campaign_name : undefined}
                    >
                      {renderCell(row, col.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-xs text-muted-foreground">
              Pagina {page + 1} di {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={page === totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
