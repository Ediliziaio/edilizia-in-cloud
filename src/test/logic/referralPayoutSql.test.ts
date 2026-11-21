/// <reference types="node" />
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";

const id = (n: number) => `77000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [partnerA, partnerB, userA, userB, companyA, companyB, planA, planB, keyA, otherKey, staff] =
  [1, 2, 11, 12, 21, 22, 31, 32, 41, 42, 90].map(id);
let db: PGlite;

async function scalar<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query<{ result: T }>(sql, params);
  return rows[0].result;
}

async function actor(user: string, role = "authenticated", blocked = false) {
  await db.exec(`RESET ROLE; SET ROLE ${role}`);
  await scalar("SELECT set_config('request.jwt.claims', $1, false) AS result", [JSON.stringify({ sub: user, role, blocked })]);
}

const balance = (partner: string) =>
  scalar("SELECT referral_payout_balance($1) AS result", [partner]);
const action = (payout: string, transition: string, reference?: string) =>
  scalar<Record<string, unknown>>("SELECT referral_payout_transition($1,$2,$3) AS result", [payout, transition, reference ?? null]);
const reserve = (partner: string, amount: number, key: string) =>
  scalar<string>("SELECT referral_request_payout($1,$2,$3) AS result", [partner, amount, key]);
const attribute = (code: string, company: string, user: string | null = null) =>
  scalar<string>("SELECT record_referral_conversion($1,$2,$3) AS result", [code, company, user]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
    $$;
    CREATE TYPE app_role AS ENUM ('super_admin');
    CREATE FUNCTION has_role(uid uuid, app_role) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT uid = '${staff}'::uuid
    $$;
    CREATE FUNCTION is_platform_staff() RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT COALESCE(has_role(auth.uid(), 'super_admin'), false) OR current_setting('role') = 'service_role'
    $$;
    CREATE FUNCTION utente_bloccato() RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'blocked')::boolean, false)
    $$;
    CREATE FUNCTION get_referral_commission_policy() RETURNS jsonb LANGUAGE sql AS $$
      SELECT '{"minPayoutAmount": 50, "autoBlockFraud": true}'::jsonb
    $$;
    CREATE TABLE demo_referral_events(event_type text, referrer_id uuid, company_id uuid);
    CREATE FUNCTION log_referral_event(text,uuid,text,uuid,uuid,uuid,jsonb) RETURNS void LANGUAGE sql AS $$
      INSERT INTO demo_referral_events VALUES ($1,$2,$6);
    $$;
    CREATE TABLE referral_tiers(id uuid PRIMARY KEY, commission_multiplier numeric, commission_plan_pct numeric,
      commission_addon_pct numeric, commission_on_usage boolean, usage_commission_pct numeric);
    CREATE TABLE referrers(id uuid PRIMARY KEY, user_id uuid, name text, referral_code text UNIQUE, tier_id uuid,
      is_active boolean DEFAULT true, total_earned numeric DEFAULT 0, total_paid numeric DEFAULT 0,
      total_conversions int DEFAULT 0, total_clicks int DEFAULT 0, conversion_rate numeric, last_event_at timestamptz,
      commission_type text DEFAULT 'percentage', commission_value numeric DEFAULT 20, payout_method text DEFAULT 'bank_transfer',
      payout_details jsonb, has_accepted_terms boolean DEFAULT true);
    CREATE TABLE subscription_plans(id uuid PRIMARY KEY, name text, price_monthly numeric);
    CREATE TABLE companies(id uuid PRIMARY KEY, status text, subscription_plan_id uuid);
    CREATE TABLE referral_companies(referrer_id uuid, company_id uuid, referred_at timestamptz, is_active boolean, notes text,
      UNIQUE(referrer_id, company_id));
    CREATE TABLE referral_conversions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), referrer_id uuid, company_id uuid,
      referred_user_id uuid, source_click_id uuid, status text, revenue numeric, commission_amount numeric, fraud_status text,
      updated_at timestamptz, UNIQUE(referrer_id, company_id));
    CREATE TABLE referral_clicks(id uuid PRIMARY KEY, converted boolean, converted_at timestamptz, converted_company_id uuid);
    CREATE TABLE referral_fraud_log(referrer_id uuid, company_id uuid, fraud_type text, details jsonb, detected_at timestamptz DEFAULT now());
    CREATE TABLE company_feature_overrides (company_id uuid, feature_key text, is_enabled boolean, expires_at timestamptz);
    CREATE TABLE platform_feature_flags (key text, category text, price_per_month numeric);
    CREATE TABLE email_credits_log (company_id uuid, amount_eur numeric, type text, created_at timestamptz);
    CREATE TABLE whatsapp_credits_log (company_id uuid, amount_eur numeric, type text, created_at timestamptz);
    CREATE TABLE ai_credit_usage (company_id uuid, cost_billed_total numeric, created_at timestamptz);
    CREATE TABLE referral_payouts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), referrer_id uuid REFERENCES referrers,
      amount numeric NOT NULL, period_start date NOT NULL, period_end date NOT NULL, paid_at timestamptz NOT NULL DEFAULT now(),
      payment_method text NOT NULL, status text, notes text, requested_by_referrer boolean, auto_generated boolean,
      scheduled_payment_date date, approved_at timestamptz, approved_by uuid, transaction_reference text, rejection_reason text);
    CREATE TABLE referral_commission_ledger(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), referrer_id uuid, company_id uuid,
      period_month int, period_year int, subscription_plan_name text, plan_mrr numeric, commission_type text,
      commission_rate numeric, tier_multiplier numeric, commission_amount numeric, status text,
      payout_id uuid REFERENCES referral_payouts, UNIQUE(referrer_id,company_id,period_month,period_year));
    GRANT SELECT,INSERT,UPDATE,DELETE ON referral_payouts, referral_commission_ledger TO authenticated;
  `);
  const compliance = readFileSync("supabase/migrations/20270521000000_referral_payout_compliance_gate.sql", "utf8");
  await db.exec(compliance.slice(0, compliance.indexOf("CREATE OR REPLACE FUNCTION public.partner_submit")));
  const legacyCascade = readFileSync("supabase/migrations/20270814000000_referral_ledger_payout_link_cascade.sql", "utf8");
  await db.exec(legacyCascade.slice(legacyCascade.indexOf("CREATE OR REPLACE FUNCTION public.referral_payout_status_cascade")));
  await db.exec(readFileSync("supabase/migrations/20290505100000_referral_registro_e_bonifici.sql", "utf8"));
  await db.exec(`
    INSERT INTO referral_tiers VALUES ('${id(5)}', 1, 20, 5, true, 5);
    INSERT INTO referrers(id,user_id,name,referral_code,payout_details,tier_id) VALUES
      ('${partnerA}','${userA}', 'Partner Demo Alfa','DEMO-ALFA',
        '{"iban":"IT60X0542811101000000123456","account_holder":"Demo Alfa","bank_verification":{"status":"verified"},"contract":{"status":"approved"}}','${id(5)}'),
      ('${partnerB}','${userB}', 'Partner Demo Beta','DEMO-BETA',
        '{"iban":"IT60X0542811101000000123457","account_holder":"Demo Beta","bank_verification":{"status":"verified"},"contract":{"status":"approved"}}',null);
    INSERT INTO subscription_plans VALUES ('${planA}', 'Demo Pro', 400), ('${planB}', 'Demo Base', 300);
    INSERT INTO companies VALUES ('${companyA}', 'active', '${planA}'), ('${companyB}', 'active', '${planB}');
    INSERT INTO email_credits_log VALUES ('${companyA}', -40, 'deduct', '2026-09-15 00:00:00+02');
  `);
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
