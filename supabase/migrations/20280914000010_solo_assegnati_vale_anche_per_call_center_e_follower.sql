-- «Vede solo i propri» guardava soltanto il venditore (assigned_to). Un
-- operatore di call center con quella casella accesa, assegnato a
-- un'opportunità come CALL CENTER (call_center_id), non la vedeva: per lui
-- non esisteva. È successo a Venusia di BeMade l'11/09/2026 — quattro
-- opportunità assegnate a lei, zero visibili — ed è esattamente il ruolo per
-- cui la casella esiste: il call center lavora solo i contatti che gli danno.
--
-- Da qui l'opportunità è «mia» se ne sono venditore, call center o follower.
-- Il contatto è «mio» se lo seguo io direttamente oppure se ho un'opportunità
-- aperta su di lui: altrimenti il call center vedrebbe la scheda
-- dell'opportunità ma non il telefono da chiamare.

-- Il controllo sul contatto passa da una funzione SECURITY DEFINER: evita di
-- rivalutare le regole delle opportunità dentro quelle dei contatti (costo e
-- rischio di ricorsione) e risponde solo per l'utente che chiede.
create or replace function public.contatto_seguito_da_me(p_contact uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from marketing_opportunities o
    where o.contact_id = p_contact
      and o.deleted_at is null
      and (select auth.uid()) in (o.assigned_to, o.call_center_id, o.follower_id)
  );
$$;
revoke all on function public.contatto_seguito_da_me(uuid) from public, anon;
grant execute on function public.contatto_seguito_da_me(uuid) to authenticated;

-- ── Opportunità ──────────────────────────────────────────────────────────────
drop policy if exists "Staff can view opportunities if permitted" on public.marketing_opportunities;
create policy "Staff can view opportunities if permitted" on public.marketing_opportunities
  for select to authenticated
  using (
    (company_id in (select unnest(aziende_con_permesso('can_view_marketing_opportunities') || aziende_con_permesso('can_view_orders'))))
    and (
      not (select solo_assegnati_attivo())
      or assigned_to    = (select auth.uid())
      or call_center_id = (select auth.uid())
      or follower_id    = (select auth.uid())
    )
  );

drop policy if exists "Staff can manage opportunities if permitted" on public.marketing_opportunities;
create policy "Staff can manage opportunities if permitted" on public.marketing_opportunities
  for all to authenticated
  using (
    (company_id in (select unnest(aziende_con_permesso('can_edit_marketing_opportunities'))))
    and (
      not (select solo_assegnati_attivo())
      or assigned_to    = (select auth.uid())
      or call_center_id = (select auth.uid())
      or follower_id    = (select auth.uid())
    )
  )
  with check (company_id in (select unnest(aziende_con_permesso('can_edit_marketing_opportunities'))));

-- ── Contatti ─────────────────────────────────────────────────────────────────
drop policy if exists "Staff can view marketing contacts if permitted" on public.marketing_contacts;
create policy "Staff can view marketing contacts if permitted" on public.marketing_contacts
  for select to authenticated
  using (
    (company_id in (select unnest(aziende_con_permesso('can_view_marketing_contacts') || aziende_con_permesso('can_view_orders'))))
    and (
      not (select solo_assegnati_attivo())
      or assigned_to    = (select auth.uid())
      or call_center_id = (select auth.uid())
      or follower_id    = (select auth.uid())
      or contatto_seguito_da_me(id)
    )
  );

drop policy if exists "Staff can manage marketing contacts if permitted" on public.marketing_contacts;
create policy "Staff can manage marketing contacts if permitted" on public.marketing_contacts
  for all to authenticated
  using (
    (company_id in (select unnest(aziende_con_permesso('can_edit_marketing_contacts'))))
    and (
      not (select solo_assegnati_attivo())
      or assigned_to    = (select auth.uid())
      or call_center_id = (select auth.uid())
      or follower_id    = (select auth.uid())
      or contatto_seguito_da_me(id)
    )
  )
  with check (company_id in (select unnest(aziende_con_permesso('can_edit_marketing_contacts'))));
