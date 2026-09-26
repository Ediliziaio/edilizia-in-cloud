-- Push del campo: le mandano solo il database e il cron (26/09/2026).
--
-- campo_push_invia(p_user_ids, p_title, p_body, p_url, p_tag) era eseguibile da
-- ogni utente collegato (GRANT della 20280907100100, rimasta fuori dalla lista
-- di 20280926073000_funzioni_interne_solo_al_servizio): chiunque poteva mandare
-- a qualunque utente una notifica con testo e link a scelta, e il service worker
-- apriva quel link senza controllarlo (corretto in public/sw-push-handler.js:
-- ora apre solo indirizzi del sito). La chiamano soltanto tg_campo_notifica_push
-- e tg_campo_chat_push, entrambe SECURITY DEFINER: il permesso agli utenti non
-- serve a nessuno.
--
-- Stessa cosa per campo_promemoria(p_slot): la chiama solo il cron
-- (campo-promemoria-uscita, campo-promemoria-rapportino, campo-digest-ufficio),
-- ma un utente collegato poteva far partire promemoria e riepiloghi a comando.
--
-- Nessuna pagina né edge function le chiama (verificato il 26/09 su src/ e
-- supabase/functions/).

SET LOCAL lock_timeout = '3s';

REVOKE ALL ON FUNCTION public.campo_push_invia(uuid[], text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_promemoria(text) FROM PUBLIC, anon, authenticated;
