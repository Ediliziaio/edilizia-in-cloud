import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import type { PrelievoEsito } from "@/lib/campo/prelievoInCoda";
import { livelloMagazzinoCampo } from "../../../shared/campo-magazzino";

type CampoRpc = Database["public"]["Functions"];

export type StockCampo = CampoRpc["campo_magazzino_inventario_dettaglio"]["Returns"][number];
export type CantierePrelievo = CampoRpc["campo_magazzino_cantieri"]["Returns"][number];

export interface RigaPrelievo {
  stock_item_id: string;
  name: string;
  quantita: number;
  unita?: string | null;
}

const INVENTARIO_PER_PAGINA = 60;

export function useCampoMagazzinoConfig() {
  const { user, profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? "";
  const query = useQuery({
    queryKey: ["campo-magazzino-config", companyId, user?.id],
    enabled: !!companyId && !!user?.id,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("campo_magazzino_config", { p_azienda: companyId }).abortSignal(signal).single();
      if (error) throw error;
      const livello = livelloMagazzinoCampo(data?.livello);
      if (!livello) throw new Error("Autorizzazioni del magazzino non disponibili");
      return { livello, conferma: data.conferma !== false };
    },
  });
  return { ...query, companyId, userId: user?.id };
}

export function useCampoInventario(companyId: string, search: string, soloDisponibili: boolean, enabled: boolean) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: ["campo-warehouse-stock", companyId, user?.id, search, soloDisponibili],
    enabled: !!user?.id && enabled,
    staleTime: 30_000,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }): Promise<StockCampo[]> => {
      const { data, error } = await supabase.rpc("campo_magazzino_inventario_dettaglio", {
        p_azienda: companyId,
        p_cerca: search,
        p_offset: pageParam,
        p_solo_disponibili: soloDisponibili,
      }).abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (last, _pages, offset) => last.length === INVENTARIO_PER_PAGINA
      ? offset + INVENTARIO_PER_PAGINA
      : undefined,
  });
}

export function useCampoCantieriPrelievo(companyId: string, enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["campo-cantieri-prelievo", companyId, user?.id],
    enabled: !!user?.id && enabled,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("campo_magazzino_cantieri", { p_azienda: companyId }).abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
  });
}

interface PrelievoRow extends PrelievoEsito {
  data: string;
  righe: RigaPrelievo[];
  note: string | null;
  order_id: string | null;
  ddt_richiesto: boolean;
  documento_numero: string | null;
  motivo_rifiuto: string | null;
}

export function useMieiPrelievi(companyId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["campo-miei-prelievi", companyId, user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("prelievi_campo")
        .select("id, data, stato, righe, note, order_id, ddt_richiesto, documento_numero, motivo_rifiuto")
        .eq("company_id", companyId)
        .eq("operaio_id", user!.id)
        .order("data", { ascending: false })
        .limit(30)
        .abortSignal(signal);
      if (error) throw error;

      const prelievi = (data ?? []) as unknown as PrelievoRow[];
      const cantieriIds = [...new Set(prelievi.flatMap((r) => r.order_id ? [r.order_id] : []))];
      if (cantieriIds.length === 0) return { prelievi, cantieri: [] };

      const { data: cantieri } = await supabase.from("orders")
        .select("id, order_code, description, indirizzo_lavori")
        .eq("company_id", companyId).in("id", cantieriIds).abortSignal(signal);
      return { prelievi, cantieri: cantieri ?? [] };
    },
  });
}

export function useRichiediDdt(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async (prelievoId: string) => {
      const { error } = await supabase.rpc("prelievo_campo_richiedi_ddt", { p_prelievo_id: prelievoId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campo-miei-prelievi", companyId] }),
  });
}
