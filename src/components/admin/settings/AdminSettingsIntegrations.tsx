import { useState, forwardRef, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link } from "react-router-dom";
import {
  Shield, Eye, EyeOff, Info, MapPin, MessageSquare, CalendarDays,
  CreditCard, Loader2, CheckCircle2, XCircle, Plug, ExternalLink,
  Activity, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type SettingsMap = Record<string, { value: string; masked?: string; updated_at?: string }>;

interface ApiKeyField {
  key: string;
  label: string;
  isSecret: boolean;
}

// ─── CONNECTION TEST ──────────────────────────────────────────────────────────
// FIX: useRef<bool> "mounted" per evitare setState post-unmount (il setTimeout
// finale poteva scattare quando il componente era già smontato e causare warn).

const ConnectionTestButton = forwardRef<HTMLDivElement, { integrationKey: string }>(
  function ConnectionTestButton({ integrationKey }, ref) {
    const [status, setStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
    const [message, setMessage] = useState("");
    const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      };
    }, []);

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
        if (!mountedRef.current) return;
        setStatus(result?.ok ? "ok" : "error");
        setMessage(result?.message || "");
      } catch (e: unknown) {
        if (!mountedRef.current) return;
        setStatus("error");
        setMessage(e instanceof Error ? e.message : String(e));
      }
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setStatus("idle");
        setMessage("");
      }, 5000);
    };

    return (
      <div ref={ref} className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={status === "testing"}
          className="gap-2"
        >
          {status === "testing" && <Loader2 className="h-3 w-3 animate-spin" />}
          {status === "ok" && <CheckCircle2 className="h-3 w-3 text-green-600" />}
          {status === "error" && <XCircle className="h-3 w-3 text-destructive" />}
          {status === "idle" && <Plug className="h-3 w-3" />}
          {status === "testing"
            ? "Test..."
            : status === "ok"
            ? "Connesso"
            : status === "error"
            ? "Errore"
            : "Testa connessione"}
        </Button>
        {message && (
          <span
            className={cn(
              "text-xs truncate max-w-[280px]",
              status === "ok" ? "text-green-600" : "text-destructive",
            )}
            title={message}
          >
            {message}
          </span>
        )}
      </div>
    );
  },
);

// ─── API KEY CARD ─────────────────────────────────────────────────────────────

function ApiKeyCard({
  icon: Icon, title, description, tooltipText, fields, settings,
  isLoading, onSave, isSaving, saveSucceededAt, integrationKey,
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
  /** Timestamp dell'ultimo success del mutation; usato per pulire i campi locali */
  saveSucceededAt: number;
  integrationKey?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  // Traccia se questa card ha appena inviato una save, per pulire solo dopo success
  const [pendingSave, setPendingSave] = useState(false);
  const [lastClearedAt, setLastClearedAt] = useState(0);

  const isConfigured = fields.some((f) => {
    const s = settings?.[f.key];
    return !!(s?.value || s?.masked);
  });
  const hasInput = fields.some((f) => values[f.key]?.trim());

  // FIX: puliamo gli input LOCALI solo dopo un success del mutation per questa card.
  // Prima il clear era immediato e, se la save falliva, l'utente perdeva quanto digitato.
  useEffect(() => {
    if (pendingSave && saveSucceededAt > lastClearedAt) {
      setValues({});
      setPendingSave(false);
      setLastClearedAt(saveSucceededAt);
    }
  }, [saveSucceededAt, pendingSave, lastClearedAt]);

  const handleSave = () => {
    const updates: Record<string, string> = {};
    fields.forEach((f) => {
      if (values[f.key]?.trim()) updates[f.key] = values[f.key].trim();
    });
    if (Object.keys(updates).length === 0) return;
    setPendingSave(true);
    onSave(updates);
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
        {fields.map((field) => {
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
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className={isSecret ? "pr-10" : ""}
                  autoComplete="off"
                />
                {isSecret && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-10 w-10"
                    onClick={() =>
                      setShowSecrets((prev) => ({ ...prev, [field.key]: !prev[field.key] }))
                    }
                    type="button"
                    tabIndex={-1}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                )}
              </div>
              {displayValue && !values[field.key] && (
                <p className="text-xs text-muted-foreground">
                  Valore attuale: <code className="font-mono">{displayValue}</code>
                </p>
              )}
            </div>
          );
        })}

        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={handleSave} disabled={isSaving || !hasInput} className="flex-1 min-w-[160px]">
            {isSaving && pendingSave ? "Salvataggio..." : "Salva configurazione"}
          </Button>
          {integrationKey && <ConnectionTestButton integrationKey={integrationKey} />}
        </div>

        <p className="text-xs text-muted-foreground">
          I valori esistenti restano invariati se il campo è vuoto. Le credenziali di
          ambiente vengono usate come fallback.
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
    tooltipText:
      "Queste credenziali vengono usate da tutte le aziende per il collegamento OAuth Meta.",
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
    tooltipText:
      "Client ID e Client Secret per il collegamento OAuth Google Calendar.",
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
    tooltipText:
      "La chiave viene usata dal proxy server-side per le API Places, Geocoding e Directions.",
    integrationKey: "google_maps",
    fields: [
      { key: "google_maps_api_key", label: "Google Maps API Key", isSecret: true },
    ],
  },
  {
    icon: MessageSquare,
    title: "WhatsApp",
    description: "Verify Token per il webhook WhatsApp Business API",
    tooltipText:
      "Il Verify Token viene usato per la validazione iniziale del webhook Meta/WhatsApp.",
    fields: [
      { key: "whatsapp_verify_token", label: "Verify Token", isSecret: true },
      { key: "whatsapp_config_id", label: "Embedded Signup Config ID", isSecret: true },
    ],
  },
] as const;

