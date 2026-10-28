-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

set local lock_timeout='3s';set local statement_timeout='60s';
-- A parent identity change must not leave canonical deliveries bound to another employer.
-- Trigger-only definer: sees linked deliveries even when a multi-company editor's current RLS tenant differs.
create or replace function public.dipendente_dpi_identita_stabile() returns trigger language plpgsql security definer set search_path=public as $$begin
 if (new.company_id is distinct from old.company_id or (new.role_type='subappaltatore' and new.role_type is distinct from old.role_type))
 and exists(select 1 from public.employee_dpi_consegne d where d.employee_id=old.id) then
  raise exception 'Il dipendente ha consegne DPI: conserva l’identità e l’impresa del registro';
 end if;return new;
end$$;
revoke all on function public.dipendente_dpi_identita_stabile() from public,anon,authenticated;
drop trigger if exists dipendente_dpi_identita_stabile on public.employees;
create trigger dipendente_dpi_identita_stabile before update of company_id,role_type on public.employees for each row execute function public.dipendente_dpi_identita_stabile();
