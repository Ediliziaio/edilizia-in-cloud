-- PROPOSTA LOCALE: non mettere in supabase/migrations senza collaudo/approvazione del rilascio.
-- Eseguire dentro una transazione. Non riscrive contratti esistenti.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $check$
BEGIN
 IF to_regprocedure('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)') IS NULL
 OR to_regprocedure('public.create_order_atomic(jsonb,jsonb,jsonb,uuid,jsonb)') IS NULL
 OR to_regprocedure('private.commessa_guardia_importi(uuid,uuid,jsonb,jsonb)') IS NULL
 OR to_regclass('private.office_projection_fields') IS NULL THEN
  RAISE EXCEPTION 'IVA mista: mancano i servizi atomici o le protezioni economiche attese. Nessuna attivazione.';
 END IF;
END $check$;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vat_breakdown jsonb;
INSERT INTO private.office_projection_fields(table_name,column_name,right_name)
VALUES ('orders','vat_breakdown','amounts') ON CONFLICT(table_name,column_name) DO UPDATE SET right_name='amounts';

CREATE OR REPLACE FUNCTION private.contract_vat_split_values(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $fn$
DECLARE
 q10 numeric; q22 numeric; n10 numeric; n22 numeric; v10 numeric; v22 numeric;
 g10 numeric; g22 numeric; mode text;
BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR p_data->'version'<>'1'::jsonb
 OR NOT(p_data ?& ARRAY['version','input_mode','quota_10','quota_22'])
 OR jsonb_typeof(p_data->'quota_10')<>'number' OR jsonb_typeof(p_data->'quota_22')<>'number' THEN
  RAISE EXCEPTION 'Ripartizione IVA non valida.' USING ERRCODE='22023';
 END IF;
 mode:=p_data->>'input_mode';
 IF mode IS NULL OR mode NOT IN ('net','gross') THEN RAISE EXCEPTION 'Scegli IVA esclusa o IVA inclusa.' USING ERRCODE='22023'; END IF;
 q10:=(p_data->>'quota_10')::numeric; q22:=(p_data->>'quota_22')::numeric;
 IF q10<0 OR q22<0 OR q10>99999999.99 OR q22>99999999.99 OR q10<>round(q10,2) OR q22<>round(q22,2) THEN
  RAISE EXCEPTION 'Le quote IVA devono essere importi non negativi con due decimali.' USING ERRCODE='22023';
 END IF;
 n10:=CASE WHEN mode='gross' THEN round(q10/1.10,2) ELSE q10 END;
 n22:=CASE WHEN mode='gross' THEN round(q22/1.22,2) ELSE q22 END;
 v10:=round(n10*0.10,2); v22:=round(n22*0.22,2);
 g10:=CASE WHEN mode='gross' THEN q10 ELSE n10+v10 END;
 g22:=CASE WHEN mode='gross' THEN q22 ELSE n22+v22 END;
 IF n10+n22<=0 OR n10+n22>99999999.99 THEN RAISE EXCEPTION 'Imponibile del contratto non valido.' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('net',n10+n22,'vat',v10+v22,'gross',g10+g22,
  'rounding',g10+g22-n10-n22-v10-v22,
  'effective_rate',(g10+g22-n10-n22)*100/(n10+n22),
  'rows',jsonb_build_array(jsonb_build_object('rate',10,'net',n10,'vat',v10,'gross',g10),jsonb_build_object('rate',22,'net',n22,'vat',v22,'gross',g22)));
END $fn$;
REVOKE ALL ON FUNCTION private.contract_vat_split_values(jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.contract_vat_split_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v jsonb;
BEGIN
 IF TG_OP='INSERT' OR NEW.vat_breakdown IS DISTINCT FROM OLD.vat_breakdown THEN
  IF NEW.vat_breakdown IS NOT NULL OR (TG_OP='UPDATE' AND OLD.vat_breakdown IS NOT NULL) THEN
   PERFORM private.commessa_guardia_importi(NEW.company_id,NEW.id,jsonb_build_object('vat_breakdown',NEW.vat_breakdown),NULL);
  END IF;
 END IF;
 IF NEW.vat_breakdown IS NULL THEN RETURN NEW; END IF;
 v:=private.contract_vat_split_values(NEW.vat_breakdown);
 IF NEW.total_amount IS NULL OR NEW.total_amount<>(v->>'net')::numeric THEN
  RAISE EXCEPTION 'La somma delle quote IVA non coincide con l’imponibile del contratto.' USING ERRCODE='22023';
 END IF;
 -- Compatibilità per i totali storici: le aliquote fiscali rimangono 10/22 nel JSON.
 -- Questa percentuale effettiva NON è un’aliquota da emettere sulle righe della fattura.
 NEW.vat_rate:=(v->>'effective_rate')::numeric;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.contract_vat_split_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS a_contract_vat_split_guard ON public.orders;
CREATE TRIGGER a_contract_vat_split_guard BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.contract_vat_split_guard();

-- Estende le funzioni attuali, senza sostituire le loro verifiche di permessi/versione/giacenza.
DO $patch$
DECLARE d text; changed text; proc regprocedure; first_pos integer; end_pos integer; block text; patched text;
BEGIN
 proc:='public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure;
 d:=pg_get_functiondef(proc);
 IF position('vat_breakdown' IN d)=0 THEN
  IF position('''vat_rate''' IN d)=0 OR d !~ 'vat_rate\s*=\s*n\.vat_rate\s*,' THEN
   RAISE EXCEPTION 'commessa_salva: punti di estensione IVA non riconosciuti';
  END IF;
  first_pos:=position('c_ammesse' IN d);
  end_pos:=position('];' IN substring(d FROM first_pos));
  IF first_pos=0 OR end_pos=0 THEN RAISE EXCEPTION 'Whitelist commessa non riconosciuta'; END IF;
  block:=substring(d FROM first_pos FOR end_pos+1);
  IF position('''vat_rate''' IN block)=0 THEN RAISE EXCEPTION 'Whitelist IVA non riconosciuta'; END IF;
  changed:=replace(d,block,replace(block,'''vat_rate''','''vat_rate'',''vat_breakdown'''));
  changed:=regexp_replace(changed,'(vat_rate\s*=\s*n\.vat_rate\s*,)','\1 vat_breakdown = n.vat_breakdown,');
  EXECUTE changed;
 END IF;
 FOR proc IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('create_order_atomic','crea_commessa_preventivo_atomic') LOOP
  d:=pg_get_functiondef(proc);
  IF position('vat_breakdown' IN d)>0 THEN CONTINUE; END IF;
  first_pos:=position('INSERT INTO public.orders' IN d);
  IF first_pos=0 THEN
   IF position('v_result := public.create_order_atomic(' IN d)>0 AND position('p_order_data' IN d)>0 THEN
    changed:=replace(d,'v_result := public.create_order_atomic(',
     'IF NULLIF(p_order_data->''vat_breakdown'',''null''::jsonb) IS NOT NULL THEN
       IF (private.contract_vat_split_values(p_order_data->''vat_breakdown'')->>''net'')::numeric IS DISTINCT FROM v_net THEN
         RAISE EXCEPTION ''Le quote IVA devono coincidere con l’imponibile del preventivo accettato.'' USING ERRCODE=''22023'';
       END IF;
       v_vat:=(private.contract_vat_split_values(p_order_data->''vat_breakdown'')->>''effective_rate'')::numeric;
      END IF;
      v_result := public.create_order_atomic(');
    EXECUTE changed;
    CONTINUE;
   END IF;
   RAISE EXCEPTION 'Creazione commessa: INSERT non riconosciuto per %',proc;
  END IF;
  end_pos:=position('RETURNING id INTO v_order_id;' IN substring(d FROM first_pos));
  IF end_pos=0 THEN RAISE EXCEPTION 'Creazione commessa: fine INSERT non riconosciuta per %',proc; END IF;
  block:=substring(d FROM first_pos FOR end_pos+length('RETURNING id INTO v_order_id;')-1);
  IF block !~ '\mvat_rate\M\s*,' OR block !~* 'COALESCE\(\(p_order_data\s*->>\s*''vat_rate''\)::numeric,\s*22\)' THEN
   RAISE EXCEPTION 'Creazione commessa: valori IVA non riconosciuti per %',proc;
  END IF;
  patched:=regexp_replace(block,'(\mvat_rate\M\s*,)','\1 vat_breakdown,');
  patched:=regexp_replace(patched,'(COALESCE\(\(p_order_data\s*->>\s*''vat_rate''\)::numeric,\s*22\))', '\1, NULLIF(p_order_data->''vat_breakdown'', ''null''::jsonb)','i');
  EXECUTE replace(d,block,patched);
 END LOOP;
END $patch$;

-- Aggiunge solo la nuova colonna mascherata alla proiezione già presente; conserva filtri e colonne.
DO $view$
DECLARE d text; changed text;
BEGIN
 IF to_regclass('public.orders_visibili') IS NULL THEN RAISE EXCEPTION 'Proiezione economica della commessa assente'; END IF;
 d:=pg_get_viewdef('public.orders_visibili'::regclass,true);
 IF position('vat_breakdown' IN d)>0 THEN RETURN; END IF;
 IF position('r.rights' IN d)=0 OR d !~* '\mFROM\M\s+(public\.)?orders\M' THEN
  RAISE EXCEPTION 'Proiezione economica non riconosciuta: nessuna esposizione delle quote IVA';
 END IF;
 changed:=regexp_replace(d,'(\mFROM\M\s+(public\.)?orders\M)',', CASE WHEN coalesce((r.rights->>''amounts'')::boolean,false) THEN orders.vat_breakdown ELSE NULL::jsonb END AS vat_breakdown \1','i');
 EXECUTE 'CREATE OR REPLACE VIEW public.orders_visibili WITH (security_barrier=true) AS '||changed;
END $view$;

-- Blocca anche le scritture dirette che userebbero il coefficiente del contratto come aliquota fiscale.
CREATE OR REPLACE FUNCTION private.contract_vat_invoice_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE split jsonb;
BEGIN
 IF NEW.ordine_id IS NULL THEN RETURN NEW; END IF;
 SELECT o.vat_breakdown INTO split FROM public.orders o WHERE o.id=NEW.ordine_id AND o.company_id=NEW.company_id;
 IF split IS NULL THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.righe) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Righe fattura non valide' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.righe) AS r
   WHERE nullif(r->>'natura_iva','') IS NULL
   AND (r->>'aliquota_iva') IS DISTINCT FROM '10' AND (r->>'aliquota_iva') IS DISTINCT FROM '22') THEN
   RAISE EXCEPTION 'Contratto con IVA mista: indica il 10%% o il 22%% su ogni riga, oppure il regime fiscale con la sua natura.' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.contract_vat_invoice_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS contract_vat_invoice_guard ON public.documenti_fiscali;
CREATE TRIGGER contract_vat_invoice_guard BEFORE INSERT OR UPDATE OF righe,ordine_id,company_id ON public.documenti_fiscali
FOR EACH ROW EXECUTE FUNCTION private.contract_vat_invoice_guard();

CREATE OR REPLACE FUNCTION public.contract_vat_split_capabilities()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT jsonb_build_object('version',1,'split_10_22',true)
$fn$;
REVOKE ALL ON FUNCTION public.contract_vat_split_capabilities() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.contract_vat_split_capabilities() TO authenticated;
NOTIFY pgrst, 'reload schema';
