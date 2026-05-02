/**
 * React Query hooks per il modulo Finanziamenti.
 * Tutto passa per Supabase con RLS company-scoped.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type {
  Finanziaria,
  TabellaFinanziamento,
  RigaTabellaFinanziamento,
} from "./types";

const QK = {
  finanziarie: (companyId?: string) => ["finanziamenti", "finanziarie", companyId] as const,
  tabelle: (companyId?: string) => ["finanziamenti", "tabelle", companyId] as const,
  tabella: (id: string, companyId?: string) => ["finanziamenti", "tabella", id, companyId] as const,
  righe: (tabellaId: string, companyId?: string) =>
    ["finanziamenti", "righe", tabellaId, companyId] as const,
};

// ─── Finanziarie ────────────────────────────────────────────────────────────
export function useFinanziarie() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.finanziarie(companyId ?? undefined),
    enabled: !!companyId,
    queryFn: async (): Promise<Finanziaria[]> => {
      const { data, error } = await supabase
        .from("eic_finanziarie" as never)
        .select("*")
        .eq("company_id", companyId)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data as unknown as Finanziaria[]) ?? [];
    },
  });
}

export function useCreateFinanziaria() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (input: {
      nome: string;
      ragione_sociale?: string;
      partita_iva?: string;
      logo_url?: string;
      email_pratiche?: string;
      telefono?: string;
      note?: string;
    }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { data, error } = await supabase
        .from("eic_finanziarie" as never)
        .insert({ ...input, company_id: companyId } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Finanziaria;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.finanziarie(companyId ?? undefined) });
    },
  });
}

// ─── Tabelle ────────────────────────────────────────────────────────────────
export function useTabelle() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.tabelle(companyId ?? undefined),
    enabled: !!companyId,
    queryFn: async (): Promise<
      Array<TabellaFinanziamento & { finanziaria_nome: string | null }>
    > => {
      const { data, error } = await supabase
        .from("eic_tabelle_finanziamento" as never)
        .select(
          "*, finanziaria:eic_finanziarie(nome)"
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as unknown as Array<TabellaFinanziamento & { finanziaria: { nome: string } | null }>) ?? []).map(
        (t) => ({
          ...t,
          finanziaria_nome: t.finanziaria?.nome ?? null,
        })
      );
    },
  });
}

export function useTabella(id: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.tabella(id ?? "", companyId ?? undefined),
    enabled: Boolean(id) && !!companyId,
    queryFn: async (): Promise<
      (TabellaFinanziamento & { finanziaria: Finanziaria | null }) | null
    > => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("eic_tabelle_finanziamento" as never)
        .select("*, finanziaria:eic_finanziarie(*)")
        .eq("id", id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as never;
    },
  });
}

export function useRighe(tabellaId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.righe(tabellaId ?? "", companyId ?? undefined),
    enabled: Boolean(tabellaId) && !!companyId,
    queryFn: async (): Promise<RigaTabellaFinanziamento[]> => {
      if (!tabellaId) return [];
      const { data, error } = await supabase
        .from("eic_tabelle_finanziamento_righe" as never)
        .select("*")
        .eq("tabella_id", tabellaId)
        .eq("company_id", companyId)
        .order("importo_erogato", { ascending: true })
        .order("numero_rate", { ascending: true });
      if (error) throw error;
      return (data as unknown as RigaTabellaFinanziamento[]) ?? [];
    },
  });
}

export function useCreateTabella() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (input: {
      finanziaria_id: string;
      nome_prodotto: string;
      codice_condizione?: string | null;
      subtariffa_default?: string | null;
      tan_base?: number | null;
      pdf_url?: string | null;
      pdf_filename?: string | null;
      csv_url?: string | null;
      csv_filename?: string | null;
      data_decorrenza?: string | null;
      data_scadenza?: string | null;
      note?: string | null;
    }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { data, error } = await supabase
        .from("eic_tabelle_finanziamento" as never)
        .insert({ ...input, company_id: companyId } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as TabellaFinanziamento;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.tabelle(companyId ?? undefined) });
    },
  });
}

export function useDeleteTabella() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { error } = await supabase
        .from("eic_tabelle_finanziamento" as never)
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.tabelle(companyId ?? undefined) });
    },
  });
}

export function useToggleTabellaAttiva() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async ({ id, attiva }: { id: string; attiva: boolean }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { error } = await supabase
        .from("eic_tabelle_finanziamento" as never)
        .update({ attiva } as never)
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK.tabelle(companyId ?? undefined) });
      qc.invalidateQueries({ queryKey: QK.tabella(vars.id, companyId ?? undefined) });
    },
  });
}

export function useInsertRigheBatch() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (input: {
      tabella_id: string;
      righe: Array<
        Omit<
          RigaTabellaFinanziamento,
          "id" | "tabella_id" | "company_id" | "created_at"
        >
      >;
    }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      // Recupera company_id della tabella (per soddisfare RLS check sulle righe)
      const { data: tab, error: errTab } = await supabase
        .from("eic_tabelle_finanziamento" as never)
        .select("company_id")
        .eq("id", input.tabella_id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (errTab) throw errTab;
      if (!tab) throw new Error("Tabella non trovata");

      const payload = input.righe.map((r) => ({
        ...r,
        tabella_id: input.tabella_id,
        company_id: companyId,
      }));

      // Inserimento a chunk da 500 per evitare timeout su tabelle grandi
      const CHUNK = 500;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const slice = payload.slice(i, i + CHUNK);
        const { error } = await supabase
          .from("eic_tabelle_finanziamento_righe" as never)
          .insert(slice as never);
        if (error) throw error;
      }
      return payload.length;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK.tabelle(companyId ?? undefined) });
      qc.invalidateQueries({ queryKey: QK.tabella(vars.tabella_id, companyId ?? undefined) });
      qc.invalidateQueries({ queryKey: QK.righe(vars.tabella_id, companyId ?? undefined) });
    },
  });
}

/** Cancella tutte le righe di una tabella (per re-import). */
export function useDeleteRigheTabella() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (tabellaId: string) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { error } = await supabase
        .from("eic_tabelle_finanziamento_righe" as never)
        .delete()
        .eq("tabella_id", tabellaId)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: (_d, tabellaId) => {
      qc.invalidateQueries({ queryKey: QK.righe(tabellaId, companyId ?? undefined) });
      qc.invalidateQueries({ queryKey: QK.tabella(tabellaId, companyId ?? undefined) });
      qc.invalidateQueries({ queryKey: QK.tabelle(companyId ?? undefined) });
    },
  });
}
