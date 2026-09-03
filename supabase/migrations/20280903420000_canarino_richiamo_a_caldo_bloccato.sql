-- Il richiamo a caldo può restare fermo per due motivi banali: manca l'agente
-- vocale, o l'agente non ha un numero. In entrambi i casi non succede NIENTE e
-- nessuno se ne accorge — è esattamente il modo in cui questa piattaforma ha
-- già perso mesi di solleciti e di campagne email.
--
-- Qui si segnala solo quando c'è davvero qualcosa da perdere: lead recenti, che
-- hanno dato il consenso a essere richiamati, in un'azienda senza un agente
-- pronto. Nessun lead in attesa, nessun allarme.
--
-- La funzione si estende invece di riscriverla: `canarino_vitali` è lunga e
-- riprodurla per intero è il modo migliore per perdere un pezzo per strada.
DO $migr$
DECLARE
  def text;
  vecchio text;
  nuovo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'canarino_vitali';

  IF def IS NULL THEN
    RAISE EXCEPTION 'canarino_vitali non trovata';
  END IF;

  vecchio := 'FROM company_auto_topup t JOIN companies c ON c.id=t.company_id WHERE t.retries_exhausted_at IS NOT NULL
  ), ''[]''::jsonb)
);';

  IF position(vecchio in def) = 0 THEN
    RAISE EXCEPTION 'ancoraggio non trovato in canarino_vitali: la funzione e'' cambiata, rivedere la migration';
  END IF;

  nuovo := 'FROM company_auto_topup t JOIN companies c ON c.id=t.company_id WHERE t.retries_exhausted_at IS NOT NULL
  ), ''[]''::jsonb),
  ''richiamo_caldo_bloccato'', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      ''azienda'', c.name,
      ''lead_che_aspettano'', k.n,
      ''manca'', CASE
        WHEN NOT EXISTS (SELECT 1 FROM ai_agents_v2 a WHERE a.company_id = c.id AND a.stato = ''attivo'' AND a.elevenlabs_agent_id IS NOT NULL)
          THEN ''agente vocale da creare''
        ELSE ''numero di telefono da collegare all''''agente'' END))
    FROM (
      SELECT o.company_id, count(*) AS n
      FROM marketing_opportunities o
      JOIN marketing_contacts mc ON mc.id = o.contact_id
      WHERE o.status IN (''open'', ''new'')
        AND o.deleted_at IS NULL
        AND o.created_at > now() - interval ''7 days''
        AND mc.marketing_consent IS TRUE
        AND mc.optout_call IS NOT TRUE
        AND length(regexp_replace(coalesce(mc.phone, ''''), ''\s'', '''', ''g'')) >= 9
      GROUP BY o.company_id
    ) k
    JOIN companies c ON c.id = k.company_id
    WHERE NOT EXISTS (
      SELECT 1 FROM ai_agents_v2 a
      JOIN ai_phone_numbers_v2 pn ON pn.agent_id = a.id AND pn.company_id = a.company_id
      WHERE a.company_id = c.id AND a.stato = ''attivo'' AND a.elevenlabs_agent_id IS NOT NULL
    )
  ), ''[]''::jsonb)
);';

  EXECUTE replace(def, vecchio, nuovo);
END
$migr$;

-- I permessi si perdono con CREATE OR REPLACE: si rimettono come stavano.
REVOKE ALL ON FUNCTION public.canarino_vitali() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canarino_vitali() TO service_role;
