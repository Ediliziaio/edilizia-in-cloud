-- Mezzi e attrezzature diventa una voce propria nei permessi e nei moduli
-- (24/09/2026, richiesta di Florin).
--
-- Fino a oggi i mezzi usavano i permessi del Magazzino: chi vedeva il
-- magazzino vedeva i furgoni, e non si poteva dare l'uno senza l'altro. Ora:
--   · due colonne su staff_permissions, can_view_mezzi e can_edit_mezzi, che
--     has_permission_for_company legge per nome come tutte le altre;
--   · la modifica segue la visibilità, salvo «Sola lettura», come nelle altre
--     aree operative (trigger permessi_modifica_segue_visibilita);
--   · chi oggi vede il Magazzino continua a vedere i mezzi (24 persone): nessuno
--     perde niente col cambio, e da domani si possono separare;
--   · le regole di accesso di tabelle e file dei mezzi, e gli avvisi delle
--     segnalazioni, guardano i permessi nuovi;
--   · «mezzi» è un modulo dei piani, acceso in tutti quelli che hanno il
--     Magazzino (i piani solo Marketing restano senza).
--
-- Chi ha il mezzo in carico dal telefono non cambia: passa da mezzi_in_carico()
-- e da mezzo_in_carico_a_me(), che non dipendono da questi permessi.
--
-- Idempotente. Scrive 24 righe di staff_permissions e 6 di subscription_plans:
-- lock e tempi stretti.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── Colonne ─────────────────────────────────────────────────────────────────
alter table public.staff_permissions
  add column if not exists can_view_mezzi boolean not null default false,
  add column if not exists can_edit_mezzi boolean not null default false;

comment on column public.staff_permissions.can_view_mezzi is
  'Vede Mezzi e attrezzature (furgoni, mezzi, attrezzi, scadenze, tagliandi). La modifica la deriva il trigger permessi_modifica_segue_visibilita.';
comment on column public.staff_permissions.can_edit_mezzi is
  'Modifica Mezzi e attrezzature: = can_view_mezzi se non in sola lettura (trigger).';

-- ── La modifica segue la visibilità, anche per i mezzi ──────────────────────
create or replace function public.permessi_modifica_segue_visibilita()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  scrive boolean := not coalesce(new.sola_lettura, false);
begin
  new.can_edit_orders                  := coalesce(new.can_view_orders, false) and scrive;
  new.can_edit_warehouse               := coalesce(new.can_view_warehouse, false) and scrive;
  new.can_edit_mezzi                   := coalesce(new.can_view_mezzi, false) and scrive;
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

-- ── Chi vedeva i mezzi dal Magazzino continua a vederli ─────────────────────
update public.staff_permissions
   set can_view_mezzi = true
 where can_view_warehouse and not can_view_mezzi;

-- ── Regole di accesso: i permessi dei mezzi ─────────────────────────────────
drop policy if exists mezzi_lettura on public.mezzi;
create policy mezzi_lettura on public.mezzi for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', company_id));
drop policy if exists mezzi_modifica on public.mezzi;
create policy mezzi_modifica on public.mezzi for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id));
drop policy if exists mezzi_documenti_lettura on public.mezzi_documenti;
create policy mezzi_documenti_lettura on public.mezzi_documenti for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', company_id));
drop policy if exists mezzi_documenti_modifica on public.mezzi_documenti;
create policy mezzi_documenti_modifica on public.mezzi_documenti for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id));
drop policy if exists mezzi_manutenzioni_lettura on public.mezzi_manutenzioni;
create policy mezzi_manutenzioni_lettura on public.mezzi_manutenzioni for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', company_id));
drop policy if exists mezzi_manutenzioni_modifica on public.mezzi_manutenzioni;
create policy mezzi_manutenzioni_modifica on public.mezzi_manutenzioni for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id));
drop policy if exists mezzi_assegnazioni_lettura on public.mezzi_assegnazioni;
create policy mezzi_assegnazioni_lettura on public.mezzi_assegnazioni for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', company_id));
drop policy if exists mezzi_assegnazioni_modifica on public.mezzi_assegnazioni;
create policy mezzi_assegnazioni_modifica on public.mezzi_assegnazioni for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id));
drop policy if exists mezzi_segnalazioni_lettura on public.mezzi_segnalazioni;
create policy mezzi_segnalazioni_lettura on public.mezzi_segnalazioni for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', company_id)
         or public.mezzo_in_carico_a_me(mezzo_id));
