import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Shield, ShieldOff, Trash2, Loader2, ShieldCheck, Search,
  MoreHorizontal, Lock, LockOpen, UserCheck, Phone, TrendingUp, Wifi, AlertTriangle, Download, Upload, CheckSquare,
  HardHat, Building2, ArrowRightLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { escapeCsvCell } from "@/lib/csvExport";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CreateUserWizard, type WizardUserFormData } from "@/components/users/CreateUserWizard";
import { StaffPermissions } from "@/components/users/PermissionsDialog";
import {
  syncLegacyMarketingFlags, syncLegacySettingsFlags, DEFAULT_PERMISSIONS, ROLE_PRESETS,
} from "@/components/users/permissionsDefaults";
import { usePermissions } from "@/hooks/usePermissions";
import { withClientTimeout } from "@/lib/query-timeout";
import { isNetworkError, sembraErrorePostgresGrezzo, userErrorMessage } from "@/lib/userErrorMessage";
import { salvaPermessiUtente } from "@/lib/permessi/salvaPermessiUtente";
import { aggiuntiviDisponibili, NOME_RUOLO, ruoliAggiuntivi, ruoloPrincipale, TESTI_RUOLO_AGGIUNTIVO, type RuoloAggiuntivo } from "@/lib/permessi/ruoliUtente";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { messaggioErrorePersone } from "@/lib/users/erroriPersone";
import { personeCollegate, ultimoSegnoDiVita } from "@/lib/users/collegamento";
import { chiaveStato, etichettaBloccoTemporaneo, ETICHETTE_STATO, type ChiaveStato } from "@/lib/users/statoPersona";
import { COLONNE_DEL_FILE, leggiCsvUtenti } from "@/lib/users/importaUtentiCsv";

import { useIsMobile } from "@/hooks/use-mobile";
import { CercaConFiltri, PannelloFiltri, PilloleFiltro, RigaMobile } from "@/components/mobile/FiltriMobile";
type EffectiveRole = "company_admin" | "company_staff" | "salesperson" | "call_center" | "employee" | "subcontractor";
type StatusFilter = "all" | ChiaveStato;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMPANY_ADMIN_ROLE = "company_admin";

interface CompanyUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  effectiveRole: EffectiveRole;
  /**
   * Tutti i ruoli assegnati (multi-ruolo supportato).
   * Esempio: un operatore d'ufficio può avere `["company_staff", "salesperson"]`
   * così compare anche nel calendario CRM e nei dropdown venditori.
   */
  allRoles: string[];
  permissions: StaffPermissions | null;
  last_login_at: string | null;
  locked_until: string | null;
  failed_login_count: number;
  /** Ha una sessione con un segno di vita negli ultimi 10 minuti (non una sessione dimenticata aperta). */
  collegato_adesso: boolean;
  /** L'ultima volta che l'app l'ha vista: la più recente fra l'ultimo accesso e l'attività delle sue sessioni. */
  ultimo_segno_di_vita: string | null;
  is_blocked: boolean;
}

type CompanyUserProfileRow = Pick<CompanyUser,
  "id" | "first_name" | "last_name" | "email" | "phone" | "last_login_at" | "locked_until" | "failed_login_count"
> & {
  company_id?: string | null;
  is_blocked?: boolean | null;
  roles?: string[] | null;
};

type MultiCompanyAccessRow = {
  user_id: string;
  company_id: string;
  access_role: string | null;
};

type RpcCompanyPerson = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
  roles?: string[] | null;
};

type CompanyUsersQueryResult = {
  users: CompanyUser[];
  warnings: string[];
};

