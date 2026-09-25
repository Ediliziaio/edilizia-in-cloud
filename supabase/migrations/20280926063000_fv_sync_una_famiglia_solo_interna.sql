-- fv_sync_one_family(uuid) ricalcola i componenti del Fotovoltaico di un
-- prodotto del listino. La chiamano solo funzioni SECURITY DEFINER, che girano
-- col proprietario: i trigger trg_fv_sync_family (article_families) e
-- trg_fv_sync_macro (listino_macrocategorie) e fv_sync_listino_macro. Era però
-- eseguibile da ogni utente autenticato, per qualsiasi prodotto, anche di
-- un'altra azienda. Dall'app non la chiama nessuno.
--
-- Trovato il 26/09/2026 nell'audit dei permessi. Provato in una transazione
-- annullata: prima uno staff di un'altra azienda la eseguiva su un prodotto non
-- suo, dopo riceve 42501; chi ha il permesso del listino salva i prodotti come
-- prima (il trigger la chiama ancora).

set local lock_timeout = '3s';

revoke all on function public.fv_sync_one_family(uuid) from public, anon, authenticated;
grant execute on function public.fv_sync_one_family(uuid) to service_role;
