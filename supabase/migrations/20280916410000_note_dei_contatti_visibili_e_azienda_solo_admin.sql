-- Note dei contatti visibili a chi vede il contatto; dati dell'azienda solo agli amministratori.
--
-- 1. Note. Per chi ha "solo assegnati" (16 persone su 17 in BeMade) la regola
--    diceva: vedi solo le note che hai scritto TU. Le 18.493 note importate non
--    hanno autore, quindi una call center apriva un contatto suo e non ne vedeva
--    nessuna (Venusia: 1.138 contatti, 0 note). Ora vale la stessa regola dei
--    contatti: le note si vedono sui contatti che ti sono assegnati come
--    venditore, call center o follower, o di cui segui un'opportunità.
--    Modificare e cancellare restano limitati alle proprie note.
--
-- 2. Azienda. La policy "Company admins can update their own company" NON
--    controllava il ruolo: qualunque dipendente poteva modificare la riga
--    della sua azienda. Il 14/09 una call center di BeMade ne ha scelto il
--    settore. Ora serve essere amministratore o avere il permesso di
--    modificare le impostazioni (le schermate che scrivono qui sono tutte
--    impostazioni). Le funzioni del database che aggiornano companies sono
--    tutte SECURITY DEFINER: non ne risentono.

drop policy if exists "Staff can view contact notes if permitted" on public.marketing_contact_notes;
create policy "Staff can view contact notes if permitted" on public.marketing_contact_notes
  for select
  using (
    (company_id in (select unnest(aziende_con_permesso('can_view_marketing_contacts') || aziende_con_permesso('can_view_orders'))))
    and (
      not (select solo_assegnati_attivo())
      or created_by = (select auth.uid())
      or exists (
        select 1 from public.marketing_contacts c
         where c.id = marketing_contact_notes.contact_id
           and ((select auth.uid()) in (c.assigned_to, c.call_center_id, c.follower_id)
                or contatto_seguito_da_me(c.id))
      )
      or exists (
        select 1 from public.marketing_opportunities o
         where o.id = marketing_contact_notes.opportunity_id
           and o.deleted_at is null
           and (select auth.uid()) in (o.assigned_to, o.call_center_id, o.follower_id)
      )
    )
  );

drop policy if exists "Company admins can update their own company" on public.companies;
create policy "Company admins can update their own company" on public.companies
  for update
  using (
    id = get_user_company_id((select auth.uid()))
    and (
      (select has_role((select auth.uid()), 'company_admin'::app_role))
      or id in (select unnest(aziende_con_permesso('can_edit_settings')))
    )
  )
  with check (
    id = get_user_company_id((select auth.uid()))
    and (
      (select has_role((select auth.uid()), 'company_admin'::app_role))
      or id in (select unnest(aziende_con_permesso('can_edit_settings')))
    )
  );
