-- ============================================================
-- PARTNER MATERIALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.partner_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  min_tier TEXT DEFAULT 'bronze',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
