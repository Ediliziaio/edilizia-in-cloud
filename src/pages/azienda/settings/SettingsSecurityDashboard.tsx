import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import {
  Shield, Wifi, AlertTriangle, Lock, Users, Clock, Eye,
  Activity, Loader2, XCircle, MonitorSmartphone, Globe,
  RefreshCw, ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

// --- KPI Card ---
function SecurityKpi({ icon: Icon, label, value, variant = "default" }: {
  icon: React.ElementType; label: string; value: string | number;
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
      </div>
    </div>
  );
}

// --- Audit Action Badge ---
function ActionBadge({ action }: { action: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    user_created: { label: "Utente creato", variant: "default" },
    session_revoked: { label: "Sessione revocata", variant: "destructive" },
    all_sessions_revoked: { label: "Sessioni revocate", variant: "destructive" },
    permission_template_created: { label: "Template creato", variant: "secondary" },
    permission_template_applied: { label: "Template applicato", variant: "outline" },
    permissions_updated: { label: "Permessi aggiornati", variant: "outline" },
  };
  const c = config[action] || { label: action, variant: "outline" as const };
  return <Badge variant={c.variant} className="text-[11px]">{c.label}</Badge>;
}

export default function SettingsSecurityDashboard() {
  const { user, role, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const isAdmin = role === "company_admin" || role === "super_admin";

  const [revokeTarget, setRevokeTarget] = useState<{ sessionId?: string; userId?: string; userName?: string } | null>(null);

  // --- Fetch overview ---
  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ["security-overview", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-security-report", {
        body: { section: "overview" },
      });
      if (error) throw error;
      return data?.overview;
    },
    enabled: !!companyId && isAdmin,
    staleTime: 60_000,
  });

  // --- Fetch sessions ---
  const { data: sessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ["security-sessions", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-security-report", {
        body: { section: "sessions" },
      });
      if (error) throw error;
      return data?.sessions || [];
    },
    enabled: !!companyId && isAdmin,
    staleTime: 60_000,
  });

  // --- Fetch audit log ---
  const { data: auditLog = [], isLoading: loadingAudit } = useQuery({
    queryKey: ["security-audit", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-security-report", {
        body: { section: "audit_log" },
      });
      if (error) throw error;
      return data?.audit_log || [];
    },
    enabled: !!companyId && isAdmin,
    staleTime: 60_000,
  });

  // --- Fetch login attempts ---
  const { data: loginAttempts = [], isLoading: loadingAttempts } = useQuery({
    queryKey: ["security-login-attempts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-security-report", {
        body: { section: "login_attempts" },
      });
      if (error) throw error;
      return data?.login_attempts || [];
    },
    enabled: !!companyId && isAdmin,
    staleTime: 60_000,
  });

  // --- Revoke session ---
  const revokeMutation = useMutation({
    mutationFn: async (params: { sessionId?: string; userId?: string }) => {
      const body: Record<string, string> = { reason: "Revocata da admin" };
      if (params.userId) {
        body.revoke_all_for_user = params.userId;
      } else if (params.sessionId) {
        body.session_id = params.sessionId;
      }
      const { data, error } = await supabase.functions.invoke("revoke-user-session", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["security-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["security-overview"] });
      queryClient.invalidateQueries({ queryKey: ["security-audit"] });
      toast.success("Sessione revocata", {
        description: data?.revoked_count ? `${data.revoked_count} sessioni revocate` : "Operazione completata",
      });
      setRevokeTarget(null);
    },
    onError: (err: any) => {
      toast.error("Errore", { description: err.message });
    },
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["security-overview"] });
    queryClient.invalidateQueries({ queryKey: ["security-sessions"] });
    queryClient.invalidateQueries({ queryKey: ["security-audit"] });
    queryClient.invalidateQueries({ queryKey: ["security-login-attempts"] });
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4 opacity-40" />
        <p>Non hai i permessi per accedere a questa sezione.</p>
      </div>
    );
  }

  const activeSessions = sessions.filter((s: any) => s.is_active);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Security Dashboard
          </h1>
          <p className="text-muted-foreground">Monitora sessioni, accessi e attività del tuo team</p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Aggiorna
        </Button>
      </div>

      {/* KPI Overview */}
      {loadingOverview ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : overview ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SecurityKpi
            icon={Wifi}
            label="Sessioni attive"
            value={overview.active_sessions}
            variant={overview.active_sessions > 0 ? "success" : "default"}
          />
          <SecurityKpi
            icon={AlertTriangle}
            label="Tentativi falliti (24h)"
            value={overview.failed_attempts_24h}
            variant={overview.failed_attempts_24h > 5 ? "danger" : overview.failed_attempts_24h > 0 ? "warning" : "default"}
          />
          <SecurityKpi
            icon={Lock}
            label="Account bloccati"
            value={overview.locked_count}
            variant={overview.locked_count > 0 ? "danger" : "default"}
          />
          <SecurityKpi
            icon={Users}
            label="Utenti totali"
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
                <p className="font-medium text-destructive">Account bloccati</p>
                <div className="mt-1 space-y-1">
                  {overview.locked_accounts.map((u: any) => (
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
            <Wifi className="h-3.5 w-3.5" /> Sessioni
          </TabsTrigger>
          <TabsTrigger value="attempts" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Tentativi Login
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Audit Log
          </TabsTrigger>
        </TabsList>

        {/* --- SESSIONS TAB --- */}
        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sessioni Utente</CardTitle>
              <CardDescription>
                {activeSessions.length} sessioni attive su {sessions.length} totali
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSessions ? (
                <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : sessions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nessuna sessione registrata</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Utente</TableHead>
                      <TableHead>Dispositivo</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Inizio</TableHead>
                      <TableHead>Ultima attività</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="text-right w-12"></TableHead>
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
                                <Wifi className="h-2.5 w-2.5 mr-0.5" /> Attiva
                              </Badge>
                            ) : s.revoked_by ? (
                              <Badge variant="destructive" className="text-[11px]">
                                <XCircle className="h-2.5 w-2.5 mr-0.5" /> Revocata
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[11px]">Terminata</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {s.is_active && s.user_id !== user?.id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setRevokeTarget({ sessionId: s.id, userName })}
                              >
                                <XCircle className="h-4 w-4" />
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
              <CardTitle className="text-base">Tentativi di Login</CardTitle>
              <CardDescription>Ultimi 200 tentativi di accesso</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAttempts ? (
                <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : loginAttempts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nessun tentativo registrato</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Esito</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loginAttempts.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium text-sm">{a.email || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{a.ip_address || "—"}</TableCell>
                        <TableCell>
                          {a.success ? (
                            <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 text-[11px]">Successo</Badge>
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
              <CardTitle className="text-base">Audit Log</CardTitle>
              <CardDescription>Ultime 200 azioni registrate</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAudit ? (
                <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : auditLog.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nessuna attività registrata</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Azione</TableHead>
                      <TableHead>Attore</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Dettagli</TableHead>
                      <TableHead>Data</TableHead>
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
                            {log.details && Object.keys(log.details).length > 0 ? (
                              <Collapsible>
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]">
                                    <Eye className="h-3 w-3 mr-1" /> Dettagli
                                    <ChevronDown className="h-3 w-3 ml-1" />
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <pre className="text-[10px] text-muted-foreground mt-1 bg-muted rounded p-2 max-w-[300px] overflow-auto">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </CollapsibleContent>
                              </Collapsible>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
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
            <AlertDialogTitle>Revocare la sessione?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.userName
                ? `La sessione di ${revokeTarget.userName} verrà terminata immediatamente.`
                : "La sessione verrà terminata immediatamente."}
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
              Revoca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
