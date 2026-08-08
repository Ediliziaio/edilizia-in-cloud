-- ============================================================================
-- Diario commessa: eventi di collegamento/scollegamento OdA — GIÀ APPLICATA
-- sul live (08/08/2026 via Management API).
-- ============================================================================
-- I due call-site (LinkedPurchaseOrdersCard, LinkExistingPurchaseOrderDialog)
-- inserivano event_type 'ordine_fornitore_collegato'/'..._scollegato' che
-- NON esistevano nell'enum order_event_type: ogni insert falliva con
-- "invalid input value for enum", inghiottito da un `void` senza await.
-- Il diario non ha mai registrato un collegamento OdA.

alter type public.order_event_type add value if not exists 'ordine_fornitore_collegato';
alter type public.order_event_type add value if not exists 'ordine_fornitore_scollegato';
