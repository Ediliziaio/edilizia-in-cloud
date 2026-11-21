import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { withClientTimeout } from "@/lib/query-timeout";
import { queryKeys } from "@/lib/queryKeys";
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

interface PrelievoEsito {
  id: string;
  stato: "richiesto" | "consegnato" | "rifiutato";
}

export class PrelievoNonRegistrato extends Error {}

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

export function usePrelievoRegistra(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async ({ orderId, warehouseId, righe, note, requestId }: {
      orderId: string;
      warehouseId: string | null;
      righe: { stock_item_id: string; quantita: number }[];
      note: string;
      requestId: string;
    }): Promise<PrelievoEsito> => {
      const { data, error } = await withClientTimeout(supabase.rpc("campo_magazzino_preleva", {
        p_azienda: companyId,
        p_cantiere: orderId,
        p_magazzino: warehouseId,
        p_righe: righe,
        p_note: note || null,
        p_richiesta_id: requestId,
      }), "Registrazione prelievo");
      if (error) {
        // Questi errori vengono emessi dopo il controllo dell'identificativo e annullano la scrittura.
        const nonRegistrato = error.code === "22023" || error.code === "P0001"
          || (error.code === "42501" && error.message.startsWith("Scegli un cantiere aperto"));
        if (nonRegistrato) throw new PrelievoNonRegistrato(error.message);
        throw new Error(error.message);
      }
      if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.id !== "string"
        || (data.stato !== "richiesto" && data.stato !== "consegnato" && data.stato !== "rifiutato")) {
        throw new Error("Il magazzino non ha confermato l’esito. Riprova a inviare questo prelievo.");
      }
      return { id: data.id, stato: data.stato };
    },
    onSuccess: ({ stato }, { orderId }) => {
      void qc.invalidateQueries({ queryKey: ["campo-warehouse-stock", companyId] });
      void qc.invalidateQueries({ queryKey: ["campo-miei-prelievi", companyId] });
      void qc.invalidateQueries({ queryKey: ["prelievi-campo-attesa", companyId] });
      void qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      if (stato === "consegnato") {
        void qc.invalidateQueries({ queryKey: queryKeys.warehouse.movementsRegistry(companyId) });
        void qc.invalidateQueries({ queryKey: queryKeys.warehouse.campoMateriali(companyId, orderId) });
        void qc.invalidateQueries({ queryKey: ["order-material-usage", orderId, companyId] });
      }
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
