-- Planimetrie: l'azienda è quella scelta, come per commesse e preventivi (24/11/2026).
--
-- Le regole di planimetrie, planimetrie_versioni e planimetrie_file guardavano l'azienda del
-- profilo (`profiles.company_id`). Per chi lavora in una sola azienda è lo stesso; il superadmin
-- che «sta visualizzando» un'azienda e chi ha l'accesso a più aziende non vedevano le piante
-- dell'azienda scelta («Pianta non trovata»), mentre ne vedevano commesse e preventivi.
-- Ora valgono `get_my_company_id()` → `get_effective_company_id()`, la stessa funzione delle
-- commesse: scheda del browser (x-azienda-scheda) se l'utente ne ha diritto, impersonazione
-- del superadmin, azienda attiva, azienda del profilo. Il resto delle condizioni non cambia.
--
-- Breve e con lock_timeout: CREATE/ALTER POLICY tiene bloccato auth finché non finisce
-- (memoria feedback-policy-bloccano-auth-supautils).
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter policy planimetrie_legge on public.planimetrie
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()));
alter policy planimetrie_crea on public.planimetrie
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
    and not public.utente_sola_lettura(company_id) and created_by = (select auth.uid()));
alter policy planimetrie_modifica on public.planimetrie
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()) and not public.utente_sola_lettura(company_id))
  with check (company_id = (select public.get_my_company_id()));
alter policy planimetrie_toglie on public.planimetrie
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()) and not public.utente_sola_lettura(company_id));

alter policy planimetrie_versioni_legge on public.planimetrie_versioni
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()));
alter policy planimetrie_versioni_aggiunge on public.planimetrie_versioni
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
    and not public.utente_sola_lettura(company_id) and created_by = (select auth.uid()));

alter policy planimetrie_file_legge on public.planimetrie_file
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()));
alter policy planimetrie_file_aggiunge on public.planimetrie_file
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
    and not public.utente_sola_lettura(company_id) and created_by = (select auth.uid()));
alter policy planimetrie_file_toglie on public.planimetrie_file
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()) and not public.utente_sola_lettura(company_id));
