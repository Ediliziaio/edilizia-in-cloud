-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ═══ Cestino preventivi (30 giorni) ═══════════════════════════════════════
-- L'eliminazione dalla UI diventa soft (deleted_at): recuperabile per 30
-- giorni, poi il purge notturno elimina DAVVERO i dati da Supabase.
-- Risolve anche il bug "eliminazioni non riuscite": il DELETE fisico di
-- fv_progetti veniva rifiutato dalle FK NO ACTION (fv_eventi, revisioni
-- figlie) — il purge le gestisce esplicitamente.

alter table public.sr_progetti  add column if not exists deleted_at timestamptz;
alter table public.fv_progetti  add column if not exists deleted_at timestamptz;
alter table public.rst_progetti add column if not exists deleted_at timestamptz;
alter table public.bgn_progetti add column if not exists deleted_at timestamptz;
alter table public.tet_progetti add column if not exists deleted_at timestamptz;
alter table public.clm_progetti add column if not exists deleted_at timestamptz;
alter table public.ele_progetti add column if not exists deleted_at timestamptz;
alter table public.idr_progetti add column if not exists deleted_at timestamptz;
alter table public.pis_progetti add column if not exists deleted_at timestamptz;

create or replace function public.purge_cestino_preventivi()
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  cutoff timestamptz := now() - interval '30 days';
begin
  -- FV: figli con FK NO ACTION vanno rimossi/sganciati prima del parent
  delete from public.fv_eventi e
    using public.fv_progetti p
    where e.progetto_id = p.id and p.deleted_at < cutoff;
  update public.fv_progetti set parent_progetto_id = null
    where parent_progetto_id in (select id from public.fv_progetti where deleted_at < cutoff);
  delete from public.fv_progetti where deleted_at < cutoff;

  -- SR: self-FK SET NULL, figli in CASCADE
  update public.sr_progetti set parent_progetto_id = null
    where parent_progetto_id in (select id from public.sr_progetti where deleted_at < cutoff);
  delete from public.sr_progetti  where deleted_at < cutoff;

  delete from public.rst_progetti where deleted_at < cutoff;
  delete from public.bgn_progetti where deleted_at < cutoff;
  delete from public.tet_progetti where deleted_at < cutoff;
  delete from public.clm_progetti where deleted_at < cutoff;
  delete from public.ele_progetti where deleted_at < cutoff;
  delete from public.idr_progetti where deleted_at < cutoff;
  delete from public.pis_progetti where deleted_at < cutoff;

  -- Preventivi classici (figli in CASCADE/SET NULL)
  delete from public.quotes where deleted_at < cutoff;
end;
$$;

-- Purge notturno alle 03:40 (idempotente: rimpiazza l'eventuale job esistente)
do $$
begin
  perform cron.unschedule('purge-cestino-preventivi')
    where exists (select 1 from cron.job where jobname = 'purge-cestino-preventivi');
  perform cron.schedule('purge-cestino-preventivi', '40 3 * * *',
    $job$select public.purge_cestino_preventivi()$job$);
end;
$$;
