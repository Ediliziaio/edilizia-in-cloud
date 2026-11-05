-- Restituisce solo il consumo reale (anche delta 0 per gli illimitati).
-- Il lock aziendale è lo stesso usato da deduct_v3: serializza refund e consume.
-- Nessuna rettifica retroattiva dei saldi o rimozione dello storico.
CREATE OR REPLACE FUNCTION public.refund_render_credit_all(
 _company_id uuid, _session_id uuid, _reason_meta jsonb DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_balance integer; v_units integer; v_refunded integer:=0; v_closed integer:=0;
 v_legacy integer; v_ledger uuid; r record;
BEGIN
 IF _company_id IS NULL OR _session_id IS NULL THEN
  RETURN json_build_object('status','skipped','refunded',0);
 END IF;
 SELECT balance INTO v_balance FROM public.render_credits WHERE company_id=_company_id FOR UPDATE;
 IF NOT FOUND THEN RETURN json_build_object('status','skipped','refunded',0,'reason','missing_credit_account'); END IF;
 SELECT count(*)::integer INTO v_legacy FROM public.render_credit_ledger
 WHERE company_id=_company_id AND session_id=_session_id AND reason='refund'
 AND NULLIF(metadata->>'consume_ledger_id','') IS NULL;
 FOR r IN
  SELECT c.id,c.delta,c.purchase_id,COALESCE(c.revenue_eur,0) AS revenue_eur
  FROM public.render_credit_ledger c
  WHERE c.company_id=_company_id AND c.session_id=_session_id AND c.reason='consume'
  AND NOT EXISTS (SELECT 1 FROM public.render_credit_ledger f
   WHERE f.company_id=_company_id AND f.session_id=_session_id AND f.reason='refund'
   AND f.metadata->>'consume_ledger_id'=c.id::text)
  ORDER BY c.created_at,c.id OFFSET v_legacy
 LOOP
  v_units:=GREATEST(-r.delta,0);
  IF v_units>0 THEN
   UPDATE public.render_credits SET balance=balance+v_units,total_used=GREATEST(total_used-v_units,0),updated_at=now()
   WHERE company_id=_company_id RETURNING balance INTO v_balance;
   IF r.purchase_id IS NOT NULL AND to_regclass('public.render_credit_purchases') IS NOT NULL THEN
    UPDATE public.render_credit_purchases SET credits_remaining=credits_remaining+v_units WHERE id=r.purchase_id AND company_id=_company_id;
   END IF;
  END IF;
  INSERT INTO public.render_credit_ledger(company_id,delta,balance_after,reason,session_id,user_id,revenue_eur,purchase_id,metadata)
  VALUES(_company_id,v_units,v_balance,'refund',_session_id,NULL,
   CASE WHEN v_units>0 THEN -r.revenue_eur ELSE 0 END,
   CASE WHEN v_units>0 THEN r.purchase_id ELSE NULL END,
   COALESCE(_reason_meta,'{}'::jsonb)||jsonb_build_object('reason_text','Refund del consumo effettivo','consume_ledger_id',r.id,'unlimited',v_units=0))
  RETURNING id INTO v_ledger;
  v_refunded:=v_refunded+v_units; v_closed:=v_closed+1;
 END LOOP;
 RETURN json_build_object('status',CASE WHEN v_closed>0 THEN 'refunded' ELSE 'no_outstanding_consume' END,
  'refunded',v_refunded,'closed_consumes',v_closed,'balance_after',v_balance,'ledger_id',v_ledger);
END; $$;
REVOKE EXECUTE ON FUNCTION public.refund_render_credit_all(uuid,uuid,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refund_render_credit_all(uuid,uuid,jsonb) TO service_role;

-- Anche il vecchio ingresso usa la stessa esclusione e riconosce ogni ciclo.
CREATE OR REPLACE FUNCTION public.refund_render_credit_v1(
 _company_id uuid,_session_id uuid,_user_id uuid DEFAULT NULL,_reason_meta jsonb DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v json;
BEGIN
 IF NOT public.user_can_access_company(_company_id) THEN
  RAISE EXCEPTION 'accesso negato: azienda non consentita' USING ERRCODE='42501';
 END IF;
 v:=public.refund_render_credit_all(_company_id,_session_id,_reason_meta);
 IF v->>'status'='no_outstanding_consume' THEN
  IF EXISTS(SELECT 1 FROM public.render_credit_ledger WHERE company_id=_company_id AND session_id=_session_id AND reason='consume') THEN
   RETURN json_build_object('status','already_refunded','balance_after',v->'balance_after','ledger_id',NULL);
  END IF;
  RETURN json_build_object('status','no_consume','balance_after',v->'balance_after','ledger_id',NULL);
 END IF;
 RETURN v;
END; $$;
