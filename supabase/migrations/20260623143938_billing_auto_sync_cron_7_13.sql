-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Sync automatica fatture dai provider esterni (FIC/Aruba/...) 2 volte al giorno.
-- Itera le integrazioni attive con auto_sync e chiama billing-import in modalità cron
-- (header x-cron-secret, stesso pattern degli altri cron) per ciascuna company+provider.
create or replace function public.billing_auto_sync_all()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  for r in
    select company_id, provider
    from public.billing_integrations
    where is_active = true and coalesce(auto_sync, true) = true
  loop
    perform net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/billing-import',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret','7ba155121a89aa294551bf3005e398db8473f7f0004a381a210e38dba908a9f1'
      ),
      body := jsonb_build_object('company_id', r.company_id, 'provider', r.provider, 'source','pg_cron'),
      timeout_milliseconds := 120000
    );
  end loop;
end $$;

-- (Ri)schedula i due job — 07:00 e 13:00 ora italiana (estate CEST = UTC+2 → 05:00 e 11:00 UTC).
do $$
begin
  if exists (select 1 from cron.job where jobname='billing-auto-sync-morning')   then perform cron.unschedule('billing-auto-sync-morning');   end if;
  if exists (select 1 from cron.job where jobname='billing-auto-sync-afternoon') then perform cron.unschedule('billing-auto-sync-afternoon'); end if;
end $$;

select cron.schedule('billing-auto-sync-morning',   '0 5 * * *',  $$ select public.billing_auto_sync_all(); $$);
select cron.schedule('billing-auto-sync-afternoon', '0 11 * * *', $$ select public.billing_auto_sync_all(); $$);
