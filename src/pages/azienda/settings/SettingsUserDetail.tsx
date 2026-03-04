import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, Shield, Clock, Calendar, Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserProfileTab } from "@/components/users/UserProfileTab";
import { UserRolesPermissionsTab } from "@/components/users/UserRolesPermissionsTab";
import { UserAvailabilityTab } from "@/components/users/UserAvailabilityTab";
import { UserCalendarTab } from "@/components/users/UserCalendarTab";
import { UserNotificationsTab } from "@/components/users/UserNotificationsTab";
import { StaffPermissions } from "@/components/users/PermissionsDialog";

const SIDEBAR_TABS = [
  { id: "profile", label: "Informazioni Utente", icon: User },
  { id: "permissions", label: "Ruoli & Autorizzazioni", icon: Shield },
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
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && SIDEBAR_TABS.some(t => t.id === tabParam)) {
      return tabParam as TabId;
    }
    return "profile";
  });

  const { data: userData, isLoading } = useQuery({
    queryKey: ["user-detail", userId],
    queryFn: async () => {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone")
        .eq("id", userId!)
        .single();
      if (error) throw error;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);

      const role = roles?.find(r => r.role === "company_admin" || r.role === "company_staff");

      let permissions: StaffPermissions | null = null;
      if (role?.role === "company_staff") {
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
        role: role?.role as "company_admin" | "company_staff" | undefined,
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
      queryClient.invalidateQueries({ queryKey: ["user-detail", userId] });
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast({ title: "Profilo aggiornato", description: "I dati dell'utente sono stati salvati." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile salvare il profilo.", variant: "destructive" });
    },
  });

  const savePermissionsMutation = useMutation({
    mutationFn: async (permissions: StaffPermissions) => {
      const { error } = await supabase.from("staff_permissions").update(permissions).eq("user_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-detail", userId] });
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast({ title: "Permessi salvati", description: "I permessi sono stati aggiornati." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Errore durante il salvataggio dei permessi.", variant: "destructive" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async (newRole: "company_admin" | "company_staff") => {
      const currentRole = userData?.role;
      if (currentRole === newRole) return;

      // Delete old role
      if (currentRole) {
        await supabase.from("user_roles").delete().eq("user_id", userId!).eq("role", currentRole);
      }

      // Insert new role
      const { error } = await supabase.from("user_roles").insert({ user_id: userId!, role: newRole });
      if (error) throw error;

      // If changing to staff, ensure staff_permissions row exists
      if (newRole === "company_staff") {
        const { data: existing } = await supabase.from("staff_permissions").select("user_id").eq("user_id", userId!).maybeSingle();
        if (!existing) {
          await supabase.from("staff_permissions").insert({ user_id: userId! } as any);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-detail", userId] });
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast({ title: "Ruolo aggiornato", description: "Il ruolo dell'utente è stato modificato." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile cambiare il ruolo.", variant: "destructive" });
    },
  });

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

      <div className="flex gap-6 min-h-[600px]">
        <div className="w-64 shrink-0">
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
          {activeTab === "availability" && <UserAvailabilityTab />}
          {activeTab === "calendar" && <UserCalendarTab />}
          {activeTab === "notifications" && <UserNotificationsTab />}
        </div>
      </div>
    </div>
  );
}
