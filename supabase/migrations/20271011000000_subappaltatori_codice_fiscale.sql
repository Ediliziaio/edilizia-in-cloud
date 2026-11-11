-- Codice Fiscale per la scheda subappaltatore (subappaltatori_sicurezza).
-- Campo ad hoc richiesto: molte ditte individuali edili hanno solo il CF
-- (o CF ≠ P.IVA). Affianca `pec` già presente. Esposto nella vista dashboard.

ALTER TABLE public.subappaltatori_sicurezza
  ADD COLUMN IF NOT EXISTS codice_fiscale text;

-- Vista dashboard: aggiunge codice_fiscale IN CODA (CREATE OR REPLACE non
-- consente di riordinare le colonne esistenti). Definizione invariata altrove.
-- Preserve existing ordinals, grants and dependent views while appending new fields.
DO $stable_view$ DECLARE definition text:=$view_query$SELECT ss.id,
    ss.company_id,
    ss.order_id,
    ss.ragione_sociale,
    ss.tipo_lavori,
    ss.responsabile,
    ss.telefono,
    ss.piva,
    ss.email,
    ss.pec,
    ss.indirizzo,
    ss.note,
    ss.campo_subappaltatore_id,
    sc.user_id AS campo_user_id,
    sc.user_email AS campo_user_email,
    COALESCE(sc.is_active, false) AS campo_is_active,
    ss.durc_scadenza,
    cs.id AS contratto_id,
    cs.importo_contrattuale,
    cs.ritenuta_garanzia_pct,
    cs.stato AS stato_contratto,
    COALESCE(sum(sal.importo_lordo), 0::numeric) AS totale_sal_lordo,
    COALESCE(sum(sal.importo_netto), 0::numeric) AS totale_sal_netto,
    COALESCE(sum(rg.importo) FILTER (WHERE rg.stato = 'trattenuta'::text), 0::numeric) AS ritenute_in_corso,
    COALESCE(sum(rg.importo) FILTER (WHERE rg.stato = 'svincolata'::text), 0::numeric) AS ritenute_svincolate,
    COALESCE(cs.importo_contrattuale, 0::numeric) - COALESCE(sum(sal.importo_lordo), 0::numeric) AS residuo_contrattuale,
    ss.codice_fiscale
   FROM subappaltatori_sicurezza ss
     LEFT JOIN subappaltatori sc ON sc.id = ss.campo_subappaltatore_id
     LEFT JOIN contratti_subappalto cs ON cs.subappaltatore_id = ss.id
     LEFT JOIN sal_subappaltatori sal ON sal.contratto_id = cs.id
     LEFT JOIN ritenute_garanzia rg ON rg.contratto_id = cs.id
  GROUP BY ss.id, cs.id, sc.user_id, sc.user_email, sc.is_active$view_query$; col record; names text[]:='{}'; fields text[]:='{}';
BEGIN
 EXECUTE 'CREATE TEMP VIEW pg_temp._replay_v_subappaltatori_dashboard AS '||definition;
 FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=to_regclass('public.v_subappaltatori_dashboard') AND attnum>0 AND NOT attisdropped ORDER BY attnum LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='pg_temp._replay_v_subappaltatori_dashboard'::regclass AND attname=col.attname AND attnum>0 AND NOT attisdropped) THEN RAISE EXCEPTION 'Colonna preesistente assente dalla nuova vista: %',col.attname;END IF;
  names:=array_append(names,col.attname);fields:=array_append(fields,format('q.%I',col.attname));
 END LOOP;
 FOR col IN SELECT attname FROM pg_attribute WHERE attrelid='pg_temp._replay_v_subappaltatori_dashboard'::regclass AND attnum>0 AND NOT attisdropped AND NOT(attname=any(names)) ORDER BY attnum LOOP
  fields:=array_append(fields,format('q.%I',col.attname));
 END LOOP;
 EXECUTE 'CREATE OR REPLACE VIEW public.v_subappaltatori_dashboard WITH (security_invoker=true) AS SELECT '||array_to_string(fields,',')||' FROM ('||definition||') q';
 DROP VIEW pg_temp._replay_v_subappaltatori_dashboard;
END $stable_view$;
