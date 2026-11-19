-- PROPOSTA LOCALE: applicare in un'unica transazione, dopo la verifica su un clone completo.
-- SAL aperti: nessun numero, importo o data futura viene trasformato in rata.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $$BEGIN
 IF to_regprocedure('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)') IS NULL
 OR to_regprocedure('private.commessa_guardia_importi(uuid,uuid,jsonb,jsonb)') IS NULL
 OR to_regclass('public.order_installments') IS NULL THEN RAISE EXCEPTION 'Servizi o protezioni del piano pagamenti assenti'; END IF;
END$$;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_terms jsonb;
INSERT INTO private.office_projection_fields(table_name,column_name,right_name) VALUES('orders','payment_terms','amounts') ON CONFLICT(table_name,column_name) DO UPDATE SET right_name='amounts';
CREATE OR REPLACE FUNCTION private.contract_sal_terms_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.payment_terms IS DISTINCT FROM OLD.payment_terms THEN
  IF NEW.payment_terms IS NOT NULL OR (TG_OP='UPDATE' AND OLD.payment_terms IS NOT NULL) THEN
   PERFORM private.commessa_guardia_importi(NEW.company_id,NEW.id,jsonb_build_object('payment_terms',NEW.payment_terms),NULL);
  END IF;
 END IF;
 IF NEW.payment_terms IS NOT NULL AND (
  jsonb_typeof(NEW.payment_terms) IS DISTINCT FROM 'object'
  OR NEW.payment_terms->'version' IS DISTINCT FROM '1'::jsonb
  OR coalesce(NEW.payment_terms->>'mode','') NOT IN ('advance_sal','sal')
  OR NEW.payment_type IS DISTINCT FROM 'standard') THEN
  RAISE EXCEPTION 'Scegli Acconto + SAL o Solo SAL con pagamento standard.' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.contract_sal_terms_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS contract_sal_terms_guard ON public.orders;
CREATE TRIGGER contract_sal_terms_guard BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.contract_sal_terms_guard();

DO $patch$
DECLARE d text;changed text;proc regprocedure;start_pos integer;end_pos integer;block text;patched text;
BEGIN
 proc:='public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure;
 d:=pg_get_functiondef(proc);
 IF position('''payment_terms''' IN d)=0 THEN
  start_pos:=position('c_ammesse' IN d);end_pos:=position('];' IN substring(d FROM start_pos));
  IF start_pos=0 OR end_pos=0 OR d !~ 'vat_rate\s*=\s*n\.vat_rate\s*,' THEN RAISE EXCEPTION 'Salvataggio commessa non riconosciuto'; END IF;
  block:=substring(d FROM start_pos FOR end_pos+1);
  IF position('''vat_rate''' IN block)=0 THEN RAISE EXCEPTION 'Whitelist economica non riconosciuta'; END IF;
  changed:=replace(d,block,replace(block,'''vat_rate''','''vat_rate'',''payment_terms'''));
  changed:=regexp_replace(changed,'(vat_rate\s*=\s*n\.vat_rate\s*,)','\1 payment_terms=n.payment_terms,');
  EXECUTE changed;
 END IF;
 FOR proc IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('create_order_atomic','crea_commessa_preventivo_atomic') LOOP
  d:=pg_get_functiondef(proc);IF position('''payment_terms''' IN d)>0 THEN CONTINUE;END IF;
  start_pos:=position('INSERT INTO public.orders' IN d);
  IF start_pos=0 THEN
   IF position('v_result := public.create_order_atomic(' IN d)>0 AND position('p_order_data || jsonb_build_object' IN d)>0 THEN CONTINUE; END IF;
   RAISE EXCEPTION 'Creazione commessa non riconosciuta: %',proc;
  END IF;
  end_pos:=position('RETURNING id INTO v_order_id;' IN substring(d FROM start_pos));
  IF end_pos=0 THEN RAISE EXCEPTION 'Fine INSERT non riconosciuta';END IF;
  block:=substring(d FROM start_pos FOR end_pos+length('RETURNING id INTO v_order_id;')-1);
  IF block !~ '\mvat_rate\M\s*,' OR block !~* 'COALESCE\(\(p_order_data\s*->>\s*''vat_rate''\)::numeric,\s*22\)' THEN RAISE EXCEPTION 'Campi creazione non riconosciuti';END IF;
  patched:=regexp_replace(block,'(\mvat_rate\M\s*,)','\1 payment_terms,');
  patched:=regexp_replace(patched,'(COALESCE\(\(p_order_data\s*->>\s*''vat_rate''\)::numeric,\s*22\))','\1, NULLIF(p_order_data->''payment_terms'',''null''::jsonb)','i');
  EXECUTE replace(d,block,patched);
 END LOOP;
