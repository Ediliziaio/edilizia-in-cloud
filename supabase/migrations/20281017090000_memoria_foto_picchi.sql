-- «Foto» di cosa gira nel database quando la memoria del server sale (17/10/2026).
--
-- Il 15/10 il server ha finito RAM e swap due volte; Supabase vede solo il totale della memoria, non chi
-- l'ha chiesta, e i registri del server si perdono a ogni riavvio. La sentinella della memoria
-- (scripts/sentinella-memoria.mjs, ogni 5 minuti da GitHub) chiama questa funzione quando una lettura
-- supera il livello di attenzione: così al prossimo picco sappiamo quali lavori stavano girando.
--
-- Il repository è pubblico e anche i riepiloghi delle Actions: il testo delle query (che può contenere
-- email, telefoni, nomi) resta QUI, in una tabella chiusa. La funzione restituisce alla sentinella solo
-- numeri e nomi di applicazioni e job.
--
-- Come leggerla dopo un picco:
--   select preso_il, livello, riepilogo, attive from public.memoria_foto_picchi order by preso_il desc limit 5;
--   -- query_id si incrocia con pg_stat_statements.queryid per vedere la query completa e quanto pesa.

create table if not exists public.memoria_foto_picchi (
  id bigint generated always as identity primary key,
  preso_il timestamptz not null default now(),
  livello text not null,
  letture jsonb not null default '[]'::jsonb,
  riepilogo jsonb not null,
  attive jsonb not null,
  cron_in_corso jsonb not null
);

alter table public.memoria_foto_picchi enable row level security;
revoke all on public.memoria_foto_picchi from public, anon, authenticated;

create index if not exists memoria_foto_picchi_preso_il on public.memoria_foto_picchi (preso_il desc);

create or replace function public.memoria_scatta_foto(p_livello text, p_letture jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_riepilogo jsonb;
  v_attive jsonb;
  v_cron jsonb;
begin
  -- La foto non deve mai essere lei a peggiorare un database in affanno.
  set local statement_timeout = '5s';
  set local lock_timeout = '1s';

  -- Connessioni per applicazione e stato (numeri, nessun testo).
  select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb)
    into v_riepilogo
    from (select coalesce(nullif(a.application_name, ''), a.backend_type) as app,
                 coalesce(a.usename::text, '-') as utente,
                 count(*) as n,
                 count(*) filter (where a.state = 'active') as attive,
                 count(*) filter (where a.state like 'idle in transaction%') as ferme_in_transazione,
                 round(max(extract(epoch from now() - a.query_start)) filter (where a.state = 'active'))::int as attiva_da_s
            from pg_stat_activity a
           where a.pid <> pg_backend_pid()
           group by 1, 2) x;

  -- Le query attive (o ferme in transazione), le più lunghe per prime: qui il testo, perché la tabella è chiusa.
  select coalesce(jsonb_agg(x order by x.durata_s desc nulls last), '[]'::jsonb)
    into v_attive
    from (select a.pid,
                 coalesce(nullif(a.application_name, ''), a.backend_type) as app,
                 a.usename::text as utente,
                 a.state,
                 a.wait_event_type,
                 a.wait_event,
                 round(extract(epoch from now() - a.query_start))::int as durata_s,
                 round(extract(epoch from now() - a.xact_start))::int as transazione_s,
                 a.query_id::text as query_id, -- testo: in JSON un bigint perde le ultime cifre
                 left(a.query, 2000) as query
            from pg_stat_activity a
           where a.pid <> pg_backend_pid()
             and a.state is not null and a.state <> 'idle'
             and a.backend_type <> 'walsender' -- la replica del tempo reale è sempre «attiva», non è lavoro
           order by a.query_start
           limit 60) x;

  -- I job di pg_cron che risultano in corso.
  select coalesce(jsonb_agg(x order by x.da_s desc), '[]'::jsonb)
    into v_cron
    from (select j.jobname, round(extract(epoch from now() - d.start_time))::int as da_s
            from cron.job_run_details d
            join cron.job j on j.jobid = d.jobid
           where d.status in ('running', 'starting')
             and d.start_time > now() - interval '6 hours'
           limit 50) x;

  insert into public.memoria_foto_picchi (livello, letture, riepilogo, attive, cron_in_corso)
  values (coalesce(p_livello, '?'), coalesce(p_letture, '[]'::jsonb), v_riepilogo, v_attive, v_cron);

  -- Le foto vecchie non servono più.
  delete from public.memoria_foto_picchi where preso_il < now() - interval '60 days';

  -- Alla sentinella (e quindi a GitHub, che è pubblico) solo numeri e nomi.
  return jsonb_build_object(
    'connessioni', v_riepilogo,
    'query_attive', jsonb_array_length(v_attive),
    'piu_lunghe', coalesce((select jsonb_agg(jsonb_build_object('app', e->>'app', 'stato', e->>'state',
                                                                'attesa', e->>'wait_event', 'durata_s', e->'durata_s',
                                                                'query_id', e->'query_id'))
                              from (select e from jsonb_array_elements(v_attive) e limit 10) z), '[]'::jsonb),
    'cron_in_corso', v_cron
  );
end;
$$;

revoke all on function public.memoria_scatta_foto(text, jsonb) from public, anon, authenticated;
grant execute on function public.memoria_scatta_foto(text, jsonb) to service_role;
