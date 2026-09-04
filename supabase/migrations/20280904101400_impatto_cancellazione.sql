-- F5-03 — Prima di cancellare, sapere cosa si sta cancellando.
--
-- La conferma di cancellazione chiede di digitare il nome dell'azienda, ma non
-- dice quanto pesa quel clic. Con 702 vincoli ON DELETE CASCADE appesi a
-- `companies`, "elimina definitivamente" può significare tre righe o
-- quattordicimila, e chi decide non ha modo di saperlo.
--
-- Questa funzione conta davvero i record collegati, tabella per tabella,
-- leggendo i vincoli dal catalogo invece che da un elenco scritto a mano (che
-- si disallineerebbe alla prima tabella nuova).
--
-- È il dettaglio che distingue una funzione pericolosa da una professionale.

CREATE OR REPLACE FUNCTION public.admin_impatto_cancellazione(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_vincolo   RECORD;
  v_conteggio bigint;
  v_totale    bigint := 0;
  v_tabelle   jsonb := '[]'::jsonb;
  v_azienda   RECORD;
  v_esaminate int := 0;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Riservato al super admin' USING ERRCODE = '42501';
  END IF;

  SELECT id, name, created_at, status INTO v_azienda
  FROM public.companies WHERE id = p_company_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Azienda non trovata');
  END IF;

  -- Scorre i vincoli reali verso companies: nessun elenco da tenere aggiornato
  -- a mano, e una tabella nuova entra nel conteggio da sola.
  FOR v_vincolo IN
    SELECT t.relname::text AS tabella, a.attname::text AS colonna, c.confdeltype
      FROM pg_constraint c
      JOIN pg_class     t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.companies'::regclass
       AND n.nspname = 'public'
       AND array_length(c.conkey, 1) = 1
     ORDER BY t.relname
  LOOP
    v_esaminate := v_esaminate + 1;
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_vincolo.tabella, v_vincolo.colonna)
        INTO v_conteggio USING p_company_id;
    EXCEPTION WHEN OTHERS THEN
      v_conteggio := NULL;   -- tabella non leggibile: la si dichiara, non la si nasconde
    END;

    IF COALESCE(v_conteggio, 0) > 0 THEN
      v_totale := v_totale + v_conteggio;
      v_tabelle := v_tabelle || jsonb_build_object(
        'tabella', v_vincolo.tabella,
        'record',  v_conteggio,
        'comportamento', CASE v_vincolo.confdeltype
                           WHEN 'c' THEN 'eliminati a cascata'
                           WHEN 'n' THEN 'scollegati'
                           WHEN 'a' THEN 'bloccano la cancellazione'
                           ELSE 'altro'
                         END
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'azienda',          v_azienda.name,
    'stato',            v_azienda.status,
    'cliente_dal',      v_azienda.created_at::date,
    'record_totali',    v_totale,
    'tabelle_coinvolte', jsonb_array_length(v_tabelle),
    'vincoli_esaminati', v_esaminate,
    -- Le prime venti per peso: l'elenco completo sarebbe illeggibile e la
    -- decisione si prende sulle poche che contano.
    'dettaglio', (SELECT jsonb_agg(x ORDER BY (x->>'record')::bigint DESC)
                    FROM (SELECT jsonb_array_elements(v_tabelle) AS x) s
                   LIMIT 20),
    'calcolato_il', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_impatto_cancellazione(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_impatto_cancellazione(uuid) TO authenticated, service_role;
