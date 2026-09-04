import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Gestione utenti a livello di piattaforma (F2-01 · F2-02 · F2-03).
 *
 * Prima non esisteva: 947 utenti erano raggiungibili solo passando dall'azienda
 * di appartenenza, e l'unico elenco globale — il selettore di quick login — si
 * fermava a 300 profili. Il modello dati c'era già per intero (telefono, blocco,
 * tentativi falliti su profiles; IP, dispositivo e revoca su user_sessions):
 * mancava il modo di interrogarlo.
 */

export interface AdminUserRow {
  id: string;
  email: string | null;
  nome: string | null;
  telefono: string | null;
  azienda_id: string | null;
  azienda_nome: string | null;
  ruoli: string[] | null;
  bloccato: boolean;
  motivo_blocco: string | null;
  bloccato_fino: string | null;
  tentativi_falliti: number;
  ultimo_accesso: string | null;
  sessioni_attive: number;
  creato_il: string;
  totale: number;
}

export interface AdminUserSession {
  id: string;
  azienda_nome: string | null;
  ip: string | null;
  dispositivo: string | null;
  browser: string | null;
  sistema: string | null;
  iniziata_il: string;
  ultima_attivita: string | null;
  attiva: boolean;
  revocata_da: string | null;
  motivo_revoca: string | null;
}

export interface AdminUsersFilters {
  search?: string;
  role?: string | null;
  companyId?: string | null;
  stato?: "attivi" | "bloccati" | "mai_entrati" | null;
  page?: number;
  pageSize?: number;
}

export function useAdminUsers(filters: AdminUsersFilters) {
  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 0;

  return useQuery({
    queryKey: [
      "admin-users", filters.search ?? "", filters.role ?? null,
      filters.companyId ?? null, filters.stato ?? null, page, pageSize,
    ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_search_users" as never, {
        p_search: filters.search?.trim() || null,
        p_role: filters.role || null,
        p_company_id: filters.companyId || null,
        p_stato: filters.stato || null,
        p_limit: pageSize,
        p_offset: page * pageSize,
      } as never);
      if (error) throw error;
      const rows = (data ?? []) as unknown as AdminUserRow[];
      return { rows, total: rows[0]?.totale ?? 0 };
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useAdminUserSessions(userId: string | null) {
  return useQuery({
    queryKey: ["admin-user-sessions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_user_sessions" as never, {
        p_user_id: userId,
        p_limit: 20,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as AdminUserSession[];
    },
    staleTime: 30_000,
  });
}

export function useAdminUserActions() {
  const queryClient = useQueryClient();

  const invalida = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["admin-user-sessions"] });
  };

  const setBlocked = useMutation({
    mutationFn: async (v: { userId: string; blocked: boolean; reason?: string }) => {
      const { data, error } = await supabase.rpc("admin_set_user_blocked" as never, {
        p_user_id: v.userId, p_blocked: v.blocked, p_reason: v.reason ?? null,
      } as never);
      if (error) throw error;
      const res = data as unknown as { error?: string; sessioni_chiuse?: number };
      if (res?.error) throw new Error(res.error);
      return res;
    },
    onSuccess: (res, v) => {
      invalida();
      toast.success(v.blocked ? "Utente bloccato" : "Utente sbloccato", {
        description: v.blocked && res?.sessioni_chiuse
          ? `${res.sessioni_chiuse} sessioni chiuse`
          : undefined,
      });
    },
    onError: (e: Error) => toast.error("Operazione non riuscita", { description: e.message }),
  });

  const revokeSessions = useMutation({
    mutationFn: async (v: { userId: string; sessionId?: string }) => {
      const { data, error } = await supabase.rpc("admin_revoke_user_sessions" as never, {
        p_user_id: v.userId, p_session_id: v.sessionId ?? null,
      } as never);
      if (error) throw error;
      return data as unknown as { sessioni_revocate?: number };
    },
    onSuccess: (res) => {
      invalida();
      toast.success(`${res?.sessioni_revocate ?? 0} sessioni revocate`);
    },
    onError: (e: Error) => toast.error("Revoca non riuscita", { description: e.message }),
  });

  const resetPassword = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.functions.invoke("reset-customer-password", {
        body: { userId },
      });
      if (error) throw error;
    },
    onSuccess: () =>
      toast.success("Password resettata", {
        description: "La nuova password è stata inviata via email all'utente.",
      }),
    onError: (e: Error) => toast.error("Reset non riuscito", { description: e.message }),
  });

  return { setBlocked, revokeSessions, resetPassword };
}
