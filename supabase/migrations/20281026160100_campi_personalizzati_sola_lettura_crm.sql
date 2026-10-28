-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION public.cf_validate_value() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE d public.marketing_custom_fields%ROWTYPE; co uuid; kind text; target jsonb; parent_company uuid; parent_state text; n numeric; v jsonb;
BEGIN
 IF TG_TABLE_NAME='marketing_contact_field_values' THEN
   kind := 'contact'; SELECT company_id INTO co FROM public.marketing_contacts WHERE id=NEW.contact_id;
 ELSIF TG_TABLE_NAME='marketing_opportunity_field_values' THEN
   kind := 'opportunity'; SELECT company_id INTO co FROM public.marketing_opportunities WHERE id=NEW.opportunity_id;
 ELSE
   co := NEW.company_id; target := public.cf_target(NEW.entity_type);
   IF target IS NULL THEN RAISE EXCEPTION 'Oggetto dei campi personalizzati non supportato' USING ERRCODE='23514'; END IF;
   kind := target->>3;
   EXECUTE format('SELECT company_id,coalesce(to_jsonb(r)->>''stato'',to_jsonb(r)->>''status'',''bozza'') FROM public.%I r WHERE id=$1',target->>0) INTO parent_company,parent_state USING NEW.entity_id;
   IF parent_company IS DISTINCT FROM co THEN RAISE EXCEPTION 'Record non disponibile per questa azienda' USING ERRCODE='23514'; END IF;
   IF kind='quote' AND parent_state IN ('firmato','emesso','annullato','accettato','signed','accepted') THEN RAISE EXCEPTION 'Documento consolidato: i campi aggiuntivi non sono modificabili' USING ERRCODE='23514'; END IF;
 END IF;
 IF co IS NULL THEN RAISE EXCEPTION 'Record non accessibile' USING ERRCODE='23514'; END IF;
 IF auth.uid() IS NOT NULL AND public.utente_sola_lettura(co) THEN RAISE EXCEPTION 'Accesso in sola lettura' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.marketing_custom_fields WHERE id=NEW.field_id AND company_id=co AND object_type=kind AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Definizione non attiva, oggetto o azienda non corrispondenti' USING ERRCODE='23514'; END IF;
 IF NEW.value IS NULL OR NEW.value='' THEN
   IF d.is_required THEN RAISE EXCEPTION 'Campo obbligatorio: %',d.name USING ERRCODE='23514'; END IF;
   RETURN NEW;
 END IF;
 IF length(NEW.value)>20000 THEN RAISE EXCEPTION 'Valore troppo lungo' USING ERRCODE='23514'; END IF;
 IF d.field_type IN ('number','currency','percent') THEN
   IF NEW.value !~ '^[+-]?([0-9]+([.,][0-9]+)?|[.,][0-9]+)$' THEN RAISE EXCEPTION 'Numero non valido' USING ERRCODE='23514'; END IF;
   n := replace(NEW.value,',','.')::numeric;
   IF d.field_type='percent' AND (n<0 OR n>100) THEN RAISE EXCEPTION 'Percentuale fuori intervallo' USING ERRCODE='23514'; END IF;
   NEW.value := n::text;
 ELSIF d.field_type='checkbox' AND NEW.value NOT IN ('true','false') THEN RAISE EXCEPTION 'Booleano non valido' USING ERRCODE='23514';
 ELSIF d.field_type='date' THEN
   IF NEW.value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char(NEW.value::date,'YYYY-MM-DD')<>NEW.value THEN RAISE EXCEPTION 'Data non valida' USING ERRCODE='23514'; END IF;
 ELSIF d.field_type='time' AND NEW.value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Ora non valida' USING ERRCODE='23514';
 ELSIF d.field_type='email' AND NEW.value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Email non valida' USING ERRCODE='23514';
 ELSIF d.field_type='url' AND NEW.value !~* '^https?://[^[:space:]]+$' THEN RAISE EXCEPTION 'Indirizzo web non valido' USING ERRCODE='23514';
 ELSIF d.field_type IN ('select','radio') AND NOT (NEW.value=ANY(coalesce(d.options,'{}'))) THEN RAISE EXCEPTION 'Scelta non prevista' USING ERRCODE='23514';
 ELSIF d.field_type='multiselect' THEN
   v := NEW.value::jsonb;
   IF jsonb_typeof(v)<>'array' THEN RAISE EXCEPTION 'Serve un elenco di scelte' USING ERRCODE='23514'; END IF;
   IF jsonb_array_length(v)>100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v) e WHERE jsonb_typeof(e)<>'string' OR NOT ((e#>>'{}')=ANY(coalesce(d.options,'{}')))) THEN RAISE EXCEPTION 'Scelta multipla non valida' USING ERRCODE='23514'; END IF;
 ELSIF d.field_type='file' THEN RAISE EXCEPTION 'Gli allegati si gestiscono in Documenti' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cf_validate_value() FROM PUBLIC, anon, authenticated;
