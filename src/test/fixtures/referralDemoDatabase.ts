/// <reference types="node" />
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

export const id = (n: number) => `77000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
export const [partnerA, partnerB, userA, userB, companyA, companyB, planA, planB, keyA, otherKey, staff] =
  [1, 2, 11, 12, 21, 22, 31, 32, 41, 42, 90].map(id);

export async function createReferralDemoDatabase({ cash = false } = {}) {
  const db = new PGlite();
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
      SELECT jsonb_build_object('minPayoutAmount', ${cash ? 10 : 50}, 'autoBlockFraud', true)
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
    CREATE TABLE companies(id uuid PRIMARY KEY, status text, subscription_plan_id uuid, referred_by uuid);
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
      amount numeric NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), period_start date NOT NULL, period_end date NOT NULL, paid_at timestamptz NOT NULL DEFAULT now(),
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
    INSERT INTO companies VALUES ('${companyA}', 'active', '${planA}', '${partnerA}'), ('${companyB}', 'active', '${planB}', '${partnerB}');
    INSERT INTO email_credits_log VALUES ('${companyA}', -40, 'deduct', '2026-09-15 00:00:00+02');
  `);
  if (cash) {
    await db.exec(readFileSync("supabase/migrations/20290505101000_referral_incassi_e_storni_stripe.sql", "utf8"));
    await db.exec("UPDATE private.referral_cash_settings SET starts_at = now() - interval '3 months'");
  }
  return db;
}

export async function demoReferralActor(db: PGlite, user: string, role = "authenticated", blocked = false) {
  await db.exec(`RESET ROLE; SET ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user, role, blocked })]);
}
