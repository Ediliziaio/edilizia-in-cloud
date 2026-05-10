/**
 * EmailOAuthConnectionsCard — GAP 7b
 *
 * Card per /azienda/impostazioni/integrazioni che permette al company_admin di:
 *   - Connettere Gmail / Outlook con OAuth (chiama email-oauth-start → redirect)
 *   - Vedere lista connessioni attive (email, status, last_synced_at, errori)
 *   - Disconnettere account (delete row)
 *   - Pollare manualmente (force sync)
 *
 * Multi-account supportato: una company può avere info@ + sales@ + admin@.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Loader2, Mail, Plug, Plus, RefreshCw, Server, Settings, Trash2, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ImapCustomDialog } from "./ImapCustomDialog";

interface OAuthConnectionMeta {
  id: string;
  provider: "gmail" | "outlook";
  email_address: string;
  status: "active" | "expired" | "revoked" | "error";
  last_synced_at: string | null;
  last_sync_error: string | null;
  consecutive_errors: number;
  emails_fetched_total: number;
  poll_interval_minutes: number;
  expires_at: string | null;
  created_at: string;
}

interface DiagnosticResult {
  ready: boolean;
  checklist: Record<string, { configured?: boolean; reachable?: boolean; ok?: boolean; preview?: string | null; error?: string; latency_ms?: number; count?: number; missing?: string[] }>;
  missing_steps: string[];
  next_action: string | null;
}

const PROVIDER_LABEL: Record<string, { name: string; color: string }> = {
  gmail: { name: "Gmail (Google)", color: "bg-rose-100 text-rose-700 border-rose-300" },
  outlook: { name: "Outlook (Microsoft)", color: "bg-blue-100 text-blue-700 border-blue-300" },
  imap: { name: "IMAP/SMTP", color: "bg-violet-100 text-violet-700 border-violet-300" },
};

const STATUS_BADGE: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active:  { label: "Attivo",     color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: CheckCircle2 },
  expired: { label: "Scaduto",    color: "bg-amber-100 text-amber-700 border-amber-300", icon: AlertCircle },
  revoked: { label: "Revocato",   color: "bg-slate-100 text-slate-700 border-slate-300", icon: XCircle },
  error:   { label: "Errore",     color: "bg-rose-100 text-rose-700 border-rose-300", icon: AlertCircle },
};

interface EmailOAuthConnectionsCardProps {
  /**
   * 'company' (default): mostra TUTTE le email connesse dell'azienda — vista
   * admin in /azienda/impostazioni/integrazioni.
   * 'user': mostra SOLO le email connesse dall'utente corrente — vista
   * personale in /azienda/impostazioni/mio-profilo.
   */
  scope?: "company" | "user";
}

