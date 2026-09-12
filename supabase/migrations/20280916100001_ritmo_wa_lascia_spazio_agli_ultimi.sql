-- Ritmo campagne WhatsApp: l'attesa non può mangiarsi gli invii che restano.
--
-- Con lo scarto casuale introdotto da 20280916100000 (fra il 55% e il 145% del
-- passo) una giornata sfortunata spingeva il primo messaggio così avanti che il
-- terzo cadeva dopo la chiusura della finestra e saltava. Simulando lunedì e
-- martedì sulle 4 campagne: 4 giornate su 8 finivano con 2 messaggi invece di 3.
--
-- Ora l'attesa si accorcia quanto basta a lasciare, a chi resta, almeno il
-- passo minimo a testa. Il tetto del giorno resta il tetto: questo limite non
-- aggiunge invii, evita solo di perderli per strada.

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

    -- Quanto si può aspettare lasciando il passo minimo a chi resta dopo.
    v_spazio := GREATEST((v_fine_min - v_base_min) - (v_rimanenti - 1) * c_passo_minimo, 0);
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
