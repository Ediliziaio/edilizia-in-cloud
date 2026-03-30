-- =============================================
-- UNIF-AGE-04: KB Categories, Chat, WhatsApp extensions
-- =============================================

-- 1. ai_kb_categories
CREATE TABLE IF NOT EXISTS public.ai_kb_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descrizione text,
  colore text DEFAULT '#6366f1',
  creato_il timestamptz NOT NULL DEFAULT now()
);