drop policy if exists mezzi_segnalazioni_invio on public.mezzi_segnalazioni;
create policy mezzi_segnalazioni_invio on public.mezzi_segnalazioni for insert to authenticated
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id)
              or public.mezzo_in_carico_a_me(mezzo_id));
drop policy if exists mezzi_segnalazioni_gestione on public.mezzi_segnalazioni;
create policy mezzi_segnalazioni_gestione on public.mezzi_segnalazioni for update to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id));
drop policy if exists mezzi_segnalazioni_elimina on public.mezzi_segnalazioni;
create policy mezzi_segnalazioni_elimina on public.mezzi_segnalazioni for delete to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id));
drop policy if exists mezzi_foto_lettura on public.mezzi_foto;
create policy mezzi_foto_lettura on public.mezzi_foto for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', company_id)
         or public.mezzo_in_carico_a_me(mezzo_id));
drop policy if exists mezzi_foto_invio on public.mezzi_foto;
create policy mezzi_foto_invio on public.mezzi_foto for insert to authenticated
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id)
              or (public.mezzo_in_carico_a_me(mezzo_id) and created_by = (select auth.uid())));
drop policy if exists mezzi_foto_modifica on public.mezzi_foto;
create policy mezzi_foto_modifica on public.mezzi_foto for update to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id));
drop policy if exists mezzi_foto_elimina on public.mezzi_foto;
create policy mezzi_foto_elimina on public.mezzi_foto for delete to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id)
         or created_by = (select auth.uid()));
drop policy if exists mezzi_file_lettura on storage.objects;
create policy mezzi_file_lettura on storage.objects for select to authenticated
  using (bucket_id = 'mezzi-documenti'
         and (storage.foldername(name))[1] = public.get_my_company_id()::text
         and public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', public.get_my_company_id()));
drop policy if exists mezzi_file_modifica on storage.objects;
create policy mezzi_file_modifica on storage.objects for all to authenticated
  using (bucket_id = 'mezzi-documenti'
         and (storage.foldername(name))[1] = public.get_my_company_id()::text
         and public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', public.get_my_company_id()))
  with check (bucket_id = 'mezzi-documenti'
         and (storage.foldername(name))[1] = public.get_my_company_id()::text
         and public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', public.get_my_company_id()));

-- ── Avvisi delle segnalazioni: a chi modifica i mezzi ───────────────────────
create or replace function public.mezzi_segnalazione_avvisa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mezzo record;
  v_chi text;
  v_titolo text;
begin
  select id, company_id, nome, targa, contatore into v_mezzo from public.mezzi where id = new.mezzo_id;

  if new.contatore is not null and (v_mezzo.contatore is null or v_mezzo.contatore < new.contatore) then
    update public.mezzi
       set contatore = new.contatore,
           contatore_aggiornato_il = (new.created_at at time zone 'Europe/Rome')::date
     where id = new.mezzo_id;
  end if;

  if new.tipo = 'km' then
    return new;
  end if;

  select nullif(trim(coalesce(hp.nome, '') || ' ' || coalesce(hp.cognome, '')), '')
    into v_chi from public.hr_profili hp where hp.id = new.hr_profilo_id;

  v_titolo := case new.tipo
                when 'guasto' then 'Guasto segnalato'
                when 'danno' then 'Danno segnalato'
                else 'Segnalazione'
              end
              || ': ' || v_mezzo.nome || coalesce(' (' || v_mezzo.targa || ')', '');

  insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  select v_mezzo.company_id, destinatari.user_id, 'mezzo_segnalazione', v_titolo,
         left(coalesce(v_chi || ': ', '') || coalesce(nullif(trim(new.descrizione), ''), 'senza descrizione'), 300),
         'mezzo', new.mezzo_id, '/azienda/mezzi/' || new.mezzo_id
    from (
      select p.id as user_id
        from public.profiles p
        join public.user_roles ur on ur.user_id = p.id and ur.role = 'company_admin'
       where p.company_id = v_mezzo.company_id
      union
      select sp.user_id
        from public.staff_permissions sp
       where sp.company_id = v_mezzo.company_id and sp.can_edit_mezzi
    ) destinatari
   where destinatari.user_id is distinct from new.created_by;

  return new;
end;
$$;
revoke all on function public.mezzi_segnalazione_avvisa() from public, anon, authenticated;

-- ── Modulo dei piani ────────────────────────────────────────────────────────
update public.subscription_plans
   set included_modules = included_modules || '["mezzi"]'::jsonb
 where included_modules ? 'warehouse'
   and not included_modules ? 'mezzi';

notify pgrst, 'reload schema';
