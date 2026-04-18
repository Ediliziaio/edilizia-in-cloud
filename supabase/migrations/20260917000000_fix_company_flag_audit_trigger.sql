-- ============================================================================
-- SURGICAL FIX — Rimuove riferimento a `billing_status` dal trigger di audit
-- flag azienda.
-- ============================================================================
-- Contesto: la migration 20260910000001_superadmin_gap_features.sql creava la
-- funzione `public.log_company_flag_changes()` con un check su
-- `OLD.billing_status IS DISTINCT FROM NEW.billing_status`. La colonna
-- `billing_status` non è però presente su `public.companies` nell'ambiente
-- production — probabilmente droppata manualmente via Studio o mai creata —
-- e quindi qualsiasi UPDATE sulla tabella fallisce con:
--   ERROR: record "old" has no field "billing_status" (SQLSTATE 42703)
--
-- Questo blocca tutte le migration successive che fanno UPDATE su companies
-- (inclusa la backfill di `vertical='generico'` in serramenti_01).
--
-- Fix: CREATE OR REPLACE della funzione senza la branch su billing_status.
-- Manteniamo il check su subscription_plan_id e status (colonne che esistono).
-- Se in futuro billing_status verrà aggiunta, si ri-includerà il check in una
-- nuova migration.
--
-- Idempotente (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_company_flag_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_user UUID;
BEGIN
  v_user := auth.uid();

  IF OLD.subscription_plan_id IS DISTINCT FROM NEW.subscription_plan_id THEN
    INSERT INTO public.company_flag_audit_log (company_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, COALESCE(v_user, '00000000-0000-0000-0000-000000000000'::uuid),
            'subscription_plan_id', to_jsonb(OLD.subscription_plan_id), to_jsonb(NEW.subscription_plan_id));
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.company_flag_audit_log (company_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, COALESCE(v_user, '00000000-0000-0000-0000-000000000000'::uuid),
            'status', to_jsonb(OLD.status::text), to_jsonb(NEW.status::text));
  END IF;

  -- NOTA: branch su billing_status rimossa perché la colonna non esiste
  -- su `public.companies` nel DB production. Se verrà aggiunta, la branch
  -- va re-inclusa in una nuova migration con un CREATE OR REPLACE.

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.log_company_flag_changes() IS
  'Trigger audit modifiche flag azienda. Tracce: subscription_plan_id, status. La branch billing_status è stata rimossa perché la colonna non esiste in production (vedi migration 20260917000000).';
