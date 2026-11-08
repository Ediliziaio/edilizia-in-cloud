import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import type { ElencoArrivo, EsitoArrivo, OrdineDaSpuntare, RiepilogoCommessaArrivo } from "@/lib/arrivi/arrivoPosizioni";

type RpcFn = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
const rpc = () => supabase.rpc.bind(supabase) as unknown as RpcFn;

/** L'elenco delle posizioni di un ordine. Nessun prezzo: lo vede anche l'operaio. */
export function useElencoArrivo(odaId: string | null | undefined, ddtId?: string | null) {
  return useQuery<ElencoArrivo>({
    queryKey: ["arrivo-elenco", odaId, ddtId ?? null],
    enabled: !!odaId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await rpc()("arrivo_elenco", { p_purchase_order_id: odaId, p_ddt_id: ddtId ?? null });
      if (error) throw error;
      return data as ElencoArrivo;
    },
  });
}

export function useArrivoCommessa(orderId: string | null | undefined) {
  return useQuery<RiepilogoCommessaArrivo>({
    queryKey: ["arrivo-commessa", orderId],
    enabled: !!orderId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await rpc()("arrivo_commessa", { p_order_id: orderId });
      if (error) throw error;
      return data as RiepilogoCommessaArrivo;
    },
  });
}

export function useOrdiniDaSpuntare() {
  return useQuery<OrdineDaSpuntare[]>({
    queryKey: ["arrivo-da-spuntare"],
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await rpc()("arrivo_da_spuntare");
      if (error) throw error;
      return (data ?? []) as OrdineDaSpuntare[];
    },
  });
}

function aggiorna(qc: QueryClient, odaId: string, orderId?: string | null) {
  void qc.invalidateQueries({ queryKey: ["arrivo-elenco", odaId] });
  void qc.invalidateQueries({ queryKey: ["arrivo-commessa"] });
  void qc.invalidateQueries({ queryKey: ["arrivo-da-spuntare"] });
  void qc.invalidateQueries({ queryKey: ["oda-arrivo-righe", odaId] });
  void qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
  if (orderId) void qc.invalidateQueries({ queryKey: queryKeys.orders.detail(orderId) });
}

export interface RigaSpunta {
  poi_id: string;
  esito: EsitoArrivo;
  quantita: number;
  nota?: string;
  foto?: string[];
  sostitutivo?: boolean;
  ddt_riga_id?: string | null;
}

export interface EsitoSpunta {
  gia_registrato: boolean;
  registrate: number;
  saltate: Array<{ descrizione?: string; motivo: string }>;
  ddt_id: string | null;
}

export function useRegistraSpunte(odaId: string, orderId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { righe: RigaSpunta[]; ddtId?: string | null; numeroBolla?: string; invioId: string }) => {
      const { data, error } = await rpc()("arrivo_registra", {
        p_purchase_order_id: odaId,
        p_righe: a.righe,
        p_ddt_id: a.ddtId ?? null,
        p_numero_bolla: a.numeroBolla?.trim() || null,
        p_data: null,
        p_invio_id: a.invioId,
      });
      if (error) throw error;
      return data as EsitoSpunta;
    },
    onSuccess: () => aggiorna(qc, odaId, orderId),
  });
}

/** Dopo l'invio dell'email: il pezzo risulta già reclamato. */
export function useSegnaReclamo(odaId: string, orderId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (esiti: string[]) => {
      const { error } = await (supabase.rpc as unknown as (f: string, a: object) => Promise<{ error: { message: string } | null }>)("arrivo_segna_reclamo", { p_esiti: esiti });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => aggiorna(qc, odaId, orderId),
  });
}

export function useRiordinaPezzi(odaId: string, orderId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { esiti: string[]; gratis: boolean }) => {
      const { data, error } = await rpc()("arrivo_riordina", { p_esiti: a.esiti, p_gratis: a.gratis });
      if (error) throw error;
      return data as { purchase_order_id: string; numero?: string; riordinati: number; gia_fatto: boolean };
    },
    onSuccess: () => aggiorna(qc, odaId, orderId),
  });
}
