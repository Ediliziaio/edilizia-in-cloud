/**
 * SettingsIntegrations — Pagina /azienda/impostazioni/integrazioni.
 *
 * Refactor 2026-05-27 (stile GHL):
 *  - Shell minima: header + alert + sezione Calendari (inline) + grid uniforme.
 *  - Logiche di catalogo/manifesto: src/components/integrations/IntegrationsCatalog.tsx
 *  - Logiche di rendering grid + popup + filtri: IntegrationsGrid.tsx
 *  - Loghi brand SVG: brand-logos.tsx
 *
 * Vecchio file ~1335 righe ridotto a shell.
 */
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ShieldCheck, Plug } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
// Viste admin company-wide (NON i miei personali — quelli stanno in Mio Profilo).
// - Calendari: GoogleCalendarConnectionTab + AppleCalendarConnectionTab in Mio Profilo
// - Email: EmailOAuthConnectionsCard in Mio Profilo
import CompanyCalendarsOverview from "@/components/integrations/CompanyCalendarsOverview";
import CompanyEmailsOverview from "@/components/integrations/CompanyEmailsOverview";
import BankConnectionsCard from "@/components/integrations/BankConnectionsCard";
import StripePaymentsCard from "@/components/integrations/StripePaymentsCard";
// Popup components per integrazioni in modalità "popup"
import GbpConnectionCard from "@/components/integrations/GbpConnectionCard";
import GoogleAdsConnectionCard from "@/components/integrations/GoogleAdsConnectionCard";
import { MetaIntegrationWizard } from "@/components/integrations/MetaIntegrationWizard";
import { MetaTroubleshootDialog } from "@/components/integrations/MetaTroubleshootDialog";
// Nuovo catalogo + grid
import {
  INTEGRATIONS_CATALOG,
  type IntegrationItem,
} from "@/components/integrations/IntegrationsCatalog";
import IntegrationsGrid, {
  type IntegrationConnectionStatus,
  type IntegrationStatusMap,
} from "@/components/integrations/IntegrationsGrid";
import type { Integration, MetaWizardStep } from "@/types/integrations";

const TOKEN_STALE_DAYS = 60;

// ── Popup wrappers ─────────────────────────────────────────────────────────
// I componenti esistenti GbpConnectionCard e GoogleAdsConnectionCard sono già
// auto-contained (fanno query interna, gestiscono OAuth, disconnect ecc.) —
// li renderizziamo dentro il Dialog della grid senza modifiche.

function GbpPopupContent(_props: { onClose: () => void }) {
  return <GbpConnectionCard />;
}

function GoogleAdsPopupContent(_props: { onClose: () => void }) {
  return <GoogleAdsConnectionCard />;
}

