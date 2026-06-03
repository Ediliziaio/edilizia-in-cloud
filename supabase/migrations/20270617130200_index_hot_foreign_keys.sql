-- Performance: indici sulle FK NON indicizzate delle tabelle transazionali calde
-- (join frequenti + cascade delete). Additivo e idempotente. Colonne derivate dal
-- catalogo per gestire eventuali FK composite. Solo le FK flaggate dall'advisor.
DO $$
DECLARE r record;
  fk_names text[] := ARRAY[
    'order_items_destination_warehouse_id_fkey','order_items_installation_id_fkey','order_items_receipt_id_fkey','order_items_section_id_fkey','order_items_shipment_id_fkey',
    'stock_units_created_by_fkey','stock_units_installed_by_user_id_fkey','stock_units_lotto_id_fkey','stock_units_reserved_order_id_fkey','stock_units_section_id_fkey','stock_units_supplier_id_fkey','stock_units_warehouse_id_fkey',
    'warehouse_movements_company_id_fkey','warehouse_movements_order_item_id_fkey',
    'invoices_client_id_fkey','invoices_created_by_fkey','invoices_credited_invoice_id_fkey','invoices_order_id_fkey',
    'prima_nota_entries_cost_id_fkey','prima_nota_entries_created_by_fkey','prima_nota_entries_invoice_id_fkey','prima_nota_entries_order_id_fkey','prima_nota_entries_supplier_id_fkey',
    'fv_progetti_created_by_fkey','fv_progetti_opportunita_crm_id_fkey','fv_progetti_ordine_id_fkey','fv_progetti_ultima_modifica_by_fkey','fv_progetti_versione_padre_id_fkey',
    'quote_items_article_template_id_fkey',
    'marketing_contact_notes_company_id_fkey','marketing_contact_notes_contact_id_fkey','marketing_contact_notes_created_by_fkey','marketing_contact_notes_opportunity_id_fkey','fk_notes_created_by',
    'tasks_contact_id_fkey','tasks_cost_id_fkey','tasks_opportunity_id_fkey','tasks_stock_item_id_fkey'
  ];
BEGIN
  FOR r IN
    SELECT con.conname, rel.relname AS tbl,
      (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
       FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
       JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum) AS collist,
      (SELECT string_agg(a.attname, '_' ORDER BY k.ord)
       FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
       JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum) AS colslug
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid
    JOIN pg_namespace ns ON ns.oid=rel.relnamespace
    WHERE con.contype='f' AND ns.nspname='public' AND con.conname = ANY(fk_names)
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)',
                   left('ix_'||r.tbl||'_'||r.colslug, 63), r.tbl, r.collist);
  END LOOP;
END $$;
