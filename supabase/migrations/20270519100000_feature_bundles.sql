-- ============================================================================
-- v8.6.55 — Feature Bundles: pacchetti riutilizzabili di feature
--
-- Permette al super_admin di salvare "configurazioni custom" di feature_keys
-- come pacchetti riutilizzabili (es. "Solo Render", "Render + Preventivatore",
-- "Pacchetto Marketing AI") da applicare velocemente a nuove company.
--
-- Pattern:
-- 1. Super admin crea bundle in /admin/feature-bundles
-- 2. Su /admin/companies/:id/pacchetto-custom seleziona bundle preset →
--    upsert batch su company_feature_overrides
-- 3. Bundle hanno prezzo totale memorizzato per offerta commerciale
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feature_bundles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nome interno commerciale (es. "Solo Render AI", "Bundle Serramentista")
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 100),
  description   TEXT,
  -- Array di feature_keys da abilitare quando applicato.
  -- Le altre feature restano gestite dal piano/default (non vengono toccate).
  feature_keys  TEXT[] NOT NULL DEFAULT '{}',
  -- Prezzo totale mensile del bundle (commerciale, indicativo).
  -- Può differire dalla somma dei price_per_month delle singole feature.
  price_monthly NUMERIC(10, 2),
  price_yearly  NUMERIC(10, 2),
  -- Categoria per organizzare i bundle nella UI (es. "verticale", "addon", "starter-kit")
  category      TEXT,
  -- Icona Lucide opzionale (es. "Image", "Sparkles", "Layers")
  icon          TEXT,
  -- Posizione di rendering nei picker (asc)
  position      INTEGER NOT NULL DEFAULT 0,
  -- Soft delete + meta audit
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  is_template   BOOLEAN NOT NULL DEFAULT TRUE, -- true = preset super_admin, false = bundle custom per-company
  -- Se is_template = false, è collegato ad una specifica company che lo ha generato
  company_id    UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_bundles_active
  ON public.feature_bundles(is_active, position)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_feature_bundles_template
  ON public.feature_bundles(is_template, position)
  WHERE is_template = TRUE AND is_active = TRUE;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.feature_bundles_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_feature_bundles_updated_at ON public.feature_bundles;
CREATE TRIGGER trg_feature_bundles_updated_at
  BEFORE UPDATE ON public.feature_bundles
  FOR EACH ROW EXECUTE FUNCTION public.feature_bundles_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.feature_bundles ENABLE ROW LEVEL SECURITY;

-- Solo super_admin può leggere/scrivere
DROP POLICY IF EXISTS feature_bundles_super_admin_all ON public.feature_bundles;
CREATE POLICY feature_bundles_super_admin_all
  ON public.feature_bundles FOR ALL
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

-- ── Seed: 3 preset di partenza ────────────────────────────────────────────
INSERT INTO public.feature_bundles (name, description, feature_keys, price_monthly, category, icon, position, is_template)
VALUES
  (
    'Solo Render AI',
    'Pacchetto minimo: accesso esclusivo al modulo Render AI per fotorealistiche di infissi, bagni, facciate, tetti. Ideale per professionisti che vogliono solo il rendering AI.',
    ARRAY['render_ai'],
    49.00,
    'addon-only',
    'Image',
    1,
    TRUE
  ),
  (
    'Render AI + Preventivatore Serramenti',
    'Pacchetto combinato per serramentisti: render fotorealistici + preventivatore vendita con BOM, ecobonus, ROI.',
    ARRAY['render_ai', 'modulo_serramenti_attivo'],
    119.00,
    'serramentista',
    'Layers',
    2,
    TRUE
  ),
  (
    'Pacchetto Marketing AI',
    'Set marketing completo: CRM, automazioni, email/SMS/WhatsApp marketing, agenti AI per qualifica lead.',
    ARRAY['email_marketing', 'sms_marketing', 'whatsapp', 'ai_agents', 'render_ai'],
    179.00,
    'marketing',
    'Sparkles',
    3,
    TRUE
  )
ON CONFLICT DO NOTHING;
