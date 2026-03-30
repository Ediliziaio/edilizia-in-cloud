ALTER TABLE public.company_costs
  ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (
    payment_method IN ('bonifico', 'contanti', 'carta', 'rid', 'assegno', 'altro')
  );
