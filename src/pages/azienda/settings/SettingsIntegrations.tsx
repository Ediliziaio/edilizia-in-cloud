import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, MessageSquare, CreditCard, Mail, Phone } from "lucide-react";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import { MetaIntegrationWizard } from "@/components/integrations/MetaIntegrationWizard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Integration, IntegrationStatus, IntegrationHealth } from "@/types/integrations";

function StatusIntegrationCard({ name, description, icon: Icon, iconColor, status, detail }: {
  name: string; description: string; icon: any; iconColor: string;
  status: "connected" | "not_configured"; detail?: string;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">{name}</CardTitle>
            <Badge variant={status === "connected" ? "default" : "secondary"} className="text-[10px]">
              {status === "connected" ? "Connesso" : "Non configurato"}
            </Badge>
          </div>
          <CardDescription className="mt-1 line-clamp-2">{description}</CardDescription>
        </div>
      </CardHeader>
      {detail && (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">{detail}</p>
        </CardContent>
      )}
    </Card>
  );
}

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

  const { data: waConfig } = useQuery({
    queryKey: ["whatsapp-config-status", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("messaging_whatsapp_config")
        .select("id, phone_number_id, waba_id, account_status, phone_number")
        .eq("company_id", companyId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  const { data: stripeConfig } = useQuery({
    queryKey: ["stripe-config-status", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["stripe_publishable_key", "stripe_mode"]);
      if (!data || data.length === 0) return null;
      const map: Record<string, string> = {};
      data.forEach((r: any) => { map[r.key] = r.value; });
      return map;
    },
    enabled: !!companyId,
  });

  const metaIntegration = integrations.find((i) => i.provider === "meta");

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
      return { pages: pagesRes.count || 0, forms: formsRes.count || 0 };
    },
    enabled: !!companyId && !!metaIntegration?.id,
  });

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

  const mainIntegrations = useMemo(() => {
    const items = [
      {
        provider: "meta" as const,
        name: "Meta (Facebook & Instagram Lead Ads)",
        description: "Sincronizza i lead dai moduli Lead Ads di Facebook e Instagram direttamente nel tuo CRM.",
        integration: metaIntegration || null,
        stats: metaIntegration ? stats : null,
      },
      {
        provider: "google_calendar" as const,
        name: "Google Calendar",
        description: "Sincronizza appuntamenti e blocca slot occupati.",
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

  const statusCards = useMemo(() => {
    const cards = [
      {
        key: "whatsapp",
        name: "WhatsApp Business",
        description: "Invio messaggi e gestione conversazioni WhatsApp.",
        icon: MessageSquare,
        iconColor: "text-emerald-600",
        status: (waConfig?.phone_number_id ? "connected" : "not_configured") as "connected" | "not_configured",
        detail: waConfig?.phone_number
          ? `Numero: ${waConfig.phone_number} · WABA: ${waConfig.waba_id || "N/A"}`
          : undefined,
      },
      {
        key: "stripe",
        name: "Stripe",
        description: "Gestione pagamenti e acquisto crediti.",
        icon: CreditCard,
        iconColor: "text-violet-600",
        status: (stripeConfig?.stripe_publishable_key ? "connected" : "not_configured") as "connected" | "not_configured",
        detail: stripeConfig?.stripe_mode
          ? `Modalità: ${stripeConfig.stripe_mode === "live" ? "Produzione" : "Test"}`
          : undefined,
      },
      {
        key: "email",
        name: "Email Provider",
        description: "Invio email transazionali e campagne marketing.",
        icon: Mail,
        iconColor: "text-blue-600",
        status: "not_configured" as const,
        detail: "Configurazione disponibile in Impostazioni Admin > Email",
      },
      {
        key: "twilio",
        name: "Twilio (SMS)",
        description: "Invio SMS per campagne e automazioni.",
        icon: Phone,
        iconColor: "text-orange-600",
        status: "not_configured" as const,
        detail: "Prossimamente",
      },
    ];
    if (!search.trim()) return cards;
    const q = search.toLowerCase();
    return cards.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    );
  }, [search, waConfig, stripeConfig]);

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
        {mainIntegrations.map((item) => (
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

      {statusCards.length > 0 && (
        <>
          <h2 className="text-lg font-semibold pt-2">Stato servizi</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {statusCards.map((card) => (
              <StatusIntegrationCard
                key={card.key}
                name={card.name}
                description={card.description}
                icon={card.icon}
                iconColor={card.iconColor}
                status={card.status}
                detail={card.detail}
              />
            ))}
          </div>
        </>
      )}

      {mainIntegrations.length === 0 && statusCards.length === 0 && (
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
