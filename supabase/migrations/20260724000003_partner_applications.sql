-- ============================================================
-- Sprint 3: Tabella partner_applications per self-registration
-- ============================================================

CREATE TABLE IF NOT EXISTS public.partner_applications (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT         NOT NULL,
  email            TEXT         NOT NULL,
  phone            TEXT,
  partner_type     TEXT         DEFAULT 'referrer',
  network_size     INTEGER,
  notes            TEXT,
  status           TEXT         DEFAULT 'pending', -- pending | approved | rejected
  reviewed_by      UUID         REFERENCES auth.users(id),
  reviewed_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE public.partner_applications ENABLE ROW LEVEL SECURITY;

-- Solo super admin può vedere tutte le candidature
DROP POLICY IF EXISTS "super_admin_applications" ON public.partner_applications;
CREATE POLICY "super_admin_applications" ON public.partner_applications FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Chiunque può inserire la propria candidatura (INSERT senza auth)
DROP POLICY IF EXISTS "public_apply" ON public.partner_applications;
CREATE POLICY "public_apply" ON public.partner_applications FOR INSERT
  WITH CHECK (true);
