-- Stato patrimoniale: stipendi, contributi, ritenute e imposte dell'esercizio alla data (15/11/2026)
--
-- 1. Cedolini. Netto, contributi e ritenute erano un debito solo per i
--    cedolini «emessi», cioè non ancora pagati oggi. Ma:
--    - il netto pagato dopo la data era, alla data, ancora da pagare;
--    - contributi e ritenute non si versano con lo stipendio: vanno con l'F24
--      entro il 16 del mese dopo (art. 18 D.Lgs. 241/97). Al 31/12 i contributi
--      e le ritenute di dicembre sono un debito anche a stipendio pagato.
--    Adesso: netto da pagare se il cedolino è emesso o è stato pagato dopo la
--    data; contributi e ritenute da versare se il cedolino è emesso o se il 16
--    del mese dopo cade oltre la data (gli F24 non sono registrati: alla
--    scadenza si considerano versati).
-- 2. Imposte dell'esercizio. L'utile dello Stato patrimoniale è già al netto
--    di IRES e IRAP stimate, ma il debito per quelle imposte non c'era: tra i
--    debiti tributari vanno le imposte dell'esercizio (OIC 25). Adesso ci sono,
--    fino al mese della data, al lordo degli acconti (che non sono registrati).
--    Restano a parte nel meta (imposte_esercizio) per mostrarle.

do $p$
declare
  vecchio text := pg_get_functiondef('public.cg_get_stato_patrimoniale_riclassificato(uuid,integer,date)'::regprocedure);
  nuovo text := vecchio;
  prima text[] := array[
    $a$  v_iva jsonb;
BEGIN$a$,
    $a$  SELECT (val->>'valore')::numeric INTO v_utile_es
  FROM jsonb_array_elements(
    (public.cg_get_conto_economico_riclassificato(v_company_id, p_anno, 1, EXTRACT(month FROM v_rif)::integer) -> 'voci')
  ) AS val
  WHERE val->>'codice' = 'L'
  LIMIT 1;$a$,
    $a$  SELECT
    COALESCE(sum(COALESCE(c.netto, 0)), 0),
    COALESCE(sum(COALESCE(c.contributi_dipendente, 0) + COALESCE(c.contributi_datore, 0)), 0),
    COALESCE(sum(COALESCE(c.ritenute_irpef, 0)), 0)
  INTO v_debiti_pers, v_debiti_prev, v_ritenute_ced
  FROM public.cedolini c
  WHERE c.company_id = v_company_id
    AND c.stato = 'emesso'
    AND make_date(c.anno, c.mese, 1) <= v_rif;$a$,
    $a$  v_debiti_trib := v_debiti_trib + v_ritenute_ced + COALESCE((v_iva ->> 'debito')::numeric, 0);$a$,
    $a$'iva', v_iva,$a$];
  dopo text[] := array[
    $b$  v_iva jsonb;
  v_imposte_es numeric(14,2) := 0;
BEGIN$b$,
    $b$  -- Utile e imposte dell'esercizio fino al mese della data.
  SELECT max((val->>'valore')::numeric) FILTER (WHERE val->>'codice' = 'L'),
         max((val->>'valore')::numeric) FILTER (WHERE val->>'codice' = '15')
    INTO v_utile_es, v_imposte_es
  FROM jsonb_array_elements(
    (public.cg_get_conto_economico_riclassificato(v_company_id, p_anno, 1, EXTRACT(month FROM v_rif)::integer) -> 'voci')
  ) AS val;
  v_imposte_es := COALESCE(v_imposte_es, 0);$b$,
    $b$  -- Alla data: netto non ancora pagato; contributi e ritenute fino all'F24 del 16 del mese dopo.
  SELECT
    COALESCE(sum(COALESCE(c.netto, 0)) FILTER (
      WHERE c.stato = 'emesso' OR c.data_pagamento > v_rif), 0),
    COALESCE(sum(COALESCE(c.contributi_dipendente, 0) + COALESCE(c.contributi_datore, 0)) FILTER (
      WHERE c.stato = 'emesso' OR (make_date(c.anno, c.mese, 16) + interval '1 month')::date > v_rif), 0),
    COALESCE(sum(COALESCE(c.ritenute_irpef, 0)) FILTER (
      WHERE c.stato = 'emesso' OR (make_date(c.anno, c.mese, 16) + interval '1 month')::date > v_rif), 0)
  INTO v_debiti_pers, v_debiti_prev, v_ritenute_ced
  FROM public.cedolini c
  WHERE c.company_id = v_company_id
    AND c.stato IN ('emesso', 'pagato')
    AND make_date(c.anno, c.mese, 1) <= v_rif;$b$,
    $b$  -- IVA dei periodi non ancora scaduti e imposte dell'esercizio (OIC 25).
  v_debiti_trib := v_debiti_trib + v_ritenute_ced + COALESCE((v_iva ->> 'debito')::numeric, 0) + v_imposte_es;$b$,
    $b$'iva', v_iva,
      'imposte_esercizio', v_imposte_es,$b$];
  i integer;
begin
  if position('v_imposte_es' in nuovo) > 0 then
    return;
  end if;
  for i in 1 .. array_length(prima, 1) loop
    if position(prima[i] in nuovo) = 0 then
      raise exception 'Stato patrimoniale: blocco % non trovato, la funzione è cambiata', i;
    end if;
    nuovo := replace(nuovo, prima[i], dopo[i]);
  end loop;
  execute nuovo;
end $p$;
