/**
 * Chi vede la commessa nell'app di cantiere, e il capocantiere (26/09/2026).
 *
 * Le righe di order_campo_assignments le tiene in pari il database: chi lavora
 * sulla commessa (squadra, persona o ditta su una fase) entra da solo, con le
 * date delle sue fasi (commessa_allinea_accessi). Qui si leggono e si sceglie
 * il capocantiere fra chi lavora qui.
 *
 * La chiave ["order-campo-assignments", orderId] la usa anche OrderLaborCosts:
 * stessa lettura (caricaAccessiCommessa), così la cache ha una forma sola.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";

export interface AccessoCommessa {
  id: string;
  user_id: string;
  role_type: "employee" | "subcontractor" | string;
  data_inizio: string | null;
  data_fine_prevista: string | null;
  is_capocantiere: boolean | null;
  note?: string | null;
  /** Accesso dato da una squadra. */
  da_squadra_id?: string | null;
  /** Accesso dato dal lavoro su una fase (persona o ditta). */
  da_lavori?: boolean;
  profile: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

export const accessiCommessaKey = (orderId: string) => ["order-campo-assignments", orderId] as const;

export async function caricaAccessiCommessa(orderId: string): Promise<AccessoCommessa[]> {
  const { data, error } = await supabase
    .from("order_campo_assignments")
    // Hint obbligatorio: due chiavi verso profiles (user_id e assigned_by).
    .select("*, profile:profiles!order_campo_assignments_user_id_fkey(id, first_name, last_name, email)")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AccessoCommessa[];
}

export function useAccessiCommessa(orderId: string | null | undefined) {
  return useQuery<AccessoCommessa[]>({
    queryKey: accessiCommessaKey(orderId ?? ""),
    queryFn: () => caricaAccessiCommessa(orderId!),
    enabled: !!orderId,
  });
}

/** Da dove arriva l'accesso: squadra, lavoro sulle fasi, o dato a mano. */
export function fonteAccesso(a: Pick<AccessoCommessa, "da_squadra_id" | "da_lavori">): "squadra" | "fasi" | "a_mano" {
  if (a.da_squadra_id) return "squadra";
  if (a.da_lavori) return "fasi";
  return "a_mano";
}

export function nomeAccesso(a: Pick<AccessoCommessa, "profile">): string {
  const p = a.profile;
  const nome = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
  return nome || p?.email || "Persona senza nome";
}

export function useScegliCapocantiere(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string | null) => {
      const { error } = await supabase.rpc("commessa_capocantiere", { p_order_id: orderId, p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: (_d, userId) => {
      toast.success(userId ? "Capocantiere scelto" : "Nessun capocantiere su questa commessa");
      refreshWorkQueries(qc, orderId);
    },
    onError: (e: unknown) => {
      const msg = typeof e === "object" && e && "message" in e ? String((e as { message: string }).message) : "";
      toast.error(msg && !/[a-z_]+\(|violates|syntax/i.test(msg) ? msg : "Non sono riuscito a salvare. Riprova tra qualche secondo.");
    },
  });
}

export function useTogliAccessoAMano(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("order_campo_assignments")
        .delete()
        .eq("id", id)
        .eq("order_id", orderId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("non tolto");
    },
    onSuccess: () => {
      toast.success("Non vede più il cantiere nell'app");
      refreshWorkQueries(qc, orderId);
    },
    onError: () => toast.error("Non sono riuscito a toglierlo. Riprova tra qualche secondo."),
  });
}
