BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

-- Anche le RPC SECURITY DEFINER devono rispettare la sola lettura. Le vecchie
-- policy di alcune aree finanziarie usavano la visibilità come diritto di scrittura.
CREATE OR REPLACE FUNCTION public.blocca_scrittura_sola_lettura()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_row jsonb; v_company uuid; v_old jsonb; v_new jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL THEN
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
    FOR v_row IN SELECT x FROM unnest(ARRAY[v_old,v_new]) x WHERE x IS NOT NULL LOOP
      IF TG_NARGS=0 THEN
        v_company := nullif(v_row->>'company_id','')::uuid;
      ELSE
        -- Argomenti installati dal catalogo: tabella madre, FK locale, PK madre.
        EXECUTE pg_catalog.format('SELECT company_id FROM public.%I WHERE %I=$1',TG_ARGV[0],TG_ARGV[2])
          INTO v_company USING nullif(v_row->>TG_ARGV[1],'')::uuid;
      END IF;
      IF v_company IS NOT NULL AND public.utente_sola_lettura(v_company) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Il tuo accesso a questa azienda è in sola lettura.';
      END IF;
    END LOOP;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.blocca_scrittura_sola_lettura() FROM PUBLIC,anon,authenticated;

DO $$
DECLARE t record;
BEGIN
  -- Dati economici, preventivi, anagrafiche e personale. Non include accessi,
  -- selezione azienda, contatori o log tecnici: il cambio azienda resta libero.
  FOR t IN
    SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='company_id' AND a.atttypid='uuid'::regtype AND NOT a.attisdropped)
      AND (c.relname ~ '^(bank_|invoice|documenti_fiscali|hr_|quote|article_|supplier_|prima_nota|movimenti_cassa|scadenze)'
           OR c.relname IN ('suppliers','employees','company_costs','external_teams','orders','order_items','giornale_lavori','squadre_componenti','squadre_commesse'))
      AND c.relname !~ '(audit|_log|_counter|_sessions|_sync|_runs|demo_memory|report$)'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS blocco_scrittura_sola_lettura ON public.%I',t.relname);
    EXECUTE format('CREATE TRIGGER blocco_scrittura_sola_lettura BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.blocca_scrittura_sola_lettura()',t.relname);
  END LOOP;

  -- Le righe senza company_id ereditano l'azienda dalla loro testata. Solo FK
  -- UUID semplici verso una testata già protetta con company_id diretto.
  FOR t IN
    SELECT DISTINCT c.relname, p.relname parent_name, a.attname local_key, pa.attname parent_key
    FROM pg_constraint fk
    JOIN pg_class c ON c.oid=fk.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_class p ON p.oid=fk.confrelid
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=fk.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid=p.oid AND pa.attnum=fk.confkey[1]
    WHERE fk.contype='f' AND cardinality(fk.conkey)=1 AND a.atttypid='uuid'::regtype
      AND n.nspname='public' AND c.relkind IN ('r','p')
      AND NOT EXISTS(SELECT 1 FROM pg_attribute ca WHERE ca.attrelid=c.oid AND ca.attname='company_id' AND NOT ca.attisdropped)
      AND EXISTS(SELECT 1 FROM pg_attribute ca WHERE ca.attrelid=p.oid AND ca.attname='company_id' AND ca.atttypid='uuid'::regtype AND NOT ca.attisdropped)
      AND EXISTS(SELECT 1 FROM pg_trigger tr WHERE tr.tgrelid=p.oid AND tr.tgname='blocco_scrittura_sola_lettura')
      AND c.relname !~ '(audit|_log|_counter|_sessions|_sync|_runs|report$)'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I','sola_lettura_'||t.local_key,t.relname);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.blocca_scrittura_sola_lettura(%L,%L,%L)',
      'sola_lettura_'||t.local_key,t.relname,t.parent_name,t.local_key,t.parent_key);
  END LOOP;
END $$;
COMMIT;
