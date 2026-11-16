-- Catalogo delle voci del rapportino: stessa regola dei costi (16/11/2026).
-- Il popup «Voci e costi» legge il catalogo e l'impostazione «scrivi a mano», ma le due
-- letture chiedevano can_view_costs (o le impostazioni commesse): chi ha Gestione acquisti
-- apriva il blocco e trovava il catalogo vuoto.
set local lock_timeout = '3s';

alter policy voci_modello_lettura on public.rapportino_voci_modello
  using (public.puo_vedere_costi(company_id)
         or public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id));

alter policy voci_impostazioni_lettura on public.rapportino_voci_impostazioni
  using (public.puo_vedere_costi(company_id)
         or public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id));
