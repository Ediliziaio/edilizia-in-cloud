
-- company_notes table for CRM notes
CREATE TABLE public.company_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS: only super_admin can access
ALTER TABLE public.company_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage company notes"
  ON public.company_notes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Index for fast lookups
CREATE INDEX idx_company_notes_company_id ON public.company_notes(company_id);
CREATE INDEX idx_company_notes_created_at ON public.company_notes(created_at DESC);
