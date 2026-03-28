-- 3. ai_credit_transactions
CREATE TABLE IF NOT EXISTS public.ai_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'consumo',
  crediti numeric NOT NULL DEFAULT 0,
  saldo_prima numeric NOT NULL DEFAULT 0,
  saldo_dopo numeric NOT NULL DEFAULT 0,
  descrizione text,
  agent_id uuid REFERENCES public.ai_agents_v2(id) ON DELETE SET NULL,
  conversation_id uuid,
  metadata jsonb DEFAULT '{}',
  creato_il timestamptz DEFAULT now()
);
