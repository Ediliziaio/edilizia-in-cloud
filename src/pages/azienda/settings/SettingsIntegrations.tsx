import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import { MetaIntegrationWizard } from "@/components/integrations/MetaIntegrationWizard";
import type { Integration, IntegrationStatus, IntegrationHealth } from "@/types/integrations";

export default function SettingsIntegrations() {
  const { effectiveCompany, user } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const userId = user?.id;
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const navigate = useNavigate();

  const { data: integrations = [], refetch } = useQuery({
    queryKey: ["integrations", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data || []) as Integration[];
    },
    enabled: !!companyId,
  });

  // Google Calendar connection status for current user
  const { data: gcalConnection } = useQuery({
    queryKey: ["google-calendar-connection", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data } = await supabase
        .from("google_calendar_connections")
        .select("id, status, google_account_email, updated_at")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && !!userId,
  });

  const metaIntegration = integrations.find((i) => i.provider === "meta");

  // Count connected pages and active forms
  const { data: stats } = useQuery({
    queryKey: ["integration-meta-stats", companyId, metaIntegration?.id],
    queryFn: async () => {
      if (!companyId || !metaIntegration?.id) return { pages: 0, forms: 0 };
      const [pagesRes, formsRes] = await Promise.all([
        supabase
          .from("meta_assets")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("integration_id", metaIntegration.id)
          .eq("asset_type", "page")
          .eq("selected", true),
        supabase
          .from("meta_lead_forms")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("integration_id", metaIntegration.id)
          .eq("status", "active"),
      ]);
      return {
        pages: pagesRes.count || 0,
        forms: formsRes.count || 0,
      };
    },
    enabled: !!companyId && !!metaIntegration?.id,
  });

  // Build a fake Integration-like object for Google Calendar card
  const gcalIntegrationLike: Integration | null = gcalConnection
    ? {
        id: gcalConnection.id,
        company_id: companyId,
        provider: "google_calendar" as const,
        status: gcalConnection.status as IntegrationStatus,
        connected_by: null,
        health: "ok" as IntegrationHealth,
        last_sync_at: null,
        last_error_code: null,
        last_error_message: null,
        created_at: "",
        updated_at: gcalConnection.updated_at,
      }
    : null;

  const availableIntegrations = useMemo(() => {
    const items = [
      {
        provider: "meta" as const,
        name: "Meta (Facebook & Instagram Lead Ads)",
        description: "Sincronizza i lead dai moduli Lead Ads di Facebook e Instagram direttamente nel tuo CRM.",
        icon: "meta",
        integration: metaIntegration || null,
        stats: metaIntegration ? stats : null,
      },
      {
        provider: "google_calendar" as const,
        name: "Google Calendar",
        description: "Sincronizza appuntamenti e blocca slot occupati. Gestisci il collegamento da Impostazioni > Calendari > Collegamenti.",
        icon: "google_calendar",
        integration: gcalIntegrationLike,
        stats: null as { pages: number; forms: number } | null,
      },
    ];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
    );
  }, [search, metaIntegration, stats, gcalIntegrationLike]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrazioni</h1>
        <p className="text-muted-foreground mt-1">
          Collega servizi esterni per sincronizzare dati e automatizzare i processi.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cerca integrazioni..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {availableIntegrations.map((item) => (
          <IntegrationCard
            key={item.provider}
            name={item.name}
            description={item.description}
            provider={item.provider}
            integration={item.integration}
            stats={item.stats}
            onConnect={() => {
              if (item.provider === "google_calendar") {
                navigate("/azienda/impostazioni/calendari-marketing");
              } else {
                setWizardOpen(true);
              }
            }}
            onManage={() => {
              if (item.provider === "google_calendar") {
                navigate("/azienda/impostazioni/calendari-marketing");
              } else {
                setWizardOpen(true);
              }
            }}
          />
        ))}
      </div>

      {availableIntegrations.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Nessuna integrazione trovata per "{search}"
        </div>
      )}

      <MetaIntegrationWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        integration={metaIntegration || null}
        onComplete={() => {
          refetch();
          setWizardOpen(false);
        }}
      />
    </div>
  );
}
