/**
 * Hook per varianti costo manodopera associate a una tariffa.
 *
 * Sprint B — Varianti Costo Manodopera.
 *
 * Fetch pattern:
 *   · filtra solo varianti attive (attivo=true)
 *   · filtra solo varianti valide oggi (valid_to IS NULL OR valid_to >= today)
 *   · ordina is_default DESC → sort_order ASC
 *
 * RLS lato DB: solo company_admin / super_admin può leggere. Per i non-admin
 * il fetch restituisce [] (la query fallisce con 0 rows, non con error).
 *
 * Le FK fornitore_id / risorsa_id sono deboli (no REFERENCES) perché le
 * tabelle target (fornitori, hr_risorse) non sono ancora presenti nel repo.
 * Quindi NON joiniamo via select embedded ma risolviamo separatamente — vedi
 * il join opzionale nel tipo TariffaCostoVariante.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { TariffaCostoVariante } from "@/types/costVariants";

/** Tipo minimale del payload accettato dall'insert — omette campi server-side. */
export type VarianteCreateInput = Omit<
  TariffaCostoVariante,
  "id" | "company_id" | "created_at" | "updated_at" | "fornitore" | "risorsa"
>;

export type VarianteUpdateInput = Partial<VarianteCreateInput>;

/**
 * Lista varianti per una tariffa specifica.
 *
 * @param tariffaId - id tariffa; null/undefined disabilita la query
 * @param opts.includeExpired - se true include varianti con valid_to < oggi
 *        (utile nella pagina SettingsTariffe per mostrare storico)
 */
export function useTariffaVarianti(
  tariffaId: string | null | undefined,
  opts: { includeExpired?: boolean } = {}
) {
  const companyId = useEffectiveCompanyId();
  const { includeExpired = false } = opts;

  return useQuery<TariffaCostoVariante[]>({
    queryKey: ["tariffa-varianti", tariffaId, companyId, includeExpired],
    enabled: !!tariffaId && !!companyId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      // Base query: no joins embedded (FK debole), risolvere lato client se serve
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from as any)("tariffa_costi_varianti")
        .select("*")
        .eq("company_id", companyId!)
        .eq("tariffa_id", tariffaId!)
        .eq("attivo", true);

      if (!includeExpired) {
        // Valido oggi: valid_from <= oggi E (valid_to IS NULL OR valid_to >= oggi)
        query = query
          .lte("valid_from", today)
          .or(`valid_to.is.null,valid_to.gte.${today}`);
      }

      const { data, error } = await query
        .order("is_default", { ascending: false })
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as TariffaCostoVariante[];
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Mutations CRUD + setDefault per varianti costo.
 * Tutte le mutation invalidano la cache "tariffa-varianti".
 */
export function useTariffaVariantiMutations() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();

  const createVariante = useMutation({
    mutationFn: async (input: VarianteCreateInput) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)("tariffa_costi_varianti")
        .insert({ ...input, company_id: companyId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as TariffaCostoVariante;
    },
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["tariffa-varianti", v.tariffa_id] });
    },
  });

  const updateVariante = useMutation({
    mutationFn: async (params: { id: string; patch: VarianteUpdateInput }) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)("tariffa_costi_varianti")
        .update(params.patch)
        .eq("id", params.id)
        .eq("company_id", companyId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as TariffaCostoVariante;
    },
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["tariffa-varianti", v.tariffa_id] });
    },
  });

  /**
   * Soft-delete: imposta attivo=false, preserva assegnazioni storiche.
   * Se la variante era is_default, viene anche tolto il flag.
   */
  const disableVariante = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)("tariffa_costi_varianti")
        .update({ attivo: false, is_default: false })
        .eq("id", id)
        .eq("company_id", companyId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as TariffaCostoVariante;
    },
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["tariffa-varianti", v.tariffa_id] });
    },
  });

  /**
   * Imposta una variante come default per la sua tariffa.
   * Due-step: 1) azzera default corrente 2) setta nuovo default.
   * L'unique index `ux_varianti_one_default_per_tariffa` garantisce
   * atomicità: se il secondo step fallisce, la tariffa resta senza default.
   */
  const setDefault = useMutation({
    mutationFn: async (params: { tariffaId: string; varianteId: string }) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      // Step 1: azzera eventuale default corrente (potrebbe non esserci)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: clearError } = await (supabase.from as any)("tariffa_costi_varianti")
        .update({ is_default: false })
        .eq("company_id", companyId)
        .eq("tariffa_id", params.tariffaId)
        .eq("is_default", true);
      if (clearError) throw new Error(clearError.message);
      // Step 2: setta nuovo default
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)("tariffa_costi_varianti")
        .update({ is_default: true })
        .eq("id", params.varianteId)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["tariffa-varianti", vars.tariffaId] });
    },
  });

  return { createVariante, updateVariante, disableVariante, setDefault };
}
