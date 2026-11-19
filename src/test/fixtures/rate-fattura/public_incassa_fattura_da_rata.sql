CREATE OR REPLACE FUNCTION public.incassa_fattura_da_rata(p_rata_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  d record;
  v_residuo numeric;
BEGIN
  SELECT id, label, paid_date, documento_fiscale_id INTO r
    FROM public.order_installments WHERE id = p_rata_id;
  IF NOT FOUND OR r.documento_fiscale_id IS NULL THEN RETURN; END IF;

  SELECT id, company_id, numero, stato, totale_da_pagare, importo_pagato, metodo_pagamento_codice
    INTO d FROM public.documenti_fiscali
   WHERE id = r.documento_fiscale_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  -- Una bozza non si incassa (lo farà l'emissione); annullate e stornate mai.
  IF d.stato IN ('bozza', 'annullata', 'stornata') THEN RETURN; END IF;
  IF d.stato = 'in_invio' THEN
    RAISE EXCEPTION 'La fattura n. % sta partendo verso lo SDI: riprova tra qualche secondo.', d.numero
      USING ERRCODE = '55006';
  END IF;

  v_residuo := round(coalesce(d.totale_da_pagare, 0) - coalesce(d.importo_pagato, 0), 2);
  IF v_residuo <= 0 THEN RETURN; END IF;

  -- Lo stesso incasso non si conta due volte in prima nota.
  IF EXISTS (SELECT 1 FROM public.prima_nota_entries WHERE installment_id = r.id) THEN
    RAISE EXCEPTION 'La rata «%» ha già un incasso in prima nota: toglilo, e l''incasso lo registra la fattura n. %.',
      coalesce(r.label, 'rata'), d.numero
      USING ERRCODE = '23514';
  END IF;

  PERFORM public.registra_incasso_atomico(
    d.company_id, d.id, v_residuo,
    public.metodo_incasso_da_codice(d.metodo_pagamento_codice),
    coalesce(r.paid_date, (now() AT TIME ZONE 'Europe/Rome')::date),
    'Rata «' || coalesce(r.label, 'rata') || '» della commessa',
    '[RATA:' || r.id::text || ']'
  );
END;
$function$
