import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CampaignStatsCards } from "./CampaignStatsCards";
import { EmailFunnelChart } from "./EmailFunnelChart";
import { EmailPerformanceChart } from "./EmailPerformanceChart";
import { EmailTopCampaignsTable } from "./EmailTopCampaignsTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { CampaignDialog } from "./CampaignDialog";

export function EmailStatsTab() {
  const { company } = useAuth();
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: campaigns = [] } = useQuery({
    queryKey: ["email-campaigns-list", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("id, name, type, sent_at, total_recipients")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["email-logs-stats", company?.id, campaignFilter, dateFrom, dateTo],
    enabled: !!company?.id,
    queryFn: async () => {
      let q = supabase
        .from("email_logs")
        .select("status, campaign_id, event_timestamp")
        .eq("company_id", company!.id);
      if (campaignFilter !== "all") q = q.eq("campaign_id", campaignFilter);
      if (dateFrom) q = q.gte("event_timestamp", new Date(dateFrom).toISOString());
      if (dateTo) q = q.lte("event_timestamp", new Date(dateTo + "T23:59:59").toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const count = (s: string) => logs.filter((l: any) => l.status === s).length;
  const stats = {
    sent: logs.length,
    delivered: count("delivered") + count("opened") + count("clicked"),
    opened: count("opened") + count("clicked"),
    clicked: count("clicked"),
    bounced: count("bounced"),
    unsubscribed: count("unsubscribed"),
    spam: count("spam"),
  };

  const funnel = { ...stats, converted: 0 };

  // Build campaign performance data for table
  const campaignPerf = campaigns
    .filter((c: any) => c.sent_at)
    .map((c: any) => {
      const cLogs = logs.filter((l: any) => l.campaign_id === c.id);
      const cCount = (s: string) => cLogs.filter((l: any) => l.status === s).length;
      const delivered = cCount("delivered") + cCount("opened") + cCount("clicked");
      return {
        id: c.id,
        name: c.name,
        sent_at: c.sent_at,
        delivered,
        opened: cCount("opened") + cCount("clicked"),
        clicked: cCount("clicked"),
        type: c.type,
      };
    });

  // Empty chart data placeholder
  const chartData: Array<{ date: string; all: number; broadcast: number; automation: number; bulk: number }> = [];

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Tutte le campagne" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le campagne</SelectItem>
            {campaigns.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Dal</span>
          <Input type="date" className="w-[150px] h-9" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span>al</span>
          <Input type="date" className="w-[150px] h-9" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="ml-auto">
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Crea campagna
          </Button>
        </div>
      </div>

      {/* Engagement summary + funnel */}
      <div>
        <h3 className="text-lg font-semibold text-foreground">Riepilogo del coinvolgimento</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Panoramica delle performance di tutte le email inviate nel periodo selezionato
        </p>
        <EmailFunnelChart data={funnel} />
      </div>

      {/* Performance analysis - 4 cards */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-3">Analisi delle prestazioni</h3>
        <CampaignStatsCards stats={stats} />
      </div>

      {/* Performance chart */}
      <EmailPerformanceChart data={chartData} />

      {/* Top campaigns table */}
      <EmailTopCampaignsTable campaigns={campaignPerf} />

      <CampaignDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
