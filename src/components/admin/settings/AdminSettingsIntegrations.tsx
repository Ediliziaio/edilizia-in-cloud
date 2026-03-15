import { useState, forwardRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Shield, Eye, EyeOff, Info, MapPin, MessageSquare, CalendarDays,
  CreditCard, Loader2, CheckCircle2, XCircle, Plug,
} from "lucide-react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type SettingsMap = Record<string, { value: string; masked?: string; updated_at?: string }>;

interface ApiKeyField {
  key: string;
  label: string;
  isSecret: boolean;
}

// ─── CONNECTION TEST ──────────────────────────────────────────────────────────

const ConnectionTestButton = forwardRef<HTMLDivElement, { integrationKey: string }>(
  function ConnectionTestButton({ integrationKey }, ref) {
    const [status, setStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
    const [message, setMessage] = useState("");

    const handleTest = async () => {
      setStatus("testing");
      setMessage("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await supabase.functions.invoke("test-integration", {
          body: { integration: integrationKey },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (res.error) throw new Error(res.error.message);
        const result = res.data;
        setStatus(result?.ok ? "ok" : "error");
        setMessage(result?.message || "");
      } catch (e: any) {
        setStatus("error");
        setMessage(e.message);
      }
      setTimeout(() => { setStatus("idle"); setMessage(""); }, 5000);
    };

    return (
      <div ref={ref} className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleTest} disabled={status === "testing"} className="gap-2">
          {status === "testing" && <Loader2 className="h-3 w-3 animate-spin" />}
          {status === "ok" && <CheckCircle2 className="h-3 w-3 text-green-600" />}
          {status === "error" && <XCircle className="h-3 w-3 text-destructive" />}
          {status === "idle" && <Plug className="h-3 w-3" />}
          {status === "testing" ? "Test..." : status === "ok" ? "Connesso" : status === "error" ? "Errore" : "Testa connessione"}
        </Button>
        {message && (
          <span className={`text-xs ${status === "ok" ? "text-green-600" : "text-destructive"}`}>{message}</span>
        )}
      </div>
    );
  }
);

// ─── API KEY CARD ─────────────────────────────────────────────────────────────

