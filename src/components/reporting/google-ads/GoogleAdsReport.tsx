import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BarChart2, Link2, TrendingUp, MousePointerClick, Eye, Euro, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface GoogleAdsStat {
  campaign_name: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  cpc: number;
  status: string;
  date: string;
}

function KPICard({
  label,
  value,
  icon: Icon,
  sub,
  colorClass = "",
  isLoading,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  sub?: string;
  colorClass?: string;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-28 rounded-xl" />;
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={cn("text-2xl font-bold mt-1", colorClass)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="bg-primary/10 rounded-lg p-2">
            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GoogleAdsReport() {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const navigate = useNavigate();

  // Check if Google Ads integration exists
  const { data: integration, isLoading: integrationLoading } = useQuery({
    queryKey: ["google-ads-integration", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("integrations")
        .select("id, status, meta_data")
        .eq("company_id", companyId)
        .eq("provider", "google_ads")
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch Google Ads stats if connected
  const { data: stats = [], isLoading: statsLoading } = useQuery({
    queryKey: ["google-ads-stats", companyId, integration?.id],
    queryFn: async () => {
      if (!companyId || !integration?.id) return [];
      const { data } = await supabase
        .from("google_ads_stats" as any)
        .select("*")
        .eq("company_id", companyId)
        .eq("integration_id", integration.id)
        .order("date", { ascending: false })
        .limit(100);
      return (data || []) as GoogleAdsStat[];
    },
    enabled: !!companyId && !!integration?.id,
  });

  const isLoading = integrationLoading || statsLoading;

  // Not connected
  if (!integrationLoading && !integration) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold">Report Google Ads</h2>
            <p className="text-sm text-muted-foreground">Monitora le performance delle tue campagne Google</p>
          </div>
        </div>

        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" aria-hidden="true" />
          <AlertDescription className="text-blue-800 text-sm">
            Collega il tuo account Google Ads per visualizzare impressioni, click, costi e conversioni in tempo reale.
          </AlertDescription>
        </Alert>

        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl bg-card">
          <Link2 className="h-12 w-12 text-muted-foreground/40 mb-4" aria-hidden="true" />
          <h3 className="text-lg font-semibold">Account Google Ads non collegato</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Per visualizzare i report di Google Ads, collega prima il tuo account dalla sezione Integrazioni.
          </p>
          <Button
            className="mt-4"
            onClick={() => navigate("/azienda/impostazioni/integrazioni")}
          >
            Vai a Integrazioni
          </Button>
        </div>
      </div>
    );
  }

  // Compute aggregate KPIs
  const totalImpressions = stats.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const totalClicks = stats.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const totalCost = stats.reduce((s, r) => s + (r.cost ?? 0), 0);
  const totalConversions = stats.reduce((s, r) => s + (r.conversions ?? 0), 0);
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpc = totalClicks > 0 ? totalCost / totalClicks : 0;

  // Aggregate per campaign
  const byCampaign: Record<string, { impressions: number; clicks: number; cost: number; conversions: number; status: string }> = {};
  for (const s of stats) {
    if (!s.campaign_name) continue;
    if (!byCampaign[s.campaign_name]) {
      byCampaign[s.campaign_name] = { impressions: 0, clicks: 0, cost: 0, conversions: 0, status: s.status ?? "" };
    }
    byCampaign[s.campaign_name].impressions += s.impressions ?? 0;
    byCampaign[s.campaign_name].clicks += s.clicks ?? 0;
    byCampaign[s.campaign_name].cost += s.cost ?? 0;
    byCampaign[s.campaign_name].conversions += s.conversions ?? 0;
  }
  const campaigns = Object.entries(byCampaign).sort((a, b) => b[1].cost - a[1].cost);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold">Report Google Ads</h2>
            <p className="text-sm text-muted-foreground">Performance campagne pubblicitarie Google</p>
          </div>
        </div>
        {integration && (
          <Badge className={cn("text-xs", integration.status === "active" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800")}>
            {integration.status === "active" ? "Connesso" : "In attesa"}
          </Badge>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Impressioni" value={totalImpressions.toLocaleString("it-IT")} icon={Eye} isLoading={isLoading} />
        <KPICard label="Click" value={totalClicks.toLocaleString("it-IT")} icon={MousePointerClick} colorClass="text-primary" isLoading={isLoading} />
        <KPICard label="Spesa totale" value={formatCurrency(totalCost)} icon={Euro} colorClass="text-amber-600" isLoading={isLoading} />
        <KPICard label="Conversioni" value={totalConversions.toLocaleString("it-IT")} icon={TrendingUp} colorClass="text-green-600" isLoading={isLoading} />
        <KPICard label="CTR medio" value={`${avgCtr.toFixed(2)}%`} icon={BarChart2} isLoading={isLoading} />
        <KPICard label="CPC medio" value={formatCurrency(avgCpc)} icon={MousePointerClick} isLoading={isLoading} />
      </div>

      {/* Campaigns table */}
      {!isLoading && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Performance per campagna</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                Nessun dato campagna disponibile. I dati verranno mostrati dopo la prima sincronizzazione.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Campagna</th>
                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Impressioni</th>
                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Click</th>
                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">CTR</th>
                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Spesa</th>
                      <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Conversioni</th>
                      <th className="text-center px-4 py-2 text-xs text-muted-foreground font-medium">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(([name, data]) => {
                      const ctr = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0;
                      return (
                        <tr key={name} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 font-medium max-w-[200px] truncate" title={name}>{name}</td>
                          <td className="px-4 py-2.5 text-right">{data.impressions.toLocaleString("it-IT")}</td>
                          <td className="px-4 py-2.5 text-right">{data.clicks.toLocaleString("it-IT")}</td>
                          <td className="px-4 py-2.5 text-right">{ctr.toFixed(2)}%</td>
                          <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(data.cost)}</td>
                          <td className="px-4 py-2.5 text-right text-green-600 font-semibold">{data.conversions}</td>
                          <td className="px-4 py-2.5 text-center">
                            <Badge className={cn("text-xs border-0", data.status === "ENABLED" ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground")}>
                              {data.status === "ENABLED" ? "Attiva" : data.status ?? "—"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
