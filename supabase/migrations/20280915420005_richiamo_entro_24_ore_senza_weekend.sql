-- Il tempo di richiamo concordato col titolare e' 24 ore, sabato e domenica
-- esclusi. La regola R4 era tarata su 4 ore: su un servizio che promette 24 ore
-- suonava quasi ogni giorno, e un allarme che suona sempre non lo guarda piu'
-- nessuno.
--
-- Due cose cambiano.
--
-- 1. La soglia della regola: da 240 a 1440 minuti. E' un solo numero dentro
--    mkt_valuta_regole (13 kB): riscrivere qui tutta la funzione seppellirebbe
--    la modifica vera dentro una diff illeggibile, quindi la sostituzione e'
--    fatta sul testo della funzione gia' installata. E' idempotente: se il 240
--    non c'e' piu', non fa niente.
--
-- 2. L'orario di servizio dei clienti marketing: prima era 08:30-19:00 nei
--    feriali piu' il sabato mattina. Ora il cronometro gira TUTTO il giorno dal
--    lunedi al venerdi e si ferma nel fine settimana, che e' esattamente cosa
--    vuol dire «24 ore, non nel weekend». Lo stesso orario governa anche i lead
--    fermi: un lead arrivato sabato non risulta piu' abbandonato di domenica.

DO $migrazione$
DECLARE
  v_def text;
  v_nuova text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'mkt_valuta_regole';

  IF v_def IS NULL THEN
    RAISE NOTICE 'mkt_valuta_regole non trovata: niente da aggiornare';
    RETURN;
  END IF;

  v_nuova := replace(
    replace(v_def,
      'h.mediana_primo_contatto_min_7g > 240',
      'h.mediana_primo_contatto_min_7g > 1440'),
    'mediana di risposta oltre 4 ore per %s giorni su 7 (oggi %s min)',
    'richiamo oltre 24 ore per %s giorni su 7 (oggi %s minuti)');

  IF v_nuova <> v_def THEN
    EXECUTE v_nuova;
  END IF;
END $migrazione$;

UPDATE public.mkt_regole
   SET nome = 'Richiamo oltre 24 ore per 3 giorni su 7'
 WHERE id = 'R4' AND nome <> 'Richiamo oltre 24 ore per 3 giorni su 7';

-- L'orario di servizio: feriali interi, weekend fermo.
UPDATE public.aedix_service_clients sc
   SET mkt_orario_servizio = '{"lun_ven":["00:00","23:59"],"sab":null,"dom":null}'::jsonb,
       updated_at = now()
  FROM public.aedix_product_lines l
 WHERE l.id = sc.product_line_id
   AND l.categoria IN ('agenzia', 'performance')
   AND sc.mkt_orario_servizio <> '{"lun_ven":["00:00","23:59"],"sab":null,"dom":null}'::jsonb;
