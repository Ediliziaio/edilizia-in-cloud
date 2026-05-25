import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, Shield, Clock, Calendar, Bell, Loader2, Wifi, FileText, Lock, HardHat, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { DEFAULT_PERMISSIONS, syncLegacyMarketingFlags, syncLegacySettingsFlags } from "@/components/users/permissionsDefaults";
import { usePermissions } from "@/hooks/usePermissions";
import { normalizeCompanyAccessRole } from "@/lib/auth/multiCompany";
import type { Database, Json } from "@/integrations/supabase/types";

type CompanyUserRole = "company_admin" | "company_staff" | "salesperson" | "call_center" | "employee" | "subcontractor";
type DbRole = Database["public"]["Enums"]["app_role"];
type UserAuditInsert = Database["public"]["Tables"]["user_audit_log"]["Insert"];

const COMPANY_LEVEL_ROLES: DbRole[] = [
  "company_admin",
  "company_staff",
  "salesperson",
  "call_center",
  "employee",
  "worker",
  "subcontractor",
];

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

function personName(userData: Pick<UserDetail, "first_name" | "last_name" | "email"> | undefined) {
  return `${userData?.first_name ?? ""} ${userData?.last_name ?? ""}`.trim() || userData?.email || "Utente";
}

async function ensureStaffPermissionsRow(userId: string, companyId: string) {
  const { data: existingPermissions } = await supabase
    .from("staff_permissions")
    .select("user_id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!existingPermissions) {
    const { error } = await supabase.from("staff_permissions").insert({ user_id: userId, company_id: companyId });
    if (error) throw error;
  }
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
        role: effectiveRole,
        access_company_id: accessCompanyId,
        is_multi_company_access: isMultiCompanyAccess,
        additionalRoles,
        permissions,
      };
    },
    enabled: !!userId && !!effectiveCompany?.id,
  });

  // ── Toggle ruolo aggiuntivo (salesperson/call_center secondario) ──
  const toggleAdditionalRoleMutation = useMutation({
    mutationFn: async ({ role: addRole, add }: { role: "salesperson" | "call_center"; add: boolean }) => {
      const companyId = userData?.access_company_id ?? userData?.company_id;
      if (!userId || !companyId) throw new Error("Utente non inizializzato");
      if (add) {
        // Select-then-insert (safe anche senza unique constraint)
        const { data: existing } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("user_id", userId)
          .eq("role", addRole)
          .maybeSingle();
        if (!existing) {
          const { error } = await supabase
            .from("user_roles")
            .insert({ user_id: userId, role: addRole });
          if (error) throw error;
        }
        // Se è salesperson, crea/riattiva riga in tabella salespeople
        if (addRole === "salesperson") {
          const { data: sp } = await supabase
            .from("salespeople")
            .select("id")
            .eq("user_id", userId)
            .eq("company_id", companyId)
            .maybeSingle();
          if (!sp) {

            await supabase.from("salespeople").insert({
              user_id: userId,
              company_id: companyId,
              first_name: userData.first_name || "",
              last_name: userData.last_name || "",
              email: userData.email || null,
              is_active: true,
            });
          } else {
            await supabase.from("salespeople").update({ is_active: true }).eq("id", sp.id);
          }
        }
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", addRole);
        if (error) throw error;
        if (addRole === "salesperson") {
          await supabase
            .from("salespeople")
            .update({ is_active: false })
            .eq("user_id", userId)
            .eq("company_id", companyId);
        }
      }
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
    onError: (e: Error) => {
      toast({
        title: "Errore",
        description: `Impossibile aggiornare il ruolo aggiuntivo: ${e.message}`,
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

      // Filter to only known permission keys to avoid sending id, user_id, created_at etc.
      const allowedKeys = Object.keys(DEFAULT_PERMISSIONS) as (keyof StaffPermissions)[];
      const base: Record<string, boolean> = {};
      for (const key of allowedKeys) {
        base[key] = (permissions[key] as boolean) ?? false;
      }

      // Sync legacy aggregate flags using the shared helpers (single source of truth)
      const synced = syncLegacySettingsFlags(syncLegacyMarketingFlags(base as unknown as StaffPermissions));

      const { error } = await supabase
        .from("staff_permissions")
        .update(synced)
        .eq("user_id", userId)
        .eq("company_id", companyId);
      if (error) throw error;
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

  const changeRoleMutation = useMutation({
    mutationFn: async (newRole: CompanyUserRole) => {
      if (!userId) throw new Error("userId mancante");
      const currentRole = userData?.role;
      if (currentRole === newRole) return;

      const companyId = userData?.access_company_id ?? userData?.company_id;
      if (!companyId) throw new Error("company_id mancante nel profilo utente");

      // GUARD 1: self-edit — non permettere di revocare il proprio ruolo admin
      if (userId === currentUser?.id && currentRole === "company_admin" && newRole !== "company_admin") {
        throw new Error(
          "Non puoi rimuovere il tuo ruolo di Amministratore. Chiedi a un altro admin di farlo."
        );
      }

      // GUARD 2: last admin — impedisci di revocare l'ultimo admin della company
      if (currentRole === "company_admin" && newRole !== "company_admin") {
        const { data: admins, error: adminCountErr } = await supabase
          .from("user_roles")
          .select("user_id, profiles!inner(company_id)")
          .eq("role", "company_admin")
          .eq("profiles.company_id", companyId);
        if (adminCountErr) {
          // Fallback: query diretta profiles
          const { data: profs } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", "company_admin");
          const adminIds = (profs ?? []).map((p) => p.user_id);
          if (adminIds.length > 0) {
            const { count } = await supabase
              .from("profiles")
              .select("id", { count: "exact", head: true })
              .in("id", adminIds)
              .eq("company_id", companyId);
            if ((count ?? 0) <= 1) {
              throw new Error(
                "Impossibile rimuovere l'ultimo amministratore. Assegna prima un altro admin."
              );
            }
          }
        } else {
          if ((admins ?? []).length <= 1) {
            throw new Error(
              "Impossibile rimuovere l'ultimo amministratore. Assegna prima un altro admin."
            );
          }
        }
      }

      if (userData?.is_multi_company_access) {
        const { data: existingAccess } = await supabase
          .from("multi_company_access")
          .select("id")
          .eq("user_id", userId)
          .eq("company_id", companyId)
          .maybeSingle();

        if (existingAccess?.id) {
          const { error } = await supabase
            .from("multi_company_access")
            .update({ access_role: newRole })
            .eq("id", existingAccess.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("multi_company_access")
            .insert({ user_id: userId, company_id: companyId, access_role: newRole });
          if (error) throw error;
        }

        if (newRole !== "company_admin") {
          await ensureStaffPermissionsRow(userId, companyId);
        }

        return;
      }

      // Remove all company-level roles first
      const { error: deleteError } = await supabase.from("user_roles").delete()
        .eq("user_id", userId)
        .in("role", COMPANY_LEVEL_ROLES);
      if (deleteError) throw deleteError;

      if (newRole === "company_admin") {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "company_admin" });
        if (error) throw error;
      } else if (newRole === "salesperson" || newRole === "call_center") {
        // Dual-role: specific role + company_staff
        const { error: e1 } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("user_roles").insert({ user_id: userId, role: "company_staff" });
        if (e2) throw e2;
      } else if (newRole === "employee") {
        // Employee gets employee role
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "employee" });
        if (error) throw error;
      } else if (newRole === "subcontractor") {
        // Subcontractor gets subcontractor role
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "subcontractor" });
        if (error) throw error;
      } else {
        // Plain company_staff
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "company_staff" });
        if (error) throw error;
      }

      // Ensure staff_permissions row exists for non-admin roles
      if (newRole !== "company_admin") {
        await ensureStaffPermissionsRow(userId, companyId);
      }

      // If salesperson, ensure salespeople record exists (o riattiva se era disattivata)
      if (newRole === "salesperson") {
        const { data: existingSp } = await supabase.from("salespeople").select("id, is_active").eq("user_id", userId).eq("company_id", companyId).maybeSingle();
        if (!existingSp) {
          await supabase.from("salespeople").insert({
            user_id: userId,
            company_id: companyId,
            first_name: userData?.first_name || "",
            last_name: userData?.last_name || "",
            email: userData?.email || "",
            is_active: true,
          });
        } else if (!existingSp.is_active) {
          await supabase.from("salespeople").update({ is_active: true }).eq("id", existingSp.id);
        }
      }

      // If subcontractor, ensure the Italian subappaltatori record exists.
      if (newRole === "subcontractor") {
        const { data: existingSub } = await supabase.from("subappaltatori").select("id").eq("user_id", userId).eq("company_id", companyId).maybeSingle();
        if (!existingSub) {
          const name = personName(userData);
          await supabase.from("subappaltatori").insert({
            user_id: userId,
            company_id: companyId,
            ragione_sociale: name,
            responsabile: name,
            email: userData?.email || "",
            user_email: userData?.email || "",
            is_active: true,
          });
        }
      }
    },
    onSuccess: (_data, newRole) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.companyUsers });
      // Audit log
      const auditCompanyId = userData?.access_company_id ?? userData?.company_id;
      if (currentUser && auditCompanyId) {
        writeUserAuditLog({
          company_id: auditCompanyId,
          actor_id: currentUser.id,
          target_user_id: userId!,
          action: "role_changed",
          details: {
            from: userData.role ?? null,
            to: newRole,
            multiCompanyAccess: userData.is_multi_company_access,
          } satisfies Json,
          is_impersonated: isImpersonating,
        });
      }
      toast({ title: "Ruolo aggiornato", description: "Il ruolo dell'utente è stato modificato." });
    },
    onError: (e: Error) => {
      toast({
        title: "Impossibile cambiare il ruolo",
        description: e.message || "Errore sconosciuto.",
        variant: "destructive",
      });
    },
  });

  // While auth is resolving, show a loading state instead of a blank/redirect flash
  if (authLoading || permissions.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canManagePeople) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
            {userData.is_blocked && (
              <Badge variant="destructive" className="gap-1 text-xs">
                <ShieldOff className="h-3 w-3" /> Bloccato
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{userData.email}</p>
        </div>
      </div>

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
              onChangeRole={(role) => changeRoleMutation.mutate(role)}
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
