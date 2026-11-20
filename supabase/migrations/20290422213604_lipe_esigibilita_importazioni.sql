-- Le fatture emesse importate possono avere le aliquote e gli imponibili
-- ma non l'esigibilità delle righe. Il prospetto gestionale usa I come fallback.
-- Per la LIPE occorre invece verificare queste fatture sul registro IVA.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $patch$
DECLARE
  periodo text := pg_get_functiondef('public.liquidazione_iva_periodo(uuid,text,integer,integer,integer)'::regprocedure);
  righi text := pg_get_functiondef('public.liquidazione_iva_righi(uuid,integer,integer,jsonb)'::regprocedure);
  prima text;
BEGIN
  IF position('vendite_importate_da_verificare' IN periodo) = 0 THEN
    prima := periodo;
    periodo := replace(periodo, $prima$    SELECT d.id, d.numero, d.data_emissione,$prima$,
      $dopo$    SELECT d.id, d.numero, d.data_emissione, d.origine,$dopo$);
    IF periodo = prima THEN RAISE EXCEPTION 'LIPE: origine delle fatture emesse non trovata'; END IF;

    prima := periodo;
    periodo := replace(periodo, $prima$      'integrazioni_senza_originale',$prima$,
      $dopo$      'vendite_importate_da_verificare', EXISTS (
        SELECT 1
          FROM vend_doc v
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN public.iva_ha_riepilogo(v.riepilogo_iva) THEN v.riepilogo_iva ELSE '[]'::jsonb END
          ) riepilogo
         WHERE v.origine = 'importata'
           AND coalesce(public.num_da_json(riepilogo.value ->> 'imposta'), 0) <> 0
           AND upper(coalesce(riepilogo.value ->> 'esigibilita', '')) NOT IN ('I', 'D', 'S')
      ),
      'integrazioni_senza_originale',$dopo$);
    IF periodo = prima THEN RAISE EXCEPTION 'LIPE: totali delle fatture emesse non trovati'; END IF;
    EXECUTE periodo;
  END IF;

  IF position('vendite_importate_da_verificare' IN righi) = 0 THEN
    prima := righi;
    righi := replace(righi, $prima$    WHEN coalesce((b #>> '{lipe,esigibilita_differita}')::boolean, false) THEN$prima$,
      $dopo$    WHEN coalesce((b #>> '{lipe,vendite_importate_da_verificare}')::boolean, false)
      THEN 'Per alcune fatture di vendita importate manca l’esigibilità IVA. Verifica i totali sul Registro IVA.'
    WHEN coalesce((b #>> '{lipe,esigibilita_differita}')::boolean, false) THEN$dopo$);
    IF righi = prima THEN RAISE EXCEPTION 'LIPE: controllo esigibilità non trovato'; END IF;
    EXECUTE righi;
  END IF;
END $patch$;
