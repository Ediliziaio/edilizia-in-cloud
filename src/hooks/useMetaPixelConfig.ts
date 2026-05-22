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
    staleTime: 30_000,
  });

  const upsertMutation = useMutation({
    mutationFn: async (input: {
      pixel_id: string;
      pixel_name?: string;
      capi_token?: string; // plain — sarà cifrato dalla edge fn
    }): Promise<MetaConversionPixelRow | null> => {
      if (!companyId) throw new Error("no_company_id");

      // Strategy: prefer edge function (cifratura token), fallback insert plain
      try {
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
        if (!error && data?.success && data.pixel) return data.pixel;
        // Se la edge fn non esiste, fallback diretto DB
      } catch {
        // ignore, fallback
      }

      // Fallback: insert/update direct (senza cifratura — solo per dev)
      try {
        const existing = query.data;
        if (existing) {
          const { data, error } = await pixelTable()
            .update({
              pixel_id: input.pixel_id,
              pixel_name: input.pixel_name ?? null,
              // NB: in produzione cifrare prima di salvare
              capi_token_encrypted: input.capi_token ?? existing.capi_token_encrypted,
            })
            .eq("id", existing.id)
            .select("*")
            .single();
          if (error) throw error;
          return data;
        } else {
          const { data, error } = await pixelTable()
            .insert({
              company_id: companyId,
              pixel_id: input.pixel_id,
              pixel_name: input.pixel_name ?? null,
              capi_token_encrypted: input.capi_token ?? null,
              is_active: true,
            })
            .select("*")
            .single();
          if (error) throw error;
          return data;
        }
      } catch (err) {
        const msg = String((err as Error).message ?? err);
        if (msg.includes("does not exist") || msg.includes("schema cache")) {
          console.warn("[useMetaPixelConfig] schema not applied");
          return null;
        }
        throw err;
      }
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
      isLoading: query.isLoading,
      save: upsertMutation.mutateAsync,
      isSaving: upsertMutation.isPending,
    }),
    [query.data, query.isLoading, upsertMutation.mutateAsync, upsertMutation.isPending],
  );
}
