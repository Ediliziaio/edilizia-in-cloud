import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CampaignStatsCards } from "./CampaignStatsCards";
import { EmailKpiHero } from "./EmailKpiHero";
import { EmailFunnelChart } from "./EmailFunnelChart";
import { EmailPerformanceChart } from "./EmailPerformanceChart";
import { EmailTopCampaignsTable } from "./EmailTopCampaignsTable";
import { CampaignDetailDialog } from "./CampaignDetailDialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function EmailStatsTab() {
  const { effectiveCompany: company } = useAuth();
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [datePreset, setDatePreset] = useState<"7" | "30" | "90" | "all" | "custom">("all");
  const [detailTarget, setDetailTarget] = useState<{ id: string; name: string } | null>(null);

  const rpcParams = useMemo(() => ({
    p_company_id: company?.id ?? "",
    p_campaign_id: campaignFilter !== "all" ? campaignFilter : null,
    // "T00:00:00" = mezzanotte LOCALE (senza, "YYYY-MM-DD" è parsato come UTC
    // → il filtro escludeva le prime 1-2 ore del giorno scelto)
    p_date_from: dateFrom ? new Date(dateFrom + "T00:00:00").toISOString() : null,
    p_date_to: dateTo ? new Date(dateTo + "T23:59:59").toISOString() : null,
  }), [company?.id, campaignFilter, dateFrom, dateTo]);

  // Campaign list for filter dropdown
  const { data: campaigns = [] } = useQuery({
    queryKey: ["email-campaigns", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("id, name")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // 1) Summary stats via RPC
  const { data: statsRaw } = useQuery({
    queryKey: ["email-stats-summary", rpcParams],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_email_stats_summary", rpcParams as any);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const stats = {
    sent: Number(statsRaw?.total ?? 0),
    delivered: Number(statsRaw?.delivered ?? 0),
    opened: Number(statsRaw?.opened ?? 0),
    clicked: Number(statsRaw?.clicked ?? 0),
    bounced: Number(statsRaw?.bounced ?? 0),
    unsubscribed: Number(statsRaw?.unsubscribed ?? 0),
    spam: Number(statsRaw?.spam ?? 0),
  };

  const funnel = { ...stats, converted: 0 };

  // 2) Per-campaign stats via RPC
  const { data: campaignPerf = [] } = useQuery({
    queryKey: ["email-stats-by-campaign", rpcParams],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_email_stats_by_campaign", rpcParams as any);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.campaign_id,
        name: r.campaign_name,
        sent_at: r.sent_at,
        delivered: Number(r.delivered),
        opened: Number(r.opened),
        clicked: Number(r.clicked),
        type: r.campaign_type,
      }));
    },
  });

  // 3) Daily stats by type via RPC
  const { data: dailyRaw = [] } = useQuery({
    queryKey: ["email-stats-by-date", rpcParams],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_email_stats_by_date", rpcParams as any);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Build chart datasets from daily aggregated data
  const chartDatasets = useMemo(() => {
    if (dailyRaw.length === 0) return { open_rate: [], click_rate: [], delivery_rate: [] };

    // Group by date_label, aggregate types
    const byDate = new Map<string, {
      total: number; delivered: number; opened: number; clicked: number;
      byType: Record<string, { total: number; delivered: number; opened: number; clicked: number }>;
    }>();

    (dailyRaw as any[]).forEach((r) => {
      const date = r.date_label;
      if (!byDate.has(date)) {
        byDate.set(date, {
          total: 0, delivered: 0, opened: 0, clicked: 0,
          byType: {
            broadcast: { total: 0, delivered: 0, opened: 0, clicked: 0 },
            automation: { total: 0, delivered: 0, opened: 0, clicked: 0 },
            bulk: { total: 0, delivered: 0, opened: 0, clicked: 0 },
          },
        });
      }
      const entry = byDate.get(date)!;
      const t = Number(r.total);
      entry.total += t;
      entry.delivered += Number(r.delivered);
      entry.opened += Number(r.opened);
      entry.clicked += Number(r.clicked);
      const cType = r.campaign_type || "broadcast";
      if (entry.byType[cType]) {
        entry.byType[cType].total += t;
        entry.byType[cType].delivered += Number(r.delivered);
        entry.byType[cType].opened += Number(r.opened);
        entry.byType[cType].clicked += Number(r.clicked);
      }
    });

    const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;
    const entries = Array.from(byDate.entries());

    // BUGFIX (doppio): (1) le serie per-tipo dividevano per il totale
    // COMPLESSIVO del giorno, non per quello del tipo → tassi schiacciati;
    // (2) open/click rate usavano il totale inviate come denominatore mentre
    // la KPI Hero e la tabella usano le CONSEGNATE → tre percentuali diverse
    // per la stessa metrica nella stessa pagina. Ora: open/click su delivered.
    const open_rate = entries.map(([date, v]) => ({
      date, all: pct(v.opened, v.delivered),
      broadcast: pct(v.byType.broadcast.opened, v.byType.broadcast.delivered),
      automation: pct(v.byType.automation.opened, v.byType.automation.delivered),
      bulk: pct(v.byType.bulk.opened, v.byType.bulk.delivered),
    }));
    const click_rate = entries.map(([date, v]) => ({
      date, all: pct(v.clicked, v.delivered),
      broadcast: pct(v.byType.broadcast.clicked, v.byType.broadcast.delivered),
      automation: pct(v.byType.automation.clicked, v.byType.automation.delivered),
      bulk: pct(v.byType.bulk.clicked, v.byType.bulk.delivered),
    }));
    const delivery_rate = entries.map(([date, v]) => ({
      date, all: pct(v.delivered, v.total),
      broadcast: pct(v.byType.broadcast.delivered, v.byType.broadcast.total),
      automation: pct(v.byType.automation.delivered, v.byType.automation.total),
      bulk: pct(v.byType.bulk.delivered, v.byType.bulk.total),
    }));

    return { open_rate, click_rate, delivery_rate };
  }, [dailyRaw]);

  return (
    // Telefono: campagna e periodo (7/30/90/tutto), i quattro numeri, la classifica
    // a righe. Crea campagna, date libere, funnel, salute e grafico al computer.
    <div className="space-y-6 max-md:space-y-3">
      {/* Filter bar — da tablet una riga: campagna, periodo rapido, date libere.
          Via «Crea campagna» (che qui apriva la barra, a sinistra): si crea
          dalla scheda Campagne, questa è la pagina dei risultati. */}
      <div className="flex flex-wrap items-center gap-3 max-md:gap-2">
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-[180px] max-md:w-full"><SelectValue placeholder="Tutte le campagne" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le campagne</SelectItem>
            {campaigns.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 max-md:w-full">
          {([["7", "7 gg"], ["30", "30 gg"], ["90", "90 gg"], ["all", "Tutto"]] as const).map(([days, lbl]) => (
            <button key={days} type="button"
              onClick={() => {
                setDatePreset(days);
                if (days === "all") { setDateFrom(""); setDateTo(""); return; }
                const localDay = (d: Date) => d.toLocaleDateString("en-CA");
                setDateFrom(localDay(new Date(Date.now() - Number(days) * 86400000)));
                setDateTo(localDay(new Date()));
              }}
              className={`tap-compact rounded-full border px-2.5 py-1 text-[11px] transition-colors max-md:flex-1 max-md:py-1.5 max-md:text-[13px] ${datePreset === days ? "border-primary bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50"}`}>
              {lbl}
            </button>
          ))}
        </div>
        {/* «Dal … al» diventa un trattino: con le parole la riga non stava a 1024. */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground max-md:hidden">
          <Input type="date" aria-label="Dal" className="w-[140px] h-9" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset("custom"); }} />
          <span aria-hidden>–</span>
          <Input type="date" aria-label="Al" className="w-[140px] h-9" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset("custom"); }} />
        </div>
      </div>

      {/* KPI headline: inviate + tassi consegna/apertura/clic con benchmark */}
      <EmailKpiHero stats={stats} />

      {/* Funnel di conversione + salute deliverability affiancati */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 max-md:hidden">
        <EmailFunnelChart data={funnel} />
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {/* «Deliverability» è gergo: sotto ci sono respinte, disiscrizioni e spam. */}
            Salute degli invii
          </h3>
          <CampaignStatsCards stats={stats} />
        </div>
      </div>

      {/* Andamento nel tempo */}
      <div className="max-md:hidden">
        <EmailPerformanceChart datasets={chartDatasets} />
      </div>

      {/* Top campaigns table — click su riga apre il dettaglio destinatari */}
      <EmailTopCampaignsTable
        campaigns={campaignPerf}
        onCampaignClick={(id, name) => setDetailTarget({ id, name })}
      />

      <CampaignDetailDialog
        campaignId={detailTarget?.id ?? null}
        campaignName={detailTarget?.name}
        onClose={() => setDetailTarget(null)}
      />
    </div>
  );
}
