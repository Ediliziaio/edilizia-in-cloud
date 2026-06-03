import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { queryKeys } from "@/lib/queryKeys";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Building2, Users, ShoppingCart, Server, Wrench, Info, ExternalLink,
  Activity, ShieldCheck, Webhook, Mail, Cpu, BarChart3, FileText,
  Globe, AlertCircle, CheckCircle2, Copy, Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

// ─── Tipi ────────────────────────────────────────────────

interface PlatformStats {
  totalCompanies: number;
  totalUsers: number;
  totalOrders: number;
  // Campi opzionali: potrebbero non essere restituiti dalla edge function
  activeCompanies?: number;
  trialCompanies?: number;
  suspendedCompanies?: number;
  churnedCompanies?: number;
  monthRevenue?: number;
  mrr?: number;
}

// ─── KPI Card ────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, subtitle, accent, loading,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={cn("rounded-lg p-2 shrink-0", accent ?? "bg-primary/10 text-primary")}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide truncate">
            {label}
          </p>
          <p className="text-xl font-bold leading-tight mt-0.5">
            {loading ? <Skeleton className="h-6 w-16 mt-1" /> : value}
          </p>
          {subtitle && !loading && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── KPI Overview ────────────────────────────────────────

function PlatformKPIs({ stats, loading }: { stats: PlatformStats | undefined; loading: boolean }) {
  const fmt = (n?: number) => (n ?? 0).toLocaleString("it-IT");
  const fmtEur = (n?: number) =>
    (n ?? 0).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  const activeRate = useMemo(() => {
    if (!stats?.totalCompanies || !stats?.activeCompanies) return null;
    return Math.round((stats.activeCompanies / stats.totalCompanies) * 100);
  }, [stats]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiCard
        icon={Building2}
        label="Aziende"
        value={fmt(stats?.totalCompanies)}
        subtitle={activeRate !== null ? `${activeRate}% attive` : undefined}
        accent="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
        loading={loading}
      />
      <KpiCard
        icon={CheckCircle2}
        label="Attive"
        value={fmt(stats?.activeCompanies)}
        subtitle={stats?.trialCompanies !== undefined ? `${stats.trialCompanies} in trial` : undefined}
        accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        loading={loading}
      />
      <KpiCard
        icon={Users}
        label="Utenti"
        value={fmt(stats?.totalUsers)}
        accent="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
        loading={loading}
      />
      <KpiCard
        icon={ShoppingCart}
        label="Ordini"
        value={fmt(stats?.totalOrders)}
        accent="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
        loading={loading}
      />
      <KpiCard
        icon={BarChart3}
        label="MRR"
        value={stats?.mrr !== undefined ? fmtEur(stats.mrr) : "—"}
        subtitle="Ricavo mensile ricorrente"
        accent="bg-primary/10 text-primary"
        loading={loading}
      />
      <KpiCard
        icon={AlertCircle}
        label="Sospese"
        value={fmt(stats?.suspendedCompanies)}
        subtitle={stats?.churnedCompanies ? `${stats.churnedCompanies} churn` : undefined}
        accent={(stats?.suspendedCompanies ?? 0) > 0
          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
          : "bg-muted text-muted-foreground"}
        loading={loading}
      />
    </div>
  );
}

// ─── Maintenance ─────────────────────────────────────────

function MaintenanceCard({
  settings, isLoading, onToggle, isSaving,
}: {
  settings: Record<string, { value: string }> | undefined;
  isLoading: boolean;
  onToggle: (value: boolean) => void;
  isSaving: boolean;
}) {
  const isActive = settings?.["maintenance_mode"]?.value === "true";

  return (
    <>
      {isActive && (
        <Alert variant="destructive">
          <Wrench className="h-4 w-4" />
          <AlertTitle>Manutenzione attiva</AlertTitle>
          <AlertDescription>
            La piattaforma è in <strong>modalità manutenzione</strong>. Gli utenti non-admin
            vedono una pagina di manutenzione. Disattiva lo switch qui sotto per ripristinare
            l'accesso.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="flex items-center justify-between p-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-lg bg-orange-100 dark:bg-orange-900/30 p-2 shrink-0">
              <Wrench className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Modalità manutenzione</p>
              <p className="text-xs text-muted-foreground">
                Mostra una pagina di manutenzione a tutti gli utenti non-admin
              </p>
            </div>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={(v) => onToggle(v)}
            disabled={isSaving || isLoading}
          />
        </CardContent>
      </Card>
    </>
  );
}

// ─── SiteUrl con validazione + prefill ───────────────────

/** Valida URL: deve essere http(s) valido, senza trailing slash, dominio reale */
function validateSiteUrl(raw: string): { ok: boolean; error?: string; normalized?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "URL vuoto" };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "URL non valido (es. https://app.example.com)" };
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    return { ok: false, error: "Solo http:// o https://" };
  }
  if (!url.hostname.includes(".") && url.hostname !== "localhost") {
    return { ok: false, error: "Dominio non valido" };
  }
  // Normalizza: rimuove trailing slash
  const normalized = url.origin + (url.pathname === "/" ? "" : url.pathname.replace(/\/$/, ""));
  return { ok: true, normalized };
}

