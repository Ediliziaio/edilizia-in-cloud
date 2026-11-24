/**
 * Ritiri degli operai dall'app (prelievi_campo) sommati per materiale (24/11/2026): quanto è stato consegnato,
 * quanto aspetta l'approvazione e chi l'ha preso. I rifiutati non contano.
 */
export interface RigaRitiro { stock_item_id: string; name: string; quantita: number; unita?: string | null }
export interface RitiroCampo {
  id: string; data: string; righe: RigaRitiro[] | null; note: string | null; order_id: string | null;
  operaio_id: string | null; stato: string; documento_numero: string | null; motivo_rifiuto: string | null;
}
export interface TotaleRitiro { chiave: string; nome: string; unita: string | null; consegnato: number; daApprovare: number; persone: string[] }

export function totaliRitiri(ritiri: RitiroCampo[]): TotaleRitiro[] {
  const mappa = new Map<string, TotaleRitiro>();
  for (const r of ritiri) {
    if (r.stato !== "consegnato" && r.stato !== "richiesto") continue;
    for (const riga of Array.isArray(r.righe) ? r.righe : []) {
      const q = Number(riga.quantita);
      if (!Number.isFinite(q) || q <= 0) continue;
      const chiave = riga.stock_item_id || riga.name;
      const t = mappa.get(chiave) ?? { chiave, nome: riga.name, unita: riga.unita ?? null, consegnato: 0, daApprovare: 0, persone: [] };
      if (r.stato === "consegnato") t.consegnato += q; else t.daApprovare += q;
      if (r.operaio_id && !t.persone.includes(r.operaio_id)) t.persone.push(r.operaio_id);
      mappa.set(chiave, t);
    }
  }
  return [...mappa.values()]
    .map(t => ({ ...t, consegnato: Math.round(t.consegnato * 1000) / 1000, daApprovare: Math.round(t.daApprovare * 1000) / 1000 }))
    .sort((a, b) => b.consegnato - a.consegnato || a.nome.localeCompare(b.nome));
}
