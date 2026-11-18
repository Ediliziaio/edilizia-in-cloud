CREATE OR REPLACE FUNCTION public.allinea_rata_da_fattura()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_saldata boolean;
  v_era_saldata boolean;
  v_emessa_ora boolean := OLD.stato = 'bozza' AND NEW.stato NOT IN ('bozza', 'annullata');
  v_quante integer;
  v_candidata uuid;
BEGIN
  -- Annullata o cancellata: la rata torna libera per un'altra fattura.
  IF NEW.stato IN ('annullata', 'stornata') OR NEW.deleted_at IS NOT NULL THEN
    UPDATE public.order_installments SET documento_fiscale_id = NULL WHERE documento_fiscale_id = NEW.id;
    RETURN NEW;
  END IF;

  v_saldata := NEW.stato = 'pagata'
    OR (coalesce(NEW.totale_da_pagare, 0) > 0 AND coalesce(NEW.importo_pagato, 0) >= NEW.totale_da_pagare - 0.01);
  v_era_saldata := OLD.stato = 'pagata'
    OR (coalesce(OLD.totale_da_pagare, 0) > 0 AND coalesce(OLD.importo_pagato, 0) >= OLD.totale_da_pagare - 0.01);

  -- Emessa per una commessa ma senza rata: si lega alla rata con lo stesso
  -- importo, se è una sola (a pari merito non si indovina).
  IF v_emessa_ora AND NEW.ordine_id IS NOT NULL
     AND NEW.tipo IN ('fattura', 'fattura_pa', 'parcella', 'fattura_accompagnatoria',
                      'acconto_fattura', 'acconto_parcella', 'fattura_differita_b', 'fattura_riepilogativa')
     AND NOT EXISTS (SELECT 1 FROM public.order_installments WHERE documento_fiscale_id = NEW.id) THEN
    SELECT count(*), (array_agg(oi.id))[1] INTO v_quante, v_candidata
      FROM public.order_installments oi
     WHERE oi.order_id = NEW.ordine_id
       AND oi.documento_fiscale_id IS NULL
       AND oi.invoice_id IS NULL
       AND oi.type <> 'financing'
       AND (abs(oi.amount - coalesce(NEW.totale_documento, 0)) <= 0.01
            OR abs(oi.amount - coalesce(NEW.totale_da_pagare, 0)) <= 0.01);
    IF v_quante = 1 THEN
      -- Il trigger della rata allinea i due stati.
      UPDATE public.order_installments SET documento_fiscale_id = NEW.id WHERE id = v_candidata;
      RETURN NEW;
    END IF;
  END IF;

  SELECT id, is_paid, amount INTO r FROM public.order_installments WHERE documento_fiscale_id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- la rata è incassata quando i soldi arrivati sulla fattura coprono la rata (una fattura più
  -- piccola lascia da incassare la differenza)
  IF v_saldata AND NOT r.is_paid AND coalesce(NEW.importo_pagato, 0) >= coalesce(r.amount, 0) - 0.01 THEN
    UPDATE public.order_installments
       SET is_paid = true,
           paid_date = coalesce(
             (SELECT max(m.data_movimento) FROM public.movimenti_cassa_native m
               WHERE m.documento_id = NEW.id AND m.tipo = 'incasso'),
             (now() AT TIME ZONE 'Europe/Rome')::date)
     WHERE id = r.id AND is_paid = false;
  ELSIF NOT v_saldata AND v_era_saldata AND r.is_paid THEN
    UPDATE public.order_installments SET is_paid = false, paid_date = NULL
     WHERE id = r.id AND is_paid = true;
  ELSIF v_emessa_ora AND r.is_paid AND NOT v_saldata THEN
    -- Incassata prima che la fattura esistesse: l'incasso va sulla fattura ora.
    PERFORM public.incassa_fattura_da_rata(r.id);
  END IF;

  RETURN NEW;
END;
$function$
