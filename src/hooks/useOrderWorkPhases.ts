import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
  /** Avanzamento reale 0-100 dichiarato dai rapportini di campo */
  percentuale: number;
  assignments: PhaseAssignment[];
}

export interface ExecutorOption {
  id: string;
  label: string;
}

// Stato di approvvigionamento di un articolo/materiale della commessa:
// magazzino = collegato a giacenza, ordinato = coperto da un OdA, da_ordinare = scoperto.
export type MaterialReadiness = "magazzino" | "ordinato" | "da_ordinare";

export interface PhaseMaterial {
  id: string;
  name: string;
  quantity: number;
  phase_id: string | null;
  supplier_id: string | null;
  purchase_price: number | null;
  vat_rate: number | null;
  readiness: MaterialReadiness;
  odaNumber: string | null;
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

/** Modelli di fasi per tipo di lavoro edile: creano in un clic le fasi standard
 *  della lavorazione, così si può assegnare subito manodopera/subappalti. */
export interface PhaseTemplate {
  key: string;
  label: string;
  hint: string;
  phases: string[];
}

export const PHASE_TEMPLATES: PhaseTemplate[] = [
  {
    key: "ristrutturazione_completa",
    label: "Ristrutturazione completa",
    hint: "Appartamento/villa a 360°",
    phases: RISTRUTTURAZIONE_TEMPLATE,
  },
  {
    key: "ristrutturazione_bagno",
    label: "Ristrutturazione bagno",
    hint: "Rifacimento bagno chiavi in mano",
    phases: [
      "Demolizioni e rimozioni",
      "Impianto idraulico",
      "Impianto elettrico",
      "Massetti e impermeabilizzazione",
      "Posa rivestimenti e pavimenti",
      "Sanitari e accessori",
      "Box doccia e serramenti",
      "Silicature e finiture",
    ],
  },
  {
    key: "nuova_costruzione",
    label: "Nuova costruzione",
    hint: "Edificio da zero",
    phases: [
      "Scavi e fondazioni",
      "Struttura portante (c.a./muratura)",
      "Copertura e tetto",
      "Tamponamenti e tramezzi",
      "Impianto idraulico",
      "Impianto elettrico",
      "Massetti e sottofondi",
      "Intonaci e cartongessi",
      "Serramenti",
      "Posa pavimenti e rivestimenti",
      "Tinteggiature",
      "Finiture e pulizie finali",
    ],
  },
  {
    key: "cappotto_facciata",
    label: "Cappotto / Facciata",
    hint: "Isolamento e rifacimento facciata",
    phases: [
      "Ponteggio e allestimento cantiere",
      "Preparazione del supporto",
      "Posa pannelli isolanti",
      "Rasatura e rete armata",
      "Finitura e tinteggiatura",
      "Smontaggio ponteggio e pulizie",
    ],
  },
  {
    key: "serramenti_infissi",
    label: "Serramenti / Infissi",
    hint: "Sostituzione finestre e porte",
    phases: [
      "Rilievo misure",
      "Rimozione vecchi serramenti",
      "Posa nuovi serramenti",
      "Sigillature e finiture",
      "Oscuranti e zanzariere",
      "Collaudo e pulizie",
    ],
  },
  {
    key: "impianti",
    label: "Impianti",
    hint: "Elettrico, idraulico, clima",
    phases: [
      "Tracce e predisposizioni",
      "Impianto elettrico",
      "Impianto idraulico",
      "Climatizzazione / riscaldamento",
      "Collaudi e certificazioni",
    ],
  },
  {
    key: "tetto_copertura",
    label: "Tetto / Copertura",
    hint: "Rifacimento copertura",
    phases: [
      "Ponteggio e sicurezza",
      "Rimozione manto esistente",
      "Struttura e coibentazione",
      "Impermeabilizzazione / guaina",
      "Posa manto di copertura",
      "Lattoneria e pluviali",
      "Smontaggio e pulizie",
    ],
  },
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
    // Riga "Cantiere: N/M fasi" sotto lo stepper in OrderDetail
    qc.invalidateQueries({ queryKey: ["order-phases-progress", orderId] });
    // La manodopera vive in order_employees/order_external_teams: invalida anche
    // le cache di margine/labor che le leggono, così i numeri si aggiornano ovunque:
    // dettaglio commessa (Conto economico), lista commesse (colonne costi/margine),
    // dashboard (statistiche manodopera). Prefix-match perché le chiavi includono
    // orderIds/companyId variabili.
    qc.invalidateQueries({ queryKey: ["order-employees", orderId] });
    qc.invalidateQueries({ queryKey: ["order-external-teams", orderId] });
    qc.invalidateQueries({ queryKey: ["oes-employees", orderId] });
    qc.invalidateQueries({ queryKey: ["oes-external-teams", orderId] });
    qc.invalidateQueries({ queryKey: ["order-employees-costs"] });
    qc.invalidateQueries({ queryKey: ["order-external-teams-costs"] });
    qc.invalidateQueries({ queryKey: ["laborStats"] });
    // Materiali per fase (order_items.phase_id): eliminare una fase li rimanda "Senza fase"
    qc.invalidateQueries({ queryKey: ["order-items-materials", orderId] });
  };

