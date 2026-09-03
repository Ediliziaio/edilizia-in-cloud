-- La sezione "lead che hanno detto sì e nessuno li richiama" deve tacere quando
-- il richiamo a caldo è spento di proposito: un allarme quotidiano su una
-- funzione deliberatamente disattivata è rumore, e il rumore è il modo più
-- veloce per far ignorare anche gli allarmi veri.
-- Con l'interruttore acceso e i lead che aspettano, invece, deve gridare.
DO $migr$
DECLARE
  def text;
  vecchio text;
  nuovo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'canarino_vitali';

  vecchio := '      WHERE a.company_id = c.id AND a.stato = ''attivo'' AND a.elevenlabs_agent_id IS NOT NULL
    )
  ), ''[]''::jsonb)
);';

  IF position(vecchio in def) = 0 THEN
    RAISE EXCEPTION 'ancoraggio non trovato: la funzione e'' cambiata, rivedere la migration';
  END IF;

  nuovo := '      WHERE a.company_id = c.id AND a.stato = ''attivo'' AND a.elevenlabs_agent_id IS NOT NULL
    )
    AND COALESCE((SELECT lower(trim(ps.value)) FROM platform_settings ps WHERE ps.key = ''richiamo_a_caldo_attivo''), ''false'') = ''true''
  ), ''[]''::jsonb)
);';

  EXECUTE replace(def, vecchio, nuovo);
END
$migr$;

REVOKE ALL ON FUNCTION public.canarino_vitali() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canarino_vitali() TO service_role;
