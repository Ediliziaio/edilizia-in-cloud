// src/hooks/useChiSottofasi.ts
// Chi fa ogni sottofase: una persona, una squadra o una ditta. Finché la tabella non c'è (migrazione
// 20281213160000 non applicata) la lettura fallisce in silenzio e lo schermo resta quello di prima.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface ChiSottofase { id: string; subphase_id: string; employee_id: string | null; external_team_id: string | null }
export interface DatiChiSottofasi { disponibile: boolean; perSottofase: Map<string, ChiSottofase[]> }

const chiave = (orderId: string | null | undefined) => ["order-work-subphase-chi", orderId] as const;

export function useChiSottofasi(orderId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: chiave(orderId),
    enabled: !!orderId,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<DatiChiSottofasi> => {
      const { data, error } = await db.from("order_work_subphase_chi").select("id, subphase_id, employee_id, external_team_id").eq("order_id", orderId).limit(5000);
      if (error) return { disponibile: false, perSottofase: new Map() };
      const perSottofase = new Map<string, ChiSottofase[]>();
      for (const r of (data ?? []) as ChiSottofase[]) perSottofase.set(r.subphase_id, [...(perSottofase.get(r.subphase_id) ?? []), r]);
      return { disponibile: true, perSottofase };
    },
  });
  const aggiorna = (): void => void qc.invalidateQueries({ queryKey: chiave(orderId) });
  const aggiungi = useMutation({
    mutationFn: async ({ sottofaseIds, persona, ditta }: { sottofaseIds: string[]; persona?: string; ditta?: string }) => {
      // Chi c'è già resta: l'indice unico rifiuterebbe il doppione e fermerebbe anche gli altri.
      const gia = query.data?.perSottofase ?? new Map<string, ChiSottofase[]>();
      const righe = sottofaseIds
        .filter((id) => !(gia.get(id) ?? []).some((c) => (persona && c.employee_id === persona) || (ditta && c.external_team_id === ditta)))
        .map((subphase_id) => ({ order_id: orderId, subphase_id, employee_id: persona ?? null, external_team_id: ditta ?? null }));
      if (righe.length === 0) return;
      const { error } = await db.from("order_work_subphase_chi").insert(righe);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError: (e: Error) => toast.error(e.message || "Non salvato"),
  });
  const togli = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db.from("order_work_subphase_chi").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Non puoi modificare chi fa questa sottofase.");
    },
    onSuccess: aggiorna,
    onError: (e: Error) => toast.error(e.message || "Non tolto"),
  });
  return { dati: query.data ?? { disponibile: false, perSottofase: new Map<string, ChiSottofase[]>() }, aggiungi, togli };
}