// ─── Role Config ──────────────────────────────────────────────────────
const ROLE_CONFIG: Record<EffectiveRole, { label: string; icon: React.ElementType; color: string }> = {
  // I nomi vengono dal dizionario unico (@/lib/permessi/ruoliUtente): lo stesso
  // ruolo si chiama allo stesso modo in tutte le schermate delle persone.
  company_admin: { label: NOME_RUOLO.company_admin, icon: ShieldCheck, color: "bg-primary/10 text-primary border-primary/20" },
  company_staff: { label: NOME_RUOLO.company_staff, icon: UserCheck, color: "bg-slate-100 text-slate-700 border-slate-200" },
  salesperson: { label: NOME_RUOLO.salesperson, icon: TrendingUp, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  call_center: { label: NOME_RUOLO.call_center, icon: Phone, color: "bg-blue-50 text-blue-700 border-blue-200" },
  employee: { label: NOME_RUOLO.employee, icon: HardHat, color: "bg-amber-50 text-amber-700 border-amber-200" },
  subcontractor: { label: NOME_RUOLO.subcontractor, icon: Building2, color: "bg-purple-50 text-purple-700 border-purple-200" },
};

function RoleBadge({ role }: { role: EffectiveRole }) {
  const { label, icon: Icon, color } = ROLE_CONFIG[role];
  return (
    <Badge className={`${color} font-normal gap-1 whitespace-nowrap`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </Badge>
  );
}

/**
 * Mostra TUTTI i ruoli dell'utente (primary + secondari).
 * Utile per capire subito se un operatore ha anche ruolo commerciale.
 */
function RolesBadgeGroup({ roles }: { roles: string[] | null | undefined }) {
  const safeRoles = Array.isArray(roles) ? roles : [];
  const primary = determineEffectiveRole(safeRoles);
  // Venditore, Call Center, Operaio quando non sono già il principale.
  const extras = ruoliAggiuntivi(safeRoles, primary);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <RoleBadge role={primary} />
      {extras.map((r) => {
        const cfg = ROLE_CONFIG[r];
        if (!cfg) return null;
        const Icon = cfg.icon;
        return (
          <Tooltip key={r}>
            <TooltipTrigger asChild>
              <Badge
                className={`${cfg.color} font-normal gap-1 opacity-90 border-dashed`}
                variant="outline"
              >
                <Icon className="h-3 w-3" aria-hidden="true" />
                {cfg.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Ruolo aggiuntivo. {TESTI_RUOLO_AGGIUNTIVO[r].cosaFa}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function UserStatus({ u, breve = false }: { u: CompanyUser; breve?: boolean }) {
  const stato = chiaveStato(u);

  if (stato === "blocked") {
    return (
      <Badge variant="destructive" className="text-[10px] gap-1 font-normal whitespace-nowrap">
        <Shield className="h-2.5 w-2.5" aria-hidden="true" /> Accesso bloccato
      </Badge>
    );
  }
  if (stato === "locked") {
    return (
      // Una frase lunga («Bloccato fino alle 14:30 (password sbagliate)»): va a capo
      // in un riquadro, non in una pillola che si gonfia.
      <Badge
        variant="outline"
        className={`items-start gap-1 text-[10px] font-normal leading-tight text-amber-600 border-amber-300 bg-amber-50 ${
          breve ? "whitespace-nowrap" : "rounded-md px-2 py-1 text-left whitespace-normal"
        }`}
      >
        <Lock className="mt-px h-2.5 w-2.5 shrink-0" aria-hidden="true" /> {etichettaBloccoTemporaneo(u.locked_until!, new Date(), breve)}
      </Badge>
    );
  }
  if (stato === "online") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-600">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
        Collegato adesso
      </span>
    );
  }
  if (u.ultimo_segno_di_vita) {
    return (
      <span className="text-xs text-muted-foreground">
        Visto {formatDistanceToNow(new Date(u.ultimo_segno_di_vita), { addSuffix: true, locale: it })}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground italic">Mai connesso</span>;
}

function getUserStatusKey(u: CompanyUser): ChiaveStato {
  return chiaveStato(u);
}

/** Il ruolo principale con la classifica della scheda utente e del database
 *  (@/lib/permessi/ruoliUtente): prima qui Operaio stava sopra Utente, e la
 *  stessa persona risultava «Operaio» nell'elenco e «Utente» nella scheda. */
function determineEffectiveRole(roles: string[]): EffectiveRole {
  return ruoloPrincipale(roles) ?? "company_staff";
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeAccessRole(role: string | null | undefined): EffectiveRole | null {
  if (role === "worker") return "employee";
  if (
    role === "company_admin" ||
    role === "company_staff" ||
    role === "salesperson" ||
    role === "call_center" ||
    role === "employee" ||
    role === "subcontractor"
  ) {
    return role;
  }
  return null;
}

async function readUsersOptionalRows<T>(
  task: PromiseLike<{ data: unknown; error: unknown }>,
  label: string,
  timeoutMs = 6_000,
): Promise<{ rows: T[]; warning?: string }> {
  try {
    const response = await withClientTimeout(task, label, timeoutMs);
    if (response.error) {
      const message = response.error instanceof Error ? response.error.message : "lettura non disponibile";
      return { rows: [], warning: `${label}: ${message}` };
    }
    return { rows: (response.data ?? []) as T[] };
  } catch (error) {
    return {
      rows: [],
      warning: error instanceof Error ? error.message : `${label}: lettura non disponibile`,
    };
  }
}

// ─── Delete User Dialog ───────────────────────────────────────────────
function DeleteUserDialog({
  user: targetUser,
  open,
  onOpenChange,
  companyUsers,
  onConfirm,
  isDeleting,
}: {
  user: CompanyUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyUsers: CompanyUser[];
  onConfirm: (userId: string, reassignToUserId?: string) => void;
  isDeleting: boolean;
}) {
  const [reassignTo, setReassignTo] = useState<string>("none");

  if (!targetUser) return null;

  const eligibleUsers = companyUsers.filter(
    (u) => u.id !== targetUser.id && u.effectiveRole !== "employee" && u.effectiveRole !== "subcontractor"
  );

  const roleLabel = ROLE_CONFIG[targetUser.effectiveRole]?.label || targetUser.effectiveRole;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
            Elimina utente
          </DialogTitle>
          <DialogDescription>
            Stai per eliminare <strong>{targetUser.first_name} {targetUser.last_name}</strong> ({roleLabel}).
            L'utente non potr&agrave; pi&ugrave; accedere al sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-4 w-4" />
              Dati associati
            </p>
            <p>
              Eventuali ordini, fatture e documenti associati a questo utente rimarranno nel sistema
              ma senza riferimento all'utente eliminato.
            </p>
          </div>

          {eligibleUsers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="riassegna-a" className="flex items-center gap-1.5 text-sm">
                <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Riassegna i dati a un altro utente (facoltativo)
              </Label>
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger id="riassegna-a">
                  <SelectValue placeholder="Non riassegnare" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non riassegnare — lascia senza riferimento</SelectItem>
                  {eligibleUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.first_name} {u.last_name} ({ROLE_CONFIG[u.effectiveRole]?.label})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Annulla
          </Button>
          <Button
            variant="destructive"
            disabled={isDeleting}
            onClick={() => {
              onConfirm(targetUser.id, reassignTo !== "none" ? reassignTo : undefined);
            }}
          >
            {isDeleting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />Eliminazione…</>
            ) : (
              <><Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />Elimina definitivamente</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────
export function UsersConfig() {
  const isMobile = useIsMobile();
  const { user, effectiveCompany, profile, role } = useAuth();
  const permissions = usePermissions();
  // Creare, importare, bloccare, cambiare i ruoli ed eliminare le persone lo fa
  // solo un amministratore (lo impone il server). «Team & Utenti — Modifica»
  // serve ai team e alle notifiche dei colleghi, non a questo elenco: prima qui
  // accendeva tutti i pulsanti e chi li toccava prendeva un rifiuto.
  const canManageUsers = permissions.isAdmin;
  // La scheda di una persona si apre anche a chi può solo guardare: la mostra in
  // sola lettura. Serve il permesso della rotta (Persone & Accessi — Vedi).
  const canOpenCard = permissions.isAdmin || permissions.canViewSettingsPeople;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const effectiveCompanyId = effectiveCompany?.id;

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompanyUser | null>(null);

  // ── Teams ───────────────────────────────────────────────────────────
  // Cache lunga: i team cambiano raramente (configurati una tantum dagli admin).
  // staleTime 10min evita ri-fetch su tab-switch / drawer open/close.
  const { data: teams = [] } = useQuery({
    queryKey: ["teams-filter", effectiveCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams").select("id, name")
        .eq("company_id", effectiveCompanyId!).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveCompanyId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // QueryKey stabile: `teams.map(t => t.id)` come dep ricreava array a ogni
  // render → cache React Query "bustata" inutilmente (anche se i team non
  // cambiavano). Stabilizziamo serializzando in stringa via useMemo.
  const teamIdsKey = useMemo(
    () => teams.map((t) => t.id).sort().join(","),
    [teams],
  );
  const teamIds = useMemo(() => teams.map((t) => t.id), [teams]);

  const { data: teamMemberships = [] } = useQuery({
    queryKey: ["team-memberships-filter", effectiveCompanyId, teamIdsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id, team_id")
        .in("team_id", teamIds)
        // Bound paranoico: una company con 1000 utenti × 10 team avrebbe
        // 10000 righe. Limit 5000 è di sicurezza, oltre meglio paginare.
        .limit(5000);
      if (error) throw error;
      return data;
    },
    enabled: teams.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // ── Company Users Query ─────────────────────────────────────────────
  const { data: companyUsersResult = { users: [], warnings: [] }, isLoading } = useQuery<CompanyUsersQueryResult>({
    queryKey: ["company-users", effectiveCompanyId, profile?.id, role],
    queryFn: async () => {
      const warnings: string[] = [];
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        args: Record<string, string>,
      ) => Promise<{ data: unknown; error: unknown }>;

      const [rpcProfilesResult, dbProfilesResult, accessRowsResult] = await Promise.all([
        readUsersOptionalRows<RpcCompanyPerson>(
          rpc.call(supabase, "get_internal_chat_profiles", { p_company_id: effectiveCompanyId! }),
          "Directory utenti RPC",
          15_000,
        ),
        readUsersOptionalRows<CompanyUserProfileRow>(
          supabase
            .from("profiles")
            .select("id, first_name, last_name, email, phone, company_id, last_login_at, locked_until, failed_login_count, is_blocked")
            .eq("company_id", effectiveCompanyId!)
            .limit(3000),
          "Caricamento utenti",
          15_000,
        ),
        readUsersOptionalRows<MultiCompanyAccessRow>(
          supabase
            .from("multi_company_access")
            .select("user_id, company_id, access_role")
            .eq("company_id", effectiveCompanyId!)
            .limit(3000),
          "Accessi multi-azienda",
          15_000,
        ),
      ]);
      if (dbProfilesResult.warning) warnings.push(dbProfilesResult.warning);
      if (accessRowsResult.warning) warnings.push(accessRowsResult.warning);
      if (dbProfilesResult.rows.length === 0 && rpcProfilesResult.warning) warnings.push(rpcProfilesResult.warning);

      const seedProfiles: CompanyUserProfileRow[] = profile?.id && effectiveCompanyId
        ? [{
          id: profile.id,
          first_name: profile.first_name ?? "",
          last_name: profile.last_name ?? "",
          email: profile.email ?? user?.email ?? "",
          phone: profile.phone ?? null,
          company_id: effectiveCompanyId,
          last_login_at: profile.last_login_at ?? null,
          locked_until: profile.locked_until ?? null,
          failed_login_count: profile.failed_login_count ?? 0,
          is_blocked: false,
        }]
        : [];

      const rpcProfiles: CompanyUserProfileRow[] = rpcProfilesResult.rows.map((person) => ({
        id: person.id,
        first_name: person.first_name ?? "",
        last_name: person.last_name ?? "",
        email: person.email ?? "",
        phone: null,
        company_id: effectiveCompanyId,
        last_login_at: null,
        locked_until: null,
        failed_login_count: 0,
        roles: Array.isArray(person.roles) ? person.roles : null,
      }));

      const profilesById = new Map<string, CompanyUserProfileRow>();
      [...rpcProfiles, ...seedProfiles, ...dbProfilesResult.rows].forEach((current) => {
        const previous = profilesById.get(current.id);
        profilesById.set(current.id, {
          ...previous,
          ...current,
          roles: uniqueValues([
            ...(previous?.roles ?? []),
            ...(current.roles ?? []),
          ]),
        });
      });

      const accessRows = accessRowsResult.rows;
      const accessIds = uniqueValues(accessRows.map((row) => row.user_id));
      const missingAccessProfileIds = accessIds.filter((id) => !profilesById.has(id));
      if (missingAccessProfileIds.length > 0) {
        const accessProfilesResult = await readUsersOptionalRows<CompanyUserProfileRow>(
          supabase
            .from("profiles")
            .select("id, first_name, last_name, email, phone, company_id, last_login_at, locked_until, failed_login_count, is_blocked")
            .in("id", missingAccessProfileIds)
            .limit(3000),
          "Profili accessi collegati",
          15_000,
        );
        if (accessProfilesResult.warning) warnings.push(accessProfilesResult.warning);
        accessProfilesResult.rows.forEach((current) => {
          if (!profilesById.has(current.id)) profilesById.set(current.id, current);
        });
      }

      const userIds = uniqueValues([
        ...Array.from(profilesById.keys()),
        ...accessIds,
      ]);
      if (userIds.length === 0) return { users: [], warnings };

      // Bound paranoici su queries multi-utente: anche se userIds è già
      // limitato dalla query profiles a monte, esplicitare i limit evita
      // payload runaway su company molto grandi (3000+ utenti).
      const shouldFetchRoles = rpcProfiles.length === 0;
      const [rolesResult, sessionsResult] = await Promise.all([
        shouldFetchRoles
          ? readUsersOptionalRows<{ user_id: string; role: string }>(supabase
            .from("user_roles")
            .select("user_id, role")
            .in("user_id", userIds)
            .limit(5000), "Ruoli utenti", 15_000)
          : Promise.resolve({ rows: [] as { user_id: string; role: string }[] }),
        readUsersOptionalRows<{ user_id: string; last_active_at: string | null }>(supabase
          .from("user_sessions")
          .select("user_id, last_active_at")
          .eq("company_id", effectiveCompanyId!)
          .eq("is_active", true)
          .limit(2000), "Sessioni utenti", 10_000),
      ]);
      [rolesResult, sessionsResult].forEach((result) => {
        if (result.warning) warnings.push(result.warning);
      });

      const rolesByUser: Record<string, string[]> = {};
      if (profile?.id && role) rolesByUser[profile.id] = [role];
      profilesById.forEach((companyProfile) => {
        if (companyProfile.roles?.length) {
          rolesByUser[companyProfile.id] = uniqueValues([
            ...(rolesByUser[companyProfile.id] ?? []),
            ...companyProfile.roles,
          ]);
        }
      });
      rolesResult.rows.forEach((r) => {
        if (!rolesByUser[r.user_id]) rolesByUser[r.user_id] = [];
        rolesByUser[r.user_id].push(r.role);
      });

      const accessRoleByUser: Record<string, EffectiveRole> = {};
      accessRows.forEach((row) => {
        const accessRole = normalizeAccessRole(row.access_role);
        if (accessRole) accessRoleByUser[row.user_id] = accessRole;
      });

      // «Collegato adesso» = una sessione aperta con un segno di vita negli ultimi
      // 10 minuti. Contare le sessioni «attive» dava 76 persone online quando
      // nessuno lo era: una sessione resta aperta finché non la chiude qualcuno.
      const collegati = personeCollegate(sessionsResult.rows);
      const sessioniByUser: Record<string, { last_active_at: string | null }[]> = {};
      sessionsResult.rows.forEach((s) => {
        (sessioniByUser[s.user_id] ||= []).push({ last_active_at: s.last_active_at });
      });

      const blockedByUser: Record<string, boolean> = {};
      profilesById.forEach((row) => { blockedByUser[row.id] = row.is_blocked === true; });

      // La RPC get_internal_chat_profiles è la fonte AUTOREVOLE per lo staff
      // (INNER JOIN user_roles con whitelist ruoli piattaforma): se risponde,
      // chi non compare lì e non ha accessi multi-azienda/ruoli noti è un
      // cliente del portale, non un utente azienda.
      const rpcAuthoritative = rpcProfiles.length > 0;

      const users = userIds.map((uid) => {
        const profile = profilesById.get(uid);
        const accessRole = accessRoleByUser[uid];
        // Ruoli NOTI (RPC / user_roles / multi_company_access / auth corrente).
        const knownRoles = uniqueValues([
          ...(accessRole ? [accessRole] : []),
          ...(rolesByUser[uid] || []),
        ]);
        const safeRoles = knownRoles.length > 0 ? knownRoles : ["company_staff"];
        return [{
          id: uid,
          first_name: profile?.first_name ?? "Utente",
          last_name: profile?.last_name ?? "collegato",
          email: profile?.email ?? "Profilo non leggibile",
          phone: profile?.phone ?? null,
          last_login_at: profile?.last_login_at ?? null,
          locked_until: profile?.locked_until ?? null,
          failed_login_count: profile?.failed_login_count ?? 0,
          effectiveRole: determineEffectiveRole(safeRoles),
          allRoles: safeRoles,
          permissions: null,
          collegato_adesso: collegati.has(uid),
          ultimo_segno_di_vita: ultimoSegnoDiVita(profile?.last_login_at ?? null, sessioniByUser[uid] ?? []),
          is_blocked: blockedByUser[uid] ?? false,
          hasKnownStaffRole: knownRoles.some((r) => r !== "customer"),
        }];
      }).flat()
        // BUGFIX v2: questa pagina (Persone & Accessi) deve mostrare SOLO gli
        // utenti-piattaforma (admin/staff/venditori/operai/call-center/
        // subappaltatori), NON i clienti col portale (ruolo `customer`).
        // Il filtro v1 su allRoles era vanificato dal default "company_staff"
        // assegnato ai profili senza ruoli caricati: con RPC attiva i ruoli
        // dei clienti non venivano mai letti (shouldFetchRoles=false) → 358
        // clienti passavano travestiti da Operatore. Ora:
        //  - RPC autorevole → tieni solo chi ha un ruolo staff NOTO;
        //  - RPC fallita (fallback resiliente) → tieni anche gli sconosciuti
        //    come Operatore (meglio uno staff in più che nasconderlo), ma
        //    escludi sempre chi risulta SOLO customer da user_roles.
        .filter((u) =>
          u.hasKnownStaffRole ||
          (!rpcAuthoritative && u.allRoles.every((r) => r !== "customer")),
        )
        .map(({ hasKnownStaffRole: _hasKnownStaffRole, ...u }) => u) as CompanyUser[];

      return { users, warnings };
    },
    enabled: !!effectiveCompanyId,
    staleTime: 5 * 60 * 1000,
  });

  const authFallbackUsers = useMemo<CompanyUser[]>(() => {
    if (!user?.id) return [];
    const fallbackRoles = role ? [role] : ["company_admin"];
    return [{
      id: user.id,
      first_name: profile?.first_name ?? "",
      last_name: profile?.last_name ?? "",
      email: profile?.email ?? user.email ?? "",
      phone: profile?.phone ?? null,
      effectiveRole: determineEffectiveRole(fallbackRoles),
      allRoles: fallbackRoles,
      permissions: null,
      last_login_at: profile?.last_login_at ?? null,
      locked_until: profile?.locked_until ?? null,
      failed_login_count: profile?.failed_login_count ?? 0,
      collegato_adesso: false,
      ultimo_segno_di_vita: profile?.last_login_at ?? null,
      is_blocked: false,
    }];
  }, [profile, role, user]);
  const companyUsers = companyUsersResult.users;
  const companyUsersWarnings = companyUsersResult.warnings;
  const visibleCompanyUsers = companyUsers.length > 0 ? companyUsers : authFallbackUsers;

  // ── KPI ─────────────────────────────────────────────────────────────
  const roleCounts = visibleCompanyUsers.reduce((acc, u) => {
    acc[u.effectiveRole] = (acc[u.effectiveRole] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const teamIdsByUser = teamMemberships.reduce((acc, membership) => {
    const userId = membership.user_id;
    if (!acc[userId]) acc[userId] = new Set<string>();
    acc[userId].add(membership.team_id);
    return acc;
  }, {} as Record<string, Set<string>>);

  const statusCounts = visibleCompanyUsers.reduce((acc, u) => {
    const status = getUserStatusKey(u);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Partial<Record<ChiaveStato, number>>);

  const writeAuditLog = async (
    action: string,
    targetUserId: string | null,
    details: Record<string, unknown> = {}
  ) => {
    if (!effectiveCompanyId || !user?.id) return;
    const { error } = await supabase.from("user_audit_log").insert({
      company_id: effectiveCompanyId,
      actor_id: user.id,
      target_user_id: targetUserId,
      action,
      details,
    });
    if (error) logger.error("Failed to write user audit log:", error);
  };

  // ── Create User ─────────────────────────────────────────────────────
  const handleCreateUser = async (data: WizardUserFormData): Promise<{ temporaryPassword?: string }> => {
    setIsCreating(true);
    try {
      if (!effectiveCompanyId) throw new Error("Scegli prima un'azienda");
      const normalizedEmail = data.email.trim().toLowerCase();
      if (!EMAIL_RE.test(normalizedEmail)) {
        throw new Error("Scrivi un indirizzo email valido");
      }

      const { data: existingProfile, error: existingError } = await supabase
        .from("profiles")
        .select("id")
        .eq("company_id", effectiveCompanyId)
        .ilike("email", normalizedEmail)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existingProfile) {
        throw new Error("Esiste già una persona con questa email in azienda");
      }

      const response = await supabase.functions.invoke("create-company-staff", {
        body: {
          first_name: data.first_name, last_name: data.last_name,
          email: normalizedEmail, company_id: effectiveCompanyId,
          role_type: data.role_type, password: data.password,
          // I permessi viaggiano nell'insert della edge (record completo):
          // l'update client più sotto resta solo come rete di sicurezza.
          permissions: data.permissions
            ? syncLegacySettingsFlags(syncLegacyMarketingFlags(data.permissions))
            : undefined,
        },
      });

      if (response.error) {
        let errorMessage = "Non sono riuscito a creare la persona. Riprova tra un attimo.";
        try {
          const errorBody = await response.error.context?.json?.();
          if (errorBody?.error) errorMessage = errorBody.error;
        } catch {
          if (response.error.message && !response.error.message.includes("non-2xx")) {
            errorMessage = response.error.message;
          }
        }
        throw new Error(errorMessage);
      }
      if (response.data?.error) throw new Error(response.data.error);

      // Update permissions
      const rolesWithPermissions = ["company_staff", "salesperson", "call_center", "employee", "subcontractor"];
      if (rolesWithPermissions.includes(data.role_type) && data.permissions && response.data?.user_id) {
        try {
          await salvaPermessiUtente(response.data.user_id, effectiveCompanyId!, {
            ...data.permissions,
            only_assigned: data.permissions.only_assigned || false,
          });
        } catch (permUpdateError) {
          logger.error("Failed to update permissions:", permUpdateError);
          toast.warning("Utente creato, ma i permessi non sono stati salvati: aprilo e impostali dalla sua scheda");
        }
      }

      // Ensure the salesperson record created by the Edge Function carries the UI commission values.
      if (data.role_type === "salesperson" && response.data?.user_id && effectiveCompanyId) {
        const salespersonPayload = {
          first_name: data.first_name,
          last_name: data.last_name,
          email: normalizedEmail,
          commission_type: "percentage_sold",
          commission_value: data.commission_percentage ?? 0,
          is_active: true,
        };
        const { data: existingSalesperson, error: spLookupError } = await supabase
          .from("salespeople")
          .select("id")
          .eq("company_id", effectiveCompanyId)
          .eq("user_id", response.data.user_id)
          .maybeSingle();
        if (spLookupError) throw spLookupError;

        const { error: spError } = existingSalesperson?.id
          ? await supabase.from("salespeople").update(salespersonPayload).eq("id", existingSalesperson.id)
          : await supabase.from("salespeople").insert({
            ...salespersonPayload,
            company_id: effectiveCompanyId,
            user_id: response.data.user_id,
          });
        if (spError) {
          logger.error("Failed to create salespeople record:", spError);
          toast.warning("Utente creato, ma il profilo venditore non è stato creato");
        }
      }

      // MVP "persona": stipendio dipendente + venditore ASSUNTO → scheda Dipendente.
      // Scritture follow-up (l'edge crea login + eventuale scheda venditore/operaio;
      // qui aggiungiamo stipendio e, per il venditore assunto, la scheda Dipendente).
      const createdUserId = response.data?.user_id;
      if (createdUserId && effectiveCompanyId) {
        // Operaio/Tecnico: imposta lo stipendio sulla scheda dipendente creata dall'edge.
        if (data.role_type === "employee" && data.gross_salary != null) {
          const { error: salErr } = await supabase
            .from("employees")
            .update({ gross_salary: data.gross_salary })
            .eq("user_id", createdUserId)
            .eq("company_id", effectiveCompanyId);
          if (salErr) { logger.error("update stipendio dipendente:", salErr); toast.warning("Utente creato, stipendio non salvato"); }
        }
        // Flag "è anche un dipendente" (Operatore/Amministratore/Venditore) → crea la
        // scheda Dipendente collegata (stipendio opzionale). Per il Venditore, flag ON
        // = assunto; flag OFF = P.IVA a provvigione (nessuna scheda dipendente).
        const alsoEmployeeRoles =
          data.role_type === "company_staff" || data.role_type === "company_admin" || data.role_type === "salesperson";
        if (alsoEmployeeRoles && data.also_employee) {
          const empRoleType = data.role_type === "salesperson" ? "venditore" : "impiegato";
          const { data: existingEmp } = await supabase
            .from("employees").select("id")
            .eq("user_id", createdUserId).eq("company_id", effectiveCompanyId).maybeSingle();
          if (!existingEmp?.id) {
            const { error: empErr } = await supabase.from("employees").insert({
              company_id: effectiveCompanyId,
              user_id: createdUserId,
              first_name: data.first_name,
              last_name: data.last_name,
              email: normalizedEmail,
              role_type: empRoleType,
              gross_salary: data.gross_salary ?? null,
              is_active: true,
            });
            if (empErr) { logger.error("insert scheda dipendente (flag anche-dipendente):", empErr); toast.warning("Utente creato, scheda Dipendente non creata"); }
          } else if (data.gross_salary != null) {
            await supabase.from("employees").update({ gross_salary: data.gross_salary }).eq("id", existingEmp.id);
          }
        }
      }

      // Audit log (non bloccante: se fallisce logghiamo ma non interrompiamo il flusso)
      if (effectiveCompanyId) {
        const { error: auditErr } = await supabase.from("user_audit_log").insert({
          company_id: effectiveCompanyId, actor_id: user!.id,
          target_user_id: response.data.user_id, action: "user_created",
          details: { role: data.role_type, email: normalizedEmail, commission_percentage: data.commission_percentage },
        });
        if (auditErr) logger.error("Audit log non registrato (user_created):", auditErr);
      }

      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      queryClient.invalidateQueries({ queryKey: ["salespeople"] });
      queryClient.invalidateQueries({ queryKey: ["sub-campo-list"] });

      toast.success("Utente creato", {
        description: `${data.first_name} ${data.last_name} — ${NOME_RUOLO[data.role_type as keyof typeof NOME_RUOLO] || NOME_RUOLO.company_staff}`,
      });

      return { temporaryPassword: response.data.temporary_password };
    } catch (error) {
      toast.error(messaggioErrorePersone(error, "Non sono riuscito a creare la persona. Riprova tra un attimo."));
      throw error;
    } finally {
      setIsCreating(false);
    }
  };

  // ── Delete User ─────────────────────────────────────────────────────
  const deleteUserMutation = useMutation({
    mutationFn: async ({ userId, reassignToUserId }: { userId: string; reassignToUserId?: string }) => {
      const { data, error: fnError } = await supabase.functions.invoke("delete-company-user", {
        body: { userId, reassignToUserId, company_id: effectiveCompanyId },
      });
      // Il motivo vero sta nel corpo della risposta: error.message dice solo
      // «Edge Function returned a non-2xx status code».
      if (fnError) throw new Error(await edgeErrorMessage(fnError, ""));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      queryClient.invalidateQueries({ queryKey: ["salespeople"] });
      queryClient.invalidateQueries({ queryKey: ["sub-campo-list"] });
      toast.success("Utente eliminato");
      setDeleteTarget(null);
      setSelectedUsers(new Set());
    },
    onError: (e: Error) => {
      toast.error(messaggioErrorePersone(e, "Non sono riuscito a eliminare la persona. Riprova tra un attimo."));
    },
  });

  const unlockAccountMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ locked_until: null, failed_login_count: 0 } as never)
        .eq("id", userId).eq("company_id", effectiveCompanyId!);
      if (error) throw error;
      await writeAuditLog("user_unlocked", userId, { source: "people_list" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast.success("Account sbloccato");
    },
    onError: () => toast.error("Non sono riuscito a sbloccare l'account. Riprova tra un attimo."),
  });

  const blockAccessMutation = useMutation({
    mutationFn: async ({ userId, block }: { userId: string; block: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_blocked: block,
          blocked_at: block ? new Date().toISOString() : null,
          blocked_by: block ? user?.id : null,
          block_reason: block ? "Bloccato dall'amministratore" : null,
        } as never)
        .eq("id", userId).eq("company_id", effectiveCompanyId!);
      if (error) throw error;
      await writeAuditLog(block ? "user_locked" : "user_unlocked", userId, {
        source: "people_list",
        blocked: block,
      });
    },
    onSuccess: (_, { block }) => {
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast.success(block ? "Accesso bloccato" : "Accesso ripristinato");
    },
    onError: () => toast.error("Non sono riuscito a cambiare lo stato dell'accesso. Riprova tra un attimo."),
  });

  // ── Ruoli aggiuntivi (Venditore, Call Center, Operaio) ──────────────
  // Chiunque, amministratore compreso, può avere ANCHE un altro ruolo: così
  // compare nel CRM, nel call center o entra nell'Area Campo.
  const toggleSecondaryRoleMutation = useMutation({
    // Lo fa il database (imposta_ruolo_aggiuntivo): su user_roles scrive solo
    // il super admin, e per gli amministratori delle aziende la spunta non ha
    // mai funzionato (21/09/2026). La funzione crea o riattiva anche la riga
    // in salespeople, come faceva qui la pagina.
    meta: { silent: true },
    mutationFn: async ({
      userId,
      role,
      add,
    }: {
      userId: string;
      role: RuoloAggiuntivo;
      add: boolean;
    }) => {
      if (!effectiveCompanyId) throw new Error("Scegli prima un'azienda");
      const { error } = await supabase.rpc("imposta_ruolo_aggiuntivo" as never, {
        p_user_id: userId,
        p_company_id: effectiveCompanyId,
        p_ruolo: role,
        p_attivo: add,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_, { role, add }) => {
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      queryClient.invalidateQueries({ queryKey: ["company-staff-users"] });
      queryClient.invalidateQueries({ queryKey: ["salespeople"] });
      const testi = TESTI_RUOLO_AGGIUNTIVO[role];
      toast.success(add ? `Ruolo "${testi.nome}" aggiunto` : `Ruolo "${testi.nome}" rimosso`, {
        description: add ? testi.cosaFa : testi.tolto,
      });
    },
    // Il database risponde con una frase italiana («Solo un amministratore…»):
    // si mostra quella; gli errori tecnici passano dalla traduzione generica.
    onError: (e: unknown) => {
      const msg = (e as { message?: unknown } | null)?.message;
      toast.error(
        typeof msg === "string" && msg && !sembraErrorePostgresGrezzo(msg) && !isNetworkError(e)
          ? msg
          : userErrorMessage(e, "Non sono riuscito ad aggiornare il ruolo. Riprova tra un attimo."),
      );
    },
  });

  // ── Filters ─────────────────────────────────────────────────────────
  const isCurrentUser = (userId: string) => userId === user?.id;
  const getInitials = (fn: string, ln: string) => `${fn.charAt(0)}${ln.charAt(0)}`.toUpperCase();

  const filteredUsers = visibleCompanyUsers.filter((u) => {
    const matchesSearch = searchQuery === "" ||
      `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || u.effectiveRole === roleFilter;
    const matchesStatus = statusFilter === "all" || getUserStatusKey(u) === statusFilter;
    const matchesTeam = teamFilter === "all" || teamIdsByUser[u.id]?.has(teamFilter);
    return matchesSearch && matchesRole && matchesStatus && matchesTeam;
  });

  const selectableFilteredUsers = canManageUsers
    ? filteredUsers.filter(u => !isCurrentUser(u.id) && u.effectiveRole !== COMPANY_ADMIN_ROLE)
    : [];
  const hasActiveFilters = searchQuery.trim() !== "" || roleFilter !== "all" || statusFilter !== "all" || teamFilter !== "all";

  // ── Bulk Actions ────────────────────────────────────────────────────
  const toggleSelectUser = (userId: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectableIds = selectableFilteredUsers.map(u => u.id);
    setSelectedUsers(prev => prev.size === selectableIds.length ? new Set() : new Set(selectableIds));
  };

  const handleBulkDelete = async () => {
    setBulkDeleteOpen(false);
    const selected = Array.from(selectedUsers);
    const blocked = selected.filter((uid) => {
      const selectedUser = visibleCompanyUsers.find((u) => u.id === uid);
      return !selectedUser || isCurrentUser(uid) || selectedUser.effectiveRole === COMPANY_ADMIN_ROLE;
    });
    const deletable = selected.filter((uid) => !blocked.includes(uid));
    if (deletable.length === 0) {
      toast.error("Fra quelli scelti non c'è nessuno che si possa eliminare");
      setSelectedUsers(new Set());
      return;
    }

    setBulkActionLoading(true);
    let deleted = 0;
    let failed = 0;
    let firstError = "";
    try {
      for (const uid of deletable) {
        try {
          const { data, error } = await supabase.functions.invoke("delete-company-user", {
            body: { userId: uid, company_id: effectiveCompanyId },
          });
          const errMsg = error ? await edgeErrorMessage(error, "") : (data?.error as string | undefined);
          if (errMsg) {
            failed++;
            if (!firstError) firstError = messaggioErrorePersone(errMsg, "");
          } else {
            deleted++;
          }
        } catch (e) {
          failed++;
          if (!firstError) firstError = messaggioErrorePersone(e, "");
        }
      }
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      queryClient.invalidateQueries({ queryKey: ["salespeople"] });
      queryClient.invalidateQueries({ queryKey: ["sub-campo-list"] });
      await writeAuditLog("bulk_users_deleted", null, {
        requested: selected.length,
        deleted,
        failed,
        blocked: blocked.length,
        user_ids: deletable,
      });
      if (deleted > 0) toast.success(deleted === 1 ? "1 persona eliminata" : `${deleted} persone eliminate`);
      // Surface partial failures invece di nasconderle: l'admin deve sapere
      // quanti utenti NON sono stati eliminati e perché.
      if (failed > 0) {
        toast.error(
          `${failed === 1 ? "1 persona non eliminata" : `${failed} persone non eliminate`}${firstError ? `: ${firstError}` : ""}`,
        );
      }
      if (blocked.length > 0) {
        toast.warning(
          blocked.length === 1
            ? "1 persona non eliminata per sicurezza (un amministratore, o tu)"
            : `${blocked.length} persone non eliminate per sicurezza (amministratori, o tu)`,
        );
      }
      setSelectedUsers(new Set());
    } finally {
      setBulkActionLoading(false);
    }
  };

  // ── CSV Export ──────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const headers = ["Nome", "Cognome", "Email", "Telefono", "Ruolo", "Ultimo accesso"];
    const rows = filteredUsers.map((u) => [
      u.first_name, u.last_name, u.email, u.phone || "",
      ROLE_CONFIG[u.effectiveRole]?.label || u.effectiveRole,
      u.last_login_at ? new Date(u.last_login_at).toLocaleString("it-IT") : "Mai",
    ]);
    const csvContent = [headers, ...rows].map((r) => r.map((c) => escapeCsvCell(c, ",")).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `utenti_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    writeAuditLog("users_exported", null, {
      rows: rows.length,
      filters: { search: searchQuery || null, role: roleFilter, status: statusFilter, team: teamFilter },
    });
    toast.success("Elenco esportato", {
      description: rows.length === 1
        ? "1 persona, in base ai filtri che hai scelto."
        : `${rows.length} persone, in base ai filtri che hai scelto.`,
    });
  };

  // ── CSV Import ─────────────────────────────────────────────────────
  // Il file ha le colonne di quello che si esporta (COLONNE_DEL_FILE); come si
  // legge sta in @/lib/users/importaUtentiCsv (provato a parte).
  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (!effectiveCompanyId) {
      toast.error("Scegli prima un'azienda");
      input.value = "";
      return;
    }

    const esito = leggiCsvUtenti(await file.text());
    if (esito.vuoto) {
      toast.error(`Il file è vuoto o non ha le colonne giuste. Servono: ${COLONNE_DEL_FILE}.`);
      input.value = "";
      return;
    }

    let imported = 0;
    const failedRows: { row: number; email: string; reason: string }[] = esito.scartate.map((r) => ({
      row: r.riga,
      email: r.email,
      reason: r.motivo,
    }));

    for (const riga of esito.daImportare) {
      // Come il wizard: il preset del ruolo viaggia con la creazione. Senza,
      // chi arrivava dall'import nasceva coi soli default e non vedeva nulla.
      const permissions = syncLegacySettingsFlags(
        syncLegacyMarketingFlags({ ...DEFAULT_PERMISSIONS, ...ROLE_PRESETS[riga.roleType] }),
      );
      try {
        const { data: fnData, error: fnError } = await supabase.functions.invoke("create-company-staff", {
          body: {
            first_name: riga.firstName, last_name: riga.lastName, email: riga.email,
            company_id: effectiveCompanyId, role_type: riga.roleType, permissions,
          },
        });
        if (fnError) throw new Error(await edgeErrorMessage(fnError, ""));
        if (fnData?.error) throw new Error(fnData.error);
        imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : undefined;
        failedRows.push({
          row: riga.riga,
          email: riga.email,
          reason: msg?.includes("esiste già") ? "Email già in uso" : messaggioErrorePersone(err, "Non sono riuscito a crearla"),
        });
      }
    }
    queryClient.invalidateQueries({ queryKey: ["company-users"] });
    if (imported > 0) toast.success(imported === 1 ? "1 persona importata" : `${imported} persone importate`);
    if (failedRows.length > 0) {
      failedRows.sort((a, b) => a.row - b.row);
      const detail = failedRows.slice(0, 5).map((r) => `Riga ${r.row}: ${r.email} — ${r.reason}`).join("\n");
      toast.error(failedRows.length === 1 ? "1 riga non importata" : `${failedRows.length} righe non importate`, {
        description: detail,
        duration: 8000,
      });
    }
    input.value = "";
  };

  // ─── RENDER ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 max-sm:space-y-2">
      {/* Mobile: ricerca con il pannello filtri (ruoli e stati sono lì) e «+». */}
      <div className="flex items-center gap-2 sm:hidden">
        <CercaConFiltri
          className="min-w-0 flex-1"
          valore={searchQuery}
          onCambia={setSearchQuery}
          filtriAttivi={[roleFilter !== "all", statusFilter !== "all", teamFilter !== "all"].filter(Boolean).length}
          onApriFiltri={() => setFiltriMobileAperti(true)}
        />
        {canManageUsers && (
          <Button size="icon" className="tap-compact h-9 w-9 shrink-0" onClick={() => setCreateDialogOpen(true)} aria-label="Nuovo utente">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* ── Summary Bar ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap max-sm:hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-sm font-medium">
          <Users className="h-4 w-4" aria-hidden="true" />
          {visibleCompanyUsers.length} utenti
        </div>
        {Object.entries(ROLE_CONFIG).map(([key, cfg]) => {
          const count = roleCounts[key] || 0;
          if (count === 0) return null;
          const Icon = cfg.icon;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={roleFilter === key}
              onClick={() => setRoleFilter(roleFilter === key ? "all" : key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                roleFilter === key ? cfg.color + " ring-1 ring-offset-1" : "bg-card hover:bg-muted"
              }`}
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
              {count} {cfg.label}
            </button>
          );
        })}
        {statusCounts.blocked ? (
          <button
            type="button"
            aria-pressed={statusFilter === "blocked"}
            onClick={() => setStatusFilter(statusFilter === "blocked" ? "all" : "blocked")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === "blocked" ? "bg-destructive/10 text-destructive border-destructive/30 ring-1 ring-offset-1" : "bg-card hover:bg-muted"
            }`}
          >
            <ShieldOff className="h-3 w-3" aria-hidden="true" />
            {statusCounts.blocked} bloccati
          </button>
        ) : null}
        {statusCounts.online ? (
          <button
            type="button"
            aria-pressed={statusFilter === "online"}
            onClick={() => setStatusFilter(statusFilter === "online" ? "all" : "online")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === "online" ? "bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-offset-1" : "bg-card hover:bg-muted"
            }`}
          >
            <Wifi className="h-3 w-3" aria-hidden="true" />
            {statusCounts.online} {statusCounts.online === 1 ? "collegato adesso" : "collegati adesso"}
          </button>
        ) : null}
      </div>

      {companyUsersWarnings.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">L'elenco potrebbe essere incompleto</p>
            <p className="mt-0.5 text-xs text-amber-700">
              Alcune informazioni non sono arrivate. Ricarica la pagina; se il problema resta, scrivi all'assistenza.
            </p>
          </div>
        </div>
      )}

      {/* ── Main Card ─────────────────────────────────────────────── */}
      <Card className="max-sm:overflow-hidden">
        <CardHeader className="pb-3 max-sm:hidden">
          {/* Da 1024: ricerca e azioni sulla prima riga, i tre filtri sotto.
              Tutto in una riga non ci stava: la ricerca si riduceva alla sola
              lente e i tre menu finivano uno sotto l'altro. */}
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            {/* Search */}
            <div className="relative flex-1 max-w-sm lg:order-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Cerca per nome o email…"
                aria-label="Cerca per nome o email"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:order-3 lg:basis-full">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-9 w-[150px]" aria-label="Filtra per ruolo">
                  <SelectValue placeholder="Ruolo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i ruoli</SelectItem>
                  {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <SelectTrigger className="h-9 w-[165px]" aria-label="Filtra per stato">
                  <SelectValue placeholder="Stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  {(["online", "blocked", "locked", "never", "inactive"] as const).map((chiave) => (
                    <SelectItem key={chiave} value={chiave}>{ETICHETTE_STATO[chiave]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={teamFilter} onValueChange={setTeamFilter} disabled={teams.length === 0}>
                <SelectTrigger className="h-9 w-[160px]" aria-label="Filtra per team">
                  <SelectValue placeholder="Team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i team</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setRoleFilter("all");
                    setStatusFilter("all");
                    setTeamFilter("all");
                  }}
                >
                  Azzera i filtri
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto lg:order-2">
              {canManageUsers && (
                <Button onClick={() => setCreateDialogOpen(true)} size="sm">
                  <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  Nuovo utente
                </Button>
              )}
              {/* Niente export su telefono. */}
              {!isMobile && (
                <Button variant="outline" size="sm" onClick={handleExportCSV} title="Scarica l'elenco in un file CSV">
                  <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  Esporta (CSV)
                </Button>
              )}
              {canManageUsers && (
                <div className="relative">
                  <input type="file" accept=".csv"
                    aria-label={`Importa persone da un file CSV (colonne: ${COLONNE_DEL_FILE})`}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    onChange={handleImportCSV} />
                  <Button variant="outline" size="sm" tabIndex={-1} aria-hidden="true">
                    <Upload className="h-4 w-4 mr-1.5" aria-hidden="true" />
                    Importa (CSV)
                  </Button>
                </div>
              )}
            </div>
          </div>

          {canManageUsers && !isMobile && (
            <p className="mt-2 text-xs text-muted-foreground">
              Per importare: un file CSV con le colonne {COLONNE_DEL_FILE} (le stesse del file che esporti).
            </p>
          )}

          {/* Bulk action toolbar */}
          {selectedUsers.size > 0 && (
            <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
              <CheckSquare className="h-4 w-4 text-primary" aria-hidden="true" />
              <div className="text-sm">
                <span className="font-medium">{selectedUsers.size === 1 ? "1 selezionato" : `${selectedUsers.size} selezionati`}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  Gli amministratori e tu non si eliminano da qui.
                </span>
              </div>
              <div className="flex items-center gap-1.5 ml-auto">
                {canManageUsers && (
                  <Button size="sm" variant="destructive" disabled={bulkActionLoading} onClick={() => setBulkDeleteOpen(true)}>
                    {bulkActionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5 mr-1" aria-hidden="true" />}
                    Elimina
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelectedUsers(new Set())}>
                  Deseleziona
                </Button>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div role="status" className="flex items-center justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Caricamento delle persone…</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground max-sm:p-5">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30 max-sm:hidden" aria-hidden="true" />
              <p className="font-medium">
                {visibleCompanyUsers.length === 0 ? "Nessun utente" : "Nessun risultato"}
              </p>
              <p className="text-sm mt-1 max-sm:hidden">
                {visibleCompanyUsers.length === 0
                  ? "Crea il primo utente per cominciare."
                  : "Prova a cambiare i filtri."}
              </p>
              {canManageUsers && visibleCompanyUsers.length === 0 && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" /> Crea utente
                </Button>
              )}
            </div>
          ) : isMobile ? (
            // Mobile: una riga per persona (ruolo sotto il nome, stato a destra);
            // niente caselle di selezione né menu: si gestisce dalla scheda.
            <div className="divide-y">
              {filteredUsers.map((u) => {
                const aggiuntivi = ruoliAggiuntivi(u.allRoles, u.effectiveRole).length;
                const gestibile = canOpenCard && !isCurrentUser(u.id);
                return (
                  <RigaMobile
                    key={u.id}
                    onClick={gestibile ? () => navigate(`/azienda/impostazioni/utenti/${u.id}`) : undefined}
                    sinistra={
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="text-[11px] bg-primary/10 text-primary">
                          {getInitials(u.first_name, u.last_name)}
                        </AvatarFallback>
                      </Avatar>
                    }
                    titolo={`${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() + (isCurrentUser(u.id) ? " · tu" : "")}
                    sottotitolo={ROLE_CONFIG[u.effectiveRole]?.label + (aggiuntivi > 0 ? ` +${aggiuntivi}` : "")}
                    stato={<UserStatus u={u} breve />}
                  />
                );
              })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4">
                    {canManageUsers && (
                      <Checkbox
                        aria-label="Seleziona tutte le persone dell'elenco"
                        checked={selectableFilteredUsers.length > 0 &&
                          selectedUsers.size === selectableFilteredUsers.length}
                        onCheckedChange={toggleSelectAll}
                        disabled={selectableFilteredUsers.length === 0}
                      />
                    )}
                  </TableHead>
                  <TableHead className="min-w-[200px]">Utente</TableHead>
                  <TableHead className="w-[190px]">Ruolo</TableHead>
                  <TableHead className="w-[210px]">Stato</TableHead>
                  <TableHead className="w-12 text-right pr-4"><span className="sr-only">Azioni</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => (
                  <TableRow
                    key={u.id}
                    className={canOpenCard && !isCurrentUser(u.id) ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
                    onClick={() => canOpenCard && !isCurrentUser(u.id) && navigate(`/azienda/impostazioni/utenti/${u.id}`)}
                  >
                    <TableCell className="pl-4" onClick={e => e.stopPropagation()}>
                      {canManageUsers && !isCurrentUser(u.id) && u.effectiveRole !== COMPANY_ADMIN_ROLE && (
                        <Checkbox
                          aria-label={`Seleziona ${u.first_name} ${u.last_name}`}
                          checked={selectedUsers.has(u.id)}
                          onCheckedChange={() => toggleSelectUser(u.id)}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {getInitials(u.first_name, u.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm truncate">
                              {u.first_name} {u.last_name}
                            </span>
                            {isCurrentUser(u.id) && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Tu</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RolesBadgeGroup roles={u.allRoles} />
                    </TableCell>
                    <TableCell>
                      <UserStatus u={u} />
                    </TableCell>
                    <TableCell className="text-right pr-4" onClick={(e) => e.stopPropagation()}>
                      {canOpenCard && !isCurrentUser(u.id) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Azioni per ${u.first_name} ${u.last_name}`}>
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/azienda/impostazioni/utenti/${u.id}`)}>
                              <Shield className="h-4 w-4 mr-2" aria-hidden="true" /> {canManageUsers ? "Gestisci" : "Apri la scheda"}
                            </DropdownMenuItem>
                            {u.effectiveRole !== "company_admin" && (
                              <DropdownMenuItem onClick={() => navigate(`/azienda/impostazioni/utenti/${u.id}?tab=permissions`)}>
                                <Shield className="h-4 w-4 mr-2" aria-hidden="true" /> Permessi
                              </DropdownMenuItem>
                            )}
                            {/* Ruoli aggiuntivi: per tutti tranne il Subappaltatore */}
                            {canManageUsers && aggiuntiviDisponibili(u.effectiveRole).length > 0 && (
                              <>
                                <DropdownMenuSeparator />
                                {aggiuntiviDisponibili(u.effectiveRole).map((r) => {
                                  const attivo = ruoliAggiuntivi(u.allRoles, u.effectiveRole).includes(r);
                                  const { icon: Icona } = ROLE_CONFIG[r];
                                  const nome = TESTI_RUOLO_AGGIUNTIVO[r].nome;
                                  return (
                                    <DropdownMenuItem
                                      key={r}
                                      onClick={() => toggleSecondaryRoleMutation.mutate({ userId: u.id, role: r, add: !attivo })}
                                    >
                                      <Icona className={`h-4 w-4 mr-2 ${attivo ? "text-emerald-600" : ""}`} />
                                      {attivo ? `Rimuovi ruolo ${nome}` : `Aggiungi ruolo ${nome}`}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </>
                            )}
                            {canManageUsers && ((u.locked_until && new Date(u.locked_until) > new Date()) || u.failed_login_count > 0) && (
                              <DropdownMenuItem onClick={() => unlockAccountMutation.mutate(u.id)}>
                                <LockOpen className="h-4 w-4 mr-2" aria-hidden="true" /> Sblocca account
                              </DropdownMenuItem>
                            )}
                            {canManageUsers && u.effectiveRole !== "company_admin" && (
                              <>
                                <DropdownMenuSeparator />
                                {u.is_blocked ? (
                                  <DropdownMenuItem onClick={() => blockAccessMutation.mutate({ userId: u.id, block: false })}>
                                    <ShieldCheck className="h-4 w-4 mr-2 text-emerald-600" /> Ripristina accesso
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onClick={() => blockAccessMutation.mutate({ userId: u.id, block: true })}
                                    className="text-amber-700">
                                    <ShieldOff className="h-4 w-4 mr-2" /> Blocca accesso
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setDeleteTarget(u)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Elimina
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        <PannelloFiltri
          aperto={filtriMobileAperti}
          onAperto={setFiltriMobileAperti}
          attivi={[roleFilter !== "all", statusFilter !== "all", teamFilter !== "all"].filter(Boolean).length}
          onAzzera={() => { setRoleFilter("all"); setStatusFilter("all"); setTeamFilter("all"); }}
          risultati={filteredUsers.length}
        >
          <PilloleFiltro
            titolo="Ruolo"
            valore={roleFilter}
            onScegli={setRoleFilter}
            scelte={[
              { value: "all", label: "Tutti", n: visibleCompanyUsers.length },
              ...Object.entries(ROLE_CONFIG)
                .filter(([key]) => (roleCounts[key] || 0) > 0)
                .map(([key, cfg]) => ({ value: key, label: cfg.label, n: roleCounts[key] || 0 })),
            ]}
          />
          <PilloleFiltro
            titolo="Stato"
            valore={statusFilter}
            onScegli={(v) => setStatusFilter(v as StatusFilter)}
            scelte={[
              { value: "all", label: "Tutti" },
              { value: "online", label: ETICHETTE_STATO.online },
              { value: "never", label: ETICHETTE_STATO.never },
              { value: "blocked", label: "Bloccati" },
            ]}
          />
          {teams.length > 0 && (
            <PilloleFiltro
              titolo="Team"
              valore={teamFilter}
              onScegli={setTeamFilter}
              scelte={[{ value: "all", label: "Tutti" }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
            />
          )}
        </PannelloFiltri>

        <CreateUserWizard
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSubmit={handleCreateUser}
          isLoading={isCreating}
        />
      </Card>

      {/* Delete Dialog */}
      <DeleteUserDialog
        user={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        companyUsers={visibleCompanyUsers}
        onConfirm={(userId, reassignToUserId) => {
          deleteUserMutation.mutate({ userId, reassignToUserId });
        }}
        isDeleting={deleteUserMutation.isPending}
      />

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
              {selectedUsers.size === 1 ? "Eliminare 1 persona?" : `Eliminare ${selectedUsers.size} persone?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Le persone scelte non potranno più entrare, e i dati che le riguardano restano ma senza il loro nome.
              Gli amministratori e tu restate fuori. L'azione si registra nel registro attività.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkActionLoading}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkActionLoading}
              onClick={(event) => {
                event.preventDefault();
                handleBulkDelete();
              }}
            >
              {bulkActionLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Elimina i selezionati
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
