import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  buildAccessGovernanceSummary,
  evaluateAccessRisk,
  normalizeAccessRoles,
  type AccessRiskInput,
  type AccessRiskLevel,
} from "@/lib/accessGovernance";
import { withClientTimeout } from "@/lib/query-timeout";
import { sessioneCollegata, ultimoSegnoDiVita } from "@/lib/users/collegamento";
import { nomeRuolo } from "@/lib/permessi/ruoliUtente";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type GovernanceProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company_id: string | null;
  require_2fa: boolean | null;
  last_login_at: string | null;
  locked_until: string | null;
  is_blocked?: boolean | null;
};

type GovernanceProfileSeed = GovernanceProfile & {
  roles?: string[];
};

type RpcCompanyPerson = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  roles?: string[] | null;
};

type GovernanceRoleRow = {
  user_id: string;
  role: string;
};

type GovernancePermissionRow = {
  user_id: string;
  can_view_settings?: boolean | null;
  can_edit_settings_profile?: boolean | null;
  can_view_settings_people?: boolean | null;
  can_edit_settings_people?: boolean | null;
  can_view_settings_security?: boolean | null;
  can_view_users?: boolean | null;
  can_view_billing?: boolean | null;
  can_view_costs?: boolean | null;
  can_view_tesoreria?: boolean | null;
  can_manage_payments?: boolean | null;
  can_manage_suppliers?: boolean | null;
  can_view_marketing?: boolean | null;
  can_edit_marketing?: boolean | null;
  only_assigned?: boolean | null;
  visible_areas?: string[] | null;
};

type GovernanceAccessRow = {
  user_id: string;
  company_id: string;
  access_role: string;
  created_at: string | null;
};

type GovernanceSessionRow = {
  user_id: string;
  last_active_at?: string | null;
};

type GovernanceUser = AccessRiskInput & {
  id: string;
  name: string;
  email: string;
  source: "profile" | "multi_company";
  roleLabels: string[];
  lastLoginLabel: string;
  /** Una sessione aperta con un segno di vita negli ultimi 10 minuti. */
  collegatoAdesso: boolean;
  onlyAssigned: boolean;
  visibleAreasCount: number;
};

type GovernanceFetchResult = {
  users: GovernanceUser[];
  warnings: string[];
};

const RISK_STYLES: Record<AccessRiskLevel, string> = {
  high: "border-red-200 bg-red-50 text-red-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function displayName(profile: GovernanceProfile | undefined) {
  const name = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
  return name || profile?.email || "Persona senza nome";
}

function hasCriticalPermissions(roles: string[], permissions: GovernancePermissionRow | undefined) {
  if (normalizeAccessRoles(roles).includes("company_admin")) return true;
  return Boolean(
    permissions?.can_view_settings ||
    permissions?.can_edit_settings_profile ||
    permissions?.can_view_settings_people ||
    permissions?.can_edit_settings_people ||
    permissions?.can_view_settings_security ||
    permissions?.can_view_users ||
    permissions?.can_view_billing ||
    permissions?.can_view_costs ||
    permissions?.can_view_tesoreria ||
    permissions?.can_manage_payments ||
    permissions?.can_manage_suppliers ||
    permissions?.can_edit_marketing,
  );
}

function formatLastLogin(value: string | null) {
  if (!value) return "Mai connesso";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data non valida";
  return formatDistanceToNow(date, { addSuffix: true, locale: it });
}

