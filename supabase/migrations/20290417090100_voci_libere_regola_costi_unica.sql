-- Le voci libere dei rapportini: stessa regola dei costi anche nelle policy (16/11/2026).
-- Chi gestisce gli acquisti le legge e le scrive, come tutto il resto dei costi.
-- Due statement soli: CREATE POLICY blocca auth finché la transazione non chiude.
set local lock_timeout = '3s';

drop policy if exists voci_libere_lettura on public.rapportino_voci_libere;
create policy voci_libere_lettura on public.rapportino_voci_libere
  for select to authenticated
  using (public.puo_vedere_costi(company_id) and public.puo_vedere_commessa(order_id));

drop policy if exists voci_libere_scrittura on public.rapportino_voci_libere;
create policy voci_libere_scrittura on public.rapportino_voci_libere
  for all to authenticated
  using (public.puo_vedere_costi(company_id)
         and public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id)
         and public.puo_vedere_commessa(order_id))
  with check (public.puo_vedere_costi(company_id)
         and public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id)
         and public.puo_vedere_commessa(order_id));
