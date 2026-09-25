import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ModuloVendutaSlug } from "./config";

/**
 * Preferenze per-azienda di VISIBILITÀ dei moduli preventivo.
 *
 * Layer separato dall'entitlement (`useFeatureAccess`/`company_feature_overrides`):
 * decide SOLO se mostrare un modulo a cui la company ha già accesso. Nessun
 * rischio di privilege-escalation: nascondere/mostrare non tocca l'entitlement.
 *
 * Fail-open: se la tabella non esiste ancora (migration non applicata) o la
 * query fallisce, consideriamo tutti i moduli visibili — così nessun modulo
 * sparisce per un errore. La scrittura è gated lato UI dal permesso impostazioni.
 */

interface PreferenzaRow {
  modulo_slug: string;
  visibile: boolean;
}

export interface UseModuliVisibilitaResult {
  /** Slug dei moduli che l'azienda ha esplicitamente NASCOSTO. */
  hiddenSlugs: Set<string>;
  /** True se il modulo va mostrato (default: sì, anche senza riga in tabella). */
  isModuloVisibile: (slug: string) => boolean;
  /** Mostra/nascondi un modulo per la company corrente (upsert). */
  setModuloVisibile: (slug: ModuloVendutaSlug, visibile: boolean) => void;
  isLoading: boolean;
  isSaving: boolean;
}

const EMPTY: Set<string> = new Set();

export function useModuliVisibilita(): UseModuliVisibilitaResult {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const queryKey = ["moduli-visibilita", companyId] as const;

  const { data: hiddenSlugs = EMPTY, isLoading } = useQuery<Set<string>>({
    queryKey,
    queryFn: async () => {
      if (!companyId) return new Set<string>();
      // La tabella non è nei tipi generati finché la migration non è applicata
      // su prod: query non tipizzata (stesso pattern di ArticleCatalog).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("company_modulo_preferenze") as any)
        .select("modulo_slug, visibile")
        .eq("company_id", companyId);
      if (error) {
        // Fail-open: in caso di errore mostriamo tutti i moduli.
        console.warn("[moduli-visibilita] lettura preferenze fallita:", error.message);
        return new Set<string>();
      }
      const rows = (data ?? []) as PreferenzaRow[];
      return new Set(rows.filter((r) => r.visibile === false).map((r) => r.modulo_slug));
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
    retry: 0,
  });

  const mutation = useMutation({
    mutationFn: async (vars: { slug: ModuloVendutaSlug; visibile: boolean }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("company_modulo_preferenze") as any).upsert(
        {
          company_id: companyId,
          modulo_slug: vars.slug,
          visibile: vars.visibile,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        },
        { onConflict: "company_id,modulo_slug" },
      );
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      // Aggiorna subito tutte le viste (catalogo, impostazioni e nuovo preventivo).
      // Non aspettare il refetch per rendere riattivabile il modulo nascosto.
      queryClient.setQueryData<Set<string>>(queryKey, (previous) => {
        const next = new Set(previous ?? []);
        if (vars.visibile) next.delete(vars.slug); else next.add(vars.slug);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey });
      toast.success(vars.visibile ? "Modulo riattivato per la squadra" : "Modulo disattivato per la squadra", {
        description: vars.visibile ? "Il modulo è nuovamente visibile. Il piano non cambia." : "Puoi riattivarlo da Moduli disattivati. I preventivi esistenti non vengono eliminati.",
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error(`Impossibile salvare la preferenza: ${msg}`);
    },
  });

  const isModuloVisibile = useCallback((slug: string) => !hiddenSlugs.has(slug), [hiddenSlugs]);

  const setModuloVisibile = useCallback(
    (slug: ModuloVendutaSlug, visibile: boolean) => mutation.mutate({ slug, visibile }),
    [mutation],
  );

  return {
    hiddenSlugs,
    isModuloVisibile,
    setModuloVisibile,
    isLoading,
    isSaving: mutation.isPending,
  };
}
