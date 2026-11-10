-- ============================================================================
-- Correzione di 20290213235000 (subappalto_protezioni), stesso giorno.
-- Le due funzioni di trigger erano SECURITY DEFINER: dentro, current_user è
-- sempre il proprietario, quindi il controllo «scrive il browser?»
-- (current_user = authenticated) non scattava mai. Trovato con la prova
-- (contratto firmato riscritto: 1 riga). Ora girano con l'identità di chi
-- scrive: il browser è authenticated; le funzioni del sistema (variante,
-- pagamento, firma), che sono DEFINER, scrivono come proprietario e passano.
-- I controlli di esistenza (SAL, ritenute, fatture) li fa chi elimina, con le
-- sue regole: chi può eliminare un contratto vede i SAL della sua azienda.
-- ============================================================================

set local lock_timeout = '3s';

alter function public.contratto_subappalto_protetto() security invoker;
alter function public.sal_sub_protetto() security invoker;
