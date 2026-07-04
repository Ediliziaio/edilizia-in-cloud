import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  HrKpi, HrKpiValore, KpiAuto, KpiUnita, KpiDirezione, KpiPeriodo, KpiAutoMetric,
} from "@/types/hr";
import { toast } from "sonner";

/** Definizioni KPI di un dipendente. */
export function useHrKpi(profiloId: string | null | undefined) {
  return useQuery({
    queryKey: ["hr-kpi", profiloId],
    enabled: !!profiloId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_kpi")
        .select("*")
        .eq("profilo_id", profiloId!)
        .eq("attivo", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as HrKpi[];
    },
    staleTime: 60 * 1000,
  });
}

/** Storico valori dei KPI manuali di un dipendente (tutti i KPI in un colpo). */
export function useHrKpiValori(profiloId: string | null | undefined, kpiIds: string[]) {
  return useQuery({
    queryKey: ["hr-kpi-valori", profiloId],
    enabled: !!profiloId && kpiIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_kpi_valori")
        .select("*")
        .in("kpi_id", kpiIds)
        .order("periodo_label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as HrKpiValore[];
    },
    staleTime: 60 * 1000,
  });
}

/** KPI auto-calcolati dalla RPC hr_persona_kpi_auto (presenza, ore, task). */
export function useHrKpiAuto(profiloId: string | null | undefined, periodo: string) {
  return useQuery({
    queryKey: ["hr-kpi-auto", profiloId, periodo],
    enabled: !!profiloId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hr_persona_kpi_auto", {
        p_profilo_id: profiloId!,
        p_periodo: periodo,
      });
      if (error) throw error;
      return (data ?? { presenza_pct: 0, ore_mese: 0, task_completati: 0, task_totali: 0 }) as unknown as KpiAuto;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface KpiInput {
  nome: string;
  unita?: KpiUnita;
  target?: number | null;
  direzione?: KpiDirezione;
  periodo?: KpiPeriodo;
  auto_metric?: KpiAutoMetric | null;
  tipo?: "manuale" | "auto";
  origine_mansione_id?: string | null;
}

/** Create/delete KPI + setValore sul periodo corrente. */
export function useHrKpiMutations(profiloId: string, companyId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["hr-kpi", profiloId] });
    qc.invalidateQueries({ queryKey: ["hr-kpi-valori", profiloId] });
  };

  const create = useMutation({
    mutationFn: async (input: KpiInput) => {
      const nome = input.nome?.trim();
      if (!nome) throw new Error("Il nome del KPI è obbligatorio");
      const { error } = await supabase.from("hr_kpi").insert({
        company_id: companyId,
        profilo_id: profiloId,
        nome,
        unita: input.unita ?? "num",
        target: input.target ?? null,
        direzione: input.direzione ?? "su",
        periodo: input.periodo ?? "mensile",
        tipo: input.tipo ?? "manuale",
        auto_metric: input.auto_metric ?? null,
        origine_mansione_id: input.origine_mansione_id ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("KPI creato");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore creazione KPI"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_kpi").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("KPI eliminato");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore eliminazione KPI"),
  });

  const setValore = useMutation({
    mutationFn: async ({ kpiId, periodo, valore, note }: { kpiId: string; periodo: string; valore: number; note?: string | null }) => {
      const { error } = await supabase
        .from("hr_kpi_valori")
        .upsert(
          { kpi_id: kpiId, periodo_label: periodo, valore, note: note ?? null } as any,
          { onConflict: "kpi_id,periodo_label" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Valore aggiornato");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore aggiornamento valore"),
  });

  return { create, remove, setValore };
}