// Meta usa il wizard esistente che è già un Dialog: wrapper che fornisce
// le props mancanti (integration + onComplete).
function makeMetaWizardWrapper(
  metaIntegration: Integration | null,
  onComplete: () => void,
) {
  return function MetaWizardWrapper({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) {
    return (
      <MetaIntegrationWizard
        open={open}
        onOpenChange={onOpenChange}
        integration={metaIntegration}
        onComplete={onComplete}
      />
    );
  };
}

export default function SettingsIntegrations() {
  const { effectiveCompany, user, role } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const userId = user?.id;
  const permissions = usePermissions();
  // 13/7/2026: vale anche il permesso "Integrazioni & Canali" (Modifica), non solo il ruolo admin
  const canManageIntegrations = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsIntegrations;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Query: integrations table ─────────────────────────────────────────────
  const {
    data: integrations = [],
    refetch: refetchIntegrations,
    isLoading: isLoadingIntegrations,
    isError: isErrorIntegrations,
  } = useQuery({
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

  // ── Query: WhatsApp config (bot operativo) ────────────────────────────────
  const { data: waConfig } = useQuery({
    queryKey: ["whatsapp-config-status", companyId],
    queryFn: async () => {
      if (!companyId) return null;
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

  // ── Query: Google Business Profile connection ─────────────────────────────
  const { data: gbpConnection } = useQuery({
    queryKey: ["gbp-connection", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("gbp_connections")
        .select("id, status, google_account_email")
        .eq("company_id", companyId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  // ── Query: Google Calendar (per stale token check) ────────────────────────
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

  // ── Query: Apple Calendar (per stale token check) ─────────────────────────
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

  // ── Query: Email OAuth (personale) ────────────────────────────────────────
  const { data: emailConnections = [] } = useQuery({
    queryKey: ["email-oauth-connections-summary", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return [];
      const { data, error } = await supabase
        .from("email_oauth_connections")
        .select("id, email_address, provider, status")
        .eq("company_id", companyId)
        .eq("user_id", userId);
      if (error) return [];
      return data || [];
    },
    enabled: !!companyId && !!userId,
  });

  // ── Derive: status map per ogni integrazione del catalogo ─────────────────
  const metaIntegration = integrations.find((i) => i.provider === "meta") ?? null;
  const googleAdsIntegration = integrations.find((i) => i.provider === "google_ads") ?? null;

  const statuses: IntegrationStatusMap = useMemo(() => {
    const result: IntegrationStatusMap = {};

    // WhatsApp
    const waConnected = !!waConfig?.phone_number_id;
    result["whatsapp"] = {
      status: waConnected ? "connected" : "disconnected",
      detail: waConfig?.phone_number ? `Numero: ${waConfig.phone_number}` : null,
    };

    // Meta
    const metaStatus: IntegrationConnectionStatus =
      metaIntegration?.status === "connected"
        ? "connected"
        : metaIntegration?.status === "error" || metaIntegration?.status === "token_expired"
          ? "error"
          : "disconnected";
    result["meta"] = { status: metaStatus, detail: null };

    // Google Business Profile
    const gbpConnected = gbpConnection?.status === "connected";
    result["google-business"] = {
      status: gbpConnected ? "connected" : "disconnected",
      detail: gbpConnection?.google_account_email ?? null,
    };

    // Google Ads
    let gadsStatus: IntegrationConnectionStatus = "disconnected";
    if (googleAdsIntegration?.status === "connected") {
      gadsStatus =
        googleAdsIntegration.health === "critical" || googleAdsIntegration.last_error_code
          ? "pending"
          : "connected";
    } else if (
      googleAdsIntegration?.status === "error" ||
      googleAdsIntegration?.status === "token_expired"
    ) {
      gadsStatus = "error";
    }
    result["google-ads"] = { status: gadsStatus, detail: null };

    // Email
    const emailConnected = emailConnections.some((c) => c.status === "connected");
    const firstEmail = emailConnections.find((c) => c.status === "connected");
    result["email"] = {
      status: emailConnected ? "connected" : "disconnected",
      detail: firstEmail?.email_address ?? null,
    };

    return result;
  }, [
    waConfig,
    metaIntegration,
    gbpConnection,
    googleAdsIntegration,
    emailConnections,
  ]);

  // ── KPI: X di Y connesse ──────────────────────────────────────────────────
  const connectedCount = Object.values(statuses).filter((s) => s.status === "connected").length;
  const totalCount = INTEGRATIONS_CATALOG.length;

  // ── Stale token warnings (>60gg) ──────────────────────────────────────────
  const staleTokenWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (gcalConnection?.status === "connected" && (gcalConnection as any).updated_at) {
      const ageDays = Math.floor(
        (Date.now() - new Date((gcalConnection as any).updated_at).getTime()) / 86400000,
      );
      if (ageDays > TOKEN_STALE_DAYS) warnings.push(`Google Calendar (${ageDays}gg)`);
    }
    if (appleCalConnection?.status === "connected" && (appleCalConnection as any).updated_at) {
      const ageDays = Math.floor(
        (Date.now() - new Date((appleCalConnection as any).updated_at).getTime()) / 86400000,
      );
      if (ageDays > TOKEN_STALE_DAYS) warnings.push(`Apple Calendar (${ageDays}gg)`);
    }
    return warnings;
  }, [gcalConnection, appleCalConnection]);

  // ── Popup + wizard registry ───────────────────────────────────────────────
  const externalWizardRegistry = useMemo(
    () => ({
      meta: makeMetaWizardWrapper(metaIntegration, () => {
        refetchIntegrations();
        queryClient.invalidateQueries({ queryKey: ["integrations", companyId] });
      }),
    }),
    [metaIntegration, refetchIntegrations, queryClient, companyId],
  );

  const popupRegistry = useMemo(
    () => ({
      "google-business": GbpPopupContent,
      "google-ads": GoogleAdsPopupContent,
    }),
    [],
  );

  // ── "Risolvi problemi" Meta (stile GHL) + wizard con passo iniziale ───────
  // metaWizardStep = null → chiuso; "oauth" → ri-consenso permessi (Ricollega);
  // "forms" → gestione moduli lead diretta dal kebab.
  const [metaTroubleshootOpen, setMetaTroubleshootOpen] = useState(false);
  const [metaWizardStep, setMetaWizardStep] = useState<MetaWizardStep | null>(null);
  const handleTroubleshoot = (item: IntegrationItem) => {
    if (item.id === "meta") setMetaTroubleshootOpen(true);
  };
  const handleManageForms = (item: IntegrationItem) => {
    if (item.id === "meta") setMetaWizardStep("forms");
  };

  // ── Disconnect handler ────────────────────────────────────────────────────
  const handleDisconnect = (item: IntegrationItem) => {
    // Per ora il disconnect è gestito dentro il popup di ogni integrazione
    // (es. GbpConnectionCard ha il proprio dialog di disconnessione).
    // Apriamo il popup/wizard così l'utente trova il pulsante di disconnect.
    toast.info("Apri la pagina dell'integrazione per disconnetterla.", {
      description: item.name,
    });
    navigate(item.pageHref);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Plug className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Integrazioni</h1>
            <p className="text-sm text-muted-foreground">
              Collega servizi esterni e automatizza processi ·{" "}
              <span className="font-medium text-foreground">{connectedCount}</span>
              <span className="text-muted-foreground">/{totalCount}</span> connesse
            </p>
          </div>
        </div>
      </div>

      {/* Stato caricamento / errore della query principale integrations */}
      {isErrorIntegrations ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm">Errore di caricamento</AlertTitle>
          <AlertDescription className="text-xs">
            Errore nel caricamento delle integrazioni. Riprova.
          </AlertDescription>
        </Alert>
      ) : isLoadingIntegrations ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl border bg-muted/40 animate-pulse"
            />
          ))}
        </div>
      ) : null}

      {/* Alert sola lettura */}
      {!canManageIntegrations && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle className="text-sm">Permessi integrazioni in sola lettura</AlertTitle>
          <AlertDescription className="text-xs">
            Puoi vedere stato e salute delle integrazioni, ma connessione, test e
            disconnessione sono riservati agli amministratori aziendali.
          </AlertDescription>
        </Alert>
      )}

      {/* Stale token warning */}
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

      {/* Viste admin: panoramica aziendale di calendari + email (chi ha collegato cosa).
          La gestione dei MIEI account personali è in Mio Profilo → Calendari / Email.
          Per non-admin entrambi i componenti mostrano solo un placeholder con CTA. */}
      <CompanyCalendarsOverview />
      <CompanyEmailsOverview />

      {/* Open Banking — collegamento conti correnti + import movimenti */}
      <BankConnectionsCard />

      {/* Pagamenti con carta (Stripe Connect) — incassi con markup */}
      <StripePaymentsCard />

      {/* Grid integrazioni */}
      <IntegrationsGrid
        items={INTEGRATIONS_CATALOG}
        statuses={statuses}
        canManage={canManageIntegrations}
        popupRegistry={popupRegistry}
        externalWizardRegistry={externalWizardRegistry}
        onDisconnect={handleDisconnect}
        onTroubleshoot={handleTroubleshoot}
        onManageForms={handleManageForms}
      />

      {/* "Risolvi problemi" Meta: autorizzazioni, pagine mancanti, backfill lead */}
      <MetaTroubleshootDialog
        open={metaTroubleshootOpen}
        onOpenChange={setMetaTroubleshootOpen}
        integration={metaIntegration}
        onReconnect={() => setMetaWizardStep("oauth")}
      />
      {/* Wizard Meta con passo iniziale: "oauth" (Ricollega) o "forms" (Moduli lead) */}
      <MetaIntegrationWizard
        open={metaWizardStep !== null}
        onOpenChange={(v) => { if (!v) setMetaWizardStep(null); }}
        integration={metaIntegration}
        initialStep={metaWizardStep ?? undefined}
        onComplete={() => {
          refetchIntegrations();
          queryClient.invalidateQueries({ queryKey: ["integrations", companyId] });
        }}
      />
    </div>
  );
}
