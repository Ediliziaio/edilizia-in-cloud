import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type PhaseStatus = "da_iniziare" | "in_corso" | "completata";
export type ExecutorType = "interno" | "esterno";

export interface PhaseAssignment {
  id: string;
  phase_id: string;
  order_id: string;
  executor_type: ExecutorType;
  employee_id: string | null;
  external_team_id: string | null;
  cost_preventivo: number;
  cost_consuntivo: number;
  hours: number | null;
  is_paid: boolean;
  paid_date: string | null;
  notes: string | null;
}

export interface WorkPhase {
  id: string;
  order_id: string;
  name: string;
  position: number;
  status: PhaseStatus;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  assignments: PhaseAssignment[];
}

export interface ExecutorOption {
  id: string;
  label: string;
}

// Fasi standard di una ristrutturazione (template "1 clic")
export const RISTRUTTURAZIONE_TEMPLATE: string[] = [
  "Demolizioni e rimozioni",
  "Opere murarie",
  "Impianto idraulico",
  "Impianto elettrico",
  "Massetti e sottofondi",
  "Intonaci e cartongessi",
  "Posa pavimenti e rivestimenti",
  "Serramenti",
  "Tinteggiature",
  "Finiture e pulizie finali",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useOrderWorkPhases(orderId: string | null | undefined) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["order_work_phases", orderId] });

  const { data, isLoading } = useQuery({
    queryKey: ["order_work_phases", orderId],
    queryFn: async () => {
      const { data: phases, error } = await db
        .from("order_work_phases")
        .select("*, order_phase_assignments(*)")
        .eq("order_id", orderId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (phases ?? []).map((p: Record<string, unknown>) => ({
        ...p,
        assignments: (p.order_phase_assignments as PhaseAssignment[]) ?? [],
      })) as WorkPhase[];
    },
    enabled: !!orderId && !!companyId,
  });

  // Liste esecutori per i picker
  const { data: employees = [] } = useQuery({
    queryKey: ["employees_active", companyId],
    queryFn: async () => {
      const { data, error } = await db
        .from("employees")
        .select("id, first_name, last_name")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("last_name");
      if (error) throw error;
      return (data ?? []).map((e: { id: string; first_name: string; last_name: string }) => ({
        id: e.id,
        label: `${e.first_name} ${e.last_name}`.trim(),
      })) as ExecutorOption[];
    },
    enabled: !!companyId,
  });

  const { data: externalTeams = [] } = useQuery({
    queryKey: ["external_teams_active", companyId],
    queryFn: async () => {
      const { data, error } = await db
        .from("external_teams")
        .select("id, name")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((t: { id: string; name: string }) => ({ id: t.id, label: t.name })) as ExecutorOption[];
    },
    enabled: !!companyId,
  });

  const addPhase = useMutation({
    mutationFn: async (name: string) => {
      const position = (data?.length ?? 0);
      const { error } = await db.from("order_work_phases").insert({
        company_id: companyId, order_id: orderId, name, position,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const applyTemplate = useMutation({
    mutationFn: async () => {
      const base = data?.length ?? 0;
      const rows = RISTRUTTURAZIONE_TEMPLATE.map((name, i) => ({
        company_id: companyId, order_id: orderId, name, position: base + i,
      }));
      const { error } = await db.from("order_work_phases").insert(rows);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updatePhase = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Pick<WorkPhase, "name" | "status" | "start_date" | "end_date" | "notes" | "position">>) => {
      const { error } = await db
        .from("order_work_phases")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deletePhase = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("order_work_phases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const addAssignment = useMutation({
    mutationFn: async (a: Omit<PhaseAssignment, "id">) => {
      const { error } = await db.from("order_phase_assignments").insert({
        ...a, company_id: companyId, order_id: orderId,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateAssignment = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<PhaseAssignment>) => {
      const { error } = await db.from("order_phase_assignments").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("order_phase_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const phases = data ?? [];

  // Totali manodopera (preventivo, consuntivo, scostamento)
  const totals = phases.reduce(
    (acc, p) => {
      for (const a of p.assignments) {
        acc.preventivo += Number(a.cost_preventivo) || 0;
        acc.consuntivo += Number(a.cost_consuntivo) || 0;
      }
      return acc;
    },
    { preventivo: 0, consuntivo: 0 },
  );

  return {
    phases,
    isLoading,
    employees,
    externalTeams,
    totals: { ...totals, scostamento: totals.consuntivo - totals.preventivo },
    addPhase,
    applyTemplate,
    updatePhase,
    deletePhase,
    addAssignment,
    updateAssignment,
    deleteAssignment,
  };
}
