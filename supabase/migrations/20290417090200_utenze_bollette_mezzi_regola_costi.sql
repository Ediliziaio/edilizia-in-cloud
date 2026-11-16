-- Utenze, bollette e costi dei mezzi: stessa regola dei costi (16/11/2026).
-- La pagina /costi si apre con canViewCosts (Costi OPPURE Gestione acquisti), ma queste
-- letture chiedevano il solo can_view_costs: all'Impresa Vulcano le schede Utenze e
-- Bollette erano vuote e i costi dei mezzi nei rapportini non si vedevano, senza un errore.
-- Si cambia la sola espressione delle regole esistenti (ALTER), senza rifarle.
set local lock_timeout = '3s';

alter policy utenze_lettura on public.utenze
  using ((select public.user_can_access_company(company_id)) and public.puo_vedere_costi(company_id));

alter policy utenze_destinazioni_lettura on public.utenze_destinazioni
  using ((select public.user_can_access_company(company_id)) and public.puo_vedere_costi(company_id));

alter policy bollette_lettura on public.bollette
  using ((select public.user_can_access_company(company_id)) and public.puo_vedere_costi(company_id));

alter policy bollette_righe_lettura on public.bollette_righe
  using ((select public.user_can_access_company(company_id)) and public.puo_vedere_costi(company_id));

alter policy rapportino_mezzi_costi_lettura on public.rapportino_mezzi_costi
  using (public.puo_vedere_costi(company_id));