END $patch$;

DO $view$
DECLARE d text;changed text;
BEGIN
 d:=pg_get_viewdef('public.orders_visibili'::regclass,true);
 IF position('payment_terms' IN d)>0 THEN RETURN;END IF;
 IF position('r.rights' IN d)=0 OR d !~* '\mFROM\M\s+(public\.)?orders\M' THEN RAISE EXCEPTION 'Vista economica non riconosciuta'; END IF;
 changed:=regexp_replace(d,'(\mFROM\M\s+(public\.)?orders\M)',', CASE WHEN coalesce((r.rights->>''amounts'')::boolean,false) THEN orders.payment_terms ELSE NULL::jsonb END AS payment_terms \1','i');
 EXECUTE 'CREATE OR REPLACE VIEW public.orders_visibili WITH(security_barrier=true) AS '||changed;
END $view$;

-- Controllo differito: testata e rate devono potersi aggiornare nella stessa transazione atomica.
CREATE OR REPLACE FUNCTION private.contract_sal_plan_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE oid uuid;o public.orders;initial_advance numeric;
BEGIN
 IF TG_TABLE_NAME='orders' THEN oid:=coalesce(NEW.id,OLD.id); ELSE oid:=coalesce(NEW.order_id,OLD.order_id); END IF;
 SELECT * INTO o FROM public.orders WHERE id=oid;
 IF NOT FOUND OR o.payment_terms IS NULL THEN RETURN NULL;END IF;
 IF EXISTS(SELECT 1 FROM public.order_installments i WHERE i.order_id=oid AND (i.type<>'deposit' OR i.amount IS NULL OR i.amount<0 OR i.amount::text IN ('NaN','Infinity','-Infinity'))) THEN
  RAISE EXCEPTION 'Il piano a SAL non ammette un saldo futuro predefinito.' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(sum(amount),0) INTO initial_advance FROM public.order_installments WHERE order_id=oid AND trigger_evento='firma_contratto';
 IF o.payment_terms->>'mode'='advance_sal' AND initial_advance<=0 THEN RAISE EXCEPTION 'Definisci l’acconto iniziale oppure scegli Solo SAL.' USING ERRCODE='22023';END IF;
 IF initial_advance>=round(o.total_amount*(1+coalesce(o.vat_rate,22)/100),2) THEN RAISE EXCEPTION 'L’acconto deve lasciare una quota da maturare con i SAL.' USING ERRCODE='22023';END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.contract_sal_plan_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS contract_sal_plan_guard ON public.orders;
CREATE CONSTRAINT TRIGGER contract_sal_plan_guard AFTER INSERT OR UPDATE ON public.orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.contract_sal_plan_guard();
DROP TRIGGER IF EXISTS contract_sal_plan_guard ON public.order_installments;
CREATE CONSTRAINT TRIGGER contract_sal_plan_guard AFTER INSERT OR UPDATE OR DELETE ON public.order_installments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.contract_sal_plan_guard();

CREATE OR REPLACE FUNCTION public.contract_sal_plan_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT jsonb_build_object('version',1,'open_sal',true)$$;
REVOKE ALL ON FUNCTION public.contract_sal_plan_capabilities() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.contract_sal_plan_capabilities() TO authenticated;
NOTIFY pgrst,'reload schema';
