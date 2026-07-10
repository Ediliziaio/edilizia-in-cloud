-- ═══════════════════════════════════════════════════════════════════
-- REFERRAL: fix operativi emersi dall'audit 2026-07-09
-- 1) Cron rotti da sempre: current_setting('app.supabase_url') è NULL in
--    prod → net.http_post falliva con url null OGNI mese (verificato in
--    cron.job_run_details da aprile 2026). Si ricreano i job con URL
--    esplicito e secret, come gli altri cron funzionanti del progetto.
-- 2) RPC get_my_referral_fraud_count: il portale partner non può leggere
--    referral_fraud_log (RLS solo super_admin) e passava fraudLogCount=0
--    hardcoded al gate di eleggibilità payout. La RPC espone il SOLO
--    conteggio delle proprie segnalazioni, senza dettagli.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Cron referral-monthly-cycle (1° del mese, 08:00 UTC) ─────────
select cron.unschedule('referral-monthly-cycle')
where exists (select 1 from cron.job where jobname = 'referral-monthly-cycle');

select cron.schedule(
  'referral-monthly-cycle',
  '0 8 1 * *',
  $$
  SELECT net.http_post(
    url:='https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/referral-monthly-cycle',
    headers:='{"Content-Type":"application/json","x-cron-secret":"INTERNAL_CRON_SECRET_PLACEHOLDER"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- ── 1b. Cron referral-payout-executor (12 del mese, 09:00 UTC) ──────
select cron.unschedule('referral-payout-executor')
where exists (select 1 from cron.job where jobname = 'referral-payout-executor');

select cron.schedule(
  'referral-payout-executor',
  '0 9 12 * *',
  $$
  SELECT net.http_post(
    url:='https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/referral-payout-executor',
    headers:='{"Content-Type":"application/json","x-cron-secret":"INTERNAL_CRON_SECRET_PLACEHOLDER"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- ── 2. RPC conteggio fraud log del partner autenticato ──────────────
create or replace function public.get_my_referral_fraud_count()
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $fn$
  select count(*)::integer
  from referral_fraud_log fl
  join referrers r on r.id = fl.referrer_id
  where r.user_id = auth.uid();
$fn$;

revoke all on function public.get_my_referral_fraud_count() from public;
grant execute on function public.get_my_referral_fraud_count() to authenticated;
