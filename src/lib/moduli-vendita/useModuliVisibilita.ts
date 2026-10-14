import { useCallback, useMemo } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ModuloVendutaSlug } from "./config";
import { SALES_AREAS, type SalesArea } from "./areas";

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
  /** Visibilità della singola area, NON del motore condiviso da più aree. */
  isAreaVisibile: (area: SalesArea) => boolean;
  setAreaVisibile: (area: SalesArea, visibile: boolean) => void;
  isLoading: boolean;
  isSaving: boolean;
}

const EMPTY: ReadonlyMap<string, boolean> = new Map();
const areaKey = (area: SalesArea) => `area:${area.id}`;

export function useModuliVisibilita(): UseModuliVisibilitaResult {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // Versione nuova: la cache precedente conteneva solo gli slug nascosti e
  // perdeva gli override espliciti true (necessari sulle preferenze legacy).
  const queryKey = ["moduli-visibilita", companyId, "aree-v2"] as const;
  const mutationKey = ["moduli-visibilita-save", companyId] as const;
  const isSaving = useIsMutating({ mutationKey }) > 0;

  const { data: preferences = EMPTY, isLoading } = useQuery<ReadonlyMap<string, boolean>>({
    queryKey,
    queryFn: async () => {
      if (!companyId) return new Map<string, boolean>();
      // La tabella non è nei tipi generati finché la migration non è applicata
      // su prod: query non tipizzata (stesso pattern di ArticleCatalog).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("company_modulo_preferenze") as any)
        .select("modulo_slug, visibile")
        .eq("company_id", companyId);
      if (error) {
        // Alla prima lettura resta fail-open; un errore di refetch invece
        // conserva l'ultimo dato valido, senza riaccendere aree nascoste.
        console.warn("[moduli-visibilita] lettura preferenze fallita:", error.message);
        throw error;
      }
      const rows = (data ?? []) as PreferenzaRow[];
      return new Map(rows.map((r) => [r.modulo_slug, r.visibile]));
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
    retry: 0,
  });

  const mutation = useMutation({
    mutationKey,
    // Clic rapidi e viste diverse della stessa azienda: ordine di salvataggio
    // stabile. Ogni richiesta continua ad aggiornare UNA sola riga.
    scope: { id: `moduli-visibilita:${companyId}` },
    mutationFn: async (vars: { slug: string; visibile: boolean; companyId: string | undefined; userId: string | null }) => {
      if (!vars.companyId) throw new Error("Azienda non disponibile");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("company_modulo_preferenze") as any).upsert(
        {
          company_id: vars.companyId,
          modulo_slug: vars.slug,
          visibile: vars.visibile,
          updated_at: new Date().toISOString(),
          updated_by: vars.userId,
        },
        { onConflict: "company_id,modulo_slug" },
      );
      if (error) throw error;
    },
    onSuccess: async (_data, vars) => {
      const savedKey = ["moduli-visibilita", vars.companyId, "aree-v2"] as const;
      // Una lettura partita prima del salvataggio non deve ripristinare la
      // vecchia preferenza. La company è quella del clic, anche dopo un cambio.
      await queryClient.cancelQueries({ queryKey: savedKey });
      // Aggiorna subito tutte le viste (catalogo, impostazioni e nuovo preventivo).
      // Non aspettare il refetch per rendere riattivabile il modulo nascosto.
      queryClient.setQueryData<ReadonlyMap<string, boolean>>(savedKey, (previous) => {
        const next = new Map(previous ?? []);
        next.set(vars.slug, vars.visibile);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: savedKey });
      toast.success(vars.visibile ? "Modulo riattivato per la squadra" : "Modulo disattivato per la squadra", {
        description: vars.visibile ? "Il modulo è nuovamente visibile. Il piano non cambia." : "Puoi riattivarlo da Moduli disattivati. I preventivi esistenti non vengono eliminati.",
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error(`Impossibile salvare la preferenza: ${msg}`);
    },
  });

  const isAreaVisibile = useCallback((area: SalesArea) =>
    preferences.get(areaKey(area)) ?? preferences.get(area.sourceModule) ?? true,
  [preferences]);

  // I menu legacy che espongono il motore restano visibili finché almeno una
  // delle sue aree è visibile. Gli accessi continuano a dipendere dal piano.
  const isModuloVisibile = useCallback((slug: string) => {
    const areas = SALES_AREAS.filter(a => a.sourceModule === slug);
    return areas.length ? areas.some(isAreaVisibile) : preferences.get(slug) !== false;
  }, [preferences, isAreaVisibile]);
  const hiddenSlugs = useMemo(() => new Set(
    [...preferences].filter(([, visible]) => !visible).map(([slug]) => slug),
  ), [preferences]);

  const setModuloVisibile = useCallback(
    (slug: ModuloVendutaSlug, visibile: boolean) => mutation.mutate({ slug, visibile, companyId, userId: user?.id ?? null }),
    [mutation, companyId, user?.id],
  );
  const setAreaVisibile = useCallback(
    (area: SalesArea, visibile: boolean) => mutation.mutate({ slug: areaKey(area), visibile, companyId, userId: user?.id ?? null }),
    [mutation, companyId, user?.id],
  );

  return {
    hiddenSlugs,
    isModuloVisibile,
    setModuloVisibile,
    isAreaVisibile,
    setAreaVisibile,
    isLoading,
    isSaving,
  };
}
