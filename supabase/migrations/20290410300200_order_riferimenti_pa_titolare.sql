-- La regola del titolare su order_riferimenti_pa (20290410300000) era scritta con
-- has_role('company_admin') + azienda dell'utente: il guardiano amministratoreDiQualeAzienda
-- chiede di dire di quale azienda si è amministratori. Stessa regola con e_amministratore_di.
-- Il file 20290410300000 è stato corretto allo stesso modo: questa la porta sul database.
drop policy if exists order_riferimenti_pa_admin on public.order_riferimenti_pa;
create policy order_riferimenti_pa_admin on public.order_riferimenti_pa
  for all to authenticated
  using ((select public.e_amministratore_di(company_id)))
  with check ((select public.e_amministratore_di(public.get_order_company_id(order_id))));
