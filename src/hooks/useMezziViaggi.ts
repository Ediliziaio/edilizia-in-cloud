import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  ContestoViaggi,
  Viaggio,
  ViaggioPayload,
} from "@/lib/mezzi/viaggi";

const db = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
};
async function call<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error)
    throw new Error(
      error.code === "PGRST202"
        ? "Registro viaggi non ancora attivato sul server. Nessun dato è stato inviato."
        : error.message,
    );
  return data as T;
}
export const viaggiKey = (companyId: string) =>
  ["mezzi-viaggi", companyId] as const;
export function useViaggiContesto(
  companyId: string,
  mezzoId: string,
  q: string,
  enabled: boolean,
  orderId?: string,
) {
  const actor = useAuth().user?.id;
  return useQuery({
    queryKey: [
      ...viaggiKey(companyId),
      actor,
      "contesto",
      mezzoId,
      q,
      orderId ?? null,
    ],
    enabled: enabled && !!companyId && !!mezzoId && !!actor,
    queryFn: () =>
      call<ContestoViaggi>("mezzi_viaggi_contesto", {
        p_mezzo: mezzoId,
        p_q: q,
        p_order: orderId ?? null,
      }),
    staleTime: 15000,
    retry: false,
  });
}
export function useViaggiElenco({
  companyId,
  mezzoId,
  orderId,
  dal,
  al,
  offset,
  enabled = true,
}: {
  companyId: string;
  mezzoId?: string;
  orderId?: string;
  dal: string;
  al: string;
  offset: number;
  enabled?: boolean;
}) {
  const actor = useAuth().user?.id;
  return useQuery({
    queryKey: [
      ...viaggiKey(companyId),
      actor,
      "elenco",
      mezzoId ?? null,
      orderId ?? null,
      dal,
      al,
      offset,
    ],
    enabled: enabled && !!companyId && !!dal && !!al && !!actor,
    queryFn: () =>
      call<{ items: Viaggio[]; has_more: boolean }>("mezzi_viaggi_elenco", {
        p_company: companyId,
        p_mezzo: mezzoId ?? null,
        p_order: orderId ?? null,
        p_dal: dal,
        p_al: al,
        p_offset: offset,
      }),
    retry: false,
    staleTime: 30000,
  });
}
export function useSalvaViaggio(companyId: string) {
  const actor = useAuth().user?.id;
  const qc = useQueryClient();
  const attempt = useRef<{ signature: string; token: string } | null>(null);
  return useMutation({
    retry: false,
    mutationFn: (v: {
      mezzoId: string;
      id: string;
      versione: number;
      azione: "salva" | "invia" | "verifica" | "annulla";
      dati: ViaggioPayload;
      motivo: string;
    }) => {
      const signature = JSON.stringify({ actor, ...v });
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, token: crypto.randomUUID() };
      return call<{ id: string; versione: number }>("mezzi_viaggi_salva", {
        p_mezzo: v.mezzoId,
        p_id: v.id,
        p_versione: v.versione,
        p_token: attempt.current.token,
        p_azione: v.azione,
        p_dati: v.dati,
        p_motivo: v.motivo,
      });
    },
    onSuccess: () => {
      attempt.current = null;
      void qc.invalidateQueries({ queryKey: viaggiKey(companyId) });
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: viaggiKey(companyId) });
    },
  });
}
export function useViaggioStorico(
  companyId: string,
  id: string,
  enabled: boolean,
) {
  const actor = useAuth().user?.id;
  return useQuery({
    queryKey: [...viaggiKey(companyId), actor, "storico", id],
    enabled: enabled && !!actor,
    queryFn: () =>
      call<
        Array<{
          versione: number;
          azione: string;
          motivo: string;
          created_at: string;
        }>
      >("mezzi_viaggi_storico", { p_id: id }),
    retry: false,
  });
}
