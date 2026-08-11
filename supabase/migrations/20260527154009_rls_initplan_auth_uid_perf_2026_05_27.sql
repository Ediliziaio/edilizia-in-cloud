-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- =============================================================
-- PERF FIX 2026-05-27: wrap auth.uid() in (SELECT auth.uid())
-- =============================================================
-- Pattern Supabase ufficiale: auth.uid() chiamato direttamente in una
-- policy USING/WITH CHECK viene RIVALUTATO per ogni riga durante una
-- query. Wrappato in (SELECT auth.uid()) il planner crea un InitPlan
-- che lo valuta UNA VOLTA. Differenza misurata: order_installments
-- passa da 500-990ms mean (max 2.9s) a ~9ms su query identica.
--
-- Doc: https://supabase.com/docs/guides/database/postgres/row-level-security
-- =============================================================

-- ── order_installments: 3 policy
DROP POLICY IF EXISTS "Users can manage installments for their company orders" ON public.order_installments;
CREATE POLICY "Users can manage installments for their company orders"
ON public.order_installments
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders o
    JOIN profiles p ON p.company_id = o.company_id
    WHERE o.id = order_installments.order_id
      AND p.id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders o
    JOIN profiles p ON p.company_id = o.company_id
    WHERE o.id = order_installments.order_id
      AND p.id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "customer_view_own_installments" ON public.order_installments;
CREATE POLICY "customer_view_own_installments"
ON public.order_installments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_installments.order_id
      AND o.customer_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Super admins can manage all installments" ON public.order_installments;
CREATE POLICY "Super admins can manage all installments"
ON public.order_installments
FOR ALL TO authenticated
USING (has_role((SELECT auth.uid()), 'super_admin'::app_role))
WITH CHECK (has_role((SELECT auth.uid()), 'super_admin'::app_role));

-- ── Indici FK utili (non-CONCURRENTLY perché siamo in migration transazione)
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON public.orders(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON public.orders(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_referred_by ON public.companies(referred_by) WHERE referred_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_sr_default_consulente_id ON public.companies(sr_default_consulente_id) WHERE sr_default_consulente_id IS NOT NULL;
