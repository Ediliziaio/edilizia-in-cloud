-- Prenotazioni (vedi 20281021170000): anche gli appuntamenti su un ALTRO
-- calendario della stessa persona tolgono l'orario. Prima si escludevano
-- tutti quelli dei calendari del titolare, e chi ha due calendari poteva
-- essere prenotato due volte alla stessa ora. Quelli del calendario aperto la
-- pagina li conta già: contarli due volte non cambia gli orari liberi.
-- La vista la legge solo la pagina /prenota, che non fa spostamenti.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE VIEW public.public_calendar_busy_slots AS
 WITH titolari AS (
         SELECT DISTINCT mc.owner_id AS user_id
           FROM marketing_calendars mc
          WHERE ((mc.owner_id IS NOT NULL) AND (mc.booking_slug IS NOT NULL) AND (mc.is_active = true))
        ), blocca AS (
         SELECT t.user_id
           FROM (titolari t
             LEFT JOIN public_calendar_owner_prefs p ON ((p.user_id = t.user_id)))
          WHERE (COALESCE(p.block_busy_slots, true) = true)
        )
 SELECT 'google'::text AS provider,
    b.user_id,
    b.start_at,
    b.end_at,
    b.is_all_day
   FROM (google_calendar_busy_slots b
     JOIN blocca ON ((blocca.user_id = b.user_id)))
UNION ALL
 SELECT 'outlook'::text AS provider,
    b.user_id,
    b.start_at,
    b.end_at,
    b.is_all_day
   FROM (outlook_calendar_busy_slots b
     JOIN blocca ON ((blocca.user_id = b.user_id)))
UNION ALL
 SELECT 'apple'::text AS provider,
    b.user_id,
    b.start_at,
    b.end_at,
    b.is_all_day
   FROM (apple_calendar_busy_slots b
     JOIN blocca ON ((blocca.user_id = b.user_id)))
UNION ALL
 -- Impegni interni: sempre, compresi gli appuntamenti su un altro calendario
 -- della stessa persona. Quelli di questo calendario la pagina li conta già:
 -- contarli due volte non cambia quali orari restano liberi.
 SELECT 'interno'::text AS provider,
    i.user_id,
    i.start_at,
    i.end_at,
    (i.fonte = 'cantiere') AS is_all_day
   FROM (impegni_interni_persona i
     JOIN titolari t ON ((t.user_id = i.user_id)));
