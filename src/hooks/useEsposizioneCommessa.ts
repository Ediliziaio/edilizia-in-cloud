/**
 * useEsposizioneCommessa — la cassa REALE della commessa nel tempo.
 *
 * Risponde alla domanda del manuale: chi sta finanziando il cantiere, tu o il
 * cliente? Entrate = rate incassate del piano pagamenti (LORDE, col saldo
 * CALCOLATO come in calculateCollectedGrossFromInstallments: totale ivato −
 * altre rate − finanziaria, mai il campo DB). Uscite = soldi realmente usciti
 * per la commessa: costi collegati (company_costs, imponibile → lordo con
 * `vat_rate ?? 0` come l'export Costi: aliquota 0 esplicita = esente),
 * manodopera interna (total_cost, niente IVA), squadre esterne (total_cost già
 * lordo, come nel Conto economico), provvigioni (netto pagabile). Gli errori
 * di commessa restano fuori: sono una misura di perdita a conto economico, i
 * loro soldi escono già come materiali o ore.
 *
 * Il picco di esposizione si calcola sul cumulato EVENTO per EVENTO (non sui
 * mesi aggregati): il momento peggiore può stare a metà mese.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateStoredCommissionNet, calculateInstallmentCollections, type InstallmentLike } from "@/lib/commissions";
import { calculateGrossFromNet } from "@/lib/vatUtils";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { cashExposureTimeline } from "@/lib/orders/cashExposureTimeline";

export interface RataEsposizione extends InstallmentLike {
  paid_date?: string | null;
  expected_date?: string | null;
}

interface CashEvent {
  date: string; // yyyy-MM-dd
  in: number;
  out: number;
}

export interface MeseEsposizione {
  ym: string;
  label: string;
  entrate: number;
  uscite: number;
  saldo: number; // cumulato a fine mese
}

export interface EsposizioneCommessa {
  hasMovimenti: boolean;
  incassato: number;
  uscite: number;
  saldoOggi: number;
  /** Punto più basso del cumulato incassato−pagato (con la sua data). */
  picco: { value: number; date: string } | null;
  /** Costi della commessa registrati ma non ancora pagati (lordi). */
  daPagare: number;
  serieMensile: MeseEsposizione[];
}