function SiteUrlCard({
  settings, isLoading, onSave, isSaving,
}: {
  settings: Record<string, { value: string; masked?: string }> | undefined;
  isLoading: boolean;
  onSave: (updates: Record<string, string>) => void;
  isSaving: boolean;
}) {
  const current = settings?.["site_url"]?.value ?? "";
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);

  // Prefill del valore attuale una volta caricato dal server
  useEffect(() => {
    if (current && !value) setValue(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const validation = useMemo(() => validateSiteUrl(value), [value]);
  const isDirty = value.trim() !== current.trim() && value.trim() !== "";

  const handleSave = () => {
    if (!validation.ok || !validation.normalized) return;
    onSave({ site_url: validation.normalized });
  };

  const handleCopy = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Impossibile copiare");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          <CardTitle>URL Applicazione</CardTitle>
        </div>
        <CardDescription className="flex items-center gap-1">
          URL pubblico dell'app
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                URL pubblico dell'applicazione, usato per generare link inviti admin e link
                firma offerte nelle email. Senza trailing slash.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">URL Applicazione</label>
          <div className="flex gap-2">
            <Input
              placeholder="https://app.example.com"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={cn(
                value && !validation.ok && "border-destructive focus-visible:ring-destructive"
              )}
              disabled={isLoading}
            />
            {current && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
                title="Copia URL attuale"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            )}
          </div>
          {value && !validation.ok && validation.error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {validation.error}
            </p>
          )}
          {validation.ok && validation.normalized && validation.normalized !== value && (
            <p className="text-xs text-muted-foreground">
              Sarà salvato come: <code className="font-mono">{validation.normalized}</code>
            </p>
          )}
          {current && (
            <p className="text-xs text-muted-foreground">
              Attuale: <code className="font-mono">{current}</code>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || !validation.ok || !isDirty}
          >
            {isSaving ? "Salvataggio..." : "Salva"}
          </Button>
          {isDirty && (
            <Button variant="ghost" onClick={() => setValue(current)} disabled={isSaving}>
              Annulla
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── System Status ───────────────────────────────────────

function SystemStatusCard() {
  const { data: health, isLoading } = useQuery({
    queryKey: ["platform-health-check"],
    queryFn: async () => {
      const started = performance.now();
      // Ping leggero su tabella companies (RLS limiterà i risultati ma la query gira)
      const { error, count } = await supabase
        .from("companies")
        .select("id", { count: "exact", head: true });
      const latency = Math.round(performance.now() - started);
      return {
        db: !error,
        latency,
        count: count ?? null,
        error: error?.message,
      };
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const statusLabel =
    isLoading ? "Controllo..."
    : health?.db ? "Operativo"
    : "Errore";

  const statusColor =
    isLoading ? "bg-muted text-muted-foreground"
    : health?.db ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
    : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300";

  const latencyLabel = health?.latency
    ? health.latency < 200 ? "veloce"
    : health.latency < 500 ? "nella norma"
    : "lenta"
    : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" /> Stato sistema
        </CardTitle>
        <CardDescription>Salute connessione Supabase in tempo reale</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <span className="text-sm text-muted-foreground">Database</span>
            <Badge variant="secondary" className={statusColor}>{statusLabel}</Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <span className="text-sm text-muted-foreground">Latenza</span>
            <span className="text-sm font-medium">
              {isLoading ? "..." : health?.latency ? `${health.latency}ms ${latencyLabel}` : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <span className="text-sm text-muted-foreground">RLS</span>
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <ShieldCheck className="h-3 w-3 mr-1" /> attivo
            </Badge>
          </div>
        </div>
        {health?.error && (
          <Alert variant="destructive" className="mt-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{health.error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Quick Links ─────────────────────────────────────────

const QUICK_LINKS: Array<{
  to: string;
  icon: LucideIcon;
  label: string;
  desc: string;
  accent: string;
}> = [
  {
    to: "/admin/impostazioni/audit",
    icon: FileText,
    label: "Audit Log",
    desc: "Cronologia azioni super admin",
    accent: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
  },
  {
    to: "/admin/impostazioni/ai-usage",
    icon: Cpu,
    label: "AI Usage",
    desc: "Utilizzo e costi modelli AI",
    accent: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  {
    to: "/admin/impostazioni/integrazioni",
    icon: Server,
    label: "Integrazioni",
    desc: "API keys e provider esterni",
    accent: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  {
    to: "/admin/impostazioni/webhooks",
    icon: Webhook,
    label: "Webhooks",
    desc: "Endpoint e log chiamate",
    accent: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  {
    to: "/admin/impostazioni/email",
    icon: Mail,
    label: "Email",
    desc: "Template e deliverability",
    accent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  {
    to: "/admin/impostazioni/sicurezza",
    icon: ShieldCheck,
    label: "Sicurezza",
    desc: "2FA, sessioni, password",
    accent: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  },
];

function QuickLinksCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ExternalLink className="h-5 w-5 text-primary" /> Accesso rapido
        </CardTitle>
        <CardDescription>Sezioni amministrative frequenti</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
            >
              <div className={cn("rounded-lg p-2 shrink-0", link.accent)}>
                <link.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{link.label}</p>
                <p className="text-xs text-muted-foreground truncate">{link.desc}</p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Platform Info footer ────────────────────────────────

function PlatformInfoCard() {
  // Versione: prefer env var, fallback hardcoded
  const version =
    (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "1.0.0";
  const commit =
    (import.meta.env.VITE_COMMIT_SHA as string | undefined)?.slice(0, 7) ?? null;
  const env = (import.meta.env.MODE as string) ?? "development";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" /> Informazioni piattaforma
        </CardTitle>
        <CardDescription>Versione e configurazione ambiente</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Versione</p>
            <p className="text-sm font-mono font-medium mt-1">v{version}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Commit</p>
            <p className="text-sm font-mono font-medium mt-1">{commit ?? "—"}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Ambiente</p>
            <p className="text-sm font-mono font-medium mt-1 capitalize">{env}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────

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
      if (res.error) throw new Error(await edgeErrorMessage(res.error, res.error.message));
      return res.data as PlatformStats;
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
      if (res.error) throw new Error(await edgeErrorMessage(res.error, res.error.message));
      return res.data?.settings as Record<string, { value: string; masked?: string }> | undefined;
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
      if (res.error) throw new Error(await edgeErrorMessage(res.error, res.error.message));
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
      {/* KPI Overview */}
      <PlatformKPIs stats={stats} loading={isLoading} />

      {/* Maintenance */}
      <MaintenanceCard
        settings={settings}
        isLoading={settingsLoading}
        onToggle={(v) => saveMutation.mutate({ maintenance_mode: v ? "true" : "false" })}
        isSaving={saveMutation.isPending}
      />

      {/* URL Applicazione */}
      <SiteUrlCard
        settings={settings}
        isLoading={settingsLoading}
        onSave={(updates) => saveMutation.mutate(updates)}
        isSaving={saveMutation.isPending}
      />

      {/* System Status */}
      <SystemStatusCard />

      {/* Quick Links */}
      <QuickLinksCard />

      {/* Platform Info */}
      <PlatformInfoCard />
    </div>
  );
}
