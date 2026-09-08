-- Seconda migrazione della stessa famiglia della 20280911100007 (modulo FV).
-- Audit del 7 settembre 2026 su TUTTE le tabelle che l'app cancella (239):
-- restavano tre percorsi che finivano in un errore Postgres grezzo a schermo,
-- provati con DO block + rollback:
--
--  1. COMMESSA senza fatture ma con un movimento di magazzino ->
--     "violates foreign key constraint warehouse_movements_order_id_fkey".
--     delete_order_cascading blocca con un messaggio chiaro solo su fatture,
--     costi e scadenze; cinque chiavi verso orders erano al default.
--  2. UTENTE dello staff che ha scritto note o registrato attivita' CRM ->
--     "violates foreign key constraint fk_activities_created_by". Centosette
--     puntatori "chi l'ha fatto" verso profiles/auth.users al default.
--  3. CLIENTE con commesse: orders.customer_id era ON DELETE CASCADE, quindi
--     cancellare il login del cliente cancellava le commesse dell'azienda
--     (o si inchiodava sulle fatture). La commessa e' un documento
--     dell'azienda: sopravvive al cliente, con nome e contatti copiati dentro.
--
-- Regola, la stessa della migrazione precedente:
--   · un puntatore a chi ha fatto/creato/approvato -> SET NULL
--   · cio' che appartiene alla commessa (SAL subappaltatori, consegne) -> CASCADE
--   · cio' che e' un riferimento di comodo (default, log, correlati) -> SET NULL
-- Restano BLOCCANTI di proposito, con controllo e messaggio nell'app:
-- fatture->commessa, ordini d'acquisto->fornitore, movimenti->articolo di
-- magazzino, trasferimenti->magazzino, listino->tipi impianto/intervento,
-- rilievi->template, piani->abbonamento. Restano NOT NULL e bloccanti
-- campo_rapportini.user_id e campo_timbrature.user_id: un rapportino o una
-- timbratura senza persona non ha senso, l'utente va disattivato, non
-- cancellato (la edge function delete-company-user lo dice in chiaro).

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- ── 3. La commessa sopravvive al cliente: prima la copia dei dati ─────────
UPDATE public.orders o
   SET client_name    = coalesce(nullif(o.client_name, ''), nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '')),
       client_email   = coalesce(nullif(o.client_email, ''), p.email),
       client_phone   = coalesce(nullif(o.client_phone, ''), p.phone),
       client_company = coalesce(nullif(o.client_company, ''), p.business_name),
       client_address = coalesce(nullif(o.client_address, ''), p.address)
  FROM public.profiles p
 WHERE p.id = o.customer_id
   AND (nullif(o.client_name, '') IS NULL
     OR nullif(o.client_email, '') IS NULL
     OR nullif(o.client_phone, '') IS NULL
     OR nullif(o.client_company, '') IS NULL
     OR nullif(o.client_address, '') IS NULL);

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Il ticket e' storia dell'assistenza dell'azienda, non del login del cliente.
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_customer_id_fkey;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ── 1. Le cinque chiavi verso orders lasciate al default ────────────────────
ALTER TABLE public.warehouse_movements DROP CONSTRAINT IF EXISTS warehouse_movements_order_id_fkey;
ALTER TABLE public.warehouse_movements ADD CONSTRAINT warehouse_movements_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE public.campo_timbrature DROP CONSTRAINT IF EXISTS campo_timbrature_order_id_fkey;
ALTER TABLE public.campo_timbrature ADD CONSTRAINT campo_timbrature_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE public.commercial_proposals DROP CONSTRAINT IF EXISTS commercial_proposals_resulted_in_order_id_fkey;
ALTER TABLE public.commercial_proposals ADD CONSTRAINT commercial_proposals_resulted_in_order_id_fkey
  FOREIGN KEY (resulted_in_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE public.sal_subappaltatori DROP CONSTRAINT IF EXISTS sal_subappaltatori_order_id_fkey;
ALTER TABLE public.sal_subappaltatori ADD CONSTRAINT sal_subappaltatori_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE public.site_deliveries DROP CONSTRAINT IF EXISTS site_deliveries_order_id_fkey;
ALTER TABLE public.site_deliveries ADD CONSTRAINT site_deliveries_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

-- ── 2. "Chi l'ha fatto" non deve tenere in ostaggio la riga ──────────────────
-- Otto colonne erano NOT NULL senza una riga dentro: diventano facoltative,
-- perche' una foto, un carico o una versione devono sopravvivere all'autore.
ALTER TABLE public.marketing_contact_notes ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.dashboard_versions      ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.entity_attachments      ALTER COLUMN attached_by DROP NOT NULL;
ALTER TABLE public.foto_cantiere           ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE public.goods_receipts          ALTER COLUMN received_by DROP NOT NULL;
ALTER TABLE public.installations           ALTER COLUMN installer_id DROP NOT NULL;
ALTER TABLE public.order_item_timeline     ALTER COLUMN event_by DROP NOT NULL;
ALTER TABLE public.shipments_to_site       ALTER COLUMN transporter_id DROP NOT NULL;

-- Tutti i puntatori a colonna singola verso profiles o auth.users ancora al
-- default e su colonna facoltativa: rifatti con ON DELETE SET NULL, tenendo
-- il resto della definizione (ON UPDATE, DEFERRABLE) com'era.
DO $$
DECLARE r RECORD; v_def text;
BEGIN
  FOR r IN
    SELECT c.oid, c.conname, t.relname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND n.nspname = 'public'
       AND c.confdeltype = 'a' AND array_length(c.conkey, 1) = 1
       AND NOT a.attnotnull
       AND (c.confrelid = 'auth.users'::regclass OR c.confrelid = 'public.profiles'::regclass)
     ORDER BY t.relname, c.conname
  LOOP
    v_def := regexp_replace(r.def, '(REFERENCES [^)]+\))( MATCH [A-Z]+)?', '\1\2 ON DELETE SET NULL');
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.relname, r.conname);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', r.relname, r.conname, v_def);
  END LOOP;
