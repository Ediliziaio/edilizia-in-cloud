import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, Shield, Clock, Calendar, Bell, Wifi, FileText, Lock, HardHat, ShieldOff, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { UserProfileTab } from "@/components/users/UserProfileTab";
import { UserRolesPermissionsTab } from "@/components/users/UserRolesPermissionsTab";
import { UserAvailabilityTab } from "@/components/users/UserAvailabilityTab";
import { UserCalendarTab } from "@/components/users/UserCalendarTab";
import { UserNotificationsTab } from "@/components/users/UserNotificationsTab";
import { UserSessionsTab } from "@/components/users/UserSessionsTab";
import { UserActivityLogTab } from "@/components/users/UserActivityLogTab";
import { UserSecurityTab } from "@/components/users/UserSecurityTab";
import { StaffPermissions } from "@/components/users/PermissionsDialog";
import { buildStaffPermissionsUpdate } from "@/components/users/permissionsDefaults";
import { usePermissions } from "@/hooks/usePermissions";
import { normalizeCompanyAccessRole } from "@/lib/auth/multiCompany";
import { isNetworkError, isTransientTimeoutError, sembraErrorePostgresGrezzo, userErrorMessage } from "@/lib/userErrorMessage";
import type { Database } from "@/integrations/supabase/types";

type CompanyUserRole = "company_admin" | "company_staff" | "salesperson" | "call_center" | "employee" | "subcontractor";
type UserAuditInsert = Database["public"]["Tables"]["user_audit_log"]["Insert"];


interface UserDetail {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  company_id: string | null;
  password_changed_at: string | null;
  failed_login_count: number;
  locked_until: string | null;
  require_2fa: boolean;
  last_login_at: string | null;
  last_login_ip: string | null;
  is_blocked: boolean;
  blocked_at: string | null;
  blocked_by: string | null;
  block_reason: string | null;
  role: CompanyUserRole | undefined;
  access_company_id: string | null;
  is_multi_company_access: boolean;
  /** Chi comanda in questa azienda: il suo ruolo di admin non si tocca. */
  titolare_user_id: string | null;
  e_il_titolare: boolean;
  /** Ruoli aggiuntivi commerciali (salesperson/call_center quando il primary è altro) */
  additionalRoles: ("salesperson" | "call_center")[];
  permissions: StaffPermissions | null;
}

const SIDEBAR_TABS = [
  { id: "profile", label: "Informazioni Utente", icon: User },
  { id: "permissions", label: "Ruoli & Autorizzazioni", icon: Shield },
  { id: "sessions", label: "Sessioni", icon: Wifi },
  { id: "activity", label: "Log Attività", icon: FileText },
  { id: "security", label: "Sicurezza", icon: Lock },
  { id: "availability", label: "Disponibilità", icon: Clock },
  { id: "calendar", label: "Calendario", icon: Calendar },
  { id: "notifications", label: "Notifiche", icon: Bell },
] as const;

type TabId = typeof SIDEBAR_TABS[number]["id"];

/** Salva i permessi di un utente in un'azienda (filtrati e sincronizzati). */
async function salvaPermessi(userId: string, companyId: string, permissions: StaffPermissions) {
  const synced = buildStaffPermissionsUpdate(permissions);
  const { error } = await supabase
    .from("staff_permissions")
    .update(synced)
    .eq("user_id", userId)
    .eq("company_id", companyId);
  if (error) throw error;
}

/**
 * Il messaggio da mostrare quando un cambio di ruolo non riesce. Le regole
 * stanno nel database e rispondono con una frase italiana («È l'ultimo
 * amministratore…»): va mostrata così com'è. Il gestore globale la
 * trasformerebbe in un generico «Non hai i permessi» (codice 42501), per
 * questo le due mutation di ruolo sono `silent` e l'errore lo dice questa.
 */
function messaggioErroreRuolo(e: unknown): string {
  const msg = (e as { message?: unknown } | null)?.message;
  if (typeof msg === "string" && msg && !sembraErrorePostgresGrezzo(msg) && !isNetworkError(e) && !isTransientTimeoutError(e)) {
    return msg;
  }
  return userErrorMessage(e, "Non è stato possibile cambiare il ruolo. Riprova.");
}

function writeUserAuditLog(payload: UserAuditInsert) {
  supabase.from("user_audit_log").insert(payload).then(({ error: auditErr }) => {
    if (auditErr) console.error("[audit-log] insert failed:", auditErr.message);
  });
}