// Prima qui si leggeva «N sessioni attive»: una sessione resta «attiva» finché
// nessuno la chiude, anche se la persona non entra da mesi. Ora «Collegato
// adesso» c'è solo con un segno di vita negli ultimi 10 minuti.
function statusLabel(user: GovernanceUser) {
  if (user.isBlocked) return "Accesso bloccato";
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) return "Bloccato per password sbagliate";
  if (user.collegatoAdesso) return "Collegato adesso";
  return "Non collegato";
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string | number;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  return (
    <div className={cn(
      "rounded-lg border bg-card p-4",
      tone === "good" && "border-emerald-200 bg-emerald-50/60",
      tone === "warn" && "border-amber-200 bg-amber-50/60",
      tone === "bad" && "border-red-200 bg-red-50/60",
    )}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background/80">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

async function readOptionalRows<T>(
  task: PromiseLike<{ data: unknown; error: unknown }>,
  label: string,
  timeoutMs = 12_000,
): Promise<{ rows: T[]; warning?: string }> {
  try {
    const response = await withClientTimeout(task, label, timeoutMs);
    if (response.error) {
      console.warn(`[controllo accessi] ${label}: dati non disponibili`, response.error);
      return { rows: [], warning: `${label}: permessi o dati non disponibili` };
    }
    return { rows: (response.data ?? []) as T[] };
  } catch (error) {
    return {
      rows: [],
      warning: error instanceof Error ? error.message : `${label}: lettura non disponibile`,
    };
  }
}

function fromRpcPerson(person: RpcCompanyPerson, companyId: string): GovernanceProfileSeed {
  return {
    id: person.id,
    first_name: person.first_name,
    last_name: person.last_name,
    email: person.email,
    company_id: companyId,
    require_2fa: null,
    last_login_at: null,
    locked_until: null,
    is_blocked: false,
    roles: Array.isArray(person.roles) ? person.roles : undefined,
  };
}

async function fetchGovernanceUsers(
  companyId: string,
  seedProfiles: GovernanceProfileSeed[] = [],
): Promise<GovernanceFetchResult> {
  const warnings: string[] = [];
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, string>,
  ) => Promise<{ data: unknown; error: unknown }>;

  const [rpcProfilesResult, directProfilesResult, accessResult] = await Promise.all([
    readOptionalRows<RpcCompanyPerson>(
      rpc.call(supabase, "get_internal_chat_profiles", { p_company_id: companyId }),
      "Profili accessi RPC",
      3_000,
    ),
    readOptionalRows<GovernanceProfile>(
      supabase
        .from("profiles")
        .select("id, first_name, last_name, email, company_id, require_2fa, last_login_at, locked_until")
        .eq("company_id", companyId)
        .limit(3000),
      "Profili accessi",
    ),
    readOptionalRows<GovernanceAccessRow>(
      supabase
        .from("multi_company_access")
        .select("user_id, company_id, access_role, created_at")
        .eq("company_id", companyId)
        .limit(3000),
      "Accessi multi-azienda",
    ),
  ]);
  warnings.push(...[
    directProfilesResult.warning,
    accessResult.warning,
    directProfilesResult.rows.length === 0 ? rpcProfilesResult.warning : undefined,
  ]
    .filter((warning): warning is string => Boolean(warning)));
  const accessRows = accessResult.rows;
  const companyProfiles = [
    ...seedProfiles,
    ...rpcProfilesResult.rows.map((person) => fromRpcPerson(person, companyId)),
    ...directProfilesResult.rows,
  ].reduce<GovernanceProfileSeed[]>((profiles, profile) => {
    if (profiles.some((item) => item.id === profile.id)) return profiles;
    profiles.push(profile);
    return profiles;
  }, []);
  const userIds = unique([
    ...companyProfiles.map((profile) => profile.id),
    ...accessRows.map((access) => access.user_id),
  ]);

  if (userIds.length === 0) return { users: [], warnings };

  const [allProfilesResult, blockedResult, rolesResult, sessionsResult, permissionsResult] = await Promise.all([
    readOptionalRows<GovernanceProfile>(supabase
      .from("profiles")
      .select("id, first_name, last_name, email, company_id, require_2fa, last_login_at, locked_until")
      .in("id", userIds)
      .limit(3000), "Profili collegati"),
    readOptionalRows<Pick<GovernanceProfile, "id" | "is_blocked">>(supabase
      .from("profiles")
      .select("id, is_blocked")
      .in("id", userIds)
      .limit(3000), "Stato blocco utenti"),
    readOptionalRows<GovernanceRoleRow>(supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds)
      .limit(6000), "Ruoli utente"),
    readOptionalRows<GovernanceSessionRow>(supabase
      .from("user_sessions")
      .select("user_id, last_active_at")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .limit(3000), "Sessioni attive"),
    readOptionalRows<GovernancePermissionRow>(supabase
      .from("staff_permissions")
      .select("user_id, can_view_settings, can_edit_settings_profile, can_view_settings_people, can_edit_settings_people, can_view_settings_security, can_view_users, can_view_billing, can_view_costs, can_view_tesoreria, can_manage_payments, can_manage_suppliers, can_view_marketing, can_edit_marketing, only_assigned, visible_areas")
      .eq("company_id", companyId)
      .limit(3000), "Permessi granulari"),
  ]);
  warnings.push(...[allProfilesResult, blockedResult, rolesResult, sessionsResult, permissionsResult]
    .map((result) => result.warning)
    .filter((warning): warning is string => Boolean(warning)));

  const profilesById = new Map<string, GovernanceProfile>();
  for (const profile of companyProfiles) profilesById.set(profile.id, profile);
  for (const profile of allProfilesResult.rows) profilesById.set(profile.id, profile);
  for (const row of blockedResult.rows) {
    const profile = profilesById.get(row.id);
    if (profile) profilesById.set(row.id, { ...profile, is_blocked: row.is_blocked });
  }

  const rolesByUser = new Map<string, string[]>();
  for (const profile of companyProfiles) {
    if (profile.roles?.length) rolesByUser.set(profile.id, profile.roles);
  }
  for (const row of rolesResult.rows) {
    rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) ?? []), row.role]);
  }

  const sessionsByUser = new Map<string, GovernanceSessionRow[]>();
  for (const row of sessionsResult.rows) {
    sessionsByUser.set(row.user_id, [...(sessionsByUser.get(row.user_id) ?? []), row]);
  }

  const permissionsByUser = new Map<string, GovernancePermissionRow>();
  for (const row of permissionsResult.rows) {
    permissionsByUser.set(row.user_id, row);
  }

  const accessByUser = new Map<string, GovernanceAccessRow[]>();
  for (const row of accessRows) {
    accessByUser.set(row.user_id, [...(accessByUser.get(row.user_id) ?? []), row]);
  }

  const users = userIds.map((userId) => {
    const profile = profilesById.get(userId);
    const accessRoles = accessByUser.get(userId)?.map((row) => row.access_role) ?? [];
    const profileRoles = rolesByUser.get(userId) ?? [];
    const source = profile?.company_id === companyId ? "profile" : "multi_company";
    const roles = accessRoles.length > 0 && source === "multi_company" ? accessRoles : profileRoles;
    const normalizedRoles = normalizeAccessRoles(roles.length ? roles : ["company_staff"]);
    const permissions = permissionsByUser.get(userId);
    const sessions = sessionsByUser.get(userId) ?? [];
    // L'ultima volta che l'app ha visto la persona: chi tiene la sessione aperta
    // e lavora ogni giorno non entra «da mesi» solo perché non rifà il login.
    const lastSeen = ultimoSegnoDiVita(profile?.last_login_at ?? null, sessions);
    const riskInput: AccessRiskInput = {
      id: userId,
      roles: normalizedRoles,
      require2fa: profile?.require_2fa === true,
      isBlocked: profile?.is_blocked === true,
      lockedUntil: profile?.locked_until ?? null,
      lastLoginAt: lastSeen,
      activeSessions: sessions.length,
      hasCrossCompanyAccess: source === "multi_company" || accessRoles.length > 0,
      hasCriticalPermissions: hasCriticalPermissions(normalizedRoles, permissions),
    };

    return {
      ...riskInput,
      id: userId,
      name: displayName(profile),
      email: profile?.email ?? "Profilo non leggibile",
      source,
      roleLabels: normalizedRoles.map((role) => nomeRuolo(role) || role),
      lastLoginLabel: formatLastLogin(lastSeen),
      collegatoAdesso: sessions.some((s) => sessioneCollegata({ is_active: true, last_active_at: s.last_active_at })),
      onlyAssigned: permissions?.only_assigned === true,
      visibleAreasCount: Array.isArray(permissions?.visible_areas) ? permissions.visible_areas.length : 0,
    };
  });

  return { users, warnings };
}

