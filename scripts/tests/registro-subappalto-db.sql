-- Executed after the migration in a transaction on eic_magazzino_integrato.
INSERT INTO public.orders (id, company_id, description, order_code)
VALUES ('80000000-0000-4000-a000-111111111101', 'd2000000-0000-4000-a000-000000000002', 'Test subappalto', 'LOC-SUB-01');

INSERT INTO public.subappaltatori (id, company_id, ragione_sociale)
VALUES ('80000000-0000-4000-a000-111111111102', 'd2000000-0000-4000-a000-000000000002', 'Ditta collaudo');

INSERT INTO public.order_work_phases (id, company_id, order_id, name)
VALUES ('80000000-0000-4000-a000-111111111110', 'd2000000-0000-4000-a000-000000000002', '80000000-0000-4000-a000-111111111101', 'Fase collaudo');
INSERT INTO public.employees (id, company_id, first_name, last_name)
VALUES ('80000000-0000-4000-a000-111111111111', 'd2000000-0000-4000-a000-000000000002', 'Operaio', 'Collaudo');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub TO '80000000-0000-4000-a000-000000000001';
SET LOCAL request.jwt.claims TO '{"sub":"80000000-0000-4000-a000-000000000001","role":"authenticated"}';
SET LOCAL request.headers TO '{"x-azienda-scheda":"d2000000-0000-4000-a000-000000000002"}';

DO $$
DECLARE
  azienda uuid := 'd2000000-0000-4000-a000-000000000002';
  commessa uuid := '80000000-0000-4000-a000-111111111101';
  riferimento text := '80000000-0000-4000-a000-111111111103';
  risultato jsonb;
  nuovo jsonb := '{"tipo":"crea","richiesta":{"id":"80000000-0000-4000-a000-111111111103","dittaId":"80000000-0000-4000-a000-111111111102","righe":[{"id":"corpo","ambito":"altri-lavori","descrizione":"Verifica in cantiere","quantita":1,"unita":"a corpo"}],"periodo":{"dal":null,"al":null}}}';
  preventivo jsonb := jsonb_build_object('tipo','offerta','id',riferimento,'precedente',null,
    'offerta',jsonb_build_object('data',CURRENT_DATE,'riferimento','OFF-1','prezzi',jsonb_build_object('corpo',60.55)));
BEGIN
  IF (public.registro_subappalto(azienda,commessa)->>'versione')::integer <> 0
    THEN RAISE EXCEPTION 'Unexpected initial state'; END IF;
  PERFORM public.registro_subappalto(azienda,commessa,nuovo);
  risultato := public.registro_subappalto(azienda,commessa,nuovo);
  IF jsonb_array_length(risultato->'richieste') <> 1 OR risultato#>>'{richieste,0,ditta}' IS DISTINCT FROM 'Ditta collaudo'
    THEN RAISE EXCEPTION 'Creation was not idempotent'; END IF;
  PERFORM public.registro_subappalto(azienda,commessa,preventivo);
  IF (public.registro_subappalto(azienda,commessa)#>>'{richieste,0,offerta,prezzi,corpo}')::numeric IS DISTINCT FROM 60.55
    THEN RAISE EXCEPTION 'Offer was not saved'; END IF;
  BEGIN
    PERFORM public.registro_subappalto(azienda,commessa,preventivo);
    RAISE EXCEPTION 'Stale offer edit was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM 1 FROM private.registro_subappalto_commessa;
    RAISE EXCEPTION 'Private table visible directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.registro_subappalto('90000000-0000-4000-a000-000000000002',commessa);
    RAISE EXCEPTION 'Order returned for another company';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

DO $$
DECLARE
  azienda uuid := 'd2000000-0000-4000-a000-000000000002';
  commessa uuid := '80000000-0000-4000-a000-111111111101';
  fase text := '80000000-0000-4000-a000-111111111110';
  piano jsonb := '{"versione":0,"operazione":"80000000-0000-4000-a000-111111111112","nuovi":[{"ambito":{"tipo":"fase","id":"80000000-0000-4000-a000-111111111110","faseId":"80000000-0000-4000-a000-111111111110"},"dal":"2026-11-23","al":"2026-11-23","giorni":["2026-11-23"],"operai":[{"id":"80000000-0000-4000-a000-111111111111","nome":"Operaio Collaudo","tariffa":28}],"persone":["80000000-0000-4000-a000-111111111111"],"squadre":[],"oreGiorno":8,"microOreGiorno":8000000,"sabato":false}]}';
  crea_pipeline jsonb := '{"azione":"salva","pipeline":{"id":"80000000-0000-4000-a000-111111111120","nome":"Collaudo","fasi":[{"id":"80000000-0000-4000-a000-111111111110","name":"Prima fase","color":"#123456"}]}}';
BEGIN
  PERFORM public.previsionale_cantiere(azienda,commessa,piano);
  IF public.previsionale_cantiere(azienda,commessa)#>>'{piani,0,operai,0,tariffa}' IS DISTINCT FROM '28'
  THEN RAISE EXCEPTION 'Forecast data lost'; END IF;
  IF public.previsionale_cantiere(azienda,commessa,piano)->>'versione' IS DISTINCT FROM '1'
  THEN RAISE EXCEPTION 'Forecast double submission'; END IF;
  PERFORM public.pipeline_commesse(azienda,crea_pipeline);
  PERFORM public.pipeline_commesse(azienda, jsonb_build_object('azione','assegna','commessa',commessa,'fase',fase,'precedente',null));
  IF public.pipeline_commesse(azienda)->'fasiPerCommessa'->>commessa::text IS DISTINCT FROM fase
  THEN RAISE EXCEPTION 'Pipeline assignment lost'; END IF;
END $$;

SET LOCAL request.jwt.claim.sub TO '80000000-0000-4000-a000-000000000004';
SET LOCAL request.jwt.claims TO '{"sub":"80000000-0000-4000-a000-000000000004","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    PERFORM public.registro_subappalto('d2000000-0000-4000-a000-000000000002', '80000000-0000-4000-a000-111111111101');
    RAISE EXCEPTION 'Applicant from outside the company can read archives';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
