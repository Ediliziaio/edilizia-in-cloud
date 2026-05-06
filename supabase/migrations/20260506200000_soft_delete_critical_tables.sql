-- IMPROVEMENT #14 — Soft delete su tabelle critiche
-- ════════════════════════════════════════════════════════════════════════════
-- Aggiunge deleted_at su tabelle storiche per:
--   - prevenire perdita dati da DELETE accidentali (cascade, RLS bug)
--   - permettere undo su delete UI
--   - audit storico integro
--
-- RLS: NON modifichiamo le policy esistenti — soft-delete è additive.
-- Le UI dovranno filtrare WHERE deleted_at IS NULL nelle query SELECT.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

ALTER TABLE public.marketing_opportunities
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- Indici parziali per query "active" (più frequenti)
CREATE INDEX IF NOT EXISTS idx_orders_active ON public.orders(company_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_active ON public.quotes(company_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_active ON public.marketing_contacts(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_opportunities_active ON public.marketing_opportunities(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_active ON public.invoices(company_id, created_at DESC) WHERE deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: soft_delete_record / restore_record (universal)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.soft_delete_record(
  p_table text,
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_allowed text[] := ARRAY['orders','quotes','marketing_contacts','marketing_opportunities','invoices'];
  v_count int;
BEGIN
  IF NOT (p_table = ANY(v_allowed)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'table_not_soft_deletable');
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = now(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL',
    p_table
  ) USING auth.uid(), p_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', v_count > 0, 'rows_affected', v_count);
END $$;

GRANT EXECUTE ON FUNCTION public.soft_delete_record(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_record(
  p_table text,
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_allowed text[] := ARRAY['orders','quotes','marketing_contacts','marketing_opportunities','invoices'];
  v_count int;
BEGIN
  IF NOT (p_table = ANY(v_allowed)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'table_not_soft_deletable');
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL WHERE id = $1 AND deleted_at IS NOT NULL',
    p_table
  ) USING p_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', v_count > 0, 'rows_affected', v_count);
END $$;

GRANT EXECUTE ON FUNCTION public.restore_record(text, uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Soft delete columns + RPC pronti su 5 tabelle critiche'; END $$;
