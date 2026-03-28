-- Fix: whatsapp_credits_log RLS (INSERT uses WITH CHECK only, no USING)
CREATE TABLE IF NOT EXISTS public.whatsapp_credits_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'deduction',
  amount_eur numeric NOT NULL,
  balance_before numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL DEFAULT 0,
  description text DEFAULT NULL,
  broadcast_id uuid DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
