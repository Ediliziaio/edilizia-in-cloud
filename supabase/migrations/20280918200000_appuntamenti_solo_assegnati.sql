-- «Solo i propri»: fissare un appuntamento (o un'attività) non dà più errore.
--
-- Il Bagno Group, 17/09/2026: undici venditori con «Solo i propri» non
-- riuscivano a salvare gli appuntamenti — «Non hai i permessi per questa
-- operazione». Il permesso c'era: il problema è la rilettura dopo l'inserimento.
-- L'app fa insert().select(); se l'appuntamento nasce senza assegnatario,
-- check_staff_visibility(utente, NULL) è falso e Postgres risponde 42501 «new
-- row violates row-level security policy». Riprodotto come Katia il 18/09.
-- Stesso inciampo già visto su contatti e opportunità (trigger
-- assegna_a_chi_crea, 16/09): appuntamenti e attività erano rimasti fuori,
-- e quel trigger non si può riusare perché legge call_center_id/follower_id,
-- colonne che qui non esistono.
--
-- Due pezzi:
--   1. chi ha «Solo i propri» e non indica nessuno diventa l'assegnatario:
--      vale per ogni strada (calendario, scheda contatto, opportunità, import);
--   2. chi ha creato la riga la vede e la modifica anche se non è assegnata a
--      nessuno. Serve per quello che è già stato salvato prima di oggi: a Il
--      Bagno Group sette appuntamenti creati da Camilla e Giusy erano
--      diventati invisibili a loro.
-- «Sola lettura» resta sopra a tutto: sono policy RESTRICTIVE, non cambiano.

set local lock_timeout = '3s';

create or replace function public.assegna_a_chi_crea_solo_assegnatario()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.solo_assegnati_attivo() then
    return new;
  end if;
  if new.assigned_to is null then
    new.assigned_to := v_uid;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assegna_appuntamento_a_chi_crea on public.appointments;
create trigger trg_assegna_appuntamento_a_chi_crea
  before insert on public.appointments
  for each row execute function public.assegna_a_chi_crea_solo_assegnatario();

drop trigger if exists trg_assegna_attivita_a_chi_crea on public.tasks;
create trigger trg_assegna_attivita_a_chi_crea
  before insert on public.tasks
  for each row execute function public.assegna_a_chi_crea_solo_assegnatario();

drop policy if exists appuntamenti_creati_da_me on public.appointments;
create policy appuntamenti_creati_da_me on public.appointments
  for all to authenticated
  using (created_by = (select auth.uid()) and company_id = (select public.get_effective_company_id()))
  with check (created_by = (select auth.uid()) and company_id = (select public.get_effective_company_id()));

drop policy if exists attivita_create_da_me on public.tasks;
create policy attivita_create_da_me on public.tasks
  for all to authenticated
  using (created_by = (select auth.uid()) and company_id = (select public.get_effective_company_id()))
  with check (created_by = (select auth.uid()) and company_id = (select public.get_effective_company_id()));