export function AccessGovernancePanel({ puoAprireScheda = false }: { puoAprireScheda?: boolean } = {}) {
  const { effectiveCompany, profile, role } = useAuth();
  const navigate = useNavigate();
  const companyId = effectiveCompany?.id;
  const seedProfiles = useMemo<GovernanceProfileSeed[]>(() => {
    if (!profile?.id || !companyId) return [];
    return [{
      id: profile.id,
      first_name: profile.first_name ?? null,
      last_name: profile.last_name ?? null,
      email: profile.email ?? null,
      company_id: companyId,
      require_2fa: profile.require_2fa ?? null,
      last_login_at: profile.last_login_at ?? null,
      locked_until: profile.locked_until ?? null,
      is_blocked: false,
      roles: role ? [role] : undefined,
    }];
  }, [companyId, profile, role]);

  const { data: governance = { users: [], warnings: [] }, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["access-governance", companyId, profile?.id, role],
    queryFn: () => withClientTimeout(fetchGovernanceUsers(companyId!, seedProfiles), "Analisi accessi", 18_000),
    enabled: !!companyId,
    retry: 0,
    staleTime: 60 * 1000,
  });
  const users = governance.users;

  const summary = useMemo(() => buildAccessGovernanceSummary(users), [users]);
  const rankedUsers = useMemo(() => {
    return users
      .map((user) => ({ user, risk: evaluateAccessRisk(user) }))
      .sort((a, b) => b.risk.score - a.risk.score)
      .slice(0, 25);
  }, [users]);

  const checklist = [
    {
      label: "Amministratori con l'app di verifica",
      ok: summary.adminsWithout2fa === 0,
      detail: summary.adminsWithout2fa === 0
        ? "Tutti gli amministratori hanno l'app di verifica."
        : `${summary.adminsWithout2fa} ${summary.adminsWithout2fa === 1 ? "amministratore" : "amministratori"} senza l'app di verifica.`,
    },
    {
      label: "Accessi bloccati",
      ok: summary.blockedUsers + summary.lockedUsers === 0,
      detail: summary.blockedUsers + summary.lockedUsers === 0
        ? "Nessun accesso bloccato."
        : `${summary.blockedUsers} ${summary.blockedUsers === 1 ? "bloccato" : "bloccati"} dall'amministratore, ${summary.lockedUsers} per password sbagliate.`,
    },
    {
      label: "Accessi che non si usano da tempo",
      ok: summary.neverLoggedUsers + summary.inactiveUsers === 0,
      detail: summary.neverLoggedUsers + summary.inactiveUsers === 0
        ? "Nessun accesso fermo da tempo."
        : `${summary.neverLoggedUsers} ${summary.neverLoggedUsers === 1 ? "non è mai entrato" : "non sono mai entrati"}, ${summary.inactiveUsers} ${summary.inactiveUsers === 1 ? "non entra" : "non entrano"} da più di 90 giorni.`,
    },
    {
      label: "Accessi da altre aziende e collaboratori esterni",
      ok: summary.highRiskUsers === 0,
      detail: summary.highRiskUsers === 0
        ? "Nessuna persona da sistemare subito."
        : `${summary.highRiskUsers} ${summary.highRiskUsers === 1 ? "persona da sistemare" : "persone da sistemare"} subito.`,
    },
  ];

  if (!companyId) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Scegli prima un'azienda per vedere il controllo degli accessi.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Analisi accessi in corso…
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-amber-200 bg-amber-50/60">
        <CardHeader>
          <h2 className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            Non riesco a verificare tutti gli accessi
          </h2>
          <CardDescription>
            Non riesco a leggere gli accessi. Riprova tra un attimo; se continua, scrivi all'assistenza.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error instanceof Error && /timeout/i.test(error.message) && (
            <p className="rounded-md bg-background/70 px-3 py-2 text-xs text-muted-foreground">
              Il controllo ci ha messo troppo tempo a rispondere.
            </p>
          )}
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />}
            Riprova
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-semibold leading-none tracking-tight">
                <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                Controllo accessi
              </h2>
              <CardDescription className="mt-1.5">
                Chi ha accesso, chi non entra da tempo e chi ha permessi importanti senza la verifica in due passaggi.
              </CardDescription>
              <p className="mt-1 text-xs text-muted-foreground">
                Dopo la password, ogni accesso chiede già un codice: quello dell'app di verifica se la persona l'ha
                collegata, altrimenti quello che arriva per email. Qui si conta come «protetto» chi ha l'app
                (Google Authenticator o simili).
              </p>
            </div>
            <div className="min-w-[220px] rounded-lg border bg-background p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Punteggio</span>
                <span className="font-semibold">{summary.securityScore}/100</span>
              </div>
              <Progress value={summary.securityScore} className="mt-2 h-2" aria-label="Punteggio di sicurezza" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard icon={Users} label="Persone controllate" value={summary.totalUsers} />
            <KpiCard icon={ShieldAlert} label="Da sistemare subito" value={summary.highRiskUsers} tone={summary.highRiskUsers ? "bad" : "good"} />
            <KpiCard icon={KeyRound} label="Amministratori senza app di verifica" value={summary.adminsWithout2fa} tone={summary.adminsWithout2fa ? "bad" : "good"} />
            <KpiCard icon={Building2} label="Con accesso da altre aziende" value={summary.crossCompanyUsers} tone={summary.crossCompanyUsers ? "warn" : "default"} />
            <KpiCard icon={Lock} label="Accessi bloccati" value={summary.blockedUsers + summary.lockedUsers} tone={summary.blockedUsers + summary.lockedUsers ? "warn" : "good"} />
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            {checklist.map((item) => (
              <div key={item.label} className={cn(
                "rounded-lg border p-3",
                item.ok ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50",
              )}>
                <div className="flex items-center gap-2">
                  {item.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  )}
                  <p className="text-sm font-medium">{item.label}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {governance.warnings.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex flex-col gap-2 py-3 text-sm text-amber-800 md:flex-row md:items-center">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">L'elenco potrebbe essere incompleto: alcune informazioni non sono arrivate.</p>
              <p className="text-xs text-amber-700">Ricarica la pagina; se il problema resta, scrivi all'assistenza.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight">
            <UserCog className="h-4 w-4" aria-hidden="true" />
            Chi guardare per primo
          </h2>
          <CardDescription>
            Le persone più delicate sono in alto.
            {puoAprireScheda ? " Apri la scheda per correggere ruolo, permessi, verifica in due passaggi o sessioni." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rankedUsers.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nessuna persona trovata in questa azienda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead>Ruoli</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Priorità</TableHead>
                    <TableHead>Perché</TableHead>
                    {puoAprireScheda && <TableHead className="text-right"><span className="sr-only">Azioni</span></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankedUsers.map(({ user, risk }) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                          {user.source === "multi_company" && (
                            <Badge variant="outline" className="mt-1 text-[10px]">
                              Da un'altra azienda
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roleLabels.map((label) => (
                            <Badge key={label} variant="secondary" className="font-normal">
                              {label}
                            </Badge>
                          ))}
                        </div>
                        {(user.onlyAssigned || user.visibleAreasCount > 0) && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {user.onlyAssigned ? "Vede solo i dati assegnati a lui" : "Vede tutti i dati"}
                            {user.visibleAreasCount > 0 ? ` · ${user.visibleAreasCount} aree visibili` : ""}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{statusLabel(user)}</p>
                        <p className="text-xs text-muted-foreground">
                          {user.lastLoginAt ? `Visto ${user.lastLoginLabel}` : "Mai connesso"}
                          {user.activeSessions > 0 && !user.collegatoAdesso
                            ? ` · ${user.activeSessions} ${user.activeSessions === 1 ? "sessione aperta" : "sessioni aperte"}`
                            : ""}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("border font-medium whitespace-nowrap", RISK_STYLES[risk.level])}>
                          {risk.nextAction}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[360px]">
                        <div className="flex flex-wrap gap-1">
                          {risk.reasons.slice(0, 3).map((reason) => (
                            <Badge key={reason} variant="outline" className="font-normal">
                              {reason}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      {puoAprireScheda && (
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/azienda/impostazioni/utenti/${user.id}?tab=permissions`)}
                            disabled={user.email === "Profilo non leggibile"}
                            aria-label={`Apri la scheda di ${user.name}`}
                          >
                            Apri la scheda
                            <ArrowUpRight className="ml-2 h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
