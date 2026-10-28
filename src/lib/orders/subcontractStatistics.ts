import { sumLaborAmounts } from "./laborEconomics";

export interface SubcontractStatContract { id: string; importo_contrattuale: number | string | null; stato: string }
export interface SubcontractStatSal { pagato_registrato?: number|string|null; id: string; contratto_id: string; importo_lordo: number | string | null; importo_netto: number | string | null; stato: string }

/** Contract, execution and cash are distinct. Never add these to the cost ledger. */
export function subcontractStatistics(contracts: SubcontractStatContract[], sals: SubcontractStatSal[]) {
  const all = [...new Map(contracts.map(c => [c.id, c])).values()];
  const ids = new Set(all.map(c => c.id));
  const rows = [...new Map(sals.map(s => [s.id, s])).values()];
  const linked = rows.filter(s => ids.has(s.contratto_id));
  const verified = linked.filter(s => ["verificato", "pagato"].includes(s.stato));
  return {
    count: all.length,
    drafts: all.filter(c => c.stato === "bozza").length,
    contracted: sumLaborAmounts(all.map(c => c.importo_contrattuale)),
    verified: sumLaborAmounts(verified.map(s => s.importo_lordo)),
    paid: sumLaborAmounts(linked.filter(s=>s.stato!=="contestato").map(s => s.pagato_registrato ?? (s.stato === "pagato" ? s.importo_netto : 0))),
    pending: linked.filter(s => s.stato === "ricevuto").length,
    disputed: linked.filter(s => s.stato === "contestato").length,
    unresolved: rows.length - linked.length + linked.filter(s => !["ricevuto", "verificato", "pagato", "contestato"].includes(s.stato)).length,
  };
}
