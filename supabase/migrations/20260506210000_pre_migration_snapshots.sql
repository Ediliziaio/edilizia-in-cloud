-- IMPROVEMENT #16 — Pre-migration snapshots
-- ════════════════════════════════════════════════════════════════════════════
-- Tabella + helper per registrare snapshot rapidi (count + sample) di tabelle
-- critiche prima di una migration con ALTER. Recovery rapido se qualcosa
-- sballa nel deploy.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public._audit_pre_migration_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_label text NOT NULL,
  table_name text NOT NULL,
  row_count bigint,
  sample_rows jsonb,
  taken_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_snap_migration ON public._audit_pre_migration_snapshots(migration_label, taken_at DESC);

-- Solo super_admin può leggere snapshot (PII potentially)
ALTER TABLE public._audit_pre_migration_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_snap_super ON public._audit_pre_migration_snapshots;
CREATE POLICY audit_snap_super ON public._audit_pre_migration_snapshots
  FOR ALL USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Helper: snapshot di una tabella prima di una migration
CREATE OR REPLACE FUNCTION public.take_pre_migration_snapshot(
  p_migration_label text,
  p_table text,
  p_sample_size int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count bigint;
  v_sample jsonb;
BEGIN
  EXECUTE format('SELECT count(*) FROM public.%I', p_table) INTO v_count;
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (SELECT * FROM public.%I LIMIT %L) AS t',
    p_table, p_sample_size
  ) INTO v_sample;

  INSERT INTO public._audit_pre_migration_snapshots(migration_label, table_name, row_count, sample_rows)
  VALUES (p_migration_label, p_table, v_count, v_sample);

  RETURN jsonb_build_object('ok', true, 'table', p_table, 'count', v_count);
END $$;

GRANT EXECUTE ON FUNCTION public.take_pre_migration_snapshot(text, text, int) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Pre-migration snapshot infrastructure pronta'; END $$;
