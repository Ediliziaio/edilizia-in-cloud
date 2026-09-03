-- `silvio_tool_lista_scadenze` unisce tre fonti — fatture del CRM, fatture
-- fiscali, rate delle commesse — e poi taglia:
--     FROM (SELECT * FROM unificate ORDER BY scadenza ASC LIMIT 100) sub
--
-- Ordinando dalla più vecchia, se una sola fonte ha cento scadenze arretrate
-- si prende tutti e cento i posti e le altre due spariscono. Non è teoria:
-- sull'azienda demo la funzione restituiva
--     {"fatture_crm": 100, "fatture_fiscali": 0, "rate_commesse": 0}
-- con la centesima scaduta il 2025-02-19. Qualunque fattura fiscale o rata di
-- commessa con scadenza successiva era invisibile. L'assistente che risponde
-- «cosa scade?» non le nominava mai, e non aveva modo di sapere che mancavano.
--
-- Il taglio serve — la lista deve restare limitata — ma va fatto per fonte,
-- non a caso.
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.silvio_tool_lista_scadenze(uuid,uuid,integer,boolean)'::regprocedure);
  n := replace(d,
    'FROM (SELECT * FROM unificate ORDER BY scadenza ASC LIMIT 100) sub;',
    'FROM (
    SELECT * FROM (
      SELECT u.*, row_number() OVER (PARTITION BY u.fonte ORDER BY u.scadenza ASC) AS posto
        FROM unificate u
    ) z
    WHERE z.posto <= 100          -- al massimo cento per fonte: nessuna resta fuori
    ORDER BY z.scadenza ASC
    LIMIT 300
  ) sub;');
  IF n = d AND d NOT LIKE '%z.posto <= 100%' THEN
    RAISE EXCEPTION 'il taglio a cento non e stato trovato in lista_scadenze';
  END IF;
  IF n <> d THEN EXECUTE n; END IF;
END $$;
