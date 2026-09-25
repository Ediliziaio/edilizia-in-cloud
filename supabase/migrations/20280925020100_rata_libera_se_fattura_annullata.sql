-- Rata della commessa e fattura annullata (25/09/2026).
--
-- Dopo 20280925020000: una bozza creata da «Fattura» nella commessa e poi
-- cancellata (stato 'annullata', deleted_at) restava legata alla sua rata, e
-- la fattura giusta non si poteva più collegare («la rata è già collegata a
-- un'altra fattura»). Ora una fattura annullata lascia la rata libera, e il
-- collegamento a mano sostituisce un legame a una fattura annullata.
-- Solo funzioni sostituite.

SET LOCAL lock_timeout = '3s';

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
  IF NEW.stato = 'annullata' OR NEW.deleted_at IS NOT NULL THEN
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

  SELECT id, is_paid INTO r FROM public.order_installments WHERE documento_fiscale_id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_saldata AND NOT r.is_paid THEN
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
$function$;
REVOKE ALL ON FUNCTION public.allinea_rata_da_fattura() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.collega_rata_fattura(p_rata_id uuid, p_documento_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  d record;
BEGIN
  SELECT oi.id, oi.order_id, oi.label, oi.documento_fiscale_id, o.company_id INTO r
    FROM public.order_installments oi JOIN public.orders o ON o.id = oi.order_id
   WHERE oi.id = p_rata_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rata non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF public.user_can_access_company(r.company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT id, company_id, ordine_id, numero, tipo INTO d
    FROM public.documenti_fiscali
   WHERE id = p_documento_id AND deleted_at IS NULL AND stato <> 'annullata';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fattura non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF d.company_id <> r.company_id THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF d.tipo NOT IN ('fattura', 'fattura_pa', 'parcella', 'fattura_accompagnatoria',
                    'acconto_fattura', 'acconto_parcella', 'fattura_differita_b', 'fattura_riepilogativa') THEN
    RAISE EXCEPTION 'A una rata si collega una fattura, non questo documento.' USING ERRCODE = '22023';
  END IF;
  IF d.ordine_id IS NOT NULL AND d.ordine_id <> r.order_id THEN
    RAISE EXCEPTION 'La fattura n. % è di un''altra commessa.', d.numero USING ERRCODE = '22023';
  END IF;

  IF r.documento_fiscale_id = p_documento_id THEN RETURN; END IF;
  -- Già legata a una fattura viva: prima si scollega. Una annullata si sostituisce.
  IF r.documento_fiscale_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.documenti_fiscali x
        WHERE x.id = r.documento_fiscale_id AND x.deleted_at IS NULL AND x.stato <> 'annullata') THEN
    RAISE EXCEPTION 'La rata «%» è già collegata a un''altra fattura: scollegala prima.', coalesce(r.label, 'rata')
      USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_installments WHERE documento_fiscale_id = p_documento_id) THEN
    RAISE EXCEPTION 'La fattura n. % è già collegata a un''altra rata.', d.numero USING ERRCODE = '23505';
  END IF;

  IF d.ordine_id IS NULL THEN
    UPDATE public.documenti_fiscali SET ordine_id = r.order_id WHERE id = d.id;
  END IF;
  -- Il trigger della rata allinea incassi e stati.
  UPDATE public.order_installments SET documento_fiscale_id = d.id WHERE id = r.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.collega_rata_fattura(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collega_rata_fattura(uuid, uuid) TO authenticated, service_role;
