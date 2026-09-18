import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Users, Target, FileSignature, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "@/hooks/useMetaAdsReport";

interface Props {
  dateRange: DateRange;
  isConnected: boolean;
}

const fmtPct = (num: number, den: number) =>
  den > 0 ? `${Math.round((num / den) * 100)}%` : "—";

const fmtDuration = (seconds: number | null) => {
  if (!seconds) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
};

export default function CRMFunnelSection({ dateRange, isConnected }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;

  const dateStart = format(dateRange.from, "yyyy-MM-dd");
  const dateEnd = format(dateRange.to, "yyyy-MM-dd");

  // Lead events received in period
  const { data: funnelData, isLoading } = useQuery({
    queryKey: ["meta-crm-funnel", companyId, dateStart, dateEnd],
    queryFn: async () => {
      if (!companyId) return null;

      // 1. Webhook events ricevuti (lead da Meta)
      const { count: eventsReceived } = await supabase
        .from("integration_webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("provider", "meta")
        .eq("event_type", "leadgen")
        .gte("received_at", `${dateStart}T00:00:00`)
        .lte("received_at", `${dateEnd}T23:59:59`);

      // 2. Contatti creati da Meta nel periodo
      const { data: contacts, count: contactsCreated } = await supabase
        .from("marketing_contacts")
        .select("id, created_at", { count: "exact" })
        .eq("company_id", companyId)
        .eq("source", "Meta Lead Ads")
        .gte("created_at", `${dateStart}T00:00:00`)
        .lte("created_at", `${dateEnd}T23:59:59`);

      const contactIds = (contacts || []).map((c) => c.id);

      // 3. Opportunità create da contatti Meta nel periodo
      let opportunitiesCount = 0;
      if (contactIds.length > 0) {
        const { count } = await supabase
          .from("marketing_opportunities")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("contact_id", contactIds);
        opportunitiesCount = count || 0;
      }

      // 4. Preventivi creati da contatti Meta nel periodo
      let preventiviCount = 0;
      let preventiviAccettati = 0;
      if (contactIds.length > 0) {
        // La tabella "marketing_quotes" non esiste: i preventivi stanno su
        // "quotes". Con l'errore ingoiato il funnel Meta mostrava sempre 0.
        const { data: quotes } = await supabase
          .from("quotes")
          .select("id, status")
          .eq("company_id", companyId)
          .in("contact_id", contactIds);
        preventiviCount = quotes?.length || 0;
        // Gli stati sono in italiano: con "accepted" il conteggio restava a 0
        // anche a tabella corretta. "firmato" e' accettato a tutti gli effetti.
        preventiviAccettati = (quotes || []).filter(
          (q) => q.status === "accettato" || q.status === "firmato",
        ).length;
      }

      // 5. Speed-to-lead: media secondi tra received_at e created_at del contatto
      let avgSpeedToLead: number | null = null;
      try {
        const { data: auditLogs } = await supabase
          .from("integration_audit_log")
          .select("metadata")
          .eq("company_id", companyId)
          .eq("action", "lead_processed")
          .gte("created_at", `${dateStart}T00:00:00`)
          .lte("created_at", `${dateEnd}T23:59:59`)
          .limit(100);

        const speeds = (auditLogs || [])
          .map((l) => (l.metadata as any)?.speed_to_lead_seconds)
          .filter((s) => typeof s === "number" && s > 0);

        if (speeds.length > 0) {
          avgSpeedToLead = speeds.reduce((a, b) => a + b, 0) / speeds.length;
        }
      } catch (_) {
        // speed_to_lead not available
      }

      return {
        eventsReceived: eventsReceived || 0,
        contactsCreated: contactsCreated || 0,
        opportunitiesCount,
        preventiviCount,
        preventiviAccettati,
        avgSpeedToLead,
      };
    },
    enabled: !!companyId && isConnected,
    staleTime: 2 * 60 * 1000,
  });

  if (!isConnected) return null;

  const steps = [
    {
      icon: Users,
      label: "Lead ricevuti",
      value: funnelData?.eventsReceived ?? 0,
      color: "text-blue-500",
      bg: "bg-blue-50",
    },
    {
      icon: Users,
      label: "Contatti CRM",
      value: funnelData?.contactsCreated ?? 0,
      color: "text-violet-500",
      bg: "bg-violet-50",
      rate: fmtPct(funnelData?.contactsCreated ?? 0, funnelData?.eventsReceived ?? 0),
    },
    {
      icon: Target,
      label: "Opportunità",
      value: funnelData?.opportunitiesCount ?? 0,
      color: "text-orange-500",
      bg: "bg-orange-50",
      rate: fmtPct(funnelData?.opportunitiesCount ?? 0, funnelData?.contactsCreated ?? 0),
    },
    {
      icon: FileSignature,
      label: "Preventivi",
      value: funnelData?.preventiviCount ?? 0,
      color: "text-amber-500",
      bg: "bg-amber-50",
      rate: fmtPct(funnelData?.preventiviCount ?? 0, funnelData?.opportunitiesCount ?? 0),
    },
    {
      icon: CheckCircle2,
      label: "Chiusi",
      value: funnelData?.preventiviAccettati ?? 0,
      color: "text-emerald-500",
      bg: "bg-emerald-50",
      rate: fmtPct(funnelData?.preventiviAccettati ?? 0, funnelData?.preventiviCount ?? 0),
    },
  ];

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Funnel CRM — Lead Facebook
        </h3>
        {funnelData?.avgSpeedToLead != null && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted rounded-full px-3 py-1">
            <Clock className="h-3.5 w-3.5" />
            Speed-to-lead medio: <strong>{fmtDuration(funnelData.avgSpeedToLead)}</strong>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center gap-2">
            <div className="flex flex-col items-center text-center min-w-[90px]">
              <div className={`rounded-xl p-2.5 mb-1.5 ${step.bg}`}>
                <step.icon className={`h-5 w-5 ${step.color}`} />
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-12 mb-1" />
              ) : (
                <span className="text-2xl font-bold">{step.value}</span>
              )}
              <span className="text-xs text-muted-foreground">{step.label}</span>
              {step.rate && (
                <span className="text-[11px] font-medium text-muted-foreground/70 mt-0.5">
                  {step.rate} conv.
                </span>
              )}
            </div>
            {i < steps.length - 1 && (
              <ArrowRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