// ─── GOOGLE CALENDAR POLICIES ─────────────────────────────────────────────────

const GOOGLE_POLICY_TOGGLES = [
  {
    key: "google_calendar_allow_two_way",
    label: "Sincronizzazione bidirezionale (Two-Way)",
    description:
      "Permette agli utenti di abilitare la sincronizzazione bidirezionale tra CRM e Google Calendar.",
  },
  {
    key: "google_calendar_allow_guest_contact_create",
    label: "Crea contatti da invitati",
    description:
      "Permette di creare automaticamente contatti CRM dai partecipanti degli eventi Google.",
  },
  {
    key: "google_calendar_allow_google_to_crm_import",
    label: "Importa eventi Google come appuntamenti CRM",
    description:
      "Permette di trasformare eventi Google (con regole di import) in appuntamenti CRM.",
  },
] as const;

const GoogleCalendarPoliciesCard = forwardRef<
  HTMLDivElement,
  {
    settings: SettingsMap | undefined;
    isLoading: boolean;
    onToggle: (key: string, value: boolean) => void;
    isSaving: boolean;
  }
>(function GoogleCalendarPoliciesCard(
  { settings, isLoading, onToggle, isSaving },
  ref,
) {
  return (
    <Card ref={ref}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <CardTitle>Policy Google Calendar</CardTitle>
        </div>
        <CardDescription>
          Abilita o disabilita le funzionalità avanzate di sincronizzazione Google Calendar
          per tutte le aziende.
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
          Queste policy controllano le opzioni disponibili nella modale "Preferenze di
          sincronizzazione" di ogni utente.
        </p>
      </CardContent>
    </Card>
  );
});

// ─── STRIPE SETTINGS ──────────────────────────────────────────────────────────

