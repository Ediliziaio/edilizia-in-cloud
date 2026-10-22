-- Lettura di signature_requests e fea_firmatari: l'amministratore lo è DI QUELLA
-- azienda (e_amministratore_di), lo staff dell'azienda del proprio profilo, il
-- super admin. Le policy del 22/10 controllavano il ruolo company_admin senza
-- dire di quale azienda (vedi amministratoreDiQualeAzienda.test.ts).
drop policy if exists company_staff_signature_requests_lettura on public.signature_requests;
create policy company_staff_signature_requests_lettura on public.signature_requests for select to authenticated
  using (public.e_amministratore_di(company_id)
    or (company_id = (select public.get_my_company_id()) and (select public.has_role(auth.uid(), 'company_staff'::public.app_role)))
    or (select public.has_role(auth.uid(), 'super_admin'::public.app_role)));

drop policy if exists fea_firmatari_lettura on public.fea_firmatari;
create policy fea_firmatari_lettura on public.fea_firmatari for select to authenticated
  using (public.e_amministratore_di(company_id)
    or (company_id = (select public.get_my_company_id()) and (select public.has_role(auth.uid(), 'company_staff'::public.app_role)))
    or (select public.has_role(auth.uid(), 'super_admin'::public.app_role)));
