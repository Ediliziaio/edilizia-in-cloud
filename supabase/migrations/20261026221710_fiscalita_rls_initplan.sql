-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

-- Evaluate session-wide authorization once per statement; keep company checks correlated.
alter policy fiscalita_periodi_admin on public.fiscalita_periodi
 using(not (select public.utente_bloccato()) and (public.e_amministratore_di(company_id) or (select public.has_role(auth.uid(),'super_admin'::public.app_role))))
 with check(not (select public.utente_bloccato()) and not public.utente_sola_lettura(company_id) and (public.e_amministratore_di(company_id) or (select public.has_role(auth.uid(),'super_admin'::public.app_role))));
alter policy fiscalita_storico_admin on public.fiscalita_storico
 using(not (select public.utente_bloccato()) and (public.e_amministratore_di(company_id) or (select public.has_role(auth.uid(),'super_admin'::public.app_role))));
