/**
 * Hooks per il portale commercialista — dati live da DB Supabase.
 *
 * Espone:
 *  - useAccountantFirm: studio dell'utente loggato (owner / member)
 *  - useAccountantCompanies: aziende delegate allo studio (da accountant_company_access)
 *  - useAccountantNotifications: notifiche in-app per il commercialista
 *  - useAccountantInbox: inviti pending + richieste aperte
 */

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ─────────────────────────────────────────────────────────────────

export type AccountantAccessStatus = "invited" | "active" | "suspended" | "revoked";
export type AccountantAccessMode = "read_only" | "operational" | "approval_required";

export interface AccountantFirmRow {
  id: string;
  name: string;
  vat_number: string | null;
  fiscal_code: string | null;
  email: string | null;
  phone: string | null;
  owner_user_id: string | null;
  status: string;
  contract_status: string;
  dpa_status: string;
  brand_name: string | null;
  brand_logo_url: string | null;
  brand_primary_color: string | null;
  created_at: string;
}

export interface AccountantCompanyAccessRow {
  id: string;
  firm_id: string;
  company_id: string;
  status: AccountantAccessStatus;
  access_mode: AccountantAccessMode;
  permissions: Record<string, boolean>;
  invited_email: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  notes: string | null;
  // Joined company info
  company: {
    id: string;
    name: string;
    vat_number: string | null;
    fiscal_code: string | null;
    legal_city: string | null;
  } | null;
}

export interface AccountantNotificationRow {
  id: string;
  firm_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
  read_at: string | null;
}

// ─── Query keys ────────────────────────────────────────────────────────────

export const accountantKeys = {
  firm: (userId: string | null | undefined) => ["accountant", "firm", userId] as const,
  companies: (firmId: string | null | undefined) =>
    ["accountant", "companies", firmId] as const,
  company: (firmId: string | null | undefined, companyId: string | undefined) =>
    ["accountant", "company", firmId, companyId] as const,
  notifications: (userId: string | null | undefined) =>
    ["accountant", "notifications", userId] as const,
};

// ─── useAccountantFirm ─────────────────────────────────────────────────────

export function useAccountantFirm() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: accountantKeys.firm(userId),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<AccountantFirmRow | null> => {
      if (!userId) return null;

      // 1. Cerca firm dove è owner
      const { data: ownedFirms } = await supabase
        .from("accountant_firms")
        .select("*")
        .eq("owner_user_id", userId)
        .neq("status", "archived")
        .order("created_at", { ascending: true })
        .limit(1);

      if (ownedFirms && ownedFirms.length > 0) {
        return ownedFirms[0] as AccountantFirmRow;
      }

      // 2. Altrimenti cerca firm dove è member attivo
      const { data: memberships } = await supabase
        .from("accountant_firm_members")
        .select("firm_id, role, status, accountant_firms!inner(*)")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1);

      if (memberships && memberships.length > 0) {
        const m = memberships[0] as { accountant_firms: AccountantFirmRow };
        return m.accountant_firms;
      }

      return null;
    },
  });
}

// ─── useAccountantCompanies ────────────────────────────────────────────────

export function useAccountantCompanies() {
  const { data: firm } = useAccountantFirm();
  const firmId = firm?.id ?? null;

  return useQuery({
    queryKey: accountantKeys.companies(firmId),
    enabled: !!firmId,
    staleTime: 30_000,
    queryFn: async (): Promise<AccountantCompanyAccessRow[]> => {
      if (!firmId) return [];
      const { data, error } = await supabase
        .from("accountant_company_access")
        .select(
          `
          id, firm_id, company_id, status, access_mode, permissions,
          invited_email, invited_at, accepted_at, notes,
          company:companies!inner(id, name, vat_number, fiscal_code, legal_city)
        `,
        )
        .eq("firm_id", firmId)
        .in("status", ["invited", "active", "suspended"])
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[useAccountantCompanies]", error);
        return [];
      }

      return (data || []) as unknown as AccountantCompanyAccessRow[];
    },
  });
}

// ─── useAccountantCompanyAccess ────────────────────────────────────────────

