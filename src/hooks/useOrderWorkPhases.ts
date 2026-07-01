import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type PhaseStatus = "da_iniziare" | "in_corso" | "completata";
export type ExecutorType = "interno" | "esterno";
export type AssignmentSource = "employee" | "team";

export interface PhaseAssignment {
  id: string;
  source: AssignmentSource; // employee = order_employees, team = order_external_teams
  phase_id: string | null;
  executor_type: ExecutorType;
  employee_id: string | null;
  external_team_id: string | null;
  cost_preventivo: number;
  cost_consuntivo: number; // = total_cost (sorgente di verità letta da margine/dashboard)
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

export interface AddAssignmentPayload {
  phase_id: string | null;
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

export function useOrderWorkPhases(orderId: string | null | undefined) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["order_work_phases", orderId] });
    // La manodopera vive in order_employees/order_external_teams: invalida anche
    // le cache di margine/labor che le leggono, così i numeri si aggiornano ovunque.
    qc.invalidateQueries({ queryKey: ["order-employees", orderId] });
    qc.invalidateQueries({ queryKey: ["order-external-teams", orderId] });
    qc.invalidateQueries({ queryKey: ["oes-employees", orderId] });
    qc.invalidateQueries({ queryKey: ["oes-external-teams", orderId] });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["order_work_phases", orderId],
    enabled: !!orderId && !!companyId,
    queryFn: async () => {
      const [phasesRes, empRes, teamRes] = await Promise.all([
        db.from("order_work_phases").select("*").eq("order_id", orderId!).order("position", { ascending: true }),
        db.from("order_employees").select("id, employee_id, phase_id, total_cost, cost_preventivo, hours_worked, notes").eq("order_id", orderId!),
        db.from("order_external_teams").select("id, external_team_id, phase_id, total_cost, cost_preventivo, is_paid, paid_date, notes").eq("order_id", orderId!),
      ]);
      if (phasesRes.error) throw phasesRes.error;
      if (empRes.error) throw empRes.error;
      if (teamRes.error) throw teamRes.error;

      const empAssignments: PhaseAssignment[] = (empRes.data ?? []).map((e: Record<string, unknown>) => ({
        id: e.id as string,
        source: "employee",
        phase_id: (e.phase_id as string) ?? null,
        executor_type: "interno",
        employee_id: (e.employee_id as string) ?? null,
        external_team_id: null,
        cost_preventivo: Number(e.cost_preventivo) || 0,
        cost_consuntivo: Number(e.total_cost) || 0,
        hours: e.hours_worked != null ? Number(e.hours_worked) : null,
        is_paid: false,
        paid_date: null,
        notes: (e.notes as string) ?? null,
      }));

      const teamAssignments: PhaseAssignment[] = (teamRes.data ?? []).map((t: Record<string, unknown>) => ({
        id: t.id as string,
        source: "team",
        phase_id: (t.phase_id as string) ?? null,
        executor_type: "esterno",
        employee_id: null,
        external_team_id: (t.external_team_id as string) ?? null,
        cost_preventivo: Number(t.cost_preventivo) || 0,
        cost_consuntivo: Number(t.total_cost) || 0,
        hours: null,
        is_paid: Boolean(t.is_paid),
        paid_date: (t.paid_date as string) ?? null,
        notes: (t.notes as string) ?? null,
      }));

      const all = [...empAssignments, ...teamAssignments];
      const phases: WorkPhase[] = (phasesRes.data ?? []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        order_id: p.order_id as string,
        name: p.name as string,
        position: Number(p.position) || 0,
        status: (p.status as PhaseStatus) ?? "da_iniziare",
        start_date: (p.start_date as string) ?? null,
        end_date: (p.end_date as string) ?? null,
        notes: (p.notes as string) ?? null,
        assignments: all.filter((a) => a.phase_id === p.id),
      }));

      const unassigned = all.filter((a) => !a.phase_id);
      return { phases, unassigned, all };
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees_active", companyId],
    enabled: !!companyId,
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
  });

  const { data: externalTeams = [] } = useQuery({
    queryKey: ["external_teams_active", companyId],
    enabled: !!companyId,
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
  });

  const phases = data?.phases ?? [];
  const unassigned = data?.unassigned ?? [];
  const allAssignments = data?.all ?? [];

  const addPhase = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await db.from("order_work_phases").insert({
        company_id: companyId, order_id: orderId, name, position: phases.length,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const applyTemplate = useMutation({
    mutationFn: async () => {
      const base = phases.length;
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
    // ON DELETE SET NULL: le assegnazioni non vengono cancellate, tornano "Senza fase"
    // → nessun costo/margine perso.
    mutationFn: async (id: string) => {
      const { error } = await db.from("order_work_phases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const addAssignment = useMutation({
    mutationFn: async (a: AddAssignmentPayload) => {
      if (a.executor_type === "interno") {
        const { error } = await db.from("order_employees").insert({
          order_id: orderId,
          employee_id: a.employee_id,
          phase_id: a.phase_id,
          total_cost: a.cost_consuntivo,
          cost_preventivo: a.cost_preventivo,
          hours_worked: a.hours ?? 0,
          hourly_rate: 0,
          notes: a.notes,
        });
        if (error) throw error;
      } else {
        const { error } = await db.from("order_external_teams").insert({
          order_id: orderId,
          external_team_id: a.external_team_id,
          phase_id: a.phase_id,
          total_cost: a.cost_consuntivo,
          cost_preventivo: a.cost_preventivo,
          is_paid: a.is_paid,
          paid_date: a.paid_date,
          notes: a.notes,
        });
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const updateAssignment = useMutation({
    mutationFn: async ({ id, source, patch }: { id: string; source: AssignmentSource; patch: Partial<Pick<PhaseAssignment, "cost_preventivo" | "cost_consuntivo" | "hours" | "is_paid" | "paid_date" | "phase_id" | "notes">> }) => {
      if (source === "employee") {
        const row: Record<string, unknown> = {};
        if (patch.cost_preventivo !== undefined) row.cost_preventivo = patch.cost_preventivo;
        if (patch.cost_consuntivo !== undefined) row.total_cost = patch.cost_consuntivo;
        if (patch.hours !== undefined) row.hours_worked = patch.hours;
        if (patch.phase_id !== undefined) row.phase_id = patch.phase_id;
        if (patch.notes !== undefined) row.notes = patch.notes;
        const { error } = await db.from("order_employees").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const row: Record<string, unknown> = {};
        if (patch.cost_preventivo !== undefined) row.cost_preventivo = patch.cost_preventivo;
        if (patch.cost_consuntivo !== undefined) row.total_cost = patch.cost_consuntivo;
        if (patch.is_paid !== undefined) {
          row.is_paid = patch.is_paid;
          row.paid_date = patch.is_paid ? new Date().toLocaleDateString("en-CA") : null;
        }
        if (patch.paid_date !== undefined) row.paid_date = patch.paid_date;
        if (patch.phase_id !== undefined) row.phase_id = patch.phase_id;
        if (patch.notes !== undefined) row.notes = patch.notes;
        const { error } = await db.from("order_external_teams").update(row).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const deleteAssignment = useMutation({
    mutationFn: async ({ id, source }: { id: string; source: AssignmentSource }) => {
      const table = source === "employee" ? "order_employees" : "order_external_teams";
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const totals = allAssignments.reduce(
    (acc, a) => {
      acc.preventivo += Number(a.cost_preventivo) || 0;
      acc.consuntivo += Number(a.cost_consuntivo) || 0;
      return acc;
    },
    { preventivo: 0, consuntivo: 0 },
  );

  return {
    phases,
    unassigned,
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
