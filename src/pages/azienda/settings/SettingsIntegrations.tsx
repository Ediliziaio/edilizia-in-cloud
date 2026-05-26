import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, Mail, Phone, AlertTriangle, Plug, CheckCircle2, Activity, ShieldCheck, XCircle, Share2, Save, Loader2, Star, Link2, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
// 🆕 GAP 7b: card connessioni OAuth Gmail/Outlook native
import { EmailOAuthConnectionsCard } from "@/components/integrations/EmailOAuthConnectionsCard";
import GbpConnectionCard from "@/components/integrations/GbpConnectionCard";
import GoogleAdsConnectionCard from "@/components/integrations/GoogleAdsConnectionCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  buildGoogleAdsAccountPayload,
  buildGoogleAdsReadinessChecks,
  formatGoogleCustomerId,
  isValidGoogleCustomerId,
} from "@/lib/googleAds/setup";
import type { Integration, IntegrationStatus, IntegrationHealth } from "@/types/integrations";
import type { GoogleAdsAccountRow } from "@/types/googleAds";

type GoogleAdsFormState = {
  customerId: string;
  customerName: string;
  managerCustomerId: string;
  currency: string;
  timeZone: string;
  isTestAccount: boolean;
};

const DEFAULT_GOOGLE_ADS_FORM: GoogleAdsFormState = {
  customerId: "",
  customerName: "",
  managerCustomerId: "",
  currency: "EUR",
  timeZone: "Europe/Rome",
  isTestAccount: false,
};

function isMissingSchemaError(error: unknown): boolean {
  const message = String((error as any)?.message ?? (error as any)?.details ?? error ?? "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("relation") ||
    message.includes("could not find")
  );
}

function googleAdsFormFromAccount(account: GoogleAdsAccountRow | null): GoogleAdsFormState {
  if (!account) return DEFAULT_GOOGLE_ADS_FORM;
  return {
    customerId: formatGoogleCustomerId(account.customer_id) || account.customer_id,
    customerName: account.customer_name ?? "",
    managerCustomerId: formatGoogleCustomerId(account.manager_customer_id) || (account.manager_customer_id ?? ""),
    currency: account.currency ?? "EUR",
    timeZone: account.time_zone ?? "Europe/Rome",
    isTestAccount: account.is_test_account,
  };
}

async function readFunctionErrorPayload(error: unknown): Promise<{ error?: string; detail?: string } | null> {
  const response = (error as any)?.context;
  if (!response || typeof response.clone !== "function") return null;
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

function BrandIconShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("h-9 w-9 rounded-lg border bg-white shadow-sm flex items-center justify-center shrink-0", className)}>
      {children}
    </div>
  );
}

function GoogleLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function GoogleAdsLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M14.6 4.7 22 17.5a3 3 0 0 1-5.2 3L9.4 7.7a3 3 0 1 1 5.2-3z" fill="#4285F4" />
      <path d="M9.4 4.7 2 17.5a3 3 0 0 0 5.2 3l7.4-12.8a3 3 0 1 0-5.2-3z" fill="#FBBC04" />
      <circle cx="4.6" cy="18.7" r="3.3" fill="#34A853" />
    </svg>
  );
}

function GoogleCalendarLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5V9H4V5.5z" fill="#4285F4" />
      <path d="M4 9h16v9.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V9z" fill="#fff" />
      <path d="M4 9h4v11H5.5A1.5 1.5 0 0 1 4 18.5V9z" fill="#34A853" />
      <path d="M16 9h4v9.5a1.5 1.5 0 0 1-1.5 1.5H16V9z" fill="#FBBC04" />
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H8v5H4V5.5z" fill="#EA4335" />
      <text x="12" y="16.3" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#3c4043" fontFamily="Arial, sans-serif">31</text>
    </svg>
  );
}

function GoogleBusinessProfileLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M4 9h16l-1.2-4.2A1.2 1.2 0 0 0 17.65 4H6.35a1.2 1.2 0 0 0-1.15.8L4 9z" fill="#4285F4" />
      <path d="M5 9h4v2.2A2.2 2.2 0 0 1 6.8 13 2.2 2.2 0 0 1 5 10.8V9z" fill="#EA4335" />
      <path d="M9 9h4v2.2A2.2 2.2 0 0 1 10.8 13 2.2 2.2 0 0 1 9 10.8V9z" fill="#FBBC04" />
      <path d="M13 9h4v2.2A2.2 2.2 0 0 1 14.8 13 2.2 2.2 0 0 1 13 10.8V9z" fill="#34A853" />
      <path d="M17 9h2v9.5A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5V13c.48.38 1.1.62 1.8.62.92 0 1.73-.43 2.2-1.1.47.67 1.28 1.1 2.2 1.1s1.73-.43 2.2-1.1c.47.67 1.28 1.1 2.2 1.1S17.33 13.19 17.8 12.52c.3.42.72.74 1.2.93V9h-2z" fill="#fff" />
      <rect x="8" y="15" width="8" height="5" rx="1" fill="#4285F4" />
    </svg>
  );
}

function FacebookLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#1877F2" />
      <path d="M15.55 15.18 16.04 12h-3.05V9.94c0-.87.43-1.72 1.8-1.72h1.38V5.5s-1.26-.21-2.46-.21c-2.51 0-4.15 1.52-4.15 4.27V12H6.77v3.18h2.79v7.69a11.2 11.2 0 0 0 3.43 0v-7.69h2.56z" fill="#fff" />
    </svg>
  );
}

function InstagramLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="instagram-brand-gradient" x1="4" y1="22" x2="22" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FEDA75" />
          <stop offset=".32" stopColor="#FA7E1E" />
          <stop offset=".55" stopColor="#D62976" />
          <stop offset=".78" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="url(#instagram-brand-gradient)" />
      <rect x="7" y="7" width="10" height="10" rx="3.2" stroke="#fff" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.5" stroke="#fff" strokeWidth="1.7" />
      <circle cx="17" cy="7.4" r="1" fill="#fff" />
    </svg>
  );
}

function MetaAssetLogo() {
  return (
    <div className="relative h-6 w-9">
      <FacebookLogo className="absolute left-0 top-0 h-6 w-6" />
      <InstagramLogo className="absolute right-0 top-0 h-6 w-6" />
    </div>
  );
}

function WhatsAppLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#25D366" />
      <path d="M7.1 17.2 7.8 15A6.2 6.2 0 0 1 6.9 12a5.2 5.2 0 1 1 2.2 4.25l-2 .95z" fill="#fff" />
      <path d="M9.2 8.95c.12-.27.25-.28.44-.28h.38c.12 0 .28.04.43.33.16.33.55 1.13.6 1.22.05.1.08.2.02.32-.06.12-.1.2-.2.31l-.3.35c-.1.1-.2.22-.08.43.12.2.55.9 1.17 1.46.8.72 1.47.95 1.68 1.06.2.1.33.09.45-.05.14-.16.52-.6.66-.8.14-.2.28-.16.48-.1.2.07 1.25.59 1.47.7.22.1.36.15.41.24.05.09.05.52-.12 1.02-.17.5-1 1-1.38 1.03-.35.03-.8.15-2.58-.58-2.18-.9-3.56-3.1-3.67-3.24-.1-.15-.88-1.17-.88-2.23 0-1.06.56-1.58.76-1.8.2-.22.43-.27.58-.27z" fill="#25D366" />
    </svg>
  );
}

function YouTubeLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="2" y="5.5" width="20" height="13" rx="4" fill="#FF0000" />
      <path d="m10 9 5.5 3L10 15V9z" fill="#fff" />
    </svg>
  );
}

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
  const [googleHubDialogOpen, setGoogleHubDialogOpen] = useState(false);
  const [googleAdsDialogOpen, setGoogleAdsDialogOpen] = useState(false);
  const [googleAdsForm, setGoogleAdsForm] = useState<GoogleAdsFormState>(DEFAULT_GOOGLE_ADS_FORM);
  const queryClient = useQueryClient();
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

  const { data: googleAdsAccountsResult, refetch: refetchGoogleAdsAccounts } = useQuery({
    queryKey: ["integration-google-ads-accounts", companyId],
    queryFn: async (): Promise<{ accounts: GoogleAdsAccountRow[]; schemaReady: boolean }> => {
      if (!companyId) return { accounts: [], schemaReady: true };
      const { data, error } = await (supabase as any)
        .from("google_ads_accounts")
        .select("*")
        .eq("company_id", companyId)
        .order("selected", { ascending: false })
        .order("customer_name", { ascending: true });
      if (error) {
        if (isMissingSchemaError(error)) return { accounts: [], schemaReady: false };
        throw error;
      }
      return { accounts: (data ?? []) as GoogleAdsAccountRow[], schemaReady: true };
    },
    enabled: !!companyId,
  });

  const googleAdsAccounts = googleAdsAccountsResult?.accounts ?? [];
  const googleAdsAccountsSchemaReady = googleAdsAccountsResult?.schemaReady ?? true;
  const selectedGoogleAdsAccount = googleAdsAccounts.find((account) => account.selected) ?? googleAdsAccounts[0] ?? null;

  const { data: googleAdsOfflineStats } = useQuery({
    queryKey: ["integration-google-ads-offline-events", companyId],
    queryFn: async (): Promise<{ pending: number | null; schemaReady: boolean }> => {
      if (!companyId) return { pending: null, schemaReady: true };
      const { count, error } = await (supabase as any)
        .from("google_ads_offline_conversion_events")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .in("status", ["pending", "failed"]);
      if (error) {
        if (isMissingSchemaError(error)) return { pending: null, schemaReady: false };
        throw error;
      }
      return { pending: count ?? 0, schemaReady: true };
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    if (!googleAdsDialogOpen) return;
    setGoogleAdsForm(googleAdsFormFromAccount(selectedGoogleAdsAccount));
  }, [googleAdsDialogOpen, selectedGoogleAdsAccount?.id]);

  const saveGoogleAdsConnection = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non selezionata.");
      if (!canManageIntegrations) throw new Error("Permessi insufficienti per gestire Google Ads.");
      if (!isValidGoogleCustomerId(googleAdsForm.customerId)) {
        throw new Error("Inserisci un Customer ID Google Ads valido a 10 cifre.");
      }

      const now = new Date().toISOString();
      const { data: integration, error: integrationError } = await supabase
        .from("integrations")
        .upsert(
          {
            company_id: companyId,
            provider: "google_ads",
            status: "connected",
            connected_by: user?.id ?? null,
            health: "warn",
            last_error_code: "GOOGLE_ADS_API_PENDING",
            last_error_message:
              "Customer ID configurato. Developer Token e OAuth server richiesti per publish, stats live e upload conversioni.",
            updated_at: now,
          },
          { onConflict: "company_id,provider" },
        )
        .select("*")
        .single();
      if (integrationError) throw integrationError;

      if (!googleAdsAccountsSchemaReady) {
        return { integration: integration as Integration, accountSaved: false };
      }

      const accountPayload = buildGoogleAdsAccountPayload({
        companyId,
        integrationId: integration.id,
        customerId: googleAdsForm.customerId,
        customerName: googleAdsForm.customerName,
        managerCustomerId: googleAdsForm.managerCustomerId,
        currency: googleAdsForm.currency,
        timeZone: googleAdsForm.timeZone,
        isManager: false,
        isTestAccount: googleAdsForm.isTestAccount,
      });

      const clearSelection = await (supabase as any)
        .from("google_ads_accounts")
        .update({ selected: false, updated_at: now })
        .eq("company_id", companyId);
      if (clearSelection.error && !isMissingSchemaError(clearSelection.error)) {
        throw clearSelection.error;
      }

      const { error: accountError } = await (supabase as any)
        .from("google_ads_accounts")
        .upsert(accountPayload, { onConflict: "company_id,customer_id" })
        .select("*")
        .single();
      if (accountError) {
        if (isMissingSchemaError(accountError)) return { integration: integration as Integration, accountSaved: false };
        throw accountError;
      }

      return { integration: integration as Integration, accountSaved: true };
    },
    onSuccess: async (result) => {
      await Promise.all([
        refetch(),
        refetchGoogleAdsAccounts(),
        queryClient.invalidateQueries({ queryKey: ["ads-manager-beta", "google-ads-integration", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["ads-manager-beta", "google-ads-accounts", companyId] }),
      ]);
      setGoogleAdsDialogOpen(false);
      toast.success("Google Ads configurato", {
        description: result.accountSaved
          ? "Customer ID salvato. Ora Pubblicita puo usare questo account per campagne e attribution."
          : "Integrazione salvata. Applica la migration Google Ads per salvare anche l'account selezionato.",
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Configurazione Google Ads non riuscita";
      toast.error(message);
    },
  });

  const testGoogleAdsConnection = async () => {
    if (!companyId) return;
    if (!canManageIntegrations) {
      toast.error("Permessi insufficienti per testare l'integrazione.");
      return;
    }
    if (!selectedGoogleAdsAccount) {
      toast.error("Configura prima un Customer ID Google Ads.");
      setGoogleAdsDialogOpen(true);
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Sessione scaduta. Effettua di nuovo l'accesso.");
      const { data, error } = await supabase.functions.invoke("google-crm-conversion-sync", {
        body: { company_id: companyId },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        const payload = await readFunctionErrorPayload(error);
        if (payload?.error !== "not_configured") {
          throw new Error(payload?.detail || payload?.error || error.message || "Test Google Ads non riuscito");
        }
        toast.info("Google Ads pronto lato CRM", {
          description:
            "Il Customer ID e la coda conversioni sono configurati. Per il test API live servono Developer Token e OAuth nei Supabase Secrets.",
        });
        return;
      }
      if (data?.error === "not_configured") {
        toast.info("Google Ads pronto lato CRM", {
          description:
            "Il Customer ID e la coda conversioni sono configurati. Per il test API live servono Developer Token e OAuth nei Supabase Secrets.",
        });
        return;
      }
      toast.success("Sync Google Ads verificato", {
        description: `${data?.pending ?? 0} conversioni CRM in coda per Google Ads.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Test Google Ads non riuscito";
      toast.error(message);
    }
  };

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

  const metaIntegration = integrations.find((i) => i.provider === "meta");

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

  const googleAdsAccountLabel = selectedGoogleAdsAccount
    ? `${selectedGoogleAdsAccount.customer_name || "Google Ads"} (${formatGoogleCustomerId(selectedGoogleAdsAccount.customer_id) || selectedGoogleAdsAccount.customer_id})`
    : null;
  const googleAdsCustomerIdForReadiness = googleAdsForm.customerId || selectedGoogleAdsAccount?.customer_id || "";
  const googleAdsApiReady = Boolean(
    googleAdsIntegration?.status === "connected" &&
      googleAdsIntegration.health === "ok" &&
      !googleAdsIntegration.last_error_code,
  );
  const googleAdsReadinessChecks = useMemo(
    () =>
      buildGoogleAdsReadinessChecks({
        integrationConnected: googleAdsIntegration?.status === "connected",
        hasSelectedAccount: Boolean(selectedGoogleAdsAccount) || isValidGoogleCustomerId(googleAdsForm.customerId),
        hasValidCustomerId: isValidGoogleCustomerId(googleAdsCustomerIdForReadiness),
        hasApiCredentials: googleAdsApiReady,
        hasOfflineConversionQueue: googleAdsOfflineStats?.schemaReady ?? false,
        pendingOfflineEvents: googleAdsOfflineStats?.pending ?? null,
      }),
    [
      googleAdsApiReady,
      googleAdsCustomerIdForReadiness,
      googleAdsForm.customerId,
      googleAdsIntegration?.status,
      googleAdsOfflineStats?.pending,
      googleAdsOfflineStats?.schemaReady,
      selectedGoogleAdsAccount,
    ],
  );

  const mainIntegrations = useMemo(() => {
    const items = [
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
        description: "Collega Customer ID, campagne Search/PMax e conversioni CRM per costo appuntamento, costo vendita e ROAS.",
        integration: googleAdsIntegration || null,
        stats: null as { pages: number; forms: number } | null,
      },
    ];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
    );
  }, [search, gcalIntegrationLike, appleCalIntegrationLike, googleAdsIntegration]);

  const statusCards = useMemo(() => {
    const cards = [
      {
        key: "whatsapp",
        name: "WhatsApp Business",
        description: "Invio messaggi e gestione conversazioni WhatsApp.",
        icon: WhatsAppLogo,
        iconColor: "",
        status: (waConfig?.phone_number_id ? "connected" : "not_configured") as "connected" | "not_configured",
        detail: waConfig?.phone_number
          ? `Numero: ${waConfig.phone_number} · WABA: ${waConfig.waba_id || "N/A"}`
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
  }, [search, waConfig]);

  const assetCards = useMemo(() => {
    const cards = [
      {
        key: "meta-assets",
        name: "Pagina Facebook / Instagram",
        description: "Dopo OAuth scegli pagina Facebook, account Instagram Business e moduli Lead Ads da sincronizzare.",
        status: metaIntegration?.status === "connected" ? "connected" : "not_configured",
        detail:
          metaIntegration?.status === "connected"
            ? "Meta collegato: gestisci pagina, moduli e mapping da Lead Facebook."
            : "Collega Meta dalla sezione Lead Facebook e scegli gli asset dell'azienda.",
        icon: <BrandIconShell><MetaAssetLogo /></BrandIconShell>,
        actionLabel: "Apri Lead Facebook",
        action: () => navigate("/azienda/impostazioni/lead-forms"),
      },
      // 2026-05-27: rimosse card statiche "Account Google Ads" e "Google Business
      // Profile" — ora gestite dalle card OAuth reali GoogleAdsConnectionCard e
      // GbpConnectionCard più in basso nelle rispettive sezioni dedicate.
    ];
    if (!search.trim()) return cards;
    const q = search.toLowerCase();
    return cards.filter((card) => card.name.toLowerCase().includes(q) || card.description.toLowerCase().includes(q));
  }, [
    canManageIntegrations,
    googleAdsAccountLabel,
    googleAdsIntegration?.status,
    metaIntegration?.status,
    navigate,
    search,
    selectedGoogleAdsAccount,
  ]);

  const googleHubAssets = useMemo(() => {
    const googleAccountLabel = gcalConnection?.google_account_email || googleAdsAccountLabel || "Account Google non scelto";
    return [
      {
        key: "google-calendar",
        name: "Google Calendar",
        description: "Sincronizza appuntamenti, disponibilità e slot commerciali.",
        status: gcalConnection?.status === "connected" ? "connected" : "not_configured",
        detail: gcalConnection?.google_account_email
          ? `Account calendario: ${gcalConnection.google_account_email}`
          : "Collega il calendario Google usato per appuntamenti e follow-up.",
        icon: <BrandIconShell><GoogleCalendarLogo /></BrandIconShell>,
        actionLabel: "Gestisci calendario",
        action: () => {
          setGoogleHubDialogOpen(false);
          navigate("/azienda/impostazioni/calendari");
        },
      },
      {
        key: "google-ads",
        name: "Google Ads",
        description: "Scegli Customer ID, MCC e conversioni offline CRM.",
        status: selectedGoogleAdsAccount ? "connected" : "not_configured",
        detail: googleAdsAccountLabel
          ? `Account Ads: ${googleAdsAccountLabel}`
          : "Nessun Customer ID selezionato per campagne e attribution.",
        icon: <BrandIconShell><GoogleAdsLogo /></BrandIconShell>,
        actionLabel: "Configura Ads",
        action: () => {
          if (!canManageIntegrations) {
            toast.error("Solo un amministratore aziendale può collegare integrazioni.");
            return;
          }
          setGoogleHubDialogOpen(false);
          setGoogleAdsDialogOpen(true);
        },
      },
      {
        key: "google-business-profile",
        name: "Google Business Profile",
        description: "Gestisci scheda locale, recensioni e segnali reputazione.",
        status: "not_configured",
        detail: `Ecosistema: ${googleAccountLabel}. La scheda Google resta un asset separato da Ads e Calendar.`,
        icon: <BrandIconShell><GoogleBusinessProfileLogo /></BrandIconShell>,
        actionLabel: "Apri reputazione",
        action: () => {
          setGoogleHubDialogOpen(false);
          navigate("/azienda/marketing/reputazione?tab=integrazioni");
        },
      },
      {
        key: "youtube",
        name: "YouTube",
        description: "Asset video e Shorts collegabili allo stesso ecosistema Google.",
        status: "not_configured",
        detail: "Pronto per il futuro OAuth YouTube upload quando l'app avrà gli scope approvati.",
        icon: <BrandIconShell><YouTubeLogo /></BrandIconShell>,
        actionLabel: "Vedi roadmap",
        action: () =>
          toast.info("YouTube — Prossimamente", {
            description: "Sara collegato allo stesso Google Hub, ma con scope YouTube dedicati e consenso separato.",
          }),
      },
    ];
  }, [
    canManageIntegrations,
    gcalConnection?.google_account_email,
    gcalConnection?.status,
    googleAdsAccountLabel,
    navigate,
    selectedGoogleAdsAccount,
  ]);

  const reputationCards = useMemo(() => {
    const cards = [
      {
        key: "google-business-profile",
        name: "Google Business Profile",
        description: "Recensioni Google, link diretto, rating locale e alert su nuove recensioni.",
        icon: GoogleBusinessProfileLogo,
        iconColor: "",
        status: "not_configured" as const,
        detail: googleAdsIntegration?.status === "connected"
          ? "Account Google Ads presente. Completa OAuth Business Profile dalla sezione Reputazione."
          : "Da collegare con OAuth Google Business Profile.",
      },
      {
        key: "facebook-reviews",
        name: "Facebook Reviews",
        description: "Legge recensioni e segnali reputazione dalla pagina Facebook collegata.",
        icon: FacebookLogo,
        iconColor: "",
        status: "not_configured" as const,
        detail: metaIntegration?.status === "connected"
          ? "Meta base collegato. Mancano ancora i permessi specifici per recensioni e rating pagina."
          : "Richiede integrazione Meta attiva.",
      },
      {
        key: "site-review-link",
        name: "Link recensione sito",
        description: "Modulo proprietario per feedback privato, QR code e raccolta testimonianze.",
        icon: Link2,
        iconColor: "text-violet-700",
        status: "connected" as const,
        detail: "Disponibile nella sezione Marketing > Reputazione.",
      },
    ];
    if (!search.trim()) return cards;
    const q = search.toLowerCase();
    return cards.filter((card) => card.name.toLowerCase().includes(q) || card.description.toLowerCase().includes(q));
  }, [googleAdsIntegration?.status, metaIntegration?.status, search]);

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
              <p className="text-xl font-semibold">{warningCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Conversioni Google in coda</p>
              <p className="text-xl font-semibold">
                {googleAdsOfflineStats?.pending ?? 0}
              </p>
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

      <Card className="overflow-hidden border-blue-200 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/10">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BrandIconShell className="h-8 w-8">
                  <GoogleLogo />
                </BrandIconShell>
                <CardTitle className="text-lg">Google Hub</CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {googleHubAssets.filter((asset) => asset.status === "connected").length}/{googleHubAssets.length} asset
                </Badge>
              </div>
              <CardDescription>
                Collega Google una volta, poi scegli quale asset aziendale usare: Calendar, Ads, Business Profile o YouTube.
                Ogni asset resta separato per non mischiare dati, permessi e statistiche tra moduli.
              </CardDescription>
            </div>
            <Button type="button" onClick={() => setGoogleHubDialogOpen(true)} className="shrink-0">
              <Link2 className="h-4 w-4" />
              Scegli asset Google
            </Button>
          </div>
        </CardHeader>
      </Card>

      {assetCards.length > 0 && (
        <Card className="border-primary/20 bg-primary/[0.02]">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Asset aziendali collegabili</CardTitle>
            </div>
            <CardDescription>
              Collegare un account non basta: dopo OAuth va scelto l'asset operativo da usare nel CRM.
              Pagine, account pubblicitari e schede Google restano separati per evitare dati mischiati tra aziende.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 lg:grid-cols-3">
              {assetCards.map((asset) => {
                const connected = asset.status === "connected";
                return (
                  <div key={asset.key} className="rounded-lg border bg-background p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      {asset.icon}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium leading-tight">{asset.name}</p>
                          <Badge variant={connected ? "default" : "outline"} className={cn("text-[10px]", connected && "bg-emerald-600 hover:bg-emerald-600")}>
                            {connected ? "Collegato" : "Da scegliere"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{asset.description}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{asset.detail}</p>
                    <Button type="button" variant={connected ? "outline" : "secondary"} size="sm" className="w-full" onClick={asset.action}>
                      {asset.actionLabel}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
                navigate("/azienda/impostazioni/calendari");
                return;
              }
              if (item.provider === "google_ads") {
                setGoogleAdsDialogOpen(true);
              }
            }}
            onManage={() => {
              if (!canManageIntegrations) {
                toast.error("Solo un amministratore aziendale può modificare integrazioni.");
                return;
              }
              if (item.provider === "google_calendar" || item.provider === "apple_calendar") {
                navigate("/azienda/impostazioni/calendari");
                return;
              }
              if (item.provider === "google_ads") {
                setGoogleAdsDialogOpen(true);
              }
            }}
            onTest={
              item.provider === "google_ads" && item.integration?.status === "connected"
                  ? testGoogleAdsConnection
                  : undefined
            }
            canManage={canManageIntegrations}
            disabledReason="Gestione riservata agli amministratori"
            accountLabel={
              item.provider === "google_calendar"
                ? gcalConnection?.google_account_email
                : item.provider === "apple_calendar"
                  ? appleCalConnection?.apple_id_email
                  : item.provider === "google_ads"
                    ? googleAdsAccountLabel
                    : null
            }
          />
        ))}
      </div>

      {/* GAP 7b: Email OAuth — connessioni personali dell'utente.
          Spostato sotto la griglia principale: le calendar/ads connections
          sono primarie, le email/triage sono integrazioni avanzate AI. */}
      <EmailOAuthConnectionsCard />

      {/* ── Reputazione ───────────────────────────────────────────── */}
      <div className="pt-2 space-y-4">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Reputazione</h2>
        </div>

        {/* Google Business Profile — OAuth REALE in questa pagina (2026-05-27).
            Prima era una card statica che ridirigeva su /azienda/marketing/reputazione.
            Ora il flow OAuth completo (start + select location + sync) si fa qui. */}
        <GbpConnectionCard />

        {/* Altre fonti reputazione (Facebook Reviews + modulo sito) — placeholder */}
        <div className="grid gap-4 md:grid-cols-2">
          {reputationCards
            .filter((card) => card.key !== "google-business-profile")
            .map((card) => {
            const Icon = card.icon;
            const connected = card.status === "connected";
            return (
              <Card
                key={card.key}
                className={cn(
                  "flex flex-col overflow-hidden border-l-4",
                  connected ? "border-l-emerald-500" : "border-l-slate-300",
                )}
              >
                <CardHeader className="flex-row items-start gap-3 space-y-0">
                  <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", connected ? "bg-emerald-50" : "bg-muted")}>
                    <Icon className={cn("h-5 w-5", card.iconColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base">{card.name}</CardTitle>
                      {connected ? (
                        <Badge className="text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-600">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Pronto
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          Setup
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1 line-clamp-2">{card.description}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <p className="text-xs text-muted-foreground">{card.detail}</p>
                  <Button
                    variant={connected ? "outline" : "default"}
                    size="sm"
                    className="w-full"
                    onClick={() => navigate("/azienda/marketing/reputazione?tab=integrazioni")}
                  >
                    <Star className="mr-2 h-4 w-4" />
                    Apri Reputazione
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Pubblicità — Google Ads OAuth ─────────────────────────── */}
      <div className="pt-2 space-y-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Pubblicità — OAuth</h2>
        </div>
        {/* Google Ads OAuth REALE in questa pagina (2026-05-27).
            La card precedente per "Customer ID manuale" resta più in alto come fallback. */}
        <GoogleAdsConnectionCard />
      </div>

      {/* WhatsApp Bot AI Card */}
      <Card
        className="cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => navigate("/azienda/impostazioni/whatsapp-bot")}
      >
        <CardHeader className="flex-row items-start gap-3 space-y-0">
          <BrandIconShell className="h-8 w-8">
            <WhatsAppLogo />
          </BrandIconShell>
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

      {/* ── Piattaforme Social ───────────────────────────────────────── */}
      <div className="pt-2 space-y-4">
        <div className="flex items-center gap-2">
          <Share2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Piattaforme Social</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">

          {/* ── Meta Pages & Instagram Content ─────────────────────── */}
          <Card className="flex flex-col overflow-hidden border-l-4 border-l-blue-500">
            <CardHeader className="flex-row items-start gap-3 space-y-0 pb-2">
              {/* Facebook + Instagram dual logo */}
              <BrandIconShell>
                <MetaAssetLogo />
              </BrandIconShell>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base">Meta Pages &amp; Instagram Content</CardTitle>
                  {metaIntegration?.status === "connected" ? (
                    <Badge className="text-[10px] gap-1 bg-amber-500 hover:bg-amber-500">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      Parzialmente abilitato
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Non configurato
                    </Badge>
                  )}
                </div>
                <CardDescription className="mt-1">
                  Pubblica post, immagini e Reel su Pagine Facebook e account Instagram Business dal gestionale.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">OAuth scopes richiesti</p>
                <div className="flex flex-wrap gap-1">
                  {["pages_manage_posts", "instagram_content_publish", "instagram_manage_insights"].map((s) => (
                    <span key={s} className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground">{s}</span>
                  ))}
                </div>
              </div>
              {metaIntegration?.status === "connected" ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  La connessione Meta Lead Ads è attiva. Per la pubblicazione social servono permessi OAuth aggiuntivi.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Richiede una connessione Meta attiva. Collega prima Meta dalla pagina Lead Facebook.
                </p>
              )}
              <button
                type="button"
                className="text-xs text-primary hover:underline font-medium"
                onClick={() => {
                  if (metaIntegration?.status === "connected") {
	                    toast.info("Estendi permessi Meta", {
	                      description: "La gestione base di Meta vive in Lead Facebook. Da quella pagina potrai riconnettere Meta quando saranno disponibili gli scope social publishing.",
	                    });
                    navigate("/azienda/impostazioni/lead-forms");
                  } else {
                    navigate("/azienda/impostazioni/lead-forms");
                  }
                }}
              >
                Apri Lead Facebook →
              </button>
            </CardContent>
          </Card>

          {/* ── LinkedIn Company Pages ─────────────────────────────── */}
          <Card className="flex flex-col overflow-hidden border-l-4 border-l-slate-300">
            <CardHeader className="flex-row items-start gap-3 space-y-0 pb-2">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 bg-muted">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#0A66C2" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base">LinkedIn Company Pages</CardTitle>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Non configurato</Badge>
                </div>
                <CardDescription className="mt-1">
                  Pubblica post e aggiornamenti sulle pagine aziendali LinkedIn dal gestionale.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">OAuth scopes richiesti</p>
                <div className="flex flex-wrap gap-1">
                  {["w_organization_social", "r_organization_social"].map((s) => (
                    <span key={s} className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground">{s}</span>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Endpoint: <span className="font-mono">POST /v2/posts</span> · Richiede approvazione LinkedIn Marketing Developer Platform.
              </p>
              <button
                type="button"
                className="text-xs text-primary hover:underline font-medium"
                onClick={() =>
                  toast.info("LinkedIn — Prossimamente", {
                    description: "L'integrazione LinkedIn Company Pages richiede l'approvazione della tua app nel LinkedIn Marketing Developer Platform. Contatta il supporto per avviare il processo di configurazione.",
                  })
                }
              >
                Connetti LinkedIn →
              </button>
            </CardContent>
          </Card>

          {/* ── YouTube Channel ────────────────────────────────────── */}
          <Card className="flex flex-col overflow-hidden border-l-4 border-l-slate-300">
            <CardHeader className="flex-row items-start gap-3 space-y-0 pb-2">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 bg-muted">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#FF0000" xmlns="http://www.w3.org/2000/svg">
                  <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base">YouTube Channel</CardTitle>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Non configurato</Badge>
                </div>
                <CardDescription className="mt-1">
                  Carica video e YouTube Shorts direttamente dal gestionale tramite il tuo account Google.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">OAuth scopes richiesti</p>
                <div className="flex flex-wrap gap-1">
                  {["youtube.upload", "youtube.force-ssl"].map((s) => (
                    <span key={s} className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground">{s}</span>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Usa Google OAuth 2.0 — stesso account Google di Google Ads. Possibilità di collegare entrambi con una sola autenticazione.
              </p>
              <button
                type="button"
                className="text-xs text-primary hover:underline font-medium"
                onClick={() =>
                  toast.info("YouTube — Prossimamente", {
                    description: "L'integrazione YouTube Channel utilizza le stesse credenziali Google di Google Ads. Una volta disponibile, potrai collegare entrambe le piattaforme con un'unica autenticazione OAuth.",
                  })
                }
              >
                Connetti YouTube →
              </button>
            </CardContent>
          </Card>

          {/* ── TikTok for Business ───────────────────────────────── */}
          <Card className="flex flex-col overflow-hidden border-l-4 border-l-slate-300">
            <CardHeader className="flex-row items-start gap-3 space-y-0 pb-2">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 bg-muted">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#000000" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9.05a8.16 8.16 0 004.77 1.52V7.13a4.85 4.85 0 01-1-.44z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base">TikTok for Business</CardTitle>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Non configurato</Badge>
                </div>
                <CardDescription className="mt-1">
                  Pubblica video sul profilo TikTok aziendale direttamente dal gestionale.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">OAuth scopes richiesti</p>
                <div className="flex flex-wrap gap-1">
                  {["video.publish", "video.upload"].map((s) => (
                    <span key={s} className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground">{s}</span>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Richiede TikTok Business Account e approvazione dell'app tramite TikTok Developer Portal.
              </p>
              <button
                type="button"
                className="text-xs text-primary hover:underline font-medium"
                onClick={() =>
                  toast.info("TikTok for Business — Prossimamente", {
                    description: "Per pubblicare su TikTok è necessario un TikTok Business Account e l'approvazione dell'applicazione tramite il TikTok Developer Portal. Contatta il supporto per avviare il processo.",
                  })
                }
              >
                Connetti TikTok →
              </button>
            </CardContent>
          </Card>

        </div>
      </div>
      {/* ── Fine Piattaforme Social ─────────────────────────────────── */}

      {mainIntegrations.length === 0 && statusCards.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Nessuna integrazione trovata per "{search}"
        </div>
      )}

      <Dialog open={googleHubDialogOpen} onOpenChange={setGoogleHubDialogOpen}>
        <DialogContent className="sm:max-w-[820px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Google Hub</DialogTitle>
            <DialogDescription>
              Collega Google una volta e assegna solo gli asset necessari a questa azienda.
              Ads, calendari, scheda locale e YouTube hanno dati e permessi separati.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            {googleHubAssets.map((asset) => {
              const connected = asset.status === "connected";
              return (
                <Card key={asset.key} className={cn("border-l-4", connected ? "border-l-emerald-500" : "border-l-slate-300")}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {asset.icon}
                        <div className="space-y-1">
                          <CardTitle className="text-base">{asset.name}</CardTitle>
                          <CardDescription>{asset.description}</CardDescription>
                        </div>
                      </div>
                      <Badge variant={connected ? "default" : "outline"} className={cn("text-[10px]", connected && "bg-emerald-600 hover:bg-emerald-600")}>
                        {connected ? "Collegato" : "Da collegare"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <p className="text-xs text-muted-foreground">{asset.detail}</p>
                    <Button type="button" variant={connected ? "outline" : "secondary"} size="sm" className="w-full" onClick={asset.action}>
                      {asset.actionLabel}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={googleAdsDialogOpen} onOpenChange={setGoogleAdsDialogOpen}>
        <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Google Ads</DialogTitle>
            <DialogDescription>
              Configura l'account Google Ads dell'azienda. Le campagne restano separate da Meta, mentre vendite e appuntamenti CRM alimentano le conversioni offline.
            </DialogDescription>
          </DialogHeader>

          {!googleAdsAccountsSchemaReady && (
            <Alert className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-sm">Schema Google Ads da applicare</AlertTitle>
              <AlertDescription className="text-xs text-amber-900 dark:text-amber-200">
                Posso salvare lo stato dell'integrazione, ma la tabella account Google Ads non risulta ancora disponibile nel database.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="google-ads-customer-id">Customer ID</Label>
                  <Input
                    id="google-ads-customer-id"
                    placeholder="123-456-7890"
                    value={googleAdsForm.customerId}
                    onChange={(event) =>
                      setGoogleAdsForm((current) => ({ ...current, customerId: event.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Lo trovi in alto a destra dentro Google Ads. Accetto anche il formato con trattini.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="google-ads-customer-name">Nome account</Label>
                  <Input
                    id="google-ads-customer-name"
                    placeholder="Azienda Search"
                    value={googleAdsForm.customerName}
                    onChange={(event) =>
                      setGoogleAdsForm((current) => ({ ...current, customerName: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="google-ads-manager-id">Manager Customer ID</Label>
                  <Input
                    id="google-ads-manager-id"
                    placeholder="Opzionale, MCC"
                    value={googleAdsForm.managerCustomerId}
                    onChange={(event) =>
                      setGoogleAdsForm((current) => ({ ...current, managerCustomerId: event.target.value }))
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="google-ads-currency">Valuta</Label>
                    <Input
                      id="google-ads-currency"
                      value={googleAdsForm.currency}
                      onChange={(event) =>
                        setGoogleAdsForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="google-ads-time-zone">Fuso</Label>
                    <Input
                      id="google-ads-time-zone"
                      value={googleAdsForm.timeZone}
                      onChange={(event) =>
                        setGoogleAdsForm((current) => ({ ...current, timeZone: event.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                <div>
                  <Label htmlFor="google-ads-test-account">Account test</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Attivalo se il Customer ID e un account sandbox o non deve pubblicare campagne reali.
                  </p>
                </div>
                <Switch
                  id="google-ads-test-account"
                  checked={googleAdsForm.isTestAccount}
                  onCheckedChange={(checked) =>
                    setGoogleAdsForm((current) => ({ ...current, isTestAccount: checked }))
                  }
                />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Prontezza operativa</p>
              <div className="space-y-2">
                {googleAdsReadinessChecks.map((check) => {
                  const Icon =
                    check.status === "ok" ? CheckCircle2 : check.status === "blocked" ? XCircle : AlertTriangle;
                  return (
                    <div
                      key={check.key}
                      className={cn(
                        "rounded-md border p-3",
                        check.status === "ok" && "border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20",
                        check.status === "warning" && "border-amber-200 bg-amber-50/60 dark:bg-amber-950/20",
                        check.status === "blocked" && "border-destructive/20 bg-destructive/5",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon
                          className={cn(
                            "h-4 w-4",
                            check.status === "ok" && "text-emerald-600",
                            check.status === "warning" && "text-amber-600",
                            check.status === "blocked" && "text-destructive",
                          )}
                        />
                        <p className="text-sm font-medium">{check.label}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGoogleAdsDialogOpen(false)}>
              Chiudi
            </Button>
            <Button
              type="button"
              disabled={
                !canManageIntegrations ||
                !isValidGoogleCustomerId(googleAdsForm.customerId) ||
                saveGoogleAdsConnection.isPending
              }
              onClick={() => saveGoogleAdsConnection.mutate()}
            >
              {saveGoogleAdsConnection.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salva Google Ads
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
