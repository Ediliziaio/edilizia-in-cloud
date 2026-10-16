import { canonicalOrderEconomics, type CanonicalEconomicsRow } from "@/lib/orders/economics";

export interface ContractCostLine {
  id: string;
  order_code: string;
  description: string;
  intervention_reference: string | null;
  is_contract: boolean;
  economics: CanonicalEconomicsRow | null;
}
export interface ContractCostSnapshot {
  company_id: string;
  contract_id: string;
  calculated_at: string;
  lines: ContractCostLine[];
}

/** A rollup is a presentation, never another accounting entry. Revenue belongs
 * only to the root; every registered cost source remains on its original order.
 * Reject incomplete/duplicate snapshots instead of presenting a partial total.
 */
export function consolidateContractCosts(snapshot: ContractCostSnapshot, companyId: string, contractId: string) {
  if (snapshot.company_id !== companyId || snapshot.contract_id !== contractId || !Array.isArray(snapshot.lines)) {
    throw new Error("Riepilogo non valido per questo contratto e questa azienda.");
  }
  const roots = snapshot.lines.filter(line => line.is_contract);
  if (roots.length !== 1 || roots[0].id !== contractId) throw new Error("Contratto di origine non disponibile.");
  const seen = new Set<string>();
  const lines = snapshot.lines.map(line => {
    if (seen.has(line.id) || !line.economics || line.economics.consuntivo == null ||
        !Number.isFinite(Number(line.economics.consuntivo))) {
      throw new Error("Costi incompleti o ripetuti: impossibile mostrare un totale attendibile.");
    }
    seen.add(line.id);
    return { ...line, actual: canonicalOrderEconomics(line.economics) };
  });
  const contract = lines.find(line => line.is_contract)!;
  const interventions = lines.filter(line => !line.is_contract);
  const interventionCosts = interventions.reduce((sum, line) => sum + line.actual.costs, 0);
  const costs = contract.actual.costs + interventionCosts;
  const revenue = contract.actual.revenue;
  return {
    contract, interventions, interventionCosts, costs, revenue,
    margin: revenue > 0 ? revenue - costs : null,
    missingWarehouseCosts: lines.reduce((sum, line) => sum + line.actual.warehouseMovementsWithoutCost, 0),
    pendingMileage: lines.reduce((sum, line) => sum + line.actual.pendingMileageReimbursementsCount, 0),
    categories: [
      { label: "Acquisti", amount: lines.reduce((s, l) => s + l.actual.purchases, 0) },
      { label: "Materiali da magazzino", amount: lines.reduce((s, l) => s + l.actual.warehouseMaterials, 0) },
      { label: "Manodopera e ditte", amount: lines.reduce((s, l) => s + l.actual.labor, 0) },
      { label: "Provvigioni", amount: lines.reduce((s, l) => s + l.actual.commissions, 0) },
      { label: "Rimborsi chilometrici approvati", amount: lines.reduce((s, l) => s + l.actual.mileageReimbursements, 0) },
      { label: "Errori e altri costi diretti", amount: lines.reduce((s, l) => s + l.actual.errors + l.actual.directCosts, 0) },
    ],
  };
}
