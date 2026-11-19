SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
-- Il conto è parte del pagamento effettivo. La riconciliazione resta una prova
-- distinta, collegabile in seguito senza creare un'altra uscita.
CREATE OR REPLACE FUNCTION public.registra_pagamento_costo_con_conto(
  p_costo uuid,p_richiesta uuid,p_importo numeric,p_data date,p_metodo text,p_riferimento text,
  p_conto_banca uuid DEFAULT NULL,p_conto_liquidita uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE c public.company_costs; p public.prima_nota_entries; risultato jsonb;
BEGIN
  SELECT * INTO c FROM public.company_costs WHERE id=p_costo;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Costo non disponibile' USING ERRCODE='42501'; END IF;
  PERFORM public.spesa_pagamento_autorizza(c.company_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(c.company_id::text,2810));
  IF p_conto_banca IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bank_accounts_operativi b
      WHERE b.id=p_conto_banca AND b.company_id=c.company_id AND b.is_active) THEN
    RAISE EXCEPTION 'Il conto bancario non è attivo per questa azienda' USING ERRCODE='23514';
  END IF;
  SELECT * INTO p FROM public.prima_nota_entries WHERE company_id=c.company_id AND payment_request_id=p_richiesta;
  IF p.id IS NOT NULL AND (p.bank_account_id IS DISTINCT FROM p_conto_banca OR p.conto_liquidita_id IS DISTINCT FROM p_conto_liquidita) THEN
    RAISE EXCEPTION 'Richiesta già usata con un conto diverso' USING ERRCODE='PT409';
  END IF;
  risultato:=public.registra_pagamento_costo(p_costo,p_richiesta,p_importo,p_data,p_metodo,p_riferimento,NULL,NULL);
  IF risultato->>'prima_nota_id' IS NOT NULL THEN
    UPDATE public.prima_nota_entries SET bank_account_id=p_conto_banca,conto_liquidita_id=p_conto_liquidita,
      account_label=CASE WHEN p_metodo IN('contanti','cash','MP01') THEN 'cassa' ELSE 'banca' END
      WHERE company_id=c.company_id AND cost_id=c.id AND id=(risultato->>'prima_nota_id')::uuid;
  END IF;
  RETURN risultato;
END $function$;
REVOKE ALL ON FUNCTION public.registra_pagamento_costo_con_conto(uuid,uuid,numeric,date,text,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registra_pagamento_costo_con_conto(uuid,uuid,numeric,date,text,text,uuid,uuid) TO authenticated;

DO $migration$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.dettaglio_pagamento_costo(uuid)'::regprocedure) INTO v_def;
  IF strpos(v_def,'''conto'',p.account_label')=0 THEN
    IF strpos(v_def,'''storno_di'',p.reversal_of')=0 THEN RAISE EXCEPTION 'Dettaglio dei pagamenti inatteso';END IF;
    EXECUTE replace(v_def,'''storno_di'',p.reversal_of',
      '''storno_di'',p.reversal_of,''conto'',p.account_label,''metodo'',p.payment_method');
  END IF;
END $migration$;
