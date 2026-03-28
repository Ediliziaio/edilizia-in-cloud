-- 2. hr_festivita
CREATE TABLE public.hr_festivita (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  data date NOT NULL,
  descrizione text NOT NULL,
  ricorrente boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
