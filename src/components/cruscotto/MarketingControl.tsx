import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardFunnel } from "@/components/marketing/dashboard/DashboardFunnel";
import { DashboardSourcesTable } from "@/components/marketing/dashboard/DashboardSourcesTable";
import { BarChart as BarChartIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { fmtCur } from "@/components/marketing/dashboard/utils";
import type { FunnelStage, SourceAnalysis } from "@/hooks/useMarketingDashboard";

interface Props {
  sources: SourceAnalysis[] | undefined;
  funnel: FunnelStage[] | undefined;
  isLoading: boolean;
}

const ROI_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(142 76% 36%)", "hsl(38 92% 50%)", "hsl(280 65% 60%)"];

export const MarketingControl = memo(function MarketingControl({ sources, funnel, isLoading }: Props) {
  const roiData = useMemo(() => {
    if (!sources) return [];
    return sources
      .filter(s => s.spend > 0)
      .map(s => ({
        name: s.source,
        roi: s.roi_pct ?? 0,
        revenue: s.revenue,
        spend: s.spend,
      }))
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 6);
  }, [sources]);

  const isEmpty = !isLoading && (!sources || sources.length === 0) && (!funnel || funnel.length === 0);

  if (isEmpty) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Marketing Control</h3>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BarChartIcon className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nessun dato marketing nel periodo</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Importa contatti o registra campagne per visualizzare funnel e ROI</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Marketing Control</h3>
      <DashboardFunnel funnel={funnel} isLoading={isLoading} />

      {/* ROI per source chart */}
      {roiData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ROI per Sorgente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roiData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === "roi") return [`${value.toFixed(0)}%`, "ROI"];
                      return [fmtCur(value), name === "revenue" ? "Ricavi" : "Spesa"];
                    }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <Bar dataKey="roi" radius={[4, 4, 0, 0]}>
                    {roiData.map((_, i) => (
                      <Cell key={i} fill={ROI_COLORS[i % ROI_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <DashboardSourcesTable sources={sources} isLoading={isLoading} />
    </div>
  );
});
