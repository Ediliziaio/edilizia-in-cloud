import type { PGlite } from "@electric-sql/pglite";
import { syncReferralStripeEvent } from "../../../supabase/functions/_shared/referralStripe.ts";
import { companyA, companyB, demoReferralActor, partnerA, partnerB, staff } from "./referralDemoDatabase.ts";

export const alfa = { invoice: "in_demo_alfa", charge: "ch_demo_alfa", customer: "cus_demo_alfa", company: companyA,
  partner: partnerA, gross: 14640, net: 12000, refund: 3660 };
export const beta = { invoice: "in_demo_beta", charge: "ch_demo_beta", customer: "cus_demo_beta", company: companyB,
  partner: partnerB, gross: 36600, net: 30000, refund: 7320 };
type Demo = typeof alfa;
type Refund = { id: string; amount: number; currency: string; status: string; created: number };

export function referralDemoDates() {
  const [year, month] = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" })
    .format(new Date()).split("-").map(Number);
  const paid = new Date(Date.UTC(year, month - 2, 18, 12));
  return { paid, refunded: new Date(), month: paid.getUTCMonth() + 1, year: paid.getUTCFullYear() };
}

export async function referralDemoQuery<T>(db: PGlite, sql: string, params: unknown[] = []) {
  const { rows } = await db.query<{ result: T }>(sql, params);
  return rows[0].result;
}

export function createReferralStripeDemo(db: PGlite) {
  const dates = referralDemoDates();
  const detachedCustomers = new Set<string>();
  const chargeRefunds = new Map<string, Refund[]>();
  const invoiceSource = (id: string) => [alfa, beta].find((row) => row.invoice === id);
  const chargeSource = (id: string) => [alfa, beta].find((row) => row.charge === id);
  const provider = {
    invoices: {
      retrieve: (id: string) => {
        const demo = invoiceSource(id);
        if (!demo) throw Error(`Invoice mock mancante ${id}`);
        return {
          id: demo.invoice, status: "paid", customer: demo.customer, charge: demo.charge, subscription: "sub_demo",
          currency: "eur", total: demo.gross, total_excluding_tax: demo.net, amount_paid: demo.gross,
          status_transitions: { paid_at: dates.paid.getTime() / 1000 },
        };
      },
    },
    charges: {
      retrieve: (id: string) => {
        const demo = chargeSource(id);
        if (!demo) throw Error(`Charge mock mancante ${id}`);
        return {
          id: demo.charge, customer: demo.customer, invoice: demo.invoice, currency: "eur",
          status: "succeeded", paid: true, captured: true, amount_captured: demo.gross,
        };
      },
    },
    subscriptions: { retrieve: () => ({ metadata: {} }) },
    refunds: { async *list({ charge }: { charge: string }) { yield* chargeRefunds.get(charge) ?? []; } },
  } as unknown as Parameters<typeof syncReferralStripeEvent>[0];
  const supabase = {
    from(table: string) {
      if (table !== "companies") throw Error(`Tabella mock imprevista ${table}`);
      return {
        select: () => ({ eq: (_column: string, id: string) => ({
          maybeSingle: (): { data: { id: string; referred_by: string } | null; error: null } => {
            const demo = [alfa, beta].find((row) => row.customer === id && !detachedCustomers.has(id));
            return { data: demo ? { id: demo.company, referred_by: demo.partner } : null, error: null };
          },
        }) }),
      };
    },
    async rpc(name: string, input: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> {
      if (name !== "referral_record_stripe_receipt") throw Error(`RPC mock imprevista ${name}`);
      try {
        const data = await referralDemoQuery(db, "SELECT referral_record_stripe_receipt($1,$2,$3,$4,$5,$6,$7,$8) AS result",
          [input.p_invoice_id, input.p_charge_id, input.p_company_id, input.p_paid_at,
            input.p_kind, input.p_gross_cents, input.p_net_cents, JSON.stringify(input.p_refunds)]);
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
  } as unknown as Parameters<typeof syncReferralStripeEvent>[1];

  return {
    dates,
    async deliver(demo: Demo, type: "invoice.paid" | "charge.refunded" | "refund.updated" | "refund.failed" = "invoice.paid") {
      await demoReferralActor(db, staff, "service_role");
      await syncReferralStripeEvent(provider, supabase, {
        type, data: { object: {
          id: type === "invoice.paid" ? demo.invoice : type === "charge.refunded" ? demo.charge : `re_${demo.charge}`,
          charge: demo.charge,
        } },
      } as Parameters<typeof syncReferralStripeEvent>[2]);
    },
    unlinkStripeCustomer(demo: Demo) { detachedCustomers.add(demo.customer); },
    setRefund(demo: Demo, status: string, amount = demo.refund) {
      chargeRefunds.set(demo.charge, [{
        id: `re_${demo.charge}`, currency: "eur", amount, status, created: Math.floor(dates.refunded.getTime() / 1000),
      }]);
    },
  };
}
