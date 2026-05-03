/**
 * Hook React Query — Note esplicative su voci di prospetto.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NoteScope = "CE" | "SP" | "PFN" | "CASHFLOW" | "BUDGET" | "PIANO";

export interface NotaVoce {
  id: string;
  company_id: string;
  anno: number;
  scope: NoteScope;
  codice_voce: string;
  contenuto: string;
  created_at: string;
  updated_at: string;
}

export function useNoteVoci(anno: number, scope: NoteScope) {
  return useQuery({
    queryKey: ["cg", "note-voci", anno, scope] as const,
    queryFn: async (): Promise<NotaVoce[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cg_note_voci")
        .select("*")
        .eq("anno", anno)
        .eq("scope", scope);
      if (error) throw error;
      return (data ?? []) as NotaVoce[];
    },
    staleTime: 60_000,
  });
}

export function useUpsertNotaVoce() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      anno: number;
      scope: NoteScope;
      codice_voce: string;
      contenuto: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cg_note_voci")
        .upsert(input, { onConflict: "company_id,anno,scope,codice_voce" })
        .select()
        .single();
      if (error) throw error;
      return data as NotaVoce;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["cg", "note-voci", vars.anno, vars.scope] });
    },
  });
}

export function useDeleteNotaVoce() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("cg_note_voci").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cg", "note-voci"] });
    },
  });
}
