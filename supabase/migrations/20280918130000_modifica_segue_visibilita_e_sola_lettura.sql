-- Permessi: chi vede un'area la può anche modificare; per limitarlo c'è
-- «Sola lettura» sull'utente.
--
-- Prima «vedere» e «modificare» erano due interruttori e la modifica partiva
-- spenta quasi ovunque. Creare un contatto, un'opportunità o una commessa
-- richiede la modifica: un utente nuovo nasceva capace solo di guardare, e
-- import CSV e inviti lo lasciavano così. Decisione del 16/09/2026: di base si
-- lavora; il blocco è l'eccezione, un flag solo.
--
-- La regola sta in un trigger su staff_permissions, non nell'interfaccia: vale
-- per ogni strada che scrive i permessi (wizard, import, inviti, edge function,
-- template, super admin), e le policy e le edge function che leggono le
-- colonne can_edit_* continuano a funzionare senza toccarle.
--
-- - Aree operative (commesse, magazzino, clienti, ticket, giornale lavori,
--   contatti, opportunità, preventivi): modifica = visibilità, se non in sola
--   lettura.
-- - Impostazioni e azioni speciali (pagamenti, approvazioni, eliminazioni,
--   articoli, fornitori, corsi): restano interruttori a sé, perché danno potere
--   sull'azienda; la sola lettura li spegne.
-- - Appuntamenti, attività e sopralluoghi non hanno una colonna di modifica:
--   per loro la sola lettura è una policy RESTRICTIVE sulle scritture.

alter table public.staff_permissions
  add column if not exists sola_lettura boolean not null default false;

comment on column public.staff_permissions.sola_lettura is
  'Vede le sue aree ma non crea e non modifica nulla. Le colonne can_edit_* delle aree operative seguono la visibilità (trigger permessi_modifica_segue_visibilita).';

create or replace function public.permessi_modifica_segue_visibilita()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  scrive boolean := not coalesce(new.sola_lettura, false);
begin
  new.can_edit_orders                  := coalesce(new.can_view_orders, false) and scrive;
  new.can_edit_warehouse               := coalesce(new.can_view_warehouse, false) and scrive;
  new.can_edit_customers               := coalesce(new.can_view_customers, false) and scrive;
  new.can_edit_tickets                 := coalesce(new.can_view_tickets, false) and scrive;
  new.can_edit_giornale_lavori         := coalesce(new.can_view_giornale_lavori, false) and scrive;
  new.can_edit_marketing_contacts      := coalesce(new.can_view_marketing_contacts, false) and scrive;
  new.can_edit_marketing_opportunities := coalesce(new.can_view_marketing_opportunities, false) and scrive;
  new.can_edit_preventivi              := coalesce(new.can_view_preventivi, false) and scrive;
  new.can_edit_marketing               := new.can_edit_marketing_contacts or new.can_edit_marketing_opportunities;

  if not scrive then
    new.can_edit_settings                := false;
    new.can_edit_settings_profile        := false;
    new.can_edit_settings_orders         := false;
    new.can_edit_settings_customization  := false;
    new.can_edit_settings_people         := false;
    new.can_edit_settings_pricing        := false;
    new.can_edit_settings_scontistica    := false;
    new.can_edit_settings_finanziamenti  := false;
    new.can_edit_settings_bundle         := false;
    new.can_edit_settings_suppliers      := false;
    new.can_edit_settings_integrations   := false;
    new.can_manage_payments              := false;
    new.can_manage_suppliers             := false;
    new.can_manage_warehouse_items       := false;
    new.can_manage_portal                := false;
    new.can_approve_orders               := false;
    new.can_approve_discounts            := false;
    new.can_delete_orders                := false;
  end if;

  return new;
end;
$$;

revoke all on function public.permessi_modifica_segue_visibilita() from public, anon, authenticated;

drop trigger if exists trg_permessi_modifica_segue_visibilita on public.staff_permissions;
create trigger trg_permessi_modifica_segue_visibilita
  before insert or update on public.staff_permissions
  for each row execute function public.permessi_modifica_segue_visibilita();

-- L'utente corrente è in sola lettura in questa azienda? Un amministratore
-- dell'azienda non lo è mai, anche se ha una riga di permessi.
create or replace function public.utente_sola_lettura(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_permissions sp
    where sp.user_id = (select auth.uid())
      and sp.company_id = p_company_id
      and sp.sola_lettura
  )
  and not (p_company_id = any (public.aziende_con_permesso('__solo_amministratori__')));
$$;

revoke all on function public.utente_sola_lettura(uuid) from public, anon;
grant execute on function public.utente_sola_lettura(uuid) to authenticated, service_role;

-- Le tabelle senza una colonna di modifica dedicata.
do $$
declare
  t text;
begin
  foreach t in array array['appointments', 'tasks', 'surveys'] loop
    execute format('drop policy if exists sola_lettura_non_crea on public.%I', t);
    execute format('drop policy if exists sola_lettura_non_modifica on public.%I', t);
    execute format('drop policy if exists sola_lettura_non_elimina on public.%I', t);
    execute format(
      'create policy sola_lettura_non_crea on public.%I as restrictive for insert to authenticated with check (not public.utente_sola_lettura(company_id))', t);
    execute format(
      'create policy sola_lettura_non_modifica on public.%I as restrictive for update to authenticated using (not public.utente_sola_lettura(company_id)) with check (not public.utente_sola_lettura(company_id))', t);
    execute format(
      'create policy sola_lettura_non_elimina on public.%I as restrictive for delete to authenticated using (not public.utente_sola_lettura(company_id))', t);
  end loop;
end;
$$;

-- Gli utenti di oggi: chi vede un'area operativa ottiene la modifica.
set local lock_timeout = '3s';
update public.staff_permissions set sola_lettura = sola_lettura;
