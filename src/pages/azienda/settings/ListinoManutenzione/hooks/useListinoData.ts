/**
 * ListinoManutenzione — queries + mutations + seedFromTemplate
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 *
 * Espone un'API unica `useListinoData(companyId)` che ritorna:
 *  - 3 query (tipiImpianto, tipiIntervento, listino)
 *  - 3 delete mutations
 *  - seedFromTemplate (idempotente)
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type {
  TipoImpianto, TipoIntervento, ListinoPrezzo, PresetListinoId,
} from "../types";
import {
  STANDARD_IMPIANTI, STANDARD_INTERVENTI, STANDARD_TARIFFE_LISTINO,
} from "../presets";

export function useListinoData(companyId: string | undefined) {
  const queryClient = useQueryClient();
  const [creatingDemo, setCreatingDemo] = useState(false);

  const tipiImpiantoQuery = useQuery({
    queryKey: ["tipi-impianto", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("tipi_impianto") as any)
        .select("id, company_id, nome, icona, ordine, attivo")
        .eq("company_id", companyId)
        .order("ordine", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as TipoImpianto[];
    },
  });

  const tipiInterventoQuery = useQuery({
    queryKey: ["tipi-intervento", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("tipi_intervento") as any)
        .select("id, company_id, nome, categoria, durata_stimata_h, attivo")
        .eq("company_id", companyId)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as TipoIntervento[];
    },
  });

  const listinoQuery = useQuery({
    queryKey: ["listino-prezzi", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("listino_prezzi") as any)
        .select(`
          id, company_id, tipo_impianto_id, tipo_intervento_id,
          prezzo_base, iva_percentuale, unita, attivo, note, valido_dal, valido_al,
          tipo_impianto:tipi_impianto(id, nome, icona),
          tipo_intervento:tipi_intervento(id, nome)
        `)
        .eq("company_id", companyId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as ListinoPrezzo[];
    },
  });

  const deleteImpiantoMutation = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("tipi_impianto") as any)
        .delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipi-impianto", companyId] });
      toast.success("Tipo impianto eliminato");
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Errore eliminazione"),
  });

  const deleteInterventoMutation = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("tipi_intervento") as any)
        .delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipi-intervento", companyId] });
      toast.success("Tipo intervento eliminato");
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Errore eliminazione"),
  });

  const deleteListinoMutation = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("listino_prezzi") as any)
        .delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listino-prezzi", companyId] });
      toast.success("Tariffa eliminata");
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Errore eliminazione"),
  });

  /**
   * Importa un sottoinsieme del catalogo standard filtrato per preset
   * e/o selezione fine. Idempotente: voci già presenti sono saltate.
   */
  const seedFromTemplate = async (params: {
    selectedPresets: PresetListinoId[];
    selectedTariffeKeys?: Set<string>;
  }): Promise<boolean> => {
    if (!companyId) return false;
    if (creatingDemo) return false;

    const { selectedPresets, selectedTariffeKeys } = params;
    const tipiImpianto = tipiImpiantoQuery.data ?? [];
    const tipiIntervento = tipiInterventoQuery.data ?? [];
    const listino = listinoQuery.data ?? [];

    const tariffeTarget = selectedTariffeKeys && selectedTariffeKeys.size > 0
      ? STANDARD_TARIFFE_LISTINO.filter((t) =>
          selectedTariffeKeys.has(`${t.impianto}::${t.intervento}`))
      : STANDARD_TARIFFE_LISTINO.filter((t) =>
          t.presets.some((p) => selectedPresets.includes(p)));

    if (tariffeTarget.length === 0) {
      toast.info("Nessuna tariffa selezionata");
      return false;
    }

    const impiantiNomi = new Set(tariffeTarget.map((t) => t.impianto));
    const interventiNomi = new Set(tariffeTarget.map((t) => t.intervento));

    setCreatingDemo(true);
    try {
      const existingImpNomi = new Set(tipiImpianto.map((t) => t.nome));
      const impiantiToInsert = STANDARD_IMPIANTI
        .filter((d) => impiantiNomi.has(d.nome) && !existingImpNomi.has(d.nome))
        .map((d) => ({
          company_id: companyId,
          nome: d.nome,
          icona: d.icona,
          ordine: d.ordine,
          attivo: true,
        }));

      let insertedImpianti: TipoImpianto[] = [];
      if (impiantiToInsert.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("tipi_impianto") as any)
          .insert(impiantiToInsert).select("id, nome");
        if (error) throw error;
        insertedImpianti = (data ?? []) as TipoImpianto[];
      }

      const existingIntNomi = new Set(tipiIntervento.map((t) => t.nome));
      const interventiToInsert = STANDARD_INTERVENTI
        .filter((d) => interventiNomi.has(d.nome) && !existingIntNomi.has(d.nome))
        .map((d) => ({
          company_id: companyId,
          nome: d.nome,
          categoria: d.categoria,
          durata_stimata_h: d.durata_stimata_h,
          attivo: true,
        }));

      let insertedInterventi: TipoIntervento[] = [];
      if (interventiToInsert.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("tipi_intervento") as any)
          .insert(interventiToInsert).select("id, nome");
        if (error) throw error;
        insertedInterventi = (data ?? []) as TipoIntervento[];
      }

      const impByNome = new Map<string, string>([
        ...tipiImpianto.map((t) => [t.nome, t.id] as const),
        ...insertedImpianti.map((t) => [t.nome, t.id] as const),
      ]);
      const intByNome = new Map<string, string>([
        ...tipiIntervento.map((t) => [t.nome, t.id] as const),
        ...insertedInterventi.map((t) => [t.nome, t.id] as const),
      ]);

      const existingKeys = new Set(
        listino.map((l) => `${l.tipo_impianto_id}::${l.tipo_intervento_id}`),
      );

      const listinoToInsert = tariffeTarget
        .map((d) => {
          const impId = impByNome.get(d.impianto);
          const intId = intByNome.get(d.intervento);
          if (!impId || !intId) return null;
          const key = `${impId}::${intId}`;
          if (existingKeys.has(key)) return null;
          return {
            company_id: companyId,
            tipo_impianto_id: impId,
            tipo_intervento_id: intId,
            prezzo_base: d.prezzo,
            iva_percentuale: d.iva_pct,
            unita: d.unita,
            attivo: true,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (listinoToInsert.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("listino_prezzi") as any)
          .insert(listinoToInsert);
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["tipi-impianto", companyId] });
      queryClient.invalidateQueries({ queryKey: ["tipi-intervento", companyId] });
      queryClient.invalidateQueries({ queryKey: ["listino-prezzi", companyId] });

      const totale = impiantiToInsert.length + interventiToInsert.length + listinoToInsert.length;
      if (totale === 0) {
        toast.info("Tutti gli elementi del template sono già presenti");
      } else {
        toast.success(
          `Template importato: ${impiantiToInsert.length} impianti, ${interventiToInsert.length} interventi, ${listinoToInsert.length} tariffe`,
        );
      }
      return true;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore import template");
      return false;
    } finally {
      setCreatingDemo(false);
    }
  };

  return {
    tipiImpianto: tipiImpiantoQuery.data ?? [],
    tipiIntervento: tipiInterventoQuery.data ?? [],
    listino: listinoQuery.data ?? [],
    loadingImpianti: tipiImpiantoQuery.isLoading,
    loadingInterventi: tipiInterventoQuery.isLoading,
    loadingListino: listinoQuery.isLoading,
    deleteImpiantoMutation,
    deleteInterventoMutation,
    deleteListinoMutation,
    seedFromTemplate,
    creatingDemo,
    invalidateImpianti: () =>
      queryClient.invalidateQueries({ queryKey: ["tipi-impianto", companyId] }),
    invalidateInterventi: () =>
      queryClient.invalidateQueries({ queryKey: ["tipi-intervento", companyId] }),
    invalidateListino: () =>
      queryClient.invalidateQueries({ queryKey: ["listino-prezzi", companyId] }),
  };
}