function ApiKeyCard({
  icon: Icon, title, description, tooltipText, fields, settings, isLoading, onSave, isSaving, integrationKey,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tooltipText: string;
  fields: ApiKeyField[];
  settings: SettingsMap | undefined;
  isLoading: boolean;
  onSave: (updates: Record<string, string>) => void;
  isSaving: boolean;
  integrationKey?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const isConfigured = fields.some(f => {
    const s = settings?.[f.key];
    return !!(s?.value || s?.masked);
  });
  const hasInput = fields.some(f => values[f.key]?.trim());

  const handleSave = () => {
    const updates: Record<string, string> = {};
    fields.forEach(f => { if (values[f.key]?.trim()) updates[f.key] = values[f.key].trim(); });
    if (Object.keys(updates).length === 0) return;
    onSave(updates);
    setValues({});
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <CardTitle>{title}</CardTitle>
          </div>
          <Badge variant={isConfigured ? "default" : "secondary"}>
            {isLoading ? "..." : isConfigured ? "Configurato" : "Non configurato"}
          </Badge>
        </div>
        <CardDescription className="flex items-center gap-1">
          {description}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{tooltipText}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map(field => {
          const current = settings?.[field.key];
          const displayValue = current?.masked || current?.value;
          const isSecret = field.isSecret;
          const show = showSecrets[field.key];

          return (
            <div key={field.key} className="space-y-2">
              <label className="text-sm font-medium">{field.label}</label>
              <div className="relative">
                <Input
                  type={isSecret && !show ? "password" : "text"}
                  placeholder={displayValue || `Inserisci ${field.label}`}
                  value={values[field.key] || ""}
                  onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className={isSecret ? "pr-10" : ""}
                />
                {isSecret && (
                  <Button
                    variant="ghost" size="icon"
                    className="absolute right-0 top-0 h-10 w-10"
                    onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                    type="button"
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                )}
              </div>
              {displayValue && !values[field.key] && (
                <p className="text-xs text-muted-foreground">Valore attuale: {displayValue}</p>
              )}
            </div>
          );
        })}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={isSaving || !hasInput} className="flex-1">
            {isSaving ? "Salvataggio..." : "Salva configurazione"}
          </Button>
          {integrationKey && <ConnectionTestButton integrationKey={integrationKey} />}
        </div>

        <p className="text-xs text-muted-foreground">
          I valori esistenti restano invariati se il campo è vuoto. Le credenziali di ambiente vengono usate come fallback.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── API CARDS CONFIG ─────────────────────────────────────────────────────────

const API_CARDS = [
  {
    icon: Shield,
    title: "Integrazioni Meta",
    description: "Credenziali Meta App per OAuth (Lead Ads)",
    tooltipText: "Queste credenziali vengono usate da tutte le aziende per il collegamento OAuth Meta.",
    integrationKey: "meta",
    fields: [
      { key: "meta_app_id", label: "Meta App ID", isSecret: false },
      { key: "meta_app_secret", label: "Meta App Secret", isSecret: true },
    ],
  },
  {
    icon: CalendarDays,
    title: "Google Calendar",
    description: "Credenziali OAuth per sincronizzazione calendari",
    tooltipText: "Client ID e Client Secret per il collegamento OAuth Google Calendar.",
    integrationKey: "google_calendar",
    fields: [
      { key: "google_calendar_client_id", label: "Google Client ID", isSecret: false },
      { key: "google_calendar_client_secret", label: "Google Client Secret", isSecret: true },
    ],
  },
  {
    icon: MapPin,
    title: "Google Maps",
    description: "API Key per geocoding e autocompletamento indirizzi",
    tooltipText: "La chiave viene usata dal proxy server-side per le API Places, Geocoding e Directions.",
    integrationKey: "google_maps",
    fields: [
      { key: "google_maps_api_key", label: "Google Maps API Key", isSecret: true },
    ],
  },
  {
    icon: MessageSquare,
    title: "WhatsApp",
    description: "Verify Token per il webhook WhatsApp Business API",
    tooltipText: "Il Verify Token viene usato per la validazione iniziale del webhook Meta/WhatsApp.",
    fields: [
      { key: "whatsapp_verify_token", label: "Verify Token", isSecret: true },
    ],
  },
] as const;

// ─── GOOGLE CALENDAR POLICIES ─────────────────────────────────────────────────

const GOOGLE_POLICY_TOGGLES = [
  {
    key: "google_calendar_allow_two_way",
    label: "Sincronizzazione bidirezionale (Two-Way)",
    description: "Permette agli utenti di abilitare la sincronizzazione bidirezionale tra CRM e Google Calendar.",
  },
  {
    key: "google_calendar_allow_guest_contact_create",
    label: "Crea contatti da invitati",
    description: "Permette di creare automaticamente contatti CRM dai partecipanti degli eventi Google.",
  },
  {
    key: "google_calendar_allow_google_to_crm_import",
    label: "Importa eventi Google come appuntamenti CRM",
    description: "Permette di trasformare eventi Google (con regole di import) in appuntamenti CRM.",
  },
] as const;

function GoogleCalendarPoliciesCard({
  settings, isLoading, onToggle, isSaving,
}: {
  settings: SettingsMap | undefined;
  isLoading: boolean;
  onToggle: (key: string, value: boolean) => void;
  isSaving: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <CardTitle>Policy Google Calendar</CardTitle>
        </div>
        <CardDescription>
          Abilita o disabilita le funzionalità avanzate di sincronizzazione Google Calendar per tutte le aziende.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {GOOGLE_POLICY_TOGGLES.map((toggle) => {
          const currentValue = settings?.[toggle.key]?.value === "true";
          return (
            <div key={toggle.key} className="flex items-center justify-between gap-4 py-2">
              <div className="flex-1">
                <p className="text-sm font-medium">{toggle.label}</p>
                <p className="text-xs text-muted-foreground">{toggle.description}</p>
              </div>
              <Switch
                checked={currentValue}
                onCheckedChange={(checked) => onToggle(toggle.key, checked)}
                disabled={isSaving || isLoading}
              />
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground pt-2 border-t">
          Queste policy controllano le opzioni disponibili nella modale "Preferenze di sincronizzazione" di ogni utente.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── STRIPE SETTINGS ──────────────────────────────────────────────────────────

function StripeSettingsCard({
  settings, isLoading, onSave, isSaving,
}: {
  settings: SettingsMap | undefined;
  isLoading: boolean;
  onSave: (updates: Record<string, string>) => void;
  isSaving: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const stripeMode = settings?.["stripe_mode"]?.value || "live";
  const isTest = stripeMode === "test";
  const isConfigured = !!(settings?.["stripe_secret_key"]?.value || settings?.["stripe_secret_key"]?.masked);
  const hasInput = Object.values(values).some(v => v?.trim());

  const handleSave = () => {
    const updates: Record<string, string> = {};
    Object.entries(values).forEach(([k, v]) => { if (v?.trim()) updates[k] = v.trim(); });
    if (Object.keys(updates).length === 0) return;
    onSave(updates);
    setValues({});
  };

  const toggleMode = () => {
    onSave({ stripe_mode: isTest ? "live" : "test" });
  };

  const stripeFields = [
    { key: "stripe_publishable_key", label: "Publishable Key", isSecret: false, placeholder: isTest ? "pk_test_..." : "pk_live_..." },
    { key: "stripe_secret_key", label: "Secret Key", isSecret: true, placeholder: isTest ? "sk_test_..." : "sk_live_..." },
    { key: "stripe_webhook_secret", label: "Webhook Secret", isSecret: true, placeholder: "whsec_..." },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <CardTitle>Stripe</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={isConfigured ? "default" : "secondary"}>
              {isLoading ? "..." : isConfigured ? "Configurato" : "Non configurato"}
            </Badge>
            <div className="flex items-center gap-2">
              <Badge variant={isTest ? "outline" : "default"} className="text-xs">
                {isTest ? "Test" : "Live"}
              </Badge>
              <Switch checked={!isTest} onCheckedChange={() => toggleMode()} disabled={isSaving || isLoading} />
            </div>
          </div>
        </div>
        <CardDescription>Pagamenti e abbonamenti</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isTest && (
          <Alert>
            <AlertDescription>
              ⚠️ Modalità test: i pagamenti non sono reali. Usa le chiavi live per la produzione.
            </AlertDescription>
          </Alert>
        )}
        {stripeFields.map(field => {
          const current = settings?.[field.key];
          const displayValue = current?.masked || current?.value;
          const show = showSecrets[field.key];
          return (
            <div key={field.key} className="space-y-2">
              <label className="text-sm font-medium">{field.label}</label>
              <div className="relative">
                <Input
                  type={field.isSecret && !show ? "password" : "text"}
                  placeholder={displayValue || field.placeholder}
                  value={values[field.key] || ""}
                  onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className={`font-mono text-sm ${field.isSecret ? "pr-10" : ""}`}
                />
                {field.isSecret && (
                  <Button
                    variant="ghost" size="icon"
                    className="absolute right-0 top-0 h-10 w-10"
                    onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                    type="button"
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                )}
              </div>
              {displayValue && !values[field.key] && (
                <p className="text-xs text-muted-foreground">Valore attuale: {displayValue}</p>
              )}
            </div>
          );
        })}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={isSaving || !hasInput} className="flex-1">
            {isSaving ? "Salvataggio..." : "Salva configurazione"}
          </Button>
          <ConnectionTestButton integrationKey="stripe" />
        </div>
        <p className="text-xs text-muted-foreground">
          Trovi il webhook secret in Stripe Dashboard → Webhooks. Le chiavi test e live vanno configurate separatamente.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function AdminSettingsIntegrations() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: queryKeys.admin.platformSettings,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "get-settings" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return res.data?.settings as SettingsMap | undefined;
    },
    staleTime: 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "update-settings", settings: updates },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Configurazione salvata");
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.platformSettings });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      {/* Stripe */}
      <StripeSettingsCard
        settings={settings}
        isLoading={settingsLoading}
        onSave={(updates) => saveMutation.mutate(updates)}
        isSaving={saveMutation.isPending}
      />

      {/* API Cards */}
      {API_CARDS.map(card => (
        <ApiKeyCard
          key={card.title}
          icon={card.icon}
          title={card.title}
          description={card.description}
          tooltipText={card.tooltipText}
          fields={[...card.fields]}
          settings={settings}
          isLoading={settingsLoading}
          onSave={(updates) => saveMutation.mutate(updates)}
          isSaving={saveMutation.isPending}
          integrationKey={"integrationKey" in card ? card.integrationKey : undefined}
        />
      ))}

      {/* Google Calendar Policies */}
      <GoogleCalendarPoliciesCard
        settings={settings}
        isLoading={settingsLoading}
        onToggle={(key, value) => saveMutation.mutate({ [key]: value ? "true" : "false" })}
        isSaving={saveMutation.isPending}
      />
    </div>
  );
}
