-- Responsabile di squadra: vede e lavora anche quello che è assegnato ai membri.
--
-- Il Bagno Group, 17/09/2026: Katia, commerciale con «Solo i propri», deve
-- vedere anche le opportunità e i calendari di Camilla, Valentina, Alice e
-- Leonardo. Con «Solo i propri» si vedeva solo ciò che è assegnato a sé; senza,
-- tutta l'azienda: in mezzo non c'era niente. Le squadre (Impostazioni → Team,
-- tabelle teams e team_members) avevano già la colonna del responsabile, ma non
-- contava nulla e l'app non la faceva nemmeno scegliere.
--
-- Da qui il responsabile di una squadra (teams.leader_id) vede e lavora, anche
-- con «Solo i propri», quello che è assegnato ai membri:
--   - opportunità e contatti, compresi i contatti delle opportunità dei membri;
--   - note e attività scritte dai membri;
--   - tutto ciò che passa da check_staff_visibility: appuntamenti, calendari,
--     attività, preventivi, ticket, chiamate.
-- Chi non guida una squadra non cambia. Al 17/09/2026 esistevano 4 squadre,
-- nelle aziende demo e senza membri: nessun altro utente vede di più.
--
-- Solo funzioni e policy, nessuna riga. Le policy tornano identiche, con in più
-- la condizione sui membri. Unica differenza: la lettura delle note dei contatti
-- passa da TO public a TO authenticated, perché anon non ne ricavava comunque
-- nulla (servono i permessi d'azienda) e così non valuta funzioni che non può
-- eseguire. Riscrivere una policy blocca la tabella per un attimo: con
-- lock_timeout si rinuncia invece di mettere in coda il CRM.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- I membri delle squadre guidate da chi chiama, nell'azienda su cui lavora.
create or replace function public.membri_mie_squadre()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(array_agg(distinct tm.user_id), '{}'::uuid[])
    from public.teams t
    join public.team_members tm on tm.team_id = t.id
   where t.leader_id = (select auth.uid())
     and t.company_id = public.get_effective_company_id()
     and tm.user_id <> t.leader_id;
$function$;

revoke all on function public.membri_mie_squadre() from public, anon;
grant execute on function public.membri_mie_squadre() to authenticated, service_role;

-- Appuntamenti, calendari e le altre tabelle che chiedono "chi è l'assegnatario".
create or replace function public.check_staff_visibility(_user_id uuid, _assigned_to uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
DECLARE
  _only_assigned boolean;
BEGIN
  IF public.chiamante_anonimo() THEN RETURN false; END IF;

  IF has_role(_user_id, 'super_admin'::app_role) OR has_role(_user_id, 'company_admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Se si chiede di un altro utente non ha senso l'azienda ATTIVA di chi
  -- chiede: in quel caso vale la piu' restrittiva fra le sue righe.
  SELECT bool_or(sp.only_assigned) INTO _only_assigned
    FROM public.staff_permissions sp
   WHERE sp.user_id = _user_id
     AND (_user_id IS DISTINCT FROM auth.uid()
          OR sp.company_id = public.get_effective_company_id());

  IF _only_assigned IS NULL OR _only_assigned = false THEN
    RETURN true;
  END IF;

  -- Il responsabile di una squadra vede anche quello che è assegnato ai membri.
  IF _assigned_to IS NOT NULL AND _assigned_to <> _user_id AND EXISTS (
    SELECT 1
      FROM public.teams t
      JOIN public.team_members tm ON tm.team_id = t.id
     WHERE t.leader_id = _user_id
       AND tm.user_id = _assigned_to
       AND (_user_id IS DISTINCT FROM auth.uid()
            OR t.company_id = public.get_effective_company_id())
  ) THEN
    RETURN true;
  END IF;

  RETURN _assigned_to = _user_id;
END;
$function$;

-- Contatti seguiti: anche quelli delle opportunità dei membri delle squadre guidate.
create or replace function public.contatti_seguiti_da_me()
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select o.contact_id from public.marketing_opportunities o
   where o.assigned_to = (select auth.uid()) and o.deleted_at is null and o.contact_id is not null
  union
  select o.contact_id from public.marketing_opportunities o
   where o.call_center_id = (select auth.uid()) and o.deleted_at is null and o.contact_id is not null
  union
  select o.contact_id from public.marketing_opportunities o
   where o.follower_id = (select auth.uid()) and o.deleted_at is null and o.contact_id is not null
  union
  select o.contact_id from public.marketing_opportunities o
   where o.assigned_to in (select unnest(public.membri_mie_squadre())) and o.deleted_at is null and o.contact_id is not null;
$function$;

-- ─── Opportunità ────────────────────────────────────────────────────────────
drop policy if exists "Staff can view opportunities if permitted" on public.marketing_opportunities;
create policy "Staff can view opportunities if permitted" on public.marketing_opportunities
  for select to authenticated
  using (
    (company_id in (select unnest((aziende_con_permesso('can_view_marketing_opportunities'::text) || aziende_con_permesso('can_view_orders'::text)))))
    and ((not (select solo_assegnati_attivo()))
         or (assigned_to = (select auth.uid()))
         or (call_center_id = (select auth.uid()))
         or (follower_id = (select auth.uid()))
         or (assigned_to in (select unnest(membri_mie_squadre()))))
  );

drop policy if exists "Staff can manage opportunities if permitted" on public.marketing_opportunities;
create policy "Staff can manage opportunities if permitted" on public.marketing_opportunities
  for all to authenticated
  using (
    (company_id in (select unnest(aziende_con_permesso('can_edit_marketing_opportunities'::text))))
    and ((not (select solo_assegnati_attivo()))
         or (assigned_to = (select auth.uid()))
         or (call_center_id = (select auth.uid()))
         or (follower_id = (select auth.uid()))
         or (assigned_to in (select unnest(membri_mie_squadre()))))
  )
  with check (company_id in (select unnest(aziende_con_permesso('can_edit_marketing_opportunities'::text))));

-- ─── Contatti ───────────────────────────────────────────────────────────────
drop policy if exists "Staff can view marketing contacts if permitted" on public.marketing_contacts;
create policy "Staff can view marketing contacts if permitted" on public.marketing_contacts
  for select to authenticated
  using (
    (company_id in (select unnest((aziende_con_permesso('can_view_marketing_contacts'::text) || aziende_con_permesso('can_view_orders'::text)))))
    and ((not (select solo_assegnati_attivo()))
         or (assigned_to = (select auth.uid()))
         or (call_center_id = (select auth.uid()))
         or (follower_id = (select auth.uid()))
         or (assigned_to in (select unnest(membri_mie_squadre())))
         or (id in (select contatti_seguiti_da_me())))
  );

drop policy if exists "Staff can manage marketing contacts if permitted" on public.marketing_contacts;
create policy "Staff can manage marketing contacts if permitted" on public.marketing_contacts
  for all to authenticated
  using (
    (company_id in (select unnest(aziende_con_permesso('can_edit_marketing_contacts'::text))))
    and ((not (select solo_assegnati_attivo()))
         or (assigned_to = (select auth.uid()))
         or (call_center_id = (select auth.uid()))
         or (follower_id = (select auth.uid()))
         or (assigned_to in (select unnest(membri_mie_squadre())))
         or (id in (select contatti_seguiti_da_me())))
  )
  with check (company_id in (select unnest(aziende_con_permesso('can_edit_marketing_contacts'::text))));

-- ─── Note delle opportunità ─────────────────────────────────────────────────
drop policy if exists "Staff can view opportunity notes if permitted" on public.marketing_opportunity_notes;
create policy "Staff can view opportunity notes if permitted" on public.marketing_opportunity_notes
  for select to authenticated
  using (
    (company_id in (select unnest((aziende_con_permesso('can_view_marketing_opportunities'::text) || aziende_con_permesso('can_view_orders'::text)))))
    and ((not (select solo_assegnati_attivo()))
         or (created_by = (select auth.uid()))
         or (created_by in (select unnest(membri_mie_squadre()))))
  );

drop policy if exists "Staff can manage opportunity notes if permitted" on public.marketing_opportunity_notes;
create policy "Staff can manage opportunity notes if permitted" on public.marketing_opportunity_notes
  for all to authenticated
  using (
    (company_id in (select unnest(aziende_con_permesso('can_edit_marketing_opportunities'::text))))
    and ((not (select solo_assegnati_attivo()))
         or (created_by = (select auth.uid()))
         or (created_by in (select unnest(membri_mie_squadre()))))
  )
  with check (
    (company_id in (select unnest(aziende_con_permesso('can_edit_marketing_opportunities'::text))))
    and ((not (select solo_assegnati_attivo()))
         or (created_by = (select auth.uid()))
         or (created_by in (select unnest(membri_mie_squadre()))))
  );

-- ─── Note dei contatti ──────────────────────────────────────────────────────
drop policy if exists "Staff can view contact notes if permitted" on public.marketing_contact_notes;
create policy "Staff can view contact notes if permitted" on public.marketing_contact_notes
  for select to authenticated
  using (
    (company_id in (select unnest((aziende_con_permesso('can_view_marketing_contacts'::text) || aziende_con_permesso('can_view_orders'::text)))))
    and ((not (select solo_assegnati_attivo()))
         or (created_by = (select auth.uid()))
         or (created_by in (select unnest(membri_mie_squadre())))
         or (exists (
               select 1 from marketing_contacts c
                where c.id = marketing_contact_notes.contact_id
                  and (((select auth.uid()) = c.assigned_to)
                       or ((select auth.uid()) = c.call_center_id)
                       or ((select auth.uid()) = c.follower_id)
                       or (c.assigned_to in (select unnest(membri_mie_squadre())))
                       or (c.id in (select contatti_seguiti_da_me())))))
         or (exists (
               select 1 from marketing_opportunities o
                where o.id = marketing_contact_notes.opportunity_id
                  and o.deleted_at is null
                  and (((select auth.uid()) = o.assigned_to)
                       or ((select auth.uid()) = o.call_center_id)
                       or ((select auth.uid()) = o.follower_id)
                       or (o.assigned_to in (select unnest(membri_mie_squadre())))))))
  );

drop policy if exists "Staff can manage contact notes if permitted" on public.marketing_contact_notes;
create policy "Staff can manage contact notes if permitted" on public.marketing_contact_notes
  for all to authenticated
  using (
    (company_id in (select unnest(aziende_con_permesso('can_edit_marketing_contacts'::text))))
    and ((not (select solo_assegnati_attivo()))
         or (created_by = (select auth.uid()))
         or (created_by in (select unnest(membri_mie_squadre()))))
  )
  with check (
    (company_id in (select unnest(aziende_con_permesso('can_edit_marketing_contacts'::text))))
    and ((not (select solo_assegnati_attivo()))
         or (created_by = (select auth.uid()))
         or (created_by in (select unnest(membri_mie_squadre()))))
  );

-- ─── Attività dei contatti ──────────────────────────────────────────────────
drop policy if exists "Staff can view contact activities if permitted" on public.marketing_contact_activities;
create policy "Staff can view contact activities if permitted" on public.marketing_contact_activities
  for select to authenticated
  using (
    (company_id in (select unnest((aziende_con_permesso('can_view_marketing_contacts'::text) || aziende_con_permesso('can_view_orders'::text)))))
    and ((not (select solo_assegnati_attivo()))
         or (created_by = (select auth.uid()))
         or (created_by in (select unnest(membri_mie_squadre()))))
  );

drop policy if exists "Staff can manage contact activities if permitted" on public.marketing_contact_activities;
create policy "Staff can manage contact activities if permitted" on public.marketing_contact_activities
  for all to authenticated
  using (
    (company_id in (select unnest(aziende_con_permesso('can_edit_marketing_contacts'::text))))
    and ((not (select solo_assegnati_attivo()))
         or (created_by = (select auth.uid()))
         or (created_by in (select unnest(membri_mie_squadre()))))
  )
  with check (
    (company_id in (select unnest(aziende_con_permesso('can_edit_marketing_contacts'::text))))
    and ((not (select solo_assegnati_attivo()))
         or (created_by = (select auth.uid()))
         or (created_by in (select unnest(membri_mie_squadre()))))
  );
