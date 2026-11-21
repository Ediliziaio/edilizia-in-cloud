/// <reference types="node" />
import type { PGlite } from "@electric-sql/pglite";
import { companyA, companyB, createReferralDemoDatabase, demoReferralActor, id, keyA,
  otherKey, partnerA, partnerB, staff, userA } from "../fixtures/referralDemoDatabase";
import { afterAll, beforeAll, expect, it } from "vitest";

let db: PGlite;

async function scalar<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query<{ result: T }>(sql, params);
  return rows[0].result;
}

const actor = (user: string, role = "authenticated", blocked = false) => demoReferralActor(db, user, role, blocked);

const balance = (partner: string) =>
  scalar("SELECT referral_payout_balance($1) AS result", [partner]);
const action = (payout: string, transition: string, reference?: string) =>
  scalar<Record<string, unknown>>("SELECT referral_payout_transition($1,$2,$3) AS result", [payout, transition, reference ?? null]);
const reserve = (partner: string, amount: number, key: string) =>
  scalar<string>("SELECT referral_request_payout($1,$2,$3) AS result", [partner, amount, key]);
const attribute = (code: string, company: string, user: string | null = null) =>
  scalar<string>("SELECT record_referral_conversion($1,$2,$3) AS result", [code, company, user]);

beforeAll(async () => {
  db = await createReferralDemoDatabase();
}, 60_000);

afterAll(async () => db?.close());

it("liquida due partner dalla segnalazione al bonifico e riconcilia saldi, richieste e riferimenti duplicati", async () => {
  await actor(userA);
  await expect(attribute("DEMO-ALFA", companyA)).rejects.toMatchObject({ code: "42501" });
  await expect(balance(partnerB)).rejects.toMatchObject({ code: "42501" });
  await actor(userA, "authenticated", true);
  await expect(balance(partnerA)).rejects.toMatchObject({ code: "42501" });
  await expect(reserve(partnerA, 82, keyA)).rejects.toMatchObject({ code: "42501" });
  await actor(userA);
  await expect(db.exec("UPDATE referral_payouts SET status = 'paid'")).rejects.toMatchObject({ code: "42501" });

  await actor(staff);
  const conversion = await attribute("DEMO-ALFA", companyA);
  expect(await attribute("DEMO-ALFA", companyA)).toBe(conversion);
  await attribute("DEMO-BETA", companyB);
  await expect(attribute("DEMO-BETA", companyA)).rejects.toMatchObject({ code: "23505" });
  await db.exec("RESET ROLE; UPDATE referral_companies SET referred_at = '2026-09-01 00:00:00+02'");
  await actor(staff);
  expect(await scalar("SELECT calculate_monthly_commissions(9,2026) AS result")).toBe(2);
  expect(await scalar("SELECT calculate_monthly_commissions(9,2026) AS result")).toBe(0);

  await actor(userA);
  expect(await balance(partnerA)).toEqual({ earned: 82, paid: 0, reserved: 0, available: 82 });
  await expect(reserve(partnerB, 60, otherKey)).rejects.toMatchObject({ code: "42501" });
  const payoutA = await reserve(partnerA, 82, keyA);
  expect(await reserve(partnerA, 82, keyA)).toBe(payoutA);
  await expect(reserve(partnerA, 82, otherKey)).rejects.toThrow("supera il saldo");
  expect(await balance(partnerA)).toEqual({ earned: 82, paid: 0, reserved: 82, available: 0 });
  await expect(action(payoutA, "approve")).rejects.toMatchObject({ code: "42501" });

  await actor(staff);
  expect(await scalar("SELECT generate_monthly_payouts(9,2026) AS result")).toBe(1);
  expect(await scalar("SELECT generate_monthly_payouts(9,2026) AS result")).toBe(0);
  const payoutB = await scalar<string>("SELECT id AS result FROM referral_payouts WHERE referrer_id = $1", [partnerB]);
  expect(await balance(partnerB)).toEqual({ earned: 60, paid: 0, reserved: 60, available: 0 });

  await expect(action(payoutA, "prepare")).rejects.toThrow("Approva");
  await action(payoutA, "approve");
  await expect(action(payoutA, "confirm", "DEMO-TRN-ALFA")).rejects.toThrow("Prepara");
  const bankA = await action(payoutA, "prepare");
  expect(bankA).toMatchObject({ amount: 82, beneficiary: "Demo Alfa", created: true });
  expect(await action(payoutA, "prepare")).toEqual({ ...bankA, created: false });
  await action(payoutA, "confirm", " DEMO-TRN-ALFA ");
  expect(await action(payoutA, "confirm", "demo-trn-alfa")).toEqual({ status: "paid" });

  await action(payoutB, "approve");
  expect(await action(payoutB, "prepare")).toMatchObject({ amount: 60, beneficiary: "Demo Beta" });
  await expect(action(payoutB, "confirm", "demo-trn-alfa")).rejects.toMatchObject({ code: "23505" });
  expect(await balance(partnerB)).toEqual({ earned: 60, paid: 0, reserved: 60, available: 0 });
  await action(payoutB, "confirm", "DEMO-TRN-BETA");
  expect(await balance(partnerA)).toEqual({ earned: 82, paid: 82, reserved: 0, available: 0 });
  expect(await balance(partnerB)).toEqual({ earned: 60, paid: 60, reserved: 0, available: 0 });
  expect(await scalar("SELECT count(*)::int AS result FROM referral_payouts WHERE status='paid' AND paid_at IS NOT NULL")).toBe(2);
  expect(await scalar("SELECT count(*)::int AS result FROM referral_commission_ledger WHERE status='paid'")).toBe(2);
  await db.exec("RESET ROLE");
  expect(await scalar("SELECT count(*)::int AS result FROM referral_conversions")).toBe(2);
  expect(await scalar("SELECT count(*)::int AS result FROM demo_referral_events")).toBe(2);
  expect(await scalar("SELECT count(*)::int AS result FROM private.referral_payout_allocations")).toBe(2);
});

it("sblocca un importo respinto e conserva la cronologia della distinta", async () => {
  await db.exec("RESET ROLE");
  await db.query(`INSERT INTO referral_commission_ledger(referrer_id,company_id,period_month,period_year,commission_amount,status)
    VALUES ($1,$2,8,2026,55,'pending')`, [partnerA, companyA]);
  await actor(staff);
  const payout = await reserve(partnerA, 55, id(51));
  await action(payout, "approve");
  await action(payout, "prepare");
  await expect(action(payout, "reject", "Dati errati")).rejects.toThrow("non può");
  await action(payout, "bank_rejected", "DEMO-SCARTO-01 · conto chiuso");
  expect(await balance(partnerA)).toEqual({ earned: 137, paid: 82, reserved: 0, available: 55 });
  const retry = await reserve(partnerA, 55, id(52));
  expect(retry).not.toBe(payout);
  await action(retry, "reject", "Test concluso");
  expect(await balance(partnerA)).toEqual({ earned: 137, paid: 82, reserved: 0, available: 55 });
}, 20_000);
