-- Note di contatti e opportunità: si possono modificare.
--
-- Le note si potevano solo aggiungere: una parola sbagliata restava per sempre
-- (BeMade, Venusia, 15/09). Una modifica non cambia autore, azienda e data di
-- creazione, e lascia scritto quando e da chi è stata fatta.
--
-- Chi può modificare (le policy esistenti restano):
--   - amministratori e super admin: tutte le note ("Company admins can manage…");
--   - staff col permesso di modificare i contatti: tutte, o, se vede solo i suoi
--     clienti, le proprie ("Staff can manage contact notes if permitted");
--   - NUOVO: quello staff anche le note senza autore (importate o automatiche)
--     sui contatti e sulle opportunità che segue. Mai la nota di un collega.

alter table public.marketing_contact_notes
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

create or replace function public.nota_modificata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Autore, azienda e data di nascita non si cambiano con una modifica.
  new.created_by := old.created_by;
  new.company_id := old.company_id;
  new.created_at := old.created_at;
  if new.content is distinct from old.content then
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  else
    new.updated_at := old.updated_at;
    new.updated_by := old.updated_by;
  end if;
  return new;
end;
$$;

revoke all on function public.nota_modificata() from public, anon;

drop trigger if exists trg_nota_modificata on public.marketing_contact_notes;
create trigger trg_nota_modificata
  before update on public.marketing_contact_notes
  for each row execute function public.nota_modificata();

drop policy if exists "Staff can edit authorless notes on followed records" on public.marketing_contact_notes;
create policy "Staff can edit authorless notes on followed records"
  on public.marketing_contact_notes
  for update
  to authenticated
  using (
    created_by is null
    and company_id in (select unnest(public.aziende_con_permesso('can_edit_marketing_contacts')))
    and (
      exists (
        select 1 from public.marketing_contacts c
        where c.id = marketing_contact_notes.contact_id
          and (select auth.uid()) in (c.assigned_to, c.call_center_id, c.follower_id)
      )
      or exists (
        select 1 from public.marketing_opportunities o
        where o.id = marketing_contact_notes.opportunity_id
          and o.deleted_at is null
          and (select auth.uid()) in (o.assigned_to, o.call_center_id, o.follower_id)
      )
    )
  )
  with check (
    created_by is null
    and company_id in (select unnest(public.aziende_con_permesso('can_edit_marketing_contacts')))
  );
