-- Il canarino segnala i piani a cui nessuno ha configurato le email incluse.
--
-- `email_monthly_included = NULL` viene letto come "zero incluse": ogni email
-- va a borsellino e, col borsellino a zero, l'invio si blocca. Su un piano da
-- 127 €/mese è una paywall che nessuno ha deciso — è una svista. Oggi succede a
-- "Pro — Offerta Clienti" (2 aziende: Domus Group e Renova), a
-- "Render + Preventivatore Serramenti" (1) e a "Marketing" (1).
--
-- Non si inventa un numero: quanto includere è una decisione di prezzo. Si fa
-- in modo che la svista non resti invisibile finché qualcuno non la decide.
--
-- Inserimento chirurgico prima della sezione oauth_provider_giu (una sola
-- occorrenza dell'ancora, verificato). Dopo l'inserimento la funzione viene
-- ESEGUITA per davvero: se la sintassi fosse rotta il blocco fallisce e la
-- migration non passa.
DO $$
DECLARE
  _def text;
  _ancora text := '''oauth_provider_giu'', COALESCE((';
  _nuova  text := '''piani_email_non_configurati'', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      ''piano'', sp.name, ''prezzo_mensile'', sp.price_monthly, ''aziende'', k.n,
      ''nota'', ''email incluse non configurate: ogni email va a borsellino e con saldo zero l''''invio si blocca''))
    FROM (
      SELECT c.subscription_plan_id AS plan_id, count(*) AS n
      FROM public.companies c
      WHERE c.subscription_plan_id IS NOT NULL
      GROUP BY c.subscription_plan_id
    ) k
    JOIN public.subscription_plans sp ON sp.id = k.plan_id
    WHERE sp.email_monthly_included IS NULL
  ), ''[]''::jsonb),
  ''oauth_provider_giu'', COALESCE((';
  _q jsonb;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'canarino_vitali';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'canarino_vitali non trovata';
  END IF;

  IF position('piani_email_non_configurati' IN _def) > 0 THEN
    RAISE NOTICE 'sezione già presente: nulla da fare';
    RETURN;
  END IF;

  IF position(_ancora IN _def) = 0 THEN
    RAISE EXCEPTION 'ancora oauth_provider_giu non trovata: verificare a mano';
  END IF;

  EXECUTE replace(_def, _ancora, _nuova);

  -- Prova del nove: la funzione deve girare e contenere la sezione nuova.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  _q := public.canarino_vitali();
  IF NOT (_q ? 'piani_email_non_configurati') THEN
    RAISE EXCEPTION 'la sezione non risulta nel risultato della funzione';
  END IF;
END $$;
