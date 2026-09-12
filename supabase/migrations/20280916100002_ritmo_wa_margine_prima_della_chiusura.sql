-- Ritmo campagne WhatsApp: un quarto d'ora di margine prima della chiusura.
--
-- Col limite introdotto da 20280916100001 l'ultimo messaggio della giornata
-- veniva spinto fino al minuto esatto di chiusura: nella simulazione su tre
-- giorni, 4 volte su 12 usciva alle 19:00 in punto. Un orario sempre identico
-- è di nuovo un'impronta, ed è anche il minuto in cui la finestra si chiude:
-- basta un giro di cron in ritardo e il messaggio si perde.
--
-- Ora si tengono 15 minuti di margine: l'ultimo invio cade al più tardi alle
-- 18:45 (o un quarto d'ora prima della chiusura configurata).

CREATE OR REPLACE FUNCTION public.openwa_campagna_conta_invio(p_campagna_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ora_locale timestamp := (now() AT TIME ZONE 'Europe/Rome');
  v_oggi       date      := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_adesso_min integer   := extract(hour FROM (now() AT TIME ZONE 'Europe/Rome'))::int * 60
                          + extract(minute FROM (now() AT TIME ZONE 'Europe/Rome'))::int;
  c_passo_minimo constant integer := 20;
  c_margine      constant integer := 15;
  c            record;
  v_inviati    integer;
  v_rimanenti  integer;
  v_inizio_min integer;
  v_fine_min   integer;
  v_base_min   integer;
  v_passo      numeric;
  v_attesa     numeric;
  v_spazio     numeric;
BEGIN
  SELECT * INTO c FROM public.openwa_campagne WHERE id = p_campagna_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_inviati := CASE WHEN c.inviati_oggi_data = v_oggi THEN COALESCE(c.inviati_oggi, 0) ELSE 0 END;

  -- Tetto del giorno.
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

    -- Quanto si può aspettare lasciando il passo minimo a chi resta dopo,
    -- più un margine prima della chiusura.
    v_spazio := GREATEST((v_fine_min - v_base_min) - (v_rimanenti - 1) * c_passo_minimo - c_margine, 0);
    v_attesa := LEAST(v_attesa, v_spazio);

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

REVOKE ALL ON FUNCTION public.openwa_campagna_conta_invio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.openwa_campagna_conta_invio(uuid) TO service_role;