export function useEsposizioneCommessa({
  orderId,
  totalAmount,
  vatRate,
  financingCost,
  installments,
  enabled = true,
}: {
  orderId: string | undefined;
  totalAmount: number;
  vatRate: number;
  financingCost: number;
  installments: RataEsposizione[];
  enabled?: boolean;
}) {
  const companyId = useEffectiveCompanyId();
  const { data: costi, isLoading, isError } = useQuery({
    queryKey: ["esposizione-commessa", orderId, companyId],
    enabled: enabled && !!orderId && !!companyId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const [cc, emp, teams, sales, entries] = await Promise.all([
        (async () => {
          const fields = "id, amount, vat_rate, is_paid, paid_date, due_date, order_id, allocations";
          const [direct, allocated] = await Promise.all([
            allPaymentRows((from, to) => supabase.from("company_costs").select(fields)
              .eq("company_id", companyId!).eq("order_id", orderId!).order("id").range(from, to)),
            allPaymentRows((from, to) => supabase.from("company_costs").select(fields)
              .eq("company_id", companyId!).contains("allocations", JSON.stringify([{ order_id: orderId! }])).order("id").range(from, to)),
          ]);
          return { data: [...new Map([...direct, ...allocated].map(c => [c.id, c])).values()], error: null as null };
        })(),
        supabase
          .from("order_employees")
          .select("total_cost, is_paid, paid_date, created_at")
          .eq("order_id", orderId!),
        supabase
          .from("order_external_teams")
          .select("total_cost, is_paid, paid_date, payment_date, created_at")
          .eq("order_id", orderId!),
        supabase
          .from("order_salespeople")
          .select("commission_amount, deduction_amount, is_paid, paid_date, created_at")
          .eq("order_id", orderId!),
        allPaymentRows((from, to) => supabase.from("prima_nota_entries")
          .select("id, cost_id, direction, amount, entry_date").eq("company_id", companyId!)
          .eq("order_id", orderId!).order("id").range(from, to)),
      ]);
      const firstError = cc.error ?? emp.error ?? teams.error ?? sales.error;
      if (firstError) throw firstError;
      return {
        cc: cc.data ?? [],
        emp: emp.data ?? [],
        teams: (teams.data ?? []) as { total_cost: number | null; is_paid: boolean | null; paid_date: string | null; payment_date: string | null; created_at: string }[],
        sales: sales.data ?? [],
        entries,
      };
    },
  });

  const esposizione = useMemo<EsposizioneCommessa>(() => {
    const events: CashEvent[] = [];
    let daPagare = 0;

    // ── Entrate: rate incassate (stessa regola del piano rate) ─────────────
    const amounts = calculateInstallmentCollections({ installments, totalAmount, vatRate, financingCost });
    const recorded = (costi?.entries ?? []).length > 0;
    for (const [index, r] of installments.entries()) {
      if (recorded) break; // Ledger and installment flags are alternative sources, never additive.
      const amount = amounts[index];
      if (amount <= 0) continue;
      const date = r.paid_date; // An expected deadline is not a date on which money actually arrived.
      if (!date) continue;
      events.push({ date, in: amount, out: 0 });
    }

    // ── Uscite: costi pagati, alla data in cui sono usciti i soldi ─────────
    for (const entry of costi?.entries ?? []) {
      if (entry.amount <= 0 || !['entrata', 'uscita'].includes(entry.direction)) continue;
      events.push({ date: entry.entry_date, in: entry.direction === 'entrata' ? entry.amount : 0,
        out: entry.direction === 'uscita' ? entry.amount : 0 });
    }
    for (const c of costi?.cc ?? []) {
      const allocations = Array.isArray(c.allocations) ? c.allocations : [];
      const allocation = allocations.find((a): a is { order_id: string; pct: number } =>
        !!a && typeof a === 'object' && !Array.isArray(a) && a.order_id === orderId);
      const share = allocation ? Number(allocation.pct) : 100;
      if (!Number.isFinite(share) || share < 0 || share > 100) continue;
      const gross = calculateGrossFromNet((Number(c.amount) || 0) * share / 100, Number(c.vat_rate ?? 0) || 0).grossAmount;
      if (gross <= 0) continue;
      const paidEntries = (costi?.entries ?? []).filter(e => e.cost_id === c.id);
      const actualPaid = paidEntries.reduce((sum, e) => sum + (e.direction === 'uscita' ? e.amount : -e.amount), 0);
      if (paidEntries.length > 0) {
        daPagare += Math.max(0, gross - actualPaid);
        continue;
      }
      if (!c.is_paid) {
        daPagare += gross;
        continue;
      }
      if (recorded) continue;
      const date = c.paid_date;
      if (date) events.push({ date, in: 0, out: gross });
    }
    for (const e of costi?.emp ?? []) {
      if (recorded) break;
      const cost = Number(e.total_cost) || 0;
      if (cost <= 0) continue;
      if (!e.is_paid) {
        // Allocated labour cost is not automatically an unpaid salary/debt.
        continue;
      }
      const date = e.paid_date;
      if (date) events.push({ date, in: 0, out: cost });
    }
    for (const t of costi?.teams ?? []) {
      if (recorded) break;
      const cost = Number(t.total_cost) || 0; // già lordo (convenzione Conto economico)
      if (cost <= 0) continue;
      if (!t.is_paid) {
        // The actual payable is in company_costs/received invoices, not twice in the team budget.
        continue;
      }
      const date = t.paid_date;
      if (date) events.push({ date, in: 0, out: cost });
    }
    for (const s of costi?.sales ?? []) {
      if (recorded) break;
      const net = calculateStoredCommissionNet(s.commission_amount, s.deduction_amount);
      if (net <= 0) continue;
      if (!s.is_paid) {
        daPagare += net;
        continue;
      }
      const date = s.paid_date;
      if (date) events.push({ date, in: 0, out: net });
    }

    return { ...cashExposureTimeline(events, new Date().toISOString().slice(0, 10)), daPagare: Math.round(daPagare * 100) / 100 };
  }, [costi, installments, totalAmount, vatRate, financingCost, orderId]);

  return { esposizione, isLoading, isError, recorded: (costi?.entries ?? []).length > 0 };
}
