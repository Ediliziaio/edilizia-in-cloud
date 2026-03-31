import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, Shield, Clock, Calendar, Bell, Loader2, Wifi, FileText, Lock } from "lucide-react";
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
  role: "company_admin" | "company_staff" | "salesperson" | "call_center" | undefined;
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

export default function SettingsUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { role, isLoading: authLoading, user: currentUser, isImpersonating } = useAuth();
  const queryClient = useQueryClient();

  const isAdmin = role === "company_admin" || role === "super_admin";

  // Wait for auth to resolve before checking permissions — prevents "Accesso negato"
  // flash on first render when role is still null (loading state).
  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      toast({
        title: "Accesso negato",
        description: "Non hai i permessi per gestire gli utenti.",
        variant: "destructive",
      });
      navigate("/azienda/impostazioni/profilo", { replace: true });
    }
  }, [authLoading, isAdmin, navigate, toast]);

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && SIDEBAR_TABS.some(t => t.id === tabParam)) {
      return tabParam as TabId;
    }
    return "profile";
  });

  const { data: userData, isLoading } = useQuery<UserDetail>({
    queryKey: queryKeys.users.detail(userId),
    queryFn: async (): Promise<UserDetail> => {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, company_id, password_changed_at, failed_login_count, locked_until, require_2fa, last_login_at, last_login_ip")
        .eq("id", userId!)
        .single();
      if (error) throw error;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);

      // Determine effective role with priority: company_admin > salesperson > call_center > company_staff
      const roleSet = new Set(roles?.map(r => r.role) || []);
      let effectiveRole: "company_admin" | "company_staff" | "salesperson" | "call_center" | undefined;
      if (roleSet.has("company_admin")) effectiveRole = "company_admin";
      else if (roleSet.has("salesperson")) effectiveRole = "salesperson";
      else if (roleSet.has("call_center")) effectiveRole = "call_center";
      else if (roleSet.has("company_staff")) effectiveRole = "company_staff";

      let permissions: StaffPermissions | null = null;
      // Load staff_permissions for any non-admin role (staff, salesperson, call_center all use it)
      if (effectiveRole && effectiveRole !== "company_admin") {
        const { data: perms } = await supabase
          .from("staff_permissions")
          .select("*")
          .eq("user_id", userId!)
          .single();
        if (perms) {
          permissions = perms as unknown as StaffPermissions;
        }
      }

      return {
        ...profile,
        role: effectiveRole,
        permissions,
      };
    },
    enabled: !!userId,
  });

  const saveProfileMutation = useMutation({
    mutationFn: async (data: { first_name: string; last_name: string; email: string; phone: string | null }) => {
      const { error } = await supabase.from("profiles").update(data).eq("id", userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.companyUsers });
      toast({ title: "Profilo aggiornato", description: "I dati dell'utente sono stati salvati." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile salvare il profilo.", variant: "destructive" });
    },
  });

  const savePermissionsMutation = useMutation({
    mutationFn: async (permissions: StaffPermissions) => {
      // Filter to only known permission keys to avoid sending id, user_id, created_at etc.
      const allowedKeys = Object.keys(DEFAULT_PERMISSIONS) as (keyof StaffPermissions)[];
      const base: Record<string, boolean> = {};
      for (const key of allowedKeys) {
        base[key] = (permissions[key] as boolean) ?? false;
      }

      // Sync legacy aggregate flags using the shared helpers (single source of truth)
      const synced = syncLegacySettingsFlags(syncLegacyMarketingFlags(base as unknown as StaffPermissions));

      const companyId = userData?.company_id;
      const { error } = await supabase.from("staff_permissions").update(synced).eq("user_id", userId!).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.companyUsers });
      // Audit log
      if (currentUser && userData?.company_id) {
        supabase.from("user_audit_log").insert({
          company_id: userData.company_id,
          actor_id: currentUser.id,
          target_user_id: userId!,
          action: "permissions_updated",
          details: {},
          is_impersonated: isImpersonating,
        } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      }
      toast({ title: "Permessi salvati", description: "I permessi sono stati aggiornati." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Errore durante il salvataggio dei permessi.", variant: "destructive" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async (newRole: "company_admin" | "company_staff" | "salesperson" | "call_center") => {
      const currentRole = userData?.role;
      if (currentRole === newRole) return;

      const companyId = userData?.company_id;
      if (!companyId) throw new Error("company_id mancante nel profilo utente");

      // Remove all company-level roles first
      // Consolidate role deletion in a single query with error checking
      const { error: deleteError } = await supabase.from("user_roles").delete()
        .eq("user_id", userId!)
        .in("role", ["company_admin", "company_staff", "salesperson", "call_center"]);
      if (deleteError) throw deleteError;

      if (newRole === "company_admin") {
        // Admin only gets company_admin role
        const { error } = await supabase.from("user_roles").insert({ user_id: userId!, role: "company_admin" });
        if (error) throw error;
      } else if (newRole === "salesperson" || newRole === "call_center") {
        // Dual-role: specific role + company_staff
        const { error: e1 } = await supabase.from("user_roles").insert({ user_id: userId!, role: newRole });
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("user_roles").insert({ user_id: userId!, role: "company_staff" });
        if (e2) throw e2;
      } else {
        // Plain company_staff
        const { error } = await supabase.from("user_roles").insert({ user_id: userId!, role: "company_staff" });
        if (error) throw error;
      }

      // Ensure staff_permissions row exists for non-admin roles
      if (newRole !== "company_admin") {
        const { data: existing } = await supabase.from("staff_permissions").select("user_id").eq("user_id", userId!).maybeSingle();
        if (!existing) {
          await supabase.from("staff_permissions").insert({ user_id: userId!, company_id: companyId } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      }

      // If salesperson, ensure salespeople record exists
      if (newRole === "salesperson") {
        const { data: existingSp } = await supabase.from("salespeople").select("id").eq("user_id", userId!).maybeSingle();
        if (!existingSp) {
          // DB schema has more columns than generated types — cast is intentional
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const salespersonPayload = { user_id: userId!, company_id: companyId, first_name: userData?.first_name || "", last_name: userData?.last_name || "", email: userData?.email || "", is_active: true } as any;
          await supabase.from("salespeople").insert(salespersonPayload);
        }
      }
    },
    onSuccess: (_data, newRole) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.companyUsers });
      // Audit log
      if (currentUser && userData?.company_id) {
        // is_impersonated is a DB column not present in generated types — cast is intentional
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const auditPayload = { company_id: userData.company_id, actor_id: currentUser.id, target_user_id: userId!, action: "role_changed", details: { from: userData.role, to: newRole }, is_impersonated: isImpersonating } as any;
        supabase.from("user_audit_log").insert(auditPayload);
      }
      toast({ title: "Ruolo aggiornato", description: "Il ruolo dell'utente è stato modificato." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile cambiare il ruolo.", variant: "destructive" });
    },
  });

  // While auth is resolving, show a loading state instead of a blank/redirect flash
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) return null;

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
          <h2 className="text-lg font-semibold">{userData.first_name} {userData.last_name}</h2>
          <p className="text-sm text-muted-foreground">{userData.email}</p>
        </div>
      </div>

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
              onSave={(data) => saveProfileMutation.mutate(data)}
              isLoading={saveProfileMutation.isPending}
            />
          )}
          {activeTab === "permissions" && (
            <UserRolesPermissionsTab
              key={`perms-${userData.id}-${userData.role}`}
              user={userData}
              onSave={(perms) => savePermissionsMutation.mutate(perms)}
              onChangeRole={(role) => changeRoleMutation.mutate(role)}
              isLoading={savePermissionsMutation.isPending}
              isChangingRole={changeRoleMutation.isPending}
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
              }}
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
