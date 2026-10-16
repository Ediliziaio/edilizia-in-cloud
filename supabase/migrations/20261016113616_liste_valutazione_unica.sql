SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '3s';
-- Preserva firma, owner, ACL e vocabolario delle regole. Nessun cron aggiunto,
-- nessuna riconciliazione eseguita dalla migrazione.
CREATE OR REPLACE FUNCTION public.sincronizza_lista(p_lista uuid)
RETURNS TABLE(aggiunti integer, rimossi integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_regola jsonb; v_azienda uuid; v_agg integer := 0; v_rim integer := 0;
BEGIN
  SELECT regola,company_id INTO v_regola,v_azienda FROM marketing_contact_lists WHERE id=p_lista;
  IF v_regola IS NULL THEN RETURN QUERY SELECT 0,0; RETURN; END IF;
  WITH valutati AS MATERIALIZED (
    SELECT c.id,c.company_id,c.deleted_at,public.contatto_corrisponde_regola(c,v_regola) AS dentro
    FROM marketing_contacts c WHERE c.company_id=v_azienda
    UNION ALL
    -- Conserva anche la semantica storica per eventuali iscrizioni anomale,
    -- senza scansionare le altre aziende o inserirne i contatti.
    SELECT c.id,c.company_id,c.deleted_at,public.contatto_corrisponde_regola(c,v_regola)
    FROM marketing_contact_list_members m JOIN marketing_contacts c ON c.id=m.contact_id
    WHERE m.list_id=p_lista AND c.company_id IS DISTINCT FROM v_azienda
  ), nuovi AS (
    INSERT INTO marketing_contact_list_members(list_id,contact_id)
    SELECT p_lista,id FROM valutati WHERE company_id=v_azienda AND deleted_at IS NULL AND dentro
    ON CONFLICT DO NOTHING RETURNING 1
  ), fuori AS (
    DELETE FROM marketing_contact_list_members m USING valutati c
    WHERE m.list_id=p_lista AND c.id=m.contact_id AND NOT c.dentro RETURNING 1
  )
  SELECT (SELECT count(*)::integer FROM nuovi),(SELECT count(*)::integer FROM fuori) INTO v_agg,v_rim;
  -- Non cambia il conteggio storico: gli orfani vengono puliti separatamente.
  DELETE FROM marketing_contact_list_members m WHERE m.list_id=p_lista
    AND NOT EXISTS(SELECT 1 FROM marketing_contacts c WHERE c.id=m.contact_id);
  UPDATE marketing_contact_lists SET regola_aggiornata_il=now(),updated_at=now() WHERE id=p_lista;
  RETURN QUERY SELECT v_agg,v_rim;
END $$;
