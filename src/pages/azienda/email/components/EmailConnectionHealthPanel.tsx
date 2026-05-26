import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader2,
  MailCheck,
  Plug,
  RefreshCw,
  Settings2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EmailConnectionHealth = {
  consecutive_errors?: number | null;
  email_address: string | null;
  emails_fetched_total?: number | null;
  expires_at?: string | null;
  id: string | null;
  last_sync_error?: string | null;
  last_synced_at?: string | null;
  last_test_error?: string | null;
  last_test_ok?: boolean | null;
  poll_enabled?: boolean | null;
  poll_interval_minutes?: number | null;
  provider: string | null;
  provider_label?: string | null;
  status: string | null;
};

type DiagnosticResult = {
  ready?: boolean;
  checklist?: Record<string, {
    configured?: boolean;
    count?: number;
    error?: string;
    latency_ms?: number;
    missing?: string[];
    ok?: boolean;
    preview?: string | null;
    reachable?: boolean;
  }>;
  missing_steps?: string[];
  next_action?: string | null;
};

type SyncResult = {
  ai_triage_queued?: number;
  connections_checked?: number;
  duration_ms?: number;
  emails_fetched?: number;
  emails_stored?: number;
  errors?: Array<{ connection_id: string; error: string }>;
};

type EmailConnectionHealthPanelProps = {
  connections?: EmailConnectionHealth[];
  companyIdOverride?: string | null;
  loadError?: Error | null;
  settingsPath?: string;
  variant?: "full" | "compact";
};

function withPanelTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof window.setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

function providerLabel(provider: string | null | undefined, customLabel?: string | null) {
  const normalized = (customLabel || provider || "email").toLowerCase();
  if (normalized.includes("google") || normalized.includes("gmail")) return "Gmail";
  if (normalized.includes("outlook") || normalized.includes("microsoft")) return "Outlook";
  if (normalized.includes("imap")) return "IMAP/SMTP";
  return customLabel || provider || "Email";
}

function statusTone(connection: EmailConnectionHealth) {
  if (connection.status === "active" && (connection.consecutive_errors ?? 0) === 0) {
    return { label: "Attiva", cls: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 };
  }
  if (connection.status === "expired") {
    return { label: "Token scaduto", cls: "border-amber-200 bg-amber-50 text-amber-800", icon: AlertTriangle };
  }
  if (connection.status === "revoked") {
    return { label: "Revocata", cls: "border-slate-200 bg-slate-50 text-slate-700", icon: XCircle };
  }
  return { label: "Da controllare", cls: "border-rose-200 bg-rose-50 text-rose-700", icon: AlertTriangle };
}

