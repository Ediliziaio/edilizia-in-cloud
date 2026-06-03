import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminSessions, useRevokeSession } from "@/hooks/useAdminSessions";
import { toast } from "sonner";
import {
  Lock, Eye, EyeOff, Shield, Monitor, Trash2, Loader2,
  RefreshCw, AlertTriangle, CheckCircle2, Smartphone, Info, Database,
  History, ShieldCheck, KeyRound, Users2, ChevronRight, X, Check,
  Clock as ClockIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ─── Password checklist (more actionable than single score) ─────────────────

interface PasswordCheck {
  key: string;
  label: string;
  test: (pwd: string) => boolean;
}

const PASSWORD_CHECKS: PasswordCheck[] = [
  { key: "length8", label: "Almeno 8 caratteri", test: (p) => p.length >= 8 },
  { key: "length12", label: "12+ caratteri (consigliato)", test: (p) => p.length >= 12 },
  { key: "upper", label: "Una maiuscola (A-Z)", test: (p) => /[A-Z]/.test(p) },
  { key: "digit", label: "Un numero (0-9)", test: (p) => /[0-9]/.test(p) },
  { key: "special", label: "Un carattere speciale (!@#$%…)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function usePasswordChecks(pwd: string) {
  return useMemo(() => {
    const results = PASSWORD_CHECKS.map((c) => ({ ...c, ok: c.test(pwd) }));
    const passed = results.filter(r => r.ok).length;
    const score = Math.min(5, passed);
    const label =
      pwd.length === 0 ? "" :
      score <= 2 ? "Debole" :
      score === 3 ? "Media" :
      score === 4 ? "Buona" : "Ottima";
    return { results, score, label };
  }, [pwd]);
}

function strengthColor(level: number): string {
  if (level <= 1) return "bg-destructive";
  if (level === 2) return "bg-orange-400";
  if (level === 3) return "bg-yellow-400";
  if (level === 4) return "bg-blue-400";
  return "bg-green-500";
}

function strengthTextColor(level: number): string {
  if (level >= 4) return "text-green-600";
  if (level === 3) return "text-yellow-600";
  return "text-destructive";
}

// ─── KPI overview ────────────────────────────────────────────

function SecurityKPIs({
  sessionsCount,
  rlsOk,
  rlsUnknownCount,
  passwordDaysAgo,
}: {
  sessionsCount: number | null;
  rlsOk: boolean | null;
  rlsUnknownCount: number | null;
  passwordDaysAgo: number | null;
}) {
  const passwordLabel = passwordDaysAgo === null ? "—"
    : passwordDaysAgo === 0 ? "Oggi"
    : `${passwordDaysAgo}gg fa`;
  const passwordStale = passwordDaysAgo !== null && passwordDaysAgo > 90;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Kpi
        icon={<Monitor className="h-4 w-4" />}
        label="Sessioni attive"
        value={sessionsCount ?? "—"}
        subtitle={sessionsCount === 1 ? "solo questo dispositivo" : sessionsCount && sessionsCount > 1 ? "multi-dispositivo" : ""}
        accent="bg-primary/10 text-primary"
      />
      <Kpi
        icon={<KeyRound className="h-4 w-4" />}
        label="Password aggiornata"
        value={passwordLabel}
        subtitle={passwordStale ? "⚠️ oltre 90gg" : "in range"}
        accent={passwordStale
          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}
        highlight={passwordStale}
      />
      <Kpi
        icon={<Smartphone className="h-4 w-4" />}
        label="2FA"
        value="TOTP"
        subtitle="Disponibile"
        accent="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
      />
      <Kpi
        icon={<Database className="h-4 w-4" />}
        label="RLS database"
        value={rlsOk === null ? "—" : rlsOk ? "OK" : `⚠️ ${rlsUnknownCount ?? 0}`}
        subtitle={rlsOk === null ? "verifica in corso"
          : rlsOk ? "tutte le tabelle protette"
          : "tabelle esposte"}
        accent={rlsOk === null ? "bg-muted text-muted-foreground"
          : rlsOk ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"}
        highlight={rlsOk === false}
      />
    </div>
  );
}

function Kpi({
  icon, label, value, subtitle, accent, highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  accent: string;
  highlight?: boolean;
}) {
  return (
    <Card className={cn(highlight && "ring-1 ring-rose-300 dark:ring-rose-800")}>
      <CardContent className="p-3 flex items-start gap-2.5">
        <div className={cn("p-1.5 rounded-lg shrink-0", accent)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
          <p className="text-xl font-bold leading-tight mt-0.5">{value}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── SESSIONI ────────────────────────────────────────────────

function SessionsCard() {
  const { data: sessions, isLoading, refetch, isFetching } = useAdminSessions();
  const { mutate: revoke, isPending: isRevoking } = useRevokeSession();
  const [confirmAll, setConfirmAll] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="h-4 w-4" />
              Sessioni attive
            </CardTitle>
            <CardDescription>
              Dispositivi con accesso al tuo account Super Admin
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <Info className="h-5 w-5 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nessuna sessione attiva registrata.</p>
            <p className="text-xs text-muted-foreground">
              Le sessioni verranno tracciate automaticamente dal prossimo accesso.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="rounded-full bg-muted p-2 shrink-0">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {session.deviceHint ?? "Dispositivo sconosciuto"}
                      </span>
                      {session.isCurrent && (
                        <Badge variant="secondary" className="text-xs">Sessione corrente</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {session.ipAddress ?? "IP sconosciuto"} •{" "}
                      {formatDistanceToNow(new Date(session.lastSeenAt), { addSuffix: true, locale: it })}
                    </p>
                  </div>
                </div>
                {!session.isCurrent && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => revoke(session.id)}
                    disabled={isRevoking}
                    className="text-destructive hover:text-destructive shrink-0"
                    title="Revoca sessione"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {sessions.filter(s => !s.isCurrent).length > 0 && (
              <>
                <Separator />
                {confirmAll ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        const others = sessions.filter((s) => !s.isCurrent);
                        others.forEach((s) => revoke(s.id));
                        setConfirmAll(false);
                      }}
                      disabled={isRevoking}
                    >
                      Confermo: revoca {sessions.filter(s => !s.isCurrent).length} sessioni
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setConfirmAll(false)}>
                      Annulla
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => setConfirmAll(true)}
                    disabled={isRevoking}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Revoca tutte le altre sessioni
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── PASSWORD ─────────────────────────────────────────────────

function PasswordCard({ onSuccess }: { onSuccess?: () => void }) {
  const { user: _user } = useAuth();  // keep hook order stable anche se inutilizzato direttamente
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checks = usePasswordChecks(newPwd);
  const canSubmit = newPwd.length >= 8 && newPwd === confirmPwd && !isLoading;

  const handleSubmit = async () => {
    setError(null);
    if (newPwd !== confirmPwd) { setError("Le password non coincidono"); return; }
    if (newPwd.length < 8) { setError("La password deve essere almeno 8 caratteri"); return; }

    setIsLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPwd });
      if (updateError) {
        if (updateError.message?.includes("same")) {
          setError("La nuova password deve essere diversa da quella attuale");
        } else {
          throw updateError;
        }
        return;
      }
      toast.success("Password aggiornata con successo");
      // BUG FIX: reset state completo on success (prima restava il vecchio error)
      setNewPwd("");
      setConfirmPwd("");
      setError(null);
      setShowNew(false);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4" />
          Cambia password
        </CardTitle>
        <CardDescription>
          Usa una password forte e unica per proteggere il tuo account Super Admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label>Nuova password</Label>
          <div className="relative">
            <Input
              type={showNew ? "text" : "password"}
              value={newPwd}
              onChange={(e) => {
                setNewPwd(e.target.value);
                if (error) setError(null);  // clear error al primo typing
              }}
              placeholder="Minimo 8 caratteri"
              className="pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              aria-label={showNew ? "Nascondi password" : "Mostra password"}
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {newPwd.length > 0 && (
            <div className="space-y-2">
              {/* Progress bar */}
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i <= checks.score ? strengthColor(checks.score) : "bg-muted"
                    }`}
                  />
                ))}
              </div>
              <p className={`text-xs ${strengthTextColor(checks.score)}`}>
                Password {checks.label}
              </p>

              {/* Checklist requisiti */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
                {checks.results.map((c) => (
                  <div key={c.key} className={cn(
                    "flex items-center gap-1.5 text-xs",
                    c.ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
                  )}>
                    {c.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    <span className={c.ok ? "line-through" : ""}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Conferma nuova password</Label>
          <div className="relative">
            <Input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="Ripeti la nuova password"
              className={confirmPwd && newPwd !== confirmPwd ? "border-destructive" : ""}
              autoComplete="new-password"
            />
            {confirmPwd && newPwd === confirmPwd && (
              <CheckCircle2 className="absolute right-3 top-2.5 h-4 w-4 text-green-500" />
            )}
          </div>
          {confirmPwd && newPwd !== confirmPwd && (
            <p className="text-xs text-destructive">Le password non coincidono</p>
          )}
        </div>

        <Separator />

        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            Aggiorna password
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── 2FA placeholder ────────────────────────────────────────

function TwoFactorCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4 w-4" />
          Autenticazione a due fattori (2FA)
          <Badge variant="outline" className="ml-auto text-xs">Disponibile</Badge>
        </CardTitle>
        <CardDescription>
          Aggiungi un livello di sicurezza extra con un'app di autenticazione.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            <p className="text-sm">
              La verifica in due passaggi (TOTP) è disponibile. Configurala dalle
              impostazioni di sicurezza del tuo profilo utente Supabase.
            </p>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

// ─── RLS status ──────────────────────────────────────────────

function useRlsStatus() {
  return useQuery({
    queryKey: ["admin-rls-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("check-rls-status");
      if (error) throw new Error(await edgeErrorMessage(error));
      return data as { tables_without_rls: string[]; count: number; scanned_at: string };
    },
    staleTime: 10 * 60 * 1000,
  });
}

function RlsStatusCard() {
  const { data, isLoading, isFetching, refetch, isError } = useRlsStatus();
  const hasIssues = (data?.count ?? 0) > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" />
              Stato RLS database
            </CardTitle>
            <CardDescription>
              Verifica che tutte le tabelle abbiano Row Level Security abilitata
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Impossibile verificare lo stato RLS. L'edge function `check-rls-status` potrebbe non essere deployata.
            </AlertDescription>
          </Alert>
        ) : hasIssues ? (
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>{data!.count} {data!.count === 1 ? "tabella" : "tabelle"} senza RLS</strong> — rischio di accesso cross-tenant ai dati.
              </AlertDescription>
            </Alert>
            <div className="space-y-1">
              {data!.tables_without_rls.map((t) => (
                <div key={t} className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <code className="text-xs bg-destructive/10 px-1.5 py-0.5 rounded">public.{t}</code>
                </div>
              ))}
            </div>
            {data?.scanned_at && (
              <p className="text-xs text-muted-foreground">
                Scansionato: {new Date(data.scanned_at).toLocaleString("it-IT")}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 py-2">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">Tutte le tabelle hanno RLS abilitata</p>
              {data?.scanned_at && (
                <p className="text-xs text-muted-foreground">
                  Ultimo check: {new Date(data.scanned_at).toLocaleString("it-IT")}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Quick links ──────────────────────────────────────────────

function QuickLinksCard() {
  const links = [
    {
      to: "/admin/impostazioni/audit",
      icon: <History className="h-4 w-4" />,
      title: "Audit Log",
      description: "Cronologia di tutte le azioni super-admin",
    },
    {
      to: "/admin/impostazioni/ip-allowlist",
      icon: <ShieldCheck className="h-4 w-4" />,
      title: "IP Allowlist",
      description: "Limita l'accesso super-admin a IP specifici",
    },
    {
      to: "/admin/impostazioni/super-admin",
      icon: <Users2 className="h-4 w-4" />,
      title: "Super Admin",
      description: "Gestisci chi ha accesso super-admin alla piattaforma",
    },
    {
      to: "/admin/feature-flags",
      icon: <ShieldCheck className="h-4 w-4" />,
      title: "Feature Flags",
      description: "Esposizione selettiva di funzionalità per azienda",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sicurezza della piattaforma</CardTitle>
        <CardDescription>Altri controlli di sicurezza e audit</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="group flex items-center gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/60 transition-colors"
            >
              <div className="p-2 rounded-lg bg-background border shrink-0">
                {link.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{link.title}</p>
                <p className="text-xs text-muted-foreground truncate">{link.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Recent activity ─────────────────────────────────────────

interface AuditEntry {
  id: string;
  action: string;
  target_type: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
}

function RecentActivityCard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-security-recent-activity", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("id, action, target_type, created_at, details")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as AuditEntry[];
    },
    staleTime: 60 * 1000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Attività recente del tuo account
        </CardTitle>
        <CardDescription>
          Ultime 10 azioni tracciate nell'audit log per questo utente super-admin
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessuna attività registrata di recente.
          </p>
        ) : (
          <div className="space-y-1">
            {data.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{entry.action.replace(/_/g, " ")}</p>
                  {entry.target_type && (
                    <p className="text-xs text-muted-foreground truncate">
                      su <code className="text-[10px]">{entry.target_type}</code>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                  <ClockIcon className="h-3 w-3" />
                  {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true, locale: it })}
                </div>
              </div>
            ))}
            <div className="pt-2">
              <Button variant="ghost" size="sm" asChild className="w-full text-xs">
                <Link to="/admin/impostazioni/audit">
                  Vedi log completo <ChevronRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Password last update hook ───────────────────────────────

function usePasswordLastUpdate() {
  const { user } = useAuth();
  const lastUpdateIso = (user as unknown as { updated_at?: string })?.updated_at ?? null;
  return useMemo(() => {
    if (!lastUpdateIso) return null;
    const last = new Date(lastUpdateIso);
    return Math.floor((Date.now() - last.getTime()) / 86400000);
  }, [lastUpdateIso]);
}

// ─── Pagina sicurezza ─────────────────────────────────────────

export default function SecurityTab() {
  const { data: sessions } = useAdminSessions();
  const { data: rls } = useRlsStatus();
  const passwordDaysAgo = usePasswordLastUpdate();

  const sessionsCount = sessions?.length ?? null;
  const rlsOk = rls ? rls.count === 0 : null;
  const rlsUnknown = rls?.count ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sicurezza</h1>
        <p className="text-muted-foreground">
          Gestisci password, 2FA, sessioni e controlli di sicurezza della piattaforma.
        </p>
      </div>

      <SecurityKPIs
        sessionsCount={sessionsCount}
        rlsOk={rlsOk}
        rlsUnknownCount={rlsUnknown}
        passwordDaysAgo={passwordDaysAgo}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <PasswordCard />
        <TwoFactorCard />
      </div>

      <RlsStatusCard />
      <SessionsCard />
      <RecentActivityCard />
      <QuickLinksCard />
    </div>
  );
}
