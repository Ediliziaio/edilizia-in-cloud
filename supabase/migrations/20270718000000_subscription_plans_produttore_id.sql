-- Piani AD HOC per produttore: se produttore_id è valorizzato, il piano è visibile
-- solo nel selettore rivenditori di quel produttore (NULL = piano globale standard).
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS produttore_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_subscription_plans_produttore
  ON public.subscription_plans(produttore_id) WHERE produttore_id IS NOT NULL;

COMMENT ON COLUMN public.subscription_plans.produttore_id IS
  'Se valorizzato, piano ad hoc visibile solo ai rivenditori di quel produttore (NULL = globale).';
