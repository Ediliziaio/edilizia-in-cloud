-- Quando l'ufficio pubblica la giornata, l'assistenza messa in programma
-- deve arrivare a chi ci va.
--
-- Il buco: `programmazione_pubblica` scriveva gli accessi al cantiere
-- (order_campo_assignments) e le notifiche, ma non toccava il ticket. L'app
-- dell'operaio mostra gli interventi con `campo_miei_interventi`, che legge i
-- ticket dove `assigned_to` è l'operaio (o la sua squadra) e
-- `data_intervento_prevista` cade nei giorni richiesti. Quindi una
-- manutenzione spostata o riassegnata in Programmazione restava invisibile a
-- chi doveva farla, e senza intervento aperto non c'era niente da chiudere con
-- foto, firma e rapportino.
--
-- Perché un trigger e non una riga dentro `programmazione_pubblica`:
-- riscrivere quella funzione (oltre cento righe, con stringhe delicate) per
-- aggiungerci un pezzo è un rischio inutile. Il trigger si attacca al momento
-- esatto in cui la giornata diventa pubblicata, e copre anche eventuali altre
-- strade che la pubblicano.
--
-- Che cosa NON fa, di proposito:
--  - non crea ticket: una riga scritta a mano in Programmazione non ha un
--    ticket dietro (`fonte_id` vuoto) e resta com'è;
--  - non svuota niente: se in Programmazione non c'è nessuna persona, il
--    tecnico già sul ticket resta quello di prima;
--  - non tocca gli interventi già risolti, chiusi o annullati.

CREATE OR REPLACE FUNCTION public.programmazione_scrive_sul_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Chi va su quell'intervento: prima il capo, se ha un account; altrimenti la
  -- prima persona della squadra. Un ticket messo due volte nella stessa
  -- giornata si prende la riga che ha qualcuno.
  WITH scelte AS (
    SELECT DISTINCT ON (i.fonte_id)
           i.fonte_id AS ticket_id,
           coalesce(hc.user_id, hp.user_id) AS user_id,
           i.inizio
      FROM public.programmazione_interventi i
      LEFT JOIN public.hr_profili hc
             ON hc.id = i.capo_hr_profilo_id AND hc.user_id IS NOT NULL
      LEFT JOIN LATERAL (
             SELECT h.user_id
               FROM public.programmazione_persone p
               JOIN public.hr_profili h ON h.id = p.hr_profilo_id AND h.user_id IS NOT NULL
              WHERE p.intervento_id = i.id
              ORDER BY p.posizione, h.id
              LIMIT 1
           ) hp ON true
     WHERE i.giornata_id = NEW.id
       AND i.tipo = 'manutenzione'
       AND i.fonte_id IS NOT NULL
     ORDER BY i.fonte_id, (coalesce(hc.user_id, hp.user_id) IS NULL), i.posizione
  )
  UPDATE public.tickets t
     SET assigned_to = coalesce(s.user_id, t.assigned_to),
         data_intervento_prevista = coalesce(
           -- l'ora decisa in Programmazione
           CASE WHEN s.inizio IS NOT NULL
                THEN (NEW.giorno + s.inizio) AT TIME ZONE 'Europe/Rome' END,
           -- nessun orario: si sposta il giorno e si tiene l'ora che c'era
           CASE WHEN t.data_intervento_prevista IS NOT NULL
                THEN (NEW.giorno + (t.data_intervento_prevista AT TIME ZONE 'Europe/Rome')::time) AT TIME ZONE 'Europe/Rome' END,
           (NEW.giorno::timestamp) AT TIME ZONE 'Europe/Rome'
         ),
         updated_at = now()
    FROM scelte s
   WHERE t.id = s.ticket_id
     AND t.company_id = NEW.company_id
     AND coalesce(t.status::text, '') NOT IN ('risolto', 'chiuso', 'annullato', 'preventivo_rifiutato');

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.programmazione_scrive_sul_ticket() IS
  'Pubblicata la giornata, porta tecnico e data prevista sul ticket collegato (programmazione_interventi.fonte_id), così l''intervento compare nell''app di chi ci va.';

DROP TRIGGER IF EXISTS trg_programmazione_scrive_sul_ticket ON public.programmazione_giornate;
CREATE TRIGGER trg_programmazione_scrive_sul_ticket
  AFTER UPDATE OF stato, pubblicata_at ON public.programmazione_giornate
  FOR EACH ROW
  WHEN (NEW.stato = 'pubblicata' AND NEW.pubblicata_at IS DISTINCT FROM OLD.pubblicata_at)
  EXECUTE FUNCTION public.programmazione_scrive_sul_ticket();

NOTIFY pgrst, 'reload schema';
