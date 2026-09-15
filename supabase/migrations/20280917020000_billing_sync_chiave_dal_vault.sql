-- billing_auto_sync_all(): la chiave interna dal Vault, e solo i job la eseguono.
--
-- La funzione aveva scritto in chiaro il valore di INTERNAL_CRON_SECRET: lo
-- stesso valore stava nelle migrazioni del 23/06 finite nel repository pubblico,
-- e dal 14/09/2026 un database esterno (rete ETRI, Corea) chiamava le nostre edge
-- function con quella chiave. Prima di cambiarla, la funzione deve leggerla dal
-- Vault (`silvio_internal_cron_secret`), come tutti gli altri job.
-- In più era SECURITY DEFINER eseguibile da qualunque utente autenticato: un
-- utente qualsiasi poteva lanciare l'importazione fatture di tutte le aziende.

set local lock_timeout = '3s';

create or replace function public.billing_auto_sync_all()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_chiave text := (select decrypted_secret from vault.decrypted_secrets where name = 'silvio_internal_cron_secret');
begin
  for r in
    select company_id, provider
      from public.billing_integrations
     where is_active = true and coalesce(auto_sync, true) = true
  loop
    perform net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/billing-import',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', v_chiave
      ),
      body := jsonb_build_object('company_id', r.company_id, 'provider', r.provider, 'source', 'pg_cron'),
      timeout_milliseconds := 120000
    );
  end loop;
end;
$$;

revoke all on function public.billing_auto_sync_all() from public, anon, authenticated;
grant execute on function public.billing_auto_sync_all() to service_role;
