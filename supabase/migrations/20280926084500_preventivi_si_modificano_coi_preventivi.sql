-- Preventivi, righe e venditori: si modificano col permesso dei Preventivi.
--
-- Trovato il 26/09/2026 nell'audit dei permessi:
--   - quotes aveva ancora q_ins e q_upd, le regole di quando i preventivi
--     stavano sotto le Commesse: chi modificava le commesse (21 persone senza i
--     Preventivi) creava e cambiava preventivi. q_ins_preventivi e
--     q_upd_preventivi coprono già amministratori e chi ha «Preventivi»; le
--     pagine che li scrivono chiedono canEditPreventivi. La LETTURA (q_sel)
--     resta: serve a «Crea commessa → importa preventivo»;
--   - quote_items (le righe, cioè i prezzi) si inserivano, modificavano e
--     cancellavano col solo controllo dell'azienda: chiunque interno cambiava
--     le righe di qualsiasi preventivo. Ora si leggono se si vede il
--     preventivo e si scrivono se lo si può modificare, come fa già
--     save_quote_items_atomic (che prima di toccare le righe prova un UPDATE
--     sul preventivo);
--   - quote_salespeople (chi prende la provvigione sul preventivo) era FOR ALL
--     per ogni membro. La scrive solo compute_quote_commission (SECURITY
--     DEFINER): ora si legge e basta.

set local lock_timeout = '3s';

-- 1. quotes: via le regole vecchie delle Commesse ------------------------------------
drop policy if exists q_ins on public.quotes;
drop policy if exists q_upd on public.quotes;

-- 2. quote_items -------------------------------------------------------------------
drop policy if exists qi_sel on public.quote_items;
create policy qi_sel on public.quote_items
  for select to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and exists (select 1 from public.quotes q where q.id = quote_items.quote_id));

drop policy if exists qi_ins on public.quote_items;
create policy qi_ins on public.quote_items
  for insert to authenticated
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
              and exists (select 1 from public.quotes q
                           where q.id = quote_items.quote_id
                             and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
                                  or q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
                             and public.check_staff_visibility((select auth.uid()), q.assigned_to)));

drop policy if exists qi_upd on public.quote_items;
create policy qi_upd on public.quote_items
  for update to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and exists (select 1 from public.quotes q
                      where q.id = quote_items.quote_id
                        and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
                             or q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
                        and public.check_staff_visibility((select auth.uid()), q.assigned_to)))
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and exists (select 1 from public.quotes q
                      where q.id = quote_items.quote_id
                        and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
                             or q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
                        and public.check_staff_visibility((select auth.uid()), q.assigned_to)));

drop policy if exists qi_del on public.quote_items;
create policy qi_del on public.quote_items
  for delete to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and exists (select 1 from public.quotes q
                      where q.id = quote_items.quote_id
                        and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
                             or q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
                        and public.check_staff_visibility((select auth.uid()), q.assigned_to)));

-- 3. quote_salespeople: la scrive la funzione delle provvigioni ---------------------
drop policy if exists quote_salespeople_company_access on public.quote_salespeople;
drop policy if exists quote_salespeople_lettura on public.quote_salespeople;
create policy quote_salespeople_lettura on public.quote_salespeople
  for select to authenticated
  using (public.user_can_access_company(company_id) and not (select public.utente_e_cliente_esterno()));
