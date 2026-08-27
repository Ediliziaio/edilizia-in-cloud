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
import { calculateStoredCommissionNet, type InstallmentLike } from "@/lib/commissions";
import { calculateGrossFromNet } from "@/lib/vatUtils";

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

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function ymOf(date: string): string {
  return date.slice(0, 7);
}

function labelOf(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MESI[Number(m) - 1] ?? m} '${y.slice(2)}`;
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
  const { data: costi, isLoading } = useQuery({
    queryKey: ["esposizione-commessa", orderId],
    enabled: enabled && !!orderId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const [cc, emp, teams, sales] = await Promise.all([
        supabase
          .from("company_costs")
          .select("amount, vat_rate, is_paid, paid_date, due_date")
          .eq("order_id", orderId!),
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
      ]);
      const firstError = cc.error ?? emp.error ?? teams.error ?? sales.error;
      if (firstError) throw firstError;
      return {
        cc: cc.data ?? [],
        emp: emp.data ?? [],
        teams: (teams.data ?? []) as { total_cost: number | null; is_paid: boolean | null; paid_date: string | null; payment_date: string | null; created_at: string }[],
        sales: sales.data ?? [],
      };
    },
  });

  const esposizione = useMemo<EsposizioneCommessa>(() => {
    const events: CashEvent[] = [];
    let daPagare = 0;

    // ── Entrate: rate incassate (stessa regola del piano rate) ─────────────
    const totalGross = (totalAmount || 0) * (1 + (vatRate || 0) / 100);
    const nonBalanceSum = installments
      .filter((i) => i.type !== "balance")
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const balanceAmount = Math.max(0, totalGross - nonBalanceSum - (financingCost || 0));
    for (const r of installments) {
      if (!r.is_paid || r.type === "financing") continue;
      const amount = r.type === "balance" ? balanceAmount : Number(r.amount) || 0;
      if (amount <= 0) continue;
      const date = r.paid_date ?? r.expected_date;
      if (!date) continue;
      events.push({ date, in: amount, out: 0 });
    }

    // ── Uscite: costi pagati, alla data in cui sono usciti i soldi ─────────
    for (const c of costi?.cc ?? []) {
      const gross = calculateGrossFromNet(Number(c.amount) || 0, Number(c.vat_rate ?? 0) || 0).grossAmount;
      if (gross <= 0) continue;
      if (!c.is_paid) {
        daPagare += gross;
        continue;
      }
      const date = c.paid_date ?? c.due_date;
      if (date) events.push({ date, in: 0, out: gross });
    }
    for (const e of costi?.emp ?? []) {
      const cost = Number(e.total_cost) || 0;
      if (cost <= 0) continue;
      if (!e.is_paid) {
        daPagare += cost;
        continue;
      }
      const date = e.paid_date ?? e.created_at?.slice(0, 10);
      if (date) events.push({ date, in: 0, out: cost });
    }
    for (const t of costi?.teams ?? []) {
      const cost = Number(t.total_cost) || 0; // già lordo (convenzione Conto economico)
      if (cost <= 0) continue;
      if (!t.is_paid) {
        daPagare += cost;
        continue;
      }
      const date = t.paid_date ?? t.payment_date ?? t.created_at?.slice(0, 10);
      if (date) events.push({ date, in: 0, out: cost });
    }
    for (const s of costi?.sales ?? []) {
      const net = calculateStoredCommissionNet(s.commission_amount, s.deduction_amount);
      if (net <= 0) continue;
      if (!s.is_paid) {
        daPagare += net;
        continue;
      }
      const date = s.paid_date ?? s.created_at?.slice(0, 10);
      if (date) events.push({ date, in: 0, out: net });
    }

    if (events.length === 0) {
      return { hasMovimenti: false, incassato: 0, uscite: 0, saldoOggi: 0, picco: null, daPagare, serieMensile: [] };
    }

    // ── Cumulato evento per evento → picco di esposizione ──────────────────
    events.sort((a, b) => a.date.localeCompare(b.date));
    let cum = 0;
    let picco: { value: number; date: string } | null = null;
    for (const ev of events) {
      cum += ev.in - ev.out;
      if (picco === null || cum < picco.value) picco = { value: cum, date: ev.date };
    }

    const incassato = events.reduce((s, ev) => s + ev.in, 0);
    const uscite = events.reduce((s, ev) => s + ev.out, 0);

    // ── Serie mensile continua dal primo movimento a oggi ──────────────────
    const perMese = new Map<string, { entrate: number; uscite: number }>();
    for (const ev of events) {
      const ym = ymOf(ev.date);
      const m = perMese.get(ym) ?? { entrate: 0, uscite: 0 };
      m.entrate += ev.in;
      m.uscite += ev.out;
      perMese.set(ym, m);
    }
    const first = ymOf(events[0].date);
    const todayYm = new Date().toISOString().slice(0, 7);
    const lastYm = ymOf(events[events.length - 1].date) > todayYm ? ymOf(events[events.length - 1].date) : todayYm;
    const serie: MeseEsposizione[] = [];
    let [y, m] = first.split("-").map(Number);
    let running = 0;
    for (let guard = 0; guard < 36; guard++) {
      const ym = `${y}-${String(m).padStart(2, "0")}`;
      const bucket = perMese.get(ym) ?? { entrate: 0, uscite: 0 };
      running += bucket.entrate - bucket.uscite;
      serie.push({ ym, label: labelOf(ym), entrate: bucket.entrate, uscite: bucket.uscite, saldo: running });
      if (ym >= lastYm) break;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }

    return {
      hasMovimenti: true,
      incassato,
      uscite,
      saldoOggi: incassato - uscite,
      picco,
      daPagare,
      serieMensile: serie.slice(-24),
    };
  }, [costi, installments, totalAmount, vatRate, financingCost]);

  return { esposizione, isLoading };
}