export function EmailOAuthConnectionsCard({ scope = "company" }: EmailOAuthConnectionsCardProps = {}) {
  const qc = useQueryClient();
  const { effectiveCompany, user } = useAuth();
  const userId = user?.id ?? null;
  const isUserScope = scope === "user";
  const [connecting, setConnecting] = useState<"gmail" | "outlook" | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [imapDialogOpen, setImapDialogOpen] = useState(false);

  // 🆕 Diagnostica setup OAuth (mostra cosa manca SE non tutto è configurato)
  const { data: diag, refetch: refetchDiag } = useQuery({
    queryKey: ["email-oauth-diagnostic", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<DiagnosticResult | null> => {
      const { data, error } = await supabase.functions.invoke<DiagnosticResult>(
        "email-oauth-diagnostic",
      );
      if (error) return null;
      return data ?? null;
    },
    retry: 0,
  });

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["email-oauth-connections", effectiveCompany?.id, scope, userId],
    enabled: !!effectiveCompany?.id && (!isUserScope || !!userId),
    queryFn: async (): Promise<OAuthConnectionMeta[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("v_email_oauth_connections_meta")
        .select("id, provider, email_address, status, last_synced_at, last_sync_error, consecutive_errors, emails_fetched_total, poll_interval_minutes, expires_at, created_at, user_id")
        .eq("company_id", effectiveCompany!.id);
      if (isUserScope && userId) {
        q = q.eq("user_id", userId);
      }
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OAuthConnectionMeta[];
    },
  });

  const startOAuth = useMutation({
    mutationFn: async (provider: "gmail" | "outlook") => {
      setConnecting(provider);
      const redirectUri = `${window.location.origin}/azienda/impostazioni/integrazioni/email-callback`;
      const { data, error } = await supabase.functions.invoke<{ auth_url: string; state: string; error?: string }>(
        "email-oauth-start",
        { body: { provider, redirect_uri: redirectUri } },
      );
      if (error || !data?.auth_url) {
        throw new Error(data?.error ?? error?.message ?? "Errore nell'avvio OAuth");
      }
      // Salva state in sessionStorage per re-check lato callback
      sessionStorage.setItem("oauth_state", data.state);
      sessionStorage.setItem("oauth_provider", provider);
      // Redirect a Google/Microsoft
      window.location.href = data.auth_url;
    },
    onError: (e) => {
      setConnecting(null);
      toast.error("Errore connessione", { description: e instanceof Error ? e.message : String(e) });
    },
  });

  const disconnect = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("email_oauth_connections")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Connessione rimossa");
      void qc.invalidateQueries({ queryKey: ["email-oauth-connections"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const forceSync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("email-poll-inbox", {
        body: { source: "manual_force" },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toast.success("Sync forzato lanciato — refresh tra 10-30s");
      void qc.invalidateQueries({ queryKey: ["email-oauth-connections"] });
    },
    onError: (e) => toast.error("Errore sync", { description: String(e) }),
  });

  return (
    <Card className="border-violet-200 dark:border-violet-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-violet-600" />
          {isUserScope ? "Le mie email collegate" : "Email Triage AI — Account connessi"}
        </CardTitle>
        <CardDescription className="text-xs">
          {isUserScope
            ? "Collega il TUO Gmail o Outlook personale: l'AI legge le tue email in arrivo, le classifica per priorità e suggerisce azioni. Polling automatico ogni 10 minuti, sempre filtrato sul tuo account."
            : "Collega Gmail o Outlook: l'AI legge le email in arrivo, le classifica per priorità (alta/media/bassa) e suggerisce azioni (lead nuovo / fattura / ticket / pratica). Polling automatico ogni 10 minuti."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 🆕 Setup diagnostic — visibile solo SE setup non completo */}
        {diag && !diag.ready && (
          <div className="rounded-lg border border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900 p-3 space-y-2">
            <button
              type="button"
              onClick={() => setDiagOpen(!diagOpen)}
              className="w-full flex items-center justify-between gap-2 text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Setup OAuth non completo · {diag.missing_steps.length} step{diag.missing_steps.length === 1 ? "" : "s"} mancante
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 truncate">
                    {diag.next_action ?? "Vedi dettagli"}
                  </p>
                </div>
              </div>
              {diagOpen ? <ChevronDown className="h-4 w-4 text-amber-600" /> : <ChevronRight className="h-4 w-4 text-amber-600" />}
            </button>
            {diagOpen && (
              <div className="space-y-1.5 pt-2 border-t border-amber-200 dark:border-amber-900">
                {Object.entries(diag.checklist).map(([key, val]) => {
                  const ok = val.configured ?? val.reachable ?? val.ok ?? false;
                  return (
                    <div key={key} className="flex items-start gap-2 text-xs">
                      {ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-rose-600 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <code className="bg-background px-1 rounded text-[10px]">{key}</code>
                        {val.preview ? <span className="ml-1 text-muted-foreground">({val.preview})</span> : null}
                        {val.latency_ms != null ? <span className="ml-1 text-muted-foreground">({val.latency_ms}ms)</span> : null}
                        {val.error ? (
                          <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5">{val.error}</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">
                    Vedi <code className="bg-background px-1 rounded">scripts/SETUP-EMAIL-OAUTH.md</code> per la guida completa
                  </p>
                  <button
                    type="button"
                    onClick={() => refetchDiag()}
                    className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Re-check
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {diag?.ready && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50/30 dark:bg-emerald-950/10 dark:border-emerald-900 p-2 flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-800 dark:text-emerald-300">
              Setup OAuth completo. Pronto per connettere account.
            </p>
            <button
              type="button"
              onClick={() => setDiagOpen(!diagOpen)}
              className="ml-auto text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <Settings className="h-3 w-3" />
              Diagnostica
            </button>
          </div>
        )}

        {/* Bottoni connect */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => startOAuth.mutate("gmail")}
            disabled={!!connecting}
            variant="outline"
            className="gap-2"
          >
            {connecting === "gmail" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Connetti Gmail
          </Button>
          <Button
            onClick={() => startOAuth.mutate("outlook")}
            disabled={!!connecting}
            variant="outline"
            className="gap-2"
          >
            {connecting === "outlook" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Connetti Outlook
          </Button>
          <Button
            onClick={() => setImapDialogOpen(true)}
            variant="outline"
            className="gap-2"
            title="Per Aruba, Libero, iCloud, Yahoo, Register o server custom"
          >
            <Server className="h-4 w-4" />
            Altro provider (IMAP)
          </Button>
          {connections.length > 0 && (
            <Button
              onClick={() => forceSync.mutate()}
              disabled={forceSync.isPending}
              variant="ghost"
              size="sm"
              className="gap-2 ml-auto"
              title="Forza sync immediato di tutti gli account"
            >
              {forceSync.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync ora
            </Button>
          )}
        </div>

        {/* Lista connessioni */}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : connections.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-muted-foreground">
            <Plug className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nessun account email connesso.</p>
            <p className="text-xs mt-1">Clicca "Connetti Gmail" o "Connetti Outlook" sopra per iniziare.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {connections.map((c) => {
              const provider = PROVIDER_LABEL[c.provider];
              const status = STATUS_BADGE[c.status];
              const StatusIcon = status.icon;
              return (
                <div key={c.id} className="rounded-lg border p-3 flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{c.email_address}</span>
                      <Badge variant="outline" className={cn("text-[10px]", provider.color)}>
                        {provider.name}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[10px] gap-1", status.color)}>
                        <StatusIcon className="h-2.5 w-2.5" />
                        {status.label}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground space-x-2">
                      <span>{c.emails_fetched_total} email totali</span>
                      <span>·</span>
                      <span>
                        Ultimo sync: {c.last_synced_at
                          ? new Date(c.last_synced_at).toLocaleString("it-IT", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })
                          : "mai"}
                      </span>
                      <span>·</span>
                      <span>polling ogni {c.poll_interval_minutes} min</span>
                    </div>
                    {c.last_sync_error && (
                      <p className="text-[10px] text-rose-700 dark:text-rose-400">
                        Errore: {c.last_sync_error}
                        {c.consecutive_errors >= 3 ? ` (${c.consecutive_errors} consecutivi)` : ""}
                      </p>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Disconnettere ${c.email_address}? L'AI non leggerà più le email da questo account.`)) {
                        disconnect.mutate(c.id);
                      }
                    }}
                    disabled={disconnect.isPending}
                    title="Disconnetti"
                  >
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      <ImapCustomDialog open={imapDialogOpen} onOpenChange={setImapDialogOpen} />
    </Card>
  );
}

export default EmailOAuthConnectionsCard;
