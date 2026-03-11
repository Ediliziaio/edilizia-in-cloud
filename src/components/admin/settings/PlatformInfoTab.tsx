import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, ShoppingCart, Server, Copy, Check, Shield, Eye, EyeOff, Info, MapPin, MessageSquare, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import type { LucideIcon } from "lucide-react";

function StatCard({ icon: Icon, label, value, loading }: { icon: LucideIcon; label: string; value: number; loading: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="rounded-lg bg-primary/10 p-3"><Icon className="h-6 w-6 text-primary" /></div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{loading ? "..." : value.toLocaleString("it-IT")}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <code className="flex-1 text-xs break-all">{value}</code>
        <Button variant="ghost" size="icon" onClick={copy} className="shrink-0 h-8 w-8">
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </div>
    </div>
  );
}

type SettingsMap = Record<string, { value: string; masked?: string; updated_at?: string }>;

interface ApiKeyField {
  key: string;
  label: string;
  isSecret: boolean;
}

interface ApiKeyCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  tooltipText: string;
  fields: ApiKeyField[];
  settings: SettingsMap | undefined;
  isLoading: boolean;
  onSave: (updates: Record<string, string>) => void;
  isSaving: boolean;
}

function ApiKeyCard({ icon: Icon, title, description, tooltipText, fields, settings, isLoading, onSave, isSaving }: ApiKeyCardProps) {
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
                    variant="ghost"
                    size="icon"
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

        <Button onClick={handleSave} disabled={isSaving || !hasInput} className="w-full">
          {isSaving ? "Salvataggio..." : "Salva configurazione"}
        </Button>

        <p className="text-xs text-muted-foreground">
          I valori esistenti restano invariati se il campo è vuoto. Le credenziali di ambiente vengono usate come fallback.
        </p>
      </CardContent>
    </Card>
  );
}

const API_CARDS = [
  {
    icon: Shield,
    title: "Integrazioni Meta",
    description: "Credenziali Meta App per OAuth (Lead Ads)",
    tooltipText: "Queste credenziali vengono usate da tutte le aziende per il collegamento OAuth Meta. Ogni azienda ottiene i propri token di accesso specifici.",
    fields: [
      { key: "meta_app_id", label: "Meta App ID", isSecret: false },
      { key: "meta_app_secret", label: "Meta App Secret", isSecret: true },
    ],
  },
  {
    icon: CalendarDays,
    title: "Google Calendar",
    description: "Credenziali OAuth per sincronizzazione calendari",
    tooltipText: "Client ID e Client Secret per il collegamento OAuth Google Calendar. Ogni utente ottiene i propri token di accesso specifici.",
    fields: [
      { key: "google_calendar_client_id", label: "Google Client ID", isSecret: false },
      { key: "google_calendar_client_secret", label: "Google Client Secret", isSecret: true },
    ],
  },
  {
    icon: MapPin,
    title: "Google Maps",
    description: "API Key per geocoding e autocompletamento indirizzi",
    tooltipText: "La chiave viene usata dal proxy server-side per le API Places, Geocoding e Directions. Deve avere le relative API abilitate nel Google Cloud Console.",
    fields: [
      { key: "google_maps_api_key", label: "Google Maps API Key", isSecret: true },
    ],
  },
  {
    icon: MessageSquare,
    title: "WhatsApp",
    description: "Verify Token per il webhook WhatsApp Business API",
    tooltipText: "Il Verify Token viene usato per la validazione iniziale del webhook Meta/WhatsApp. Deve corrispondere al token configurato nell'app Meta Business.",
    fields: [
      { key: "whatsapp_verify_token", label: "Verify Token", isSecret: true },
    ],
  },
] as const;

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
  settings,
  isLoading,
  onToggle,
  isSaving,
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

export default function PlatformInfoTab() {
  const queryClient = useQueryClient();

  const { data: stats, isLoading } = useQuery({
    queryKey: queryKeys.admin.platformStats,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "stats" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return res.data as { totalCompanies: number; totalUsers: number; totalOrders: number };
    },
    staleTime: 5 * 60 * 1000,
  });

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

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Building2} label="Aziende registrate" value={stats?.totalCompanies || 0} loading={isLoading} />
        <StatCard icon={Users} label="Utenti totali" value={stats?.totalUsers || 0} loading={isLoading} />
        <StatCard icon={ShoppingCart} label="Ordini totali" value={stats?.totalOrders || 0} loading={isLoading} />
      </div>

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
        />
      ))}

      {/* Google Calendar Policy Toggles */}
      <GoogleCalendarPoliciesCard
        settings={settings}
        isLoading={settingsLoading}
        onToggle={(key, value) => saveMutation.mutate({ [key]: value ? "true" : "false" })}
        isSaving={saveMutation.isPending}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" /> Informazioni Piattaforma</CardTitle>
          <CardDescription>Dettagli tecnici e credenziali API</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div>
              <p className="text-sm font-medium">Versione Piattaforma</p>
              <p className="text-xs text-muted-foreground">Edilizia in Cloud v1.0.0</p>
            </div>
          </div>
          <CopyField label="URL Progetto" value={supabaseUrl} />
          <CopyField label="Anon Key (pubblica)" value={anonKey} />
          <p className="text-xs text-muted-foreground">Queste credenziali sono pubbliche e possono essere usate per integrazioni API lato client.</p>
        </CardContent>
      </Card>
    </div>
  );
}
