import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { allPaymentRows } from "@/hooks/useSupplierPayments";

// suppliers.tipo non è ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface CostoRiga {
  id: string;
  order_id: string | null;
  amount: number | null;
  allocations: unknown;
  purchase_order_id: string | null;
  order_external_team_id: string | null;
  suppliers: { tipo: string | null } | null;
}

/**
 * La parte di un costo che appartiene alla commessa, con la regola di
 * v_ordine_marginalita (costo_diretto): ripartito → la percentuale della
 * commessa; non ripartito → tutto, se il costo è della commessa. Ordini
 * d'acquisto e ditte hanno la loro voce: qui 0.
 */
export function quotaCostoDiretto(c: Pick<CostoRiga, "order_id" | "amount" | "allocations" | "purchase_order_id" | "order_external_team_id">, orderId: string): number {
  if (c.purchase_order_id || c.order_external_team_id) return 0;
  const importo = Number(c.amount) || 0;
  if (Array.isArray(c.allocations) && c.allocations.length > 0) {
    const pct = c.allocations
      .filter((a) => (a as { order_id?: unknown })?.order_id === orderId)
      .reduce((s: number, a) => {
        const raw = String((a as { pct?: unknown })?.pct ?? "");
        return s + (/^[0-9]+(\.[0-9]+)?$/.test(raw) ? Number(raw) : 0);
      }, 0);
    return (importo * pct) / 100;
  }
  return c.order_id === orderId ? importo : 0;
}

/** Costi diretti della commessa (imponibile) per tipo di fornitore; «nessuno» senza fornitore o senza tipo. */
export function useCostiDirettiPerTipo(orderId: string, abilitato: boolean) {
  return useQuery({
    queryKey: ["company-costs", "commessa-per-tipo", orderId],
    enabled: abilitato && !!orderId,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const campi = "id, order_id, amount, allocations, purchase_order_id, order_external_team_id, suppliers(tipo)";
      const [diretti, ripartiti] = await Promise.all([
        allPaymentRows<CostoRiga>((da, a) => db.from("company_costs").select(campi).eq("order_id", orderId).order("id").range(da, a)),
        allPaymentRows<CostoRiga>((da, a) => db.from("company_costs").select(campi)
          .contains("allocations", JSON.stringify([{ order_id: orderId }])).order("id").range(da, a)),
      ]);
      const visti = new Map([...diretti, ...ripartiti].map((c) => [c.id, c]));
      const perTipo: Record<string, number> = {};
      for (const c of visti.values()) {
        const q = quotaCostoDiretto(c, orderId);
        if (q === 0) continue;
        const tipo = c.suppliers?.tipo ?? "nessuno";
        perTipo[tipo] = (perTipo[tipo] ?? 0) + q;
      }
      return perTipo;
    },
  });
}
