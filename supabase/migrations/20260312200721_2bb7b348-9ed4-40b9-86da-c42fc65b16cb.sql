-- =============================================
-- HR MODULE: 6 tables + RLS + function + trigger
-- =============================================

-- 1. hr_sedi
CREATE TABLE IF NOT EXISTS public.hr_sedi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  indirizzo text,
  citta text,
  provincia text,
  cap text,
  lat double precision,
  lng double precision,
  raggio_mt int DEFAULT 200,
  attiva boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
