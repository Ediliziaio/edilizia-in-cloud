import { calculateNetFromGross } from "@/lib/vatUtils";
import { calculateStoredCommissionNet } from "@/lib/commissions";

export interface EconItem { name?: string; purchase_price?: number | null; quantity: number; vat_rate?: number | null }
export interface EconomicsSources {
  totalAmount: number;
  items: EconItem[];
  employees: { total_cost: number }[];
  teams: { total_cost: number; vat_rate: number | null }[];
  salespeople: { commission_amount: number; deduction_amount: number }[];
  errors: { amount: number }[];
}

/** Shared with the detailed account: registered item/labor costs, net of VAT. */
export function calculateOrderEconomics({ totalAmount, items, employees, teams, salespeople, errors }: EconomicsSources) {
  const itemsNet = (items ?? [])
    .filter((i) => i.purchase_price && i.purchase_price > 0)
    .reduce((sum, i) => {
      const gross = (i.purchase_price || 0) * (i.quantity || 0);
      const { netAmount } = calculateNetFromGross(gross, i.vat_rate ?? 22);
      return sum + netAmount;
    }, 0);

  const employeesNet = employees.reduce((s, e) => s + (e.total_cost || 0), 0);
  const teamsNet = teams.reduce((s, t) => {
    const { netAmount } = calculateNetFromGross(t.total_cost || 0, t.vat_rate ?? 22);
    return s + netAmount;
  }, 0);
  const laborNet = employeesNet + teamsNet;

  const commissions = salespeople.reduce(
    (s, sp) => s + calculateStoredCommissionNet(sp.commission_amount, sp.deduction_amount),
    0,
  );
  const errorsTot = errors.reduce((s, e) => s + (e.amount || 0), 0);

  const costsTot = itemsNet + laborNet + commissions + errorsTot;
  const margin = totalAmount - costsTot;
  const marginPct = totalAmount > 0 ? (margin / totalAmount) * 100 : 0;
  // Margine "atteso" coi soli materiali (prima di manodopera/provvigioni/errori):
  // mostra quanto i costi operativi erodono il margine di partenza.
  const attesoMaterialiPct = totalAmount > 0 ? ((totalAmount - itemsNet) / totalAmount) * 100 : 0;

  return { itemsNet, laborNet, commissions, errorsTot, costsTot, margin, marginPct, attesoMaterialiPct };
}
