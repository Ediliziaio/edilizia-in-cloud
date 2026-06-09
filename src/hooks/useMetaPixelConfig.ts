/**
 * useMetaPixelConfig — CRUD su meta_conversion_pixel.
 *
 * Configurazione del Pixel Meta + token CAPI cifrato per attribuzione
 * server-side (Conversions API).
 *
 * Strategia:
 *   • Tenta DB → fallback graceful (return null se schema non applicato)
 *   • Token CAPI viene salvato cifrato lato edge function (qui invio plain)
 */

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MetaConversionPixelRow } from "@/types/metaAds";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pixelTable = () => (supabase as any).from("meta_conversion_pixel");

export const metaPixelKeys = {
  byCompany: (id: string | undefined) => ["meta-pixel-config", id] as const,
};

export function useMetaPixelConfig(companyId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: metaPixelKeys.byCompany(companyId),
    queryFn: async (): Promise<MetaConversionPixelRow | null> => {
      if (!companyId) return null;
      try {
        const { data, error } = await pixelTable()
          .select("*")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .maybeSingle();
        if (error) {
          const msg = String(error.message ?? "");
          if (msg.includes("does not exist") || msg.includes("schema cache")) return null;
          throw error;
        }
        return data ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!companyId,
    placeholderData: null,
    staleTime: 30_000,
  });

  const upsertMutation = useMutation({
    mutationFn: async (input: {
      pixel_id: string;
      pixel_name?: string;
      capi_token?: string; // plain — sarà cifrato dalla edge fn
    }): Promise<MetaConversionPixelRow | null> => {
      if (!companyId) throw new Error("no_company_id");

      // SEMPRE via edge function: cifra il token CAPI lato server (AES-GCM).
      // NESSUN fallback diretto su DB col token in chiaro: il token CAPI è
      // long-lived e salvarlo plaintext sarebbe una falla di sicurezza. Se la
      // edge function fallisce, propaghiamo l'errore senza persistere nulla.
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        pixel?: MetaConversionPixelRow;
        error?: string;
      }>("meta-pixel-configure", {
        body: {
          company_id: companyId,
          pixel_id: input.pixel_id,
          pixel_name: input.pixel_name,
          capi_token: input.capi_token,
        },
      });
      if (error) throw new Error(error.message ?? "Errore configurazione pixel");
      if (!data?.success || !data.pixel) {
        throw new Error(data?.error ?? "Configurazione pixel non riuscita");
      }
      return data.pixel;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: metaPixelKeys.byCompany(companyId) });
      toast.success("Configurazione Pixel salvata");
    },
    onError: (err) => {
      toast.error("Errore salvataggio Pixel", { description: String((err as Error).message ?? err) });
    },
  });

  return useMemo(
    () => ({
      config: query.data,
      isLoading: query.isLoading && query.data === undefined,
      save: upsertMutation.mutateAsync,
      isSaving: upsertMutation.isPending,
    }),
    [query.data, query.isLoading, upsertMutation.mutateAsync, upsertMutation.isPending],
  );
}
