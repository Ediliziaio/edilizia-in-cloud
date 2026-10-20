-- ════════════════════════════════════════════════════════════════════════════
-- I clienti delle fatture importate escono dai Contatti del CRM
-- ════════════════════════════════════════════════════════════════════════════
-- L'importazione delle fatture emesse (Fatture in Cloud, Aruba) creava un
-- contatto CRM per ogni cliente fatturato che non trovava, con provenienza
-- «fatturazione». Sono clienti della fatturazione, non contatti commerciali:
-- dal 20/10/2026 billing-import aggancia solo un contatto che esiste già.
--
-- Qui escono dal CRM quelli già creati: vanno nel cestino (deleted_at), con
-- un orario fisso che li riconosce, così si possono rimettere con una query.
-- Restano dove hanno una storia commerciale vera: un contatto con opportunità,
-- note, liste, messaggi, attività, preventivi o qualunque altra riga collegata
-- che non sia la fattura stessa, l'anagrafica del cliente, la scadenza o il
-- registro automatico delle attività.
--
-- Le fatture tengono il loro collegamento (invoices.client_id resta, la
-- chiave esterna non si tocca) e i dati del cliente scritti sulla fattura.
-- Nessuna automazione «contatto modificato» è attiva nelle aziende coinvolte.
--
-- Per rimetterli:
--   update public.marketing_contacts set deleted_at = null
--    where source = 'fatturazione' and deleted_at = '2026-10-20 10:00:00+00';
-- Idempotente: una seconda esecuzione non trova più niente da spostare.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  r record;
  spostati int;
BEGIN
  CREATE TEMP TABLE _da_togliere ON COMMIT DROP AS
    SELECT id FROM public.marketing_contacts
     WHERE source = 'fatturazione' AND deleted_at IS NULL;

  -- Ogni tabella che punta ai contatti, tranne quelle che nascono dalla
  -- fatturazione o in automatico: chi vi compare ha una storia nel CRM.
  FOR r IN
    SELECT c.relname AS tab, a.attname AS col
      FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
     WHERE k.contype = 'f'
       AND k.confrelid = 'public.marketing_contacts'::regclass
       AND c.relname NOT IN ('invoices', 'profiles', 'scadenze', 'marketing_contact_activities')
  LOOP
    EXECUTE format(
      'DELETE FROM _da_togliere d WHERE EXISTS (SELECT 1 FROM public.%I x WHERE x.%I = d.id)',
      r.tab, r.col);
  END LOOP;

  UPDATE public.marketing_contacts m
     SET deleted_at = '2026-10-20 10:00:00+00'
    FROM _da_togliere d
   WHERE m.id = d.id;
  GET DIAGNOSTICS spostati = ROW_COUNT;
  RAISE NOTICE 'Contatti da fatturazione tolti dal CRM: %', spostati;
END $$;
