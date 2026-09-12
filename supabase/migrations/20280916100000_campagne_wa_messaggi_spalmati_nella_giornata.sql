-- Campagne WhatsApp Locale: i messaggi del giorno si spalmano sulla finestra.
--
-- Il 12/09/2026 i 4 numeri hanno mandato 12 messaggi in meno di due ore —
-- Flo 3 alle 09:37/09:50/10:00, Flo 1 alle 10:10/10:20/10:30, Flo 2 alle
-- 10:40/10:50/11:00, Iphone alle 11:10/11:20/11:30 — e poi silenzio per il
-- resto della giornata. Nessuno era in errore: semplicemente nessuno decideva
-- QUANDO mandare. Il dispatcher gira ogni 10 minuti e spinge finché trova
-- capienza; l'unico freno per numero è `min_gap_seconds` (240 s), più corto
-- del giro di cron, quindi inefficace. Risultato: la quota del giorno finiva
-- in venti minuti, sempre a ridosso dell'apertura della finestra, e sempre
-- agli stessi minuti tondi. È esattamente l'impronta che fa sospendere un
-- numero su WhatsApp non ufficiale.
--
-- Qui il ritmo entra dove il tetto era già contato in modo atomico, prima
-- dell'invio: `openwa_campagna_conta_invio` ora dice «non ancora» finché non
-- è passato il passo giusto.
--
--   passo = (fine finestra di oggi − ultimo invio) / messaggi che restano
--
-- con uno scarto casuale fra il 55% e il 145% del passo, così gli orari non
-- sono mai gli stessi due giorni di fila. Lo scarto è pseudo-casuale ma
-- STABILE per (campagna, giorno, progressivo): entro lo stesso giro di cron
-- la risposta non cambia, e due campagne diverse non si muovono insieme —
-- prima partivano una dietro l'altra come un trenino.
--
-- Il primo messaggio del giorno conta dall'apertura della finestra, quindi
-- non parte più al primo giro utile: con 3 al giorno e finestra 7:30-19:00
-- cade fra le 10 e le 13, diverso per ogni numero.
--
-- Fra due messaggi della stessa campagna restano comunque almeno 20 minuti:
-- a fine giornata il passo si accorcerebbe da solo e tornerebbe la raffica.
-- Se la finestra finisce prima della quota, i messaggi che restano vanno
-- semplicemente al giorno dopo: meglio 2 invii che un numero bruciato.
--
-- La finestra è quella già configurata: `orario_da`/`orario_a` della campagna
-- se ci sono, altrimenti `openwa_quiet_start`/`openwa_quiet_end`, con il
-- sabato accorciato da `openwa_sabato_fino` (oggi 13:30). Nessun orario nuovo
-- da impostare.

ALTER TABLE public.openwa_campagne
  ADD COLUMN IF NOT EXISTS ultimo_invio_at timestamptz;

COMMENT ON COLUMN public.openwa_campagne.ultimo_invio_at IS
  'Quando questa campagna ha ottenuto l''ultimo via libera all''invio: è la base da cui si conta il passo del ritmo.';