export function useAccountantCompanyAccess(companyId: string | undefined) {
  const { data: firm } = useAccountantFirm();
  const firmId = firm?.id ?? null;

  return useQuery({
    queryKey: accountantKeys.company(firmId, companyId),
    enabled: !!firmId && !!companyId,
    staleTime: 30_000,
    queryFn: async (): Promise<AccountantCompanyAccessRow | null> => {
      if (!firmId || !companyId) return null;
      const { data, error } = await supabase
        .from("accountant_company_access")
        .select(
          `
          id, firm_id, company_id, status, access_mode, permissions,
          invited_email, invited_at, accepted_at, notes,
          company:companies!inner(id, name, vat_number, fiscal_code, legal_city)
        `,
        )
        .eq("firm_id", firmId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (error) {
        console.error("[useAccountantCompanyAccess]", error);
        return null;
      }
      return (data as unknown as AccountantCompanyAccessRow) || null;
    },
  });
}

// ─── useAccountantNotifications ────────────────────────────────────────────

export function useAccountantNotifications() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  // Subscribe real-time: INSERT/UPDATE su accountant_notifications per
  // questo user → invalida cache → badge sidebar si aggiorna live.
  // Polling 60s mantenuto come fallback se WS è giù.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`accountant-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "accountant_notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: accountantKeys.notifications(userId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return useQuery({
    queryKey: accountantKeys.notifications(userId),
    enabled: !!userId,
    staleTime: 15_000,
    refetchInterval: 60_000, // fallback polling se WS è giù
    queryFn: async (): Promise<AccountantNotificationRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("accountant_notifications")
        .select("*")
        .eq("user_id", userId)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("[useAccountantNotifications]", error);
        return [];
      }
      return (data || []) as AccountantNotificationRow[];
    },
  });
}

// ─── Mutations ─────────────────────────────────────────────────────────────

/** Accetta un invito da azienda → cambia status a 'active' */
export function useAcceptCompanyInvite() {
  const queryClient = useQueryClient();
  const { data: firm } = useAccountantFirm();
  const firmId = firm?.id ?? null;

  return useMutation({
    mutationFn: async (accessId: string) => {
      const { error } = await supabase
        .from("accountant_company_access")
        .update({
          status: "active",
          accepted_at: new Date().toISOString(),
        })
        .eq("id", accessId);
      if (error) throw error;
      return accessId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountantKeys.companies(firmId) });
    },
  });
}

/** Rifiuta un invito (solo finché status = 'invited') */
export function useRejectCompanyInvite() {
  const queryClient = useQueryClient();
  const { data: firm } = useAccountantFirm();
  const firmId = firm?.id ?? null;

  return useMutation({
    mutationFn: async (accessId: string) => {
      const { error } = await supabase
        .from("accountant_company_access")
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
        })
        .eq("id", accessId)
        .eq("status", "invited");
      if (error) throw error;
      return accessId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountantKeys.companies(firmId) });
    },
  });
}

/** Marca notifica come letta */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("accountant_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notificationId);
      if (error) throw error;
      return notificationId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountantKeys.notifications(userId) });
    },
  });
}

/** Dismisse notifica (la nasconde dalla UI) */
export function useDismissNotification() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("accountant_notifications")
        .update({ is_dismissed: true })
        .eq("id", notificationId);
      if (error) throw error;
      return notificationId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountantKeys.notifications(userId) });
    },
  });
}

// ─── useCurrentCommercialistaAccessMode ────────────────────────────────────
// Restituisce l'access_mode del commercialista loggato per la company X.
// Usato fuori dal portale studio (es. CompanyLayout in commercialistaMode)
// per sbloccare canEdit* e mostrare/nascondere pulsanti "Modifica" o
// banner "Le tue modifiche richiederanno approvazione".

export function useCurrentCommercialistaAccessMode(
  companyId: string | null | undefined,
) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ["accountant-current-access-mode", userId, companyId] as const,
    enabled: !!userId && !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<AccountantAccessMode | null> => {
      if (!userId || !companyId) return null;
      const { data: members } = await supabase
        .from("accountant_firm_members")
        .select("firm_id")
        .eq("user_id", userId)
        .eq("status", "active");

      const firmIds = (members ?? [])
        .map((r: { firm_id: string | null }) => r.firm_id)
        .filter((id): id is string => !!id);
      if (firmIds.length === 0) return null;

      const { data: access, error } = await supabase
        .from("accountant_company_access")
        .select("access_mode")
        .in("firm_id", firmIds)
        .eq("company_id", companyId)
        .eq("status", "active")
        .maybeSingle();

      if (error) {
        console.error("[useCurrentCommercialistaAccessMode]", error);
        return null;
      }
      return (access?.access_mode as AccountantAccessMode | undefined) ?? null;
    },
  });
}
