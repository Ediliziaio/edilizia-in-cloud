import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CampaignStatsCards } from "./CampaignStatsCards";
import { EmailFunnelChart } from "./EmailFunnelChart";
import { EmailPerformanceChart } from "./EmailPerformanceChart";
import { EmailTopCampaignsTable } from "./EmailTopCampaignsTable";
import { CampaignCreateDropdown } from "./CampaignCreateDropdown";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

export function EmailStatsTab() {
  const { effectiveCompany: company } = useAuth();
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: campaigns = [] } = useQuery({
    queryKey: ["email-campaigns", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
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

  // Build chart datasets for all 3 metrics
  const chartDatasets = useMemo(() => {
    if (logs.length === 0) return { open_rate: [], click_rate: [], delivery_rate: [] };

    const campaignTypeMap = new Map<string, string>();
    campaigns.forEach((c: any) => campaignTypeMap.set(c.id, c.type));

    const byDate = new Map<string, {
      total: number;
      delivered: number;
      opened: number;
      clicked: number;
      byType: Record<string, { delivered: number; opened: number; clicked: number }>;
    }>();

    logs.forEach((l: any) => {
      const date = format(new Date(l.event_timestamp), "dd/MM");
      if (!byDate.has(date)) {
        byDate.set(date, {
          total: 0, delivered: 0, opened: 0, clicked: 0,
          byType: { broadcast: { delivered: 0, opened: 0, clicked: 0 }, automation: { delivered: 0, opened: 0, clicked: 0 }, bulk: { delivered: 0, opened: 0, clicked: 0 } },
        });
      }
      const entry = byDate.get(date)!;
      entry.total++;

      const cType = campaignTypeMap.get(l.campaign_id) || "broadcast";
      const isDelivered = l.status === "delivered" || l.status === "opened" || l.status === "clicked";
      const isOpened = l.status === "opened" || l.status === "clicked";
      const isClicked = l.status === "clicked";

      if (isDelivered) { entry.delivered++; entry.byType[cType] && entry.byType[cType].delivered++; }
      if (isOpened) { entry.opened++; entry.byType[cType] && entry.byType[cType].opened++; }
      if (isClicked) { entry.clicked++; entry.byType[cType] && entry.byType[cType].clicked++; }
    });

    const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;

    const entries = Array.from(byDate.entries());

    const open_rate = entries.map(([date, v]) => ({
      date,
      all: pct(v.opened, v.total),
      broadcast: pct(v.byType.broadcast.opened, v.total),
      automation: pct(v.byType.automation.opened, v.total),
      bulk: pct(v.byType.bulk.opened, v.total),
    }));

    const click_rate = entries.map(([date, v]) => ({
      date,
      all: pct(v.clicked, v.total),
      broadcast: pct(v.byType.broadcast.clicked, v.total),
      automation: pct(v.byType.automation.clicked, v.total),
      bulk: pct(v.byType.bulk.clicked, v.total),
    }));

    const delivery_rate = entries.map(([date, v]) => ({
      date,
      all: pct(v.delivered, v.total),
      broadcast: pct(v.byType.broadcast.delivered, v.total),
      automation: pct(v.byType.automation.delivered, v.total),
      bulk: pct(v.byType.bulk.delivered, v.total),
    }));

    return { open_rate, click_rate, delivery_rate };
  }, [logs, campaigns]);

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <CampaignCreateDropdown />
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
      <EmailPerformanceChart datasets={chartDatasets} />

      {/* Top campaigns table */}
      <EmailTopCampaignsTable campaigns={campaignPerf} />
    </div>
  );
}
