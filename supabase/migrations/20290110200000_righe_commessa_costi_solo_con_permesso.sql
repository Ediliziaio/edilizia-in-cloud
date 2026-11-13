-- Explicit transaction required by the LOCK TABLE statements below.
BEGIN;
-- Costi delle righe commessa: la lettura diretta solo a chi ha il permesso (08/11/2026).
--
-- Va applicata DOPO il client che legge `order_items_senza_prezzi` (commit 5a5ee4f62).
-- Vale solo per il personale d'ufficio senza `can_view_costs` né `can_manage_purchasing`
-- (`utente_senza_costi_ufficio`, una volta per query): cantiere e portale non cambiano.
-- Come per gli acquisti, guarda solo le GET dirette: funzioni e scritture restano come prima.
--
-- Nessuna riga viene scritta. CREATE POLICY blocca auth finché la transazione è aperta: va breve.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

lock table public.order_items in access exclusive mode;

drop policy if exists costi_solo_con_permesso on public.order_items;
create policy costi_solo_con_permesso on public.order_items as restrictive for select to authenticated
  using (coalesce((select public.acquisti_lettura_non_diretta()), false) or not coalesce((select public.utente_senza_costi_ufficio()), false));

COMMIT;
