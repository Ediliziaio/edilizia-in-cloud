import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import {
  Shield, Wifi, AlertTriangle, Lock, Users, Eye,
  Activity, Loader2, XCircle, MonitorSmartphone, Globe,
  RefreshCw, ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { descriviDettagliSicurezza, etichettaAzioneSicurezza } from "@/lib/users/etichetteAzioniSicurezza";
import { FINESTRA_COLLEGATO_MINUTI, personeCollegate, sogliaCollegato } from "@/lib/users/collegamento";

// --- KPI Card ---
function SecurityKpi({ icon: Icon, label, value, nota, variant = "default" }: {
  icon: React.ElementType; label: string; value: string | number; nota?: string;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const styles = {
    default: { card: "border", icon: "text-muted-foreground", iconBg: "bg-muted" },
    success: { card: "border-emerald-500/20 bg-emerald-500/5", icon: "text-emerald-600", iconBg: "bg-emerald-500/10" },
    warning: { card: "border-orange-500/20 bg-orange-500/5", icon: "text-orange-600", iconBg: "bg-orange-500/10" },
    danger: { card: "border-destructive/20 bg-destructive/5", icon: "text-destructive", iconBg: "bg-destructive/10" },
  };
  const s = styles[variant];
  return (
    <div className={`rounded-lg border p-4 flex items-center gap-3 ${s.card}`}>
      <div className={`rounded-full p-2.5 ${s.iconBg}`}>
        <Icon className={`h-4 w-4 ${s.icon}`} />
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {nota && <p className="text-[11px] text-muted-foreground/80">{nota}</p>}
      </div>
    </div>
  );
}

// --- Audit Action Badge ---
// Il nome viene dall'elenco unico delle azioni di sicurezza (etichetteAzioniSicurezza):
// lo stesso della scheda utente. Le cancellazioni e i blocchi si notano.
const AZIONI_DA_NOTARE = new Set([
  "user_deleted", "bulk_users_deleted", "company_access_revoked", "session_revoked", "all_sessions_revoked",
  "user_locked", "account_locked",
]);
const AZIONI_DI_ROUTINE = new Set(["user_created", "permission_template_created"]);

function ActionBadge({ action }: { action: string }) {
  const variant = AZIONI_DA_NOTARE.has(action) ? "destructive" : AZIONI_DI_ROUTINE.has(action) ? "default" : "secondary";
  return <Badge variant={variant} className="text-[11px]">{etichettaAzioneSicurezza(action)}</Badge>;
}

export default function SettingsSecurityDashboard() {
  const { user, role, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const isAdmin = role === "company_admin" || role === "super_admin";

  const [revokeTarget, setRevokeTarget] = useState<{ sessionId?: string; userId?: string; userName?: string } | null>(null);

  // --- Fetch overview ---
  const { data: overview, isLoading: loadingOverview, isError: erroreOverview } = useQuery({
    queryKey: ["security-overview", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-security-report", {
        body: { section: "overview" },
      });
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      return data?.overview;
    },
    enabled: !!companyId && isAdmin,
    staleTime: 60_000,
  });

  // --- Fetch sessions ---
  const { data: sessions = [], isLoading: loadingSessions, isError: erroreSessioni } = useQuery({
    queryKey: ["security-sessions", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-security-report", {
        body: { section: "sessions" },
      });
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      return data?.sessions || [];
    },
    enabled: !!companyId && isAdmin,
    staleTime: 60_000,
  });

  // --- Fetch audit log ---
  const { data: auditLog = [], isLoading: loadingAudit, isError: erroreAudit } = useQuery({
    queryKey: ["security-audit", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-security-report", {
        body: { section: "audit_log" },
      });
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      return data?.audit_log || [];
    },
    enabled: !!companyId && isAdmin,
    staleTime: 60_000,
  });

  // --- Fetch login attempts ---
  const { data: loginAttempts = [], isLoading: loadingAttempts, isError: erroreTentativi } = useQuery({
    queryKey: ["security-login-attempts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-security-report", {
        body: { section: "login_attempts" },
      });
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      return data?.login_attempts || [];
    },
    enabled: !!companyId && isAdmin,
    staleTime: 60_000,
  });

  // --- Chi è collegato adesso: sessioni aperte E viste attive da poco ---
  // (non il numero delle sessioni «attive»: una sessione resta aperta finché
  // qualcuno non esce, anche per mesi). Le persone, non le sessioni.
  const { data: collegati = new Set<string>() } = useQuery({
    queryKey: ["security-collegati", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("user_id, is_active, last_active_at")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .gte("last_active_at", sogliaCollegato())
        .limit(500);
      if (error) throw error;
      return personeCollegate((data ?? []) as Array<{ user_id: string; is_active: boolean | null; last_active_at: string | null }>);
    },
    enabled: !!companyId && isAdmin,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // --- Revoke session ---
  const revokeMutation = useMutation({
    mutationFn: async (params: { sessionId?: string; userId?: string }) => {
      const body: Record<string, string> = { reason: "Chiusa dall'amministratore" };
      if (params.userId) {
        body.revoke_all_for_user = params.userId;
      } else if (params.sessionId) {
        body.session_id = params.sessionId;
      }
      const { data, error } = await supabase.functions.invoke("revoke-user-session", { body });
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["security-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["security-overview"] });
      queryClient.invalidateQueries({ queryKey: ["security-audit"] });
      queryClient.invalidateQueries({ queryKey: ["security-collegati"] });
      toast.success("Sessione chiusa", {
        // Una sessione non collegata a un dispositivo preciso chiude tutti gli accessi.
        description: data?.tutti_i_dispositivi
          ? "Disconnesso da tutti i dispositivi."
          : data?.revoked_count ? `${data.revoked_count} sessioni chiuse` : "Fatto.",
      });
      setRevokeTarget(null);
    },
    onError: (err: unknown) => {
      toast.error("Non sono riuscito a chiudere la sessione", {
        description: userErrorMessage(err, "Riprova tra un attimo."),
      });
    },
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["security-overview"] });
    queryClient.invalidateQueries({ queryKey: ["security-sessions"] });
    queryClient.invalidateQueries({ queryKey: ["security-audit"] });
    queryClient.invalidateQueries({ queryKey: ["security-login-attempts"] });
    queryClient.invalidateQueries({ queryKey: ["security-collegati"] });
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4 opacity-40" />
        <p>Questa sezione la vede solo l'amministratore.</p>
      </div>
    );
  }

  const activeSessions = sessions.filter((s: any) => s.is_active);
  const qualcosaNonCaricato = erroreOverview || erroreSessioni || erroreAudit || erroreTentativi;

  return (
    <div className="space-y-6">
      {/* Header: il titolo della pagina lo mette già il layout, qui è h2 */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Shield className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            Accessi e sessioni
          </h2>
          <p className="text-sm text-muted-foreground">Chi è collegato, i tentativi di accesso e le azioni sugli utenti.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            La tua password e la verifica in due passaggi sono in{" "}
            <Link to="/azienda/impostazioni/mio-profilo?tab=sicurezza" className="underline underline-offset-2">Il mio profilo → Sicurezza</Link>,
            e nella stessa pagina, in fondo, le regole di sicurezza dell'azienda (blocco dopo password sbagliate, indirizzi consentiti).
            Chi ha accessi a rischio lo vedi in{" "}
            <Link to="/azienda/impostazioni/persone?tab=sicurezza-accessi" className="underline underline-offset-2">Persone &amp; Accessi → Controllo accessi</Link>.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} className="shrink-0">
          <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
          Aggiorna
        </Button>
      </div>

      {qualcosaNonCaricato && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Alcuni dati non si sono caricati.
          <Button size="sm" variant="outline" onClick={refreshAll}>Riprova</Button>
        </div>
      )}

      {/* KPI Overview */}
      {loadingOverview ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : overview ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SecurityKpi
            icon={Wifi}
            label="Collegati adesso"
            nota={`${overview.active_sessions} ${overview.active_sessions === 1 ? "sessione rimasta aperta" : "sessioni rimaste aperte"}`}
            value={collegati.size}
            variant={collegati.size > 0 ? "success" : "default"}
          />
          <SecurityKpi
            icon={AlertTriangle}
            label="Accessi falliti nelle ultime 24 ore"
            value={overview.failed_attempts_24h}
            variant={overview.failed_attempts_24h > 5 ? "danger" : overview.failed_attempts_24h > 0 ? "warning" : "default"}
          />
          <SecurityKpi
            icon={Lock}
            label="Accessi bloccati"
            value={overview.locked_count}
            variant={overview.locked_count > 0 ? "danger" : "default"}
          />
          <SecurityKpi
            icon={Users}
            label="Persone"
            value={overview.total_users}
          />
        </div>
      ) : null}

      {/* Locked accounts alert */}
      {overview?.locked_count > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Accessi bloccati per password sbagliate</p>
                <div className="mt-1 space-y-1">
                  {(overview.locked_accounts ?? []).map((u: any) => (
                    <p key={u.id} className="text-sm text-muted-foreground">
                      {u.first_name} {u.last_name} — bloccato fino a{" "}
                      {new Date(u.locked_until).toLocaleString("it-IT")}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="sessions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sessions" className="gap-1.5">
            <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> Collegati
          </TabsTrigger>
          <TabsTrigger value="attempts" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Tentativi di accesso
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" /> Azioni sugli utenti
          </TabsTrigger>
        </TabsList>

        {/* --- SESSIONS TAB --- */}
        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sessioni delle persone</CardTitle>
              <CardDescription>
                {collegati.size === 1 ? "1 persona collegata" : `${collegati.size} persone collegate`} adesso (viste attive negli ultimi {FINESTRA_COLLEGATO_MINUTI} minuti).{" "}
                {activeSessions.length === 1 ? "1 sessione è rimasta aperta" : `${activeSessions.length} sessioni sono rimaste aperte`} su {sessions.length} recenti:
                una sessione si chiude quando la persona esce, oppure da qui.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSessions ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nessuna sessione registrata.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Persona</TableHead>
                      <TableHead>Dispositivo</TableHead>
                      <TableHead>Indirizzo (IP)</TableHead>
                      <TableHead>Iniziata</TableHead>
                      <TableHead>Ultima attività</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="text-right w-12"><span className="sr-only">Azioni</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.slice(0, 50).map((s: any) => {
                      const profile = s.profiles;
                      const userName = profile ? `${profile.first_name} ${profile.last_name}` : "—";
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{userName}</TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <MonitorSmartphone className="h-3 w-3" />
                                    {s.browser || s.device_type || "—"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{s.user_agent || "N/A"}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Globe className="h-3 w-3" />
                              {s.ip_address || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(s.started_at), { addSuffix: true, locale: it })}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {s.last_active_at
                              ? formatDistanceToNow(new Date(s.last_active_at), { addSuffix: true, locale: it })
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {s.is_active ? (
                              <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 text-[11px]">
                                <Wifi className="h-2.5 w-2.5 mr-0.5" aria-hidden="true" /> Aperta
                              </Badge>
                            ) : s.revoked_by ? (
                              <Badge variant="destructive" className="text-[11px]">
                                <XCircle className="h-2.5 w-2.5 mr-0.5" aria-hidden="true" /> Chiusa da un amministratore
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[11px]">Chiusa</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {s.is_active && s.user_id !== user?.id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                aria-label={`Chiudi la sessione di ${userName}`}
                                title="Chiudi la sessione"
                                onClick={() => setRevokeTarget({ sessionId: s.id, userName })}
                              >
                                <XCircle className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- LOGIN ATTEMPTS TAB --- */}
        <TabsContent value="attempts">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tentativi di accesso</CardTitle>
              <CardDescription>Gli ultimi 200, riusciti e falliti.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAttempts ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                </div>
              ) : loginAttempts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nessun tentativo registrato.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Indirizzo (IP)</TableHead>
                      <TableHead>Esito</TableHead>
                      <TableHead>Quando</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loginAttempts.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium text-sm">{a.email || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{a.ip_address || "—"}</TableCell>
                        <TableCell>
                          {a.success ? (
                            <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 text-[11px]">Riuscito</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[11px]">Fallito</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: it })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- AUDIT LOG TAB --- */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Azioni sugli utenti</CardTitle>
              <CardDescription>Le ultime 200: chi ha creato, bloccato o cambiato qualcuno, e chi ha chiuso una sessione.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAudit ? (
                <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : auditLog.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nessuna azione registrata.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cosa è successo</TableHead>
                      <TableHead>Chi</TableHead>
                      <TableHead>Su chi</TableHead>
                      <TableHead>Dettagli</TableHead>
                      <TableHead>Quando</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLog.map((log: any) => {
                      const actor = log.actor;
                      const target = log.target;
                      return (
                        <TableRow key={log.id}>
                          <TableCell><ActionBadge action={log.action} /></TableCell>
                          <TableCell className="text-sm">
                            {actor ? `${actor.first_name} ${actor.last_name}` : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {target ? `${target.first_name} ${target.last_name}` : "—"}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              // Una frase, se l'azione la conosciamo; per le altre i dati tecnici restano a disposizione, chiusi.
                              const frase = descriviDettagliSicurezza(log.action, log.details);
                              if (frase) return <span className="text-xs text-muted-foreground">{frase}</span>;
                              if (log.details && Object.keys(log.details).length > 0) {
                                return (
                                  <Collapsible>
                                    <CollapsibleTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]">
                                        <Eye className="h-3 w-3 mr-1" aria-hidden="true" /> Dati tecnici
                                        <ChevronDown className="h-3 w-3 ml-1" aria-hidden="true" />
                                      </Button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <pre className="text-[10px] text-muted-foreground mt-1 bg-muted rounded p-2 max-w-[300px] overflow-auto">
                                        {JSON.stringify(log.details, null, 2)}
                                      </pre>
                                    </CollapsibleContent>
                                  </Collapsible>
                                );
                              }
                              return <span className="text-xs text-muted-foreground">—</span>;
                            })()}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: it })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Revoke confirmation dialog */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chiudere la sessione?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.userName
                ? `La sessione di ${revokeTarget.userName} si chiude subito.`
                : "La sessione si chiude subito."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (revokeTarget) {
                  revokeMutation.mutate({
                    sessionId: revokeTarget.sessionId,
                    userId: revokeTarget.userId,
                  });
                }
              }}
            >
              Chiudi la sessione
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
