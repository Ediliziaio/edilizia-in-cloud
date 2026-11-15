-- oda_copertura_righe(uuid) era eseguibile da anon (v_funzioni_aperte_ad_anon: NON CLASSIFICATA, 15/11/2026).
-- Senza utente il filtro «auth.uid() is null» la tratta come il servizio: restituiva quantità e valori
-- degli ordini d'acquisto di qualsiasi azienda a chiunque conoscesse l'id di una commessa.
-- Nata in 20281027160200_vista_marginalita_per_commessa; la versione senza argomenti era già chiusa.
revoke all on function public.oda_copertura_righe(uuid) from public, anon;
grant execute on function public.oda_copertura_righe(uuid) to authenticated, service_role;
