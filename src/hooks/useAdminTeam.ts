import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";

// ─── TIPI ─────────────────────────────────────────────────────────────────────

export interface AdminPermissions {
  can_manage_companies: boolean;
  can_manage_plans: boolean;
  can_manage_tickets: boolean;
  can_manage_referrals: boolean;
  can_manage_admins: boolean;
  can_view_platform_stats: boolean;
  can_manage_marketing: boolean;
  allowed_company_ids: string[] | null;
}

export const DEFAULT_PERMISSIONS: AdminPermissions = {
  can_manage_companies: false,
  can_manage_plans: false,
  can_manage_tickets: false,
  can_manage_referrals: false,
  can_manage_admins: false,
  can_view_platform_stats: true,
  can_manage_marketing: false,
  allowed_company_ids: null,
};

export const PERMISSION_PRESETS: { label: string; icon: string; value: Partial<AdminPermissions> }[] = [
  {
    label: "Accesso Completo",
    icon: "🔑",
    value: {
      can_manage_companies: true, can_manage_plans: true,
      can_manage_tickets: true, can_manage_referrals: true,
      can_manage_admins: true, can_view_platform_stats: true,
      can_manage_marketing: true,
    },
  },
  {
    label: "Solo Lettura",
    icon: "👁",
    value: {
      can_manage_companies: false, can_manage_plans: false,
      can_manage_tickets: false, can_manage_referrals: false,
      can_manage_admins: false, can_view_platform_stats: true,
      can_manage_marketing: false,
    },
  },
  {
    label: "Gestore Aziende",
    icon: "🏢",
    value: {
      can_manage_companies: true, can_manage_plans: false,
      can_manage_tickets: true, can_manage_referrals: false,
      can_manage_admins: false, can_view_platform_stats: true,
      can_manage_marketing: false,
    },
  },
  {
    label: "Supporto",
    icon: "🎧",
    value: {
      can_manage_companies: false, can_manage_plans: false,
      can_manage_tickets: true, can_manage_referrals: false,
      can_manage_admins: false, can_view_platform_stats: true,
      can_manage_marketing: false,
    },
  },
];

export const PERMISSION_LABELS: { key: keyof Omit<AdminPermissions, "allowed_company_ids">; label: string; description: string }[] = [
  { key: "can_view_platform_stats", label: "Statistiche", description: "Dashboard e analytics" },
  { key: "can_manage_companies", label: "Aziende", description: "Crea, modifica, sospendi" },
  { key: "can_manage_plans", label: "Piani", description: "Gestisci piani e prezzi" },
  { key: "can_manage_tickets", label: "Ticket", description: "Gestisci supporto" },
  { key: "can_manage_referrals", label: "Referral", description: "Programma referral" },
  { key: "can_manage_marketing", label: "Marketing", description: "CRM e marketing" },
  { key: "can_manage_admins", label: "Admin Team", description: "Gestisci altri admin" },
];

export interface AdminMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  permissions: AdminPermissions | null;
  activeSessions: number;
}

// ─── HOOK: LISTA ADMIN ────────────────────────────────────────────────────────

export function useAdminTeam() {
  return useQuery({
    queryKey: queryKeys.admin.superAdmins,
    staleTime: 60_000,
    queryFn: async (): Promise<AdminMember[]> => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "list" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);

      const admins = res.data?.admins || [];
      const userIds = admins.map((a: any) => a.id);

      if (userIds.length === 0) return [];

      // Enrich with sessions count and last_login_at
      const [sessionsRes, profilesRes] = await Promise.all([
        supabase
          .from("admin_sessions")
          .select("user_id")
          .in("user_id", userIds),
        supabase
          .from("profiles")
          .select("id, avatar_url, last_login_at")
          .in("id", userIds),
      ]);

      const sessionCount = new Map<string, number>();
      (sessionsRes.data ?? []).forEach((s: any) => {
        sessionCount.set(s.user_id, (sessionCount.get(s.user_id) ?? 0) + 1);
      });

      const profileMap = new Map<string, any>();
      (profilesRes.data ?? []).forEach((p: any) => {
        profileMap.set(p.id, p);
      });

      return admins.map((a: any): AdminMember => {
        const profile = profileMap.get(a.id);
        return {
          id: a.id,
          firstName: a.first_name ?? "",
          lastName: a.last_name ?? "",
          email: a.email ?? "",
          avatarUrl: profile?.avatar_url ?? null,
          lastLoginAt: profile?.last_login_at ?? null,
          createdAt: a.created_at,
          activeSessions: sessionCount.get(a.id) ?? 0,
          permissions: a.permissions
            ? {
                can_manage_companies: a.permissions.can_manage_companies,
                can_manage_plans: a.permissions.can_manage_plans,
                can_manage_tickets: a.permissions.can_manage_tickets,
                can_manage_referrals: a.permissions.can_manage_referrals,
                can_manage_admins: a.permissions.can_manage_admins,
                can_view_platform_stats: a.permissions.can_view_platform_stats,
                can_manage_marketing: a.permissions.can_manage_marketing ?? true,
                allowed_company_ids: a.permissions.allowed_company_ids ?? null,
              }
            : null,
        };
      });
    },
  });
}

// ─── HOOK: AGGIORNA PERMESSO SINGOLO ──────────────────────────────────────────

export function useUpdateAdminPermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      permissions,
    }: {
      userId: string;
      permissions: Partial<AdminPermissions>;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "update-permissions", userId, permissions },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) {
        const msg = await res.error?.context?.json?.().catch((): null => null);
        throw new Error(msg?.error || res.error.message);
      }
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.superAdmins });
    },
    onError: (err: Error) =>
      toast.error("Errore aggiornamento permesso", { description: err.message }),
  });
}

// ─── HOOK: INVITA ADMIN ───────────────────────────────────────────────────────

export function useInviteAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      email,
      permissions,
    }: {
      email: string;
      permissions: AdminPermissions;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("invite-admin", {
        body: { email, permissions },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) {
        const msg = await res.error?.context?.json?.().catch((): null => null);
        throw new Error(msg?.error || res.error.message);
      }
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.superAdmins });
      toast.success("Invito inviato", {
        description: "Il link di accesso è stato inviato via email.",
      });
    },
    onError: (err: Error) =>
      toast.error("Errore invito", { description: err.message }),
  });
}

// ─── HOOK: ELIMINA ADMIN ──────────────────────────────────────────────────────

export function useDeleteAdmin() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (userId: string) => {
      if (userId === user?.id) throw new Error("Non puoi eliminare te stesso");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "delete", userId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) {
        const msg = await res.error?.context?.json?.().catch((): null => null);
        throw new Error(msg?.error || res.error.message);
      }
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.superAdmins });
      toast.success("Admin eliminato");
    },
    onError: (err: Error) =>
      toast.error("Errore eliminazione", { description: err.message }),
  });
}
