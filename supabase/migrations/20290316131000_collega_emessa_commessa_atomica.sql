SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
-- First association, atomic and idempotent. Existing split allocations are never overwritten.
CREATE OR REPLACE FUNCTION public.collega_emessa_commessa(p_company uuid,p_documento uuid,p_ordine uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d public.documenti_fiscali%rowtype; updated_id uuid;
BEGIN
 IF auth.uid() IS NULL OR public.utente_bloccato() OR NOT public.puo_gestire_documento_fiscale(p_company,'fattura') THEN RAISE EXCEPTION 'Non puoi collegare questa fattura' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.documenti_fiscali WHERE id=p_documento AND company_id=p_company AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fattura non disponibile' USING ERRCODE='42501'; END IF;
 IF d.tipo NOT IN('fattura','fattura_pa','parcella','fattura_accompagnatoria','fattura_riepilogativa','nota_debito') OR d.stato IN('bozza','annullata','stornata') OR coalesce(d.totale_da_pagare,0)<=0 THEN RAISE EXCEPTION 'Collega una fattura emessa con importo positivo'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.orders_visibili WHERE id=p_ordine AND company_id=p_company AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Commessa non disponibile per questa azienda' USING ERRCODE='42501'; END IF;
 IF (d.ordine_id IS NOT NULL AND d.ordine_id<>p_ordine) OR EXISTS(SELECT 1 FROM public.fattura_ordine WHERE fattura_id=d.id AND (ordine_id<>p_ordine OR company_id<>p_company)) THEN RAISE EXCEPTION 'Fattura già collegata: gestisci la ripartizione dal dettaglio, senza duplicare gli importi'; END IF;
 IF EXISTS(SELECT 1 FROM public.fattura_ordine WHERE fattura_id=d.id) THEN
  -- Do not alter an existing partial allocation. Repeating the same request has no side effects.
  RETURN;
 END IF;
 INSERT INTO public.fattura_ordine(company_id,fattura_id,ordine_id,importo_associato,created_by)
 VALUES(p_company,d.id,p_ordine,d.totale_da_pagare,auth.uid());
 UPDATE public.documenti_fiscali SET ordine_id=p_ordine WHERE id=d.id AND company_id=p_company RETURNING id INTO updated_id;
 IF updated_id IS NULL THEN RAISE EXCEPTION 'Collegamento non salvato' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.collega_emessa_commessa(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.collega_emessa_commessa(uuid,uuid,uuid) TO authenticated;