-- «7:30» → 450. Serve a leggere gli orari scritti a mano in platform_settings.
CREATE OR REPLACE FUNCTION public.openwa_ora_in_minuti(p_testo text, p_default integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_testo IS NULL THEN p_default
    WHEN replace(btrim(p_testo), ' ', '') ~ '^\d{1,2}:\d{1,2}$'
      THEN LEAST(24 * 60,
             split_part(replace(btrim(p_testo), ' ', ''), ':', 1)::int * 60
           + split_part(replace(btrim(p_testo), ' ', ''), ':', 2)::int)
    WHEN replace(btrim(p_testo), ' ', '') ~ '^\d{1,2}$'
      THEN LEAST(24 * 60, replace(btrim(p_testo), ' ', '')::int * 60)
    ELSE p_default
  END;
$function$;

REVOKE ALL ON FUNCTION public.openwa_ora_in_minuti(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.openwa_ora_in_minuti(text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.openwa_campagna_conta_invio(p_campagna_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ora_locale timestamp := (now() AT TIME ZONE 'Europe/Rome');
  v_oggi       date      := v_ora_locale::date;
  v_adesso_min integer   := extract(hour FROM v_ora_locale)::int * 60
                          + extract(minute FROM v_ora_locale)::int;
  -- Passo minimo fra due messaggi della stessa campagna.
  c_passo_minimo constant integer := 20;
  c            record;
  v_inviati    integer;
  v_rimanenti  integer;
  v_inizio_min integer;
  v_fine_min   integer;
  v_base_min   integer;
  v_passo      numeric;
  v_attesa     numeric;
BEGIN
  SELECT * INTO c FROM public.openwa_campagne WHERE id = p_campagna_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_inviati := CASE WHEN c.inviati_oggi_data = v_oggi THEN COALESCE(c.inviati_oggi, 0) ELSE 0 END;

  -- Tetto del giorno, come prima.
  IF c.max_al_giorno IS NOT NULL AND v_inviati >= c.max_al_giorno THEN
    RETURN false;
  END IF;

  -- Ritmo: solo dove c'è un tetto, perché è quello che dice quanti messaggi
  -- vanno distribuiti. Senza tetto restano i cap dei numeri, come prima.
  IF c.max_al_giorno IS NOT NULL THEN
    v_inizio_min := COALESCE(
      c.orario_da * 60,
      public.openwa_ora_in_minuti(
        (SELECT value FROM public.platform_settings WHERE key = 'openwa_quiet_start'), 8 * 60));
    v_fine_min := COALESCE(
      c.orario_a * 60,
      public.openwa_ora_in_minuti(
        (SELECT value FROM public.platform_settings WHERE key = 'openwa_quiet_end'), 20 * 60));

    -- Sabato accorciato, se non è stato aperto tutto il weekend.
    IF extract(isodow FROM v_ora_locale)::int = 6
       AND lower(COALESCE((SELECT value FROM public.platform_settings
                            WHERE key = 'openwa_invia_weekend'), 'false')) <> 'true' THEN
      v_fine_min := LEAST(v_fine_min, public.openwa_ora_in_minuti(
        (SELECT value FROM public.platform_settings WHERE key = 'openwa_sabato_fino'), v_fine_min));
    END IF;

    v_rimanenti := GREATEST(c.max_al_giorno - v_inviati, 1);

    -- Si conta dall'ultimo invio di oggi; se non ce n'è, dall'apertura della
    -- finestra (così il primo messaggio non parte al primo giro utile).
    v_base_min := CASE
      WHEN c.ultimo_invio_at IS NOT NULL
       AND (c.ultimo_invio_at AT TIME ZONE 'Europe/Rome')::date = v_oggi
      THEN extract(hour FROM (c.ultimo_invio_at AT TIME ZONE 'Europe/Rome'))::int * 60
         + extract(minute FROM (c.ultimo_invio_at AT TIME ZONE 'Europe/Rome'))::int
      ELSE v_inizio_min
    END;

    v_passo := GREATEST((v_fine_min - v_base_min)::numeric / v_rimanenti, c_passo_minimo);

    -- Scarto fra 0,55 e 1,45 del passo: stabile dentro lo stesso giorno e
    -- progressivo, diverso per ogni campagna.
    v_attesa := v_passo * (0.55 + 0.9 *
      abs(hashtext(p_campagna_id::text || v_oggi::text || v_inviati::text) % 1000)::numeric / 1000);

    IF v_adesso_min < v_base_min + v_attesa THEN
      RETURN false;  -- troppo presto: si riprova al giro dopo
    END IF;
  END IF;

  UPDATE public.openwa_campagne
     SET inviati_oggi = v_inviati + 1,
         inviati_oggi_data = v_oggi,
         ultimo_invio_at = now()
   WHERE id = p_campagna_id;

  RETURN true;
END;
$function$;

-- Quando l'invio NON è avvenuto (pool esaurito, opt-out, gateway giù) il
-- contatore torna indietro: allora anche il ritmo deve tornare indietro,
-- altrimenti un tentativo a vuoto costerebbe un turno di silenzio.
CREATE OR REPLACE FUNCTION public.openwa_campagna_scala_invio(p_campagna_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.openwa_campagne
     SET inviati_oggi = GREATEST(0, inviati_oggi - 1),
         ultimo_invio_at = NULL
   WHERE id = p_campagna_id
     AND inviati_oggi_data = (now() AT TIME ZONE 'Europe/Rome')::date;
$function$;

REVOKE ALL ON FUNCTION public.openwa_campagna_conta_invio(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.openwa_campagna_scala_invio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.openwa_campagna_conta_invio(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.openwa_campagna_scala_invio(uuid) TO service_role;
