-- ============================================================================
-- Costi aziendali · vincoli qualità dato economico
-- ============================================================================
-- Blocca nuove scritture incoerenti su importi, IVA, tipo costo, ricorrenza e
-- stato pagamento. NOT VALID protegge lo storico già presente: i vecchi dati
-- non vengono alterati, ma insert/update futuri devono rispettare i vincoli.
-- ============================================================================

ALTER TABLE public.company_costs
  DROP CONSTRAINT IF EXISTS company_costs_amount_non_negative;

ALTER TABLE public.company_costs
  ADD CONSTRAINT company_costs_amount_non_negative
  CHECK (COALESCE(amount, 0) >= 0) NOT VALID;

ALTER TABLE public.company_costs
  DROP CONSTRAINT IF EXISTS company_costs_vat_rate_range;

ALTER TABLE public.company_costs
  ADD CONSTRAINT company_costs_vat_rate_range
  CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100)) NOT VALID;

ALTER TABLE public.company_costs
  DROP CONSTRAINT IF EXISTS company_costs_cost_type_allowed;

ALTER TABLE public.company_costs
  ADD CONSTRAINT company_costs_cost_type_allowed
  CHECK (cost_type IN ('fixed', 'variable')) NOT VALID;

ALTER TABLE public.company_costs
  DROP CONSTRAINT IF EXISTS company_costs_recurrence_allowed;

ALTER TABLE public.company_costs
  ADD CONSTRAINT company_costs_recurrence_allowed
  CHECK (recurrence IN ('once', 'monthly', 'quarterly', 'yearly')) NOT VALID;

ALTER TABLE public.company_costs
  DROP CONSTRAINT IF EXISTS company_costs_paid_date_coherent;

ALTER TABLE public.company_costs
  ADD CONSTRAINT company_costs_paid_date_coherent
  CHECK (is_paid OR paid_date IS NULL) NOT VALID;

COMMENT ON CONSTRAINT company_costs_amount_non_negative
  ON public.company_costs IS
  'Blocca nuovi costi con importo negativo senza modificare lo storico.';

COMMENT ON CONSTRAINT company_costs_vat_rate_range
  ON public.company_costs IS
  'Mantiene IVA costi tra 0% e 100% sulle nuove scritture.';

COMMENT ON CONSTRAINT company_costs_paid_date_coherent
  ON public.company_costs IS
  'Evita date pagamento su costi marcati come non pagati.';

NOTIFY pgrst, 'reload schema';
