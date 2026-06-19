-- Motore di applicazione regole di categorizzazione movimenti bancari.
-- Per ogni transazione non categorizzata applica la regola attiva di priorità più
-- alta che combacia (match su descrizione/creditore/debitore × contiene/uguale/inizia).
-- SECURITY INVOKER: rispetta la RLS di bank_transactions (admin azienda / service role).
CREATE OR REPLACE FUNCTION public.apply_bank_categorization_rules(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int := 0;
  r record;
  t record;
  hay text;
  needle text;
  ok boolean;
BEGIN
  FOR t IN
    SELECT id,
           coalesce(description,'') AS d,
           coalesce(creditor_name,'') AS c,
           coalesce(debtor_name,'') AS db
    FROM public.bank_transactions
    WHERE company_id = p_company_id
      AND (category IS NULL OR category = 'Non categorizzata')
  LOOP
    FOR r IN
      SELECT * FROM public.bank_categorization_rules
      WHERE company_id = p_company_id AND coalesce(auto_apply, true) = true
      ORDER BY priority ASC, created_at ASC
    LOOP
      ok := false;
      FOREACH hay IN ARRAY (
        CASE r.match_field
          WHEN 'description'   THEN ARRAY[t.d]
          WHEN 'creditor_name' THEN ARRAY[t.c]
          WHEN 'debtor_name'   THEN ARRAY[t.db]
          ELSE ARRAY[t.d, t.c, t.db]
        END
      )
      LOOP
        needle := r.match_value;
        IF NOT coalesce(r.is_case_sensitive, false) THEN
          hay := lower(hay); needle := lower(needle);
        END IF;
        IF needle <> '' THEN
          ok := CASE coalesce(r.match_type, 'contains')
            WHEN 'equals'      THEN hay = needle
            WHEN 'starts_with' THEN left(hay, length(needle)) = needle
            ELSE position(needle IN hay) > 0
          END;
        END IF;
        EXIT WHEN ok;
      END LOOP;

      IF ok THEN
        UPDATE public.bank_transactions
          SET category = r.category, category_icon = r.category_icon
          WHERE id = t.id;
        v_count := v_count + 1;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_bank_categorization_rules(uuid) TO authenticated, service_role;