END $$;

-- ── Riferimenti di comodo: default, log, correlati, righe scollegabili ───────
ALTER TABLE public.task_automation_log DROP CONSTRAINT IF EXISTS task_automation_log_task_created_id_fkey;
ALTER TABLE public.task_automation_log ADD CONSTRAINT task_automation_log_task_created_id_fkey
  FOREIGN KEY (task_created_id) REFERENCES public.tasks(id) ON DELETE SET NULL;

ALTER TABLE public.article_families DROP CONSTRAINT IF EXISTS article_families_posa_tariffa_default_id_fkey;
ALTER TABLE public.article_families ADD CONSTRAINT article_families_posa_tariffa_default_id_fkey
  FOREIGN KEY (posa_tariffa_default_id) REFERENCES public.tariffe_aziendali(id) ON DELETE SET NULL;

ALTER TABLE public.documenti_fiscali DROP CONSTRAINT IF EXISTS documenti_fiscali_documento_correlato_id_fkey;
ALTER TABLE public.documenti_fiscali ADD CONSTRAINT documenti_fiscali_documento_correlato_id_fkey
  FOREIGN KEY (documento_correlato_id) REFERENCES public.documenti_fiscali(id) ON DELETE SET NULL;

ALTER TABLE public.documenti_fiscali DROP CONSTRAINT IF EXISTS documenti_fiscali_ddt_fattura_id_fkey;
ALTER TABLE public.documenti_fiscali ADD CONSTRAINT documenti_fiscali_ddt_fattura_id_fkey
  FOREIGN KEY (ddt_fattura_id) REFERENCES public.documenti_fiscali(id) ON DELETE SET NULL;

ALTER TABLE public.movimenti_cassa_native DROP CONSTRAINT IF EXISTS movimenti_cassa_native_documento_id_fkey;
ALTER TABLE public.movimenti_cassa_native ADD CONSTRAINT movimenti_cassa_native_documento_id_fkey
  FOREIGN KEY (documento_id) REFERENCES public.documenti_fiscali(id) ON DELETE SET NULL;

ALTER TABLE public.sdi_log DROP CONSTRAINT IF EXISTS sdi_log_documento_id_fkey;
ALTER TABLE public.sdi_log ADD CONSTRAINT sdi_log_documento_id_fkey
  FOREIGN KEY (documento_id) REFERENCES public.documenti_fiscali(id) ON DELETE SET NULL;

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_receipt_id_fkey;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_receipt_id_fkey
  FOREIGN KEY (receipt_id) REFERENCES public.goods_receipts(id) ON DELETE SET NULL;

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_stock_item_id_fkey;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_stock_item_id_fkey
  FOREIGN KEY (stock_item_id) REFERENCES public.warehouse_stock(id) ON DELETE SET NULL;

ALTER TABLE public.hr_timbrature DROP CONSTRAINT IF EXISTS hr_timbrature_sede_id_fkey;
ALTER TABLE public.hr_timbrature ADD CONSTRAINT hr_timbrature_sede_id_fkey
  FOREIGN KEY (sede_id) REFERENCES public.hr_sedi(id) ON DELETE SET NULL;

ALTER TABLE public.warehouse_movements DROP CONSTRAINT IF EXISTS warehouse_movements_order_item_id_fkey;
ALTER TABLE public.warehouse_movements ADD CONSTRAINT warehouse_movements_order_item_id_fkey
  FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;

ALTER TABLE public.referrers DROP CONSTRAINT IF EXISTS referrers_tier_id_fkey;
ALTER TABLE public.referrers ADD CONSTRAINT referrers_tier_id_fkey
  FOREIGN KEY (tier_id) REFERENCES public.referral_tiers(id) ON DELETE SET NULL;

ALTER TABLE public.shipments_to_site DROP CONSTRAINT IF EXISTS shipments_to_site_destination_warehouse_id_fkey;
ALTER TABLE public.shipments_to_site ADD CONSTRAINT shipments_to_site_destination_warehouse_id_fkey
  FOREIGN KEY (destination_warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;

ALTER TABLE public.warehouse_stock DROP CONSTRAINT IF EXISTS warehouse_stock_supplier_id_fkey;
ALTER TABLE public.warehouse_stock ADD CONSTRAINT warehouse_stock_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.goods_receipts DROP CONSTRAINT IF EXISTS goods_receipts_supplier_id_fkey;
ALTER TABLE public.goods_receipts ADD CONSTRAINT goods_receipts_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.warehouse_lot_batches DROP CONSTRAINT IF EXISTS warehouse_lot_batches_supplier_id_fkey;
ALTER TABLE public.warehouse_lot_batches ADD CONSTRAINT warehouse_lot_batches_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- Un prezzo personalizzato su una voce di listino che non esiste piu' non ha
-- nulla da personalizzare.
ALTER TABLE public.listino_override_cliente DROP CONSTRAINT IF EXISTS listino_override_cliente_listino_prezzo_id_fkey;
ALTER TABLE public.listino_override_cliente ADD CONSTRAINT listino_override_cliente_listino_prezzo_id_fkey
  FOREIGN KEY (listino_prezzo_id) REFERENCES public.listino_prezzi(id) ON DELETE CASCADE;
