import { supabase } from "@/integrations/supabase/client";

export interface CampoAssignedOrder {
  id: string;
  company_id: string;
  order_code: string | null;
  description: string | null;
  status: string | null;
  indirizzo_lavori: string | null;
  percentuale_avanzamento: number | null;
  work_start_date: string | null;
  work_end_date: string | null;
}
export type CampoAssignmentSource = "direct" | "employee" | "contract" | "subcontractor_team";
export interface CampoResolvedAssignment {
  id: string;
  order_id: string;
  order: CampoAssignedOrder;
  is_capocantiere: boolean;
  sources: Array<{ kind: CampoAssignmentSource; id: string }>;
}
interface AssignmentRow {
  id: string;
  order_id: string | null;
  is_capocantiere?: boolean | null;
  order: CampoAssignedOrder | null;
}
const ORDER_SELECT = "id, company_id, order_code, description, status, indirizzo_lavori, percentuale_avanzamento, work_start_date, work_end_date";
const ASSIGNMENT_SELECT = `id, order_id, order:orders!inner(${ORDER_SELECT})`;

/** Sources are additive. RLS remains the authority for reads/writes: these
 * rows never bypass server checks. Dates remain organizational until the
 * server-side revocation model is implemented and verified. */
export async function loadCampoAssignments(
  userId: string, companyId: string,
  options: { orderId?: string; includeClosed?: boolean } = {},
): Promise<CampoResolvedAssignment[]> {
  if (!userId || !companyId) return [];
  let directQuery = supabase.from("order_campo_assignments")
    .select(`is_capocantiere, ${ASSIGNMENT_SELECT}`)
    .eq("user_id", userId).eq("company_id", companyId).eq("order.company_id", companyId);
  if (options.orderId) directQuery = directQuery.eq("order_id", options.orderId);
  const [direct, employees, subs] = await Promise.all([
    directQuery,
    supabase.from("employees").select("id").eq("user_id", userId).eq("company_id", companyId),
    supabase.from("subappaltatori").select("id").eq("user_id", userId).eq("company_id", companyId),
  ]);
  for (const result of [direct, employees, subs]) if (result.error) throw result.error;
  const sources: Array<{ kind: CampoAssignmentSource; rows: AssignmentRow[] }> = [
    { kind: "direct", rows: (direct.data ?? []) as unknown as AssignmentRow[] },
  ];
  await Promise.all([
    (async () => {
      if (!employees.data?.length) return;
      let query = supabase.from("order_employees").select(ASSIGNMENT_SELECT)
        .in("employee_id", employees.data.map(e => e.id)).eq("order.company_id", companyId);
      if (options.orderId) query = query.eq("order_id", options.orderId);
      const { data, error } = await query;
      if (error) throw error;
      sources.push({ kind: "employee", rows: (data ?? []) as unknown as AssignmentRow[] });
    })(),
    (async () => {
      if (!subs.data?.length) return;
      const subIds = subs.data.map(s => s.id);
      // I contratti puntano all'anagrafica di sicurezza (subappaltatori_sicurezza),
      // legata al login con campo_subappaltatore_id. Cercarli con gli id di
      // subappaltatori non trovava mai niente (26/09/2026: 26 contratti, 0
      // visibili nel campo). Le squadre esterne invece puntano già a subappaltatori.
      const [schede, teams] = await Promise.all([
        supabase.from("subappaltatori_sicurezza").select("id")
          .eq("company_id", companyId).in("campo_subappaltatore_id", subIds),
        supabase.from("external_teams").select("id")
          .eq("company_id", companyId).in("subappaltatore_id", subIds),
      ]);
      if (schede.error) throw schede.error;
      if (teams.error) throw teams.error;
      if (schede.data?.length) {
        let contractsQuery = supabase.from("contratti_subappalto").select(ASSIGNMENT_SELECT)
          .in("subappaltatore_id", schede.data.map(s => s.id)).eq("company_id", companyId)
          .eq("stato", "attivo").eq("order.company_id", companyId);
        if (options.orderId) contractsQuery = contractsQuery.eq("order_id", options.orderId);
        const contracts = await contractsQuery;
        if (contracts.error) throw contracts.error;
        sources.push({ kind: "contract", rows: (contracts.data ?? []) as unknown as AssignmentRow[] });
      }
      if (!teams.data?.length) return;
      let teamsQuery = supabase.from("order_external_teams").select(ASSIGNMENT_SELECT)
        .in("external_team_id", teams.data.map(t => t.id)).eq("order.company_id", companyId);
      if (options.orderId) teamsQuery = teamsQuery.eq("order_id", options.orderId);
      const { data, error } = await teamsQuery;
      if (error) throw error;
      sources.push({ kind: "subcontractor_team", rows: (data ?? []) as unknown as AssignmentRow[] });
    })(),
  ]);

  const resolved = new Map<string, CampoResolvedAssignment>();
  for (const source of sources) {
    for (const row of source.rows) {
      const order = row.order;
      if (!order?.id || order.company_id !== companyId || row.order_id !== order.id) continue;
      if (options.orderId && order.id !== options.orderId) continue;
      if (!options.includeClosed && ["annullato", "chiuso"].includes(order.status?.toLowerCase() ?? "")) continue;
      const existing: CampoResolvedAssignment = resolved.get(order.id) ?? {
        id: order.id, order_id: order.id, order, is_capocantiere: false, sources: [],
      };
      existing.is_capocantiere ||= source.kind === "direct" && row.is_capocantiere === true;
      if (!existing.sources.some(s => s.kind === source.kind && s.id === row.id)) {
        existing.sources.push({ kind: source.kind, id: row.id });
      }
      resolved.set(order.id, existing);
    }
  }
  return [...resolved.values()].sort((a, b) =>
    (a.order.order_code ?? "").localeCompare(b.order.order_code ?? "", "it", { numeric: true }) || a.id.localeCompare(b.id));
}
