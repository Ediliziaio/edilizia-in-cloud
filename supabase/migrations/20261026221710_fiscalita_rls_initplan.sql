-- Evaluate session-wide authorization once per statement; keep company checks correlated.
alter policy fiscalita_periodi_admin on public.fiscalita_periodi
 using(not (select public.utente_bloccato()) and (public.e_amministratore_di(company_id) or (select public.has_role(auth.uid(),'super_admin'::public.app_role))))
 with check(not (select public.utente_bloccato()) and not public.utente_sola_lettura(company_id) and (public.e_amministratore_di(company_id) or (select public.has_role(auth.uid(),'super_admin'::public.app_role))));
alter policy fiscalita_storico_admin on public.fiscalita_storico
 using(not (select public.utente_bloccato()) and (public.e_amministratore_di(company_id) or (select public.has_role(auth.uid(),'super_admin'::public.app_role))));
