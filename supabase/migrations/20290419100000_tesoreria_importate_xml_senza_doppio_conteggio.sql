CREATE OR REPLACE FUNCTION private.bank_record_imported(p_company uuid, p_tx uuid, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE e jsonb; rc uuid; paid numeric; v_total numeric; v_provider text; outrows jsonb:='[]';
BEGIN
 FOR e IN SELECT value FROM jsonb_array_elements(coalesce(p_result->'esterne','[]')) LOOP
  SELECT r.id INTO rc FROM public.bank_reconciliations r WHERE r.company_id=p_company AND r.transaction_id=p_tx AND r.invoice_id=(e->>'invoice_id')::uuid AND r.unmatched_at IS NULL;
  IF rc IS NULL THEN RAISE EXCEPTION 'Riscontro della fattura importata non disponibile';END IF;
  INSERT INTO private.bank_imported_allocations(reconciliation_id,company_id,invoice_id,amount) VALUES(rc,p_company,(e->>'invoice_id')::uuid,(e->>'importo')::numeric);
  SELECT i.external_provider INTO v_provider FROM public.invoices i WHERE i.id=(e->>'invoice_id')::uuid AND i.company_id=p_company FOR UPDATE;
  IF v_provider = 'xml_import' THEN
   -- Il pagamento l'ha già applicato fn_update_invoice_on_payment quando la riga è entrata in
   -- invoice_payments: un secondo += lo conterebbe due volte. Qui si legge e si controlla.
   SELECT coalesce(i.paid_amount,0), i.total INTO paid, v_total FROM public.invoices i WHERE i.id=(e->>'invoice_id')::uuid AND i.company_id=p_company;
  ELSE
   -- Gestionale esterno: il trigger non conta, questo è l'unico conteggio locale.
   UPDATE public.invoices SET paid_amount=coalesce(paid_amount,0)+(e->>'importo')::numeric WHERE id=(e->>'invoice_id')::uuid AND company_id=p_company RETURNING paid_amount,invoices.total INTO paid,v_total;
  END IF;
  IF paid>v_total+0.004 THEN RAISE EXCEPTION 'Le quote superano il residuo della fattura importata';END IF;
  UPDATE public.invoices SET status=CASE WHEN paid>=v_total-0.004 THEN 'paid' ELSE 'issued' END
   WHERE id=(e->>'invoice_id')::uuid AND company_id=p_company AND status NOT IN ('cancelled','credited','draft');
  outrows:=outrows||jsonb_build_array(e||jsonb_build_object('allinea',v_provider IS DISTINCT FROM 'xml_import','saldata',paid>=v_total-0.004));
 END LOOP;
 RETURN p_result||jsonb_build_object('esterne',outrows);
END $function$;