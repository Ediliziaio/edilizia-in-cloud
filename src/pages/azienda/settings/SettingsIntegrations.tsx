import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, MessageSquare, CreditCard, Mail, Phone, AlertTriangle, Bot, Plug, CheckCircle2, Activity, ShieldCheck, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import { MetaIntegrationWizard } from "@/components/integrations/MetaIntegrationWizard";
// 🆕 GAP 7b: card connessioni OAuth Gmail/Outlook native
import { EmailOAuthConnectionsCard } from "@/components/integrations/EmailOAuthConnectionsCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import type { Integration, IntegrationStatus, IntegrationHealth } from "@/types/integrations";

function StatusIntegrationCard({ name, description, icon: Icon, iconColor, status, detail }: {
  name: string; description: string; icon: any; iconColor: string;
  status: "connected" | "not_configured"; detail?: string;
}) {
  const connected = status === "connected";
  return (
    <Card className={cn(
      "flex flex-col overflow-hidden border-l-4 transition-colors",
      connected ? "border-l-emerald-500" : "border-l-slate-300"
    )}>
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <div className={cn(
          "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
          connected ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-muted"
        )}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">{name}</CardTitle>
            {connected ? (
              <Badge className="text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-600">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Connesso
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Non configurato
              </Badge>
            )}
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
  const { effectiveCompany, user, role } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const userId = user?.id;
  const canManageIntegrations = role === "company_admin" || role === "super_admin";
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [metaConfigMissing, setMetaConfigMissing] = useState(false);
  const navigate = useNavigate();

  // Check if global Meta credentials are configured
  const checkMetaCredentials = async (): Promise<boolean> => {
    try {
      // Leggi solo meta_app_id (il secret non deve mai arrivare al client)
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .eq("key", "meta_app_id")
        .maybeSingle();
      if (!data?.value) {
        setMetaConfigMissing(true);
        toast.error("L'integrazione Meta non è ancora configurata dall'amministratore della piattaforma.");
        return false;
      }
      setMetaConfigMissing(false);
      return true;
    } catch {
      return true; // fail open – let wizard handle errors
    }
  };

  const handleMetaConnect = async () => {
    if (!canManageIntegrations) {
      toast.error("Solo un amministratore aziendale può gestire le integrazioni.");
      return;
    }
    const ok = await checkMetaCredentials();
    if (ok) setWizardOpen(true);
  };

  const testMetaConnection = async () => {
    if (!companyId || !metaIntegration?.id) return;
    if (!canManageIntegrations) {
      toast.error("Permessi insufficienti per testare l'integrazione.");
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Sessione scaduta. Effettua di nuovo l'accesso.");
      const { data, error } = await supabase.functions.invoke("meta-api-proxy", {
        body: {
          action: "get-assets",
          company_id: companyId,
          integration_id: metaIntegration.id,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Connessione Meta verificata", {
        description: `${data?.pages?.length ?? 0} pagina/e leggibili dall'account collegato.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Test connessione non riuscito";
      toast.error(message);
    }
  };

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

  const { data: appleCalConnection } = useQuery({
    queryKey: ["apple-calendar-connection", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data } = await supabase
        .from("apple_calendar_connections")
        .select("id, status, apple_id_email, updated_at")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && !!userId,
  });

  const googleAdsIntegration = integrations.find((i) => i.provider === "google_ads");

  const { data: waConfig } = useQuery({
    queryKey: ["whatsapp-config-status", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      // MP-FINAL deprecation: ai_whatsapp_numbers con purpose=bot_operativo
      // sostituisce la tabella legacy messaging_whatsapp_config.
      const { data } = await supabase
        .from("ai_whatsapp_numbers")
        .select("id, phone_number_id, waba_id, stato, numero")
        .eq("company_id", companyId)
        .eq("purpose", "bot_operativo")
        .is("deleted_at", null)
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id,
        phone_number_id: data.phone_number_id,
        waba_id: data.waba_id,
        account_status: data.stato,
        phone_number: data.numero,
      };
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

  const { data: metaEventStats } = useQuery({
    queryKey: ["integration-meta-event-health", companyId, metaIntegration?.id],
    queryFn: async () => {
      if (!companyId || !metaIntegration?.id) return { pending: 0, failed: 0, processed: 0 };
      const { data, error } = await supabase
        .from("integration_webhook_events")
        .select("status")
        .eq("company_id", companyId)
        .eq("integration_id", metaIntegration.id)
        .order("received_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return {
        pending: (data || []).filter((e: any) => e.status === "pending").length,
        failed: (data || []).filter((e: any) => e.status === "failed").length,
        processed: (data || []).filter((e: any) => e.status === "processed").length,
      };
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

  const appleCalIntegrationLike: Integration | null = appleCalConnection
    ? {
        id: appleCalConnection.id,
        company_id: companyId,
        provider: "apple_calendar" as const,
        status: appleCalConnection.status as IntegrationStatus,
        connected_by: null,
        health: "ok" as IntegrationHealth,
        last_sync_at: null,
        last_error_code: null,
        last_error_message: null,
        created_at: "",
        updated_at: appleCalConnection.updated_at,
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
      {
        provider: "apple_calendar" as const,
        name: "Apple Calendar (iCloud)",
        description: "Sincronizza appuntamenti e blocca slot occupati tramite CalDAV/iCloud.",
        integration: appleCalIntegrationLike,
        stats: null as { pages: number; forms: number } | null,
      },
      {
        provider: "google_ads" as const,
        name: "Google Ads",
        description: "Importa statistiche campagne Google Ads e monitora CPC, impressioni e conversioni nella Reportistica.",
        integration: googleAdsIntegration || null,
        stats: null as { pages: number; forms: number } | null,
      },
    ];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
    );
  }, [search, metaIntegration, stats, gcalIntegrationLike, appleCalIntegrationLike, googleAdsIntegration]);

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

  // KPI integrazioni collegate
  const connectedCount = mainIntegrations.filter((i) => i.integration?.status === "connected").length;
  const totalCount = mainIntegrations.length;
  const warningCount = mainIntegrations.filter(
    (i) => i.integration?.status === "error" || i.integration?.status === "token_expired" || i.integration?.health === "critical"
  ).length;
  const configuredServices = statusCards.filter((c) => c.status === "connected").length;

  // Token expiry warning — integrazioni OAuth con updated_at > 60gg
  // (indica token vecchi che potrebbero aver bisogno di refresh/riconnessione)
  const TOKEN_STALE_DAYS = 60;
  const staleTokenWarnings: string[] = [];
  if (gcalConnection && gcalConnection.status === "connected" && (gcalConnection as any).updated_at) {
    const ageDays = Math.floor(
      (Date.now() - new Date((gcalConnection as any).updated_at).getTime()) / 86400000
    );
    if (ageDays > TOKEN_STALE_DAYS) staleTokenWarnings.push(`Google Calendar (${ageDays}gg)`);
  }
  if (appleCalConnection && appleCalConnection.status === "connected" && (appleCalConnection as any).updated_at) {
    const ageDays = Math.floor(
      (Date.now() - new Date((appleCalConnection as any).updated_at).getTime()) / 86400000
    );
    if (ageDays > TOKEN_STALE_DAYS) staleTokenWarnings.push(`Apple Calendar (${ageDays}gg)`);
  }

  return (
    <div className="space-y-5">
      {/* Header standardizzato */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Plug className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Integrazioni</h1>
            <p className="text-sm text-muted-foreground">
              Collega servizi esterni per sincronizzare dati e automatizzare processi
              {totalCount > 0 && (
                <> · <span className="font-medium text-foreground">{connectedCount}</span>
                  <span className="text-muted-foreground">/{totalCount}</span> connesse
                </>
              )}
            </p>
          </div>
        </div>
        <div className="relative w-full sm:w-auto sm:min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca integrazioni..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Stale token warning */}
      {!canManageIntegrations && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle className="text-sm">Permessi integrazioni in sola lettura</AlertTitle>
          <AlertDescription className="text-xs">
            Puoi vedere stato e salute delle integrazioni, ma connessione, test e disconnessione sono riservati agli amministratori aziendali.
          </AlertDescription>
        </Alert>
      )}

      {staleTokenWarnings.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-sm">Token OAuth non più aggiornati</AlertTitle>
          <AlertDescription className="text-xs text-amber-900 dark:text-amber-200">
            Il token di <strong>{staleTokenWarnings.join(", ")}</strong> non si
            aggiorna da più di {TOKEN_STALE_DAYS} giorni. Se la sincronizzazione
            non funziona, riconnetti l'account dalla scheda relativa.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-xs text-muted-foreground">Provider connessi</p>
              <p className="text-xl font-semibold">{connectedCount}/{totalCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-xs text-muted-foreground">Attenzioni</p>
              <p className="text-xl font-semibold">{warningCount + (metaEventStats?.failed ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Lead Meta processati</p>
              <p className="text-xl font-semibold">{metaEventStats?.processed ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Plug className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Servizi configurati</p>
              <p className="text-xl font-semibold">{configuredServices}/{statusCards.length}</p>
            </div>
          </CardContent>
        </Card>
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
              if (!canManageIntegrations) {
                toast.error("Solo un amministratore aziendale può collegare integrazioni.");
                return;
              }
              if (item.provider === "google_calendar" || item.provider === "apple_calendar") {
                navigate("/azienda/impostazioni/calendari-marketing");
              } else if (item.provider === "google_ads") {
                toast.info("L'integrazione Google Ads viene configurata dall'amministratore della piattaforma. Contatta il supporto per abilitarla.");
              } else {
                handleMetaConnect();
              }
            }}
            onManage={() => {
              if (!canManageIntegrations) {
                toast.error("Solo un amministratore aziendale può modificare integrazioni.");
                return;
              }
              if (item.provider === "google_calendar" || item.provider === "apple_calendar") {
                navigate("/azienda/impostazioni/calendari-marketing");
              } else if (item.provider === "google_ads") {
                navigate("/azienda/marketing/reportistica");
              } else {
                handleMetaConnect();
              }
            }}
            onTest={item.provider === "meta" && item.integration?.status === "connected" ? testMetaConnection : undefined}
            canManage={canManageIntegrations}
            disabledReason="Gestione riservata agli amministratori"
            accountLabel={
              item.provider === "google_calendar"
                ? gcalConnection?.google_account_email
                : item.provider === "apple_calendar"
                  ? appleCalConnection?.apple_id_email
                  : null
            }
          />
        ))}
      </div>

      {/* GAP 7b: Email OAuth — collegate dell'azienda (vista admin).
          Spostato sotto la griglia principale: le calendar/ads connections
          sono primarie, le email/triage sono integrazioni avanzate AI. */}
      <EmailOAuthConnectionsCard />

      {/* WhatsApp Bot AI Card */}
      <Card
        className="cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => navigate("/azienda/impostazioni/whatsapp-bot")}
      >
        <CardHeader className="flex-row items-start gap-3 space-y-0">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Bot className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">WhatsApp Bot AI per Cantiere</CardTitle>
              <Badge variant="secondary" className="text-[10px]">Nuovo</Badge>
            </div>
            <CardDescription className="mt-1">
              Ricevi rapportini, DDT, foto e presenze dagli operai via WhatsApp con elaborazione AI automatica.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

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

      {metaConfigMissing && (
        <Alert variant="destructive" className="max-w-xl">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Configurazione Meta mancante</AlertTitle>
          <AlertDescription>
            L'integrazione Meta (Facebook & Instagram) non è ancora configurata dall'amministratore della piattaforma. Contattare il supporto per la configurazione delle credenziali (App ID, App Secret).
          </AlertDescription>
        </Alert>
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
