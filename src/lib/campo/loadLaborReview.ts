import { supabase } from "@/integrations/supabase/client";
import { reviewLaborReport, summarizeLaborBudget, type LaborEmployee, type LaborReport } from "./laborCostReview";

const REPORT_FIELDS = "id, company_id, order_id, user_id, data_lavoro, stato, approvato, updated_at, ore_lavorate, ore_straordinario, presenze";
const IDENTITY_FIELDS = "id, user_id, first_name, last_name";
const COST_FIELDS = ", costo_orario, gross_salary, monthly_hours, inps_rate";
export interface LaborReviewRequest { companyId: string; orderId: string; reportId: string; showCosts: boolean }

/** Office-only read. The caller checks permission; RLS remains authoritative.
 * No new privileged RPC, no mutation, no claim of serializable consistency.
 */
export async function loadLaborReview(request: LaborReviewRequest) {
  const {companyId, orderId, reportId, showCosts} = request;
  if (!companyId || !orderId || !reportId) throw new Error("Contesto azienda/commessa non disponibile");
  const {data, error} = await supabase.from("campo_rapportini").select(REPORT_FIELDS)
    .eq("company_id", companyId).eq("order_id", orderId).eq("id", reportId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Rapportino non disponibile o non autorizzato");
  const target = data as unknown as LaborReport;
  if (target.company_id !== companyId || target.order_id !== orderId || target.id !== reportId || !target.updated_at || !/^\d{4}-\d{2}-\d{2}$/.test(target.data_lavoro)) {
    throw new Error("Contesto o versione del rapportino non validi: impossibile approvare");
  }
  const dayReports: LaborReport[] = [];
  let cursor = "";
  // Keyset pagination: never silently review only the first API page.
  for (let page = 0; ; page++) {
    if (page >= 100) throw new Error("Troppi rapportini per una verifica completa: restringere il controllo in ufficio");
    let query = supabase.from("campo_rapportini").select(REPORT_FIELDS)
      .eq("company_id", companyId).eq("data_lavoro", target.data_lavoro).order("id").limit(500);
    if (cursor) query = query.gt("id", cursor);
    const result = await query;
    if (result.error) throw result.error;
    const rows = (result.data ?? []) as unknown as LaborReport[];
    if (!rows.length) break;
    if (rows.some(r => r.company_id !== companyId || r.data_lavoro !== target.data_lavoro)) throw new Error("Contesto della giornata non coerente");
    const next = rows[rows.length - 1].id;
    if (next <= cursor) throw new Error("Lettura incompleta dei rapportini: riprova");
    dayReports.push(...rows); cursor = next;
  }
  // Reject a target edited/disappeared between the two reads.
  const current = dayReports.find(r => r.id === target.id);
  if (!current || current.updated_at !== target.updated_at || current.stato !== target.stato) throw new Error("Rapportino cambiato durante la lettura: aggiorna il controllo");
  const employeeIds = new Set<string>(), userIds = new Set<string>();
  for (const r of dayReports) {
    if (Array.isArray(r.presenze) && r.presenze.length) {
      for (const p of r.presenze) if (p && typeof p === "object" && typeof p.employee_id === "string") employeeIds.add(p.employee_id);
    } else userIds.add(r.user_id);
  }
  const employees = new Map<string, LaborEmployee>();
  for (const [column, ids] of [["id", [...employeeIds]], ["user_id", [...userIds]]] as const) {
    for (let offset = 0; offset < ids.length; offset += 100) {
      const result = await supabase.from("employees").select(IDENTITY_FIELDS + (showCosts ? COST_FIELDS : ""), { count: "exact" })
        .eq("company_id", companyId).in(column, ids.slice(offset, offset + 100));
      if (result.error) throw result.error;
      if (result.count == null || result.count !== result.data?.length) throw new Error("Anagrafiche incomplete: impossibile verificare tutte le presenze");
      for (const e of (result.data ?? []) as unknown as LaborEmployee[]) employees.set(e.id, e);
    }
  }
  const employeeRows = [...employees.values()].sort((a,b) => a.id.localeCompare(b.id));
  const laborRows: Array<{id: string; cost_preventivo: number | null; total_cost: number | null}> = [];
  if (showCosts) {
    let laborCursor = "";
    for (let page = 0; ; page++) {
      if (page >= 100) throw new Error("Righe manodopera non completamente verificabili");
      let query = supabase.from("order_employees")
        .select("id, cost_preventivo, total_cost, order:orders!inner(company_id)")
        .eq("order_id", orderId).eq("order.company_id", companyId).order("id").limit(500);
      if (laborCursor) query = query.gt("id", laborCursor);
      const result = await query;
      if (result.error) throw result.error;
      if (!result.data?.length) break;
      const next = result.data[result.data.length - 1].id;
      if (next <= laborCursor) throw new Error("Righe manodopera incomplete: aggiorna il controllo");
      laborRows.push(...result.data); laborCursor = next;
    }
  }
  // Local comparison token, not a security token or a database version.
  const fingerprint = JSON.stringify({ showCosts, reports: [...dayReports].sort((a,b) => a.id.localeCompare(b.id)), employees: employeeRows, laborRows });
  return { target, fingerprint, budget: showCosts ? summarizeLaborBudget(laborRows) : null, ...reviewLaborReport(current, dayReports, employeeRows, showCosts) };
}
export type LaborReview = Awaited<ReturnType<typeof loadLaborReview>>;

export async function recheckLaborApproval(request: LaborReviewRequest, fingerprint: string, acknowledged: boolean) {
  const fresh = await loadLaborReview(request);
  if (fresh.fingerprint !== fingerprint) throw new Error("Ore, tariffe o altri rapportini sono cambiati. Aggiorna il controllo prima di approvare.");
  if (fresh.blockers.length) throw new Error(fresh.blockers[0]);
  if (fresh.warnings.length && !acknowledged) throw new Error("Verifica e conferma gli avvisi prima di approvare.");
  return fresh.target;
}
