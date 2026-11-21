import { afterEach, beforeEach, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { stripeReferralBase } from "../../../supabase/functions/_shared/referralStripe";
import { createReferralDemoDatabase, demoReferralActor, id, staff, userA, userB } from "../fixtures/referralDemoDatabase";
import { alfa, beta, createReferralStripeDemo, referralDemoQuery } from "../fixtures/referralStripeDemo";

let db: PGlite;
beforeEach(async () => { db = await createReferralDemoDatabase({ cash: true }); }, 20_000);
afterEach(async () => { await db?.close(); });

const query = <T,>(statement: string, params?: unknown[]) => referralDemoQuery<T>(db, statement, params);
const balance = (partner: string) => query("SELECT referral_payout_balance($1) AS result", [partner]);
const reserve = (partner: string, amount: number, key: number) =>
  query<string>("SELECT referral_request_payout($1,$2,$3) AS result", [partner, amount, id(key)]);
const action = (payout: string, name: string, reference?: string) =>
  query("SELECT referral_payout_transition($1,$2,$3) AS result", [payout, name, reference ?? null]);

it("accredita €24 su €120 netti, storna €6 una volta e libera una richiesta rimasta scoperta", async () => {
  const demo = createReferralStripeDemo(db);
  await demoReferralActor(db, staff);
  expect(await query("SELECT calculate_monthly_commissions($1,$2) AS result", [demo.dates.month, demo.dates.year])).toBe(0);
  await demo.deliver(alfa);
  await demo.deliver(alfa);
  await demoReferralActor(db, userA);
  await expect(balance(beta.partner)).rejects.toMatchObject({ code: "42501" });
  await expect(query("SELECT referral_stripe_sync_cursor() AS result")).rejects.toMatchObject({ code: "42501" });
  expect(await balance(alfa.partner)).toMatchObject({ available: 24, paid: 0, reserved: 0 });
  const first = await reserve(alfa.partner, 24, 100);
  await demoReferralActor(db, staff);
  await action(first, "approve");
  demo.setRefund(alfa, "pending");
  await demo.deliver(alfa, "refund.updated");
  await demoReferralActor(db, userA);
  expect(await balance(alfa.partner)).toMatchObject({ available: 0, earned: 24, reserved: 24 });

  demo.setRefund(alfa, "succeeded");
  await demo.deliver(alfa, "charge.refunded");
  await demo.deliver(alfa, "refund.updated");
  await demo.deliver(alfa);
  await demoReferralActor(db, staff);
  expect(await query("SELECT status AS result FROM referral_payouts WHERE id=$1", [first])).toBe("rejected");
  await expect(action(first, "prepare")).rejects.toThrow("Approva");
  await demoReferralActor(db, userA);
  expect(await balance(alfa.partner)).toMatchObject({ earned: 18, available: 18, reserved: 0, shortfall: 0 });
  await expect(reserve(alfa.partner, 24, 101)).rejects.toThrow("supera il saldo");
  const second = await reserve(alfa.partner, 18, 102);
  expect(await reserve(alfa.partner, 18, 102)).toBe(second);
  await db.exec("RESET ROLE");
  expect(await query("SELECT jsonb_agg(commission_amount ORDER BY commission_amount) AS result FROM referral_commission_ledger"))
    .toEqual([-6, 24]);
  expect(await query("SELECT count(*)::int AS result FROM private.referral_cash_refunds")).toBe(1);
});

it("registra il rimborso dopo il bonifico come recupero e neutralizza un rimborso fallito senza duplicare", async () => {
  const demo = createReferralStripeDemo(db);
  await demo.deliver(beta);
  await demoReferralActor(db, userB);
  const payout = await reserve(beta.partner, 60, 103);
  await demoReferralActor(db, staff);
  await action(payout, "approve");
  await action(payout, "prepare");
  await action(payout, "confirm", "DEMO-BETA-BANCA");
  demo.unlinkStripeCustomer(beta);
  demo.setRefund(beta, "succeeded");
  await demo.deliver(beta, "charge.refunded");
  await demo.deliver(beta, "refund.updated");
  await demoReferralActor(db, userB);
  expect(await balance(beta.partner)).toMatchObject({ earned: 48, paid: 60, available: 0, shortfall: 12 });
  await expect(reserve(beta.partner, 12, 104)).rejects.toThrow("supera il saldo");

  demo.setRefund(beta, "failed");
  await demo.deliver(beta, "refund.failed");
  await demo.deliver(beta, "refund.failed");
  demo.setRefund(beta, "succeeded");
  await demo.deliver(beta, "refund.updated");
  await demoReferralActor(db, userB);
  expect(await balance(beta.partner)).toMatchObject({ earned: 60, paid: 60, available: 0, shortfall: 0 });
  await db.exec("RESET ROLE");
  expect(await query("SELECT jsonb_agg(commission_amount ORDER BY commission_amount) AS result FROM referral_commission_ledger"))
    .toEqual([-12, 12, 60]);
});

it("risale all'incasso se il rimborso arriva per primo e mantiene l'aliquota già registrata", async () => {
  const demo = createReferralStripeDemo(db);
  demo.setRefund(alfa, "succeeded");
  await demo.deliver(alfa, "charge.refunded");
  await db.exec("RESET ROLE; UPDATE referral_tiers SET commission_plan_pct = 25");
  await demo.deliver(alfa);
  await demoReferralActor(db, userA);
  expect(await balance(alfa.partner)).toMatchObject({ earned: 18, available: 18 });
});

it("esclude il saldo pagato fuori Stripe e calcola il netto sul solo incasso confermato", () => {
  const invoice = { id: "in_demo", status: "paid", customer: "cus_demo", subscription: "sub_demo",
    charge: "ch_demo", currency: "eur", amount_paid: 14640, total: 14640, total_excluding_tax: 12000,
    status_transitions: { paid_at: 1700000000 } };
  const charge = { id: "ch_demo", status: "succeeded" as const, paid: true, captured: true,
    amount_captured: 7320, currency: "eur", customer: "cus_demo", invoice: "in_demo" };
  expect(stripeReferralBase(invoice, charge)).toMatchObject({ gross: 7320, net: 6000 });
  expect(stripeReferralBase({ ...invoice, paid_out_of_band: true }, charge)).toBeNull();
  expect(stripeReferralBase(invoice, { ...charge, captured: false })).toBeNull();
});
