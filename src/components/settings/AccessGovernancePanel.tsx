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
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  can_view_billing?: boolean | null;
  can_view_costs?: boolean | null;
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
};

type GovernanceUser = AccessRiskInput & {
  id: string;
  name: string;
  email: string;
  source: "profile" | "multi_company";
  roleLabels: string[];
  lastLoginLabel: string;
  onlyAssigned: boolean;
  visibleAreasCount: number;
};

type GovernanceFetchResult = {
  users: GovernanceUser[];
  warnings: string[];
};

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Admin",
  company_staff: "Staff",
  salesperson: "Venditore",
  call_center: "Call center",
  employee: "Operaio",
  subcontractor: "Subappaltatore",
};

const RISK_STYLES: Record<AccessRiskLevel, string> = {
  high: "border-red-200 bg-red-50 text-red-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function displayName(profile: GovernanceProfile | undefined, fallbackId: string) {
  const name = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
  return name || profile?.email || `Utente ${fallbackId.slice(0, 8)}`;
}

function hasCriticalPermissions(roles: string[], permissions: GovernancePermissionRow | undefined) {
  if (normalizeAccessRoles(roles).includes("company_admin")) return true;
  return Boolean(
    permissions?.can_view_settings ||
    permissions?.can_edit_settings_profile ||
    permissions?.can_view_settings_people ||
    permissions?.can_edit_settings_people ||
    permissions?.can_view_billing ||
    permissions?.can_view_costs ||
    permissions?.can_edit_marketing,
  );
}

function formatLastLogin(value: string | null) {
  if (!value) return "Mai connesso";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data non valida";
  return formatDistanceToNow(date, { addSuffix: true, locale: it });
}

function statusLabel(user: GovernanceUser) {
  if (user.isBlocked) return "Bloccato";
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) return "Blocco temporaneo";
  if (user.activeSessions > 0) return `${user.activeSessions} sessioni attive`;
  return user.lastLoginLabel;
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
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

