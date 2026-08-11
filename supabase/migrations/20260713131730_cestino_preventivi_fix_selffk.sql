-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Fix nomi reali delle self-FK: fv_progetti.versione_padre_id, sr_progetti.parent_id
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
  update public.fv_progetti set versione_padre_id = null
    where versione_padre_id in (select id from public.fv_progetti where deleted_at < cutoff);
  delete from public.fv_progetti where deleted_at < cutoff;

  -- SR: self-FK SET NULL, figli in CASCADE
  update public.sr_progetti set parent_id = null
    where parent_id in (select id from public.sr_progetti where deleted_at < cutoff);
  delete from public.sr_progetti  where deleted_at < cutoff;

  delete from public.rst_progetti where deleted_at < cutoff;
  delete from public.bgn_progetti where deleted_at < cutoff;
  delete from public.tet_progetti where deleted_at < cutoff;
  delete from public.clm_progetti where deleted_at < cutoff;
  delete from public.ele_progetti where deleted_at < cutoff;
  delete from public.idr_progetti where deleted_at < cutoff;
  delete from public.pis_progetti where deleted_at < cutoff;

  delete from public.quotes where deleted_at < cutoff;
end;
$$;
