-- ============================================================================
-- v8.6.90 — Changelog "What's New" system
--
-- Permette al super_admin di pubblicare aggiornamenti prodotto, e mostra
-- automaticamente un badge in header con il count di entries non lette.
-- ============================================================================

-- ─── 1. Tabella changelog entries ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_changelog_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  body_md        TEXT NOT NULL,       -- Markdown body
  category       TEXT NOT NULL DEFAULT 'improvement'
    CHECK (category IN ('feature', 'improvement', 'fix', 'security', 'announcement')),
  emoji          TEXT,                -- Es. "✨", "🐛", "🚀"
  is_pinned      BOOLEAN NOT NULL DEFAULT false,
  is_published   BOOLEAN NOT NULL DEFAULT true,
  /** Audience: tutti / per ruolo / per piano. NULL = tutti. */
  target_audience TEXT[],             -- Es. ARRAY['company_admin','super_admin'] or NULL
  /** Link opzionale (es. video tutorial, docs). */
  cta_url        TEXT,
  cta_label      TEXT,
  published_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_changelog_published
  ON public.platform_changelog_entries (published_at DESC)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_changelog_pinned
  ON public.platform_changelog_entries (is_pinned DESC, published_at DESC)
  WHERE is_published = true;

ALTER TABLE public.platform_changelog_entries ENABLE ROW LEVEL SECURITY;

-- Read: tutti gli authenticated (filtrabili lato client per audience)
DROP POLICY IF EXISTS "changelog_read_authenticated" ON public.platform_changelog_entries;
CREATE POLICY "changelog_read_authenticated"
  ON public.platform_changelog_entries FOR SELECT
  TO authenticated
  USING (is_published = true);

-- Write: solo super_admin
DROP POLICY IF EXISTS "changelog_write_super_admin" ON public.platform_changelog_entries;
CREATE POLICY "changelog_write_super_admin"
  ON public.platform_changelog_entries FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ─── 2. Tracking last_seen per utente ───────────────────────────────────────
-- Aggiungiamo una colonna su profiles invece di una tabella dedicata (più leggero).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS changelog_last_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.changelog_last_seen_at IS
  'Timestamp dell ultima volta che l utente ha aperto il drawer Changelog. '
  'Usato per calcolare il badge "X nuove" in header.';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_changelog_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_changelog_updated_at ON public.platform_changelog_entries;
CREATE TRIGGER trg_changelog_updated_at
  BEFORE UPDATE ON public.platform_changelog_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_changelog_updated_at();

-- ─── 3. Seed iniziale con 3 entries di benvenuto ────────────────────────────
INSERT INTO public.platform_changelog_entries (title, body_md, category, emoji, is_pinned, cta_url, cta_label)
VALUES
  (
    'Demo Mode: prova tutte le funzioni',
    'Ora puoi esplorare TUTTE le funzioni di EiC anche se non sono incluse nel tuo piano. Le voci non sbloccate appaiono con badge **DEMO**: clicchi → vedi cosa fa → chiedi al tuo consulente lo sblocco con 1 click.',
    'feature',
    '✨',
    true,
    '/azienda/impostazioni/abbonamento',
    'Vedi piani'
  ),
  (
    'Limite cantieri attivi visibile in tempo reale',
    'Sulla pagina **Commesse** vedi sempre quanti slot hai disponibili nel tuo piano. Esempio: `2/3 cantieri · Piano Render + Preventivatore`. Niente più sorprese.',
    'improvement',
    '📊',
    false,
    '/azienda/ordini',
    'Apri commesse'
  ),
  (
    'Onboarding in 5 minuti',
    'Nuovo wizard di setup nella dashboard: 6 step concreti per essere operativi. Si completano automaticamente quando fai le azioni (es. crei un cliente → check verde). Si nasconde a 100%.',
    'feature',
    '🚀',
    false,
    '/azienda',
    'Vai al cruscotto'
  )
ON CONFLICT DO NOTHING;