  // Ogni mutation fallita mostra un toast (prima: fallimenti silenziosi → spinner
  // infinito nel dialog "Aggiungi esecutore" e input che tornano indietro senza avviso).
  const onError = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Operazione non riuscita. Riprova.");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["order_work_phases", orderId],
    enabled: !!orderId && !!companyId,
    queryFn: async () => {
      const [phasesRes, empRes, teamRes] = await Promise.all([
        db.from("order_work_phases").select("*").eq("order_id", orderId!).order("position", { ascending: true }),
        db.from("order_employees").select("id, employee_id, phase_id, total_cost, cost_preventivo, hours_worked, is_paid, paid_date, notes").eq("order_id", orderId!),
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
        is_paid: Boolean(e.is_paid),
        paid_date: (e.paid_date as string) ?? null,
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
        percentuale: Number(p.percentuale) || 0,
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

  // Materiali della commessa (order_items) con stato di approvvigionamento:
  // coperti da OdA → "ordinato", collegati a giacenza → "magazzino", altrimenti "da_ordinare".
  // phase_id non è nei tipi generati → db cast.
  const { data: materials = [] } = useQuery({
    queryKey: ["order-items-materials", orderId],
    enabled: !!orderId,
    staleTime: 30000,
    queryFn: async () => {
      const { data: items, error } = await db
        .from("order_items")
        .select("id, name, quantity, phase_id, stock_item_id, supplier_id, purchase_price, vat_rate")
        .eq("order_id", orderId!);
      if (error) throw error;
      const rows = (items ?? []) as Record<string, unknown>[];

      // Copertura OdA: order_item_id → numero OdA (stesso pattern di OrderItemsList)
      const odaByItem = new Map<string, string | null>();
      if (rows.length > 0) {
        const { data: coverage, error: covError } = await supabase
          .from("purchase_order_items")
          .select("order_item_id, purchase_orders!inner(oda_number, status)")
          .in("order_item_id", rows.map((r) => r.id as string));
        if (covError) throw covError;
        for (const row of (coverage ?? []) as unknown as Array<{
          order_item_id: string;
          purchase_orders: { oda_number: string; status: string };
        }>) {
          if (!row.order_item_id || odaByItem.has(row.order_item_id)) continue;
          odaByItem.set(row.order_item_id, row.purchase_orders?.oda_number ?? null);
        }
      }

      return rows.map((r): PhaseMaterial => {
        const id = r.id as string;
        const covered = odaByItem.has(id);
        const readiness: MaterialReadiness = covered
          ? "ordinato"
          : r.stock_item_id
            ? "magazzino"
            : "da_ordinare";
        return {
          id,
          name: (r.name as string) ?? "",
          quantity: Number(r.quantity) || 0,
          phase_id: (r.phase_id as string) ?? null,
          supplier_id: (r.supplier_id as string) ?? null,
          purchase_price: r.purchase_price != null ? Number(r.purchase_price) : null,
          vat_rate: r.vat_rate != null ? Number(r.vat_rate) : null,
          readiness,
          odaNumber: covered ? (odaByItem.get(id) ?? null) : null,
        };
      });
    },
  });

  const materialsByPhase = useMemo(() => {
    const map = new Map<string, PhaseMaterial[]>();
    for (const m of materials) {
      if (!m.phase_id) continue;
      const list = map.get(m.phase_id);
      if (list) list.push(m);
      else map.set(m.phase_id, [m]);
    }
    return map;
  }, [materials]);

  const unassignedMaterials = useMemo(
    () => materials.filter((m) => !m.phase_id),
    [materials],
  );

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
    onError,
  });

  const applyTemplate = useMutation({
    mutationFn: async (names: string[]) => {
      const base = phases.length;
      const rows = names.map((name, i) => ({
        company_id: companyId, order_id: orderId, name, position: base + i,
      }));
      const { error } = await db.from("order_work_phases").insert(rows);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError,
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
    onError,
  });

  const deletePhase = useMutation({
    // ON DELETE SET NULL: le assegnazioni non vengono cancellate, tornano "Senza fase"
    // → nessun costo/margine perso.
    mutationFn: async (id: string) => {
      const { error } = await db.from("order_work_phases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError,
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
    onError,
  });

  const updateAssignment = useMutation({
    mutationFn: async ({ id, source, patch }: { id: string; source: AssignmentSource; patch: Partial<Pick<PhaseAssignment, "cost_preventivo" | "cost_consuntivo" | "hours" | "is_paid" | "paid_date" | "phase_id" | "notes">> }) => {
      const table = source === "employee" ? "order_employees" : "order_external_teams";
      const row: Record<string, unknown> = {};
      if (patch.cost_preventivo !== undefined) row.cost_preventivo = patch.cost_preventivo;
      if (patch.cost_consuntivo !== undefined) row.total_cost = patch.cost_consuntivo;
      if (patch.hours !== undefined && source === "employee") row.hours_worked = patch.hours;
      // is_paid/paid_date esistono su entrambe le tabelle: gestione uniforme
      if (patch.is_paid !== undefined) {
        row.is_paid = patch.is_paid;
        row.paid_date = patch.is_paid ? new Date().toISOString().slice(0, 10) : null;
      }
      if (patch.paid_date !== undefined) row.paid_date = patch.paid_date;
      if (patch.phase_id !== undefined) row.phase_id = patch.phase_id;
      if (patch.notes !== undefined) row.notes = patch.notes;
      const { error } = await db.from(table).update(row).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError,
  });

  // Sposta un articolo su una fase (o lo toglie con phaseId = null)
  const setMaterialPhase = useMutation({
    mutationFn: async ({ itemId, phaseId }: { itemId: string; phaseId: string | null }) => {
      const { error } = await db.from("order_items").update({ phase_id: phaseId }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order-items-materials", orderId] }),
    onError: () => toast.error("Operazione non riuscita. Riprova."),
  });

  // Divide un articolo su più fasi ("100 kg usati in più fasi"): la riga
  // originale tiene la prima parte (e tutti gli altri campi), le parti
  // successive diventano nuove righe order_items con i soli campi core copiati.
  const splitMaterial = useMutation({
    mutationFn: async ({
      itemId,
      parts,
    }: {
      itemId: string;
      parts: { phaseId: string | null; quantity: number }[];
    }) => {
      // Rileggo la riga fresca dal DB: la cache potrebbe essere stantia
      const { data: original, error } = await db
        .from("order_items")
        .select("id, order_id, name, quantity, purchase_price, vat_rate, supplier_id, stock_item_id, phase_id")
        .eq("id", itemId)
        .single();
      if (error) throw error;

      if (parts.length < 2) throw new Error("Servono almeno 2 righe per dividere.");
      if (parts.some((p) => !Number.isInteger(p.quantity) || p.quantity <= 0)) {
        throw new Error("Ogni quantità deve essere un numero intero maggiore di zero.");
      }
      const totalQty = Number(original.quantity) || 0;
      const sum = parts.reduce((acc, p) => acc + p.quantity, 0);
      if (sum !== totalQty) throw new Error(`La somma delle quantità deve essere ${totalQty}.`);

      // La riga originale tiene la prima parte
      const { error: updError } = await db
        .from("order_items")
        .update({ quantity: parts[0].quantity, phase_id: parts[0].phaseId })
        .eq("id", itemId);
      if (updError) throw updError;

      // Le altre parti diventano nuove righe (solo campi core, il resto vive sull'originale)
      const rows = parts.slice(1).map((p) => ({
        order_id: original.order_id,
        name: original.name,
        quantity: p.quantity,
        purchase_price: original.purchase_price,
        vat_rate: original.vat_rate,
        supplier_id: original.supplier_id,
        stock_item_id: original.stock_item_id,
        phase_id: p.phaseId,
      }));
      const { error: insError } = await db.from("order_items").insert(rows);
      if (insError) throw insError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-items-materials", orderId] });
      // Lista articoli in OrderDetail: quantità e righe sono cambiate
      qc.invalidateQueries({ queryKey: ["order-items", orderId] });
      toast.success("Materiale diviso su più fasi");
    },
    onError,
  });

  const deleteAssignment = useMutation({
    mutationFn: async ({ id, source }: { id: string; source: AssignmentSource }) => {
      const table = source === "employee" ? "order_employees" : "order_external_teams";
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError,
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
    isError,
    refetch,
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
    materialsByPhase,
    unassignedMaterials,
    setMaterialPhase,
    splitMaterial,
  };
}
