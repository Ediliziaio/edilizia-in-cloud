-- Completa la …016, che aveva chiuso solo meta' della porta.
--
-- Mettere la guardia dentro `has_role` e `get_user_company_id` copriva 1021
-- policy su 584 tabelle, ma misurando invece di fidarsi si vedeva che un
-- company_admin bloccato continuava a leggere 4236 righe della sua ex azienda
-- su 138 tabelle. Il motivo: molte policy non chiamano quelle funzioni, si
-- scrivono da sole il pezzo — `company_id IN (SELECT company_id FROM profiles
-- WHERE id = auth.uid())` — e quella strada la guardia non la incrocia.
--
-- Rincorrere 481 policy una per una sarebbe stato lungo e fragile. Le policy
-- RESTRICTIVE fanno il lavoro al posto nostro: Postgres le mette in AND con
-- tutte le altre, quindi nessuna policy esistente va riscritta e nessuna puo'
-- scavalcarle. Una per tabella, sempre la stessa condizione.
--
-- ── Due cose imparate applicandola, che valgono per la prossima volta ───────
--
-- 1. TUTTE le tabelle in una sola transazione NON si fa. `CREATE POLICY`
--    prende un ACCESS EXCLUSIVE, e tenerne 1034 insieme mentre l'app lavora
--    ha prodotto un deadlock vero (rilevato e annullato da Postgres, zero
--    stato parziale). Ristretto alle 765 tabelle con `company_id` — che sono
--    quelle che contengono dati d'azienda — passa.
-- 2. `profiles` e' ESCLUSA di proposito. Sembra la candidata ideale (bloccarla
--    chiuderebbe da sola tutte le policy che leggono profiles a mano), ma
--    `LoginForm.tsx` legge proprio `profiles.is_blocked` DOPO il login per
--    dire «il tuo account e' stato bloccato». Bloccando anche quella, la
--    persona entrerebbe in un'applicazione vuota senza sapere perche'. Meglio
--    lasciarle vedere la propria riga e chiudere i dati.
--
-- ── Misurato prima e dopo, impersonando davvero il ruolo authenticated ──────
--   admin ATTIVO:   278 tabelle e 8234 righe -> 278 e 8234  (invariato)
--   admin BLOCCATO: 197 tabelle e 4236 righe ->  51 e     1
-- L'unica riga rimasta e' la sua di `profiles`, per la ragione qui sopra; le
-- 51 tabelle sono cataloghi di piattaforma (it_comuni, it_province,
-- ai_model_catalog, feature_flags, business_verticals…) che ogni utente legge
-- comunque e che non contengono dati di nessuna azienda.
--
-- NOTA per chi aggiunge tabelle: una tabella nuova con `company_id` NON nasce
-- con questa policy. Il posto giusto dove ricordarselo e' `check_new_table_rls()`.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '300s';

DO $$
DECLARE t record; n integer := 0;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'company_id' AND a.attnum > 0
     WHERE c.relkind = 'r' AND c.relrowsecurity AND c.relname <> 'profiles'
       AND NOT EXISTS (SELECT 1 FROM pg_policies p
                        WHERE p.schemaname = 'public' AND p.tablename = c.relname
                          AND p.policyname = 'blocco_utente_bloccato')
     ORDER BY c.oid
  LOOP
    EXECUTE format('CREATE POLICY blocco_utente_bloccato ON public.%I '
                || 'AS RESTRICTIVE FOR ALL TO authenticated '
                || 'USING (NOT public.utente_bloccato()) '
                || 'WITH CHECK (NOT public.utente_bloccato())', t.relname);
    n := n + 1;
  END LOOP;
  RAISE LOG 'blocco utente bloccato: policy restrittiva aggiunta su % tabelle', n;
END $$;
