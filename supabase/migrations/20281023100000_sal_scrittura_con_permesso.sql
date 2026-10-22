-- SAL: li scrive solo chi ha «Ordini e Commesse» nell'azienda della commessa (23/10/2026).
--
-- Prima. sal_records («sal_records_company_access») e sal_voci («sal_voci_via_sal»)
-- erano FOR ALL e chiedevano solo di essere dell'azienda del verbale (profilo o
-- accesso multi-azienda attivo). Dalle API ogni utente dell'azienda — operaio,
-- subappaltatore, venditore, cliente con il portale — poteva creare, cambiare o
-- cancellare un verbale SAL e le sue voci, anche su una commessa di un'altra
-- azienda scrivendo la propria nel company_id.
--
-- Dopo. Insert, update e delete chiedono puo_modificare_commessa(order_id):
-- can_edit_orders nell'azienda DELLA COMMESSA (has_permission_for_company, con
-- super admin e amministratore di quell'azienda), commessa fra quelle che
-- l'utente vede (can_see_order: «Solo i propri» scrive solo le sue), utente non
-- bloccato. Il verbale resta nell'azienda della sua commessa; sal_voci passa
-- dal suo verbale. La lettura resta quella di prima, riga per riga.
-- Restano: sal_records_superadmin, sal_voci_superadmin, blocco_utente_bloccato
-- (RESTRICTIVE); la firma del cliente sal_sign_with_token (SECURITY DEFINER) e le
-- edge function col service role non passano dalla RLS.
--
-- Le rate (order_installments) qui non ci sono: le ha già chiuse
-- 20281019320000_quattordicesimo_controllo_accessi (rate_lettura_azienda,
-- rate_scrittura_azienda con «Ordini e Commesse» o «Pagamenti»). Questo file
-- sostituisce la bozza del 07/10 (20281007190000, mai applicata), che sulle rate
-- avrebbe aggiunto una lettura più larga e riaperto le rate ai clienti esterni.

set local lock_timeout = '3s';

-- La regola, in un posto solo. Definer perché legge orders senza passare dalla
-- RLS di orders: chi scrive un SAL può non vedere la commessa per altre vie.
create or replace function public.puo_modificare_commessa(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
           select public.has_permission_for_company((select auth.uid()), 'can_edit_orders', o.company_id)
              and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)
             from public.orders o
            where o.id = p_order_id
         ), false)
     and not (select public.utente_bloccato());
$$;

-- Serve alle policy (le valuta chi scrive); agli anonimi no.
revoke all on function public.puo_modificare_commessa(uuid) from public, anon;
grant execute on function public.puo_modificare_commessa(uuid) to authenticated, service_role;

comment on function public.puo_modificare_commessa(uuid) is
  'Chi può scrivere i SAL di una commessa: «Ordini e Commesse» nell''azienda della commessa, commessa fra quelle che vede (Solo i propri), utente non bloccato. Usata dalle policy di sal_records e sal_voci.';

-- ── sal_records ─────────────────────────────────────────────────────────────

drop policy if exists sal_records_company_access on public.sal_records;

drop policy if exists sal_records_lettura_azienda on public.sal_records;
create policy sal_records_lettura_azienda on public.sal_records
  for select to public
  using (company_id in (select profiles.company_id
                          from public.profiles
                         where profiles.id = (select auth.uid())
                        union
                        select multi_company_access.company_id
                          from public.multi_company_access
                         where multi_company_access.user_id = (select auth.uid())
                           and multi_company_access.status = 'active'::text
                           and (multi_company_access.expires_at is null
                                or multi_company_access.expires_at > now())));

drop policy if exists sal_records_insert_con_permesso on public.sal_records;
create policy sal_records_insert_con_permesso on public.sal_records
  for insert to authenticated
  with check (company_id = public.get_order_company_id(order_id)
              and public.puo_modificare_commessa(order_id));

drop policy if exists sal_records_update_con_permesso on public.sal_records;
create policy sal_records_update_con_permesso on public.sal_records
  for update to authenticated
  using (public.puo_modificare_commessa(order_id))
  with check (company_id = public.get_order_company_id(order_id)
              and public.puo_modificare_commessa(order_id));

drop policy if exists sal_records_delete_con_permesso on public.sal_records;
create policy sal_records_delete_con_permesso on public.sal_records
  for delete to authenticated
  using (public.puo_modificare_commessa(order_id));

-- ── sal_voci ────────────────────────────────────────────────────────────────

drop policy if exists sal_voci_via_sal on public.sal_voci;

drop policy if exists sal_voci_lettura_azienda on public.sal_voci;
create policy sal_voci_lettura_azienda on public.sal_voci
  for select to public
  using (sal_id in (select sal_records.id
                      from public.sal_records
                     where sal_records.company_id in (select profiles.company_id
                                                        from public.profiles
                                                       where profiles.id = (select auth.uid())
                                                      union
                                                      select multi_company_access.company_id
                                                        from public.multi_company_access
                                                       where multi_company_access.user_id = (select auth.uid())
                                                         and multi_company_access.status = 'active'::text
                                                         and (multi_company_access.expires_at is null
                                                              or multi_company_access.expires_at > now()))));

drop policy if exists sal_voci_insert_con_permesso on public.sal_voci;
create policy sal_voci_insert_con_permesso on public.sal_voci
  for insert to authenticated
  with check (exists (select 1
                        from public.sal_records s
                       where s.id = sal_voci.sal_id
                         and public.puo_modificare_commessa(s.order_id)));

drop policy if exists sal_voci_update_con_permesso on public.sal_voci;
create policy sal_voci_update_con_permesso on public.sal_voci
  for update to authenticated
  using (exists (select 1
                   from public.sal_records s
                  where s.id = sal_voci.sal_id
                    and public.puo_modificare_commessa(s.order_id)))
  with check (exists (select 1
                        from public.sal_records s
                       where s.id = sal_voci.sal_id
                         and public.puo_modificare_commessa(s.order_id)));

drop policy if exists sal_voci_delete_con_permesso on public.sal_voci;
create policy sal_voci_delete_con_permesso on public.sal_voci
  for delete to authenticated
  using (exists (select 1
                   from public.sal_records s
                  where s.id = sal_voci.sal_id
                    and public.puo_modificare_commessa(s.order_id)));
