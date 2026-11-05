/**
 * Il modulo di cantiere dell'azienda: lettura per chi compila e per le impostazioni, salvataggio per chi configura.
 * Una lettura che fallisce non ferma il cantiere: si lavora con il modulo di oggi, e l'obbligatorietà non è sul server.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SCHEMA_COME_OGGI, leggiSchema, type ModuloSchema } from "../../supabase/functions/_shared/moduliCantiere";

export type TipoModulo = "rapportino" | "verbale";
export interface ModuloAzienda { id: string; tipo: TipoModulo; nome: string; schema: ModuloSchema; attivo: boolean }

// La tabella e le funzioni non sono ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;

/** Lo schema che vale su una commessa. Con un database senza la funzione (PGRST202, 42883) si lavora come oggi. */
export function useModuloRapportino(orderId: string | undefined): { schema: ModuloSchema; isLoading: boolean; isError: boolean } {
  const q = useQuery<ModuloSchema>({
    queryKey: ["modulo-rapportino", orderId],
    enabled: !!orderId,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db().rpc("modulo_rapportino_per_ordine", { p_order_id: orderId });
      if (error?.code === "PGRST202" || error?.code === "42883") return SCHEMA_COME_OGGI;
      if (error) throw error;
      return leggiSchema(data);
    },
  });
  const schema = useMemo(() => leggiSchema(q.data), [q.data]);
  return { schema, isLoading: q.isLoading, isError: q.isError };
}

export function useModuliAzienda(companyId: string | undefined, tipo: TipoModulo) {
  return useQuery<ModuloAzienda[]>({
    queryKey: ["moduli-azienda", companyId, tipo],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db().from("moduli_cantiere").select("id, tipo, nome, schema, attivo")
        .eq("company_id", companyId).eq("tipo", tipo).is("deleted_at", null).order("nome");
      if (error) throw error;
      return ((data ?? []) as Array<ModuloAzienda & { schema: unknown }>).map(m => ({ ...m, schema: leggiSchema(m.schema) }));
    },
  });
}

/** Per ogni chiave, quanti documenti contengono già quel campo. */
export function useUsoModulo(companyId: string | undefined, tipo: TipoModulo) {
  return useQuery<Record<string, number>>({
    queryKey: ["moduli-uso", companyId, tipo],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db().rpc("moduli_cantiere_uso", { p_company_id: companyId, p_tipo: tipo });
      if (error) throw error;
      return (data ?? {}) as Record<string, number>;
    },
  });
}

export function useSalvaModulo(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: { id?: string | null; tipo: TipoModulo; nome: string; schema: ModuloSchema; attivo?: boolean }) => {
      if (!companyId) throw new Error("Seleziona un’azienda prima di salvare.");
      const { data, error } = await db().rpc("moduli_cantiere_salva", {
        p_company_id: companyId, p_id: m.id ?? null, p_tipo: m.tipo, p_nome: m.nome, p_schema: m.schema, p_attivo: m.attivo ?? true,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ["moduli-azienda", companyId] }),
      qc.invalidateQueries({ queryKey: ["moduli-uso", companyId] }),
      qc.invalidateQueries({ queryKey: ["modulo-rapportino"] }),
    ]),
  });
}
