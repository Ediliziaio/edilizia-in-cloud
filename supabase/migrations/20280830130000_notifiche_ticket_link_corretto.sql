-- GIÀ APPLICATA sul live il 2026-08-30 via Management API e registrata in
-- supabase_migrations.schema_migrations.
--
-- Le notifiche dell'assistenza puntavano a /azienda/ticket/<id>, una rotta che
-- NON esiste: quella vera è /azienda/assistenza/<id>. Chi cliccava la notifica
-- di un nuovo ticket o di una risposta finiva su una pagina vuota.
-- Qui si correggono i due trigger e le 276 notifiche già in archivio.
--
-- Le definizioni delle funzioni sono state riscritte con lo stesso corpo,
-- cambiando solo il path (vedi pg_get_functiondef al momento dell'intervento).

update notifications
   set action_url = replace(action_url, '/azienda/ticket/', '/azienda/assistenza/')
 where action_url like '/azienda/ticket/%';

-- notify_new_ticket() e notify_ticket_reply(): sostituito
--   '/azienda/ticket/' || NEW.id   →   '/azienda/assistenza/' || NEW.id
