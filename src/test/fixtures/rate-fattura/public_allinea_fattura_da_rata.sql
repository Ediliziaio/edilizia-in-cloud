CREATE OR REPLACE FUNCTION public.allinea_fattura_da_rata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d record;
  v_saldata boolean;
  v_legame_nuovo boolean := NEW.documento_fiscale_id IS DISTINCT FROM OLD.documento_fiscale_id;
  v_tag text := '[RATA:' || NEW.id::text || ']';
  v_mov uuid;
BEGIN
  IF NEW.documento_fiscale_id IS NULL THEN RETURN NEW; END IF;
  IF NOT v_legame_nuovo AND NEW.is_paid IS NOT DISTINCT FROM OLD.is_paid THEN RETURN NEW; END IF;

  SELECT id, company_id, numero, stato, totale_da_pagare, importo_pagato
    INTO d FROM public.documenti_fiscali
   WHERE id = NEW.documento_fiscale_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_saldata := d.stato = 'pagata'
    OR (coalesce(d.totale_da_pagare, 0) > 0 AND coalesce(d.importo_pagato, 0) >= d.totale_da_pagare - 0.01);

  IF NEW.is_paid AND NOT v_saldata THEN
    -- Rata incassata (o legata già incassata): l'incasso va sulla fattura.
    PERFORM public.incassa_fattura_da_rata(NEW.id);

  ELSIF NOT NEW.is_paid AND v_saldata THEN
    IF v_legame_nuovo AND coalesce(d.importo_pagato, 0) >= coalesce(NEW.amount, 0) - 0.01 THEN
      -- Legata ora a una fattura già pagata: la rata risulta incassata.
      UPDATE public.order_installments
         SET is_paid = true,
             paid_date = coalesce(
               (SELECT max(m.data_movimento) FROM public.movimenti_cassa_native m
                 WHERE m.documento_id = d.id AND m.tipo = 'incasso'),
               (now() AT TIME ZONE 'Europe/Rome')::date)
       WHERE id = NEW.id;
    ELSIF OLD.is_paid THEN
      -- Tolta da incassata: via gli incassi che aveva registrato lei. Se la
      -- fattura è pagata con altri incassi, qui non si decide niente.
      IF NOT EXISTS (SELECT 1 FROM public.movimenti_cassa_native m
                      WHERE m.documento_id = d.id AND m.tipo = 'incasso' AND m.note LIKE '%' || v_tag || '%') THEN
        RAISE EXCEPTION 'La rata «%» è incassata con la fattura n. %: per segnarla da incassare togli l''incasso dal registro incassi della fattura.',
          coalesce(NEW.label, 'rata'), d.numero
          USING ERRCODE = '23514';
      END IF;
      FOR v_mov IN SELECT m.id FROM public.movimenti_cassa_native m
                    WHERE m.documento_id = d.id AND m.tipo = 'incasso' AND m.note LIKE '%' || v_tag || '%' LOOP
        PERFORM public.storna_incasso_atomico(d.company_id, v_mov);
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
