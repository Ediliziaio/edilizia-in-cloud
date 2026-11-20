import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ArrivoDaRapportino } from "@/lib/campo/arrivoRapportino";
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
        ? name === "mezzi_arrivi_da_rapportini"
          ? "Gli arrivi dai rapportini saranno disponibili dopo l’aggiornamento del database."
          : "Registro viaggi non ancora attivato sul server. Nessun dato è stato inviato."
        : error.message,
      { cause: error.code },
    );
  return data as T;
}
export const viaggiKey = (companyId: string) =>
  ["mezzi-viaggi", companyId] as const;
const arriviKey = (companyId: string, orderId?: string) =>
  orderId ? ["mezzi-arrivi-rapportini", companyId, orderId] : ["mezzi-arrivi-rapportini", companyId];

export function useArriviDaRapportini({ companyId, orderId, dal, al, offset, enabled }: {
  companyId: string;
  orderId?: string;
  dal: string;
  al: string;
  offset: number;
  enabled: boolean;
}) {
  const actor = useAuth().user?.id;
  return useQuery({
    queryKey: [...arriviKey(companyId, orderId), actor, dal, al, offset],
    enabled: enabled && !!actor && !!orderId,
    queryFn: () => call<{ items: ArrivoDaRapportino[]; has_more: boolean }>("mezzi_arrivi_da_rapportini", {
      p_order: orderId, p_dal: dal, p_al: al, p_offset: offset,
    }),
    retry: false,
    staleTime: 15000,
  });
}

export function useCollegaArrivoRapportino(companyId: string, orderId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ arrivo, viaggioId }: { arrivo: ArrivoDaRapportino; viaggioId: string }) =>
      call<void>("mezzi_collega_arrivo_rapportino", {
        p_order: orderId, p_giorno: arrivo.giorno, p_arrivo: arrivo.id, p_viaggio: viaggioId,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: arriviKey(companyId, orderId) }),
  });
}
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
      void qc.invalidateQueries({ queryKey: arriviKey(companyId) });
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
