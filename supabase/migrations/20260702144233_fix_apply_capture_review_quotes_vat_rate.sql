-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- quotes NON ha la colonna vat_rate (l'aliquota vive su quote_items):
-- tolgo vat_rate dall'INSERT INTO quotes della RPC capture review.
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d
    FROM pg_proc WHERE proname = 'silvio_tool_apply_capture_review';
  d := replace(d, 'subtotal, vat_amount, total, vat_rate,', 'subtotal, vat_amount, total,');
  d := replace(d, E'v_vat_rate / 100),\n    v_vat_rate,', 'v_vat_rate / 100),');
  IF d LIKE '%total, vat_rate,%' THEN
    RAISE EXCEPTION 'replace non applicato';
  END IF;
  EXECUTE d;
END $$;
