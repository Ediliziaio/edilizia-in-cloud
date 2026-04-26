/**
 * React Query hooks per il modulo Fotovoltaico.
 * Tutte le query passano per Supabase con RLS company-scoped.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  FvProgetto,
  FvComponente,
  FvManodopera,
  FvServizio,
  FvIncentivoCatalogo,
  FvParametroCalcolo,
  FvProfiloAutoconsumo,
  FvPannelloLayout,
} from "./tipi";

const QK = {
  progetti: ["fv", "progetti"] as const,
  progetto: (id: string) => ["fv", "progetto", id] as const,
  componenti: (progettoId: string) => ["fv", "componenti", progettoId] as const,
  manodopera: (progettoId: string) => ["fv", "manodopera", progettoId] as const,
  servizi: (progettoId: string) => ["fv", "servizi", progettoId] as const,
  pannelli: (progettoId: string) => ["fv", "pannelli", progettoId] as const,
  calcolo: (progettoId: string) => ["fv", "calcolo", progettoId] as const,
  incentiviCatalogo: ["fv", "incentivi-catalogo"] as const,
  parametriCalcolo: ["fv", "parametri-calcolo"] as const,
  profiliAutoconsumo: ["fv", "profili-autoconsumo"] as const,
  templatePdf: ["fv", "template-pdf"] as const,
  statsAzienda: ["fv", "stats-azienda"] as const,
  servizioCatalogo: ["fv", "servizi-catalogo"] as const,
};

// ─── Lista progetti ─────────────────────────────────────────────────────────
export function useProgetti() {
  return useQuery({
    queryKey: QK.progetti,
    queryFn: async (): Promise<Array<FvProgetto & { cliente_nome: string | null }>> => {
      const { data, error } = await supabase
        .from("v_fv_progetti_dashboard" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

export function useProgetto(id: string | undefined) {
  return useQuery({
    queryKey: QK.progetto(id ?? ""),
    enabled: Boolean(id),
    queryFn: async (): Promise<FvProgetto | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("fv_progetti" as never)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as never;
    },
  });
}

export function useCreaProgetto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      titolo: string;
      archetipo: FvProgetto["archetipo"];
      indirizzo: string;
      cliente_id?: string | null;
      prima_casa?: boolean;
    }): Promise<FvProgetto> => {
      // Recupera company_id corrente
      const { data: profile } = await supabase
        .from("profiles" as never)
        .select("company_id")
        .single();
      const company_id = (profile as { company_id: string }).company_id;

      // Genera numero progressivo lato DB
      const { data: numero } = await supabase.rpc(
        "fv_genera_numero_progetto" as never,
        { p_company_id: company_id } as never
      );

      const { data, error } = await supabase
        .from("fv_progetti" as never)
        .insert({
          company_id,
          numero: numero as string,
          titolo: input.titolo,
          archetipo: input.archetipo,
          indirizzo: input.indirizzo,
          cliente_id: input.cliente_id ?? null,
          prima_casa: input.prima_casa ?? null,
          stato: "bozza",
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as never;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.progetti });
    },
  });
}

export function useAggiornaProgetto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<FvProgetto> }) => {
      const { error } = await supabase
        .from("fv_progetti" as never)
        .update(input.patch as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK.progetto(vars.id) });
      qc.invalidateQueries({ queryKey: QK.progetti });
    },
  });
}

export function useEliminaProgetto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("fv_progetti" as never)
        .update({ annullato: true, annullato_il: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.progetti });
    },
  });
}

// ─── Componenti, manodopera, servizi ────────────────────────────────────────
export function useComponentiProgetto(progettoId: string | undefined) {
  return useQuery({
    queryKey: QK.componenti(progettoId ?? ""),
    enabled: Boolean(progettoId),
    queryFn: async (): Promise<FvComponente[]> => {
      if (!progettoId) return [];
      const { data, error } = await supabase
        .from("fv_componenti_progetto" as never)
        .select("*")
        .eq("progetto_id", progettoId)
        .order("ordinamento");
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

export function useManodoperaProgetto(progettoId: string | undefined) {
  return useQuery({
    queryKey: QK.manodopera(progettoId ?? ""),
    enabled: Boolean(progettoId),
    queryFn: async (): Promise<FvManodopera[]> => {
      if (!progettoId) return [];
      const { data, error } = await supabase
        .from("fv_manodopera_progetto" as never)
        .select("*")
        .eq("progetto_id", progettoId)
        .order("ordinamento");
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

export function useServiziProgetto(progettoId: string | undefined) {
  return useQuery({
    queryKey: QK.servizi(progettoId ?? ""),
    enabled: Boolean(progettoId),
    queryFn: async (): Promise<FvServizio[]> => {
      if (!progettoId) return [];
      const { data, error } = await supabase
        .from("fv_servizi_progetto" as never)
        .select("*")
        .eq("progetto_id", progettoId)
        .order("ordinamento");
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

export function usePannelliProgetto(progettoId: string | undefined) {
  return useQuery({
    queryKey: QK.pannelli(progettoId ?? ""),
    enabled: Boolean(progettoId),
    queryFn: async (): Promise<FvPannelloLayout[]> => {
      if (!progettoId) return [];
      const { data, error } = await supabase
        .from("fv_pannelli_layout" as never)
        .select("*")
        .eq("progetto_id", progettoId)
        .eq("attivo", true);
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

// ─── Cataloghi globali ──────────────────────────────────────────────────────

export function useIncentiviCatalogo(soloAttivi = true) {
  return useQuery({
    queryKey: [...QK.incentiviCatalogo, soloAttivi],
    queryFn: async (): Promise<FvIncentivoCatalogo[]> => {
      let q = supabase
        .from("fv_incentivi_catalogo" as never)
        .select("*")
        .order("ordinamento");
      if (soloAttivi) q = q.eq("attivo", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

export function useParametriCalcolo() {
  return useQuery({
    queryKey: QK.parametriCalcolo,
    queryFn: async (): Promise<FvParametroCalcolo[]> => {
      const { data, error } = await supabase
        .from("fv_parametri_calcolo" as never)
        .select("*");
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

export function useProfiliAutoconsumo() {
  return useQuery({
    queryKey: QK.profiliAutoconsumo,
    queryFn: async (): Promise<FvProfiloAutoconsumo[]> => {
      const { data, error } = await supabase
        .from("fv_profili_autoconsumo" as never)
        .select("*")
        .eq("attivo", true)
        .order("ordinamento");
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

// ─── Stats azienda dashboard ────────────────────────────────────────────────
export function useStatsAzienda() {
  return useQuery({
    queryKey: QK.statsAzienda,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_fv_stats_azienda" as never)
        .select("*")
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data as Record<string, unknown> | null) ?? null;
    },
  });
}

// ─── Articoli listino con categoria_fv ──────────────────────────────────────
export function useArticoliFv(categoria?: string) {
  return useQuery({
    queryKey: ["fv", "articoli", categoria ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("articoli_native" as never)
        .select("*")
        .not("categoria_fv", "is", null)
        .eq("attivo", true)
        .order("descrizione");
      if (categoria) q = q.eq("categoria_fv", categoria);
      const { data, error } = await q;
      if (error) throw error;
      return (data as Array<Record<string, unknown>>) ?? [];
    },
  });
}

// ─── Aggiungi/rimuovi componente / manodopera / servizio ────────────────────
export function useUpsertComponenti() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      progetto_id: string;
      righe: Array<Omit<FvComponente, "id" | "progetto_id" | "created_at">>;
      replace?: boolean;
    }) => {
      if (input.replace) {
        await supabase
          .from("fv_componenti_progetto" as never)
          .delete()
          .eq("progetto_id", input.progetto_id);
      }
      if (input.righe.length === 0) return;
      const payload = input.righe.map((r) => ({
        ...r,
        progetto_id: input.progetto_id,
      }));
      const { error } = await supabase
        .from("fv_componenti_progetto" as never)
        .insert(payload as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK.componenti(vars.progetto_id) });
    },
  });
}

export function useUpsertManodopera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      progetto_id: string;
      righe: Array<Omit<FvManodopera, "id" | "progetto_id" | "created_at">>;
      replace?: boolean;
    }) => {
      if (input.replace) {
        await supabase
          .from("fv_manodopera_progetto" as never)
          .delete()
          .eq("progetto_id", input.progetto_id);
      }
      if (input.righe.length === 0) return;
      const payload = input.righe.map((r) => ({
        ...r,
        progetto_id: input.progetto_id,
      }));
      const { error } = await supabase
        .from("fv_manodopera_progetto" as never)
        .insert(payload as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK.manodopera(vars.progetto_id) });
    },
  });
}

export function useUpsertServizi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      progetto_id: string;
      righe: Array<Omit<FvServizio, "id" | "progetto_id" | "created_at">>;
      replace?: boolean;
    }) => {
      if (input.replace) {
        await supabase
          .from("fv_servizi_progetto" as never)
          .delete()
          .eq("progetto_id", input.progetto_id);
      }
      if (input.righe.length === 0) return;
      const payload = input.righe.map((r) => ({
        ...r,
        progetto_id: input.progetto_id,
      }));
      const { error } = await supabase
        .from("fv_servizi_progetto" as never)
        .insert(payload as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK.servizi(vars.progetto_id) });
    },
  });
}

// ─── Template PDF impresa ───────────────────────────────────────────────────
export function useTemplatePdf() {
  return useQuery({
    queryKey: QK.templatePdf,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fv_template_pdf" as never)
        .select("*")
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data as Record<string, unknown> | null) ?? null;
    },
  });
}

export function useUpsertTemplatePdf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const { error } = await supabase
        .from("fv_template_pdf" as never)
        .upsert(input as never, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.templatePdf });
    },
  });
}

// ─── Servizi catalogo per azienda ───────────────────────────────────────────
export function useServiziCatalogo() {
  return useQuery({
    queryKey: QK.servizioCatalogo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fv_servizi_catalogo" as never)
        .select("*")
        .eq("attivo", true)
        .order("ordinamento");
      if (error) throw error;
      return (data as Array<Record<string, unknown>>) ?? [];
    },
  });
}

// ─── Hook feature flag per gating ──────────────────────────────────────────
export function useFvModuloAttivo() {
  return useQuery({
    queryKey: ["fv", "modulo-attivo"],
    queryFn: async (): Promise<{ attivo: boolean; setup_completato: boolean }> => {
      // Ricava company_id effettivo via RPC esistente in EiC
      const { data: companyId } = await supabase.rpc(
        "get_effective_company_id" as never
      );
      if (!companyId) return { attivo: false, setup_completato: false };

      const { data, error } = await supabase
        .from("companies" as never)
        .select("fv_modulo_attivo, fv_setup_completato")
        .eq("id", companyId as string)
        .maybeSingle();
      if (error) throw error;
      const row = data as { fv_modulo_attivo: boolean; fv_setup_completato: boolean } | null;
      return {
        attivo: row?.fv_modulo_attivo ?? false,
        setup_completato: row?.fv_setup_completato ?? false,
      };
    },
  });
}