function formatRelativeDate(value: string | null | undefined) {
  if (!value) return "mai";
  const when = new Date(value).getTime();
  if (!Number.isFinite(when)) return "data non valida";
  const diff = Date.now() - when;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "adesso";
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h fa`;
  return new Date(value).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

function bestSyncLabel(connections: EmailConnectionHealth[]) {
  const last = connections
    .map((connection) => connection.last_synced_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  return formatRelativeDate(last);
}

function normalizeConnections(rows: unknown): EmailConnectionHealth[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => row as EmailConnectionHealth).filter((row) => Boolean(row.id));
}

export function EmailConnectionHealthPanel({
  connections,
  companyIdOverride,
  loadError,
  settingsPath = "/azienda/impostazioni/mio-profilo",
  variant = "full",
}: EmailConnectionHealthPanelProps) {
  const { effectiveCompany, user } = useAuth();
  const companyId = companyIdOverride ?? effectiveCompany?.id;
  const userId = user?.id;
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(variant === "full");

  const fallbackConnections = useQuery({
    queryKey: ["email-connection-health-direct", companyId, userId],
    enabled: !connections && !!companyId && !!userId,
    staleTime: 30_000,
    retry: 0,
    queryFn: async () => {
      // Fallback diretto: evita che un problema sulla view lasci la pagina senza diagnosi.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await withPanelTimeout((supabase as any)
        .from("email_oauth_connections")
        .select("id, provider, provider_label, email_address, status, last_synced_at, last_sync_error, consecutive_errors, emails_fetched_total, poll_enabled, poll_interval_minutes, expires_at, last_test_ok, last_test_error")
        .eq("company_id", companyId!)
        .eq("user_id", userId!)
        .order("created_at", { ascending: false }), 5000, "Lettura diretta delle caselle troppo lenta.");
      if (error) throw error;
      return normalizeConnections(data);
    },
  });

  const diagnostic = useQuery({
    queryKey: ["email-oauth-diagnostic-inline", companyId],
    enabled: false,
    staleTime: 60_000,
    retry: 0,
    queryFn: async () => {
      const { data, error } = await withPanelTimeout(
        supabase.functions.invoke<DiagnosticResult>("email-oauth-diagnostic"),
        8000,
        "Diagnostica OAuth troppo lenta.",
      );
      if (error) throw error;
      return data ?? {};
    },
  });

  const invalidateEmail = () => {
    queryClient.invalidateQueries({ queryKey: ["my-email-connections"] });
    queryClient.invalidateQueries({ queryKey: ["email-client-connections"] });
    queryClient.invalidateQueries({ queryKey: ["email-oauth-connections"] });
    queryClient.invalidateQueries({ queryKey: ["email-connection-health-direct"] });
    queryClient.invalidateQueries({ queryKey: ["email-ai-command-center"] });
    queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
    queryClient.invalidateQueries({ queryKey: ["email-threads"] });
    queryClient.invalidateQueries({ queryKey: ["email-thread-messages"] });
  };

  const syncInbox = useMutation({
    mutationFn: async (connectionId?: string | null) => {
      const { data, error } = await withPanelTimeout(
        supabase.functions.invoke<SyncResult>("email-poll-inbox", {
          body: {
            source: "manual_email_client",
            connection_id: connectionId || undefined,
          },
        }),
        25_000,
        "Sync email troppo lenta. Controlla lo stato della casella o riprova.",
      );
      if (error) throw error;

      const triage = await supabase.functions.invoke<{ ok?: boolean; processed?: number; error?: string }>("email-ai-assistant", {
        body: {
          action: "triage_inbox",
          company_id: companyId,
          limit: 80,
        },
      });
      if (triage.error) throw triage.error;
      if (triage.data?.ok === false) throw new Error(triage.data.error ?? "Smistamento AI non riuscito");

      return {
        sync: data ?? {},
        triage: triage.data ?? {},
      };
    },
    onSuccess: ({ sync, triage }) => {
      invalidateEmail();
      const stored = Number(sync.emails_stored ?? 0);
      const processed = Number(triage.processed ?? 0);
      toast.success("Email aggiornate", {
        description: `${stored} nuove email salvate, ${processed} classificate dalla Regia AI.`,
      });
    },
    onError: (error: Error) => {
      toast.error("Sync email non riuscito", { description: error.message });
    },
  });

  const rows = connections ?? fallbackConnections.data ?? [];
  const hasLoadIssue = Boolean(loadError || fallbackConnections.error);
  const unhealthy = rows.filter((connection) =>
    connection.status !== "active"
    || (connection.consecutive_errors ?? 0) > 0
    || Boolean(connection.last_sync_error)
    || connection.poll_enabled === false,
  );
  const active = rows.filter((connection) => connection.status === "active").length;
  const fetchedTotal = rows.reduce((sum, connection) => sum + Number(connection.emails_fetched_total ?? 0), 0);
  const panelTitle = rows.length > 0
    ? `${active}/${rows.length} caselle attive`
    : "Nessuna casella collegata";

  const diagRows = useMemo(() => Object.entries(diagnostic.data?.checklist ?? {}), [diagnostic.data]);
  const compactHealthy = variant === "compact" && rows.length > 0 && unhealthy.length === 0 && !hasLoadIssue;

  return (
    <div className={cn(
      "rounded-2xl border bg-white shadow-sm",
      compactHealthy ? "border-emerald-100" : "border-blue-100",
      variant === "compact" ? "mx-3 my-2" : "",
      // Mobile: nascondo il panel quando tutto è sano per risparmiare spazio verticale
      compactHealthy && "hidden md:block",
    )}>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 p-3 text-left"
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="flex min-w-0 items-start gap-2">
          <span className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white",
            unhealthy.length > 0 || hasLoadIssue ? "bg-amber-600" : rows.length > 0 ? "bg-emerald-600" : "bg-blue-600",
          )}>
            {unhealthy.length > 0 || hasLoadIssue ? <AlertTriangle className="h-4 w-4" /> : <MailCheck className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-950">{panelTitle}</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">
              {rows.length > 0
                ? `Ultimo sync ${bestSyncLabel(rows)} · ${fetchedTotal} email lette`
                : "Collega Gmail, Outlook o IMAP per attivare sync, Regia AI e risposte assistite."}
            </p>
            {(loadError || fallbackConnections.error) && (
              <p className="mt-1 line-clamp-2 text-[11px] font-medium text-amber-700">
                {(loadError ?? fallbackConnections.error as Error)?.message}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {unhealthy.length > 0 && (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-800">
              {unhealthy.length} avvisi
            </Badge>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-blue-50 p-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 rounded-xl bg-blue-600 text-xs hover:bg-blue-700"
              onClick={() => syncInbox.mutate(null)}
              disabled={syncInbox.isPending || rows.length === 0}
            >
              {syncInbox.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync + AI
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 rounded-xl border-blue-200 text-xs"
              onClick={() => void diagnostic.refetch()}
              disabled={diagnostic.isFetching}
            >
              {diagnostic.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Diagnostica
            </Button>
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 rounded-xl border-blue-200 text-xs">
              <Link to={settingsPath}>
                <Settings2 className="h-3.5 w-3.5" />
                Impostazioni
              </Link>
            </Button>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-blue-100 bg-blue-50/50 p-3 text-xs leading-5 text-slate-600">
              <div className="flex items-start gap-2">
                <Plug className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <span>
                  Nessun account email personale è leggibile per questo utente. Se hai già collegato una casella, usa la diagnostica:
                  controlla RLS, company utente, stato token e funzioni Edge.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((connection) => {
                const tone = statusTone(connection);
                const StatusIcon = tone.icon;
                return (
                  <div key={connection.id ?? connection.email_address} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">{connection.email_address || "Casella senza email"}</p>
                          <Badge variant="outline" className={cn("h-5 rounded-full px-2 text-[10px]", tone.cls)}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {tone.label}
                          </Badge>
                          <Badge variant="outline" className="h-5 rounded-full border-blue-100 bg-white px-2 text-[10px] text-blue-700">
                            {providerLabel(connection.provider, connection.provider_label)}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3 w-3" />
                            Sync {formatRelativeDate(connection.last_synced_at)}
                          </span>
                          <span>{connection.emails_fetched_total ?? 0} email lette</span>
                          <span>Polling {connection.poll_enabled === false ? "spento" : `${connection.poll_interval_minutes ?? 10} min`}</span>
                        </div>
                        {(connection.last_sync_error || connection.last_test_error) && (
                          <p className="mt-2 rounded-lg border border-amber-100 bg-white px-2 py-1.5 text-[11px] leading-4 text-amber-800">
                            {connection.last_sync_error || connection.last_test_error}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 rounded-xl border-blue-200 text-xs"
                        onClick={() => syncInbox.mutate(connection.id)}
                        disabled={syncInbox.isPending || !connection.id}
                      >
                        {syncInbox.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Sync
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {diagnostic.data && (
            <div className={cn(
              "rounded-xl border p-3",
              diagnostic.data.ready ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50",
            )}>
              <p className={cn(
                "text-xs font-bold",
                diagnostic.data.ready ? "text-emerald-800" : "text-amber-800",
              )}>
                {diagnostic.data.ready ? "Setup email pronto" : "Setup email da completare"}
              </p>
              {diagnostic.data.next_action && (
                <p className="mt-1 text-[11px] leading-4 text-slate-600">{diagnostic.data.next_action}</p>
              )}
              {diagRows.length > 0 && (
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {diagRows.slice(0, 8).map(([key, value]) => {
                    const ok = value.configured ?? value.reachable ?? value.ok ?? false;
                    return (
                      <div key={key} className="flex items-start gap-1.5 rounded-lg bg-white/70 px-2 py-1.5 text-[10px] text-slate-600">
                        {ok ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-600" />}
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-700">{key}</span>
                          {value.error && <span className="line-clamp-2">{value.error}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