function StripeSettingsCard({
  settings, isLoading, onSave, isSaving, saveSucceededAt,
}: {
  settings: SettingsMap | undefined;
  isLoading: boolean;
  onSave: (updates: Record<string, string>) => void;
  isSaving: boolean;
  saveSucceededAt: number;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [pendingSave, setPendingSave] = useState(false);
  const [lastClearedAt, setLastClearedAt] = useState(0);
  const [switchConfirmOpen, setSwitchConfirmOpen] = useState(false);

  const stripeMode = settings?.["stripe_mode"]?.value || "live";
  const isTest = stripeMode === "test";
  const isConfigured = !!(
    settings?.["stripe_secret_key"]?.value || settings?.["stripe_secret_key"]?.masked
  );
  const hasInput = Object.values(values).some((v) => v?.trim());

  // FIX: clear inputs only on successful save (same pattern as ApiKeyCard)
  useEffect(() => {
    if (pendingSave && saveSucceededAt > lastClearedAt) {
      setValues({});
      setPendingSave(false);
      setLastClearedAt(saveSucceededAt);
    }
  }, [saveSucceededAt, pendingSave, lastClearedAt]);

  const handleSave = () => {
    const updates: Record<string, string> = {};
    Object.entries(values).forEach(([k, v]) => {
      if (v?.trim()) updates[k] = v.trim();
    });
    if (Object.keys(updates).length === 0) return;
    setPendingSave(true);
    onSave(updates);
  };

  const confirmToggleMode = () => {
    onSave({ stripe_mode: isTest ? "live" : "test" });
    setSwitchConfirmOpen(false);
  };

  const stripeFields = [
    {
      key: "stripe_publishable_key",
      label: "Publishable Key",
      isSecret: false,
      placeholder: isTest ? "pk_test_..." : "pk_live_...",
    },
    {
      key: "stripe_secret_key",
      label: "Secret Key",
      isSecret: true,
      placeholder: isTest ? "sk_test_..." : "sk_live_...",
    },
    {
      key: "stripe_webhook_secret",
      label: "Webhook Secret",
      isSecret: true,
      placeholder: "whsec_...",
    },
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <CardTitle>Stripe</CardTitle>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={isConfigured ? "default" : "secondary"}>
                {isLoading ? "..." : isConfigured ? "Configurato" : "Non configurato"}
              </Badge>
              <div className="flex items-center gap-2">
                <Badge variant={isTest ? "outline" : "default"} className="text-xs">
                  {isTest ? "Test" : "Live"}
                </Badge>
                <Switch
                  checked={!isTest}
                  onCheckedChange={() => setSwitchConfirmOpen(true)}
                  disabled={isSaving || isLoading}
                />
              </div>
            </div>
          </div>
          <CardDescription>Pagamenti e abbonamenti</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isTest && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Modalità <strong>test</strong>: i pagamenti non sono reali. Usa le chiavi
                live per la produzione.
              </AlertDescription>
            </Alert>
          )}
          {stripeFields.map((field) => {
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
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className={cn("font-mono text-sm", field.isSecret && "pr-10")}
                    autoComplete="off"
                  />
                  {field.isSecret && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-10 w-10"
                      onClick={() =>
                        setShowSecrets((prev) => ({
                          ...prev,
                          [field.key]: !prev[field.key],
                        }))
                      }
                      type="button"
                      tabIndex={-1}
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                {displayValue && !values[field.key] && (
                  <p className="text-xs text-muted-foreground">
                    Valore attuale: <code className="font-mono">{displayValue}</code>
                  </p>
                )}
              </div>
            );
          })}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasInput}
              className="flex-1 min-w-[160px]"
            >
              {isSaving && pendingSave ? "Salvataggio..." : "Salva configurazione"}
            </Button>
            <ConnectionTestButton integrationKey="stripe" />
          </div>
          <div className="flex items-center gap-1 flex-wrap pt-1 border-t">
            <p className="text-xs text-muted-foreground flex-1 min-w-[200px]">
              Webhook secret lo trovi in Stripe Dashboard → Webhooks. Test e live vanno
              configurate separatamente.
            </p>
            <Button variant="ghost" size="sm" asChild className="text-xs h-7">
              <a
                href={
                  isTest
                    ? "https://dashboard.stripe.com/test/webhooks"
                    : "https://dashboard.stripe.com/webhooks"
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                Dashboard Stripe <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* FIX: conferma prima di switchare Live ↔ Test (evita cambio accidentale) */}
      <AlertDialog open={switchConfirmOpen} onOpenChange={setSwitchConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Passare a modalità {isTest ? "Live" : "Test"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isTest ? (
                <>
                  Attivando <strong>Live</strong>, la piattaforma processerà pagamenti
                  reali. Assicurati che le chiavi live siano configurate e che i webhook
                  puntino all'endpoint di produzione.
                </>
              ) : (
                <>
                  Tornando a <strong>Test</strong>, nessun pagamento reale verrà
                  processato e le nuove transazioni saranno virtuali. Gli abbonamenti
                  attivi in live continuano a funzionare separatamente.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggleMode}>
              Sì, passa a {isTest ? "Live" : "Test"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── KPI OVERVIEW ─────────────────────────────────────────────────────────────

function IntegrationsKPIs({
  settings, isLoading,
}: {
  settings: SettingsMap | undefined;
  isLoading: boolean;
}) {
  const kpi = useMemo(() => {
    if (!settings) return null;
    const isSet = (k: string) => {
      const s = settings[k];
      return !!(s?.value || s?.masked);
    };
    // Una integrazione è "configurata" se tutti i suoi campi principali sono valorizzati
    const integrations = [
      { name: "Stripe", keys: ["stripe_secret_key"] },
      { name: "Meta", keys: ["meta_app_id", "meta_app_secret"] },
      {
        name: "Google Calendar",
        keys: ["google_calendar_client_id", "google_calendar_client_secret"],
      },
      { name: "Google Maps", keys: ["google_maps_api_key"] },
      { name: "WhatsApp", keys: ["whatsapp_verify_token", "whatsapp_config_id"] },
    ];
    let configured = 0;
    integrations.forEach((i) => {
      if (i.keys.every((k) => isSet(k))) configured++;
    });
    const stripeMode = settings["stripe_mode"]?.value || "live";
    return {
      total: integrations.length,
      configured,
      missing: integrations.length - configured,
      stripeMode,
    };
  }, [settings]);

  const cards = [
    {
      icon: Activity,
      label: "Integrazioni",
      value: isLoading ? "..." : `${kpi?.configured ?? 0} / ${kpi?.total ?? 5}`,
      subtitle: isLoading ? "" : kpi?.configured === kpi?.total ? "tutte attive" : "configurate",
      accent: "bg-primary/10 text-primary",
    },
    {
      icon: AlertTriangle,
      label: "Da configurare",
      value: isLoading ? "..." : String(kpi?.missing ?? 0),
      subtitle: isLoading ? "" : (kpi?.missing ?? 0) > 0 ? "credenziali mancanti" : "nessuna",
      accent:
        (kpi?.missing ?? 0) > 0
          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
    {
      icon: CreditCard,
      label: "Stripe",
      value: isLoading ? "..." : kpi?.stripeMode === "test" ? "Test" : "Live",
      subtitle: kpi?.stripeMode === "test" ? "non reale" : "produzione",
      accent:
        kpi?.stripeMode === "test"
          ? "bg-muted text-muted-foreground"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4 flex items-start gap-3">
            <div className={cn("rounded-lg p-2 shrink-0", c.accent)}>
              <c.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide truncate">
                {c.label}
              </p>
              <p className="text-xl font-bold leading-tight mt-0.5">{c.value}</p>
              {c.subtitle && (
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {c.subtitle}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── QUICK LINKS ──────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { to: "/admin/impostazioni/webhooks", label: "Webhook endpoints" },
  { to: "/admin/impostazioni/webhook-logs", label: "Webhook logs" },
  { to: "/admin/impostazioni/email", label: "Email (SMTP / template)" },
  { to: "/admin/impostazioni/banking", label: "Banking (GoCardless)" },
];

function QuickLinksRow() {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Correlate:</span>
        {QUICK_LINKS.map((l) => (
          <Button key={l.to} asChild size="sm" variant="ghost" className="h-7 text-xs">
            <Link to={l.to}>
              {l.label}
              <ExternalLink className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function AdminSettingsIntegrations() {
  const queryClient = useQueryClient();
  // FIX: tick incrementato ad ogni success; le card lo osservano per pulire gli input
  // solo su save andata a buon fine (prima i valori venivano sempre cancellati).
  const [saveSucceededAt, setSaveSucceededAt] = useState(0);

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
      setSaveSucceededAt(Date.now());
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.platformSettings });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      {/* KPI overview */}
      <IntegrationsKPIs settings={settings} isLoading={settingsLoading} />

      {/* Stripe */}
      <StripeSettingsCard
        settings={settings}
        isLoading={settingsLoading}
        onSave={(updates) => saveMutation.mutate(updates)}
        isSaving={saveMutation.isPending}
        saveSucceededAt={saveSucceededAt}
      />

      {/* API Cards */}
      {API_CARDS.map((card) => (
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
          saveSucceededAt={saveSucceededAt}
          integrationKey={"integrationKey" in card ? card.integrationKey : undefined}
        />
      ))}

      {/* Google Calendar Policies */}
      <GoogleCalendarPoliciesCard
        settings={settings}
        isLoading={settingsLoading}
        onToggle={(key, value) =>
          saveMutation.mutate({ [key]: value ? "true" : "false" })
        }
        isSaving={saveMutation.isPending}
      />

      {/* Quick links a pagine correlate */}
      <QuickLinksRow />
    </div>
  );
}
