-- La tab commessa legge la vista protetta, non la tabella delle rate.
-- Aggiunge le quote alla proiezione esistente conservando filtri, maschere e grant.
-- Ordinata dopo la migrazione che introduce le colonne delle quote.
DO $projection$
DECLARE
  definition text;
  updated_definition text;
  existing_columns integer;
BEGIN
  IF to_regclass('public.order_installments_visibili') IS NULL THEN
    RAISE EXCEPTION 'Vista protetta delle rate non disponibile';
  END IF;
  SELECT count(*) INTO existing_columns FROM information_schema.columns
  WHERE table_schema='public' AND table_name='order_installments_visibili'
    AND column_name IN ('documento_quota_lorda','documento_quota_offset');
  IF existing_columns=2 THEN RETURN; END IF;
  IF existing_columns<>0 THEN RAISE EXCEPTION 'Proiezione quote parziale: verifica la vista'; END IF;

  definition:=pg_get_viewdef('public.order_installments_visibili'::regclass,true);
  IF position('private.office_diritti_commessa_visibile' IN definition)=0
    OR position('private.office_visible_order' IN definition)=0 THEN
    RAISE EXCEPTION 'La vista rate ha cambiato protezioni: verifica prima di aggiornarla';
  END IF;
  updated_definition:=regexp_replace(definition,
    '(\s+FROM (public\.)?order_installments order_installments)',
    E',\n CASE WHEN coalesce((r.rights->>''amounts'')::boolean,false) THEN order_installments.documento_quota_lorda ELSE NULL::numeric END AS documento_quota_lorda,\n CASE WHEN coalesce((r.rights->>''amounts'')::boolean,false) THEN order_installments.documento_quota_offset ELSE NULL::numeric END AS documento_quota_offset\\1',
    'i');
  IF updated_definition=definition THEN RAISE EXCEPTION 'Proiezione rate non riconosciuta'; END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.order_installments_visibili WITH(security_barrier=true) AS '||updated_definition;
END $projection$;
NOTIFY pgrst, 'reload schema';
