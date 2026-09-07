-- Il linter contava 235 funzioni SECURITY DEFINER eseguibili da anon. Nessuno
-- le aveva mai classificate, e senza classificazione l'unica risposta onesta
-- era "non lo so". Ora lo so:
--
--   182  funzioni di TRIGGER. PostgREST non le espone (restituiscono
--        `trigger`), e al momento dello scatto il privilegio EXECUTE non viene
--        nemmeno controllato: il permesso ad anon e authenticated è un residuo
--        del GRANT implicito a PUBLIC. Si toglie a tutti e non cambia niente.
--    33  guardie usate dentro le policy RLS e le viste (is_super_admin,
--        get_my_company_id, has_permission…). Quando anon legge una tabella la
--        cui policy le chiama, deve poterle eseguire: restano aperte, e sono
--        predicati puri che non restituiscono dati.
--    10  pubbliche di proposito: firma OdV e SAL via token, form del profilo
--        talent, recensioni pubbliche, slot del calendario di prenotazione,
--        validazione del token del portale. I test in src/test/security
--        pretendono che restino aperte.
--     2  errori: campo_squadra_oggi (portale operaio, sempre autenticato) e
--        commessa_salva (salvataggio commessa). Si chiudono.
--
-- La classificazione vive in una tabella, non in questo commento: così il
-- prossimo linter ha con cosa confrontarsi, e la prossima funzione nuova che
-- resta aperta per sbaglio si vede come tale.

CREATE TABLE IF NOT EXISTS public.funzioni_pubbliche_di_proposito (
  nome      text PRIMARY KEY,
  motivo    text NOT NULL,
  dal       date NOT NULL DEFAULT current_date
);
ALTER TABLE public.funzioni_pubbliche_di_proposito ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.funzioni_pubbliche_di_proposito FROM PUBLIC, anon;
GRANT SELECT ON public.funzioni_pubbliche_di_proposito TO authenticated, service_role;

INSERT INTO public.funzioni_pubbliche_di_proposito (nome, motivo) VALUES
  ('odv_view_by_token',               'Il cliente apre l''ordine di vendita da un link con token, senza account'),
  ('odv_sign_with_token',             'Firma dell''ordine di vendita via token'),
  ('odv_reject_with_token',           'Rifiuto dell''ordine di vendita via token'),
  ('sal_view_by_token',               'Il cliente apre lo stato avanzamento lavori da un link con token'),
  ('sal_sign_with_token',             'Firma del SAL via token'),
  ('valida_portale_token',            'Ingresso nel portale cliente: verifica il token prima che esista una sessione'),
  ('hr_talent_public_session',        'Form pubblico del profilo talent: apertura sessione'),
  ('hr_talent_public_save_answers',   'Form pubblico del profilo talent: salvataggio risposte'),
  ('submit_public_reputation_review', 'Recensione pubblica da link inviato al cliente'),
  ('slot_occupati_pubblici',          'Calendario di prenotazione pubblico: restituisce solo inizio e fine degli slot occupati'),
  ('battito_ping',                    'Sonda di raggiungibilità: non legge nulla')
ON CONFLICT (nome) DO NOTHING;

DO $$
DECLARE r RECORD; v_trigger int := 0;
BEGIN
  -- Funzioni di trigger: via a tutti. Non sono chiamabili e non ne hanno bisogno.
  FOR r IN
    SELECT p.oid::regprocedure AS firma
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
       AND p.prorettype = 'trigger'::regtype
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.firma);
    v_trigger := v_trigger + 1;
  END LOOP;
  RAISE NOTICE 'Funzioni di trigger chiuse: %', v_trigger;

  -- Le due aperte per sbaglio.
  FOR r IN
    SELECT p.oid::regprocedure AS firma
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('campo_squadra_oggi', 'commessa_salva')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.firma);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.firma);
  END LOOP;
END $$;

-- La vista che il prossimo collaudo deve leggere: cosa è aperto ad anon e perché.
CREATE OR REPLACE VIEW public.v_funzioni_aperte_ad_anon
WITH (security_invoker = true) AS
SELECT p.proname AS nome,
       CASE
         WHEN f.nome IS NOT NULL THEN 'pubblica di proposito: ' || f.motivo
         WHEN EXISTS (SELECT 1 FROM pg_policy pl
                       WHERE pg_get_expr(pl.polqual, pl.polrelid) ILIKE '%' || p.proname || '(%'
                          OR pg_get_expr(pl.polwithcheck, pl.polrelid) ILIKE '%' || p.proname || '(%')
              THEN 'guardia usata da una policy RLS'
         WHEN EXISTS (SELECT 1 FROM pg_views v WHERE v.schemaname = 'public'
                       AND v.definition ILIKE '%' || p.proname || '(%')
              THEN 'usata da una vista'
         ELSE 'NON CLASSIFICATA: da chiudere o da motivare'
       END AS motivo
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN public.funzioni_pubbliche_di_proposito f ON f.nome = p.proname
 WHERE n.nspname = 'public' AND p.prosecdef
   AND has_function_privilege('anon', p.oid, 'EXECUTE');

REVOKE ALL ON public.v_funzioni_aperte_ad_anon FROM PUBLIC, anon;
GRANT SELECT ON public.v_funzioni_aperte_ad_anon TO authenticated, service_role;