async function readOptionalRows<T>(
  task: PromiseLike<{ data: unknown; error: unknown }>,
  label: string,
  timeoutMs = 6_000,
): Promise<{ rows: T[]; warning?: string }> {
  try {
    const response = await withClientTimeout(task, label, timeoutMs);
    if (response.error) {
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
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, string>,
  ) => Promise<{ data: unknown; error: unknown }>;

  const [rpcProfilesResult, directProfilesResult, accessResult] = await Promise.all([
    readOptionalRows<RpcCompanyPerson>(
      rpc.call(supabase, "get_internal_chat_profiles", { p_company_id: companyId }),
      "Profili accessi RPC",
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
  warnings.push(...[rpcProfilesResult.warning, directProfilesResult.warning, accessResult.warning]
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
      .select("user_id")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .limit(3000), "Sessioni attive"),
    readOptionalRows<GovernancePermissionRow>(supabase
      .from("staff_permissions")
      .select("user_id, can_view_settings, can_edit_settings_profile, can_view_settings_people, can_edit_settings_people, can_view_billing, can_view_costs, can_view_marketing, can_edit_marketing, only_assigned, visible_areas")
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

  const sessionsByUser = new Map<string, number>();
  for (const row of sessionsResult.rows) {
    sessionsByUser.set(row.user_id, (sessionsByUser.get(row.user_id) ?? 0) + 1);
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
    const riskInput: AccessRiskInput = {
      id: userId,
      roles: normalizedRoles,
      require2fa: profile?.require_2fa === true,
      isBlocked: profile?.is_blocked === true,
      lockedUntil: profile?.locked_until ?? null,
      lastLoginAt: profile?.last_login_at ?? null,
      activeSessions: sessionsByUser.get(userId) ?? 0,
      hasCrossCompanyAccess: source === "multi_company" || accessRoles.length > 0,
      hasCriticalPermissions: hasCriticalPermissions(normalizedRoles, permissions),
    };

    return {
      ...riskInput,
      id: userId,
      name: displayName(profile, userId),
      email: profile?.email ?? "Profilo non leggibile",
      source,
      roleLabels: normalizedRoles.map((role) => ROLE_LABELS[role] ?? role),
      lastLoginLabel: formatLastLogin(profile?.last_login_at ?? null),
      onlyAssigned: permissions?.only_assigned === true,
      visibleAreasCount: Array.isArray(permissions?.visible_areas) ? permissions.visible_areas.length : 0,
    };
  });

  return { users, warnings };
}

export function AccessGovernancePanel() {
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
      label: "Admin protetti da 2FA",
      ok: summary.adminsWithout2fa === 0,
      detail: summary.adminsWithout2fa === 0
        ? "Tutti gli admin rilevati hanno 2FA obbligatoria."
        : `${summary.adminsWithout2fa} admin senza 2FA obbligatoria.`,
    },
    {
      label: "Account bloccati o lock temporanei",
      ok: summary.blockedUsers + summary.lockedUsers === 0,
      detail: summary.blockedUsers + summary.lockedUsers === 0
        ? "Nessun blocco attivo."
        : `${summary.blockedUsers} bloccati, ${summary.lockedUsers} lock temporanei.`,
    },
    {
      label: "Account inattivi presidiati",
      ok: summary.neverLoggedUsers + summary.inactiveUsers === 0,
      detail: summary.neverLoggedUsers + summary.inactiveUsers === 0
        ? "Nessun account dormiente rilevato."
        : `${summary.neverLoggedUsers} mai connessi, ${summary.inactiveUsers} inattivi oltre 90 giorni.`,
    },
    {
      label: "Accessi esterni sotto controllo",
      ok: summary.highRiskUsers === 0,
      detail: summary.highRiskUsers === 0
        ? "Nessun rischio alto nel perimetro attuale."
        : `${summary.highRiskUsers} utenti richiedono intervento.`,
    },
  ];

  if (!companyId) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Azienda non disponibile. Seleziona un contesto aziendale per vedere la governance accessi.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Analisi accessi in corso...
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-amber-200 bg-amber-50/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Non riesco a verificare tutti gli accessi
          </CardTitle>
          <CardDescription>
            La lettura dei dati di sicurezza non ha risposto correttamente. Riprova o controlla le policy RLS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="rounded-md bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            {error instanceof Error ? error.message : "Errore sconosciuto"}
          </p>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Riprova verifica
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
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Sicurezza accessi
              </CardTitle>
              <CardDescription>
                Controllo operativo su ruoli, 2FA, sessioni, accessi esterni e permessi critici.
              </CardDescription>
            </div>
            <div className="min-w-[220px] rounded-lg border bg-background p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Score sicurezza</span>
                <span className="font-semibold">{summary.securityScore}/100</span>
              </div>
              <Progress value={summary.securityScore} className="mt-2 h-2" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard icon={Users} label="Utenti analizzati" value={summary.totalUsers} />
            <KpiCard icon={ShieldAlert} label="Rischio alto" value={summary.highRiskUsers} tone={summary.highRiskUsers ? "bad" : "good"} />
            <KpiCard icon={KeyRound} label="Admin senza 2FA" value={summary.adminsWithout2fa} tone={summary.adminsWithout2fa ? "bad" : "good"} />
            <KpiCard icon={Building2} label="Multi-azienda" value={summary.crossCompanyUsers} tone={summary.crossCompanyUsers ? "warn" : "default"} />
            <KpiCard icon={Lock} label="Bloccati" value={summary.blockedUsers + summary.lockedUsers} tone={summary.blockedUsers + summary.lockedUsers ? "warn" : "good"} />
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            {checklist.map((item) => (
              <div key={item.label} className={cn(
                "rounded-lg border p-3",
                item.ok ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50",
              )}>
                <div className="flex items-center gap-2">
                  {item.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
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
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Analisi parziale: alcune fonti accessi non hanno risposto in tempo.</p>
              <p className="text-xs text-amber-700">
                {unique(governance.warnings).slice(0, 2).join(" · ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="h-4 w-4" />
            Matrice accessi e priorità
          </CardTitle>
          <CardDescription>
            I casi più delicati sono ordinati per rischio. Apri la scheda utente per correggere ruolo, permessi, 2FA o sessioni.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rankedUsers.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nessun utente trovato nel perimetro aziendale.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead>Ruoli</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Rischio</TableHead>
                    <TableHead>Motivi</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
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
                              Accesso collegato
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
                            {user.onlyAssigned ? "Solo assegnati" : "Tutte le assegnazioni"}
                            {user.visibleAreasCount > 0 ? ` · ${user.visibleAreasCount} aree visibili` : ""}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{statusLabel(user)}</p>
                        <p className="text-xs text-muted-foreground">{user.lastLoginLabel}</p>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("border font-medium", RISK_STYLES[risk.level])}>
                          {risk.nextAction}
                        </Badge>
                        <p className="mt-1 text-[11px] text-muted-foreground">Score {risk.score}</p>
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
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/azienda/impostazioni/utenti/${user.id}?tab=permissions`)}
                          disabled={user.email === "Profilo non leggibile"}
                        >
                          Apri
                          <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
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
