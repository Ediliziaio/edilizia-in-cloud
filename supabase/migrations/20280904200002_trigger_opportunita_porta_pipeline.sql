-- Gli eventi delle opportunità non portavano la PIPELINE nel payload.
--
-- Conseguenza pratica: un'automazione "quando entra un lead in Marketing Edile"
-- non poteva filtrare per pipeline, perché il filtro legge il payload (arricchito
-- solo con i dati del CONTATTO, non dell'opportunità). Sarebbe partita per i lead
-- di TUTTI gli 11 brand della piattaforma — un nurturing di 45 email mandato alla
-- lista sbagliata, cioè il danno peggiore che questo sistema possa fare.
--
-- Si aggiunge pipeline_id (e stage_id anche in INSERT, che prima c'era solo
-- sull'UPDATE). Additivo: nessun consumatore esistente perde campi.
DO $migr$
DECLARE
  def text;
  vecchio_insert text;
  nuovo_insert text;
  vecchio_update text;
  nuovo_update text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fire_marketing_automation';

  IF def IS NULL THEN
    RAISE EXCEPTION 'fire_marketing_automation non trovata';
  END IF;

  vecchio_insert := '_payload := jsonb_build_object(''opportunity_id'', NEW.id, ''name'', NEW.name, ''value'', NEW.value, ''status'', NEW.status);';
  nuovo_insert := '_payload := jsonb_build_object(''opportunity_id'', NEW.id, ''name'', NEW.name, ''value'', NEW.value, ''status'', NEW.status, ''pipeline_id'', NEW.pipeline_id, ''stage_id'', NEW.stage_id);';

  vecchio_update := '_payload := jsonb_build_object(''opportunity_id'', NEW.id, ''name'', NEW.name, ''value'', NEW.value,
          ''status'', NEW.status, ''old_status'', OLD.status, ''stage_id'', NEW.stage_id, ''old_stage_id'', OLD.stage_id);';
  nuovo_update := '_payload := jsonb_build_object(''opportunity_id'', NEW.id, ''name'', NEW.name, ''value'', NEW.value,
          ''status'', NEW.status, ''old_status'', OLD.status, ''stage_id'', NEW.stage_id, ''old_stage_id'', OLD.stage_id,
          ''pipeline_id'', NEW.pipeline_id, ''old_pipeline_id'', OLD.pipeline_id);';

  IF position(vecchio_insert in def) = 0 THEN
    RAISE EXCEPTION 'ancoraggio INSERT non trovato: la funzione e'' cambiata, rivedere la migration';
  END IF;
  IF position(vecchio_update in def) = 0 THEN
    RAISE EXCEPTION 'ancoraggio UPDATE non trovato: la funzione e'' cambiata, rivedere la migration';
  END IF;

  def := replace(def, vecchio_insert, nuovo_insert);
  def := replace(def, vecchio_update, nuovo_update);
  EXECUTE def;
END
$migr$;