export default function SettingsUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { isLoading: authLoading, user: currentUser, isImpersonating, effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const queryClient = useQueryClient();

  const canManagePeople = permissions.isAdmin || permissions.canEditSettingsPeople;

  // Wait for auth to resolve before checking permissions — prevents "Accesso negato"
  // flash on first render when role is still null (loading state).
  useEffect(() => {
    if (authLoading || permissions.isLoading) return;
    if (!canManagePeople) {
      toast({
        title: "Accesso negato",
        description: "Non hai i permessi per gestire gli utenti.",
        variant: "destructive",
      });
      navigate("/azienda/impostazioni/profilo", { replace: true });
    }
  }, [authLoading, permissions.isLoading, canManagePeople, navigate, toast]);

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && SIDEBAR_TABS.some(t => t.id === tabParam)) {
      return tabParam as TabId;
    }
    return "profile";
  });

  const { data: userData, isLoading } = useQuery<UserDetail>({
    queryKey: [...queryKeys.users.detail(userId), effectiveCompany?.id],
    queryFn: async (): Promise<UserDetail> => {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, company_id, password_changed_at, failed_login_count, locked_until, require_2fa, last_login_at, last_login_ip, is_blocked, blocked_at, blocked_by, block_reason")
        .eq("id", userId!)
        .single();
      if (error) throw error;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);

      const accessCompanyId = effectiveCompany?.id ?? profile.company_id ?? null;
      const { data: multiCompanyAccess } = accessCompanyId
        ? await supabase
          .from("multi_company_access")
          .select("access_role, company_id")
          .eq("user_id", userId!)
          .eq("company_id", accessCompanyId)
          .maybeSingle()
        : { data: null };

      const selectedAccessRole = normalizeCompanyAccessRole(multiCompanyAccess?.access_role);
      const isMultiCompanyAccess = !!multiCompanyAccess && profile.company_id !== accessCompanyId;

      // Determine effective role with priority: selected company access > global company role.
      const roleSet = new Set(roles?.map(r => r.role) || []);
      let effectiveRole: CompanyUserRole | undefined;
      if (selectedAccessRole) effectiveRole = selectedAccessRole as CompanyUserRole;
      else if (roleSet.has("company_admin")) effectiveRole = "company_admin";
      else if (roleSet.has("salesperson")) effectiveRole = "salesperson";
      else if (roleSet.has("call_center")) effectiveRole = "call_center";
      else if (roleSet.has("company_staff")) effectiveRole = "company_staff";
      else if (roleSet.has("employee")) effectiveRole = "employee";
      else if (roleSet.has("worker")) effectiveRole = "employee"; // retrocompatibilità DB
      else if (roleSet.has("subcontractor")) effectiveRole = "subcontractor";

      // Ruoli aggiuntivi commerciali (quando il primary NON è già quello)
      const additionalRoles: ("salesperson" | "call_center")[] = [];
      if (effectiveRole !== "salesperson" && roleSet.has("salesperson")) additionalRoles.push("salesperson");
      if (effectiveRole !== "call_center" && roleSet.has("call_center")) additionalRoles.push("call_center");

      // Chi comanda in questa azienda: il suo ruolo non si tocca, e i ruoli
      // degli altri amministratori li cambia solo lui. Il controllo vero sta
      // nel database (trigger proteggi_titolare_azienda); qui serve per non
      // far arrivare l'utente contro un errore grezzo.
      const { data: azienda } = accessCompanyId
        ? await supabase.from("companies").select("titolare_user_id").eq("id", accessCompanyId).maybeSingle()
        : { data: null };
      const titolareId = (azienda as { titolare_user_id?: string | null } | null)?.titolare_user_id ?? null;

      let permissions: StaffPermissions | null = null;
      // Load staff_permissions for any non-admin role (staff, salesperson, call_center all use it)
      if (effectiveRole && effectiveRole !== "company_admin") {
        const { data: perms } = await supabase
          .from("staff_permissions")
          .select("*")
          .eq("user_id", userId!)
          .eq("company_id", accessCompanyId!)
          .maybeSingle();
        if (perms) {
          permissions = perms as unknown as StaffPermissions;
        }
      }

      return {
        ...profile,
        // `last_login_ip` in tabella è di tipo inet: i tipi generati lo danno
        // `unknown` e l'interfaccia qui lo vuole stringa. Lo si restringe una
        // volta sola, sul confine, invece di trascinarsi l'errore.
        last_login_ip: (profile.last_login_ip ?? null) as string | null,
        role: effectiveRole,
        access_company_id: accessCompanyId,
        is_multi_company_access: isMultiCompanyAccess,
        titolare_user_id: titolareId,
        e_il_titolare: !!titolareId && titolareId === userId,
        additionalRoles,
        permissions,
      };
    },
    enabled: !!userId && !!effectiveCompany?.id,
  });

  // ── Toggle ruolo aggiuntivo (salesperson/call_center secondario) ──
  // Lo fa il database (imposta_ruolo_aggiuntivo): su user_roles scrive solo
  // il super admin, e per gli amministratori delle aziende la spunta non ha
  // mai funzionato (21/09/2026).
  const toggleAdditionalRoleMutation = useMutation({
    meta: { silent: true },
    mutationFn: async ({ role: addRole, add }: { role: "salesperson" | "call_center"; add: boolean }) => {
      const companyId = userData?.access_company_id ?? userData?.company_id;
      if (!userId || !companyId) throw new Error("Utente non inizializzato");
      const { error } = await supabase.rpc("imposta_ruolo_aggiuntivo" as never, {
        p_user_id: userId,
        p_company_id: companyId,
        p_ruolo: addRole,
        p_attivo: add,
        p_impersonato: isImpersonating,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_, { role: addRole, add }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.companyUsers });
      queryClient.invalidateQueries({ queryKey: ["company-staff-users"] });
      queryClient.invalidateQueries({ queryKey: ["salespeople"] });
      const label = addRole === "salesperson" ? "Venditore" : "Call Center";
      toast({
        title: add ? `Ruolo "${label}" aggiunto` : `Ruolo "${label}" rimosso`,
        description: add
          ? "L'utente ora compare nel calendario CRM e nelle liste commerciali."
          : "L'utente non appare più nel CRM (dati storici preservati).",
      });
    },
    onError: (e: unknown) => {
      toast({
        title: "Impossibile aggiornare il ruolo aggiuntivo",
        description: messaggioErroreRuolo(e),
        variant: "destructive",
      });
    },
  });

  const saveProfileMutation = useMutation({
    mutationFn: async (data: { first_name: string; last_name: string; email: string; phone: string | null }) => {
      if (!userId) throw new Error("userId mancante");
      const { error } = await supabase.from("profiles").update(data).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.companyUsers });
      toast({ title: "Profilo aggiornato", description: "I dati dell'utente sono stati salvati." });
    },
    onError: (e: Error) => {
      toast({
        title: "Errore salvataggio profilo",
        description: e.message || "Impossibile salvare il profilo.",
        variant: "destructive",
      });
    },
  });

  const savePermissionsMutation = useMutation({
    mutationFn: async (permissions: StaffPermissions) => {
      if (!userId) throw new Error("userId mancante");
      const companyId = userData?.access_company_id ?? userData?.company_id;
      if (!companyId) {
        throw new Error("company_id mancante nel profilo utente");
      }

      // Filtra alle chiavi note + sincronizza i flag legacy (helper condiviso).
      await salvaPermessi(userId, companyId, permissions);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.companyUsers });
      // Audit log (fire-and-forget, but log errors)
      const auditCompanyId = userData?.access_company_id ?? userData?.company_id;
      if (currentUser && auditCompanyId) {
        writeUserAuditLog({
          company_id: auditCompanyId,
          actor_id: currentUser.id,
          target_user_id: userId!,
          action: "permissions_updated",
          details: {},
          is_impersonated: isImpersonating,
        });
      }
      toast({ title: "Permessi salvati", description: "I permessi sono stati aggiornati." });
    },
    onError: (e: Error) => {
      toast({
        title: "Errore salvataggio permessi",
        description: e.message || "Errore durante il salvataggio dei permessi.",
        variant: "destructive",
      });
    },
  });

  // Il cambio di ruolo lo fa il database (cambia_ruolo_utente): controlla chi
  // può, applica le regole (titolare, ultimo amministratore, sé stessi),
  // scrive il registro e cambia tutto in una transazione. Prima la scheda
  // scriveva da sé in user_roles, dove solo il super admin può scrivere: per
  // gli amministratori delle aziende il cambio non funzionava mai, e le due
  // chiamate separate potevano lasciare un utente senza ruoli (21/09/2026).
  const changeRoleMutation = useMutation({
    meta: { silent: true },
    mutationFn: async ({ ruolo, permessi }: { ruolo: CompanyUserRole; permessi: StaffPermissions | null }) => {
      if (!userId) throw new Error("userId mancante");
      const companyId = userData?.access_company_id ?? userData?.company_id;
      if (!companyId) throw new Error("company_id mancante nel profilo utente");

      const { error } = await supabase.rpc("cambia_ruolo_utente" as never, {
        p_user_id: userId,
        p_company_id: companyId,
        p_ruolo: ruolo,
        p_impersonato: isImpersonating,
      } as never);
      if (error) throw error;

      // «Conferma con i permessi del ruolo»: si salvano adesso. Prima restavano
      // solo sullo schermo, e la scheda ricaricata col ruolo nuovo li perdeva.
      if (permessi && ruolo !== "company_admin") {
        await salvaPermessi(userId, companyId, permessi);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.companyUsers });
      queryClient.invalidateQueries({ queryKey: ["company-staff-users"] });
      queryClient.invalidateQueries({ queryKey: ["salespeople"] });
      toast({ title: "Ruolo aggiornato", description: "Il ruolo dell'utente è stato modificato." });
    },
    onError: (e: unknown) => {
      toast({
        title: "Impossibile cambiare il ruolo",
        description: messaggioErroreRuolo(e),
        variant: "destructive",
      });
    },
  });

  // While auth is resolving, show a loading state instead of a blank/redirect flash
  if (authLoading || permissions.isLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!canManagePeople) return null;

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Utente non trovato.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/azienda/impostazioni/utenti")}>
          Torna alla lista
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/impostazioni/utenti")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{userData.first_name} {userData.last_name}</h2>
            {userData.e_il_titolare && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <ShieldCheck className="h-3 w-3" /> Titolare
              </Badge>
            )}
            {userData.is_blocked && (
              <Badge variant="destructive" className="gap-1 text-xs">
                <ShieldOff className="h-3 w-3" /> Bloccato
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{userData.email}</p>
        </div>
      </div>

      {userData.e_il_titolare && (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">È il titolare dell'azienda</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Il suo ruolo di Amministratore non si può togliere, nemmeno da un altro amministratore: serve
              prima indicare un altro titolare. Ed è l'unico che può cambiare il ruolo agli altri amministratori.
            </p>
          </div>
        </div>
      )}

      {/* Area Campo banner */}
      {(userData.role === "employee" || userData.role === "subcontractor") && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <HardHat className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-medium">Utente Area Campo</p>
            <p className="text-amber-700 text-xs mt-0.5">
              Questo utente accede tramite{" "}
              <a href="https://lavori.ediliziaincloud.com" target="_blank" rel="noreferrer" className="underline font-medium">
                lavori.ediliziaincloud.com
              </a>
              {" "}— non dal portale principale.
            </p>
          </div>
        </div>
      )}

      {/* Mobile: horizontal scrollable tabs */}
      <div className="md:hidden overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1 min-w-max pb-2">
          {SIDEBAR_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-6 min-h-[600px]">
        {/* Desktop: vertical sidebar */}
        <div className="hidden md:block w-64 shrink-0">
          <nav className="space-y-1 sticky top-4">
            {SIDEBAR_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex-1 min-w-0">
          {activeTab === "profile" && (
            <UserProfileTab
              key={`profile-${userData.id}-${userData.role}`}
              user={userData}
              role={userData.role}
              isBlocked={userData.is_blocked}
              onSave={(data) => saveProfileMutation.mutate(data)}
              isLoading={saveProfileMutation.isPending}
            />
          )}
          {activeTab === "permissions" && (
            <UserRolesPermissionsTab
              key={`perms-${userData.id}-${userData.role}-${userData.additionalRoles.join(",")}`}
              user={{
                ...userData,
                role: userData.role,
                additionalRoles: userData.additionalRoles,
              }}
              onSave={(perms) => savePermissionsMutation.mutate(perms)}
              onChangeRole={(ruolo, permessi) => changeRoleMutation.mutate({ ruolo, permessi })}
              onToggleAdditionalRole={(role, add) =>
                toggleAdditionalRoleMutation.mutate({ role, add })
              }
              isLoading={savePermissionsMutation.isPending}
              isChangingRole={
                changeRoleMutation.isPending || toggleAdditionalRoleMutation.isPending
              }
              isCurrentUser={userId === currentUser?.id}
            />
          )}
          {activeTab === "sessions" && <UserSessionsTab userId={userId!} />}
          {activeTab === "activity" && <UserActivityLogTab userId={userId!} />}
          {activeTab === "security" && (
            <UserSecurityTab
              userId={userId!}
              user={{
                require_2fa: userData.require_2fa,
                password_changed_at: userData.password_changed_at,
                failed_login_count: userData.failed_login_count,
                locked_until: userData.locked_until,
                last_login_at: userData.last_login_at,
                last_login_ip: userData.last_login_ip,
                is_blocked: userData.is_blocked,
                blocked_at: userData.blocked_at,
                block_reason: userData.block_reason,
              }}
              isAdmin={canManagePeople}
              isCurrentUser={userId === currentUser?.id}
              isTargetAdmin={userData.role === "company_admin"}
            />
          )}
          {activeTab === "availability" && <UserAvailabilityTab />}
          {activeTab === "calendar" && <UserCalendarTab />}
          {activeTab === "notifications" && <UserNotificationsTab />}
        </div>
      </div>
    </div>
  );
}
