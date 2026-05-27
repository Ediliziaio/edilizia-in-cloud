/**
 * EmailOAuthConnectionsCard — GAP 7b
 *
 * Card personale per connettere Gmail / Outlook / IMAP:
 *   - Connettere Gmail / Outlook con OAuth (chiama email-oauth-start → redirect)
 *   - Vedere solo le connessioni attive dell'utente corrente
 *   - Disconnettere account (delete row)
 *   - Pollare manualmente (force sync)
 *
 * Multi-account supportato per utente. Se due utenti collegano la stessa
 * casella, ognuno vede e gestisce solo la propria connessione.
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
  AlertCircle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Inbox, Loader2, Mail, Plug, RefreshCw, Server, Settings, Sparkles, Trash2, XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ImapCustomDialog } from "./ImapCustomDialog";

// Brand SVG icons per Gmail / Outlook / IMAP (no extra deps)
function GmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
      <path d="M5.455 4.64L12 9.548V11.73L5.455 4.64z" fill="#FBBC04"/>
      <path d="M18.546 4.64v7.092L12 16.642V9.548l6.546-4.91z" fill="#34A853"/>
      <path d="M5.455 11.73L12 16.64V9.548L5.455 4.64v7.09z" fill="#4285F4"/>
    </svg>
  );
}

function OutlookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 4.5v15c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5V18l8.5-2.5c.276-.083.5-.337.5-.625v-5.75c0-.288-.224-.542-.5-.625L14 6V4.5c0-.276-.224-.5-.5-.5H.5C.224 4 0 4.224 0 4.5z" fill="#0078D4"/>
      <circle cx="7" cy="12" r="3.5" fill="#fff"/>
      <text x="7" y="13.5" fontSize="4" fontWeight="bold" textAnchor="middle" fill="#0078D4">O</text>
    </svg>
  );
}

function ImapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 8l9 7 9-7" />
    </svg>
  );
}

interface OAuthConnectionMeta {
  id: string;
  provider: "gmail" | "outlook" | "imap";
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

const PROVIDER_LABEL: Record<string, { name: string; color: string; Icon: (props: { className?: string }) => JSX.Element }> = {
  gmail: { name: "Gmail (Google)", color: "bg-rose-100 text-rose-700 border-rose-300", Icon: GmailIcon },
  outlook: { name: "Outlook (Microsoft)", color: "bg-blue-100 text-blue-700 border-blue-300", Icon: OutlookIcon },
  imap: { name: "IMAP/SMTP", color: "bg-violet-100 text-violet-700 border-violet-300", Icon: ImapIcon },
};

const STATUS_BADGE: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active:  { label: "Attivo",     color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: CheckCircle2 },
  expired: { label: "Scaduto",    color: "bg-amber-100 text-amber-700 border-amber-300", icon: AlertCircle },
  revoked: { label: "Revocato",   color: "bg-slate-100 text-slate-700 border-slate-300", icon: XCircle },
  error:   { label: "Errore",     color: "bg-rose-100 text-rose-700 border-rose-300", icon: AlertCircle },
};

export function EmailOAuthConnectionsCard() {
  const qc = useQueryClient();
  const { effectiveCompany, user } = useAuth();
  const userId = user?.id ?? null;
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
    queryKey: ["email-oauth-connections", effectiveCompany?.id, userId],
    enabled: !!effectiveCompany?.id && !!userId,
    queryFn: async (): Promise<OAuthConnectionMeta[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = (supabase as any)
        .from("v_email_oauth_connections_meta")
        .select("id, provider, email_address, status, last_synced_at, last_sync_error, consecutive_errors, emails_fetched_total, poll_interval_minutes, expires_at, created_at, user_id")
        .eq("company_id", effectiveCompany!.id)
        .eq("user_id", userId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OAuthConnectionMeta[];
    },
  });

  const startOAuth = useMutation({
    mutationFn: async (provider: "gmail" | "outlook") => {
      if (!effectiveCompany?.id) {
        throw new Error("Azienda attiva non disponibile");
      }
      setConnecting(provider);
      // Callback path dinamico: se siamo in /admin/* usa l'admin callback,
      // altrimenti quello azienda. Evita "context jumping" del routing dopo
      // il return da Google/Microsoft.
      const isAdminContext = window.location.pathname.startsWith("/admin/");
      const callbackPath = isAdminContext
        ? "/admin/impostazioni/integrazioni/email-callback"
        : "/azienda/impostazioni/integrazioni/email-callback";
      const redirectUri = `${window.location.origin}${callbackPath}`;
      const { data, error } = await supabase.functions.invoke<{ auth_url: string; state: string; error?: string }>(
        "email-oauth-start",
        { body: { provider, redirect_uri: redirectUri, company_id: effectiveCompany.id } },
      );
      if (error || !data?.auth_url) {
        throw new Error(data?.error ?? error?.message ?? "Errore nell'avvio OAuth");
      }
      // Salva state in sessionStorage per re-check lato callback
      sessionStorage.setItem("oauth_state", data.state);
      sessionStorage.setItem("oauth_provider", provider);
      sessionStorage.setItem("email_oauth_return_to", `${window.location.pathname}${window.location.search}`);
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
      if (!effectiveCompany?.id || !userId) {
        throw new Error("Sessione utente non disponibile");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("email_oauth_connections")
        .delete()
        .eq("id", id)
        .eq("company_id", effectiveCompany!.id)
        .eq("user_id", userId);
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
    onSuccess: (data) => {
      const stored = typeof data === "object" && data && "emails_stored" in data
        ? Number((data as { emails_stored?: number }).emails_stored ?? 0)
        : null;
      toast.success("Sync completato", {
        description: stored == null ? "Aggiorno la lista email." : `${stored} nuove email salvate nel client personale.`,
      });
      void qc.invalidateQueries({ queryKey: ["email-oauth-connections"] });
      void qc.invalidateQueries({ queryKey: ["email-client-connections"] });
      void qc.invalidateQueries({ queryKey: ["email-threads"] });
      void qc.invalidateQueries({ queryKey: ["email-folder-counts"] });
    },
    onError: (e) => toast.error("Errore sync", { description: String(e) }),
  });

  return (
    <Card className="border-violet-200 dark:border-violet-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-violet-600" />
          Le mie email collegate
        </CardTitle>
        <CardDescription className="text-xs">
          Collega il tuo Gmail, Outlook o IMAP personale: le connessioni sono visibili solo a te.
          Se un collega collega la stessa casella, avrà una connessione separata sul suo utente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Hero AI: cosa fa l'AI con le tue email */}
        <div className="rounded-lg border border-orange-200 bg-gradient-to-br from-orange-50/60 via-amber-50/40 to-white p-3">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 shadow-sm">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900">Cosa fa l'AI con le tue email</p>
              <ul className="mt-1 grid gap-0.5 text-[11px] text-slate-600 sm:grid-cols-2">
                <li className="flex items-start gap-1">
                  <span className="text-emerald-600">✓</span>
                  <span>Triage automatico ticket (priorità + categoria)</span>
                </li>
                <li className="flex items-start gap-1">
                  <span className="text-emerald-600">✓</span>
                  <span>Bozze risposta intelligenti</span>
                </li>
                <li className="flex items-start gap-1">
                  <span className="text-emerald-600">✓</span>
                  <span>Riepiloghi thread lunghi</span>
                </li>
                <li className="flex items-start gap-1">
                  <span className="text-emerald-600">✓</span>
                  <span>Task & azioni operative</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

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
                <div className="pt-2 border-t border-amber-200 dark:border-amber-900">
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    💡 Nel frattempo puoi comunque collegare la tua casella usando{" "}
                    <button
                      type="button"
                      onClick={() => setImapDialogOpen(true)}
                      className="underline font-medium hover:text-amber-900"
                    >
                      Altro provider (IMAP)
                    </button>{" "}
                    — funziona con Aruba, Libero, iCloud, Yahoo, Register e qualsiasi server custom senza bisogno di OAuth.
                  </p>
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

        {/* Bottoni connect — disabilita i provider OAuth con secrets mancanti.
            IMAP è sempre disponibile perché usa pgsodium, niente env var. */}
        {(() => {
          const diagUnavailable = diag == null;
          const gmailReady = diagUnavailable || (
            diag.checklist?.google_oauth_client_id?.configured !== false
            && diag.checklist?.google_oauth_client_secret?.configured !== false
          );
          const outlookReady = diagUnavailable || (
            diag.checklist?.ms_oauth_client_id?.configured !== false
            && diag.checklist?.ms_oauth_client_secret?.configured !== false
          );
          const gmailTitle = gmailReady
            ? undefined
            : "OAuth Google non configurato — l'admin di piattaforma deve impostare GOOGLE_OAUTH_CLIENT_ID/SECRET";
          const outlookTitle = outlookReady
            ? undefined
            : "OAuth Microsoft non configurato — l'admin di piattaforma deve impostare MS_OAUTH_CLIENT_ID/SECRET";
          return (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  if (!gmailReady) {
                    toast.error("OAuth Google non configurato", { description: gmailTitle });
                    return;
                  }
                  startOAuth.mutate("gmail");
                }}
                disabled={!!connecting || !gmailReady}
                variant="outline"
                className="gap-2"
                title={gmailTitle}
              >
                {connecting === "gmail" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GmailIcon className="h-4 w-4" />
                )}
                Connetti Gmail
              </Button>
              <Button
                onClick={() => {
                  if (!outlookReady) {
                    toast.error("OAuth Microsoft non configurato", { description: outlookTitle });
                    return;
                  }
                  startOAuth.mutate("outlook");
                }}
                disabled={!!connecting || !outlookReady}
                variant="outline"
                className="gap-2"
                title={outlookTitle}
              >
                {connecting === "outlook" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <OutlookIcon className="h-4 w-4" />
                )}
                Connetti Outlook
              </Button>
              <Button
                onClick={() => setImapDialogOpen(true)}
                variant={!gmailReady && !outlookReady ? "default" : "outline"}
                className="gap-2"
                title="Per Aruba, Libero, iCloud, Yahoo, Register o server custom — sempre disponibile"
              >
                <Server className="h-4 w-4" />
                Altro provider (IMAP)
              </Button>
            </div>
          );
        })()}
        {connections.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10 dark:border-emerald-900 p-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <div className="text-xs text-emerald-800 dark:text-emerald-300 flex-1">
              <strong>{connections.length}</strong> casell{connections.length === 1 ? "a connessa" : "e connesse"} ·{" "}
              <span className="text-emerald-700 dark:text-emerald-400">l'AI legge le tue email per supporto, triage e bozze</span>
            </div>
            <Button
              asChild
              size="sm"
              variant="default"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Link to={typeof window !== "undefined" && window.location.pathname.startsWith("/admin/") ? "/admin/email" : "/azienda/email"}>
                <Inbox className="h-3.5 w-3.5" />
                Apri inbox
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
            <Button
              onClick={() => forceSync.mutate()}
              disabled={forceSync.isPending}
              variant="ghost"
              size="sm"
              className="gap-1.5"
              title="Forza sync immediato di tutti gli account"
            >
              {forceSync.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Sync ora
            </Button>
          </div>
        )}

        {/* Lista connessioni */}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : connections.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-violet-200 bg-violet-50/30 dark:bg-violet-950/10 dark:border-violet-900 py-6 px-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white border border-violet-200 shadow-sm">
              <Plug className="h-6 w-6 text-violet-600" />
            </div>
            <p className="text-sm font-medium text-slate-900">Nessuna casella ancora collegata</p>
            <p className="text-xs mt-1 text-slate-600 max-w-md mx-auto">
              Collega Gmail, Outlook o un IMAP custom: <strong>solo tu vedrai le tue email</strong>.
              L'AI Silvio ti aiuterà a triagiare, rispondere e creare task.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center text-[10px] text-slate-500">
              <span className="rounded-full border border-rose-200 bg-white px-2 py-0.5">📨 Gmail</span>
              <span className="rounded-full border border-blue-200 bg-white px-2 py-0.5">📨 Outlook</span>
              <span className="rounded-full border border-violet-200 bg-white px-2 py-0.5">📨 Aruba/Libero/iCloud</span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">📨 IMAP custom</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {connections.map((c) => {
              const provider = PROVIDER_LABEL[c.provider];
              const status = STATUS_BADGE[c.status];
              const StatusIcon = status.icon;
              const ProviderIcon = provider.Icon;
              return (
                <div key={c.id} className="rounded-lg border p-3 flex items-start gap-3">
                  <ProviderIcon className="h-6 w-6 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{c.email_address}</span>
                      <Badge variant="outline" className={cn("text-[10px] gap-1", provider.color)}>
                        <ProviderIcon className="h-3 w-3" />
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
