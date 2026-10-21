-- ════════════════════════════════════════════════════════════════════════════
-- Liquidazione IVA: le integrazioni del reverse charge (TD16-TD19) nei due lati
-- ════════════════════════════════════════════════════════════════════════════
-- Chi riceve una fattura in reverse charge (subappalto edile, N6.3/N6.7) la
-- integra con un documento TD16; per gli acquisti dall'estero TD17-TD19.
-- L'IVA di quel documento è a debito (vendite) e, insieme, detraibile
-- (acquisti): il saldo del periodo non cambia, ma le due colonne sì.
-- Prima la TD16 non entrava da nessuna parte, e le TD17-19 solo tra le vendite,
-- così il reverse charge sui subappalti spariva e quello estero diventava IVA
-- da versare.
-- Stessa regola della pagina Registro IVA. Sostituzioni esatte sulla
-- definizione in uso: se il testo non corrisponde, la migrazione si ferma.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  d text := pg_get_functiondef('public.liquidazione_iva_periodo(uuid,text,integer,integer,integer)'::regprocedure);
  a text;
  b text;
BEGIN
  IF position('reverse_charge_interno' in d) > 0 THEN
    RAISE NOTICE 'Già aggiornata';
    RETURN;
  END IF;

  a := $a$'integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue'];$a$;
  b := $b$'integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue',
    'reverse_charge_interno'];
  -- Le integrazioni: la loro IVA è anche detraibile, quindi entrano pure negli acquisti.
  v_tipi_integrazione text[] := ARRAY[
    'reverse_charge_interno','integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue'];$b$;
  IF position(a in d) = 0 THEN RAISE EXCEPTION 'Testo non trovato: elenco tipi vendite'; END IF;
  d := replace(d, a, b);

  a := $a$  acq_segno AS (
    SELECT aliquota,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imponibile AS imponibile,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imposta    AS imposta
    FROM acq_righe
  ),$a$;
  b := $b$  acq_segno AS (
    SELECT aliquota,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imponibile AS imponibile,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imposta    AS imposta
    FROM acq_righe
    UNION ALL
    -- Il riflesso delle integrazioni: stessa IVA delle vendite, nello stesso periodo.
    SELECT r.aliquota, r.imponibile, r.imposta
    FROM vend_righe r
    JOIN public.documenti_fiscali d ON d.id = r.id
    WHERE d.tipo = ANY(v_tipi_integrazione)
  ),$b$;
  IF position(a in d) = 0 THEN RAISE EXCEPTION 'Testo non trovato: acq_segno'; END IF;
  d := replace(d, a, b);

  a := $a$      (SELECT count(*) FROM acq_doc)  AS n_acquisti,$a$;
  b := $b$      (SELECT count(*) FROM acq_doc)
        + (SELECT count(*) FROM vend_doc v JOIN public.documenti_fiscali d ON d.id = v.id
           WHERE d.tipo = ANY(v_tipi_integrazione)) AS n_acquisti,$b$;
  IF position(a in d) = 0 THEN RAISE EXCEPTION 'Testo non trovato: conteggio acquisti'; END IF;
  d := replace(d, a, b);

  EXECUTE d;
END $$;
