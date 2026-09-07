-- Con l'elenco preso dal catalogo il backup di un'azienda sono 628 tabelle.
-- Leggerle una per una via PostgREST, a pagine da mille, significa migliaia di
-- chiamate HTTP per azienda: la edge function non ci sta nel suo tempo
-- massimo, e il cron l'aspetta sessanta secondi.
--
-- Il database le ha tutte a un passo. Qui si costruisce il dump in una sola
-- chiamata: per ogni tabella una query filtrata su company_id, aggregata in
-- JSON, saltando le vuote. Stesso formato di prima — chiave "azienda" e una
-- chiave per tabella — così admin_ripristina_backup lo legge senza sapere
-- chi l'ha scritto.
--
-- L'azienda di piattaforma resta fuori: i suoi 97.000 contatti freddi vengono
-- da un file Excel che esiste ancora, e un dump da decine di megabyte non è un
-- backup, è un problema di trasferimento.

CREATE OR REPLACE FUNCTION public.admin_esporta_azienda(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE
  v_azienda  jsonb;
  v_dump     jsonb;
  v_tabella  text;
  v_righe    jsonb;
  v_n        int;
  v_totale   int := 0;
  v_incluse  int := 0;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND current_user <> 'service_role'
     AND NOT (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role') THEN
    RAISE EXCEPTION 'Riservato al super admin' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(c) INTO v_azienda FROM public.companies c WHERE c.id = p_company_id;
  IF v_azienda IS NULL THEN
    RAISE EXCEPTION 'Azienda % non trovata', p_company_id;
  END IF;
  IF COALESCE((v_azienda ->> 'is_platform_admin_company')::boolean, false) THEN
    RAISE EXCEPTION 'L''azienda di piattaforma non si esporta con questo strumento';
  END IF;

  v_dump := jsonb_build_object('esportato_il', now(), 'azienda', v_azienda, 'elenco_da_catalogo', true);

  FOR v_tabella IN SELECT tabella FROM public.admin_tabelle_da_esportare() LOOP
    BEGIN
      EXECUTE format('SELECT jsonb_agg(to_jsonb(t)), count(*) FROM public.%I t WHERE t.company_id = $1', v_tabella)
         INTO v_righe, v_n USING p_company_id;
      IF v_n > 0 THEN
        v_dump := v_dump || jsonb_build_object(v_tabella, v_righe);
        v_totale := v_totale + v_n;
        v_incluse := v_incluse + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Una tabella che non si legge (tipo diverso, permessi) non ferma il
      -- backup: si dichiara e si va avanti.
      v_dump := v_dump || jsonb_build_object(v_tabella || '__errore', left(SQLERRM, 200));
    END;
  END LOOP;

  RETURN v_dump || jsonb_build_object('tabelle_incluse', v_incluse, 'righe_totali', v_totale);
END; $function$;

REVOKE ALL ON FUNCTION public.admin_esporta_azienda(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_esporta_azienda(uuid) TO service_role;
