-- Correct the pre-release draft applied before the feature was merged.
-- These business conflicts are HTTP 409, not retryable serialization failures.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION public.bank_movimento_note(p_company uuid,p_tx uuid,p_note text,p_category text,p_revision integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rev integer;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 IF length(coalesce(p_note,''))>10000 OR length(coalesce(p_category,''))>100 THEN RAISE EXCEPTION 'Testo troppo lungo';END IF;
 UPDATE public.bank_transactions SET note=nullif(btrim(p_note),''),category=nullif(btrim(p_category),''),operativita_revision=operativita_revision+1
 WHERE id=p_tx AND company_id=p_company AND operativita_revision=p_revision RETURNING operativita_revision INTO rev;
 IF rev IS NULL THEN RAISE EXCEPTION 'Il movimento è stato modificato in un’altra finestra. Ricarica prima di salvare.' USING ERRCODE='PT409';END IF;
 RETURN rev;
END $$;
REVOKE ALL ON FUNCTION public.bank_movimento_note(uuid,uuid,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_movimento_note(uuid,uuid,text,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.bank_context_save(p_company uuid,p_tx uuid,p_rows jsonb,p_revision integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.bank_transactions;r record;rev integer;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non disponibile';END IF;
 IF p_revision IS NULL OR t.operativita_revision<>p_revision THEN RAISE EXCEPTION 'Il movimento è stato modificato in un’altra finestra. Ricarica prima di salvare.' USING ERRCODE='PT409';END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>40 THEN RAISE EXCEPTION 'Collegamenti non validi';END IF;
 FOR r IN SELECT * FROM jsonb_to_recordset(p_rows) x(kind text,target_id uuid,amount numeric,note text) LOOP
  IF r.kind IS NULL OR r.target_id IS NULL OR r.amount IS NULL OR r.amount<=0 OR r.amount<>round(r.amount,2) OR length(coalesce(r.note,''))>1000 OR private.bank_target(p_company,r.kind,r.target_id) IS NULL THEN RAISE EXCEPTION 'Controlla tipo, destinatario e quota del collegamento' USING ERRCODE='42501';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows)x(kind text,target_id uuid) GROUP BY kind,target_id HAVING count(*)>1) THEN RAISE EXCEPTION 'Lo stesso collegamento compare due volte';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows)x(kind text,amount numeric) GROUP BY kind HAVING sum(amount)>abs(t.amount)) THEN RAISE EXCEPTION 'Le quote dello stesso tipo superano l’importo del movimento';END IF;
 -- Hidden personnel links cannot be read, changed or removed by an operator without HR access.
 IF EXISTS(SELECT 1 FROM public.bank_transaction_contexts c WHERE c.transaction_id=t.id AND c.removed_at IS NULL AND ((c.kind IN('dipendente','cedolino') AND (public.e_amministratore_di(p_company) OR public.is_super_admin(auth.uid())) IS NOT TRUE) OR (c.kind='commessa' AND public.has_permission_for_company(auth.uid(),'can_view_orders',p_company) IS NOT TRUE) OR (c.kind='mezzo' AND public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company) IS NOT TRUE) OR (c.kind='fornitore' AND (public.has_permission_for_company(auth.uid(),'can_view_costs',p_company) OR public.has_permission_for_company(auth.uid(),'can_view_billing',p_company)) IS NOT TRUE))) THEN RAISE EXCEPTION 'Alcuni collegamenti sono riservati. Serve un amministratore per modificarli.' USING ERRCODE='42501';END IF;
 UPDATE public.bank_transaction_contexts SET removed_at=now(),removed_by=auth.uid() WHERE transaction_id=t.id AND company_id=p_company AND removed_at IS NULL;
 INSERT INTO public.bank_transaction_contexts(company_id,transaction_id,kind,target_id,amount,note,created_by) SELECT p_company,t.id,kind,target_id,amount,nullif(btrim(note),''),auth.uid() FROM jsonb_to_recordset(p_rows)x(kind text,target_id uuid,amount numeric,note text);
 UPDATE public.bank_transactions SET operativita_revision=operativita_revision+1 WHERE id=t.id RETURNING operativita_revision INTO rev;RETURN rev;
END $$;
REVOKE ALL ON FUNCTION public.bank_context_save(uuid,uuid,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_context_save(uuid,uuid,jsonb,integer) TO authenticated;


NOTIFY pgrst,'reload schema';
