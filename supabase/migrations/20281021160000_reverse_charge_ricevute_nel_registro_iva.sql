-- ════════════════════════════════════════════════════════════════════════════
-- Reverse charge delle fatture ricevute nel registro IVA (art. 17 c. 6 DPR 633)
-- ════════════════════════════════════════════════════════════════════════════
-- Il subappaltatore edile fattura senza IVA (natura N6.x): l'IVA la integra chi
-- riceve, annotandola nel registro delle vendite (a debito) e in quello degli
-- acquisti (a credito). Per il reverse charge interno basta l'annotazione nei
-- registri, senza mandare una TD16 allo SDI. Prima il registro e la
-- liquidazione vedevano quelle fatture a IVA zero, e l'integrazione mancava.
--
--   fatture_ricevute.aliquota_reverse_charge  l'aliquota con cui si integra:
--     vuota = 22%; 10% per i lavori di manutenzione sulle abitazioni, 4%…
--
-- Ogni riga N6.x di una fattura ricevuta entra nei due lati, nel periodo di
-- detrazione della fattura. Il saldo non cambia; le due colonne sì.
-- Sostituzioni esatte sulla definizione in uso. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.fatture_ricevute
  ADD COLUMN IF NOT EXISTS aliquota_reverse_charge numeric(5,2);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fatture_ricevute_aliquota_rc_valida') THEN
    ALTER TABLE public.fatture_ricevute ADD CONSTRAINT fatture_ricevute_aliquota_rc_valida
      CHECK (aliquota_reverse_charge IS NULL OR aliquota_reverse_charge IN (4, 5, 10, 22)) NOT VALID;
  END IF;
END $$;
COMMENT ON COLUMN public.fatture_ricevute.aliquota_reverse_charge IS
  'Aliquota con cui si integra nei registri una fattura in reverse charge (natura N6.x). Vuota = 22%.';

CREATE OR REPLACE VIEW public.fatture_ricevute_periodo_iva WITH (security_invoker = true) AS
 SELECT id,
    company_id,
    numero_fattura,
    data_fattura,
    data_ricezione_sdi,
    data_detrazione_iva(data_fattura, data_ricezione_sdi) AS data_detrazione,
    tipo_documento,
    cedente_ragione_sociale,
    imponibile_totale,
    iva_totale,
    totale_documento,
    riepilogo_iva,
    stato,
    aliquota_reverse_charge
   FROM fatture_ricevute f;

DO $$
DECLARE
  d text := pg_get_functiondef('public.liquidazione_iva_periodo(uuid,text,integer,integer,integer)'::regprocedure);
  a text;
  b text;
BEGIN
  IF position('aliquota_reverse_charge' in d) > 0 THEN
    RAISE NOTICE 'Già aggiornata';
    RETURN;
  END IF;

  a := $a$           f.imponibile_totale, f.iva_totale, f.riepilogo_iva,
           (f.data_ricezione_sdi IS NULL) AS senza_ricezione$a$;
  b := $b$           f.imponibile_totale, f.iva_totale, f.riepilogo_iva,
           coalesce(f.aliquota_reverse_charge, 22) AS aliquota_rc,
           (f.data_ricezione_sdi IS NULL) AS senza_ricezione$b$;
  IF position(a in d) = 0 THEN RAISE EXCEPTION 'Testo non trovato: acq_doc'; END IF;
  d := replace(d, a, b);

  -- I totali e il dettaglio leggono vendite e acquisti con le integrazioni.
  d := replace(d, ' FROM vend_segno', ' FROM vend_tutte');
  d := replace(d, ' FROM acq_segno', ' FROM acq_tutte');

  a := $a$  tot AS ($a$;
  b := $b$  -- Reverse charge delle ricevute (N6.x): l'IVA integrata, uguale nei due lati.
  rc AS (
    SELECT rtrim(rtrim(a.aliquota_rc::text, '0'), '.') AS aliquota,
           CASE WHEN a.nota_credito THEN -1 ELSE 1 END * abs(public.num_da_json(r.value ->> 'imponibile')) AS imponibile,
           CASE WHEN a.nota_credito THEN -1 ELSE 1 END
             * round(abs(public.num_da_json(r.value ->> 'imponibile')) * a.aliquota_rc / 100, 2) AS imposta
    FROM acq_doc a
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(a.riepilogo_iva, '[]'::jsonb)) r
    WHERE upper(coalesce(r.value ->> 'natura', '')) LIKE 'N6%'
  ),
  vend_tutte AS (
    SELECT aliquota, esigibilita, imponibile, imposta FROM vend_segno
    UNION ALL
    SELECT aliquota, 'I', imponibile, imposta FROM rc
  ),
  acq_tutte AS (
    SELECT aliquota, imponibile, imposta FROM acq_segno
    UNION ALL
    SELECT aliquota, imponibile, imposta FROM rc
  ),
  tot AS ($b$;
  IF position(a in d) = 0 THEN RAISE EXCEPTION 'Testo non trovato: tot'; END IF;
  d := replace(d, a, b);

  EXECUTE d;
END $$;
